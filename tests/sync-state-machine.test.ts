import { describe, it, expect } from 'vitest';
import {
  syncStateReducer,
  initialSyncState,
  isSyncRunning,
  toLegacySyncStatus,
  syncStateError,
  syncStatePendingMergeChoice,
  selectSyncLabel,
  type SyncState,
} from '@/lib/supabase/sync-state';

/**
 * Phase 2.1 (§1/§2) — the sync state machine, pure.
 * Every rule the brief names, pinned at the reducer level; the
 * engine tests pin the side effects (timers, generation guard).
 */

const started = (s: SyncState): SyncState =>
  syncStateReducer(s, { type: 'sync-started', now: 1000, attempt: 0 });
const idle: SyncState = { kind: 'idle', waitingForMergeChoice: false };
const signedOut: SyncState = { kind: 'signed-out' };

describe('§1 init distinguishes not-initialized / no client / signed out', () => {
  it('starts not-initialized', () => {
    expect(initialSyncState.kind).toBe('not-initialized');
    expect(toLegacySyncStatus(initialSyncState)).toBe('unconfigured');
  });

  it('init without a client -> unconfigured; with client + offline -> offline; with client + online -> signed-out', () => {
    expect(syncStateReducer(initialSyncState, { type: 'init', hasClient: false, online: true }).kind).toBe('unconfigured');
    expect(syncStateReducer(initialSyncState, { type: 'init', hasClient: true, online: false }).kind).toBe('offline');
    expect(syncStateReducer(initialSyncState, { type: 'init', hasClient: true, online: true }).kind).toBe('signed-out');
  });
});

describe('§1 transitions', () => {
  it('sync-started from idle -> syncing, and isSyncRunning derives from it', () => {
    const s = started(idle);
    expect(s.kind).toBe('syncing');
    expect(isSyncRunning(s)).toBe(true);
    expect(isSyncRunning(idle)).toBe(false);
  });

  it('starting a sync clears the old error kind and message together', () => {
    const errored = syncStateReducer(started(idle), {
      type: 'sync-failed',
      errorKind: 'server',
      message: 'boom',
      attempt: 0,
      nextRetryAt: 5000,
    });
    expect(syncStateError(errored)).toEqual({ kind: 'server', message: 'boom' });
    const restarted = started(errored);
    expect(restarted.kind).toBe('syncing');
    expect(syncStateError(restarted)).toBeNull();
  });

  it('success only lands from syncing — a stray success elsewhere is ignored', () => {
    expect(syncStateReducer(idle, { type: 'sync-succeeded', at: '10:00' })).toBe(idle);
    const s = syncStateReducer(started(idle), { type: 'sync-succeeded', at: '10:00' });
    expect(s).toEqual({ kind: 'synced', at: '10:00' });
  });

  it('session-lost lands from ANY state, including mid-sync', () => {
    expect(syncStateReducer(started(idle), { type: 'session-lost' }).kind).toBe('signed-out');
    expect(syncStateReducer({ kind: 'synced', at: 'x' }, { type: 'session-lost' }).kind).toBe('signed-out');
  });

  it('failure records kind, attempt and nextRetryAt; auth carries no retry', () => {
    const s = syncStateReducer(started(idle), {
      type: 'sync-failed',
      errorKind: 'auth',
      message: 'expired',
      attempt: 2,
      nextRetryAt: null,
    });
    expect(s).toEqual({
      kind: 'error',
      errorKind: 'auth',
      message: 'expired',
      attempt: 2,
      nextRetryAt: null,
    });
    expect(toLegacySyncStatus(s)).toBe('error');
  });

  it('the merge-choice gate is the idle sub-state; engaging it pauses a just-started sync', () => {
    const gated = syncStateReducer(signedOut, { type: 'merge-choice', pending: true });
    expect(gated).toEqual({ kind: 'idle', waitingForMergeChoice: true });
    expect(syncStatePendingMergeChoice(gated)).toBe(true);
    // The engine reaches the gate from inside a sync run and
    // abandons that run there — syncing -> idle(waiting) is the
    // pause transition, and "a sync is running" clears with it.
    const paused = syncStateReducer(started(idle), { type: 'merge-choice', pending: true });
    expect(paused).toEqual({ kind: 'idle', waitingForMergeChoice: true });
    expect(isSyncRunning(paused)).toBe(false);
    expect(
      syncStateReducer(gated, { type: 'merge-choice', pending: false }),
    ).toEqual({ kind: 'idle', waitingForMergeChoice: false });
  });

  it('a standalone failure (merge-choice archive write) lands in error without a retry', () => {
    const gated = syncStateReducer(signedOut, { type: 'merge-choice', pending: true });
    const s = syncStateReducer(gated, {
      type: 'standalone-failure',
      errorKind: 'server',
      message: 'Could not archive',
    });
    expect(s.kind).toBe('error');
    expect(syncStateError(s)).toEqual({ kind: 'server', message: 'Could not archive' });
  });
});

describe('§1 the offline event is queued during a sync', () => {
  it('went-offline mid-sync does not overwrite the outcome: success then lands OFFLINE', () => {
    let s = started(idle);
    s = syncStateReducer(s, { type: 'went-offline' });
    expect(s.kind).toBe('syncing');
    s = syncStateReducer(s, { type: 'sync-succeeded', at: '10:00' });
    expect(s.kind).toBe('offline');
  });

  it('went-offline mid-sync + failure -> the error state (failure is the outcome)', () => {
    let s = started(idle);
    s = syncStateReducer(s, { type: 'went-offline' });
    s = syncStateReducer(s, {
      type: 'sync-failed',
      errorKind: 'offline',
      message: null,
      attempt: 0,
      nextRetryAt: 9000,
    });
    expect(s.kind).toBe('error');
  });

  it('went-offline from idle/synced/signed-out -> offline; from error -> unchanged', () => {
    expect(syncStateReducer(idle, { type: 'went-offline' }).kind).toBe('offline');
    expect(syncStateReducer({ kind: 'synced', at: 'x' }, { type: 'went-offline' }).kind).toBe('offline');
    // Connectivity is a device fact — a sync attempted while
    // offline is rejected into 'offline' even before any session
    // is known. 'error' is the one exception (its retry timer
    // reclassifies when it fires).
    expect(syncStateReducer(signedOut, { type: 'went-offline' }).kind).toBe('offline');
    const errored = syncStateReducer(started(idle), {
      type: 'sync-failed',
      errorKind: 'server',
      message: 'boom',
      attempt: 0,
      nextRetryAt: 1,
    });
    expect(syncStateReducer(errored, { type: 'went-offline' })).toBe(errored);
  });

  it('came-online from offline -> signed-out (session unknown until the paired sync resolves it)', () => {
    expect(syncStateReducer({ kind: 'offline' }, { type: 'came-online' })).toEqual({
      kind: 'signed-out',
    });
  });
});

describe('§2 the one UI selector', () => {
  it('labels every state, and offline no longer falls through to Sync Idle', () => {
    expect(selectSyncLabel({ kind: 'offline' }, true)).toEqual({ key: 'home.syncOffline', tone: 'muted' });
    expect(selectSyncLabel(started(idle), true).key).toBe('home.syncSyncing');
    expect(selectSyncLabel({ kind: 'synced', at: 'x' }, true).key).toBe('home.syncSynced');
    expect(selectSyncLabel(idle, true).key).toBe('settings.syncIdle');
    const serverErr = syncStateReducer(started(idle), {
      type: 'sync-failed', errorKind: 'server', message: 'x', attempt: 0, nextRetryAt: null,
    });
    expect(selectSyncLabel(serverErr, true)).toEqual({ key: 'home.syncFailed', tone: 'error' });
    const offlineErr = syncStateReducer(started(idle), {
      type: 'sync-failed', errorKind: 'offline', message: 'x', attempt: 0, nextRetryAt: null,
    });
    expect(selectSyncLabel(offlineErr, true).key).toBe('home.syncOffline');
  });

  it('guests are always local-only', () => {
    expect(selectSyncLabel(started(idle), false).key).toBe('home.syncLocalOnly');
    expect(selectSyncLabel({ kind: 'synced', at: 'x' }, false).key).toBe('home.syncLocalOnly');
  });

  it('banner, caption and Settings can no longer disagree: error projects to error everywhere', () => {
    const errored = syncStateReducer(started(idle), {
      type: 'sync-failed', errorKind: 'server', message: 'x', attempt: 0, nextRetryAt: null,
    });
    expect(toLegacySyncStatus(errored)).toBe('error');
    expect(selectSyncLabel(errored, true).tone).toBe('error');
  });
});
