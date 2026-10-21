/**
 * QA4 Batch 7 — Tail sweep regression tests.
 * Each describe block pins one defect from ASCEND_QA_AUDIT_ROUND4 §6 /
 * the fix-loop backlog rescan log so it cannot silently return.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  getGoalAdaptiveSplitTemplates,
  createWorkoutExercisesFromPlan,
  finalizeWorkoutSet,
  finalizeWorkoutExercises,
} from '../src/lib/workout-engine';
import { useStore, partializeAppState } from '../src/lib/store';
import type { PlannedWorkout } from '../src/lib/types';
import { validateBodyMetricsForm } from '../src/components/BodyMetricsModal';

const readSrc = (rel: string) =>
  fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');

/* ── QA4-021: beginner pull-up bypass via split templates ─────────────── */
describe('QA4-021 beginner templates regress pull-ups (not just load-scale)', () => {
  it('a beginner never receives raw Pull-ups from adaptive split templates', () => {
    for (const goal of ['build_muscle', 'get_stronger', 'lose_fat', 'general_fitness'] as const) {
      const plans = getGoalAdaptiveSplitTemplates(goal, 'kg', {
        bodyweightKg: 62,
        experience: 'beginner',
      });
      const names = plans.flatMap((p) => p.exercises.map((e) => e.name));
      expect(names).not.toContain('Pull-ups');
      expect(names).toContain('Lat Pulldown');
    }
  });

  it('an intermediate keeps Pull-ups (regression is beginner-only)', () => {
    const plans = getGoalAdaptiveSplitTemplates('build_muscle', 'kg', {
      bodyweightKg: 85,
      experience: 'intermediate',
    });
    const names = plans.flatMap((p) => p.exercises.map((e) => e.name));
    expect(names).toContain('Pull-ups');
  });

  it('a minor is regressed even when declared intermediate', () => {
    const plans = getGoalAdaptiveSplitTemplates('build_muscle', 'kg', {
      bodyweightKg: 55,
      experience: 'intermediate',
      ageYears: 16,
    });
    const names = plans.flatMap((p) => p.exercises.map((e) => e.name));
    expect(names).not.toContain('Pull-ups');
  });

  it('no athlete context keeps the raw templates unchanged', () => {
    const plans = getGoalAdaptiveSplitTemplates('build_muscle', 'kg');
    const names = plans.flatMap((p) => p.exercises.map((e) => e.name));
    expect(names).toContain('Pull-ups');
  });
});

/* ── QA4-022: fabricated RPE-8 residuals ───────────────────────────────── */
describe('QA4-022 unrated sets stay unrated (no invented RPE 8)', () => {
  const plan: PlannedWorkout = {
    id: 'plan_rpe',
    name: 'RPE Plan',
    createdAt: '2026-01-01',
    exercises: [
      { name: 'Bench Press', targetSets: 2, targetReps: 8, targetWeight: 60, targetUnit: 'kg' },
      { name: 'Barbell Row', targetSets: 1, targetReps: 8, targetWeight: 50, targetUnit: 'kg', targetRpe: 7.5 },
    ],
  };

  it('plan->workout draft leaves rpe undefined when the plan configures none', () => {
    const [bench, row] = createWorkoutExercisesFromPlan(plan, { userUnit: 'kg' });
    for (const s of bench.sets) {
      expect(s.rpe).toBeUndefined();
      expect(s.prescribedRpe).toBeUndefined();
    }
    // A configured targetRpe is still honored exactly.
    expect(row.sets[0].rpe).toBe(7.5);
    expect(row.sets[0].prescribedRpe).toBe(7.5);
  });

  it('the named fabrication sites are gone from the components', () => {
    const aws = readSrc('src/components/ActiveWorkoutScreen.tsx');
    expect(aws).not.toContain('result.rpe ?? 8');
    expect(aws).not.toContain('rpe || 8}');
    const wp = readSrc('src/components/WorkoutPage.tsx');
    expect(wp).not.toContain('rpe: s.rpe || 8');
    expect(wp).not.toContain('prescribedRpe: s.rpe || 8');
  });
});

/* ── QA4-026: typed negative set values never persist ─────────────────── */
describe('QA4-026 finalize clamps negative/NaN-adjacent set values', () => {
  it('finalizeWorkoutSet clamps negative weight and reps to 0', () => {
    const out = finalizeWorkoutSet({
      weight: -20,
      reps: -5,
      unit: 'kg',
      completed: true,
      status: 'completed',
    } as any);
    expect(out.weight).toBe(0);
    expect(out.reps).toBe(0);
    expect(out.completed).toBe(false);
  });

  it('finalizeWorkoutSet clamps negative string values too', () => {
    const out = finalizeWorkoutSet({
      weight: '-20',
      reps: '-3',
      unit: 'kg',
      completed: true,
      status: 'completed',
    } as any);
    expect(out.weight).toBe(0);
    expect(out.reps).toBe(0);
  });

  it('finalized exercises carry no negative volume inputs', () => {
    const { validExercises } = finalizeWorkoutExercises([
      {
        name: 'Squat',
        sets: [{ weight: -50, reps: 5, unit: 'kg', completed: true, status: 'completed' } as any],
      },
    ]);
    const s = validExercises[0].sets[0];
    expect(s.weight).toBeGreaterThanOrEqual(0);
    expect(s.reps).toBeGreaterThanOrEqual(0);
  });

  it('the typed-input handlers clamp at the source', () => {
    const aws = readSrc('src/components/ActiveWorkoutScreen.tsx');
    expect(aws).toContain('Math.max(0, numericWeight)');
    expect(aws).toContain('Math.max(0, Math.floor(parsed))');
  });
});

/* ── QA4-023: pre-made templates removed from Train ───────────────────── */
describe('QA4-023 Train shows only user plans', () => {
  it('WorkoutPage has no Browse Pre-made button or ready-made template dropdown', () => {
    const wp = readSrc('src/components/WorkoutPage.tsx');
    expect(wp).not.toContain('Browse Pre-made');
    expect(wp).not.toContain('READY-MADE SPLIT TEMPLATES');
    expect(wp).not.toContain('Browse ready-made splits');
    expect(wp).not.toContain('adaptiveSplitTemplates');
  });

  it('the orphaned hiddenBuiltinRoutineIds store slice is removed', () => {
    const store = readSrc('src/lib/store.ts');
    expect(store).not.toContain('hiddenBuiltinRoutineIds');
    expect(store).not.toContain('hideBuiltinRoutine');
    const state = useStore.getState() as any;
    expect(state.hiddenBuiltinRoutineIds).toBeUndefined();
    const persisted = partializeAppState(useStore.getState()) as Record<string, unknown>;
    expect('hiddenBuiltinRoutineIds' in persisted).toBe(false);
  });
});

/* ── QA4-024: residual UTC date keys ──────────────────────────────────── */
describe('QA4-024 local date keys (no UTC day-shift)', () => {
  it('the four named sites use the local-date helper', () => {
    const store = readSrc('src/lib/store.ts');
    expect(store).not.toContain("const today = new Date().toISOString().split('T')[0];");
    expect(store).not.toContain('targetDate || new Date().toISOString()');
    const meals = readSrc('src/components/MealsPage.tsx');
    expect(meals).not.toContain('y.toISOString().slice(0, 10)');
    expect(meals).toContain('getLocalTodayStr(y)');
    const take = readSrc('src/components/PostWorkoutTakeModal.tsx');
    expect(take).not.toContain("new Date().toISOString().split('T')[0]");
    expect(take).toContain('getLocalTodayStr()');
  });
});

/* ── QA4-028: double-submit asymmetry ─────────────────────────────────── */
describe('QA4-028 addMeal idempotency + workout finish guard', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('adding the same meal id twice stores it once and pays XP once', () => {
    const meal: any = {
      id: 'meal_dup_1',
      date: '2026-10-21',
      name: 'Lunch',
      foods: [{ name: 'Rice', quantity: 100, unit: 'g', calories: 130, proteinG: 3, carbsG: 28, fatG: 0 }],
    };
    const xpBefore = useStore.getState().xp.totalXp;
    useStore.getState().addMeal(meal);
    useStore.getState().addMeal(meal);
    const meals = useStore.getState().meals.filter((m) => m.id === 'meal_dup_1');
    expect(meals).toHaveLength(1);
    const xpAfter = useStore.getState().xp.totalXp;
    // Second add must not pay again: XP gain equals a single meal award.
    useStore.getState().clearAllData();
    useStore.getState().addMeal(meal);
    const singleGain = useStore.getState().xp.totalXp - xpBefore;
    expect(xpAfter - xpBefore).toBe(singleGain);
  });

  it('the finish handler has an in-flight guard and the button disables', () => {
    const aws = readSrc('src/components/ActiveWorkoutScreen.tsx');
    expect(aws).toContain('isFinishingRef');
    expect(aws).toContain('if (isFinishingRef.current) return;');
    expect(aws).toContain('disabled={isFinishing}');
  });
});

/* ── QA4A-009: import drops dietPreference ────────────────────────────── */
describe('QA4A-009 backup import preserves dietPreference', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('a validated profile round-trips dietPreference', () => {
    const ok = useStore.getState().importAllData({
      profile: {
        id: 'user_1',
        name: 'Athlete',
        gender: 'male',
        bodyweightKg: 80,
        bodyweightLbs: 176,
        unit: 'kg',
        dietPreference: 'vegetarian',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(ok).toBe(true);
    expect(useStore.getState().profile?.dietPreference).toBe('vegetarian');
  });

  it('an invalid dietPreference value is dropped, not imported verbatim', () => {
    useStore.getState().importAllData({
      profile: {
        id: 'user_1',
        name: 'Athlete',
        gender: 'male',
        bodyweightKg: 80,
        unit: 'kg',
        dietPreference: 'carnivore-plus',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(useStore.getState().profile?.dietPreference).toBeUndefined();
  });
});

/* ── QA4-025: BodyMetricsModal silent validation failures ─────────────── */
describe('QA4-025 body metrics validation surfaces errors (no silent drops)', () => {
  const base = { weight: '80', height: '175', bodyFat: '', chest: '', waist: '', hips: '', unit: 'kg' as const };

  it('accepts a valid form and converts units', () => {
    const r = validateBodyMetricsForm({ ...base, bodyFat: '15', chest: '100' });
    expect(r.errors).toEqual({});
    expect(r.values?.weightKg).toBe(80);
    expect(r.values?.heightCm).toBe(175);
    expect(r.values?.bodyFatPct).toBe(15);
    expect(r.values?.chestIn).toBeCloseTo(100 / 2.54, 5);
  });

  it('rejects weight outside the onboarding 30–300 kg bounds', () => {
    for (const w of ['10', '29.9', '300.1', '500', 'abc', '']) {
      const r = validateBodyMetricsForm({ ...base, weight: w });
      expect(r.values).toBeUndefined();
      expect(r.errors.weight).toMatch(/30 kg and 300 kg/);
    }
  });

  it('enforces the bounds after lbs→kg conversion too', () => {
    expect(validateBodyMetricsForm({ ...base, unit: 'lbs', weight: '60' }).errors.weight).toBeTruthy();
    const ok = validateBodyMetricsForm({ ...base, unit: 'lbs', weight: '176', height: '69' });
    expect(ok.errors).toEqual({});
    expect(ok.values?.weightKg).toBeCloseTo(176 * 0.453592, 5);
    expect(ok.values?.heightCm).toBe(175); // 69in = 175.26cm
  });

  it('an entered out-of-range height errors instead of silently falling back', () => {
    const r = validateBodyMetricsForm({ ...base, height: '90' });
    expect(r.values).toBeUndefined();
    expect(r.errors.height).toMatch(/100 cm and 250 cm/);
  });

  it('blank optional fields stay valid (not measured ≠ invalid)', () => {
    const r = validateBodyMetricsForm({ ...base, height: '', bodyFat: '', chest: '', waist: '', hips: '' });
    expect(r.errors).toEqual({});
    expect(r.values?.heightCm).toBeUndefined();
    expect(r.values?.bodyFatPct).toBeUndefined();
  });

  it('body fat ≥70 errors instead of being silently dropped', () => {
    const r = validateBodyMetricsForm({ ...base, bodyFat: '75' });
    expect(r.values).toBeUndefined();
    expect(r.errors.bodyFat).toMatch(/below 70%/);
  });

  it('a non-positive circumference errors instead of being silently dropped', () => {
    const r = validateBodyMetricsForm({ ...base, waist: '-5' });
    expect(r.values).toBeUndefined();
    expect(r.errors.waist).toBeTruthy();
  });
});
