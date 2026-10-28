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

/** Collection slices the pull reconciles. Keys match the store fields. */
export type PullSliceKey =
  | 'prs'
  | 'workouts'
  | 'meals'
  | 'bodyMetrics'
  | 'plannedWorkouts';

export interface PullSliceInput {
  /** Fresh local rows at apply time (NOT the pre-round-trip capture). */
  local: { id: string }[];
  /** Fresh tombstones at apply time. */
  tombstones: Iterable<string>;
}

/**
 * Recompute pulled collection slices against FRESH local state at apply
 * time (audit R2/R5 fix).
 *
 * The pull captures local state BEFORE the network round-trip, then
 * applies `updates` built from that stale capture. Any delete, edit, or
 * add made mid-sync was overwritten by the stale arrays on apply, and the
 * tombstone left behind produced the poisoned local+tombstoned state.
 * This helper re-derives each slice from the state that is current when
 * the apply actually happens:
 *
 * - Merge branch (same account / guest migration): re-run the union
 *   merge from fresh local rows + fresh tombstones. A row deleted
 *   mid-sync is absent from fresh local AND tombstoned, so it stays
 *   deleted; an edit or add made mid-sync survives because fresh local
 *   is the merge base. Slices with no remote-only addition are omitted
 *   (returning them would rewrite identical content with new array
 *   references and fire persist/subscribers for nothing).
 * - Replace branch (cross-account switch): server rows still win, but
 *   rows the user deleted locally (fresh tombstones) are filtered out
 *   instead of resurrected. Server-side cleanup of those rows happens
 *   on the next push, which is unchanged behaviour for this branch.
 *
 * The profile update is deliberately NOT recomputed here — it carries
 * its own last-write-wins logic and is a documented residual (R2b-profile).
 * Pure function: vitest-regressable without a Supabase client.
 *
 * F28 (audit) — adoptRemoteChanges (merge branch ONLY, never replace):
 * when true, a remote row whose id already exists locally REPLACES the
 * local row instead of being skipped. The caller sets this only when
 * the fresh local signature equals the last-pushed signature, i.e. the
 * local copy is unchanged since the last push — so the remote row must
 * be an edit from another device, and adopting it cannot clobber a
 * local edit. This branch is UNCHANGED by R1/DI-08: signature equality
 * already proves there is no local edit to lose.
 *
 * R1/DI-08 — newest-wins (merge branch, adoptRemoteChanges = false):
 * when false, the historical behaviour kept local for every existing
 * row and let the next push overwrite remote (silent last-push-wins).
 * That is replaced by per-row stamp comparison (resolvePullWinner):
 * the newer stamp wins, ties go to remote, a missing local stamp
 * loses to a parseable remote stamp, and rows with no parseable stamp
 * on either side keep local (no ordering information; the push gate
 * still protects the remote copy). Tombstones filter first in every
 * branch: a tombstoned row is never adopted, merged, or resurrected.
 * The F28 signature mechanism itself is untouched — only the
 * conflict branch's decision rule changed.
 */
export function recomputePullSlices<T extends { id: string }>(
  fresh: Record<PullSliceKey, { local: T[]; tombstones: Iterable<string> }>,
  // Remote rows are id-shaped: the caller's mappers produce the local
  // shape, but the merge below only relies on `.id` and reference
  // preservation, so they are cast to T at the two return points.
  remote: Partial<Record<PullSliceKey, { id: string }[]>>,
  isCrossAccountSwitch: boolean,
  adoptRemoteChanges = false,
  getStamp: PullStampReader = defaultPullStampReader,
): Partial<Record<PullSliceKey, T[]>> {
  const slices: Partial<Record<PullSliceKey, T[]>> = {};
  (Object.keys(remote) as PullSliceKey[]).forEach((key) => {
    const remoteRows = remote[key];
    if (!remoteRows) return;
    const { local, tombstones } = fresh[key];
    const tomb = new Set(tombstones);
    if (isCrossAccountSwitch) {
      // Replace semantics, minus locally tombstoned rows.
      slices[key] = remoteRows.filter((r) => !tomb.has(r.id)) as T[];
    } else if (adoptRemoteChanges) {
      // F28 adoption: tombstone-filtered remote rows replace local rows
      // with the same id, and remote-only rows append. Local order is
      // preserved (replacements stay in place); remote-only rows append
      // in remote order. No duplicates, no resurrections. A replacement
      // counts as a change only when its serialized content differs
      // from the local row, so an adopt pass over identical content
      // does not rewrite slices (and fire persist/subscribers) on
      // every sync; key-order differences can still false-positive,
      // which is harmless (same content, new references).
      const localIds = new Set(local.map((row) => row.id));
      const remoteById = new Map(remoteRows.map((r) => [r.id, r as T]));
      let changed = false;
      const merged: T[] = [];
      for (const row of local) {
        const replacement = tomb.has(row.id) ? undefined : remoteById.get(row.id);
        if (replacement !== undefined) {
          merged.push(replacement);
          if (JSON.stringify(replacement) !== JSON.stringify(row)) changed = true;
        } else {
          merged.push(row);
        }
      }
      for (const r of remoteRows) {
        if (tomb.has(r.id)) continue;
        if (!localIds.has(r.id)) {
          merged.push(r as T);
          changed = true;
        }
      }
      if (changed) slices[key] = merged;
    } else {
      // R1/DI-08 newest-wins: for each local row with a remote
      // counterpart, the newer stamp wins (ties → remote, missing
      // local stamp → remote, neither parsing → keep local); remote-
      // only rows append; tombstones filter first. Local order is
      // preserved (replacements stay in place). A replacement counts
      // as a change only when its serialized content differs, same
      // convention as the F28 branch above.
      const localIds = new Set(local.map((row) => row.id));
      const remoteById = new Map(remoteRows.map((r) => [r.id, r as T]));
      let changed = false;
      const merged: T[] = [];
      for (const row of local) {
        const replacement = tomb.has(row.id) ? undefined : remoteById.get(row.id);
        if (replacement !== undefined) {
          const winner = resolvePullWinner(
            getStamp(row as { id: string; updatedAt?: unknown }),
            getStamp(replacement as unknown as { id: string; updatedAt?: unknown }),
          );
          if (winner === 'remote') {
            merged.push(replacement);
            if (JSON.stringify(replacement) !== JSON.stringify(row)) changed = true;
          } else {
            merged.push(row);
          }
        } else {
          merged.push(row);
        }
      }
      for (const r of remoteRows) {
        if (tomb.has(r.id)) continue;
        if (!localIds.has(r.id)) {
          merged.push(r as T);
          changed = true;
        }
      }
      if (changed) slices[key] = merged;
    }
  });
  return slices;
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

/**
 * Gauntlet R1/DI-08 — newest-wins sync, per row, both directions.
 *
 * The old rule was silent last-push-wins: push stamped `updated_at =
 * now` on every row, destroying recency, so any device's push
 * overwrote newer remote rows, and pull kept stale local rows over
 * remote edits (true conflicts). The user chose keep-the-newest
 * instead. These pure helpers are the whole decision surface, so the
 * rule is vitest-pinnable without a Supabase client:
 *
 * - `shouldPushRow`: upsert a row only when it is absent remotely,
 *   or its local stamp parses AND is strictly newer than the remote
 *   stamp. Every other case — remote newer, tie, local missing /
 *   unparseable, remote missing / unparseable — skips the upsert, so
 *   a row with a missing or unparseable local stamp NEVER overwrites
 *   remote (same fail-to-remote direction as isLocalProfileNewer).
 *   Rows absent remotely are safe to upsert: there is nothing to
 *   clobber, and the payload carries the local stamp (or `now` when
 *   the row has none — the next pull then adopts that stamp back).
 * - `resolvePullWinner`: for a row present on both sides with
 *   different content, the strictly-newer stamp wins. Equal parseable
 *   stamps with different content are a TIE and go to REMOTE, so two
 *   devices converge instead of flip-flopping. A missing/unparseable
 *   local stamp loses to a parseable remote stamp (local cannot prove
 *   it is newer). A parseable local stamp beats a missing remote
 *   stamp on pull (keep local) — but the push gate still refuses to
 *   upload it, so a corrupt remote stamp strands the row safely
 *   instead of letting it clobber anything. When NEITHER side parses,
 *   there is no ordering information at all: pull keeps local (the
 *   historical behaviour, which keeps the existing adoption tests
 *   green) and the push gate still protects the remote copy — the
 *   row converges the moment either side is edited and stamped.
 *
 * KNOWN RESIDUALS (not fixed here, by scope):
 * - DI-08.5 clock skew: "newest" is judged by device clocks. Two
 *   devices with skewed clocks can still pick the wrong winner.
 *   Server-side stamping would need a DB migration and is out of
 *   scope for this change.
 * - Deletion boundary: explicit deletions (tombstone propagation)
 *   are NOT gated by stamps — see the push-gate comment in sync.ts.
 *   A newer remote edit can still lose to an older local delete.
 * - No conflict UI: the user chose the rule, not a conflict screen.
 *   The losing side's content is not preserved anywhere.
 */

/** Parse an edit stamp to epoch ms, or null when missing/unparseable. */
export function parseEditStamp(stamp: string | undefined | null): number | null {
  if (!stamp) return null;
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? null : ms;
}

/** Pull-side winner for one row present on both sides. */
export function resolvePullWinner(
  localUpdatedAt: string | undefined | null,
  remoteUpdatedAt: string | undefined | null,
): 'local' | 'remote' {
  const local = parseEditStamp(localUpdatedAt);
  const remote = parseEditStamp(remoteUpdatedAt);
  if (local !== null && remote !== null) {
    // Strictly newer wins; ties go to remote for convergence.
    return local > remote ? 'local' : 'remote';
  }
  if (local === null && remote !== null) return 'remote';
  if (local !== null && remote === null) return 'local';
  // Neither side parses: no ordering information — keep local
  // (historical behaviour); the push gate still protects remote.
  return 'local';
}

/**
 * Push-side gate for one row. `remoteUpdatedAt` is undefined when the
 * row is absent remotely. True only for absent-remote or
 * strictly-newer-local; false for every other case (remote newer,
 * tie, either stamp missing/unparseable).
 */
export function shouldPushRow(
  localUpdatedAt: string | undefined | null,
  remoteUpdatedAt: string | undefined | null,
): boolean {
  if (remoteUpdatedAt === undefined) return true;
  const local = parseEditStamp(localUpdatedAt);
  const remote = parseEditStamp(remoteUpdatedAt);
  if (local === null || remote === null) return false;
  return local > remote;
}

export interface PushGateResult<T> {
  /** Rows the push may upsert (absent remotely, or strictly newer). */
  toUpsert: T[];
  /** Rows present remotely that this device must NOT overwrite. */
  skipped: T[];
}

/**
 * Partition one collection's local rows through the push gate.
 * `remoteStamps` maps remote row id → its `updated_at` (null when the
 * column value is missing); ids absent from the map are absent
 * remotely. Pure function: the push path tests this, not the network.
 */
export function filterRowsForPush<T extends { id: string; updatedAt?: string | null }>(
  rows: T[],
  remoteStamps: ReadonlyMap<string, string | null | undefined> | Record<string, string | null | undefined>,
): PushGateResult<T> {
  const lookup = (id: string): string | null | undefined => {
    if (remoteStamps instanceof Map) return remoteStamps.get(id);
    return (remoteStamps as Record<string, string | null | undefined>)[id];
  };
  const toUpsert: T[] = [];
  const skipped: T[] = [];
  for (const row of rows) {
    const remote = lookup(row.id);
    if (remote === undefined) {
      toUpsert.push(row);
    } else if (shouldPushRow(row.updatedAt, remote)) {
      toUpsert.push(row);
    } else {
      skipped.push(row);
    }
  }
  return { toUpsert, skipped };
}

/** Default stamp reader for pull rows: both local store rows and
 * remote-mapped rows carry `updatedAt` (sync.ts maps `updated_at`
 * into it on pull). Callers may pass their own reader. */
export type PullStampReader = (row: { id: string; updatedAt?: unknown }) => string | undefined | null;

export const defaultPullStampReader: PullStampReader = (row) =>
  typeof row.updatedAt === 'string' ? row.updatedAt : null;

/** Plan fields that have no column on `planned_workouts` (QA4-006). */
export interface PlanExtras {
  description?: string;
  goalTag?: string;
  intensityMode?: 'rpe' | 'percent';
  /** PR-B: coach block that created this plan (grouping label only). */
  coachBlockId?: string;
}

/**
 * Build the `extras` jsonb payload for a plan, or undefined when the plan
 * carries none of the column-less fields (so rows stay clean).
 */
export function buildPlanExtras(plan: {
  description?: string;
  goalTag?: string;
  intensityMode?: 'rpe' | 'percent';
  coachBlockId?: string;
}): PlanExtras | undefined {
  const extras: PlanExtras = {};
  if (typeof plan.description === 'string' && plan.description) extras.description = plan.description;
  if (typeof plan.goalTag === 'string' && plan.goalTag) extras.goalTag = plan.goalTag;
  if (plan.intensityMode === 'rpe' || plan.intensityMode === 'percent') {
    extras.intensityMode = plan.intensityMode;
  }
  if (typeof plan.coachBlockId === 'string' && plan.coachBlockId) {
    extras.coachBlockId = plan.coachBlockId;
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
  if (typeof e.coachBlockId === 'string' && e.coachBlockId) {
    out.coachBlockId = e.coachBlockId;
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
