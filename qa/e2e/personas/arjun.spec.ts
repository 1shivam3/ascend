import { test, expect } from '@playwright/test';
import { installSeed } from '../../fixtures/personas';
import { installAiMocks } from '../../fixtures/ai-mocks';
import { PersonaRun, collectionCounts, expectBooted, finishWorkout, logAllSets } from '../../fixtures/persona-run';

/**
 * Phase 4 — Persona 3: Arjun, beginner (truly fresh profile,
 * 'empty-guest' seed = no seed). Journeys: onboard as a guest,
 * land on Today in the Simple (beginner) view, start the suggested
 * workout, log his first full session, and see it saved in history.
 */
test('Arjun — beginner onboarding + first workout', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-360x740', 'Persona runs at 360x740');
  test.setTimeout(420_000);
  const run = new PersonaRun(page, 'arjun');
  await installAiMocks(page);
  await installSeed(page, 'empty-guest'); // no-op by design: truly fresh

  await run.step('Open the app and continue as guest', async () => {
    await page.goto('/');
    await run.tap(page.getByText('TAP TO CONTINUE'));
    await run.tap(page.getByRole('button', { name: /continue as guest/i }));
  });
  await run.shotAt('welcome-light');

  await run.step('Skip goals, enter basic details', async () => {
    await run.tap(page.getByRole('button', { name: /skip for now/i }));
    await run.fill(page.locator('#details-name'), 'Arjun');
    await run.tap(page.getByRole('button', { name: /^male$/i }));
    await page.locator('#details-dob-day').selectOption('15');
    await page.locator('#details-dob-month').selectOption('6');
    await page.locator('#details-dob-year').selectOption('2000');
    run.taps += 3;
    // Required: without a bodyweight choice the Continue stays put.
    await run.tap(page.getByRole('button', { name: /i'll add this later/i }));
    await run.tap(page.getByRole('button', { name: /^continue$/i }));
  });
  run.markDifficulty(
    'Skip goals, enter basic details',
    'Continue silently does nothing until the bodyweight question is answered ("I\'ll add this later") — no hint is shown.',
  );
  await run.shotAt('details-light');

  await run.step('Decline the plan offer and start training', async () => {
    await run.tap(page.getByRole('button', { name: /no thanks/i }));
    await run.tap(page.getByRole('button', { name: /start training/i }));
    await expectBooted(page);
  });
  await run.shotsBoth('today');

  await run.step('Start the suggested workout (Simple view)', async () => {
    await run.tap(page.getByRole('button', { name: /^start workout$/i }).first());
    await run.tap(page.getByRole('button', { name: /^suggested workout$/i }).first());
    await expect(page.getByRole('button', { name: /^start workout$/i }).last()).toBeVisible();
    await run.tap(page.getByRole('button', { name: /^start workout$/i }).last());
    await expect(page.getByRole('button', { name: /complete set/i })).toBeVisible({ timeout: 20_000 });
  });
  run.markDifficulty(
    'Start the suggested workout (Simple view)',
    'Same three-tap path with a plan-editor modal as Rohan — a first-week beginner must confirm a generated plan before touching a set.',
  );
  await run.shotAt('workout-first-set-light');

  await run.step('Log every set of the first workout', async () => {
    await logAllSets(page, run);
    await expect(page.getByRole('button', { name: /finish/i }).first()).toBeVisible();
  });

  await run.step('Finish and see the workout saved', async () => {
    await finishWorkout(page, run);
    const after = await collectionCounts(page);
    expect(after.workouts).toBe(1);
  });
  await run.shotsBoth('after-workout');

  run.logSummary();
});
