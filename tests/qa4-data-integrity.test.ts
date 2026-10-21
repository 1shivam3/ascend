import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { useStore, partializeAppState } from '../src/lib/store';
import {
  mergeRemoteRecords,
  tombstonedIdsToDelete,
  isLocalProfileNewer,
  buildPlanExtras,
  planFieldsFromExtras,
} from '../src/lib/supabase/reconcile';
import {
  buildFullBackup,
  importFullBackupJSON,
  isRecognizedBackupData,
} from '../src/lib/storage';
import { getLocalTodayStr } from '../src/lib/formatters';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../src/lib/types';
import type {
  PersonalRecord,
  WorkoutEntry,
  MealEntry,
  BodyMetricEntry,
  PlannedWorkout,
} from '../src/lib/types';

const pr = (id: string): PersonalRecord => ({
  id,
  exercise: 'Bench Press',
  weightKg: 100,
  weightLbs: 220,
  reps: 5,
  oneRepMax: 116,
  date: '2026-10-01',
});
const workout = (id: string): WorkoutEntry => ({ id, date: '2026-10-01', exercises: [] } as WorkoutEntry);
const meal = (id: string): MealEntry => ({ id, name: 'Lunch', date: '2026-10-01', foods: [] } as MealEntry);
const metric = (id: string, date = '2026-10-01'): BodyMetricEntry => ({ id, date, weightKg: 80 });

// ─── QA4-001: generalized deletion tombstones ────────────────────────────────

describe('QA4-001: deleted records stay deleted (all entities)', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('deletePR tombstones the id and removes the record', () => {
    const s = useStore.getState();
    s.addPR(pr('pr1'));
    // Distinct exercise — addPR dedups on exercise+date+e1RM.
    s.addPR({ ...pr('pr2'), exercise: 'Squat' });
    useStore.getState().deletePR('pr1');
    const after = useStore.getState();
    expect(after.prs.map((p) => p.id)).toEqual(['pr2']);
    expect(after.deletedPrIds).toContain('pr1');
  });

  it('deleteWorkout / deleteMeal / deleteBodyMetric tombstone their ids', () => {
    const s = useStore.getState();
    s.addWorkout(workout('w1'));
    s.addMeal(meal('m1'));
    s.addBodyMetric(metric('b1'));
    useStore.getState().deleteWorkout('w1');
    useStore.getState().deleteMeal('m1');
    useStore.getState().deleteBodyMetric('b1');
    const after = useStore.getState();
    expect(after.workouts).toEqual([]);
    expect(after.meals).toEqual([]);
    expect(after.bodyMetrics).toEqual([]);
    expect(after.deletedWorkoutIds).toContain('w1');
    expect(after.deletedMealIds).toContain('m1');
    expect(after.deletedBodyMetricIds).toContain('b1');
  });

  it('tombstones persist through partialize (survive refresh)', () => {
    const s = useStore.getState();
    s.addPR(pr('pr1'));
    s.addWorkout(workout('w1'));
    s.addMeal(meal('m1'));
    s.addBodyMetric(metric('b1'));
    useStore.getState().deletePR('pr1');
    useStore.getState().deleteWorkout('w1');
    useStore.getState().deleteMeal('m1');
    useStore.getState().deleteBodyMetric('b1');
    const persisted = partializeAppState(useStore.getState()) as Record<string, any>;
    expect(persisted.deletedPrIds).toContain('pr1');
    expect(persisted.deletedWorkoutIds).toContain('w1');
    expect(persisted.deletedMealIds).toContain('m1');
    expect(persisted.deletedBodyMetricIds).toContain('b1');
  });

  it('re-adding a record clears its tombstone', () => {
    const s = useStore.getState();
    s.addPR(pr('pr1'));
    s.deletePR('pr1');
    expect(useStore.getState().deletedPrIds).toContain('pr1');
    useStore.getState().addPR(pr('pr1'));
    expect(useStore.getState().prs.map((p) => p.id)).toContain('pr1');
    expect(useStore.getState().deletedPrIds).not.toContain('pr1');
  });

  it('deleting a meal’s last food tombstones the meal itself', () => {
    const s = useStore.getState();
    s.addMeal({ ...meal('m1'), foods: [{ name: 'Dal', quantity: 1, unit: 'bowl', calories: 200, proteinG: 12, carbsG: 30, fatG: 4 } as any] });
    useStore.getState().deleteFoodFromMeal('m1', 0);
    expect(useStore.getState().meals).toEqual([]);
    expect(useStore.getState().deletedMealIds).toContain('m1');
  });

  it('addBodyMetric replacing a same-date entry tombstones the replaced row', () => {
    const s = useStore.getState();
    s.addBodyMetric(metric('b-old', '2026-10-05'));
    useStore.getState().addBodyMetric(metric('b-new', '2026-10-05'));
    const after = useStore.getState();
    expect(after.bodyMetrics.map((b) => b.id)).toEqual(['b-new']);
    expect(after.deletedBodyMetricIds).toContain('b-old');
    expect(after.deletedBodyMetricIds).not.toContain('b-new');
  });

  it('updateBodyMetrics tombstones the same-date entry it replaces', () => {
    const today = getLocalTodayStr();
    useStore.setState({ bodyMetrics: [metric('b-today', today)] });
    useStore.getState().updateBodyMetrics(81.5);
    const after = useStore.getState();
    expect(after.bodyMetrics.map((b) => b.id)).not.toContain('b-today');
    expect(after.deletedBodyMetricIds).toContain('b-today');
  });

  it('pull merge never resurrects tombstoned records of any entity', () => {
    const cases: Array<{ local: any[]; remote: any[]; tombstones: string[]; gone: string; kept: string }> = [
      { local: [pr('pr2')], remote: [pr('pr1'), pr('pr2')], tombstones: ['pr1'], gone: 'pr1', kept: 'pr2' },
      { local: [workout('w2')], remote: [workout('w1'), workout('w2')], tombstones: ['w1'], gone: 'w1', kept: 'w2' },
      { local: [meal('m2')], remote: [meal('m1'), meal('m2')], tombstones: ['m1'], gone: 'm1', kept: 'm2' },
      { local: [metric('b2')], remote: [metric('b1'), metric('b2')], tombstones: ['b1'], gone: 'b1', kept: 'b2' },
    ];
    for (const c of cases) {
      const { merged, changed } = mergeRemoteRecords(c.local, c.remote, c.tombstones);
      expect(merged.map((r) => r.id)).not.toContain(c.gone);
      expect(merged.map((r) => r.id)).toContain(c.kept);
      expect(changed).toBe(false);
    }
  });

  it('pull merge still merges genuine other-device records', () => {
    const { merged, changed } = mergeRemoteRecords([pr('pr2')], [pr('pr2'), pr('pr3')], ['pr1']);
    expect(merged.map((p) => p.id)).toEqual(expect.arrayContaining(['pr2', 'pr3']));
    expect(changed).toBe(true);
  });

  it('tombstonedIdsToDelete only deletes tombstoned stale rows (reset-safe)', () => {
    // Deleted workout w1: gone locally, on server, tombstoned → delete.
    // w2 vanished locally WITHOUT a tombstone (e.g. reset) → keep.
    // w3 still local → keep.
    expect(
      tombstonedIdsToDelete(['w3'], ['w1', 'w2', 'w3'], ['w1'])
    ).toEqual(['w1']);
    expect(tombstonedIdsToDelete([], ['w1'], [])).toEqual([]);
  });

  it('clearAllData resets all tombstone lists', () => {
    const s = useStore.getState();
    s.addPR(pr('pr1'));
    s.deletePR('pr1');
    useStore.getState().clearAllData();
    const after = useStore.getState();
    expect(after.deletedPrIds).toEqual([]);
    expect(after.deletedWorkoutIds).toEqual([]);
    expect(after.deletedMealIds).toEqual([]);
    expect(after.deletedBodyMetricIds).toEqual([]);
  });

  it('end-to-end: delete → partialize → stale pull merge → record stays gone', () => {
    const s = useStore.getState();
    s.addWorkout(workout('w1'));
    s.addWorkout(workout('w2'));
    useStore.getState().deleteWorkout('w1');
    const persisted = partializeAppState(useStore.getState()) as Record<string, any>;
    const { merged } = mergeRemoteRecords(
      persisted.workouts as WorkoutEntry[],
      [workout('w1'), workout('w2')],
      persisted.deletedWorkoutIds as string[]
    );
    expect(merged.map((w) => w.id)).toEqual(['w2']);
  });
});

// ─── QA4A-001: profile last-write-wins ───────────────────────────────────────

describe('QA4A-001: profile last-write-wins', () => {
  it('isLocalProfileNewer compares stamps strictly and fails open to server', () => {
    expect(isLocalProfileNewer('2026-10-21T10:00:00Z', '2026-10-21T09:00:00Z')).toBe(true);
    expect(isLocalProfileNewer('2026-10-21T09:00:00Z', '2026-10-21T10:00:00Z')).toBe(false);
    expect(isLocalProfileNewer('2026-10-21T10:00:00Z', '2026-10-21T10:00:00Z')).toBe(false);
    expect(isLocalProfileNewer(undefined, '2026-10-21T10:00:00Z')).toBe(false);
    expect(isLocalProfileNewer('2026-10-21T10:00:00Z', undefined)).toBe(false);
    expect(isLocalProfileNewer('not-a-date', '2026-10-21T10:00:00Z')).toBe(false);
    expect(isLocalProfileNewer(null, null)).toBe(false);
  });

  it('setProfile stamps updatedAt with the edit time', () => {
    useStore.getState().clearAllData();
    const before = Date.now();
    useStore.getState().setProfile({
      id: 'u1',
      name: 'Shivam',
      gender: 'male',
      bodyweightKg: 80,
      bodyweightLbs: 176,
      unit: 'kg',
      createdAt: '2026-10-01T00:00:00Z',
    });
    const stamp = useStore.getState().profile?.updatedAt;
    expect(stamp).toBeTruthy();
    expect(Date.parse(stamp!)).toBeGreaterThanOrEqual(before - 1000);
  });

  it('updateBodyMetrics stamps the profile it modifies', () => {
    useStore.getState().clearAllData();
    useStore.getState().setProfile({
      id: 'u1',
      name: 'Shivam',
      gender: 'male',
      bodyweightKg: 80,
      bodyweightLbs: 176,
      unit: 'kg',
      createdAt: '2026-10-01T00:00:00Z',
    });
    useStore.setState((state) => ({
      profile: state.profile ? { ...state.profile, updatedAt: '2020-01-01T00:00:00Z' } : null,
    }));
    useStore.getState().updateBodyMetrics(82);
    const after = useStore.getState();
    expect(after.profile?.bodyweightKg).toBe(82);
    expect(Date.parse(after.profile!.updatedAt!)).toBeGreaterThan(Date.parse('2020-01-01T00:00:00Z'));
  });
});

// ─── QA4-006: plan extras payload ────────────────────────────────────────────

describe('QA4-006: plan extras round-trip', () => {
  const fullPlan = {
    description: 'Strength block',
    goalTag: 'strength',
    intensityMode: 'percent' as const,
  };

  it('buildPlanExtras carries the column-less fields, undefined when none', () => {
    expect(buildPlanExtras(fullPlan)).toEqual(fullPlan);
    expect(buildPlanExtras({})).toBeUndefined();
    expect(buildPlanExtras({ intensityMode: 'rpe' })).toEqual({ intensityMode: 'rpe' });
  });

  it('planFieldsFromExtras restores a built payload (round-trip)', () => {
    expect(planFieldsFromExtras(buildPlanExtras(fullPlan))).toEqual(fullPlan);
  });

  it('planFieldsFromExtras tolerates missing/malformed payloads', () => {
    expect(planFieldsFromExtras(undefined)).toEqual({});
    expect(planFieldsFromExtras(null)).toEqual({});
    expect(planFieldsFromExtras('junk')).toEqual({});
    expect(planFieldsFromExtras({ intensityMode: 'bogus', description: 42 })).toEqual({});
  });

  it('schema.sql carries the one-step extras migration', () => {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
    expect(schema).toContain('ALTER TABLE public.planned_workouts ADD COLUMN IF NOT EXISTS extras JSONB');
  });
});

// ─── QA4-005 + QA4-013: backup completeness + shape gate ─────────────────────

describe('QA4-005/QA4-013: backup export/import completeness', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  function seedRichState() {
    useStore.setState({
      customFoods: [
        {
          id: 'cf1',
          name: 'Home Dal',
          calories: 210,
          proteinG: 13,
          carbsG: 32,
          fatG: 4,
          unit: 'g',
          createdAt: '2026-10-01T00:00:00Z',
        } as any,
      ],
      mealDayKinds: { '2026-10-20': 'no_grain_fast' },
      userPortionPreferences: { 'Home Dal': 180 },
      xp: { totalXp: 250, awardedIds: ['xp-a', 'xp-b'] },
      streak: {
        freezesAvailable: 1,
        freezesUsedThisWeek: 1,
        weekStart: '2026-10-19',
        longestStreak: 12,
      },
      challenges: {
        instances: { 'ch1:2026-10': { optedIn: true, dismissed: false, rewardGranted: true } },
      },
      notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: false },
    });
  }

  it('buildFullBackup exports customFoods, mealDayKinds and portion prefs', () => {
    seedRichState();
    const backup = buildFullBackup(useStore.getState() as unknown as Record<string, any>);
    expect((backup as any).customFoods?.[0]?.id).toBe('cf1');
    expect((backup as any).mealDayKinds).toEqual({ '2026-10-20': 'no_grain_fast' });
    expect((backup as any).userPortionPreferences).toEqual({ 'Home Dal': 180 });
    expect((backup as any).xp?.totalXp).toBe(250);
    expect((backup as any).deletedPrIds).toEqual([]);
  });

  it('round-trip: export → wipe → restore preserves every slice', () => {
    seedRichState();
    const backup = buildFullBackup(useStore.getState() as unknown as Record<string, any>);

    useStore.getState().clearAllData();
    useStore.setState({ notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: true } });
    const wiped = useStore.getState();
    expect(wiped.customFoods).toEqual([]);
    expect(wiped.xp.totalXp).toBe(0);

    const ok = useStore.getState().importAllData(JSON.parse(JSON.stringify(backup)));
    expect(ok).toBe(true);
    const after = useStore.getState();
    expect(after.customFoods.map((f) => f.id)).toContain('cf1');
    expect(after.mealDayKinds).toEqual({ '2026-10-20': 'no_grain_fast' });
    expect(after.userPortionPreferences).toEqual({ 'Home Dal': 180 });
    expect(after.xp).toEqual({ totalXp: 250, awardedIds: ['xp-a', 'xp-b'] });
    expect(after.streak.longestStreak).toBe(12);
    expect(after.streak.freezesAvailable).toBe(1);
    expect(after.challenges.instances['ch1:2026-10']).toEqual({
      optedIn: true,
      dismissed: false,
      rewardGranted: true,
    });
    expect(after.notificationPreferences.enabled).toBe(false);
  });

  it('userPortionPreferences survive a partialize round-trip (reload)', () => {
    useStore.getState().savePortionPreference('Home Dal', 180);
    const persisted = partializeAppState(useStore.getState()) as Record<string, any>;
    // The field must be IN the persisted blob at all (it was missing, so
    // portion learning reset on every reload). savePortionPreference
    // dual-keys by raw + lowercase name — pre-existing behaviour.
    expect(persisted.userPortionPreferences).toBeDefined();
    expect(persisted.userPortionPreferences['Home Dal']).toBe(180);
  });

  it('wrong-shape payloads are rejected, not "restored"', () => {
    expect(isRecognizedBackupData({ hello: 1 })).toBe(false);
    expect(isRecognizedBackupData(null)).toBe(false);
    expect(isRecognizedBackupData([1, 2])).toBe(false);
    expect(isRecognizedBackupData({ workouts: [] })).toBe(true);

    useStore.setState({ xp: { totalXp: 99, awardedIds: [] } });
    expect(useStore.getState().importAllData({ hello: 1 })).toBe(false);
    expect(useStore.getState().xp.totalXp).toBe(99); // untouched
  });

  it('importFullBackupJSON rejects a wrong-shape file', () => {
    const storeMap = new Map<string, string>();
    const originalWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        localStorage: {
          getItem: (k: string) => storeMap.get(k) || null,
          setItem: (k: string, v: string) => storeMap.set(k, v),
          removeItem: (k: string) => storeMap.delete(k),
          length: 0,
          key: () => null,
        },
      };
      expect(importFullBackupJSON(JSON.stringify({ hello: 1 }))).toBe(false);
      expect(storeMap.has('ascend_store')).toBe(false);
      expect(importFullBackupJSON(JSON.stringify({ workouts: [] }))).toBe(true);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('import restores tombstone lists from the backup', () => {
    const ok = useStore.getState().importAllData({
      workouts: [workout('w9')],
      deletedWorkoutIds: ['w-gone'],
      deletedPrIds: ['pr-gone'],
    });
    expect(ok).toBe(true);
    const after = useStore.getState();
    expect(after.deletedWorkoutIds).toContain('w-gone');
    expect(after.deletedPrIds).toContain('pr-gone');
    // …but a tombstone for an entity the backup itself restores is dropped.
    const ok2 = useStore.getState().importAllData({
      workouts: [workout('w-gone')],
    });
    expect(ok2).toBe(true);
    expect(useStore.getState().deletedWorkoutIds).not.toContain('w-gone');
  });
});

// ─── Plan extras survive a store-level backup (local path) ───────────────────

describe('QA4-006: plan fields persist locally', () => {
  it('a plan with intensityMode/description/goalTag round-trips partialize', () => {
    useStore.getState().clearAllData();
    const plan: PlannedWorkout = {
      id: 'p1',
      name: 'Strength',
      exercises: [],
      createdAt: '2026-10-20',
      description: 'Block A',
      goalTag: 'strength',
      intensityMode: 'percent',
    };
    useStore.getState().addPlannedWorkout(plan);
    const persisted = partializeAppState(useStore.getState()) as Record<string, any>;
    const saved = (persisted.plannedWorkouts as PlannedWorkout[]).find((p) => p.id === 'p1');
    expect(saved?.intensityMode).toBe('percent');
    expect(saved?.description).toBe('Block A');
    expect(saved?.goalTag).toBe('strength');
  });
});
