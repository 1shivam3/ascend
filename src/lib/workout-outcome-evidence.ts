import {
  WorkoutEntry,
  WorkoutExercise,
  WorkoutSet,
  SetExecutionStatus,
  Unit,
  isSetCompleted,
  getSetExecutionStatus,
} from '@/lib/types';
import {
  isSetPrescribed,
  compareSetAdherence,
  normalizeWeightToKg,
} from '@/lib/workout-adherence';

/**
 * Neutral directional classification for performance relative to prescribed target.
 * - 'below_target': actual value was below the prescribed target.
 * - 'met_target': actual value matched the prescribed target.
 * - 'above_target': actual value was above the prescribed target.
 *
 * This classification is purely descriptive and directional; it carries no qualitative
 * or coaching judgment. For example, an RPE that is 'above_target' means the effort felt
 * harder than planned, not that the athlete over-achieved.
 */
export type TargetOutcome = 'below_target' | 'met_target' | 'above_target';

/**
 * Granular observation of a single set's outcome within an exposure.
 */
export interface SetOutcomeObservation {
  workoutId?: string;
  workoutDate?: string;
  exerciseName: string;
  setIndex: number;
  status: SetExecutionStatus;
  isCompleted: boolean;
  isPrescribed: boolean;
  isWarmup: boolean;

  // Prescribed targets (undefined when not specified)
  prescribedReps?: number;
  prescribedWeight?: number;
  prescribedUnit?: Unit;
  prescribedRpe?: number;

  // Actual execution values (undefined when absent or not attempted)
  actualReps?: number;
  actualWeight?: number;
  actualUnit?: Unit;
  actualRpe?: number;

  // Usability flags for mathematical comparisons
  hasUsableRepComparison: boolean;
  hasUsableLoadComparison: boolean;
  hasUsableRpeComparison: boolean;

  // Rep comparisons
  repDelta: number | null;
  repOutcome: TargetOutcome | null;

  // Load comparisons (normalized to kg)
  loadDelta: number | null; // In prescribed unit
  loadDeltaUnit: Unit | null;
  loadDeltaKg: number | null;
  loadOutcome: TargetOutcome | null;

  // RPE comparisons
  rpeDelta: number | null;
  rpeOutcome: TargetOutcome | null;

  // Data quality notes for this set
  exclusions: string[];
}

/**
 * Distribution of directional outcomes across sets or exposures.
 */
export interface OutcomeDistribution {
  below_target: number;
  met_target: number;
  above_target: number;
}

/**
 * Summarized evidence for a single exercise exposure within a specific workout session.
 */
export interface ExerciseExposureEvidence {
  workoutId?: string;
  workoutDate?: string;
  exerciseName: string;
  canonicalExerciseKey: string;
  planExerciseId?: string;
  appliedDecisionId?: string;
  exposureIndex: number; // Chronological sequence index (0-based) for this exercise
  hasPrescriptionData: boolean;

  // Working sets counts (strictly excludes warm-up sets)
  totalPrescribedSets: number;
  completedPrescribedSets: number;
  skippedPrescribedSets: number;
  notAttemptedPrescribedSets: number;
  extraCompletedSets: number;
  manualCompletedSets: number;
  totalCompletedWorkingSets: number;

  // Usable comparison counts for working sets
  usableRepComparisonsCount: number;
  usableLoadComparisonsCount: number;
  usableRpeComparisonsCount: number;

  // Working set outcome distributions
  repOutcomes: OutcomeDistribution;
  loadOutcomes: OutcomeDistribution;
  rpeOutcomes: OutcomeDistribution;

  // Load deltas (working sets, in kg)
  loadDeltasKg: number[];
  averageLoadDeltaKg: number | null;

  // RPE deltas (working sets)
  rpeDeltas: number[];
  averageRpeDelta: number | null;

  // Warm-up sets (reported separately)
  warmupSetsCount: number;
  completedWarmupSetsCount: number;
  warmupObservations: SetOutcomeObservation[];

  // Detailed working set observations
  workingSetObservations: SetOutcomeObservation[];

  // Data quality and exclusion notes for this exposure
  exclusions: string[];
}

/**
 * Multi-session evidence aggregation across repeated exposures of a single exercise.
 */
export interface ExerciseOutcomeEvidence {
  exerciseName: string;
  canonicalExerciseKey: string;
  totalExposures: number;
  comparablePrescribedExposures: number;
  manualExposures: number;

  // Cumulative working set counts across all exposures
  totalPrescribedSets: number;
  completedPrescribedSets: number;
  skippedPrescribedSets: number;
  notAttemptedPrescribedSets: number;
  extraCompletedSets: number;
  manualCompletedSets: number;
  totalCompletedWorkingSets: number;

  // Cumulative usable comparison counts
  usableRepComparisonsCount: number;
  usableLoadComparisonsCount: number;
  usableRpeComparisonsCount: number;

  // Cumulative outcome distributions
  repOutcomesDistribution: OutcomeDistribution;
  loadOutcomesDistribution: OutcomeDistribution;
  rpeOutcomesDistribution: OutcomeDistribution;

  // Load deltas across all exposures (in kg)
  loadDeltasKg: number[];
  averageLoadDeltaKg: number | null;
  minLoadDeltaKg: number | null;
  maxLoadDeltaKg: number | null;

  // RPE deltas across all exposures
  rpeDeltas: number[];
  averageRpeDelta: number | null;
  minRpeDelta: number | null;
  maxRpeDelta: number | null;

  // Warm-up totals across all exposures
  totalWarmupSets: number;
  completedWarmupSets: number;

  // Chronologically ordered exposures
  exposures: ExerciseExposureEvidence[];

  // Identifiers of workouts that contributed to this aggregate
  contributingWorkoutIds: string[];

  // Documentation of exclusions and model limitations
  exclusions: string[];
  limitations: string[];
}

/**
 * Top-level container for multi-session training outcome evidence across all exercises.
 */
export interface MultiSessionEvidenceSummary {
  totalWorkoutsAnalyzed: number;
  totalExposuresAnalyzed: number;
  dateRange: {
    earliest: string | null;
    latest: string | null;
  };
  exercises: Record<string, ExerciseOutcomeEvidence>;
  exerciseList: ExerciseOutcomeEvidence[];
  unprocessedWorkouts: { workoutId?: string; reason: string }[];
  limitations: string[];
}

/**
 * Normalizes an exercise name into a canonical grouping key.
 *
 * Identity Rule:
 * Exercises are grouped strictly by exact trimmed lowercase name. Distinct exercise
 * names (such as "Incline Bench Press" vs "Bench Press") are never merged.
 */
export function canonicalizeExerciseName(name: string): string {
  if (!name || typeof name !== 'string') return 'unknown_exercise';
  return name.trim().toLowerCase();
}

/**
 * Classifies a delta into a neutral directional category ('below_target' | 'met_target' | 'above_target').
 */
function classifyOutcome(delta: number, tolerance: number = 0.001): TargetOutcome {
  if (Math.abs(delta) <= tolerance) return 'met_target';
  return delta > 0 ? 'above_target' : 'below_target';
}

/**
 * Analyzes a single WorkoutSet into a SetOutcomeObservation.
 */
export function analyzeSetOutcome(
  set: WorkoutSet,
  exerciseName: string,
  setIndex: number,
  workoutId?: string,
  workoutDate?: string
): SetOutcomeObservation {
  const isPrescribed = isSetPrescribed(set);
  const status = getSetExecutionStatus(set);
  const completed = isSetCompleted(set);
  const isWarmup = Boolean(set?.isWarmup);

  const exclusions: string[] = [];

  // Actual values
  const actualReps =
    typeof set?.reps === 'number' && !isNaN(set.reps) ? set.reps : undefined;
  const actualWeight =
    typeof set?.weight === 'number' && !isNaN(set.weight) ? set.weight : undefined;
  const actualUnit = set?.unit || undefined;
  const actualRpe =
    typeof set?.rpe === 'number' && !isNaN(set.rpe) ? set.rpe : undefined;

  // Prescribed targets
  const prescribedReps =
    typeof set?.prescribedReps === 'number' && !isNaN(set.prescribedReps)
      ? set.prescribedReps
      : undefined;
  const prescribedWeight =
    typeof set?.prescribedWeight === 'number' && !isNaN(set.prescribedWeight)
      ? set.prescribedWeight
      : undefined;
  const prescribedUnit = set?.prescribedUnit || undefined;
  const prescribedRpe =
    typeof set?.prescribedRpe === 'number' && !isNaN(set.prescribedRpe)
      ? set.prescribedRpe
      : undefined;

  // Use the core adherence comparison helper
  const adherenceComparison = compareSetAdherence(set, exerciseName, setIndex);

  let hasUsableRepComparison = false;
  let repDelta: number | null = null;
  let repOutcome: TargetOutcome | null = null;

  let hasUsableLoadComparison = false;
  let loadDelta: number | null = null;
  let loadDeltaUnit: Unit | null = null;
  let loadDeltaKg: number | null = null;
  let loadOutcome: TargetOutcome | null = null;

  let hasUsableRpeComparison = false;
  let rpeDelta: number | null = null;
  let rpeOutcome: TargetOutcome | null = null;

  if (!isPrescribed) {
    if (completed) {
      exclusions.push('Unprescribed set: target comparisons omitted');
    } else {
      exclusions.push('Unprescribed uncompleted set: performance comparisons omitted');
    }
  } else if (!completed) {
    exclusions.push(`Set ${status}: performance comparison omitted`);
  } else {
    // Completed prescribed set

    // 1. Rep comparison
    if (actualReps !== undefined && prescribedReps !== undefined) {
      hasUsableRepComparison = true;
      repDelta = adherenceComparison.repDelta;
      if (repDelta !== null) {
        repOutcome = classifyOutcome(repDelta);
      }
    } else {
      if (prescribedReps === undefined) {
        exclusions.push('Prescription lacked target reps');
      }
      if (actualReps === undefined) {
        exclusions.push('Missing actual reps value');
      }
    }

    // 2. Load comparison
    if (
      actualWeight !== undefined &&
      prescribedWeight !== undefined &&
      actualUnit !== undefined &&
      prescribedUnit !== undefined
    ) {
      hasUsableLoadComparison = true;
      loadDelta = adherenceComparison.loadDelta;
      loadDeltaUnit = adherenceComparison.loadDeltaUnit;
      loadDeltaKg = adherenceComparison.loadDeltaKg;
      if (loadDeltaKg !== null) {
        loadOutcome = classifyOutcome(loadDeltaKg, 0.005);
      }
    } else {
      if (prescribedWeight === undefined) {
        exclusions.push('Prescription lacked target weight');
      }
      if (actualWeight === undefined) {
        exclusions.push('Missing actual weight value');
      }
      if (!prescribedUnit || !actualUnit) {
        exclusions.push('Missing weight unit specification');
      }
    }

    // 3. RPE comparison
    if (actualRpe !== undefined && prescribedRpe !== undefined) {
      hasUsableRpeComparison = true;
      rpeDelta = adherenceComparison.rpeDelta;
      if (rpeDelta !== null) {
        rpeOutcome = classifyOutcome(rpeDelta, 0.05);
      }
    } else {
      if (prescribedRpe === undefined) {
        exclusions.push('Prescription lacked target RPE');
      }
      if (actualRpe === undefined) {
        exclusions.push('Missing actual RPE value');
      }
    }
  }

  return {
    workoutId,
    workoutDate,
    exerciseName,
    setIndex,
    status,
    isCompleted: completed,
    isPrescribed,
    isWarmup,
    prescribedReps,
    prescribedWeight,
    prescribedUnit,
    prescribedRpe,
    actualReps,
    actualWeight,
    actualUnit,
    actualRpe,
    hasUsableRepComparison,
    hasUsableLoadComparison,
    hasUsableRpeComparison,
    repDelta,
    repOutcome,
    loadDelta,
    loadDeltaUnit,
    loadDeltaKg,
    loadOutcome,
    rpeDelta,
    rpeOutcome,
    exclusions,
  };
}

/**
 * Aggregates evidence for a single exercise exposure (all sets of an exercise in a session).
 */
export function getExerciseExposureEvidence(
  exercise: WorkoutExercise,
  workout?: WorkoutEntry,
  exposureIndex: number = 0
): ExerciseExposureEvidence {
  const exerciseName = exercise?.name?.trim() || 'Unknown Exercise';
  const canonicalKey = canonicalizeExerciseName(exerciseName);
  const workoutId = workout?.id;
  const workoutDate = workout?.date;
  const sets = exercise?.sets || [];

  const exclusions: string[] = [];
  if (!workoutDate) {
    exclusions.push('Missing workout date');
  }

  // Pre-determine whether this exposure has recorded prescription context
  // An exposure has prescription context when at least one non-warmup set has prescription targets
  const hasPrescriptionData = sets.some((s) => !s.isWarmup && isSetPrescribed(s));

  let totalPrescribedSets = 0;
  let completedPrescribedSets = 0;
  let skippedPrescribedSets = 0;
  let notAttemptedPrescribedSets = 0;
  let extraCompletedSets = 0;
  let manualCompletedSets = 0;

  let usableRepComparisonsCount = 0;
  let usableLoadComparisonsCount = 0;
  let usableRpeComparisonsCount = 0;

  const repOutcomes: OutcomeDistribution = { below_target: 0, met_target: 0, above_target: 0 };
  const loadOutcomes: OutcomeDistribution = { below_target: 0, met_target: 0, above_target: 0 };
  const rpeOutcomes: OutcomeDistribution = { below_target: 0, met_target: 0, above_target: 0 };

  const loadDeltasKg: number[] = [];
  const rpeDeltas: number[] = [];

  let warmupSetsCount = 0;
  let completedWarmupSetsCount = 0;
  const warmupObservations: SetOutcomeObservation[] = [];
  const workingSetObservations: SetOutcomeObservation[] = [];

  // Iterate each set with deterministic index (each set is counted exactly once)
  for (let sIdx = 0; sIdx < sets.length; sIdx++) {
    const rawSet = sets[sIdx];
    const obs = analyzeSetOutcome(rawSet, exerciseName, sIdx, workoutId, workoutDate);

    if (obs.exclusions.length > 0) {
      exclusions.push(...obs.exclusions);
    }

    if (obs.isWarmup) {
      warmupSetsCount++;
      if (obs.isCompleted) {
        completedWarmupSetsCount++;
      }
      warmupObservations.push(obs);
      continue;
    }

    // Working set
    workingSetObservations.push(obs);

    if (obs.isPrescribed) {
      totalPrescribedSets++;
      if (obs.isCompleted) {
        completedPrescribedSets++;
      } else if (obs.status === 'skipped') {
        skippedPrescribedSets++;
      } else {
        notAttemptedPrescribedSets++;
      }

      if (obs.hasUsableRepComparison && obs.repOutcome) {
        usableRepComparisonsCount++;
        repOutcomes[obs.repOutcome]++;
      }

      if (obs.hasUsableLoadComparison && obs.loadOutcome && obs.loadDeltaKg !== null) {
        usableLoadComparisonsCount++;
        loadOutcomes[obs.loadOutcome]++;
        loadDeltasKg.push(obs.loadDeltaKg);
      }

      if (obs.hasUsableRpeComparison && obs.rpeOutcome && obs.rpeDelta !== null) {
        usableRpeComparisonsCount++;
        rpeOutcomes[obs.rpeOutcome]++;
        rpeDeltas.push(obs.rpeDelta);
      }
    } else {
      // Unprescribed working set
      if (obs.isCompleted) {
        if (hasPrescriptionData) {
          // Exposure has planned context; this completed set was additional to the plan
          extraCompletedSets++;
        } else {
          // Wholly unprescribed/manual exposure; set is part of normal manual history, not extra
          manualCompletedSets++;
        }
      }
    }
  }

  const totalCompletedWorkingSets = completedPrescribedSets + extraCompletedSets + manualCompletedSets;

  const averageLoadDeltaKg =
    loadDeltasKg.length > 0
      ? Math.round((loadDeltasKg.reduce((sum, d) => sum + d, 0) / loadDeltasKg.length) * 100) / 100
      : null;

  const averageRpeDelta =
    rpeDeltas.length > 0
      ? Math.round((rpeDeltas.reduce((sum, d) => sum + d, 0) / rpeDeltas.length) * 10) / 10
      : null;

  return {
    workoutId,
    workoutDate,
    exerciseName,
    canonicalExerciseKey: canonicalKey,
    planExerciseId: exercise.planExerciseId,
    appliedDecisionId: exercise.appliedDecisionId,
    exposureIndex,
    hasPrescriptionData,
    totalPrescribedSets,
    completedPrescribedSets,
    skippedPrescribedSets,
    notAttemptedPrescribedSets,
    extraCompletedSets,
    manualCompletedSets,
    totalCompletedWorkingSets,
    usableRepComparisonsCount,
    usableLoadComparisonsCount,
    usableRpeComparisonsCount,
    repOutcomes,
    loadOutcomes,
    rpeOutcomes,
    loadDeltasKg,
    averageLoadDeltaKg,
    rpeDeltas,
    averageRpeDelta,
    warmupSetsCount,
    completedWarmupSetsCount,
    warmupObservations,
    workingSetObservations,
    exclusions,
  };
}

/**
 * Aggregates evidence across multiple exposures for a specific exercise.
 */
export function aggregateExerciseEvidenceFromExposures(
  exerciseName: string,
  exposures: ExerciseExposureEvidence[]
): ExerciseOutcomeEvidence {
  const canonicalKey = canonicalizeExerciseName(exerciseName);
  const safeExposures = exposures || [];

  let totalPrescribedSets = 0;
  let completedPrescribedSets = 0;
  let skippedPrescribedSets = 0;
  let notAttemptedPrescribedSets = 0;
  let extraCompletedSets = 0;
  let manualCompletedSets = 0;

  let usableRepComparisonsCount = 0;
  let usableLoadComparisonsCount = 0;
  let usableRpeComparisonsCount = 0;

  const repOutcomesDistribution: OutcomeDistribution = { below_target: 0, met_target: 0, above_target: 0 };
  const loadOutcomesDistribution: OutcomeDistribution = { below_target: 0, met_target: 0, above_target: 0 };
  const rpeOutcomesDistribution: OutcomeDistribution = { below_target: 0, met_target: 0, above_target: 0 };

  const loadDeltasKg: number[] = [];
  const rpeDeltas: number[] = [];

  let totalWarmupSets = 0;
  let completedWarmupSets = 0;

  let comparablePrescribedExposures = 0;
  let manualExposures = 0;

  const contributingWorkoutIds: string[] = [];
  const exclusions: string[] = [];

  for (const exp of safeExposures) {
    if (exp.workoutId && !contributingWorkoutIds.includes(exp.workoutId)) {
      contributingWorkoutIds.push(exp.workoutId);
    }

    if (exp.hasPrescriptionData) {
      comparablePrescribedExposures++;
    } else {
      manualExposures++;
    }

    totalPrescribedSets += exp.totalPrescribedSets;
    completedPrescribedSets += exp.completedPrescribedSets;
    skippedPrescribedSets += exp.skippedPrescribedSets;
    notAttemptedPrescribedSets += exp.notAttemptedPrescribedSets;
    extraCompletedSets += exp.extraCompletedSets;
    manualCompletedSets += exp.manualCompletedSets;

    usableRepComparisonsCount += exp.usableRepComparisonsCount;
    usableLoadComparisonsCount += exp.usableLoadComparisonsCount;
    usableRpeComparisonsCount += exp.usableRpeComparisonsCount;

    repOutcomesDistribution.below_target += exp.repOutcomes.below_target;
    repOutcomesDistribution.met_target += exp.repOutcomes.met_target;
    repOutcomesDistribution.above_target += exp.repOutcomes.above_target;

    loadOutcomesDistribution.below_target += exp.loadOutcomes.below_target;
    loadOutcomesDistribution.met_target += exp.loadOutcomes.met_target;
    loadOutcomesDistribution.above_target += exp.loadOutcomes.above_target;

    rpeOutcomesDistribution.below_target += exp.rpeOutcomes.below_target;
    rpeOutcomesDistribution.met_target += exp.rpeOutcomes.met_target;
    rpeOutcomesDistribution.above_target += exp.rpeOutcomes.above_target;

    loadDeltasKg.push(...exp.loadDeltasKg);
    rpeDeltas.push(...exp.rpeDeltas);

    totalWarmupSets += exp.warmupSetsCount;
    completedWarmupSets += exp.completedWarmupSetsCount;

    if (exp.exclusions.length > 0) {
      exclusions.push(...exp.exclusions);
    }
  }

  const totalCompletedWorkingSets = completedPrescribedSets + extraCompletedSets + manualCompletedSets;

  const averageLoadDeltaKg =
    loadDeltasKg.length > 0
      ? Math.round((loadDeltasKg.reduce((sum, d) => sum + d, 0) / loadDeltasKg.length) * 100) / 100
      : null;

  const minLoadDeltaKg = loadDeltasKg.length > 0 ? Math.min(...loadDeltasKg) : null;
  const maxLoadDeltaKg = loadDeltasKg.length > 0 ? Math.max(...loadDeltasKg) : null;

  const averageRpeDelta =
    rpeDeltas.length > 0
      ? Math.round((rpeDeltas.reduce((sum, d) => sum + d, 0) / rpeDeltas.length) * 10) / 10
      : null;

  const minRpeDelta = rpeDeltas.length > 0 ? Math.min(...rpeDeltas) : null;
  const maxRpeDelta = rpeDeltas.length > 0 ? Math.max(...rpeDeltas) : null;

  const limitations = [
    'Exercises are identified and grouped strictly by exact normalized name; the current data model does not provide unique exercise UUIDs.',
    'Comparisons between exposures rely on chronological sorting of recorded session dates.',
    'Wholly manual exposures do not have planned target data and their completed sets are reported as manual completed sets, not extra sets.',
    'No coaching instructions, deload triggers, or readiness thresholds are applied in this evidence layer.',
  ];

  return {
    exerciseName,
    canonicalExerciseKey: canonicalKey,
    totalExposures: safeExposures.length,
    comparablePrescribedExposures,
    manualExposures,
    totalPrescribedSets,
    completedPrescribedSets,
    skippedPrescribedSets,
    notAttemptedPrescribedSets,
    extraCompletedSets,
    manualCompletedSets,
    totalCompletedWorkingSets,
    usableRepComparisonsCount,
    usableLoadComparisonsCount,
    usableRpeComparisonsCount,
    repOutcomesDistribution,
    loadOutcomesDistribution,
    rpeOutcomesDistribution,
    loadDeltasKg,
    averageLoadDeltaKg,
    minLoadDeltaKg,
    maxLoadDeltaKg,
    rpeDeltas,
    averageRpeDelta,
    minRpeDelta,
    maxRpeDelta,
    totalWarmupSets,
    completedWarmupSets,
    exposures: safeExposures,
    contributingWorkoutIds,
    exclusions,
    limitations,
  };
}

/**
 * Public Entrypoint: Summarizes multi-session training outcome evidence across all workouts.
 *
 * Rules:
 * 1. Sorts workouts chronologically (oldest to newest) to establish valid exposure ordering.
 * 2. Groups exposures strictly by canonical exercise name (no fuzzy merging).
 * 3. Never infers prescriptions for historical/manual records.
 * 4. Excludes skipped, unattempted, and extra sets from target comparison metrics.
 * 5. Isolates warm-up sets from working sets.
 * 6. Normalizes load comparisons to kilograms using standard ASCEND conversion factors.
 * 7. Returns typed empty structures rather than manufacturing zero-valued evidence.
 * 8. Never produces coaching decisions (e.g. increase weight, deload).
 */
export function aggregateMultiSessionEvidence(
  workouts: WorkoutEntry[]
): MultiSessionEvidenceSummary {
  const safeWorkouts = workouts || [];
  const unprocessedWorkouts: { workoutId?: string; reason: string }[] = [];

  // Sort workouts chronologically (oldest first -> newest last)
  const sortedWorkouts = [...safeWorkouts].sort((a, b) => {
    const timeA = a?.date ? new Date(a.date).getTime() : NaN;
    const timeB = b?.date ? new Date(b.date).getTime() : NaN;

    if (isNaN(timeA) && isNaN(timeB)) return 0;
    if (isNaN(timeA)) return -1;
    if (isNaN(timeB)) return 1;
    return timeA - timeB;
  });

  // Track exposures grouped by canonical exercise key
  const exposuresByExerciseKey: Record<string, ExerciseExposureEvidence[]> = {};
  const exerciseDisplayNameByKey: Record<string, string> = {};

  let totalExposuresAnalyzed = 0;
  let earliestDate: string | null = null;
  let latestDate: string | null = null;

  for (const workout of sortedWorkouts) {
    if (!workout || typeof workout !== 'object') {
      unprocessedWorkouts.push({ reason: 'Invalid or null workout entry' });
      continue;
    }

    if (workout.date) {
      if (!earliestDate || workout.date < earliestDate) {
        earliestDate = workout.date;
      }
      if (!latestDate || workout.date > latestDate) {
        latestDate = workout.date;
      }
    }

    const exercises = workout.exercises || [];

    // Group exercises by canonical key in this workout to detect duplicates
    const exercisesByCanonicalKey: Record<string, WorkoutExercise[]> = {};
    for (const ex of exercises) {
      if (!ex || !ex.name) continue;
      const key = canonicalizeExerciseName(ex.name);
      if (!exercisesByCanonicalKey[key]) {
        exercisesByCanonicalKey[key] = [];
      }
      exercisesByCanonicalKey[key].push(ex);
    }

    for (const [key, exList] of Object.entries(exercisesByCanonicalKey)) {
      if (!exerciseDisplayNameByKey[key]) {
        exerciseDisplayNameByKey[key] = exList[0].name.trim();
      }

      if (exList.length === 1) {
        // Single instance of this exercise in this workout session
        const ex = exList[0];
        if (!exposuresByExerciseKey[key]) {
          exposuresByExerciseKey[key] = [];
        }
        const exposureSeqIndex = exposuresByExerciseKey[key].length;
        const exposureEvidence = getExerciseExposureEvidence(ex, workout, exposureSeqIndex);
        exposuresByExerciseKey[key].push(exposureEvidence);

        if (ex.planExerciseId) {
          const subKey = `${key}::${ex.planExerciseId}`;
          if (!exposuresByExerciseKey[subKey]) exposuresByExerciseKey[subKey] = [];
          exposuresByExerciseKey[subKey].push(exposureEvidence);
          if (!exerciseDisplayNameByKey[subKey]) exerciseDisplayNameByKey[subKey] = ex.name.trim();

          if (!exposuresByExerciseKey[ex.planExerciseId]) exposuresByExerciseKey[ex.planExerciseId] = [];
          exposuresByExerciseKey[ex.planExerciseId].push(exposureEvidence);
          if (!exerciseDisplayNameByKey[ex.planExerciseId]) exerciseDisplayNameByKey[ex.planExerciseId] = ex.name.trim();
        }
        totalExposuresAnalyzed++;
      } else {
        // Multiple blocks of this exercise in the same session!
        // Check if they are compatible unsegmented blocks (identical prescriptions, no distinct IDs)
        const allHaveNoIds = exList.every((e) => !e.planExerciseId && !e.appliedDecisionId);
        const pSet0 = (exList[0].sets || []).find((s) => isSetPrescribed(s));
        const allMatchingPrescriptions = exList.every((e) => {
          const s = (e.sets || []).find((st) => isSetPrescribed(st));
          if (!pSet0 && !s) return true;
          if (!pSet0 || !s) return false;
          return (
            s.prescribedWeight === pSet0.prescribedWeight &&
            s.prescribedReps === pSet0.prescribedReps &&
            s.prescribedUnit === pSet0.prescribedUnit
          );
        });

        if (allHaveNoIds && allMatchingPrescriptions) {
          // Compatible identical blocks within the same session (e.g. split sets)
          const combinedSets: WorkoutSet[] = [];
          for (const e of exList) {
            combinedSets.push(...(e.sets || []));
          }
          if (!exposuresByExerciseKey[key]) exposuresByExerciseKey[key] = [];
          const exposureSeqIndex = exposuresByExerciseKey[key].length;
          const exposureEvidence = getExerciseExposureEvidence(
            { name: exList[0].name.trim(), sets: combinedSets },
            workout,
            exposureSeqIndex
          );
          exposuresByExerciseKey[key].push(exposureEvidence);
          totalExposuresAnalyzed++;
        } else {
          // Distinct or ambiguous instances!
          // DO NOT SILENTLY COMBINE! Isolate each instance.
          for (let i = 0; i < exList.length; i++) {
            const ex = exList[i];
            const exposureEvidence = getExerciseExposureEvidence(ex, workout, i);

            if (!ex.planExerciseId && !ex.appliedDecisionId) {
              exposureEvidence.exclusions.push(
                'Ambiguous duplicate exercise instance in same session; sets not combined to prevent evidence distortion'
              );
            }

            if (ex.planExerciseId) {
              const subKey = `${key}::${ex.planExerciseId}`;
              if (!exposuresByExerciseKey[subKey]) exposuresByExerciseKey[subKey] = [];
              exposuresByExerciseKey[subKey].push(exposureEvidence);
              if (!exerciseDisplayNameByKey[subKey]) exerciseDisplayNameByKey[subKey] = ex.name.trim();

              if (!exposuresByExerciseKey[ex.planExerciseId]) exposuresByExerciseKey[ex.planExerciseId] = [];
              exposuresByExerciseKey[ex.planExerciseId].push(exposureEvidence);
              if (!exerciseDisplayNameByKey[ex.planExerciseId]) exerciseDisplayNameByKey[ex.planExerciseId] = ex.name.trim();
            }

            // Include in general key only if it is the primary instance or has appliedDecisionId
            if (ex.appliedDecisionId || i === 0) {
              if (!exposuresByExerciseKey[key]) exposuresByExerciseKey[key] = [];
              exposuresByExerciseKey[key].push(exposureEvidence);
            }
            totalExposuresAnalyzed++;
          }
        }
      }
    }
  }

  const exerciseMap: Record<string, ExerciseOutcomeEvidence> = {};
  const exerciseList: ExerciseOutcomeEvidence[] = [];

  for (const [key, exposures] of Object.entries(exposuresByExerciseKey)) {
    const displayName = exerciseDisplayNameByKey[key] || key;
    const aggregate = aggregateExerciseEvidenceFromExposures(displayName, exposures);
    exerciseMap[key] = aggregate;
    exerciseList.push(aggregate);
  }

  // Sort exercise list alphabetically by display name
  exerciseList.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));

  const limitations = [
    'Exercises are identified and grouped strictly by exact normalized name; the current data model does not provide unique exercise UUIDs.',
    'Chronological exposure order relies on workout dates; missing dates default to recorded sequence order.',
    'This module is strictly an evidence layer; it does not issue training recommendations, weight changes, or deload decisions.',
  ];

  return {
    totalWorkoutsAnalyzed: safeWorkouts.length,
    totalExposuresAnalyzed,
    dateRange: {
      earliest: earliestDate,
      latest: latestDate,
    },
    exercises: exerciseMap,
    exerciseList,
    unprocessedWorkouts,
    limitations,
  };
}
