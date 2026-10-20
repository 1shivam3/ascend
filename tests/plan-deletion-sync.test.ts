import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, partializeAppState } from '../src/lib/store';
import {
  remoteIdsToDelete,
  mergeRemotePlans,
  prunableTombstones,
} from '../src/lib/supabase/reconcile';
import type { PlannedWorkout } from '../src/lib/types';

const plan = (id: string, name: string): PlannedWorkout =>
  ({ id, name, createdAt: '2026-10-20', exercises: [] } as PlannedWorkout);

describe('Plan deletion stays deleted (bug #2)', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('tombstones a deleted plan id and removes the plan', () => {
    const store = useStore.getState();
    store.addPlannedWorkout(plan('p1', 'Leg Day'));
    store.addPlannedWorkout(plan('p2', 'Push Day'));
    expect(useStore.getState().plannedWorkouts.map((p) => p.id)).toEqual(
      expect.arrayContaining(['p1', 'p2'])
    );

    useStore.getState().deletePlannedWorkout('p1');

    const after = useStore.getState();
    expect(after.plannedWorkouts.map((p) => p.id)).not.toContain('p1');
    expect(after.plannedWorkouts.map((p) => p.id)).toContain('p2');
    expect(after.deletedPlanIds).toContain('p1');
  });

  it('persists tombstones through partialize (survives refresh)', () => {
    useStore.getState().addPlannedWorkout(plan('p1', 'Leg Day'));
    useStore.getState().deletePlannedWorkout('p1');
    const persisted = partializeAppState(useStore.getState()) as Record<string, unknown>;
    expect(persisted.deletedPlanIds).toContain('p1');
  });

  it('explicitly re-adding a plan clears its tombstone', () => {
    const store = useStore.getState();
    store.addPlannedWorkout(plan('p1', 'Leg Day'));
    store.deletePlannedWorkout('p1');
    expect(useStore.getState().deletedPlanIds).toContain('p1');
    store.addPlannedWorkout(plan('p1', 'Leg Day'));
    expect(useStore.getState().plannedWorkouts.map((p) => p.id)).toContain('p1');
    expect(useStore.getState().deletedPlanIds).not.toContain('p1');
  });

  it('mergeRemotePlans never resurrects a tombstoned plan', () => {
    // The deleted plan still sits on the server (stale copy).
    const remote = [plan('p1', 'Leg Day'), plan('p2', 'Push Day')];
    const local = [plan('p2', 'Push Day')];

    const { merged, changed } = mergeRemotePlans(local, remote, ['p1']);
    expect(merged.map((p) => p.id)).not.toContain('p1');
    expect(merged.map((p) => p.id)).toContain('p2');
    expect(changed).toBe(false);
  });

  it('mergeRemotePlans still merges genuine other-device plans', () => {
    const remote = [plan('p2', 'Push Day'), plan('p3', 'Other Device Plan')];
    const local = [plan('p2', 'Push Day')];
    const { merged, changed } = mergeRemotePlans(local, remote, ['p1']);
    expect(merged.map((p) => p.id)).toEqual(
      expect.arrayContaining(['p2', 'p3'])
    );
    expect(changed).toBe(true);
  });

  it('remoteIdsToDelete computes the stale server rows', () => {
    expect(remoteIdsToDelete(['a', 'b'], ['a', 'b', 'c'])).toEqual(['c']);
    expect(remoteIdsToDelete([], ['a'])).toEqual(['a']);
    expect(remoteIdsToDelete(['a'], [])).toEqual([]);
  });

  it('prunableTombstones drops tombstones the server has confirmed gone', () => {
    // p1: deleted everywhere (prune). p2: recreated locally (keep logic ok to prune — it is local). p3: still on server (keep).
    const pruned = prunableTombstones(['p1', 'p2', 'p3'], ['p2'], ['p3']);
    expect(pruned).toEqual(['p1']);
  });

  it('clearAllData resets tombstones', () => {
    useStore.getState().addPlannedWorkout(plan('p1', 'Leg Day'));
    useStore.getState().deletePlannedWorkout('p1');
    useStore.getState().clearAllData();
    expect(useStore.getState().deletedPlanIds).toEqual([]);
  });

  it('end-to-end: delete → pull merge → plan stays gone', () => {
    // 1. User has two plans, deletes one locally.
    useStore.getState().addPlannedWorkout(plan('p1', 'Leg Day'));
    useStore.getState().addPlannedWorkout(plan('p2', 'Push Day'));
    useStore.getState().deletePlannedWorkout('p1');

    // 2. Refresh: state rehydrates from localStorage (partialize round-trip).
    const persisted = partializeAppState(useStore.getState()) as Record<string, unknown>;

    // 3. Sync pull: server still has the stale plan (deletion not pushed yet).
    const staleRemote = [plan('p1', 'Leg Day'), plan('p2', 'Push Day')];
    const { merged } = mergeRemotePlans(
      (persisted.plannedWorkouts as PlannedWorkout[]).filter(
        (p) => !(persisted.deletedPlanIds as string[]).includes(p.id)
      ),
      staleRemote,
      persisted.deletedPlanIds as string[]
    );

    expect(merged.map((p) => p.id)).not.toContain('p1');
    expect(merged.map((p) => p.id)).toContain('p2');
  });
});
