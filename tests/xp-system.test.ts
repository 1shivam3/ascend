import { describe, it, expect } from 'vitest';
import {
  XP_WORKOUT,
  XP_MEAL,
  XP_PR,
  XP_WATER,
  XP_STREAK_DAY,
  XP_CHALLENGE_COMPLETE,
  MAX_AWARDED_IDS,
  MAX_COMPACTED_AWARD_HASHES,
  hashAwardId,
  xpEventId,
  xpForWorkout,
  xpForMeal,
  awardXp,
  xpForLevel,
  getLevel,
  progressToNext,
  getLevelName,
  getInitialXState,
  summarizeXpInRange,
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
    expect(getInitialXState()).toEqual({
      totalXp: 0,
      awardedIds: [],
      compactedAwardedHashes: [],
    });
  });
});

describe('summarizeXpInRange', () => {
  const meal = (foods: number, date: string): MealEntry =>
    ({
      id: `m-${date}-${foods}`,
      date,
      name: 'Meal',
      foods: Array.from({ length: foods }, () => ({})),
    } as unknown as MealEntry);

  it('sums XP per source for activity inside the range only', () => {
    const s = summarizeXpInRange(
      {
        workouts: [
          workout([set({ completed: true })], '2026-10-19'),
          workout([set({ completed: true })], '2026-10-25'),
          workout([set({ completed: true })], '2026-10-26'), // outside
          workout([set({ completed: false })], '2026-10-20'), // no completed set → 0
        ],
        meals: [meal(2, '2026-10-19'), meal(0, '2026-10-20'), meal(1, '2026-11-02')],
        prs: [{ date: '2026-10-21' }, { date: '2026-10-21' }, { date: '2026-09-30' }],
        waterLogs: { '2026-10-19': 500, '2026-10-20': 0, '2026-10-22': 250, '2026-11-01': 900 },
      },
      '2026-10-19',
      '2026-10-25',
    );
    expect(s.workoutXp).toBe(2 * XP_WORKOUT);
    expect(s.mealXp).toBe(XP_MEAL);
    expect(s.prXp).toBe(2 * XP_PR);
    expect(s.waterXp).toBe(2 * XP_WATER);
    expect(s.total).toBe(2 * XP_WORKOUT + XP_MEAL + 2 * XP_PR + 2 * XP_WATER);
  });

  it('returns zeros for an empty range', () => {
    const s = summarizeXpInRange(
      { workouts: [], meals: [], prs: [], waterLogs: {} },
      '2026-10-19',
      '2026-10-25',
    );
    expect(s).toEqual({ total: 0, workoutXp: 0, mealXp: 0, prXp: 0, waterXp: 0 });
  });
});

describe('QA4-042 awardXp ledger compaction (cap boundary)', () => {
  const batch = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `workout:w${from + i}`,
      type: 'workout' as const,
      amount: 1,
    }));

  it('hashAwardId is deterministic, 16 hex chars, and discriminating', () => {
    expect(hashAwardId('workout:abc')).toBe(hashAwardId('workout:abc'));
    expect(hashAwardId('workout:abc')).toMatch(/^[0-9a-f]{16}$/);
    expect(hashAwardId('workout:abc')).not.toBe(hashAwardId('workout:abd'));
    expect(hashAwardId('workout:abc')).not.toBe(hashAwardId('meal:abc'));
  });

  it('an id evicted past MAX_AWARDED_IDS still cannot pay twice', () => {
    // Fill the ledger exactly to the cap, then push 5 more so the
    // oldest 5 ids are evicted from the full list into compaction.
    const first = awardXp(batch(0, MAX_AWARDED_IDS), 0);
    expect(first.awardedIds).toHaveLength(MAX_AWARDED_IDS);
    expect(first.compactedAwardedHashes).toHaveLength(0);

    const second = awardXp(batch(MAX_AWARDED_IDS, 5), first.newTotal, first.awardedIds, first.compactedAwardedHashes);
    expect(second.awardedIds).toHaveLength(MAX_AWARDED_IDS);
    expect(second.awardedIds).not.toContain('workout:w0');
    expect(second.compactedAwardedHashes).toHaveLength(5);
    expect(second.compactedAwardedHashes).toContain(hashAwardId('workout:w0'));

    // Replay the evicted oldest id, a mid-list id, and the newest id:
    // none of them may pay again.
    const replay = awardXp(
      [
        { id: 'workout:w0', type: 'workout' },
        { id: 'workout:w5000', type: 'workout' },
        { id: `workout:w${MAX_AWARDED_IDS + 4}`, type: 'workout' },
      ],
      second.newTotal,
      second.awardedIds,
      second.compactedAwardedHashes,
    );
    expect(replay.awarded).toBe(0);
    expect(replay.skippedDuplicates).toBe(3);
    expect(replay.newTotal).toBe(second.newTotal);
  });

  it('new events still award normally after compaction', () => {
    const first = awardXp(batch(0, MAX_AWARDED_IDS + 10), 0);
    const next = awardXp(
      [{ id: 'workout:brand-new', type: 'workout' }],
      first.newTotal,
      first.awardedIds,
      first.compactedAwardedHashes,
    );
    expect(next.awarded).toBe(XP_WORKOUT);
    expect(next.awardedIds).toContain('workout:brand-new');
    expect(next.compactedAwardedHashes.length).toBeGreaterThanOrEqual(10);
  });

  it('legacy callers without a compacted index behave as before', () => {
    const r = awardXp([{ id: 'workout:w1', type: 'workout' }], 0, ['workout:w1']);
    expect(r.awarded).toBe(0);
    expect(r.skippedDuplicates).toBe(1);
    expect(r.compactedAwardedHashes).toEqual([]);
  });

  it('exports a justified compaction bound far above the full-id cap', () => {
    expect(MAX_COMPACTED_AWARD_HASHES).toBeGreaterThanOrEqual(MAX_AWARDED_IDS * 10);
  });
});
