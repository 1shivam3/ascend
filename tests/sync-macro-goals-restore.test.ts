import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '@/lib/store';

/**
 * Defect 3 (report D-F1, deep real-account test program 2026-11-08) —
 * macro goals lost on sign-out → sign-in.
 *
 * Mechanism: macro goals live ONLY in the local store (no server
 * table/column holds them). The keep-data logout archives the live
 * state — macroGoals included — under ARCHIVED_HISTORY_KEY, then
 * resets live state via buildFreshHistoryState() (macroGoals: null).
 * The sign-in pull rebuilds synced collections from the server but
 * had no macro-goal source, and the archive was only applied by the
 * manual Settings restore. Fix: on sign-in, re-apply the goals from
 * that logout archive when the user has none — user-checked against
 * the archive's profile id so another account's goals never leak in.
 */

class MockStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

const storage = new MockStorage();

const REMOTE_PROFILE_ROW = {
  id: 'user_1',
  name: 'Shivam Vats',
  gender: 'male',
  bodyweight_kg: 72,
  bodyweight_lbs: 159,
  height_cm: 178,
  unit: 'kg',
  goals: ['build_muscle'],
  diet_preference: 'vegetarian',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-11-06T14:28:37.000Z',
  avatar_url: null,
};

function mockChain(table: string) {
  const o: any = {
    eq: () => o,
    select: () => o,
    order: () => o,
    limit: () => o,
    in: () => o,
    range: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({
      data: table === 'profiles' ? REMOTE_PROFILE_ROW : null,
      error: null,
    }),
    upsert: async () => ({ error: null }),
    delete: () => o,
    then: (resolve: any) => resolve({ data: [], error: null }),
  };
  return o;
}

const mockClient = {
  from: (table: string) => mockChain(table),
  auth: {
    getUser: async () => ({
      data: {
        user: {
          id: 'user_1',
          email: 'qa@example.com',
          user_metadata: {},
          app_metadata: { provider: 'google' },
          is_anonymous: false,
        },
      },
    }),
    getSession: async () => ({
      data: { session: { user: { id: 'user_1', email: 'qa@example.com' } } },
    }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
  },
};

vi.mock('@/lib/supabase/client', () => ({ getSupabase: () => mockClient }));

import { syncEngine, macroGoalsFromArchive } from '@/lib/supabase/sync';
import { ARCHIVED_HISTORY_KEY } from '@/lib/history-fork';

const engine = syncEngine as any;

const GOALS = { calories: 2251, proteinG: 126, carbsG: 252, fatG: 75 };

function seedArchive(profileId: string, macroGoals: unknown) {
  storage.setItem(
    ARCHIVED_HISTORY_KEY,
    JSON.stringify({
      version: '2.0.0',
      exportedAt: '2026-11-08T04:20:00.000Z',
      source: 'ASCEND Strength Tracker',
      archivedAt: '2026-11-08T04:20:00.000Z',
      profile: { id: profileId, name: 'Shivam Vats' },
      macroGoals,
      workouts: [{ id: 'w_old' }],
      meals: [],
      prs: [],
      bodyMetrics: [],
      plannedWorkouts: [],
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });
  (globalThis as any).window = globalThis;
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    writable: true,
    configurable: true,
  });
  useStore.getState().clearAllData();
  engine.status = 'unconfigured';
  engine.errorMessage = null;
  engine.pendingSyncPromise = null;
  engine.currentUser = null;
  engine.pendingMergeChoiceFor = null;
});

describe('macroGoalsFromArchive (D-F1)', () => {
  it('returns the goals when the archive belongs to the user', () => {
    expect(macroGoalsFromArchive({ profile: { id: 'user_1' }, macroGoals: GOALS }, 'user_1')).toEqual(GOALS);
  });

  it('returns null for another user’s archive (shared-device leak guard)', () => {
    expect(macroGoalsFromArchive({ profile: { id: 'user_2' }, macroGoals: GOALS }, 'user_1')).toBeNull();
  });

  it('returns null for missing or malformed goals', () => {
    expect(macroGoalsFromArchive({ profile: { id: 'user_1' } }, 'user_1')).toBeNull();
    expect(macroGoalsFromArchive({ profile: { id: 'user_1' }, macroGoals: null }, 'user_1')).toBeNull();
    expect(
      macroGoalsFromArchive({ profile: { id: 'user_1' }, macroGoals: { calories: '2251', proteinG: 126 } }, 'user_1'),
    ).toBeNull();
    expect(macroGoalsFromArchive(null, 'user_1')).toBeNull();
    expect(macroGoalsFromArchive('junk', 'user_1')).toBeNull();
  });
});

describe('sign-out → sign-in restores macro goals from the logout archive (D-F1)', () => {
  it('replicates the report flow: goals set → logout archive → sign-in → goals intact, not estimates', async () => {
    // Post-logout device state: live goals were reset to null by
    // buildFreshHistoryState; the archive holds the only copy.
    seedArchive('user_1', GOALS);
    expect(useStore.getState().macroGoals).toBeNull();

    await syncEngine.triggerSyncNow();

    expect(useStore.getState().macroGoals).toEqual(GOALS);
  });

  it('does not restore another account’s goals on a shared device', async () => {
    seedArchive('user_other', GOALS);

    await syncEngine.triggerSyncNow();

    expect(useStore.getState().macroGoals).toBeNull();
  });

  it('never overwrites goals the user already has locally', async () => {
    seedArchive('user_1', GOALS);
    useStore.setState({ macroGoals: { calories: 2000, proteinG: 100 } });

    await syncEngine.triggerSyncNow();

    expect(useStore.getState().macroGoals).toEqual({ calories: 2000, proteinG: 100 });
  });
});
