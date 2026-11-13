import { describe, it, expect, beforeEach } from 'vitest';
import {
  useStore,
  applyDeletionToState,
  applyRestoreToState,
  findLiveTombstoneOverlaps,
} from '@/lib/store';
import { applyRemoteTombstones } from '@/lib/supabase/reconcile';

/**
 * Phase 1.6 (§10) — one deletion API + the live/tombstone invariant +
 * the undo-vs-server-tombstone race.
 *
 * The race, verified in code: insertWorkoutAt/insertMealAt (Undo)
 * restored the row with its ORIGINAL updatedAt and cleared only the
 * LOCAL tombstone. The SERVER tombstone (stamped at delete time,
 * newer than the restored row's stamp) then killed the restored row
 * at the next pull (applyRemoteTombstones: delete wins) and filtered
 * it out of every push — Undo of an already-synced deletion was
 * silently undone by sync. Restores are edits: they must re-stamp.
 */

class MockStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}
(globalThis as any).localStorage = new MockStorage();
(globalThis as any).window = globalThis;

const T_OLD = '2026-11-01T10:00:00.000Z';

function baseLists() {
  return {
    deletedWorkoutIds: [] as string[],
    deletedMealIds: [] as string[],
    deletedBodyMetricIds: [] as string[],
    deletedPlanIds: [] as string[],
    deletedPrIds: [] as string[],
    tombstoneStamps: {} as Record<string, string>,
  };
}

describe('§10 deletion API (pure)', () => {
  it('applyDeletionToState adds the id once and stamps it', () => {
    const s1 = { ...baseLists(), ...applyDeletionToState(baseLists(), 'workouts', ['w1']) };
    expect(s1.deletedWorkoutIds).toEqual(['w1']);
    expect(s1.tombstoneStamps['workouts:w1']).toBeTruthy();
    const s2 = { ...s1, ...applyDeletionToState(s1, 'workouts', ['w1']) };
    expect(s2.deletedWorkoutIds).toEqual(['w1']);
  });

  it('applyRestoreToState removes the id AND its stamp', () => {
    const s1 = { ...baseLists(), ...applyDeletionToState(baseLists(), 'meals', ['m1']) };
    const s2 = { ...s1, ...applyRestoreToState(s1, 'meals', ['m1']) };
    expect(s2.deletedMealIds).toEqual([]);
    expect(s2.tombstoneStamps['meals:m1']).toBeUndefined();
  });

  it('findLiveTombstoneOverlaps reports an id that is both live and tombstoned', () => {
    const state: any = {
      workouts: [{ id: 'w1' }],
      meals: [],
      bodyMetrics: [],
      plannedWorkouts: [],
      prs: [],
      ...baseLists(),
      deletedWorkoutIds: ['w1'],
    };
    expect(findLiveTombstoneOverlaps(state)).toEqual([{ collection: 'workouts', id: 'w1' }]);
    state.deletedWorkoutIds = [];
    expect(findLiveTombstoneOverlaps(state)).toEqual([]);
  });
});

describe('§10 store wiring + the undo race', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
    useStore.setState({
      workouts: [
        { id: 'w1', name: 'W', date: '2026-11-01', exercises: [], updatedAt: T_OLD } as any,
      ],
      meals: [{ id: 'm1', name: 'M', date: '2026-11-01', foods: [], updatedAt: T_OLD } as any],
    });
  });

  it('deleteWorkout routes through the API: tombstone + stamp, invariant clean', () => {
    useStore.getState().deleteWorkout('w1');
    const s = useStore.getState();
    expect(s.deletedWorkoutIds).toContain('w1');
    expect(s.tombstoneStamps?.['workouts:w1']).toBeTruthy();
    expect(findLiveTombstoneOverlaps(s as any)).toEqual([]);
  });

  it('UNDO RESTORES RE-STAMP: the restored row beats the server tombstone at pull-apply', async () => {
    const store = useStore.getState();
    store.deleteWorkout('w1');
    const deletedAt = useStore.getState().tombstoneStamps!['workouts:w1'];
    expect(deletedAt).toBeTruthy();
    // Real deletes and undos are seconds apart; a sub-millisecond tie
    // resolves to DELETE by the documented convergence rule
    // (resolveDeleteVsEdit), so the test lets 3ms pass.
    await new Promise((r) => setTimeout(r, 3));

    const deleted = { id: 'w1', name: 'W', date: '2026-11-01', exercises: [], updatedAt: T_OLD } as any;
    useStore.getState().insertWorkoutAt(deleted, 0);

    const s = useStore.getState();
    const restored = s.workouts.find((w) => w.id === 'w1')!;
    expect(restored).toBeTruthy();
    expect(s.deletedWorkoutIds).not.toContain('w1');
    // The restore is an edit: its stamp must be NEWER than the deletion.
    expect(Date.parse(restored.updatedAt!)).toBeGreaterThan(Date.parse(deletedAt));
    // …and the pull-side application therefore keeps it.
    const applied = applyRemoteTombstones([restored], [{ id: 'w1', deletedAt }]);
    expect(applied.kept.map((r) => r.id)).toEqual(['w1']);
    expect(applied.resurrectedIds).toEqual(['w1']);
    expect(findLiveTombstoneOverlaps(s as any)).toEqual([]);
  });

  it('the same holds for meals (insertMealAt)', async () => {
    useStore.getState().deleteMeal('m1');
    const deletedAt = useStore.getState().tombstoneStamps!['meals:m1'];
    await new Promise((r) => setTimeout(r, 3));
    const deleted = { id: 'm1', name: 'M', date: '2026-11-01', foods: [], updatedAt: T_OLD } as any;
    useStore.getState().insertMealAt(deleted, 0);
    const restored = useStore.getState().meals.find((m) => m.id === 'm1')!;
    expect(Date.parse(restored.updatedAt!)).toBeGreaterThan(Date.parse(deletedAt));
    const applied = applyRemoteTombstones([restored], [{ id: 'm1', deletedAt }]);
    expect(applied.kept).toHaveLength(1);
  });
});
