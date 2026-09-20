/**
 * ASCEND 1RM Calculator & Biomechanical Utilities
 */

const MAX_PLAUSIBLE_WEIGHT_KG = 550; // Cap to world record threshold
const MAX_PLAUSIBLE_REPS = 100;

/**
 * Calculates Estimated One-Rep Max using the canonical Epley Formula:
 * e1RM = weight * (1 + reps / 30)
 * 
 * Example: 100 kg * 5 reps = 100 * (1 + 5/30) = 116.666... ≈ 116.7 kg.
 */
export function calculateEpley1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  
  const w = Math.min(weightKg, MAX_PLAUSIBLE_WEIGHT_KG);
  const r = Math.min(reps, MAX_PLAUSIBLE_REPS);

  if (r === 1) {
    return Math.round(w * 10) / 10;
  }

  const e1rm = w * (1 + r / 30);
  return Math.round(e1rm * 10) / 10;
}

/**
 * Calculates Estimated 1RM. Uses the deterministic Epley standard across ASCEND.
 */
export function calculateEstimated1RM(weightKg: number, reps: number): number {
  return calculateEpley1RM(weightKg, reps);
}

/**
 * Calculates Relative Strength ratio: estimated1RM / bodyweight
 * Example: 116.7 kg e1RM / 70 kg bodyweight = 1.67x
 */
export function calculateRelativeStrength(
  estimated1RmKg: number,
  bodyweightKg: number
): number | null {
  if (!bodyweightKg || bodyweightKg <= 0 || !estimated1RmKg || estimated1RmKg <= 0) {
    return null;
  }
  const ratio = estimated1RmKg / bodyweightKg;
  return Math.round(ratio * 100) / 100;
}

export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

export function lbsToKg(lbs: number): number {
  return Math.round((lbs / 2.20462) * 10) / 10;
}

export function formatWeight(weightKg: number, unit: 'kg' | 'lbs' = 'kg'): string {
  if (unit === 'lbs') {
    return `${kgToLbs(weightKg)} lbs`;
  }
  return `${Math.round(weightKg * 10) / 10} kg`;
}

export interface PlateResult {
  plateWeight: number;
  countPerSide: number;
}

/**
 * Calculates required barbell plates per side for a given target total weight.
 */
export function calculateBarbellPlates(
  targetWeightKg: number,
  barWeightKg: number = 20,
  availablePlates: number[] = [25, 20, 15, 10, 5, 2.5, 1.25]
): { platesPerSide: PlateResult[]; remainderKg: number } {
  if (targetWeightKg <= barWeightKg) {
    return { platesPerSide: [], remainderKg: 0 };
  }

  let weightPerSide = (targetWeightKg - barWeightKg) / 2;
  const sortedPlates = [...availablePlates].sort((a, b) => b - a);
  const platesPerSide: PlateResult[] = [];

  for (const plate of sortedPlates) {
    if (weightPerSide >= plate) {
      const count = Math.floor(weightPerSide / plate);
      platesPerSide.push({ plateWeight: plate, countPerSide: count });
      weightPerSide -= count * plate;
    }
  }

  return {
    platesPerSide,
    remainderKg: Math.round(weightPerSide * 2 * 10) / 10,
  };
}
