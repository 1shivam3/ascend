/**
 * Pre-PR live-fix round (2026-10-25): regression pins for the defects
 * found by real browser verification on the feat/ux-redesign preview
 * (qa-results.md §3/§6, L1–L9 + L12).
 *
 * Most pins are static source checks — the same technique as the Stage
 * 1–10 suite — because the defects are flow/wiring defects (a handler
 * applying state too early, a label naming the wrong thing), not
 * arithmetic. Where the logic is pure (L8 exactness, L6 counting) the
 * tests are runtime tests; L6's live in tests/coach-engine.test.ts.
 * Live re-verification of the fixes themselves is a later parent-run
 * phase — nothing here claims a browser saw the fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isExactFoodItem, foodsAllExact, tildeForFoods } from '../src/lib/meal-display';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

/** Body of `const NAME = ... => { ... }` up to the next top-level const. */
function handlerBody(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = `);
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start);
  // Next handler at the same indent level ends this one.
  const next = rest.indexOf('\n  const ', 10);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('L8 exact/~ honesty (runtime)', () => {
  it('an exact food (no flags) is exact', () => {
    expect(isExactFoodItem({})).toBe(true);
    expect(isExactFoodItem({ isUnmatched: false, isApproximateMatch: false })).toBe(true);
  });

  it('unmatched and approximate foods are not exact', () => {
    expect(isExactFoodItem({ isUnmatched: true })).toBe(false);
    expect(isExactFoodItem({ isApproximateMatch: true })).toBe(false);
  });

  it('a meal total is exact iff every food is exact (and non-empty)', () => {
    expect(foodsAllExact([{ }, { }])).toBe(true);
    expect(foodsAllExact([{ }, { isApproximateMatch: true }])).toBe(false);
    expect(foodsAllExact([{ isUnmatched: true }])).toBe(false);
    expect(foodsAllExact([])).toBe(false);
  });

  it('tilde prefixes exactly the non-exact totals', () => {
    expect(tildeForFoods([{}, {}])).toBe('');
    expect(tildeForFoods([{}, { isUnmatched: true }])).toBe('~');
    expect(tildeForFoods([])).toBe('~');
  });

  it('MealsPage renders the rule at every number site', () => {
    const meals = src('src/components/MealsPage.tsx');
    expect(meals).toContain('tildeForFoods(meal.foods)');
    expect(meals).toContain('isExactFoodItem(food)');
    expect(meals).toContain('tildeForFoods(todayMeals.flatMap((m) => m.foods))');
    expect(meals).toContain('tildeForFoods(foods)');
    expect(meals).toContain("t('common.estimatedShort')");
  });

  it('toasts pass the tilde instead of hardcoding it', () => {
    const meals = src('src/components/MealsPage.tsx');
    expect(meals).toContain('tilde: tildeForFoods(cleanedFoods)');
    expect(meals).toContain('tilde: tildeForFoods(data.foods)');
    expect(meals).toContain('tilde: tildeForFoods(offlineFoods)');
    const scan = src('src/components/ScanMealModal.tsx');
    expect(scan).toContain('tilde: tildeForFoods(validFoods)');
    const en = src('src/lib/i18n/en.ts');
    const hi = src('src/lib/i18n/hi.ts');
    for (const key of ['toast.mealAdded', 'toast.mealLoggedQuickOne', 'toast.mealLoggedQuickMany', 'scan.mealLogged']) {
      expect(en).toContain(key);
      expect(hi).toContain(key);
      // The template must interpolate {tilde}, not a literal "~".
      const enLine = en.split('\n').find((l) => l.includes(`'${key}'`));
      expect(enLine).toContain('{tilde}');
      expect(enLine).not.toContain('~{');
    }
  });
});

describe('L1 summary screen ordering (static)', () => {
  it('Accept/Decline do not apply the profile before the summary', () => {
    const ob = src('src/components/Onboarding.tsx');
    expect(handlerBody(ob, 'handleAcceptPlans')).not.toContain('applyPendingProfile()');
    expect(handlerBody(ob, 'handleDeclinePlans')).not.toContain('applyPendingProfile()');
    expect(handlerBody(ob, 'handleAcceptPlans')).toContain("setCurrentScreen('summary')");
    expect(handlerBody(ob, 'handleDeclinePlans')).toContain("setCurrentScreen('summary')");
  });

  it('the no-plan branch stages the profile instead of applying it', () => {
    const ob = src('src/components/Onboarding.tsx');
    const finish = handlerBody(ob, 'handleFinishCalibration');
    // The summary screen itself must be reachable from the else branch…
    expect(finish).toContain("setCurrentScreen('summary')");
    // …but the profile must NOT be applied there (that unmounts
    // Onboarding via the page.tsx gate and the summary never paints).
    expect(finish).not.toContain('applyProfileWithAgeGuards(profileData)');
  });

  it('Continue and Edit apply the staged profile', () => {
    const ob = src('src/components/Onboarding.tsx');
    expect(handlerBody(ob, 'completeOnboarding')).toContain('applyPendingProfile()');
    expect(handlerBody(ob, 'handleSummaryEdit')).toContain('applyPendingProfile()');
  });

  it('the summary reads goal/diet from the staged profile first', () => {
    const ob = src('src/components/Onboarding.tsx');
    expect(ob).toContain('pendingProfile?.goals ?? profile?.goals');
    expect(ob).toContain('pendingProfile?.dietPreference ?? profile?.dietPreference');
  });
});

describe('L3 experience label (static)', () => {
  it('the Settings row names the workout view, not athlete experience', () => {
    const sv = src('src/components/SettingsView.tsx');
    expect(sv).toContain("t('workout.viewMode')");
    expect(sv).not.toContain("t('settings.experience')");
    // The mode toast names the same control (no "calibrated experience").
    expect(sv).toContain("`${t('workout.viewMode')}:");
  });

  it('density switching writes only density (no experience key exists to flip)', () => {
    const store = src('src/lib/store.ts');
    // The UI-preference slice carries density + workoutModeOverride but
    // no experience field at all — there is nothing a density switch
    // could overwrite. (Experience is not a stored concept.)
    expect(store).not.toMatch(/experienceLevel\s*:/);
    expect(store).not.toMatch(/athleteExperience\s*:/);
  });
});

describe('L2 habit matrix label (static)', () => {
  it('the homepage slot renders the matrix, not a today-only column', () => {
    const home = src('src/components/HomePage.tsx');
    expect(home).toContain('<HomeMatrix');
    // The today-only mode is gone by design (user order): the slot is
    // the weekly/monthly matrix, so no today label can lie about it.
    expect(home).not.toContain('todayOnly');
    expect(home).not.toContain("t('home.habitsToday')");
  });

  it('the matrix labels its range honestly (week range / month name)', () => {
    const mx = src('src/components/HomeMatrix.tsx');
    expect(mx).toContain('weekLabel');
    expect(mx).toContain('monthLabel');
  });

  it('single-day matrix cells are fixed-width, not stretched', () => {
    const mx = src('src/components/WeeklyHabitMatrix.tsx');
    expect(mx).toContain('singleDay');
    expect(mx).toContain("'w-10 shrink-0'");
  });
});

describe('L4 rest timer (static)', () => {
  it('pill and overlay idle displays share the single preset source', () => {
    const aw = src('src/components/ActiveWorkoutScreen.tsx');
    expect(aw).toContain('restSecondsLeft > 0 ? restSecondsLeft : defaultRestDuration');
    // The stale second source is gone entirely.
    expect(aw).not.toContain('restTotalSeconds');
  });

  it('the pill hides while the Set Complete overlay is open', () => {
    const aw = src('src/components/ActiveWorkoutScreen.tsx');
    // Micro-fix L4 (round 2): the guard gained the popover condition —
    // the pill is the collapsed timer, so it also hides while the
    // popover (which now carries the countdown) is open.
    expect(aw).toContain('Micro-fix L4 (round 2): one timer UI at a time');
    expect(aw).toContain('{!completedSetSummary && !isRestPopoverOpen && (');
  });

  it('Escape and X dismiss the overlay and pause the timer', () => {
    const aw = src('src/components/ActiveWorkoutScreen.tsx');
    expect(aw).toContain('dismissSetComplete');
    expect(aw).toContain("e.key === 'Escape'");
    expect(aw).toContain('restTargetEndTimeRef.current = null');
    expect(aw).toContain('setIsRestRunning(false)');
    expect(aw).toContain('onClick={dismissSetComplete}');
  });

  it('the overlay covers the full viewport (no centered max-w strip)', () => {
    const aw = src('src/components/ActiveWorkoutScreen.tsx');
    expect(aw).toContain('fixed inset-0 z-50 bg-[#171916] text-[#F3F0E7] flex flex-col justify-between p-6 animate-fade-in"');
    expect(aw).not.toContain('animate-fade-in max-w-md mx-auto');
  });
});

describe('L5 train plan cards (static)', () => {
  it('the plan list is single-column and names keep full titles', () => {
    const wp = src('src/components/WorkoutPage.tsx');
    expect(wp).toContain('grid grid-cols-1 gap-3');
    expect(wp).not.toContain('sm:grid-cols-2 gap-3');
    expect(wp).toContain('title={ex.name');
  });
});

describe('L7 accent tokens (static)', () => {
  it('no hardcoded accent hex remains in the converted components', () => {
    for (const p of [
      'src/components/ActiveWorkoutScreen.tsx',
      'src/components/WorkoutDetailsView.tsx',
      'src/components/PostWorkoutTakeModal.tsx',
    ]) {
      const s = src(p);
      expect(s).not.toContain('#E44427');
      expect(s).not.toContain('#c9361e');
      expect(s).not.toContain('#d03b20');
    }
  });

  it('converted buttons use accent tokens with the audited on-color', () => {
    const aw = src('src/components/ActiveWorkoutScreen.tsx');
    expect(aw).toContain('bg-accent text-accent-on');
    expect(aw).toContain('hover:bg-accent-dim');
    expect(aw).toContain('shadow-accent/25');
  });

  it('the muscle-volume legend uses swatches, not the word Orange', () => {
    const mv = src('src/components/MuscleVolumeSection.tsx');
    expect(mv).not.toContain('Orange = this week');
    expect(mv).toContain('bg-accent');
    expect(mv).toContain('this week');
  });
});

describe('L9 clipping/overlap (static)', () => {
  it('the Settings jump row wraps on desktop and fades on mobile', () => {
    const sv = src('src/components/SettingsView.tsx');
    expect(sv).toContain('sm:flex-wrap sm:overflow-visible');
    expect(sv).toContain('max-sm:[mask-image:linear-gradient(to_right,black_88%,transparent)]');
  });

  it('the favorites row wraps chips instead of scrolling with a mask', () => {
    // Micro-fix L9b (round 2): the L9 scroll+mask still truncated the
    // edge chip in the initial view — scrollable is not visible. Wrap
    // is the honest fix in this narrow dialog.
    const meals = src('src/components/MealsPage.tsx');
    expect(meals).toContain('flex flex-wrap gap-1.5');
    expect(meals).not.toContain('overflow-x-auto pb-1 pr-2 scrollbar-none');
    expect(meals).not.toContain('[mask-image:linear-gradient(to_right,black_92%,transparent)]');
  });

  it('toasts sit above the bottom nav, never over headings', () => {
    const toast = src('src/components/ui/Toast.tsx');
    expect(toast).toContain('fixed bottom-24');
    expect(toast).not.toContain('fixed top-3');
  });
});

describe('L12 focus visibility (static)', () => {
  it('a global unlayered :focus-visible rule beats outline-none sites', () => {
    const css = src('src/app/globals.css');
    expect(css).toContain(':focus-visible {');
    expect(css).toContain('outline: 2px solid rgb(var(--accent))');
    expect(css).toContain('outline-offset: 2px');
  });

  it('modals restore focus to the remembered element on close', () => {
    const a11y = src('src/lib/use-modal-a11y.ts');
    expect(a11y).toContain('previouslyFocusedRef');
    expect(a11y).toContain('.focus()');
  });
});
