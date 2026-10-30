/**
 * Audit-3 P3 batch — frontend fixes.
 *
 * Semantic tests pin the BEHAVIOUR of the two logic fixes that live in
 * shared machinery (FE-09 canonical streak, FE-18 trailing window) and
 * the new i18n strings (FE-13/17/20 via translate()). The remaining
 * findings are component wiring (which definition/hook/key a component
 * uses) — pinned at source level following the codebase's wiring-test
 * precedent (follower-delete-guard-wiring.test.ts). LIMIT: wiring tests
 * assert the wiring exists, not live rendered output.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { buildActiveDays, calculateStreak } from '../src/lib/streak-freeze';
import { getWeekDateStrings, getLocalTodayStr } from '../src/lib/formatters';
import { translate } from '../src/lib/i18n';
import type { WorkoutEntry, MealEntry, WorkoutSet } from '../src/lib/types';

function src(rel: string): string {
  return readFileSync(join(process.cwd(), 'src', rel), 'utf8');
}

const set = (overrides: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({ reps: 10, unit: 'kg', ...overrides } as WorkoutSet);
const w = (id: string, date: string): WorkoutEntry =>
  ({ id, date, exercises: [{ name: 'Squat', sets: [set({ completed: true })] }] } as WorkoutEntry);
const m = (id: string, date: string, name = 'Lunch'): MealEntry =>
  ({ id, date, name, foods: [{ name: 'Rice', calories: 200, proteinG: 4, carbsG: 44, fatG: 0 }] } as MealEntry);

// ── FE-09: the canonical (Home) streak definition Progress now shares ──────

describe('audit3 FE-09: canonical streak counts meals-only days', () => {
  const TODAY = '2026-10-30';
  // Workouts Wed + Fri(today); Thu is a 3-meal day with NO workout.
  const workouts = [w('a', '2026-10-28'), w('b', '2026-10-30')];
  const meals = [m('1', '2026-10-29', 'Breakfast'), m('2', '2026-10-29', 'Lunch'), m('3', '2026-10-29', 'Dinner')];

  it('buildActiveDays includes the meals-only day', () => {
    const active = buildActiveDays(workouts, meals);
    expect(active).toEqual(['2026-10-28', '2026-10-29', '2026-10-30']);
  });

  it('canonical streak is 3 where the old Progress workout-only loop gave 1', () => {
    const streak = calculateStreak({
      dailyActivity: buildActiveDays(workouts, meals),
      freezesAvailable: 0,
      todayStr: TODAY,
    });
    expect(streak.currentStreak).toBe(3);
  });

  it('Progress is wired to the same machinery (and the old loop is gone)', () => {
    const s = src('components/ProgressPage.tsx');
    expect(s).toContain('buildActiveDays(normalizedWorkouts, meals)');
    expect(s).toContain('calculateStreak({');
    expect(s).not.toContain('while (streakDays < 365)');
  });
});

// ── FE-18: trailing 7-day window math ───────────────────────────────────────

describe('audit3 FE-18: trailing window has no future days', () => {
  const monday = new Date(2026, 9, 26); // Mon 26 Oct 2026
  const trailing = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() - (6 - i));
    return getLocalTodayStr(d);
  });

  it('spans today + previous 6 days, oldest first', () => {
    expect(trailing[0]).toBe('2026-10-20');
    expect(trailing[6]).toBe('2026-10-26');
    expect(trailing).toHaveLength(7);
  });

  it('the old Mon–Sun week for the same Monday DOES contain future days', () => {
    const week = getWeekDateStrings(monday);
    expect(week[6]).toBe('2026-11-01'); // Sunday of that week — in the future
    expect(trailing).not.toContain('2026-11-01');
  });

  it('Progress builds dayBars from the trailing window', () => {
    const s = src('components/ProgressPage.tsx');
    expect(s).toContain('getDate() - (6 - i)');
  });
});

// ── FE-19 / FE-11 / FE-12 / FE-21 / FE-22 / FE-08 / FE-10: wiring ──────────

describe('audit3 FE-19: useToday rollover hook adopted', () => {
  it('Progress uses useToday', () => {
    const s = src('components/ProgressPage.tsx');
    expect(s).toContain("from '@/lib/use-today'");
    expect(s).toContain('const todayStr = useToday();');
  });
  it('MealsPage uses useToday for todayDate', () => {
    const s = src('components/MealsPage.tsx');
    expect(s).toMatch(/const todayDate\s+=\s+useToday\(\);/);
  });
  it('CoachChatTab uses useToday', () => {
    const s = src('components/CoachChatTab.tsx');
    expect(s).toContain('const todayStr = useToday();');
  });
});

describe('audit3 FE-11: one kg default at every unit read site', () => {
  it("no `|| 'lbs'` fallback remains in the audited components", () => {
    for (const f of ['components/ProfileView.tsx', 'components/ProgressPage.tsx', 'components/EditProfileModal.tsx', 'components/SettingsView.tsx']) {
      expect(src(f)).not.toContain("|| 'lbs'");
    }
  });
});

describe('audit3 FE-12/21/22/08/10: Home + Settings wiring', () => {
  it('FE-12: Settings sheet titles include the quote section', () => {
    expect(src('components/SettingsView.tsx')).toContain("quote: t('home.quote')");
  });
  it('FE-21: no invented names remain (Alex / Athlete seeds)', () => {
    expect(src('components/HomePage.tsx')).not.toContain("return 'Alex'");
    expect(src('components/ProfileView.tsx')).not.toContain(": 'Alex'");
    expect(src('components/Onboarding.tsx')).not.toContain("|| 'Athlete'");
    expect(src('components/Onboarding.tsx')).not.toContain("setAthleteName('Athlete')");
    expect(src('lib/store.ts')).not.toContain("sanitizeAthleteName('Athlete'");
    expect(src('lib/supabase/sync.ts')).not.toContain("|| 'Athlete'");
  });
  it('FE-21: Home keeps the stored name casing (no forced title-case)', () => {
    expect(src('components/HomePage.tsx')).not.toContain('slice(1).toLowerCase()');
  });
  it('FE-22: completed-workout modal opens the FIRST of today (same as the card)', () => {
    expect(src('components/HomePage.tsx')).toContain('return todayWks[0] || null;');
  });
  it('FE-08: the fabricated 6-exercise fallback is gone', () => {
    const s = src('components/HomePage.tsx');
    expect(s).not.toContain('exerciseCount * 8');
    expect(s).toContain("t('home.durationOnly'");
  });
  it('FE-10: consistency displays are capped', () => {
    const s = src('components/ProgressPage.tsx');
    expect(s).toContain('Math.min(consistencyStats.consistencyPct, 100)');
    expect(s).toContain('Math.min(consistencyStats.fourWeeksCompleted, consistencyStats.fourWeeksTarget)');
  });
});

// ── FE-13/14/15/16/17: localization wiring + string checks ─────────────────

describe('audit3 FE-13/14/15/16/17: localized strings', () => {
  it('FE-13: pacing verdicts localized, incl. the safe-minimum warning', () => {
    const s = src('components/MealsPage.tsx');
    expect(s).toContain("t('meals.pacingBelowSafeBadge')");
    expect(s).not.toContain("'Target Below Safe Minimum'");
    expect(translate('hi', 'meals.pacingBelowSafeBadge')).toContain('सुरक्षित');
  });

  it('FE-14: Train delete/history strings localized', () => {
    const s = src('components/WorkoutPage.tsx');
    expect(s.split("t('workout.deletePlanTitle')").length - 1).toBe(2);
    expect(s).not.toContain('Delete this plan?');
    expect(s).toContain("t('workout.deleteWorkout')");
    expect(s).toContain("t('workout.viewAllWorkouts'");
  });

  it('FE-15: Progress status + week labels localized', () => {
    const s = src('components/ProgressPage.tsx');
    expect(s).not.toContain("'Week 4 (Current)'");
    expect(s).toContain("t('progress.weekNCurrent'");
    expect(s).toContain("t('progress.noData')");
    expect(translate('en', 'progress.weekNCurrent', { n: 4 })).toBe('Week 4 (Current)');
  });

  it('FE-16: onboarding details localized + themed error banner', () => {
    const s = src('components/onboarding/PersonalDetailsScreen.tsx');
    expect(s).toContain("t('onboarding.errNameRequired')");
    expect(s).toContain("t('onboarding.calibrating')");
    expect(s).not.toContain('Calibrating Program...');
    expect(s).not.toContain('bg-red-50');
    expect(s).toContain('bg-danger/10');
  });

  it('FE-17: plan-offer + food-target card localized, incl. diabetes caution', () => {
    const s = src('components/Onboarding.tsx');
    expect(s).toContain("t('onboarding.foodTargetDiabetesCaution')");
    expect(s).not.toContain('Your daily food target:');
    expect(translate('hi', 'onboarding.foodTargetDiabetesCaution')).toContain('मधुमेह');
    expect(translate('en', 'onboarding.foodTargetTitle', { calories: '2,200' })).toBe('Your daily food target: 2,200 kcal');
  });
});

// ── FE-20: singular/plural keys ─────────────────────────────────────────────

describe('audit3 FE-20: pluralization', () => {
  it('singular keys render the singular noun', () => {
    expect(translate('en', 'home.durationExercisesOne', { min: 45, count: 1 })).toBe('45 min • 1 exercise');
    expect(translate('en', 'home.durationExercises', { min: 45, count: 6 })).toBe('45 min • 6 exercises');
    expect(translate('en', 'lib.foundOne', { count: 1 })).toBe('1 exercise found');
    expect(translate('en', 'lib.found', { count: 2 })).toBe('2 exercises found');
    expect(translate('en', 'sched.planOptionOne', { name: 'Push', count: 1 })).toBe('Push (1 exercise)');
    expect(translate('en', 'profile.exercisesCountOne', { count: 1 })).toBe('1 exercise');
  });
  it('call sites pick the One key at count === 1', () => {
    expect(src('components/ExerciseLibraryModal.tsx')).toContain("'lib.foundOne'");
    expect(src('components/WeeklyScheduleModal.tsx')).toContain("'sched.planOptionOne'");
    expect(src('components/LogPastWorkoutModal.tsx')).toContain("'lp.planOptionOne'");
    expect(src('components/PolicyDecisionCard.tsx')).toContain("'pdc.planOptionOne'");
    expect(src('components/ProfileView.tsx')).toContain("'profile.exercisesCountOne'");
  });
});
