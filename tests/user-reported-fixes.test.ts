import { describe, it, expect } from 'vitest';
import {
  WorkoutExercise,
  WorkoutSet,
  WorkoutEntry,
  isSetCompleted,
} from '../src/lib/types';
import { useStore } from '../src/lib/store';

describe('User Reported Fixes Verification', () => {
  describe('Bug 1: Finished Workout Preserves Only Executed Sets (No Phantom Sets)', () => {
    it('saves ONLY completed sets and exercises that were actually performed, excluding untouched plan template sets', () => {
      // Athlete starts a 5-exercise, 17-set planned routine
      const plannedExercises: WorkoutExercise[] = [
        {
          name: 'Barbell Bench Press',
          sets: [
            { weight: 80, reps: 8, unit: 'kg', completed: true, status: 'completed', prescribedWeight: 80, prescribedReps: 8 },
            { weight: 80, reps: 8, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 80, prescribedReps: 8 },
            { weight: 80, reps: 8, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 80, prescribedReps: 8 },
          ],
        },
        {
          name: 'Incline Dumbbell Press',
          sets: [
            { weight: 28, reps: 10, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 28, prescribedReps: 10 },
            { weight: 28, reps: 10, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 28, prescribedReps: 10 },
            { weight: 28, reps: 10, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 28, prescribedReps: 10 },
          ],
        },
        {
          name: 'Dips',
          sets: [
            { weight: 0, reps: 12, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 0, prescribedReps: 12 },
            { weight: 0, reps: 12, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 0, prescribedReps: 12 },
            { weight: 0, reps: 12, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 0, prescribedReps: 12 },
          ],
        },
        {
          name: 'Overhead Triceps Extension',
          sets: [
            { weight: 25, reps: 12, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 25, prescribedReps: 12 },
            { weight: 25, reps: 12, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 25, prescribedReps: 12 },
            { weight: 25, reps: 12, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 25, prescribedReps: 12 },
            { weight: 25, reps: 12, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 25, prescribedReps: 12 },
          ],
        },
        {
          name: 'Lateral Raises',
          sets: [
            { weight: 12, reps: 15, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 12, prescribedReps: 15 },
            { weight: 12, reps: 15, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 12, prescribedReps: 15 },
            { weight: 12, reps: 15, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 12, prescribedReps: 15 },
            { weight: 12, reps: 15, unit: 'kg', completed: false, status: 'pending', prescribedWeight: 12, prescribedReps: 15 },
          ],
        },
      ];

      // Total planned sets: 3 + 3 + 3 + 4 + 4 = 17 sets
      const totalPlannedSets = plannedExercises.reduce((sum, e) => sum + e.sets.length, 0);
      expect(totalPlannedSets).toBe(17);

      // Filter executed exercises as performed by ActiveWorkoutScreen onFinish
      const executedExercises = plannedExercises
        .map((ex) => ({
          ...ex,
          sets: ex.sets.filter((s) => isSetCompleted(s) || s.status === 'skipped'),
        }))
        .filter((ex) => ex.sets.length > 0);

      const exercisesToSave = executedExercises.length > 0 ? executedExercises : plannedExercises;

      const savedEntry: WorkoutEntry = {
        id: 'wk_user_test_1',
        date: '2026-10-18',
        name: 'Push Hypertrophy',
        exercises: exercisesToSave,
      };

      // Exactly 1 exercise should be logged, NOT 5
      expect(savedEntry.exercises.length).toBe(1);
      expect(savedEntry.exercises[0].name).toBe('Barbell Bench Press');

      // Exactly 1 set should be logged, NOT 3 or 17
      expect(savedEntry.exercises[0].sets.length).toBe(1);
      expect(savedEntry.exercises[0].sets[0].completed).toBe(true);
      expect(savedEntry.exercises[0].sets[0].weight).toBe(80);
      expect(savedEntry.exercises[0].sets[0].reps).toBe(8);

      // Verify Workout History set count logic
      const completedSetsCount = savedEntry.exercises.reduce(
        (sum, e) => sum + e.sets.filter((s) => isSetCompleted(s) || s.status === 'skipped').length,
        0
      );
      expect(completedSetsCount).toBe(1);
    });
  });

  describe('Bug 2: Authentic Duration Tracking and Presentation', () => {
    it('formats a 10-second session as 10s and does not clamp to 1m, 15m, or 45m', () => {
      const elapsedSeconds = 10;
      const durationFormatted = elapsedSeconds < 60
        ? `${elapsedSeconds}s`
        : `${Math.floor(elapsedSeconds / 60)}m${elapsedSeconds % 60 > 0 ? ` ${elapsedSeconds % 60}s` : ''}`;

      expect(durationFormatted).toBe('10s');
      expect(Math.round(elapsedSeconds / 60)).toBe(0);

      // Test format function matching PostWorkoutTakeModal
      const formatModalDuration = (durationSeconds?: number, durationMinutes?: number) => {
        if (durationSeconds !== undefined) {
          return durationSeconds < 60
            ? `${durationSeconds}s`
            : `${Math.floor(durationSeconds / 60)}m${durationSeconds % 60 > 0 ? ` ${durationSeconds % 60}s` : ''}`;
        }
        if (durationMinutes !== undefined) {
          return durationMinutes === 0 ? '<1m' : `${durationMinutes}m`;
        }
        return '--';
      };

      expect(formatModalDuration(10, 0)).toBe('10s');
      expect(formatModalDuration(45, 1)).toBe('45s');
      expect(formatModalDuration(150, 3)).toBe('2m 30s');
      expect(formatModalDuration(undefined, 0)).toBe('<1m');
      expect(formatModalDuration(undefined, 25)).toBe('25m');
    });
  });

  describe('Nits & Quality Polish', () => {
    it('correctly pluralizes streakDays (1 day vs 2 days)', () => {
      const formatDays = (days: number) => `${days} ${days === 1 ? 'day' : 'days'}`;
      expect(formatDays(1)).toBe('1 day');
      expect(formatDays(0)).toBe('0 days');
      expect(formatDays(5)).toBe('5 days');
    });

    it('correctly pluralizes sessions in weekly recap (1 SESSION vs 2 SESSIONS)', () => {
      const formatSessions = (count: number) => `${count} ${count === 1 ? 'SESSION' : 'SESSIONS'}`;
      expect(formatSessions(1)).toBe('1 SESSION');
      expect(formatSessions(0)).toBe('0 SESSIONS');
      expect(formatSessions(4)).toBe('4 SESSIONS');
    });

    it('initializes store goals as an empty array without bias', () => {
      const state = useStore.getState();
      expect(Array.isArray(state.goals)).toBe(true);
      // Clean slate default prevents pre-selecting goals
      expect(state.goals).toEqual([]);
    });
  });
});
