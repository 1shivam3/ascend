import { test, expect } from '@playwright/test';
import { installSeed } from '../fixtures/personas';
import { installAiMocks } from '../fixtures/ai-mocks';
import { shot } from '../fixtures/helpers';

/**
 * Phase 0 smoke spec: proves the harness end to end.
 * Fresh (empty-guest) profile -> splash -> guest onboarding -> Today.
 * AI mocks are installed so the run can never reach a real AI endpoint.
 * The flow runs in every project (proving each viewport + touch
 * emulation); the canonical screenshot is taken in android-360x740.
 */
test('empty guest onboards and lands on Today', async ({ page }, testInfo) => {
  await installAiMocks(page);
  await installSeed(page, 'empty-guest'); // no-op by design: truly fresh

  await page.goto('/');

  // Splash
  await page.getByText('TAP TO CONTINUE').click();

  // Welcome / auth chooser
  await page.getByRole('button', { name: /continue as guest/i }).click();

  // Goals step
  await page.getByRole('button', { name: /skip for now/i }).click();

  // Details step
  await page.locator('#details-name').fill('QA Guest');
  await page.getByRole('button', { name: /^male$/i }).click();
  await page.locator('#details-dob-day').selectOption('15');
  await page.locator('#details-dob-month').selectOption('6');
  await page.locator('#details-dob-year').selectOption('2000');
  await page.getByRole('button', { name: /i'll add this later/i }).click();
  await page.getByRole('button', { name: /^continue$/i }).click();

  // Plan offer
  await page.getByRole('button', { name: /no thanks/i }).click();

  // Setup summary
  await page.getByRole('button', { name: /start training/i }).click();

  // Today is up: quick actions + tab bar are the stable landmarks.
  await expect(page.getByText('Quick actions')).toBeVisible();
  await expect(page.getByRole('button', { name: /^train$/i }).first()).toBeVisible();

  if (testInfo.project.name === 'android-360x740') {
    // Let the welcome toasts clear so the canonical shot shows Today itself.
    await page.waitForTimeout(4_000);
    await shot(page, 'empty-guest', 'today');
  }
});
