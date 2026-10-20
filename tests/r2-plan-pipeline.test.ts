/**
 * Round-2 persona regression tests — plan generation pipeline.
 *
 * Each test reproduces a failure the round-2 reviewers VERIFIED by running
 * the real pipeline (Arjun's excluded deadlift variant, Neha's home
 * pull-ups / Close-Grip-Bench / machine cardio, Simran's day-one volume,
 * Aryan's minor loads, Kavya's plyo progression).
 */
import { describe, it, expect } from 'vitest';
import {
  adaptExerciseForEquipment,
  adaptSplitForEquipment,
  prepareGeneratedPlans,
  getNextSessionTarget,
  getProgressionRecommendation,
  getFilteredSubstitutes,
  normalizeExerciseKey,
  exerciseMatchesExclusion,
  getMovementFamily,
  exerciseHadPain,
} from '../src/lib/workout-engine';
import { limitPlansToDays } from '../src/lib/workout-schedule';
import type { PlannedWorkout, WorkoutEntry } from '../src/lib/types';

const plan = (exercises: PlannedWorkout['exercises']): PlannedWorkout[] => [
  { id: 'p1', name: 'Test Day', createdAt: '2026-01-01', exercises },
];
const ex = (name: string, targetWeight = 60, targetSets = 3, targetReps = 8) => ({
  name,
  targetSets,
  targetReps,
  targetWeight,
  targetUnit: 'kg' as const,
});
const names = (plans: PlannedWorkout[]) => plans.flatMap((p) => p.exercises.map((e) => e.name));

describe('normalized exclusions (ARJUN-3)', () => {
  it('equipment prefixes and abbreviations share one key', () => {
    expect(normalizeExerciseKey('Dumbbell Romanian Deadlift')).toBe('romanian deadlift');
    expect(normalizeExerciseKey('RDL')).toBe('romanian deadlift');
    expect(exerciseMatchesExclusion('Dumbbell Romanian Deadlift', ['Romanian Deadlift'])).toBe(true);
    expect(exerciseMatchesExclusion('Barbell Row', ['Romanian Deadlift'])).toBe(false);
  });

  it('an excluded RDL never returns as its dumbbell twin', () => {
    const out = adaptSplitForEquipment(
      plan([ex('Romanian Deadlift', 90)]),
      'full_gym',
      'kg',
      'intermediate',
      ['Romanian Deadlift']
    );
    expect(names(out).map(normalizeExerciseKey)).not.toContain('romanian deadlift');
  });

  it('Deadlift at home with RDL excluded cannot fall back to DB RDL', () => {
    const out = adaptExerciseForEquipment(ex('Deadlift', 100), 'home_dumbbells', false, [
      'Romanian Deadlift',
    ]);
    expect(out).not.toBeNull();
    expect(normalizeExerciseKey(out!.name)).not.toBe('romanian deadlift');
  });

  it('an excluded exercise with no safe replacement is dropped, not prescribed', () => {
    const out = adaptExerciseForEquipment(ex('Romanian Deadlift', 90), 'full_gym', false, [
      'Romanian Deadlift',
      'Deadlift',
      'Good Mornings',
      'Seated Leg Curl',
    ]);
    // All hinge substitutes excluded → the honest outcome is removal.
    if (out) expect(exerciseMatchesExclusion(out.name, ['Romanian Deadlift'])).toBe(false);
  });
});

describe('injury limitations shape the plan (ARJUN-1)', () => {
  it('a bad back removes loaded hinges at a full gym', () => {
    const out = adaptSplitForEquipment(
      plan([ex('Deadlift', 100), ex('Bench Press', 60), ex('Squat', 80)]),
      'full_gym',
      'kg',
      'intermediate',
      [],
      { limitations: ['Lower back'] }
    );
    const fams = names(out).map(getMovementFamily);
    expect(fams).not.toContain('hinge');
    expect(names(out)).toContain('Bench Press');
    expect(names(out)).toContain('Squat');
  });

  it('bad knees remove squat patterns', () => {
    const out = adaptSplitForEquipment(
      plan([ex('Squat', 80), ex('Bench Press', 60)]),
      'full_gym',
      'kg',
      'intermediate',
      [],
      { limitations: ['Knees'] }
    );
    expect(names(out).map(getMovementFamily)).not.toContain('squat');
  });
});

describe('home adaptation honesty (Neha)', () => {
  it('NEHA-1: adaptation never creates pull-ups for home users', () => {
    const out = adaptSplitForEquipment(
      plan([ex('Lat Pulldown', 50)]),
      'home_dumbbells',
      'kg',
      'intermediate',
      []
    );
    expect(names(out).map((n) => n.toLowerCase())).not.toContain('pull-ups');
  });

  it('NEHA-3: Close Grip Bench does not survive at home with a barbell load', () => {
    const out = adaptExerciseForEquipment(ex('Close Grip Bench Press', 45), 'home_dumbbells', false);
    expect(out).not.toBeNull();
    expect(out!.name).not.toBe('Close Grip Bench Press');
  });

  it('NEHA-4: machine cardio and hanging work never reach a bodyweight-only plan', () => {
    const out = adaptSplitForEquipment(
      plan([
        ex('Stationary Cycling', 0),
        ex('Incline Treadmill Walking', 0),
        ex('Rowing Intervals', 0),
        ex('Hanging Knee Raise', 0),
      ]),
      'bodyweight_only',
      'kg',
      'intermediate',
      []
    );
    const ns = names(out);
    expect(ns).not.toContain('Stationary Cycling');
    expect(ns).not.toContain('Incline Treadmill Walking');
    expect(ns).not.toContain('Rowing Intervals');
    expect(ns).not.toContain('Hanging Knee Raise');
  });

  it('NEHA-5: adaptation dedupes converged movements within a session', () => {
    const out = adaptSplitForEquipment(
      plan([ex('Deadlift', 100), ex('Romanian Deadlift', 80)]),
      'home_dumbbells',
      'kg',
      'intermediate',
      []
    );
    const keys = names(out).map(normalizeExerciseKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('NEHA-5: dumbbell conversions are capped at a realistic home load', () => {
    const out = adaptExerciseForEquipment(ex('Leg Press', 200), 'home_dumbbells', false);
    expect(out).not.toBeNull();
    expect(out!.targetWeight).toBeLessThanOrEqual(60);
  });
});

describe('first-exposure scaling (Simran / Aryan)', () => {
  it('SIMRAN-1: beginners are capped at 3 sets per exercise', () => {
    const out = prepareGeneratedPlans(plan([ex('Bench Press', 60, 4)]), {
      unit: 'kg',
      bodyweightKg: 62,
      experience: 'beginner',
      equipment: 'full_gym',
    });
    expect(out[0].exercises[0].targetSets).toBeLessThanOrEqual(3);
  });

  it('ARYAN-1: a self-declared intermediate minor is scaled as a beginner', () => {
    const out = prepareGeneratedPlans(
      plan([ex('Deadlift', 70, 4, 5), ex('Pull-ups', 0, 3, 8)]),
      {
        unit: 'kg',
        bodyweightKg: 55,
        experience: 'intermediate',
        ageYears: 16,
        equipment: 'full_gym',
      }
    );
    const dl = out[0].exercises.find((e) => e.name === 'Deadlift')!;
    expect(dl.targetWeight).toBeLessThanOrEqual(30);
    expect(dl.targetSets).toBeLessThanOrEqual(3);
    // Pull-ups regressed for a minor even at a full gym.
    expect(names(out).map((n) => n.toLowerCase())).not.toContain('pull-ups');
  });
});

describe('progression guards (ARJUN-6 / KAVYA-3)', () => {
  const sets = [{ weight: 100, reps: 5, rpe: 6, unit: 'kg' as const }];

  it('pain on the last session holds the target — never +2.5 kg', () => {
    const t = getNextSessionTarget('Deadlift', sets, 'kg', { hadPain: true });
    expect(t?.directive).toBe('hold');
    expect(t?.weight).toBe(100);
  });

  it('explosive work gets a quality hold, not load or rep grind', () => {
    const t = getNextSessionTarget('Box Jump', [{ weight: 0, reps: 5, rpe: 7, unit: 'kg' }], 'kg');
    expect(t?.directive).toBe('hold');
  });

  it('bodyweight work progresses by reps, never by a phantom load step', () => {
    const t = getNextSessionTarget('Push-ups', [{ weight: 0, reps: 12, rpe: 6, unit: 'kg' }], 'kg');
    expect(t?.directive).toBe('add_rep');
    expect(t?.weight).toBe(0);
  });

  it('exerciseHadPain attributes a pain swap to the original, not the substitute', () => {
    const w: WorkoutEntry = {
      id: 'w1',
      date: '2026-10-19',
      exercises: [
        {
          name: 'Barbell Row',
          painfulExerciseName: 'Deadlift',
          reportsPain: true,
          sets: [{ reps: 8, weight: 50, unit: 'kg', completed: true }],
        },
      ],
    };
    expect(exerciseHadPain(w, 'Deadlift')).toBe(true);
    expect(exerciseHadPain(w, 'Barbell Row')).toBe(false);
  });

  it('getProgressionRecommendation holds after a pain-flagged session', () => {
    const w: WorkoutEntry = {
      id: 'w2',
      date: '2026-10-19',
      exercises: [
        {
          name: 'Deadlift',
          reportsPain: true,
          sets: [
            { reps: 5, weight: 100, unit: 'kg', completed: true },
            { reps: 5, weight: 100, unit: 'kg', completed: true },
          ],
        },
      ],
    };
    const rec = getProgressionRecommendation('Deadlift', [w], 'kg', 'get_stronger');
    expect(rec).not.toBeNull();
    expect(rec!.targetWeight).toBe(100);
    expect(rec!.targetSummary).toContain('held');
  });
});

describe('swap list filtering (ARJUN-4)', () => {
  it('pain swaps leave the painful movement family entirely', () => {
    const subs = getFilteredSubstitutes('Deadlift', { avoidSameFamilyAs: 'Deadlift' });
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.map((s) => getMovementFamily(s.name))).not.toContain('hinge');
  });

  it('home swaps never offer a pull-up bar or machines', () => {
    const subs = getFilteredSubstitutes('Lat Pulldown', { equipment: 'home_dumbbells' });
    expect(subs.map((s) => s.name.toLowerCase())).not.toContain('pull-ups');
    for (const s of subs) {
      expect(['dumbbell', 'bodyweight', 'cardio']).toContain(s.equipment.toLowerCase());
    }
  });
});

describe('plan offer matches the training week (SHARED-2)', () => {
  it('a 2-day user is offered exactly 2 plans', () => {
    const three = [...plan([ex('A')]), ...plan([ex('B')]), ...plan([ex('C')])];
    expect(limitPlansToDays(three, 2)).toHaveLength(2);
    expect(limitPlansToDays(three, 4)).toHaveLength(3);
  });
});
