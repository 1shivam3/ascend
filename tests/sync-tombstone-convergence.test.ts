import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveDeleteVsEdit,
  effectiveTombstones,
  applyRemoteTombstones,
  partitionTombstonesForPush,
  filterOutServerDeleted,
  stampedTombstones,
  tombstoneStampKey,
  type StampedTombstone,
} from '@/lib/supabase/reconcile';
import { fetchSyncTombstoneRows } from '@/lib/supabase/sync';
import { useStore, partializeAppState } from '@/lib/store';

/**
 * Sync convergence S1/S2 — simulated two-device scenarios over the
 * pure decision helpers the sync engine is wired to:
 *
 * - S1: a deletion on device B must converge on device A (A's stale
 *   local copy is removed by B's server tombstone, and A's push must
 *   not re-upload it).
 * - S2: delete-vs-edit is ordered by stamps — a newer edit beats an
 *   older delete (resurrect), a newer delete beats an older edit.
 * - Pre-migration fail-safe: when the sync_tombstones table does not
 *   exist, the fetch reports an error and the engine falls back to
 *   the pre-convergence behaviour (covered here at the fetch seam).
 */

const T1 = '2026-11-01T10:00:00.000Z';
const T2 = '2026-11-02T10:00:00.000Z';
const T3 = '2026-11-03T10:00:00.000Z';

describe('resolveDeleteVsEdit', () => {
  it('newer delete beats older edit; newer edit beats older delete', () => {
    expect(resolveDeleteVsEdit(T2, T1)).toBe('delete');
    expect(resolveDeleteVsEdit(T1, T2)).toBe('keep');
  });

  it('a tie goes to the delete (both devices converge on the same answer)', () => {
    expect(resolveDeleteVsEdit(T2, T2)).toBe('delete');
  });

  it('an unstamped remote row cannot prove it is newer — delete wins', () => {
    expect(resolveDeleteVsEdit(T2, null)).toBe('delete');
    expect(resolveDeleteVsEdit(T2, 'not-a-date')).toBe('delete');
    expect(resolveDeleteVsEdit(T2, undefined)).toBe('delete');
  });

  it('an unstamped deletion loses to a provable edit', () => {
    expect(resolveDeleteVsEdit(null, T1)).toBe('keep');
    expect(resolveDeleteVsEdit(null, null)).toBe('delete');
  });
});

describe('S1 — a deletion on device B converges on device A', () => {
  it("B's server tombstone removes A's stale local copy", () => {
    // Device A still holds workout w1, last edited at T1. Device B
    // deleted it at T2 and recorded the tombstone server-side.
    const aLocal = [
      { id: 'w1', updatedAt: T1 },
      { id: 'w2', updatedAt: T1 },
    ];
    const serverTombs: StampedTombstone[] = [{ id: 'w1', deletedAt: T2 }];
    const { kept, removedIds } = applyRemoteTombstones(aLocal, serverTombs);
    expect(removedIds).toEqual(['w1']);
    expect(kept.map((r) => r.id)).toEqual(['w2']);
  });

  it("A's push does not re-upload the record B deleted", () => {
    const aRows = [
      { id: 'w1', updatedAt: T1 },
      { id: 'w2', updatedAt: T3 },
    ];
    const serverTombs: StampedTombstone[] = [{ id: 'w1', deletedAt: T2 }];
    expect(filterOutServerDeleted(aRows, serverTombs).map((r) => r.id)).toEqual(['w2']);
  });

  it('a tombstone for a record A never held removes nothing', () => {
    const { kept, removedIds } = applyRemoteTombstones(
      [{ id: 'w9', updatedAt: T1 }],
      [{ id: 'w1', deletedAt: T2 }],
    );
    expect(removedIds).toEqual([]);
    expect(kept).toHaveLength(1);
  });
});

describe('S2 — delete-vs-edit ordering', () => {
  it("A's newer edit resurrects the record B deleted earlier", () => {
    const { kept, removedIds, resurrectedIds } = applyRemoteTombstones(
      [{ id: 'w1', updatedAt: T3 }],
      [{ id: 'w1', deletedAt: T2 }],
    );
    expect(kept.map((r) => r.id)).toEqual(['w1']);
    expect(removedIds).toEqual([]);
    expect(resurrectedIds).toEqual(['w1']);
  });

  it("A's older edit loses to B's newer delete", () => {
    const { kept, removedIds } = applyRemoteTombstones(
      [{ id: 'w1', updatedAt: T1 }],
      [{ id: 'w1', deletedAt: T2 }],
    );
    expect(kept).toEqual([]);
    expect(removedIds).toEqual(['w1']);
  });

  it("push side: A's older delete does NOT delete B's newer edit", () => {
    const partition = partitionTombstonesForPush(
      [{ id: 'w1', deletedAt: T1 }],
      [],
      new Map([['w1', T3]]),
    );
    expect(partition.toDelete).toEqual([]);
    expect(partition.keptByEdit).toEqual(['w1']);
  });

  it("push side: A's newer delete deletes B's older edit", () => {
    const partition = partitionTombstonesForPush(
      [{ id: 'w1', deletedAt: T3 }],
      [],
      new Map([['w1', T1]]),
    );
    expect(partition.toDelete).toEqual(['w1']);
    expect(partition.keptByEdit).toEqual([]);
  });

  it('push side: a record already gone remotely only needs confirming', () => {
    const partition = partitionTombstonesForPush(
      [{ id: 'w1', deletedAt: T3 }],
      [],
      new Map<string, string | null>(),
    );
    expect(partition.toConfirm).toEqual(['w1']);
  });

  it('push side: a re-added record is not a tombstone any more', () => {
    const partition = partitionTombstonesForPush(
      [{ id: 'w1', deletedAt: T3 }],
      ['w1'],
      new Map([['w1', T1]]),
    );
    expect(partition).toEqual({ toDelete: [], toConfirm: [], keptByEdit: [] });
  });

  it('legacy unstamped tombstones keep the pre-convergence always-delete push semantics', () => {
    const partition = partitionTombstonesForPush(
      [{ id: 'w1', deletedAt: null }],
      [],
      new Map([['w1', T3]]),
    );
    expect(partition.toDelete).toEqual(['w1']);
  });

  it("pull filter: a stamped local tombstone stops filtering once a newer remote edit exists", () => {
    const { active, resurrectedIds } = effectiveTombstones(
      [
        { id: 'w1', deletedAt: T1 },
        { id: 'w2', deletedAt: T3 },
        { id: 'w3', deletedAt: T2 },
      ],
      new Map([
        ['w1', T2], // remote edit newer than the delete → resurrect
        ['w2', T1], // delete newer than the remote edit → stays active
        // w3 has no remote row → stays active
      ]),
    );
    expect(resurrectedIds).toEqual(['w1']);
    expect(active.map((t) => t.id)).toEqual(['w2', 'w3']);
  });
});

describe('stampedTombstones + stamp keys', () => {
  it('pairs ids with their stamps; missing stamps read as null (legacy)', () => {
    const stamps = { [tombstoneStampKey('workouts', 'w1')]: T2 };
    expect(stampedTombstones(['w1', 'w2'], stamps, 'workouts')).toEqual([
      { id: 'w1', deletedAt: T2 },
      { id: 'w2', deletedAt: null },
    ]);
    expect(stampedTombstones(['w1'], undefined, 'workouts')).toEqual([
      { id: 'w1', deletedAt: null },
    ]);
  });
});

describe('pre-migration fail-safe — fetchSyncTombstoneRows', () => {
  it('a missing-table error comes back as an error (the engine then falls back)', async () => {
    const missingTableClient = {
      from: () => ({
        select: () => ({
          eq: async () => ({
            data: null,
            error: { code: 'PGRST205', message: "Could not find the table 'public.sync_tombstones' in the schema cache" },
          }),
        }),
      }),
    };
    const { data, error } = await fetchSyncTombstoneRows(missingTableClient, 'user-1');
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  it('maps rows and drops unknown collections', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: async () => ({
            data: [
              { collection: 'workouts', record_id: 'w1', deleted_at: T2 },
              { collection: 'bogus', record_id: 'x1', deleted_at: T2 },
              { collection: 'meals', record_id: 'm1', deleted_at: null },
            ],
            error: null,
          }),
        }),
      }),
    };
    const { data, error } = await fetchSyncTombstoneRows(client, 'user-1');
    expect(error).toBeNull();
    expect(data).toEqual([
      { collection: 'workouts', recordId: 'w1', deletedAt: T2 },
      { collection: 'meals', recordId: 'm1', deletedAt: null },
    ]);
  });
});

// --- Store stamp bookkeeping ------------------------------------------------

class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] || null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

describe('store tombstone stamps (S1/S2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(global, 'localStorage', {
      value: new MockStorage(),
      writable: true,
      configurable: true,
    });
    useStore.getState().clearAllData();
  });

  it('delete actions stamp the tombstone with a parseable time', () => {
    const s = useStore.getState();
    s.addWorkout({
      id: 'w1', name: 'W', date: '2026-11-01', exercises: [],
    } as any);
    useStore.getState().deleteWorkout('w1');
    const state = useStore.getState();
    expect(state.deletedWorkoutIds).toContain('w1');
    const stamp = state.tombstoneStamps[tombstoneStampKey('workouts', 'w1')];
    expect(typeof stamp).toBe('string');
    expect(Number.isNaN(Date.parse(stamp))).toBe(false);
  });

  it('clearing a tombstone (server confirmed) drops its stamp too', () => {
    const s = useStore.getState();
    s.addMeal({ id: 'm1', name: 'M', date: '2026-11-01', foods: [] } as any);
    useStore.getState().deleteMeal('m1');
    expect(
      useStore.getState().tombstoneStamps[tombstoneStampKey('meals', 'm1')],
    ).toBeTruthy();
    useStore.getState().clearDeletedMealIds(['m1']);
    const state = useStore.getState();
    expect(state.deletedMealIds).not.toContain('m1');
    expect(state.tombstoneStamps[tombstoneStampKey('meals', 'm1')]).toBeUndefined();
  });

  it('plan deletes stamp under the planned_workouts collection', () => {
    useStore.setState({
      plannedWorkouts: [{ id: 'p1', name: 'P', exercises: [] } as any],
    });
    useStore.getState().deletePlannedWorkout('p1');
    const state = useStore.getState();
    expect(state.deletedPlanIds).toContain('p1');
    expect(
      state.tombstoneStamps[tombstoneStampKey('planned_workouts', 'p1')],
    ).toBeTruthy();
  });

  it('the stamp map is persisted (partialize) and reset by a fresh state', () => {
    const s = useStore.getState();
    s.addPR({
      id: 'pr1', exercise: 'Squat', weightKg: 100, weightLbs: 220, reps: 1,
      oneRepMax: 100, date: '2026-11-01',
    } as any);
    useStore.getState().deletePR('pr1');
    const persisted = partializeAppState(useStore.getState()) as any;
    expect(persisted.tombstoneStamps[tombstoneStampKey('personal_records', 'pr1')]).toBeTruthy();
    useStore.getState().clearAllData();
    expect(useStore.getState().tombstoneStamps).toEqual({});
  });
});
