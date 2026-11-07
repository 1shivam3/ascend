import { test, expect, type Page } from '@playwright/test';
import { installAiMocks } from '../fixtures/ai-mocks';
import { shot } from '../fixtures/helpers';

/**
 * QA-hardening R16 evidence drive: auth screens.
 * Fresh profile → Welcome → Create Account / Login. Asserts:
 *  - both screens show the ASCEND logo mark;
 *  - both forms are noValidate (no native bubbles possible);
 *  - submitting an empty form shows ALL field errors inline as
 *    role="alert" under their fields (not one top banner, not a
 *    browser bubble);
 *  - blur validates a single field, and fixing the values clears
 *    the alerts.
 * Screenshots at 360x740, light + dark, for both screens.
 * Theme note: a stored theme is honored only as a CUSTOM choice
 * (ascend_theme + ascend_has_custom_theme, per theme-init.js and
 * store.setTheme); helpers.setTheme patches only the blob, so the
 * app followed the OS preference (light) and 'dark' shots came out
 * light until this was root-caused. The dark pass mirrors the
 * app's own setTheme writes via an init script and ASSERTS
 * data-theme="dark" before shooting; the reload lands on the
 * splash screen, so the dark pass re-drives from there.
 * No account is created: validation blocks every submit here, so
 * no real auth endpoint is ever called.
 */

async function applyThemeDark(page: Page) {
  await page.addInitScript(() => {
    try {
      // Mirror the app's own setTheme writes (store.ts): a theme is
      // only honored when it is a CUSTOM choice — theme-init.js
      // checks these standalone keys first; without them the app
      // follows the OS preference (light in this harness). The blob
      // is kept consistent for the store's rehydration.
      window.localStorage.setItem('ascend_theme', 'dark');
      window.localStorage.setItem('ascend_has_custom_theme', 'true');
      const raw = window.localStorage.getItem('ascend_store');
      if (raw) {
        const blob = JSON.parse(raw);
        blob.state.theme = 'dark';
        blob.state.hasCustomTheme = true;
        window.localStorage.setItem('ascend_store', JSON.stringify(blob));
      }
    } catch {}
  });
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
}

async function fromSplashToCreate(page: Page) {
  await page.getByText('TAP TO CONTINUE').click();
  await page.getByRole('button', { name: /get started/i }).click();
  await expect(page.getByRole('img', { name: 'ASCEND' })).toBeVisible();
}

async function fromSplashToLogin(page: Page) {
  await page.getByText('TAP TO CONTINUE').click();
  await page.getByRole('button', { name: /i already have an account/i }).click();
  await expect(page.getByRole('img', { name: 'ASCEND' })).toBeVisible();
}

test('auth screens: logo on both, inline validation, no native bubbles', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-360x740', 'R16 drive runs at 360x740');
  await installAiMocks(page);
  await page.goto('/');

  // ── Create Account, light: empty submit + blur behaviour ──────
  await fromSplashToCreate(page);
  const createNoValidate = await page.evaluate(
    () => document.querySelector('form')?.noValidate ?? false,
  );
  expect(createNoValidate).toBe(true);

  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator('form').getByRole('alert')).toHaveCount(3);
  await expect(page.getByText('Please enter your full name.')).toBeVisible();
  await expect(page.getByText('Please enter a valid email address.')).toBeVisible();
  await expect(page.getByText('Password must be at least 8 characters long.')).toBeVisible();
  await shot(page, 'r16-auth', 'create-light');

  // Blur validation: a bad email flags on blur alone.
  await page.locator('#create-full-name').fill('QA User');
  await page.locator('#create-email').fill('not-an-email');
  await page.locator('#create-password').click(); // blurs email
  await expect(page.getByText('Please enter a valid email address.')).toBeVisible();
  // Fixing the values clears the alerts.
  await page.locator('#create-email').fill('qa@example.com');
  await page.locator('#create-password').fill('password1');
  await page.locator('#create-full-name').click(); // blurs password
  await expect(page.locator('form').getByRole('alert')).toHaveCount(0);

  // ── Login, light: empty submit ────────────────────────────────
  await page.getByRole('button', { name: 'Go back' }).click();
  await page.getByRole('button', { name: /i already have an account/i }).click();
  await expect(page.getByRole('img', { name: 'ASCEND' })).toBeVisible();
  const loginNoValidate = await page.evaluate(
    () => document.querySelector('form')?.noValidate ?? false,
  );
  expect(loginNoValidate).toBe(true);

  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('form').getByRole('alert')).toHaveCount(2);
  await expect(page.getByText('Please enter a valid email address.')).toBeVisible();
  await expect(page.getByText('Please enter your password.')).toBeVisible();
  await shot(page, 'r16-auth', 'login-light');

  // ── Dark pass (theme reload lands on splash; re-drive) ───────
  await applyThemeDark(page);
  await fromSplashToCreate(page);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator('form').getByRole('alert')).toHaveCount(3);
  await shot(page, 'r16-auth', 'create-dark');

  // Still dark after the reload-free navigation back to Login.
  await page.getByRole('button', { name: 'Go back' }).click();
  await page.getByRole('button', { name: /i already have an account/i }).click();
  await expect(page.getByRole('img', { name: 'ASCEND' })).toBeVisible();
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('form').getByRole('alert')).toHaveCount(2);
  await shot(page, 'r16-auth', 'login-dark');
});
