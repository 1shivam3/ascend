/**
 * Minor (13–17) calorie-target enforcement — Phase 3, Task 3.1.
 *
 * Product rule: a user aged 13–17 gets MAINTENANCE-ONLY calorie
 * targets. No deficit (growth comes first — the lose_fat branch of
 * calculateRecommendedMacroGoals already held this line) and no
 * surplus-driven gain target either. The rule lives HERE, in the
 * engine layer next to the code that computes targets, and every
 * write path funnels through it:
 *
 *  - calculateRecommendedMacroGoals (macros.ts) clamps its own
 *    output for under-18 ages, so every derivation (onboarding,
 *    GoalSelector, Fuel prefs, Meals auto-calc, coach executor base,
 *    effective-goals fallback) is maintenance by construction.
 *  - The store's setMacroGoals — the ONE setter every manual and
 *    coach-applied write flows through — clamps stored goals for a
 *    minor profile, so no UI door can save an off-band target.
 *  - The store's setProfile re-evaluates on profile writes: entering
 *    the 13–17 band clamps stored targets to (fresh) maintenance;
 *    leaving the band (an 18th birthday, a DOB correction) recomputes
 *    them under adult rules. DOB edits and the birthday refresh both
 *    travel through setProfile, so re-evaluation is immediate.
 *  - The coach-action executor refuses (blocked) a set_macro_goals
 *    action whose calories would move a minor off maintenance.
 *
 * "At maintenance" uses the app's own Atwater rounding band
 * (CALORIE_DELTA_ROUNDING_BAND_KCAL, ±10 kcal): reconciling a target
 * to integer grams moves the total by up to ~9 kcal, and that noise
 * is maintenance, not a micro-deficit.
 *
 * Under-13 never reaches this module through any entry point:
 * onboarding and Edit Profile reject a DOB (or typed age) under 13,
 * and the DOB picker cannot select one. The computation clamp in
 * macros.ts still treats any age in (0, 18) as maintenance-only, so
 * a legacy or restored record under 13 can never be prescribed a
 * deficit or surplus either.
 */
import {
  calculateMaintenanceCalories,
  scaleMacroGoalsToCalories,
  normalizeCalorieDelta,
  CALORIE_DELTA_ROUNDING_BAND_KCAL,
  type ActivityLevel,
} from './macros';
import { hasRealBodyStats, type BodyStatsProfile } from './body-stats';
import type { Gender, MacroGoals } from './types';

/** The minor band: 13 ≤ age < 18. Age 18 is an adult everywhere. */
export function isMinorAge(age: number | null | undefined): boolean {
  return typeof age === 'number' && Number.isFinite(age) && age >= 13 && age < 18;
}

/**
 * QA-hardening R5: a KNOWN age is a plausible recorded one (13–120).
 * Anything else — no DOB on file, an unparseable/legacy value — is
 * unknown-age, a separate axis from the minor band: the user cannot
 * be shown to be an adult, so no deficit target may be written for
 * them (see enforceUnknownAgeMacroGoals).
 */
export function hasKnownAge(age: number | null | undefined): boolean {
  return typeof age === 'number' && Number.isFinite(age) && age >= 13 && age <= 120;
}

/** How far a minor's target may sit from maintenance and still BE
 * maintenance — the app's Atwater rounding band (±10 kcal). */
export const MINOR_MAINTENANCE_TOLERANCE_KCAL = CALORIE_DELTA_ROUNDING_BAND_KCAL;

export interface MinorTargetProfile extends BodyStatsProfile {
  gender?: Gender | null;
  age?: number | null;
}

/**
 * The maintenance figure a minor's targets must sit at, computed
 * from the profile — or null when it cannot be computed honestly
 * (not a minor, or body stats are placeholders: Phase-1 Task 1.1
 * forbids deriving targets from stats the user never entered).
 */
export function minorMaintenanceFor(
  profile: MinorTargetProfile | null | undefined,
  activityLevel?: ActivityLevel,
): number | null {
  if (!profile || !isMinorAge(profile.age)) return null;
  if (!hasRealBodyStats(profile)) return null;
  if (!profile.bodyweightKg || profile.bodyweightKg <= 0) return null;
  return calculateMaintenanceCalories(
    profile.bodyweightKg,
    profile.gender ?? 'male',
    profile.heightCm ?? undefined,
    profile.age ?? undefined,
    activityLevel,
  );
}

/** True when goals sit outside the maintenance band for `maintenance`. */
export function isOffMinorMaintenanceBand(
  goals: MacroGoals | null | undefined,
  maintenance: number,
): boolean {
  if (!goals) return false;
  return Math.abs(goals.calories - maintenance) > MINOR_MAINTENANCE_TOLERANCE_KCAL;
}

/**
 * Bring goals onto maintenance: protein grams are preserved (they
 * are bodyweight-driven, not calorie-driven), fat/carbs rescale via
 * the app's own scaleMacroGoalsToCalories, and the derivation
 * fields are rewritten truthfully (maintenance = the given figure,
 * delta = the reconciled remainder, which normalizes to 0 inside
 * the rounding band). Goals already inside the band are returned
 * untouched — same reference — so repeated enforcement is a no-op
 * and can never drift the numbers.
 */
export function clampGoalsToMinorMaintenance(
  goals: MacroGoals,
  maintenance: number,
): MacroGoals {
  if (!isOffMinorMaintenanceBand(goals, maintenance)) return goals;
  const scaled = scaleMacroGoalsToCalories(goals, maintenance);
  return {
    ...scaled,
    maintenanceCalories: maintenance,
    calorieDelta: normalizeCalorieDelta(scaled.calories - maintenance),
  };
}

/**
 * The store-facing guard: clamp `goals` iff the profile is a minor
 * with real body stats; otherwise return them verbatim (null stays
 * null — clearing targets is always allowed).
 */
export function enforceMinorMacroGoals(
  goals: MacroGoals | null,
  profile: MinorTargetProfile | null | undefined,
  activityLevel?: ActivityLevel,
): MacroGoals | null {
  if (!goals) return goals;
  const maintenance = minorMaintenanceFor(profile, activityLevel);
  if (maintenance === null) return goals;
  return clampGoalsToMinorMaintenance(goals, maintenance);
}

/**
 * QA-hardening R5 — the unknown-age guard, sibling to the minor
 * guard above. When the profile has real body stats but NO known
 * age (no DOB), a stored/written target may not sit off maintenance
 * in either direction: without an age the app cannot show the user
 * is an adult, and the engine's silent "cost them as 25" default is
 * not consent to a deficit. The maintenance figure itself is
 * computed with the engine's existing age default (the target is an
 * estimate — the display layer labels it as such); the guarantee
 * this guard makes is narrower and absolute: delta = 0.
 */
export function unknownAgeMaintenanceFor(
  profile: MinorTargetProfile | null | undefined,
  activityLevel?: ActivityLevel,
): number | null {
  if (!profile || hasKnownAge(profile.age)) return null;
  if (!hasRealBodyStats(profile)) return null;
  if (!profile.bodyweightKg || profile.bodyweightKg <= 0) return null;
  return calculateMaintenanceCalories(
    profile.bodyweightKg,
    profile.gender ?? 'male',
    profile.heightCm ?? undefined,
    undefined,
    activityLevel,
  );
}

export function enforceUnknownAgeMacroGoals(
  goals: MacroGoals | null,
  profile: MinorTargetProfile | null | undefined,
  activityLevel?: ActivityLevel,
): MacroGoals | null {
  if (!goals) return goals;
  const maintenance = unknownAgeMaintenanceFor(profile, activityLevel);
  if (maintenance === null) return goals;
  return clampGoalsToMinorMaintenance(goals, maintenance);
}
