import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 1.3 (§4) — merge-gate hardening:
 *  1. The resolved marker is keyed by a CONTENT signature, not row ids:
 *     editing a row's value after resolving must re-offer the choice.
 *  2. A marker written in the OLD ids-only format must never match.
 *  3. The pending choice is persisted per (user, data signature) and
 *     survives a reload; a stale one (data changed under the modal)
 *     is discarded and the gate re-evaluates.
 *  4. suppressMergeGateFor records a resolution ONLY while a fresh
 *     sign-in intent exists, and clears a gate already engaged for
 *     that user.
 */

class MockStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const mockChain = () => {
  const o: any = {
    eq: () => o,
    select: () => o,
    order: () => o,
    limit: () => o,
    in: () => o,
    range: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: { id: 'user-gate-1' }, error: null }),
    upsert: async () => ({ error: null }),
    delete: () => o,
    then: (resolve: any) => resolve({ data: [], error: null }),
  };
  return o;
};
const mockClient = {
  from: () => mockChain(),
  auth: {
    getUser: async () => ({
      data: {
        user: {
          id: 'user-gate-1',
          email: 'gate@example.com',
          user_metadata: {},
          app_metadata: { provider: 'google' },
          is_anonymous: false,
        },
      },
    }),
    getSession: async () => ({ data: { session: null } }),
  },
};

vi.mock('@/lib/supabase/client', () => ({ getSupabase: () => mockClient }));

import {
  syncEngine,
  evaluateSignInMergeGate,
  mergeChoiceDataSignature,
  writeSignInIntent,
  clearSignInIntent,
  readMergeChoiceResolved,
  readPendingMergeChoice,
  writePendingMergeChoice,
  clearPendingMergeChoice,
  MERGE_CHOICE_PENDING_KEY,
} from '@/lib/supabase/sync';
import { useStore } from '@/lib/store';

let storage: MockStorage;
beforeEach(() => {
  vi.clearAllMocks();
  storage = new MockStorage();
  Object.defineProperty(global, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });
  (global as any).window = global;
  Object.defineProperty(global.navigator, 'onLine', {
    get: () => true,
    configurable: true,
  });
});

describe('§4 content signature', () => {
  it('changes when a row VALUE changes, ids untouched', () => {
    const a = mergeChoiceDataSignature({
      workouts: [{ id: 'w1', name: 'Push day' } as any],
    });
    const b = mergeChoiceDataSignature({
      workouts: [{ id: 'w1', name: 'Pull day' } as any],
    });
    expect(a).not.toBe(b);
  });

  it('is stable across row order (sorted before hashing)', () => {
    const a = mergeChoiceDataSignature({
      workouts: [
        { id: 'w2', name: 'B' } as any,
        { id: 'w1', name: 'A' } as any,
      ],
    });
    const b = mergeChoiceDataSignature({
      workouts: [
        { id: 'w1', name: 'A' } as any,
        { id: 'w2', name: 'B' } as any,
      ],
    });
    expect(a).toBe(b);
  });

  it('an OLD ids-only marker never suppresses the gate', () => {
    // Exactly what the pre-1.3 code would have written for this data:
    // workouts 'w1' + bodyMetrics 'bm-1,bm-2', other collections empty.
    const state = {
      workouts: [{ id: 'w1' }],
      bodyMetrics: [{ id: 'bm-1' }, { id: 'bm-2' }],
    };
    const legacyMarker = 'user_1:w1||||bm-1,bm-2';
    const verdict = evaluateSignInMergeGate({
      intentAt: Date.now(),
      now: Date.now(),
      isAnonymous: false,
      profileId: 'guest_0123456789abcdef',
      userId: 'user_1',
      localHasData: true,
      cloudHasData: true,
      resolvedMarker: legacyMarker,
      dataSignature: mergeChoiceDataSignature(state),
    });
    expect(verdict).toBe('gate');
  });
});

describe('§4 pending-choice persistence helpers', () => {
  it('round-trips { userId, dataSignature } and clears', () => {
    expect(readPendingMergeChoice()).toBeNull();
    writePendingMergeChoice('user-gate-1', 'sig-x');
    expect(readPendingMergeChoice()).toEqual({
      userId: 'user-gate-1',
      dataSignature: 'sig-x',
    });
    expect(storage.getItem(MERGE_CHOICE_PENDING_KEY)).toBeTruthy();
    clearPendingMergeChoice();
    expect(readPendingMergeChoice()).toBeNull();
  });

  it('a malformed stored value reads as no pending choice', () => {
    storage.setItem(MERGE_CHOICE_PENDING_KEY, 'not-json');
    expect(readPendingMergeChoice()).toBeNull();
    storage.setItem(MERGE_CHOICE_PENDING_KEY, JSON.stringify({ userId: 42 }));
    expect(readPendingMergeChoice()).toBeNull();
  });
});

describe('§4 engine flow — persisted pending choice', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
    (syncEngine as any).pendingMergeChoiceFor = null;
    (syncEngine as any).mergeGateEvaluatedKey = null;
    useStore.setState({
      profile: { id: 'guest_0123456789abcdef', name: 'Guest' } as any,
      workouts: [{ id: 'w1', name: 'W', date: '2026-11-01', exercises: [] } as any],
    });
  });

  it('gating persists the pending choice; a reload restores it without a fresh intent', async () => {
    writeSignInIntent();
    await syncEngine.triggerSyncNow();
    expect(syncEngine.getStatus().pendingMergeChoice).toBe(true);
    const persisted = readPendingMergeChoice();
    expect(persisted?.userId).toBe('user-gate-1');
    expect(persisted?.dataSignature).toBe(
      mergeChoiceDataSignature(useStore.getState()),
    );

    // Simulate a full page reload: in-memory state and the intent are
    // gone; only localStorage survives.
    (syncEngine as any).pendingMergeChoiceFor = null;
    (syncEngine as any).mergeGateEvaluatedKey = null;
    clearSignInIntent();

    await syncEngine.triggerSyncNow();
    expect(syncEngine.getStatus().pendingMergeChoice).toBe(true);

    // Resolving after the reload clears the persisted record too.
    const res = await syncEngine.resolveMergeChoice('merge');
    expect(res).toEqual({});
    expect(readPendingMergeChoice()).toBeNull();
  });

  it('a stale persisted choice (data changed under the modal) is discarded and re-evaluated', async () => {
    writePendingMergeChoice('user-gate-1', 'sig-of-yesterdays-data');
    await syncEngine.triggerSyncNow();
    // No fresh intent + a stale record = no pause on stale grounds,
    // and the stale record is gone.
    expect(syncEngine.getStatus().pendingMergeChoice).toBe(false);
    expect(readPendingMergeChoice()).toBeNull();
  });

  it("another account's persisted choice never gates this user and is discarded", async () => {
    const sig = mergeChoiceDataSignature(useStore.getState());
    writePendingMergeChoice('someone-else', sig);
    await syncEngine.triggerSyncNow();
    expect(syncEngine.getStatus().pendingMergeChoice).toBe(false);
    expect(readPendingMergeChoice()).toBeNull();
  });
});

describe('§4 suppressMergeGateFor freshness', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
    (syncEngine as any).pendingMergeChoiceFor = null;
    (syncEngine as any).mergeGateEvaluatedKey = null;
    useStore.setState({
      profile: { id: 'guest_0123456789abcdef', name: 'Guest' } as any,
      workouts: [{ id: 'w1', name: 'W', date: '2026-11-01', exercises: [] } as any],
    });
  });

  it('records NO resolution when no sign-in intent exists', () => {
    syncEngine.suppressMergeGateFor('user-gate-1');
    expect(readMergeChoiceResolved()).toBeNull();
  });

  it('records the resolution while a fresh intent exists, and clears an engaged gate', async () => {
    writeSignInIntent();
    await syncEngine.triggerSyncNow();
    expect(syncEngine.getStatus().pendingMergeChoice).toBe(true);
    // AuthModal presented and resolved the same choice itself.
    syncEngine.suppressMergeGateFor('user-gate-1');
    expect(readMergeChoiceResolved()).toContain('user-gate-1:');
    expect(syncEngine.getStatus().pendingMergeChoice).toBe(false);
    expect(readPendingMergeChoice()).toBeNull();
  });
});
