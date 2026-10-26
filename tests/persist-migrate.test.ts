import { describe, it, expect } from 'vitest';
import {
  migratePersistedState,
  DEFAULT_UI_PREFERENCES,
  PERSIST_VERSION,
} from '../src/lib/store';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../src/lib/types';

describe('persist migrate (QA4-012)', () => {
  it('exposes a persist version >= 1', () => {
    expect(PERSIST_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('legacy uiPreferences missing newer booleans rehydrate to product defaults (ON)', () => {
    // Blob written before showMuscleVolume / healthConnectEnabled existed.
    const legacy = {
      uiPreferences: { gamificationEnabled: false, weeklyTargetDays: 4 },
    };
    const out = migratePersistedState(legacy, 0) as any;
    // Missing fields take the current defaults…
    expect(out.uiPreferences.showMuscleVolume).toBe(DEFAULT_UI_PREFERENCES.showMuscleVolume);
    expect(out.uiPreferences.coachEnabled).toBe(true);
    expect(out.uiPreferences.showHabitMatrix).toBe(true);
    expect(out.uiPreferences.language).toBe('en');
    // …while values the user actually chose are preserved.
    expect(out.uiPreferences.gamificationEnabled).toBe(false);
    expect(out.uiPreferences.weeklyTargetDays).toBe(4);
  });

  it('a user who turned a default-ON surface OFF stays OFF after migration', () => {
    const legacy = { uiPreferences: { ...DEFAULT_UI_PREFERENCES, coachEnabled: false } };
    const out = migratePersistedState(legacy, 0) as any;
    expect(out.uiPreferences.coachEnabled).toBe(false);
  });

  it('notificationPreferences groups are merged one level deep over defaults', () => {
    const legacy = {
      notificationPreferences: {
        enabled: true,
        // Legacy group missing quietHours times + lockScreenPrivacy absent.
        quietHours: { enabled: false },
        mealReminders: { enabled: true, lunchTime: '12:30' },
      },
    };
    const out = migratePersistedState(legacy, 0) as any;
    expect(out.notificationPreferences.enabled).toBe(true);
    expect(out.notificationPreferences.quietHours.enabled).toBe(false); // user value kept
    expect(out.notificationPreferences.quietHours.start).toBe(
      DEFAULT_NOTIFICATION_PREFERENCES.quietHours.start,
    );
    expect(out.notificationPreferences.mealReminders.lunchTime).toBe('12:30'); // user value kept
    expect(out.notificationPreferences.mealReminders.breakfastTime).toBe(
      DEFAULT_NOTIFICATION_PREFERENCES.mealReminders.breakfastTime,
    );
    expect(out.notificationPreferences.lockScreenPrivacy).toBe(true); // default-ON restored
    // Untouched groups arrive whole from defaults.
    expect(out.notificationPreferences.weeklyReport).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES.weeklyReport,
    );
  });

  it('streak and xp slices are completed from their initial states', () => {
    const legacy = { streak: { longestStreak: 9 }, xp: { totalXp: 120 } };
    const out = migratePersistedState(legacy, 0) as any;
    expect(out.streak.longestStreak).toBe(9);
    expect(out.streak.freezesAvailable).toBe(1);
    expect(typeof out.streak.weekStart).toBe('string');
    expect(out.xp.totalXp).toBe(120);
    expect(out.xp.awardedIds).toEqual([]);
  });

  it('collections and flat slices pass through untouched', () => {
    const workouts = [{ id: 'w1' }];
    const legacy = { workouts, theme: 'light', hasCompletedOnboarding: true };
    const out = migratePersistedState(legacy, 0) as any;
    expect(out.workouts).toBe(workouts);
    expect(out.theme).toBe('light');
    expect(out.hasCompletedOnboarding).toBe(true);
  });

  it('tolerates empty / malformed persisted state', () => {
    expect(migratePersistedState(undefined, 0)).toEqual({});
    expect(migratePersistedState(null, 0)).toEqual({});
    const out = migratePersistedState({ uiPreferences: 'junk' }, 0) as any;
    expect(out.uiPreferences).toBe('junk'); // not an object — left for normal validation paths
  });

  it('simple-for-everyone (v3): v2 blobs migrate to Simple whatever they stored', () => {
    const detailed = migratePersistedState(
      { uiPreferences: { ...DEFAULT_UI_PREFERENCES, density: 'detailed' } }, 2,
    ) as any;
    expect(detailed.uiPreferences.density).toBe('simple');
    const simple = migratePersistedState(
      { uiPreferences: { ...DEFAULT_UI_PREFERENCES, density: 'simple' } }, 2,
    ) as any;
    expect(simple.uiPreferences.density).toBe('simple');
    // Pre-redesign v1 blob (no density key): v2 would have set Detailed, v3 overrides to Simple.
    const v1out = migratePersistedState({ uiPreferences: {} }, 1) as any;
    expect(v1out.uiPreferences.density).toBe('simple');
  });

  it('simple-for-everyone (v3): a post-migration Detailed choice is respected', () => {
    // A v3 blob already carries the user's own choice — migration must not flip it back.
    const out = migratePersistedState(
      { uiPreferences: { ...DEFAULT_UI_PREFERENCES, density: 'detailed' } }, 3,
    ) as any;
    expect(out.uiPreferences.density).toBe('detailed');
  });

  it('simple-for-everyone (v3): explicit section choices survive the density migration', () => {
    const layout = { visible: { coach: false, readiness: true }, order: ['coach', 'nutrition-strip'] };
    const out = migratePersistedState(
      { uiPreferences: { ...DEFAULT_UI_PREFERENCES, density: 'detailed', todayLayout: layout } }, 2,
    ) as any;
    expect(out.uiPreferences.density).toBe('simple');
    // Explicit visibility choices survive verbatim; the partial order is
    // healed by sanitize (missing sections appended), never reordered.
    expect(out.uiPreferences.todayLayout.visible).toEqual(layout.visible);
    expect(out.uiPreferences.todayLayout.order.slice(0, 2)).toEqual(layout.order);
  });
});
