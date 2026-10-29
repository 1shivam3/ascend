/**
 * The one definition of day activity (gauntlet DI-14).
 *
 * home-matrix and streak-freeze used to disagree: the matrix marked
 * the workout habit done for ANY workout row that day (even an empty
 * shell with no completed sets), while the streak logic required real
 * effort. Both now build on these predicates:
 *
 * - dayHasWorkoutEffort: a workout that day with >= 1 completed set,
 *   or a logged run session.
 * - dayIsActive: workout effort, OR 3+ meals with food — the broader
 *   "the day counts" rule used by streaks/challenges.
 *
 * Dates are compared as stored (YYYY-MM-DD local day strings).
 */
import type { MealEntry, WorkoutEntry } from './types';
import { isSetCompleted } from './types';

export const MEALS_FOR_ACTIVE_DAY = 3;

export function dayHasWorkoutEffort(
  dateStr: string,
  workouts: WorkoutEntry[] | undefined,
): boolean {
  const dayWorkouts = (workouts ?? []).filter((w) => w.date === dateStr);
  if (dayWorkouts.some((w) => w.kind === 'run')) return true;
  return dayWorkouts.some((w) =>
    w.exercises.some((ex) => ex.sets.some((s) => isSetCompleted(s))),
  );
}

export function dayIsActive(
  dateStr: string,
  workouts: WorkoutEntry[],
  meals: MealEntry[],
): boolean {
  if (dayHasWorkoutEffort(dateStr, workouts)) return true;
  const mealCount = meals.filter(
    (m) => m.date === dateStr && m.foods.length > 0,
  ).length;
  return mealCount >= MEALS_FOR_ACTIVE_DAY;
}
