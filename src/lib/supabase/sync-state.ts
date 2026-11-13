/**
 * §1/§2 (Phase 2.1) — THE sync state machine.
 *
 * Before: the engine's status was a bundle of parallel fields —
 * a SyncStatus string, errorKind, errorMessage, retryAttempt,
 * retryTimer, debounceTimer, pendingSyncPromise, isSyncing — each
 * written from ~16 sites, free to disagree (the recorded bug: the
 * banner said "Sync failed" while Settings said "Sync Idle",
 * because the two surfaces read different fields). Illegal
 * combinations were representable: 'synced' with an errorKind,
 * 'error' with a stale message after a new sync started, a
 * 'syncing' that survived sign-out and later wrote 'synced'.
 *
 * Now: ONE discriminated state, transitions only through
 * syncStateReducer. The engine owns the effect handles (timers,
 * the in-flight promise, the backoff ladder position) — those are
 * resources, not state — and mirrors the ladder into the state on
 * each transition. "A sync is running" is derived (isSyncRunning),
 * never a second boolean.
 *
 * 'unconfigured' is no longer overloaded: not-initialized (init
 * never ran), unconfigured (init ran, no Supabase client), and
 * signed-out (client present, no session) are distinct states.
 * The legacy status string survives only as a PROJECTION
 * (toLegacySyncStatus) for the listener surface the UI hook
 * predates; signed-out and not-initialized project to
 * 'unconfigured', matching what the UI showed for them before.
 */

export type SyncErrorKind = 'offline' | 'auth' | 'server';

export type SyncState =
  | { kind: 'not-initialized' }
  | { kind: 'unconfigured' }
  | { kind: 'signed-out' }
  | { kind: 'idle'; waitingForMergeChoice: boolean }
  | { kind: 'syncing'; startedAt: number; attempt: number; wentOffline: boolean }
  | { kind: 'synced'; at: string }
  | { kind: 'offline' }
  | {
      kind: 'error';
      errorKind: SyncErrorKind;
      message: string | null;
      attempt: number;
      nextRetryAt: number | null;
    };

export type SyncEvent =
  | { type: 'init'; hasClient: boolean; online: boolean }
  | { type: 'client-missing' }
  | { type: 'session-lost' }
  | { type: 'merge-choice'; pending: boolean }
  | { type: 'sync-started'; now: number; attempt: number }
  | { type: 'sync-succeeded'; at: string }
  | {
      type: 'sync-failed';
      errorKind: SyncErrorKind;
      message: string | null;
      attempt: number;
      nextRetryAt: number | null;
    }
  | {
      // A failure OUTSIDE a sync run (the merge-choice archive
      // write): lands in 'error' without a retry schedule.
      type: 'standalone-failure';
      errorKind: SyncErrorKind;
      message: string | null;
    }
  | { type: 'went-offline' }
  | { type: 'came-online' };

export const initialSyncState: SyncState = { kind: 'not-initialized' };

export function syncStateReducer(state: SyncState, event: SyncEvent): SyncState {
  switch (event.type) {
    case 'init': {
      if (!event.hasClient) return { kind: 'unconfigured' };
      if (!event.online) return { kind: 'offline' };
      return { kind: 'signed-out' };
    }
    case 'client-missing':
      return { kind: 'unconfigured' };
    case 'session-lost':
      // From ANY state: the session is gone, so every sync fact
      // derived from it goes with it. The engine pairs this with
      // its side effects (timers cleared, generation bumped so an
      // in-flight completion cannot write afterwards).
      return { kind: 'signed-out' };
    case 'merge-choice': {
      // Engaging the gate PAUSES a just-started sync: the engine
      // abandons the run at the gate, so syncing -> idle(waiting)
      // is a real transition, not an override.
      if (event.pending) return { kind: 'idle', waitingForMergeChoice: true };
      if (state.kind === 'idle') return { kind: 'idle', waitingForMergeChoice: false };
      return state;
    }
    case 'standalone-failure': {
      if (state.kind === 'syncing') return state;
      return {
        kind: 'error',
        errorKind: event.errorKind,
        message: event.message,
        attempt: state.kind === 'error' ? state.attempt : 0,
        nextRetryAt: null,
      };
    }
    case 'sync-started': {
      // From any state: a sync attempt is itself an initialization
      // signal (the engine only dispatches this after its client /
      // connectivity checks, so 'unconfigured' never reaches here
      // in practice — but a pre-init trigger must not be swallowed:
      // the run is real, and its outcome transitions resolve the
      // state). Starting clears the old error kind AND message
      // together — structurally: they exist only inside 'error'.
      return {
        kind: 'syncing',
        startedAt: event.now,
        attempt: event.attempt,
        wentOffline: false,
      };
    }
    case 'sync-succeeded': {
      // Only an in-flight sync can succeed; a late completion from
      // a superseded generation is dropped by the engine's
      // generation check before it ever reaches the reducer, and a
      // stray event in any other state is ignored here too.
      if (state.kind !== 'syncing') return state;
      // A queued offline event applies AFTER the outcome: the sync
      // did succeed, but the device is offline now, and 'synced'
      // would be a lie about reachability.
      if (state.wentOffline) return { kind: 'offline' };
      return { kind: 'synced', at: event.at };
    }
    case 'sync-failed': {
      if (state.kind !== 'syncing') return state;
      return {
        kind: 'error',
        errorKind: event.errorKind,
        message: event.message,
        attempt: event.attempt,
        nextRetryAt: event.nextRetryAt,
      };
    }
    case 'went-offline': {
      switch (state.kind) {
        case 'syncing':
          // Queued, never overwriting the in-flight outcome: the
          // flag is consulted when the sync settles.
          return { ...state, wentOffline: true };
        case 'idle':
        case 'synced':
        case 'signed-out':
          // Connectivity is a device fact: it applies even before
          // a session is known (a sync attempted while offline is
          // rejected INTO this state). 'error' is the exception —
          // it keeps its more useful failure state; its scheduled
          // retry reclassifies when it fires. (The pre-2.1 handler
          // overwrote EVERY status with 'offline', part of the §1
          // mess — error included.)
          return { kind: 'offline' };
        default:
          return state;
      }
    }
    case 'came-online': {
      // Back to signed-out, NOT idle: whether a session exists is
      // genuinely unknown at this instant — the engine pairs this
      // event with an immediate sync attempt, which resolves the
      // session and moves on (syncing -> synced / session-lost).
      if (state.kind === 'offline') return { kind: 'signed-out' };
      return state;
    }
    default:
      return state;
  }
}

/** The one source of truth for "a sync is running". */
export function isSyncRunning(state: SyncState): boolean {
  return state.kind === 'syncing';
}

/** The legacy status string — a projection, kept for the listener
 *  surface useSupabaseSync predates. New code reads SyncState. */
export type LegacySyncStatus = 'unconfigured' | 'offline' | 'idle' | 'syncing' | 'synced' | 'error';

export function toLegacySyncStatus(state: SyncState): LegacySyncStatus {
  switch (state.kind) {
    case 'not-initialized':
    case 'unconfigured':
    case 'signed-out':
      return 'unconfigured';
    case 'idle':
      return 'idle';
    case 'syncing':
      return 'syncing';
    case 'synced':
      return 'synced';
    case 'offline':
      return 'offline';
    case 'error':
      return 'error';
  }
}

export function syncStateError(
  state: SyncState,
): { kind: SyncErrorKind; message: string | null } | null {
  return state.kind === 'error'
    ? { kind: state.errorKind, message: state.message }
    : null;
}

export function syncStatePendingMergeChoice(state: SyncState): boolean {
  return state.kind === 'idle' && state.waitingForMergeChoice;
}

// ── The ONE UI selector ─────────────────────────────────────────
// Banner, Today caption, and Settings all describe the same state;
// before 2.1 each surface re-derived its label from different
// fields and they contradicted each other (B3). Every surface now
// renders THIS result: a label key + a tone. (The banner's longer
// per-kind sentences remain its own, keyed by the same errorKind.)

export type SyncLabelKey =
  | 'home.syncSyncing'
  | 'home.syncSynced'
  | 'home.syncFailed'
  | 'home.syncOffline'
  | 'home.syncLocalOnly'
  | 'settings.syncIdle';

export type SyncLabelTone = 'ok' | 'busy' | 'error' | 'muted';

export function selectSyncLabel(
  state: SyncState,
  hasUser: boolean,
): { key: SyncLabelKey; tone: SyncLabelTone } {
  if (!hasUser) return { key: 'home.syncLocalOnly', tone: 'muted' };
  switch (state.kind) {
    case 'syncing':
      return { key: 'home.syncSyncing', tone: 'busy' };
    case 'synced':
      return { key: 'home.syncSynced', tone: 'ok' };
    case 'error':
      return state.errorKind === 'offline'
        ? { key: 'home.syncOffline', tone: 'error' }
        : { key: 'home.syncFailed', tone: 'error' };
    case 'offline':
      return { key: 'home.syncOffline', tone: 'muted' };
    case 'idle':
      return { key: 'settings.syncIdle', tone: 'muted' };
    default:
      // not-initialized / unconfigured / signed-out with a user is
      // transient (a sync resolves it immediately); idle is the
      // honest label — and unlike the pre-2.1 Settings fallthrough,
      // 'offline' above no longer lands here.
      return { key: 'settings.syncIdle', tone: 'muted' };
  }
}
