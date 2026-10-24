import type { PlannedExercise } from './types';

/**
 * Plan-modal validation, extracted from PlanModal.handleSave so it is
 * unit-testable (the modal itself is not).
 *
 * LIVE-P1-01: a blank TARGET WEIGHT (OPTIONAL) used to fail validation
 * with "weight cannot be negative". The cause was `Number(undefined)`
 * → NaN → `!Number.isFinite(weight)` → error. Blank weight is a
 * legitimate choice — it means bodyweight / no prescribed load, and
 * every downstream consumer already handles it: the plan list omits
 * the "@ weight" suffix, the workout screen shows "Unconfigured load",
 * and the %-1RM suggester skips exercises with no explicit weight.
 * So blank (undefined / null / '') is VALID here. Only a present,
 * non-numeric or negative weight is rejected.
 */
export type PlanExerciseErrorKind = 'sets' | 'reps' | 'weight';

export interface PlanExerciseError {
  /** Trimmed exercise name, for the toast. */
  name: string;
  kind: PlanExerciseErrorKind;
}

export type PlanValidationResult =
  | { ok: true; exercises: PlannedExercise[] }
  | { ok: false; error: PlanExerciseError };

function isBlankWeight(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}

export function validatePlanExercises(
  exercises: PlannedExercise[]
): PlanValidationResult {
  const valid = exercises.filter((e) => e.name.trim());
  for (const ex of valid) {
    const name = ex.name.trim();
    const sets = Number(ex.targetSets);
    if (!Number.isFinite(sets) || sets < 1) {
      return { ok: false, error: { name, kind: 'sets' } };
    }
    const reps = Number(ex.targetReps);
    if (!Number.isFinite(reps) || reps < 1) {
      return { ok: false, error: { name, kind: 'reps' } };
    }
    // Blank weight = bodyweight / unconfigured load: allowed. A present
    // weight must be a finite, non-negative number.
    if (!isBlankWeight(ex.targetWeight)) {
      const weight = Number(ex.targetWeight);
      if (!Number.isFinite(weight) || weight < 0) {
        return { ok: false, error: { name, kind: 'weight' } };
      }
    }
  }
  return { ok: true, exercises: valid };
}
