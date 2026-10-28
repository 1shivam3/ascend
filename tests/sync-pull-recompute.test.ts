import { describe, it, expect } from 'vitest';
import { recomputePullSlices, type PullSliceKey, type PullSliceInput } from '@/lib/supabase/reconcile';

/**
 * Audit R2/R5 regression: the pull used to apply merges computed from
 * local state captured BEFORE the network round-trip, so a delete, edit,
 * or add made mid-sync was overwritten by the stale arrays on apply.
 * These tests drive the apply-time recompute helper with fresh state.
 */

type Row = { id: string; [k: string]: unknown };

/** Build a remote row array through a typed variable (avoids literal excess-property checks). */
const r = (rows: Row[]): { id: string }[] => rows;

function freshSlice(local: Row[], tombstones: string[] = []): PullSliceInput {
  return { local, tombstones };
}

function freshAll(overrides: Partial<Record<PullSliceKey, PullSliceInput>> = {}) {
  const empty: PullSliceInput = { local: [], tombstones: [] };
  return {
    prs: empty,
    workouts: empty,
    meals: empty,
    bodyMetrics: empty,
    plannedWorkouts: empty,
    ...overrides,
  };
}

describe('recomputePullSlices (merge branch)', () => {
  it('mid-sync delete survives: tombstoned remote row is not resurrected', () => {
    // Captured local had w1; user deleted w1 mid-sync (fresh local lacks
    // it, tombstone present); server still returns w1.
    const out = recomputePullSlices(
      freshAll({ workouts: freshSlice([], ['w1']) }),
      { workouts: r([{ id: 'w1', v: 1 }]) },
      false,
    );
    // No remote-only addition survives (w1 is tombstoned) → slice omitted.
    expect(out.workouts).toBeUndefined();
  });

  it('mid-sync edit survives: fresh local version is the merge base', () => {
    const out = recomputePullSlices(
      freshAll({ workouts: freshSlice([{ id: 'w1', v: 2 }]) }),
      { workouts: r([{ id: 'w1', v: 1 }, { id: 'w2', v: 1 }]) },
      false,
    );
    expect(out.workouts).toEqual([
      { id: 'w1', v: 2 },
      { id: 'w2', v: 1 },
    ]);
  });

  it('mid-sync add survives: fresh local rows are kept, remote-only rows added', () => {
    const out = recomputePullSlices(
      freshAll({ meals: freshSlice([{ id: 'm9', v: 1 }]) }),
      { meals: r([{ id: 'm1', v: 1 }]) },
      false,
    );
    expect(out.meals).toEqual([
      { id: 'm9', v: 1 },
      { id: 'm1', v: 1 },
    ]);
  });

  it('no-change slice is omitted (no redundant setState/persist write)', () => {
    const out = recomputePullSlices(
      freshAll({ prs: freshSlice([{ id: 'p1', v: 1 }]) }),
      { prs: r([{ id: 'p1', v: 1 }]) },
      false,
    );
    expect(out.prs).toBeUndefined();
  });

  it('remote-only rows still merge when nothing changed mid-sync', () => {
    const out = recomputePullSlices(
      freshAll({ bodyMetrics: freshSlice([{ id: 'b1' }]) }),
      { bodyMetrics: r([{ id: 'b1' }, { id: 'b2' }]) },
      false,
    );
    expect(out.bodyMetrics).toEqual([{ id: 'b1' }, { id: 'b2' }]);
  });
});

describe('recomputePullSlices (replace branch)', () => {
  it('cross-account replace filters locally tombstoned rows (R5)', () => {
    const out = recomputePullSlices(
      freshAll({ workouts: freshSlice([], ['w1']) }),
      { workouts: r([{ id: 'w1' }, { id: 'w2' }]) },
      true,
    );
    expect(out.workouts).toEqual([{ id: 'w2' }]);
  });

  it('cross-account replace keeps server rows when nothing is tombstoned', () => {
    const out = recomputePullSlices(
      freshAll({ workouts: freshSlice([{ id: 'old' }]) }),
      { workouts: r([{ id: 'w1' }, { id: 'w2' }]) },
      true,
    );
    expect(out.workouts).toEqual([{ id: 'w1' }, { id: 'w2' }]);
  });

  it('slices with no remote data are untouched', () => {
    const out = recomputePullSlices(
      freshAll({ workouts: freshSlice([{ id: 'w1' }]) }),
      {},
      false,
    );
    expect(out).toEqual({});
  });
});
