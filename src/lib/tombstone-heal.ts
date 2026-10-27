/**
 * Poisoned-state heal (audit R4).
 *
 * Invariant: a record id must never be BOTH present locally AND in its
 * deletion tombstone set. That contradiction is only ever produced by a
 * resurrection artifact — the disaster-recovery snapshot import (R1),
 * the legacy-key fallbacks (R1b), a delete landing mid-sync (R2), or a
 * restore — never by a normal delete (which removes the row) or a
 * normal undo (which clears the tombstone). When it occurs, the system
 * is stuck: pull keeps the row (it is local), push upserts it (it is
 * local), propagate refuses to delete it (it is local), and prune
 * refuses to drop the tombstone (it is local).
 *
 * Resolution: deletion wins. The tombstone is an explicit user action;
 * the row's presence is the bug. Drop the row, KEEP the tombstone so
 * the server-side delete still propagates on the next push.
 *
 * Five type parameters (one per slice) so each slice keeps its own
 * record type at the call site — the implementation only relies on
 * `.id` and reference preservation, so the internal casts are sound.
 * Pure function: vitest-regressable without the store.
 */

export type HealSliceKey =
  | 'workouts'
  | 'meals'
  | 'prs'
  | 'bodyMetrics'
  | 'plannedWorkouts';

type TombstoneKey =
  | 'deletedWorkoutIds'
  | 'deletedMealIds'
  | 'deletedPrIds'
  | 'deletedBodyMetricIds'
  | 'deletedPlanIds';

const SLICE_TO_TOMBSTONES: Record<HealSliceKey, TombstoneKey> = {
  workouts: 'deletedWorkoutIds',
  meals: 'deletedMealIds',
  prs: 'deletedPrIds',
  bodyMetrics: 'deletedBodyMetricIds',
  plannedWorkouts: 'deletedPlanIds',
};

export interface HealInput<
  W extends { id: string },
  M extends { id: string },
  P extends { id: string },
  B extends { id: string },
  L extends { id: string },
> {
  workouts: W[];
  meals: M[];
  prs: P[];
  bodyMetrics: B[];
  plannedWorkouts: L[];
  deletedWorkoutIds: Iterable<string>;
  deletedMealIds: Iterable<string>;
  deletedPrIds: Iterable<string>;
  deletedBodyMetricIds: Iterable<string>;
  deletedPlanIds: Iterable<string>;
}

export interface HealResult<
  W extends { id: string },
  M extends { id: string },
  P extends { id: string },
  B extends { id: string },
  L extends { id: string },
> {
  /** Only slices that actually lost rows (others omitted on purpose). */
  slices: Partial<{
    workouts: W[];
    meals: M[];
    prs: P[];
    bodyMetrics: B[];
    plannedWorkouts: L[];
  }>;
  dropped: Record<HealSliceKey, number>;
  droppedTotal: number;
}

export function dropTombstonedRows<
  W extends { id: string },
  M extends { id: string },
  P extends { id: string },
  B extends { id: string },
  L extends { id: string },
>(input: HealInput<W, M, P, B, L>): HealResult<W, M, P, B, L> {
  const slices: Partial<{
    workouts: W[];
    meals: M[];
    prs: P[];
    bodyMetrics: B[];
    plannedWorkouts: L[];
  }> = {};
  const dropped: Record<HealSliceKey, number> = {
    workouts: 0,
    meals: 0,
    prs: 0,
    bodyMetrics: 0,
    plannedWorkouts: 0,
  };
  let droppedTotal = 0;
  (Object.keys(SLICE_TO_TOMBSTONES) as HealSliceKey[]).forEach((slice) => {
    const tomb = new Set(input[SLICE_TO_TOMBSTONES[slice]] || []);
    if (tomb.size === 0) return;
    // Filter preserves element references; the cast only restores the
    // slice's own record type after the id-only operation.
    const rows = (input[slice] || []) as { id: string }[];
    const kept = rows.filter((r) => !tomb.has(r.id));
    if (kept.length !== rows.length) {
      (slices as Record<string, { id: string }[]>)[slice] = kept;
      dropped[slice] = rows.length - kept.length;
      droppedTotal += dropped[slice];
    }
  });
  return { slices, dropped, droppedTotal };
}
