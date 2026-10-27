/**
 * Follower-tab delete guard (history-delete resurrection fix).
 *
 * Root cause: the tab-leader guard (QA4-010) suppresses persist writes
 * in follower tabs, so a workout deleted in a follower tab vanished
 * from memory but never reached storage — after reload the leader's
 * copy came back, behind a success toast. That fake success is the bug.
 *
 * This helper runs BEFORE the workout-delete confirmation acts: if the
 * current tab is a follower, it claims leadership (takeover) and
 * rehydrates the store from disk, so the delete applies to the
 * leader's latest state and then persists as leader. If the tab is
 * already leader (or there is no guard — SSR, single tab), it is a
 * no-op and returns true.
 *
 * Failure is explicit: any takeover/rehydrate failure, or a guard
 * that still suppresses writes afterwards, returns false and the
 * caller MUST NOT delete and MUST NOT show the success toast.
 *
 * Scope: delete/reset paths that must reach storage (workout, meal,
 * PR, plan, and metric deletes; food-item, custom-suggestion, and
 * pinned-food deletes; data-reset and logout-wipe). Other mutations
 * keep the documented follower-banner behavior.
 */

import { getTabLeaderGuard } from './tab-leader';
import { useAppStore } from './store';

export interface DeletePersistGuard {
  shouldSuppressWrites(): boolean;
  takeOver(): void;
}

export interface EnsureDeleteWillPersistDeps {
  getGuard?: () => DeletePersistGuard | null;
  rehydrate?: () => Promise<void> | void;
}

export async function ensureDeleteWillPersist(
  deps: EnsureDeleteWillPersistDeps = {},
): Promise<boolean> {
  const guard = (deps.getGuard ?? getTabLeaderGuard)();
  if (!guard || !guard.shouldSuppressWrites()) return true;

  try {
    guard.takeOver();
    const rehydrate = deps.rehydrate ?? (() => useAppStore.persist.rehydrate());
    await rehydrate();
  } catch {
    return false;
  }

  // A takeover that did not stick must never yield a fake success.
  try {
    if (guard.shouldSuppressWrites()) return false;
  } catch {
    return false;
  }
  return true;
}
