import { test, expect } from '@playwright/test';
import { installSeed } from '../../fixtures/personas';
import { installAiMocks } from '../../fixtures/ai-mocks';
import { goOffline, goOnline, setTheme } from '../../fixtures/helpers';
import { PersonaRun, collectionCounts, expectBooted, finishWorkout, logAllSets, mainNav } from '../../fixtures/persona-run';

/**
 * Phase 4 — Persona 6: Sana, patchy gym network (seeded
 * 'intermediate'). Journeys: offline behaviour of a local-first
 * app whose service worker precaches the app shell.
 *
 * Two genuine defects were found BEFORE the warm journey could
 * run (both reproduced with the service worker verified active
 * and controlling the page):
 *  F4-1 (High): the FIRST open of Train while offline — before
 *    the Train chunk has ever been fetched online — crashes into
 *    the error boundary ("Something went wrong"). One online
 *    visit to Train is required before offline training works;
 *    every deploy re-hashes chunks, so the cold state recurs.
 *  F4-2 (High): relaunching/reloading the app while offline
 *    fails with ERR_INTERNET_DISCONNECTED even with an active,
 *    controlling service worker — the navigation is not served
 *    from the precache in this build.
 * After one online warm-up visit, the offline logging journey
 * itself (start, log, finish, meal) works fully and data survives
 * reconnect. CLOUD SYNC is NOT TESTED (no backend in this harness).
 *
 * Offline taps use hit-test DOM clicks (tapVisibleButton): the
 * offline surfaces add extra same-labelled elements, and .first()
 * can land on a non-actionable one.
 */
async function tapVisibleButton(page: import('@playwright/test').Page, run: PersonaRun, pattern: RegExp): Promise<void> {
  run.taps += 1;
  const attempt = () =>
    page.evaluate((src) => {
      const re = new RegExp(src, 'i');
      const label = (b: Element) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim();
      const cands = Array.from(document.querySelectorAll('button')).filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && re.test(label(b));
      });
      for (const b of cands) {
        const r = b.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (t && (t === b || b.contains(t))) {
          b.click();
          return label(b);
        }
      }
      if (cands.length > 0) {
        cands[0].scrollIntoView({ block: 'center' });
        return 'scrolled';
      }
      return null;
    }, pattern.source);
  let clicked = await attempt();
  if (clicked === 'scrolled') {
    await page.waitForTimeout(500);
    clicked = await attempt();
  }
  if (!clicked || clicked === 'scrolled') throw new Error(`no visible hit-testable button matching ${pattern}`);
}

test('Sana — offline: cold failures, then warm offline logging', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-360x740', 'Persona runs at 360x740');
  test.setTimeout(600_000);
  const run = new PersonaRun(page, 'sana');
  await installAiMocks(page);
  await installSeed(page, 'intermediate');

  await page.goto('/');
  await expectBooted(page);
  const before = await collectionCounts(page);
  expect(before.workouts).toBe(18);
  expect(before.meals).toBe(6);
  // Let the service worker install and activate (verified, so the
  // cold-offline failures below cannot be install timing).
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker?.getRegistration();
          return Boolean(reg?.active && navigator.serviceWorker?.controller);
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
  await run.shotsBoth('today-online');

  // ── F4-1, light: cold Train open while offline ────────────────
  await goOffline(page);
  await page.waitForTimeout(800);
  await run.step('Open Train offline without any prior online visit (cold)', async () => {
    await tapVisibleButton(page, run, /^start workout$/);
    await page.waitForTimeout(2_000);
    await run.shotAt('cold-train-error-light');
    await expect(page.getByRole('button', { name: /^suggested workout$/i }).first()).toBeVisible({ timeout: 8_000 });
  });
  // Recover to Today (client-side, works offline), back online.
  await tapVisibleButton(page, run, /return to dashboard/i).catch(() => {});
  await goOnline(page);
  await page.waitForTimeout(800);

  // ── F4-1, dark: same cold failure in Graphite ─────────────────
  await setTheme(page, 'dark');
  await goOffline(page);
  await page.waitForTimeout(800);
  await run.step('Open Train offline cold — dark theme', async () => {
    await tapVisibleButton(page, run, /^start workout$/);
    await page.waitForTimeout(2_000);
    await run.shotAt('cold-train-error-dark');
    await expect(page.getByRole('button', { name: /^suggested workout$/i }).first()).toBeVisible({ timeout: 8_000 });
  });
  await tapVisibleButton(page, run, /return to dashboard/i).catch(() => {});
  await goOnline(page);
  await setTheme(page, 'light');

  // ── F4-2: relaunch while offline ──────────────────────────────
  await goOffline(page);
  await page.waitForTimeout(500);
  await run.step('Relaunch the app while offline (reload)', async () => {
    await page.reload({ waitUntil: 'load' });
    await expectBooted(page);
  });
  await run.shotAt('offline-relaunch-light').catch(() => {});
  // Recover: back online, reload restores the app (seed re-applies;
  // no persona data has been logged yet at this point by design).
  await goOnline(page);
  await page.reload({ waitUntil: 'load' });
  await expectBooted(page);

  // ── Warm-up: the online visits F4-1 makes necessary ──────────
  // (The meal leg of the first Sana run proved Fuel's chunk is
  // cold-offline-fragile exactly like Train's — every lazily
  // loaded tab is. Warm them all, as a returning user would have.)
  await run.step('Warm up: visit every tab once online', async () => {
    await run.tap(mainNav(page).getByRole('button', { name: /^train$/i }));
    await expect(page.getByRole('button', { name: /^suggested workout$/i }).first()).toBeVisible({ timeout: 15_000 });
    await run.tap(mainNav(page).getByRole('button', { name: /^fuel$/i }));
    await expect(page.getByLabel(/describe foods and quantities/i)).toBeVisible({ timeout: 15_000 });
    await run.tap(mainNav(page).getByRole('button', { name: /^today$/i }));
  });

  // ── The offline logging journey (warm cache) ──────────────────
  await goOffline(page);
  await page.waitForTimeout(800);
  await run.step('Go offline and start the suggested workout', async () => {
    await tapVisibleButton(page, run, /^start workout$/);
    await tapVisibleButton(page, run, /^suggested workout$/);
    await page.waitForTimeout(800);
    await tapVisibleButton(page, run, /^start workout$/);
    await expect(page.getByRole('button', { name: /complete set/i })).toBeVisible({ timeout: 20_000 });
  });
  await run.shotAt('offline-workout-light');

  await run.step('Log every set offline', async () => {
    await logAllSets(page, run);
    await expect(page.getByRole('button', { name: /finish/i }).first()).toBeVisible();
  });

  await run.step('Finish the workout offline — saved locally', async () => {
    await finishWorkout(page, run);
    const mid = await collectionCounts(page);
    expect(mid.workouts).toBe(before.workouts + 1);
  });

  await run.step('Log a meal offline (Quick log)', async () => {
    await run.tap(mainNav(page).getByRole('button', { name: /^fuel$/i }));
    const input = page.getByLabel(/describe foods and quantities/i);
    await expect(input).toBeVisible();
    await run.fill(input, 'dal and 2 roti for lunch');
    await run.tap(page.getByRole('button', { name: /^log meal$/i }));
    await expect
      .poll(async () => (await collectionCounts(page)).meals, { timeout: 15_000 })
      .toBe(before.meals + 1);
  });
  await run.shotAt('offline-meal-light');

  run.notTestable(
    'Cloud sync after reconnect',
    'No real backend in this harness (Supabase unconfigured in the local build); sync correctness is scored NOT TESTED.',
  );

  await run.step('Reconnect — local data intact, app fully usable', async () => {
    await goOnline(page);
    await page.waitForTimeout(1_000);
    const after = await collectionCounts(page);
    expect(after.workouts).toBe(before.workouts + 1);
    expect(after.meals).toBe(before.meals + 1);
    expect(after.prs).toBe(before.prs);
    await expectBooted(page);
  });
  await run.shotsBoth('after-reconnect');

  run.logSummary();
});
