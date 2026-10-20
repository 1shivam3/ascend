import { describe, it, expect } from 'vitest';
import {
  mainCompoundKey,
  isMainCompound,
  estimateE1rmKg,
  percentSetWeights,
  roundToLoadable,
  buildPercentSuggestions,
  TOP_SET_PCT,
  BACKOFF_PCT,
} from '../src/lib/percent-1rm';
import { createWorkoutExercisesFromPlan } from '../src/lib/workout-engine';
import type { PersonalRecord, PlannedWorkout, WorkoutEntry } from '../src/lib/types';

function pr(partial: Partial<PersonalRecord>): PersonalRecord {
  return {
    id: 'p1',
    exercise: 'Bench Press',
    weightKg: 100,
    weightLbs: 220,
    reps: 1,
    oneRepMax: 100,
    date: '2026-10-01',
    ...partial,
  };
}

function plan(partial: Partial<PlannedWorkout> = {}): PlannedWorkout {
  return {
    id: 'plan1',
    name: 'Strength A',
    createdAt: '2026-10-01T00:00:00.000Z',
    intensityMode: 'percent',
    exercises: [
      { name: 'Barbell Bench Press', targetSets: 3, targetReps: 5 },
      { name: 'Lateral Raise', targetSets: 3, targetReps: 12 },
    ],
    ...partial,
  };
}

describe('mainCompoundKey', () => {
  it('recognizes the main compounds and common aliases', () => {
    expect(mainCompoundKey('Squat')).toBe('Squat');
    expect(mainCompoundKey('Barbell Bench Press')).toBe('Bench Press');
    expect(mainCompoundKey('bench')).toBe('Bench Press');
    expect(mainCompoundKey('Deadlift')).toBe('Deadlift');
    expect(mainCompoundKey('OHP')).toBe('Overhead Press');
    expect(mainCompoundKey('Bent Over Row')).toBe('Barbell Row');
  });

  it('keeps variants separate from their parent lift', () => {
    expect(mainCompoundKey('Front Squat')).toBe('Front Squat');
    expect(mainCompoundKey('Incline Barbell Bench Press')).toBe('Incline Bench');
    expect(mainCompoundKey('Sumo Deadlift')).toBe('Sumo Deadlift');
    expect(mainCompoundKey('Romanian Deadlift')).toBe('Romanian Deadlift');
  });

  it('returns null for accessories and bodyweight moves', () => {
    expect(mainCompoundKey('Lateral Raise')).toBeNull();
    expect(mainCompoundKey('Bicep Curl')).toBeNull();
    expect(mainCompoundKey('Pull-ups')).toBeNull();
    expect(isMainCompound('Squat')).toBe(true);
    expect(isMainCompound('Plank')).toBe(false);
  });
});

describe('estimateE1rmKg', () => {
  it('uses the best stored PR 1RM for the lift', () => {
    const prs = [pr({}), pr({ id: 'p2', oneRepMax: 110, weightKg: 110 })];
    expect(estimateE1rmKg('Bench Press', prs, [])).toBe(110);
  });

  it('derives e1RM from a PR logged as weight x reps without a stored 1RM', () => {
    const prs = [pr({ oneRepMax: 0, weightKg: 80, reps: 5 })];
    // 80 * (1 + 5/30) = 93.3
    expect(estimateE1rmKg('Bench Press', prs, [])).toBe(93.3);
  });

  it('falls back to the best completed workout set when no PR exists', () => {
    const workouts: WorkoutEntry[] = [
      {
        id: 'w1',
        date: '2026-10-10',
        exercises: [
          {
            name: 'Squat',
            sets: [
              { reps: 5, weight: 100, unit: 'kg', completed: true },
              { reps: 3, weight: 140, unit: 'kg', completed: false, status: 'skipped' },
              { reps: 10, weight: 60, unit: 'kg', completed: true, isWarmup: true },
            ],
          },
        ],
      },
    ];
    // 100 x 5 -> 116.7; skipped 140x3 and the warmup must not count.
    expect(estimateE1rmKg('Squat', [], workouts)).toBe(116.7);
  });

  it('converts lbs workout sets to kg', () => {
    const workouts: WorkoutEntry[] = [
      {
        id: 'w1',
        date: '2026-10-10',
        exercises: [
          { name: 'Deadlift', sets: [{ reps: 1, weight: 220, unit: 'lbs', completed: true }] },
        ],
      },
    ];
    const e1rm = estimateE1rmKg('Deadlift', [], workouts);
    expect(e1rm).not.toBeNull();
    expect(Math.abs((e1rm as number) - 99.8)).toBeLessThan(0.2);
  });

  it('returns null with no PR and no workout history (feature hides gracefully)', () => {
    expect(estimateE1rmKg('Bench Press', [], [])).toBeNull();
    expect(estimateE1rmKg('Lateral Raise', [pr({})], [])).toBeNull();
  });

  it('does not borrow a back-squat PR for a front squat', () => {
    const prs = [pr({ exercise: 'Squat', oneRepMax: 160, weightKg: 160 })];
    expect(estimateE1rmKg('Front Squat', prs, [])).toBeNull();
    expect(estimateE1rmKg('Squat', prs, [])).toBe(160);
  });
});

describe('percentSetWeights + roundToLoadable', () => {
  it('top set at 80%, back-offs at 70%, rounded to 2.5 kg', () => {
    expect(TOP_SET_PCT).toBe(0.8);
    expect(BACKOFF_PCT).toBe(0.7);
    // e1RM 100 kg -> 80 / 70 / 70
    expect(percentSetWeights(100, 3, 'kg')).toEqual([80, 70, 70]);
    // e1RM 93 kg -> 74.4 -> 75 ; 65.1 -> 65
    expect(percentSetWeights(93, 2, 'kg')).toEqual([75, 65]);
  });

  it('converts to lbs and rounds to 5 lb steps', () => {
    // 100 kg = 220.46 lbs -> top 176.4 -> 175 ; back-off 154.3 -> 155
    expect(percentSetWeights(100, 2, 'lbs')).toEqual([175, 155]);
  });

  it('never returns less than one loadable step', () => {
    expect(roundToLoadable(1, 'kg')).toBe(2.5);
    // 80% of 20 kg = 16 kg -> nearest 2.5 step is 15.
    expect(percentSetWeights(20, 1, 'kg')).toEqual([15]);
  });
});

describe('buildPercentSuggestions', () => {
  it('suggests only for main compounds with data and no explicit target weight', () => {
    const out = buildPercentSuggestions(plan(), [pr({})], []);
    expect(Object.keys(out)).toEqual(['0']);
    expect(out[0].weights).toEqual([80, 70, 70]);
    expect(out[0].e1rmKg).toBe(100);
  });

  it('is empty when the plan is not in percent mode', () => {
    expect(buildPercentSuggestions(plan({ intensityMode: 'rpe' }), [pr({})], [])).toEqual({});
    expect(buildPercentSuggestions(plan({ intensityMode: undefined }), [pr({})], [])).toEqual({});
  });

  it('respects an explicit targetWeight (plan wins over %)', () => {
    const p = plan();
    p.exercises[0].targetWeight = 60;
    expect(buildPercentSuggestions(p, [pr({})], [])).toEqual({});
  });

  it('is empty when no PR/workout history exists for the lift', () => {
    expect(buildPercentSuggestions(plan(), [], [])).toEqual({});
  });
});

describe('mapper integration (createWorkoutExercisesFromPlan)', () => {
  it('applies per-set suggested loads as prescribed weights', () => {
    const exercises = createWorkoutExercisesFromPlan(plan(), {
      userUnit: 'kg',
      percentWeightsByIndex: { 0: [80, 70, 70] },
    });
    const bench = exercises[0];
    expect(bench.sets.map((s) => s.prescribedWeight)).toEqual([80, 70, 70]);
    expect(bench.sets.map((s) => s.weight)).toEqual([80, 70, 70]);
    expect(bench.sets[0].prescribedUnit).toBe('kg');
    // Accessory untouched — still unconfigured, never fabricated.
    const raises = exercises[1];
    expect(raises.sets.every((s) => s.prescribedWeight === undefined)).toBe(true);
  });

  it('explicit plan weight beats the suggestion', () => {
    const p = plan();
    p.exercises[0].targetWeight = 55;
    const exercises = createWorkoutExercisesFromPlan(p, {
      userUnit: 'kg',
      percentWeightsByIndex: { 0: [80, 70, 70] },
    });
    expect(exercises[0].sets.every((s) => s.prescribedWeight === 55)).toBe(true);
  });

  it('without suggestions the mapper output is the classic RPE path', () => {
    const exercises = createWorkoutExercisesFromPlan(plan(), { userUnit: 'kg' });
    expect(exercises[0].sets.every((s) => s.prescribedWeight === undefined)).toBe(true);
  });
});
