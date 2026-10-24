import { getSupabase } from './client';
import { useStore, resolveAvatar } from '../store';
import { getTabLeaderGuard } from '../tab-leader';
import { UserProfile, PersonalRecord, WorkoutEntry, MealEntry, BodyMetricEntry, PlannedWorkout } from '../types';
import {
  mergeRemotePlans,
  mergeRemoteRecords,
  prunableTombstones,
  tombstonedIdsToDelete,
  isLocalProfileNewer,
  buildPlanExtras,
  planFieldsFromExtras,
} from './reconcile';
import {
  pullCoachState,
  pushCoachState,
  recordCoachLocalChanges,
  loadCoachSyncMeta,
  setCoachSyncStamps,
  isCoachSyncPendingSetup,
  coachSyncSignature,
  EMPTY_COACH_BLOCKS,
} from './coach-sync';

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
    ...planFieldsFromExtras(r.extras),
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
  /** Phase 2 coach slices — optional so older callers/tests that build
   *  a slice without them keep typechecking; undefined = no coach state. */
  coachBlocks?: unknown;
  weeklyReviews?: readonly unknown[];
}

export function syncedStateSignature(state: SyncedStateSlice): string {
  return [
    collectionSignature([state.profile]),
    collectionSignature(state.prs),
    collectionSignature(state.workouts),
    collectionSignature(state.meals),
    collectionSignature(state.bodyMetrics),
    collectionSignature(state.plannedWorkouts),
    coachSyncSignature(state.coachBlocks, state.weeklyReviews),
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
    prev.coachBlocks === next.coachBlocks &&
    prev.weeklyReviews === next.weeklyReviews
  ) {
    return false;
  }
  return syncedStateSignature(prev) !== syncedStateSignature(next);
}

class SupabaseSyncEngine {
  private status: SyncStatus = 'unconfigured';
  private lastSyncedAt: string | null = null;
  private errorMessage: string | null = null;
  private currentUser: AuthUser | null = null;
  /** Phase 2: true when coach_blocks/weekly_reviews do not exist yet
   *  (migration not run) — surfaced to the UI as "coach sync pending
   *  setup", never as a whole-sync error. Mirrors the module flag in
   *  coach-sync.ts after every coach pull/push. */
  private coachSyncPendingSetup = false;
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
      coachSyncPendingSetup: this.coachSyncPendingSetup,
    };
  }

  private refreshCoachSyncPendingSetup() {
    this.coachSyncPendingSetup = isCoachSyncPendingSetup();
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

      // Phase 2: stamp local coach edits (per-item, in coach-sync.ts) so
      // the pull's last-write-wins comparison has a local timestamp.
      // Recorded even on the follower-tab path? No — suppressed above,
      // exactly like the push, so a follower never claims local edits.
      if (
        prevState.coachBlocks !== (state as any).coachBlocks ||
        prevState.weeklyReviews !== (state as any).weeklyReviews
      ) {
        try {
          recordCoachLocalChanges(
            (prevState as any).coachBlocks,
            (prevState as any).weeklyReviews,
            (state as any).coachBlocks,
            (state as any).weeklyReviews,
          );
        } catch {
          /* stamps are best-effort; never block the push */
        }
      }

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

      // 2. Pull remote records
      const [remoteProfile, remotePRs, remoteWorkouts, remoteMeals, remoteMetrics, remotePlans] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('personal_records').select('*').eq('user_id', user.id),
        supabase.from('workouts').select('*').eq('user_id', user.id),
        supabase.from('meals').select('*').eq('user_id', user.id),
        supabase.from('body_metrics').select('*').eq('user_id', user.id),
        supabase.from('planned_workouts').select('*').eq('user_id', user.id),
      ]);

      const localState = useStore.getState();

      // Phase 2 coach pull — run after the other pulls, against the
      // fresh local snapshot, so a concurrent local coach edit is not
      // clobbered by a stale snapshot. pullCoachState never throws and
      // never deletes: a missing table yields pendingSetup (local state
      // kept, whole sync NOT failed), and a missing server row is an
      // upsert candidate on push, not a local deletion.
      const coachPull = await pullCoachState(
        supabase as any,
        user.id,
        { coachBlocks: localState.coachBlocks, weeklyReviews: localState.weeklyReviews },
        loadCoachSyncMeta(),
      );
      this.refreshCoachSyncPendingSetup();

      // Detect if the existing local profile belongs to a DIFFERENT authenticated account
      const isCrossAccountSwitch = Boolean(
        localState.profile?.id &&
        localState.profile.id !== user.id &&
        !localState.profile.id.startsWith('user_')
      );

      // 3. Reconcile Cloud -> Local (Recovery on phone, device switch, or account switch)
      let needsLocalUpdate = false;
      const updates: any = {};

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
        // NOTE: the avatar lives only on this device (no avatar column in
        // cloud profiles) — always preserve the local one, otherwise every
        // sync wipes the user's profile picture. Same-account rebuilds also
        // spread the local profile first so any other device-local fields
        // survive; cross-account rebuilds start clean (no field leakage
        // from the previous account on this device).
        const rp = remoteProfile.data;
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
            avatar: isCrossAccountSwitch
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
          name: extractedName || 'Athlete',
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
        updates.prs = (remotePRs.data || []).map((r: any) => ({
          id: r.id,
          exercise: r.exercise,
          weightKg: Number(r.weight_kg),
          weightLbs: Number(r.weight_lbs),
          reps: Number(r.reps),
          oneRepMax: Number(r.one_rep_max),
          date: r.date,
          notes: r.notes || undefined,
        }));
        updates.workouts = (remoteWorkouts.data || []).map((r: any) => ({
          id: r.id,
          name: r.name || undefined,
          date: r.date,
          durationMinutes: r.duration_minutes || undefined,
          notes: r.notes || undefined,
          exercises: r.exercises || [],
        }));
        updates.meals = (remoteMeals.data || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          date: r.date,
          foods: r.foods || [],
        }));
        updates.bodyMetrics = (remoteMetrics.data || []).map((r: any) => ({
          id: r.id,
          date: r.date,
          weightKg: Number(r.weight_kg),
          heightCm: r.height_cm ? Number(r.height_cm) : undefined,
          notes: r.notes || undefined,
        }));
        updates.plannedWorkouts = (remotePlans.data || []).map(planFromRemoteRow);
        // Phase 2 coach: cross-account replaces outright (different
        // account's decisions, not an older copy of this one's). No
        // server row -> the initial/empty state, not a stale leftover.
        updates.coachBlocks = coachPull.remoteCoachBlocks ?? EMPTY_COACH_BLOCKS;
        updates.weeklyReviews = coachPull.remoteWeeklyReviews;
        if (coachPull.remoteCoachBlocksUpdatedAt) {
          setCoachSyncStamps({ coachBlocksUpdatedAt: coachPull.remoteCoachBlocksUpdatedAt });
        }
        setCoachSyncStamps({ weeklyReviewsUpdatedAt: coachPull.remoteWeeklyReviewUpdatedAt });
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
          }));
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
            date: r.date,
            durationMinutes: r.duration_minutes || undefined,
            notes: r.notes || undefined,
            exercises: r.exercises || [],
          }));
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
          }));
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
          const remoteMapped = remoteMetrics.data.map((r: any) => ({
            id: r.id,
            date: r.date,
            weightKg: Number(r.weight_kg),
            heightCm: r.height_cm ? Number(r.height_cm) : undefined,
            notes: r.notes || undefined,
          }));
          const { merged, changed } = mergeRemoteRecords(
            localState.bodyMetrics || [],
            remoteMapped,
            localState.deletedBodyMetricIds || []
          );
          if (changed) {
            updates.bodyMetrics = merged;
            needsLocalUpdate = true;
          }
        }

        // Merge Planned Workouts (Routines & Templates) — tombstone-aware:
        // a plan the user deleted locally is never resurrected by a stale
        // server copy.
        if (remotePlans.data && remotePlans.data.length > 0) {
          const remoteMapped = remotePlans.data.map(planFromRemoteRow);
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

        // Phase 2 coach merge (last-write-wins, coach-sync.ts). A
        // missing server row adds nothing and deletes nothing; a
        // pending-setup pull (tables not yet created) leaves local
        // state untouched by construction — coachPull.changed is false
        // and its merged state equals the local state.
        if (coachPull.changed) {
          updates.coachBlocks = coachPull.coachBlocks;
          updates.weeklyReviews = coachPull.weeklyReviews;
          needsLocalUpdate = true;
        }
        if (coachPull.adoptedCoachBlocksUpdatedAt || Object.keys(coachPull.adoptedWeeklyReviewUpdatedAt).length > 0) {
          setCoachSyncStamps({
            coachBlocksUpdatedAt: coachPull.adoptedCoachBlocksUpdatedAt,
            weeklyReviewsUpdatedAt: coachPull.adoptedWeeklyReviewUpdatedAt,
          });
        }
      }

      // Apply any pulled cloud data to local store
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

  private async pushLocalData(userId: string) {
    const supabase = getSupabase();
    if (!supabase) return;

    const state = useStore.getState();

    // 1. Profile
    if (state.profile) {
      await supabase.from('profiles').upsert({
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
      });
    }

    // 2. PRs
    if (state.prs && state.prs.length > 0) {
      const prRows = state.prs.map((p) => ({
        id: p.id,
        user_id: userId,
        exercise: p.exercise,
        weight_kg: p.weightKg,
        weight_lbs: p.weightLbs,
        reps: p.reps,
        one_rep_max: p.oneRepMax,
        date: p.date,
        notes: p.notes || null,
        updated_at: new Date().toISOString(),
      }));
      await supabase.from('personal_records').upsert(prRows, { onConflict: 'id' });
    }

    // 3. Workouts
    if (state.workouts && state.workouts.length > 0) {
      const workoutRows = state.workouts.map((w) => ({
        id: w.id,
        user_id: userId,
        name: w.name || null,
        date: w.date,
        duration_minutes: w.durationMinutes || null,
        notes: w.notes || null,
        exercises: w.exercises || [],
        updated_at: new Date().toISOString(),
      }));
      await supabase.from('workouts').upsert(workoutRows, { onConflict: 'id' });
    }

    // 4. Meals
    if (state.meals && state.meals.length > 0) {
      const mealRows = state.meals.map((m) => ({
        id: m.id,
        user_id: userId,
        name: m.name,
        date: m.date,
        foods: m.foods || [],
        updated_at: new Date().toISOString(),
      }));
      await supabase.from('meals').upsert(mealRows, { onConflict: 'id' });
    }

    // 5. Body Metrics
    if (state.bodyMetrics && state.bodyMetrics.length > 0) {
      const metricRows = state.bodyMetrics.map((b) => ({
        id: b.id,
        user_id: userId,
        date: b.date,
        weight_kg: b.weightKg,
        height_cm: b.heightCm || null,
        notes: b.notes || null,
        updated_at: new Date().toISOString(),
      }));
      await supabase.from('body_metrics').upsert(metricRows, { onConflict: 'id' });
    }

    // 6. Planned Workouts — description / goalTag / intensityMode have no
    // columns on the table, so they travel in the `extras` jsonb payload
    // (QA4-006). The column exists only after the user runs the migration
    // in supabase/schema.sql; until then PostgREST rejects rows carrying
    // `extras`, so on a missing-column error we retry without it — plans
    // keep syncing and those three fields stay local-only in the meantime.
    if (state.plannedWorkouts && state.plannedWorkouts.length > 0) {
      const planRows = state.plannedWorkouts.map((p) => ({
        id: p.id,
        user_id: userId,
        name: p.name,
        exercises: p.exercises || [],
        updated_at: new Date().toISOString(),
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
          await supabase.from('planned_workouts').upsert(bareRows, { onConflict: 'id' });
        } else {
          console.error('Supabase planned_workouts upsert error:', planUpsertError);
        }
      }
    }

    // 7. Phase 2 coach push — upsert only, debounced via scheduleDebouncedPush
    // like the other collections (this method is the push path for both
    // triggerSyncNow and syncPush). Soft-fails on missing tables
    // (pending setup) or an unconfigured client: local state is kept,
    // the whole push is NOT failed, and no DELETE is ever issued here
    // (see coach-sync.ts: no tombstones for coach state, by design).
    // The initial coach state is never pushed, so a local reset cannot
    // wipe the cloud copy.
    try {
      const coachPush = await pushCoachState(
        supabase as any,
        userId,
        state.coachBlocks,
        state.weeklyReviews,
      );
      this.refreshCoachSyncPendingSetup();
      if (coachPush.pushedCoachBlocks || coachPush.pushedReviewCount > 0) {
        setCoachSyncStamps({
          coachBlocksUpdatedAt: coachPush.pushedUpdatedAt,
          weeklyReviewsUpdatedAt: coachPush.pushedWeeklyReviewUpdatedAt,
        });
      }
    } catch {
      /* coach push must never fail the rest of the push */
    }

    // 8. Deletion propagation: the push path historically only upserted,
    // so a locally deleted record stayed on the server forever and the
    // union pull-merge resurrected it on the next sync. Delete exactly the
    // tombstoned records (explicit user deletions) — a full local reset
    // clears tombstones without reaching this path, so a "reset" never
    // wipes the cloud copy.
    await this.propagateAllDeletions(userId);
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
      const { data, error } = await supabase
        .from(table)
        .select('id')
        .eq('user_id', userId);
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
        console.warn('Background sync push warning:', err?.message);
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
