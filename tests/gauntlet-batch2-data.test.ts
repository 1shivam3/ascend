/**
 * Gauntlet batch-2 (store/data) fixes: DI-07, DI-09, DI-10, DI-11,
 * DI-12, DI-13, DI-14, DI-15, R3, R6, R10, R12.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseImportedDateString,
  normalizeImportedDate,
  normalizeRowDates,
  dedupeRowsByDate,
  normalizeAndDedupeBodyMetricDates,
  getLocalTodayStr,
} from '../src/lib/formatters';
import { parseWorkoutCSV } from '../src/lib/workout-import';
import { scaleFoodByQuantity } from '../src/lib/macros';
import { dayHasWorkoutEffort, dayIsActive } from '../src/lib/day-activity';
import { getDaySummary } from '../src/lib/home-matrix';
import {
  sanitizePRUpdate,
  sanitizeMealUpdate,
  sanitizePlannedWorkout,
} from '../src/lib/update-sanitize';
import {
  fallbackProteinTargetG,
  fallbackMacroGoals,
  FALLBACK_BODYWEIGHT_KG,
} from '../src/lib/effective-goals';
import { calculateHydrationTarget } from '../src/lib/habits';
import { shouldDropStaleProfileUpdate } from '../src/lib/supabase/reconcile';
import { useStore, getLastImportNormalizedCount } from '../src/lib/store';
import {
  importFullBackupJSON,
  getLastImportError,
  MAX_BACKUP_IMPORT_BYTES,
} from '../src/lib/storage';
import { ARCHIVED_HISTORY_KEY, ARCHIVED_HISTORY_PREV_KEY } from '../src/lib/history-fork';
import { shouldResurfaceUpdate, UPDATE_REPROMPT_MS } from '../src/components/ServiceWorkerRegister';
import { shouldShowSyncError } from '../src/components/SyncErrorBanner';
import type { FoodItem, PersonalRecord } from '../src/lib/types';

const readSrc = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
  };
}

describe('DI-07: imported date parsing is explicit (no UTC shift, no silent US read)', () => {
  it('valid ISO days pass unchanged', () => {
    expect(parseImportedDateString('2026-10-01')).toBe('2026-10-01');
  });

  it('future and non-calendar dates are rejected', () => {
    expect(parseImportedDateString('2999-01-01')).toBeNull();
    expect(parseImportedDateString('2026-02-30')).toBeNull();
    expect(parseImportedDateString('not a date')).toBeNull();
  });

  it('slash dates disambiguate by range', () => {
    // 13 cannot be a month: DD/MM/YYYY
    expect(parseImportedDateString('13/02/2026')).toBe('2026-02-13');
    // 25 cannot be a month in second place: MM/DD/YYYY
    expect(parseImportedDateString('02/25/2026')).toBe('2026-02-25');
    // Both <= 12: US export order (documented choice)
    expect(parseImportedDateString('01/02/2026')).toBe('2026-01-02');
  });

  it('normalizeImportedDate applies the today-fallback and reports changes', () => {
    const today = getLocalTodayStr();
    expect(normalizeImportedDate('2026-10-01')).toEqual({ date: '2026-10-01', changed: false });
    expect(normalizeImportedDate('13/02/2026')).toEqual({ date: '2026-02-13', changed: true });
    expect(normalizeImportedDate('2999-01-01')).toEqual({ date: today, changed: true });
    expect(normalizeImportedDate('garbage')).toEqual({ date: today, changed: true });
    expect(normalizeImportedDate(undefined)).toEqual({ date: today, changed: true });
  });

  it('normalizeRowDates counts fixes; body-metric pipeline dedupes expressed dates only', () => {
    const { rows, normalizedCount } = normalizeRowDates([
      { id: 'a', date: '2026-10-01' },
      { id: 'b', date: '2999-01-01' },
      { id: 'c', date: '01/02/2026' },
    ]);
    expect(normalizedCount).toBe(2);
    expect(rows.map((r) => r.date)).toEqual(['2026-10-01', getLocalTodayStr(), '2026-01-02']);

    // True source duplicates of one expressed day collapse (last wins).
    const deduped = normalizeAndDedupeBodyMetricDates([
      { id: 'first', date: '2026-10-01' },
      { id: 'other', date: '2026-10-02' },
      { id: 'last', date: '2026-10-01' },
    ]);
    expect(deduped.rows.map((r) => r.id)).toEqual(['last', 'other']);

    // F12a contract: distinct invalid dates all fall back to today
    // and NONE of the records is dropped.
    const today = getLocalTodayStr();
    const restored = normalizeAndDedupeBodyMetricDates([
      { id: 'm_future', date: '2999-01-01' },
      { id: 'm_bad', date: '2026-02-30' },
      { id: 'm_garbage', date: 'not-a-date' },
      { id: 'm_ok', date: '2026-10-01' },
    ]);
    expect(restored.rows).toHaveLength(4);
    expect(restored.rows.map((r) => r.date)).toEqual([today, today, today, '2026-10-01']);
    expect(restored.normalizedCount).toBe(3);

    // dedupeRowsByDate still behaves as the plain last-wins helper.
    const plain = dedupeRowsByDate([
      { id: 'x', date: '2026-10-01' },
      { id: 'y', date: '2026-10-01' },
    ]);
    expect(plain.map((r) => r.id)).toEqual(['y']);
  });

  it('CSV import: US date normalized, future row skipped', () => {
    const csv = [
      'Date,Exercise,Weight,Reps',
      '02/25/2026,Bench Press,100,5',
      '2999-01-01,Bench Press,100,5',
      '2026-10-05,Squat,140,3',
    ].join('\n');
    const result = parseWorkoutCSV(csv);
    expect(result.datesNormalized).toBe(1);
    expect(result.workouts.map((w) => w.date).sort()).toEqual(['2026-02-25', '2026-10-05']);
  });

  it('store restore normalizes meal/workout/PR dates and reports the count', () => {
    useStore.setState({ meals: [], workouts: [], prs: [], bodyMetrics: [] });
    const ok = useStore.getState().importAllData({
      meals: [{ id: 'm1', name: 'Lunch', date: '2999-05-05', foods: [] }],
      workouts: [{ id: 'w1', date: 'garbage-date', exercises: [] }],
      prs: [
        {
          id: 'p1',
          exercise: 'Squat',
          weightKg: 100,
          weightLbs: 220,
          reps: 5,
          oneRepMax: 116,
          date: '2026-10-01',
        },
      ],
      bodyMetrics: [
        { id: 'b1', date: '2026-10-01', weightKg: 80 },
        { id: 'b2', date: '2026-10-01', weightKg: 81 },
      ],
    });
    expect(ok).toBe(true);
    const s = useStore.getState();
    expect(s.meals[0].date).toBe(getLocalTodayStr());
    expect(s.workouts[0].date).toBe(getLocalTodayStr());
    expect(s.prs[0].date).toBe('2026-10-01');
    // Same-date body metrics deduped, last row wins.
    expect(s.bodyMetrics).toHaveLength(1);
    expect(s.bodyMetrics[0].id).toBe('b2');
    expect(getLastImportNormalizedCount()).toBe(2);
  });
});

describe('DI-09: stale profile update dropped at apply time', () => {
  const remote = '2026-10-20T10:00:00.000Z';
  it('fresh local edit newer than remote → drop', () => {
    expect(
      shouldDropStaleProfileUpdate({
        freshLocalUpdatedAt: '2026-10-29T10:00:00.000Z',
        remoteUpdatedAt: remote,
        isCrossAccountSwitch: false,
      }),
    ).toBe(true);
  });
  it('no mid-sync edit (fresh stamp older) → keep', () => {
    expect(
      shouldDropStaleProfileUpdate({
        freshLocalUpdatedAt: '2026-10-19T10:00:00.000Z',
        remoteUpdatedAt: remote,
        isCrossAccountSwitch: false,
      }),
    ).toBe(false);
  });
  it('cross-account switch never drops', () => {
    expect(
      shouldDropStaleProfileUpdate({
        freshLocalUpdatedAt: '2026-10-29T10:00:00.000Z',
        remoteUpdatedAt: remote,
        isCrossAccountSwitch: true,
      }),
    ).toBe(false);
  });
  it('missing stamps keep the update (fail to remote)', () => {
    expect(
      shouldDropStaleProfileUpdate({
        freshLocalUpdatedAt: undefined,
        remoteUpdatedAt: remote,
        isCrossAccountSwitch: false,
      }),
    ).toBe(false);
  });
});

describe('DI-10: no remaining UTC "today" derivations at the fixed sites', () => {
  it('DataVaultModal, SettingsView, lifter-twin use getLocalTodayStr', () => {
    for (const rel of [
      'src/components/DataVaultModal.tsx',
      'src/components/SettingsView.tsx',
      'src/lib/lifter-twin.ts',
    ]) {
      const src = readSrc(rel);
      expect(src).not.toContain("new Date().toISOString().split('T')[0]");
      expect(src).toContain('getLocalTodayStr');
    }
  });
});

describe('DI-11: one fallback derivation', () => {
  it('protein fallback is bw x 1.8, flat 140 without a bodyweight', () => {
    expect(fallbackProteinTargetG(80)).toBe(144);
    expect(fallbackProteinTargetG(null)).toBe(140);
    expect(fallbackProteinTargetG(undefined)).toBe(140);
  });
  it('fallback goals come from the canonical recommendation', () => {
    const goals = fallbackMacroGoals(null);
    expect(goals.proteinG).toBe(Math.round(FALLBACK_BODYWEIGHT_KG * 1.8));
    expect(goals.carbsG).toBeGreaterThan(0);
    expect(goals.fatG).toBeGreaterThan(0);
  });
  it('store hydration default equals the canonical formula output', () => {
    expect(useStore.getState().hydrationConfig.dailyTargetMl).toBe(calculateHydrationTarget({}));
    expect(calculateHydrationTarget({})).toBe(2650);
  });
  it('the divergent literals are gone from the pages', () => {
    expect(readSrc('src/components/HomePage.tsx')).not.toContain('bwKg * 2.0');
    expect(readSrc('src/components/MealsPage.tsx')).not.toContain('|| 220');
    expect(readSrc('src/components/MealsPage.tsx')).not.toContain('|| 70');
  });
});

describe('DI-12: zero-calorie items scale', () => {
  const water: FoodItem = {
    name: 'Water',
    quantity: 250,
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
  } as FoodItem;
  it('quantity updates on a zero-calorie item', () => {
    const out = scaleFoodByQuantity(water, 500);
    expect(out.quantity).toBe(500);
    expect(out.calories).toBe(0);
  });
  it('invalid quantities are still refused', () => {
    expect(scaleFoodByQuantity(water, 0)).toBe(water);
    expect(scaleFoodByQuantity(water, -5)).toBe(water);
  });
  it('normal items still scale proportionally', () => {
    const chicken: FoodItem = {
      name: 'Chicken',
      quantity: 100,
      calories: 165,
      proteinG: 31,
      carbsG: 0,
      fatG: 3.6,
    } as FoodItem;
    const out = scaleFoodByQuantity(chicken, 200);
    expect(out.calories).toBe(330);
    expect(out.proteinG).toBe(62);
  });
});

describe('DI-14: shared activity predicate', () => {
  const shellWorkout: any = { id: 'w1', date: '2026-10-01', exercises: [{ name: 'Squat', sets: [{ reps: 5, weight: 100, completed: false }] }] };
  const realWorkout: any = { id: 'w2', date: '2026-10-01', exercises: [{ name: 'Squat', sets: [{ reps: 5, weight: 100, completed: true }] }] };
  const runWorkout: any = { id: 'w3', date: '2026-10-01', kind: 'run', exercises: [] };

  it('an empty shell workout is not effort; a completed set or a run is', () => {
    expect(dayHasWorkoutEffort('2026-10-01', [shellWorkout])).toBe(false);
    expect(dayHasWorkoutEffort('2026-10-01', [realWorkout])).toBe(true);
    expect(dayHasWorkoutEffort('2026-10-01', [runWorkout])).toBe(true);
    expect(dayHasWorkoutEffort('2026-10-02', [realWorkout])).toBe(false);
  });

  it('home matrix habit agrees with the predicate', () => {
    const inputs: any = {
      workouts: [shellWorkout],
      meals: [],
      waterLogs: {},
      waterTargetMl: 2500,
      creatineLogs: {},
      showCreatine: false,
    };
    const summary = getDaySummary('2026-10-01', inputs);
    expect(summary.habits.find((h) => h.id === 'workout')?.done).toBe(false);
    const withReal = getDaySummary('2026-10-01', { ...inputs, workouts: [realWorkout] });
    expect(withReal.habits.find((h) => h.id === 'workout')?.done).toBe(true);
  });

  it('dayIsActive keeps the 3-meals rule', () => {
    const meals: any = [1, 2, 3].map((i) => ({ id: `m${i}`, date: '2026-10-01', foods: [{ name: 'x' }] }));
    expect(dayIsActive('2026-10-01', [], meals)).toBe(true);
    expect(dayIsActive('2026-10-01', [], meals.slice(0, 2))).toBe(false);
  });
});

describe('DI-15: update actions validate at the store boundary', () => {
  const pr: PersonalRecord = {
    id: 'p1',
    exercise: 'Bench Press',
    weightKg: 100,
    weightLbs: 220,
    reps: 5,
    oneRepMax: 116,
    date: '2026-10-01',
  };
  it('updatePR clamps impossible values and keeps the date on invalid input', () => {
    const out = sanitizePRUpdate(pr, { weightKg: -5, oneRepMax: NaN, date: '9999-01-01', reps: 0 });
    expect(out.weightKg).toBe(0);
    expect(out.oneRepMax).toBe(116); // NaN falls back to existing
    expect(out.date).toBe('2026-10-01'); // future date rejected
    expect(out.reps).toBe(1);
    const heavy = sanitizePRUpdate(pr, { weightKg: 9999 });
    expect(heavy.weightKg).toBe(500); // MAX_PR_WEIGHT_KG
  });
  it('store updatePR applies the sanitizer', () => {
    useStore.setState({ prs: [pr] });
    useStore.getState().updatePR('p1', { weightKg: -5 });
    expect(useStore.getState().prs[0].weightKg).toBe(0);
  });
  it('updateMeal clamps food macros and validates the date', () => {
    const meal: any = { id: 'm1', name: 'Lunch', date: '2026-10-01', foods: [] };
    const out = sanitizeMealUpdate(meal, {
      date: '2026-02-30',
      foods: [{ name: 'X', calories: -50, proteinG: 1e9, carbsG: 10, fatG: 5 } as FoodItem],
    });
    expect(out.date).toBe('2026-10-01');
    expect(out.foods[0].calories).toBe(0);
    expect(out.foods[0].proteinG).toBe(2000);
  });
  it('plan updates clamp prescription numbers', () => {
    const plan: any = {
      id: 'pl1',
      name: 'Push',
      createdAt: '2026-10-01T00:00:00.000Z',
      exercises: [{ name: 'Bench', targetSets: 0, targetReps: -3, targetWeight: 5000, targetRpe: 99 }],
    };
    const out = sanitizePlannedWorkout(plan);
    expect(out.exercises[0].targetSets).toBe(1);
    expect(out.exercises[0].targetReps).toBe(1);
    expect(out.exercises[0].targetWeight).toBe(1000);
    expect(out.exercises[0].targetRpe).toBe(10);
  });
});

describe('DI-13: archiving rotates the previous archive into the prev slot', () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = storage;
    useStore.setState({
      workouts: [{ id: 'w1', date: '2026-10-01', exercises: [] } as any],
      meals: [],
      plannedWorkouts: [],
      prs: [],
      bodyMetrics: [],
    });
  });
  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  it('the first archive survives a second Start-fresh in the prev slot', () => {
    expect(useStore.getState().archiveRetainedHistory()).toBe(true);
    const first = storage.getItem(ARCHIVED_HISTORY_KEY);
    expect(first).toBeTruthy();
    useStore.setState({
      workouts: [{ id: 'w2', date: '2026-10-02', exercises: [] } as any],
    });
    expect(useStore.getState().archiveRetainedHistory()).toBe(true);
    expect(storage.getItem(ARCHIVED_HISTORY_PREV_KEY)).toBe(first);
    const second = storage.getItem(ARCHIVED_HISTORY_KEY);
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });
});

describe('R12: backup import cap is 10 MB and the reason is recorded', () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
    (globalThis as any).window = { localStorage: storage };
  });
  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('an oversized backup is rejected with a recorded reason', () => {
    const big = ' '.repeat(MAX_BACKUP_IMPORT_BYTES + 1);
    expect(importFullBackupJSON(big)).toBe(false);
    expect(getLastImportError()).toMatch(/too large/i);
  });

  it('a valid small backup still imports and clears the error', () => {
    expect(importFullBackupJSON(JSON.stringify({ workouts: [] }))).toBe(true);
    expect(getLastImportError()).toBeNull();
  });
});

describe('R10: update banner resurfaces after the quiet period', () => {
  it('respects the waiting worker + elapsed interval', () => {
    const dismissedAt = 1_000_000;
    expect(shouldResurfaceUpdate(null, dismissedAt + UPDATE_REPROMPT_MS, true)).toBe(false);
    expect(shouldResurfaceUpdate(dismissedAt, dismissedAt + 1000, true)).toBe(false);
    expect(shouldResurfaceUpdate(dismissedAt, dismissedAt + UPDATE_REPROMPT_MS, true)).toBe(true);
    expect(shouldResurfaceUpdate(dismissedAt, dismissedAt + UPDATE_REPROMPT_MS, false)).toBe(false);
    expect(UPDATE_REPROMPT_MS).toBe(30 * 60 * 1000);
  });
});

describe('R3: sync error banner visibility rule', () => {
  it('shows only for a signed-in user in the error state', () => {
    expect(shouldShowSyncError('error', true)).toBe(true);
    expect(shouldShowSyncError('error', false)).toBe(false);
    expect(shouldShowSyncError('synced', true)).toBe(false);
    expect(shouldShowSyncError('syncing', true)).toBe(false);
  });
  it('the banner is mounted in the app shell', () => {
    expect(readSrc('src/app/page.tsx')).toContain('<SyncErrorBanner />');
  });
});

describe('R6: progress-photo protections are in place', () => {
  it('photos are downscaled, failures toast, and the device-only note renders', () => {
    const src = readSrc('src/components/ProgressPage.tsx');
    expect(src).toContain('resizeAndCompressImage');
    expect(src).toContain('maxDimension: 800');
    expect(src).toContain('progress.photoNotSavedMsg');
    expect(src).toContain('progress.photosDeviceNote');
  });
});
