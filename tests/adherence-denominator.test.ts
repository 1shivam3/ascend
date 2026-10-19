import { describe, it, expect } from 'vitest';
import { calculateWorkoutAdherence } from '@/lib/workout-adherence';
import { WorkoutEntry } from '@/lib/types';

/**
 * Regression: finishing a workout early must NOT re-baseline the completion
 * metric. 1 completed set out of 18 planned must read 1/18 (~5.6%), never 100%.
 */
function prescribedSet(completed: boolean) {
  return {
    weight: 35, reps: 8, unit: 'kg' as const,
    prescribedReps: 8, prescribedWeight: 35,
    completed,
  };
}

describe('Adherence honest denominator (plannedTotalSets)', () => {
  it('reports 1/18 instead of 100% when a session is cut short', () => {
    const workout: WorkoutEntry = {
      id: 'w1',
      date: '2026-10-19',
      name: 'Upper A',
      planId: 'p1',
      plannedTotalSets: 18,
      exercises: [
        { name: 'Bench Press', sets: [prescribedSet(true)] } as any,
      ],
    };
    const s = calculateWorkoutAdherence(workout);
    expect(s.totalPrescribedSets).toBe(18);
    expect(s.completedPrescribedSets).toBe(1);
    expect(s.notAttemptedPrescribedSets).toBe(17);
    expect(s.setCompletionPercentage).toBeCloseTo(5.6, 1);
  });

  it('leaves full sessions untouched', () => {
    const workout: WorkoutEntry = {
      id: 'w2',
      date: '2026-10-19',
      plannedTotalSets: 2,
      exercises: [
        { name: 'Bench Press', sets: [prescribedSet(true), prescribedSet(true)] } as any,
      ],
    };
    const s = calculateWorkoutAdherence(workout);
    expect(s.totalPrescribedSets).toBe(2);
    expect(s.setCompletionPercentage).toBe(100);
  });

  it('ignores plannedTotalSets when it is smaller than logged (no shrink)', () => {
    const workout: WorkoutEntry = {
      id: 'w3',
      date: '2026-10-19',
      plannedTotalSets: 1,
      exercises: [
        { name: 'Bench Press', sets: [prescribedSet(true), prescribedSet(true)] } as any,
      ],
    };
    const s = calculateWorkoutAdherence(workout);
    expect(s.totalPrescribedSets).toBe(2);
    expect(s.setCompletionPercentage).toBe(100);
  });

  it('works without plannedTotalSets (legacy entries)', () => {
    const workout: WorkoutEntry = {
      id: 'w4',
      date: '2026-10-19',
      exercises: [
        { name: 'Bench Press', sets: [prescribedSet(true)] } as any,
      ],
    };
    const s = calculateWorkoutAdherence(workout);
    expect(s.totalPrescribedSets).toBe(1);
  });
});
