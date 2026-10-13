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
 * Outcome category for performance relative to prescribed target.
 * - 'under': actual performance was below the prescribed target.
 * - 'met': actual performance matched the prescribed target exactly.
 * - 'exceeded': actual performance was above the prescribed target.
 */
export type TargetOutcome = 'under' | 'met' | 'exceeded';

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
 * Distribution of outcomes across sets or exposures.
 */
export interface OutcomeDistribution {
  under: number;
  met: number;
  exceeded: number;
}

/**
 * Summarized evidence for a single exercise exposure within a specific workout session.
 */
export interface ExerciseExposureEvidence {
  workoutId?: string;
  workoutDate?: string;
  exerciseName: string;
  canonicalExerciseKey: string;
  exposureIndex: number; // Chronological sequence index (0-based) for this exercise
  hasPrescriptionData: boolean;

  // Working sets counts (strictly excludes warm-up sets)
  totalPrescribedSets: number;
  completedPrescribedSets: number;
  skippedPrescribedSets: number;
  notAttemptedPrescribedSets: number;
  extraCompletedSets: number;

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
 * Classifies a delta into an outcome category ('under' | 'met' | 'exceeded').
 */
function classifyOutcome(delta: number, tolerance: number = 0.001): TargetOutcome {
  if (Math.abs(delta) <= tolerance) return 'met';
  return delta > 0 ? 'exceeded' : 'under';
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
      exclusions.push('Unprescribed extra set: target comparisons omitted');
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

  let totalPrescribedSets = 0;
  let completedPrescribedSets = 0;
  let skippedPrescribedSets = 0;
  let notAttemptedPrescribedSets = 0;
  let extraCompletedSets = 0;

  let usableRepComparisonsCount = 0;
  let usableLoadComparisonsCount = 0;
  let usableRpeComparisonsCount = 0;

  const repOutcomes: OutcomeDistribution = { under: 0, met: 0, exceeded: 0 };
  const loadOutcomes: OutcomeDistribution = { under: 0, met: 0, exceeded: 0 };
  const rpeOutcomes: OutcomeDistribution = { under: 0, met: 0, exceeded: 0 };

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
      // Extra working set
      if (obs.isCompleted) {
        extraCompletedSets++;
      }
    }
  }

  const hasPrescriptionData = totalPrescribedSets > 0;

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
    exposureIndex,
    hasPrescriptionData,
    totalPrescribedSets,
    completedPrescribedSets,
    skippedPrescribedSets,
    notAttemptedPrescribedSets,
    extraCompletedSets,
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

  let usableRepComparisonsCount = 0;
  let usableLoadComparisonsCount = 0;
  let usableRpeComparisonsCount = 0;

  const repOutcomesDistribution: OutcomeDistribution = { under: 0, met: 0, exceeded: 0 };
  const loadOutcomesDistribution: OutcomeDistribution = { under: 0, met: 0, exceeded: 0 };
  const rpeOutcomesDistribution: OutcomeDistribution = { under: 0, met: 0, exceeded: 0 };

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

    usableRepComparisonsCount += exp.usableRepComparisonsCount;
    usableLoadComparisonsCount += exp.usableLoadComparisonsCount;
    usableRpeComparisonsCount += exp.usableRpeComparisonsCount;

    repOutcomesDistribution.under += exp.repOutcomes.under;
    repOutcomesDistribution.met += exp.repOutcomes.met;
    repOutcomesDistribution.exceeded += exp.repOutcomes.exceeded;

    loadOutcomesDistribution.under += exp.loadOutcomes.under;
    loadOutcomesDistribution.met += exp.loadOutcomes.met;
    loadOutcomesDistribution.exceeded += exp.loadOutcomes.exceeded;

    rpeOutcomesDistribution.under += exp.rpeOutcomes.under;
    rpeOutcomesDistribution.met += exp.rpeOutcomes.met;
    rpeOutcomesDistribution.exceeded += exp.rpeOutcomes.exceeded;

    loadDeltasKg.push(...exp.loadDeltasKg);
    rpeDeltas.push(...exp.rpeDeltas);

    totalWarmupSets += exp.warmupSetsCount;
    completedWarmupSets += exp.completedWarmupSetsCount;

    if (exp.exclusions.length > 0) {
      exclusions.push(...exp.exclusions);
    }
  }

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

    // Group sets by canonical exercise key within this workout
    // (handles rare cases where an exercise appears in multiple blocks within the same session)
    const exerciseBlocksByCanonicalKey: Record<string, { name: string; sets: WorkoutSet[] }> = {};

    for (const ex of exercises) {
      if (!ex || !ex.name) continue;
      const key = canonicalizeExerciseName(ex.name);
      if (!exerciseBlocksByCanonicalKey[key]) {
        exerciseBlocksByCanonicalKey[key] = {
          name: ex.name.trim(),
          sets: [],
        };
      }
      // Combine sets for this session (preserving exact sequential order, no duplicates)
      exerciseBlocksByCanonicalKey[key].sets.push(...(ex.sets || []));
    }

    for (const [key, block] of Object.entries(exerciseBlocksByCanonicalKey)) {
      if (!exerciseDisplayNameByKey[key]) {
        exerciseDisplayNameByKey[key] = block.name;
      }

      if (!exposuresByExerciseKey[key]) {
        exposuresByExerciseKey[key] = [];
      }

      const exposureSeqIndex = exposuresByExerciseKey[key].length;
      const exposureEvidence = getExerciseExposureEvidence(
        { name: block.name, sets: block.sets },
        workout,
        exposureSeqIndex
      );

      exposuresByExerciseKey[key].push(exposureEvidence);
      totalExposuresAnalyzed++;
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
