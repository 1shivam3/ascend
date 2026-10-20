/**
 * Forgiving streaks — the "life happens" system.
 *
 * Research basis (Duolingo): a streak freeze produces ~4.5x longer streaks,
 * because the streak survives the missed day instead of resetting to zero.
 * Binary resets and streak shaming are the mechanics that make people quit.
 *
 * Rules:
 * - A day counts as active if: a workout with >= 1 completed set was logged,
 *   OR 3+ meals were logged. (Simple, checkable, no steps/hardware needed.)
 * - The streak is consecutive active days ending today or yesterday — so
 *   opening the app in the morning doesn't show a broken streak for a day
 *   that hasn't happened yet.
 * - ONE missed day inside the run auto-consumes a freeze. Two missed days in
 *   a row still break the streak (a freeze saves one bad day, not a bad week).
 * - Max 1 freeze per week; freezes refill every Monday (weeks start Monday).
 * - A freeze NEVER triggers a modal or fanfare. It saves silently — rewarding
 *   forgiveness with a popup would punish the miss by drawing attention to it.
 */
import { getLocalTodayStr, getMondayOfWeek } from './formatters';
import { isSetCompleted } from './types';
import type { WorkoutEntry, MealEntry } from './types';

export const FREEZES_PER_WEEK = 1;

/** Minimum meals in a day for the day to count as active without a workout. */
export const MEALS_FOR_ACTIVE_DAY = 3;

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return getLocalTodayStr(dt);
}

/** True when the day has real logged effort: a workout (>=1 completed set) or 3+ meals. */
export function dayIsActive(
  dateStr: string,
  workouts: WorkoutEntry[],
  meals: MealEntry[],
): boolean {
  const dayWorkouts = workouts.filter((w) => w.date === dateStr);
  const realWorkout = dayWorkouts.some((w) =>
    w.exercises.some((ex) => ex.sets.some((s) => isSetCompleted(s))),
  );
  if (realWorkout) return true;
  const mealCount = meals.filter(
    (m) => m.date === dateStr && m.foods.length > 0,
  ).length;
  return mealCount >= MEALS_FOR_ACTIVE_DAY;
}

/** Collapse workout + meal history into the sorted set of active day strings. */
export function buildActiveDays(
  workouts: WorkoutEntry[],
  meals: MealEntry[],
): string[] {
  const dates = new Set<string>();
  for (const w of workouts) {
    if (dayIsActive(w.date, workouts, meals)) dates.add(w.date);
  }
  const byDate = new Map<string, MealEntry[]>();
  for (const m of meals) {
    if (!byDate.has(m.date)) byDate.set(m.date, []);
    byDate.get(m.date)!.push(m);
  }
  for (const date of byDate.keys()) {
    if (dayIsActive(date, workouts, meals)) dates.add(date);
  }
  return Array.from(dates).sort();
}

export interface StreakCalcInput {
  /** YYYY-MM-DD strings with activity. */
  dailyActivity: string[];
  /** Freezes available to auto-consume. */
  freezesAvailable: number;
  /** Override "today" (YYYY-MM-DD) — for tests. Defaults to local today. */
  todayStr?: string;
}

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
  /** Freezes left after auto-consumption during this calculation. */
  freezesAvailable: number;
  /** True when a freeze was silently consumed to bridge a missed day. */
  freezeConsumed: boolean;
  /** The missed day the freeze covered (YYYY-MM-DD), if any. */
  freezeAppliedTo?: string;
}

/**
 * Calculate the current streak. Walks back from today: active days extend the
 * run; the FIRST missed day inside the run auto-consumes a freeze (if one is
 * available) and the run continues; a second consecutive miss ends the run.
 * Days after today are ignored; today may be inactive (day not over) as long
 * as yesterday was active — the streak doesn't break at 9am.
 */
export function calculateStreak(input: StreakCalcInput): StreakResult {
  const today = input.todayStr ?? getLocalTodayStr();
  const active = new Set(input.dailyActivity);
  let freezesAvailable = Math.max(0, Math.floor(input.freezesAvailable));

  // Longest run over the whole history (freezes only apply to the live run).
  const sorted = Array.from(active).sort();
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    if (day > today) break;
    run = prev !== null && shiftDate(prev, 1) === day ? run + 1 : 1;
    prev = day;
    longestStreak = Math.max(longestStreak, run);
  }

  // Current run: walk back from today.
  let currentStreak = 0;
  let freezeConsumed = false;
  let freezeAppliedTo: string | undefined;
  let cursor = today;

  // Today may be inactive (day in progress) — start the run from yesterday
  // without breaking or consuming anything.
  if (!active.has(cursor)) {
    cursor = shiftDate(cursor, -1);
  }

  while (active.has(cursor)) {
    currentStreak++;
    cursor = shiftDate(cursor, -1);
  }

  // The first miss inside the run: auto-consume a freeze — but ONLY if it
  // actually bridges to more active days behind the miss. Burning a freeze
  // that saves nothing would punish the user for a streak that's already gone.
  if (currentStreak > 0 && !active.has(cursor) && freezesAvailable > 0) {
    const behind = shiftDate(cursor, -1);
    if (active.has(behind)) {
      freezesAvailable--;
      freezeConsumed = true;
      freezeAppliedTo = cursor;
      cursor = behind;
      while (active.has(cursor)) {
        currentStreak++;
        cursor = shiftDate(cursor, -1);
      }
      // A second miss ends the run — one freeze saves one bad day, not a bad week.
    }
  }

  longestStreak = Math.max(longestStreak, currentStreak);

  return {
    currentStreak,
    longestStreak,
    freezesAvailable,
    freezeConsumed,
    ...(freezeAppliedTo ? { freezeAppliedTo } : {}),
  };
}

export interface StreakState {
  freezesAvailable: number;
  freezesUsedThisWeek: number;
  /** YYYY-MM-DD of the Monday that started the current freeze week. */
  weekStart: string;
  longestStreak: number;
}

export function getInitialStreakState(): StreakState {
  return {
    freezesAvailable: FREEZES_PER_WEEK,
    freezesUsedThisWeek: 0,
    weekStart: getLocalTodayStr(getMondayOfWeek()),
    longestStreak: 0,
  };
}

/**
 * Refresh freeze inventory at week boundaries. Every Monday: a fresh freeze,
 * used-this-week counter reset. Unused freezes do NOT roll over — the cap is
 * the forgiveness, never a resource to hoard or buy.
 */
export function refreshFreezeWeek(
  state: StreakState,
  today: Date = new Date(),
): StreakState {
  const weekStart = getLocalTodayStr(getMondayOfWeek(today));
  if (state.weekStart === weekStart) return state;
  return {
    ...state,
    weekStart,
    freezesAvailable: FREEZES_PER_WEEK,
    freezesUsedThisWeek: 0,
  };
}

/**
 * Apply a streak calculation to persisted state: consume the freeze if the
 * calculation used one, and record the longest streak. Pure.
 */
export function applyStreakResult(
  state: StreakState,
  result: StreakResult,
): StreakState {
  return {
    ...state,
    freezesAvailable: result.freezesAvailable,
    freezesUsedThisWeek:
      state.freezesUsedThisWeek + (result.freezeConsumed ? 1 : 0),
    longestStreak: Math.max(state.longestStreak, result.longestStreak),
  };
}

/** Initial persisted shape for the streak slice of the store. */
export function getInitialXState(): StreakState {
  return getInitialStreakState();
}
