import { describe, it, expect } from 'vitest';
import {
  WorkoutSet,
  WorkoutExercise,
  WorkoutEntry,
  SetExecutionStatus,
} from '../src/lib/types';
import {
  getSetExecutionStatus,
  isSetCompleted,
  isActiveSetCompleted,
  getProgressionRecommendation,
  getLastExercisePerformance,
  finalizeWorkoutSet,
  finalizeWorkoutExercises,
  shouldPreserveWorkoutSet,
} from '../src/lib/workout-engine';
import { getExerciseHistorySessions } from '../src/lib/lifter-twin';
import { ActiveWorkoutDraft } from '../src/lib/store';

describe('Active Workout Flow & Prescription Preservation (Task 3B-2 & 3B-2A)', () => {
  describe('Prescription Immutability during Working Edits', () => {
    it('preserves the original prescription when the athlete edits working weight and reps', () => {
      // 1. Initial planned set created from coach or routine target
      const plannedSet: WorkoutSet = {
        prescribedWeight: 80,
        prescribedReps: 8,
        prescribedRpe: 8,
        prescribedUnit: 'kg',
        weight: 80,
        reps: 8,
        unit: 'kg',
        status: 'pending',
        completed: false,
      };

      // 2. Athlete modifies the working values in the gym (e.g. fatigue or heavier bar)
      const editedSet: WorkoutSet = {
        ...plannedSet,
        weight: 75,
        reps: 6,
        rpe: 9,
      };

      // Working values are updated
      expect(editedSet.weight).toBe(75);
      expect(editedSet.reps).toBe(6);
      expect(editedSet.rpe).toBe(9);

      // Prescriptions remain strictly unchanged
      expect(editedSet.prescribedWeight).toBe(80);
      expect(editedSet.prescribedReps).toBe(8);
      expect(editedSet.prescribedRpe).toBe(8);
      expect(editedSet.prescribedUnit).toBe('kg');
    });
  });

  describe('Pending Status on New Sets', () => {
    it('initializes new planned sets with explicit status "pending"', () => {
      const set: WorkoutSet = {
        weight: 60,
        reps: 8,
        unit: 'kg',
        completed: false,
        status: 'pending',
        prescribedWeight: 60,
        prescribedReps: 8,
        prescribedRpe: 8,
        prescribedUnit: 'kg',
      };

      expect(set.status).toBe('pending');
      expect(set.completed).toBe(false);
      expect(isActiveSetCompleted(set)).toBe(false);
      expect(isSetCompleted(set)).toBe(false);
      expect(getSetExecutionStatus(set)).toBe('pending');
    });
  });

  describe('Set Completion and Status Recording', () => {
    it('records status "completed" and updates completed boolean when marked done', () => {
      const pendingSet: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        completed: false,
        status: 'pending',
        prescribedWeight: 80,
        prescribedReps: 8,
        prescribedUnit: 'kg',
      };

      // Athlete marks set complete
      const completedSet: WorkoutSet = {
        ...pendingSet,
        completed: true,
        status: 'completed',
      };

      expect(completedSet.completed).toBe(true);
      expect(completedSet.status).toBe('completed');
      expect(isActiveSetCompleted(completedSet)).toBe(true);
      expect(isSetCompleted(completedSet)).toBe(true);
      expect(getSetExecutionStatus(completedSet)).toBe('completed');
      // Prescription is still intact
      expect(completedSet.prescribedWeight).toBe(80);
      expect(completedSet.prescribedReps).toBe(8);
    });

    it('returns to status "pending" when a completed set is untoggled', () => {
      const completedSet: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        completed: true,
        status: 'completed',
        prescribedWeight: 80,
        prescribedReps: 8,
      };

      // Untoggle
      const untoggledSet: WorkoutSet = {
        ...completedSet,
        completed: false,
        status: 'pending',
      };

      expect(untoggledSet.completed).toBe(false);
      expect(untoggledSet.status).toBe('pending');
      expect(isActiveSetCompleted(untoggledSet)).toBe(false);
      expect(isSetCompleted(untoggledSet)).toBe(false);
      expect(getSetExecutionStatus(untoggledSet)).toBe('pending');
    });
  });

  describe('Execution Status Precedence (Task 3B-2A Issue 1)', () => {
    it('treats status: "skipped" as NOT completed even if legacy completed: true is present', () => {
      const conflictingSet: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        status: 'skipped',
        completed: true, // conflicting legacy boolean
      };

      expect(isActiveSetCompleted(conflictingSet)).toBe(false);
      expect(isSetCompleted(conflictingSet)).toBe(false);
      expect(getSetExecutionStatus(conflictingSet)).toBe('skipped');
    });

    it('treats status: "pending" as NOT completed even if legacy completed: true is present', () => {
      const conflictingSet: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        status: 'pending',
        completed: true, // conflicting legacy boolean
      };

      expect(isActiveSetCompleted(conflictingSet)).toBe(false);
      expect(isSetCompleted(conflictingSet)).toBe(false);
      expect(getSetExecutionStatus(conflictingSet)).toBe('pending');
    });

    it('treats status: "not_attempted" as NOT completed even if legacy completed: true is present', () => {
      const conflictingSet: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        status: 'not_attempted',
        completed: true, // conflicting legacy boolean
      };

      expect(isActiveSetCompleted(conflictingSet)).toBe(false);
      expect(isSetCompleted(conflictingSet)).toBe(false);
      expect(getSetExecutionStatus(conflictingSet)).toBe('not_attempted');
    });

    it('treats status: "completed" as completed even if legacy completed: false is mistakenly present', () => {
      const conflictingSet: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        status: 'completed',
        completed: false, // conflicting legacy boolean
      };

      expect(isActiveSetCompleted(conflictingSet)).toBe(true);
      expect(isSetCompleted(conflictingSet)).toBe(true);
      expect(getSetExecutionStatus(conflictingSet)).toBe('completed');
    });

    it('falls back to legacy completed boolean when status is omitted', () => {
      const legacyCompletedSet: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        completed: true,
      };
      const legacyIncompleteSet: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        completed: false,
      };

      expect(isActiveSetCompleted(legacyCompletedSet)).toBe(true);
      expect(isSetCompleted(legacyCompletedSet)).toBe(true);
      expect(getSetExecutionStatus(legacyCompletedSet)).toBe('completed');

      expect(isActiveSetCompleted(legacyIncompleteSet)).toBe(false);
      expect(isSetCompleted(legacyIncompleteSet)).toBe(false);
      expect(getSetExecutionStatus(legacyIncompleteSet)).toBe('pending');
    });

    it('does NOT infer completion in active drafts from positive weight and reps when status and completed are absent', () => {
      const ambiguousSet: WorkoutSet = {
        weight: 100,
        reps: 5,
        unit: 'kg',
      };

      // In an active workout session draft, an entered/prefilled set without completed=true is NOT done
      expect(isActiveSetCompleted(ambiguousSet)).toBe(false);
      // For stored historical records, isSetCompleted retains backward compatibility
      expect(isSetCompleted(ambiguousSet)).toBe(true);
      expect(getSetExecutionStatus(ambiguousSet)).toBe('completed');
    });
  });

  describe('Draft Resumption Without Prescription Fabrication (Task 3B-2A Issue 2)', () => {
    it('leaves prescribedWeight and prescribedReps undefined when resuming legacy drafts lacking prescriptions', () => {
      const legacyDraft: ActiveWorkoutDraft = {
        date: '2026-09-01',
        name: 'Legacy Push Day',
        savedAt: '2026-09-01T10:00:00.000Z',
        exercises: [
          {
            name: 'Overhead Press',
            sets: [
              { weight: 50, reps: 8, unit: 'kg', completed: true },
              { weight: 52.5, reps: 6, unit: 'kg', completed: false },
            ],
          },
        ],
      };

      // Resumption logic matching ActiveWorkoutScreen initializer
      const resumedExercises = legacyDraft.exercises.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({
          ...s,
          // CRITICAL: NEVER fabricate prescriptions from working weight/reps!
          prescribedWeight: s.prescribedWeight !== undefined ? s.prescribedWeight : undefined,
          prescribedReps: s.prescribedReps !== undefined ? s.prescribedReps : undefined,
          prescribedRpe: s.prescribedRpe !== undefined ? s.prescribedRpe : undefined,
          prescribedUnit: s.prescribedUnit !== undefined ? s.prescribedUnit : undefined,
          status: s.status || (isActiveSetCompleted(s) ? 'completed' : 'pending'),
          completed: isActiveSetCompleted(s),
        })),
      }));

      const set1 = resumedExercises[0].sets[0];
      const set2 = resumedExercises[0].sets[1];

      // Prescriptions MUST be undefined - NOT fabricated from weight: 50 or 52.5
      expect(set1.prescribedWeight).toBeUndefined();
      expect(set1.prescribedReps).toBeUndefined();
      expect(set1.prescribedRpe).toBeUndefined();
      expect(set1.prescribedUnit).toBeUndefined();
      expect(set1.weight).toBe(50);
      expect(set1.reps).toBe(8);
      expect(set1.status).toBe('completed');

      expect(set2.prescribedWeight).toBeUndefined();
      expect(set2.prescribedReps).toBeUndefined();
      expect(set2.weight).toBe(52.5);
      expect(set2.reps).toBe(6);
      expect(set2.status).toBe('pending');
    });

    it('handles partial prescriptions deliberately without fabricating missing fields', () => {
      // Draft where user only had prescribed reps (e.g. bodyweight or rep goal), or only prescribed weight
      const partialDraft: ActiveWorkoutDraft = {
        date: '2026-10-13',
        name: 'Pull Day',
        savedAt: new Date().toISOString(),
        exercises: [
          {
            name: 'Pull-ups',
            sets: [
              {
                weight: 0,
                reps: 10,
                unit: 'kg',
                completed: false,
                status: 'pending',
                // Partial: only prescribed reps given
                prescribedReps: 10,
                prescribedRpe: 8,
              },
              {
                weight: 70,
                reps: 6,
                unit: 'kg',
                completed: false,
                status: 'pending',
                // Partial: only prescribed weight given
                prescribedWeight: 70,
              },
            ],
          },
        ],
      };

      const resumedExercises = partialDraft.exercises.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({
          ...s,
          prescribedWeight: s.prescribedWeight !== undefined ? s.prescribedWeight : undefined,
          prescribedReps: s.prescribedReps !== undefined ? s.prescribedReps : undefined,
          prescribedRpe: s.prescribedRpe !== undefined ? s.prescribedRpe : undefined,
          prescribedUnit: s.prescribedUnit !== undefined ? s.prescribedUnit : undefined,
          status: s.status || (isActiveSetCompleted(s) ? 'completed' : 'pending'),
          completed: isActiveSetCompleted(s),
        })),
      }));

      const set1 = resumedExercises[0].sets[0];
      const set2 = resumedExercises[0].sets[1];

      // Set 1: prescribedReps is preserved, prescribedWeight is kept undefined (NOT fabricated from weight: 0)
      expect(set1.prescribedReps).toBe(10);
      expect(set1.prescribedRpe).toBe(8);
      expect(set1.prescribedWeight).toBeUndefined();

      // Set 2: prescribedWeight is preserved, prescribedReps is kept undefined (NOT fabricated from reps: 6)
      expect(set2.prescribedWeight).toBe(70);
      expect(set2.prescribedReps).toBeUndefined();
    });

    it('preserves existing full prescriptions exactly across serialization and resumption', () => {
      const draft: ActiveWorkoutDraft = {
        date: '2026-10-13',
        name: 'Upper Body A',
        startedFromPlan: 'Upper Body A',
        sessionStartTime: 1770000000000,
        savedAt: new Date().toISOString(),
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              {
                prescribedWeight: 80,
                prescribedReps: 8,
                prescribedRpe: 8,
                prescribedUnit: 'kg',
                weight: 75, // edited working value
                reps: 6,   // edited working value
                unit: 'kg',
                status: 'completed',
                completed: true,
              },
            ],
          },
        ],
      };

      const serialized = JSON.stringify(draft);
      const deserialized: ActiveWorkoutDraft = JSON.parse(serialized);

      const resumedExercises = deserialized.exercises.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({
          ...s,
          prescribedWeight: s.prescribedWeight !== undefined ? s.prescribedWeight : undefined,
          prescribedReps: s.prescribedReps !== undefined ? s.prescribedReps : undefined,
          prescribedRpe: s.prescribedRpe !== undefined ? s.prescribedRpe : undefined,
          prescribedUnit: s.prescribedUnit !== undefined ? s.prescribedUnit : undefined,
          status: s.status || (isActiveSetCompleted(s) ? 'completed' : 'pending'),
          completed: isActiveSetCompleted(s),
        })),
      }));

      const set = resumedExercises[0].sets[0];
      expect(set.weight).toBe(75);
      expect(set.reps).toBe(6);
      expect(set.prescribedWeight).toBe(80);
      expect(set.prescribedReps).toBe(8);
      expect(set.prescribedRpe).toBe(8);
      expect(set.prescribedUnit).toBe('kg');
    });
  });

  describe('Prefilled But Unfinished Sets Audit', () => {
    it('does not treat a prefilled but uncompleted set as completed merely because weight and reps exist', () => {
      const prefilledSet: WorkoutSet = {
        weight: 100,
        reps: 5,
        unit: 'kg',
        completed: false,
        status: 'pending',
        prescribedWeight: 100,
        prescribedReps: 5,
      };

      // Even though weight > 0 and reps > 0, it is NOT completed
      expect(isActiveSetCompleted(prefilledSet)).toBe(false);
      expect(isSetCompleted(prefilledSet)).toBe(false);
      expect(getSetExecutionStatus(prefilledSet)).toBe('pending');

      const workoutExercise: WorkoutExercise = {
        name: 'Squat',
        sets: [
          { weight: 100, reps: 5, unit: 'kg', completed: true, status: 'completed', prescribedWeight: 100, prescribedReps: 5 },
          prefilledSet, // unfinished
        ],
      };

      const finalCompletedSets = workoutExercise.sets.filter(isActiveSetCompleted);
      expect(finalCompletedSets.length).toBe(1);
      expect(finalCompletedSets[0].weight).toBe(100);
      expect(finalCompletedSets.includes(prefilledSet)).toBe(false);
    });
  });

  describe('Unit Switching and Isolation', () => {
    it('does not mutate or corrupt the original prescription when displayed unit differs', () => {
      const set: WorkoutSet = {
        prescribedWeight: 100,
        prescribedReps: 5,
        prescribedRpe: 8,
        prescribedUnit: 'kg',

        // Working performance in lbs
        weight: 220,
        reps: 5,
        unit: 'lbs',
        status: 'completed',
        completed: true,
      };

      expect(set.prescribedUnit).toBe('kg');
      expect(set.prescribedWeight).toBe(100);
      expect(set.unit).toBe('lbs');
      expect(set.weight).toBe(220);

      // Normalization comparison: 220 lbs * 0.453592 = 99.79 kg
      const actualWeightKg = Math.round(set.weight! * 0.453592 * 10) / 10;
      expect(actualWeightKg).toBe(99.8);
      // Prescribed weight in kg is untouched
      expect(set.prescribedWeight).toBe(100);
    });
  });

  describe('Preservation of Skipped and Unfinished Sets on Finalization (Task 3B-3 & 3B-3A)', () => {
    it('1. verifies the 4-set production finalization scenario (Sets 1&2 completed, Set 3 skipped, Set 4 pending)', () => {
      const exercise: WorkoutExercise = {
        name: 'Bench Press',
        sets: [
          {
            weight: 80,
            reps: 8,
            unit: 'kg',
            status: 'completed',
            completed: true,
            prescribedWeight: 80,
            prescribedReps: 8,
            prescribedRpe: 8,
            prescribedUnit: 'kg',
          },
          {
            weight: 82.5,
            reps: 7,
            unit: 'kg',
            status: 'completed',
            completed: true,
            prescribedWeight: 80,
            prescribedReps: 8,
            prescribedRpe: 8,
            prescribedUnit: 'kg',
          },
          {
            weight: 80,
            reps: 8,
            unit: 'kg',
            status: 'skipped',
            completed: false,
            prescribedWeight: 80,
            prescribedReps: 8,
            prescribedRpe: 8,
            prescribedUnit: 'kg',
          },
          {
            weight: 80,
            reps: 8,
            unit: 'kg',
            status: 'pending',
            completed: false,
            prescribedWeight: 80,
            prescribedReps: 8,
            prescribedRpe: 8,
            prescribedUnit: 'kg',
          },
        ],
      };

      const { validExercises, hasCompletedSets, hasMeaningfulData } = finalizeWorkoutExercises([exercise]);

      expect(hasMeaningfulData).toBe(true);
      expect(hasCompletedSets).toBe(true);
      expect(validExercises.length).toBe(1);

      const finalizedSets = validExercises[0].sets;
      expect(finalizedSets.length).toBe(4);

      // Set 1: Completed with original prescription and actual performance
      expect(finalizedSets[0].status).toBe('completed');
      expect(finalizedSets[0].completed).toBe(true);
      expect(finalizedSets[0].weight).toBe(80);
      expect(finalizedSets[0].reps).toBe(8);
      expect(finalizedSets[0].prescribedWeight).toBe(80);
      expect(finalizedSets[0].prescribedReps).toBe(8);
      expect(finalizedSets[0].prescribedRpe).toBe(8);
      expect(finalizedSets[0].prescribedUnit).toBe('kg');

      // Set 2: Completed with modified performance and original prescription
      expect(finalizedSets[1].status).toBe('completed');
      expect(finalizedSets[1].completed).toBe(true);
      expect(finalizedSets[1].weight).toBe(82.5);
      expect(finalizedSets[1].reps).toBe(7);
      expect(finalizedSets[1].prescribedWeight).toBe(80);
      expect(finalizedSets[1].prescribedReps).toBe(8);

      // Set 3: Explicitly skipped with completed boolean false
      expect(finalizedSets[2].status).toBe('skipped');
      expect(finalizedSets[2].completed).toBe(false);
      expect(finalizedSets[2].prescribedWeight).toBe(80);
      expect(finalizedSets[2].prescribedReps).toBe(8);

      // Set 4: Pending resolves to not_attempted with completed boolean false
      expect(finalizedSets[3].status).toBe('not_attempted');
      expect(finalizedSets[3].completed).toBe(false);
      expect(finalizedSets[3].prescribedWeight).toBe(80);
      expect(finalizedSets[3].prescribedReps).toBe(8);

      // Verify strict consistency between explicit status and legacy completed boolean
      for (const s of finalizedSets) {
        if (s.status === 'completed') {
          expect(s.completed).toBe(true);
        } else {
          expect(s.completed).toBe(false);
        }
      }
    });

    it('2. verifies the zero-completion case allows saving an interrupted planned workout', () => {
      const plannedWorkoutWithZeroCompletions: WorkoutExercise = {
        name: 'Squat',
        sets: [
          { weight: 100, reps: 5, unit: 'kg', status: 'pending', completed: false, prescribedWeight: 100, prescribedReps: 5 },
          { weight: 100, reps: 5, unit: 'kg', status: 'pending', completed: false, prescribedWeight: 100, prescribedReps: 5 },
          { weight: 100, reps: 5, unit: 'kg', status: 'pending', completed: false, prescribedWeight: 100, prescribedReps: 5 },
        ],
      };

      const { validExercises, hasCompletedSets, hasMeaningfulData } = finalizeWorkoutExercises([
        plannedWorkoutWithZeroCompletions,
      ]);

      // Meaningful planned session data exists, even though 0 were completed
      expect(hasMeaningfulData).toBe(true);
      expect(hasCompletedSets).toBe(false);
      expect(validExercises.length).toBe(1);

      // All sets are preserved as not_attempted with completed: false
      const sets = validExercises[0].sets;
      expect(sets.length).toBe(3);
      expect(sets.every((s) => s.status === 'not_attempted' && s.completed === false)).toBe(true);
      expect(sets.every((s) => s.prescribedWeight === 100 && s.prescribedReps === 5)).toBe(true);

      // Zero completed volume and no PRs can ever be generated
      const volume = sets
        .filter(isSetCompleted)
        .reduce((sum, s) => sum + (typeof s.weight === 'number' && Number.isFinite(s.weight) ? s.weight * s.reps : 0), 0);
      expect(volume).toBe(0);
    });

    it('3. verifies that a genuinely empty draft without prescriptions or reps is rejected', () => {
      // 1. Completely empty list
      const emptyResult = finalizeWorkoutExercises([]);
      expect(emptyResult.hasMeaningfulData).toBe(false);
      expect(emptyResult.validExercises.length).toBe(0);

      // 2. Exercise with blank placeholder rows (0 reps, 0 weight, no prescription, not completed)
      const placeholderExercise: WorkoutExercise = {
        name: 'Empty Exercise',
        sets: [
          { weight: 0, reps: 0, unit: 'kg', completed: false, status: 'pending' },
          { weight: 0, reps: 0, unit: 'kg', completed: false },
        ],
      };
      const placeholderResult = finalizeWorkoutExercises([placeholderExercise]);
      expect(placeholderResult.hasMeaningfulData).toBe(false);
      expect(placeholderResult.validExercises.length).toBe(0);
    });

    it('4. preserves explicitly skipped sets when all sets in a workout are skipped', () => {
      const allSkippedExercise: WorkoutExercise = {
        name: 'Deadlift',
        sets: [
          { weight: 140, reps: 5, unit: 'kg', status: 'skipped', completed: false, prescribedWeight: 140, prescribedReps: 5 },
          { weight: 140, reps: 5, unit: 'kg', status: 'skipped', completed: false, prescribedWeight: 140, prescribedReps: 5 },
        ],
      };

      const { validExercises, hasCompletedSets, hasMeaningfulData } = finalizeWorkoutExercises([
        allSkippedExercise,
      ]);

      expect(hasMeaningfulData).toBe(true);
      expect(hasCompletedSets).toBe(false);
      expect(validExercises.length).toBe(1);
      expect(validExercises[0].sets.every((s) => s.status === 'skipped' && s.completed === false)).toBe(true);
    });

    it('5. ensures unattempted and skipped sets do NOT contribute to volume, progression, or PR calculations', () => {
      const exercise: WorkoutExercise = {
        name: 'Bench Press',
        sets: [
          { weight: 100, reps: 5, unit: 'kg', status: 'completed', completed: true, prescribedWeight: 100, prescribedReps: 5 },
          { weight: 120, reps: 10, unit: 'kg', status: 'skipped', completed: false, prescribedWeight: 120, prescribedReps: 10 },
          { weight: 150, reps: 12, unit: 'kg', status: 'pending', completed: false, prescribedWeight: 150, prescribedReps: 12 },
        ],
      };

      const { validExercises } = finalizeWorkoutExercises([exercise]);
      const finalizedSets = validExercises[0].sets;

      // Volume calculation: only the 1 completed set counts
      const completedVolume = finalizedSets
        .filter(isSetCompleted)
        .reduce((acc, s) => acc + (typeof s.weight === 'number' && Number.isFinite(s.weight) ? s.weight * s.reps : 0), 0);
      expect(completedVolume).toBe(500); // 100 * 5 = 500, not 500 + 1200 + 1800

      const workoutEntry: WorkoutEntry = {
        id: 'wk_test_downstream',
        date: '2026-10-13',
        exercises: validExercises,
      };

      const lastPerf = getLastExercisePerformance('Bench Press', [workoutEntry]);
      expect(lastPerf).not.toBeNull();
      // Only the completed set should be extracted in sets
      expect(lastPerf?.sets.length).toBe(1);
      expect(lastPerf?.sets[0].weight).toBe(100);
      expect(lastPerf?.sets[0].reps).toBe(5);

      // Lifter twin historical performances
      const twinHistory = getExerciseHistorySessions('Bench Press', [workoutEntry]);
      expect(twinHistory.length).toBe(1);
      expect(twinHistory[0].bestWeight).toBe(100);
      expect(twinHistory[0].totalVolume).toBe(500);
    });

    it('6. keeps legacy workout records without status or prescription completely readable and valid', () => {
      const legacySets: WorkoutSet[] = [
        { weight: 90, reps: 5, unit: 'kg', completed: true },
        { weight: 90, reps: 5, unit: 'kg' }, // legacy record where completed was omitted but reps > 0
      ];

      for (const s of legacySets) {
        expect(isSetCompleted(s)).toBe(true);
        expect(getSetExecutionStatus(s)).toBe('completed');
      }

      const legacyWorkout: WorkoutEntry = {
        id: 'wk_legacy',
        date: '2026-09-01',
        exercises: [{ name: 'Squat', sets: legacySets }],
      };

      const perf = getLastExercisePerformance('Squat', [legacyWorkout]);
      expect(perf?.sets.length).toBe(2);
    });

    it('7. saves a fully completed workout normally without skipped sets', () => {
      const cleanExercise: WorkoutExercise = {
        name: 'Overhead Press',
        sets: [
          { weight: 70, reps: 10, unit: 'kg', status: 'completed', completed: true, prescribedWeight: 70, prescribedReps: 10 },
          { weight: 70, reps: 10, unit: 'kg', status: 'completed', completed: true, prescribedWeight: 70, prescribedReps: 10 },
          { weight: 70, reps: 10, unit: 'kg', status: 'completed', completed: true, prescribedWeight: 70, prescribedReps: 10 },
        ],
      };

      const { validExercises, hasCompletedSets } = finalizeWorkoutExercises([cleanExercise]);
      expect(hasCompletedSets).toBe(true);
      expect(validExercises[0].sets.length).toBe(3);
      expect(validExercises[0].sets.every((s) => s.status === 'completed' && s.completed)).toBe(true);
    });

    it('8. preserves unattempted and skipped sets in manual workout logging (handleSaveWorkout parity)', () => {
      const manualExercise: WorkoutExercise = {
        name: 'Barbell Row',
        sets: [
          { weight: 50, reps: 12, unit: 'kg', status: 'completed', completed: true },
          { weight: 50, reps: 12, unit: 'kg', status: 'skipped', completed: false, prescribedWeight: 50, prescribedReps: 12 },
          { weight: 50, reps: 12, unit: 'kg', status: 'pending', completed: false, prescribedWeight: 50, prescribedReps: 12 },
        ],
      };

      const { validExercises } = finalizeWorkoutExercises([manualExercise]);
      expect(validExercises[0].sets.length).toBe(3);
      expect(validExercises[0].sets[0].status).toBe('completed');
      expect(validExercises[0].sets[1].status).toBe('skipped');
      expect(validExercises[0].sets[2].status).toBe('not_attempted');
    });

    it('9. does not duplicate sets or alter execution statuses on serialization roundtrip', () => {
      const originalEntry: WorkoutEntry = {
        id: 'wk_sync_test',
        date: '2026-10-13',
        exercises: [
          {
            name: 'Overhead Press',
            sets: [
              { weight: 50, reps: 6, unit: 'kg', status: 'completed', completed: true, prescribedWeight: 50, prescribedReps: 6 },
              { weight: 50, reps: 6, unit: 'kg', status: 'skipped', completed: false, prescribedWeight: 50, prescribedReps: 6 },
              { weight: 50, reps: 6, unit: 'kg', status: 'not_attempted', completed: false, prescribedWeight: 50, prescribedReps: 6 },
            ],
          },
        ],
      };

      // Serialize to JSON (as done in localStorage and Supabase sync) and rehydrate
      const serialized = JSON.stringify(originalEntry);
      const rehydrated: WorkoutEntry = JSON.parse(serialized);

      expect(rehydrated.exercises[0].sets.length).toBe(3);
      expect(rehydrated.exercises[0].sets[0].status).toBe('completed');
      expect(rehydrated.exercises[0].sets[0].completed).toBe(true);
      expect(rehydrated.exercises[0].sets[1].status).toBe('skipped');
      expect(rehydrated.exercises[0].sets[1].completed).toBe(false);
      expect(rehydrated.exercises[0].sets[2].status).toBe('not_attempted');
      expect(rehydrated.exercises[0].sets[2].completed).toBe(false);

      // Original prescriptions survive intact
      expect(rehydrated.exercises[0].sets[0].prescribedWeight).toBe(50);
      expect(rehydrated.exercises[0].sets[1].prescribedWeight).toBe(50);
      expect(rehydrated.exercises[0].sets[2].prescribedWeight).toBe(50);
    });
  });
});
