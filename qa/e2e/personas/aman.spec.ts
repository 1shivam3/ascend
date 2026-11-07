import { test, expect } from '@playwright/test';
import { installSeed } from '../../fixtures/personas';
import { installAiMocks } from '../../fixtures/ai-mocks';
import { PersonaRun, collectionCounts, expectBooted, mainNav } from '../../fixtures/persona-run';

/**
 * Phase 4 — Persona 5: Aman, a MINOR (seeded 'minor-15': DOB 15y2m
 * ago, age field 15, goal Lose Fat, no stored macro goals).
 * The PR #108 clamps must hold everywhere:
 *  - displayed targets are maintenance-level and labelled
 *    estimates, never a deficit, even with Lose Fat chosen;
 *  - creatine is hidden;
 *  - a coach action proposing a deficit is blocked and cannot
 *    apply;
 *  - (second test) onboarding with a DOB under 13 is refused.
 */
test('Aman — minor clamps hold (targets, creatine, coach action)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-360x740', 'Persona runs at 360x740');
  test.setTimeout(420_000);
  const run = new PersonaRun(page, 'aman');
  await installAiMocks(page);
  // Coach-chat override (registered after the harness mocks, so it
  // wins): the mock coach proposes a 1,200 kcal deficit target —
  // exactly what must never apply for a minor.
  await page.route('**/api/ai/coach-chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: 'QA mock: here is a lower calorie target for you.',
        evidence: [],
        provider: 'qa-mock',
        model: 'qa-mock',
        safetyStop: null,
        dailyRemaining: 41,
        action: { type: 'set_macro_goals', calories: 1200 },
      }),
    });
  });
  await installSeed(page, 'minor-15');

  await page.goto('/');
  await expectBooted(page);
  const counts = await collectionCounts(page);
  expect(counts.profileAge).toBe(15);

  await run.step('Today target is maintenance-level and labelled an estimate', async () => {
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    // Seeded stats (F, 55 kg, 160 cm, 15 y): maintenance ≈ 1,806 kcal
    // at light activity. A deficit would display several hundred
    // kcal below that; the clamp holds it at maintenance, and R5
    // labels it an estimate (activity level not yet provided).
    expect(bodyText).toContain('1,806');
    expect(bodyText).toMatch(/estimate/i);
    expect(bodyText).not.toMatch(/deficit/i);
  });
  await run.shotsBoth('today');

  await run.step('Creatine is hidden for a minor', async () => {
    const todayText = await page.evaluate(() => document.body?.innerText ?? '');
    expect(todayText).not.toMatch(/creatine/i);
    await run.tap(mainNav(page).getByRole('button', { name: /^fuel$/i }));
    await expect
      .poll(async () => page.evaluate(() => document.body?.innerText ?? ''), { timeout: 15_000 })
      .toContain('1806');
    const fuelText = await page.evaluate(() => document.body?.innerText ?? '');
    expect(fuelText).not.toMatch(/creatine/i);
    // Fuel shows the same maintenance target, not a deficit.
    expect(fuelText).toContain('1806');
  });
  await run.shotAt('fuel-light');

  await run.step('Coach action proposing a deficit cannot apply', async () => {
    await run.tap(mainNav(page).getByRole('button', { name: /^train$/i }));
    await run.tap(page.getByRole('tab', { name: /^coach$/i }).first());
    await run.tap(page.getByRole('button', { name: /ask the coach/i }));
    const section = page.locator('section[aria-label="Coach chat"]');
    await expect(section).toBeVisible();
    const input = section.getByLabel(/ask about your training/i);
    await run.fill(input, 'Can you lower my calories to lose fat faster?');
    await run.tap(section.getByRole('button', { name: /^send$/i }));
    await page.waitForTimeout(2_500);
    const chatText = await section.evaluate((el) => (el as HTMLElement).innerText ?? '');
    const apply = section.getByRole('button', { name: /^apply$/i });
    const hasApply = await apply.isVisible().catch(() => false);
    if (hasApply) {
      // Even if a card renders, applying must not move the target:
      // the PR #108 blocked state applies at confirm time.
      await run.tap(apply);
      await page.waitForTimeout(1_500);
    } else {
      expect(chatText).toMatch(/block|not available|can.t|unable|safety|minor|age/i);
    }
    await run.tap(mainNav(page).getByRole('button', { name: /^fuel$/i }));
    await expect
      .poll(async () => page.evaluate(() => document.body?.innerText ?? ''), { timeout: 15_000 })
      .toContain('1806');
    const fuelText = await page.evaluate(() => document.body?.innerText ?? '');
    expect(fuelText).toContain('1806');
    expect(fuelText).not.toContain('1200');
    const after = await collectionCounts(page);
    if (after.macroGoals) {
      expect(after.macroGoals.calorieDelta ?? 0).toBeGreaterThanOrEqual(0);
    }
  });
  await run.shotAt('coach-action-light');

  run.logSummary();
});

test('Aman — onboarding with DOB under 13 is refused', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-360x740', 'Persona runs at 360x740');
  test.setTimeout(180_000);
  const run = new PersonaRun(page, 'aman');
  await installAiMocks(page);
  await installSeed(page, 'empty-guest');

  await run.step('A DOB under 13 cannot be entered in onboarding', async () => {
    await page.goto('/');
    await run.tap(page.getByText('TAP TO CONTINUE'));
    await run.tap(page.getByRole('button', { name: /continue as guest/i }));
    await run.tap(page.getByRole('button', { name: /skip for now/i }));
    await run.fill(page.locator('#details-name'), 'Young Kid');
    await run.tap(page.getByRole('button', { name: /^male$/i }));
    // The refusal mechanism is at the input itself: the year list
    // stops at (current year - 13), so no under-13 DOB exists to
    // select. Read the options rather than selecting (selecting a
    // missing option waits forever — learned on the first run).
    const years = await page.locator('#details-dob-year option').evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value).filter((v) => /^\d{4}$/.test(v)).map(Number),
    );
    const newest = Math.max(...years);
    expect(newest).toBe(new Date().getFullYear() - 13);
    await expect(mainNav(page)).toHaveCount(0);
  });
  run.markDifficulty(
    'A DOB under 13 cannot be entered in onboarding',
    'The block is real but silent: the year list simply ends 13 years ago and no copy anywhere states a 13+ rule — a young user gets no explanation, just a missing year.',
  );
  await run.shotAt('under13-refusal-light');

  run.logSummary();
});
