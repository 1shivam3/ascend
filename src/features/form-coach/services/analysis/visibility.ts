/**
 * ASCEND Form Coach — shared landmark-visibility helper (§33).
 *
 * "Could this criterion even be judged?" is decided from whether
 * the landmarks it needs stayed visible. The squat and deadlift
 * analyzers each carried an identical private copy of this
 * trailing-window rule (same constants, same body); it lives
 * here now, once, so every analyzer — the cycle family included —
 * can ask the same question the same way and stamp a rep
 * 'unverified' when the answer is no (the verdict plumbing in
 * form-session.types and the analyzers' summaries already count
 * unverified reps for all of them).
 */

export interface VisibilitySample {
  t: number;
  ok: boolean;
}

export const VISIBILITY_WINDOW_MS = 1200;
export const VISIBILITY_MIN_SPAN_MS = 700;
export const VISIBILITY_BAD_SHARE = 0.6;

/**
 * Push one visibility sample into a trailing window and report
 * whether the absence is SUSTAINED — the window spans at least
 * VISIBILITY_MIN_SPAN_MS and at least VISIBILITY_BAD_SHARE of
 * its samples are not-ok. A brief dip inside an otherwise
 * visible window returns false.
 */
export function sustainedVisibilityOut(
  window: VisibilitySample[],
  ok: boolean,
  timestampMs: number
): boolean {
  window.push({ t: timestampMs, ok });
  const cutoff = timestampMs - VISIBILITY_WINDOW_MS;
  while (window.length > 1 && window[0].t < cutoff) {
    window.shift();
  }
  if (window.length === 0) return false;
  const span = timestampMs - window[0].t;
  if (span < VISIBILITY_MIN_SPAN_MS) return false;
  const bad = window.reduce((acc, s) => acc + (s.ok ? 0 : 1), 0);
  return bad / window.length >= VISIBILITY_BAD_SHARE;
}
