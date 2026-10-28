/**
 * Boot-to-home decision (cold start lands on Home; refresh and back are
 * untouched).
 *
 * The app restores the last internal tab from persisted state
 * (lastActiveTab) on a bare launch. That is what made "exit in Fuel,
 * reopen in Fuel" happen. The fix is a sessionStorage gate:
 *
 * - Fresh browser/WebView session (flag absent) -> Home. The flag is
 *   set exactly once, by the NavigationProvider mount effect, AFTER it
 *   has computed the initial tab — so every getInitialNavigationState()
 *   call during boot (three useState initializers + the mount effect)
 *   agrees. There is deliberately no memoized boolean: the flag in
 *   sessionStorage IS the memo, and it survives refresh (which is what
 *   makes refresh restore the last tab) but not a new session.
 * - An explicit URL tab (?tab=...) always wins: it is a deep link or a
 *   refresh, and refresh preserves the URL. This is what keeps refresh
 *   on the current page even though the gate exists.
 * - sessionStorage unavailable (private mode, denied storage) -> Home.
 *   Failing safe to Home is the honest default: without storage the
 *   session cannot be distinguished, and Home is the app's root.
 * - Onboarding (no profile) and the guest saved-history fork render
 *   before any tab chrome in page.tsx, so they still take precedence
 *   over Home; this gate only decides the tab state.
 * - Warm resume (app backgrounded, page never unloaded) never reaches
 *   this code — the page is not reloaded — so it cannot and should not
 *   force Home. Cold start is what this fixes.
 *
 * Pure functions, no React, no store imports, so the decision table is
 * unit-testable without a DOM.
 */

export const BOOT_SESSION_KEY = 'ascend_boot_session_v1';

export type BootTab = 'home' | 'workout' | 'progress' | 'meals' | 'prs' | 'profile' | 'settings';
export type BootProgressTab = 'overview' | 'strength' | 'prs' | 'bodyweight' | 'training';

export interface BootTabDecision {
  tab: BootTab;
  progressTab: BootProgressTab;
}

type FlagStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Read-only session check. True when a previous boot in this session
 * already marked the session started. Missing or throwing storage
 * reads as "not started" (fresh) — fail safe to Home.
 */
export function hasBootSessionFlag(storage?: FlagStorage | null): boolean {
  if (!storage) return false;
  try {
    return !!storage.getItem(BOOT_SESSION_KEY);
  } catch {
    return false;
  }
}

/**
 * Mark the session started. Call exactly once per page load, after the
 * boot tab has been decided. Returns true when this was a fresh launch
 * (flag was absent, now set), false when the session was already
 * marked. Missing or throwing storage reads as fresh.
 */
export function consumeBootSessionFlag(storage?: FlagStorage | null): boolean {
  if (!storage) return true;
  try {
    if (storage.getItem(BOOT_SESSION_KEY)) return false;
    storage.setItem(BOOT_SESSION_KEY, '1');
    return true;
  } catch {
    return true;
  }
}

/**
 * The boot decision table. URL tab wins (deep link / refresh); then a
 * fresh launch goes Home; then the saved tab; otherwise Home.
 */
export function decideBootTab(args: {
  urlTab: BootTab | null;
  urlProgressTab?: BootProgressTab | null;
  saved: BootTabDecision | null;
  freshLaunch: boolean;
}): BootTabDecision {
  if (args.urlTab) {
    return {
      tab: args.urlTab,
      progressTab: args.urlTab === 'progress' ? (args.urlProgressTab ?? 'overview') : 'overview',
    };
  }
  if (args.freshLaunch) {
    return { tab: 'home', progressTab: 'overview' };
  }
  if (args.saved) return args.saved;
  return { tab: 'home', progressTab: 'overview' };
}
