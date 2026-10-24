import { describe, expect, it } from 'vitest';
import {
  adaptExerciseForEquipment,
  adaptSplitForEquipment,
  getExerciseJointCautions,
  getFilteredSubstitutes,
  getInjuryBannedJoints,
  getPlanBannedJoints,
  isExerciseJointBanned,
} from '@/lib/workout-engine';
import { generateBlockProposal, type BlockEngineInput } from '@/lib/block-engine';
import type { BlockIntake } from '@/lib/block-intake';
import type { AthleteModel } from '@/lib/athlete-model';
import type { PlannedExercise, PlannedWorkout } from '@/lib/types';
import { canonicalizeExerciseName } from '@/lib/workout-outcome-evidence';
import { useStore } from '@/lib/store';

/**
 * Persona-sim round 5 — safety batch (SIM-P1-01/02/03, SIM-P2-07/08/16).
 * Joint-aware bans, single-report pain handling, past-workout pain
 * plumbing (via reportsPain on the exercise, exercised through the
 * athlete model in other suites), and the low-impact cardio fallback.
 */

const TODAY = '2026-10-22';

function intake(over: Partial<BlockIntake> = {}): BlockIntake {
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

function modelWithPain(pain: AthleteModel['pain']): AthleteModel {
  const baseline = { mean: null, sd: null, n: 0, tier: 'prior' as const, evidence: '' };
  return {
    version: 1,
    todayStr: TODAY,
    workoutsAnalyzed: 40,
    checkinBaselines: { sleep: baseline, soreness: baseline, energy: baseline },
    lifts: [],
    recovery: [],
    adherence: {
      windowWeeks: 8,
      plannedSessions: 0,
      completedSessions: 0,
      unscheduledSessions: 0,
      adherenceRate: { value: 0, n: 0, tier: 'prior', evidence: '' },
      mostSkippedDay: null,
      mostTrainedDay: null,
    },
    pain,
    lowReadinessShare: { value: 0, n: 0, tier: 'prior', evidence: '' },
    topFacts: [],
  } as unknown as AthleteModel;
}

describe('joint-aware limitation bans (SIM-P1-01)', () => {
  it('maps limitation text to joints, including elbow/wrist which had no ban', () => {
    expect(getInjuryBannedJoints(['shoulder pain']).has('shoulder')).toBe(true);
    expect(getInjuryBannedJoints(['rotator cuff']).has('shoulder')).toBe(true);
    expect(getInjuryBannedJoints(['elbow']).has('elbow')).toBe(true);
    expect(getInjuryBannedJoints(['wrist']).has('wrist')).toBe(true);
    expect(getInjuryBannedJoints(['bad knee']).has('knee')).toBe(true);
    expect(getInjuryBannedJoints(['lower back']).has('lower_back')).toBe(true);
    expect(getInjuryBannedJoints(['no injuries']).size).toBe(0);
  });

  it('flags bench press as shoulder-loading and squat as shoulder-free', () => {
    expect(isExerciseJointBanned('Barbell Bench Press', new Set(['shoulder']))).toBe(true);
    expect(isExerciseJointBanned('Dumbbell Lateral Raise', new Set(['shoulder']))).toBe(true);
    expect(isExerciseJointBanned('Barbell Back Squat', new Set(['shoulder']))).toBe(false);
    expect(getExerciseJointCautions('Barbell Bench Press')).toContain('shoulder');
  });

  it('plan joint bans exclude lower_back per ARJUN-1 (hinge banned at family level, squat kept)', () => {
    const banned = getPlanBannedJoints(['Lower back']);
    expect(banned.has('lower_back')).toBe(false);
    const shoulderBanned = getPlanBannedJoints(['shoulder']);
    expect(shoulderBanned.has('shoulder')).toBe(true);
  });

  it('adaptSplitForEquipment removes or swaps shoulder-loading lifts for a shoulder limitation', () => {
    const plans: PlannedWorkout[] = [
      {
        id: 'p1',
        name: 'Push',
        createdAt: '2026-10-20',
        exercises: [
          { name: 'Barbell Bench Press', targetSets: 3, targetReps: 8, targetWeight: 60, notes: '' },
          { name: 'Barbell Back Squat', targetSets: 3, targetReps: 6, targetWeight: 80, notes: '' },
        ] as PlannedExercise[],
      },
    ];
    const out = adaptSplitForEquipment(plans, 'full_gym', 'kg', 'intermediate', [], {
      limitations: ['shoulder'],
    });
    const names = (out[0]?.exercises || []).map((e) => e.name);
    // Bench must be gone (swapped to something shoulder-free, or dropped).
    expect(names).not.toContain('Barbell Bench Press');
    for (const name of names) {
      expect(isExerciseJointBanned(name, new Set(['shoulder']))).toBe(false);
    }
    // The squat (not shoulder-loading) survives.
    expect(names).toContain('Barbell Back Squat');
  });

  it('block proposals never program a joint-banned lift', () => {
    const input: BlockEngineInput = {
      intake: intake({ limitations: ['shoulder'] }),
      athleteModel: null,
      prs: [],
      workouts: [],
      existingPlans: [],
      unit: 'kg',
      todayStr: TODAY,
    };
    const p = generateBlockProposal(input);
    for (const day of p.days) {
      for (const ex of day.exercises) {
        expect(isExerciseJointBanned(ex.name, new Set(['shoulder']))).toBe(false);
      }
    }
  });
});

describe('single-report pain handling (SIM-P1-03)', () => {
  it('one recent "Hurts" report keeps that exact lift out of the next block', () => {
    // Templates name it 'Squat' (identity rule: exact trimmed lowercase
    // names are never merged, so the pain key must use the same name
    // the user actually logged).
    const squatKey = canonicalizeExerciseName('Squat');
    const control = generateBlockProposal({
      intake: intake(),
      athleteModel: modelWithPain({
        episodes: [],
        episodesLast28dByFamily: {},
        flaggedFamilies: [],
        recentPainExerciseKeys: [],
      }),
      prs: [],
      workouts: [],
      existingPlans: [],
      unit: 'kg',
      todayStr: TODAY,
    });
    const controlNames = control.days.flatMap((d) => d.exercises.map((e) => e.name));
    expect(controlNames).toContain('Squat');

    const pained = generateBlockProposal({
      intake: intake(),
      athleteModel: modelWithPain({
        episodes: [],
        episodesLast28dByFamily: { squat: 1 },
        flaggedFamilies: [],
        recentPainExerciseKeys: [squatKey],
      }),
      prs: [],
      workouts: [],
      existingPlans: [],
      unit: 'kg',
      todayStr: TODAY,
    });
    const names = pained.days.flatMap((d) => d.exercises.map((e) => e.name));
    expect(names).not.toContain('Squat');
    expect(pained.warnings.some((w) => /Squat/i.test(w))).toBe(true);
  });
});

describe('pain-swap joint filter (SIM-P2-08)', () => {
  it('a lateral-raise pain swap never offers another shoulder-loading raise', () => {
    const name = 'Dumbbell Lateral Raise';
    const filtered = getFilteredSubstitutes(name, {
      equipment: 'full_gym',
      avoidSameFamilyAs: name,
      avoidJointsOf: name,
    });
    for (const sub of filtered) {
      expect(isExerciseJointBanned(sub.name, new Set(['shoulder']))).toBe(false);
    }
  });
});

describe('home cardio fallback (SIM-P2-16)', () => {
  it('machine HIIT cardio becomes Jumping Jacks, not Burpees, for home users', () => {
    const ex = {
      name: 'Treadmill HIIT',
      targetSets: 3,
      targetReps: 10,
      targetWeight: 0,
      notes: '',
    } as PlannedExercise;
    const out = adaptExerciseForEquipment(ex, 'home_dumbbells', false, []);
    expect(out?.name).toBe('Jumping Jacks');
  });
});

describe('workout delete undo (SIM-P1-09)', () => {
  it('delete + insertWorkoutAt restores the session at its index and clears the tombstone', () => {
    const w1 = { id: 'w1', date: '2026-10-20', exercises: [] };
    const w2 = { id: 'w2', date: '2026-10-21', exercises: [] };
    useStore.setState({ workouts: [w1, w2] as never, deletedWorkoutIds: [] });
    const st = useStore.getState();
    st.deleteWorkout('w1');
    expect(useStore.getState().workouts.map((w) => w.id)).toEqual(['w2']);
    expect(useStore.getState().deletedWorkoutIds).toContain('w1');
    useStore.getState().insertWorkoutAt(w1 as never, 0);
    expect(useStore.getState().workouts.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(useStore.getState().deletedWorkoutIds).not.toContain('w1');
    // No-op when already present.
    useStore.getState().insertWorkoutAt(w1 as never, 1);
    expect(useStore.getState().workouts.map((w) => w.id)).toEqual(['w1', 'w2']);
  });
});
