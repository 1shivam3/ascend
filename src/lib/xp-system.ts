/**
 * XP System — makes every action feel rewarding.
 *
 * XP awards (simple, memorable):
 * - Workout complete: 100 XP
 * - Meal logged: 20 XP
 * - PR hit: 50 XP bonus
 * - Water logged: 5 XP
 * - Challenge complete: 200 XP
 *
 * Levels: Level = floor(sqrt(totalXP / 100)) + 1
 * - Level 1: 0 XP
 * - Level 2: 100 XP (1 workout)
 * - Level 3: 400 XP (~4 workouts)
 * - Level 5: 1600 XP (~2 weeks active)
 * - Level 10: 8100 XP (~2-3 months)
 *
 * Anti-irritation: XP never decays, levels never go down, no popups —
 * level-ups show a subtle celebration, not a modal.
 */

export const XP_AWARDS = {
  WORKOUT_COMPLETE: 100,
  MEAL_LOGGED: 20,
  PR_HIT: 50,
  WATER_LOGGED: 5,
  CHALLENGE_COMPLETE: 200,
  STREAK_DAY: 10, // bonus per day of active streak
} as const;

export function calculateLevel(totalXP: number): number {
  if (totalXP < 0) return 1;
  return Math.floor(Math.sqrt(totalXP / 100)) + 1;
}

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.pow(level - 1, 2) * 100;
}

export function xpToNextLevel(totalXP: number): { current: number; needed: number; progress: number } {
  const level = calculateLevel(totalXP);
  const currentLevelXP = xpForLevel(level);
  const nextLevelXP = xpForLevel(level + 1);
  const current = totalXP - currentLevelXP;
  const needed = nextLevelXP - currentLevelXP;
  return {
    current,
    needed,
    progress: needed > 0 ? Math.min(1, current / needed) : 1,
  };
}

export interface XPTransaction {
  id: string;
  amount: number;
  reason: string;
  timestamp: string;
}

/**
 * Award XP for an action. Returns the new total and whether a level-up occurred.
 * Pure function — the caller persists the result.
 */
export function awardXP(
  currentTotal: number,
  amount: number,
  reason: string
): { newTotal: number; leveledUp: boolean; newLevel: number; transaction: XPTransaction } {
  const oldLevel = calculateLevel(currentTotal);
  const newTotal = currentTotal + amount;
  const newLevel = calculateLevel(newTotal);
  return {
    newTotal,
    leveledUp: newLevel > oldLevel,
    newLevel,
    transaction: {
      id: `xp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      amount,
      reason,
      timestamp: new Date().toISOString(),
    },
  };
}
