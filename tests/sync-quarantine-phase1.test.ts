import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { useStore } from '@/lib/store';
import type { UserProfile, WorkoutEntry } from '@/lib/types';

/**
 * Phase 1.7 (§7) — quarantine hardening:
 *  1. Schema errors (42703 / PGRST204) are TABLE-level, not per-row:
 *     they must fail the cycle (so a post-migration retry can land)
 *     and never quarantine rows. Previously they sat in the permanent
 *     set, so one pre-migration build quarantined every row it pushed
 *     and never retried them.
 *  2. The quarantine stamp comes from the PAYLOAD that was pushed
 *     (always concrete), not a local-row lookup that can yield null
 *     for stamp-less rows; a stamp-less row stays quarantined until
 *     an edit stamps it.
 *  3. Stored entries are validated against the collection union and
 *     field types; the raw server `message` is no longer persisted —
 *     an error CLASS is stored instead (legacy entries normalize to
 *     'unknown_error' and their raw text is dropped).
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
  upsertCalls: [] as { table: string; rows: any[] }[],
  poison: new Map<string, { code?: string; message: string }>(),
  tableError: new Map<string, { code?: string; message: string }>(),
};

function selectBuilder(table: string) {
  const rows = (): any[] => [...(server.tables.get(table)?.values() ?? [])];
  const b: any = {
    eq: () => b,
    order: () => b,
    range: async (from: number, to: number) => ({ data: rows().slice(from, to + 1), error: null }),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
  };
  return b;
}

const mockClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'user_1' } } }) },
  from: (table: string) => ({
    select: () => selectBuilder(table),
    upsert: async (rowsIn: any) => {
      const rows: any[] = Array.isArray(rowsIn) ? rowsIn : [rowsIn];
      server.upsertCalls.push({ table, rows });
      const tableWide = server.tableError.get(table);
      if (tableWide) return { error: tableWide };
      for (const row of rows) {
        const p = server.poison.get(row.id);
        if (p) return { error: p };
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

vi.mock('@/lib/supabase/client', () => ({ getSupabase: () => mockClient }));

import {
  syncEngine,
  isPermanentRowError,
  isSchemaPushError,
  syncErrorClass,
  readSyncQuarantine,
  SYNC_QUARANTINE_KEY,
} from '@/lib/supabase/sync';

const engine = syncEngine as any;
const T_NEW = '2026-11-08T04:00:00.000Z';

const workout = (id: string, updatedAt?: string): WorkoutEntry =>
  ({
    id,
    name: `Workout ${id}`,
    date: '2026-11-08',
    durationMinutes: 45,
    notes: null,
    exercises: [],
    ...(updatedAt ? { updatedAt } : {}),
  }) as unknown as WorkoutEntry;

function seedStore(workouts: WorkoutEntry[], prs: any[] = []) {
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
    prs,
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

describe('§7 error classification split', () => {
  it('schema codes are NOT permanent row errors; constraint/value codes still are', () => {
    expect(isPermanentRowError({ code: '42703' })).toBe(false);
    expect(isPermanentRowError({ code: 'PGRST204' })).toBe(false);
    expect(isPermanentRowError({ code: '23505' })).toBe(true);
    expect(isPermanentRowError({ code: '42501' })).toBe(true);
    expect(isSchemaPushError({ code: '42703' })).toBe(true);
    expect(isSchemaPushError({ code: 'PGRST204' })).toBe(true);
    expect(isSchemaPushError({ code: '23505' })).toBe(false);
    expect(isSchemaPushError({ message: 'column "x" does not exist' })).toBe(false);
  });

  it('syncErrorClass maps codes to stable classes', () => {
    expect(syncErrorClass({ code: '23505' })).toBe('unique_violation');
    expect(syncErrorClass({ code: '42501' })).toBe('permission_denied');
    expect(syncErrorClass({ code: '22003' })).toBe('numeric_out_of_range');
    expect(syncErrorClass({ code: '99999' })).toBe('unknown_error');
    expect(syncErrorClass(new Error('boom'))).toBe('unknown_error');
    expect(syncErrorClass(null)).toBe('unknown_error');
  });
});

describe('§7 schema failure fails the cycle and quarantines nothing', () => {
  it('a 42703 table error leaves quarantine empty and the status in error', async () => {
    seedStore([workout('w1', T_NEW), workout('w2', T_NEW)]);
    server.tableError.set('workouts', { code: '42703', message: 'column "extras" does not exist' });
    await engine.syncPush();
    expect(readSyncQuarantine('user_1')).toHaveLength(0);
    expect(syncEngine.getStatus().status).toBe('error');
  });
});

describe('§7 stamp from payload + error class storage', () => {
  it('a stamp-less poisoned PR quarantines with the payload stamp, stores the class, and is not retried', async () => {
    const pr: any = {
      id: 'pr_bad',
      exercise: 'Squat',
      weightKg: 100,
      weightLbs: 220,
      reps: 1,
      oneRepMax: 100,
      date: '2026-11-08',
      // no updatedAt — the payload builder substitutes a fresh stamp
    };
    seedStore([], [pr]);
    server.poison.set('pr_bad', { code: '23505', message: 'duplicate key value violates unique constraint' });

    await engine.syncPush();
    const q = readSyncQuarantine('user_1');
    expect(q).toHaveLength(1);
    expect(q[0].collection).toBe('personal_records');
    // The stamp equals the updated_at of the payload the server rejected.
    const pushed = server.upsertCalls
      .filter((c) => c.table === 'personal_records')
      .flatMap((c) => c.rows)
      .find((r) => r.id === 'pr_bad');
    expect(pushed?.updated_at).toBeTruthy();
    expect(q[0].stamp).toBe(pushed.updated_at);
    // Error class stored; the raw server message is nowhere in the record.
    expect(q[0].errorClass).toBe('unique_violation');
    expect(JSON.stringify(q[0])).not.toContain('duplicate key');

    // Cycle 2: the stamp-less row stays quarantined (no re-attempt).
    server.upsertCalls = [];
    await engine.syncPush();
    const retried = server.upsertCalls
      .filter((c) => c.table === 'personal_records')
      .flatMap((c) => c.rows)
      .some((r) => r.id === 'pr_bad');
    expect(retried).toBe(false);
  });
});

describe('§7 stored-entry validation', () => {
  it('drops union/type violations and normalizes legacy message entries', () => {
    (globalThis as any).localStorage.setItem(
      SYNC_QUARANTINE_KEY,
      JSON.stringify({
        user_1: [
          {
            collection: 'workouts',
            rowId: 'w_ok',
            stamp: T_NEW,
            code: '23505',
            errorClass: 'unique_violation',
            quarantinedAt: T_NEW,
          },
          {
            // Legacy (PR #126) shape: raw message, no errorClass.
            collection: 'meals',
            rowId: 'm_legacy',
            stamp: null,
            code: '23514',
            message: 'raw server text with table details',
            quarantinedAt: T_NEW,
          },
          { collection: 'bogus_collection', rowId: 'x1', stamp: null, code: null, errorClass: 'unknown_error', quarantinedAt: T_NEW },
          { collection: 'workouts', rowId: 42, stamp: null, code: null, errorClass: 'unknown_error', quarantinedAt: T_NEW },
          { collection: 'workouts', rowId: 'w_badstamp', stamp: 7, code: null, errorClass: 'unknown_error', quarantinedAt: T_NEW },
        ],
      }),
    );
    const q = readSyncQuarantine('user_1');
    expect(q.map((e) => e.rowId)).toEqual(['w_ok', 'm_legacy']);
    const legacy = q.find((e) => e.rowId === 'm_legacy')!;
    expect(legacy.errorClass).toBe('unknown_error');
    expect(JSON.stringify(legacy)).not.toContain('raw server text');
  });
});
