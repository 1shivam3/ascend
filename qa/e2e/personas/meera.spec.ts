import { test, expect } from '@playwright/test';
import { installSeed } from '../../fixtures/personas';
import { installAiMocks } from '../../fixtures/ai-mocks';
import { PersonaRun, collectionCounts, expectBooted, finishWorkout, logAllSets, mainNav } from '../../fixtures/persona-run';

/**
 * Phase 4 — Persona 4: Meera, advanced user (seeded
 * 'intermediate' history with workoutModeOverride patched to
 * 'advanced' through the init-script channel, the R8 pattern).
 * Journeys: read PRs and estimated 1RM on Progress, then log a
 * full session in the Advanced (table) view.
 */
test('Meera — Advanced view + Progress/PRs', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-360x740', 'Persona runs at 360x740');
  test.setTimeout(420_000);
  const run = new PersonaRun(page, 'meera');
  await installAiMocks(page);
  await installSeed(page, 'intermediate');
  await page.addInitScript(() => {
    try {
      const raw = window.localStorage.getItem('ascend_store');
      if (!raw) return;
      const blob = JSON.parse(raw);
      blob.state.uiPreferences = { ...(blob.state.uiPreferences ?? {}), workoutModeOverride: 'advanced' };
      window.localStorage.setItem('ascend_store', JSON.stringify(blob));
    } catch {}
  });

  await page.goto('/');
  await expectBooted(page);
  const before = await collectionCounts(page);
  expect(before.workouts).toBe(18);
  expect(before.prs).toBe(5);

  await run.step('Progress shows the seeded PRs with estimated 1RM', async () => {
    await run.tap(mainNav(page).getByRole('button', { name: /^progress$/i }));
    await expect
      .poll(async () => page.evaluate(() => document.body?.innerText ?? ''), { timeout: 15_000 })
      .toContain('Personal Records');
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    // The Personal Records card shows estimated 1RM (Epley), not the
    // raw set weight: Squat 102.5x5 -> 119.6, Deadlift 140x5 -> 163.3.
    expect(bodyText).toContain('Personal Records');
    expect(bodyText).toContain('Deadlift');
    expect(bodyText).toContain('163.3');
    expect(bodyText).toContain('Squat');
    expect(bodyText).toContain('119.6');
  });
  await run.shotsBoth('progress');

  await run.step('View All records lists every PR including Barbell Row', async () => {
    await run.tap(page.getByRole('button', { name: /^view all$/i }).first());
    await page.waitForTimeout(800);
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    expect(bodyText).toContain('Barbell Row');
    expect(bodyText).toContain('Overhead Press');
  });

  await run.step('Start a workout in the Advanced view', async () => {
    await run.tap(mainNav(page).getByRole('button', { name: /^train$/i }));
    await run.tap(page.getByRole('button', { name: /^suggested workout$/i }).first());
    await expect(page.getByRole('button', { name: /^start workout$/i }).last()).toBeVisible();
    await run.tap(page.getByRole('button', { name: /^start workout$/i }).last());
    // Advanced view signature: per-row completion toggles, no single
    // big Complete Set bar.
    await expect(page.getByRole('button', { name: /mark set complete/i }).first()).toBeVisible({ timeout: 20_000 });
  });
  await run.shotAt('advanced-session-light');

  await run.step('Log every set with the row toggles', async () => {
    await logAllSets(page, run);
    await expect(page.getByRole('button', { name: /finish/i }).first()).toBeVisible();
  });

  await run.step('Finish the Advanced session', async () => {
    await finishWorkout(page, run);
    const after = await collectionCounts(page);
    expect(after.workouts).toBe(before.workouts + 1);
    // The saved session must carry every set as completed — the
    // Advanced loop's end-state Next button is inert, so this count
    // is what proves the full session was actually logged.
    const setCounts = await page.evaluate(() => {
      const raw = window.localStorage.getItem('ascend_store');
      const state = raw ? JSON.parse(raw).state : {};
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const last = (state.workouts ?? []).find((w: any) => w.date === todayStr);
      let total = 0;
      let done = 0;
      for (const ex of last?.exercises ?? []) {
        for (const s of ex.sets ?? []) {
          total += 1;
          if (s.completed || s.status === 'completed') done += 1;
        }
      }
      return { total, done };
    });
    expect(setCounts.total).toBeGreaterThanOrEqual(10);
    expect(setCounts.done).toBe(setCounts.total);
  });
  await run.shotsBoth('after-workout');

  run.logSummary();
});
