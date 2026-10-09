import { getSupabase } from './client';
import { useStore } from '../store';
import { UserProfile, PersonalRecord, WorkoutEntry, MealEntry, BodyMetricEntry, PlannedWorkout } from '../types';

export type SyncStatus = 'unconfigured' | 'offline' | 'idle' | 'syncing' | 'synced' | 'error';

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  isAnonymous: boolean;
}

type SyncListener = (
  status: SyncStatus,
  lastSyncedAt: string | null,
  error: string | null,
  user: AuthUser | null
) => void;

class SupabaseSyncEngine {
  private status: SyncStatus = 'unconfigured';
  private lastSyncedAt: string | null = null;
  private errorMessage: string | null = null;
  private currentUser: AuthUser | null = null;
  private listeners: Set<SyncListener> = new Set();
  private debounceTimer: any = null;
  private isSyncing = false;
  private initialized = false;

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
        this.currentUser = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
          isAnonymous: Boolean(session.user.is_anonymous),
        };
        this.notify();
        this.triggerSyncNow();
      } else {
        this.currentUser = null;
        this.notify();
      }
    });

    // Listen to local store changes for debounced push
    useStore.subscribe((state, prevState) => {
      if (!this.initialized || this.isSyncing) return;
      if (!navigator.onLine) return;

      const hasChanged =
        state.profile !== prevState.profile ||
        state.prs.length !== prevState.prs.length ||
        state.workouts.length !== prevState.workouts.length ||
        state.meals.length !== prevState.meals.length ||
        state.bodyMetrics.length !== prevState.bodyMetrics.length ||
        state.plannedWorkouts.length !== prevState.plannedWorkouts.length;

      if (hasChanged) {
        this.scheduleDebouncedPush();
      }
    });

    // Run initial sync on launch
    setTimeout(() => {
      this.triggerSyncNow();
    }, 800);
  }

  public async signInWithGoogle(): Promise<{ error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase is not configured' };

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });
      if (error) return { error: error.message };
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Google sign-in failed' };
    }
  }

  public async sendEmailOtp(email: string): Promise<{ error?: string }> {
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

  public async signOut(): Promise<{ error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase is not configured' };

    try {
      const { error } = await supabase.auth.signOut();
      this.currentUser = null;
      this.status = 'unconfigured';
      this.notify();
      return error ? { error: error.message } : {};
    } catch (err: any) {
      return { error: err?.message || 'Sign out failed' };
    }
  }

  private scheduleDebouncedPush() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.syncPush();
    }, 2500);
  }

  public async triggerSyncNow() {
    if (this.isSyncing) return;
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

    try {
      // 1. Ensure active session
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        this.currentUser = null;
        this.status = 'unconfigured';
        this.isSyncing = false;
        this.notify();
        return;
      }

      this.currentUser = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.user_metadata?.name,
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

      // 3. Reconcile Cloud -> Local (Recovery on phone or new device)
      let needsLocalUpdate = false;
      const updates: any = {};

      if (!localState.profile && remoteProfile.data) {
        const rp = remoteProfile.data;
        updates.profile = {
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
        };
        updates.hasCompletedOnboarding = true;
        needsLocalUpdate = true;
      }

      // Merge PRs
      if (remotePRs.data && remotePRs.data.length > 0) {
        const localPRMap = new Map(localState.prs.map((p) => [p.id, p]));
        let prMerged = false;
        for (const r of remotePRs.data) {
          if (!localPRMap.has(r.id)) {
            localPRMap.set(r.id, {
              id: r.id,
              exercise: r.exercise,
              weightKg: Number(r.weight_kg),
              weightLbs: Number(r.weight_lbs),
              reps: Number(r.reps),
              oneRepMax: Number(r.one_rep_max),
              date: r.date,
              notes: r.notes || undefined,
            });
            prMerged = true;
          }
        }
        if (prMerged) {
          updates.prs = Array.from(localPRMap.values());
          needsLocalUpdate = true;
        }
      }

      // Merge Workouts
      if (remoteWorkouts.data && remoteWorkouts.data.length > 0) {
        const localWMap = new Map(localState.workouts.map((w) => [w.id, w]));
        let wMerged = false;
        for (const r of remoteWorkouts.data) {
          if (!localWMap.has(r.id)) {
            localWMap.set(r.id, {
              id: r.id,
              name: r.name || undefined,
              date: r.date,
              durationMinutes: r.duration_minutes || undefined,
              notes: r.notes || undefined,
              exercises: r.exercises || [],
            });
            wMerged = true;
          }
        }
        if (wMerged) {
          updates.workouts = Array.from(localWMap.values());
          needsLocalUpdate = true;
        }
      }

      // Merge Meals
      if (remoteMeals.data && remoteMeals.data.length > 0) {
        const localMMap = new Map(localState.meals.map((m) => [m.id, m]));
        let mMerged = false;
        for (const r of remoteMeals.data) {
          if (!localMMap.has(r.id)) {
            localMMap.set(r.id, {
              id: r.id,
              name: r.name,
              date: r.date,
              foods: r.foods || [],
            });
            mMerged = true;
          }
        }
        if (mMerged) {
          updates.meals = Array.from(localMMap.values());
          needsLocalUpdate = true;
        }
      }

      // Apply any pulled cloud data to local store
      if (needsLocalUpdate) {
        useStore.setState(updates);
      }

      // 4. Push Local -> Cloud (Initial Migration or Incremental Updates)
      await this.pushLocalData(user.id);

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
    }
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
        updated_at: new Date().toISOString(),
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

    // 6. Planned Workouts
    if (state.plannedWorkouts && state.plannedWorkouts.length > 0) {
      const planRows = state.plannedWorkouts.map((p) => ({
        id: p.id,
        user_id: userId,
        name: p.name,
        exercises: p.exercises || [],
        updated_at: new Date().toISOString(),
      }));
      await supabase.from('planned_workouts').upsert(planRows, { onConflict: 'id' });
    }
  }

  private async syncPush() {
    if (this.isSyncing) return;
    const supabase = getSupabase();
    if (!supabase || !navigator.onLine) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      this.isSyncing = true;
      await this.pushLocalData(user.id);
      this.status = 'synced';
      this.lastSyncedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      this.notify();
    } catch (err: any) {
      console.warn('Background sync push warning:', err?.message);
    } finally {
      this.isSyncing = false;
    }
  }
}

export const syncEngine = new SupabaseSyncEngine();
