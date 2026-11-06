/**
 * ASCEND Form Coach — Tempo computation (audit P0-3, 2026-11-06)
 *
 * Tempo is the mean time one detected rep takes, measured from the
 * rep's own timestamps:
 *
 *   tempo = mean over detected reps of (rep.endTime − rep.startTime)
 *
 * Each rep's startTime is anchored by its state machine at the start
 * of the descent (the moment the lifter leaves the locked-out
 * position) and its endTime at the end of the ascent (lockout, or the
 * return to setup for an incomplete attempt) — so a rep's window is
 * descent start → ascent end, and consecutive windows are disjoint.
 *
 * Sanity check: the per-rep windows must account for a believable
 * share of the whole set. If tempo × detected reps is less than half
 * the total set duration, most of the set was setup/rest the windows
 * do not cover — or the timestamps are broken (the pre-fix report
 * showed 0.7 s for a 27 s set: 0.7 × 7 = 4.9 s ≪ 27 s) — and the
 * honest answer is no tempo at all. If it exceeds 110% of the set
 * duration the windows overlap, which disjoint windows cannot do, so
 * the timestamps are likewise untrustworthy. Either way this returns
 * null and the report shows "Tempo unavailable".
 */

import { FormRep } from '../../models/form-session.types';

/** Minimum share of the set the rep windows must reconstruct. */
export const TEMPO_MIN_RECONSTRUCTED_SHARE = 0.5;
/** Maximum share — disjoint windows can never exceed the set. */
export const TEMPO_MAX_RECONSTRUCTED_SHARE = 1.1;

export function computeTempoSeconds(
  reps: readonly FormRep[],
  durationSeconds: number
): number | null {
  if (reps.length === 0 || durationSeconds <= 0) return null;
  const windowSeconds =
    reps.reduce((acc, rep) => acc + Math.max(0, rep.endTime - rep.startTime), 0) / 1000;
  const tempo = windowSeconds / reps.length;
  const reconstructed = tempo * reps.length;
  if (
    reconstructed < TEMPO_MIN_RECONSTRUCTED_SHARE * durationSeconds ||
    reconstructed > TEMPO_MAX_RECONSTRUCTED_SHARE * durationSeconds
  ) {
    return null;
  }
  return Math.round(tempo * 10) / 10;
}
