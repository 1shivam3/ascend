import { getSupabase } from './client';
import { normalizeDateToLocalDay } from '../formatters';
import { useStore, resolveAvatar, buildFreshHistoryState, PROGRESS_PHOTOS_KEY, stampTombstoneDeletes, clearTombstoneStamps } from '../store';
import { getTabLeaderGuard } from '../tab-leader';
import { UserProfile, PersonalRecord, WorkoutEntry, MealEntry, BodyMetricEntry, PlannedWorkout, MacroGoals } from '../types';
import {
  mergeRemotePlans,
  mergeRemoteRecords,
  dedupeBodyMetricsByDate,
  isLocalProfileNewer,
  buildPlanExtras,
  planFieldsFromExtras,
  recomputePullSlices,
  filterRowsForPush,
  shouldPushRow,
  shouldDropStaleProfileUpdate,
  resolveDeleteVsEdit,
  effectiveTombstones,
  applyRemoteTombstones,
  partitionTombstonesForPush,
  filterOutServerDeleted,
  stampedTombstones,
  tombstoneStampKey,
  type PullSliceKey,
  type StampedTombstone,
  type TombstoneCollection,
} from './reconcile';
import { decideStartFreshGate, isGuestProfileId } from '../start-fresh-guard';
import { classifyIdentity, isCrossAccountProfile } from '../identity';
import { hasRetainedHistory, readArchiveGenerations } from '../history-fork';
import { clearLoggedOutLatch, isLoggedOutLatchSet, markLoggedOut } from '../logged-out-latch';
import { DEFAULT_BODYWEIGHT_KG } from '../defaults';
import { getInitialCoachBlocksState, type CoachBlocksState } from '../block-engine';

/** Page size for sync reads — equal to the PostgREST row cap. */
export const SYNC_READ_PAGE_SIZE = 1000;

/**
 * DI2-1 (audit-3): fetch ALL of one user's rows from a sync table,
 * paging past the 1,000-row PostgREST cap (supabase/config.toml
 * max_rows = 1000) with a stable id order + .range(), mirroring the
 * SEC-09 subscriptions helper (notification-dispatch.ts). The bare
 * .select().eq() reads this replaces silently truncated at 1,000
 * rows, which (a) lost rows on new-device restore, (b) made the push
 * stamp-gate treat past-cap rows as absent (stale local copies could
 * overwrite newer remote edits), and (c) let tombstone pruning clear
 * tombstones whose server rows sat past the cap — resurrecting
 * deleted records on the next pull. There is deliberately NO total
 * cap here: the merge, stamp-gate and tombstone logic are only
 * correct over the complete set.
 *
 * Returns the PostgREST shape ({ data, error }) so call sites keep
 * their existing handling. Client doubles without order/range keep
 * the legacy single-query behaviour (feature-detected, same as
 * fetchAllSubscriptions) — the real client always paginates.
 */
export async function fetchAllUserRowsPaged(
  supabase: any,
  table: string,
  columns: string,
  filterColumn: string,
  filterValue: string,
): Promise<{ data: any[] | null; error: any }> {
  const build = () => supabase.from(table).select(columns).eq(filterColumn, filterValue);
  const probe = build();
  const ordered =
    probe && typeof probe.order === 'function' ? probe.order('id', { ascending: true }) : null;
  if (!ordered || typeof ordered.range !== 'function') {
    const { data, error } = await probe;
    return { data: (data as any[] | null) ?? null, error: error ?? null };
  }
  const rows: any[] = [];
  for (let from = 0; ; from += SYNC_READ_PAGE_SIZE) {
    const { data, error } = await build()
      .order('id', { ascending: true })
      .range(from, from + SYNC_READ_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const page = (data as any[] | null) || [];
    rows.push(...page);
    if (page.length < SYNC_READ_PAGE_SIZE) return { data: rows, error: null };
  }
}

/**
 * Sync convergence S1/S2: the server tombstone layer
 * (public.sync_tombstones, migration 2026110501). One row per
 * deletion: (collection, record_id, deleted_at). The table has no
 * `id` column (its PK is the triple), so it cannot reuse
 * fetchAllUserRowsPaged's `id` ordering — this twin pages by
 * record_id with the same feature-detection posture for client
 * doubles. Rows for unknown collections are dropped defensively.
 * ANY error (including the pre-migration missing-table error) comes
 * back as `error`, and every caller treats that as "layer
 * unavailable" — the pre-convergence behaviour, never a sync failure.
 */
const SYNC_TOMBSTONE_COLLECTIONS: readonly TombstoneCollection[] = [
  'planned_workouts',
  'personal_records',
  'workouts',
  'meals',
  'body_metrics',
];

export interface SyncTombstoneRow {
  collection: TombstoneCollection;
  recordId: string;
  deletedAt: string | null;
}

export async function fetchSyncTombstoneRows(
  supabase: any,
  userId: string,
): Promise<{ data: SyncTombstoneRow[] | null; error: any }> {
  const build = () =>
    supabase
      .from('sync_tombstones')
      .select('collection, record_id, deleted_at')
      .eq('user_id', userId);
  const mapRows = (rows: any[]): SyncTombstoneRow[] =>
    (rows || [])
      .filter(
        (r: any) =>
          r &&
          typeof r.record_id === 'string' &&
          (SYNC_TOMBSTONE_COLLECTIONS as readonly string[]).includes(r.collection),
      )
      .map((r: any) => ({
        collection: r.collection as TombstoneCollection,
        recordId: r.record_id as string,
        deletedAt: typeof r.deleted_at === 'string' ? r.deleted_at : null,
      }));
  const probe = build();
  const ordered =
    probe && typeof probe.order === 'function'
      ? probe.order('record_id', { ascending: true })
      : null;
  if (!ordered || typeof ordered.range !== 'function') {
    const { data, error } = await probe;
    if (error) return { data: null, error };
    return { data: mapRows(data), error: null };
  }
  const rows: any[] = [];
  for (let from = 0; ; from += SYNC_READ_PAGE_SIZE) {
    const { data, error } = await build()
      .order('record_id', { ascending: true })
      .range(from, from + SYNC_READ_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const page = (data as any[] | null) || [];
    rows.push(...page);
    if (page.length < SYNC_READ_PAGE_SIZE) return { data: mapRows(rows), error: null };
  }
}

/**
 * Gauntlet DI-03: the unsynced-slice reset applied on a cross-account
 * switch, as a pure, testable builder. The switch branch's comment
 * promises "Replace local store completely", but only the 6 synced
 * slices were replaced — coach blocks, weekly reviews, water/creatine
 * logs, habits, goals, XP, streak, challenges and friends survived into
 * the next account on the same device. This returns the fresh slate
 * MINUS the synced collections (the caller overwrites those from remote
 * rows) plus the separately-persisted progress photos and the Health
 * Connect timestamp. Device-level preferences (theme, language,
 * density, today layout, notification prefs, ui prefs) are deliberately
 * NOT reset: they belong to the device, not the account.
 */
export function buildCrossAccountResetUpdates(): Record<string, unknown> {
  const fresh = buildFreshHistoryState() as Record<string, unknown>;
  const { prs: _prs, workouts: _workouts, meals: _meals, bodyMetrics: _bodyMetrics, plannedWorkouts: _plannedWorkouts, ...unsynced } = fresh;
  return {
    ...unsynced,
    progressPhotos: [],
    healthConnectLastSyncedAt: null,
  };
}

/** Map a `planned_workouts` row to a local plan, restoring the
 *  column-less fields (description / goalTag / intensityMode) from the
 *  row's `extras` jsonb when present (QA4-006). Rows from a database
 *  without the extras column simply have no `extras` key. */
function planFromRemoteRow(r: any): PlannedWorkout {
  return {
    id: r.id,
    name: r.name,
    exercises: r.exercises || [],
    createdAt: r.created_at || new Date().toISOString(),
    // R1/DI-08: carry the server stamp into the local row so
    // newest-wins comparisons work on the next sync.
    ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
    ...planFieldsFromExtras(r.extras),
  };
}

/**
 * Gauntlet DI-02: body-metric measurement columns. The local entry
 * carries bodyFatPct / chestIn / waistIn / hipsIn and CSV export
 * includes them, but the sync push/pull field lists dropped them and
 * the table has no such columns — so measurements tracked on one
 * device vanished on the next. The push mapping carries the fields;
 * the pull mapping restores them when present and tolerates their
 * absence pre-migration (select * simply omits missing columns).
 * The push retry (see pushLocalData) strips them on a missing-column
 * error, so this code is safe to ship before the 2026102801 migration
 * is applied — and starts syncing measurements the moment it is.
 */
export function bodyMetricRowForPush(b: BodyMetricEntry, userId: string): Record<string, unknown> {
  return {
    id: b.id,
    user_id: userId,
    date: b.date,
    weight_kg: b.weightKg,
    height_cm: b.heightCm || null,
    body_fat_pct: b.bodyFatPct ?? null,
    chest_in: b.chestIn ?? null,
    waist_in: b.waistIn ?? null,
    hips_in: b.hipsIn ?? null,
    notes: b.notes || null,
    // R1/DI-08: carry the row's own last-edit stamp up — stamping
    // `now` here used to make every push look newest and overwrite
    // newer remote rows. Rows without a stamp still get `now` (the
    // push gate only upserts those when they are absent remotely,
    // where there is nothing to clobber).
    updated_at: b.updatedAt || new Date().toISOString(),
  };
}

export function bodyMetricFromRemoteRow(r: any): BodyMetricEntry {
  return {
    id: r.id,
    date: r.date,
    weightKg: Number(r.weight_kg),
    heightCm: r.height_cm ? Number(r.height_cm) : undefined,
    bodyFatPct: r.body_fat_pct != null ? Number(r.body_fat_pct) : undefined,
    chestIn: r.chest_in != null ? Number(r.chest_in) : undefined,
    waistIn: r.waist_in != null ? Number(r.waist_in) : undefined,
    hipsIn: r.hips_in != null ? Number(r.hips_in) : undefined,
    notes: r.notes || undefined,
    // R1/DI-08: carry the server stamp into the local row.
    ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
  };
}

/** The remote body_metrics fields the push plan needs (D-Q2-1). */
export interface RemoteBodyMetricRow {
  id: string;
  date: string;
  updated_at?: string | null;
}

export interface BodyMetricPushPlan {
  /** Upsert keyed on `id` — no foreign row holds these dates. */
  idUpserts: BodyMetricEntry[];
  /**
   * Upsert keyed on `(user_id, date)` — atomically replaces the
   * foreign row holding the date, in one statement.
   */
  dateUpserts: BodyMetricEntry[];
  /**
   * Rows the push must not touch this cycle: the remote side holds
   * the date with an equal-or-newer stamp, or the row's identity is
   * tangled (its id also exists remotely under another date) and
   * only the pull merge can resolve it.
   */
  skipped: BodyMetricEntry[];
}

/**
 * D-Q2-1: plan one body-metrics push against the remote rows.
 *
 * body_metrics has a UNIQUE(user_id, date) constraint, but the push
 * gate historically compared rows by id only. A local metric whose
 * date is already held server-side under a DIFFERENT id (the classic
 * case: this device superseded a pulled row locally, or two devices
 * logged the same day) passed the id gate as "absent remotely" and
 * its upsert 409'd on body_metrics_user_date_unique — every cycle,
 * forever, holding the whole sync in the error state.
 *
 * The plan extends the R1/DI-08 stamp discipline from ids to dates:
 * per date, the newest-stamped contender wins, judged by
 * shouldPushRow exactly like the id gate.
 * - No foreign holder for the date → the classic id gate decides.
 * - A foreign row holds the date and the local row is strictly
 *   newer → upsert on the (user_id, date) conflict target: Postgres
 *   rewrites the holder row into ours in a single statement, so the
 *   date is never left empty and can never 409.
 * - The foreign row is equal-or-newer (or either stamp is
 *   unparseable) → skip; the pull adopts the remote row and the
 *   local dedupe supersedes ours.
 * - Our id ALSO exists remotely under a different date (a date edit
 *   raced a same-date create) → skip: rewriting either row could
 *   collide with the other; the pull merge + dedupe untangles
 *   identity first, then a later push proceeds cleanly.
 *
 * Pure function — the push path and the tests both consume it.
 */
export function planBodyMetricPush(
  localRows: BodyMetricEntry[],
  remoteRows: RemoteBodyMetricRow[],
): BodyMetricPushPlan {
  const remoteById = new Map(remoteRows.map((r) => [r.id, r]));
  const remoteByDate = new Map(remoteRows.map((r) => [r.date, r]));
  const idUpserts: BodyMetricEntry[] = [];
  const dateUpserts: BodyMetricEntry[] = [];
  const skipped: BodyMetricEntry[] = [];
  for (const row of localRows) {
    const partner = remoteByDate.get(row.date);
    if (partner && partner.id !== row.id) {
      if (remoteById.has(row.id)) {
        skipped.push(row);
      } else if (shouldPushRow(row.updatedAt, partner.updated_at)) {
        dateUpserts.push(row);
      } else {
        skipped.push(row);
      }
      continue;
    }
    const remote = remoteById.get(row.id);
    if (remote === undefined || shouldPushRow(row.updatedAt, remote.updated_at)) {
      idUpserts.push(row);
    } else {
      skipped.push(row);
    }
  }
  return { idUpserts, dateUpserts, skipped };
}

/**
 * F-11 (Build-my-block audit): coach block state sync.
 *
 * The coach_blocks table (schema.sql §16; migration
 * 2026102701_add_coach_tables_and_plan_extras.sql) is a per-user
 * JSONB document: one row per user, id = the user's id (the profiles
 * pattern), the whole CoachBlocksState in `payload`. Before F-11 the
 * client never read or wrote it, so the active block, a pending
 * proposal and the progression schemes lived only in local
 * persistence — a device switch silently lost the block even though
 * its plans synced.
 */
export function coachBlocksRowForPush(
  state: CoachBlocksState,
  userId: string,
): Record<string, unknown> {
  return {
    id: userId,
    user_id: userId,
    payload: state,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Parse a remote payload back into a CoachBlocksState, field by
 * field against the initial state, so a malformed or older payload
 * can never produce a half-shaped slice. Returns null when the
 * payload is not an object at all.
 */
export function coachBlocksStateFromPayload(payload: unknown): CoachBlocksState | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const p = payload as Partial<CoachBlocksState>;
  const initial = getInitialCoachBlocksState();
  return {
    pendingProposal: p.pendingProposal ?? initial.pendingProposal,
    activeBlock: p.activeBlock ?? initial.activeBlock,
    pastBlocks: Array.isArray(p.pastBlocks) ? p.pastBlocks : initial.pastBlocks,
    adoptedPlans:
      p.adoptedPlans && typeof p.adoptedPlans === 'object' && !Array.isArray(p.adoptedPlans)
        ? p.adoptedPlans
        : initial.adoptedPlans,
    plateauProposals: Array.isArray(p.plateauProposals)
      ? p.plateauProposals
      : initial.plateauProposals,
  };
}

/** True when there is nothing worth syncing or adopting. */
export function isCoachBlocksStateEmpty(
  state: CoachBlocksState | null | undefined,
): boolean {
  if (!state) return true;
  return (
    !state.activeBlock &&
    !state.pendingProposal &&
    (state.pastBlocks?.length ?? 0) === 0 &&
    (state.plateauProposals?.length ?? 0) === 0 &&
    Object.keys(state.adoptedPlans ?? {}).length === 0
  );
}

/**
 * Adoption decision for the singleton coach-blocks row:
 *  - no usable remote state -> never adopt;
 *  - cross-account switch -> adopt (the reset already zeroed local;
 *    the row is the NEW account's own state);
 *  - same account -> adopt only into an EMPTY local state (the
 *    fresh-device recovery case F-11 exists for). When both sides
 *    have a block, the local one wins and the push below overwrites
 *    the row — the local state carries no updated_at stamp, so
 *    content-level last-sync-wins is the honest rule here.
 */
export function shouldAdoptCoachBlocks(args: {
  isCrossAccountSwitch: boolean;
  local: CoachBlocksState | null | undefined;
  remote: CoachBlocksState | null;
}): boolean {
  const { isCrossAccountSwitch, local, remote } = args;
  if (!remote || isCoachBlocksStateEmpty(remote)) return false;
  if (isCrossAccountSwitch) return true;
  return isCoachBlocksStateEmpty(local);
}

/**
 * S3 (sync convergence): stamp-gated coach-blocks adoption.
 *
 * shouldAdoptCoachBlocks above never adopts when both sides are
 * non-empty, so two devices with a block each diverged silently —
 * whichever pushed last won the row, and the other device never
 * learned. The gate below keeps the F-11 cases (no remote → keep;
 * cross-account → adopt; empty local → adopt) and adds ordering for
 * the both-non-empty case, driven by a small persisted baseline:
 *
 * CoachBlocksSyncMeta records, as of the last settled sync, the
 * local state's signature, the remote row's updated_at, and when
 * the local state last diverged from that signature (maintained by
 * the engine's store subscription). With a baseline:
 *  - local unchanged → adopt iff the remote stamp moved;
 *  - remote unchanged → keep local (the push carries it up);
 *  - both changed → the newer stamp wins; a tie, or a remote stamp
 *    at least as new as the local edit, adopts (devices converge on
 *    the server copy instead of flip-flopping). An untimed local
 *    divergence is NEVER adopted over — keep local is the safe side.
 * With NO baseline (first sync after this ships) both-non-empty
 * keeps local — exactly the pre-S3 behaviour — and the baseline is
 * seeded from that settled state, so later divergence is gated.
 */
export interface CoachBlocksSyncMeta {
  /** Signature of the local coach-blocks state at the last settled sync. */
  sig: string;
  /** The remote row's updated_at at the last settled sync (null = no row seen). */
  remoteStamp: string | null;
  /** When the local state last diverged from `sig` (ISO), null while it matches. */
  localEditedAt: string | null;
}

export const COACH_BLOCKS_SYNC_META_KEY = 'ascend_coach_blocks_sync_meta';

/** Content signature for the singleton state (JSON, key order is stable for store-produced states). */
export function coachBlocksSignature(state: CoachBlocksState | null | undefined): string {
  return JSON.stringify(state ?? null);
}

export function readCoachBlocksSyncMeta(): CoachBlocksSyncMeta | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(COACH_BLOCKS_SYNC_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CoachBlocksSyncMeta>;
    if (typeof parsed.sig !== 'string') return null;
    return {
      sig: parsed.sig,
      remoteStamp: typeof parsed.remoteStamp === 'string' ? parsed.remoteStamp : null,
      localEditedAt: typeof parsed.localEditedAt === 'string' ? parsed.localEditedAt : null,
    };
  } catch {
    return null;
  }
}

export function writeCoachBlocksSyncMeta(meta: CoachBlocksSyncMeta): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(COACH_BLOCKS_SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    // Best-effort — a missing baseline fails safe to keep-local.
  }
}

export function decideCoachBlocksSync(args: {
  isCrossAccountSwitch: boolean;
  local: CoachBlocksState | null | undefined;
  remote: CoachBlocksState | null;
  remoteUpdatedAt: string | null;
  localSignature: string;
  meta: CoachBlocksSyncMeta | null;
}): 'adopt' | 'keep-local' {
  const { isCrossAccountSwitch, local, remote, remoteUpdatedAt, localSignature, meta } = args;
  if (!remote || isCoachBlocksStateEmpty(remote)) return 'keep-local';
  if (isCrossAccountSwitch) return 'adopt';
  if (isCoachBlocksStateEmpty(local)) return 'adopt';
  if (!meta) return 'keep-local';
  const localChanged = localSignature !== meta.sig;
  const remoteChanged = remoteUpdatedAt !== meta.remoteStamp;
  if (!localChanged) return remoteChanged ? 'adopt' : 'keep-local';
  if (!remoteChanged) return 'keep-local';
  const localMs = meta.localEditedAt ? Date.parse(meta.localEditedAt) : NaN;
  const remoteMs = remoteUpdatedAt ? Date.parse(remoteUpdatedAt) : NaN;
  if (!Number.isNaN(localMs) && !Number.isNaN(remoteMs)) {
    return remoteMs >= localMs ? 'adopt' : 'keep-local';
  }
  return 'keep-local';
}

/**
 * S4 (sync convergence): OAuth / email-OTP sign-ins route through
 * the SAME merge choice as the Phase 1 email/password login
 * (Task 1.4). Those flows complete inside onAuthStateChange /
 * verifyEmailOtp, which used to call triggerSyncNow unconditionally
 * — silently merging this device's guest data into the account.
 *
 * Mechanism: the entry points that START such a flow
 * (signInWithGoogle, signInWithApple, sendEmailOtp) persist a
 * short-lived intent flag. When a sync begins with a fresh flag,
 * the engine evaluates the gate below: pause only when the device
 * holds guest data AND the account holds cloud data AND this exact
 * (user, device-data) pair has not already resolved a choice.
 * While paused, NO sync runs (and pushLocalData refuses to run, so
 * the debounced push path cannot slip a silent merge past the
 * pause); the app shows the merge choice (MergeChoiceModal — same
 * strings and semantics as AuthModal's Task 1.4 view).
 * resolveMergeChoice runs the chosen path and records the
 * resolution. One-sided cases proceed exactly as before, and the
 * evaluation is remembered for the intent's lifetime so the cloud
 * probe runs at most once per sign-in.
 */
export const SIGN_IN_INTENT_KEY = 'ascend_signin_intent';
export const MERGE_CHOICE_RESOLVED_KEY = 'ascend_merge_choice_resolved';
export const SIGN_IN_INTENT_MAX_AGE_MS = 60 * 60 * 1000;

export function writeSignInIntent(): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SIGN_IN_INTENT_KEY, JSON.stringify({ at: Date.now() }));
  } catch {
    // Best-effort — no flag means no gate (pre-S4 behaviour).
  }
}

export function readSignInIntentAt(): number | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(SIGN_IN_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: unknown };
    return typeof parsed.at === 'number' && Number.isFinite(parsed.at) ? parsed.at : null;
  } catch {
    return null;
  }
}

export function clearSignInIntent(): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(SIGN_IN_INTENT_KEY);
  } catch {
    // Best-effort.
  }
}

/**
 * Which device data a merge-choice resolution applies to: a CONTENT
 * signature of the five synced collections (Phase 1.3, §4). The
 * original version joined sorted row ids only, so editing a workout
 * after resolving the choice left the resolution in force for data
 * the user never saw when they chose. Rows are sorted by id before
 * hashing so the signature is order-stable; any value edit changes
 * it (collectionSignature: length + FNV-1a of the serialized rows +
 * id-set hash). A resolution recorded under the old ids-only format
 * simply never matches — the choice is offered once more after the
 * upgrade, the fail-safe direction.
 */
export function mergeChoiceDataSignature(input: {
  workouts?: { id: string }[];
  meals?: { id: string }[];
  plannedWorkouts?: { id: string }[];
  prs?: { id: string }[];
  bodyMetrics?: { id: string }[];
}): string {
  const sig = (rows?: { id: string }[]) =>
    collectionSignature(
      [...(rows || [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    );
  return [
    sig(input.workouts),
    sig(input.meals),
    sig(input.plannedWorkouts),
    sig(input.prs),
    sig(input.bodyMetrics),
  ].join('|');
}

export function readMergeChoiceResolved(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(MERGE_CHOICE_RESOLVED_KEY);
  } catch {
    return null;
  }
}

export function writeMergeChoiceResolved(userId: string, dataSignature: string): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(MERGE_CHOICE_RESOLVED_KEY, `${userId}:${dataSignature}`);
  } catch {
    // Best-effort — worst case the choice is offered once more.
  }
}

/**
 * The PENDING merge choice, persisted (Phase 1.3, §4). The original
 * pending state lived only in an engine field, so a page reload while
 * the merge modal was up let the next sync silently merge the guest
 * data — the exact outcome the gate exists to prevent. The record is
 * keyed by (userId, dataSignature): it restores only for the same
 * user over the same data; a record whose data moved underneath it
 * is stale and discarded (the gate then re-evaluates fresh).
 */
export const MERGE_CHOICE_PENDING_KEY = 'ascend_merge_choice_pending';

export interface PendingMergeChoice {
  userId: string;
  dataSignature: string;
}

export function writePendingMergeChoice(userId: string, dataSignature: string): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(
      MERGE_CHOICE_PENDING_KEY,
      JSON.stringify({ userId, dataSignature, at: Date.now() }),
    );
  } catch {
    // Best-effort — worst case a reload re-evaluates the gate fresh.
  }
}

export function readPendingMergeChoice(): PendingMergeChoice | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(MERGE_CHOICE_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: unknown; dataSignature?: unknown };
    if (typeof parsed.userId !== 'string' || typeof parsed.dataSignature !== 'string') {
      return null;
    }
    return { userId: parsed.userId, dataSignature: parsed.dataSignature };
  } catch {
    return null;
  }
}

export function clearPendingMergeChoice(): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(MERGE_CHOICE_PENDING_KEY);
  } catch {
    // Best-effort.
  }
}

/**
 * The S4 gate verdict. Pure, in the style of decideCoachBlocksSync:
 * every input is passed in, so the whole matrix is unit-testable.
 * 'gate' requires ALL of: a fresh intent, a non-anonymous user,
 * local guest data, cloud data, no matching resolution, and a
 * device profile that is a guest profile (or none) — a profile
 * belonging to a DIFFERENT account follows cross-account replace
 * semantics instead, and an already-linked profile is not a guest.
 */
export function evaluateSignInMergeGate(args: {
  intentAt: number | null;
  now: number;
  isAnonymous: boolean;
  profileId: string | null | undefined;
  userId: string;
  localHasData: boolean;
  cloudHasData: boolean;
  resolvedMarker: string | null;
  dataSignature: string;
}): 'gate' | 'proceed' {
  if (args.isAnonymous) return 'proceed';
  if (args.intentAt === null) return 'proceed';
  if (args.now < args.intentAt || args.now - args.intentAt > SIGN_IN_INTENT_MAX_AGE_MS) {
    return 'proceed';
  }
  if (args.resolvedMarker === `${args.userId}:${args.dataSignature}`) return 'proceed';
  // A profile already linked to THIS account means the device data
  // is the account's own — a normal sync, nothing to choose.
  if (args.profileId && args.profileId === args.userId) return 'proceed';
  if (args.profileId && !isGuestProfileId(args.profileId)) {
    // A different account's profile — cross-account replace semantics.
    return 'proceed';
  }
  return args.localHasData && args.cloudHasData ? 'gate' : 'proceed';
}

/**
 * The coach tables exist only after the §16 migration is applied to
 * a deployment; until then PostgREST answers with a table-not-found
 * error. Tolerate exactly that (the DI-02 ship-before-migration
 * pattern — the state simply stays local-only, as before F-11);
 * every other error is real and recorded.
 */
export function isMissingCoachBlocksTable(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  const msg = error.message || '';
  return /could not find the table/i.test(msg) || /relation .* does not exist/i.test(msg);
}

/**
 * Task 2.2: verdict for the accountHasCloudData probe (Task 1.4's
 * merge choice). Pure + exported so the decision is unit-testable
 * without a Supabase client, in the style of shouldAdoptCoachBlocks.
 *
 * - 'has-data': at least one probed table returned a row.
 * - 'no-data': every probe answered cleanly and found nothing.
 * - 'unknown': a CORE table's query errored. The caller must treat
 *   this as "offer the merge choice" (fail-closed): the pre-2.2 probe
 *   read any failure as "no cloud data" and silently merged, which
 *   could bury account data the probe simply failed to see.
 * A response flagged `tolerateError` (the optional coach_blocks
 * table, which may not exist on a deployment — same posture as its
 * pull path) never makes the verdict 'unknown'.
 */
export interface CloudDataProbeResponse {
  data: unknown;
  error: unknown;
  tolerateError?: boolean;
}

export function resolveCloudDataProbe(
  responses: CloudDataProbeResponse[],
): 'has-data' | 'no-data' | 'unknown' {
  let sawRow = false;
  for (const r of responses) {
    if (r.error) {
      if (!r.tolerateError) return 'unknown';
      continue;
    }
    if (Array.isArray(r.data) ? r.data.length > 0 : r.data != null) sawRow = true;
  }
  return sawRow ? 'has-data' : 'no-data';
}

export type SyncStatus = 'unconfigured' | 'offline' | 'idle' | 'syncing' | 'synced' | 'error';

/**
 * QA-hardening R6: sync failures are classified so the UI can speak
 * plainly instead of showing one generic "Sync failed" (or worse, a
 * raw PostgREST message). Classes: 'offline' (no connectivity /
 * network-level failure), 'auth' (session expired / rejected —
 * retrying cannot heal it; the user must sign in again), 'server'
 * (5xx, timeouts, and everything else — safe to retry with backoff).
 */
export type SyncErrorKind = 'offline' | 'auth' | 'server';

export function classifySyncError(err: unknown): SyncErrorKind {
  const e: any = err as any;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  // pushLocalData wraps the first transport error (see its throw);
  // classify by the original error when one is attached.
  const inner: any = e?.cause ?? e;
  const msg = String(inner?.message ?? inner ?? '');
  if (inner instanceof TypeError || /failed to fetch|networkerror|network request failed|load failed|err_internet|err_network|connection.*(refused|reset)/i.test(msg)) {
    return 'offline';
  }
  const status = typeof inner?.status === 'number' ? inner.status : undefined;
  if (status === 401 || inner?.code === 'PGRST301' || inner?.code === 'PGRST302') return 'auth';
  if (/jwt|invalid.*token|token.*(expired|invalid)|unauthori[sz]ed|not authenticated|session.*expired|refresh[_ ]token/i.test(msg)) {
    return 'auth';
  }
  return 'server';
}

/** QA-hardening R6: exponential backoff for automatic sync retries. */
export function syncRetryDelayMs(attempt: number): number {
  return Math.min(15_000 * 2 ** Math.max(0, attempt), 300_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-row push quarantine (deep-test defect 2 / report D1, 2026-11-08).
//
// pushLocalData used to record the FIRST upsert error and throw after
// attempting all steps (finding F29), so ONE permanently-rejected row
// failed every cycle and held the red "Backup hit a server problem"
// banner up forever — while everything else actually synced. A row the
// server will reject identically forever (constraint violation, invalid
// value shape, RLS denial) can never heal by retrying,
// so it is quarantined: excluded from future pushes, recorded here with
// its error class, and surfaced in Settings in plain words. The cycle then
// completes as 'synced' for everything else. (Phase 1.7: unknown-column
// SCHEMA errors are table-level, not per-row — see SCHEMA_PUSH_ERROR_CODES;
// they fail the cycle instead of quarantining.)
//
// TRANSIENT failures (network, 5xx, timeouts, stamp-fetch failures) are
// NOT quarantined — they keep the classic whole-cycle error state + R6
// backoff. The permanent/transient line is the error's code: Postgres
// SQLSTATEs for constraint/value errors and PostgREST schema errors are
// deterministic properties of the row; everything else is retried.
//
// Release rules: a quarantined row is retried once its local updatedAt
// stamp changes (the user edited it — possibly fixing the problem); it
// is pruned when the row is deleted locally (the tombstone flow owns
// the server copy); a successful push clears it.
// ─────────────────────────────────────────────────────────────────────────────

export const SYNC_QUARANTINE_KEY = 'ascend_sync_quarantine_v1';

export type SyncQuarantineCollection =
  | 'personal_records'
  | 'workouts'
  | 'meals'
  | 'body_metrics'
  | 'planned_workouts';

export interface QuarantinedSyncRow {
  collection: SyncQuarantineCollection;
  rowId: string;
  /**
   * The pushed payload's updated_at at quarantine time — the release
   * trigger (Phase 1.7: read from the payload, not a local-row
   * lookup, so it is the stamp the server actually rejected).
   */
  stamp: string | null;
  code: string | null;
  /**
   * Stable error class (Phase 1.7) — NEVER the raw server message:
   * server text carries table/constraint details and does not belong
   * in persisted local state or the Settings UI.
   */
  errorClass: string;
  quarantinedAt: string;
}

const PERMANENT_ROW_ERROR_CODES = new Set([
  '23505', // unique_violation
  '23503', // foreign_key_violation
  '23502', // not_null_violation
  '23514', // check_violation
  '22007', // invalid_datetime_format
  '22008', // datetime_field_overflow
  '22003', // numeric_value_out_of_range
  '22P02', // invalid_text_representation
  '42501', // insufficient_privilege (RLS denial — deterministic per row)
]);

/**
 * Table-level schema errors (Phase 1.7, §7): a missing column means
 * the DEPLOYMENT predates a migration — every row fails identically,
 * and quarantining them would bury healthy rows until each is edited
 * by hand. These are never quarantined: the cycle fails as a whole
 * (classic F29 error + backoff) and retries after the migration. The
 * bare-variant retry in pushRowBatch still handles the known cases
 * before this classification is consulted.
 */
const SCHEMA_PUSH_ERROR_CODES = new Set([
  '42703', // undefined_column
  'PGRST204', // PostgREST schema cache: column not found
]);

/** True when `err` is a deterministic per-row rejection (see above). */
export function isPermanentRowError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && PERMANENT_ROW_ERROR_CODES.has(code);
}

/** True when `err` is a table-level schema error (never quarantined). */
export function isSchemaPushError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && SCHEMA_PUSH_ERROR_CODES.has(code);
}

const ROW_ERROR_CLASSES: Record<string, string> = {
  '23505': 'unique_violation',
  '23503': 'foreign_key_violation',
  '23502': 'not_null_violation',
  '23514': 'check_violation',
  '22007': 'invalid_datetime',
  '22008': 'datetime_overflow',
  '22003': 'numeric_out_of_range',
  '22P02': 'invalid_text_representation',
  '42501': 'permission_denied',
};

/** Stable, persistable label for a push error — never the raw message. */
export function syncErrorClass(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return (typeof code === 'string' && ROW_ERROR_CLASSES[code]) || 'unknown_error';
}

/**
 * The DI-02 missing-column signature: a deploy that predates a column
 * migration gets PGRST204 / 42703 "column ... does not exist" from
 * PostgREST. Used to trigger the bare-payload retry (and classify the
 * 42703 case before quarantine can claim it).
 */
export function isMissingColumnError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  const msg = typeof e?.message === 'string' ? e.message : '';
  return (
    e?.code === 'PGRST204' ||
    e?.code === '42703' ||
    /column .* does not exist/i.test(msg) ||
    /could not find the .* column/i.test(msg)
  );
}

function readSyncQuarantineMap(): Record<string, QuarantinedSyncRow[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SYNC_QUARANTINE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, QuarantinedSyncRow[]>) : {};
  } catch {
    return {};
  }
}

function writeSyncQuarantineMap(map: Record<string, QuarantinedSyncRow[]>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SYNC_QUARANTINE_KEY, JSON.stringify(map));
  } catch {
    /* storage full/blocked — quarantine degrades to in-cycle only */
  }
}

const SYNC_QUARANTINE_COLLECTIONS: readonly SyncQuarantineCollection[] = [
  'personal_records',
  'workouts',
  'meals',
  'body_metrics',
  'planned_workouts',
];

/**
 * Validate + normalize one stored entry (Phase 1.7). The collection
 * must be a member of the union and every field must carry its
 * declared type — anything else is dropped (it cannot be acted on
 * safely). Legacy entries (PR #126 shape) hold a raw server `message`
 * and no errorClass: they normalize to errorClass 'unknown_error'
 * and the raw text is discarded, never carried forward.
 */
function normalizeQuarantineEntry(e: unknown): QuarantinedSyncRow | null {
  if (!e || typeof e !== 'object') return null;
  const o = e as Record<string, unknown>;
  if (typeof o.rowId !== 'string' || o.rowId.length === 0) return null;
  if (
    typeof o.collection !== 'string' ||
    !SYNC_QUARANTINE_COLLECTIONS.includes(o.collection as SyncQuarantineCollection)
  ) {
    return null;
  }
  if (o.stamp !== null && typeof o.stamp !== 'string') return null;
  if (o.code !== null && typeof o.code !== 'string') return null;
  if (typeof o.quarantinedAt !== 'string') return null;
  return {
    collection: o.collection as SyncQuarantineCollection,
    rowId: o.rowId,
    stamp: o.stamp as string | null,
    code: o.code as string | null,
    errorClass: typeof o.errorClass === 'string' ? o.errorClass : 'unknown_error',
    quarantinedAt: o.quarantinedAt,
  };
}

export function readSyncQuarantine(userId: string): QuarantinedSyncRow[] {
  const entries = readSyncQuarantineMap()[userId];
  if (!Array.isArray(entries)) return [];
  return entries
    .map(normalizeQuarantineEntry)
    .filter((e): e is QuarantinedSyncRow => e !== null);
}

export function quarantineSyncRow(userId: string, entry: QuarantinedSyncRow): void {
  const map = readSyncQuarantineMap();
  const list = readSyncQuarantine(userId).filter((e) => !(e.collection === entry.collection && e.rowId === entry.rowId));
  list.push(entry);
  map[userId] = list;
  writeSyncQuarantineMap(map);
}

export function releaseSyncQuarantine(userId: string, collection: SyncQuarantineCollection, rowIds: string[]): void {
  if (rowIds.length === 0) return;
  const ids = new Set(rowIds);
  const map = readSyncQuarantineMap();
  const list = readSyncQuarantine(userId);
  const kept = list.filter((e) => !(e.collection === collection && ids.has(e.rowId)));
  if (kept.length === list.length) return;
  map[userId] = kept;
  writeSyncQuarantineMap(map);
}

/** Drop entries whose local row no longer exists (deleted → tombstone flow owns it). */
export function pruneSyncQuarantine(userId: string, collection: SyncQuarantineCollection, liveRowIds: Set<string>): void {
  const map = readSyncQuarantineMap();
  const list = readSyncQuarantine(userId);
  const kept = list.filter((e) => e.collection !== collection || liveRowIds.has(e.rowId));
  if (kept.length === list.length) return;
  map[userId] = kept;
  writeSyncQuarantineMap(map);
}

// ─────────────────────────────────────────────────────────────────────────────
// Defect 3 (report D-F1, 2026-11-08): macro goals lost on
// sign-out → sign-in.
//
// Mechanism: macro goals live ONLY in the local store — no server
// table/column holds them (pushLocalData syncs the profile's athlete
// `goals`, never calories/macros). The keep-data logout ARCHIVES the
// live state (buildFullBackup shape — macroGoals included) under
// ARCHIVED_HISTORY_KEY, then resets live state via
// buildFreshHistoryState(), which sets macroGoals: null. The sign-in
// pull rebuilds the synced collections from the server but has no
// macro-goal source, and the archive was only ever applied by the
// manual Settings "Restore archived history" — so the goals stayed
// null and Today silently substituted a profile-derived estimate.
//
// Fix (client-side, no migration): on sign-in, when the user has no
// macro goals locally and none were pulled, re-apply the goals from
// that same logout archive. The archive's profile id must match the
// signing-in user — on a shared device, another account's goals must
// never leak in. Cross-device restore remains impossible without a
// server column; that migration is proposed in the PR, not run.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract macro goals from a logout archive (full-backup shape) for
 * `userId`. Returns null unless the archive belongs to that user and
 * carries a well-formed goals object.
 */
export function macroGoalsFromArchive(archive: unknown, userId: string): MacroGoals | null {
  if (!archive || typeof archive !== 'object') return null;
  const a = archive as { profile?: { id?: unknown } | null; macroGoals?: unknown };
  if (!a.profile || a.profile.id !== userId) return null;
  const g = a.macroGoals as { calories?: unknown; proteinG?: unknown } | null;
  if (!g || typeof g !== 'object') return null;
  if (typeof g.calories !== 'number' || !Number.isFinite(g.calories)) return null;
  if (typeof g.proteinG !== 'number' || !Number.isFinite(g.proteinG)) return null;
  return g as MacroGoals;
}




export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  provider?: string;
  isAnonymous: boolean;
}

export function extractUserName(user: any): string | undefined {
  if (!user) return undefined;

  // 1. Check user_metadata fields
  const meta = user.user_metadata || {};
  if (typeof meta.full_name === 'string' && meta.full_name.trim()) {
    return meta.full_name.trim();
  }
  if (typeof meta.name === 'string' && meta.name.trim()) {
    return meta.name.trim();
  }
  if (typeof meta.given_name === 'string' && meta.given_name.trim()) {
    const given = meta.given_name.trim();
    const family = typeof meta.family_name === 'string' ? meta.family_name.trim() : '';
    return family ? `${given} ${family}` : given;
  }

  // 2. Check identities[0].identity_data
  const identity = Array.isArray(user.identities) && user.identities.length > 0 ? user.identities[0]?.identity_data : null;
  if (identity) {
    if (typeof identity.full_name === 'string' && identity.full_name.trim()) {
      return identity.full_name.trim();
    }
    if (typeof identity.name === 'string' && identity.name.trim()) {
      return identity.name.trim();
    }
    if (typeof identity.given_name === 'string' && identity.given_name.trim()) {
      const given = identity.given_name.trim();
      const family = typeof identity.family_name === 'string' ? identity.family_name.trim() : '';
      return family ? `${given} ${family}` : given;
    }
  }

  // 3. Fallback to email prefix formatted nicely
  if (typeof user.email === 'string' && user.email.includes('@')) {
    const emailPrefix = user.email.split('@')[0];
    if (emailPrefix) {
      const parts = emailPrefix
        .split(/[._-]+/)
        .map((p: string) => p.replace(/\d+/g, '').trim())
        .filter((p: string) => p.length > 0);

      if (parts.length > 0) {
        return parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
      }
    }
  }

  return undefined;
}

type SyncListener = (
  status: SyncStatus,
  lastSyncedAt: string | null,
  error: string | null,
  user: AuthUser | null
) => void;

/**
 * QA4-018 — synced-content change detection.
 *
 * The store subscription used to schedule a push only when `profile`
 * changed by reference or a collection's LENGTH changed. Content edits
 * that keep the length constant — updateMeal, updatePR,
 * updatePlannedWorkout, a same-day body-metric replacement — scheduled
 * NOTHING, so edits silently never reached the server until some
 * unrelated length change happened to trigger a push.
 *
 * Fix: a cheap per-collection content signature (length + FNV-1a hash
 * of the serialized entries + hash of the id set). Any difference in
 * the combined signature schedules the existing debounced push.
 * Callers should only pay the serialization cost for collections whose
 * array reference actually changed (zustand updates are immutable, so
 * an unchanged reference guarantees unchanged content).
 */
export function collectionSignature(items: readonly unknown[] | null | undefined): string {
  if (!items) return '0:0:0';
  let hash = 0x811c9dc5;
  let idHash = 0x811c9dc5;
  for (const item of items) {
    const serialized = JSON.stringify(item) ?? '';
    for (let i = 0; i < serialized.length; i++) {
      hash ^= serialized.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    const id = (item as { id?: unknown })?.id;
    if (typeof id === 'string') {
      for (let i = 0; i < id.length; i++) {
        idHash ^= id.charCodeAt(i);
        idHash = Math.imul(idHash, 0x01000193);
      }
    }
  }
  return `${items.length}:${(hash >>> 0).toString(36)}:${(idHash >>> 0).toString(36)}`;
}

/** Minimal shape of the store state the sync engine watches. */
export interface SyncedStateSlice {
  profile: unknown;
  prs: readonly unknown[];
  workouts: readonly unknown[];
  meals: readonly unknown[];
  bodyMetrics: readonly unknown[];
  plannedWorkouts: readonly unknown[];
  /** F-11: the coach-blocks singleton, signed like the profile
   *  (wrapped in an array) so a coachBlocks-only change (propose /
   *  dismiss / adopt / plateau) also schedules a push. Signatures
   *  persisted before F-11 have one fewer component and simply never
   *  match — adoption stays off until the next push, the fail-safe
   *  direction. */
  coachBlocks: unknown;
}

export function syncedStateSignature(state: SyncedStateSlice): string {
  return [
    collectionSignature([state.profile]),
    collectionSignature(state.prs),
    collectionSignature(state.workouts),
    collectionSignature(state.meals),
    collectionSignature(state.bodyMetrics),
    collectionSignature(state.plannedWorkouts),
    collectionSignature([state.coachBlocks]),
  ].join('|');
}

/**
 * True when any of the 6 synced collections changed CONTENT between
 * two store states. Fast path: identical references / identical
 * profile reference + identical array references cannot have changed.
 */
export function hasSyncedContentChanged(
  prev: SyncedStateSlice,
  next: SyncedStateSlice,
): boolean {
  if (
    prev.profile === next.profile &&
    prev.prs === next.prs &&
    prev.workouts === next.workouts &&
    prev.meals === next.meals &&
    prev.bodyMetrics === next.bodyMetrics &&
    prev.plannedWorkouts === next.plannedWorkouts &&
    prev.coachBlocks === next.coachBlocks
  ) {
    return false;
  }
  return syncedStateSignature(prev) !== syncedStateSignature(next);
}

/**
 * F28 (audit) — last-pushed signature persistence.
 *
 * The pull can adopt remote edits only when the local copy is unchanged
 * since the last push. That fact is recorded here: after every
 * successful push, pushLocalData stores the signature of the state it
 * just pushed (localStorage, best-effort — a write failure simply
 * leaves an older signature, which fails safe to "do not adopt").
 * The pull reads it fresh each time (not cached at init) so a
 * leader tab's push is visible to follower tabs.
 *
 * Why persisted, not just in-memory: the main adoption scenario is a
 * device switch — device A boots after days away, its last push was in
 * a previous session. An in-memory-only signature would be null on
 * every boot, and the first pull after boot would never adopt — the
 * exact case F28 exists to fix. The comparison itself is the guard:
 * any local change since that push (edit, heal, restore) changes the
 * fresh signature, so adoption stays off. A hash collision could in
 * theory adopt over a changed row, but the signature combines length +
 * content hash + id-set hash across all six slices, making that
 * negligible for a sync heuristic (and adoption never resurrects
 * tombstoned rows regardless).
 */
export const LAST_PUSHED_SIGNATURE_KEY = 'ascend_last_pushed_signature';

/**
 * §8 (Phase 1.2): the adoption baseline is scoped PER USER. The original
 * key held one global string, so account A's baseline could satisfy
 * account B's adoption check whenever the datasets' signatures
 * coincided. Scoped keys make that unrepresentable: a baseline exists
 * only for the user whose push wrote it.
 */
export function lastPushedSignatureKey(userId: string): string {
  return `${LAST_PUSHED_SIGNATURE_KEY}:${userId}`;
}

/**
 * Migration for the pre-scoping value: the legacy unscoped key is
 * DISCARDED on first contact, never honored. Losing it costs one full
 * per-row reconciliation on the next pull (adoption stays off until
 * the next successful push re-baselines) — it can never lose data.
 */
function discardLegacyAdoptionSignature(): void {
  try {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(LAST_PUSHED_SIGNATURE_KEY) !== null) {
      localStorage.removeItem(LAST_PUSHED_SIGNATURE_KEY);
    }
  } catch {
    // Best-effort: a leftover legacy key is inert — nothing reads it.
  }
}

export function readLastPushedSignature(userId: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    discardLegacyAdoptionSignature();
    return localStorage.getItem(lastPushedSignatureKey(userId));
  } catch {
    return null;
  }
}

export function writeLastPushedSignature(userId: string, signature: string): void {
  try {
    if (typeof window === 'undefined') return;
    discardLegacyAdoptionSignature();
    localStorage.setItem(lastPushedSignatureKey(userId), signature);
  } catch {
    // Best-effort only: a failed write leaves the older signature,
    // which fails safe to "do not adopt" on the next pull.
  }
}

/**
 * Pure adoption decision (F28): adopt only when a last-pushed
 * signature exists AND the fresh local signature equals it. A null
 * last-pushed signature (never pushed from this device) never adopts.
 */
export function shouldAdoptRemoteChanges(
  lastPushedSignature: string | null,
  freshSignature: string,
): boolean {
  return lastPushedSignature !== null && lastPushedSignature === freshSignature;
}

/**
 * The ONE session resolution both sync paths use (§27 symmetry,
 * Phase 1.4): distinguishes "the check resolved — here is the user
 * (or genuinely none)" from "the check FAILED" (network). Callers
 * must never fold a failure into `user: null`; classifyIdentity
 * (src/lib/identity.ts) decides what a failure means.
 */
export async function resolveSessionUser(supabase: {
  auth: { getUser: () => Promise<{ data: { user: any } }> };
}): Promise<{ user: any | null; checkFailed: boolean; error?: unknown }> {
  try {
    const res = await supabase.auth.getUser();
    return { user: res?.data?.user ?? null, checkFailed: false };
  } catch (error) {
    return { user: null, checkFailed: true, error };
  }
}

class SupabaseSyncEngine {
  private status: SyncStatus = 'unconfigured';
  private lastSyncedAt: string | null = null;
  private errorMessage: string | null = null;
  /** QA-hardening R6: classified failure + backoff retry state. */
  private errorKind: SyncErrorKind | null = null;
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private currentUser: AuthUser | null = null;
  private listeners: Set<SyncListener> = new Set();
  private debounceTimer: any = null;
  private isSyncing = false;
  private initialized = false;
  /**
   * Tracks the in-flight sync promise so concurrent callers share a single
   * network round-trip instead of racing against each other.
   */
  private pendingSyncPromise: Promise<void> | null = null;
  /**
   * S4: while set, an OAuth/OTP sign-in has completed but the user
   * has not yet made the merge choice — sync is paused (no pull, and
   * pushLocalData refuses to run) until resolveMergeChoice. Holds
   * the user id the choice belongs to.
   */
  private pendingMergeChoiceFor: string | null = null;
  /** S4: `${userId}:${intentAt}` of the last gate evaluation that
   *  proceeded, so the cloud probe runs at most once per sign-in. */
  private mergeGateEvaluatedKey: string | null = null;

  public subscribe(cb: SyncListener) {
    this.listeners.add(cb);
    cb(this.status, this.lastSyncedAt, this.errorMessage, this.currentUser);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.status, this.lastSyncedAt, this.errorMessage, this.currentUser));
  }

  public getStatus() {
    return {
      status: this.status,
      lastSyncedAt: this.lastSyncedAt,
      error: this.errorMessage,
      user: this.currentUser,
      // S4: a merge choice is waiting on the user (MergeChoiceModal).
      pendingMergeChoice: this.pendingMergeChoiceFor !== null,
      // QA-hardening R6: classified sync failure (null when healthy).
      errorKind: this.errorKind,
      // Defect 2: rows the server permanently rejected (see the
      // quarantine block above) — Settings surfaces these in plain
      // words; they never hold the cycle in 'error' by themselves.
      quarantined: this.currentUser ? readSyncQuarantine(this.currentUser.id) : ([] as QuarantinedSyncRow[]),
    };
  }

  public getCurrentUser() {
    return this.currentUser;
  }

  public getSyncStatus() {
    return this.status;
  }

  public init() {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    const supabase = getSupabase();
    if (!supabase) {
      this.status = 'unconfigured';
      this.notify();
      return;
    }

    if (!navigator.onLine) {
      this.status = 'offline';
      this.notify();
    }

    // Window online/offline listeners
    window.addEventListener('online', () => {
      this.triggerSyncNow();
    });

    window.addEventListener('offline', () => {
      this.status = 'offline';
      this.notify();
    });

    // Listen to Supabase auth state changes (OAuth callbacks, token refresh, magic link)
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        if (typeof window !== 'undefined') {
          try {
            clearLoggedOutLatch();
          } catch {}
        }
        this.currentUser = {
          id: session.user.id,
          email: session.user.email,
          name: extractUserName(session.user),
          avatarUrl: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture,
          provider: session.user.app_metadata?.provider || 'google',
          isAnonymous: Boolean(session.user.is_anonymous),
        };
        this.notify();
        this.triggerSyncNow();
        // Re-link push subscription to the signed-in user so server
        // notifications work (guest subscriptions are skipped by dispatch).
        // Fire-and-forget: never blocks sign-in.
        if (event === 'SIGNED_IN' && !session.user.is_anonymous) {
          (async () => {
            try {
              const { getExistingPushSubscription, subscribeToPush } = await import('@/lib/push-notifications');
              const existing = await getExistingPushSubscription();
              if (existing && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                await subscribeToPush();
              }
            } catch {}
          })();
        }
      } else {
        this.currentUser = null;
        // S4: session gone — a pending merge choice dies with it.
        this.pendingMergeChoiceFor = null;
        clearPendingMergeChoice();
        this.notify();
      }
    });

    // Listen to local store changes for debounced push.
    // QA4-018: content-aware — ANY change to the synced collections
    // (including same-length edits like updateMeal / updatePR /
    // updatePlannedWorkout / same-day metric replacement) schedules
    // the push, not just length changes. hasSyncedContentChanged has
    // a reference fast path, so unrelated state churn costs ~nothing.
    useStore.subscribe((state, prevState) => {
      if (!this.initialized || this.isSyncing) return;
      // S3: track WHEN the coach-blocks state diverges from the last
      // settled sync baseline — the adoption gate's local stamp. Runs
      // before the online/leader guards: recording a stamp is not a
      // write to the server, and offline edits are exactly the ones
      // whose time matters. (isSyncing above excludes the engine's
      // own pull-applied changes; adoptions settle the baseline
      // before applying, so they never land here as "edits".)
      if (state.coachBlocks !== prevState.coachBlocks) {
        const meta = readCoachBlocksSyncMeta();
        if (meta && coachBlocksSignature(state.coachBlocks) !== meta.sig) {
          writeCoachBlocksSyncMeta({
            ...meta,
            localEditedAt: new Date().toISOString(),
          });
        }
      }
      if (!navigator.onLine) return;
      // QA4-010: a follower tab never pushes — its in-memory state is
      // not the source of truth and pushing it would clobber the
      // leader's data server-side too.
      if (getTabLeaderGuard()?.shouldSuppressWrites()) return;

      if (hasSyncedContentChanged(prevState, state)) {
        this.scheduleDebouncedPush();
      }
    });

    // Run initial sync on launch
    setTimeout(() => {
      this.triggerSyncNow();
    }, 800);
  }

  /**
   * Google sign-in — neutral errors only (UX discoverability).
   *
   * Raw provider errors used to surface verbatim in toasts: provider
   * wordings, config hints, even env var names. The engine now returns
   * only the stable code 'google_signin_incomplete'; UI callers map it
   * to neutral localized copy (auth.googleSignInIncomplete). The raw
   * detail is logged to the console for diagnostics, never shown.
   */
  public async signInWithGoogle(): Promise<{ error?: string }> {
    if (typeof window !== 'undefined') {
      try {
        clearLoggedOutLatch();
      } catch {}
    }
    // S4: record the intent so the completing sign-in routes through
    // the merge choice instead of an unconditional sync.
    writeSignInIntent();
    const supabase = getSupabase();
    if (!supabase) {
      console.warn('[ascend] Google sign-in: Supabase client is not configured.');
      return { error: 'google_signin_incomplete' };
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });
      if (error) {
        console.warn('[ascend] Google sign-in failed:', error.message);
        return { error: 'google_signin_incomplete' };
      }
      return {};
    } catch (err: any) {
      console.warn('[ascend] Google sign-in threw:', err?.message || err);
      return { error: 'google_signin_incomplete' };
    }
  }

  public async signInWithApple(): Promise<{ error?: string }> {
    if (typeof window !== 'undefined') {
      try {
        clearLoggedOutLatch();
      } catch {}
    }
    // S4: same intent routing as Google sign-in.
    writeSignInIntent();
    const supabase = getSupabase();
    if (!supabase) {
      return {
        error: 'Cloud authentication is not configured. Please verify Supabase credentials in your environment.',
      };
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });
      if (error) return { error: error.message };
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Apple sign-in failed' };
    }
  }

  public async signUpWithPassword(
    email: string,
    password: string,
    fullName?: string
  ): Promise<{ error?: string; user?: AuthUser; requiresEmailVerification?: boolean }> {
    if (typeof window !== 'undefined') {
      try {
        clearLoggedOutLatch();
      } catch {}
    }
    const supabase = getSupabase();
    if (!supabase) {
      return { error: 'Cloud authentication is not configured.' };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: fullName ? { full_name: fullName.trim() } : undefined,
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });
      if (error) return { error: error.message };
      if (data.user) {
        this.currentUser = {
          id: data.user.id,
          email: data.user.email,
          name: fullName?.trim() || extractUserName(data.user),
          isAnonymous: false,
        };
        this.notify();
        const requiresEmailVerification = !data.session;
        if (data.session) {
          await this.triggerSyncNow();
        }
        return { user: this.currentUser, requiresEmailVerification };
      }
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Sign up failed' };
    }
  }

  public async signInWithPassword(
    email: string,
    password: string,
    opts?: { deferSync?: boolean }
  ): Promise<{ error?: string; user?: AuthUser }> {
    if (typeof window !== 'undefined') {
      try {
        clearLoggedOutLatch();
      } catch {}
    }
    const supabase = getSupabase();
    if (!supabase) {
      return { error: 'Cloud authentication is not configured.' };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) return { error: error.message };
      if (data.user) {
        this.currentUser = {
          id: data.user.id,
          email: data.user.email,
          name: extractUserName(data.user),
          isAnonymous: false,
        };
        this.notify();
        // Task 1.4: deferSync lets the caller interpose the
        // merge-choice BEFORE the first sync runs — once
        // triggerSyncNow executes, the guest-migration merge is
        // already decided. Callers that defer MUST call
        // triggerSyncNow themselves after the user chooses.
        if (!opts?.deferSync) {
          await this.triggerSyncNow();
        }
        return { user: this.currentUser };
      }
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Login failed' };
    }
  }

  /**
   * Task 1.4: does this account already hold data in the cloud?
   * Used by the post-login merge choice: the choice is offered only
   * when BOTH the device (guest data) and the account have something
   * to lose. RLS scopes every query to the signed-in user, so any
   * row visible here is the account's own.
   *
   * Task 2.2 hardening: the probe now covers EVERY synced collection
   * (the original probed only profiles/workouts/meals, so an account
   * holding only PRs, plans, body metrics or coach blocks read as
   * "no cloud data" and got no choice), and it FAILS CLOSED: if a
   * core query errors, the answer is "offer the choice" — both
   * choices preserve the data, while a silent merge might not. The
   * optional coach_blocks table is probed tolerantly (it may not
   * exist on a deployment; its own pull path takes the same stance).
   */
  public async accountHasCloudData(userId: string): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;
    try {
      const rowProbe = (table: string) =>
        supabase.from(table).select('id').eq('user_id', userId).limit(1);
      const [profileRes, workoutsRes, mealsRes, prsRes, plansRes, metricsRes, blocksRes] =
        await Promise.all([
          supabase.from('profiles').select('id').eq('id', userId).maybeSingle(),
          rowProbe('workouts'),
          rowProbe('meals'),
          rowProbe('personal_records'),
          rowProbe('planned_workouts'),
          rowProbe('body_metrics'),
          rowProbe('coach_blocks'),
        ]);
      const verdict = resolveCloudDataProbe([
        { data: profileRes.data, error: profileRes.error },
        { data: workoutsRes.data, error: workoutsRes.error },
        { data: mealsRes.data, error: mealsRes.error },
        { data: prsRes.data, error: prsRes.error },
        { data: plansRes.data, error: plansRes.error },
        { data: metricsRes.data, error: metricsRes.error },
        { data: blocksRes.data, error: blocksRes.error, tolerateError: true },
      ]);
      return verdict !== 'no-data';
    } catch {
      // Fail closed (Task 2.2): an unreadable probe offers the merge
      // choice rather than silently merging over unseen cloud data.
      return true;
    }
  }

  /**
   * S4 gate, evaluated at the top of a sync — before any pull or
   * push — for a just-completed OAuth/OTP sign-in. Returns true when
   * the sync must PAUSE for the merge choice. One-sided evaluations
   * are remembered for the intent's lifetime (mergeGateEvaluatedKey)
   * so the cloud probe runs at most once per sign-in.
   */
  private async shouldGateForMergeChoice(user: {
    id: string;
    is_anonymous?: boolean;
  }): Promise<boolean> {
    if (this.pendingMergeChoiceFor === user.id) return true;
    const state = useStore.getState();
    const dataSignature = mergeChoiceDataSignature(state);
    // Phase 1.3 (§4): restore a persisted pending choice — a reload
    // while the merge modal was up must re-present the choice, never
    // fall through to a silent merge. The record restores only for
    // the same user over the same data; anything else is stale and
    // discarded before the fresh evaluation below.
    const persisted = readPendingMergeChoice();
    if (persisted) {
      if (persisted.userId === user.id && persisted.dataSignature === dataSignature) {
        this.pendingMergeChoiceFor = user.id;
        this.status = 'idle';
        this.notify();
        return true;
      }
      clearPendingMergeChoice();
    }
    const intentAt = readSignInIntentAt();
    if (intentAt === null) return false;
    const evalKey = `${user.id}:${intentAt}`;
    if (this.mergeGateEvaluatedKey === evalKey) return false;
    const localHasData = hasRetainedHistory(state);
    // Cheap local half first: with no guest data on this device
    // there is nothing to choose about — skip the cloud probe.
    const cloudHasData = localHasData ? await this.accountHasCloudData(user.id) : false;
    const verdict = evaluateSignInMergeGate({
      intentAt,
      now: Date.now(),
      isAnonymous: Boolean(user.is_anonymous),
      profileId: state.profile?.id,
      userId: user.id,
      localHasData,
      cloudHasData,
      resolvedMarker: readMergeChoiceResolved(),
      dataSignature,
    });
    if (verdict === 'gate') {
      this.pendingMergeChoiceFor = user.id;
      writePendingMergeChoice(user.id, dataSignature);
      this.status = 'idle';
      this.notify();
      return true;
    }
    this.mergeGateEvaluatedKey = evalKey;
    return false;
  }

  /**
   * S4: run the user's merge choice (MergeChoiceModal). 'merge'
   * simply unpauses — the sync that follows folds this device's data
   * into the account. 'archive' archives this device's data FIRST
   * via startFreshFromRetainedHistory (restorable in Settings →
   * Data & Account), then syncs the account's data down. If the
   * archive write fails, NOT syncing is the whole point: syncing
   * anyway would silently merge, the opposite of the choice — the
   * choice stays pending so the user can retry (AuthModal Task 1.4
   * semantics, verbatim).
   */
  public async resolveMergeChoice(
    choice: 'merge' | 'archive',
  ): Promise<{ error?: string }> {
    const userId = this.pendingMergeChoiceFor;
    if (!userId) return {};
    if (choice === 'archive') {
      const archived = useStore.getState().startFreshFromRetainedHistory();
      if (!archived) {
        this.errorMessage = "Could not archive this device's data";
        this.status = 'error';
        this.notify();
        return { error: 'archive_failed' };
      }
    }
    writeMergeChoiceResolved(userId, mergeChoiceDataSignature(useStore.getState()));
    this.pendingMergeChoiceFor = null;
    clearPendingMergeChoice();
    clearSignInIntent();
    this.errorMessage = null;
    this.notify();
    await this.triggerSyncNow();
    return {};
  }

  /**
   * S4: AuthModal's email/password flow already presented the choice
   * itself (Task 1.4, deferred sync) — record the resolution so a
   * still-fresh intent flag from an earlier OAuth/OTP attempt in the
   * same window cannot re-gate the sync AuthModal is about to run.
   */
  public suppressMergeGateFor(userId: string): void {
    // Phase 1.3 (§4): record the resolution ONLY while a fresh sign-in
    // intent exists. The original code wrote the marker
    // unconditionally, so a call outside any sign-in flow could record
    // a "resolution" for data the user never saw a choice about.
    const intentAt = readSignInIntentAt();
    if (intentAt === null) return;
    const now = Date.now();
    if (now < intentAt || now - intentAt > SIGN_IN_INTENT_MAX_AGE_MS) return;
    writeMergeChoiceResolved(userId, mergeChoiceDataSignature(useStore.getState()));
    // If the engine gate had ALSO engaged for this user, the choice
    // AuthModal just resolved is the same one — release the pause.
    if (this.pendingMergeChoiceFor === userId) {
      this.pendingMergeChoiceFor = null;
      clearPendingMergeChoice();
      this.notify();
    }
  }

  public async resetPasswordForEmail(email: string): Promise<{ error?: string; success?: boolean }> {
    const supabase = getSupabase();
    if (!supabase) {
      return { error: 'Cloud authentication is not configured.' };
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}#reset-password` : undefined,
      });
      if (error) return { error: error.message };
      return { success: true };
    } catch (err: any) {
      return { error: err?.message || 'Password reset request failed' };
    }
  }

  public async sendEmailOtp(email: string): Promise<{ error?: string }> {
    if (typeof window !== 'undefined') {
      try {
        clearLoggedOutLatch();
      } catch {}
    }
    // S4: covers both completions of this flow — verifyEmailOtp and
    // the emailRedirectTo magic link (onAuthStateChange) — each lands
    // in triggerSyncNow, where the gate reads this intent.
    writeSignInIntent();
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase is not configured' };

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });
      if (error) return { error: error.message };
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to send login code' };
    }
  }

  public async verifyEmailOtp(email: string, token: string): Promise<{ error?: string }> {
    if (typeof window !== 'undefined') {
      try {
        clearLoggedOutLatch();
      } catch {}
    }
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase is not configured' };

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: 'email',
      });
      if (error) return { error: error.message };
      if (data.user) {
        this.currentUser = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
          isAnonymous: Boolean(data.user.is_anonymous),
        };
        this.notify();
        await this.triggerSyncNow();
      }
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to verify code' };
    }
  }

  public async signOut(options?: { clearLocalData?: boolean }): Promise<{ error?: string }> {
    clearTimeout(this.debounceTimer);
    this.isSyncing = false;
    this.currentUser = null;
    // S4: a pending merge choice belongs to the signed-in session;
    // the next sign-in re-evaluates from its own intent flag.
    this.pendingMergeChoiceFor = null;
    this.mergeGateEvaluatedKey = null;
    clearPendingMergeChoice();
    clearSignInIntent();
    this.status = 'unconfigured';
    this.notify();

    if (typeof window !== 'undefined') {
      try {
        markLoggedOut();
      } catch {}
    }

    if (options?.clearLocalData) {
      useStore.getState().logout({ clearLocalData: true });
    }

    const supabase = getSupabase();
    if (!supabase) return {};

    try {
      const { error } = await supabase.auth.signOut();
      return error ? { error: error.message } : {};
    } catch (err: any) {
      return { error: err?.message || 'Sign out failed' };
    }
  }

  /**
   * F21-B (audit): Start-fresh with verified sign-out-first — the ONLY
   * authorized entry point for startFreshFromRetainedHistory (the fork
   * is its only caller). The store action itself is synchronous and
   * cannot verify a session, so this method owns the gate:
   *
   *  1. If EITHER the engine reports a user OR a Supabase session
   *     exists, sign out first.
   *  2. Verify BOTH are gone afterwards. The engine user alone is not
   *     evidence: signOut() clears engine state before the Supabase
   *     call completes, so a failed network sign-out still leaves the
   *     real session alive. The Supabase session is authoritative; a
   *     getSession failure is treated as unverified (abort).
   *  3. Only then run the store reset (archive-first, then fresh guest
   *     defaults). Server-wipe is NOT implemented: the cloud copy
   *     stays intact and restorable.
   *
   * On any failure the reset never runs: no defaults applied, no
   * profile touched, and the caller gets a clear error to show.
   * With no session live, no push can overwrite the server profile
   * afterwards (both push paths return early without a user).
   */
  public async startFreshAfterVerifiedSignOut(): Promise<{ ok: boolean; error?: string }> {
    const supabase = getSupabase();
    const engineUser = this.getCurrentUser();
    let session: unknown = null;
    let sessionCheckFailed = false;
    try {
      session = (await supabase?.auth.getSession())?.data?.session ?? null;
    } catch {
      sessionCheckFailed = true;
    }
    const hadSession = Boolean(engineUser || session || sessionCheckFailed);
    if (hadSession) {
      const { error } = await this.signOut();
      let sessionAfter: unknown;
      try {
        sessionAfter = (await supabase?.auth.getSession())?.data?.session ?? null;
      } catch {
        // Verification itself failed: fail-safe, do not proceed.
        sessionAfter = undefined;
      }
      const decision = decideStartFreshGate({
        hadSession: true,
        signOutError: error ?? null,
        engineUserAfter: this.getCurrentUser(),
        sessionAfter,
      });
      if (!decision.proceed) {
        return { ok: false, error: decision.error };
      }
    }
    const ok = useStore.getState().startFreshFromRetainedHistory();
    if (!ok) {
      return {
        ok: false,
        error:
          'Could not archive the existing history, so nothing was changed. Please try again.',
      };
    }
    return { ok: true };
  }

   public async deleteAccount(): Promise<{ success: boolean; error?: string }> {
     clearTimeout(this.debounceTimer);
     this.isSyncing = false;
     const supabase = getSupabase();

     let apiError: string | undefined;
     let cloudDeleted = false;

     if (supabase) {
       try {
         const { data: { session } } = await supabase.auth.getSession();
         const token = session?.access_token;
         if (token) {
           const res = await fetch('/api/auth/delete-account', {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               Authorization: `Bearer ${token}`,
             },
           });
           const json = await res.json().catch(() => ({}));

           // Handle non-2xx responses
           if (!res.ok) {
             apiError = json?.message || 'Server account deletion failed';
           } else if (res.status === 207) {
             cloudDeleted = false;
             apiError = json?.message || 'Partial deletion: Some cloud records could not be purged.';
           } else {
             // Parse the new response format
             cloudDeleted = !!json.cloudDeleted;
             if (!cloudDeleted && json.message?.includes('Cloud deletion skipped')) {
               // In offline/dev mode, cloud deletion was intentionally skipped
               // This is not an error from the sync engine's perspective
               apiError = undefined;
             } else if (!cloudDeleted) {
               apiError = json?.message || 'Cloud account deletion failed';
             }
           }
         }
       } catch (err: any) {
         apiError = err?.message || 'Network error during account deletion';
       }

       try {
         await supabase.auth.signOut();
       } catch {}
     }

     this.currentUser = null;
     this.status = 'unconfigured';
     this.notify();

     // Comprehensive local wipe
     let localWipeError: string | undefined;
     if (typeof window !== 'undefined') {
       try {
         const keysToRemove = [
           'ascend_store',
           'ascend_profile',
           'ascend_prs',
           'ascend_workouts',
           'ascend_meals',
           'ascend_body_metrics',
           'ascend_emergency_snapshot',
           'ascend_planned_workouts',
           'ascend_telemetry_consent',
           'ascend_reminders',
           'ascend_notification_prefs',
         ];
         keysToRemove.forEach((k) => localStorage.removeItem(k));
         // Remove supabase tokens and any lingering ascend prefixes
         const allKeys: string[] = [];
         try {
           for (let i = 0; i < localStorage.length; i++) {
             const k = localStorage.key(i);
             if (k) allKeys.push(k);
           }
         } catch {}
         allKeys.forEach((k) => {
           if (k.startsWith('sb-') || k.startsWith('ascend_')) {
             localStorage.removeItem(k);
           }
         });
         markLoggedOut();
       } catch (err: any) {
         localWipeError = err?.message || 'Local wipe failed';
       }
     }

     useStore.getState().clearAllData();

     // Success means: cloud deletion succeeded (or was intentionally skipped in offline mode)
     // AND local wipe completed without error
     const success = !apiError && cloudDeleted && !localWipeError;
     return {
       success,
       error: apiError || localWipeError
     };
   }

  /**
   * QA-hardening R6: single funnel for sync failures — classify the
   * error, publish it with the status (one state source for the
   * banner, the Today caption and Settings, all via useSupabaseSync),
   * and schedule an exponential-backoff retry. Auth failures are NOT
   * auto-retried: an expired session cannot heal by retrying; the
   * banner's auth message asks the user to sign in again.
   */
  private recordSyncFailure(err: unknown) {
    const e: any = err as any;
    this.status = 'error';
    this.errorMessage = e?.message || 'Sync failed';
    this.errorKind = classifySyncError(err);
    this.notify();
    if (this.errorKind !== 'auth') {
      this.scheduleSyncRetry();
    }
  }

  private scheduleSyncRetry() {
    this.clearSyncRetryTimer();
    const delay = syncRetryDelayMs(this.retryAttempt);
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      // Backoff retries must not reset the attempt counter (only a
      // manual/event-driven sync or a success does).
      void this.startSyncNow(false);
    }, delay);
  }

  private clearSyncRetryTimer() {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /** A healthy sync (or a fresh manual attempt) ends the failure state. */
  private markSyncHealthy() {
    this.errorKind = null;
    this.retryAttempt = 0;
    this.clearSyncRetryTimer();
  }

  private scheduleDebouncedPush() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.syncPush();
    }, 2500);
  }

  public async triggerSyncNow() {
    return this.startSyncNow(true);
  }

  private async startSyncNow(resetBackoff: boolean) {
    // Deduplicate concurrent sync calls by returning the in-flight promise
    if (this.pendingSyncPromise) {
      return this.pendingSyncPromise;
    }
    // QA-hardening R6: a manual/event-driven sync cancels any pending
    // backoff retry and restarts the backoff ladder; scheduled
    // retries call startSyncNow(false) so the ladder keeps growing.
    if (resetBackoff) {
      this.retryAttempt = 0;
      this.clearSyncRetryTimer();
    }

    if (typeof window !== 'undefined' && isLoggedOutLatchSet()) {
      const supabaseClient = getSupabase();
      let hasActiveSession = false;
      if (supabaseClient) {
        try {
          const { data: { session } } = await supabaseClient.auth.getSession();
          if (session?.user) {
            hasActiveSession = true;
            clearLoggedOutLatch();
          }
        } catch {}
      }

      if (!hasActiveSession) {
        this.currentUser = null;
        this.status = 'unconfigured';
        this.notify();
        return;
      }
    }

    const supabase = getSupabase();
    if (!supabase) {
      this.status = 'unconfigured';
      this.notify();
      return;
    }

    if (!navigator.onLine) {
      this.status = 'offline';
      this.notify();
      return;
    }

    this.isSyncing = true;
    this.status = 'syncing';
    this.errorMessage = null;
    this.notify();

    const sync = async () => {
    try {
      // 1. Ensure active session. Phase 1.4 (§5): a FAILED check
      // (network) is not "signed out" — the old code caught the
      // rejection into null and took the guest branch, clearing the
      // user and flipping the app to its signed-out state on a
      // transient error. The identity classifier decides instead.
      const { user, checkFailed: sessionCheckFailed, error: sessionError } =
        await resolveSessionUser(supabase);
      const identity = classifyIdentity({
        sessionUser: user ? { id: user.id, isAnonymous: Boolean(user.is_anonymous) } : null,
        sessionCheckFailed,
        lastKnownUserId: this.currentUser?.id ?? null,
        profile: useStore.getState().profile,
      });

      if (identity.kind === 'account-offline-stale') {
        // Keep the last known user; report an ordinary sync failure
        // (the classifier reads the fetch error as offline) with the
        // usual backoff, and retry later.
        this.isSyncing = false;
        this.recordSyncFailure(sessionError ?? new Error('Session check failed'));
        this.notify();
        return;
      }

      if (!user) {
        this.currentUser = null;
        this.status = 'unconfigured';
        this.isSyncing = false;
        this.notify();
        return;
      }

      const extractedName = extractUserName(user);
      this.currentUser = {
        id: user.id,
        email: user.email,
        name: extractedName,
        avatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture,
        provider: user.app_metadata?.provider || 'google',
        isAnonymous: Boolean(user.is_anonymous),
      };

      // S4: an OAuth/OTP sign-in that just completed may owe the
      // user the merge choice BEFORE anything syncs (Phase 1 Task
      // 1.4 covered email/password only). Pausing here leaves both
      // the pull and the push untouched until resolveMergeChoice.
      if (await this.shouldGateForMergeChoice(user)) {
        return;
      };

      // 2. Pull remote records (DI2-1: the five collection reads page
      // past the 1,000-row PostgREST cap via fetchAllUserRowsPaged;
      // the profile is a single-row maybeSingle and is not capped.)
      const [remoteProfile, remotePRs, remoteWorkouts, remoteMeals, remoteMetrics, remotePlans] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        fetchAllUserRowsPaged(supabase, 'personal_records', '*', 'user_id', user.id),
        fetchAllUserRowsPaged(supabase, 'workouts', '*', 'user_id', user.id),
        fetchAllUserRowsPaged(supabase, 'meals', '*', 'user_id', user.id),
        fetchAllUserRowsPaged(supabase, 'body_metrics', '*', 'user_id', user.id),
        fetchAllUserRowsPaged(supabase, 'planned_workouts', '*', 'user_id', user.id),
      ]);
      // F-11: the coach-blocks singleton row — fetched SEPARATELY
      // from the Promise.all above, in its own try/catch: this slice
      // is optional (the §16 table may not exist on a deployment) and
      // must never be able to fail the whole sync. Any error or
      // unexpected client behavior reads as "no remote state".
      let remoteCoachBlocksState: CoachBlocksState | null = null;
      // S3: the row's updated_at is the adoption gate's remote stamp.
      let remoteCoachBlocksUpdatedAt: string | null = null;
      try {
        const remoteCoachBlocks = await supabase
          .from('coach_blocks')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (remoteCoachBlocks && !remoteCoachBlocks.error) {
          remoteCoachBlocksState = coachBlocksStateFromPayload(remoteCoachBlocks.data?.payload);
          remoteCoachBlocksUpdatedAt =
            typeof remoteCoachBlocks.data?.updated_at === 'string'
              ? remoteCoachBlocks.data.updated_at
              : null;
        }
      } catch {
        remoteCoachBlocksState = null;
        remoteCoachBlocksUpdatedAt = null;
      }

      // S1/S2: the server tombstone layer (deletions made on other
      // devices, stamped), fetched BEFORE the merge so the apply-time
      // recompute below can fold it in. null = layer unavailable
      // (pre-migration) → pre-convergence behaviour everywhere.
      const serverTombstones = await this.fetchSyncTombstones(user.id);

      const localState = useStore.getState();

      // Detect if the existing local profile belongs to a DIFFERENT authenticated account.
      // F20 (audit): guest profiles (guest_ ids from getOrCreateGuestId,
      // plus the legacy user_ form) are NOT switches — they route to the
      // merge (guest-migration) branch. Only a non-guest id different
      // from the session user is a switch (replace branch). This half
      // is safe only together with the sign-out-first gate in
      // startFreshAfterVerifiedSignOut: without it, a signed-in
      // Start-fresh would merge while a session is still live.
      // Phase 1.4 (§5/§6): the rule itself lives in identity.ts and
      // reads provenance (createdByUid / importedFromBackup) before
      // falling back to the F20 id shapes.
      const isCrossAccountSwitch = isCrossAccountProfile(localState.profile, user.id);

      // 3. Reconcile Cloud -> Local (Recovery on phone, device switch, or account switch)
      let needsLocalUpdate = false;
      const updates: any = {};

      // R2/R5: remote rows mapped during the pull, retained so the apply
      // step can recompute the slices against FRESH local state instead
      // of the stale pre-round-trip capture (see recomputePullSlices).
      const pullRemote: Partial<Record<PullSliceKey, { id: string }[]>> = {};
      // Gauntlet DI-09: the remote profile stamp the pending
      // updates.profile was built from, retained for the apply-time
      // staleness re-check.
      let pulledRemoteProfileUpdatedAt: string | null = null;

      if (remoteProfile.data) {
        // Authoritative cloud profile for the authenticated account —
        // UNLESS the local profile was edited more recently than the
        // server row (QA4A-001, last-write-wins): the pull used to rebuild
        // the profile from the server unconditionally, erasing an unsynced
        // local edit (e.g. a weigh-in via updateBodyMetrics) and then
        // pushing the stale copy back up. When local is newer we skip the
        // rebuild and the push below carries the local edit to the server.
        // Cross-account rebuilds always take the server row — it is a
        // different account's data, not an older copy of this one.
        // NOTE: the avatar syncs via the profiles.avatar_url column
        // (gauntlet R11). When the column is absent (older deployment)
        // or empty, fall back to the device-local avatar — otherwise
        // every sync would wipe the user's profile picture.
        // Cross-account rebuilds start clean (no field leakage from
        // the previous account on this device) except for the new
        // account's own synced avatar.
        const rp = remoteProfile.data;
        pulledRemoteProfileUpdatedAt = rp.updated_at ?? null;
        const localProfileIsNewer =
          !isCrossAccountSwitch &&
          localState.profile?.id === rp.id &&
          isLocalProfileNewer(localState.profile?.updatedAt, rp.updated_at);
        if (!localProfileIsNewer) {
          updates.profile = {
            ...(isCrossAccountSwitch ? {} : localState.profile || {}),
            id: rp.id,
            // §6 provenance: this profile now provably belongs to
            // the session account (Phase 1.4).
            createdByUid: user.id,
            importedFromBackup: undefined,
            name: rp.name,
            gender: rp.gender,
            bodyweightKg: Number(rp.bodyweight_kg) || DEFAULT_BODYWEIGHT_KG,
            bodyweightLbs: Number(rp.bodyweight_lbs) || 165,
            heightCm: rp.height_cm ? Number(rp.height_cm) : undefined,
            unit: rp.unit || 'kg',
            goals: rp.goals || ['build_muscle'],
            dietPreference: rp.diet_preference || 'non_vegetarian',
            createdAt: rp.created_at,
            ...(rp.updated_at ? { updatedAt: rp.updated_at } : {}),
            avatar:
              typeof (rp as any).avatar_url === 'string' && (rp as any).avatar_url
                ? (rp as any).avatar_url
                : isCrossAccountSwitch
                  ? undefined
                  : resolveAvatar(localState.profile?.avatar),
          };
          updates.hasCompletedOnboarding = true;
          needsLocalUpdate = true;
        }
      } else if (localState.profile && !isCrossAccountSwitch) {
        // Guest profile linking to newly authenticated cloud account for the first time
        if (localState.profile.id !== user.id) {
          const currentName = localState.profile.name?.trim().toLowerCase() || '';
          const isGenericName = !currentName || currentName === 'athlete' || currentName === 'guest';
          const resolvedName = isGenericName && extractedName ? extractedName : localState.profile.name;

          updates.profile = {
            ...localState.profile,
            id: user.id,
            // §6 provenance: the guest profile just linked to this
            // account (Phase 1.4).
            createdByUid: user.id,
            importedFromBackup: undefined,
            name: resolvedName,
          };
          needsLocalUpdate = true;
        }
      } else if (!localState.profile && (
        (remotePRs.data && remotePRs.data.length > 0) ||
        (remoteWorkouts.data && remoteWorkouts.data.length > 0) ||
        (remoteMeals.data && remoteMeals.data.length > 0)
      )) {
        // Cloud account has records, but profiles row was missing/empty. Synthesize athlete profile so returning user is not locked out.
        updates.profile = {
          id: user.id,
          createdByUid: user.id,
          name: extractedName || '',
          gender: 'male',
          bodyweightKg: DEFAULT_BODYWEIGHT_KG,
          bodyweightLbs: 165,
          unit: 'kg',
          goals: ['build_muscle'],
          dietPreference: 'non_vegetarian',
          createdAt: new Date().toISOString(),
        };
        updates.hasCompletedOnboarding = true;
        needsLocalUpdate = true;
      }

      if (isCrossAccountSwitch) {
        // Cross-account switch: Replace local store completely with current user's remote records
        // Gauntlet DI-03: the replace above covered only the 6 synced
        // slices, so the previous account's unsynced data (coach blocks,
        // water/creatine logs, habits, goals, XP, streak, challenges,
        // photos) survived into the next account on this device.
        // Archive first — the single-slot archive is restorable via
        // Settings, so the wipe below is recoverable — then reset every
        // unsynced account slice. The remote assignments that follow
        // overwrite the synced slices. Device-level preferences are
        // intentionally kept (see buildCrossAccountResetUpdates).
        try {
          useStore.getState().archiveRetainedHistory();
        } catch {
          // Best-effort: the reset below must still run.
        }
        Object.assign(updates, buildCrossAccountResetUpdates());
        try {
          if (typeof window !== 'undefined') localStorage.removeItem(PROGRESS_PHOTOS_KEY);
        } catch {
          // Best-effort: the in-memory reset above already clears photos.
        }
        // Gauntlet DI-03 (Cycle 4 catch): custom barcodes are user-created
        // local-only data (storage key ascend_custom_barcodes, written by
        // store.ts:3667; the server table is never written by this client)
        // and live outside the store slices, so the builder cannot clear
        // them. Remove them here — the archive-first call above already
        // saved them (archive includes customBarcodes via buildFullBackup
        // extras), so the previous account's barcodes stay restorable via
        // Settings instead of leaking to the new account.
        try {
          if (typeof window !== 'undefined') localStorage.removeItem('ascend_custom_barcodes');
        } catch {
          // Best-effort: barcodes are a lookup aid, not a synced slice.
        }
        updates.prs = (remotePRs.data || []).map((r: any) => ({
          id: r.id,
          exercise: r.exercise,
          weightKg: Number(r.weight_kg),
          weightLbs: Number(r.weight_lbs),
          reps: Number(r.reps),
          oneRepMax: Number(r.one_rep_max),
          date: r.date,
          notes: r.notes || undefined,
          ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
        }));
        updates.workouts = (remoteWorkouts.data || []).map((r: any) => ({
          id: r.id,
          name: r.name || undefined,
          // Gauntlet DI-01: legacy cloud rows may carry ISO timestamps
          // from the Log Past flow; the store contract is YYYY-MM-DD.
          date: normalizeDateToLocalDay(r.date),
          durationMinutes: r.duration_minutes || undefined,
          notes: r.notes || undefined,
          exercises: r.exercises || [],
          ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
        }));
        updates.meals = (remoteMeals.data || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          date: r.date,
          foods: r.foods || [],
          ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
        }));
        // Re-audit DI-R1: adopted rows get the same one-per-date dedupe
        // as the merge path; superseded remote rows are tombstoned so a
        // later pull does not union them straight back in.
        const adoptedMetrics = dedupeBodyMetricsByDate(
          (remoteMetrics.data || []).map((r: any) => bodyMetricFromRemoteRow(r))
        );
        updates.bodyMetrics = adoptedMetrics.rows;
        if (adoptedMetrics.supersededIds.length > 0) {
          updates.deletedBodyMetricIds = [
            ...new Set([...(localState.deletedBodyMetricIds || []), ...adoptedMetrics.supersededIds]),
          ];
        }
        updates.plannedWorkouts = (remotePlans.data || []).map(planFromRemoteRow);
        // Retain the mapped remote rows for apply-time recompute (R2/R5).
        pullRemote.prs = updates.prs;
        pullRemote.workouts = updates.workouts;
        pullRemote.meals = updates.meals;
        pullRemote.bodyMetrics = updates.bodyMetrics;
        pullRemote.plannedWorkouts = updates.plannedWorkouts;
        needsLocalUpdate = true;
      } else {
        // Same account / guest migration: Merge remote cloud records into local store

        // Merge PRs / Workouts / Meals / Body Metrics — tombstone-aware
        // (QA4-001): the union merge must never resurrect a record the
        // user deleted locally, exactly like plans below.
        if (remotePRs.data && remotePRs.data.length > 0) {
          const remoteMapped = remotePRs.data.map((r: any) => ({
            id: r.id,
            exercise: r.exercise,
            weightKg: Number(r.weight_kg),
            weightLbs: Number(r.weight_lbs),
            reps: Number(r.reps),
            oneRepMax: Number(r.one_rep_max),
            date: r.date,
            notes: r.notes || undefined,
            ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
          }));
          pullRemote.prs = remoteMapped;
          const { merged, changed } = mergeRemoteRecords(
            localState.prs || [],
            remoteMapped,
            localState.deletedPrIds || []
          );
          if (changed) {
            updates.prs = merged;
            needsLocalUpdate = true;
          }
        }

        if (remoteWorkouts.data && remoteWorkouts.data.length > 0) {
          const remoteMapped = remoteWorkouts.data.map((r: any) => ({
            id: r.id,
            name: r.name || undefined,
            // Gauntlet DI-01: see the cross-account mapping above.
            date: normalizeDateToLocalDay(r.date),
            durationMinutes: r.duration_minutes || undefined,
            notes: r.notes || undefined,
            exercises: r.exercises || [],
            ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
          }));
          pullRemote.workouts = remoteMapped;
          const { merged, changed } = mergeRemoteRecords(
            localState.workouts || [],
            remoteMapped,
            localState.deletedWorkoutIds || []
          );
          if (changed) {
            updates.workouts = merged;
            needsLocalUpdate = true;
          }
        }

        if (remoteMeals.data && remoteMeals.data.length > 0) {
          const remoteMapped = remoteMeals.data.map((r: any) => ({
            id: r.id,
            name: r.name,
            date: r.date,
            foods: r.foods || [],
            ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
          }));
          pullRemote.meals = remoteMapped;
          const { merged, changed } = mergeRemoteRecords(
            localState.meals || [],
            remoteMapped,
            localState.deletedMealIds || []
          );
          if (changed) {
            updates.meals = merged;
            needsLocalUpdate = true;
          }
        }

        if (remoteMetrics.data && remoteMetrics.data.length > 0) {
          const remoteMapped = remoteMetrics.data.map((r: any) => bodyMetricFromRemoteRow(r));
          pullRemote.bodyMetrics = remoteMapped;
          const { merged, changed } = mergeRemoteRecords(
            localState.bodyMetrics || [],
            remoteMapped,
            localState.deletedBodyMetricIds || []
          );
          // Re-audit DI-R1: restore the one-entry-per-date invariant the
          // id-keyed union can break (UNIQUE (user_id, date) in the DB);
          // superseded rows are tombstoned so they are never re-pushed.
          const deduped = dedupeBodyMetricsByDate(merged);
          if (deduped.supersededIds.length > 0) {
            updates.bodyMetrics = deduped.rows;
            updates.deletedBodyMetricIds = [
              ...new Set([...(localState.deletedBodyMetricIds || []), ...deduped.supersededIds]),
            ];
            needsLocalUpdate = true;
          } else if (changed) {
            updates.bodyMetrics = merged;
            needsLocalUpdate = true;
          }
        }

        // Merge Planned Workouts (Routines & Templates) — tombstone-aware:
        // a plan the user deleted locally is never resurrected by a stale
        // server copy.
        if (remotePlans.data && remotePlans.data.length > 0) {
          const remoteMapped = remotePlans.data.map(planFromRemoteRow);
          pullRemote.plannedWorkouts = remoteMapped;
          const { merged, changed } = mergeRemotePlans(
            localState.plannedWorkouts || [],
            remoteMapped,
            localState.deletedPlanIds || []
          );
          if (changed) {
            updates.plannedWorkouts = merged;
            needsLocalUpdate = true;
          }
        }
      }

      // Apply any pulled cloud data to local store
      // R2/R5: the merges above were computed from localState captured
      // BEFORE the network round-trip. A delete, edit, or add made
      // mid-sync must not be overwritten by those stale arrays, and a
      // cross-account replace must not resurrect locally tombstoned
      // rows. Recompute the collection slices against fresh state; the
      // profile update (if any) still applies as computed — its own
      // mid-sync race is a documented residual (R2b-profile).
      const freshState = useStore.getState();
      // S1/S2 (sync convergence): fold the server tombstone layer
      // into the recompute inputs. Per slice:
      // - local rows another device deleted — whose local stamp does
      //   not beat the tombstone — leave the merge base (this is what
      //   makes a deletion CONVERGE on this device);
      // - a STAMPED local tombstone a newer remote edit beats stops
      //   filtering, so the edit resurrects the record (S2);
      //   legacy unstamped tombstones keep the pre-convergence
      //   always-filter semantics;
      // - server tombstones join the filter set, so a record this
      //   device has never held is not adopted only to be deleted
      //   again next cycle.
      // serverTombstones === null (pre-migration) skips all of it:
      // the inputs below are then exactly the pre-convergence ones.
      const TOMBSTONE_TABLE_BY_SLICE: Record<PullSliceKey, TombstoneCollection> = {
        prs: 'personal_records',
        workouts: 'workouts',
        meals: 'meals',
        bodyMetrics: 'body_metrics',
        plannedWorkouts: 'planned_workouts',
      };
      const DELETED_KEY_BY_SLICE = {
        prs: 'deletedPrIds',
        workouts: 'deletedWorkoutIds',
        meals: 'deletedMealIds',
        bodyMetrics: 'deletedBodyMetricIds',
        plannedWorkouts: 'deletedPlanIds',
      } as const;
      const removedByServerTombstone: Partial<Record<PullSliceKey, StampedTombstone[]>> = {};
      const resurrectedLocalTombIds: Partial<Record<PullSliceKey, string[]>> = {};
      const resurrectedServerTombs: { collection: TombstoneCollection; id: string }[] = [];
      const sliceBase: Partial<Record<PullSliceKey, { id: string }[]>> = {};
      const buildSliceInput = (
        key: PullSliceKey,
      ): { local: { id: string }[]; tombstones: Iterable<string> } => {
        const freshRows = (freshState[key] || []) as unknown as { id: string; updatedAt?: string }[];
        const localTombIds = (freshState[DELETED_KEY_BY_SLICE[key]] ||
          []) as unknown as string[];
        sliceBase[key] = freshRows;
        if (!serverTombstones) return { local: freshRows, tombstones: localTombIds };
        const collection = TOMBSTONE_TABLE_BY_SLICE[key];
        const remoteTombs = serverTombstones.get(collection) || [];
        const applied = applyRemoteTombstones(freshRows, remoteTombs);
        sliceBase[key] = applied.kept;
        if (applied.removedIds.length > 0) {
          removedByServerTombstone[key] = remoteTombs.filter((t) =>
            applied.removedIds.includes(t.id),
          );
        }
        for (const id of applied.resurrectedIds) {
          resurrectedServerTombs.push({ collection, id });
        }
        const remoteStamps = new Map<string, string | null>();
        for (const row of (pullRemote[key] || []) as { id: string; updatedAt?: string }[]) {
          remoteStamps.set(row.id, row.updatedAt ?? null);
        }
        const localTombs = stampedTombstones(localTombIds, freshState.tombstoneStamps, collection);
        const stampedOnly = localTombs.filter((t) => t.deletedAt !== null);
        const { active, resurrectedIds } = effectiveTombstones(stampedOnly, remoteStamps);
        resurrectedLocalTombIds[key] = resurrectedIds;
        const activeIds = new Set(active.map((t) => t.id));
        const filterIds = new Set<string>([
          ...localTombIds.filter(
            (id) =>
              !stampedOnly.some((t) => t.id === id) || activeIds.has(id),
          ),
          ...remoteTombs.map((t) => t.id),
        ]);
        for (const id of applied.resurrectedIds) filterIds.delete(id);
        for (const id of resurrectedIds) filterIds.delete(id);
        return { local: applied.kept, tombstones: filterIds };
      };
      // Explicitly id-shaped: the recompute only relies on `.id` and
      // reference preservation, so the five differently-typed slices
      // share one input type instead of forcing a single record type.
      const freshInput: Record<PullSliceKey, { local: { id: string }[]; tombstones: Iterable<string> }> = {
        prs: buildSliceInput('prs'),
        workouts: buildSliceInput('workouts'),
        meals: buildSliceInput('meals'),
        bodyMetrics: buildSliceInput('bodyMetrics'),
        plannedWorkouts: buildSliceInput('plannedWorkouts'),
      };
      const freshSlices = (() => {
        // F28: adopt remote edits only in the merge branch AND only
        // when the fresh local state is unchanged since the last
        // successful push (signature equality). Any local change since
        // that push — including a mid-sync edit — disables adoption
        // and falls through to R1/DI-08 newest-wins per row
        // (documented in recomputePullSlices): the newer stamp wins,
        // ties go remote, and the push gate below only uploads
        // strictly-newer rows. The profile is never adopted here; it
        // keeps its own LWW.
        const adoptRemoteChanges =
          !isCrossAccountSwitch &&
          shouldAdoptRemoteChanges(
            readLastPushedSignature(user.id),
            syncedStateSignature({
              profile: freshState.profile,
              prs: freshState.prs || [],
              workouts: freshState.workouts || [],
              meals: freshState.meals || [],
              bodyMetrics: freshState.bodyMetrics || [],
              plannedWorkouts: freshState.plannedWorkouts || [],
              coachBlocks: freshState.coachBlocks,
            }),
          );
        return recomputePullSlices(freshInput, pullRemote, isCrossAccountSwitch, adoptRemoteChanges);
      })();
      for (const key of Object.keys(pullRemote) as PullSliceKey[]) {
        if (key in freshSlices) {
          updates[key] = freshSlices[key];
        } else if (!isCrossAccountSwitch) {
          // Merge branch, recompute says nothing new: drop the stale
          // captured merge so it cannot overwrite a mid-sync change.
          delete updates[key];
        }
      }
      // Gauntlet DI-09: the profile is not a PullSliceKey, so the
      // recompute above never re-validated updates.profile — it was
      // built from the pre-round-trip capture. If the user edited
      // their profile mid-sync, the fresh local profile is now newer
      // than the remote row that update was built from: drop the
      // stale update (the push below carries the fresh edit up).
      if (
        updates.profile &&
        shouldDropStaleProfileUpdate({
          freshLocalUpdatedAt: freshState.profile?.updatedAt,
          remoteUpdatedAt: pulledRemoteProfileUpdatedAt,
          isCrossAccountSwitch,
        })
      ) {
        delete updates.profile;
      }
      // F-11: coach-blocks adoption, decided HERE against the fresh
      // state (not the pre-round-trip capture), so a block approved
      // or proposed mid-sync is never overwritten by the pull. On a
      // cross-account switch this overrides the reset's initial
      // coachBlocks with the new account's own row when one exists.
      // S3: the decision is stamp-gated (decideCoachBlocksSync) — when
      // both sides hold a block, the side that changed since the last
      // settled sync wins, ordered by stamps, instead of the local
      // side silently winning every push.
      if (remoteCoachBlocksState) {
        const cbMeta = readCoachBlocksSyncMeta();
        const cbDecision = decideCoachBlocksSync({
          isCrossAccountSwitch,
          local: freshState.coachBlocks,
          remote: remoteCoachBlocksState,
          remoteUpdatedAt: remoteCoachBlocksUpdatedAt,
          localSignature: coachBlocksSignature(freshState.coachBlocks),
          meta: cbMeta,
        });
        if (cbDecision === 'adopt') {
          updates.coachBlocks = remoteCoachBlocksState;
          // Settle the baseline BEFORE the setState below applies the
          // adoption, so the engine's own store subscription does not
          // read the adopted state as a local edit.
          writeCoachBlocksSyncMeta({
            sig: coachBlocksSignature(remoteCoachBlocksState),
            remoteStamp: remoteCoachBlocksUpdatedAt,
            localEditedAt: null,
          });
        } else if (!cbMeta && !isCrossAccountSwitch) {
          // Bootstrap: both sides settled without a baseline — seed
          // one from this state so future divergence is stamp-gated.
          // (Local wins this round: the pre-S3 behaviour.)
          writeCoachBlocksSyncMeta({
            sig: coachBlocksSignature(freshState.coachBlocks),
            remoteStamp: remoteCoachBlocksUpdatedAt,
            localEditedAt: null,
          });
        }
      }
      // S1/S2 post-pass: apply the server tombstone layer to the
      // slices the recompute actually produced (some of its branches
      // merge from the pre-round-trip capture, which never saw the
      // tombstones), and fold the bookkeeping into the same setState:
      // records removed by a server tombstone are recorded as LOCAL
      // tombstones (stamped with the server deleted_at) so the
      // deletion sticks across pulls, and local tombstones a newer
      // remote edit beat are dropped with their stamps. A
      // cross-account switch gets only the row filtering — its
      // tombstone arrays belong to the previous account's lifecycle.
      if (serverTombstones) {
        for (const key of Object.keys(TOMBSTONE_TABLE_BY_SLICE) as PullSliceKey[]) {
          const collection = TOMBSTONE_TABLE_BY_SLICE[key];
          const remoteTombs = serverTombstones.get(collection) || [];
          if (remoteTombs.length > 0 && Array.isArray(updates[key])) {
            const applied = applyRemoteTombstones(updates[key], remoteTombs);
            if (applied.removedIds.length > 0) updates[key] = applied.kept;
            for (const id of applied.resurrectedIds) {
              resurrectedServerTombs.push({ collection, id });
            }
          }
          if (isCrossAccountSwitch) continue;
          const removed = removedByServerTombstone[key] || [];
          const resurrected = resurrectedLocalTombIds[key] || [];
          if (removed.length === 0 && resurrected.length === 0) continue;
          const deletedKey = DELETED_KEY_BY_SLICE[key];
          if (!Array.isArray(updates[key]) && removed.length > 0) {
            // Merge branch, recompute reported no change — but a
            // server tombstone removed rows from the base, and that
            // removal IS the change to apply.
            updates[key] = sliceBase[key];
          }
          const currentDeleted = (updates[deletedKey] ??
            freshState[deletedKey] ??
            []) as unknown as string[];
          let nextDeleted = currentDeleted.filter((id) => !resurrected.includes(id));
          for (const tomb of removed) {
            if (!nextDeleted.includes(tomb.id)) nextDeleted = [...nextDeleted, tomb.id];
          }
          updates[deletedKey] = nextDeleted;
          let stamps = (updates.tombstoneStamps ??
            freshState.tombstoneStamps ??
            {}) as Record<string, string>;
          if (resurrected.length > 0) {
            stamps = clearTombstoneStamps(stamps, collection, resurrected);
          }
          if (removed.length > 0) {
            stamps = { ...stamps };
            for (const tomb of removed) {
              if (tomb.deletedAt) stamps[tombstoneStampKey(collection, tomb.id)] = tomb.deletedAt;
            }
          }
          updates.tombstoneStamps = stamps;
        }
      }
      // Defect 3 (D-F1): macro goals are device-local — the pull has
      // no server source for them, and a keep-data logout nulled them
      // (buildFreshHistoryState). Re-apply them from that logout's
      // archive when this user has none locally and none were pulled,
      // so sign-out → sign-in on this device never loses them. The
      // archive is user-checked inside macroGoalsFromArchive; an
      // existing local value is never overwritten. (See the helper's
      // comment block for the full mechanism.)
      if (!updates.macroGoals && !freshState.macroGoals) {
        // §12: iterate the shared generation list (newest first) —
        // the same current-then-previous order the old two-key ??
        // chain had, now over one read path for every format.
        let restored: MacroGoals | null = null;
        for (const generation of readArchiveGenerations()) {
          restored = macroGoalsFromArchive(generation, user.id);
          if (restored) break;
        }
        if (restored) updates.macroGoals = restored;
      }
      // The captured needsLocalUpdate reflects pre-round-trip state;
      // the only thing that matters now is whether updates still has keys.
      needsLocalUpdate = Object.keys(updates).length > 0;
      if (needsLocalUpdate) {
        useStore.setState(updates);
      }
      // S2: clear the server tombstones newer local/remote edits beat,
      // so the resurrected records are not re-deleted by later pulls.
      if (resurrectedServerTombs.length > 0) {
        await this.clearSyncTombstones(user.id, resurrectedServerTombs);
      }

      // 4. Push Local -> Cloud (Initial Migration or Incremental Updates)
      if (!isCrossAccountSwitch) {
        await this.pushLocalData(user.id);
      }

      this.status = 'synced';
      this.lastSyncedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.markSyncHealthy();
      this.notify();
     } catch (err: any) {
      console.error('Supabase sync error:', err);
      this.recordSyncFailure(err);
    } finally {
      this.isSyncing = false;
      this.pendingSyncPromise = null;
    }
    };

    this.pendingSyncPromise = sync()
      .finally(() => {
        this.pendingSyncPromise = null;
      });

    return this.pendingSyncPromise;
  }

  /**
   * R1/DI-08 push gate — fetch one table's remote (id, updated_at)
   * stamps for this user. Returns null on ANY fetch failure: the
   * caller then skips that table's upserts and records an error, so
   * a failed stamp read can never degrade to an ungated overwrite
   * (fail-safe, never fail-open to last-push-wins).
   */
  private async fetchRemoteStamps(
    table: string,
    column: string,
    value: string,
  ): Promise<Map<string, string | null> | null> {
    try {
      const supabase = getSupabase();
      if (!supabase) return null;
      // DI2-1: paged — a truncated stamp map reads past-cap rows as
      // absent and disarms the newest-wins gate for them.
      const { data, error } = await fetchAllUserRowsPaged(supabase, table, 'id,updated_at', column, value);
      if (error) return null;
      const stamps = new Map<string, string | null>();
      for (const row of data || []) {
        stamps.set((row as any).id as string, ((row as any).updated_at as string | null) ?? null);
      }
      return stamps;
    } catch {
      return null;
    }
  }

  /**
   * D-Q2-1: fetch the remote body_metrics rows (id, date, updated_at)
   * for the date-aware push plan. Same fail-safe contract as
   * fetchRemoteStamps: null on ANY failure, and the caller then
   * skips the table's upserts and records an error rather than
   * pushing ungated.
   */
  private async fetchRemoteBodyMetricRows(
    userId: string,
  ): Promise<RemoteBodyMetricRow[] | null> {
    try {
      const supabase = getSupabase();
      if (!supabase) return null;
      const { data, error } = await fetchAllUserRowsPaged(
        supabase,
        'body_metrics',
        'id,date,updated_at',
        'user_id',
        userId,
      );
      if (error) return null;
      return (data || []).map((r: any) => ({
        id: r.id as string,
        date: r.date as string,
        updated_at: (r.updated_at as string | null) ?? null,
      }));
    } catch {
      return null;
    }
  }

  /**
   * S1/S2: read the server tombstone layer (deletions made on other
   * devices, stamped), grouped by collection. Returns null when the
   * layer is unavailable — pre-migration the sync_tombstones table
   * does not exist yet — and EVERY consumer treats null as "fall back
   * to the pre-convergence behaviour" (today's semantics), never as
   * an error and never as "no deletions happened".
   */
  private async fetchSyncTombstones(
    userId: string,
  ): Promise<Map<TombstoneCollection, StampedTombstone[]> | null> {
    try {
      const supabase = getSupabase();
      if (!supabase) return null;
      const { data, error } = await fetchSyncTombstoneRows(supabase, userId);
      if (error || !data) return null;
      const byCollection = new Map<TombstoneCollection, StampedTombstone[]>();
      for (const row of data) {
        const list = byCollection.get(row.collection) || [];
        list.push({ id: row.recordId, deletedAt: row.deletedAt });
        byCollection.set(row.collection, list);
      }
      return byCollection;
    } catch {
      return null;
    }
  }

  /**
   * S1: record deletions in the server tombstone layer so other
   * devices learn of them (best-effort; false = not recorded, the
   * caller keeps its local tombstones and retries next push). A
   * legacy tombstone with no stamp is recorded with `now` — the
   * moment it reaches the server is the only honest stamp it has.
   */
  private async recordSyncTombstones(
    userId: string,
    collection: TombstoneCollection,
    tombs: StampedTombstone[],
  ): Promise<boolean> {
    try {
      if (tombs.length === 0) return true;
      const supabase = getSupabase();
      if (!supabase) return false;
      const rows = tombs.map((t) => ({
        user_id: userId,
        collection,
        record_id: t.id,
        deleted_at: t.deletedAt ?? new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('sync_tombstones')
        .upsert(rows, { onConflict: 'user_id,collection,record_id' });
      return !error;
    } catch {
      return false;
    }
  }

  /**
   * S2: clear server tombstones a strictly newer edit has beaten, so
   * the resurrected record is not re-deleted by the next pull on any
   * device (best-effort; a leftover tombstone loses to the same edit
   * again on every pull, so a failed clear self-heals).
   */
  private async clearSyncTombstones(
    userId: string,
    entries: { collection: TombstoneCollection; id: string }[],
  ): Promise<void> {
    try {
      if (entries.length === 0) return;
      const supabase = getSupabase();
      if (!supabase) return;
      const byCollection = new Map<TombstoneCollection, string[]>();
      for (const entry of entries) {
        const list = byCollection.get(entry.collection) || [];
        list.push(entry.id);
        byCollection.set(entry.collection, list);
      }
      for (const [collection, ids] of byCollection) {
        await supabase
          .from('sync_tombstones')
          .delete()
          .eq('user_id', userId)
          .eq('collection', collection)
          .in('record_id', ids);
      }
    } catch {
      // Best-effort — see the doc comment.
    }
  }

  /**
   * Defect 2: shared row-batch push with permanent-failure isolation.
   * The caller picks the conflict target via opts.onConflict — 'id'
   * for classic batches, 'user_id,date' for rows atomically replacing
   * a foreign holder of their date (D-Q2-1, see planBodyMetricPush).
   * Upserts the batch; on a missing-column error with a `bareVariant`,
   * retries bare (the DI-02 / LOOP-2 pre-migration tolerance — never a
   * mask for other errors). A PERMANENT batch rejection fans out to
   * per-row upserts: Postgres aborts the whole statement on one bad
   * row, and quarantining the healthy rows along with the poison row
   * would be exactly the F29 failure mode this defect removes. A
   * TRANSIENT error (network / 5xx / no deterministic code) is
   * reported as-is and the caller keeps the classic whole-cycle error
   * behavior — no fan-out, no quarantine.
   */
  private async pushRowBatch(opts: {
    table: string;
    payloads: any[];
    onConflict?: string;
    bareVariant?: (rows: any[]) => any[];
    bareNote?: string;
  }): Promise<{ okIds: string[]; permanentFailures: { id: string; error: unknown; stamp: string | null }[]; transientError: unknown }> {
    const outcome = {
      okIds: [] as string[],
      permanentFailures: [] as { id: string; error: unknown; stamp: string | null }[],
      transientError: null as unknown,
    };
    const supabase = getSupabase();
    if (!supabase || opts.payloads.length === 0) return outcome;
    const upsert = (rows: any[]) =>
      supabase.from(opts.table).upsert(rows, opts.onConflict ? { onConflict: opts.onConflict } : undefined);
    let { error } = await upsert(opts.payloads);
    if (error && opts.bareVariant && isMissingColumnError(error)) {
      if (opts.bareNote) console.warn(opts.bareNote);
      ({ error } = await upsert(opts.bareVariant(opts.payloads)));
    }
    if (!error) {
      outcome.okIds = opts.payloads.map((r) => r.id as string);
      return outcome;
    }
    // §7: a schema error that survived the bare retry is table-level —
    // fail the cycle (transient path), never fan out or quarantine.
    if (isSchemaPushError(error)) {
      outcome.transientError = error;
      return outcome;
    }
    if (!isPermanentRowError(error)) {
      outcome.transientError = error;
      return outcome;
    }
    for (const row of opts.payloads) {
      let res = await upsert([row]);
      if (res.error && opts.bareVariant && isMissingColumnError(res.error)) {
        res = await upsert(opts.bareVariant([row]));
      }
      if (!res.error) outcome.okIds.push(row.id as string);
      else if (isSchemaPushError(res.error)) {
        if (!outcome.transientError) outcome.transientError = res.error;
      } else if (isPermanentRowError(res.error)) {
        outcome.permanentFailures.push({
          id: row.id as string,
          error: res.error,
          // §7: the stamp of the payload the server rejected — always
          // the value that was actually pushed, never a lookup that
          // can come back undefined for stamp-less local rows.
          stamp:
            typeof (row as { updated_at?: unknown }).updated_at === 'string'
              ? ((row as { updated_at: string }).updated_at as string)
              : typeof (row as { updatedAt?: unknown }).updatedAt === 'string'
                ? ((row as { updatedAt: string }).updatedAt as string)
                : null,
        });
      } else if (!outcome.transientError) outcome.transientError = res.error;
    }
    return outcome;
  }

  /**
   * Defect 2: fold a pushRowBatch outcome into the quarantine store and
   * the cycle's error record. Landed rows are released; permanent
   * failures are quarantined (never recorded as cycle errors — the
   * cycle is 'synced' with them noted); a transient error goes through
   * `record` exactly as before (F29 → error state + R6 backoff).
   */
  private applyPushOutcome(
    userId: string,
    collection: SyncQuarantineCollection,
    outcome: { okIds: string[]; permanentFailures: { id: string; error: unknown; stamp: string | null }[]; transientError: unknown },
    record: (e: { message?: string } | null | undefined) => void,
  ): void {
    if (outcome.okIds.length > 0) releaseSyncQuarantine(userId, collection, outcome.okIds);
    for (const failure of outcome.permanentFailures) {
      const e = failure.error as { code?: unknown } | null;
      quarantineSyncRow(userId, {
        collection,
        rowId: failure.id,
        // §7: payload stamp + error class only — never the raw
        // server message (it carries schema details and is not the
        // user's business in Settings).
        stamp: failure.stamp,
        code: typeof e?.code === 'string' ? e.code : null,
        errorClass: syncErrorClass(failure.error),
        quarantinedAt: new Date().toISOString(),
      });
      console.warn(
        `[sync] quarantined ${collection} row ${failure.id} (${typeof e?.code === 'string' ? e.code : 'permanent'}): permanently rejected by the server; excluded from future pushes until edited`,
      );
    }
    if (outcome.transientError) record(outcome.transientError as { message?: string });
  }

  /**
   * Defect 2: drop quarantined rows from a push candidate list. A row
   * whose stamp changed since quarantine (the user edited it) is let
   * through for one retry; entries whose local row is gone are pruned
   * (deletion → the tombstone flow owns the server copy).
   */
  private applyQuarantineFilter<T extends { id: string; updatedAt?: unknown }>(
    userId: string,
    collection: SyncQuarantineCollection,
    candidates: T[],
    liveRowIds: Set<string>,
  ): T[] {
    pruneSyncQuarantine(userId, collection, liveRowIds);
    const quarantined = new Map(
      readSyncQuarantine(userId)
        .filter((q) => q.collection === collection)
        .map((q) => [q.rowId, q] as const),
    );
    if (quarantined.size === 0) return candidates;
    return candidates.filter((row) => {
      const entry = quarantined.get(row.id);
      if (!entry) return true;
      const stamp = typeof row.updatedAt === 'string' ? row.updatedAt : null;
      // §7: release only on a CONCRETE, changed stamp (an edit). A
      // stamp-less row stays quarantined — with payload stamps on the
      // entries, "null !== entry.stamp" would otherwise retry it (and
      // re-quarantine it under a fresh generated stamp) every cycle.
      return stamp !== null && stamp !== entry.stamp;
    });
  }

  private async pushLocalData(userId: string) {
    const supabase = getSupabase();
    if (!supabase) return;

    // S4: while a merge choice is pending for this user, no push may
    // run — the debounced push path (syncPush) bypasses the
    // triggerSyncNow gate, and pushing now would silently merge the
    // guest data the user has not yet decided about.
    if (this.pendingMergeChoiceFor && this.pendingMergeChoiceFor === userId) return;

    const state = useStore.getState();

    // Phase 1.4 (§5/§27): the push NEVER runs over a cross-account
    // profile. The debounced path reaches here without a pull, and
    // pushing would re-home the other account's rows under this
    // session's uid. A full sync classifies first (its pull archives
    // + replaces), after which this guard passes again.
    if (isCrossAccountProfile(state.profile, userId)) return;

    // S1/S2: the server tombstone layer, read once per push. null =
    // unavailable (pre-migration) → every consumer below falls back
    // to the pre-convergence behaviour. Rows another device deleted
    // (server tombstone beats the local stamp) are invisible to the
    // push — re-uploading them was the S1 resurrection path; the
    // pull removes them locally.
    const serverTombstones = await this.fetchSyncTombstones(userId);
    const visibleRows = <T extends { id: string; updatedAt?: string }>(
      rows: T[],
      collection: TombstoneCollection,
    ): T[] =>
      serverTombstones
        ? filterOutServerDeleted(rows, serverTombstones.get(collection) || [])
        : rows;

    // F29 (audit): upsert errors used to be swallowed (the calls below
    // never inspected `{ error }`), yet syncPush reported 'synced'
    // regardless. Record the first failure across all steps, attempt
    // every step anyway, and throw at the end so both callers report
    // 'error' instead of a false 'synced'. Deletion propagation (step 7)
    // is deliberately excluded: it is best-effort by design and keeps
    // its tombstones for retry on the next push.
    // Defect 2 carve-out: PERMANENT per-row rejections are quarantined
    // by applyPushOutcome instead of recorded here — only transient
    // failures (and the non-row-batched profile/coach-blocks steps)
    // can still fail the cycle.
    // Mutable holder (not a plain `let`): TS narrows a captured `let`
    // to its initializer type across the awaits below, which would make
    // the final check see `never`. A property read is re-evaluated.
    const firstError: { current: { message?: string } | null } = { current: null };
    const record = (e: { message?: string } | null | undefined) => {
      if (e && !firstError.current) firstError.current = e;
    };

    // R1/DI-08 push gate (applies to every upsert below): before
    // upserting a collection, fetch remote (id, updated_at) and
    // upsert ONLY rows whose local stamp is strictly newer than
    // remote, or rows absent remotely. Rows where remote is newer —
    // or where either stamp is missing/unparseable — are SKIPPED,
    // never overwritten. A stamp-fetch failure skips that table and
    // records an error (fail-safe); it never falls back to ungated
    // upserts. Skips are silent, not errors: the rule working as
    // designed must not report 'error' on every sync.
    //
    // DELETIONS (S1/S2, sync convergence): explicit deletions ARE
    // stamp-gated now — propagateAllDeletions resolves each tombstone
    // against the remote row's stamp (newer wins) and records the
    // deletion in the server tombstone layer before the local
    // tombstone may prune, so deletions converge across devices.
    // Until the 2026110501 migration runs, the layer reads as
    // unavailable and propagation keeps the pre-convergence
    // semantics exactly.
    //
    // RESIDUAL DI-08.5 (clock skew): "newest" is judged by device
    // clocks; skewed clocks can pick the wrong winner. Server-side
    // stamping would need a DB migration and is out of scope.

    // 1. Profile — gated like every other collection (the old code
    // preserved the local stamp but upserted unconditionally, so a
    // push-only sync still overwrote a newer remote profile). The
    // pull's profile LWW stays as the complementary half: when remote
    // is newer, the pull rebuilds local from remote first, so a
    // skipped profile push is a no-op, not a divergence.
    if (state.profile) {
      const profileStamps = await this.fetchRemoteStamps('profiles', 'id', userId);
      if (profileStamps === null) {
        record({ message: 'Could not read remote profile stamp; profile push skipped' });
      } else if (shouldPushRow(state.profile.updatedAt, profileStamps.get(userId))) {
        const profileRow = {
          id: userId,
          name: state.profile.name,
          gender: state.profile.gender,
          bodyweight_kg: state.profile.bodyweightKg,
          bodyweight_lbs: state.profile.bodyweightLbs,
          height_cm: state.profile.heightCm || null,
          unit: state.profile.unit,
          goals: state.profile.goals || ['build_muscle'],
          diet_preference: state.profile.dietPreference || 'non_vegetarian',
          // Carry the local last-edit stamp up (QA4A-001): writing "now"
          // here would make the server row look newer than any offline
          // edit made since, and the next pull would clobber it.
          updated_at: state.profile.updatedAt || new Date().toISOString(),
        };
        // Gauntlet R11: the avatar rides along in avatar_url. On
        // deployments where the column does not exist yet (migration
        // 20261029_profiles_avatar_url.sql not applied), retry
        // without it so the profile push itself never breaks — the
        // DI-02 missing-column tolerance pattern.
        let { error: profileError } = await supabase
          .from('profiles')
          .upsert({ ...profileRow, avatar_url: state.profile.avatar ?? null });
        if (profileError && /avatar_url/.test(profileError.message || '')) {
          ({ error: profileError } = await supabase.from('profiles').upsert(profileRow));
        }
        record(profileError);
      }
    }

    // 2. PRs
    if (state.prs && state.prs.length > 0) {
      const prStamps = await this.fetchRemoteStamps('personal_records', 'user_id', userId);
      if (prStamps === null) {
        record({ message: 'Could not read remote PR stamps; PR push skipped' });
      } else {
        const { toUpsert: gatePassing } = filterRowsForPush(visibleRows(state.prs, 'personal_records'), prStamps);
        const toUpsert = this.applyQuarantineFilter(
          userId,
          'personal_records',
          gatePassing,
          new Set(state.prs.map((r) => r.id)),
        );
        if (toUpsert.length > 0) {
          const prRows = toUpsert.map((p) => ({
            id: p.id,
            user_id: userId,
            exercise: p.exercise,
            weight_kg: p.weightKg,
            weight_lbs: p.weightLbs,
            reps: p.reps,
            one_rep_max: p.oneRepMax,
            date: p.date,
            notes: p.notes || null,
            // Own stamp, not `now` (see the profile comment above).
            // Stamp-less rows reach here only when absent remotely,
            // where there is nothing to clobber.
            updated_at: p.updatedAt || new Date().toISOString(),
          }));
          const outcome = await this.pushRowBatch({ table: 'personal_records', payloads: prRows, onConflict: 'id' });
          this.applyPushOutcome(userId, 'personal_records', outcome, record);
        }
      }
    }

    // 3. Workouts
    if (state.workouts && state.workouts.length > 0) {
      const workoutStamps = await this.fetchRemoteStamps('workouts', 'user_id', userId);
      if (workoutStamps === null) {
        record({ message: 'Could not read remote workout stamps; workout push skipped' });
      } else {
        const { toUpsert: gatePassing } = filterRowsForPush(visibleRows(state.workouts, 'workouts'), workoutStamps);
        const toUpsert = this.applyQuarantineFilter(
          userId,
          'workouts',
          gatePassing,
          new Set(state.workouts.map((r) => r.id)),
        );
        if (toUpsert.length > 0) {
          const workoutRows = toUpsert.map((w) => ({
            id: w.id,
            user_id: userId,
            name: w.name || null,
            date: w.date,
            duration_minutes: w.durationMinutes || null,
            notes: w.notes || null,
            exercises: w.exercises || [],
            updated_at: w.updatedAt || new Date().toISOString(),
          }));
          const outcome = await this.pushRowBatch({ table: 'workouts', payloads: workoutRows, onConflict: 'id' });
          this.applyPushOutcome(userId, 'workouts', outcome, record);
        }
      }
    }

    // 4. Meals
    if (state.meals && state.meals.length > 0) {
      const mealStamps = await this.fetchRemoteStamps('meals', 'user_id', userId);
      if (mealStamps === null) {
        record({ message: 'Could not read remote meal stamps; meal push skipped' });
      } else {
        const { toUpsert: gatePassing } = filterRowsForPush(visibleRows(state.meals, 'meals'), mealStamps);
        const toUpsert = this.applyQuarantineFilter(
          userId,
          'meals',
          gatePassing,
          new Set(state.meals.map((r) => r.id)),
        );
        if (toUpsert.length > 0) {
          const mealRows = toUpsert.map((m) => ({
            id: m.id,
            user_id: userId,
            name: m.name,
            date: m.date,
            foods: m.foods || [],
            updated_at: m.updatedAt || new Date().toISOString(),
          }));
          const outcome = await this.pushRowBatch({ table: 'meals', payloads: mealRows, onConflict: 'id' });
          this.applyPushOutcome(userId, 'meals', outcome, record);
        }
      }
    }

    // 5. Body Metrics — D-Q2-1: the gate is date-aware, not just
    // id-aware (see planBodyMetricPush). Local state can also carry
    // same-date duplicates (legacy blobs, pre-guard baselines): the
    // dedupe picks one contender per date, because upserting a
    // second same-date row is exactly what 409'd. Losers are
    // SUPERSEDED — removed locally and tombstoned, mirroring the
    // pull path — but only once their date is settled server-side
    // (the winner landed, or the remote row already holds the date),
    // so a date that should have a metric is never left empty by a
    // failed or partial step; and never when the loser IS the
    // server's row for the date (the pull owns that resolution).
    if (state.bodyMetrics && state.bodyMetrics.length > 0) {
      const remoteMetrics = await this.fetchRemoteBodyMetricRows(userId);
      if (remoteMetrics === null) {
        record({ message: 'Could not read remote body-metric rows; body-metric push skipped' });
      } else {
        const { rows: deduped, supersededIds } = dedupeBodyMetricsByDate(
          visibleRows(state.bodyMetrics, 'body_metrics'),
        );
        const contenders = this.applyQuarantineFilter(
          userId,
          'body_metrics',
          deduped,
          new Set(state.bodyMetrics.map((b) => b.id)),
        );
        const plan = planBodyMetricPush(contenders, remoteMetrics);
        const landedIds = new Set<string>();
        // Gauntlet DI-02: measurement columns exist only after the
        // 2026102801 migration — the bare variant retries without
        // them (handled inside pushRowBatch; other errors never masked).
        const bareBodyMetrics = (rows: any[]) =>
          rows.map(({ body_fat_pct: _bf, chest_in: _c, waist_in: _w, hips_in: _h, ...rest }) => rest);
        if (plan.idUpserts.length > 0) {
          const outcome = await this.pushRowBatch({
            table: 'body_metrics',
            payloads: plan.idUpserts.map((r) => bodyMetricRowForPush(r, userId)),
            onConflict: 'id',
            bareVariant: bareBodyMetrics,
            bareNote: '[sync] body_metrics measurement columns not present on server yet — retrying without them',
          });
          this.applyPushOutcome(userId, 'body_metrics', outcome, record);
          outcome.okIds.forEach((id) => landedIds.add(id));
        }
        if (plan.dateUpserts.length > 0) {
          const outcome = await this.pushRowBatch({
            table: 'body_metrics',
            payloads: plan.dateUpserts.map((r) => bodyMetricRowForPush(r, userId)),
            onConflict: 'user_id,date',
            bareVariant: bareBodyMetrics,
            bareNote: '[sync] body_metrics measurement columns not present on server yet — retrying without them',
          });
          this.applyPushOutcome(userId, 'body_metrics', outcome, record);
          outcome.okIds.forEach((id) => landedIds.add(id));
        }
        if (supersededIds.length > 0) {
          const remoteHolderByDate = new Map(remoteMetrics.map((r) => [r.date, r.id]));
          const remoteById = new Map(remoteMetrics.map((r) => [r.id, r]));
          const settledDates = new Set<string>();
          // Holders a landed date-upsert rewrote into our row: their
          // ids no longer exist server-side, so a loser carrying one
          // is safe to supersede (its tombstone just confirms an
          // already-absent row in step 7).
          const replacedHolderIds = new Set<string>();
          for (const row of [...plan.idUpserts, ...plan.dateUpserts]) {
            if (landedIds.has(row.id)) settledDates.add(row.date);
          }
          for (const row of plan.dateUpserts) {
            if (!landedIds.has(row.id)) continue;
            const holder = remoteHolderByDate.get(row.date);
            if (holder && holder !== row.id) replacedHolderIds.add(holder);
          }
          for (const row of plan.skipped) {
            // Skipped only because the remote side already holds
            // this date (newer holder, our own current row, or an
            // identity tangle the pull resolves) — settled either way.
            if (remoteHolderByDate.has(row.date)) settledDates.add(row.date);
          }
          const fresh = useStore.getState();
          const localById = new Map((fresh.bodyMetrics || []).map((b) => [b.id, b]));
          const toSupersede = supersededIds.filter((id) => {
            const loser = localById.get(id);
            if (!loser) return false;
            if (!settledDates.has(loser.date)) return false;
            // Identity tangle (review finding, 2026-11-10): this id
            // is the server's row for a DIFFERENT date — tombstoning
            // it would make step 7 delete that date's row, which this
            // push never touched. planBodyMetricPush refuses the same
            // tangle for upserts; leave identity resolution to the
            // pull merge.
            const remoteRowWithLoserId = remoteById.get(id);
            if (remoteRowWithLoserId && remoteRowWithLoserId.date !== loser.date) {
              return false;
            }
            if (remoteHolderByDate.get(loser.date) === id && !replacedHolderIds.has(id)) {
              return false;
            }
            return true;
          });
          if (toSupersede.length > 0) {
            useStore.setState({
              bodyMetrics: (fresh.bodyMetrics || []).filter((b) => !toSupersede.includes(b.id)),
              deletedBodyMetricIds: [
                ...new Set([...(fresh.deletedBodyMetricIds || []), ...toSupersede]),
              ],
              tombstoneStamps: stampTombstoneDeletes(
                fresh.tombstoneStamps,
                'body_metrics',
                toSupersede,
              ),
            });
          }
        }
      }
    }
    // 6. Planned Workouts — description / goalTag / intensityMode have no
    // columns on the table, so they travel in the `extras` jsonb payload
    // (QA4-006). The column exists only after the user runs the migration
    // in supabase/schema.sql; until then PostgREST rejects rows carrying
    // `extras`, so on a missing-column error we retry without it — plans
    // keep syncing and those three fields stay local-only in the meantime.
    if (state.plannedWorkouts && state.plannedWorkouts.length > 0) {
      const planStamps = await this.fetchRemoteStamps('planned_workouts', 'user_id', userId);
      if (planStamps === null) {
        record({ message: 'Could not read remote plan stamps; plan push skipped' });
      } else {
        const { toUpsert: gatePassing } = filterRowsForPush(visibleRows(state.plannedWorkouts, 'planned_workouts'), planStamps);
        const toUpsert = this.applyQuarantineFilter(
          userId,
          'planned_workouts',
          gatePassing,
          new Set(state.plannedWorkouts.map((p) => p.id)),
        );
        if (toUpsert.length > 0) {
          const planRows = toUpsert.map((p) => ({
            id: p.id,
            user_id: userId,
            name: p.name,
            exercises: p.exercises || [],
            // Own stamp, not `now` (see the profile comment in pushLocalData).
            updated_at: p.updatedAt || new Date().toISOString(),
            extras: buildPlanExtras(p) ?? null,
          }));
          const outcome = await this.pushRowBatch({
            table: 'planned_workouts',
            payloads: planRows,
            onConflict: 'id',
            // LOOP-2: the bare retry exists ONLY for the pre-migration
            // case where the `extras` column itself is missing.
            bareVariant: (rows) => rows.map(({ extras: _extras, ...rest }) => rest),
          });
          this.applyPushOutcome(userId, 'planned_workouts', outcome, record);
        }
      }
    }
    // 6b. Coach blocks (F-11) — the singleton coach_blocks row. The
    // local state carries no updated_at stamp, so the gate is
    // content: read the row and upsert only when the payload differs.
    // A missing-table error (the §16 migration not yet applied on
    // this deployment) is tolerated silently — the state stays
    // local-only, exactly as before F-11 — while every other error
    // is recorded like the other slices (F29).
    if (state.coachBlocks && !isCoachBlocksStateEmpty(state.coachBlocks)) {
      try {
        const { data: existingCb, error: cbReadError } = await supabase
          .from('coach_blocks')
          .select('payload,updated_at')
          .eq('user_id', userId)
          .maybeSingle();
        if (cbReadError) {
          if (!isMissingCoachBlocksTable(cbReadError)) record(cbReadError);
        } else if (JSON.stringify(existingCb?.payload ?? null) !== JSON.stringify(state.coachBlocks)) {
          const cbRow = coachBlocksRowForPush(state.coachBlocks, userId);
          const { error: cbUpsertError } = await supabase
            .from('coach_blocks')
            .upsert(cbRow, { onConflict: 'id' });
          if (cbUpsertError && !isMissingCoachBlocksTable(cbUpsertError)) {
            record(cbUpsertError);
          } else if (!cbUpsertError) {
            // S3: settle the adoption baseline at the pushed state.
            writeCoachBlocksSyncMeta({
              sig: coachBlocksSignature(state.coachBlocks),
              remoteStamp: typeof cbRow.updated_at === 'string' ? cbRow.updated_at : null,
              localEditedAt: null,
            });
          }
        } else {
          // Payload already identical: the local state IS the settled
          // remote state — refresh the baseline's remote stamp.
          writeCoachBlocksSyncMeta({
            sig: coachBlocksSignature(state.coachBlocks),
            remoteStamp:
              typeof existingCb?.updated_at === 'string' ? existingCb.updated_at : null,
            localEditedAt: null,
          });
        }
      } catch (err: any) {
        // Defensive (same fail-safe posture as the pull): an
        // unexpected client-level throw on this optional slice is
        // recorded, never allowed to abort the remaining steps.
        record({ message: err?.message || 'coach_blocks push failed' });
      }
    }
    // 7. Deletion propagation: the push path historically only upserted,
    // so a locally deleted record stayed on the server forever and the
    // union pull-merge resurrected it on the next sync. Delete exactly the
    // tombstoned records (explicit user deletions) — a full local reset
    // clears tombstones without reaching this path, so a "reset" never
    // wipes the cloud copy. S1/S2: each deletion is also recorded in the
    // server tombstone layer (when available) before its local tombstone
    // prunes, and a tombstone never deletes a NEWER remote edit.
    await this.propagateAllDeletions(userId, serverTombstones);

    // F29: surface the first upsert failure instead of reporting 'synced'.
    if (firstError.current) {
      // QA-hardening R6: attach the original transport error so the
      // sync-failure classifier can read its status/code.
      const pushError: Error & { cause?: unknown } = new Error(
        `Supabase push failed: ${firstError.current.message || 'unknown error'}`,
      );
      pushError.cause = firstError.current;
      throw pushError;
    }

    // F28: the push succeeded, so record the signature of the state
    // just pushed (captured `state`, not fresh state — an edit made
    // mid-push must NOT be folded into the pushed signature, or the
    // next pull would adopt over it). A later pull adopts remote edits
    // only while the fresh local signature still equals this value.
    writeLastPushedSignature(
      userId,
      syncedStateSignature({
        profile: state.profile,
        prs: state.prs || [],
        workouts: state.workouts || [],
        meals: state.meals || [],
        bodyMetrics: state.bodyMetrics || [],
        plannedWorkouts: state.plannedWorkouts || [],
        coachBlocks: state.coachBlocks,
      }),
    );
  }

  /**
   * Propagate ONE table's explicit deletions server-side, with the
   * S1/S2 convergence rules. Fail-safe: on any uncertainty, delete
   * nothing and prune nothing. Only ids that are (a) gone locally and
   * (b) explicitly tombstoned are ever deleted — a plain local/server
   * diff alone never deletes (a reset must not wipe the cloud copy).
   *
   * Per tombstone (partitionTombstonesForPush decides):
   * - keptByEdit: a NEWER remote edit beat the tombstone — the local
   *   tombstone is dropped without deleting; the pull resurrects the
   *   record here. (Stamped tombstones only; legacy unstamped ones
   *   keep the pre-convergence always-delete semantics.)
   * - toDelete: the tombstone beats the remote row's stamp — delete
   *   the row.
   * - toConfirm: the row is already gone remotely.
   * A local tombstone prunes only once the deletion is RECORDED in
   * the server tombstone layer (so other devices learn of it), or —
   * when the layer is unavailable (pre-migration) — once the row is
   * confirmed deleted/absent, exactly the pre-convergence rule.
   */
  private async propagateDeletions(
    userId: string,
    table: TombstoneCollection,
    tombstones: StampedTombstone[],
    localIds: Set<string>,
    clearTombstones: (ids: string[]) => void,
    serverTombs: StampedTombstone[] | null,
  ): Promise<void> {
    try {
      if (tombstones.length === 0) return;
      const supabase = getSupabase();
      if (!supabase) return;
      // DI2-1: paged — with a truncated list, a tombstoned row past
      // the cap reads as absent and its tombstone gets confirmed
      // without the row ever being deleted.
      const { data, error } = await fetchAllUserRowsPaged(supabase, table, 'id,updated_at', 'user_id', userId);
      if (error) return;
      const remoteStamps = new Map<string, string | null>();
      for (const row of data || []) {
        remoteStamps.set((row as any).id as string, ((row as any).updated_at as string | null) ?? null);
      }
      const { toDelete, toConfirm, keptByEdit } = partitionTombstonesForPush(
        tombstones,
        localIds,
        remoteStamps,
      );
      if (toDelete.length > 0) {
        const { error: delError } = await supabase
          .from(table)
          .delete()
          .eq('user_id', userId)
          .in('id', toDelete);
        if (delError) return;
      }
      const clearable: string[] = [...keptByEdit];
      if (serverTombs !== null) {
        // Record every deletion this device knows about that the
        // layer does not already hold a NEWER-OR-EQUAL stamp for
        // (two devices can delete the same record; the later stamp
        // is the ordering fact other devices resolve against).
        const recorded = new Map(serverTombs.map((t) => [t.id, t.deletedAt]));
        const byId = new Map(tombstones.map((t) => [t.id, t]));
        const toRecord: StampedTombstone[] = [];
        for (const id of [...toDelete, ...toConfirm]) {
          const tomb = byId.get(id);
          if (!tomb) continue;
          const existing = recorded.get(id);
          if (existing === undefined) {
            toRecord.push(tomb);
            continue;
          }
          // Already recorded: only overwrite when OUR stamp is
          // strictly newer (parsed comparison — ISO strings from the
          // server and from device clocks are not lexicographically
          // comparable across formats/offsets).
          const oursMs = tomb.deletedAt ? Date.parse(tomb.deletedAt) : NaN;
          const existingMs = existing ? Date.parse(existing) : NaN;
          if (!Number.isNaN(oursMs) && (Number.isNaN(existingMs) || oursMs > existingMs)) {
            toRecord.push(tomb);
          }
        }
        if (toRecord.length > 0) {
          const ok = await this.recordSyncTombstones(userId, table, toRecord);
          if (ok) clearable.push(...toDelete, ...toConfirm);
          // Not recorded → keep the local tombstones; the next push
          // retries (the rows are already deleted, so they land in
          // toConfirm then).
        } else {
          clearable.push(...toDelete, ...toConfirm);
        }
      } else {
        clearable.push(...toDelete, ...toConfirm);
      }
      if (clearable.length > 0) clearTombstones([...new Set(clearable)]);
    } catch {
      // Offline or unexpected — never block the push on this.
    }
  }

  /** Propagate explicit deletions for every synced entity (QA4-001). */
  private async propagateAllDeletions(
    userId: string,
    serverTombstones: Map<TombstoneCollection, StampedTombstone[]> | null,
  ): Promise<void> {
    const s = useStore.getState();
    const per = (collection: TombstoneCollection): StampedTombstone[] | null =>
      serverTombstones ? serverTombstones.get(collection) || [] : null;
    await this.propagateDeletions(
      userId,
      'planned_workouts',
      stampedTombstones(s.deletedPlanIds || [], s.tombstoneStamps, 'planned_workouts'),
      new Set((s.plannedWorkouts || []).map((p) => p.id)),
      (ids) => useStore.getState().clearDeletedPlanIds(ids),
      per('planned_workouts'),
    );
    await this.propagateDeletions(
      userId,
      'personal_records',
      stampedTombstones(s.deletedPrIds || [], s.tombstoneStamps, 'personal_records'),
      new Set((s.prs || []).map((p) => p.id)),
      (ids) => useStore.getState().clearDeletedPrIds(ids),
      per('personal_records'),
    );
    await this.propagateDeletions(
      userId,
      'workouts',
      stampedTombstones(s.deletedWorkoutIds || [], s.tombstoneStamps, 'workouts'),
      new Set((s.workouts || []).map((w) => w.id)),
      (ids) => useStore.getState().clearDeletedWorkoutIds(ids),
      per('workouts'),
    );
    await this.propagateDeletions(
      userId,
      'meals',
      stampedTombstones(s.deletedMealIds || [], s.tombstoneStamps, 'meals'),
      new Set((s.meals || []).map((m) => m.id)),
      (ids) => useStore.getState().clearDeletedMealIds(ids),
      per('meals'),
    );
    await this.propagateDeletions(
      userId,
      'body_metrics',
      stampedTombstones(s.deletedBodyMetricIds || [], s.tombstoneStamps, 'body_metrics'),
      new Set((s.bodyMetrics || []).map((b) => b.id)),
      (ids) => useStore.getState().clearDeletedBodyMetricIds(ids),
      per('body_metrics'),
    );
  }

  private async syncPush() {
    // If a sync is already in flight, deduplicate by returning the same promise
    if (this.pendingSyncPromise) {
      return this.pendingSyncPromise;
    }

    const supabase = getSupabase();
    if (!supabase || !navigator.onLine) return;

    const sync = async () => {
      try {
        // §27: same session resolution as the full sync — a failed
        // check throws into the failure path below (offline backoff),
        // never a silent "signed out".
        const { user, checkFailed, error } = await resolveSessionUser(supabase);
        if (checkFailed) throw error ?? new Error('Session check failed');
        if (!user) return;

        await this.pushLocalData(user.id);
        this.status = 'synced';
        this.lastSyncedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.markSyncHealthy();
        this.notify();
      } catch (err: any) {
        // F29: a failed push used to leave the previous (usually
        // 'synced') status in place. Report the failure honestly; the
        // UI renders 'error' from this status.
        console.warn('Background sync push warning:', err?.message);
        this.recordSyncFailure(err);
      }
    };

    this.pendingSyncPromise = sync()
      .finally(() => {
        this.pendingSyncPromise = null;
      });

    return this.pendingSyncPromise;
  }
}

export const syncEngine = new SupabaseSyncEngine();
