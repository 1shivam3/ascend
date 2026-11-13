/**
 * Health Connect sync orchestration.
 *
 * Kept separate from lib/health-connect (pure logic + native reads) and
 * lib/store (which imports health-connect) to avoid an import cycle:
 * this module is the only one that knows both the store and the sync.
 *
 * Trigger: app foreground only (mount + Capacitor resume /
 * appStateChange). No background service, per the Phase 3 brief.
 * Consent: does nothing unless uiPreferences.healthConnectEnabled.
 */
import { useStore } from './store';
import {
  checkHealthAuthorization,
  fetchHealthData,
  invalidateHealthGrants,
  isHealthConnectSupported,
} from './health-connect';

export type HealthSyncOutcome = 'synced' | 'skipped' | 'denied' | 'failed';

let inFlight = false;

export async function syncHealthConnectIfEnabled(): Promise<HealthSyncOutcome> {
  if (!isHealthConnectSupported()) return 'skipped';
  if (useStore.getState().uiPreferences?.healthConnectEnabled !== true) return 'skipped';
  if (inFlight) return 'skipped';
  inFlight = true;
  try {
    const auth = await checkHealthAuthorization();
    // §36: sync requires the full grant set ('all'); a partial
    // grant is reported as denied here, and Settings names the
    // missing types when the user connects.
    if (auth.state !== 'all') return 'denied';
    const result = await fetchHealthData();
    useStore.getState().applyHealthSync(result);
    return 'synced';
  } catch {
    return 'failed';
  } finally {
    inFlight = false;
  }
}

let initialized = false;

/**
 * Mount once from the app root: sync now, then again whenever the app
 * returns to the foreground. No-op on web and when sync is off.
 */
export function initHealthConnectSync(): void {
  if (initialized || !isHealthConnectSupported()) return;
  initialized = true;
  void syncHealthConnectIfEnabled();
  import('@capacitor/app')
    .then(({ App }) => {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          // §36: returning to the app can follow a permission
          // change in Health Connect's own settings — the grant
          // cache must not survive the resume.
          invalidateHealthGrants();
          void syncHealthConnectIfEnabled();
        }
      });
      App.addListener('resume', () => {
        invalidateHealthGrants();
        void syncHealthConnectIfEnabled();
      });
    })
    .catch(() => {
      /* foreground listener unavailable — mount sync still ran */
    });
}
