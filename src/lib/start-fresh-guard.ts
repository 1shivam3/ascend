/**
 * Start-fresh sign-out-first guard (audit F21/F20, brief option B).
 *
 * The bug, verified end to end: startFreshFromRetainedHistory cleared
 * tombstones and set a guest_ profile WITHOUT signing out. The
 * debounced push then upserted the fresh defaults under the real auth
 * uid (server profile overwritten with Athlete/70 kg/male), and the
 * next full sync classified guest_ as a cross-account switch and
 * replaced local state with the server rows — the "fresh" state undone
 * either way. Server rows were never deleted, so the damage was
 * recoverable (P1, not P0) via the archive + Settings restore.
 *
 * The fix has two halves, both in this file's consumers:
 *
 * 1. F20 — the cross-account detector treated guest_ profiles as
 *    account switches. The generator (getOrCreateGuestId) makes
 *    guest_ ids; the detector only exempted user_ ids. A guest profile
 *    is NOT a different authenticated account, so guest_ and user_
 *    ids alike must route to the merge (guest-migration) branch, never
 *    the replace branch. This half is safe ONLY as part of option B:
 *    on its own it would route a signed-in Start-fresh through merge
 *    while a session is still live. It is therefore never applied
 *    without the sign-out gate below.
 * 2. F21-B — sign-out-first: the reset runs only after sign-out is
 *    VERIFIED complete (no engine user AND no Supabase session). A
 *    failed or unverifiable sign-out aborts with nothing applied — no
 *    defaults, no profile touch, clear error. Server-wipe is NOT
 *    implemented: the cloud copy stays intact and restorable.
 *
 * Sign-in AFTER a verified Start-fresh is account restore by design,
 * not a resurrection bug: with no session live, the fresh guest state
 * cannot push; when the user later signs in, the merge branch rebuilds
 * the profile from the server row (a guest id never equals the auth
 * uid, so last-write-wins cannot favor the fresh defaults) and merges
 * the server collections. The pre-fresh history remains recoverable
 * from the archive.
 *
 * Pure functions only — vitest-regressable without a Supabase client
 * or the store. The async orchestration (calling signOut, checking the
 * real session) lives in SupabaseSyncEngine.startFreshAfterVerifiedSignOut.
 */

/** Guest-profile id prefixes: generated guest ids AND the legacy user_ form. */
export function isGuestProfileId(id: string | null | undefined): boolean {
  if (!id) return false;
  return id.startsWith('guest_') || id.startsWith('user_');
}

/**
 * True only when the local profile belongs to a DIFFERENT authenticated
 * account: an id exists, it is not the session user's id, and it is not
 * a guest-profile id. Guest profiles (guest_/user_) are never switches.
 */
export function isCrossAccountSwitch(
  localProfileId: string | null | undefined,
  sessionUserId: string,
): boolean {
  return Boolean(localProfileId && localProfileId !== sessionUserId && !isGuestProfileId(localProfileId));
}

export interface StartFreshGateInput {
  /** True when EITHER the engine reports a user OR a Supabase session exists. */
  hadSession: boolean;
  /** Error string from the sign-out attempt, or null when it succeeded. */
  signOutError?: string | null;
  /** Engine user AFTER the sign-out attempt (null when signed out). */
  engineUserAfter: unknown;
  /**
   * Supabase session AFTER the sign-out attempt: must be exactly null
   * to proceed. `undefined` means verification itself failed (e.g. the
   * getSession call threw) — that also aborts, fail-safe.
   */
  sessionAfter: unknown;
}

export interface StartFreshGateDecision {
  proceed: boolean;
  error?: string;
}

/**
 * The sign-out-first decision. Proceed when there was no session to
 * begin with, or when sign-out succeeded AND both the engine user and
 * the authoritative Supabase session are gone. Every other outcome
 * aborts: the caller must apply NO defaults and touch NO profile.
 *
 * Note the engine user alone is NOT sufficient evidence: signOut()
 * clears engine state before the Supabase call completes, so a failed
 * network sign-out still leaves engineUserAfter null while the real
 * session survives. sessionAfter is the authoritative check.
 */
export function decideStartFreshGate(input: StartFreshGateInput): StartFreshGateDecision {
  if (!input.hadSession) {
    return { proceed: true };
  }
  if (input.signOutError) {
    return {
      proceed: false,
      error: `Sign-out failed (${input.signOutError}), so Start-fresh was not applied. Your existing data is untouched. Please try again.`,
    };
  }
  if (input.engineUserAfter !== null && input.engineUserAfter !== undefined) {
    return {
      proceed: false,
      error:
        'Sign-out could not be confirmed, so Start-fresh was not applied. Your existing data is untouched. Please try again.',
    };
  }
  if (input.sessionAfter !== null) {
    return {
      proceed: false,
      error:
        'Your session is still active, so Start-fresh was not applied. Your existing data is untouched. Please sign out first and try again.',
    };
  }
  return { proceed: true };
}
