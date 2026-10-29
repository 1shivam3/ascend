/**
 * Canonical training volume (gauntlet DI-05, user decision
 * 2026-10-29).
 *
 * ONE definition of volume, used by every surface that shows or
 * consumes it — coach tonnage/readiness, the weekly review, and the
 * monthly report previously computed three different numbers for the
 * same session (coach counted warmups, weekly/monthly excluded them;
 * monthly counted bodyweight work as 0 while weekly counted full
 * bodyweight). The user's chosen definition:
 *
 * - ALL completed sets count, INCLUDING warmups. A set with no
 *   isWarmup flag is a working set and counts — never invent data.
 * - Weighted sets count reps × load, lbs converted to kg.
 * - Bodyweight exercises (per the strength-standards list) count
 *   reps × (the user's body weight + any added load recorded on
 *   the set). When no body weight is known, only the added load
 *   counts — a body weight is never fabricated.
 * - Sets on other exercises with no recorded load count 0.
 * - Uncompleted sets never count.
 */

import { isSetCompleted, type WorkoutEntry, type WorkoutExercise } from './types';
import { isBodyweightExercise } from './strength-standards';

const LBS_TO_KG = 0.453592;

function setLoadKg(
  exerciseName: string,
  set: WorkoutExercise['sets'][number],
  bodyweightKg: number | undefined
): number {
  const recorded = Math.max(0, Number(set.weight) || 0);
  const recordedKg = set.unit === 'lbs' ? recorded * LBS_TO_KG : recorded;
  if (isBodyweightExercise(exerciseName)) {
    const bw = bodyweightKg && bodyweightKg > 0 ? bodyweightKg : 0;
    return bw + recordedKg;
  }
  return recordedKg;
}

/** Canonical volume (kg) for one exercise's sets. */
export function calculateExerciseVolumeKg(
  exercise: WorkoutExercise,
  bodyweightKg?: number
): number {
  let total = 0;
  for (const set of exercise.sets || []) {
    if (!isSetCompleted(set)) continue;
    const reps = Math.max(0, Number(set.reps) || 0);
    if (reps <= 0) continue;
    total += reps * setLoadKg(exercise.name, set, bodyweightKg);
  }
  return total;
}

/** Canonical volume (kg) for a whole workout session. */
export function calculateWorkoutVolumeKg(
  workout: WorkoutEntry,
  bodyweightKg?: number
): number {
  if (!workout?.exercises) return 0;
  let total = 0;
  for (const ex of workout.exercises) {
    total += calculateExerciseVolumeKg(ex, bodyweightKg);
  }
  return total;
}
