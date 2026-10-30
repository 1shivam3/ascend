import { getSupabase } from './client';
import { normalizeDateToLocalDay } from '../formatters';
import { useStore, resolveAvatar, buildFreshHistoryState, PROGRESS_PHOTOS_KEY } from '../store';
import { getTabLeaderGuard } from '../tab-leader';
import { UserProfile, PersonalRecord, WorkoutEntry, MealEntry, BodyMetricEntry, PlannedWorkout } from '../types';
import {
  mergeRemotePlans,
  mergeRemoteRecords,
  dedupeBodyMetricsByDate,
  prunableTombstones,
  tombstonedIdsToDelete,
  isLocalProfileNewer,
  buildPlanExtras,
  planFieldsFromExtras,
  recomputePullSlices,
  filterRowsForPush,
  shouldPushRow,
  shouldDropStaleProfileUpdate,
  type PullSliceKey,
} from './reconcile';
import { isCrossAccountSwitch as isCrossAccountSwitchFn, decideStartFreshGate } from '../start-fresh-guard';

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

export type SyncStatus = 'unconfigured' | 'offline' | 'idle' | 'syncing' | 'synced' | 'error';

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
}

export function syncedStateSignature(state: SyncedStateSlice): string {
  return [
    collectionSignature([state.profile]),
    collectionSignature(state.prs),
    collectionSignature(state.workouts),
    collectionSignature(state.meals),
    collectionSignature(state.bodyMetrics),
    collectionSignature(state.plannedWorkouts),
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
    prev.plannedWorkouts === next.plannedWorkouts
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

export function readLastPushedSignature(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(LAST_PUSHED_SIGNATURE_KEY);
  } catch {
    return null;
  }
}

export function writeLastPushedSignature(signature: string): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LAST_PUSHED_SIGNATURE_KEY, signature);
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

class SupabaseSyncEngine {
  private status: SyncStatus = 'unconfigured';
  private lastSyncedAt: string | null = null;
  private errorMessage: string | null = null;
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
            localStorage.removeItem('ascend_logged_out');
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
        this.notify();
      }
    });

    // Listen to local store changes for debounced push.
    // QA4-018: content-aware — ANY change to the 6 synced collections
    // (including same-length edits like updateMeal / updatePR /
    // updatePlannedWorkout / same-day metric replacement) schedules
    // the push, not just length changes. hasSyncedContentChanged has
    // a reference fast path, so unrelated state churn costs ~nothing.
    useStore.subscribe((state, prevState) => {
      if (!this.initialized || this.isSyncing) return;
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
        localStorage.removeItem('ascend_logged_out');
      } catch {}
    }
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
        localStorage.removeItem('ascend_logged_out');
      } catch {}
    }
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
        localStorage.removeItem('ascend_logged_out');
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
    password: string
  ): Promise<{ error?: string; user?: AuthUser }> {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('ascend_logged_out');
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
        await this.triggerSyncNow();
        return { user: this.currentUser };
      }
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Login failed' };
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
        localStorage.removeItem('ascend_logged_out');
      } catch {}
    }
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
        localStorage.removeItem('ascend_logged_out');
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
    this.status = 'unconfigured';
    this.notify();

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('ascend_logged_out', 'true');
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
         localStorage.setItem('ascend_logged_out', 'true');
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

  private scheduleDebouncedPush() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.syncPush();
    }, 2500);
  }

  public async triggerSyncNow() {
    // Deduplicate concurrent sync calls by returning the in-flight promise
    if (this.pendingSyncPromise) {
      return this.pendingSyncPromise;
    }

    if (typeof window !== 'undefined' && localStorage.getItem('ascend_logged_out') === 'true') {
      const supabaseClient = getSupabase();
      let hasActiveSession = false;
      if (supabaseClient) {
        try {
          const { data: { session } } = await supabaseClient.auth.getSession();
          if (session?.user) {
            hasActiveSession = true;
            localStorage.removeItem('ascend_logged_out');
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
      // 1. Ensure active session
      const userRes = await supabase.auth.getUser().catch(() => null);
      const user = userRes?.data?.user;

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

      const localState = useStore.getState();

      // Detect if the existing local profile belongs to a DIFFERENT authenticated account.
      // F20 (audit): guest profiles (guest_ ids from getOrCreateGuestId,
      // plus the legacy user_ form) are NOT switches — they route to the
      // merge (guest-migration) branch. Only a non-guest id different
      // from the session user is a switch (replace branch). This half
      // is safe only together with the sign-out-first gate in
      // startFreshAfterVerifiedSignOut: without it, a signed-in
      // Start-fresh would merge while a session is still live.
      const isCrossAccountSwitch = isCrossAccountSwitchFn(localState.profile?.id, user.id);

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
            name: rp.name,
            gender: rp.gender,
            bodyweightKg: Number(rp.bodyweight_kg) || 75,
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
          name: extractedName || '',
          gender: 'male',
          bodyweightKg: 75,
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
      // Explicitly id-shaped: the recompute only relies on `.id` and
      // reference preservation, so the five differently-typed slices
      // share one input type instead of forcing a single record type.
      const freshInput: Record<PullSliceKey, { local: { id: string }[]; tombstones: Iterable<string> }> = {
        prs: { local: freshState.prs || [], tombstones: freshState.deletedPrIds || [] },
        workouts: { local: freshState.workouts || [], tombstones: freshState.deletedWorkoutIds || [] },
        meals: { local: freshState.meals || [], tombstones: freshState.deletedMealIds || [] },
        bodyMetrics: { local: freshState.bodyMetrics || [], tombstones: freshState.deletedBodyMetricIds || [] },
        plannedWorkouts: { local: freshState.plannedWorkouts || [], tombstones: freshState.deletedPlanIds || [] },
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
            readLastPushedSignature(),
            syncedStateSignature({
              profile: freshState.profile,
              prs: freshState.prs || [],
              workouts: freshState.workouts || [],
              meals: freshState.meals || [],
              bodyMetrics: freshState.bodyMetrics || [],
              plannedWorkouts: freshState.plannedWorkouts || [],
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
      // The captured needsLocalUpdate reflects pre-round-trip state;
      // the only thing that matters now is whether updates still has keys.
      needsLocalUpdate = Object.keys(updates).length > 0;
      if (needsLocalUpdate) {
        useStore.setState(updates);
      }

      // 4. Push Local -> Cloud (Initial Migration or Incremental Updates)
      if (!isCrossAccountSwitch) {
        await this.pushLocalData(user.id);
      }

      this.status = 'synced';
      this.lastSyncedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.notify();
     } catch (err: any) {
      console.error('Supabase sync error:', err);
      this.status = 'error';
      this.errorMessage = err?.message || 'Sync failed';
      this.notify();
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
   * Body-metric upsert with the DI-02 missing-column retry, applied
   * ONLY to gate-passing rows. Extracted from pushLocalData so the
   * R1/DI-08 gate can run first without duplicating the retry.
   */
  private async pushBodyMetricRows(
    rows: BodyMetricEntry[],
    userId: string,
    record: (e: { message?: string } | null | undefined) => void,
  ): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) return;
    const metricRows = rows.map((b) => bodyMetricRowForPush(b, userId));
    const { error: metricUpsertError } = await supabase.from('body_metrics').upsert(metricRows, { onConflict: 'id' });
    if (metricUpsertError) {
      // Gauntlet DI-02: measurement columns exist only after the
      // 2026102801 migration. Pre-migration, PostgREST rejects rows
      // carrying them — retry without them (same missing-column
      // pattern as planned_workouts extras). Any other error is
      // recorded, never masked by the retry.
      const errMsg = metricUpsertError.message || '';
      const missingMeasurementColumn =
        metricUpsertError.code === 'PGRST204' || metricUpsertError.code === '42703' ||
        /column .* does not exist/i.test(errMsg) ||
        /could not find the .* column/i.test(errMsg);
      if (missingMeasurementColumn) {
        const bareRows = metricRows.map(({ body_fat_pct: _bf, chest_in: _c, waist_in: _w, hips_in: _h, ...rest }) => rest);
        const { error: bareError } = await supabase.from('body_metrics').upsert(bareRows, { onConflict: 'id' });
        record(bareError);
      } else {
        record(metricUpsertError);
      }
    }
  }

  /**
   * Plan upsert with the QA4-006 extras missing-column retry, applied
   * ONLY to gate-passing rows. Extracted from pushLocalData so the
   * R1/DI-08 gate can run first without duplicating the retry.
   */
  private async pushPlanRows(
    rows: PlannedWorkout[],
    userId: string,
    record: (e: { message?: string } | null | undefined) => void,
  ): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) return;
    const planRows = rows.map((p) => ({
      id: p.id,
      user_id: userId,
      name: p.name,
      exercises: p.exercises || [],
      // Own stamp, not `now` (see the profile comment in pushLocalData).
      updated_at: p.updatedAt || new Date().toISOString(),
      extras: buildPlanExtras(p) ?? null,
    }));
    const { error: planUpsertError } = await supabase
      .from('planned_workouts')
      .upsert(planRows, { onConflict: 'id' });
    if (planUpsertError) {
      // LOOP-2: the bare retry exists ONLY for the pre-migration case
      // where the `extras` column itself is missing. Any other error
      // must not be masked by a silent retry without extras.
      const errMsg = planUpsertError.message || '';
      const missingExtrasColumn =
        planUpsertError.code === 'PGRST204' ||
        planUpsertError.code === '42703' ||
        /column .* does not exist/i.test(errMsg) ||
        /could not find the .* column/i.test(errMsg);
      if (missingExtrasColumn) {
        const bareRows = planRows.map(({ extras: _extras, ...rest }) => rest);
        const { error: bareError } = await supabase.from('planned_workouts').upsert(bareRows, { onConflict: 'id' });
        record(bareError);
      } else {
        console.error('Supabase planned_workouts upsert error:', planUpsertError);
        record(planUpsertError);
      }
    }
  }

  private async pushLocalData(userId: string) {
    const supabase = getSupabase();
    if (!supabase) return;

    const state = useStore.getState();

    // F29 (audit): upsert errors used to be swallowed (the calls below
    // never inspected `{ error }`), yet syncPush reported 'synced'
    // regardless. Record the first failure across all steps, attempt
    // every step anyway, and throw at the end so both callers report
    // 'error' instead of a false 'synced'. Deletion propagation (step 7)
    // is deliberately excluded: it is best-effort by design and keeps
    // its tombstones for retry on the next push.
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
    // RESIDUAL (scope boundary, edits only): explicit deletions are
    // NOT stamp-gated — propagateAllDeletions below deletes tombstoned
    // remote rows regardless of stamps, so a newer remote edit can
    // still lose to an older local delete. Tombstone propagation is
    // unchanged by design.
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
        const { toUpsert } = filterRowsForPush(state.prs, prStamps);
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
          const { error: prError } = await supabase.from('personal_records').upsert(prRows, { onConflict: 'id' });
          record(prError);
        }
      }
    }

    // 3. Workouts
    if (state.workouts && state.workouts.length > 0) {
      const workoutStamps = await this.fetchRemoteStamps('workouts', 'user_id', userId);
      if (workoutStamps === null) {
        record({ message: 'Could not read remote workout stamps; workout push skipped' });
      } else {
        const { toUpsert } = filterRowsForPush(state.workouts, workoutStamps);
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
          const { error: workoutError } = await supabase.from('workouts').upsert(workoutRows, { onConflict: 'id' });
          record(workoutError);
        }
      }
    }

    // 4. Meals
    if (state.meals && state.meals.length > 0) {
      const mealStamps = await this.fetchRemoteStamps('meals', 'user_id', userId);
      if (mealStamps === null) {
        record({ message: 'Could not read remote meal stamps; meal push skipped' });
      } else {
        const { toUpsert } = filterRowsForPush(state.meals, mealStamps);
        if (toUpsert.length > 0) {
          const mealRows = toUpsert.map((m) => ({
            id: m.id,
            user_id: userId,
            name: m.name,
            date: m.date,
            foods: m.foods || [],
            updated_at: m.updatedAt || new Date().toISOString(),
          }));
          const { error: mealError } = await supabase.from('meals').upsert(mealRows, { onConflict: 'id' });
          record(mealError);
        }
      }
    }

    // 5. Body Metrics (gated; bodyMetricRowForPush already carries
    // each entry's own stamp, defaulting to `now` only for
    // stamp-less rows, which reach here solely when absent remotely).
    if (state.bodyMetrics && state.bodyMetrics.length > 0) {
      const metricStamps = await this.fetchRemoteStamps('body_metrics', 'user_id', userId);
      if (metricStamps === null) {
        record({ message: 'Could not read remote body-metric stamps; body-metric push skipped' });
      } else {
        const { toUpsert } = filterRowsForPush(state.bodyMetrics, metricStamps);
        if (toUpsert.length > 0) {
          await this.pushBodyMetricRows(toUpsert, userId, record);
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
        const { toUpsert } = filterRowsForPush(state.plannedWorkouts, planStamps);
        if (toUpsert.length > 0) {
          await this.pushPlanRows(toUpsert, userId, record);
        }
      }
    }
    // 7. Deletion propagation: the push path historically only upserted,
    // so a locally deleted record stayed on the server forever and the
    // union pull-merge resurrected it on the next sync. Delete exactly the
    // tombstoned records (explicit user deletions) — a full local reset
    // clears tombstones without reaching this path, so a "reset" never
    // wipes the cloud copy.
    await this.propagateAllDeletions(userId);

    // F29: surface the first upsert failure instead of reporting 'synced'.
    if (firstError.current) {
      throw new Error(`Supabase push failed: ${firstError.current.message || 'unknown error'}`);
    }

    // F28: the push succeeded, so record the signature of the state
    // just pushed (captured `state`, not fresh state — an edit made
    // mid-push must NOT be folded into the pushed signature, or the
    // next pull would adopt over it). A later pull adopts remote edits
    // only while the fresh local signature still equals this value.
    writeLastPushedSignature(
      syncedStateSignature({
        profile: state.profile,
        prs: state.prs || [],
        workouts: state.workouts || [],
        meals: state.meals || [],
        bodyMetrics: state.bodyMetrics || [],
        plannedWorkouts: state.plannedWorkouts || [],
      }),
    );
  }

  /**
   * Delete the tombstoned rows of ONE table server-side. Fail-safe: on
   * any uncertainty, delete nothing. Only ids that are (a) gone locally,
   * (b) still on the server and (c) explicitly tombstoned are deleted —
   * a plain local/server diff alone never deletes (a reset must not wipe
   * the cloud copy).
   */
  private async propagateDeletions(
    userId: string,
    table: string,
    tombstones: string[],
    localIds: Set<string>,
    clearTombstones: (ids: string[]) => void,
  ): Promise<void> {
    try {
      if (tombstones.length === 0) return;
      const supabase = getSupabase();
      if (!supabase) return;
      // DI2-1: paged — with a truncated id list, a tombstoned row past
      // the cap looks deleted and its tombstone gets pruned, so the
      // next pull resurrects the record.
      const { data, error } = await fetchAllUserRowsPaged(supabase, table, 'id', 'user_id', userId);
      if (error) return;
      const remoteIds = (data || []).map((r: any) => r.id as string);
      const toDelete = tombstonedIdsToDelete(localIds, remoteIds, tombstones);
      if (toDelete.length > 0) {
        const { error: delError } = await supabase
          .from(table)
          .delete()
          .eq('user_id', userId)
          .in('id', toDelete);
        if (delError) return;
      }
      // Server confirms the deletions — prune those tombstones (a tombstone
      // for an id no longer on the server and not local is dead weight).
      const remainingRemoteIds = remoteIds.filter((id) => !toDelete.includes(id));
      const pruned = prunableTombstones(tombstones, localIds, remainingRemoteIds);
      if (pruned.length > 0) clearTombstones(pruned);
    } catch {
      // Offline or unexpected — never block the push on this.
    }
  }

  /** Propagate explicit deletions for every synced entity (QA4-001). */
  private async propagateAllDeletions(userId: string): Promise<void> {
    const s = useStore.getState();
    await this.propagateDeletions(
      userId,
      'planned_workouts',
      s.deletedPlanIds || [],
      new Set((s.plannedWorkouts || []).map((p) => p.id)),
      (ids) => useStore.getState().clearDeletedPlanIds(ids),
    );
    await this.propagateDeletions(
      userId,
      'personal_records',
      s.deletedPrIds || [],
      new Set((s.prs || []).map((p) => p.id)),
      (ids) => useStore.getState().clearDeletedPrIds(ids),
    );
    await this.propagateDeletions(
      userId,
      'workouts',
      s.deletedWorkoutIds || [],
      new Set((s.workouts || []).map((w) => w.id)),
      (ids) => useStore.getState().clearDeletedWorkoutIds(ids),
    );
    await this.propagateDeletions(
      userId,
      'meals',
      s.deletedMealIds || [],
      new Set((s.meals || []).map((m) => m.id)),
      (ids) => useStore.getState().clearDeletedMealIds(ids),
    );
    await this.propagateDeletions(
      userId,
      'body_metrics',
      s.deletedBodyMetricIds || [],
      new Set((s.bodyMetrics || []).map((b) => b.id)),
      (ids) => useStore.getState().clearDeletedBodyMetricIds(ids),
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
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await this.pushLocalData(user.id);
        this.status = 'synced';
        this.lastSyncedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.notify();
      } catch (err: any) {
        // F29: a failed push used to leave the previous (usually
        // 'synced') status in place. Report the failure honestly; the
        // UI renders 'error' from this status.
        console.warn('Background sync push warning:', err?.message);
        this.status = 'error';
        this.errorMessage = err?.message || 'Sync failed';
        this.notify();
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
