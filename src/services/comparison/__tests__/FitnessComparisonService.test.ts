import { describe, it, expect } from 'vitest';
import { FitnessComparisonService } from '../FitnessComparisonService';
import { POPULATION_BENCHMARKS, getReferenceBenchmark } from '../../../config/population_benchmarks.config';
import { UserPerformanceInput } from '../../../types/comparison.types';

describe('FitnessComparisonService — Transparent Fitness Comparison Engine', () => {
  describe('1. 11 Required Comparison Fields Completeness', () => {
    it('produces an evaluation containing all 11 transparent comparison items', () => {
      const evaluation = FitnessComparisonService.calculateComparison({
        exerciseId: 'ex-bench-press',
        exerciseName: 'Barbell Bench Press',
        primaryMuscle: 'Chest',
        movementPattern: 'PUSH_HORIZONTAL',
        userPerformance: {
          weightKg: 100,
          reps: 1,
          rpe: 9.5,
          isTested1Rm: true,
          isSelfReported: false,
          verifiedSessionId: 'session-123',
        },
        bodyweightKg: 80,
      });

      // 1. Exercise
      expect(evaluation.exerciseId).toBe('ex-bench-press');
      expect(evaluation.exerciseName).toBe('Barbell Bench Press');

      // 2. User's entered performance
      expect(evaluation.enteredPerformance.weightKg).toBe(100);
      expect(evaluation.enteredPerformance.reps).toBe(1);
      expect(evaluation.enteredPerformance.effective1RmKg).toBe(100);
      expect(evaluation.enteredPerformance.summaryText).toContain('100 kg × 1 rep');

      // 3. Body weight
      expect(evaluation.bodyweightKg).toBe(80);

      // 4. Relative strength (lifted weight / body weight) & note
      expect(evaluation.relativeStrengthRatio).toBe(1.25); // 100 / 80
      expect(evaluation.relativeStrengthNote).toContain('Relative strength = lifted weight / body weight');
      expect(evaluation.relativeStrengthNote).toContain('not automatically a universal population ranking');

      // 5. Reference group
      expect(evaluation.referenceGroup).toContain('Recreational adult gym-goers');

      // 6. Data source
      expect(evaluation.dataSource).toContain('American College of Sports Medicine');

      // 7. Population and date
      expect(evaluation.populationAndDate).toContain('2021');

      // 8. Method used
      expect(evaluation.methodUsed).toContain('DIRECT_1RM_TEST');

      // 9. Limitations
      expect(evaluation.limitations.length).toBeGreaterThan(0);
      expect(evaluation.limitations.some(l => l.includes('allometric scaling'))).toBe(true);

      // 10. Whether the value is estimated or tested
      expect(evaluation.performanceValueType).toBe('TESTED_1RM');

      // 11. Whether the user's data is self-reported or verified
      expect(evaluation.dataVerificationStatus).toBe('VERIFIED_WORKOUT_DATA');

      // Reliable data flag
      expect(evaluation.hasReliableData).toBe(true);
      expect(evaluation.contextualObservation).toBeDefined();
      expect(evaluation.contextualObservation?.tierName).toBe('Above Average');
    });
  });

  describe('2. Anti-Fabrication & Scientific Integrity Guardrails', () => {
    it('displays "Not enough reliable data for this comparison." for exercises lacking peer-reviewed cohorts', () => {
      const evaluation = FitnessComparisonService.calculateComparison({
        exerciseId: 'ex-bicep-curl',
        exerciseName: 'Dumbbell Bicep Curl',
        userPerformance: {
          weightKg: 20,
          reps: 10,
          isSelfReported: true,
        },
        bodyweightKg: 75,
      });

      expect(evaluation.hasReliableData).toBe(false);
      expect(evaluation.insufficientDataMessage).toBe('Not enough reliable data for this comparison.');
      expect(evaluation.contextualObservation).toBeUndefined();
      expect(evaluation.dataSource).toBe('None (Data Insufficient)');
      expect(evaluation.referenceGroup).toBe('No reliable population-representative data available.');
      expect(evaluation.limitations.some(l => l.includes('ASCEND adheres to scientific data integrity'))).toBe(true);
    });

    it('never treats competitive powerlifting data as general population', () => {
      const bench = getReferenceBenchmark('ex-bench-press', 'Barbell Bench Press');
      const squat = getReferenceBenchmark('ex-back-squat', 'Barbell Back Squat');
      const deadlift = getReferenceBenchmark('ex-deadlift', 'Conventional Deadlift');

      expect(bench.cohortType).toBe('RECREATIONAL_TRAINEES');
      expect(squat.cohortType).toBe('RECREATIONAL_TRAINEES');
      expect(deadlift.cohortType).toBe('RECREATIONAL_TRAINEES');

      expect(bench.limitations.some(l => l.includes('Does NOT represent the sedentary general population'))).toBe(true);
      expect(squat.limitations.some(l => l.includes('Clinical general population surveys DO NOT test 1RM back squats'))).toBe(true);
      expect(deadlift.limitations.some(l => l.includes('Untrained, sedentary adults are not tested for 1RM deadlifts'))).toBe(true);
    });

    it('includes general population caveats and allometric scaling disclaimers', () => {
      const evaluation = FitnessComparisonService.calculateComparison({
        exerciseId: 'ex-back-squat',
        exerciseName: 'Barbell Back Squat',
        userPerformance: {
          weightKg: 140,
          reps: 1,
          isTested1Rm: true,
        },
        bodyweightKg: 80,
      });

      expect(evaluation.generalPopulationCaveat).toContain('ASCEND does not claim you are stronger than any percentage of the general population');
      expect(evaluation.allometricScalingNote).toContain('M^0.67');
      expect(evaluation.allometricScalingNote).toContain('geometric');
    });
  });

  describe('3. Submaximal Epley & Tested 1RM Differentiation', () => {
    it('accurately identifies tested 1RM when reps === 1 and RPE >= 8.5', () => {
      const evaluation = FitnessComparisonService.calculateComparison({
        exerciseId: 'ex-deadlift',
        exerciseName: 'Conventional Deadlift',
        userPerformance: {
          weightKg: 180,
          reps: 1,
          rpe: 9,
          isSelfReported: false,
          verifiedSessionId: 'sess-abc',
        },
        bodyweightKg: 90,
      });

      expect(evaluation.performanceValueType).toBe('TESTED_1RM');
      expect(evaluation.enteredPerformance.effective1RmKg).toBe(180);
      expect(evaluation.relativeStrengthRatio).toBe(2.0); // 180 / 90
      expect(evaluation.contextualObservation?.tierName).toBe('Proficient');
    });

    it('uses Epley estimation for multi-rep sets and strictly notes the <= 10 reps boundary', () => {
      // 100 kg for 5 reps -> 100 * (1 + 5/30) = 116.7 kg
      const evaluation = FitnessComparisonService.calculateComparison({
        exerciseId: 'ex-bench-press',
        exerciseName: 'Barbell Bench Press',
        userPerformance: {
          weightKg: 100,
          reps: 5,
          rpe: 8,
          isSelfReported: false,
          verifiedSessionId: 'sess-def',
        },
        bodyweightKg: 80,
      });

      expect(evaluation.performanceValueType).toBe('ESTIMATED_1RM');
      expect(evaluation.enteredPerformance.effective1RmKg).toBe(116.7);
      expect(evaluation.relativeStrengthRatio).toBe(1.46); // 116.7 / 80 = 1.45875 -> 1.46
      expect(evaluation.enteredPerformance.summaryText).toContain('116.7 kg Estimated 1RM');
    });

    it('strictly caps calculation reps at 10 for sets exceeding 10 reps and documents the limitation', () => {
      const evaluation = FitnessComparisonService.calculateComparison({
        exerciseId: 'ex-back-squat',
        exerciseName: 'Barbell Back Squat',
        userPerformance: {
          weightKg: 100,
          reps: 15,
          isSelfReported: true,
        },
        bodyweightKg: 75,
      });

      expect(evaluation.performanceValueType).toBe('ESTIMATED_1RM');
      expect(evaluation.enteredPerformance.summaryText).toContain('Estimated via submaximal Epley ≤ 10 reps');
    });
  });

  describe('4. Verified Workout Data vs Self-Reported Provenance', () => {
    it('marks workout session records as VERIFIED_WORKOUT_DATA', () => {
      const evaluation = FitnessComparisonService.calculateComparison({
        exerciseId: 'ex-bench-press',
        exerciseName: 'Barbell Bench Press',
        userPerformance: {
          weightKg: 90,
          reps: 5,
          verifiedSessionId: 'active-session-999',
          isSelfReported: false,
        },
        bodyweightKg: 75,
      });

      expect(evaluation.dataVerificationStatus).toBe('VERIFIED_WORKOUT_DATA');
    });

    it('marks simulator or baseline profile numbers as SELF_REPORTED', () => {
      const evaluation = FitnessComparisonService.calculateComparison({
        exerciseId: 'ex-bench-press',
        exerciseName: 'Barbell Bench Press',
        userPerformance: {
          weightKg: 90,
          reps: 5,
          verifiedSessionId: null,
          isSelfReported: true,
        },
        bodyweightKg: 75,
      });

      expect(evaluation.dataVerificationStatus).toBe('SELF_REPORTED');
    });
  });

  describe('5. General Population Muscular Endurance Repetitions (Push-ups, Pull-ups)', () => {
    it('evaluates push-ups against CPAFLA/ACSM general population norms', () => {
      const evaluation = FitnessComparisonService.calculateComparison({
        exerciseId: 'ex-pushups',
        exerciseName: 'Push-ups',
        userPerformance: {
          weightKg: 0,
          reps: 32,
          isSelfReported: false,
          verifiedSessionId: 'sess-pushup',
        },
        bodyweightKg: 70,
      });

      expect(evaluation.performanceValueType).toBe('BODYWEIGHT_REPETITIONS');
      expect(evaluation.referenceGroup).toContain('General adult population across diverse physical activity levels');
      expect(evaluation.contextualObservation?.tierName).toBe('Above Average');
      expect(evaluation.contextualObservation?.percentileBand).toContain('60th - 85th percentile');
      expect(evaluation.limitations.some(l => l.includes('muscular endurance rather than maximal dynamic strength'))).toBe(true);
    });

    it('evaluates pull-ups against active trainee normative benchmarks', () => {
      const evaluation = FitnessComparisonService.calculateComparison({
        exerciseId: 'ex-pullups',
        exerciseName: 'Pull-ups',
        userPerformance: {
          weightKg: 0,
          reps: 12,
          isSelfReported: true,
        },
        bodyweightKg: 75,
      });

      expect(evaluation.performanceValueType).toBe('BODYWEIGHT_REPETITIONS');
      expect(evaluation.contextualObservation?.tierName).toBe('Strong');
      expect(evaluation.limitations.some(l => l.includes('Heavier body mass creates an exponential penalty'))).toBe(true);
    });
  });
});
