/**
 * Session elapsed/duration — ONE derivation (final-cert J2.3).
 *
 * Browser evidence: the elapsed workout timer showed ~0:52, reset to
 * 0:00 after a tab switch + resume, and the finish summary (1m 21s)
 * disagreed with the completion screen (1m 25s). Root causes found in
 * code:
 *
 * - Pages mount/unmount per tab (src/app/page.tsx), and WorkoutPage's
 *   sessionStartTime was a fresh `useState(Date.now())` on every mount
 *   — not seeded from the persisted draft's start marker — while
 *   ActiveWorkoutScreen captured its start time once via a useState
 *   initializer from the prop.
 * - ActiveWorkoutScreen's elapsedSeconds was local state initialized
 *   to 0 on every mount and only corrected by a 1-second interval, so
 *   a remount visibly restarted at 0:00 and the finish path consumed
 *   the last (stale) tick instead of the finish instant.
 * - Two finish paths computed duration differently (page:
 *   Date.now() − sessionStartTime; screen: the stale elapsed state).
 *
 * The persisted start marker already exists: the active-workout draft
 * (store, persisted slice) carries `sessionStartTime`, saved by both
 * WorkoutPage and ActiveWorkoutScreen. Every elapsed/duration read now
 * goes through these helpers against that timestamp, so a remount is
 * just a re-read of the same source — never a restart.
 */

/** Elapsed whole seconds from a persisted session start timestamp. */
export function getElapsedSeconds(
  sessionStartTime: number | undefined | null,
  nowMs: number,
): number {
  if (!sessionStartTime || !Number.isFinite(sessionStartTime)) return 0;
  return Math.max(0, Math.floor((nowMs - sessionStartTime) / 1000));
}

/** The single duration source for finish summary + completion screen. */
export function getSessionDuration(
  sessionStartTime: number | undefined | null,
  nowMs: number,
): { durationSeconds: number; durationMinutes: number } {
  const durationSeconds = getElapsedSeconds(sessionStartTime, nowMs);
  return { durationSeconds, durationMinutes: Math.round(durationSeconds / 60) };
}
