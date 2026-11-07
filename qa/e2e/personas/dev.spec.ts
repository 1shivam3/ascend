import { test, expect } from '@playwright/test';
import { installSeed, STORE_KEY } from '../../fixtures/personas';
import { installAiMocks } from '../../fixtures/ai-mocks';
import { PersonaRun, collectionCounts, expectBooted, finishWorkout, logAllSets, mainNav, readStoreState } from '../../fixtures/persona-run';

/**
 * Phase 4 — Persona 8: Dev, adversarial tester (seeded
 * 'intermediate'). Hostile inputs and abuse patterns: absurd and
 * negative values, huge/emoji/RTL/script-laden text, rapid
 * double-taps, page kill mid-workout, delete/undo chains against
 * the R1 PR-recompute rule, and a second tab. The app must not
 * crash and must not corrupt data; every assertion reads the
 * persisted store back.
 *
 * Draft-recovery note: the harness seed re-writes the store on
 * every navigation, so the kill leg snapshots the LIVE store to
 * sessionStorage first and a second init script (registered after
 * the seed's) restores it on the reload — the app's own draft
 * machinery is what is under test, not the seed.
 */
test('Dev — adversarial inputs, no corruption', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-360x740', 'Persona runs at 360x740');
  test.setTimeout(600_000);
  const run = new PersonaRun(page, 'dev');
  await installAiMocks(page);
  await installSeed(page, 'intermediate');
  await page.addInitScript(() => {
    try {
      const snap = window.sessionStorage.getItem('qa_store_snapshot');
      if (snap) window.localStorage.setItem('ascend_store', snap);
    } catch {}
  });

  await page.goto('/');
  await expectBooted(page);
  const before = await collectionCounts(page);
  expect(before.workouts).toBe(18);

  const noCrash = async () => {
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    expect(text).not.toContain('Something went wrong');
  };
  const draftSets = async (): Promise<({ ex: string } & Record<string, unknown>)[]> => {
    const s = await readStoreState(page);
    const draft = s.activeWorkoutDraft as { exercises?: { name: string; sets: Record<string, unknown>[] }[] } | null;
    return draft?.exercises?.flatMap((e) => e.sets.map((set) => ({ ex: e.name, ...set }))) ?? [];
  };

  await run.step('Hostile meal text (5k chars, emoji, RTL, markup) logs safely', async () => {
    await run.tap(mainNav(page).getByRole('button', { name: /^fuel$/i }));
    const input = page.getByLabel(/describe foods and quantities/i);
    await expect(input).toBeVisible();
    const hostile =
      '🍛 دال و روٹی <script>alert(1)</script> ' + 'x'.repeat(5_000) + ' \u202Ereversed\u202C ' + '🔥'.repeat(200);
    await run.fill(input, hostile);
    await run.tap(page.getByRole('button', { name: /^log meal$/i }));
    await expect
      .poll(async () => (await collectionCounts(page)).meals, { timeout: 15_000 })
      .toBe(before.meals + 1);
    await noCrash();
    const s = await readStoreState(page);
    expect(s.__unparseable).toBeUndefined();
  });
  await run.shotAt('hostile-meal-light');

  await run.step('Start a session for value abuse', async () => {
    await run.tap(mainNav(page).getByRole('button', { name: /^today$/i }));
    await run.tap(page.getByRole('button', { name: /^start workout$/i }).first());
    await run.tap(page.getByRole('button', { name: /^suggested workout$/i }).first());
    await expect(page.getByRole('button', { name: /^start workout$/i }).last()).toBeVisible();
    await run.tap(page.getByRole('button', { name: /^start workout$/i }).last());
    await expect(page.getByRole('button', { name: /complete set/i })).toBeVisible({ timeout: 20_000 });
  });

  await run.step('Weight steppers floor at 0 and cap sanely (60 rapid taps)', async () => {
    const tapN = async (name: RegExp, n: number) => {
      for (let i = 0; i < n; i++) {
        const b = page.getByRole('button', { name }).first();
        if (!(await b.isVisible().catch(() => false))) break;
        await b.click({ timeout: 3_000 }).catch(() => {});
        run.taps += 1;
      }
    };
    await tapN(/adjust weight by -5/i, 30);
    await tapN(/adjust weight by \+5/i, 40);
    await page.waitForTimeout(600);
    // Complete the set and read back what actually persisted.
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) =>
        /^complete set$/i.test((x.textContent ?? '').trim()),
      );
      b?.click();
    });
    run.taps += 1;
    await page.waitForTimeout(1_200);
    // Dismiss the rest overlay if it opened.
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) =>
        /dismiss set complete/i.test(x.getAttribute('aria-label') ?? ''),
      );
      b?.click();
    });
    await page.waitForTimeout(600);
    const sets = await draftSets();
    const done = sets.filter((s) => s.completed || s.status === 'completed');
    expect(done.length).toBeGreaterThanOrEqual(1);
    const w = Number(done[0].weight ?? 0);
    expect(Number.isFinite(w)).toBe(true);
    expect(w).toBeGreaterThanOrEqual(0);
    expect(w).toBeLessThanOrEqual(1_000);
    await noCrash();
  });
  await run.shotAt('hostile-values-light');

  await run.step('Rapid double-tap on Complete Set logs exactly one set', async () => {
    const setsBefore = (await draftSets()).filter((s) => s.completed || s.status === 'completed').length;
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) =>
        /^complete set$/i.test((x.textContent ?? '').trim()),
      );
      if (b) {
        b.click();
        b.click();
      }
    });
    run.taps += 2;
    await page.waitForTimeout(1_500);
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) =>
        /dismiss set complete/i.test(x.getAttribute('aria-label') ?? ''),
      );
      b?.click();
    });
    await page.waitForTimeout(600);
    const setsAfter = (await draftSets()).filter((s) => s.completed || s.status === 'completed').length;
    expect(setsAfter).toBe(setsBefore + 1);
    await noCrash();
  });

  await run.step('Kill the page mid-workout — the draft is recovered', async () => {
    // Snapshot the LIVE store (the seed would otherwise re-apply).
    await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (raw) window.sessionStorage.setItem('qa_store_snapshot', raw);
    }, STORE_KEY);
    const doneBefore = (await draftSets()).filter((s) => s.completed || s.status === 'completed').length;
    expect(doneBefore).toBeGreaterThanOrEqual(1);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2_000);
    const counts = await collectionCounts(page);
    expect(counts.hasDraft).toBe(true);
    // Recovery surface: the app lands on Train under a "Workout in
    // progress" banner (plan name + exercises saved) with Resume.
    await expect(page.getByText(/workout in progress/i)).toBeVisible({ timeout: 15_000 });
    await run.tap(page.getByRole('button', { name: /^resume$/i }).first());
    await expect(page.getByRole('button', { name: /complete set/i })).toBeVisible({ timeout: 20_000 });
    const doneAfter = (await draftSets()).filter((s) => s.completed || s.status === 'completed').length;
    expect(doneAfter).toBe(doneBefore);
    await page.evaluate(() => window.sessionStorage.removeItem('qa_store_snapshot'));
    await noCrash();
  });
  // No shotsBoth here: its reloads would re-apply the seed and
  // destroy the very state this leg proved (resumed draft).
  await run.shotAt('draft-recovered-light');

  await run.step('Finish the recovered session — it saves as a normal workout', async () => {
    // The recovered draft is fully usable: log the remaining sets
    // and finish; the session lands in history like any other.
    await logAllSets(page, run);
    await finishWorkout(page, run);
    const counts = await collectionCounts(page);
    expect(counts.hasDraft).toBe(false);
    expect(counts.workouts).toBe(before.workouts + 1);
    await noCrash();
  });

  await run.step('Delete the Deadlift-PR workout — PR recomputes (R1)', async () => {
    await run.tap(mainNav(page).getByRole('button', { name: /^train$/i }));
    await run.tap(page.getByRole('tab', { name: /^history$/i }).first());
    await run.tap(page.getByRole('button', { name: /day b — deadlift focus/i }).first());
    await run.tap(page.getByRole('button', { name: /^delete workout$/i }).first());
    await page.waitForTimeout(800);
    // Inline confirm: "Delete this workout? [Yes, Delete] [Cancel]".
    await run.tap(page.getByRole('button', { name: /yes, delete/i }).first());
    await page.waitForTimeout(1_200);
    const counts = await collectionCounts(page);
    expect(counts.workouts).toBe(before.workouts); // +1 finished above, -1 deleted here
    const s = await readStoreState(page);
    // R1, stated precisely: the DERIVED PR series (pr-auto-*) is
    // recomputed from remaining history — no derived Deadlift
    // record may come from the deleted 2026-11-03 session, and the
    // best derived Deadlift is 136 kg. The fixture's seeded PR
    // records are manual-shaped, and R1 says manual PRs persist
    // unless the user deletes them — so the headline 140 kg PR
    // remaining is by design, not staleness (the Phase 1 unit
    // tests cover the derived-only scenario end to end).
    const derived = (s.prs as { id: string; exercise: string; weightKg: number; date: string }[]).filter(
      (p) => p.exercise === 'Deadlift' && p.id.startsWith('pr-auto-'),
    );
    expect(derived.every((p) => p.date !== '2026-11-03')).toBe(true);
    expect(Math.max(...derived.map((p) => p.weightKg))).toBe(136);
    await noCrash();
  });
  await run.shotAt('pr-recomputed-light');

  await run.step('Undo restores the workout and the PR', async () => {
    const undo = page.getByRole('button', { name: /undo/i }).first();
    await expect(undo).toBeVisible({ timeout: 8_000 });
    await run.tap(undo);
    await page.waitForTimeout(1_200);
    const counts = await collectionCounts(page);
    expect(counts.workouts).toBe(before.workouts + 1);
    const s = await readStoreState(page);
    const deadliftPr = (s.prs as { exercise: string; weightKg: number }[]).find((p) => p.exercise === 'Deadlift');
    expect(deadliftPr?.weightKg).toBe(140);
  });

  await run.step('Second tab: shared store stays consistent', async () => {
    const page2 = await page.context().newPage();
    await installAiMocks(page2);
    // Deliberately NO seed for tab 2: it must boot from tab 1's
    // live persisted store (the real two-tab scenario).
    await page2.goto('/');
    await expectBooted(page2);
    const counts2 = await collectionCounts(page2);
    expect(counts2.workouts).toBe(before.workouts + 1);
    await page2.close();
    const s = await readStoreState(page);
    expect(s.__unparseable).toBeUndefined();
    await noCrash();
  });

  run.logSummary();
});
