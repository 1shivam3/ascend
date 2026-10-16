import {
  WorkoutSet,
  WorkoutExercise,
  WorkoutEntry,
  SetExecutionStatus,
  Unit,
  isSetCompleted,
  getSetExecutionStatus,
} from '@/lib/types';

/** Standard ASCEND pound-to-kilogram conversion constant */
export const LBS_TO_KG = 0.453592;

/** Standard ASCEND kilogram-to-pound conversion constant */
export const KG_TO_LBS = 2.20462;

/**
 * Normalizes any weight value to kilograms.
 */
export function normalizeWeightToKg(weight: number, unit: Unit): number {
  if (weight < 0) return 0; // Guard against negative weights (0 is valid for bodyweight)
  if (unit === 'lbs') {
    return weight * LBS_TO_KG;
  }
  return weight;
}

/**
 * Converts a weight from one unit to another.
 */
export function convertWeight(weight: number, fromUnit: Unit, toUnit: Unit): number {
  if (fromUnit === toUnit) return weight;
  if (fromUnit === 'lbs' && toUnit === 'kg') {
    return weight * LBS_TO_KG;
  }
  if (fromUnit === 'kg' && toUnit === 'lbs') {
    return weight * KG_TO_LBS;
  }
  return weight;
}

/**
 * Determines whether explicit prescription data exists on a workout set.
 *
 * Rules:
 * - A set is prescribed only when it contains at least one actual target field:
 *   `prescribedReps`, `prescribedWeight`, or `prescribedRpe`.
 * - `prescribedUnit` is supporting metadata, not a target by itself. A set containing
 *   only `prescribedUnit` does NOT count as prescribed.
 * - Zero (0) is treated as a valid explicit numeric target (e.g. 0 kg for bodyweight, 0 reps).
 * - Never infers target fields from actual `weight`, `reps`, or `unit`.
 * - Preserves partial but meaningful prescriptions (e.g. reps without load, RPE without reps).
 * - Manually logged historical sets omitting explicit target fields remain unprescribed.
 */
export function isSetPrescribed(set: WorkoutSet): boolean {
  if (!set || typeof set !== 'object') return false;
  return (
    (typeof set.prescribedReps === 'number' && !isNaN(set.prescribedReps)) ||
    (typeof set.prescribedWeight === 'number' && !isNaN(set.prescribedWeight)) ||
    (typeof set.prescribedRpe === 'number' && !isNaN(set.prescribedRpe))
  );
}

/**
 * Detailed actual-versus-prescribed comparison for an individual set.
 */
export interface SetAdherenceComparison {
  exerciseName: string;
  setIndex: number;
  status: SetExecutionStatus;
  isPrescribed: boolean;
  isCompleted: boolean;
  isWarmup: boolean;

  // Prescribed target values (undefined when not specified)
  prescribedReps?: number;
  prescribedWeight?: number;
  prescribedUnit?: Unit;
  prescribedRpe?: number;

  // Actual execution values (undefined when absent or not recorded)
  actualReps?: number;
  actualWeight?: number;
  actualUnit?: Unit;
  actualRpe?: number;

  // Neutral mathematical comparisons (null when unavailable or set not completed)
  repDelta: number | null;
  loadDelta: number | null;     // In prescribed unit, normalized if units differ
  loadDeltaUnit: Unit | null;
  loadDeltaKg: number | null;   // Strictly normalized to kilograms
  rpeDelta: number | null;
}

/**
 * Compares an individual set against its prescription data.
 *
 * Comparison Rules:
 * - Only completed, prescribed sets expose comparison deltas.
 * - If a set was skipped, not attempted, pending, or unprescribed, all deltas are null.
 * - `repDelta`: actual reps minus prescribed reps (requires both to be defined).
 * - `loadDelta`: actual load minus prescribed load in the prescribed unit,
 *   with kg/lb normalization applied when units differ.
 * - `loadDeltaKg`: actual load minus prescribed load strictly normalized to kg.
 * - `rpeDelta`: actual RPE minus prescribed RPE (requires both to be defined).
 * - When load units or RPE are missing, comparison is null (never assumed as zero).
 * - Missing actual values are never silently coerced to zero.
 */
export function compareSetAdherence(
  set: WorkoutSet,
  exerciseName: string = '',
  setIndex: number = 0
): SetAdherenceComparison {
  const isPrescribed = isSetPrescribed(set);
  const status = getSetExecutionStatus(set);
  const completed = isSetCompleted(set);
  const isWarmup = Boolean(set.isWarmup);

  // Runtime safety: parse numeric actual values without silently defaulting missing data to zero
  const actualReps =
    typeof set?.reps === 'number' && !isNaN(set.reps)
      ? set.reps
      : undefined;

  const actualWeight =
    typeof set?.weight === 'number' && !isNaN(set.weight)
      ? set.weight
      : undefined;

  const actualUnit = set?.unit || undefined;

  const actualRpe =
    typeof set?.rpe === 'number' && !isNaN(set.rpe)
      ? set.rpe
      : undefined;

  // Prescribed targets (only valid numbers are preserved)
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

  let repDelta: number | null = null;
  let loadDelta: number | null = null;
  let loadDeltaUnit: Unit | null = null;
  let loadDeltaKg: number | null = null;
  let rpeDelta: number | null = null;

  // Actual-versus-prescribed comparisons are strictly exposed for completed, prescribed sets
  if (completed && isPrescribed) {
    // 1. Rep delta: requires both actual reps and prescribed reps to be defined
    if (actualReps !== undefined && prescribedReps !== undefined) {
      repDelta = actualReps - prescribedReps;
    }

    // 2. Load delta: requires both loads AND both units to be defined
    if (
      actualWeight !== undefined &&
      prescribedWeight !== undefined &&
      actualUnit !== undefined &&
      prescribedUnit !== undefined
    ) {
      const actualKg = normalizeWeightToKg(actualWeight, actualUnit);
      const prescribedKg = normalizeWeightToKg(prescribedWeight, prescribedUnit);
      const rawDeltaKg = actualKg - prescribedKg;

      // Tolerance check for floating point conversion equality
      const deltaKg = Math.abs(rawDeltaKg) < 0.005 ? 0 : Math.round(rawDeltaKg * 100) / 100;
      loadDeltaKg = deltaKg;

      // Express load delta in the prescribed unit
      if (prescribedUnit === 'kg') {
        loadDelta = deltaKg;
        loadDeltaUnit = 'kg';
      } else {
        // Prescribed unit is lbs
        if (actualUnit === 'lbs') {
          const rawDeltaLbs = actualWeight - prescribedWeight;
          loadDelta = Math.round(rawDeltaLbs * 100) / 100;
        } else {
          // Actual was in kg, prescribed in lbs
          const actualLbs = convertWeight(actualWeight, 'kg', 'lbs');
          const rawDeltaLbs = actualLbs - prescribedWeight;
          loadDelta = Math.abs(rawDeltaLbs) < 0.01 ? 0 : Math.round(rawDeltaLbs * 100) / 100;
        }
        loadDeltaUnit = 'lbs';
      }
    }

    // 3. RPE delta: requires both actual RPE and prescribed RPE to be defined
    if (actualRpe !== undefined && prescribedRpe !== undefined) {
      rpeDelta = Math.round((actualRpe - prescribedRpe) * 10) / 10;
    }
  }

  return {
    exerciseName,
    setIndex,
    status,
    isPrescribed,
    isCompleted: completed,
    isWarmup,
    prescribedReps,
    prescribedWeight,
    prescribedUnit,
    prescribedRpe,
    actualReps,
    actualWeight,
    actualUnit,
    actualRpe,
    repDelta,
    loadDelta,
    loadDeltaUnit,
    loadDeltaKg,
    rpeDelta,
  };
}

/**
 * Exercise-level adherence summary.
 */
export interface ExerciseAdherenceSummary {
  exerciseName: string;
  hasPrescriptionData: boolean;
  totalPrescribedSets: number;
  completedPrescribedSets: number;
  skippedPrescribedSets: number;
  notAttemptedPrescribedSets: number;
  extraCompletedSets: number;
  setCompletionRate: number | null;
  setCompletionPercentage: number | null;
  sets: SetAdherenceComparison[];
}

/**
 * Calculates adherence metrics for a single workout exercise.
 */
export function calculateExerciseAdherence(exercise: WorkoutExercise): ExerciseAdherenceSummary {
  const exerciseName = exercise?.name?.trim() || 'Exercise';
  const sets = exercise?.sets || [];

  let totalPrescribedSets = 0;
  let completedPrescribedSets = 0;
  let skippedPrescribedSets = 0;
  let notAttemptedPrescribedSets = 0;
  let extraCompletedSets = 0;

  const setComparisons: SetAdherenceComparison[] = [];

  for (let idx = 0; idx < sets.length; idx++) {
    const s = sets[idx];
    const comparison = compareSetAdherence(s, exerciseName, idx);
    setComparisons.push(comparison);

    if (comparison.isPrescribed) {
      totalPrescribedSets++;
      if (comparison.status === 'completed' || comparison.isCompleted) {
        completedPrescribedSets++;
      } else if (comparison.status === 'skipped') {
        skippedPrescribedSets++;
      } else {
        // 'not_attempted' or 'pending' in finalized workout
        notAttemptedPrescribedSets++;
      }
    } else {
      if (comparison.status === 'completed' || comparison.isCompleted) {
        extraCompletedSets++;
      }
    }
  }

  const hasPrescriptionData = totalPrescribedSets > 0;
  const setCompletionRate = hasPrescriptionData
    ? Math.round((completedPrescribedSets / totalPrescribedSets) * 10000) / 10000
    : null;
  const setCompletionPercentage = setCompletionRate !== null
    ? Math.round(setCompletionRate * 1000) / 10
    : null;

  return {
    exerciseName,
    hasPrescriptionData,
    totalPrescribedSets,
    completedPrescribedSets,
    skippedPrescribedSets,
    notAttemptedPrescribedSets,
    extraCompletedSets,
    setCompletionRate,
    setCompletionPercentage,
    sets: setComparisons,
  };
}

/**
 * Workout-level adherence summary.
 */
export interface WorkoutAdherenceSummary {
  workoutId?: string;
  hasPrescriptionData: boolean;
  totalPrescribedSets: number;
  completedPrescribedSets: number;
  skippedPrescribedSets: number;
  notAttemptedPrescribedSets: number;
  extraCompletedSets: number;
  setCompletionRate: number | null;
  setCompletionPercentage: number | null;
  exercises: ExerciseAdherenceSummary[];
  setComparisons: SetAdherenceComparison[];
}

/**
 * Calculates deterministic workout adherence metrics for an array of workout exercises.
 */
export function calculateWorkoutAdherenceFromExercises(
  exercises: WorkoutExercise[],
  workoutId?: string
): WorkoutAdherenceSummary {
  const safeExercises = exercises || [];

  let totalPrescribedSets = 0;
  let completedPrescribedSets = 0;
  let skippedPrescribedSets = 0;
  let notAttemptedPrescribedSets = 0;
  let extraCompletedSets = 0;

  const exerciseSummaries: ExerciseAdherenceSummary[] = [];
  const allSetComparisons: SetAdherenceComparison[] = [];

  for (const ex of safeExercises) {
    const exSummary = calculateExerciseAdherence(ex);
    exerciseSummaries.push(exSummary);

    totalPrescribedSets += exSummary.totalPrescribedSets;
    completedPrescribedSets += exSummary.completedPrescribedSets;
    skippedPrescribedSets += exSummary.skippedPrescribedSets;
    notAttemptedPrescribedSets += exSummary.notAttemptedPrescribedSets;
    extraCompletedSets += exSummary.extraCompletedSets;

    allSetComparisons.push(...exSummary.sets);
  }

  const hasPrescriptionData = totalPrescribedSets > 0;
  const setCompletionRate = hasPrescriptionData
    ? Math.round((completedPrescribedSets / totalPrescribedSets) * 10000) / 10000
    : null;
  const setCompletionPercentage = setCompletionRate !== null
    ? Math.round(setCompletionRate * 1000) / 10
    : null;

  return {
    workoutId,
    hasPrescriptionData,
    totalPrescribedSets,
    completedPrescribedSets,
    skippedPrescribedSets,
    notAttemptedPrescribedSets,
    extraCompletedSets,
    setCompletionRate,
    setCompletionPercentage,
    exercises: exerciseSummaries,
    setComparisons: allSetComparisons,
  };
}

/**
 * Calculates deterministic workout adherence metrics for a finalized WorkoutEntry.
 */
export function calculateWorkoutAdherence(workout: WorkoutEntry): WorkoutAdherenceSummary {
  return calculateWorkoutAdherenceFromExercises(workout?.exercises || [], workout?.id);
}
