/**
 * Audit F16/N2/N3 — ONE canonical derivation for "today's targets".
 *
 * Before this module, every screen invented its own fallback when the
 * stored macroGoals were absent, and they disagreed:
 * - Home Today: calories 2400, protein bw x 2.0 (bw fallback 72)
 * - Fuel header: protein bw x 1.8 (or 140), calories 2400, carbs 220, fat 70
 * - Fuel pacing: raw stored macroGoals, ignoring the day-kind scaling
 *   the header next to it applied (one-meal fast -30% kcal, festival
 *   +400 kcal)
 * - Home hydration: a stale `dailyTargetMl || 2700` snapshot instead of
 *   the formula every other screen already used (bw x 35, round-50,
 *   floor 1500)
 *
 * The canonical derivation already existed and is reused, never
 * reinvented: calculateRecommendedMacroGoals (the same function
 * Onboarding writes into macroGoals for new users) + getDayKindTargets
 * for today's fast/festival scaling. No stored data changes; this is
 * display-only. When stored macroGoals exist, they still win exactly.
 */

import { calculateRecommendedMacroGoals, type ActivityLevel } from './macros';
import { getDayKindTargets } from './nutrition-coach';
import {
  resolvePrimaryGoal,
  type AthleteGoal,
  type Gender,
  type MacroGoals,
  type MealDayKind,
} from './types';

export interface EffectiveGoalsProfile {
  bodyweightKg?: number | null;
  goals?: AthleteGoal[] | null;
  gender?: Gender | null;
  heightCm?: number | null;
  age?: number | null;
  activityLevel?: ActivityLevel;
}

/**
 * The goals to display: stored macroGoals when present, otherwise the
 * canonical derivation from the profile. Null only when BOTH are
 * missing — callers keep their existing minimal fallbacks for that
 * rarest case (no profile at all).
 */
export function effectiveMacroGoals(
  macroGoals: MacroGoals | null | undefined,
  profile: EffectiveGoalsProfile | null | undefined,
): MacroGoals | null {
  if (macroGoals) return macroGoals;
  if (!profile || !profile.bodyweightKg) return null;
  return calculateRecommendedMacroGoals(
    profile.bodyweightKg,
    resolvePrimaryGoal(profile.goals),
    profile.gender ?? 'male',
    profile.heightCm ?? undefined,
    profile.age ?? undefined,
    profile.activityLevel,
  );
}

/**
 * Today's display goals: the base goals scaled by today's day kind
 * (one-meal fast / festival / no-grain fast). Returns the base goals
 * unchanged when there is no day kind, and null when there are no
 * base goals. Callers must keep any safe-floor judgement on the BASE
 * goals, not the scaled ones — the floor judges the prescribed
 * target, not today's scaled guidance.
 */
export function dayScaledGoals(
  baseGoals: MacroGoals | null | undefined,
  dayKind: MealDayKind | null | undefined,
): MacroGoals | null {
  if (!baseGoals) return null;
  const scaled = getDayKindTargets(dayKind, baseGoals);
  if (!scaled) return baseGoals;
  return {
    ...baseGoals,
    calories: scaled.calories,
    proteinG: scaled.proteinG ?? baseGoals.proteinG,
  };
}
