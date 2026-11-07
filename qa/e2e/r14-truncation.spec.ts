import { test, expect, type Page } from '@playwright/test';
import { installSeed } from '../fixtures/personas';
import { installAiMocks } from '../fixtures/ai-mocks';
import { shot } from '../fixtures/helpers';

/**
 * QA-hardening R14 evidence drive: truncation leftovers.
 *
 * Seeds a plan with a long name and asserts:
 *  - the plan-card name renders IN FULL and wraps (no horizontal
 *    overflow, more than one line tall) instead of being cut at the
 *    action rail ("Muscle Blo..."),
 *  - the Exercise Library row for a long exercise name renders in
 *    full without horizontal overflow.
 * Screenshots at 360x740 and 320x568, light + dark.
 *
 * Theme note: helpers.setTheme only patches the store blob, but a
 * stored theme is honored solely when it is a CUSTOM choice
 * (theme-init.js / store.setTheme write ascend_theme +
 * ascend_has_custom_theme); otherwise the app follows the OS
 * preference — light in this harness, so 'dark' shots came out
 * light until this was root-caused. The dark pass mirrors the
 * app's own setTheme writes via an init script and ASSERTS
 * data-theme="dark" before shooting.
 */

const LONG_PLAN_NAME =
  'Muscle Building Upper Body Strength and Hypertrophy Block';

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

async function assertPlanCard(page: Page) {
  await page.getByRole('button', { name: /^train$/i }).first().click();
  const name = page.getByText(LONG_PLAN_NAME, { exact: true });
  await expect(name).toBeVisible();
  const nameBox = await name.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    height: el.getBoundingClientRect().height,
  }));
  // Wrapped, not overflowing: content fits its box and takes >1 line.
  expect(nameBox.scrollWidth).toBeLessThanOrEqual(nameBox.clientWidth + 1);
  expect(nameBox.height).toBeGreaterThan(24);
}

async function assertLibrary(page: Page) {
  await page.getByRole('button', { name: 'Training Tools' }).click();
  await page.getByText('Exercise Library', { exact: true }).click();
  const exName = page.getByText('Overhead Press', { exact: true }).first();
  await exName.scrollIntoViewIfNeeded();
  await expect(exName).toBeVisible();
  const exBox = await exName.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(exBox.scrollWidth).toBeLessThanOrEqual(exBox.clientWidth + 1);
}

test('plan card + exercise library: long names wrap in full', async ({ page }, testInfo) => {
  const proj = testInfo.project.name;
  test.skip(
    proj !== 'android-360x740' && proj !== 'small-320x568',
    'R14 drive runs at 360x740 and 320x568',
  );
  await installAiMocks(page);
  await installSeed(page, 'intermediate');
  // Inject the long-named plan through an init script (the channel
  // installSeed uses — patchStore's write can be clobbered by the
  // app's persist-on-unload during reload, per the R8 spec's note).
  await page.addInitScript((planName) => {
    try {
      const raw = window.localStorage.getItem('ascend_store');
      if (!raw) return;
      const blob = JSON.parse(raw);
      blob.state.plannedWorkouts = [
        {
          id: 'qa-r14-plan',
          name: planName,
          exercises: [
            { name: 'Overhead Press', targetSets: 3, targetReps: 8 },
            { name: 'Barbell Bench Press', targetSets: 4, targetReps: 6 },
          ],
          createdAt: '2026-11-01',
        },
      ];
      window.localStorage.setItem('ascend_store', JSON.stringify(blob));
    } catch {}
  }, LONG_PLAN_NAME);
  await page.goto('/');

  // Light pass.
  await assertPlanCard(page);
  await shot(page, 'r14-truncation', `plan-card-${proj}-light`);
  await assertLibrary(page);
  await shot(page, 'r14-truncation', `library-${proj}-light`);
  await page.keyboard.press('Escape');

  // Dark pass (reload lands back on a main screen; re-drive).
  await applyThemeDark(page);
  await assertPlanCard(page);
  await shot(page, 'r14-truncation', `plan-card-${proj}-dark`);
  await assertLibrary(page);
  await shot(page, 'r14-truncation', `library-${proj}-dark`);
});
