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
 * F4 FIX PHASE (2026-11-07): F4-3 fixed — the generator now routes
 * through the adaptation pipeline, so this spec's session no longer
 * contains Squat; the swap step adds Barbell Back Squat BY HAND
 * (the warn-don't-block case) to exercise the pain swap on the same
 * movement. F4-4 fixed — the panel falls back to labelled
 * closest alternatives and the swap completes in-panel.
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
    // Post-F4-3 the generated session is knee-safe (no Squat), so add
    // Barbell Back Squat by hand — the warn-don't-block case — to run
    // the F4-4 pain swap on the movement Phase 4 failed on.
    await run.tap(page.locator('button[aria-label="Add Exercise"]').first());
    await page.getByPlaceholder(/search exercise/i).fill('Back Squat');
    await page.waitForTimeout(600);
    await run.tap(page.getByRole('button', { name: /barbell back squat/i }).first());
    await page.waitForTimeout(1_000);
    const sessionText = await page.evaluate(() => document.body?.innerText ?? '');
    expect(sessionText).toMatch(/barbell back squat/i);

    await run.tap(page.getByRole('button', { name: /workout tools/i }));
    await run.tap(page.getByRole('button', { name: /^swap this exercise$/i }));
    await expect(page.getByText(/swap barbell back squat/i)).toBeVisible({ timeout: 10_000 });
    await run.tap(page.getByRole('button', { name: /hurts \/ joint discomfort/i }));
    await page.waitForTimeout(800);
    const panelText = await page.evaluate(() => document.body?.innerText ?? '');
    // The hurts path states its future-plans consequence…
    expect(panelText).toMatch(/removes it from your future plans/i);
    // …the strict filter still (correctly) offers no same-family,
    // joint-loaded substitute — but post-F4-4 the panel no longer
    // dead-ends: a labelled closest-alternatives section appears,
    // and every fallback that loads a flagged joint says so.
    expect(panelText).toMatch(/closest alternatives/i);
    expect(panelText).toMatch(/also loads your/i);
    await run.shotAt('swap-panel-light');
    // A swap can finally be completed in-panel.
    await run.tap(page.getByRole('button', { name: /lying leg curl/i }).first());
    await page.waitForTimeout(4_000); // let the pain-noted toast clear
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    expect(text).toMatch(/lying leg curl/i);
    expect(text).not.toMatch(/barbell back squat/i);
  });

  await run.step('Remove an exercise from the session', async () => {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(600);
    await run.tap(page.getByRole('button', { name: /remove this exercise/i }).first());
    await page.waitForTimeout(1_000);
    const confirm = page.getByRole('button', { name: /^remove$|^confirm$|^yes$/i }).first();
    if (await confirm.isVisible().catch(() => false)) await run.tap(confirm);
    await page.waitForTimeout(4_000); // let the removed-exercise toast clear
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    // The appended-then-swapped exercise is gone and the session is
    // still open. (Phase 4 asserted 'EXERCISE 1 OF' because its
    // session was the Legs-only list with Squat first; the fixed
    // generator's session is the multi-part list, so the active
    // index after a removal is not 1 — the outcome that matters is
    // the removal itself.)
    expect(text).toMatch(/EXERCISE \d+ OF \d+/);
    expect(text).not.toMatch(/lying leg curl/i);
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
