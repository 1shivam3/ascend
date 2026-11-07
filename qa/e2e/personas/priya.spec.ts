import { test, expect } from '@playwright/test';
import { installSeed } from '../../fixtures/personas';
import { installAiMocks } from '../../fixtures/ai-mocks';
import { PersonaRun, collectionCounts, expectBooted, finishWorkout, logAllSets, mainNav } from '../../fixtures/persona-run';

/**
 * Phase 4 — Persona 2: Priya, nutrition-first, Hindi UI
 * (seeded 'hindi': intermediate history, language 'hi').
 * Journeys: the app is usable end-to-end in Hindi — log an Indian
 * meal from the Quick log box, check protein vs target, and log a
 * full workout one-handed between sets (the session loop driven
 * through the bilingual label matchers in persona-run.ts).
 * Voice set logging is NOT TESTABLE here: it needs a live
 * microphone; only its parse endpoint is mocked.
 */
test('Priya — Hindi nutrition-first journey', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-360x740', 'Persona runs at 360x740');
  test.setTimeout(420_000);
  const run = new PersonaRun(page, 'priya');
  await installAiMocks(page);
  await installSeed(page, 'hindi');

  await page.goto('/');
  await expectBooted(page);
  const before = await collectionCounts(page);
  expect(before.workouts).toBe(18);

  await run.step('Hindi UI on Today (nav + surfaces in Hindi)', async () => {
    const nav = mainNav(page);
    await expect(nav.getByRole('button', { name: 'पोषण' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'ट्रेनिंग' })).toBeVisible();
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    expect(bodyText).toContain('प्रोटीन');
  });
  await run.shotsBoth('today');

  await run.step('Log an Indian meal from the Quick log box (Hindi UI)', async () => {
    await run.tap(mainNav(page).getByRole('button', { name: 'पोषण' }));
    const input = page.getByLabel(/खाना दर्ज करने के लिए/);
    await expect(input).toBeVisible();
    const mealsBefore = (await collectionCounts(page)).meals;
    await run.fill(input, 'दाल और 2 रोटी, पनीर सब्ज़ी');
    await run.tap(page.getByRole('button', { name: /खाना दर्ज करें/ }).first());
    await expect
      .poll(async () => (await collectionCounts(page)).meals, { timeout: 15_000 })
      .toBe(mealsBefore + 1);
  });
  await run.shotAt('meal-logged-light');

  await run.step('Check protein vs target on Fuel', async () => {
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    // Seeded target: 162 g protein, labelled प्रोटीन in the Hindi UI.
    expect(bodyText).toContain('प्रोटीन');
    expect(bodyText).toContain('162');
    await run.shotsBoth('protein-target');
  });

  run.notTestable(
    'Log sets with voice (Hinglish)',
    'Voice capture needs a live microphone; the parse-voice endpoint is mocked but no mic exists in this harness.',
  );

  await run.step('Start the suggested workout (Hindi labels)', async () => {
    await run.tap(mainNav(page).getByRole('button', { name: 'ट्रेनिंग' }));
    await run.tap(page.getByRole('button', { name: /सुझाया वर्कआउट/ }).first());
    await expect(page.getByRole('button', { name: /वर्कआउट शुरू करें/ }).last()).toBeVisible();
    await run.tap(page.getByRole('button', { name: /वर्कआउट शुरू करें/ }).last());
    await expect(page.getByRole('button', { name: /सेट पूरा करें/ })).toBeVisible({ timeout: 20_000 });
  });
  await run.shotAt('workout-first-set-light');

  await run.step('Log every set one-handed (Complete Set loop, Hindi)', async () => {
    await logAllSets(page, run);
    await expect(page.getByRole('button', { name: /समाप्त/ }).first()).toBeVisible();
  });

  await run.step('Finish workout (Hindi)', async () => {
    await finishWorkout(page, run);
    const after = await collectionCounts(page);
    expect(after.workouts).toBe(before.workouts + 1);
  });
  await run.shotsBoth('after-workout');

  run.logSummary();
});
