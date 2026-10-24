/**
 * Monthly opt-in challenges — the "quiet side quest" system.
 *
 * Design notes:
 * - Opt-IN only, never assigned. Joining is a choice, and the only invitation
 *   is one quiet card on a relevant surface. Dismissing it hides it for the
 *   month. No reminders, no nudges, no "your friends are doing it".
 * - Zero extra logging: progress derives entirely from data the user already
 *   logs (workouts, meals, PRs). A challenge must never create a new chore.
 * - Completing awards 200 XP + a badge id via the XP ledger (idempotent, so a
 *   challenge can only ever pay out once per month).
 * - Challenges are monthly instances: same challenge id, new `month`
 *   ("YYYY-MM"). Opt-in/dismissal state is keyed by `${id}:${month}`.
 */
import { isSetCompleted } from './types';
import type { WorkoutEntry, MealEntry } from './types';
import type { StringKey } from './i18n/en';

export type ChallengeMetric =
  | 'workouts'
  | 'breakfasts'
  | 'streak_days'
  | 'prs'
  | 'meals'
  | 'water_days';

export interface ChallengeDef {
  id: string;
  title: string;
  description: string;
  /** LIVE-P1-03: localized title/description — renderers prefer these via t(). */
  titleKey?: StringKey;
  descriptionKey?: StringKey;
  /** How many of the metric to reach. */
  target: number;
  metric: ChallengeMetric;
  /** Month this instance runs in, "YYYY-MM". */
  month: string;
}

export interface ChallengeActivityData {
  workouts: WorkoutEntry[];
  meals: MealEntry[];
  /** PR occurrences with date; any shape carrying a YYYY-MM-DD date works. */
  prs: Array<{ date: string }>;
  /** Current streak length in days (for the "7-day streak" style challenge). */
  currentStreak: number;
  /** Dates (YYYY-MM-DD) with a water log, for water_days. */
  waterDays?: string[];
}

/** The month key ("YYYY-MM") a date belongs to. */
export function getChallengeMonth(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** True when the date falls inside the challenge's month. */
export function isDateInChallengeMonth(dateStr: string, month: string): boolean {
  return getChallengeMonth(dateStr) === month;
}

/**
 * Stable instance key for a challenge in a month. State (opt-in, dismissal,
 * completion) is tracked per instance, so last month's choices don't leak.
 */
export function challengeInstanceKey(challenge: ChallengeDef): string {
  return `${challenge.id}:${challenge.month}`;
}

/** Badge id earned on completion — deterministic, one per instance. */
export function challengeBadgeId(challenge: ChallengeDef): string {
  return `badge:${challenge.id}:${challenge.month}`;
}

/** XP event id for a challenge completion — idempotent via the XP ledger. */
export function challengeXpEventId(challenge: ChallengeDef): string {
  return `challenge:${challenge.id}:${challenge.month}`;
}

/** Month's dated events for a metric, sorted ascending — used to find completion date. */
function datedEvents(
  metric: ChallengeMetric,
  data: ChallengeActivityData,
  month: string,
): string[] {
  const events: string[] = [];
  switch (metric) {
    case 'workouts':
      for (const w of data.workouts) {
        if (!isDateInChallengeMonth(w.date, month)) continue;
        const real = w.exercises.some((ex) =>
          ex.sets.some((s) => isSetCompleted(s)),
        );
        if (real) events.push(w.date);
      }
      break;
    case 'breakfasts':
      for (const m of data.meals) {
        if (!isDateInChallengeMonth(m.date, month)) continue;
        if (m.foods.length === 0) continue;
        if (/breakfast/i.test(m.name)) events.push(m.date);
      }
      break;
    case 'meals':
      for (const m of data.meals) {
        if (!isDateInChallengeMonth(m.date, month)) continue;
        if (m.foods.length > 0) events.push(m.date);
      }
      break;
    case 'prs':
      for (const p of data.prs) {
        if (isDateInChallengeMonth(p.date, month)) events.push(p.date);
      }
      break;
    case 'water_days':
      for (const d of data.waterDays ?? []) {
        if (isDateInChallengeMonth(d, month)) events.push(d);
      }
      break;
    case 'streak_days':
      // Not date-driven: evaluated from the current streak directly.
      break;
  }
  return events.sort();
}

export interface ChallengeEvaluation {
  progress: number;
  target: number;
  /** 0–100, rounded, clamped. */
  pct: number;
  completed: boolean;
  /** The day the target was reached (YYYY-MM-DD), when known. */
  completedDate?: string;
}

/**
 * Evaluate a challenge against existing activity data. Pure — no side effects,
 * no logging requirements, no nagging. For `streak_days`, progress is the
 * current streak (the streak itself is the tracked thing).
 */
export function evaluateChallenge(
  challenge: ChallengeDef,
  data: ChallengeActivityData,
): ChallengeEvaluation {
  let progress = 0;
  let completedDate: string | undefined;

  if (challenge.metric === 'streak_days') {
    progress = data.currentStreak;
  } else {
    const events = datedEvents(challenge.metric, data, challenge.month);
    progress = events.length;
    if (progress >= challenge.target) {
      completedDate = events[challenge.target - 1];
    }
  }

  const completed = progress >= challenge.target;
  return {
    progress: Math.min(progress, challenge.target),
    target: challenge.target,
    pct: Math.min(100, Math.round((progress / challenge.target) * 100)),
    completed,
    ...(completedDate ? { completedDate } : {}),
  };
}

/** Per-instance user state: opted in? dismissed the quiet card? already paid out? */
export interface ChallengeInstanceState {
  optedIn: boolean;
  dismissed: boolean;
  /** Completion reward (XP + badge) already granted for this instance. */
  rewardGranted: boolean;
}

export interface ChallengesXState {
  /** Keyed by `${challengeId}:${month}`. */
  instances: Record<string, ChallengeInstanceState>;
}

export function getInitialXState(): ChallengesXState {
  return { instances: {} };
}

function getInstance(
  state: ChallengesXState,
  challenge: ChallengeDef,
): ChallengeInstanceState {
  return (
    state.instances[challengeInstanceKey(challenge)] ?? {
      optedIn: false,
      dismissed: false,
      rewardGranted: false,
    }
  );
}

function setInstance(
  state: ChallengesXState,
  challenge: ChallengeDef,
  inst: ChallengeInstanceState,
): ChallengesXState {
  return {
    instances: {
      ...state.instances,
      [challengeInstanceKey(challenge)]: inst,
    },
  };
}

/** User taps "join" on the quiet card. */
export function optInChallenge(
  state: ChallengesXState,
  challenge: ChallengeDef,
): ChallengesXState {
  const inst = getInstance(state, challenge);
  return setInstance(state, challenge, { ...inst, optedIn: true });
}

/** User opts back out — no penalty, progress simply stops being shown. */
export function optOutChallenge(
  state: ChallengesXState,
  challenge: ChallengeDef,
): ChallengesXState {
  const inst = getInstance(state, challenge);
  return setInstance(state, challenge, { ...inst, optedIn: false });
}

/**
 * User dismisses the one quiet invitation card. It stays hidden for the rest
 * of the month — this is the "never nag" guarantee.
 */
export function dismissChallenge(
  state: ChallengesXState,
  challenge: ChallengeDef,
): ChallengesXState {
  const inst = getInstance(state, challenge);
  return setInstance(state, challenge, { ...inst, dismissed: true });
}

/**
 * Should the quiet invitation card be shown? Exactly one chance per month:
 * not yet opted in AND not dismissed. Never shown again after either.
 */
export function shouldShowChallengeCard(
  state: ChallengesXState,
  challenge: ChallengeDef,
): boolean {
  const inst = getInstance(state, challenge);
  return !inst.optedIn && !inst.dismissed;
}

/** Mark the completion reward as granted (after awarding via the XP ledger). */
export function markChallengeRewardGranted(
  state: ChallengesXState,
  challenge: ChallengeDef,
): ChallengesXState {
  const inst = getInstance(state, challenge);
  return setInstance(state, challenge, { ...inst, rewardGranted: true });
}

/**
 * Convenience: evaluate + decide whether the reward is newly due. Returns the
 * evaluation and `rewardDue` (true only when completed, opted in, and the
 * reward hasn't been granted yet). The coordinator awards 200 XP through
 * `awardXp` with `challengeXpEventId(challenge)` — idempotent, so even a
 * double-call can never pay twice — then calls `markChallengeRewardGranted`.
 */
export function evaluateChallengeReward(
  challenge: ChallengeDef,
  data: ChallengeActivityData,
  state: ChallengesXState,
): { evaluation: ChallengeEvaluation; rewardDue: boolean } {
  const evaluation = evaluateChallenge(challenge, data);
  const inst = getInstance(state, challenge);
  const rewardDue =
    evaluation.completed && inst.optedIn && !inst.rewardGranted;
  return { evaluation, rewardDue };
}

/** The built-in monthly challenge catalog. Instantiated per month by the coordinator. */
export function monthlyChallenges(month: string): ChallengeDef[] {
  return [
    {
      id: 'workouts-12',
      title: '12 Workouts This Month',
      description: 'Log 12 real workouts before the month ends. No rush — pace yourself.',
      titleKey: 'chal.monthly12WorkoutsTitle',
      descriptionKey: 'chal.monthly12WorkoutsDesc',
      target: 12,
      metric: 'workouts',
      month,
    },
    {
      id: 'breakfasts-20',
      title: '20 Breakfasts',
      description: 'Log breakfast 20 days this month. Small habit, big mornings.',
      titleKey: 'chal.monthly20BreakfastsTitle',
      descriptionKey: 'chal.monthly20BreakfastsDesc',
      target: 20,
      metric: 'breakfasts',
      month,
    },
    {
      id: 'streak-7',
      title: '7-Day Streak',
      description: 'Stay active 7 days in a row. Miss a day? Your freeze has you covered.',
      titleKey: 'chal.monthly7StreakTitle',
      descriptionKey: 'chal.monthly7StreakDesc',
      target: 7,
      metric: 'streak_days',
      month,
    },
    {
      id: 'prs-5',
      title: '5 Personal Records',
      description: 'Set 5 new PRs this month. Any lift, any rep range — progress is progress.',
      titleKey: 'chal.monthly5PrsTitle',
      descriptionKey: 'chal.monthly5PrsDesc',
      target: 5,
      metric: 'prs',
      month,
    },
  ];
}
