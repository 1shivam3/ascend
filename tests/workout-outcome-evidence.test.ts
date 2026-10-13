import { describe, it, expect } from 'vitest';
import {
  aggregateMultiSessionEvidence,
  getExerciseExposureEvidence,
  canonicalizeExerciseName,
  analyzeSetOutcome,
} from '@/lib/workout-outcome-evidence';
import { WorkoutEntry, WorkoutSet } from '@/lib/types';

describe('Multi-Session Training Outcome Evidence Engine (workout-outcome-evidence.ts)', () => {
  // ─── 1. Three exposures of the same exercise with different rep outcomes ────
  describe('Case 1: Three exposures of same exercise with different rep outcomes', () => {
    it('accurately tracks rep outcomes distribution across repeated chronological exposures', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-exp-1',
          date: '2026-10-01T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                {
                  prescribedReps: 8,
                  prescribedWeight: 100,
                  prescribedUnit: 'kg',
                  reps: 8, // met (delta 0)
                  weight: 100,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
        {
          id: 'w-exp-2',
          date: '2026-10-04T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                {
                  prescribedReps: 8,
                  prescribedWeight: 100,
                  prescribedUnit: 'kg',
                  reps: 6, // under (delta -2)
                  weight: 100,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
        {
          id: 'w-exp-3',
          date: '2026-10-08T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                {
                  prescribedReps: 8,
                  prescribedWeight: 100,
                  prescribedUnit: 'kg',
                  reps: 10, // exceeded (delta +2)
                  weight: 100,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const evidence = aggregateMultiSessionEvidence(workouts);
      expect(evidence.totalWorkoutsAnalyzed).toBe(3);
      expect(evidence.totalExposuresAnalyzed).toBe(3);

      const squatKey = canonicalizeExerciseName('Barbell Back Squat');
      const squatEvidence = evidence.exercises[squatKey];
      expect(squatEvidence).toBeDefined();
      expect(squatEvidence.totalExposures).toBe(3);
      expect(squatEvidence.comparablePrescribedExposures).toBe(3);
      expect(squatEvidence.totalPrescribedSets).toBe(3);
      expect(squatEvidence.completedPrescribedSets).toBe(3);
      expect(squatEvidence.usableRepComparisonsCount).toBe(3);

      // Verify exact distribution: 1 below_target, 1 met_target, 1 above_target
      expect(squatEvidence.repOutcomesDistribution).toEqual({
        below_target: 1,
        met_target: 1,
        above_target: 1,
      });

      // Verify chronological sequence order
      expect(squatEvidence.exposures[0].workoutId).toBe('w-exp-1');
      expect(squatEvidence.exposures[0].repOutcomes).toEqual({ below_target: 0, met_target: 1, above_target: 0 });
      expect(squatEvidence.exposures[1].workoutId).toBe('w-exp-2');
      expect(squatEvidence.exposures[1].repOutcomes).toEqual({ below_target: 1, met_target: 0, above_target: 0 });
      expect(squatEvidence.exposures[2].workoutId).toBe('w-exp-3');
      expect(squatEvidence.exposures[2].repOutcomes).toEqual({ below_target: 0, met_target: 0, above_target: 1 });
    });
  });

  // ─── 2. Repeated exposures with load changes expressed in different units ───
  describe('Case 2: Repeated exposures with load changes in different units', () => {
    it('normalizes load comparisons to kilograms using ASCEND standard conversion factors', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-load-kg',
          date: '2026-10-02T10:00:00Z',
          exercises: [
            {
              name: 'Bench Press',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedUnit: 'kg',
                  prescribedReps: 5,
                  weight: 105,
                  unit: 'kg',
                  reps: 5,
                  status: 'completed',
                  completed: true,
                }, // +5 kg delta
              ],
            },
          ],
        },
        {
          id: 'w-load-lbs',
          date: '2026-10-06T10:00:00Z',
          exercises: [
            {
              name: 'Bench Press',
              sets: [
                {
                  prescribedWeight: 220,
                  prescribedUnit: 'lbs',
                  prescribedReps: 5,
                  weight: 230,
                  unit: 'lbs',
                  reps: 5,
                  status: 'completed',
                  completed: true,
                }, // +10 lbs delta = ~4.54 kg
              ],
            },
          ],
        },
      ];

      const evidence = aggregateMultiSessionEvidence(workouts);
      const bench = evidence.exercises[canonicalizeExerciseName('Bench Press')];

      expect(bench.usableLoadComparisonsCount).toBe(2);
      expect(bench.loadOutcomesDistribution).toEqual({ below_target: 0, met_target: 0, above_target: 2 });

      // First exposure: +5 kg
      expect(bench.exposures[0].loadDeltasKg[0]).toBe(5);
      // Second exposure: +10 lbs converted to kg (~4.54 kg)
      expect(bench.exposures[1].loadDeltasKg[0]).toBeCloseTo(4.54, 1);

      // Average load delta normalized in kg
      expect(bench.averageLoadDeltaKg).toBeCloseTo(4.77, 1);
      expect(bench.minLoadDeltaKg).toBeCloseTo(4.54, 1);
      expect(bench.maxLoadDeltaKg).toBe(5);
    });
  });

  // ─── 3. Missing prescription data in historical workouts ────────────────────
  describe('Case 3: Missing prescription data in historical workouts', () => {
    it('classifies unprescribed sessions as manual exposures without inferring targets', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-hist-manual',
          date: '2026-09-15T10:00:00Z',
          exercises: [
            {
              name: 'Overhead Press',
              sets: [
                { weight: 50, reps: 8, unit: 'kg', completed: true },
                { weight: 50, reps: 8, unit: 'kg', completed: true },
              ],
            },
          ],
        },
      ];

      const evidence = aggregateMultiSessionEvidence(workouts);
      const ohp = evidence.exercises[canonicalizeExerciseName('Overhead Press')];

      expect(ohp.totalExposures).toBe(1);
      expect(ohp.comparablePrescribedExposures).toBe(0);
      expect(ohp.manualExposures).toBe(1);
      expect(ohp.totalPrescribedSets).toBe(0);
      expect(ohp.completedPrescribedSets).toBe(0);
      expect(ohp.extraCompletedSets).toBe(0);
      expect(ohp.manualCompletedSets).toBe(2);
      expect(ohp.totalCompletedWorkingSets).toBe(2);
      expect(ohp.usableRepComparisonsCount).toBe(0);
      expect(ohp.usableLoadComparisonsCount).toBe(0);
      expect(ohp.averageLoadDeltaKg).toBeNull();
      expect(ohp.averageRpeDelta).toBeNull();

      // Verify actual performance is fully preserved in observations
      expect(ohp.exposures[0].workingSetObservations.length).toBe(2);
      expect(ohp.exposures[0].workingSetObservations[0].actualWeight).toBe(50);
      expect(ohp.exposures[0].workingSetObservations[0].actualReps).toBe(8);
      expect(ohp.exposures[0].workingSetObservations[0].isCompleted).toBe(true);
    });
  });

  // ─── 4. Completed, skipped, and unattempted sets ─────────────────────────────
  describe('Case 4: Mixture of completed, skipped, and unattempted sets', () => {
    it('counts set statuses accurately and excludes skipped/unattempted sets from performance outcomes', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-mix-1',
          date: '2026-10-10T10:00:00Z',
          exercises: [
            {
              name: 'Deadlift',
              sets: [
                {
                  prescribedWeight: 140,
                  prescribedReps: 5,
                  prescribedUnit: 'kg',
                  weight: 140,
                  reps: 5,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
                {
                  prescribedWeight: 140,
                  prescribedReps: 5,
                  prescribedUnit: 'kg',
                  weight: 140,
                  reps: 5,
                  unit: 'kg',
                  status: 'skipped',
                  completed: false,
                },
                {
                  prescribedWeight: 140,
                  prescribedReps: 5,
                  prescribedUnit: 'kg',
                  weight: 140,
                  reps: 5,
                  unit: 'kg',
                  status: 'not_attempted',
                  completed: false,
                },
              ],
            },
          ],
        },
      ];

      const evidence = aggregateMultiSessionEvidence(workouts);
      const dl = evidence.exercises[canonicalizeExerciseName('Deadlift')];

      expect(dl.totalPrescribedSets).toBe(3);
      expect(dl.completedPrescribedSets).toBe(1);
      expect(dl.skippedPrescribedSets).toBe(1);
      expect(dl.notAttemptedPrescribedSets).toBe(1);
      expect(dl.extraCompletedSets).toBe(0);
      expect(dl.manualCompletedSets).toBe(0);
      expect(dl.totalCompletedWorkingSets).toBe(1);

      // Usable comparison should only include the 1 completed set
      expect(dl.usableRepComparisonsCount).toBe(1);
      expect(dl.usableLoadComparisonsCount).toBe(1);
      expect(dl.repOutcomesDistribution).toEqual({ below_target: 0, met_target: 1, above_target: 0 });
    });
  });

  // ─── 5. Extra completed sets excluded from prescribed-target comparisons ────
  describe('Case 5: Extra completed sets excluded from prescribed comparisons', () => {
    it('reports extra completed sets separately without polluting prescribed metrics', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-extra-1',
          date: '2026-10-11T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Row',
              sets: [
                {
                  prescribedWeight: 70,
                  prescribedReps: 8,
                  prescribedUnit: 'kg',
                  weight: 70,
                  reps: 8,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
                // Extra set added during session
                {
                  weight: 75,
                  reps: 6,
                  unit: 'kg',
                  rpe: 9,
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const evidence = aggregateMultiSessionEvidence(workouts);
      const row = evidence.exercises[canonicalizeExerciseName('Barbell Row')];

      expect(row.totalPrescribedSets).toBe(1);
      expect(row.completedPrescribedSets).toBe(1);
      expect(row.extraCompletedSets).toBe(1);
      expect(row.manualCompletedSets).toBe(0);
      expect(row.totalCompletedWorkingSets).toBe(2);
      expect(row.usableRepComparisonsCount).toBe(1); // strictly 1, not 2
      expect(row.repOutcomesDistribution).toEqual({ below_target: 0, met_target: 1, above_target: 0 });
    });
  });

  // ─── 5B. Partially prescribed exposure ──────────────────────────────────────
  describe('Case 5B: Partially prescribed exposure with both planned and unprescribed sets', () => {
    it('classifies planned sets as prescribed and additional completed sets as extra without miscategorizing as manual', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-partial-1',
          date: '2026-10-11T14:00:00Z',
          exercises: [
            {
              name: 'Incline Dumbbell Press',
              sets: [
                {
                  prescribedWeight: 30,
                  prescribedReps: 10,
                  prescribedUnit: 'kg',
                  weight: 30,
                  reps: 10,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
                {
                  prescribedWeight: 30,
                  prescribedReps: 10,
                  prescribedUnit: 'kg',
                  weight: 30,
                  reps: 10,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
                // 3rd set unprescribed, completed during prescribed session
                {
                  weight: 32,
                  reps: 8,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const evidence = aggregateMultiSessionEvidence(workouts);
      const inc = evidence.exercises[canonicalizeExerciseName('Incline Dumbbell Press')];

      expect(inc.totalExposures).toBe(1);
      expect(inc.comparablePrescribedExposures).toBe(1);
      expect(inc.manualExposures).toBe(0);
      expect(inc.totalPrescribedSets).toBe(2);
      expect(inc.completedPrescribedSets).toBe(2);
      expect(inc.extraCompletedSets).toBe(1);
      expect(inc.manualCompletedSets).toBe(0);
      expect(inc.totalCompletedWorkingSets).toBe(3);
      expect(inc.usableRepComparisonsCount).toBe(2);
      expect(inc.repOutcomesDistribution).toEqual({ below_target: 0, met_target: 2, above_target: 0 });
      expect(inc.exposures[0].hasPrescriptionData).toBe(true);
    });
  });

  // ─── 5C. Directional neutral categories for reps, load, and RPE ─────────────
  describe('Case 5C: Neutral directional categories for reps, load, and RPE', () => {
    it('accurately categorizes exact-match, below-target, and above-target outcomes without value judgements', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-neutral-categories',
          date: '2026-10-11T18:00:00Z',
          exercises: [
            {
              name: 'Military Press',
              sets: [
                // Set 1: Below target reps (-2), below target load (-5 kg), below target RPE (-1)
                {
                  prescribedWeight: 60,
                  prescribedUnit: 'kg',
                  prescribedReps: 10,
                  prescribedRpe: 8,
                  weight: 55,
                  unit: 'kg',
                  reps: 8,
                  rpe: 7,
                  status: 'completed',
                  completed: true,
                },
                // Set 2: Exact match (met target) for reps (0), load (0 kg), RPE (0)
                {
                  prescribedWeight: 60,
                  prescribedUnit: 'kg',
                  prescribedReps: 10,
                  prescribedRpe: 8,
                  weight: 60,
                  unit: 'kg',
                  reps: 10,
                  rpe: 8,
                  status: 'completed',
                  completed: true,
                },
                // Set 3: Above target reps (+2), above target load (+5 kg), above target RPE (+1)
                {
                  prescribedWeight: 60,
                  prescribedUnit: 'kg',
                  prescribedReps: 10,
                  prescribedRpe: 8,
                  weight: 65,
                  unit: 'kg',
                  reps: 12,
                  rpe: 9,
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const evidence = aggregateMultiSessionEvidence(workouts);
      const mp = evidence.exercises[canonicalizeExerciseName('Military Press')];
      const obs = mp.exposures[0].workingSetObservations;

      // Set 1: below_target
      expect(obs[0].repDelta).toBe(-2);
      expect(obs[0].repOutcome).toBe('below_target');
      expect(obs[0].loadDeltaKg).toBe(-5);
      expect(obs[0].loadOutcome).toBe('below_target');
      expect(obs[0].rpeDelta).toBe(-1);
      expect(obs[0].rpeOutcome).toBe('below_target');

      // Set 2: met_target
      expect(obs[1].repDelta).toBe(0);
      expect(obs[1].repOutcome).toBe('met_target');
      expect(obs[1].loadDeltaKg).toBe(0);
      expect(obs[1].loadOutcome).toBe('met_target');
      expect(obs[1].rpeDelta).toBe(0);
      expect(obs[1].rpeOutcome).toBe('met_target');

      // Set 3: above_target
      expect(obs[2].repDelta).toBe(2);
      expect(obs[2].repOutcome).toBe('above_target');
      expect(obs[2].loadDeltaKg).toBe(5);
      expect(obs[2].loadOutcome).toBe('above_target');
      expect(obs[2].rpeDelta).toBe(1);
      expect(obs[2].rpeOutcome).toBe('above_target');

      // Aggregate distributions: exactly 1 below_target, 1 met_target, 1 above_target for each
      expect(mp.repOutcomesDistribution).toEqual({ below_target: 1, met_target: 1, above_target: 1 });
      expect(mp.loadOutcomesDistribution).toEqual({ below_target: 1, met_target: 1, above_target: 1 });
      expect(mp.rpeOutcomesDistribution).toEqual({ below_target: 1, met_target: 1, above_target: 1 });

      // Aggregate deltas preserved
      expect(mp.loadDeltasKg).toEqual([-5, 0, 5]);
      expect(mp.averageLoadDeltaKg).toBe(0);
      expect(mp.minLoadDeltaKg).toBe(-5);
      expect(mp.maxLoadDeltaKg).toBe(5);
      expect(mp.rpeDeltas).toEqual([-1, 0, 1]);
      expect(mp.averageRpeDelta).toBe(0);
      expect(mp.minRpeDelta).toBe(-1);
      expect(mp.maxRpeDelta).toBe(1);
    });
  });

  // ─── 6. Warm-up and working-set observations kept distinct ───────────────────
  describe('Case 6: Warm-up and working-set observations kept distinct', () => {
    it('isolates warm-up sets into dedicated structures without combining with working sets', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-warmup-1',
          date: '2026-10-12T10:00:00Z',
          exercises: [
            {
              name: 'Squat',
              sets: [
                {
                  isWarmup: true,
                  prescribedWeight: 40,
                  prescribedReps: 10,
                  prescribedUnit: 'kg',
                  weight: 40,
                  reps: 10,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
                {
                  prescribedWeight: 100,
                  prescribedReps: 8,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 8,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const evidence = aggregateMultiSessionEvidence(workouts);
      const squat = evidence.exercises[canonicalizeExerciseName('Squat')];

      // Working sets strictly count 1 set
      expect(squat.totalPrescribedSets).toBe(1);
      expect(squat.completedPrescribedSets).toBe(1);
      expect(squat.usableRepComparisonsCount).toBe(1);

      // Warmup sets reported in dedicated counters
      expect(squat.totalWarmupSets).toBe(1);
      expect(squat.completedWarmupSets).toBe(1);
      expect(squat.exposures[0].warmupObservations.length).toBe(1);
      expect(squat.exposures[0].warmupObservations[0].isWarmup).toBe(true);
    });
  });

  // ─── 7. Different exercises not incorrectly merged ──────────────────────────
  describe('Case 7: Different exercises not incorrectly merged', () => {
    it('maintains distinct evidence containers for similarly named exercises', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-names-1',
          date: '2026-10-13T10:00:00Z',
          exercises: [
            {
              name: 'Bench Press',
              sets: [
                {
                  prescribedWeight: 80,
                  prescribedReps: 8,
                  prescribedUnit: 'kg',
                  weight: 80,
                  reps: 8,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
            {
              name: 'Incline Bench Press',
              sets: [
                {
                  prescribedWeight: 60,
                  prescribedReps: 10,
                  prescribedUnit: 'kg',
                  weight: 60,
                  reps: 10,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const evidence = aggregateMultiSessionEvidence(workouts);
      expect(evidence.exerciseList.length).toBe(2);

      const flatBench = evidence.exercises[canonicalizeExerciseName('Bench Press')];
      const inclineBench = evidence.exercises[canonicalizeExerciseName('Incline Bench Press')];

      expect(flatBench).toBeDefined();
      expect(inclineBench).toBeDefined();
      expect(flatBench.canonicalExerciseKey).not.toBe(inclineBench.canonicalExerciseKey);
      expect(flatBench.totalPrescribedSets).toBe(1);
      expect(inclineBench.totalPrescribedSets).toBe(1);
    });
  });

  // ─── 8. Missing dates, missing units, and missing RPE ────────────────────────
  describe('Case 8: Missing dates, missing units, and missing RPE', () => {
    it('documents exclusions gracefully without crashing or manufacturing zero-valued evidence', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-missing-meta',
          date: '', // missing date
          exercises: [
            {
              name: 'Lateral Raise',
              sets: [
                {
                  prescribedWeight: 10,
                  // missing prescribedUnit
                  prescribedReps: 12,
                  weight: 10,
                  // missing unit
                  reps: 12,
                  // missing prescribedRpe and actual rpe
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const evidence = aggregateMultiSessionEvidence(workouts);
      const lat = evidence.exercises[canonicalizeExerciseName('Lateral Raise')];

      expect(lat).toBeDefined();
      // Rep comparison works (both reps present)
      expect(lat.usableRepComparisonsCount).toBe(1);
      // Load comparison unusable due to missing unit
      expect(lat.usableLoadComparisonsCount).toBe(0);
      expect(lat.averageLoadDeltaKg).toBeNull();
      // RPE comparison unusable (missing RPE)
      expect(lat.usableRpeComparisonsCount).toBe(0);
      expect(lat.averageRpeDelta).toBeNull();

      // Exclusions documented
      expect(lat.exclusions.some((e) => e.includes('Missing workout date'))).toBe(true);
      expect(lat.exclusions.some((e) => e.includes('Missing weight unit'))).toBe(true);
    });
  });

  // ─── 9. Sessions with zero completed sets ───────────────────────────────────
  describe('Case 9: Sessions with zero completed sets', () => {
    it('records prescribed exposure accurately with 0 completed sets and empty deltas', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-zero-done',
          date: '2026-10-14T10:00:00Z',
          exercises: [
            {
              name: 'Leg Press',
              sets: [
                {
                  prescribedWeight: 200,
                  prescribedReps: 10,
                  prescribedUnit: 'kg',
                  status: 'not_attempted',
                  completed: false,
                },
                {
                  prescribedWeight: 200,
                  prescribedReps: 10,
                  prescribedUnit: 'kg',
                  status: 'skipped',
                  completed: false,
                },
              ],
            },
          ],
        },
      ];

      const evidence = aggregateMultiSessionEvidence(workouts);
      const lp = evidence.exercises[canonicalizeExerciseName('Leg Press')];

      expect(lp.totalPrescribedSets).toBe(2);
      expect(lp.completedPrescribedSets).toBe(0);
      expect(lp.skippedPrescribedSets).toBe(1);
      expect(lp.notAttemptedPrescribedSets).toBe(1);
      expect(lp.usableRepComparisonsCount).toBe(0);
      expect(lp.usableLoadComparisonsCount).toBe(0);
      expect(lp.loadDeltasKg).toEqual([]);
      expect(lp.averageLoadDeltaKg).toBeNull();
    });
  });

  // ─── 10. Empty workout history ──────────────────────────────────────────────
  describe('Case 10: Empty workout history', () => {
    it('returns a clean, typed empty summary structure without NaN or errors', () => {
      const evidence = aggregateMultiSessionEvidence([]);

      expect(evidence.totalWorkoutsAnalyzed).toBe(0);
      expect(evidence.totalExposuresAnalyzed).toBe(0);
      expect(evidence.dateRange).toEqual({ earliest: null, latest: null });
      expect(evidence.exercises).toEqual({});
      expect(evidence.exerciseList).toEqual([]);
      expect(evidence.limitations.length).toBeGreaterThan(0);
    });
  });

  // ─── 11. Correct handling of legacy records ─────────────────────────────────
  describe('Case 11: Correct handling of legacy records', () => {
    it('handles legacy sets with completed boolean and positive reps as manual sets', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-legacy-1',
          date: '2023-12-01T10:00:00Z',
          exercises: [
            {
              name: 'Pull-ups',
              sets: [
                { weight: 0, reps: 10, unit: 'kg', completed: true },
                { weight: 0, reps: 8, unit: 'kg', completed: true },
              ],
            },
          ],
        },
      ];

      const evidence = aggregateMultiSessionEvidence(workouts);
      const pullups = evidence.exercises[canonicalizeExerciseName('Pull-ups')];

      expect(pullups.totalExposures).toBe(1);
      expect(pullups.manualExposures).toBe(1);
      expect(pullups.comparablePrescribedExposures).toBe(0);
      expect(pullups.totalPrescribedSets).toBe(0);
      expect(pullups.completedPrescribedSets).toBe(0);
      expect(pullups.extraCompletedSets).toBe(0);
      expect(pullups.manualCompletedSets).toBe(2);
      expect(pullups.totalCompletedWorkingSets).toBe(2);
      expect(pullups.usableRepComparisonsCount).toBe(0);
      expect(pullups.exposures[0].workingSetObservations[0].actualReps).toBe(10);
      expect(pullups.exposures[0].workingSetObservations[1].actualReps).toBe(8);
    });
  });

  // ─── 12. No duplicate counting or NaN results ───────────────────────────────
  describe('Case 12: No duplicate counting or NaN results', () => {
    it('counts every stored set exactly once even if exercise appears multiple times in a workout', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-dupe-check',
          date: '2026-10-15T10:00:00Z',
          exercises: [
            {
              name: 'Bicep Curl',
              sets: [
                {
                  prescribedWeight: 15,
                  prescribedReps: 10,
                  prescribedUnit: 'kg',
                  weight: 15,
                  reps: 10,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
            // Second block with same exercise name
            {
              name: 'Bicep Curl',
              sets: [
                {
                  prescribedWeight: 15,
                  prescribedReps: 10,
                  prescribedUnit: 'kg',
                  weight: 15,
                  reps: 10,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const evidence = aggregateMultiSessionEvidence(workouts);
      const curl = evidence.exercises[canonicalizeExerciseName('Bicep Curl')];

      // Single combined exposure for the session with exactly 2 sets
      expect(curl.totalExposures).toBe(1);
      expect(curl.totalPrescribedSets).toBe(2);
      expect(curl.completedPrescribedSets).toBe(2);
      expect(curl.usableRepComparisonsCount).toBe(2);
      expect(curl.exposures[0].workingSetObservations.length).toBe(2);

      // Verify no NaN values
      expect(isNaN(curl.averageLoadDeltaKg as number)).toBe(false);
      expect(curl.averageLoadDeltaKg).toBe(0);
    });
  });
});
