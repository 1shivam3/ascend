import type { AthleteGoal } from './types';

/**
 * §D2 (Phase 5): the ONE nutrition-phase derivation.
 *
 * Phase 0 verified the classifier was vestigial: NutritionPhase
 * declared 'deficit' | 'surplus' | 'maintenance', but the only
 * producer (the store's block-proposal call) ever passed
 * 'deficit' for lose_fat or null — 'surplus' and 'maintenance'
 * were never produced, and Fuel's calorie targets re-derived
 * the same direction independently inside
 * calculateRecommendedMacroGoals (goal switch + two trailing
 * clamps). Both now use this function: the store passes its
 * result into the block engine, and Fuel's clamps are expressed
 * through it, so the phase a block carries and the direction
 * of the user's calorie target can never disagree.
 *
 * The mapping (the app's safety-reviewed policy, unchanged):
 *   build_muscle / get_stronger -> 'surplus'
 *   lose_fat                    -> 'deficit'
 *   stamina / general_fitness   -> 'maintenance'
 * Safety overrides, applied BEFORE the goal mapping:
 *   - a minor is maintenance-only for EVERY goal. The band
 *     here is (0, 18) — the wider enforcement range macros.ts
 *     has always used (lib/minor-targets.ts isMinorAge covers
 *     the 13–17 product band; under-13 accounts are refused at
 *     entry, but a legacy/restored record must still never be
 *     prescribed a deficit or a surplus);
 *   - an UNKNOWN age (no DOB, or outside the plausible 13–120
 *     recorded range) is maintenance-only too: a user who
 *     cannot be shown to be an adult gets no deficit and no
 *     surplus (QA-hardening R5).
 * The calorie FLOOR for a deficit (getSafeMinCalories) stays
 * in macros.ts where the target is computed — the phase says
 * direction, never magnitude.
 */
export type NutritionPhase = 'deficit' | 'surplus' | 'maintenance';

export function deriveNutritionPhase(
  goal: AthleteGoal | null | undefined,
  ageYears: number | null | undefined,
): NutritionPhase {
  const ageKnown =
    typeof ageYears === 'number' &&
    Number.isFinite(ageYears) &&
    ageYears >= 13 &&
    ageYears <= 120;
  const minorBand =
    typeof ageYears === 'number' && Number.isFinite(ageYears) && ageYears > 0 && ageYears < 18;
  if (minorBand || !ageKnown) return 'maintenance';
  switch (goal) {
    case 'lose_fat':
      return 'deficit';
    case 'build_muscle':
    case 'get_stronger':
      return 'surplus';
    default:
      return 'maintenance';
  }
}
