import { test, expect } from '@playwright/test';
import { installSeed } from '../fixtures/personas';
import { installAiMocks } from '../fixtures/ai-mocks';
import { shot } from '../fixtures/helpers';

/**
 * QA-hardening R15 evidence drive: Train header icon buttons.
 * In advanced mode the header shows BOTH icon-only buttons; each
 * must be locatable by its accessible name and carry a matching
 * visible tooltip (title attribute). Screenshots at 360x740,
 * light + dark.
 *
 * Theme note: a stored theme is honored only as a CUSTOM choice
 * (ascend_theme + ascend_has_custom_theme, per theme-init.js and
 * store.setTheme); helpers.setTheme patches only the blob, so the
 * app followed the OS preference (light) and 'dark' shots came out
 * light until this was root-caused. The dark pass mirrors the
 * app's own setTheme writes via an init script and ASSERTS
 * data-theme="dark" before shooting.
 */

async function applyThemeDark(page: import('@playwright/test').Page) {
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

test('train header: both icon buttons labelled with tooltips', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-360x740', 'R15 drive runs at 360x740');
  await installAiMocks(page);
  await installSeed(page, 'intermediate');
  // The plate-calculator button only renders in advanced mode. Set
  // the override through an init script (the channel installSeed
  // uses — a patchStore-style write can be clobbered by the app's
  // persist-on-unload during reload, per the R8 spec's note).
  await page.addInitScript(() => {
    try {
      const raw = window.localStorage.getItem('ascend_store');
      if (!raw) return;
      const blob = JSON.parse(raw);
      blob.state.uiPreferences = {
        ...(blob.state.uiPreferences ?? {}),
        workoutModeOverride: 'advanced',
      };
      window.localStorage.setItem('ascend_store', JSON.stringify(blob));
    } catch {}
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^train$/i }).first().click();

  for (const name of ['Plate Calculator', 'Training Tools']) {
    const btn = page.getByRole('button', { name, exact: true });
    await expect(btn).toBeVisible();
    // Visible affordance of purpose: the tooltip text matches the label.
    await expect(btn).toHaveAttribute('title', name);
    const box = await btn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(40);
    expect(box!.height).toBeGreaterThanOrEqual(40);
  }
  await shot(page, 'r15-train-header', 'header-light');
  // Dark pass: reload under the init-script theme, re-open Train,
  // and re-verify both buttons before shooting.
  await applyThemeDark(page);
  await page.getByRole('button', { name: /^train$/i }).first().click();
  for (const name of ['Plate Calculator', 'Training Tools']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await shot(page, 'r15-train-header', 'header-dark');
});
