import { describe, it, expect } from 'vitest';
import { calculateWorkoutVolumeKg } from '@/lib/volume';
import { calculateWorkoutTonnage } from '@/lib/ai-coach';
import { buildWeeklyReview, type WeeklyReviewInput } from '@/lib/weekly-review';
import { getMonthlyAscensionReport } from '@/lib/habits';
import { getInitialCoachBlocksState } from '@/lib/block-engine';
import type { WeeklySchedule, WorkoutEntry, WorkoutSet } from '@/lib/types';

/**
 * Gauntlet DI-05 (user decision 2026-10-29): ONE canonical volume.
 *
 * The finding's own example: 3 warmup sets of 60 kg × 10 plus 3
 * working sets of 100 kg × 5 read as 3300 kg in coach tonnage but
 * 1500 kg in the weekly review, and bodyweight work read as 0 in
 * the monthly report but full bodyweight in the weekly review.
 * Canonical (lib/volume): warmups count; bodyweight exercises count
 * at the user's body weight (+ added load). Every path must agree.
 */

const ALL_REST: WeeklySchedule = {
  monday: { workoutPlanId: 'rest' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'rest' },
  thursday: { workoutPlanId: 'rest' },
  friday: { workoutPlanId: 'rest' },
  saturday: { workoutPlanId: 'rest' },
  sunday: { workoutPlanId: 'rest' },
};

const BW = 80;

function set(partial: Partial<WorkoutSet>): WorkoutSet {
  return { reps: 0, unit: 'kg', status: 'completed', completed: true, ...partial };
}

/** The DI-05 example session: 3×10 @ 60 warmup + 3×5 @ 100 working. */
const benchSession: WorkoutEntry = {
  id: 'di05-bench',
  name: 'Bench Day',
  date: '2026-10-14',
  exercises: [
    {
      name: 'Bench Press',
      sets: [
        set({ reps: 10, weight: 60, isWarmup: true }),
        set({ reps: 10, weight: 60, isWarmup: true }),
        set({ reps: 10, weight: 60, isWarmup: true }),
        set({ reps: 5, weight: 100 }),
        set({ reps: 5, weight: 100 }),
        set({ reps: 5, weight: 100 }),
      ],
    },
  ],
};

const pullupSession: WorkoutEntry = {
  id: 'di05-pullups',
  name: 'Pull Day',
  date: '2026-10-14',
  exercises: [
    {
      name: 'Pull-ups',
      sets: [set({ reps: 10, weight: 0 }), set({ reps: 10, weight: 0 }), set({ reps: 10, weight: 0 })],
    },
  ],
};

function weeklyInput(workouts: WorkoutEntry[]): WeeklyReviewInput {
  return {
    anyDateInWeek: '2026-10-14',
    workouts,
    plannedWorkouts: [],
    weeklySchedule: ALL_REST,
    athleteModel: null,
    coachBlocks: getInitialCoachBlocksState(),
    prs: [],
    dailyCheckins: {},
    policyRecords: [],
    stalls: [],
    unit: 'kg',
    bodyweightKg: BW,
    todayStr: '2026-10-22',
  };
}

function monthlyTonnes(workouts: WorkoutEntry[]): number {
  return getMonthlyAscensionReport({
    year: 2026,
    month: 9,
    workouts,
    prs: [],
    waterLogs: {},
    waterTargetMl: 2500,
    creatineLogs: {},
    bodyweightKg: BW,
  }).totalVolumeTonnes;
}

describe('DI-05 canonical volume — warmups count everywhere', () => {
  it('the helper counts warmups: 1800 warmup + 1500 working = 3300', () => {
    expect(calculateWorkoutVolumeKg(benchSession, BW)).toBe(3300);
  });

  it('coach tonnage agrees for a set-based session', () => {
    expect(calculateWorkoutTonnage(benchSession, BW)).toBe(3300);
  });

  it('weekly review and monthly report show the SAME 3300 kg', () => {
    const review = buildWeeklyReview(weeklyInput([benchSession]));
    expect(review.tonnageKg).toBe(3300);
    expect(monthlyTonnes([benchSession])).toBe(3.3);
  });
});

describe('DI-05 canonical volume — bodyweight counts at full body weight', () => {
  it('pull-ups at 80 kg body weight: 3 × 10 × 80 = 2400 in every path', () => {
    expect(calculateWorkoutVolumeKg(pullupSession, BW)).toBe(2400);
    const review = buildWeeklyReview(weeklyInput([pullupSession]));
    expect(review.tonnageKg).toBe(2400);
    expect(monthlyTonnes([pullupSession])).toBe(2.4);
  });

  it('added load on a bodyweight exercise stacks on body weight', () => {
    const weighted: WorkoutEntry = {
      ...pullupSession,
      id: 'di05-weighted-pullups',
      exercises: [
        { name: 'Pull-ups', sets: [set({ reps: 10, weight: 10 })] },
      ],
    };
    expect(calculateWorkoutVolumeKg(weighted, BW)).toBe(10 * (80 + 10));
  });

  it('no fabricated body weight: unknown body weight counts added load only', () => {
    expect(calculateWorkoutVolumeKg(pullupSession, undefined)).toBe(0);
  });
});

describe('DI-05 canonical volume — set eligibility', () => {
  it('a set with no isWarmup flag counts (treated as a working set)', () => {
    const unflagged: WorkoutEntry = {
      id: 'di05-unflagged',
      name: 'Squat Day',
      date: '2026-10-14',
      exercises: [{ name: 'Barbell Squat', sets: [set({ reps: 5, weight: 100 })] }],
    };
    expect(calculateWorkoutVolumeKg(unflagged, BW)).toBe(500);
  });

  it('uncompleted sets never count', () => {
    const pending: WorkoutEntry = {
      id: 'di05-pending',
      name: 'Squat Day',
      date: '2026-10-14',
      exercises: [
        {
          name: 'Barbell Squat',
          sets: [set({ reps: 5, weight: 100, status: 'pending', completed: false })],
        },
      ],
    };
    expect(calculateWorkoutVolumeKg(pending, BW)).toBe(0);
  });

  it('lbs loads convert to kg', () => {
    const lbs: WorkoutEntry = {
      id: 'di05-lbs',
      name: 'Bench Day',
      date: '2026-10-14',
      exercises: [
        { name: 'Bench Press', sets: [set({ reps: 10, weight: 100, unit: 'lbs' })] },
      ],
    };
    expect(calculateWorkoutVolumeKg(lbs, BW)).toBeCloseTo(453.592, 3);
  });
});
