import type { PersonalRecord } from './types';

/**
 * QA-hardening R2 — the ONE PR-detection source for the post-workout
 * take. Before this, the take sheet's banner counted every record
 * dated today (including PRs from an earlier session the same day)
 * while the coach context's trend lines cited the FIRST record whose
 * name loosely matched an exercise — so the banner and the headline
 * could celebrate different "PRs", or a held PR could be announced
 * beside a bogus percentage. Both surfaces now read from here:
 * the banner from detectSessionPRs (records attributable to the
 * session just finished) and the context from getBestPRForExercise
 * (the standing best for an exercise).
 */

const keyOf = (name: string) => (name || '').trim().toLowerCase();
const dayOf = (date: string) => (date || '').split('T')[0];

/** The standing best record for an exercise: highest estimated 1RM,
 *  ties broken toward the most recent date. Null when none exists. */
export function getBestPRForExercise(
  prs: PersonalRecord[] | null | undefined,
  exerciseName: string,
): PersonalRecord | null {
  const key = keyOf(exerciseName);
  if (!key) return null;
  let best: PersonalRecord | null = null;
  for (const pr of prs || []) {
    if (keyOf(pr.exercise) !== key) continue;
    if (
      !best ||
      (pr.oneRepMax || 0) > (best.oneRepMax || 0) ||
      ((pr.oneRepMax || 0) === (best.oneRepMax || 0) && dayOf(pr.date) > dayOf(best.date))
    ) {
      best = pr;
    }
  }
  return best;
}

/**
 * Records minted by THIS session: dated on the workout's day and for
 * one of the workout's exercises. A PR set in an earlier session the
 * same day is not this session's news and is excluded.
 */
export function detectSessionPRs(
  prs: PersonalRecord[] | null | undefined,
  workout: { date: string; exercises: { name: string }[] } | null | undefined,
): PersonalRecord[] {
  if (!workout) return [];
  const day = dayOf(workout.date);
  if (!day) return [];
  const names = new Set((workout.exercises || []).map((e) => keyOf(e.name)));
  return (prs || []).filter(
    (pr) => dayOf(pr.date) === day && names.has(keyOf(pr.exercise)),
  );
}
