import { test, expect } from '@playwright/test';
import { installSeed } from '../../fixtures/personas';
import { installAiMocks } from '../../fixtures/ai-mocks';
import { PersonaRun, collectionCounts, expectBooted, finishWorkout, logAllSets, mainNav } from '../../fixtures/persona-run';

/**
 * Phase 4 — Persona 1: Rohan, intermediate lifter (seeded
 * 'intermediate': 18 workouts / 6 weeks, PRs, meals, macro goals).
 * Core logging journey: start the suggested workout from Today,
 * log every set in the Simple (beginner) view, finish, then log a
 * typed meal and find the protein target on Fuel.
 */
test('Rohan — core logging journey', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-360x740', 'Persona runs at 360x740');
  test.setTimeout(420_000);
  const run = new PersonaRun(page, 'rohan');
  await installAiMocks(page);
  await installSeed(page, 'intermediate');

  const before = await (async () => {
    await page.goto('/');
    await expectBooted(page);
    return collectionCounts(page);
  })();
  expect(before.workouts).toBe(18);
  await run.shotsBoth('today');

  await run.step('Start suggested workout (Today → Train → Suggested → Start)', async () => {
    await run.tap(page.getByRole('button', { name: /^start workout$/i }).first());
    await run.tap(page.getByRole('button', { name: /^suggested workout$/i }).first());
    await expect(page.getByRole('button', { name: /^start workout$/i }).last()).toBeVisible();
    await run.tap(page.getByRole('button', { name: /^start workout$/i }).last());
    await expect(page.getByRole('button', { name: /complete set/i })).toBeVisible({ timeout: 20_000 });
  });
  run.markDifficulty(
    'Start suggested workout (Today → Train → Suggested → Start)',
    'Three taps and a plan-generator modal stand between Today\'s "Start Workout" and the first set; the modal is a plan editor, not a confirm screen.',
  );
  await run.shotAt('workout-first-set-light');

  await run.step('Log every set (Complete Set → Next Set loop)', async () => {
    await logAllSets(page, run);
    // All sets done: a Finish entry is visible (promoted primary).
    await expect(page.getByRole('button', { name: /finish/i }).first()).toBeVisible();
  });
  await run.shotAt('workout-all-sets-done-light');

  await run.step('Finish workout and dismiss summary / Coach\'s Take', async () => {
    await finishWorkout(page, run);
    const after = await collectionCounts(page);
    expect(after.workouts).toBe(before.workouts + 1);
  });
  await run.shotsBoth('after-workout');

  await run.step('Log a meal by typing (Fuel quick log)', async () => {
    await run.tap(mainNav(page).getByRole('button', { name: /^fuel$/i }));
    const input = page.getByLabel(/describe foods and quantities/i);
    await expect(input).toBeVisible();
    const mealsBefore = (await collectionCounts(page)).meals;
    await run.fill(input, 'dal and 2 roti for lunch');
    await run.tap(page.getByRole('button', { name: /^log meal$/i }));
    await expect.poll(async () => (await collectionCounts(page)).meals, { timeout: 15_000 }).toBe(mealsBefore + 1);
  });

  await run.step('Find protein target on Fuel', async () => {
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    // Seeded macro goal: 162 g protein. The Fuel macro strip shows
    // consumed vs target; the target number must be findable.
    expect(bodyText).toContain('162');
    await run.shotsBoth('protein-target');
  });

  run.logSummary();
});
