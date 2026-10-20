/**
 * Crowded-gym ("Gym packed?") mode.
 *
 * When the gym is packed, the bench, rack and cables are taken — but a
 * pair of dumbbells or a patch of floor is almost always free. This module
 * finds, for any exercise, the one-tap swap to a dumbbell/bodyweight
 * equivalent for the SAME muscle group, reusing the existing swap
 * machinery rather than a second substitution table:
 *
 *  1. `getFilteredSubstitutes` — the in-workout "Hurts"/swap flow's own
 *     filter — with the `home_dumbbells` equipment profile (dumbbell +
 *     bodyweight + cardio; bar-dependent moves already excluded there).
 *  2. The equipment TWINS that filter drops: its self-check compares
 *     prefix-stripped keys (normalizeExerciseKey strips "dumbbell"), so
 *     "Dumbbell Bench Press" reads as the same exercise as "Bench Press".
 *     For the swap UI that's correct; here the twin IS the suggestion,
 *     so it is recovered from the raw table and re-checked against the
 *     user's exclusions.
 *  3. `adaptExerciseForEquipment` — the plan-adaptation pipeline, with
 *     its movement-pattern and muscle fallbacks — when the table has
 *     no fit. Its pick must pass the same checks, and bar-dependent
 *     picks (pull-ups/chin-ups need a bar a packed gym can't promise)
 *     trigger one retry with those excluded so the pipeline surfaces
 *     its next-best option instead.
 *
 * A suggestion is only offered when ALL of these hold:
 *  - the original needs more than minimal equipment (a dumbbell or
 *    bodyweight exercise is already packed-gym-proof → null);
 *  - the candidate uses dumbbell or bodyweight only, per the most
 *    reliable equipment source available (substitution-table tag →
 *    exercise library → name heuristic);
 *  - the candidate trains the same muscle group (per the exercise
 *    library's resolver — a swap that changes the training stimulus
 *    is not a swap, it's a different workout);
 *  - the candidate is not on the user's exclusion list and needs no bar.
 *
 * Accepting a suggestion goes through the existing swap paths (the
 * in-workout exercise-change handler, or a plan copy on the preview
 * screen), so an accepted swap is a real plan/session change that
 * stays even after the mode is toggled off.
 */
import {
  adaptExerciseForEquipment,
  adaptedLoadFor,
  exerciseMatchesExclusion,
  getFilteredSubstitutes,
  getQuickSubstitutes,
  isPlaceholderSubstitute,
  normalizeExerciseKey,
  type ExerciseSubstitute,
} from './workout-engine';
import { getEquipmentType } from './strength-standards';
import { EXERCISE_LIBRARY, getExerciseMuscle } from './exercise-library';
import type { PlannedExercise, PlannedWorkout } from './types';

export interface PackedGymOptions {
  /** Exercises the user never wants prescribed (injuries, dislikes). */
  exclusions?: string[];
}

const MINIMAL_EQUIPMENT = new Set(['dumbbell', 'bodyweight']);

/** Pull-ups/chin-ups are bodyweight but need a bar — not packed-proof. */
const BAR_DEPENDENT = /pull[- ]?ups?|chin[- ]?ups?/i;

/**
 * Equipment for an exercise name, from the most reliable source:
 * an explicit substitution-table tag wins, then the exercise library,
 * then the name heuristic (which defaults unknown names to barbell).
 */
export function packedEquipmentOf(name: string, tableTag?: string): string {
  if (tableTag) return tableTag.toLowerCase();
  const clean = (name || '').trim().toLowerCase();
  const lib = EXERCISE_LIBRARY.find((e) => e.name.toLowerCase() === clean);
  if (lib) return lib.equipment.toLowerCase();
  return String(getEquipmentType(name)).toLowerCase();
}

function isMinimalEquipment(name: string, tableTag?: string): boolean {
  return MINIMAL_EQUIPMENT.has(packedEquipmentOf(name, tableTag));
}

function sameMuscle(a: string, b: string): boolean {
  return getExerciseMuscle(a) === getExerciseMuscle(b);
}

/**
 * The packed-gym swap suggestion for one exercise, or null when the
 * exercise is already minimal-equipment or no same-muscle minimal
 * equivalent exists.
 */
export function getPackedGymSwap(
  exerciseName: string,
  opts: PackedGymOptions = {}
): ExerciseSubstitute | null {
  if (!exerciseName || !exerciseName.trim()) return null;
  if (isMinimalEquipment(exerciseName)) return null;

  const exclusions = opts.exclusions || [];
  const quick = getQuickSubstitutes(exerciseName);

  // 1) + 2) The swap flow's filtered list, plus the equipment twins its
  // prefix-stripped self-check dropped.
  const filtered = getFilteredSubstitutes(exerciseName, {
    equipment: 'home_dumbbells',
    exclusions,
  });
  const selfKey = normalizeExerciseKey(exerciseName);
  const seen = new Set(filtered.map((s) => s.name.toLowerCase()));
  const twins = quick.filter(
    (s) =>
      !seen.has(s.name.toLowerCase()) &&
      s.name.trim().toLowerCase() !== exerciseName.trim().toLowerCase() &&
      normalizeExerciseKey(s.name) === selfKey &&
      !isPlaceholderSubstitute(s.name) &&
      !exerciseMatchesExclusion(s.name, exclusions)
  );
  const pool = [...filtered, ...twins];
  const viable = pool.filter(
    (s) =>
      isMinimalEquipment(s.name, s.equipment) &&
      !BAR_DEPENDENT.test(s.name) &&
      sameMuscle(s.name, exerciseName)
  );
  if (viable.length > 0) {
    // Prefer a loadable dumbbell move over bodyweight when both fit.
    return viable.find((s) => packedEquipmentOf(s.name, s.equipment) === 'dumbbell') ?? viable[0];
  }

  // 3) Plan-adaptation pipeline (movement-pattern / muscle fallbacks).
  const tryAdapt = (excl: string[]) =>
    adaptExerciseForEquipment(
      { name: exerciseName, targetSets: 1, targetReps: 1 },
      'home_dumbbells',
      false,
      excl
    );
  let adapted = tryAdapt(exclusions);
  if (adapted && BAR_DEPENDENT.test(adapted.name)) {
    adapted = tryAdapt([...exclusions, 'Pull-ups', 'Chin-ups']);
  }
  if (adapted && normalizeExerciseKey(adapted.name) !== selfKey) {
    const pick = adapted.name;
    const tableTag = quick.find((s) => s.name === pick)?.equipment;
    if (
      isMinimalEquipment(pick, tableTag) &&
      !BAR_DEPENDENT.test(pick) &&
      !exerciseMatchesExclusion(pick, exclusions) &&
      sameMuscle(pick, exerciseName)
    ) {
      return {
        name: pick,
        equipment: packedEquipmentOf(pick, tableTag),
        reason: 'Minimal-equipment equivalent',
      };
    }
  }

  return null;
}

/** Suggestions aligned by index with the given exercise names. */
export function getPackedGymSwapsForNames(
  names: string[],
  opts: PackedGymOptions = {}
): (ExerciseSubstitute | null)[] {
  return names.map((name) => getPackedGymSwap(name, opts));
}

/**
 * Apply the packed swap to one planned exercise (preview screen path).
 * Returns a NEW exercise with the swap's name, the load adapted by the
 * engine's own rules (bodyweight → 0, dumbbell → ~35% of the barbell
 * load rounded to a real increment, capped at home-dumbbell max) and a
 * "Swapped from X — gym packed" note. Null when no swap is offered.
 */
export function applyPackedSwapToPlanExercise(
  ex: PlannedExercise,
  isLbs: boolean,
  opts: PackedGymOptions = {}
): PlannedExercise | null {
  const swap = getPackedGymSwap(ex.name, opts);
  if (!swap) return null;
  return {
    ...ex,
    name: swap.name,
    targetWeight: adaptedLoadFor(ex, swap.name, isLbs),
    notes: `${ex.notes ? ex.notes + ' · ' : ''}Swapped from ${ex.name} — gym packed`,
  };
}

/**
 * Pre-swap a whole plan (preview screen toggle). Returns a NEW plan —
 * the original is never mutated — plus how many exercises changed.
 */
export function applyPackedSwapsToPlan(
  plan: PlannedWorkout,
  isLbs: boolean,
  opts: PackedGymOptions = {}
): { plan: PlannedWorkout; swappedCount: number } {
  let swappedCount = 0;
  const exercises = plan.exercises.map((ex) => {
    const swapped = applyPackedSwapToPlanExercise(ex, isLbs, opts);
    if (swapped) {
      swappedCount += 1;
      return swapped;
    }
    return ex;
  });
  return { plan: swappedCount > 0 ? { ...plan, exercises } : plan, swappedCount };
}
