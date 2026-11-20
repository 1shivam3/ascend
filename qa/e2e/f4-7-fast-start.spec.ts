import { test, expect } from '@playwright/test';
import { installSeed } from '../fixtures/personas';
import { installAiMocks } from '../fixtures/ai-mocks';
import { expectBooted, mainNav } from '../fixtures/persona-run';

/**
 * F4-7 fast start (owner's design call, persona follow-ups):
 *  - A RETURNING user (any logged workout) tapping Suggested Workout
 *    starts the session directly with the editor's default
 *    generation — no plan-editor modal in between.
 *  - The editor stays reachable via Customize.
 *  - A FIRST-TIME user (no logged workouts) still gets the
 *    review-first editor modal.
 */

test('F4-7: returning user starts directly, editor via Customize', async ({ page }) => {
  await installAiMocks(page);
  await installSeed(page, 'intermediate'); // 18 logged workouts, no plans
  await page.goto('/');
  await expectBooted(page);
  await page.getByRole('button', { name: /^train$/i }).click();

  // Customize exists for returning users and opens the editor.
  const customize = page.getByRole('button', { name: /^customize$/i });
  await expect(customize).toBeVisible();
  await customize.click();
  await expect(page.getByRole('button', { name: /^start workout$/i }).last()).toBeVisible({ timeout: 15_000 });
  // Close the editor without starting.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^suggested workout$/i }).first().click();

  // Direct start: the session's Complete Set appears with no
  // editor Start tap in between, using the default generation
  // (Chest + Arms at the goal-derived intensity).
  await expect(page.getByRole('button', { name: /complete set/i })).toBeVisible({ timeout: 20_000 });
  const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
  expect(bodyText).toContain('Chest + Arms');
});

test('F4-7: first-time user still gets the editor', async ({ page }) => {
  await installAiMocks(page);
  await installSeed(page, 'minor-15'); // profile, zero logged workouts
  await page.goto('/');
  await expectBooted(page);
  await mainNav(page).getByRole('button', { name: /^train$/i }).click();
  // No Customize shortcut for a first-timer.
  await expect(page.getByRole('button', { name: /^customize$/i })).toHaveCount(0);
  await page.getByRole('button', { name: /^suggested workout$/i }).first().click();
  // The plan editor opens (its own Start Workout button).
  await expect(page.getByRole('button', { name: /^start workout$/i }).last()).toBeVisible({ timeout: 15_000 });
});
