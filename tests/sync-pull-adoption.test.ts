import { describe, it, expect } from 'vitest';
import { recomputePullSlices, type PullSliceKey, type PullSliceInput } from '@/lib/supabase/reconcile';

/**
 * Audit F28 (brief option A): signature-based pull adoption.
 * When the local copy is unchanged since the last push (the caller
 * proves this via signature equality and passes adopt=true), remote
 * edits to existing rows are ADOPTED; when it changed (adopt=false),
 * the historical keep-local behaviour holds and the next push wins.
 * Tombstoned rows are never resurrected in any branch, and the
 * cross-account replace branch ignores adopt entirely.
 */

type Row = { id: string; [k: string]: unknown };

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

describe('recomputePullSlices with adoptRemoteChanges=true (untouched device)', () => {
  it('edit-on-B adopted by untouched-A: remote row replaces the local row', () => {
    const out = recomputePullSlices(
      freshAll({ workouts: freshSlice([{ id: 'w1', title: 'Old', v: 1 }]) }),
      { workouts: r([{ id: 'w1', title: 'Renamed on B', v: 2 }]) },
      false,
      true,
    );
    expect(out.workouts).toEqual([{ id: 'w1', title: 'Renamed on B', v: 2 }]);
  });

  it('remote-only rows append, local order preserved, no duplication', () => {
    const out = recomputePullSlices(
      freshAll({
        workouts: freshSlice([
          { id: 'w1', v: 1 },
          { id: 'w2', v: 1 },
        ]),
      }),
      { workouts: r([{ id: 'w2', v: 2 }, { id: 'w3', v: 1 }]) },
      false,
      true,
    );
    expect(out.workouts).toEqual([
      { id: 'w1', v: 1 },
      { id: 'w2', v: 2 },
      { id: 'w3', v: 1 },
    ]);
  });

  it('tombstoned remote row is NOT adopted or resurrected', () => {
    const out = recomputePullSlices(
      freshAll({ workouts: freshSlice([], ['w1']) }),
      { workouts: r([{ id: 'w1', v: 9 }]) },
      false,
      true,
    );
    expect(out.workouts).toBeUndefined();
  });

  it('identical remote content → slice omitted (no pointless rewrite)', () => {
    const out = recomputePullSlices(
      freshAll({ workouts: freshSlice([{ id: 'w1', v: 1 }]) }),
      { workouts: r([{ id: 'w1', v: 1 }]) },
      false,
      true,
    );
    expect(out.workouts).toBeUndefined();
  });

  it('empty remote → slice omitted (adoption never clears local rows)', () => {
    const out = recomputePullSlices(
      freshAll({ workouts: freshSlice([{ id: 'w1', v: 1 }]) }),
      { workouts: r([]) },
      false,
      true,
    );
    expect(out.workouts).toBeUndefined();
  });
});

describe('recomputePullSlices with adopt=false (true conflict / changed device)', () => {
  it('true conflict keeps local: remote edit to an existing row is skipped', () => {
    const out = recomputePullSlices(
      freshAll({ workouts: freshSlice([{ id: 'w1', title: 'Local edit', v: 2 }]) }),
      { workouts: r([{ id: 'w1', title: 'Remote edit', v: 2 }]) },
      false,
      false,
    );
    // No remote-only addition → slice omitted, local untouched. The
    // next push from this device overwrites remote: last-push-wins.
    expect(out.workouts).toBeUndefined();
  });

  it('default (4th arg omitted) is the historical behaviour', () => {
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
});

describe('adopt is ignored by the cross-account replace branch', () => {
  it('switch + adopt=true still replaces with server rows minus tombstones', () => {
    const out = recomputePullSlices(
      freshAll({ workouts: freshSlice([{ id: 'w1', v: 1 }], ['w9']) }),
      { workouts: r([{ id: 'w2', v: 1 }, { id: 'w9', v: 1 }]) },
      true,
      true,
    );
    expect(out.workouts).toEqual([{ id: 'w2', v: 1 }]);
  });
});
