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
import type { FoodItem, MealEntry, PersonalRecord, PlannedWorkout } from './types';

const MAX_WEIGHT_LBS = Math.ceil(MAX_PR_WEIGHT_KG * 2.20462);
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
