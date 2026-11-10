import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '@/lib/store';
import { getLocalTodayStr } from '@/lib/formatters';
import type { BodyMetricEntry } from '@/lib/types';

/**
 * D-Q2-1 regression (deep real-account test program, 2026-11-08):
 * body_metrics carries UNIQUE(user_id, date), but the sync push
 * gated rows by id only — a local metric for a date already held
 * server-side under a different id upserted "successfully" through
 * the gate and then 409'd (23505 body_metrics_user_date_unique),
 * every cycle, forever. The client double below enforces the
 * constraint exactly like Postgres (arbiter-aware), so these tests
 * fail on the old code and pass on the fix.
 */

interface ServerRow {
  id: string;
  user_id: string;
  date: string;
  weight_kg: number;
  updated_at: string | null;
  [k: string]: unknown;
}

const server = {
  bodyMetrics: new Map<string, ServerRow>(),
  tombstoneUpserts: [] as any[],
  upsertCalls: [] as { table: string; onConflict?: string; ids: string[] }[],
  // When set, every body_metrics upsert fails with this error.
  upsertError: null as { message: string; code?: string } | null,
};

function pgUpsertBodyMetrics(rows: ServerRow[], onConflict: string) {
  if (server.upsertError) return { error: server.upsertError };
  // Postgres checks the whole statement before applying any of it:
  // a conflict on a NON-arbiter unique constraint aborts with 23505.
  for (const row of rows) {
    const byId = server.bodyMetrics.get(row.id);
    const byDate = [...server.bodyMetrics.values()].find(
      (r) => r.user_id === row.user_id && r.date === row.date,
    );
    if (onConflict === 'id') {
      if (byDate && byDate.id !== row.id) {
        return {
          error: {
            code: '23505',
            message:
              'duplicate key value violates unique constraint "body_metrics_user_date_unique"',
          },
        };
      }
    } else {
      // Arbiter (user_id, date): a PK conflict with a DIFFERENT row
      // is not covered by the arbiter and still aborts.
      if (byId && (byId.date !== row.date || byId.user_id !== row.user_id)) {
        return {
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "body_metrics_pkey"',
          },
        };
      }
    }
    void byId;
  }
  for (const row of rows) {
    if (onConflict !== 'id') {
      const byDate = [...server.bodyMetrics.values()].find(
        (r) => r.user_id === row.user_id && r.date === row.date,
      );
      if (byDate && byDate.id !== row.id) server.bodyMetrics.delete(byDate.id);
    }
    server.bodyMetrics.set(row.id, { ...row });
  }
  return { error: null };
}

function selectBuilder(table: string) {
  const rows = (): any[] => {
    if (table === 'body_metrics') return [...server.bodyMetrics.values()];
    return [];
  };
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
    upsert: async (rows: any[], opts?: { onConflict?: string }) => {
      server.upsertCalls.push({
        table,
        onConflict: opts?.onConflict,
        ids: (rows || []).map((r: any) => r.id ?? r.record_id),
      });
      if (table === 'body_metrics') return pgUpsertBodyMetrics(rows as ServerRow[], opts?.onConflict || 'id');
      if (table === 'sync_tombstones') {
        server.tombstoneUpserts.push(...(rows || []));
        return { error: null };
      }
      return { error: null };
    },
    delete: () => {
      const filters: Record<string, unknown> = {};
      const del: any = {
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return del;
        },
        in: async (col: string, ids: string[]) => {
          if (table === 'body_metrics') {
            for (const id of ids) server.bodyMetrics.delete(id);
          }
          return { error: null };
        },
      };
      return del;
    },
  }),
};

vi.mock('@/lib/supabase/client', () => ({
  getSupabase: () => mockClient,
}));

import { syncEngine, planBodyMetricPush } from '@/lib/supabase/sync';

const engine = syncEngine as any;

const D = '2026-11-08';
const T1 = '2026-11-08T01:00:00.000Z';
const T2 = '2026-11-08T02:00:00.000Z';
const T3 = '2026-11-08T03:00:00.000Z';

const metric = (id: string, date: string, weightKg: number, updatedAt: string): BodyMetricEntry => ({
  id,
  date,
  weightKg,
  updatedAt,
});

const serverRow = (id: string, date: string, weightKg: number, updatedAt: string): ServerRow => ({
  id,
  user_id: 'user_1',
  date,
  weight_kg: weightKg,
  updated_at: updatedAt,
});

beforeEach(() => {
  vi.clearAllMocks();
  server.bodyMetrics.clear();
  server.tombstoneUpserts = [];
  server.upsertCalls = [];
  server.upsertError = null;
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

describe('planBodyMetricPush (D-Q2-1)', () => {
  it('routes a strictly-newer local row over a foreign holder to the date-conflict upsert', () => {
    const plan = planBodyMetricPush(
      [metric('bm-local', D, 81, T2)],
      [{ id: 'bm-server', date: D, updated_at: T1 }],
    );
    expect(plan.dateUpserts.map((r) => r.id)).toEqual(['bm-local']);
    expect(plan.idUpserts).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });

  it('skips when the foreign holder is newer, and when stamps are unparseable', () => {
    const older = planBodyMetricPush(
      [metric('bm-local', D, 81, T1)],
      [{ id: 'bm-server', date: D, updated_at: T2 }],
    );
    expect(older.skipped.map((r) => r.id)).toEqual(['bm-local']);
    expect(older.dateUpserts).toEqual([]);

    const stampLess = planBodyMetricPush(
      [{ id: 'bm-local', date: D, weightKg: 81 }],
      [{ id: 'bm-server', date: D, updated_at: T2 }],
    );
    expect(stampLess.skipped.map((r) => r.id)).toEqual(['bm-local']);
  });

  it('keeps the classic id gate when no foreign row holds the date', () => {
    const absent = planBodyMetricPush([metric('bm-a', D, 80, T1)], []);
    expect(absent.idUpserts.map((r) => r.id)).toEqual(['bm-a']);

    const newer = planBodyMetricPush(
      [metric('bm-a', D, 80, T2)],
      [{ id: 'bm-a', date: D, updated_at: T1 }],
    );
    expect(newer.idUpserts.map((r) => r.id)).toEqual(['bm-a']);

    const older = planBodyMetricPush(
      [metric('bm-a', D, 80, T1)],
      [{ id: 'bm-a', date: D, updated_at: T2 }],
    );
    expect(older.skipped.map((r) => r.id)).toEqual(['bm-a']);
  });

  it('skips the identity tangle: our id exists remotely under another date AND a foreign row holds ours', () => {
    const plan = planBodyMetricPush(
      [metric('bm-a', D, 80, T3)],
      [
        { id: 'bm-a', date: '2026-11-07', updated_at: T1 },
        { id: 'bm-b', date: D, updated_at: T2 },
      ],
    );
    expect(plan.skipped.map((r) => r.id)).toEqual(['bm-a']);
    expect(plan.idUpserts).toEqual([]);
    expect(plan.dateUpserts).toEqual([]);
  });
});

describe('push: same-day body-metric collision (D-Q2-1)', () => {
  it('replaces a server-held date atomically when the local row is newer — no 409, exactly one row', async () => {
    server.bodyMetrics.set('bm-server', serverRow('bm-server', D, 80, T1));
    useStore.setState({ bodyMetrics: [metric('bm-local', D, 81, T2)] });

    await expect(engine.pushLocalData('user_1')).resolves.toBeUndefined();

    const rowsForDate = [...server.bodyMetrics.values()].filter((r) => r.date === D);
    expect(rowsForDate).toHaveLength(1);
    expect(rowsForDate[0].id).toBe('bm-local');
    expect(rowsForDate[0].weight_kg).toBe(81);
    const bmUpserts = server.upsertCalls.filter((c) => c.table === 'body_metrics');
    expect(bmUpserts).toHaveLength(1);
    expect(bmUpserts[0].onConflict).toBe('user_id,date');
  });

  it('leaves the server row untouched when the foreign holder is newer', async () => {
    server.bodyMetrics.set('bm-server', serverRow('bm-server', D, 80, T2));
    useStore.setState({ bodyMetrics: [metric('bm-local', D, 81, T1)] });

    await expect(engine.pushLocalData('user_1')).resolves.toBeUndefined();

    const rowsForDate = [...server.bodyMetrics.values()].filter((r) => r.date === D);
    expect(rowsForDate).toHaveLength(1);
    expect(rowsForDate[0].id).toBe('bm-server');
    expect(server.upsertCalls.filter((c) => c.table === 'body_metrics')).toHaveLength(0);
  });

  it('local duplicate pair with an empty server: exactly one row lands, the loser is superseded + tombstoned', async () => {
    useStore.setState({
      bodyMetrics: [metric('bm-new', D, 82, T2), metric('bm-old', D, 80, T1)],
    });

    await expect(engine.pushLocalData('user_1')).resolves.toBeUndefined();

    const rows = [...server.bodyMetrics.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('bm-new');
    expect(rows[0].weight_kg).toBe(82);

    const state = useStore.getState();
    expect(state.bodyMetrics.map((b) => b.id)).toEqual(['bm-new']);
    // The supersede tombstone reached the server layer in the same
    // cycle (step 7 then prunes the local tombstone, its job done).
    expect(server.tombstoneUpserts.some((t) => t.record_id === 'bm-old')).toBe(true);
  });

  it('local duplicate pair where the server holds the loser id: the winner replaces it, the loser is superseded', async () => {
    server.bodyMetrics.set('bm-old', serverRow('bm-old', D, 80, T1));
    useStore.setState({
      bodyMetrics: [metric('bm-new', D, 82, T3), metric('bm-old', D, 80, T1)],
    });

    await expect(engine.pushLocalData('user_1')).resolves.toBeUndefined();

    const rows = [...server.bodyMetrics.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('bm-new');
    expect(rows[0].weight_kg).toBe(82);
    const state = useStore.getState();
    expect(state.bodyMetrics.map((b) => b.id)).toEqual(['bm-new']);
    expect(server.tombstoneUpserts.some((t) => t.record_id === 'bm-old')).toBe(true);
  });

  it('local duplicate pair where the loser id holds a DIFFERENT date on the server: the loser is NOT superseded (identity tangle)', async () => {
    // Review finding (code-review pass 2026-11-10): the supersede
    // guard checked only whether the loser holds its OWN date
    // remotely. Here bm-old's id is the server's row for 2026-11-07 —
    // tombstoning it would make step 7 delete THAT row, a metric for
    // a date this push never touched. planBodyMetricPush already
    // refuses this exact tangle for upserts (remoteById check); the
    // supersede must refuse it too and leave identity resolution to
    // the pull merge.
    const E = '2026-11-07';
    server.bodyMetrics.set('bm-old', serverRow('bm-old', E, 79, T1));
    useStore.setState({
      bodyMetrics: [metric('bm-new', D, 82, T2), metric('bm-old', D, 80, T1)],
    });

    await expect(engine.pushLocalData('user_1')).resolves.toBeUndefined();

    // The winner still lands on D.
    const rowsForD = [...server.bodyMetrics.values()].filter((r) => r.date === D);
    expect(rowsForD).toHaveLength(1);
    expect(rowsForD[0].id).toBe('bm-new');
    // The server's row for E survives untouched — no delete, no tombstone.
    const rowsForE = [...server.bodyMetrics.values()].filter((r) => r.date === E);
    expect(rowsForE).toHaveLength(1);
    expect(rowsForE[0].id).toBe('bm-old');
    expect(server.tombstoneUpserts.some((t) => t.record_id === 'bm-old')).toBe(false);
    // And the loser stays local, untombstoned, for the pull to untangle.
    const state = useStore.getState();
    expect(state.bodyMetrics.map((b) => b.id)).toEqual(['bm-new', 'bm-old']);
    expect(state.deletedBodyMetricIds || []).not.toContain('bm-old');
  });

  it('when the winner cannot land (transient upsert failure), the loser stays local and untombstoned', async () => {
    server.upsertError = { message: 'fetch failed' };
    useStore.setState({
      bodyMetrics: [metric('bm-new', D, 82, T2), metric('bm-old', D, 80, T1)],
    });

    await expect(engine.pushLocalData('user_1')).rejects.toThrow('Supabase push failed');

    const state = useStore.getState();
    expect(state.bodyMetrics.map((b) => b.id).sort()).toEqual(['bm-new', 'bm-old']);
    expect(state.deletedBodyMetricIds || []).not.toContain('bm-old');
    expect(server.bodyMetrics.size).toBe(0);
  });
});

describe('store: setProfile baseline same-date guard (D-Q2-1)', () => {
  const CREATED_AT = '2026-11-08T00:30:00.000Z';
  // The baseline lands on the profile's creation LOCAL day — compute
  // it the same way the store does so the test is timezone-proof.
  const baselineDate = getLocalTodayStr(new Date(CREATED_AT));
  const profile = {
    id: 'user_1',
    name: 'Test',
    gender: 'male',
    bodyweightKg: 80,
    bodyweightLbs: 176,
    unit: 'kg',
    goals: ['build_muscle'],
    createdAt: CREATED_AT,
  } as any;

  it('does not stack a baseline entry onto a date the user already logged', () => {
    useStore.setState({
      bodyMetrics: [metric('bm-logged', baselineDate, 79, T1)],
    });
    useStore.getState().setProfile(profile);
    const metrics = useStore.getState().bodyMetrics;
    expect(metrics.map((m) => m.id)).toEqual(['bm-logged']);
  });

  it('still adds the baseline when the profile creation date has no entry', () => {
    useStore.setState({ bodyMetrics: [] });
    useStore.getState().setProfile(profile);
    const metrics = useStore.getState().bodyMetrics;
    expect(metrics).toHaveLength(1);
    expect(metrics[0].id).toBe('initial_bw_user_1');
    expect(metrics[0].date).toBe(baselineDate);
  });
});
