import type { Unit } from './types';

/**
 * units.ts — the single source of truth for kg ↔ lbs conversion.
 *
 * Canonical convention (the one the codebase already used almost
 * everywhere): MULTIPLY in both directions —
 *   kg → lbs:  value * 2.20462
 *   lbs → kg:  value * 0.453592
 * A few sites historically divided by 2.20462 for lbs → kg; those now
 * route through lbsToKg like everything else. The two forms differ by
 * ~1e-6 relative — far below the 0.1 display rounding used app-wide —
 * and round-trip tests pin that kg→lbs→kg and lbs→kg→lbs stay within
 * display precision (tests/units.test.ts).
 *
 * No rounding lives here: callers keep their existing display rounding
 * (Math.round / toFixed) exactly as before.
 */

/** Standard ASCEND kilogram-to-pound conversion constant */
export const KG_TO_LBS = 2.20462;

/** Standard ASCEND pound-to-kilogram conversion constant */
export const LBS_TO_KG = 0.453592;

/** Converts a weight in kilograms to pounds (unrounded). */
export function kgToLbs(kg: number): number {
  return kg * KG_TO_LBS;
}

/** Converts a weight in pounds to kilograms (unrounded). */
export function lbsToKg(lbs: number): number {
  return lbs * LBS_TO_KG;
}

/**
 * Normalizes any weight value to kilograms.
 * Negative inputs clamp to 0 (0 is valid for bodyweight movements).
 */
export function normalizeWeightToKg(weight: number, unit: Unit): number {
  if (weight < 0) return 0; // Guard against negative weights (0 is valid for bodyweight)
  if (unit === 'lbs') {
    return lbsToKg(weight);
  }
  return weight;
}

/**
 * Converts a weight from one unit to another (identity when equal).
 */
export function convertWeight(weight: number, fromUnit: Unit, toUnit: Unit): number {
  if (fromUnit === toUnit) return weight;
  if (fromUnit === 'lbs' && toUnit === 'kg') {
    return lbsToKg(weight);
  }
  if (fromUnit === 'kg' && toUnit === 'lbs') {
    return kgToLbs(weight);
  }
  return weight;
}
