/**
 * Logged-out latch — the single owner of the `ascend_logged_out`
 * localStorage flag (§3, Phase 1.5).
 *
 * What the latch means: an explicit logout (or account deletion)
 * happened on THIS device. While it is set, the app must not silently
 * resurrect the previous profile/session from retained local state.
 *
 * What a STALE latch is: the latch is set while a live Supabase
 * session exists. That arises when a session is restored or created
 * without passing through a latch-clearing path (token refresh after
 * an offline logout, a second tab signing in, …). Rule: any code that
 * observes a live session while the latch is set clears it at that
 * moment — the session is the newer fact. The sync engine does this in
 * `startSyncNow()` and in its auth-state handler; sign-in entry points
 * clear it directly.
 *
 * Semantics preserved from the pre-module code: only the exact string
 * 'true' counts as set, and every operation is best-effort — a storage
 * failure must never break a logout or sign-in flow, so reads fail to
 * "not set" and writes are swallowed.
 */

export const LOGGED_OUT_LATCH_KEY = 'ascend_logged_out';

export function markLoggedOut(): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LOGGED_OUT_LATCH_KEY, 'true');
  } catch {
    // Best-effort — see the module doc.
  }
}

export function clearLoggedOutLatch(): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(LOGGED_OUT_LATCH_KEY);
  } catch {
    // Best-effort — see the module doc.
  }
}

export function isLoggedOutLatchSet(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(LOGGED_OUT_LATCH_KEY) === 'true';
  } catch {
    return false;
  }
}
