import { test, expect } from '@playwright/test';
import { installSeed } from '../fixtures/personas';

/**
 * N1/N3 (bug program Phase 2) — the WA0004 gym-video flow, replayed:
 * a profile with NO date of birth (the missing-age fixture: 72 kg,
 * 178 cm, real stats) types 3,000 kcal into the Daily Macro Targets
 * editor and saves.
 *
 * Before Phase 2: the toast quoted the typed 3,000 while the store
 * silently clamped to maintenance (~2,356), and reopening the editor
 * showed a blank calorie field.
 *
 * After Phase 2: the save reports the STORED (maintenance) numbers,
 * the ask-once auto-recalculate prompt appears, and reopening the
 * editor shows the stored values.
 */

test.describe('N1: goal save read-back with missing age', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'android-360x740', 'N1 drive runs at 360x740');
    await installSeed(page, 'missing-age');
    await page.goto('/');
  });

  test('saving 3000 kcal without a DOB stores maintenance and SAYS so', async ({ page }) => {
    await page.getByRole('button', { name: /^fuel$/i }).first().click();
    await page.getByRole('button', { name: /set target|edit target/i }).first().click();

    const calInput = page.locator('#meal-goal-calories');
    await expect(calInput).toBeVisible({ timeout: 10_000 });
    await calInput.fill('3000');
    await page.locator('#meal-goal-protein').fill('130');
    await page.getByRole('button', { name: /save targets/i }).click();

    // The adjusted-save notice quotes the stored maintenance numbers.
    await expect(page.getByText(/Saved at maintenance instead/i)).toBeVisible({ timeout: 10_000 });

    // The store holds maintenance, not 3000 — and it is stamped manual.
    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem('ascend_store');
      const goals = JSON.parse(raw ?? '{}')?.state?.macroGoals;
      return goals ? { calories: goals.calories, source: goals.source } : null;
    });
    expect(stored).not.toBeNull();
    expect(stored!.calories).toBeLessThan(3000);
    expect(stored!.calories).toBeGreaterThan(2000);
    expect(stored!.source).toBe('manual');

    // Ask-once auto-recalculate prompt: keep it on, modal closes.
    await page.getByRole('button', { name: /keep on/i }).click();
    await expect(calInput).toBeHidden({ timeout: 10_000 });

    // Reopen: the editor shows the STORED value — not blank, not 3000.
    await page.getByRole('button', { name: /set target|edit target/i }).first().click();
    await expect(calInput).toBeVisible({ timeout: 10_000 });
    await expect(calInput).toHaveValue(String(stored!.calories));
  });
});
