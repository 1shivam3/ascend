import { describe, it, expect } from 'vitest';
import {
  isSetPrescribed,
  compareSetAdherence,
  calculateExerciseAdherence,
  calculateWorkoutAdherence,
  calculateWorkoutAdherenceFromExercises,
  convertWeight,
  normalizeWeightToKg,
} from '@/lib/workout-adherence';
import { WorkoutEntry, WorkoutExercise, WorkoutSet } from '@/lib/types';

describe('Workout Adherence & Outcome Engine (workout-adherence.ts)', () => {
  describe('Unit Conversions & Load Normalization', () => {
    it('converts between kg and lbs deterministically using ASCEND standard ratios', () => {
      expect(convertWeight(100, 'kg', 'lbs')).toBeCloseTo(220.462, 2);
      expect(convertWeight(220.462, 'lbs', 'kg')).toBeCloseTo(100, 2);
      expect(convertWeight(80, 'kg', 'kg')).toBe(80);
      expect(convertWeight(175, 'lbs', 'lbs')).toBe(175);
    });

    it('normalizes weights to kg accurately', () => {
      expect(normalizeWeightToKg(100, 'kg')).toBe(100);
      expect(normalizeWeightToKg(220.462, 'lbs')).toBeCloseTo(100, 2);
    });
  });

  describe('Prescription Identification Semantics', () => {
    it('identifies prescribed sets when actual target fields are present', () => {
      // Rep-only target
      expect(
        isSetPrescribed({
          weight: 70,
          reps: 8,
          unit: 'kg',
          prescribedReps: 8,
        })
      ).toBe(true);

      // Weight-only target
      expect(
        isSetPrescribed({
          weight: 70,
          reps: 8,
          unit: 'kg',
          prescribedWeight: 70,
        })
      ).toBe(true);

      // RPE-only target
      expect(
        isSetPrescribed({
          weight: 70,
          reps: 8,
          unit: 'kg',
          prescribedRpe: 8,
        })
      ).toBe(true);
    });

    it('CRITICAL: does NOT count a set containing only prescribedUnit as prescribed', () => {
      // Supporting metadata only — no actual targets
      expect(
        isSetPrescribed({
          weight: 70,
          reps: 8,
          unit: 'kg',
          prescribedUnit: 'kg',
        })
      ).toBe(false);

      expect(
        isSetPrescribed({
          weight: 155,
          reps: 8,
          unit: 'lbs',
          prescribedUnit: 'lbs',
          completed: true,
        })
      ).toBe(false);
    });

    it('identifies unprescribed sets when all target fields are omitted', () => {
      expect(
        isSetPrescribed({
          weight: 70,
          reps: 8,
          unit: 'kg',
          completed: true,
        })
      ).toBe(false);

      expect(
        isSetPrescribed({
          weight: 0,
          reps: 0,
          unit: 'kg',
        })
      ).toBe(false);
    });

    it('treats zero as a valid explicit numeric target', () => {
      // 0 weight is an explicit bodyweight prescription
      expect(
        isSetPrescribed({
          weight: 0,
          reps: 10,
          unit: 'kg',
          prescribedWeight: 0,
        })
      ).toBe(true);

      // 0 reps (e.g. isometric hold or unattempted target)
      expect(
        isSetPrescribed({
          weight: 0,
          reps: 0,
          unit: 'kg',
          prescribedReps: 0,
        })
      ).toBe(true);

      // 0 RPE
      expect(
        isSetPrescribed({
          weight: 50,
          reps: 10,
          unit: 'kg',
          prescribedRpe: 0,
        })
      ).toBe(true);
    });

    it('rejects non-numeric NaN values as prescriptions', () => {
      expect(
        isSetPrescribed({
          weight: 70,
          reps: 8,
          unit: 'kg',
          prescribedReps: NaN,
        })
      ).toBe(false);

      expect(
        isSetPrescribed({
          weight: 70,
          reps: 8,
          unit: 'kg',
          prescribedWeight: NaN,
        })
      ).toBe(false);
    });
  });

  describe('Audit Missing Actual Values (Runtime Safety)', () => {
    it('never silently coerces absent actual reps to zero', () => {
      const setWithMissingReps = {
        weight: 100,
        unit: 'kg' as const,
        status: 'completed' as const,
        completed: true,
        prescribedWeight: 100,
        prescribedReps: 8,
        prescribedUnit: 'kg' as const,
      } as unknown as WorkoutSet;

      const comp = compareSetAdherence(setWithMissingReps);
      expect(comp.actualReps).toBeUndefined();
      expect(comp.repDelta).toBeNull(); // Must NOT compute 0 - 8 = -8
    });

    it('never silently coerces absent actual weight to zero', () => {
      const setWithMissingWeight = {
        reps: 8,
        unit: 'kg' as const,
        status: 'completed' as const,
        completed: true,
        prescribedWeight: 100,
        prescribedReps: 8,
        prescribedUnit: 'kg' as const,
      } as unknown as WorkoutSet;

      const comp = compareSetAdherence(setWithMissingWeight);
      expect(comp.actualWeight).toBeUndefined();
      expect(comp.loadDelta).toBeNull(); // Must NOT compute 0 - 100 = -100
      expect(comp.loadDeltaKg).toBeNull();
    });

    it('never silently coerces absent actual RPE to zero', () => {
      const setWithMissingRpe = {
        weight: 100,
        reps: 8,
        unit: 'kg' as const,
        status: 'completed' as const,
        completed: true,
        prescribedWeight: 100,
        prescribedReps: 8,
        prescribedUnit: 'kg' as const,
        prescribedRpe: 8,
      } as WorkoutSet;

      const comp = compareSetAdherence(setWithMissingRpe);
      expect(comp.actualRpe).toBeUndefined();
      expect(comp.rpeDelta).toBeNull(); // Must NOT compute 0 - 8 = -8
    });

    it('treats missing actual unit as unavailable load delta without guessing', () => {
      const setWithMissingUnit = {
        weight: 100,
        reps: 8,
        status: 'completed' as const,
        completed: true,
        prescribedWeight: 100,
        prescribedReps: 8,
        prescribedUnit: 'kg' as const,
      } as unknown as WorkoutSet;

      const comp = compareSetAdherence(setWithMissingUnit);
      expect(comp.actualUnit).toBeUndefined();
      expect(comp.loadDelta).toBeNull();
      expect(comp.loadDeltaKg).toBeNull();
    });
  });

  describe('Scenario 1: All prescribed sets completed exactly as planned', () => {
    it('reports 100% completion rate and zero deltas across all metrics', () => {
      const workout: WorkoutEntry = {
        id: 'w1',
        date: '2026-10-13',
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              {
                weight: 80,
                reps: 8,
                unit: 'kg',
                rpe: 8,
                status: 'completed',
                completed: true,
                prescribedWeight: 80,
                prescribedReps: 8,
                prescribedUnit: 'kg',
                prescribedRpe: 8,
              },
              {
                weight: 80,
                reps: 8,
                unit: 'kg',
                rpe: 8,
                status: 'completed',
                completed: true,
                prescribedWeight: 80,
                prescribedReps: 8,
                prescribedUnit: 'kg',
                prescribedRpe: 8,
              },
            ],
          },
        ],
      };

      const result = calculateWorkoutAdherence(workout);

      expect(result.hasPrescriptionData).toBe(true);
      expect(result.totalPrescribedSets).toBe(2);
      expect(result.completedPrescribedSets).toBe(2);
      expect(result.skippedPrescribedSets).toBe(0);
      expect(result.notAttemptedPrescribedSets).toBe(0);
      expect(result.extraCompletedSets).toBe(0);
      expect(result.setCompletionRate).toBe(1.0);
      expect(result.setCompletionPercentage).toBe(100);

      expect(result.setComparisons).toHaveLength(2);
      for (const setComp of result.setComparisons) {
        expect(setComp.repDelta).toBe(0);
        expect(setComp.loadDelta).toBe(0);
        expect(setComp.loadDeltaKg).toBe(0);
        expect(setComp.loadDeltaUnit).toBe('kg');
        expect(setComp.rpeDelta).toBe(0);
      }
    });
  });

  describe('Scenario 2: Mix of completed, skipped, and not-attempted sets', () => {
    it('calculates accurate category counts and exposes deltas only on completed sets', () => {
      const workout: WorkoutEntry = {
        id: 'w2',
        date: '2026-10-13',
        exercises: [
          {
            name: 'Squat',
            sets: [
              {
                // Completed with +5kg and +2 reps
                weight: 105,
                reps: 10,
                unit: 'kg',
                rpe: 8.5,
                status: 'completed',
                completed: true,
                prescribedWeight: 100,
                prescribedReps: 8,
                prescribedUnit: 'kg',
                prescribedRpe: 8,
              },
              {
                // Completed with -1 rep and -0.5 RPE
                weight: 100,
                reps: 7,
                unit: 'kg',
                rpe: 7.5,
                status: 'completed',
                completed: true,
                prescribedWeight: 100,
                prescribedReps: 8,
                prescribedUnit: 'kg',
                prescribedRpe: 8,
              },
              {
                // Explicitly skipped
                weight: 100,
                reps: 8,
                unit: 'kg',
                status: 'skipped',
                completed: false,
                prescribedWeight: 100,
                prescribedReps: 8,
                prescribedUnit: 'kg',
                prescribedRpe: 8,
              },
              {
                // Not attempted
                weight: 100,
                reps: 8,
                unit: 'kg',
                status: 'not_attempted',
                completed: false,
                prescribedWeight: 100,
                prescribedReps: 8,
                prescribedUnit: 'kg',
                prescribedRpe: 8,
              },
            ],
          },
        ],
      };

      const result = calculateWorkoutAdherence(workout);

      expect(result.totalPrescribedSets).toBe(4);
      expect(result.completedPrescribedSets).toBe(2);
      expect(result.skippedPrescribedSets).toBe(1);
      expect(result.notAttemptedPrescribedSets).toBe(1);
      expect(result.extraCompletedSets).toBe(0);
      expect(result.setCompletionRate).toBe(0.5);
      expect(result.setCompletionPercentage).toBe(50);

      // Check Set 1 (Completed with changes)
      const set1 = result.setComparisons[0];
      expect(set1.isCompleted).toBe(true);
      expect(set1.repDelta).toBe(2);
      expect(set1.loadDelta).toBe(5);
      expect(set1.loadDeltaKg).toBe(5);
      expect(set1.rpeDelta).toBe(0.5);

      // Check Set 2 (Completed under target)
      const set2 = result.setComparisons[1];
      expect(set2.isCompleted).toBe(true);
      expect(set2.repDelta).toBe(-1);
      expect(set2.loadDelta).toBe(0);
      expect(set2.rpeDelta).toBe(-0.5);

      // Check Set 3 (Skipped - deltas MUST be null)
      const set3 = result.setComparisons[2];
      expect(set3.status).toBe('skipped');
      expect(set3.isCompleted).toBe(false);
      expect(set3.repDelta).toBeNull();
      expect(set3.loadDelta).toBeNull();
      expect(set3.loadDeltaKg).toBeNull();
      expect(set3.rpeDelta).toBeNull();

      // Check Set 4 (Not attempted - deltas MUST be null)
      const set4 = result.setComparisons[3];
      expect(set4.status).toBe('not_attempted');
      expect(set4.isCompleted).toBe(false);
      expect(set4.repDelta).toBeNull();
      expect(set4.loadDelta).toBeNull();
      expect(set4.loadDeltaKg).toBeNull();
      expect(set4.rpeDelta).toBeNull();
    });
  });

  describe('Scenario 3: Completed extra sets excluded from prescribed denominator', () => {
    it('isolates extra unprescribed sets and keeps completion rate bounded to prescribed sets', () => {
      const workout: WorkoutEntry = {
        id: 'w3',
        date: '2026-10-13',
        exercises: [
          {
            name: 'Overhead Press',
            sets: [
              // 2 Prescribed sets
              {
                weight: 50,
                reps: 8,
                unit: 'kg',
                status: 'completed',
                completed: true,
                prescribedWeight: 50,
                prescribedReps: 8,
                prescribedUnit: 'kg',
              },
              {
                weight: 50,
                reps: 8,
                unit: 'kg',
                status: 'completed',
                completed: true,
                prescribedWeight: 50,
                prescribedReps: 8,
                prescribedUnit: 'kg',
              },
              // 2 Extra completed sets (no target prescription)
              {
                weight: 45,
                reps: 10,
                unit: 'kg',
                status: 'completed',
                completed: true,
              },
              {
                weight: 40,
                reps: 12,
                unit: 'kg',
                status: 'completed',
                completed: true,
              },
            ],
          },
        ],
      };

      const result = calculateWorkoutAdherence(workout);

      expect(result.totalPrescribedSets).toBe(2);
      expect(result.completedPrescribedSets).toBe(2);
      expect(result.skippedPrescribedSets).toBe(0);
      expect(result.notAttemptedPrescribedSets).toBe(0);
      expect(result.extraCompletedSets).toBe(2);
      expect(result.setCompletionRate).toBe(1.0); // 2/2, NOT 4/2
      expect(result.setCompletionPercentage).toBe(100);

      // Verify extra sets have null deltas because prescription did not exist
      const extraSet1 = result.setComparisons[2];
      expect(extraSet1.isPrescribed).toBe(false);
      expect(extraSet1.repDelta).toBeNull();
      expect(extraSet1.loadDelta).toBeNull();
    });
  });

  describe('Scenario 4: Manually logged workout with no prescription fields', () => {
    it('returns explicit unknown/not-available adherence state instead of 0% or NaN', () => {
      const workout: WorkoutEntry = {
        id: 'w4',
        date: '2026-10-13',
        exercises: [
          {
            name: 'Deadlift',
            sets: [
              { weight: 140, reps: 5, unit: 'kg', completed: true },
              { weight: 140, reps: 5, unit: 'kg', completed: true },
              { weight: 140, reps: 5, unit: 'kg', completed: true },
            ],
          },
        ],
      };

      const result = calculateWorkoutAdherence(workout);

      expect(result.hasPrescriptionData).toBe(false);
      expect(result.totalPrescribedSets).toBe(0);
      expect(result.completedPrescribedSets).toBe(0);
      expect(result.skippedPrescribedSets).toBe(0);
      expect(result.notAttemptedPrescribedSets).toBe(0);
      expect(result.extraCompletedSets).toBe(3);
      expect(result.setCompletionRate).toBeNull(); // NOT 0, NOT NaN!
      expect(result.setCompletionPercentage).toBeNull();
    });

    it('treats manual sets with only unit metadata as unprescribed', () => {
      const workout: WorkoutEntry = {
        id: 'w4_unit_only',
        date: '2026-10-13',
        exercises: [
          {
            name: 'Barbell Row',
            sets: [
              { weight: 70, reps: 8, unit: 'kg', prescribedUnit: 'kg', completed: true },
            ],
          },
        ],
      };

      const result = calculateWorkoutAdherence(workout);
      expect(result.hasPrescriptionData).toBe(false);
      expect(result.totalPrescribedSets).toBe(0);
      expect(result.extraCompletedSets).toBe(1);
      expect(result.setCompletionRate).toBeNull();
    });
  });

  describe('Scenario 5: Prescribed workout with zero completed sets', () => {
    it('accurately reports 0% completion with all sets marked not attempted', () => {
      const workout: WorkoutEntry = {
        id: 'w5',
        date: '2026-10-13',
        exercises: [
          {
            name: 'Leg Press',
            sets: [
              {
                weight: 160,
                reps: 10,
                unit: 'kg',
                status: 'not_attempted',
                completed: false,
                prescribedWeight: 160,
                prescribedReps: 10,
                prescribedUnit: 'kg',
              },
              {
                weight: 160,
                reps: 10,
                unit: 'kg',
                status: 'not_attempted',
                completed: false,
                prescribedWeight: 160,
                prescribedReps: 10,
                prescribedUnit: 'kg',
              },
              {
                weight: 160,
                reps: 10,
                unit: 'kg',
                status: 'not_attempted',
                completed: false,
                prescribedWeight: 160,
                prescribedReps: 10,
                prescribedUnit: 'kg',
              },
            ],
          },
        ],
      };

      const result = calculateWorkoutAdherence(workout);

      expect(result.hasPrescriptionData).toBe(true);
      expect(result.totalPrescribedSets).toBe(3);
      expect(result.completedPrescribedSets).toBe(0);
      expect(result.skippedPrescribedSets).toBe(0);
      expect(result.notAttemptedPrescribedSets).toBe(3);
      expect(result.extraCompletedSets).toBe(0);
      expect(result.setCompletionRate).toBe(0.0); // Exactly 0/3
      expect(result.setCompletionPercentage).toBe(0.0);
    });
  });

  describe('Scenario 6: Bodyweight or rep-only prescriptions without prescribed load', () => {
    it('computes rep delta while preserving null load delta when weight was not prescribed', () => {
      const workout: WorkoutEntry = {
        id: 'w6',
        date: '2026-10-13',
        exercises: [
          {
            name: 'Pull-ups',
            sets: [
              {
                // Prescribed reps only, no prescribed weight or unit
                weight: 0,
                reps: 12,
                unit: 'kg',
                status: 'completed',
                completed: true,
                prescribedReps: 10,
              },
            ],
          },
        ],
      };

      const result = calculateWorkoutAdherence(workout);

      expect(result.totalPrescribedSets).toBe(1);
      expect(result.completedPrescribedSets).toBe(1);
      expect(result.setCompletionRate).toBe(1.0);

      const comparison = result.setComparisons[0];
      expect(comparison.repDelta).toBe(2); // 12 - 10
      expect(comparison.loadDelta).toBeNull(); // No prescribed weight
      expect(comparison.loadDeltaKg).toBeNull();
      expect(comparison.loadDeltaUnit).toBeNull();
    });

    it('handles explicit 0-weight bodyweight prescription correctly', () => {
      const workout: WorkoutEntry = {
        id: 'w6_bw_zero',
        date: '2026-10-13',
        exercises: [
          {
            name: 'Dips',
            sets: [
              {
                // Explicit 0 prescribed weight (pure bodyweight)
                weight: 0,
                reps: 15,
                unit: 'kg',
                status: 'completed',
                completed: true,
                prescribedWeight: 0,
                prescribedReps: 12,
                prescribedUnit: 'kg',
              },
              {
                // Added weight (+5kg) over bodyweight
                weight: 5,
                reps: 12,
                unit: 'kg',
                status: 'completed',
                completed: true,
                prescribedWeight: 0,
                prescribedReps: 12,
                prescribedUnit: 'kg',
              },
            ],
          },
        ],
      };

      const result = calculateWorkoutAdherence(workout);
      expect(result.setComparisons[0].repDelta).toBe(3);
      expect(result.setComparisons[0].loadDelta).toBe(0);

      expect(result.setComparisons[1].repDelta).toBe(0);
      expect(result.setComparisons[1].loadDelta).toBe(5);
    });
  });

  describe('Scenario 7: Partial prescription data and RPE-only targets', () => {
    it('handles RPE-only targets without reps or weight', () => {
      const workout: WorkoutEntry = {
        id: 'w7_rpe_only',
        date: '2026-10-13',
        exercises: [
          {
            name: 'Romanian Deadlift',
            sets: [
              {
                weight: 90,
                reps: 8,
                unit: 'kg',
                rpe: 8,
                status: 'completed',
                completed: true,
                prescribedRpe: 8,
              },
            ],
          },
        ],
      };

      const result = calculateWorkoutAdherence(workout);
      expect(result.hasPrescriptionData).toBe(true);
      expect(result.totalPrescribedSets).toBe(1);

      const comp = result.setComparisons[0];
      expect(comp.isPrescribed).toBe(true);
      expect(comp.rpeDelta).toBe(0);
      expect(comp.repDelta).toBeNull();
      expect(comp.loadDelta).toBeNull();
    });

    it('handles partially populated prescription fields without fabricating missing values', () => {
      const workout: WorkoutEntry = {
        id: 'w7',
        date: '2026-10-13',
        exercises: [
          {
            name: 'Barbell Row',
            sets: [
              {
                // Prescribed reps and RPE only, load was left open/unspecified
                weight: 70,
                reps: 9,
                unit: 'kg',
                rpe: 8.5,
                status: 'completed',
                completed: true,
                prescribedReps: 8,
                prescribedRpe: 8,
              },
            ],
          },
        ],
      };

      const result = calculateWorkoutAdherence(workout);
      const comp = result.setComparisons[0];

      expect(comp.isPrescribed).toBe(true);
      expect(comp.repDelta).toBe(1);
      expect(comp.rpeDelta).toBe(0.5);
      expect(comp.loadDelta).toBeNull(); // Missing prescribed load must NOT fabricate 0
      expect(comp.loadDeltaKg).toBeNull();
    });
  });

  describe('Scenario 8: Equivalent kg/lb loads producing correct normalized difference', () => {
    it('evaluates 100 kg prescribed vs 220.462 lbs actual as zero difference', () => {
      const set: WorkoutSet = {
        weight: 220.462,
        reps: 8,
        unit: 'lbs',
        status: 'completed',
        completed: true,
        prescribedWeight: 100,
        prescribedReps: 8,
        prescribedUnit: 'kg',
      };

      const comp = compareSetAdherence(set, 'Squat', 0);
      expect(comp.loadDeltaKg).toBe(0);
      expect(comp.loadDelta).toBe(0);
      expect(comp.loadDeltaUnit).toBe('kg');
    });

    it('evaluates 100 lbs prescribed vs 45.3592 kg actual as zero difference', () => {
      const set: WorkoutSet = {
        weight: 45.3592,
        reps: 8,
        unit: 'kg',
        status: 'completed',
        completed: true,
        prescribedWeight: 100,
        prescribedReps: 8,
        prescribedUnit: 'lbs',
      };

      const comp = compareSetAdherence(set, 'Bench Press', 0);
      expect(comp.loadDeltaKg).toBe(0);
      expect(comp.loadDelta).toBe(0);
      expect(comp.loadDeltaUnit).toBe('lbs');
    });

    it('accurately calculates cross-unit load difference when loads differ', () => {
      // Prescribed 100 kg, actual 242.5 lbs (≈ 110 kg)
      const set: WorkoutSet = {
        weight: 242.508,
        reps: 8,
        unit: 'lbs',
        status: 'completed',
        completed: true,
        prescribedWeight: 100,
        prescribedReps: 8,
        prescribedUnit: 'kg',
      };

      const comp = compareSetAdherence(set, 'Squat', 0);
      expect(comp.loadDeltaKg).toBeCloseTo(10, 1);
      expect(comp.loadDelta).toBeCloseTo(10, 1);
      expect(comp.loadDeltaUnit).toBe('kg');
    });
  });

  describe('Scenario 9: Missing actual RPE, missing prescribed RPE, and missing load units', () => {
    it('returns null for rpeDelta when actual RPE is omitted', () => {
      const set: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        status: 'completed',
        completed: true,
        prescribedWeight: 80,
        prescribedReps: 8,
        prescribedUnit: 'kg',
        prescribedRpe: 8,
      };

      const comp = compareSetAdherence(set);
      expect(comp.rpeDelta).toBeNull();
    });

    it('returns null for rpeDelta when prescribed RPE is omitted', () => {
      const set: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        rpe: 8,
        status: 'completed',
        completed: true,
        prescribedWeight: 80,
        prescribedReps: 8,
        prescribedUnit: 'kg',
      };

      const comp = compareSetAdherence(set);
      expect(comp.rpeDelta).toBeNull();
    });

    it('returns null for loadDelta when prescribed unit is omitted', () => {
      const set: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        status: 'completed',
        completed: true,
        prescribedWeight: 80,
        prescribedReps: 8,
      };

      const comp = compareSetAdherence(set);
      expect(comp.loadDelta).toBeNull();
      expect(comp.loadDeltaKg).toBeNull();
    });

    it('returns null for loadDelta when actual unit is omitted', () => {
      const set: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: undefined as any,
        status: 'completed',
        completed: true,
        prescribedWeight: 80,
        prescribedReps: 8,
        prescribedUnit: 'kg',
      };

      const comp = compareSetAdherence(set);
      expect(comp.loadDelta).toBeNull();
      expect(comp.loadDeltaKg).toBeNull();
    });
  });

  describe('Scenario 10: Explicit status conflicting with legacy completed boolean', () => {
    it('prioritizes explicit status: skipped over conflicting completed: true', () => {
      const set: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        status: 'skipped',
        completed: true, // conflicting legacy boolean
        prescribedWeight: 80,
        prescribedReps: 8,
        prescribedUnit: 'kg',
      };

      const comp = compareSetAdherence(set);
      expect(comp.status).toBe('skipped');
      expect(comp.isCompleted).toBe(false);
      expect(comp.repDelta).toBeNull();
      expect(comp.loadDelta).toBeNull();

      const summary = calculateExerciseAdherence({ name: 'Squat', sets: [set] });
      expect(summary.completedPrescribedSets).toBe(0);
      expect(summary.skippedPrescribedSets).toBe(1);
    });

    it('prioritizes explicit status: not_attempted over conflicting completed: true', () => {
      const set: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        status: 'not_attempted',
        completed: true, // conflicting legacy boolean
        prescribedWeight: 80,
        prescribedReps: 8,
        prescribedUnit: 'kg',
      };

      const comp = compareSetAdherence(set);
      expect(comp.status).toBe('not_attempted');
      expect(comp.isCompleted).toBe(false);

      const summary = calculateExerciseAdherence({ name: 'Squat', sets: [set] });
      expect(summary.completedPrescribedSets).toBe(0);
      expect(summary.notAttemptedPrescribedSets).toBe(1);
    });

    it('prioritizes explicit status: completed over conflicting completed: false', () => {
      const set: WorkoutSet = {
        weight: 80,
        reps: 8,
        unit: 'kg',
        status: 'completed',
        completed: false, // conflicting legacy boolean
        prescribedWeight: 80,
        prescribedReps: 8,
        prescribedUnit: 'kg',
      };

      const comp = compareSetAdherence(set);
      expect(comp.status).toBe('completed');
      expect(comp.isCompleted).toBe(true);
      expect(comp.repDelta).toBe(0);
      expect(comp.loadDelta).toBe(0);

      const summary = calculateExerciseAdherence({ name: 'Squat', sets: [set] });
      expect(summary.completedPrescribedSets).toBe(1);
    });
  });

  describe('Scenario 11: Legacy completed records handled using existing compatibility rules', () => {
    it('correctly handles legacy records with completed: true and no status', () => {
      const set: WorkoutSet = {
        weight: 100,
        reps: 8,
        unit: 'kg',
        completed: true,
        prescribedWeight: 95,
        prescribedReps: 8,
        prescribedUnit: 'kg',
      };

      const comp = compareSetAdherence(set);
      expect(comp.status).toBe('completed');
      expect(comp.isCompleted).toBe(true);
      expect(comp.loadDelta).toBe(5);
    });

    it('correctly handles legacy records with completed: false and positive reps as pending/unattempted', () => {
      const set: WorkoutSet = {
        weight: 100,
        reps: 8,
        unit: 'kg',
        completed: false,
        prescribedWeight: 95,
        prescribedReps: 8,
        prescribedUnit: 'kg',
      };

      const comp = compareSetAdherence(set);
      expect(comp.status).toBe('pending');
      expect(comp.isCompleted).toBe(false);
      expect(comp.loadDelta).toBeNull(); // not completed -> no deltas
    });

    it('correctly handles historical records omitting both status and completed with positive reps', () => {
      const set: WorkoutSet = {
        weight: 100,
        reps: 8,
        unit: 'kg',
        prescribedWeight: 95,
        prescribedReps: 8,
        prescribedUnit: 'kg',
      };

      // By ASCEND legacy rules: historical set with positive reps and omitted completed flag is treated as completed
      const comp = compareSetAdherence(set);
      expect(comp.status).toBe('completed');
      expect(comp.isCompleted).toBe(true);
      expect(comp.loadDelta).toBe(5);
    });
  });

  describe('Scenario 12: No double-counting and no division-by-zero or NaN results', () => {
    it('guarantees totalPrescribedSets equals completed + skipped + notAttempted', () => {
      const workout: WorkoutEntry = {
        id: 'w12',
        date: '2026-10-13',
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              { weight: 80, reps: 8, unit: 'kg', status: 'completed', prescribedReps: 8, prescribedWeight: 80, prescribedUnit: 'kg' },
              { weight: 80, reps: 8, unit: 'kg', status: 'skipped', prescribedReps: 8, prescribedWeight: 80, prescribedUnit: 'kg' },
              { weight: 80, reps: 8, unit: 'kg', status: 'not_attempted', prescribedReps: 8, prescribedWeight: 80, prescribedUnit: 'kg' },
              { weight: 80, reps: 8, unit: 'kg', status: 'pending', prescribedReps: 8, prescribedWeight: 80, prescribedUnit: 'kg' },
              { weight: 80, reps: 8, unit: 'kg', status: 'completed' }, // extra set
            ],
          },
        ],
      };

      const result = calculateWorkoutAdherence(workout);

      expect(result.totalPrescribedSets).toBe(4);
      expect(result.completedPrescribedSets).toBe(1);
      expect(result.skippedPrescribedSets).toBe(1);
      expect(result.notAttemptedPrescribedSets).toBe(2); // 1 not_attempted + 1 pending
      expect(result.extraCompletedSets).toBe(1);

      expect(
        result.completedPrescribedSets +
        result.skippedPrescribedSets +
        result.notAttemptedPrescribedSets
      ).toBe(result.totalPrescribedSets);

      expect(result.setCompletionRate).toBe(0.25);
    });

    it('safely handles empty workouts without errors or NaN', () => {
      const emptyWorkout: WorkoutEntry = {
        id: 'empty',
        date: '2026-10-13',
        exercises: [],
      };

      const result = calculateWorkoutAdherence(emptyWorkout);

      expect(result.hasPrescriptionData).toBe(false);
      expect(result.totalPrescribedSets).toBe(0);
      expect(result.completedPrescribedSets).toBe(0);
      expect(result.skippedPrescribedSets).toBe(0);
      expect(result.notAttemptedPrescribedSets).toBe(0);
      expect(result.extraCompletedSets).toBe(0);
      expect(result.setCompletionRate).toBeNull();
      expect(result.setCompletionPercentage).toBeNull();
      expect(result.exercises).toEqual([]);
      expect(result.setComparisons).toEqual([]);
    });

    it('safely handles exercises with empty sets arrays', () => {
      const workout: WorkoutEntry = {
        id: 'w_empty_sets',
        date: '2026-10-13',
        exercises: [
          { name: 'Calf Raise', sets: [] },
        ],
      };

      const result = calculateWorkoutAdherence(workout);
      expect(result.totalPrescribedSets).toBe(0);
      expect(result.setCompletionRate).toBeNull();
      expect(result.exercises[0].totalPrescribedSets).toBe(0);
      expect(result.exercises[0].setCompletionRate).toBeNull();
    });
  });

  describe('Multi-Exercise Workout Integration', () => {
    it('aggregates adherence metrics across multiple distinct movements accurately', () => {
      const workout: WorkoutEntry = {
        id: 'multi_ex',
        date: '2026-10-13',
        exercises: [
          {
            name: 'Squat',
            sets: [
              { weight: 100, reps: 8, unit: 'kg', status: 'completed', prescribedWeight: 100, prescribedReps: 8, prescribedUnit: 'kg' },
              { weight: 100, reps: 8, unit: 'kg', status: 'completed', prescribedWeight: 100, prescribedReps: 8, prescribedUnit: 'kg' },
            ],
          },
          {
            name: 'Romanian Deadlift',
            sets: [
              { weight: 80, reps: 8, unit: 'kg', status: 'skipped', prescribedWeight: 80, prescribedReps: 8, prescribedUnit: 'kg' },
              { weight: 80, reps: 8, unit: 'kg', status: 'not_attempted', prescribedWeight: 80, prescribedReps: 8, prescribedUnit: 'kg' },
            ],
          },
          {
            name: 'Leg Press',
            sets: [
              { weight: 160, reps: 10, unit: 'kg', status: 'completed', prescribedWeight: 160, prescribedReps: 10, prescribedUnit: 'kg' },
              { weight: 140, reps: 12, unit: 'kg', status: 'completed' }, // Extra unprescribed set
            ],
          },
        ],
      };

      const result = calculateWorkoutAdherence(workout);

      expect(result.exercises).toHaveLength(3);
      expect(result.totalPrescribedSets).toBe(5); // 2 Squat + 2 RDL + 1 Leg Press
      expect(result.completedPrescribedSets).toBe(3); // 2 Squat + 1 Leg Press
      expect(result.skippedPrescribedSets).toBe(1); // 1 RDL
      expect(result.notAttemptedPrescribedSets).toBe(1); // 1 RDL
      expect(result.extraCompletedSets).toBe(1); // 1 Leg Press
      expect(result.setCompletionRate).toBe(0.6); // 3 / 5
      expect(result.setCompletionPercentage).toBe(60);

      // Check exercise breakdowns
      expect(result.exercises[0].exerciseName).toBe('Squat');
      expect(result.exercises[0].setCompletionRate).toBe(1.0);

      expect(result.exercises[1].exerciseName).toBe('Romanian Deadlift');
      expect(result.exercises[1].setCompletionRate).toBe(0.0);

      expect(result.exercises[2].exerciseName).toBe('Leg Press');
      expect(result.exercises[2].setCompletionRate).toBe(1.0);
      expect(result.exercises[2].extraCompletedSets).toBe(1);
    });
  });
});
