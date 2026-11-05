/**
 * Store-boundary validation for update actions (gauntlet DI-15).
 *
 * updatePR / updateMeal / updatePlannedWorkout used to spread the
 * caller's fields verbatim: a buggy or corrupted caller could write
 * negative weights, NaN e1RMs, or year-9999 dates straight past the
 * store, even though every create path validates. These sanitizers
 * apply the same ranges at the store boundary. Rules: numeric fields
 * are clamped into range; a non-finite number falls back to the
 * existing value; an invalid or future date keeps the existing date.
 * Pure functions, unit-tested.
 */
import { isValidEntryDate } from './formatters';
import { MAX_PR_WEIGHT_KG } from './strength-standards';
import { normalizeRunDistanceKm } from './run-program';
import { clampWorkoutReps, clampWorkoutWeight } from './workout-engine';
import type { FoodItem, MealEntry, PersonalRecord, PlannedWorkout, WorkoutEntry, WorkoutSet } from './types';
import { kgToLbs } from './units';

const MAX_WEIGHT_LBS = Math.ceil(kgToLbs(MAX_PR_WEIGHT_KG));
const MAX_FOOD_CALORIES = 10000;
const MAX_FOOD_MACRO_G = 2000;

function clampOrFallback(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function sanitizePRUpdate(
  existing: PersonalRecord,
  updated: Partial<PersonalRecord>,
): PersonalRecord {
  const next: PersonalRecord = { ...existing, ...updated };
  next.weightKg = clampOrFallback(next.weightKg, 0, MAX_PR_WEIGHT_KG, existing.weightKg);
  next.weightLbs = clampOrFallback(next.weightLbs, 0, MAX_WEIGHT_LBS, existing.weightLbs);
  next.oneRepMax = clampOrFallback(next.oneRepMax, 0, MAX_PR_WEIGHT_KG, existing.oneRepMax);
  next.reps = Math.round(clampOrFallback(next.reps, 1, 1000, existing.reps));
  if (typeof updated.date === 'string' && !isValidEntryDate(updated.date)) {
    next.date = existing.date;
  }
  if (typeof updated.exercise === 'string' && !updated.exercise.trim()) {
    next.exercise = existing.exercise;
  }
  return next;
}

export function sanitizeFoodItem(item: FoodItem): FoodItem {
  return {
    ...item,
    calories: clampOrFallback(item.calories, 0, MAX_FOOD_CALORIES, 0),
    proteinG: clampOrFallback(item.proteinG, 0, MAX_FOOD_MACRO_G, 0),
    carbsG: clampOrFallback(item.carbsG, 0, MAX_FOOD_MACRO_G, 0),
    fatG: clampOrFallback(item.fatG, 0, MAX_FOOD_MACRO_G, 0),
    ...(typeof (item as any).quantity === 'number'
      ? { quantity: clampOrFallback((item as any).quantity, 0, 100000, 0) }
      : {}),
  };
}

export function sanitizeMealUpdate(
  existing: MealEntry,
  updated: Partial<MealEntry>,
): MealEntry {
  const next: MealEntry = { ...existing, ...updated };
  if (typeof updated.date === 'string' && !isValidEntryDate(updated.date)) {
    next.date = existing.date;
  }
  if (Array.isArray(updated.foods)) {
    next.foods = updated.foods.map((f) => sanitizeFoodItem(f));
  }
  return next;
}

/**
 * Set-level sanitization for workout updates (Certification F3).
 *
 * updateWorkout used to pass `exercises` through verbatim — acceptable
 * while its only caller edited a run's distance, but the History
 * completed-set editor writes whole exercise lists through it. The
 * numeric rules are the SAME ones the save path applies
 * (finalizeWorkoutSet in workout-engine): weight parsed then clamped
 * unit-aware (0–500 kg ceiling), reps integer-clamped (0–100), RPE
 * clamped 1–10. Everything else on the set (status, completed flag,
 * prescription fields, warmup/PR flags) passes through untouched —
 * this boundary validates numbers, it does not re-derive execution
 * state. Fallback philosophy matches the rest of this file: a
 * non-finite number keeps the existing value; `weight: undefined`
 * stays undefined (that is how bodyweight sets are represented).
 */
export function sanitizeWorkoutSetUpdate(
  existing: WorkoutSet | undefined,
  updated: WorkoutSet,
): WorkoutSet {
  const next: WorkoutSet = { ...updated };

  let w: number | undefined;
  if (typeof updated.weight === 'number') {
    w = Number.isNaN(updated.weight) ? existing?.weight : updated.weight;
  } else if (typeof updated.weight === 'string' && (updated.weight as string).trim() !== '') {
    const parsed = parseFloat(updated.weight as string);
    w = Number.isNaN(parsed) ? existing?.weight : parsed;
  } else if (updated.weight === undefined) {
    w = undefined;
  } else {
    w = existing?.weight;
  }
  next.weight = w === undefined ? undefined : clampWorkoutWeight(w, updated.unit || 'kg');

  next.reps = clampWorkoutReps(parseInt(String(updated.reps), 10) || 0);

  if ('rpe' in updated) {
    if (typeof updated.rpe === 'number' && Number.isFinite(updated.rpe)) {
      next.rpe = Math.min(10, Math.max(1, updated.rpe));
    } else if (updated.rpe === undefined) {
      delete next.rpe;
    } else if (existing && existing.rpe !== undefined) {
      next.rpe = existing.rpe;
    } else {
      delete next.rpe;
    }
  }
  return next;
}

export function sanitizeWorkoutUpdate(
  existing: WorkoutEntry,
  updated: Partial<WorkoutEntry>,
): WorkoutEntry {
  const next: WorkoutEntry = { ...existing, ...updated };
  if (typeof updated.date === 'string' && !isValidEntryDate(updated.date)) {
    next.date = existing.date;
  }
  if (Array.isArray(updated.exercises)) {
    next.exercises = updated.exercises.map((ex, exIdx) => ({
      ...ex,
      sets: (ex.sets || []).map((s, setIdx) =>
        sanitizeWorkoutSetUpdate(existing.exercises?.[exIdx]?.sets?.[setIdx], s)
      ),
    }));
  }
  if ('distanceKm' in updated) {
    if (updated.distanceKm === undefined) {
      // Explicit clear (the history editor saved an empty field):
      // remove the field entirely, back to "no distance recorded".
      delete next.distanceKm;
    } else {
      // Same rule as the completion save (normalizeRunDistanceKm):
      // finite, > 0, ≤ 500 km, 2-decimal rounding. An invalid number
      // keeps the existing value — clearing is explicit via undefined,
      // never a side effect of a corrupt caller.
      const km = normalizeRunDistanceKm(updated.distanceKm);
      if (km === undefined) {
        if (existing.distanceKm === undefined) delete next.distanceKm;
        else next.distanceKm = existing.distanceKm;
      } else {
        next.distanceKm = km;
      }
    }
  }
  return next;
}

export function sanitizePlannedWorkout(plan: PlannedWorkout): PlannedWorkout {
  if (!plan || !Array.isArray(plan.exercises)) return plan;
  return {
    ...plan,
    exercises: plan.exercises.map((ex) => ({
      ...ex,
      targetSets: Math.round(clampOrFallback(ex.targetSets, 1, 50, 1)),
      targetReps: Math.round(clampOrFallback(ex.targetReps, 1, 1000, 1)),
      ...(typeof ex.targetWeight === 'number'
        ? { targetWeight: clampOrFallback(ex.targetWeight, 0, 1000, 0) }
        : {}),
      ...(typeof ex.targetRpe === 'number'
        ? { targetRpe: clampOrFallback(ex.targetRpe, 1, 10, 10) }
        : {}),
    })),
  };
}
