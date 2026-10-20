import { describe, it, expect } from 'vitest';
import {
  XP_WORKOUT,
  XP_MEAL,
  XP_PR,
  XP_WATER,
  XP_STREAK_DAY,
  XP_CHALLENGE_COMPLETE,
  xpEventId,
  xpForWorkout,
  xpForMeal,
  awardXp,
  xpForLevel,
  getLevel,
  progressToNext,
  getLevelName,
  getInitialXState,
} from '../src/lib/xp-system';
import type { WorkoutEntry, MealEntry, WorkoutSet } from '../src/lib/types';

const set = (overrides: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({ reps: 10, unit: 'kg', ...overrides } as WorkoutSet);

const workout = (sets: WorkoutSet[], date = '2026-10-19'): WorkoutEntry =>
  ({
    id: 'w1',
    date,
    exercises: [{ name: 'Bench', sets }],
  } as WorkoutEntry);

const meal = (foods: MealEntry['foods'], name = 'Lunch'): MealEntry =>
  ({ id: 'm1', date: '2026-10-19', name, foods } as MealEntry);

describe('xpForLevel (sqrt curve)', () => {
  it('requires 100*n^2 total XP: L1=100, L2=400, L3=900', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(400);
    expect(xpForLevel(3)).toBe(900);
    expect(xpForLevel(10)).toBe(10000);
    expect(xpForLevel(0)).toBe(0);
  });
});

describe('getLevel', () => {
  it('maps totals to levels with no gaps', () => {
    expect(getLevel(0)).toBe(0);
    expect(getLevel(99)).toBe(0);
    expect(getLevel(100)).toBe(1);
    expect(getLevel(399)).toBe(1);
    expect(getLevel(400)).toBe(2);
    expect(getLevel(899)).toBe(2);
    expect(getLevel(900)).toBe(3);
    expect(getLevel(2500)).toBe(5);
  });
});

describe('progressToNext', () => {
  it('reports 0 progress at brand new', () => {
    expect(progressToNext(0)).toEqual({ level: 0, current: 0, needed: 100, pct: 0 });
  });
  it('resets progress at each level boundary', () => {
    expect(progressToNext(100)).toEqual({ level: 1, current: 0, needed: 300, pct: 0 });
  });
  it('computes partial progress', () => {
    expect(progressToNext(250)).toEqual({ level: 1, current: 150, needed: 300, pct: 50 });
  });
});

describe('getLevelName', () => {
  it('interpolates titles between named tiers', () => {
    expect(getLevelName(0)).toBe('Newcomer');
    expect(getLevelName(1)).toBe('Initiate');
    expect(getLevelName(4)).toBe('Initiate');
    expect(getLevelName(5)).toBe('Disciplined');
    expect(getLevelName(9)).toBe('Disciplined');
    expect(getLevelName(10)).toBe('Athlete');
    expect(getLevelName(15)).toBe('Dedicated');
    expect(getLevelName(20)).toBe('Elite');
    expect(getLevelName(25)).toBe('Master');
    expect(getLevelName(30)).toBe('Legend');
    expect(getLevelName(40)).toBe('Legend');
  });
});

describe('earning rules', () => {
  it('awards 100 XP for a workout with at least one completed set', () => {
    expect(xpForWorkout(workout([set({ completed: true })]))).toBe(XP_WORKOUT);
    expect(XP_WORKOUT).toBe(100);
  });
  it('awards 0 for an empty log — no farming', () => {
    expect(xpForWorkout(workout([]))).toBe(0);
    expect(xpForWorkout(workout([set({ reps: 0 })]))).toBe(0);
  });
  it('awards 0 when every set was skipped', () => {
    expect(xpForWorkout(workout([set({ status: 'skipped' })]))).toBe(0);
  });
  it('awards 20 XP for a logged meal, 0 for an empty one', () => {
    expect(xpForMeal(meal([{ name: 'Rice', calories: 200, proteinG: 4, carbsG: 44, fatG: 0 }]))).toBe(XP_MEAL);
    expect(xpForMeal(meal([]))).toBe(0);
    expect(XP_MEAL).toBe(20);
  });
  it('exports the full fixed schedule', () => {
    expect(XP_PR).toBe(50);
    expect(XP_WATER).toBe(5);
    expect(XP_STREAK_DAY).toBe(10);
    expect(XP_CHALLENGE_COMPLETE).toBe(200);
  });
  it('builds canonical event ids', () => {
    expect(xpEventId('workout', 'abc')).toBe('workout:abc');
  });
});

describe('awardXp', () => {
  it('awards default amounts per type and sums them', () => {
    const r = awardXp(
      [
        { id: 'workout:w1', type: 'workout' },
        { id: 'meal:m1', type: 'meal' },
        { id: 'pr:p1', type: 'pr' },
      ],
      0,
    );
    expect(r.awarded).toBe(170);
    expect(r.newTotal).toBe(170);
    expect(r.skippedDuplicates).toBe(0);
    expect(r.leveledUp).toBe(true);
    expect(r.newLevel).toBe(1);
    expect(r.awardedIds).toEqual(['workout:w1', 'meal:m1', 'pr:p1']);
  });
  it('is idempotent — same ids twice never double-count', () => {
    const first = awardXp([{ id: 'workout:w1', type: 'workout' }], 0);
    const second = awardXp(
      [
        { id: 'workout:w1', type: 'workout' },
        { id: 'meal:m1', type: 'meal' },
      ],
      first.newTotal,
      first.awardedIds,
    );
    expect(second.awarded).toBe(20);
    expect(second.newTotal).toBe(120);
    expect(second.skippedDuplicates).toBe(1);
  });
  it('respects explicit amounts over defaults', () => {
    const r = awardXp([{ id: 'bonus:x', type: 'workout', amount: 25 }], 0);
    expect(r.awarded).toBe(25);
  });
  it('does not level up when staying inside the same level', () => {
    const r = awardXp([{ id: 'water:1', type: 'water' }], 100);
    expect(r.leveledUp).toBe(false);
    expect(r.newLevel).toBe(1);
  });
  it('never loses XP — totals only grow', () => {
    const r = awardXp([], 500);
    expect(r.awarded).toBe(0);
    expect(r.newTotal).toBe(500);
  });
  it('starts from a clean initial state', () => {
    expect(getInitialXState()).toEqual({ totalXp: 0, awardedIds: [] });
  });
});
