import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { useStore } from '@/lib/store';
import type { UserProfile, WorkoutEntry } from '@/lib/types';

/**
 * Defect 2 (report D1, deep real-account test program 2026-11-08) —
 * per-row quarantine in the sync push.
 *
 * pushLocalData used to record the first upsert error and throw after
 * attempting all steps (F29), so ONE permanently-rejected row failed
 * every cycle and held the red "Backup hit a server problem" banner
 * up forever — while everything else actually synced. These tests pin
 * the new behavior:
 *  - a batch with one 23505 row + healthy rows: healthy rows land,
 *    the cycle reports 'synced' (not 'error'), the poison row is
 *    recorded in the quarantine store (persisted in localStorage);
 *  - a second cycle does not re-attempt the quarantined row;
 *  - editing the row (new stamp) releases it and it pushes;
 *  - a transient (code-less) failure keeps the classic behavior:
 *    push rejects, status 'error', quarantine stays empty.
 *
 * The double is Postgres-faithful where it matters: an upsert batch
 * containing a poisoned row aborts the WHOLE statement with that
 * row's error — which is why the engine must fan out per row.
 */

class MockStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

beforeAll(() => {
  (globalThis as any).localStorage = new MockStorage();
  (globalThis as any).window = globalThis;
});

interface ServerRow { id: string; [k: string]: unknown }

const server = {
  tables: new Map<string, Map<string, ServerRow>>(),
  upsertCalls: [] as { table: string; ids: string[] }[],
  // Per-row poison: any batch containing the row aborts with this error.
  poison: new Map<string, { code?: string; message: string }>(),
  // Table-wide failure (transient simulation).
  tableError: new Map<string, { code?: string; message: string }>(),
};

function tableRows(table: string): ServerRow[] {
  if (!server.tables.has(table)) server.tables.set(table, new Map());
  return [...server.tables.get(table)!.values()];
}

function selectBuilder(table: string) {
  const rows = (): any[] => tableRows(table);
  const b: any = {
    eq: () => b,
    order: () => b,
    range: async (from: number, to: number) => ({
      data: rows().slice(from, to + 1),
      error: null,
    }),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: any, rej: any) =>
      Promise.resolve({ data: rows(), error: null }).then(res, rej),
  };
  return b;
}

const mockClient = {
  auth: {
    getUser: async () => ({ data: { user: { id: 'user_1' } } }),
  },
  from: (table: string) => ({
    select: () => selectBuilder(table),
    upsert: async (rowsIn: any, _opts?: { onConflict?: string }) => {
      // PostgREST accepts a single object as well as an array (the
      // profile and coach_blocks upserts pass objects).
      const rows: any[] = Array.isArray(rowsIn) ? rowsIn : [rowsIn];
      server.upsertCalls.push({ table, ids: rows.map((r: any) => r.id ?? r.record_id) });
      const tableWide = server.tableError.get(table);
      if (tableWide) return { error: tableWide };
      for (const row of rows) {
        const p = server.poison.get(row.id);
        if (p) return { error: p }; // Postgres aborts the whole statement
      }
      if (!server.tables.has(table)) server.tables.set(table, new Map());
      const t = server.tables.get(table)!;
      for (const row of rows) t.set(row.id, { ...row });
      return { error: null };
    },
    delete: () => {
      const del: any = {
        eq: () => del,
        in: async () => ({ error: null }),
        then: (res: any, rej: any) => Promise.resolve({ error: null }).then(res, rej),
      };
      return del;
    },
  }),
};

vi.mock('@/lib/supabase/client', () => ({
  getSupabase: () => mockClient,
}));

import {
  syncEngine,
  isPermanentRowError,
  readSyncQuarantine,
  pruneSyncQuarantine,
  SYNC_QUARANTINE_KEY,
} from '@/lib/supabase/sync';

const engine = syncEngine as any;

const T_NEW = '2026-11-08T04:00:00.000Z';
const T_EDIT = '2026-11-08T05:00:00.000Z';

const workout = (id: string, updatedAt: string): WorkoutEntry =>
  ({
    id,
    name: `Workout ${id}`,
    date: '2026-11-08',
    durationMinutes: 45,
    notes: null,
    exercises: [],
    updatedAt,
  }) as unknown as WorkoutEntry;

function seedStore(workouts: WorkoutEntry[]) {
  useStore.setState({
    profile: {
      id: 'user_1',
      name: 'Quarantine Tester',
      gender: 'male',
      bodyweightKg: 72,
      bodyweightLbs: 159,
      heightCm: 178,
      unit: 'kg',
      goals: ['build_muscle'],
      dietPreference: 'vegetarian',
      updatedAt: T_NEW,
    } as unknown as UserProfile,
    prs: [],
    workouts,
    meals: [],
    bodyMetrics: [],
    plannedWorkouts: [],
    deletedWorkoutIds: [],
    deletedMealIds: [],
    deletedBodyMetricIds: [],
    deletedPlanIds: [],
    deletedPrIds: [],
    tombstoneStamps: {},
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).localStorage.clear();
  server.tables.clear();
  server.upsertCalls = [];
  server.poison.clear();
  server.tableError.clear();
  useStore.getState().clearAllData();
  engine.status = 'unconfigured';
  engine.errorMessage = null;
  engine.errorKind = null;
  engine.pendingSyncPromise = null;
  engine.currentUser = { id: 'user_1', email: 'qa@example.com', isAnonymous: false };
  engine.pendingMergeChoiceFor = null;
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    writable: true,
    configurable: true,
  });
});

describe('isPermanentRowError classification (D1)', () => {
  it('treats constraint/value codes as permanent', () => {
    for (const code of ['23505', '23503', '23502', '23514', '22007', '22008', '22003', '22P02', '42501']) {
      expect(isPermanentRowError({ code, message: 'x' }), code).toBe(true);
    }
  });

  it('Phase 1.7 (§7): schema codes are table-level, NOT permanent row errors', () => {
    for (const code of ['42703', 'PGRST204']) {
      expect(isPermanentRowError({ code, message: 'x' }), code).toBe(false);
    }
  });

  it('treats code-less, network and 5xx-shaped errors as transient', () => {
    expect(isPermanentRowError({ message: 'boom' })).toBe(false);
    expect(isPermanentRowError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isPermanentRowError({ status: 503, message: 'Service Unavailable' })).toBe(false);
    expect(isPermanentRowError(null)).toBe(false);
    expect(isPermanentRowError(undefined)).toBe(false);
  });
});

describe('sync push quarantine (D1, engine + double)', () => {
  it('healthy rows land, the cycle reports synced, and the poison row is quarantined + persisted', async () => {
    seedStore([workout('w_good', T_NEW), workout('w_bad', T_NEW)]);
    server.poison.set('w_bad', {
      code: '23505',
      message: 'duplicate key value violates unique constraint "workouts_pkey"',
    });

    await engine.syncPush();

    expect(syncEngine.getStatus().status).toBe('synced');
    expect(tableRows('workouts').map((r) => r.id)).toEqual(['w_good']);

    const quarantine = readSyncQuarantine('user_1');
    expect(quarantine).toHaveLength(1);
    expect(quarantine[0]).toMatchObject({ collection: 'workouts', rowId: 'w_bad', code: '23505', stamp: T_NEW });

    // Persisted across restarts: the raw localStorage record is the source.
    const raw = JSON.parse((globalThis as any).localStorage.getItem(SYNC_QUARANTINE_KEY));
    expect(raw['user_1']).toHaveLength(1);
    expect(raw['user_1'][0].rowId).toBe('w_bad');

    // And it is visible through the engine status surface Settings reads.
    expect(syncEngine.getStatus().quarantined.map((q) => q.rowId)).toEqual(['w_bad']);
  });

  it('a second cycle does not re-attempt the quarantined row', async () => {
    seedStore([workout('w_good', T_NEW), workout('w_bad', T_NEW)]);
    server.poison.set('w_bad', { code: '23505', message: 'duplicate key' });
    await engine.syncPush();
    expect(readSyncQuarantine('user_1')).toHaveLength(1);

    server.upsertCalls = [];
    await engine.syncPush();

    const workoutUpserts = server.upsertCalls.filter((c) => c.table === 'workouts');
    expect(workoutUpserts.every((c) => !c.ids.includes('w_bad'))).toBe(true);
    expect(syncEngine.getStatus().status).toBe('synced');
    expect(readSyncQuarantine('user_1')).toHaveLength(1);
  });

  it('editing the quarantined row (new stamp) releases it and it pushes', async () => {
    seedStore([workout('w_bad', T_NEW)]);
    server.poison.set('w_bad', { code: '23505', message: 'duplicate key' });
    await engine.syncPush();
    expect(readSyncQuarantine('user_1')).toHaveLength(1);
    expect(tableRows('workouts')).toHaveLength(0);

    // The user edits the row (new stamp) and the server-side cause is gone.
    server.poison.delete('w_bad');
    seedStore([workout('w_bad', T_EDIT)]);
    await engine.syncPush();

    expect(tableRows('workouts').map((r) => r.id)).toEqual(['w_bad']);
    expect(readSyncQuarantine('user_1')).toHaveLength(0);
    expect(syncEngine.getStatus().status).toBe('synced');
  });

  it('a transient failure keeps the classic error state and quarantines nothing', async () => {
    seedStore([workout('w_x', T_NEW)]);
    server.tableError.set('workouts', { message: 'boom' });

    await expect(engine.pushLocalData('user_1')).rejects.toThrow('Supabase push failed');
    expect(readSyncQuarantine('user_1')).toHaveLength(0);

    await engine.syncPush();
    expect(syncEngine.getStatus().status).toBe('error');
    expect(readSyncQuarantine('user_1')).toHaveLength(0);
  });

  it('pruneSyncQuarantine drops entries whose local row was deleted', async () => {
    seedStore([workout('w_bad', T_NEW)]);
    server.poison.set('w_bad', { code: '23505', message: 'duplicate key' });
    await engine.syncPush();
    expect(readSyncQuarantine('user_1')).toHaveLength(1);

    pruneSyncQuarantine('user_1', 'workouts', new Set<string>());
    expect(readSyncQuarantine('user_1')).toHaveLength(0);
  });
});
