/**
 * First-run how-to-use guide once-flag (simplified onboarding, track C).
 *
 * The flag lives in raw localStorage, OUTSIDE the zustand blob — so a
 * store reset (Start fresh, logout) never clears it. That made the
 * auto-show silently dead for any later "new" user created in the same
 * browser profile: Start fresh wipes the profile, the new onboarding
 * completes, but the stale flag left by the previous user's dismissal
 * still suppresses the guide — while Settings re-open (own local state,
 * never the flag) keeps working. Exactly the reported symptom.
 *
 * The fix is at the onboarding-completion side: completing onboarding
 * for a (new) profile clears the flag first, so the page.tsx trigger
 * reads it absent and shows the guide once. Returning users never
 * re-run onboarding completion, so their dismissal sticks and the
 * guide never reappears on later visits.
 */
export const HOWTO_SEEN_KEY = 'ascend_howto_seen_v1';

type RemovableStorage = Pick<Storage, 'removeItem'>;

/**
 * Clear the guide once-flag for a newly completed onboarding.
 * Never throws: unavailable storage reads as "flag absent" to the
 * trigger, which shows the guide — the safe direction.
 */
export function clearHowToSeenFlag(storage?: RemovableStorage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(HOWTO_SEEN_KEY);
  } catch {
    // Private mode / denied storage: ignore, see above.
  }
}
