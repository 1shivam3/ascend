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
 * Macro-split percentages for the Fuel Macros display.
 *
 * Preview-fix F16: the display used to divide macro calories by the
 * DISPLAYED (day-kind-scaled) calorie total while the grams stay
 * unscaled — on a one-meal fast (calories ×0.7, grams unchanged) the
 * percentages summed to 143% (P28 + C79 + F36). Percentages must
 * describe the macro split, so the denominator is the macro-calorie
 * sum itself (4P + 4C + 9F), which always sums to ~100% (independent
 * rounding may give 99–101). On a normal day the displayed total
 * equals the macro sum, so values are unchanged. Inputs are the
 * grams actually displayed, so callers pass the same numbers they
 * render — never a scaled total against unscaled grams.
 */
export function macroSplitPercentages(
  proteinG: number,
  carbsG: number,
  fatG: number,
): { proteinPct: number; carbsPct: number; fatPct: number } {
  const p = Math.max(0, proteinG || 0);
  const c = Math.max(0, carbsG || 0);
  const f = Math.max(0, fatG || 0);
  const macroCal = p * 4 + c * 4 + f * 9;
  if (macroCal <= 0) return { proteinPct: 0, carbsPct: 0, fatPct: 0 };
  return {
    proteinPct: Math.round(((p * 4) / macroCal) * 100),
    carbsPct: Math.round(((c * 4) / macroCal) * 100),
    fatPct: Math.round(((f * 9) / macroCal) * 100),
  };
}
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
