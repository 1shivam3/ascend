/**
 * XP ledger — the "you're making progress" system.
 *
 * Design notes (from the fun-mechanics research pass):
 * - Points alone do nothing unless tied to the activity. XP is awarded ONLY for
 *   real logged effort — never for opening the app, never for taps, never for
 *   "engagement". A workout with zero completed sets earns nothing.
 * - XP never decays and is never lost. Losing progress to inactivity is
 *   punishment, and punishment makes people quit.
 * - No complex economy: fixed amounts, one number, always visible, ignorable.
 * - Level-ups must surprise, never block: no celebration modal here — this
 *   module only reports `leveledUp`; the UI layer decides how quiet to be.
 */
import { isSetCompleted } from './types';
import type { WorkoutEntry, MealEntry } from './types';

/** Fixed XP values — deliberately coarse so the system stays legible. */
export const XP_WORKOUT = 100;
export const XP_MEAL = 20;
export const XP_PR = 50;
export const XP_WATER = 5;
export const XP_STREAK_DAY = 10;
/** Bonus for completing a monthly challenge. */
export const XP_CHALLENGE_COMPLETE = 200;

/** Upper bound on remembered award ids so the ledger can't grow forever. */
export const MAX_AWARDED_IDS = 10_000;

export type XpEventType =
  | 'workout'
  | 'meal'
  | 'pr'
  | 'water'
  | 'streak_day'
  | 'challenge';

export interface XpEvent {
  /** Stable, unique per real-world occurrence, e.g. `workout:<entry-id>`. */
  id: string;
  type: XpEventType;
  /** Amount of XP. Defaults to the fixed value for the type when omitted. */
  amount?: number;
}

/** Build a canonical event id for an entity so duplicates collapse naturally. */
export function xpEventId(type: XpEventType, entityId: string): string {
  return `${type}:${entityId}`;
}

const DEFAULT_AMOUNTS: Record<XpEventType, number> = {
  workout: XP_WORKOUT,
  meal: XP_MEAL,
  pr: XP_PR,
  water: XP_WATER,
  streak_day: XP_STREAK_DAY,
  challenge: XP_CHALLENGE_COMPLETE,
};

/** XP a workout is worth: 100 if it contains >= 1 completed set, else 0 (no farming). */
export function xpForWorkout(workout: WorkoutEntry): number {
  const hasCompletedSet = workout.exercises.some((ex) =>
    ex.sets.some((s) => isSetCompleted(s)),
  );
  return hasCompletedSet ? XP_WORKOUT : 0;
}

/** XP a meal is worth: 20 if it has at least one food item, else 0. */
export function xpForMeal(meal: MealEntry): number {
  return meal.foods.length > 0 ? XP_MEAL : 0;
}

export interface XpAwardResult {
  /** XP actually granted (after idempotency filtering). */
  awarded: number;
  /** New lifetime total. */
  newTotal: number;
  /** Number of submitted events that were already awarded (silently skipped). */
  skippedDuplicates: number;
  /** True when the new total crossed into a higher level. */
  leveledUp: boolean;
  newLevel: number;
  /** Updated list of awarded ids (trimmed to MAX_AWARDED_IDS). */
  awardedIds: string[];
}

/**
 * Award XP for a batch of events. Idempotent: any event whose id is already in
 * `awardedIds` is skipped, so re-submitting the same workout/meal id can never
 * double-count. Pure — returns new state, mutates nothing.
 */
export function awardXp(
  events: XpEvent[],
  currentTotal: number,
  awardedIds: string[] | Set<string> = [],
): XpAwardResult {
  const seen = new Set(awardedIds);
  let awarded = 0;
  let skippedDuplicates = 0;

  for (const event of events) {
    if (seen.has(event.id)) {
      skippedDuplicates++;
      continue;
    }
    seen.add(event.id);
    awarded += event.amount ?? DEFAULT_AMOUNTS[event.type];
  }

  const newTotal = currentTotal + awarded;
  const oldLevel = getLevel(currentTotal);
  const newLevel = getLevel(newTotal);

  const trimmed = Array.from(seen);
  const finalIds =
    trimmed.length > MAX_AWARDED_IDS
      ? trimmed.slice(trimmed.length - MAX_AWARDED_IDS)
      : trimmed;

  return {
    awarded,
    newTotal,
    skippedDuplicates,
    leveledUp: newLevel > oldLevel,
    newLevel,
    awardedIds: finalIds,
  };
}

/** Total XP required to reach level n. L1=100, L2=400, L3=900 (sqrt curve). */
export function xpForLevel(n: number): number {
  if (n <= 0) return 0;
  return 100 * n * n;
}

/** Level for a lifetime XP total. 0–99 XP is level 0; 100 XP crosses into level 1. */
export function getLevel(totalXp: number): number {
  if (totalXp < 0) return 0;
  return Math.floor(Math.sqrt(totalXp / 100));
}

export interface LevelProgress {
  level: number;
  /** XP earned toward the next level (0-based within the level). */
  current: number;
  /** XP needed to go from this level to the next. */
  needed: number;
  /** 0–100, rounded to 1 decimal. */
  pct: number;
}

/** Progress from the current level toward the next one. */
export function progressToNext(totalXp: number): LevelProgress {
  const level = getLevel(totalXp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const current = totalXp - floor;
  const needed = ceiling - floor;
  return {
    level,
    current,
    needed,
    pct: needed > 0 ? Math.round((current / needed) * 1000) / 10 : 100,
  };
}

const LEVEL_TITLES: Array<[number, string]> = [
  [30, 'Legend'],
  [25, 'Master'],
  [20, 'Elite'],
  [15, 'Dedicated'],
  [10, 'Athlete'],
  [5, 'Disciplined'],
  [1, 'Initiate'],
];

/**
 * Title for a level: the highest named tier at or below it.
 * Level 0 (brand new, 0 XP) is "Newcomer" — everyone starts as one, no shame in it.
 */
export function getLevelName(level: number): string {
  if (level <= 0) return 'Newcomer';
  for (const [tier, name] of LEVEL_TITLES) {
    if (level >= tier) return name;
  }
  return 'Initiate';
}

/** Persisted shape for the XP slice of the store. */
export interface XpState {
  totalXp: number;
  awardedIds: string[];
}

export function getInitialXState(): XpState {
  return { totalXp: 0, awardedIds: [] };
}
