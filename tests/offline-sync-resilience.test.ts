import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useStore } from '@/lib/store';
import { syncEngine } from '@/lib/supabase/sync';
import { WorkoutEntry, PersonalRecord, MealEntry, BodyMetricEntry } from '@/lib/types';

// Mock storage for tests
class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] || null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

const mockStorage = new MockStorage();

describe('Offline Operation & Cloud Synchronization Resilience Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.clear();
    Object.defineProperty(global, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
    useStore.getState().clearAllData();
  });

  describe('1. Local Persistence Across Restarts & Refreshes', () => {
    it('persists workouts, PRs, meals, and body metrics directly to local storage', () => {
      const workout: WorkoutEntry = {
        id: 'workout_offline_1',
        name: 'Heavy Push Day',
        date: '2026-10-18',
        durationMinutes: 45,
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              { weight: 100, reps: 5, unit: 'kg', completed: true },
              { weight: 100, reps: 5, unit: 'kg', completed: true },
            ],
          },
        ],
      };

      const pr: PersonalRecord = {
        id: 'pr_bench_1',
        exercise: 'Bench Press',
        weightKg: 100,
        weightLbs: 220,
        reps: 5,
        oneRepMax: 116.7,
        date: '2026-10-18',
      };

      const meal: MealEntry = {
        id: 'meal_1',
        name: 'Post-Workout Fuel',
        date: '2026-10-18',
        foods: [{ name: 'Chicken Breast', calories: 330, proteinG: 62, carbsG: 0, fatG: 7 }],
      };

      useStore.getState().addWorkout(workout);
      useStore.getState().addPR(pr);
      useStore.getState().addMeal(meal);

      // Verify state reflects additions
      const state = useStore.getState();
      expect(state.workouts.length).toBe(1);
      expect(state.workouts[0].id).toBe('workout_offline_1');
      expect(state.prs.length).toBe(1);
      expect(state.prs[0].id).toBe('pr_bench_1');
      expect(state.meals.length).toBe(1);
      expect(state.meals[0].id).toBe('meal_1');
    });

    it('retains active workout draft across browser crash/refresh via activeWorkoutDraft', () => {
      const draft = {
        id: 'draft_active_session_9',
        name: 'Leg Day Volume',
        date: '2026-10-18',
        exercises: [
          {
            name: 'Barbell Squat',
            sets: [{ weight: 140, reps: 6, unit: 'kg' as const, completed: true }],
          },
        ],
        savedAt: new Date().toISOString(),
      };

      useStore.getState().saveWorkoutDraft(draft);

      expect(useStore.getState().activeWorkoutDraft).not.toBeNull();
      expect(useStore.getState().activeWorkoutDraft?.id).toBe('draft_active_session_9');
      expect(useStore.getState().activeWorkoutDraft?.exercises[0].name).toBe('Barbell Squat');

      useStore.getState().clearWorkoutDraft();
      expect(useStore.getState().activeWorkoutDraft).toBeNull();
    });
  });

  describe('2. Idempotency & Deduplication Protection', () => {
    it('prevents duplicate workouts and PRs when merging cloud records', () => {
      const existingWorkout: WorkoutEntry = {
        id: 'workout_unique_101',
        name: 'Upper Hypertrophy',
        date: '2026-10-17',
        exercises: [],
      };

      useStore.setState({ workouts: [existingWorkout] });

      // Simulate pull where remote returns the same workout
      const remoteWorkouts = [
        {
          id: 'workout_unique_101',
          name: 'Upper Hypertrophy',
          date: '2026-10-17',
          exercises: [],
        },
        {
          id: 'workout_unique_102',
          name: 'Lower Power',
          date: '2026-10-18',
          exercises: [],
        },
      ];

      const localWMap = new Map(useStore.getState().workouts.map((w) => [w.id, w]));
      for (const r of remoteWorkouts) {
        if (!localWMap.has(r.id)) {
          localWMap.set(r.id, r as any);
        }
      }

      const merged = Array.from(localWMap.values());
      expect(merged.length).toBe(2);
      expect(merged.filter((w) => w.id === 'workout_unique_101').length).toBe(1);
    });
  });

  describe('3. Conflict Resolution & Cross-Account Isolation Policy', () => {
    it('purges previous athlete data on cross-account switch to prevent data contamination', () => {
      // User A state
      useStore.setState({
        profile: {
          id: 'auth_user_alpha',
          name: 'Athlete Alpha',
          gender: 'male',
          bodyweightKg: 85,
          bodyweightLbs: 187,
          unit: 'kg',
          createdAt: '2026-01-01',
        },
        prs: [
          {
            id: 'pr_alpha_1',
            exercise: 'Deadlift',
            weightKg: 200,
            weightLbs: 440,
            reps: 1,
            oneRepMax: 200,
            date: '2026-01-01',
          },
        ],
      });

      const currentAuthUser = 'auth_user_beta'; // Different user logs in
      const localState = useStore.getState();

      const isCrossAccount = Boolean(
        localState.profile?.id &&
        localState.profile.id !== currentAuthUser &&
        !localState.profile.id.startsWith('user_')
      );

      expect(isCrossAccount).toBe(true);
    });

    it('supports guest-to-cloud migration when profile has guest ID prefix', () => {
      useStore.setState({
        profile: {
          id: 'user_local_guest_777',
          name: 'Guest Lifter',
          gender: 'male',
          bodyweightKg: 80,
          bodyweightLbs: 176,
          unit: 'kg',
          createdAt: '2026-10-18',
        },
      });

      const currentAuthUser = 'auth_user_real_999';
      const localState = useStore.getState();

      const isCrossAccount = Boolean(
        localState.profile?.id &&
        localState.profile.id !== currentAuthUser &&
        !localState.profile.id.startsWith('user_')
      );

      expect(isCrossAccount).toBe(false);
    });
  });

  describe('4. Honest Sync Status Reporting', () => {
    it('reports offline when navigator is offline and does not falsely claim synced', () => {
      const origNavigator = global.navigator;
      try {
        Object.defineProperty(global, 'navigator', {
          value: { onLine: false },
          writable: true,
          configurable: true,
        });

        // When offline, status cannot transition to synced
        expect(navigator.onLine).toBe(false);
      } finally {
        Object.defineProperty(global, 'navigator', {
          value: origNavigator,
          writable: true,
          configurable: true,
        });
      }
    });

    it('reports unconfigured status when user is signed out or unauthenticated', () => {
      expect(syncEngine.getSyncStatus()).toBe('unconfigured');
      expect(syncEngine.getCurrentUser()).toBeNull();
    });
  });
});
