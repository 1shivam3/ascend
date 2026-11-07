import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from '@/lib/store';

/**
 * QA-hardening R6: sync failures are classified (offline / auth /
 * server), retried with exponential backoff, surfaced from ONE
 * engine state, and local writes survive a failed sync and push
 * after recovery. The transport is a mocked Supabase client (the
 * F29 pattern) — never the production project.
 */

const upsertByTable = new Map<string, { error: unknown }>();
const upsertPayloads: Array<{ table: string; rows: unknown }> = [];

const mockClient = {
  auth: {
    getUser: async () => ({ data: { user: { id: 'user_1' } } }),
  },
  from: (table: string) => ({
    upsert: async (rows: unknown) => {
      upsertPayloads.push({ table, rows });
      return upsertByTable.get(table) ?? { error: null };
    },
    select: () => ({
      eq: async () => ({ data: [], error: null }),
    }),
    delete: () => ({
      eq: () => ({
        in: async () => ({ error: null }),
      }),
    }),
  }),
};

vi.mock('@/lib/supabase/client', () => ({
  getSupabase: () => mockClient,
}));

import {
  syncEngine,
  classifySyncError,
  syncRetryDelayMs,
} from '@/lib/supabase/sync';
import { syncErrorMessageKey } from '@/components/SyncErrorBanner';
import * as enModule from '@/lib/i18n/en';
import * as hiModule from '@/lib/i18n/hi';

const en = ((enModule as any).en ?? enModule) as Record<string, string>;
const hi = ((hiModule as any).hi ?? hiModule) as Record<string, string>;

const engine = syncEngine as any;

const workout = {
  id: 'w_r6',
  name: 'Recovery Push',
  date: '2026-11-07',
  durationMinutes: 30,
  exercises: [],
};

function setOnline(value: boolean) {
  Object.defineProperty(global, 'navigator', {
    value: { onLine: value },
    writable: true,
    configurable: true,
  });
}

describe('R6: classifySyncError', () => {
  afterEach(() => setOnline(true));

  it('network-level failures are offline', () => {
    expect(classifySyncError(new TypeError('Failed to fetch'))).toBe('offline');
    expect(classifySyncError({ message: 'NetworkError when attempting to fetch resource' })).toBe('offline');
  });

  it('navigator offline wins over any error shape', () => {
    setOnline(false);
    expect(classifySyncError({ status: 500, message: 'Internal' })).toBe('offline');
  });

  it('401 / JWT failures are auth (session expired)', () => {
    expect(classifySyncError({ status: 401, message: 'Unauthorized' })).toBe('auth');
    expect(classifySyncError({ code: 'PGRST301', message: 'JWT expired' })).toBe('auth');
    expect(classifySyncError(new Error('Invalid refresh token'))).toBe('auth');
  });

  it('5xx, timeouts and unknown errors are server', () => {
    expect(classifySyncError({ status: 500, message: 'Internal Server Error' })).toBe('server');
    expect(classifySyncError({ name: 'AbortError', message: 'The operation timed out' })).toBe('server');
    expect(classifySyncError(new Error('boom'))).toBe('server');
  });

  it('a wrapped push error classifies by its attached cause', () => {
    const wrapped: Error & { cause?: unknown } = new Error('Supabase push failed: JWT expired');
    wrapped.cause = { status: 401, message: 'JWT expired' };
    expect(classifySyncError(wrapped)).toBe('auth');
  });
});

describe('R6: backoff ladder', () => {
  it('grows exponentially and caps at 5 minutes', () => {
    expect(syncRetryDelayMs(0)).toBe(15_000);
    expect(syncRetryDelayMs(1)).toBe(30_000);
    expect(syncRetryDelayMs(2)).toBe(60_000);
    expect(syncRetryDelayMs(3)).toBe(120_000);
    expect(syncRetryDelayMs(10)).toBe(300_000);
  });
});

describe('R6: engine failure state + recovery (mocked transport)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    upsertByTable.clear();
    upsertPayloads.length = 0;
    useStore.getState().clearAllData();
    engine.status = 'unconfigured';
    engine.errorMessage = null;
    engine.errorKind = null;
    engine.retryAttempt = 0;
    engine.pendingSyncPromise = null;
    engine.clearSyncRetryTimer();
    setOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a failed push classifies the error and keeps the local write', async () => {
    useStore.setState({ workouts: [workout] });
    upsertByTable.set('workouts', { error: { status: 500, message: 'Internal Server Error' } });
    await engine.syncPush();
    expect(engine.status).toBe('error');
    expect(engine.getStatus().errorKind).toBe('server');
    // The local write is untouched by the failed sync.
    expect(useStore.getState().workouts.map((w: any) => w.id)).toEqual(['w_r6']);
  });

  it('after recovery the surviving write pushes and the state heals', async () => {
    useStore.setState({ workouts: [workout] });
    upsertByTable.set('workouts', { error: { status: 500, message: 'Internal Server Error' } });
    await engine.syncPush();
    expect(engine.status).toBe('error');

    upsertByTable.clear();
    upsertPayloads.length = 0;
    await engine.syncPush();
    expect(engine.status).toBe('synced');
    expect(engine.getStatus().errorKind).toBeNull();
    const pushed = upsertPayloads.find((p) => p.table === 'workouts');
    expect(pushed).toBeTruthy();
    expect(JSON.stringify(pushed!.rows)).toContain('w_r6');
  });

  it('a server failure schedules a backoff retry; auth schedules none', async () => {
    useStore.setState({ workouts: [workout] });
    upsertByTable.set('workouts', { error: { status: 503, message: 'Service Unavailable' } });
    await engine.syncPush();
    expect(engine.status).toBe('error');
    expect(engine.retryTimer).not.toBeNull();
    expect(engine.retryAttempt).toBe(1);

    engine.clearSyncRetryTimer();
    engine.retryAttempt = 0;
    upsertByTable.set('workouts', { error: { status: 401, message: 'JWT expired' } });
    await engine.syncPush();
    expect(engine.getStatus().errorKind).toBe('auth');
    expect(engine.retryTimer).toBeNull();
  });
});

describe('R6: banner copy is per-class and bilingual', () => {
  it('maps each class to a distinct message key', () => {
    expect(syncErrorMessageKey('offline')).toBe('home.syncErrorOffline');
    expect(syncErrorMessageKey('auth')).toBe('home.syncErrorAuth');
    expect(syncErrorMessageKey('server')).toBe('home.syncErrorServer');
    expect(syncErrorMessageKey(null)).toBe('home.syncErrorBanner');
  });

  it('all R6 keys exist in en and hi and the three class messages differ', () => {
    const keys = [
      'home.syncErrorOffline',
      'home.syncErrorAuth',
      'home.syncErrorServer',
      'home.syncOffline',
      'home.syncBannerDismiss',
    ] as const;
    for (const k of keys) {
      expect(typeof (en as any)[k], `en ${k}`).toBe('string');
      expect(typeof (hi as any)[k], `hi ${k}`).toBe('string');
    }
    const distinct = new Set([en['home.syncErrorOffline'], en['home.syncErrorAuth'], en['home.syncErrorServer']]);
    expect(distinct.size).toBe(3);
  });
});
