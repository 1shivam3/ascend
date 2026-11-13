import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 2.1 (§1) — engine-level rules for the one sync state
 * machine, against a mocked Supabase client:
 *  1. Sign-out during an in-flight sync: the late completion must
 *     NOT write 'synced' (or anything) — the generation guard
 *     discards it. (Before 2.1 the completion landed and the app
 *     showed Synced for a signed-out user.)
 *  2. Sign-out clears the backoff retry timer: a retry scheduled
 *     before sign-out must never fire after it. (Before 2.1
 *     signOut cleared only the debounce timer.)
 */

class MockStorage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  key(i: number) { return Array.from(this.store.keys())[i] || null; }
  removeItem(k: string) { this.store.delete(k); }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
}
const storage = new MockStorage();
(globalThis as any).localStorage = storage;
(globalThis as any).window = globalThis;
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  configurable: true,
  writable: true,
});

// Pull control: the paged fetch (chain.range) hangs until released,
// or rejects when pullBehavior says so. Every hanging call registers
// its own resolver — the pull fans out per collection, and ALL of
// them must be released for the sync to complete.
let pullBehavior: 'hang' | 'ok' | 'fail' = 'ok';
let pendingReleases: Array<() => void> = [];
let pullReleased = false;
let rangeCalls = 0;
const releaseAllPulls = () => {
  // Sticky: fetches that start after the release (the tombstone
  // pager runs after the collection pull) resolve immediately.
  pullReleased = true;
  const rs = pendingReleases;
  pendingReleases = [];
  rs.forEach((f) => f());
};

const mockChain = () => {
  const o: any = {
    eq: () => o,
    select: () => o,
    order: () => o,
    limit: () => o,
    in: () => o,
    range: () => {
      rangeCalls += 1;
      if (pullBehavior === 'hang' && !pullReleased) {
        return new Promise((resolve) => {
          pendingReleases.push(() => resolve({ data: [], error: null }));
        });
      }
      if (pullBehavior === 'fail') {
        return Promise.reject(new Error('server exploded'));
      }
      return Promise.resolve({ data: [], error: null });
    },
    maybeSingle: async () => ({ data: { id: 'user-21' }, error: null }),
    upsert: async () => ({ error: null }),
    delete: () => o,
    then: (resolve: any) => resolve({ data: [], error: null }),
  };
  return o;
};

const mockUser = {
  id: 'user-21',
  email: 'p21@example.com',
  user_metadata: {},
  app_metadata: { provider: 'google' },
  is_anonymous: false,
};
const mockClient = {
  from: () => mockChain(),
  auth: {
    getUser: async () => ({ data: { user: mockUser } }),
    getSession: async () => ({ data: { session: { user: mockUser } } }),
    signOut: async () => ({ error: null }),
  },
};

vi.mock('@/lib/supabase/client', () => ({ getSupabase: () => mockClient }));

import { syncEngine } from '@/lib/supabase/sync';

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

describe('§1 engine: sign-out vs the in-flight sync', () => {
  beforeEach(() => {
    storage.clear();
    rangeCalls = 0;
    pullBehavior = 'ok';
    pullReleased = false;
    pendingReleases = [];
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true,
      writable: true,
    });
  });

  it('a sync completing AFTER sign-out does not write synced', async () => {
    pullBehavior = 'hang';
    const inFlight = syncEngine.triggerSyncNow();
    await flush();
    expect(syncEngine.getStatus().status).toBe('syncing');

    await syncEngine.signOut();
    expect(syncEngine.getStatus().status).toBe('unconfigured');
    expect(syncEngine.getStatus().user).toBeNull();

    releaseAllPulls();
    await inFlight.catch(() => {});
    await flush();

    // The stale completion is discarded: still signed out, no user,
    // and no 'synced' (or 'error') was written over it.
    expect(syncEngine.getStatus().status).toBe('unconfigured');
    expect(syncEngine.getStatus().user).toBeNull();
    expect(syncEngine.getStatus().errorKind).toBeNull();
  });

  it('sign-out clears a scheduled backoff retry', async () => {
    vi.useFakeTimers();
    try {
      pullBehavior = 'fail';
      await syncEngine.triggerSyncNow();
      expect(syncEngine.getStatus().status).toBe('error');
      const callsAfterFailure = rangeCalls;
      expect(callsAfterFailure).toBeGreaterThan(0);

      await syncEngine.signOut();
      // Well past the first backoff step (15s): the retry must
      // never fire for a signed-out engine.
      await vi.advanceTimersByTimeAsync(120_000);
      expect(rangeCalls).toBe(callsAfterFailure);
      expect(syncEngine.getStatus().status).toBe('unconfigured');
    } finally {
      vi.useRealTimers();
    }
  });
});
