import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/lib/store';
import { getLocalTodayStr, getMondayOfWeek } from '../src/lib/formatters';
import type { WorkoutEntry, WorkoutSet } from '../src/lib/types';

/**
 * QA4-011 — refreshStreak was dead code (zero callers), so freeze
 * consumption + the weekly refill never persisted and the
 * 1-freeze-per-week cap was unenforced. These tests exercise the
 * STORE action (the thing now wired to app start / day rollover /
 * workout completion), not just the pure streak-freeze functions.
 */

const set = (overrides: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({ reps: 10, unit: 'kg', ...overrides } as WorkoutSet);

const w = (id: string, date: string): WorkoutEntry =>
  ({ id, date, exercises: [{ name: 'Squat', sets: [set({ completed: true })] }] } as WorkoutEntry);

/** Local date string N days before real today (refreshStreak uses real today). */
const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return getLocalTodayStr(d);
};

const thisMonday = () => getLocalTodayStr(getMondayOfWeek());
const lastMonday = () => {
  const m = getMondayOfWeek();
  m.setDate(m.getDate() - 7);
  return getLocalTodayStr(m);
};

function seedStreak(partial: Record<string, unknown>) {
  useStore.setState({
    streak: {
      freezesAvailable: 1,
      freezesUsedThisWeek: 0,
      weekStart: thisMonday(),
      longestStreak: 0,
      ...(partial as object),
    } as never,
  });
}

describe('refreshStreak wiring (QA4-011)', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
    useStore.setState({ workouts: [], meals: [] });
  });

  it('consumes + persists a freeze when a missed day is bridged', () => {
    seedStreak({});
    // Active today, yesterday and 3 days ago — 2 days ago missed.
    useStore.setState({ workouts: [w('a', daysAgo(0)), w('b', daysAgo(1)), w('c', daysAgo(3))] });

    useStore.getState().refreshStreak();

    const streak = useStore.getState().streak;
    expect(streak.freezesAvailable).toBe(0);
    expect(streak.freezesUsedThisWeek).toBe(1);
    expect(streak.freezeAppliedTo).toBe(daysAgo(2));
    expect(streak.longestStreak).toBe(3);
  });

  it('is idempotent: refreshing again does not consume a second freeze for the same miss', () => {
    seedStreak({});
    useStore.setState({ workouts: [w('a', daysAgo(0)), w('b', daysAgo(1)), w('c', daysAgo(3))] });

    useStore.getState().refreshStreak();
    useStore.getState().refreshStreak();
    useStore.getState().refreshStreak();

    const streak = useStore.getState().streak;
    expect(streak.freezesAvailable).toBe(0);
    expect(streak.freezesUsedThisWeek).toBe(1);
  });

  it('weekly refill restores availability and resets the used counter', () => {
    seedStreak({ freezesAvailable: 0, freezesUsedThisWeek: 1, weekStart: lastMonday(), freezeAppliedTo: daysAgo(9) });
    useStore.setState({ workouts: [] });

    useStore.getState().refreshStreak();

    const streak = useStore.getState().streak;
    expect(streak.weekStart).toBe(thisMonday());
    expect(streak.freezesAvailable).toBe(1);
    expect(streak.freezesUsedThisWeek).toBe(0);
  });

  it('a refilled freeze is NOT re-consumed for the same already-bridged miss', () => {
    // Last week a freeze bridged the miss 2 days ago. This week the
    // inventory refilled — pure history math would burn the fresh
    // freeze on the same day again. The persisted freezeAppliedTo
    // guard must prevent that.
    seedStreak({
      freezesAvailable: 0,
      freezesUsedThisWeek: 1,
      weekStart: lastMonday(),
      freezeAppliedTo: daysAgo(2),
    });
    useStore.setState({ workouts: [w('a', daysAgo(0)), w('b', daysAgo(1)), w('c', daysAgo(3))] });

    useStore.getState().refreshStreak();

    const streak = useStore.getState().streak;
    expect(streak.freezesAvailable).toBe(1); // refilled, not re-burned
    expect(streak.freezesUsedThisWeek).toBe(0);
    expect(streak.freezeAppliedTo).toBe(daysAgo(2));
  });

  it('cap holds: at most one freeze is ever consumed per week', () => {
    seedStreak({});
    // Two separate single misses in the run — only the first (nearest)
    // can be bridged; one freeze total.
    useStore.setState({
      workouts: [w('a', daysAgo(0)), w('b', daysAgo(2)), w('c', daysAgo(4))],
    });

    useStore.getState().refreshStreak();

    const streak = useStore.getState().streak;
    expect(streak.freezesUsedThisWeek).toBeLessThanOrEqual(1);
    expect(streak.freezesAvailable).toBeGreaterThanOrEqual(0);
    expect(streak.freezesAvailable + streak.freezesUsedThisWeek).toBeLessThanOrEqual(1);
  });

  it('addWorkout runs the refresh (stale week is refilled on workout completion)', () => {
    seedStreak({ freezesAvailable: 0, freezesUsedThisWeek: 1, weekStart: lastMonday(), freezeAppliedTo: daysAgo(9) });

    useStore.getState().addWorkout(w('new', daysAgo(0)));

    const streak = useStore.getState().streak;
    expect(streak.weekStart).toBe(thisMonday());
    expect(streak.freezesAvailable).toBe(1);
  });
});
