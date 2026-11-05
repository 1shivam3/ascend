/**
 * data-location.ts — Task 1.2: ONE computed source of truth for
 * "where does my data live", so privacy copy can never drift from
 * behavior again.
 *
 * Before this module, three surfaces asserted three different things:
 * the Data Vault claimed "Your data stays 100% on your device" (false
 * for anyone signed in — sync uploads their rows), the Welcome screen
 * said guest data "stays on this device" (true, but hardcoded), and
 * the Settings FAQ gave a vague answer that matched neither state.
 *
 * The status is computed from the actual auth state:
 *  - device-only: no cloud account (guest / signed out / anonymous).
 *    Nothing syncs; AI features are the only network egress, and only
 *    when the user explicitly invokes them (see lib/ai-notices.ts).
 *  - device-and-cloud: signed in with a permanent account. Data lives
 *    on the device AND syncs to the user's private Supabase rows
 *    (RLS: only their own authenticated user ID can read them).
 *
 * Every user-facing surface renders its line from
 * dataLocationMessageKey(getDataLocationStatus(...)) — never from a
 * hardcoded claim.
 */
import type { StringKey } from './i18n/en';

export type DataLocationStatus = 'device-only' | 'device-and-cloud';

/**
 * @param signedIn true only for a permanent (non-anonymous) cloud
 * account session — the state in which sync actually moves data.
 */
export function getDataLocationStatus(signedIn: boolean): DataLocationStatus {
  return signedIn ? 'device-and-cloud' : 'device-only';
}

/** The one-line, user-facing summary for a status (en + hi via i18n). */
export function dataLocationMessageKey(status: DataLocationStatus): StringKey {
  return status === 'device-and-cloud'
    ? 'privacy.statusDeviceAndCloud'
    : 'privacy.statusDeviceOnly';
}

/**
 * Whether a sync-engine user object represents a permanent account.
 * Structural (not the sync module's type) so callers can pass the
 * hook's user directly and this module stays dependency-free.
 */
export function isPermanentAccount(
  user: { isAnonymous?: boolean } | null | undefined,
): boolean {
  return !!user && !user.isAnonymous;
}
