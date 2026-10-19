/**
 * Streak Freeze — one free pass per week.
 *
 * Duolingo's data: users with streak freeze keep streaks 4.5x longer.
 * The freeze auto-applies when you'd otherwise lose your streak.
 * No guilt, no punishment — just "Streak saved!"
 *
 * Rules:
 * - 1 freeze granted every Monday (resets weekly)
 * - Auto-applies on the first missed day (no user action needed)
 * - Visual: snowflake ❄ indicator when a freeze is available/used
 * - Freezes don't stack (max 1)
 */

export interface StreakFreezeState {
  /** ISO date (YYYY-MM-DD) of the Monday when the current freeze was granted */
  freezeWeekStart: string | null;
  /** Whether the current week's freeze has been used */
  freezeUsed: boolean;
  /** Date the freeze was applied (for display: "Streak saved on Oct 20") */
  freezeAppliedDate: string | null;
}

export function getMondayOfWeek(date: Date = new Date()): string {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.toISOString().split('T')[0];
}

export function getDefaultFreezeState(): StreakFreezeState {
  return {
    freezeWeekStart: null,
    freezeUsed: false,
    freezeAppliedDate: null,
  };
}

/**
 * Check and refresh the weekly freeze. Call on app start.
 * Returns the (possibly updated) state.
 */
export function refreshWeeklyFreeze(state: StreakFreezeState): StreakFreezeState {
  const thisMonday = getMondayOfWeek();
  if (state.freezeWeekStart !== thisMonday) {
    // New week — grant a fresh freeze
    return {
      freezeWeekStart: thisMonday,
      freezeUsed: false,
      freezeAppliedDate: null,
    };
  }
  return state;
}

/**
 * Attempt to use the freeze to save a streak.
 * Returns { saved, newState }.
 */
export function tryUseFreeze(
  state: StreakFreezeState,
  missedDate: string
): { saved: boolean; newState: StreakFreezeState } {
  const refreshed = refreshWeeklyFreeze(state);
  if (refreshed.freezeUsed) {
    return { saved: false, newState: refreshed };
  }
  return {
    saved: true,
    newState: {
      ...refreshed,
      freezeUsed: true,
      freezeAppliedDate: missedDate,
    },
  };
}

/**
 * Determine if a streak should be saved by freeze.
 * Call when calculating streaks: if the user missed yesterday but has
 * a freeze available, the streak continues.
 */
export function shouldFreezeSaveStreak(
  state: StreakFreezeState,
  consecutiveMissedDays: number
): boolean {
  if (consecutiveMissedDays !== 1) return false; // Only saves single missed days
  const refreshed = refreshWeeklyFreeze(state);
  return !refreshed.freezeUsed;
}
