import { expect, type Locator, type Page } from '@playwright/test';
import { setTheme, shot } from './helpers';
import { STORE_KEY } from './personas';

/**
 * Persona-run recorder (QA-hardening Phase 4).
 *
 * Every persona spec drives its journeys through this recorder so
 * the PERSONA_REPORT numbers are measured the same way for all ten
 * personas: taps = click/tap calls issued by the spec (Playwright
 * `tap`-equivalents — click() on the touch-emulated projects),
 * wall-clock seconds from run start, and a step ledger with the
 * brief's outcome scale (yes / with difficulty / no).
 *
 * Screenshots use the harness convention via helpers.shot() into
 * qa/screenshots/personas/<slug>/<step>.png; shotsBoth() captures
 * the same step in light and dark (dark via the Phase 3-fixed
 * setTheme, which asserts data-theme before returning). setTheme
 * reloads the page — app state persists through the store, so a
 * shotsBoth() checkpoint is safe between journey steps.
 */

export type StepOutcome = 'yes' | 'difficulty' | 'no';

export interface RecordedStep {
  name: string;
  outcome: StepOutcome;
  note?: string;
  seconds: number;
}

export class PersonaRun {
  readonly page: Page;
  readonly slug: string;
  taps = 0;
  readonly steps: RecordedStep[] = [];
  private readonly startedAt = Date.now();
  private stepStartedAt = Date.now();

  constructor(page: Page, slug: string) {
    this.page = page;
    this.slug = slug;
  }

  seconds(): number {
    return Math.round((Date.now() - this.startedAt) / 100) / 10;
  }

  /** A counted tap/click on a locator (bounded: a covered element fails fast instead of eating the test timeout). */
  async tap(locator: Locator): Promise<void> {
    this.taps += 1;
    await locator.click({ timeout: 10_000 });
  }

  /** A counted fill (counts as one interaction). */
  async fill(locator: Locator, value: string): Promise<void> {
    this.taps += 1;
    await locator.fill(value);
  }

  /**
   * Runs one journey step and records its outcome. Never throws:
   * a failing step is recorded 'no' with the error message, and
   * the spec decides whether the journey can continue.
   */
  async step(name: string, fn: () => Promise<void>): Promise<boolean> {
    this.stepStartedAt = Date.now();
    try {
      await fn();
      this.steps.push({
        name,
        outcome: 'yes',
        seconds: Math.round((Date.now() - this.stepStartedAt) / 100) / 10,
      });
      return true;
    } catch (err) {
      this.steps.push({
        name,
        outcome: 'no',
        note: err instanceof Error ? err.message.split('\n')[0].slice(0, 300) : String(err),
        seconds: Math.round((Date.now() - this.stepStartedAt) / 100) / 10,
      });
      return false;
    }
  }

  /** Records a step the spec completed with friction (extra retries, awkward target, confusing copy). */
  markDifficulty(name: string, note: string): void {
    const last = this.steps[this.steps.length - 1];
    if (last && last.name === name && last.outcome === 'yes') {
      last.outcome = 'difficulty';
      last.note = note;
    } else {
      this.steps.push({ name, outcome: 'difficulty', note, seconds: 0 });
    }
  }

  /** Records a journey leg that cannot run in this environment at all. */
  notTestable(name: string, note: string): void {
    this.steps.push({ name, outcome: 'no', note: `NOT TESTABLE HERE: ${note}`, seconds: 0 });
  }

  async shotAt(step: string): Promise<void> {
    await shot(this.page, `personas/${this.slug}`, step);
  }

  /** Light + dark screenshots of the current screen (dark asserts data-theme via setTheme). */
  async shotsBoth(step: string): Promise<void> {
    await this.shotAt(`${step}-light`);
    await setTheme(this.page, 'dark');
    await this.shotAt(`${step}-dark`);
    await setTheme(this.page, 'light');
  }

  /** Prints the machine-readable ledger the report is built from. */
  logSummary(): void {
    // eslint-disable-next-line no-console
    console.log(
      `PERSONA_RESULT ${JSON.stringify({
        slug: this.slug,
        taps: this.taps,
        seconds: this.seconds(),
        steps: this.steps,
      })}`,
    );
  }
}

/** Reads the persisted app state (the ascend_store envelope's state). */
export async function readStoreState(
  page: Page,
): Promise<Record<string, any>> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    try {
      return JSON.parse(raw).state ?? {};
    } catch {
      return { __unparseable: true };
    }
  }, STORE_KEY);
}

/** Counts of the collections most persona assertions care about. */
export async function collectionCounts(page: Page): Promise<{
  workouts: number;
  meals: number;
  prs: number;
  plannedWorkouts: number;
  hasDraft: boolean;
  macroGoals: Record<string, any> | null;
  profileAge: number | null;
  profileDob: string | null;
}> {
  const s = await readStoreState(page);
  return {
    workouts: Array.isArray(s.workouts) ? s.workouts.length : -1,
    meals: Array.isArray(s.meals) ? s.meals.length : -1,
    prs: Array.isArray(s.prs) ? s.prs.length : -1,
    plannedWorkouts: Array.isArray(s.plannedWorkouts) ? s.plannedWorkouts.length : -1,
    hasDraft: Boolean(s.activeWorkoutDraft),
    macroGoals: (s.macroGoals as Record<string, any> | null) ?? null,
    profileAge: typeof s.profile?.age === 'number' ? s.profile.age : null,
    profileDob: typeof s.profile?.dateOfBirth === 'string' ? s.profile.dateOfBirth : null,
  };
}

/** The bottom nav landmark (present on every main surface). */
export function mainNav(page: Page) {
  return page.getByRole('navigation', { name: 'Main Navigation' });
}

/** Asserts the app booted to a main surface (nav visible). */
export async function expectBooted(page: Page): Promise<void> {
  await expect(mainNav(page)).toBeVisible({ timeout: 20_000 });
}

/**
 * Drives the live session to completion: Complete Set → rest
 * overlay advance → … until no progression control remains.
 * Learned across Phase 4's Rohan iterations (each workaround is a
 * real behavior of the session UI):
 *  - progression clicks are DOM clicks on hit-test-verified
 *    buttons — Playwright's actionability retries stall against
 *    the animated rest overlay;
 *  - the overlay's advance is found by hit test, never by
 *    ancestor-climbing (which escapes onto the header Finish);
 *  - exercise cards form a horizontal carousel — the current
 *    exercise's Complete Set is the one horizontally in frame;
 *  - after an exercise transition the button can sit below the
 *    fold — scroll it into view (the app does not auto-scroll);
 *  - the R8 "Log without weight?" prompt (confirm: "Log anyway")
 *    fires once per exercise with unset weight.
 * Throws on a stuck/repeating state; the caller records the step.
 */
export async function logAllSets(page: Page, run: PersonaRun): Promise<void> {
  let guard = 0;
  let lastClicked = '';
  let repeats = 0;
  let nulls = 0;
  for (;;) {
    guard += 1;
    if (guard > 140) throw new Error('set loop did not terminate after 140 iterations');
    const clicked = await page.evaluate(() => {
      const label = (b: Element) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim();
      const visible = (b: HTMLElement) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
      };
      const hitOk = (b: HTMLElement) => {
        const r = b.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!top && (top === b || b.contains(top));
      };
      const buttons = Array.from(document.querySelectorAll('button')).filter(visible);
      // Label matchers are bilingual (en + hi) so the Hindi persona
      // (Priya) drives the same loop: Complete Set = सेट पूरा करें,
      // Log anyway = फिर भी लॉग करें, Dismiss aria = बंद करें,
      // Next = अगला, Finish = समाप्त.
      const isDismiss = (b: Element) =>
        /dismiss set complete/i.test(label(b)) || label(b) === 'बंद करें';
      const isComplete = (b: Element) => /^complete set$/i.test(label(b)) || label(b) === 'सेट पूरा करें';
      // 1) Rest overlay ("Set Complete!"): Dismiss is unique to it.
      const dismiss = buttons.find((b) => isDismiss(b));
      if (dismiss) {
        const adv = buttons.find(
          (b) =>
            b !== dismiss &&
            (/^(next|finish|done)/i.test(label(b)) || /^अगला/.test(label(b)) || /समाप्त/.test(label(b))) &&
            hitOk(b),
        );
        const target = adv ?? dismiss;
        target.click();
        return `overlay:${label(target)}`;
      }
      // 2) R8 "Log without weight?" prompt — confirm is "Log anyway".
      const noWeight = buttons.find((b) => /^log anyway$/i.test(label(b)) || label(b) === 'फिर भी लॉग करें');
      if (noWeight && hitOk(noWeight)) {
        noWeight.click();
        return 'prompt:log-anyway';
      }
      // 3) Complete Set of the current (in-frame) exercise.
      const inFrameX = (b: HTMLElement) => {
        const r = b.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        return cx >= 0 && cx <= window.innerWidth;
      };
      const complete = buttons.find((b) => isComplete(b) && inFrameX(b));
      if (complete && hitOk(complete)) {
        complete.click();
        return 'complete-set';
      }
      // 3b) Below the fold — scroll into view, click next round.
      const anyComplete = Array.from(document.querySelectorAll('button')).find(
        (b) => isComplete(b) && inFrameX(b as HTMLElement),
      );
      if (anyComplete) {
        anyComplete.scrollIntoView({ block: 'center' });
        return 'scrolled-to-complete';
      }
      // 4) Advanced view: per-row "Mark set complete" toggles. The
      // returned label carries the remaining-toggle count so the
      // repeat guard sees progress (the count drops per completion)
      // and only trips when a click truly changes nothing.
      const toggles = buttons.filter((b) => /^mark set complete/i.test(label(b)));
      const toggle = toggles.find((b) => inFrameX(b));
      if (toggle && hitOk(toggle)) {
        toggle.click();
        return `advanced-toggle:left-${toggles.length}`;
      }
      const anyToggle = Array.from(document.querySelectorAll('button')).find(
        (b) => /^mark set complete/i.test(label(b as HTMLElement)) && inFrameX(b as HTMLElement),
      );
      if (anyToggle) {
        anyToggle.scrollIntoView({ block: 'center' });
        return 'scrolled-to-toggle';
      }
      // 5) Advanced view: an exercise-complete card ("Bench Press
      // Complete!") gates progression behind a Next Exercise action.
      const nextEx = buttons.find(
        (b) => (/^next exercise/i.test(label(b)) || /^next:/i.test(label(b))) && hitOk(b),
      );
      if (nextEx) {
        nextEx.click();
        return `next-exercise:${label(nextEx).slice(0, 24)}`;
      }
      return null;
    });
    if (!clicked) {
      nulls += 1;
      if (nulls >= 5) break;
      await page.waitForTimeout(900);
      continue;
    }
    nulls = 0;
    run.taps += 1;
    repeats = clicked === lastClicked ? repeats + 1 : 0;
    lastClicked = clicked;
    if (repeats >= 3) {
      // Advanced end-state: after the final exercise the Next
      // Exercise button stays visible but inert — that is loop-end,
      // not a stuck state; the caller's assertions verify the save.
      if (clicked.startsWith('next-exercise:')) break;
      throw new Error(`set loop stuck repeating "${clicked}"`);
    }
    await page.waitForTimeout(
      clicked === 'complete-set' || clicked.startsWith('advanced-toggle') || clicked === 'next-exercise' ? 900 : 350,
    );
  }
}

/**
 * Clicks the visible, hit-testable Finish entry (with all sets
 * done the header Finish hides and an in-flow promoted primary
 * appears — R8 contract), then dismisses the summary / Coach's
 * Take sheet if one opens. Returns the store counts afterwards.
 */
export async function finishWorkout(page: Page, run: PersonaRun): Promise<void> {
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(
      (x) =>
        /dismiss set complete/i.test(x.getAttribute('aria-label') ?? '') ||
        (x.getAttribute('aria-label') ?? '') === 'बंद करें',
    );
    b?.click();
  });
  await page.waitForTimeout(400);
  const clickedFinish = await page.evaluate(() => {
    const label = (b: Element) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim();
    const cands = Array.from(document.querySelectorAll('button')).filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (/finish/i.test(label(b)) || /समाप्त/.test(label(b)));
    });
    for (const b of cands) {
      const r = b.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (t && (t === b || b.contains(t))) {
        b.click();
        return label(b);
      }
    }
    return null;
  });
  run.taps += 1;
  if (!clickedFinish) {
    await run.tap(page.getByRole('button', { name: /finish workout|वर्कआउट समाप्त/i }).first());
  }
  await page.waitForTimeout(1_200);
  // Advanced view: header Finish opens a session-summary sheet whose
  // confirm is "Save & Finish" (Resume would return to the session).
  const saveFinish = page.getByRole('button', { name: /save & finish/i });
  if (await saveFinish.isVisible().catch(() => false)) await run.tap(saveFinish);
  await page.waitForTimeout(800);
  const anyway = page.getByRole('button', { name: /finish anyway|end workout|फिर भी समाप्त/i });
  if (await anyway.isVisible().catch(() => false)) await run.tap(anyway);
  await page.waitForTimeout(1_000);
  for (const name of [/^done$/i, /^close$/i, /^हो गया$/, /^बंद करें$/]) {
    const btn = page.getByRole('button', { name }).first();
    if (await btn.isVisible().catch(() => false)) {
      await run.tap(btn);
      break;
    }
  }
  await page.waitForTimeout(600);
}
