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
 * Union-merge remote records into the local list, but never resurrect a
 * record the user deleted: rows whose id is in `tombstonedIds` are skipped.
 * Generic form of the original plan-only merge — used for plans, PRs,
 * workouts, meals and body metrics (QA4-001).
 */
export function mergeRemoteRecords<T extends { id: string }>(
  localRecords: T[],
  remoteRecords: T[],
  tombstonedIds: Iterable<string> = [],
): MergeRemotePlansResult<T> {
  const tombstones = new Set(tombstonedIds);
  const localIds = new Set(localRecords.map((p) => p.id));
  const merged = [...localRecords];
  let changed = false;
  for (const r of remoteRecords) {
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
 * Union-merge remote plans into the local list, but never resurrect a plan
 * the user deleted: rows whose id is in `tombstonedIds` are skipped.
 */
export function mergeRemotePlans<T extends { id: string }>(
  localPlans: T[],
  remotePlans: T[],
  tombstonedIds: Iterable<string> = [],
): MergeRemotePlansResult<T> {
  return mergeRemoteRecords(localPlans, remotePlans, tombstonedIds);
}

/**
 * Server-side ids that are safe to delete during push: rows that are gone
 * locally AND carry an explicit deletion tombstone. The tombstone check is
 * what makes this fail-safe — a local reset/clear (no tombstones) never
 * wipes the cloud copy.
 */
export function tombstonedIdsToDelete(
  localIds: Iterable<string>,
  remoteIds: string[],
  tombstonedIds: Iterable<string>,
): string[] {
  const tombstones = new Set(tombstonedIds);
  return remoteIdsToDelete(localIds, remoteIds).filter((id) => tombstones.has(id));
}

/**
 * Last-write-wins for the profile (QA4A-001): the local profile is newer
 * than the server row only when BOTH timestamps parse and local is
 * strictly later. Missing/unparseable stamps fail open to the server
 * (the historical behaviour), never to a stale local copy.
 */
export function isLocalProfileNewer(
  localUpdatedAt: string | undefined | null,
  remoteUpdatedAt: string | undefined | null,
): boolean {
  if (!localUpdatedAt || !remoteUpdatedAt) return false;
  const local = Date.parse(localUpdatedAt);
  const remote = Date.parse(remoteUpdatedAt);
  if (Number.isNaN(local) || Number.isNaN(remote)) return false;
  return local > remote;
}

/** Plan fields that have no column on `planned_workouts` (QA4-006). */
export interface PlanExtras {
  description?: string;
  goalTag?: string;
  intensityMode?: 'rpe' | 'percent';
}

/**
 * Build the `extras` jsonb payload for a plan, or undefined when the plan
 * carries none of the column-less fields (so rows stay clean).
 */
export function buildPlanExtras(plan: {
  description?: string;
  goalTag?: string;
  intensityMode?: 'rpe' | 'percent';
}): PlanExtras | undefined {
  const extras: PlanExtras = {};
  if (typeof plan.description === 'string' && plan.description) extras.description = plan.description;
  if (typeof plan.goalTag === 'string' && plan.goalTag) extras.goalTag = plan.goalTag;
  if (plan.intensityMode === 'rpe' || plan.intensityMode === 'percent') {
    extras.intensityMode = plan.intensityMode;
  }
  return Object.keys(extras).length > 0 ? extras : undefined;
}

/**
 * Read a plan's column-less fields back out of a remote row's `extras`
 * payload. Tolerates a missing column (undefined), a null payload, and
 * malformed values — anything unrecognized is dropped, never thrown.
 */
export function planFieldsFromExtras(extras: unknown): PlanExtras {
  if (!extras || typeof extras !== 'object' || Array.isArray(extras)) return {};
  const e = extras as Record<string, unknown>;
  const out: PlanExtras = {};
  if (typeof e.description === 'string' && e.description) out.description = e.description;
  if (typeof e.goalTag === 'string' && e.goalTag) out.goalTag = e.goalTag;
  if (e.intensityMode === 'rpe' || e.intensityMode === 'percent') {
    out.intensityMode = e.intensityMode;
  }
  return out;
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
