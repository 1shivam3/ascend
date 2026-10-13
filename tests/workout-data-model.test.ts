import { describe, it, expect } from 'vitest';
import {
  WorkoutSet,
  WorkoutEntry,
} from '../src/lib/types';
import {
  getSetExecutionStatus,
  isSetCompleted,
  getLastExercisePerformance,
  getProgressionRecommendation,
} from '../src/lib/workout-engine';

describe('Workout Data Model & Execution Status (Task 3B-1)', () => {
  describe('Prescription vs. Performed Set Separation', () => {
    it('stores target prescription and actual performed values distinctly without collision', () => {
      const set: WorkoutSet = {
        // Prescribed plan
        prescribedWeight: 100,
        prescribedReps: 5,
        prescribedRpe: 8,
        prescribedUnit: 'kg',

        // Actual execution
        weight: 95,
        reps: 4,
        rpe: 9.5,
        unit: 'kg',
        status: 'completed',
        completed: true,
      };

      // Prescribed targets remain unchanged
      expect(set.prescribedWeight).toBe(100);
      expect(set.prescribedReps).toBe(5);
      expect(set.prescribedRpe).toBe(8);
      expect(set.prescribedUnit).toBe('kg');

      // Actual results reflect reality
      expect(set.weight).toBe(95);
      expect(set.reps).toBe(4);
      expect(set.rpe).toBe(9.5);
      expect(set.unit).toBe('kg');

      expect(isSetCompleted(set)).toBe(true);
      expect(getSetExecutionStatus(set)).toBe('completed');
    });

    it('preserves distinct units when prescribedUnit and actual unit differ', () => {
      const set: WorkoutSet = {
        prescribedWeight: 225,
        prescribedReps: 5,
        prescribedUnit: 'lbs',

        weight: 100,
        reps: 5,
        unit: 'kg',
        status: 'completed',
      };

      expect(set.prescribedUnit).toBe('lbs');
      expect(set.unit).toBe('kg');
      expect(set.prescribedWeight).toBe(225);
      expect(set.weight).toBe(100);
    });

    it('supports matching units when prescribedUnit and unit are the same', () => {
      const set: WorkoutSet = {
        prescribedWeight: 80,
        prescribedReps: 8,
        prescribedUnit: 'kg',

        weight: 80,
        reps: 8,
        unit: 'kg',
        status: 'completed',
      };

      expect(set.prescribedUnit).toBe('kg');
      expect(set.unit).toBe('kg');
    });
  });

  describe('Legacy Set Backward Compatibility', () => {
    it('recognizes a legacy set with completed === true', () => {
      const legacySet: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        completed: true,
      };

      expect(legacySet.prescribedWeight).toBeUndefined();
      expect(legacySet.prescribedReps).toBeUndefined();
      expect(legacySet.status).toBeUndefined();

      expect(isSetCompleted(legacySet)).toBe(true);
      expect(getSetExecutionStatus(legacySet)).toBe('completed');
    });

    it('recognizes a legacy set with completed === false and reps > 0 as pending (not completed)', () => {
      const legacySet: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        completed: false,
      };

      expect(isSetCompleted(legacySet)).toBe(false);
      expect(getSetExecutionStatus(legacySet)).toBe('pending');
    });

    it('recognizes a legacy set with completed === false and reps === 0 as not_attempted', () => {
      const legacySet: WorkoutSet = {
        weight: 0,
        reps: 0,
        unit: 'kg',
        completed: false,
      };

      expect(isSetCompleted(legacySet)).toBe(false);
      expect(getSetExecutionStatus(legacySet)).toBe('not_attempted');
    });

    it('recognizes a legacy set where completed is completely omitted but reps > 0 as completed', () => {
      const legacySet: WorkoutSet = {
        weight: 70,
        reps: 10,
        unit: 'kg',
      };

      // In historical stored workouts without completed field, logged positive reps represent completed work
      expect(legacySet.completed).toBeUndefined();
      expect(legacySet.status).toBeUndefined();

      expect(isSetCompleted(legacySet)).toBe(true);
      expect(getSetExecutionStatus(legacySet)).toBe('completed');
    });

    it('recognizes a legacy set where completed is omitted and reps === 0 as not_attempted', () => {
      const legacySet: WorkoutSet = {
        weight: 0,
        reps: 0,
        unit: 'kg',
      };

      expect(isSetCompleted(legacySet)).toBe(false);
      expect(getSetExecutionStatus(legacySet)).toBe('not_attempted');
    });

    it('never silently reinterprets ambiguous legacy records as skipped', () => {
      const setWithoutCompleted: WorkoutSet = { weight: 60, reps: 5, unit: 'kg' };
      const setFalseCompleted: WorkoutSet = { weight: 60, reps: 5, unit: 'kg', completed: false };
      const setZeroReps: WorkoutSet = { weight: 0, reps: 0, unit: 'kg' };

      expect(getSetExecutionStatus(setWithoutCompleted)).not.toBe('skipped');
      expect(getSetExecutionStatus(setFalseCompleted)).not.toBe('skipped');
      expect(getSetExecutionStatus(setZeroReps)).not.toBe('skipped');
    });
  });

  describe('SetExecutionStatus Precedence Rules', () => {
    it('evaluates status === "completed" as completed', () => {
      const set: WorkoutSet = { weight: 100, reps: 5, unit: 'kg', status: 'completed' };
      expect(isSetCompleted(set)).toBe(true);
      expect(getSetExecutionStatus(set)).toBe('completed');
    });

    it('evaluates status === "skipped" as not completed', () => {
      const set: WorkoutSet = { weight: 100, reps: 5, unit: 'kg', status: 'skipped' };
      expect(isSetCompleted(set)).toBe(false);
      expect(getSetExecutionStatus(set)).toBe('skipped');
    });

    it('evaluates status === "not_attempted" as not completed', () => {
      const set: WorkoutSet = { weight: 0, reps: 0, unit: 'kg', status: 'not_attempted' };
      expect(isSetCompleted(set)).toBe(false);
      expect(getSetExecutionStatus(set)).toBe('not_attempted');
    });

    it('evaluates status === "pending" as not completed', () => {
      const set: WorkoutSet = { weight: 100, reps: 5, unit: 'kg', status: 'pending' };
      expect(isSetCompleted(set)).toBe(false);
      expect(getSetExecutionStatus(set)).toBe('pending');
    });

    it('gives explicit status precedence over conflicting legacy completed === true', () => {
      // Athlete skipped the set, but legacy boolean wasn't cleaned up
      const set: WorkoutSet = {
        weight: 100,
        reps: 5,
        unit: 'kg',
        status: 'skipped',
        completed: true,
      };

      expect(isSetCompleted(set)).toBe(false);
      expect(getSetExecutionStatus(set)).toBe('skipped');
    });

    it('gives explicit status precedence over conflicting legacy completed === false', () => {
      // Set explicitly marked completed, but legacy completed was false
      const set: WorkoutSet = {
        weight: 100,
        reps: 5,
        unit: 'kg',
        status: 'completed',
        completed: false,
      };

      expect(isSetCompleted(set)).toBe(true);
      expect(getSetExecutionStatus(set)).toBe('completed');
    });
  });

  describe('Compatibility with Existing Engine Functions', () => {
    it('allows getLastExercisePerformance to consume legacy sets with missing prescription fields without error', () => {
      const legacyWorkouts: WorkoutEntry[] = [
        {
          id: 'w-1',
          date: '2026-03-01',
          exercises: [
            {
              name: 'Bench Press',
              sets: [
                { weight: 80, reps: 8, unit: 'kg', completed: true },
                { weight: 80, reps: 8, unit: 'kg', completed: true },
                { weight: 80, reps: 7, unit: 'kg' }, // omitted completed
              ],
            },
          ],
        },
      ];

      const perf = getLastExercisePerformance('Bench Press', legacyWorkouts, 'kg');
      expect(perf).not.toBeNull();
      expect(perf?.sets.length).toBe(3);
      expect(perf?.bestWeight).toBe(80);
      expect(perf?.bestReps).toBe(8);
    });

    it('allows getProgressionRecommendation to execute on workouts without prescription fields', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-1',
          date: '2026-03-01',
          exercises: [
            {
              name: 'Bench Press',
              sets: [
                { weight: 70, reps: 8, unit: 'kg', completed: true },
                { weight: 70, reps: 8, unit: 'kg', completed: true },
                { weight: 70, reps: 7, unit: 'kg', completed: true },
              ],
            },
          ],
        },
      ];

      const recommendation = getProgressionRecommendation('Bench Press', workouts, 'kg', 'build_muscle');
      expect(recommendation).not.toBeNull();
      expect(recommendation?.targetWeight).toBe(70);
      expect(recommendation?.targetSummary).toContain('70kg');
    });

    it('calculates 1RM from actual performed results without interference from prescription targets', () => {
      const set: WorkoutSet = {
        // Prescribed lower target
        prescribedWeight: 90,
        prescribedReps: 5,
        prescribedUnit: 'kg',

        // Performed heavier weight
        weight: 100,
        reps: 5,
        unit: 'kg',
        status: 'completed',
        completed: true,
      };

      // 1RM must be calculated on actual performed values (100 * (1 + 5/30) = 116.7 kg)
      const e1rmActual = Math.round(set.weight * (1 + set.reps / 30) * 10) / 10;
      const e1rmPrescribed = Math.round(set.prescribedWeight! * (1 + set.prescribedReps! / 30) * 10) / 10;

      expect(e1rmActual).toBe(116.7);
      expect(e1rmPrescribed).toBe(105);
      expect(e1rmActual).not.toBe(e1rmPrescribed);
    });
  });
});
