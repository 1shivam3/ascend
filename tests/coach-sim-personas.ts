/**
 * Synthetic lifter personas for the coach simulation harness.
 * Performance models decide only what gets LOGGED (actual reps / RPE / pain
 * flags). All coaching decisions remain the app's own engine + store logic.
 */
import { getMovementFamily } from '@/lib/workout-engine';
import { canonicalizeExerciseName } from '@/lib/workout-outcome-evidence';
import type { BlockIntake } from '@/lib/block-intake';
import {
  fallbackWeight,
  performedSets,
  type PersonaDef,
} from './coach-sim-harness';

function intake(over: Partial<BlockIntake>): BlockIntake {
  return {
    goal: 'get_stronger',
    daysPerWeek: 4,
    sessionMinutes: 60,
    equipment: 'full_gym',
    limitations: [],
    experience: 'intermediate',
    topLifts: [],
    ...over,
  };
}

const TOPS = (squat: number, bench: number, deadlift: number) => [
  { name: 'Squat', e1rmKg: squat, source: 'entered' as const },
  { name: 'Bench Press', e1rmKg: bench, source: 'entered' as const },
  { name: 'Deadlift', e1rmKg: deadlift, source: 'entered' as const },
];

const GOOD_CHECKIN = { sleep: 4, soreness: 4, energy: 4 };

// 1 — Consistent beginner: never misses, hits every prescribed rep.
export const beginnerPersona: PersonaDef = {
  id: 'beginner',
  seed: 101,
  bodyweightKg: 70,
  intake: intake({
    daysPerWeek: 3,
    experience: 'beginner',
    topLifts: TOPS(60, 40, 80),
  }),
  trainsOn: () => true,
  perform: ({ exercise, sessionCountForExercise, scratch }) => {
    const rpeCycle = [7, 7.5, 8];
    const rpe = rpeCycle[sessionCountForExercise % rpeCycle.length];
    const bonus = sessionCountForExercise % 3 === 2 ? 1 : 0;
    const weight = exercise.targetWeight ?? fallbackWeight(exercise.name, scratch);
    return {
      sets: performedSets(exercise, {
        reps: (i) =>
          (exercise.targetReps ?? 8) + (i === (exercise.targetSets ?? 3) - 1 ? bonus : 0),
        rpe,
        weightKg: weight,
      }),
    };
  },
  checkin: () => ({ ...GOOD_CHECKIN }),
};

// 2 — Erratic intermediate: skips the last scheduled session most weeks and
// vanishes for one full week (week 8) mid-run.
export const erraticPersona: PersonaDef = {
  id: 'erratic',
  seed: 202,
  bodyweightKg: 82,
  intake: intake({ topLifts: TOPS(140, 100, 180) }),
  trainsOn: (week, weekday, scheduled) => {
    if (week === 8) return false; // full missed week
    const last = scheduled[scheduled.length - 1];
    if (weekday === last && week % 4 !== 0) return false; // misses most final sessions
    return true;
  },
  perform: ({ exercise, scratch }) => {
    const weight = exercise.targetWeight ?? fallbackWeight(exercise.name, scratch);
    return {
      sets: performedSets(exercise, {
        reps: exercise.targetReps ?? 8,
        rpe: 8,
        weightKg: weight,
      }),
    };
  },
  checkin: () => ({ sleep: 4, soreness: 3, energy: 4 }),
};

// 3 — Pain flare: pressing movements hurt from week 5 through week 7.
export const painFlarePersona: PersonaDef = {
  id: 'pain-flare',
  seed: 303,
  bodyweightKg: 78,
  intake: intake({ goal: 'build_muscle', topLifts: TOPS(120, 90, 160) }),
  trainsOn: () => true,
  perform: ({ exercise, week, scratch }) => {
    const family = getMovementFamily(exercise.name);
    const isPressing = family === 'horizontal_push' || family === 'vertical_push';
    const inPainWindow = week >= 5 && week <= 7;
    const weight = exercise.targetWeight ?? fallbackWeight(exercise.name, scratch);
    if (isPressing && inPainWindow) {
      return {
        sets: performedSets(exercise, {
          reps: Math.max(1, (exercise.targetReps ?? 8) - 2),
          rpe: 9.5,
          weightKg: weight,
        }),
        reportsPain: true,
        painfulExerciseName: exercise.name,
      };
    }
    return {
      sets: performedSets(exercise, {
        reps: exercise.targetReps ?? 8,
        rpe: 8,
        weightKg: weight,
      }),
    };
  },
  checkin: (week) =>
    week >= 5 && week <= 7
      ? {
          sleep: 3,
          soreness: 2,
          energy: 3,
          soreAreas: ['Shoulders', 'Chest'],
          painAreas: ['Shoulders'],
        }
      : { ...GOOD_CHECKIN },
};

// 4 — Declared injury: shoulder limitation declared at intake. The engine's
// limitation map bans the vertical_push family (+ shoulder-joint picks).
export const injuryPersona: PersonaDef = {
  id: 'declared-injury',
  seed: 404,
  bodyweightKg: 75,
  intake: intake({
    goal: 'build_muscle',
    limitations: ['Shoulder'],
    topLifts: TOPS(120, 90, 160),
  }),
  trainsOn: () => true,
  perform: ({ exercise, scratch }) => {
    const weight = exercise.targetWeight ?? fallbackWeight(exercise.name, scratch);
    return {
      sets: performedSets(exercise, {
        reps: exercise.targetReps ?? 8,
        rpe: 8,
        weightKg: weight,
      }),
    };
  },
  checkin: () => ({ ...GOOD_CHECKIN }),
};

// 5 — Fast progresser: beats the prescribed reps on every set, low RPE.
export const fastProgresserPersona: PersonaDef = {
  id: 'fast-progresser',
  seed: 505,
  bodyweightKg: 85,
  intake: intake({ topLifts: TOPS(140, 100, 180) }),
  trainsOn: () => true,
  perform: ({ exercise, scratch }) => {
    const weight = exercise.targetWeight ?? fallbackWeight(exercise.name, scratch);
    return {
      sets: performedSets(exercise, {
        reps: (exercise.targetReps ?? 8) + 2,
        rpe: 6.5,
        weightKg: weight,
      }),
    };
  },
  checkin: () => ({ sleep: 5, soreness: 5, energy: 5 }),
};

// 6 — Staller: bench press flat-lines from week ~4 with grinding RPE, and a
// sustained fatigue pattern (poor sleep/soreness check-ins) from week 6.
export const stallerPersona: PersonaDef = {
  id: 'staller',
  seed: 606,
  bodyweightKg: 80,
  intake: intake({ topLifts: TOPS(140, 100, 180) }),
  trainsOn: () => true,
  perform: ({ exercise, week, scratch }) => {
    const weight = exercise.targetWeight ?? fallbackWeight(exercise.name, scratch);
    const isBench = canonicalizeExerciseName(exercise.name) === 'bench press';
    if (isBench) {
      const rpe = week <= 3 ? 8 : week === 4 ? 8.5 : week === 5 ? 9 : 9.5;
      return {
        sets: performedSets(exercise, {
          reps: exercise.targetReps ?? 5,
          rpe,
          weightKg: weight,
        }),
      };
    }
    return {
      sets: performedSets(exercise, {
        reps: exercise.targetReps ?? 8,
        rpe: 7.5,
        weightKg: weight,
      }),
    };
  },
  checkin: (week) =>
    week >= 6
      ? { sleep: 2, soreness: 2, energy: 2 }
      : { sleep: 4, soreness: 3, energy: 4 },
};

export const ALL_PERSONAS: PersonaDef[] = [
  beginnerPersona,
  erraticPersona,
  painFlarePersona,
  injuryPersona,
  fastProgresserPersona,
  stallerPersona,
];
