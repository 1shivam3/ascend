/**
 * N2 (bug program Phase 2) — macro-target guardrails.
 *
 * A target can be arithmetically valid and still be a bad target:
 * fat so low it crowds out essential fatty acids, or protein below
 * what a training body can use. These guardrails WARN (never hard-
 * block) when a target crosses an evidence-based floor, and they are
 * the only floors the editor, the coach and the auto-balance share.
 *
 * Sources for the constants (all flagged OWNER REVIEW — Phase 2
 * asks the owner to confirm or adjust them):
 *
 *  - FAT_MIN_FRACTION_OF_KCAL = 0.20 — the low end of the Acceptable
 *    Macronutrient Distribution Range (AMDR) for fat, 20–35% of
 *    energy: Institute of Medicine, "Dietary Reference Intakes for
 *    Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol,
 *    Protein, and Amino Acids" (2005), carried through the Dietary
 *    Guidelines for Americans.
 *  - FAT_MIN_G_PER_KG = 0.6 — a conservative per-kilo practice floor
 *    for essential-fatty-acid coverage and fat-soluble vitamin
 *    absorption in training populations; consistent with the low end
 *    of Helms et al. (2014), "Evidence-based recommendations for
 *    natural bodybuilding contest preparation" (fat 15–30% of kcal,
 *    which at typical intakes lands ≈0.5–1 g/kg). OWNER REVIEW.
 *  - PROTEIN_MIN_G_PER_KG = 1.2 — a WARNING floor, not a target:
 *    Morton et al. (2018, Br J Sports Med meta-analysis) found
 *    protein's benefit for resistance-training gains plateaus around
 *    1.6 g/kg/day, and the ISSN position stand on protein and
 *    exercise (2017) recommends 1.4–2.0 g/kg/day for exercising
 *    individuals. 1.2 sits below both — a target under it is very
 *    likely under-fuelled for this app's users. OWNER REVIEW.
 */
import type { MacroGoals } from './types';

/** OWNER REVIEW (N2): fat must be at least this share of calories. */
export const FAT_MIN_FRACTION_OF_KCAL = 0.2;
/** OWNER REVIEW (N2): fat must be at least this many g per kg bodyweight. */
export const FAT_MIN_G_PER_KG = 0.6;
/** OWNER REVIEW (N2): protein warning floor, g per kg bodyweight. */
export const PROTEIN_MIN_G_PER_KG = 1.2;

export type MacroGuardrailWarning =
  | 'fat-below-kcal-fraction'
  | 'fat-below-per-kg'
  | 'protein-below-per-kg';

/**
 * The warnings a target earns. Empty array = inside every floor.
 * Needs bodyweight for the per-kg floors; without it only the
 * kcal-fraction fat check can run.
 */
export function macroGuardrailWarnings(
  goals: Pick<MacroGoals, 'calories' | 'proteinG' | 'fatG'>,
  bodyweightKg?: number | null,
): MacroGuardrailWarning[] {
  const warnings: MacroGuardrailWarning[] = [];
  if (goals.fatG !== undefined && goals.calories > 0) {
    if ((goals.fatG * 9) / goals.calories < FAT_MIN_FRACTION_OF_KCAL) {
      warnings.push('fat-below-kcal-fraction');
    }
    if (bodyweightKg && bodyweightKg > 0 && goals.fatG / bodyweightKg < FAT_MIN_G_PER_KG) {
      warnings.push('fat-below-per-kg');
    }
  }
  if (bodyweightKg && bodyweightKg > 0 && goals.proteinG / bodyweightKg < PROTEIN_MIN_G_PER_KG) {
    warnings.push('protein-below-per-kg');
  }
  return warnings;
}
