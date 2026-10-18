import { describe, it, expect } from 'vitest';
import { getExecutedExercises } from '../src/lib/workout-engine';
import { WorkoutExercise } from '../src/lib/types';

const set = (overrides: Partial<WorkoutExercise['sets'][number]> = {}) => ({
  reps: 8,
  weight: 40,
  unit: 'kg' as const,
  ...overrides,
});

describe('History records only executed sets (bug: full plan was logged)', () => {
  it('keeps completed sets and drops unattempted planned sets', () => {
    const exercises: WorkoutExercise[] = [
      {
        name: 'Bench Press',
        sets: [
          set({ status: 'completed', completed: true }),
          set({ status: 'pending', completed: false }),
          set({ status: 'pending', completed: false }),
          set({ status: 'pending', completed: false }),
        ],
      },
    ];
    const result = getExecutedExercises(exercises);
    expect(result).toHaveLength(1);
    expect(result[0].sets).toHaveLength(1);
  });

  it('returns zero sets (not the full plan) when nothing was completed', () => {
    const exercises: WorkoutExercise[] = [
      {
        name: 'Bench Press',
        sets: Array.from({ length: 4 }, () => set({ status: 'pending', completed: false })),
      },
      {
        name: 'Squat',
        sets: Array.from({ length: 4 }, () => set({ status: 'pending', completed: false })),
      },
    ];
    // The old code fell back to saving the full 8 planned sets here.
    expect(getExecutedExercises(exercises)).toEqual([]);
  });

  it('preserves explicitly skipped sets with their status', () => {
    const exercises: WorkoutExercise[] = [
      {
        name: 'Bench Press',
        sets: [
          set({ status: 'completed', completed: true }),
          set({ status: 'skipped' }),
          set({ status: 'pending', completed: false }),
        ],
      },
    ];
    const result = getExecutedExercises(exercises);
    expect(result[0].sets).toHaveLength(2);
    expect(result[0].sets[1].status).toBe('skipped');
  });

  it('drops exercises left with no executed sets', () => {
    const exercises: WorkoutExercise[] = [
      {
        name: 'Bench Press',
        sets: [set({ status: 'completed', completed: true })],
      },
      {
        name: 'Squat',
        sets: [set({ status: 'pending', completed: false })],
      },
    ];
    const result = getExecutedExercises(exercises);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bench Press');
  });

  it('handles empty input', () => {
    expect(getExecutedExercises([])).toEqual([]);
  });
});
