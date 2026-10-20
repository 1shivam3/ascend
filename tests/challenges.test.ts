import { describe, it, expect } from 'vitest';
import {
  monthlyChallenges,
  evaluateChallenge,
  evaluateChallengeReward,
  optInChallenge,
  optOutChallenge,
  dismissChallenge,
  shouldShowChallengeCard,
  markChallengeRewardGranted,
  challengeInstanceKey,
  challengeBadgeId,
  challengeXpEventId,
  getChallengeMonth,
  getInitialXState,
} from '../src/lib/challenges';
import type { ChallengeDef, ChallengeActivityData } from '../src/lib/challenges';
import type { WorkoutEntry, MealEntry, WorkoutSet } from '../src/lib/types';

const set = (overrides: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({ reps: 10, unit: 'kg', ...overrides } as WorkoutSet);

const w = (id: string, date: string): WorkoutEntry =>
  ({ id, date, exercises: [{ name: 'Squat', sets: [set({ completed: true })] }] } as WorkoutEntry);

const m = (id: string, date: string, name: string): MealEntry =>
  ({
    id,
    date,
    name,
    foods: [{ name: 'Oats', calories: 300, proteinG: 10, carbsG: 55, fatG: 6 }],
  } as MealEntry);

const MONTH = '2026-10';
const def = (id: string, metric: ChallengeDef['metric'], target: number): ChallengeDef => ({
  id,
  title: id,
  description: id,
  target,
  metric,
  month: MONTH,
});

const emptyData = (): ChallengeActivityData => ({ workouts: [], meals: [], prs: [], currentStreak: 0 });

describe('monthlyChallenges', () => {
  it('ships the four catalog challenges for the month', () => {
    const defs = monthlyChallenges(MONTH);
    expect(defs.map((d) => d.id)).toEqual(['workouts-12', 'breakfasts-20', 'streak-7', 'prs-5']);
    expect(defs.every((d) => d.month === MONTH)).toBe(true);
  });
});

describe('evaluateChallenge', () => {
  it('tracks workouts from existing logs — no extra logging needed', () => {
    const data: ChallengeActivityData = {
      ...emptyData(),
      workouts: [w('a', '2026-10-02'), w('b', '2026-10-05'), w('c', '2026-10-09')],
    };
    const e = evaluateChallenge(def('workouts-12', 'workouts', 12), data);
    expect(e).toMatchObject({ progress: 3, target: 12, pct: 25, completed: false });
    expect(e.completedDate).toBeUndefined();
  });

  it('ignores workouts from other months and empty logs', () => {
    const data: ChallengeActivityData = {
      ...emptyData(),
      workouts: [
        w('a', '2026-10-02'),
        w('b', '2026-09-30'),
        { ...w('c', '2026-10-03'), exercises: [] },
      ],
    };
    const e = evaluateChallenge(def('workouts-12', 'workouts', 12), data);
    expect(e.progress).toBe(1);
  });

  it('completes and records the date the target was reached', () => {
    const data: ChallengeActivityData = {
      ...emptyData(),
      workouts: [w('a', '2026-10-01'), w('b', '2026-10-03'), w('c', '2026-10-07'), w('d', '2026-10-09')],
    };
    const e = evaluateChallenge(def('w3', 'workouts', 3), data);
    expect(e.completed).toBe(true);
    expect(e.completedDate).toBe('2026-10-07');
    expect(e.pct).toBe(100);
    expect(e.progress).toBe(3); // clamped to target
  });

  it('counts breakfasts by meal name (case-insensitive)', () => {
    const data: ChallengeActivityData = {
      ...emptyData(),
      meals: [
        m('1', '2026-10-01', 'Breakfast'),
        m('2', '2026-10-02', 'breakfast bowl'),
        m('3', '2026-10-03', 'Lunch'),
      ],
    };
    const e = evaluateChallenge(def('breakfasts-20', 'breakfasts', 20), data);
    expect(e.progress).toBe(2);
    expect(e.pct).toBe(10);
  });

  it('evaluates streak challenges from the current streak', () => {
    const e = evaluateChallenge(def('streak-7', 'streak_days', 7), { ...emptyData(), currentStreak: 7 });
    expect(e.completed).toBe(true);
    expect(e.progress).toBe(7);
  });

  it('tracks PRs', () => {
    const data: ChallengeActivityData = {
      ...emptyData(),
      prs: [{ date: '2026-10-04' }, { date: '2026-10-11' }, { date: '2026-09-28' }],
    };
    const e = evaluateChallenge(def('prs-5', 'prs', 5), data);
    expect(e.progress).toBe(2);
    expect(e.pct).toBe(40);
  });
});

describe('opt-in / dismissal (never nag)', () => {
  const challenge = def('workouts-12', 'workouts', 12);

  it('shows the quiet card exactly once: before opt-in and before dismissal', () => {
    const s0 = getInitialXState();
    expect(shouldShowChallengeCard(s0, challenge)).toBe(true);

    const joined = optInChallenge(s0, challenge);
    expect(shouldShowChallengeCard(joined, challenge)).toBe(false);

    const dismissed = dismissChallenge(s0, challenge);
    expect(shouldShowChallengeCard(dismissed, challenge)).toBe(false);
  });

  it('opt-out hides progress display without penalty', () => {
    const s = optOutChallenge(optInChallenge(getInitialXState(), challenge), challenge);
    expect(shouldShowChallengeCard(s, challenge)).toBe(true); // card may re-offer next visit, but...
    // ...dismissal is the sticky "leave me alone" signal:
    const d = dismissChallenge(s, challenge);
    expect(shouldShowChallengeCard(d, challenge)).toBe(false);
  });

  it('state is per month — last month never leaks into this month', () => {
    const lastMonth: ChallengeDef = { ...challenge, month: '2026-09' };
    const s = dismissChallenge(getInitialXState(), lastMonth);
    expect(shouldShowChallengeCard(s, challenge)).toBe(true);
    expect(challengeInstanceKey(challenge)).toBe('workouts-12:2026-10');
  });
});

describe('completion rewards', () => {
  const challenge = def('w3', 'workouts', 3);
  const completedData: ChallengeActivityData = {
    ...emptyData(),
    workouts: [w('a', '2026-10-01'), w('b', '2026-10-03'), w('c', '2026-10-07')],
  };

  it('reward is due only when completed AND opted in AND not yet granted', () => {
    const notJoined = evaluateChallengeReward(challenge, completedData, getInitialXState());
    expect(notJoined.evaluation.completed).toBe(true);
    expect(notJoined.rewardDue).toBe(false); // must opt in first — no surprise payouts

    const joined = optInChallenge(getInitialXState(), challenge);
    const due = evaluateChallengeReward(challenge, completedData, joined);
    expect(due.rewardDue).toBe(true);

    const granted = markChallengeRewardGranted(joined, challenge);
    expect(evaluateChallengeReward(challenge, completedData, granted).rewardDue).toBe(false);
  });

  it('no reward when the challenge is not complete', () => {
    const joined = optInChallenge(getInitialXState(), challenge);
    const r = evaluateChallengeReward(challenge, emptyData(), joined);
    expect(r.evaluation.completed).toBe(false);
    expect(r.rewardDue).toBe(false);
  });

  it('produces stable badge and idempotent XP event ids', () => {
    expect(challengeBadgeId(challenge)).toBe('badge:w3:2026-10');
    expect(challengeXpEventId(challenge)).toBe('challenge:w3:2026-10');
  });
});

describe('getChallengeMonth', () => {
  it('derives the YYYY-MM key from a date', () => {
    expect(getChallengeMonth('2026-10-19')).toBe('2026-10');
  });
});
