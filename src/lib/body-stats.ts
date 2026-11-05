import type { Unit } from './types';
import { kgToLbs, lbsToKg } from './units';

/**
 * Body-stat provenance + validation (Phase-1 Task 1.1).
 *
 * Calorie/macro targets are computed from bodyweight and height. The
 * simplified onboarding seeds placeholders (70 kg / 175 cm) for users
 * who skip entering them, and a target derived from numbers the user
 * never gave must never be displayed or applied as if it were theirs.
 * The profile records where each stat came from (see UserProfile);
 * this module is the single reader of that provenance plus the single
 * validation-range source for weight/height entry.
 *
 * Legacy rule: a profile with NO provenance fields predates tracking
 * (its stats came from the old full onboarding or later edits), so its
 * stats count as real — existing users keep their targets untouched.
 */

/** Structural minimum of the profile this module reads (UserProfile
 * satisfies it; so do the narrower profile shapes some callers hold). */
export interface BodyStatsProfile {
  bodyweightKg?: number | null;
  heightCm?: number | null;
  bodyweightSource?: 'user' | 'default' | null;
  heightSource?: 'user' | 'default' | null;
}

type ProfileStats = BodyStatsProfile | null | undefined;

/** True when the stored bodyweight was actually entered by the user. */
export function weightIsReal(profile: ProfileStats): boolean {
  if (!profile) return false;
  return profile.bodyweightSource !== 'default';
}

/** True when the stored height was actually entered by the user. */
export function heightIsReal(profile: ProfileStats): boolean {
  if (!profile) return false;
  return profile.heightSource !== 'default';
}

/**
 * True only when BOTH stats behind a calorie target are real. A target
 * needs weight and height together (Mifflin-St Jeor), so one real stat
 * is not enough to derive from.
 */
export function hasRealBodyStats(profile: ProfileStats): boolean {
  return weightIsReal(profile) && heightIsReal(profile);
}

// ── Entry validation ────────────────────────────────────────────────
// The same ranges the Body Metrics modal and the Fuel preferences
// prompt enforce (weight 30–300 kg / 66–660 lbs; height 100–250 cm /
// 39–98 in). One source so onboarding cannot drift from them.

export const WEIGHT_RANGE = { kg: { min: 30, max: 300 }, lbs: { min: 66, max: 660 } } as const;
export const HEIGHT_RANGE = { cm: { min: 100, max: 250 }, in: { min: 39, max: 98 } } as const;

/**
 * Validate a weight + height pair as typed in the given unit.
 * Returns which field failed, or null when both are in range.
 */
export function validateBodyStats(
  weight: number,
  height: number,
  unit: Unit,
): 'weight' | 'height' | null {
  const w = WEIGHT_RANGE[unit];
  if (!Number.isFinite(weight) || weight < w.min || weight > w.max) return 'weight';
  const h = unit === 'lbs' ? HEIGHT_RANGE.in : HEIGHT_RANGE.cm;
  if (!Number.isFinite(height) || height < h.min || height > h.max) return 'height';
  return null;
}

/** Convert a typed weight/height pair into the canonical stored shape. */
export function toStoredBodyStats(
  weight: number,
  height: number,
  unit: Unit,
): { bodyweightKg: number; bodyweightLbs: number; heightCm: number } {
  const bodyweightKg =
    Math.round((unit === 'lbs' ? lbsToKg(weight) : weight) * 10) / 10;
  const bodyweightLbs =
    Math.round((unit === 'lbs' ? weight : kgToLbs(weight)) * 10) / 10;
  const heightCm = Math.round(unit === 'lbs' ? height * 2.54 : height);
  return { bodyweightKg, bodyweightLbs, heightCm };
}
