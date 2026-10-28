import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolvePullWinner,
  shouldPushRow,
  filterRowsForPush,
  recomputePullSlices,
  type PullSliceKey,
  type PullSliceInput,
} from '../src/lib/supabase/reconcile';

/**
 * Gauntlet R1/DI-08 — newest wins, per row, both directions.
 * The user chose keep-the-newest over silent last-push-wins.
 *
 * Rule, pinned here:
 * - Push: upsert only rows absent remotely or strictly newer than
 *   remote. Remote-newer, ties, and missing/unparseable stamps on
 *   either side (except absent-remote) all SKIP the upsert — a row
 *   with a missing/unparseable local stamp NEVER overwrites remote.
 * - Pull (merge branch, adopt=false): the newer stamp wins; equal
 *   parseable stamps with different content are a TIE and go to
 *   REMOTE for convergence; a missing local stamp loses to a
 *   parseable remote stamp; when NEITHER side parses there is no
 *   ordering information, so pull keeps local (historical behaviour)
 *   while the push gate still protects the remote copy.
 * - Tombstones are untouched by this change: a tombstoned row is
 *   never adopted, merged, or resurrected, even when remote is newer.
 * - The F28 adopt=true branch is unchanged (signature equality
 *   already proves no local edit to lose).
 * - Residuals (documented in reconcile.ts, not fixed here): device
 *   clock skew (DI-08.5) and stamp-ungated tombstone propagation
 *   (a newer remote edit can still lose to an older local delete).
 */

type Row = { id: string; updatedAt?: string; [k: string]: unknown };

const OLD = '2026-10-20T10:00:00Z';
const NEW = '2026-10-20T12:00:00Z';

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

const slice = (local: Row[], tombstones: string[] = []): PullSliceInput => ({ local, tombstones });

// Remote rows are id-shaped in recomputePullSlices' signature; the
// cast helper (same pattern as sync-pull-adoption.test.ts) lets test
// rows carry titles and stamps through it.
const r = (rows: Row[]): { id: string }[] => rows;

describe('push gate (shouldPushRow / filterRowsForPush)', () => {
  it('(b) push overwrites when local is strictly newer', () => {
    expect(shouldPushRow(NEW, OLD)).toBe(true);
    const { toUpsert, skipped } = filterRowsForPush(
      [{ id: 'w1', updatedAt: NEW }],
      new Map([['w1', OLD]]),
    );
    expect(toUpsert.map((r) => r.id)).toEqual(['w1']);
    expect(skipped).toEqual([]);
  });

  it('(a) push skips a row whose remote stamp is newer', () => {
    expect(shouldPushRow(OLD, NEW)).toBe(false);
    const { toUpsert, skipped } = filterRowsForPush(
      [{ id: 'w1', updatedAt: OLD }],
      new Map([['w1', NEW]]),
    );
    expect(toUpsert).toEqual([]);
    expect(skipped.map((r) => r.id)).toEqual(['w1']);
  });

  it('(e) missing/unparseable local stamp never overwrites remote', () => {
    expect(shouldPushRow(undefined, NEW)).toBe(false);
    expect(shouldPushRow(null, NEW)).toBe(false);
    expect(shouldPushRow('not-a-date', NEW)).toBe(false);
    const { toUpsert, skipped } = filterRowsForPush(
      [
        { id: 'w1' },
        { id: 'w2', updatedAt: 'garbage' },
      ],
      new Map([
        ['w1', NEW],
        ['w2', NEW],
      ]),
    );
    expect(toUpsert).toEqual([]);
    expect(skipped.map((r) => r.id)).toEqual(['w1', 'w2']);
  });

  it('tie does not overwrite remote', () => {
    expect(shouldPushRow(NEW, NEW)).toBe(false);
  });

  it('unparseable remote stamp fails to remote (never overwrites)', () => {
    expect(shouldPushRow(NEW, 'garbage')).toBe(false);
    expect(shouldPushRow(NEW, null)).toBe(false);
  });

  it('row absent remotely is upserted even without a local stamp', () => {
    expect(shouldPushRow(undefined, undefined)).toBe(true);
    const { toUpsert } = filterRowsForPush([{ id: 'w9' }], new Map());
    expect(toUpsert.map((r) => r.id)).toEqual(['w9']);
  });
});

describe('pull newest-wins (recomputePullSlices, adopt=false)', () => {
  it('(c) pull adopts the newer remote row over a stale local row', () => {
    const out = recomputePullSlices(
      freshAll({ workouts: slice([{ id: 'w1', title: 'Local stale', updatedAt: OLD }]) }),
      { workouts: r([{ id: 'w1', title: 'Remote newer', updatedAt: NEW }]) },
      false,
      false,
    );
    expect(out.workouts).toEqual([{ id: 'w1', title: 'Remote newer', updatedAt: NEW }]);
  });

  it('(d) pull keeps the newer local row over an older remote row', () => {
    const out = recomputePullSlices(
      freshAll({ workouts: slice([{ id: 'w1', title: 'Local newer', updatedAt: NEW }]) }),
      { workouts: r([{ id: 'w1', title: 'Remote older', updatedAt: OLD }]) },
      false,
      false,
    );
    expect(out.workouts).toBeUndefined();
  });

  it('(e) pull adopts remote when the local stamp is missing', () => {
    const out = recomputePullSlices(
      freshAll({ workouts: slice([{ id: 'w1', title: 'Local unstamped' }]) }),
      { workouts: r([{ id: 'w1', title: 'Remote stamped', updatedAt: NEW }]) },
      false,
      false,
    );
    expect(out.workouts).toEqual([{ id: 'w1', title: 'Remote stamped', updatedAt: NEW }]);
  });

  it('(f) tie (equal stamps, different content) goes to remote', () => {
    expect(resolvePullWinner(NEW, NEW)).toBe('remote');
    const out = recomputePullSlices(
      freshAll({ workouts: slice([{ id: 'w1', title: 'Local', updatedAt: NEW }]) }),
      { workouts: r([{ id: 'w1', title: 'Remote', updatedAt: NEW }]) },
      false,
      false,
    );
    expect(out.workouts).toEqual([{ id: 'w1', title: 'Remote', updatedAt: NEW }]);
  });

  it('no parseable stamp on either side keeps local (no ordering info)', () => {
    expect(resolvePullWinner(undefined, undefined)).toBe('local');
    const out = recomputePullSlices(
      freshAll({ workouts: slice([{ id: 'w1', title: 'Local' }]) }),
      { workouts: r([{ id: 'w1', title: 'Remote' }]) },
      false,
      false,
    );
    expect(out.workouts).toBeUndefined();
  });

  it('(g) tombstoned rows are never adopted, even when remote is newer', () => {
    const out = recomputePullSlices(
      freshAll({ workouts: slice([], ['w1']) }),
      { workouts: r([{ id: 'w1', title: 'Remote newer', updatedAt: NEW }]) },
      false,
      false,
    );
    expect(out.workouts).toBeUndefined();
  });

  it('(g) remote-only rows still append and local order is preserved', () => {
    const out = recomputePullSlices(
      freshAll({
        workouts: slice([
          { id: 'w1', title: 'Keep', updatedAt: NEW },
          { id: 'w2', title: 'Keep', updatedAt: NEW },
        ]),
      }),
      {
        workouts: r([
          { id: 'w2', title: 'Remote older', updatedAt: OLD },
          { id: 'w3', title: 'Remote only', updatedAt: NEW },
        ]),
      },
      false,
      false,
    );
    expect(out.workouts).toEqual([
      { id: 'w1', title: 'Keep', updatedAt: NEW },
      { id: 'w2', title: 'Keep', updatedAt: NEW },
      { id: 'w3', title: 'Remote only', updatedAt: NEW },
    ]);
  });

  it('F28 adopt=true branch is unchanged (untouched device still adopts)', () => {
    const out = recomputePullSlices(
      freshAll({ workouts: slice([{ id: 'w1', title: 'Old', updatedAt: NEW }]) }),
      { workouts: r([{ id: 'w1', title: 'Remote', updatedAt: OLD }]) },
      false,
      true,
    );
    // Adopt=true replaces regardless of stamps (signature equality
    // proves no local edit) — the historical F28 behaviour.
    expect(out.workouts).toEqual([{ id: 'w1', title: 'Remote', updatedAt: OLD }]);
  });
});

describe('store edit paths stamp rows (R1/DI-08 inventory)', () => {
  let useStore: any;

  beforeEach(async () => {
    vi.resetModules();
    const memory = new Map<string, string>();
    vi.stubGlobal('window', {
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal('document', {
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, String(v));
      },
      removeItem: (k: string) => {
        memory.delete(k);
      },
      clear: () => memory.clear(),
      get length() {
        return memory.size;
      },
      key: (i: number) => Array.from(memory.keys())[i] ?? null,
    });
    ({ useStore } = await import('../src/lib/store'));
    useStore.getState().clearAllData();
  });

  it('addPR stamps a new PR; updatePR refreshes the stamp', () => {
    const store = useStore.getState();
    store.addPR({
      id: 'pr1',
      exercise: 'Squat',
      weightKg: 100,
      weightLbs: 220,
      reps: 5,
      oneRepMax: 112,
      date: '2026-10-20',
    });
    const added = useStore.getState().prs[0];
    expect(Date.parse(added.updatedAt)).not.toBeNaN();

    useStore.getState().updatePR('pr1', { weightKg: 105 });
    const updated = useStore.getState().prs[0];
    expect(updated.weightKg).toBe(105);
    expect(Date.parse(updated.updatedAt)).not.toBeNaN();
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(added.updatedAt));
  });

  it('addWorkout stamps; updateMeal refreshes; addPlannedWorkout stamps', () => {
    const store = useStore.getState();
    store.addWorkout({
      id: 'w1',
      date: '2026-10-20',
      name: 'Legs',
      exercises: [],
    } as never);
    expect(Date.parse(useStore.getState().workouts[0].updatedAt)).not.toBeNaN();

    store.addMeal({
      id: 'm1',
      date: '2026-10-20',
      name: 'Lunch',
      foods: [],
    });
    const mealBefore = useStore.getState().meals[0].updatedAt;
    expect(Date.parse(mealBefore)).not.toBeNaN();
    useStore.getState().updateMeal('m1', { name: 'Big Lunch' });
    const mealAfter = useStore.getState().meals[0];
    expect(mealAfter.name).toBe('Big Lunch');
    expect(Date.parse(mealAfter.updatedAt)).toBeGreaterThanOrEqual(Date.parse(mealBefore));

    store.addPlannedWorkout({
      id: 'p1',
      name: 'Push Day',
      exercises: [],
      createdAt: new Date().toISOString(),
    });
    expect(Date.parse(useStore.getState().plannedWorkouts[0].updatedAt)).not.toBeNaN();
  });

  it('importAllData stamps imported rows (restore is the newest intent)', () => {
    const ok = useStore.getState().importAllData({
      workouts: [{ id: 'imp-1', date: '2026-10-21', name: 'Imported', exercises: [] }],
      meals: [{ id: 'imp-m1', date: '2026-10-21', name: 'Imported meal', foods: [] }],
    });
    expect(ok).toBe(true);
    expect(Date.parse(useStore.getState().workouts[0].updatedAt)).not.toBeNaN();
    expect(Date.parse(useStore.getState().meals[0].updatedAt)).not.toBeNaN();
  });
});
