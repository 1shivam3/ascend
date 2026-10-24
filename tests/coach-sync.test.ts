import { describe, expect, it, beforeEach } from 'vitest';
import {
  COACH_BLOCKS_TABLE,
  WEEKLY_REVIEWS_TABLE,
  EMPTY_COACH_BLOCKS,
  coachBlocksRowId,
  weeklyReviewRowId,
  isInitialCoachBlocks,
  parseCoachBlocksPayload,
  parseWeeklyReviewPayload,
  isMissingTableError,
  isCoachSyncPendingSetup,
  resetCoachSyncPendingSetupForTests,
  recordCoachLocalChanges,
  loadCoachSyncMeta,
  setCoachSyncStamps,
  coachSyncSignature,
  mergeCoachBlocks,
  mergeWeeklyReviews,
  coachBlocksRowForPush,
  weeklyReviewRowsForPush,
  pullCoachState,
  pushCoachState,
  type CoachSyncClient,
  type CoachSyncMeta,
} from '@/lib/supabase/coach-sync';
import type { WeeklyReview } from '@/lib/weekly-review';
import type { CoachBlocksState } from '@/lib/block-engine';

/**
 * Phase 2 coach sync tests (recreated on Phase 2 resume — the original
 * file was lost in the form-check priority redirect).
 *
 * Everything here runs against a mock Supabase client or the pure
 * merge/parse helpers: no network, no real account, no localStorage
 * (vitest runs in node, so the stamp helpers degrade to their
 * return-value behavior and never throw).
 */

function review(weekMonday: string): WeeklyReview {
  return {
    weekMonday,
    weekSunday: '2026-10-25',
    sessionsPlanned: 4,
    sessionsCompleted: 3,
    missedDays: [],
    tonnageKg: 1000,
    tonnageDeltaPct: null,
    volumeHighlights: [],
    prs: [],
    recoveryLines: [],
    coachLines: [],
    painEscalation: null,
    focus: { kind: 'adherence', headline: 'h', detail: 'd' },
    revisions: [],
    seen: false,
  };
}

/** Non-empty coach state (adopted plan), via a cast — the merge logic
 *  under test only cares about emptiness + JSON comparison, not the
 *  inner block shapes. */
function nonEmptyBlocks(): CoachBlocksState {
  return {
    ...EMPTY_COACH_BLOCKS,
    adoptedPlans: { 'plan-1': { planId: 'plan-1' } },
  } as unknown as CoachBlocksState;
}

interface MockTableConfig {
  data?: unknown[];
  error?: unknown;
  upsertError?: unknown;
}

function mockClient(config: {
  blocks?: MockTableConfig;
  reviews?: MockTableConfig;
  upserts?: { table: string; rows: unknown[]; options?: unknown }[];
}): CoachSyncClient {
  const tableConfig = (table: string): MockTableConfig => {
    if (table === COACH_BLOCKS_TABLE) return config.blocks ?? {};
    if (table === WEEKLY_REVIEWS_TABLE) return config.reviews ?? {};
    return {};
  };
  return {
    from: (table: string) => ({
      select: () => ({
        eq: async () => {
          const c = tableConfig(table);
          return { data: c.data ?? [], error: c.error ?? null };
        },
      }),
      upsert: async (rows: Record<string, unknown>[], options?: { onConflict?: string }) => {
        const c = tableConfig(table);
        config.upserts?.push({ table, rows, options });
        return { data: undefined, error: c.upsertError ?? null };
      },
    }),
  };
}

function mondaySeries(count: number): string[] {
  const out: string[] = [];
  const base = Date.UTC(2026, 0, 5);
  for (let i = 0; i < count; i++) {
    out.push(new Date(base + i * 7 * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

beforeEach(() => {
  resetCoachSyncPendingSetupForTests();
});

describe('row ids', () => {
  it('builds the deterministic singleton blocks id', () => {
    expect(coachBlocksRowId('user-1')).toBe('coach-blocks:user-1');
  });

  it('builds the deterministic per-week review id', () => {
    expect(weeklyReviewRowId('user-1', '2026-10-19')).toBe('weekly-review:user-1:2026-10-19');
  });
});

describe('isInitialCoachBlocks', () => {
  it('treats the empty state, null, and arrays as initial', () => {
    expect(isInitialCoachBlocks(EMPTY_COACH_BLOCKS)).toBe(true);
    expect(isInitialCoachBlocks(null)).toBe(true);
    expect(isInitialCoachBlocks(undefined)).toBe(true);
    expect(isInitialCoachBlocks([])).toBe(true);
  });

  it('treats a state with adopted plans as non-initial', () => {
    expect(isInitialCoachBlocks(nonEmptyBlocks())).toBe(false);
  });
});

describe('parseCoachBlocksPayload', () => {
  it('drops malformed payloads', () => {
    expect(parseCoachBlocksPayload(null)).toBeNull();
    expect(parseCoachBlocksPayload([])).toBeNull();
    expect(parseCoachBlocksPayload('nope')).toBeNull();
  });

  it('normalizes a partial payload onto the empty state', () => {
    expect(parseCoachBlocksPayload({})).toEqual(EMPTY_COACH_BLOCKS);
    expect(parseCoachBlocksPayload({ pastBlocks: 'nope', adoptedPlans: [] })).toEqual({
      ...EMPTY_COACH_BLOCKS,
      pastBlocks: [],
      adoptedPlans: {},
    });
  });
});

describe('parseWeeklyReviewPayload', () => {
  it('requires a week key', () => {
    expect(parseWeeklyReviewPayload(null)).toBeNull();
    expect(parseWeeklyReviewPayload({})).toBeNull();
    expect(parseWeeklyReviewPayload({ weekMonday: '' })).toBeNull();
  });

  it('passes a keyed review through', () => {
    const r = review('2026-10-19');
    expect(parseWeeklyReviewPayload(r)).toEqual(r);
  });
});

describe('isMissingTableError', () => {
  it('recognizes PostgREST/Postgres missing-table signals', () => {
    expect(isMissingTableError({ code: 'PGRST205' })).toBe(true);
    expect(isMissingTableError({ code: '42P01' })).toBe(true);
    expect(isMissingTableError({ message: 'relation "coach_blocks" does not exist' })).toBe(true);
    expect(isMissingTableError({ message: 'could not find the table coach_blocks' })).toBe(true);
  });

  it('does not treat other errors as missing tables', () => {
    expect(isMissingTableError({ code: '23505' })).toBe(false);
    expect(isMissingTableError({ code: 'PGRST204' })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
    expect(isMissingTableError({})).toBe(false);
  });
});

describe('mergeCoachBlocks', () => {
  it('keeps local when there is no server row', () => {
    const local = nonEmptyBlocks();
    expect(mergeCoachBlocks(local, '2026-10-20T00:00:00.000Z', null)).toEqual({
      merged: parseCoachBlocksPayload(local),
      changed: false,
    });
  });

  it('keeps local when the server payload is malformed', () => {
    const local = nonEmptyBlocks();
    const res = mergeCoachBlocks(local, '2026-10-20T00:00:00.000Z', {
      id: 'coach-blocks:u1',
      user_id: 'u1',
      payload: 'corrupt',
      updated_at: '2026-10-21T00:00:00.000Z',
    });
    expect(res.changed).toBe(false);
    expect(res.merged).toEqual(parseCoachBlocksPayload(local));
  });

  it('empty local state adopts the server row even without a stamp', () => {
    const remote = nonEmptyBlocks();
    const res = mergeCoachBlocks(EMPTY_COACH_BLOCKS, undefined, {
      id: 'coach-blocks:u1',
      user_id: 'u1',
      payload: remote,
      updated_at: '2026-10-21T00:00:00.000Z',
    });
    expect(res.changed).toBe(true);
    expect(res.merged).toEqual(parseCoachBlocksPayload(remote));
    expect(res.adoptedUpdatedAt).toBe('2026-10-21T00:00:00.000Z');
  });

  it('non-empty local state without a stamp wins (pre-Phase-2 data)', () => {
    const local = nonEmptyBlocks();
    const res = mergeCoachBlocks(local, undefined, {
      id: 'coach-blocks:u1',
      user_id: 'u1',
      payload: EMPTY_COACH_BLOCKS,
      updated_at: '2026-10-21T00:00:00.000Z',
    });
    expect(res.changed).toBe(false);
    expect(res.merged).toEqual(parseCoachBlocksPayload(local));
  });

  it('server wins when its stamp is newer', () => {
    const local = nonEmptyBlocks();
    const remote = { ...EMPTY_COACH_BLOCKS, pastBlocks: [] };
    const res = mergeCoachBlocks(local, '2026-10-20T00:00:00.000Z', {
      id: 'coach-blocks:u1',
      user_id: 'u1',
      payload: remote,
      updated_at: '2026-10-21T00:00:00.000Z',
    });
    expect(res.changed).toBe(true);
    expect(res.merged).toEqual(parseCoachBlocksPayload(remote));
    expect(res.adoptedUpdatedAt).toBe('2026-10-21T00:00:00.000Z');
  });

  it('local wins when its stamp is newer or equal', () => {
    const local = nonEmptyBlocks();
    const res = mergeCoachBlocks(local, '2026-10-21T00:00:00.000Z', {
      id: 'coach-blocks:u1',
      user_id: 'u1',
      payload: EMPTY_COACH_BLOCKS,
      updated_at: '2026-10-21T00:00:00.000Z',
    });
    expect(res.changed).toBe(false);
  });
});

describe('mergeWeeklyReviews', () => {
  it('adds a server-only week and adopts its stamp', () => {
    const res = mergeWeeklyReviews([], {}, [
      { id: 'weekly-review:u1:2026-10-19', user_id: 'u1', payload: review('2026-10-19'), updated_at: '2026-10-21T00:00:00.000Z' },
    ]);
    expect(res.changed).toBe(true);
    expect(res.merged).toHaveLength(1);
    expect(res.merged[0].weekMonday).toBe('2026-10-19');
    expect(res.adoptedUpdatedAt['2026-10-19']).toBe('2026-10-21T00:00:00.000Z');
  });

  it('server replaces a week only when its stamp is newer', () => {
    const local = review('2026-10-19');
    const newer = { ...review('2026-10-19'), sessionsCompleted: 4 };
    const resNewer = mergeWeeklyReviews([local], { '2026-10-19': '2026-10-20T00:00:00.000Z' }, [
      { id: 'x', user_id: 'u1', payload: newer, updated_at: '2026-10-21T00:00:00.000Z' },
    ]);
    expect(resNewer.changed).toBe(true);
    expect(resNewer.merged[0].sessionsCompleted).toBe(4);

    const resOlder = mergeWeeklyReviews([local], { '2026-10-19': '2026-10-22T00:00:00.000Z' }, [
      { id: 'x', user_id: 'u1', payload: newer, updated_at: '2026-10-21T00:00:00.000Z' },
    ]);
    expect(resOlder.changed).toBe(false);
    expect(resOlder.merged[0].sessionsCompleted).toBe(3);
  });

  it('skips malformed server rows and never deletes local weeks', () => {
    const local = review('2026-10-19');
    const res = mergeWeeklyReviews([local], {}, [
      { id: 'x', user_id: 'u1', payload: { nope: true }, updated_at: '2026-10-21T00:00:00.000Z' },
    ]);
    expect(res.merged).toHaveLength(1);
    expect(res.merged[0].weekMonday).toBe('2026-10-19');
  });

  it('trims to the latest 12 weeks', () => {
    const local = mondaySeries(13).map((w) => review(w));
    const res = mergeWeeklyReviews(local, {}, []);
    expect(res.merged).toHaveLength(12);
    expect(res.merged[0].weekMonday).toBe(mondaySeries(13)[1]);
    expect(res.merged[11].weekMonday).toBe(mondaySeries(13)[12]);
  });
});

describe('coachSyncSignature', () => {
  it('is deterministic and changes with content', () => {
    const a = coachSyncSignature(EMPTY_COACH_BLOCKS, []);
    expect(coachSyncSignature(EMPTY_COACH_BLOCKS, [])).toBe(a);
    expect(coachSyncSignature(nonEmptyBlocks(), [])).not.toBe(a);
    expect(coachSyncSignature(EMPTY_COACH_BLOCKS, [review('2026-10-19')])).not.toBe(a);
    expect(coachSyncSignature(EMPTY_COACH_BLOCKS, undefined)).toBe(a);
  });
});

describe('push row builders', () => {
  it('never builds a blocks row for the initial state', () => {
    expect(coachBlocksRowForPush('u1', EMPTY_COACH_BLOCKS, '2026-10-21T00:00:00.000Z')).toBeNull();
  });

  it('builds deterministic rows for real state', () => {
    const row = coachBlocksRowForPush('u1', nonEmptyBlocks(), '2026-10-21T00:00:00.000Z');
    expect(row?.id).toBe('coach-blocks:u1');
    expect(row?.user_id).toBe('u1');
    expect(row?.updated_at).toBe('2026-10-21T00:00:00.000Z');

    const rows = weeklyReviewRowsForPush('u1', [review('2026-10-19'), { nope: true }], '2026-10-21T00:00:00.000Z');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('weekly-review:u1:2026-10-19');
  });
});

describe('pullCoachState', () => {
  it('skips without a client or user', async () => {
    const res = await pullCoachState(null, 'u1', { coachBlocks: EMPTY_COACH_BLOCKS, weeklyReviews: [] });
    expect(res.skipped).toBe(true);
    const res2 = await pullCoachState(mockClient({}), null, { coachBlocks: EMPTY_COACH_BLOCKS, weeklyReviews: [] });
    expect(res2.skipped).toBe(true);
  });

  it('reports pending setup on missing tables and keeps local state', async () => {
    const client = mockClient({
      blocks: { error: { code: 'PGRST205' } },
      reviews: { error: { code: 'PGRST205' } },
    });
    const local = nonEmptyBlocks();
    const res = await pullCoachState(client, 'u1', { coachBlocks: local, weeklyReviews: [review('2026-10-19')] });
    expect(res.pendingSetup).toBe(true);
    expect(res.changed).toBe(false);
    expect(res.coachBlocks).toEqual(parseCoachBlocksPayload(local));
    expect(isCoachSyncPendingSetup()).toBe(true);
  });

  it('merges a newer server blocks row and exposes the remote state', async () => {
    const remote = nonEmptyBlocks();
    const client = mockClient({
      blocks: {
        data: [{ id: 'coach-blocks:u1', user_id: 'u1', payload: remote, updated_at: '2026-10-21T00:00:00.000Z' }],
      },
      reviews: { data: [] },
    });
    const res = await pullCoachState(client, 'u1', { coachBlocks: EMPTY_COACH_BLOCKS, weeklyReviews: [] });
    expect(res.changed).toBe(true);
    expect(res.coachBlocks).toEqual(parseCoachBlocksPayload(remote));
    expect(res.remoteCoachBlocks).toEqual(parseCoachBlocksPayload(remote));
    expect(res.remoteCoachBlocksUpdatedAt).toBe('2026-10-21T00:00:00.000Z');
    expect(res.pendingSetup).toBe(false);
  });

  it('ignores a malformed server blocks payload', async () => {
    const client = mockClient({
      blocks: {
        data: [{ id: 'coach-blocks:u1', user_id: 'u1', payload: 'corrupt', updated_at: '2026-10-21T00:00:00.000Z' }],
      },
      reviews: { data: [] },
    });
    const local = nonEmptyBlocks();
    const res = await pullCoachState(client, 'u1', { coachBlocks: local, weeklyReviews: [] });
    expect(res.changed).toBe(false);
    expect(res.coachBlocks).toEqual(parseCoachBlocksPayload(local));
  });
});

describe('pushCoachState', () => {
  it('skips without a client or user', async () => {
    const res = await pushCoachState(null, 'u1', nonEmptyBlocks(), []);
    expect(res.skipped).toBe(true);
  });

  it('never pushes the initial state or an empty review list', async () => {
    const upserts: { table: string; rows: unknown[] }[] = [];
    const res = await pushCoachState(mockClient({ upserts }), 'u1', EMPTY_COACH_BLOCKS, []);
    expect(res.pushedCoachBlocks).toBe(false);
    expect(res.pushedReviewCount).toBe(0);
    expect(upserts).toHaveLength(0);
  });

  it('upserts deterministic rows with onConflict id', async () => {
    const upserts: { table: string; rows: unknown[]; options?: unknown }[] = [];
    const res = await pushCoachState(
      mockClient({ upserts }),
      'u1',
      nonEmptyBlocks(),
      [review('2026-10-19'), review('2026-10-12')],
    );
    expect(res.pushedCoachBlocks).toBe(true);
    expect(res.pushedReviewCount).toBe(2);
    expect(res.pushedUpdatedAt).toBeTruthy();
    const blocksCall = upserts.find((u) => u.table === COACH_BLOCKS_TABLE);
    const reviewsCall = upserts.find((u) => u.table === WEEKLY_REVIEWS_TABLE);
    expect(blocksCall).toBeTruthy();
    expect((blocksCall?.rows[0] as { id: string }).id).toBe('coach-blocks:u1');
    expect(blocksCall?.options).toEqual({ onConflict: 'id' });
    expect(reviewsCall?.rows).toHaveLength(2);
    expect(res.pushedWeeklyReviewUpdatedAt['2026-10-19']).toBe(res.pushedUpdatedAt);
  });

  it('reports pending setup when the tables are missing', async () => {
    const res = await pushCoachState(
      mockClient({ blocks: { upsertError: { code: 'PGRST205' } } }),
      'u1',
      nonEmptyBlocks(),
      [],
    );
    expect(res.pendingSetup).toBe(true);
    expect(res.pushedCoachBlocks).toBe(false);
    expect(isCoachSyncPendingSetup()).toBe(true);
  });
});

describe('local edit stamps (node env: storage degraded, return values kept)', () => {
  it('loads empty meta and never throws on save', () => {
    expect(loadCoachSyncMeta()).toEqual({});
    expect(() => setCoachSyncStamps({ coachBlocksUpdatedAt: '2026-10-21T00:00:00.000Z' })).not.toThrow();
  });

  it('records a stamp only for slices that actually changed', () => {
    const meta = recordCoachLocalChanges(
      EMPTY_COACH_BLOCKS,
      [],
      nonEmptyBlocks(),
      [review('2026-10-19')],
    ) as CoachSyncMeta;
    expect(typeof meta.coachBlocksUpdatedAt).toBe('string');
    expect(typeof meta.weeklyReviewsUpdatedAt?.['2026-10-19']).toBe('string');

    const unchanged = recordCoachLocalChanges(
      nonEmptyBlocks(),
      [review('2026-10-19')],
      nonEmptyBlocks(),
      [review('2026-10-19')],
    ) as CoachSyncMeta;
    expect(unchanged.coachBlocksUpdatedAt).toBeUndefined();
    expect(unchanged.weeklyReviewsUpdatedAt?.['2026-10-19']).toBeUndefined();
  });
});
