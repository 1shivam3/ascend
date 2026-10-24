/**
 * Coach cloud sync (Phase 2) — coachBlocks + weeklyReviews.
 *
 * Why this module exists: the coach's user-decision state (approved
 * blocks, adopted plans, plateau choices, seen/applied weekly reviews)
 * used to live on-device only (zustand persist + localStorage backup).
 * This module syncs it to Supabase the same way sync.ts syncs plans /
 * PRs / workouts, without depending on QA4-006 (planned_workouts.extras).
 *
 * SHAPE — one payload row per logical item, mirroring the other tables
 * (id TEXT PK, user_id UUID, updated_at TIMESTAMPTZ):
 *   coach_blocks:   ONE row per user, id `coach-blocks:<userId>`,
 *                   payload = the whole CoachBlocksState object.
 *   weekly_reviews: ONE row per user per week,
 *                   id `weekly-review:<userId>:<weekMonday>`,
 *                   payload = that week's WeeklyReview object.
 * Deterministic ids mean a re-push upserts the same row (onConflict
 * 'id') instead of duplicating it. The full object rides in `payload`
 * so coach shapes can evolve without a new column per field.
 *
 * CONFLICT RULE — last-write-wins per item, on updated_at:
 *   - server row newer than the local edit stamp  -> server wins.
 *   - local edit stamp newer than (or equal to) the server row
 *     -> local wins (the next push carries it up).
 *   - local stamp missing AND local state is the empty initial state
 *     -> server wins (fresh device / first sync).
 *   - local stamp missing AND local state is non-empty -> LOCAL wins.
 *     This is deliberate and differs from the profile rule (which fails
 *     open to the server): a stamp is missing exactly for pre-Phase-2
 *     local data that has never synced, and failing open to the server
 *     would clobber unsynced user decisions. The push that follows
 *     establishes the stamp, so this case only ever happens once.
 *   - a server row that is absent locally is ADDED, never treated as a
 *     deletion of anything else; a local item absent server-side is an
 *     UPSERT on push, never a server delete.
 *
 * NO TOMBSTONES — deliberately, unlike plans/PRs/workouts (reconcile.ts):
 *   - coachBlocks is a singleton, not a list. There is no per-item
 *     delete action for it, and "locally empty" means "never started /
 *     just reset", not "user deleted the cloud copy". Pushing the empty
 *     initial state would therefore be destructive, so push SKIPS the
 *     initial state entirely (see pushCoachState).
 *   - weeklyReviews are append-only in the store (no delete action;
 *     the 12-review cap is retention trimming, not a deletion). There
 *     is no deleted-review id set to propagate, and trimming must not
 *     delete the server copy — the pull merge re-adds trimmed weeks
 *     only up to the same 12 cap, and never deletes server rows.
 *   In short: this module NEVER issues a DELETE. A local/server diff
 *   alone is never a deletion signal here.
 *
 * GRACEFUL DEGRADATION — when the two tables do not exist yet (the
 * user has not run supabase/migrations/2026102401_coach_sync_tables.sql
 * in the Supabase dashboard SQL editor), pull/push return
 * pendingSetup: true, set the module-level flag read by
 * isCoachSyncPendingSetup(), keep local state fully intact, and never
 * throw. The main sync engine surfaces that flag as
 * "coach sync pending setup" instead of failing the whole sync. The
 * same soft-fail applies to an unconfigured/offline client: pull/push
 * return skipped: true and leave local state untouched.
 *
 * LOCAL-FIRST — every function here is safe to call with a null
 * client, a missing user id, malformed payloads, or a throwing client:
 * it logs (console.warn) and returns a skipped/pending result. Nothing
 * in this module ever throws into the app, and nothing here clears,
 * resets, or overwrites local state except a winning server row
 * applied by the caller (sync.ts) via the returned merged state.
 */

import type { CoachBlocksState } from '../block-engine';
import type { WeeklyReview } from '../weekly-review';

export const COACH_BLOCKS_TABLE = 'coach_blocks';
export const WEEKLY_REVIEWS_TABLE = 'weekly_reviews';

/** localStorage key for per-item local edit stamps (see conflict rule). */
export const COACH_SYNC_META_KEY = 'ascend_coach_sync_meta';

export interface CoachSyncMeta {
  coachBlocksUpdatedAt?: string;
  weeklyReviewsUpdatedAt?: Record<string, string>;
}

/** Minimal structural shape of the Supabase client this module needs. */
export interface CoachSyncClient {
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (column: string, value: string) => PromiseLike<{ data: unknown; error: unknown }>;
    };
    upsert: (
      rows: Record<string, unknown>[],
      options?: { onConflict?: string },
    ) => PromiseLike<{ data?: unknown; error?: unknown }>;
  };
}

export interface CoachBlocksRow {
  id: string;
  user_id: string;
  payload: unknown;
  updated_at?: string | null;
}

export interface WeeklyReviewRow {
  id: string;
  user_id: string;
  payload: unknown;
  updated_at?: string | null;
}

export const coachBlocksRowId = (userId: string): string => `coach-blocks:${userId}`;
export const weeklyReviewRowId = (userId: string, weekMonday: string): string =>
  `weekly-review:${userId}:${weekMonday}`;

/** The empty coach state, as stored by getInitialCoachBlocksState(). */
export const EMPTY_COACH_BLOCKS: CoachBlocksState = {
  pendingProposal: null,
  activeBlock: null,
  pastBlocks: [],
  adoptedPlans: {},
  plateauProposals: [],
};

export function isInitialCoachBlocks(state: unknown): boolean {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return true;
  const s = state as Partial<CoachBlocksState>;
  return (
    s.pendingProposal == null &&
    s.activeBlock == null &&
    (!Array.isArray(s.pastBlocks) || s.pastBlocks.length === 0) &&
    (!s.adoptedPlans || Object.keys(s.adoptedPlans).length === 0) &&
    (!Array.isArray(s.plateauProposals) || s.plateauProposals.length === 0)
  );
}

/**
 * Validate + normalize a coach_blocks payload. Malformed payloads are
 * dropped (null) rather than merged — a corrupt server row must never
 * wipe a valid local state.
 */
export function parseCoachBlocksPayload(payload: unknown): CoachBlocksState | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const p = payload as Partial<CoachBlocksState> & Record<string, unknown>;
  return {
    ...EMPTY_COACH_BLOCKS,
    ...p,
    pendingProposal: (p.pendingProposal as CoachBlocksState['pendingProposal']) ?? null,
    activeBlock: (p.activeBlock as CoachBlocksState['activeBlock']) ?? null,
    pastBlocks: Array.isArray(p.pastBlocks) ? p.pastBlocks : [],
    adoptedPlans:
      p.adoptedPlans && typeof p.adoptedPlans === 'object' && !Array.isArray(p.adoptedPlans)
        ? (p.adoptedPlans as CoachBlocksState['adoptedPlans'])
        : {},
    plateauProposals: Array.isArray(p.plateauProposals) ? p.plateauProposals : [],
  };
}

/** A weekly review is only usable if it carries its week key. */
export function parseWeeklyReviewPayload(payload: unknown): WeeklyReview | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const p = payload as Partial<WeeklyReview>;
  if (typeof p.weekMonday !== 'string' || !p.weekMonday) return null;
  return payload as WeeklyReview;
}

/**
 * True when an error means "this table does not exist yet" (the user
 * has not run the migration). PostgREST returns PGRST205 for a missing
 * table; Postgres itself reports 42P01 / "relation … does not exist".
 * Any other error is a real failure, not a pending-setup signal.
 */
export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === 'PGRST205' || e.code === '42P01' || e.code === 'PGRST204') {
    // PGRST204 (missing column) is NOT a missing table — but a table
    // created by an older/incomplete migration run surfaces the same
    // way; only treat it as pending-setup when the message also names
    // the table itself. Keep the check narrow to avoid masking errors.
    if (e.code === 'PGRST204') return false;
    return true;
  }
  const msg = typeof e.message === 'string' ? e.message : '';
  return (
    /relation .* does not exist/i.test(msg) ||
    /could not find the table/i.test(msg) ||
    /table .* does not exist/i.test(msg)
  );
}

// ---------------------------------------------------------------------------
// "Coach sync pending setup" flag (runtime only — re-derived on every sync)
// ---------------------------------------------------------------------------

let coachSyncPendingSetup = false;

export function isCoachSyncPendingSetup(): boolean {
  return coachSyncPendingSetup;
}

/** Test-only reset; production code never needs to clear the flag by hand. */
export function resetCoachSyncPendingSetupForTests(): void {
  coachSyncPendingSetup = false;
}

function setPendingSetup(value: boolean): void {
  coachSyncPendingSetup = value;
}

// ---------------------------------------------------------------------------
// Local edit stamps (localStorage, best-effort, never throws)
// ---------------------------------------------------------------------------

export function loadCoachSyncMeta(): CoachSyncMeta {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(COACH_SYNC_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<CoachSyncMeta>;
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      coachBlocksUpdatedAt:
        typeof parsed.coachBlocksUpdatedAt === 'string' ? parsed.coachBlocksUpdatedAt : undefined,
      weeklyReviewsUpdatedAt:
        parsed.weeklyReviewsUpdatedAt && typeof parsed.weeklyReviewsUpdatedAt === 'object'
          ? (parsed.weeklyReviewsUpdatedAt as Record<string, string>)
          : {},
    };
  } catch {
    return {};
  }
}

export function saveCoachSyncMeta(meta: CoachSyncMeta): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COACH_SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    /* local-first: a failed stamp write must never break the app */
  }
}

/** Merge stamp updates into the stored meta. */
export function setCoachSyncStamps(partial: CoachSyncMeta): void {
  const meta = loadCoachSyncMeta();
  saveCoachSyncMeta({
    coachBlocksUpdatedAt: partial.coachBlocksUpdatedAt ?? meta.coachBlocksUpdatedAt,
    weeklyReviewsUpdatedAt: {
      ...(meta.weeklyReviewsUpdatedAt ?? {}),
      ...(partial.weeklyReviewsUpdatedAt ?? {}),
    },
  });
}

/**
 * Record a local edit: called by sync.ts when the coach slices change.
 * Only slices whose serialized content actually changed get a fresh
 * stamp, so an unrelated edit does not make every review "locally newer".
 */
export function recordCoachLocalChanges(
  prevCoachBlocks: unknown,
  prevWeeklyReviews: readonly unknown[] | undefined,
  nextCoachBlocks: unknown,
  nextWeeklyReviews: readonly unknown[] | undefined,
): CoachSyncMeta {
  const meta = loadCoachSyncMeta();
  const now = new Date().toISOString();
  const nextMeta: CoachSyncMeta = {
    coachBlocksUpdatedAt: meta.coachBlocksUpdatedAt,
    weeklyReviewsUpdatedAt: { ...(meta.weeklyReviewsUpdatedAt ?? {}) },
  };
  try {
    if (JSON.stringify(prevCoachBlocks ?? null) !== JSON.stringify(nextCoachBlocks ?? null)) {
      nextMeta.coachBlocksUpdatedAt = now;
    }
  } catch {
    /* unserializable state: leave the stamp alone */
  }
  const prevByWeek = new Map<string, string>();
  for (const r of prevWeeklyReviews ?? []) {
    try {
      const parsed = parseWeeklyReviewPayload(r);
      if (parsed) prevByWeek.set(parsed.weekMonday, JSON.stringify(r));
    } catch {
      /* ignore */
    }
  }
  const stamps: Record<string, string> = {};
  for (const r of nextWeeklyReviews ?? []) {
    try {
      const parsed = parseWeeklyReviewPayload(r);
      if (!parsed) continue;
      if (prevByWeek.get(parsed.weekMonday) !== JSON.stringify(r)) stamps[parsed.weekMonday] = now;
    } catch {
      /* ignore */
    }
  }
  nextMeta.weeklyReviewsUpdatedAt = {
    ...Object.fromEntries(
      Object.entries(nextMeta.weeklyReviewsUpdatedAt ?? {}).filter(([week]) =>
        (nextWeeklyReviews ?? []).some((r) => {
          try {
            return parseWeeklyReviewPayload(r)?.weekMonday === week;
          } catch {
            return false;
          }
        }),
      ),
    ),
    ...stamps,
  };
  saveCoachSyncMeta(nextMeta);
  return nextMeta;
}

// ---------------------------------------------------------------------------
// Content signature (same FNV-1a idea as sync.ts collectionSignature,
// kept here to avoid a sync.ts <-> coach-sync.ts import cycle)
// ---------------------------------------------------------------------------

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function coachSyncSignature(
  coachBlocks: unknown,
  weeklyReviews: readonly unknown[] | undefined,
): string {
  let blocks = 'null';
  let reviews = '[]';
  try {
    blocks = JSON.stringify(coachBlocks ?? null) ?? 'null';
  } catch {
    /* fall back to the null signature */
  }
  try {
    reviews = JSON.stringify(weeklyReviews ?? []) ?? '[]';
  } catch {
    /* fall back to the empty signature */
  }
  return `${fnv1a(blocks)}:${fnv1a(reviews)}`;
}

// ---------------------------------------------------------------------------
// Pure merge (last-write-wins) — unit-testable without any client
// ---------------------------------------------------------------------------

function isNewer(remoteUpdatedAt: string | null | undefined, localUpdatedAt: string | undefined): boolean {
  if (!remoteUpdatedAt || !localUpdatedAt) return false;
  const remote = Date.parse(remoteUpdatedAt);
  const local = Date.parse(localUpdatedAt);
  if (Number.isNaN(remote) || Number.isNaN(local)) return false;
  return remote > local;
}

export interface MergeCoachBlocksResult {
  merged: CoachBlocksState;
  changed: boolean;
  /** Server stamp to adopt when the server row won, else undefined. */
  adoptedUpdatedAt?: string;
}

export function mergeCoachBlocks(
  local: unknown,
  localUpdatedAt: string | undefined,
  remoteRow: CoachBlocksRow | null | undefined,
): MergeCoachBlocksResult {
  const localState = parseCoachBlocksPayload(local) ?? EMPTY_COACH_BLOCKS;
  if (!remoteRow) return { merged: localState, changed: false };
  const remote = parseCoachBlocksPayload(remoteRow.payload);
  if (!remote) return { merged: localState, changed: false };
  // Empty local state adopts the server row even without a stamp.
  if (isInitialCoachBlocks(local)) {
    const changed = JSON.stringify(remote) !== JSON.stringify(localState);
    return { merged: remote, changed, adoptedUpdatedAt: remoteRow.updated_at ?? undefined };
  }
  // Non-empty local state with no stamp: keep local (see header).
  if (!localUpdatedAt) return { merged: localState, changed: false };
  if (isNewer(remoteRow.updated_at, localUpdatedAt)) {
    return { merged: remote, changed: true, adoptedUpdatedAt: remoteRow.updated_at ?? undefined };
  }
  return { merged: localState, changed: false };
}

export interface MergeWeeklyReviewsResult {
  merged: WeeklyReview[];
  changed: boolean;
  /** Server stamps to adopt for weeks the server row won, keyed by week. */
  adoptedUpdatedAt: Record<string, string>;
}

export function mergeWeeklyReviews(
  local: readonly unknown[] | undefined,
  localStamps: Record<string, string> | undefined,
  remoteRows: readonly WeeklyReviewRow[] | undefined,
): MergeWeeklyReviewsResult {
  const localReviews: WeeklyReview[] = [];
  for (const r of local ?? []) {
    const parsed = parseWeeklyReviewPayload(r);
    if (parsed) localReviews.push(parsed);
  }
  const byWeek = new Map<string, WeeklyReview>();
  for (const r of localReviews) byWeek.set(r.weekMonday, r);
  const adopted: Record<string, string> = {};
  let changed = false;
  for (const row of remoteRows ?? []) {
    const remote = parseWeeklyReviewPayload(row.payload);
    if (!remote) continue;
    const existing = byWeek.get(remote.weekMonday);
    if (!existing) {
      byWeek.set(remote.weekMonday, remote);
      changed = true;
      if (row.updated_at) adopted[remote.weekMonday] = row.updated_at;
    } else if (localStamps?.[remote.weekMonday] && isNewer(row.updated_at, localStamps[remote.weekMonday])) {
      byWeek.set(remote.weekMonday, remote);
      changed = true;
      if (row.updated_at) adopted[remote.weekMonday] = row.updated_at;
    }
    // No stamp for an existing local review, or local stamp newer/equal:
    // keep local. A missing server row never deletes a local review.
  }
  // Store cap (mirror refreshWeeklyReview): keep the latest 12 weeks.
  const merged = [...byWeek.values()]
    .sort((a, b) => (a.weekMonday < b.weekMonday ? -1 : a.weekMonday > b.weekMonday ? 1 : 0))
    .slice(-12);
  if (merged.length !== localReviews.length) changed = changed || merged.length !== byWeek.size;
  return { merged, changed, adoptedUpdatedAt: adopted };
}

// ---------------------------------------------------------------------------
// Pull / push (client-facing, never throws)
// ---------------------------------------------------------------------------

export interface PullCoachStateResult {
  skipped: boolean;
  pendingSetup: boolean;
  changed: boolean;
  coachBlocks: CoachBlocksState;
  weeklyReviews: WeeklyReview[];
  /** Parsed server state, for cross-account replacement in sync.ts. */
  remoteCoachBlocks: CoachBlocksState | null;
  remoteWeeklyReviews: WeeklyReview[];
  remoteCoachBlocksUpdatedAt?: string;
  remoteWeeklyReviewUpdatedAt: Record<string, string>;
  adoptedCoachBlocksUpdatedAt?: string;
  adoptedWeeklyReviewUpdatedAt: Record<string, string>;
}

export async function pullCoachState(
  client: CoachSyncClient | null | undefined,
  userId: string | undefined | null,
  local: { coachBlocks: unknown; weeklyReviews: readonly unknown[] | undefined },
  meta: CoachSyncMeta = {},
): Promise<PullCoachStateResult> {
  const localBlocks = parseCoachBlocksPayload(local.coachBlocks) ?? EMPTY_COACH_BLOCKS;
  const localReviews: WeeklyReview[] = [];
  for (const r of local.weeklyReviews ?? []) {
    const parsed = parseWeeklyReviewPayload(r);
    if (parsed) localReviews.push(parsed);
  }
  const base: PullCoachStateResult = {
    skipped: false,
    pendingSetup: false,
    changed: false,
    coachBlocks: localBlocks,
    weeklyReviews: localReviews,
    remoteCoachBlocks: null,
    remoteWeeklyReviews: [],
    remoteWeeklyReviewUpdatedAt: {},
    adoptedWeeklyReviewUpdatedAt: {},
  };
  if (!client || !userId) return { ...base, skipped: true };
  try {
    const [blocksRes, reviewsRes] = await Promise.all([
      client.from(COACH_BLOCKS_TABLE).select('*').eq('user_id', userId),
      client.from(WEEKLY_REVIEWS_TABLE).select('*').eq('user_id', userId),
    ]);
    const blocksMissing = isMissingTableError(blocksRes.error);
    const reviewsMissing = isMissingTableError(reviewsRes.error);
    const pendingSetup = blocksMissing || reviewsMissing;
    if (pendingSetup) setPendingSetup(true);
    else if (!blocksRes.error && !reviewsRes.error) setPendingSetup(false);
    if (blocksRes.error && !blocksMissing) {
      console.warn('Coach sync pull (coach_blocks) failed:', (blocksRes.error as { message?: string })?.message ?? blocksRes.error);
    }
    if (reviewsRes.error && !reviewsMissing) {
      console.warn('Coach sync pull (weekly_reviews) failed:', (reviewsRes.error as { message?: string })?.message ?? reviewsRes.error);
    }
    const blocksRows = !blocksRes.error && Array.isArray(blocksRes.data) ? (blocksRes.data as CoachBlocksRow[]) : [];
    const reviewsRows = !reviewsRes.error && Array.isArray(reviewsRes.data) ? (reviewsRes.data as WeeklyReviewRow[]) : [];
    const remoteBlocks = blocksRows.length > 0 ? parseCoachBlocksPayload(blocksRows[0].payload) : null;
    const remoteReviews: WeeklyReview[] = [];
    const remoteReviewStamps: Record<string, string> = {};
    for (const row of reviewsRows) {
      const parsed = parseWeeklyReviewPayload(row.payload);
      if (parsed) {
        remoteReviews.push(parsed);
        if (row.updated_at) remoteReviewStamps[parsed.weekMonday] = row.updated_at;
      }
    }
    const blocksMerge = mergeCoachBlocks(local.coachBlocks, meta.coachBlocksUpdatedAt, blocksRows[0] ?? null);
    const reviewsMerge = mergeWeeklyReviews(local.weeklyReviews, meta.weeklyReviewsUpdatedAt, reviewsRows);
    return {
      skipped: false,
      pendingSetup,
      changed: blocksMerge.changed || reviewsMerge.changed,
      coachBlocks: blocksMerge.merged,
      weeklyReviews: reviewsMerge.merged,
      remoteCoachBlocks: remoteBlocks,
      remoteWeeklyReviews: remoteReviews,
      remoteCoachBlocksUpdatedAt: blocksRows[0]?.updated_at ?? undefined,
      remoteWeeklyReviewUpdatedAt: remoteReviewStamps,
      adoptedCoachBlocksUpdatedAt: blocksMerge.adoptedUpdatedAt,
      adoptedWeeklyReviewUpdatedAt: reviewsMerge.adoptedUpdatedAt,
    };
  } catch (err) {
    if (isMissingTableError(err)) {
      setPendingSetup(true);
      return { ...base, pendingSetup: true };
    }
    console.warn('Coach sync pull failed:', err);
    return base;
  }
}

export interface PushCoachStateResult {
  skipped: boolean;
  pendingSetup: boolean;
  pushedCoachBlocks: boolean;
  pushedReviewCount: number;
  pushedUpdatedAt?: string;
  pushedWeeklyReviewUpdatedAt: Record<string, string>;
}

export function coachBlocksRowForPush(userId: string, coachBlocks: unknown, updatedAt: string): CoachBlocksRow | null {
  if (isInitialCoachBlocks(coachBlocks)) return null;
  const payload = parseCoachBlocksPayload(coachBlocks);
  if (!payload) return null;
  return { id: coachBlocksRowId(userId), user_id: userId, payload, updated_at: updatedAt };
}

export function weeklyReviewRowsForPush(
  userId: string,
  weeklyReviews: readonly unknown[] | undefined,
  updatedAt: string,
): WeeklyReviewRow[] {
  const rows: WeeklyReviewRow[] = [];
  for (const r of weeklyReviews ?? []) {
    const parsed = parseWeeklyReviewPayload(r);
    if (!parsed) continue;
    rows.push({ id: weeklyReviewRowId(userId, parsed.weekMonday), user_id: userId, payload: parsed, updated_at: updatedAt });
  }
  return rows;
}

export async function pushCoachState(
  client: CoachSyncClient | null | undefined,
  userId: string | undefined | null,
  coachBlocks: unknown,
  weeklyReviews: readonly unknown[] | undefined,
): Promise<PushCoachStateResult> {
  const base: PushCoachStateResult = {
    skipped: false,
    pendingSetup: false,
    pushedCoachBlocks: false,
    pushedReviewCount: 0,
    pushedWeeklyReviewUpdatedAt: {},
  };
  if (!client || !userId) return { ...base, skipped: true };
  const now = new Date().toISOString();
  const blocksRow = coachBlocksRowForPush(userId, coachBlocks, now);
  const reviewRows = weeklyReviewRowsForPush(userId, weeklyReviews, now);
  // Nothing to push (initial blocks are never pushed — see header; an
  // empty review list is not a deletion signal either).
  if (!blocksRow && reviewRows.length === 0) return base;
  try {
    const results = await Promise.all([
      blocksRow
        ? client.from(COACH_BLOCKS_TABLE).upsert([blocksRow as unknown as Record<string, unknown>], { onConflict: 'id' })
        : Promise.resolve({ error: null }),
      reviewRows.length > 0
        ? client.from(WEEKLY_REVIEWS_TABLE).upsert(reviewRows as unknown as Record<string, unknown>[], { onConflict: 'id' })
        : Promise.resolve({ error: null }),
    ]);
    const [blocksRes, reviewsRes] = results;
    const pendingSetup = isMissingTableError(blocksRes.error) || isMissingTableError(reviewsRes.error);
    if (pendingSetup) {
      setPendingSetup(true);
      return { ...base, pendingSetup: true };
    }
    if (blocksRes.error) {
      console.warn('Coach sync push (coach_blocks) failed:', (blocksRes.error as { message?: string })?.message ?? blocksRes.error);
    } else if (blocksRow) {
      base.pushedCoachBlocks = true;
      base.pushedUpdatedAt = now;
    }
    if (reviewsRes.error) {
      console.warn('Coach sync push (weekly_reviews) failed:', (reviewsRes.error as { message?: string })?.message ?? reviewsRes.error);
    } else if (reviewRows.length > 0) {
      base.pushedReviewCount = reviewRows.length;
      for (const row of reviewRows) {
        const parsed = parseWeeklyReviewPayload(row.payload);
        if (parsed) base.pushedWeeklyReviewUpdatedAt[parsed.weekMonday] = now;
      }
    }
    if (!blocksRes.error && !reviewsRes.error) setPendingSetup(false);
    return base;
  } catch (err) {
    if (isMissingTableError(err)) {
      setPendingSetup(true);
      return { ...base, pendingSetup: true };
    }
    console.warn('Coach sync push failed:', err);
    return base;
  }
}
