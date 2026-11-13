import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 1.4 (§5/§6) — provenance in the wild:
 *  1. A backup import stamps the profile: createdByUid rides in from
 *     the backup when present; importedFromBackup is set either way.
 *  2. The push engine REFUSES to push a cross-account profile (the
 *     debounced push path used to re-home another account's rows
 *     under the session uid without any pull/classification).
 *  3. A pull that rebuilds/links the profile stamps createdByUid.
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

let upsertCalls = 0;
let mockProfileRow: any = null;
const mockChain = () => {
  const o: any = {
    eq: () => o,
    select: () => o,
    order: () => o,
    limit: () => o,
    in: () => o,
    range: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: mockProfileRow, error: null }),
    upsert: async () => {
      upsertCalls += 1;
      return { error: null };
    },
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
          id: 'uid-b',
          email: 'b@example.com',
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

import { syncEngine } from '@/lib/supabase/sync';
import { useStore } from '@/lib/store';

let storage: MockStorage;
beforeEach(() => {
  vi.clearAllMocks();
  upsertCalls = 0;
  mockProfileRow = null;
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
  useStore.getState().clearAllData();
  (syncEngine as any).pendingMergeChoiceFor = null;
  (syncEngine as any).mergeGateEvaluatedKey = null;
});

describe('§6 backup import provenance stamps', () => {
  const backupProfile = {
    name: 'Restored',
    gender: 'male',
    bodyweightKg: 80,
    bodyweightLbs: 176,
    unit: 'kg',
    goals: ['build_muscle'],
    dietPreference: 'non_vegetarian',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('an import without createdByUid marks the profile importedFromBackup', () => {
    const ok = useStore.getState().importAllData({
      profile: { ...backupProfile, id: 'guest_restored1' },
      workouts: [],
    });
    expect(ok).toBe(true);
    const profile = useStore.getState().profile as any;
    expect(profile.importedFromBackup).toBe(true);
    expect(profile.createdByUid).toBeUndefined();
  });

  it("an import carries the backup's createdByUid (same-account restore stays same-account)", () => {
    const ok = useStore.getState().importAllData({
      profile: { ...backupProfile, id: 'uid-b', createdByUid: 'uid-b' },
      workouts: [],
    });
    expect(ok).toBe(true);
    const profile = useStore.getState().profile as any;
    expect(profile.createdByUid).toBe('uid-b');
    expect(profile.importedFromBackup).toBe(true);
  });
});

describe('§5/§27 push refuses a cross-account profile', () => {
  it('pushLocalData performs no upserts when the local profile belongs to another account', async () => {
    useStore.setState({
      profile: { id: 'uid-a', name: 'Account A' } as any,
      workouts: [{ id: 'w1', name: 'W', date: '2026-11-01', exercises: [] } as any],
    });
    await (syncEngine as any).pushLocalData('uid-b');
    expect(upsertCalls).toBe(0);
  });

  it('pushLocalData proceeds for the owning account (guard is not a blanket block)', async () => {
    useStore.setState({
      profile: { id: 'uid-b', name: 'Account B', createdByUid: 'uid-b' } as any,
      workouts: [{ id: 'w1', name: 'W', date: '2026-11-01', exercises: [] } as any],
    });
    await (syncEngine as any).pushLocalData('uid-b');
    expect(upsertCalls).toBeGreaterThan(0);
  });
});

describe('§6 pull stamps provenance', () => {
  it('rebuilding the profile from the server row stamps createdByUid', async () => {
    mockProfileRow = {
      id: 'uid-b',
      name: 'Account B',
      gender: 'male',
      bodyweight_kg: 82,
      bodyweight_lbs: 181,
      height_cm: 178,
      unit: 'kg',
      goals: ['build_muscle'],
      diet_preference: 'non_vegetarian',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z',
    };
    useStore.setState({
      profile: { id: 'guest_0123456789abcdef', name: 'Guest' } as any,
      workouts: [{ id: 'w1', name: 'W', date: '2026-11-01', exercises: [] } as any],
    });
    await syncEngine.triggerSyncNow();
    const profile = useStore.getState().profile as any;
    expect(profile.id).toBe('uid-b');
    expect(profile.createdByUid).toBe('uid-b');
    expect(profile.importedFromBackup).toBeUndefined();
  });
});
