import { test, expect } from '@playwright/test';
import { installSeed } from '../../fixtures/personas';
import { installAiMocks } from '../../fixtures/ai-mocks';
import { setTheme } from '../../fixtures/helpers';
import { PersonaRun, collectionCounts, expectBooted, mainNav } from '../../fixtures/persona-run';

/**
 * Phase 4 — Persona 9: Ananya, account lifecycle (seeded
 * 'intermediate' as a guest with real data: 18 workouts, 6 meals,
 * 5 PRs).
 *
 * SCOPE, plainly: this harness build has NO Supabase configured
 * (credentials come from env in production; the localStorage
 * fallback is dev-only), so a real sign-up/sign-in round-trip
 * cannot complete here and is scored NOT TESTED — the same
 * boundary Phase 3 Check 6 hit with its stubbed provider. What
 * IS tested end-to-end: the upgrade entry point, form validation,
 * that failures surface ONLY generic copy (never a provider name
 * or raw error — the F-10 rule), and that guest data is fully
 * retained around every attempt.
 */
test('Ananya — guest upgrade path, generic errors, data retained', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-360x740', 'Persona runs at 360x740');
  test.setTimeout(420_000);
  const run = new PersonaRun(page, 'ananya');
  await installAiMocks(page);
  await installSeed(page, 'intermediate');

  await page.goto('/');
  await expectBooted(page);
  const before = await collectionCounts(page);
  expect(before.workouts).toBe(18);
  expect(before.meals).toBe(6);

  // Sheet controls: the mode tabs are role="tab"; the submit is
  // the only role="button" carrying the mode's name.
  const tab = (name: RegExp) => page.getByRole('tab', { name });
  const submit = (name: RegExp) => page.getByRole('button', { name });
  const bodyText = () => page.evaluate(() => document.body?.innerText ?? '');
  const expectNoLeak = async () => {
    const text = await bodyText();
    expect(text).not.toMatch(/supabase/i);
    expect(text).not.toMatch(/failed to fetch|authapierror|network error|typeerror/i);
    expect(text).not.toContain('Something went wrong');
  };
  const openSheet = async () => {
    await run.tap(page.getByRole('button', { name: /^create account$/i }).first());
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });
  };

  await run.step('Guest upgrade prompt opens the Link Your Account sheet', async () => {
    await openSheet();
    const text = await bodyText();
    expect(text).toContain('Link Your Account');
    expect(text).toContain('Continue with Google');
    await expectNoLeak();
  });
  await run.shotAt('upgrade-sheet-light');

  await run.step('Empty submit shows inline validation, nothing raw', async () => {
    await run.tap(submit(/^log in$/i));
    await page.waitForTimeout(800);
    const alerts = await page.locator('[role="alert"]').count();
    expect(alerts).toBeGreaterThanOrEqual(1);
    await expectNoLeak();
  });

  await run.step('Invalid email + short password on Sign up are rejected inline', async () => {
    await run.tap(tab(/^sign up$/i));
    await run.fill(page.locator('input[type="email"]'), 'not-an-email');
    await run.fill(page.locator('input[type="password"]'), '123');
    // Sign-up mode's submit is labelled "Create Account" (the
    // banner behind the sheet has one too — take the last).
    await run.tap(submit(/^create account$/i).last());
    await page.waitForTimeout(800);
    const alerts = await page.locator('[role="alert"]').count();
    expect(alerts).toBeGreaterThanOrEqual(1);
    await expectNoLeak();
  });
  await run.shotAt('validation-light');

  await run.step('Valid-looking sign-up attempt fails ONLY generically; data retained', async () => {
    await run.fill(page.locator('input[type="email"]'), 'ananya@example.com');
    await run.fill(page.locator('input[type="password"]'), 'correct-horse-29');
    await run.tap(submit(/^create account$/i).last());
    await page.waitForTimeout(3_000);
    await expectNoLeak();
    const counts = await collectionCounts(page);
    expect(counts.workouts).toBe(before.workouts);
    expect(counts.meals).toBe(before.meals);
    expect(counts.prs).toBe(before.prs);
  });

  await run.step('Wrong-password login shows a generic error only', async () => {
    // Back to the Log in tab (the sheet may have closed after the
    // failed attempt — reopen if needed).
    if (!(await page.locator('input[type="email"]').isVisible().catch(() => false))) {
      await openSheet();
    }
    await run.tap(tab(/^log in$/i));
    await run.fill(page.locator('input[type="email"]'), 'ananya@example.com');
    await run.fill(page.locator('input[type="password"]'), 'wrong-password-1');
    await run.tap(submit(/^log in$/i));
    await page.waitForTimeout(3_000);
    await expectNoLeak();
    const counts = await collectionCounts(page);
    expect(counts.workouts).toBe(before.workouts);
  });
  await run.shotAt('login-error-light');

  await run.step('Upgrade sheet in dark theme', async () => {
    await page.keyboard.press('Escape').catch(() => {});
    await setTheme(page, 'dark');
    await openSheet();
    const text = await bodyText();
    expect(text).toContain('Link Your Account');
    await run.shotAt('upgrade-sheet-dark');
    await setTheme(page, 'light');
  });

  run.notTestable(
    'Real sign-up → sign-out → sign-in round-trip (incl. second device, guest-data merge on the server, account deletion)',
    'No Supabase is configured in this harness build and real accounts must never be touched from tests; Phase 3 Check 6 covered the merge semantics with a stubbed provider.',
  );

  run.logSummary();
});
