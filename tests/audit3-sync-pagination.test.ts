/**
 * Audit-3 DI2-1: sync reads must page past the 1,000-row PostgREST cap.
 *
 * The fake client below simulates PostgREST honestly: a bare
 * select/eq query resolves to AT MOST 1,000 rows (the cap), while
 * order+range returns the requested window. Against it, the old bare
 * reads would silently see 1,000 of 2,500 rows.
 */
import { describe, it, expect } from 'vitest';
import { fetchAllUserRowsPaged, SYNC_READ_PAGE_SIZE } from '../src/lib/supabase/sync';
import { prunableTombstones, tombstonedIdsToDelete } from '../src/lib/supabase/reconcile';

const CAP = 1000;

function makeRows(total: number, userId = 'u1') {
  return Array.from({ length: total }, (_, i) => ({
    id: `row-${String(i).padStart(5, '0')}`,
    user_id: userId,
    updated_at: '2026-10-01T00:00:00.000Z',
  }));
}

function fakePostgrestClient(allRows: Array<{ id: string; user_id: string }>) {
  return {
    from: (_table: string) => {
      let filtered = allRows;
      const builder: any = {
        select: () => builder,
        eq: (column: string, value: string) => {
          filtered = allRows.filter((r: any) => r[column] === value);
          return builder;
        },
        order: () => builder,
        range: (from: number, to: number) =>
          Promise.resolve({ data: filtered.slice(from, to + 1), error: null }),
        // Awaiting the bare builder = an unpaged PostgREST read: capped.
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: filtered.slice(0, CAP), error: null }),
      };
      return builder;
    },
  };
}

describe('audit-3 DI2-1: fetchAllUserRowsPaged', () => {
  it('returns every row past the 1,000-row cap (2,500 rows)', async () => {
    const client = fakePostgrestClient(makeRows(2500));
    const { data, error } = await fetchAllUserRowsPaged(client, 'meals', '*', 'user_id', 'u1');
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(2500);
    expect(data![0].id).toBe('row-00000');
    expect(data![2499].id).toBe('row-02499');
  });

  it('handles an exact page boundary (2,000 rows = two full pages)', async () => {
    const client = fakePostgrestClient(makeRows(2000));
    const { data, error } = await fetchAllUserRowsPaged(client, 'workouts', '*', 'user_id', 'u1');
    expect(error).toBeNull();
    expect(data!.length).toBe(2000);
  });

  it('filters by the given column/value while paging', async () => {
    const rows = [...makeRows(1500, 'u1'), ...makeRows(700, 'u2')];
    const client = fakePostgrestClient(rows);
    const { data } = await fetchAllUserRowsPaged(client, 'meals', 'id,updated_at', 'user_id', 'u2');
    expect(data!.length).toBe(700);
    expect(data!.every((r: any) => r.user_id === 'u2')).toBe(true);
  });

  it('propagates a page error as { data: null, error } (fail-safe shape)', async () => {
    const rows = makeRows(1500);
    const client = {
      from: () => {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          range: (from: number, to: number) =>
            from >= SYNC_READ_PAGE_SIZE
              ? Promise.resolve({ data: null, error: { message: 'boom' } })
              : Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
          then: (resolve: (v: unknown) => void) => resolve({ data: rows.slice(0, CAP), error: null }),
        };
        return builder;
      },
    };
    const { data, error } = await fetchAllUserRowsPaged(client, 'meals', '*', 'user_id', 'u1');
    expect(data).toBeNull();
    expect(error).toEqual({ message: 'boom' });
  });

  it('falls back to the legacy single query for doubles without order/range', async () => {
    const rows = makeRows(42);
    const legacyClient = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    };
    const { data, error } = await fetchAllUserRowsPaged(legacyClient, 'meals', '*', 'user_id', 'u1');
    expect(error).toBeNull();
    expect(data!.length).toBe(42);
  });

  it('tombstone past the cap is NOT pruned once the full id list is read (no resurrection)', async () => {
    const rows = makeRows(2500);
    const client = fakePostgrestClient(rows);
    const { data } = await fetchAllUserRowsPaged(client, 'workouts', 'id', 'user_id', 'u1');
    const remoteIds = (data || []).map((r: any) => r.id as string);

    const tombstone = 'row-02400'; // sits at index 2400 — past the old cap
    // With the complete remote id list, the tombstone's row is known to
    // still exist server-side: it must be DELETED (tombstonedIdsToDelete
    // includes it), never pruned as if already gone.
    expect(prunableTombstones([tombstone], new Set<string>(), remoteIds)).toEqual([]);
    expect(tombstonedIdsToDelete(new Set<string>(), remoteIds, [tombstone])).toEqual([tombstone]);

    // The old truncated read (first 1,000 ids) would have pruned it —
    // the resurrection mechanism DI2-1 removes.
    const truncatedIds = remoteIds.slice(0, CAP);
    expect(prunableTombstones([tombstone], new Set<string>(), truncatedIds)).toEqual([tombstone]);
  });
});
