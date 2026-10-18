import type { AthleteGoal } from './types';

/**
 * Step 1 of onboarding ("What's your main goal?") may only advance when the
 * athlete has at least one goal selected. Never silently fall back to a
 * default goal here — the athlete must choose (the completion-time guard in
 * Onboarding.tsx enforces the same rule at Step 3).
 */
export function canContinueFromGoalStep(selectedGoals: readonly AthleteGoal[]): boolean {
  return selectedGoals.length > 0;
}
