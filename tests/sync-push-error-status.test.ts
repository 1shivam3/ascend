import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '@/lib/store';

/**
 * Audit F29 regression: push upsert errors used to be swallowed while
 * the sync status still reported 'synced'. The engine's client is
 * mocked; the store and the engine singleton are real.
 */

const upsertByTable = new Map<string, { error: { message: string } | null }>();

const mockClient = {
  auth: {
    getUser: async () => ({ data: { user: { id: 'user_1' } } }),
  },
  from: (table: string) => ({
    upsert: async () => upsertByTable.get(table) ?? { error: null },
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

// Import AFTER the mock so the engine picks up the mocked client.
import { syncEngine } from '@/lib/supabase/sync';

const engine = syncEngine as any;

const workout = {
  id: 'w_f29',
  name: 'Push Test',
  date: '2026-10-27',
  durationMinutes: 30,
  exercises: [],
};

describe('F29: failed push must not report synced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertByTable.clear();
    useStore.getState().clearAllData();
    engine.status = 'unconfigured';
    engine.errorMessage = null;
    engine.pendingSyncPromise = null;
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
      configurable: true,
    });
  });

  it('pushLocalData rejects when a workouts upsert errors', async () => {
    useStore.setState({ workouts: [workout] });
    upsertByTable.set('workouts', { error: { message: 'boom' } });
    await expect(engine.pushLocalData('user_1')).rejects.toThrow('Supabase push failed');
  });

  it('pushLocalData resolves when every upsert succeeds', async () => {
    useStore.setState({ workouts: [workout] });
    await expect(engine.pushLocalData('user_1')).resolves.toBeUndefined();
  });

  it('syncPush reports error (not synced) when the push fails', async () => {
    useStore.setState({ workouts: [workout] });
    upsertByTable.set('workouts', { error: { message: 'boom' } });
    await engine.syncPush();
    expect(engine.status).toBe('error');
    expect(engine.errorMessage).toMatch(/boom/);
  });
});
