import { test, expect } from '@playwright/test';
import { installSeed } from '../fixtures/personas';
import { installAiMocks } from '../fixtures/ai-mocks';
import { expectBooted, mainNav } from '../fixtures/persona-run';

/**
 * Persona-followup fixes (post-Phase-7 batch):
 *  P7-1 — Today's rest-day sheet must give a plan-less user a way to
 *         start training (it offered only "Set today as Rest Day").
 *  F4-5 — the details step's validation banner renders at the top of
 *         the screen, off-screen from the Continue button; a failed
 *         Continue must bring the feedback into the viewport.
 *  F4-6 — the DOB picker's year range silently stops 13 years back;
 *         the 13+ rule must be stated next to the field.
 */

test('P7-1: rest-day sheet offers a suggested-workout start', async ({ page }) => {
  await installAiMocks(page);
  await installSeed(page, 'intermediate'); // history but NO plans
  await page.goto('/');
  await expectBooted(page);
  await page.getByRole('button', { name: /^train anyway$/i }).first().click();
  await expect(page.getByText(/no workout plans available/i)).toBeVisible();
  const startSuggested = page.getByRole('button', { name: /start a suggested workout/i });
  await expect(startSuggested).toBeVisible();
  await startSuggested.click();
  // Lands on Train, whose Suggested Workout entry is right there.
  await expect(page.getByRole('button', { name: /^suggested workout$/i }).first()).toBeVisible({ timeout: 15_000 });
});

test('F4-5 + F4-6: details step explains itself', async ({ page }) => {
  await installAiMocks(page);
  await installSeed(page, 'empty-guest');
  await page.goto('/');
  // Welcome → goals → details (the Arjun drive's exact path; a fresh
  // guest boots into onboarding, so expectBooted's nav assert does
  // not apply here).
  await page.getByText('TAP TO CONTINUE').click();
  await page.getByRole('button', { name: /continue as guest/i }).click();
  await page.getByRole('button', { name: /skip for now/i }).click();
  await expect(page.locator('#details-name')).toBeVisible({ timeout: 15_000 });

  // F4-6: the 13+ rule is stated next to the DOB picker.
  await expect(page.getByText(/13 or older/i)).toBeVisible();

  // F4-5: fill everything EXCEPT body stats, tap Continue — the
  // feedback banner must be inside the viewport, not above it.
  await page.locator('#details-name').fill('Arjun');
  await page.getByRole('button', { name: /^male$/i }).click();
  await page.locator('#details-dob-day').selectOption('15');
  await page.locator('#details-dob-month').selectOption('6');
  await page.locator('#details-dob-year').selectOption('2000');
  await page.getByRole('button', { name: /^continue$/i }).click();
  const banner = page.getByText(/add your weight and height/i);
  await expect(banner).toBeVisible();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  // Poll: the scroll-into-view lands a frame after the banner renders.
  await expect
    .poll(async () => {
      const box = await banner.boundingBox();
      if (!box) return false;
      return box.y >= 0 && box.y + box.height <= viewport!.height;
    }, { timeout: 5_000 })
    .toBe(true);
});
