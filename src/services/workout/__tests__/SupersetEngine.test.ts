import { describe, it, expect } from 'vitest';
import { SupersetEngine } from '../SupersetEngine';
import { ExerciseLog, SetLog } from '../../../types/domain.types';

describe('SupersetEngine — Antagonist & Circuit Training Progression', () => {
  const mockSets = (count: number, completed = false): SetLog[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `s-${i + 1}`,
      exerciseLogId: 'el-1',
      userId: 'u1',
      setNumber: i + 1,
      setType: 'NORMAL',
      weightKg: 80,
      reps: 8,
      rpe: 8,
      estimated1RmKg: 100,
      isPr: false,
      completed,
      completedAt: null,
    }));
  };

  const exerciseA1: ExerciseLog = {
    id: 'el-bench',
    workoutId: 'w-1',
    exerciseId: 'ex-bench-press',
    userId: 'u1',
    orderIndex: 0,
    supersetId: 'SS-1',
    sets: mockSets(3),
  };

  const exerciseA2: ExerciseLog = {
    id: 'el-pullup',
    workoutId: 'w-1',
    exerciseId: 'ex-pullup',
    userId: 'u1',
    orderIndex: 1,
    supersetId: 'SS-1',
    sets: mockSets(3),
  };

  const standaloneEx: ExerciseLog = {
    id: 'el-squat',
    workoutId: 'w-1',
    exerciseId: 'ex-barbell-back-squat',
    userId: 'u1',
    orderIndex: 2,
    supersetId: null,
    sets: mockSets(4),
  };

  it('generates sequential superset identifiers without collision', () => {
    expect(SupersetEngine.generateSupersetId([])).toBe('SS-1');
    expect(SupersetEngine.generateSupersetId(['SS-1'])).toBe('SS-2');
    expect(SupersetEngine.generateSupersetId(['SS-1', 'SS-2'])).toBe('SS-3');
    expect(SupersetEngine.generateSupersetId(['SS-1', 'SS-3'])).toBe('SS-2'); // Reuses lowest available
  });

  it('formats tactical alphabetic badge labels correctly', () => {
    expect(SupersetEngine.getSupersetBadgeLabel('SS-1', 0)).toBe('A1');
    expect(SupersetEngine.getSupersetBadgeLabel('SS-1', 1)).toBe('A2');
    expect(SupersetEngine.getSupersetBadgeLabel('SS-1', 2)).toBe('A3');
    expect(SupersetEngine.getSupersetBadgeLabel('SS-2', 0)).toBe('B1');
    expect(SupersetEngine.getSupersetBadgeLabel('SS-2', 1)).toBe('B2');
    expect(SupersetEngine.getSupersetBadgeLabel('SS-3', 0)).toBe('C1');
  });

  it('groups contiguous exercises by supersetId', () => {
    const exercises = [exerciseA1, exerciseA2, standaloneEx];
    const groups = SupersetEngine.groupExercises(exercises);

    expect(groups).toHaveLength(2);
    expect(groups[0].supersetId).toBe('SS-1');
    expect(groups[0].exercises).toHaveLength(2);
    expect(groups[0].exercises[0].id).toBe('el-bench');
    expect(groups[0].exercises[1].id).toBe('el-pullup');

    expect(groups[1].supersetId).toBeNull();
    expect(groups[1].exercises).toHaveLength(1);
    expect(groups[1].exercises[0].id).toBe('el-squat');
  });

  it('returns null for standalone exercises without supersets', () => {
    const exercises = [exerciseA1, exerciseA2, standaloneEx];
    const next = SupersetEngine.getNextTarget('el-squat', 1, exercises);
    expect(next).toBeNull();
  });

  it('progresses to paired exercise during an active superset round', () => {
    const exercises = [exerciseA1, exerciseA2, standaloneEx];
    // Completed Set 1 on Bench (A1) -> Next should be Pullup (A2) Set 1
    const next = SupersetEngine.getNextTarget('el-bench', 1, exercises);

    expect(next).not.toBeNull();
    expect(next!.nextExerciseLogId).toBe('el-pullup');
    expect(next!.nextSetNumber).toBe(1);
    expect(next!.isRoundComplete).toBe(false);
    expect(next!.roundNumber).toBe(1);
  });

  it('completes the round when the last exercise in the superset finishes', () => {
    const exercises = [exerciseA1, exerciseA2, standaloneEx];
    // Completed Set 1 on Pullup (A2) -> Completes round 1, next is Bench (A1) Set 2
    const next = SupersetEngine.getNextTarget('el-pullup', 1, exercises);

    expect(next).not.toBeNull();
    expect(next!.nextExerciseLogId).toBe('el-bench');
    expect(next!.nextSetNumber).toBe(2);
    expect(next!.isRoundComplete).toBe(true);
    expect(next!.roundNumber).toBe(1);
  });

  it('evaluates group completion state correctly', () => {
    const uncompletedExA1 = { ...exerciseA1, sets: mockSets(2, false) };
    const uncompletedExA2 = { ...exerciseA2, sets: mockSets(2, false) };
    expect(SupersetEngine.isGroupFullyCompleted('SS-1', [uncompletedExA1, uncompletedExA2])).toBe(false);

    const completedExA1 = { ...exerciseA1, sets: mockSets(2, true) };
    const completedExA2 = { ...exerciseA2, sets: mockSets(2, true) };
    expect(SupersetEngine.isGroupFullyCompleted('SS-1', [completedExA1, completedExA2])).toBe(true);
  });
});
