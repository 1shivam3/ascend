/**
 * T2 (bug program Phase 4): coach-prescribed loads with no data.
 *
 * Before: a no-history user's proposal carried template loads with
 * no visible basis — accessories got a confident number with no
 * explanation at all, and only main lifts admitted (in prose) that
 * the load was a default. Now every load carries a basis
 * ('data' | 'estimate'), estimated loads say so in the why-line and
 * are badged in the review, and a beginner's estimated barbell
 * start is hard-capped at bodyweight.
 */
import { describe, expect, it } from 'vitest';
import {
  capBeginnerEstimate,
  generateBlockProposal,
  type BlockEngineInput,
} from '@/lib/block-engine';
import type { BlockIntake } from '@/lib/block-intake';
import { canonicalizeExerciseName } from '@/lib/workout-outcome-evidence';
import type { PersonalRecord, WorkoutEntry } from '@/lib/types';

const TODAY = '2026-10-22';

function baseIntake(over: Partial<BlockIntake> = {}): BlockIntake {
  return {
    goal: 'build_muscle',
    daysPerWeek: 4,
    sessionMinutes: 75,
    equipment: 'full_gym',
    limitations: [],
    experience: 'intermediate',
    topLifts: [],
    ...over,
  };
}

function input(over: Partial<BlockEngineInput> = {}): BlockEngineInput {
  return {
    intake: baseIntake(),
    athleteModel: null,
    prs: [],
    workouts: [],
    existingPlans: [],
    unit: 'kg',
    todayStr: TODAY,
    ...over,
  };
}

describe('T2: load basis on a cold start (no history at all)', () => {
  it('every loaded exercise is badged estimate, and its why-line says so', () => {
    const p = generateBlockProposal(input());
    let loaded = 0;
    for (const day of p.days) {
      for (const ex of day.exercises) {
        if (typeof ex.targetWeight === 'number' && ex.targetWeight > 0) {
          loaded++;
          const key = canonicalizeExerciseName(ex.name);
          expect(day.loadBasisByExercise?.[key]).toBe('estimate');
          expect(day.whyByExercise[key]).toMatch(/Estimated start/);
        }
      }
    }
    expect(loaded).toBeGreaterThan(0);
  });

  it('barbell-compound loads are plate-loadable (2.5 kg steps)', () => {
    // Dumbbell/machine template defaults legitimately use finer
    // catalogue steps (e.g. a 14 kg dumbbell); the plate rule binds
    // barbell loads, which come from templates or roundToLoadable.
    const p = generateBlockProposal(input());
    for (const day of p.days) {
      for (const ex of day.exercises) {
        const key = canonicalizeExerciseName(ex.name);
        if (
          typeof ex.targetWeight === 'number' &&
          ex.targetWeight > 0 &&
          ['squat', 'deadlift', 'bench press', 'overhead press', 'barbell row'].includes(key)
        ) {
          expect(ex.targetWeight % 2.5).toBe(0);
        }
      }
    }
  });
});

describe('T2: load basis with data behind the lift', () => {
  it('a lift with a recorded PR is data-based and its why names the 1RM', () => {
    const pr: PersonalRecord = {
      id: 'pr-squat',
      exercise: 'Squat',
      weightKg: 100,
      weightLbs: 220.5,
      reps: 5,
      oneRepMax: 116.7,
      date: '2026-10-01',
      notes: 'All-Time 1RM PR',
      prType: '1rm',
    };
    const workout: WorkoutEntry = {
      id: 'w1',
      date: '2026-10-01',
      name: 'Lower',
      exercises: [
        {
          name: 'Squat',
          sets: [{ reps: 5, weight: 100, unit: 'kg', status: 'completed' }],
        },
      ],
    };
    const p = generateBlockProposal(input({ prs: [pr], workouts: [workout] }));
    const squatDay = p.days.find((d) =>
      d.exercises.some((e) => canonicalizeExerciseName(e.name) === 'squat'),
    );
    expect(squatDay).toBeTruthy();
    expect(squatDay!.loadBasisByExercise?.['squat']).toBe('data');
    expect(squatDay!.whyByExercise['squat']).toMatch(/estimated 1RM/);
    expect(squatDay!.whyByExercise['squat']).not.toMatch(/Estimated start/);
  });
});

describe('T2: beginner bodyweight cap', () => {
  it('capBeginnerEstimate caps plate-rounded DOWN at bodyweight', () => {
    expect(capBeginnerEstimate(110, 'kg', 72)).toBe(70);
    expect(capBeginnerEstimate(72.5, 'kg', 72)).toBe(70);
    expect(capBeginnerEstimate(60, 'kg', 72)).toBe(60);
    expect(capBeginnerEstimate(110, 'kg', undefined)).toBe(110);
    expect(capBeginnerEstimate(300, 'lbs', 100)).toBe(220);
  });

  it('property: no beginner estimated barbell-compound load exceeds bodyweight', () => {
    for (const goal of ['build_muscle', 'get_stronger', 'lose_fat'] as const) {
      const p = generateBlockProposal(
        input({
          intake: baseIntake({ experience: 'beginner', goal }),
          bodyweightKg: 60,
        }),
      );
      for (const day of p.days) {
        for (const ex of day.exercises) {
          const key = canonicalizeExerciseName(ex.name);
          if (
            day.loadBasisByExercise?.[key] === 'estimate' &&
            typeof ex.targetWeight === 'number' &&
            ['squat', 'deadlift', 'bench press', 'overhead press', 'barbell row'].includes(key)
          ) {
            expect(ex.targetWeight).toBeLessThanOrEqual(60);
          }
        }
      }
    }
  });
});
