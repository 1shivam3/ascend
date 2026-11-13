/**
 * Identity — the ONE classifier for "whose data is on this device,
 * and whose session is this?" (Phase 1.4, §5/§6/§27).
 *
 * Before this module, the question was re-derived in fragments:
 * - the full sync treated a getUser() NETWORK FAILURE exactly like
 *   "signed out" (the rejection was caught into null), flipping the
 *   app to the signed-out state on a transient error;
 * - the pull classified cross-account from the profile id's shape
 *   alone, while the debounced push never classified at all — it
 *   would re-home another account's rows under the session uid;
 * - a backup import got a guest-style profile, so a foreign account's
 *   backup was indistinguishable from the device's own guest data.
 *
 * The union (discriminated on `kind`):
 * - guest-local: no session, nothing known — local guest data only.
 * - guest-anon: an anonymous Supabase session (guest mode with a
 *   server identity); syncs under the anonymous uid.
 * - account: a real session, and the local profile is this account's
 *   own (or a guest profile awaiting migration).
 * - account-cross: a real session, and the local profile provably
 *   belongs to a DIFFERENT account. Pull replaces (archive-first);
 *   push refuses outright — a full sync must resolve the cross state
 *   before anything uploads.
 * - account-offline-stale: the session CHECK FAILED (network) but an
 *   account was previously established — the engine keeps the last
 *   known user and reports an offline failure instead of pretending
 *   the user signed out.
 *
 * §27 symmetry: both sync paths resolve the session through the same
 * helper (resolveSessionUser in supabase/sync) and classify through
 * this module; the start-fresh gate (start-fresh-guard.ts) consumes
 * the same isCrossAccountProfile rule via the engine.
 */

import { isCrossAccountSwitch } from './start-fresh-guard';

export type Identity =
  | { kind: 'guest-local' }
  | { kind: 'guest-anon'; userId: string }
  | { kind: 'account'; userId: string }
  | { kind: 'account-cross'; userId: string; profileId: string }
  | { kind: 'account-offline-stale'; userId: string };

/** The profile fields identity routing reads — a structural subset of UserProfile. */
export interface IdentityProfile {
  id?: string | null;
  createdByUid?: string | null;
  importedFromBackup?: boolean | null;
}

/**
 * Does this local profile belong to a DIFFERENT account than
 * `sessionUserId`? Rule order (first match wins):
 * 1. No profile / no id / the id IS the session uid → not cross.
 * 2. Provenance present (createdByUid) → it decides, in both
 *    directions: a matching uid is same-account even under a guest
 *    id; a mismatch is cross even under a familiar id shape.
 * 3. Imported without provenance → cross (imports are cross-account
 *    unless marked same by rule 2).
 * 4. Legacy id shapes: guest ids (guest_/user_) are never cross;
 *    any other foreign id is cross — byte-identical to the pre-1.4
 *    rule for profiles carrying neither new field.
 */
export function isCrossAccountProfile(
  profile: IdentityProfile | null | undefined,
  sessionUserId: string,
): boolean {
  const id = profile?.id;
  if (!id || id === sessionUserId) return false;
  if (profile?.createdByUid) return profile.createdByUid !== sessionUserId;
  if (profile?.importedFromBackup) return true;
  return isCrossAccountSwitch(id, sessionUserId);
}

export function classifyIdentity(args: {
  /** The resolved session user, or null when the check resolved to "no user". */
  sessionUser: { id: string; isAnonymous: boolean } | null;
  /** True when the session check itself failed (network) — NOT the same as "no user". */
  sessionCheckFailed: boolean;
  /** The engine's previously established user id, if any. */
  lastKnownUserId: string | null;
  profile: IdentityProfile | null | undefined;
}): Identity {
  if (args.sessionCheckFailed) {
    // A failed check proves nothing about sign-out. Keep the last
    // known account; with nothing known, fall back to guest-local
    // (cold start — no identity was ever established to preserve).
    return args.lastKnownUserId
      ? { kind: 'account-offline-stale', userId: args.lastKnownUserId }
      : { kind: 'guest-local' };
  }
  const user = args.sessionUser;
  if (!user) return { kind: 'guest-local' };
  if (user.isAnonymous) return { kind: 'guest-anon', userId: user.id };
  if (isCrossAccountProfile(args.profile, user.id)) {
    return { kind: 'account-cross', userId: user.id, profileId: args.profile?.id ?? '' };
  }
  return { kind: 'account', userId: user.id };
}
