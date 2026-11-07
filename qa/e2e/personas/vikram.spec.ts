import { test, expect } from '@playwright/test';
import { installSeed } from '../../fixtures/personas';
import { installAiMocks } from '../../fixtures/ai-mocks';
import { setTheme } from '../../fixtures/helpers';
import { PersonaRun, expectBooted, mainNav, readStoreState } from '../../fixtures/persona-run';

/**
 * Phase 4 — Persona 7: Vikram, returning from knee + lower-back
 * issues (seeded 'injuries': trainingProfile.injuriesOrLimitations
 * = ['Knee', 'Low back']).
 *
 * FINDING F4-3 (High, safety): the design intent in code is that
 * generated plans pass through prepareGeneratedPlans with the
 * declared limitations (split-schedule path does), and hand-built
 * plans warn on clashes (WorkoutPage plan editor does). But the
 * Suggested Workout modal's body-part generator does NEITHER with
 * the DECLARED limitations: selecting Legs prescribed a barbell
 * Squat — the archetypal knee/low-back load — with no warning,
 * and starting the session put Squat as exercise 1. Narrowing
 * evidence: pain reported in-session IS honored — after the
 * "Hurts" swap interaction, regenerated Legs plans exclude Squat.
 * So the modal generator reads pain flags but not the declared
 * limitations list the user set in their profile.
 * FINDING F4-4 (Medium): Swap → "Hurts / joint discomfort" for
 * Squat offers NO replacement (the joint filter empties the list);
 * the consequence note renders, but a swap cannot be completed
 * in-panel — removal is the only working escape.
 *
 * The coach-context leg is not observable end-to-end (the prompt
 * is server-side and replies are mocked); src/lib/ai-context.ts
 * adds "LIMITATIONS/INJURIES: …" to the coach context — verified
 * by code read, recorded as such, not as an e2e pass.
 */
test('Vikram — injury limitations respected?', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-360x740', 'Persona runs at 360x740');
  test.setTimeout(420_000);
  const run = new PersonaRun(page, 'vikram');
  await installAiMocks(page);
  await installSeed(page, 'injuries');

  await page.goto('/');
  await expectBooted(page);
  const state = await readStoreState(page);
  expect(state.trainingProfile?.injuriesOrLimitations).toEqual(['Knee', 'Low back']);
  await run.shotsBoth('today');

  const openGenerator = async () => {
    await run.tap(mainNav(page).getByRole('button', { name: /^train$/i }));
    await run.tap(page.getByRole('button', { name: /^suggested workout$/i }).first());
    await expect(page.getByRole('button', { name: /^start workout$/i }).last()).toBeVisible({ timeout: 15_000 });
  };
  const selectLegs = async () => {
    const legs = page.getByRole('button', { name: /quads, hamstrings/i }).first();
    await expect(legs).toBeVisible({ timeout: 10_000 });
    await run.tap(legs);
    await page.waitForTimeout(1_500);
  };
  const modalText = () => page.evaluate(() => document.body?.innerText ?? '');

  await run.step('Default suggested plan avoids the limited areas', async () => {
    await openGenerator();
    const text = await modalText();
    expect(text).toContain('Bench Press');
    expect(text).not.toMatch(/\bSquat\b/);
    expect(text).not.toMatch(/\bDeadlift\b/);
  });
  await run.shotAt('generator-default-light');

  await run.step('Generating a Legs plan respects Knee + Low back (no Squat, or a warning)', async () => {
    await selectLegs();
    await run.shotAt('generator-legs-light');
    const text = await modalText();
    // Pass condition: banned movement swapped/dropped, OR an
    // explicit limitation warning shown. Neither happens (F4-3).
    expect(text).not.toMatch(/\bSquat\b/);
  });

  // Dark-theme evidence of the same defect.
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await setTheme(page, 'dark');
  await run.step('Generating a Legs plan respects limitations — dark theme', async () => {
    await openGenerator();
    await selectLegs();
    await run.shotAt('generator-legs-dark');
    const text = await modalText();
    expect(text).not.toMatch(/\bSquat\b/);
  });
  await setTheme(page, 'light');

  await run.step('Starting the Legs workout opens on a knee-safe exercise', async () => {
    await openGenerator();
    await selectLegs();
    await run.tap(page.getByRole('button', { name: /^start workout$/i }).last());
    await page.waitForTimeout(2_500);
    await run.shotAt('session-first-exercise-light');
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    expect(text).toContain('EXERCISE 1 OF');
    expect(text).not.toMatch(/SQUAT/);
  });

  await run.step('Swap the exercise with "Hurts / joint discomfort"', async () => {
    await run.tap(page.getByRole('button', { name: /workout tools/i }));
    await run.tap(page.getByRole('button', { name: /^swap this exercise$/i }));
    await expect(page.getByText(/swap squat/i)).toBeVisible({ timeout: 10_000 });
    await run.tap(page.getByRole('button', { name: /hurts \/ joint discomfort/i }));
    await page.waitForTimeout(800);
    const panelText = await page.evaluate(() => document.body?.innerText ?? '');
    // The hurts path states its future-plans consequence…
    expect(panelText).toMatch(/removes it from your future plans/i);
    await run.shotAt('swap-panel-light');
    // …but for Squat + knee pain it offers NO replacement at all:
    // the same-family/joint filter empties the list (Leg Press,
    // Hack Squat, Goblet Squat were offered pre-chip) and the panel
    // falls back to "use Add exercise" (F4-4). A completed in-panel
    // swap is therefore impossible for exactly the case that needs
    // it most.
    const replacements = await page
      .locator('button')
      .filter({ hasText: /leg press|hack squat|goblet/i })
      .count();
    expect(replacements).toBeGreaterThan(0);
  });

  await run.step('Remove the banned exercise from the session instead', async () => {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(600);
    await run.tap(page.getByRole('button', { name: /remove this exercise/i }).first());
    await page.waitForTimeout(1_000);
    const confirm = page.getByRole('button', { name: /^remove$|^confirm$|^yes$/i }).first();
    if (await confirm.isVisible().catch(() => false)) await run.tap(confirm);
    await page.waitForTimeout(1_000);
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    expect(text).toContain('EXERCISE 1 OF');
    expect(text).not.toMatch(/BARBELL \| SQUAT/);
  });

  await run.step('Future generated plans keep the hurt exercise out', async () => {
    // Discard the session and regenerate a Legs plan.
    await run.tap(page.getByRole('button', { name: /discard workout/i }).first());
    const confirm = page.getByRole('button', { name: /^discard$|confirm|yes/i }).first();
    if (await confirm.isVisible().catch(() => false)) await run.tap(confirm);
    await page.waitForTimeout(1_200);
    await openGenerator();
    await selectLegs();
    const text = await modalText();
    expect(text).not.toMatch(/\bSquat\b/);
  });

  run.notTestable(
    'Coach context carries the injuries',
    'The coach prompt is built server-side and replies are mocked here; src/lib/ai-context.ts adds "LIMITATIONS/INJURIES: Knee, Low back" to the context (code-verified, not e2e-observable).',
  );

  run.logSummary();
});
