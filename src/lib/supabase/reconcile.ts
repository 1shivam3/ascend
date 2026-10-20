/**
 * Deletion reconciliation helpers for Supabase sync.
 *
 * Root cause they address: the sync push path only ever UPSERTS. A locally
 * deleted plan (or PR, workout, meal, body metric) stayed on the server
 * forever, and the pull-merge — which unions remote rows into the local
 * store — resurrected it on the next sync (refresh, re-login, other device).
 *
 * Pure functions so the reconciliation logic is vitest-regressable without
 * a live Supabase client.
 */

/** Remote ids that no longer exist locally — safe to delete server-side. */
export function remoteIdsToDelete(
  localIds: Iterable<string>,
  remoteIds: string[],
): string[] {
  const local = new Set(localIds);
  return remoteIds.filter((id) => !local.has(id));
}

export interface MergeRemotePlansResult<T> {
  merged: T[];
  /** True when at least one remote-only row was added. */
  changed: boolean;
}

/**
 * Union-merge remote plans into the local list, but never resurrect a plan
 * the user deleted: rows whose id is in `tombstonedIds` are skipped.
 */
export function mergeRemotePlans<T extends { id: string }>(
  localPlans: T[],
  remotePlans: T[],
  tombstonedIds: Iterable<string> = [],
): MergeRemotePlansResult<T> {
  const tombstones = new Set(tombstonedIds);
  const localIds = new Set(localPlans.map((p) => p.id));
  const merged = [...localPlans];
  let changed = false;
  for (const r of remotePlans) {
    if (tombstones.has(r.id)) continue;
    if (!localIds.has(r.id)) {
      localIds.add(r.id);
      merged.push(r);
      changed = true;
    }
  }
  return { merged, changed };
}

/**
 * Tombstones that the server has confirmed gone: any tombstoned id that is
 * neither in the local list nor among the remaining remote ids needs no
 * further protection and can be pruned.
 */
export function prunableTombstones(
  tombstonedIds: Iterable<string>,
  localIds: Iterable<string>,
  remoteIds: string[],
): string[] {
  const local = new Set(localIds);
  const remote = new Set(remoteIds);
  const pruned: string[] = [];
  for (const id of tombstonedIds) {
    if (!local.has(id) && !remote.has(id)) pruned.push(id);
  }
  return pruned;
}
