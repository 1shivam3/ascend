import { describe, it, expect } from 'vitest';
import {
  calculateStreak,
  buildActiveDays,
  dayIsActive,
  refreshFreezeWeek,
  applyStreakResult,
  getInitialXState,
  FREEZES_PER_WEEK,
} from '../src/lib/streak-freeze';
import type { WorkoutEntry, MealEntry, WorkoutSet } from '../src/lib/types';

const set = (overrides: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({ reps: 10, unit: 'kg', ...overrides } as WorkoutSet);

const w = (id: string, date: string, sets: WorkoutSet[] = [set({ completed: true })]): WorkoutEntry =>
  ({ id, date, exercises: [{ name: 'Squat', sets }] } as WorkoutEntry);

const m = (id: string, date: string, name = 'Lunch'): MealEntry =>
  ({
    id,
    date,
    name,
    foods: [{ name: 'Rice', calories: 200, proteinG: 4, carbsG: 44, fatG: 0 }],
  } as MealEntry);

// Fixed "today" so tests are deterministic regardless of when they run.
const TODAY = '2026-10-19'; // a Monday

const days = (...offsets: number[]): string[] =>
  offsets.map((o) => {
    const [y, mo, d] = TODAY.split('-').map(Number);
    const dt = new Date(y, mo - 1, d);
    dt.setDate(dt.getDate() - o);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  });

describe('dayIsActive', () => {
  const date = '2026-10-19';
  it('counts a day with a real workout as active', () => {
    expect(dayIsActive(date, [w('a', date)], [])).toBe(true);
  });
  it('does not count a workout with zero completed sets', () => {
    expect(dayIsActive(date, [w('a', date, [])], [])).toBe(false);
    expect(dayIsActive(date, [w('a', date, [set({ status: 'skipped' })])], [])).toBe(false);
  });
  it('counts 3+ meals as active', () => {
    const meals = [m('1', date, 'Breakfast'), m('2', date, 'Lunch'), m('3', date, 'Dinner')];
    expect(dayIsActive(date, [], meals)).toBe(true);
  });
  it('does not count 2 meals as active', () => {
    expect(dayIsActive(date, [], [m('1', date, 'Lunch'), m('2', date, 'Dinner')])).toBe(false);
  });
  it('ignores meals with no foods', () => {
    const empty = { ...m('1', date), foods: [] };
    expect(dayIsActive(date, [], [empty, m('2', date), m('3', date)])).toBe(false);
  });
});

describe('buildActiveDays', () => {
  it('merges workout and meal activity into a sorted unique list', () => {
    const active = buildActiveDays(
      [w('a', '2026-10-17'), w('b', '2026-10-19', [])],
      [m('1', '2026-10-18', 'Breakfast'), m('2', '2026-10-18', 'Lunch'), m('3', '2026-10-18', 'Dinner')],
    );
    expect(active).toEqual(['2026-10-17', '2026-10-18']);
  });
});

describe('calculateStreak', () => {
  it('counts a run ending today', () => {
    const r = calculateStreak({ dailyActivity: days(0, 1, 2), freezesAvailable: 1, todayStr: TODAY });
    expect(r.currentStreak).toBe(3);
    expect(r.longestStreak).toBe(3);
    expect(r.freezeConsumed).toBe(false);
    expect(r.freezesAvailable).toBe(1);
  });

  it('does not break the streak when today has no activity yet (day in progress)', () => {
    const r = calculateStreak({ dailyActivity: days(1, 2, 3), freezesAvailable: 1, todayStr: TODAY });
    expect(r.currentStreak).toBe(3);
    expect(r.freezeConsumed).toBe(false);
  });

  it('auto-consumes one freeze across a single missed day — silently', () => {
    // Active 0,1,3,4 — day 2 missed.
    const r = calculateStreak({ dailyActivity: days(0, 1, 3, 4), freezesAvailable: 1, todayStr: TODAY });
    expect(r.currentStreak).toBe(4);
    expect(r.freezeConsumed).toBe(true);
    expect(r.freezeAppliedTo).toBe(days(2)[0]);
    expect(r.freezesAvailable).toBe(0);
  });

  it('breaks the streak on two consecutive missed days even with a freeze', () => {
    // Active 0, then missed 1 and 2, then 3,4,5 — only the run ending today counts.
    const r = calculateStreak({ dailyActivity: days(0, 3, 4, 5), freezesAvailable: 1, todayStr: TODAY });
    expect(r.currentStreak).toBe(1);
    expect(r.freezeConsumed).toBe(false);
    expect(r.freezesAvailable).toBe(1);
  });

  it('breaks the streak when no freeze is available', () => {
    const r = calculateStreak({ dailyActivity: days(0, 2, 3), freezesAvailable: 0, todayStr: TODAY });
    expect(r.currentStreak).toBe(1);
    expect(r.freezeConsumed).toBe(false);
  });

  it('starts at zero with no activity', () => {
    const r = calculateStreak({ dailyActivity: [], freezesAvailable: 1, todayStr: TODAY });
    expect(r.currentStreak).toBe(0);
    expect(r.longestStreak).toBe(0);
  });

  it('does not consume a freeze when there is no streak to save', () => {
    const r = calculateStreak({ dailyActivity: [], freezesAvailable: 1, todayStr: TODAY });
    expect(r.freezeConsumed).toBe(false);
    expect(r.freezesAvailable).toBe(1);
  });

  it('ignores future-dated activity', () => {
    const r = calculateStreak({ dailyActivity: [...days(0, 1), '2026-10-25'], freezesAvailable: 1, todayStr: TODAY });
    expect(r.currentStreak).toBe(2);
  });
});

describe('freeze week refresh', () => {
  it('refills to one freeze on Monday (weeks start Monday)', () => {
    const state = getInitialXState();
    expect(state.freezesAvailable).toBe(FREEZES_PER_WEEK);
    // Simulate a state from last week with the freeze used up.
    const stale = { ...state, freezesAvailable: 0, freezesUsedThisWeek: 1, weekStart: '2026-10-12' };
    const monday = new Date(2026, 9, 19); // 2026-10-19 is a Monday
    const fresh = refreshFreezeWeek(stale, monday);
    expect(fresh.freezesAvailable).toBe(1);
    expect(fresh.freezesUsedThisWeek).toBe(0);
    expect(fresh.weekStart).toBe('2026-10-19');
  });

  it('does not refill mid-week', () => {
    const state = { ...getInitialXState(), freezesAvailable: 0, freezesUsedThisWeek: 1, weekStart: '2026-10-19' };
    const wednesday = new Date(2026, 9, 21);
    expect(refreshFreezeWeek(state, wednesday)).toBe(state);
  });

  it('applies a streak result to state: consumes freeze, records longest', () => {
    const state = getInitialXState();
    const result = calculateStreak({ dailyActivity: days(0, 1, 3, 4), freezesAvailable: 1, todayStr: TODAY });
    const next = applyStreakResult(state, result);
    expect(next.freezesAvailable).toBe(0);
    expect(next.freezesUsedThisWeek).toBe(1);
    expect(next.longestStreak).toBe(4);
  });
});
