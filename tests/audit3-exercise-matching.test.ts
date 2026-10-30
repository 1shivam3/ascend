/**
 * Audit-3 FE-03: Progress exercise matching must be exact-name
 * (normalized), never substring. 'Incline Bench Press' history and
 * PRs used to merge into 'Bench Press' — inflating its chart, latest
 * 1RM and PR timeline, with the heavier variant usually winning.
 */
import { describe, it, expect } from 'vitest';
import { exerciseNamesEqual, getExerciseHistorySessions } from '../src/lib/lifter-twin';
import type { WorkoutEntry } from '../src/lib/types';

function workout(id: string, date: string, name: string, weight: number): WorkoutEntry {
  return {
    id,
    date,
    exercises: [{ name, sets: [{ reps: 5, weight, unit: 'kg', completed: true }] }],
  } as WorkoutEntry;
}

const workouts: WorkoutEntry[] = [
  workout('w1', '2026-10-05', 'Bench Press', 100),
  workout('w2', '2026-10-07', 'Incline Bench Press', 120), // heavier variant
  workout('w3', '2026-10-09', 'bench press', 102), // case drift is the same lift
];

describe('audit-3 FE-03: exerciseNamesEqual', () => {
  it('matches case/whitespace-normalized equality only', () => {
    expect(exerciseNamesEqual('Bench Press', 'bench  press')).toBe(true);
    expect(exerciseNamesEqual(' Bench Press ', 'Bench Press')).toBe(true);
    expect(exerciseNamesEqual('Incline Bench Press', 'Bench Press')).toBe(false);
    expect(exerciseNamesEqual('Bench Press', 'Bench')).toBe(false);
    expect(exerciseNamesEqual('Close-Grip Bench Press', 'Bench Press')).toBe(false);
  });
});

describe('audit-3 FE-03: getExerciseHistorySessions exact mode', () => {
  it('excludes variant lifts from the selected exercise history', () => {
    const sessions = getExerciseHistorySessions('Bench Press', workouts, 'kg', { exact: true });
    expect(sessions.map((s) => s.date)).toEqual(['2026-10-05', '2026-10-09']);
    // The 120 kg incline session must not become Bench Press's best.
    expect(Math.max(...sessions.map((s) => s.bestWeight))).toBe(102);
  });

  it('the variant keeps its own separate history', () => {
    const sessions = getExerciseHistorySessions('Incline Bench Press', workouts, 'kg', { exact: true });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].bestWeight).toBe(120);
  });

  it('default (fuzzy) matching is unchanged for coach-engine callers', () => {
    const sessions = getExerciseHistorySessions('Bench Press', workouts, 'kg');
    expect(sessions).toHaveLength(3);
  });

  it('PR filtering with the predicate keeps variants out', () => {
    const prs = [
      { exercise: 'Bench Press', weightKg: 100 },
      { exercise: 'Incline Bench Press', weightKg: 130 },
    ];
    const matches = prs.filter((p) => exerciseNamesEqual(p.exercise, 'Bench Press'));
    expect(matches).toEqual([{ exercise: 'Bench Press', weightKg: 100 }]);
  });
});
