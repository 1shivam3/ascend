export type ReferenceCohortType =
  | 'GENERAL_POPULATION'
  | 'RECREATIONAL_TRAINEES'
  | 'INSUFFICIENT_DATA';

export type ComparisonMethodology =
  | 'DIRECT_1RM_TEST'
  | 'SUBMAXIMAL_EPLEY_PREDICTION'
  | 'MAX_CONSECUTIVE_REPETITIONS'
  | 'ISOMETRIC_DYNAMOMETRY'
  | 'NO_STANDARDIZED_PROTOCOL';

export interface PopulationNormBand {
  tierName: string; // e.g. "Below Average", "Average", "Above Average", "Well Above Average"
  percentileRangeDescription: string; // e.g. "Approx. 40th - 60th percentile of cohort"
  minRatio?: number; // relative to bodyweight
  maxRatio?: number;
  minReps?: number;
  maxReps?: number;
  contextNote: string;
}

export interface ReferenceBenchmark {
  exerciseId: string;
  exerciseName: string;
  cohortType: ReferenceCohortType;
  referenceGroupDescription: string;
  dataSourceCitation: string;
  publicationDate: string;
  sampleDescription: string;
  methodUsed: ComparisonMethodology;
  methodDescription: string;
  limitations: string[];
  normBands?: PopulationNormBand[];
  insufficientDataReason?: string;
  supportedMetrics: ('1RM' | 'REPETITIONS' | 'RELATIVE_STRENGTH')[];
}

export interface UserPerformanceInput {
  weightKg: number;
  reps: number;
  rpe?: number | null;
  isTested1Rm?: boolean;
  isEstimated1Rm?: boolean;
  isSelfReported?: boolean;
  verifiedSessionId?: string | null;
}

export interface FitnessComparisonEvaluation {
  // 1. Exercise
  exerciseId: string;
  exerciseName: string;
  primaryMuscle: string;
  movementPattern: string;

  // 2. User's entered performance
  enteredPerformance: {
    weightKg: number;
    reps: number;
    rpe: number | null;
    effective1RmKg: number;
    summaryText: string;
  };

  // 3. Body weight
  bodyweightKg: number;

  // 4. Relative strength
  relativeStrengthRatio: number; // lifted weight / body weight
  relativeStrengthNote: string;

  // 5. Reference group
  referenceGroup: string;

  // 6. Data source
  dataSource: string;

  // 7. Population and date
  populationAndDate: string;

  // 8. Method used
  methodUsed: string;

  // 9. Limitations
  limitations: string[];

  // 10. Whether the value is estimated or tested
  performanceValueType: 'TESTED_1RM' | 'ESTIMATED_1RM' | 'BEST_WORKING_SET' | 'BODYWEIGHT_REPETITIONS';

  // 11. Whether the user's data is self-reported or verified
  dataVerificationStatus: 'VERIFIED_WORKOUT_DATA' | 'SELF_REPORTED';

  // Reliable data state
  hasReliableData: boolean;
  insufficientDataMessage?: string;

  // Matched cohort observation (if reliable data exists)
  contextualObservation?: {
    tierName: string;
    description: string;
    percentileBand: string;
  };

  generalPopulationCaveat: string;
  allometricScalingNote: string;
}
