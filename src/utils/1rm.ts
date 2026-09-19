/**
 * ASCEND 1RM Calculator & Biomechanical Utilities
 */

const MAX_PLAUSIBLE_WEIGHT_KG = 550; // Cap to world record threshold
const MAX_PLAUSIBLE_REPS = 100;

/**
 * Calculates Estimated One-Rep Max using the Dampened Hybrid Brzycki-Epley Curve.
 * 
 * - Reps = 1: 1RM = Weight
 * - Reps 2-10: Average of Epley and Brzycki formulas for maximum empirical accuracy
 * - Reps > 10: Epley with a power dampening factor (10/r)^0.12 to suppress endurance skewing
 */
export function calculateEstimated1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  
  const w = Math.min(weightKg, MAX_PLAUSIBLE_WEIGHT_KG);
  const r = Math.min(reps, MAX_PLAUSIBLE_REPS);

  if (r === 1) {
    return Math.round(w * 10) / 10;
  }

  if (r >= 2 && r <= 10) {
    const epley = w * (1 + r / 30);
    const brzycki = (w * 36) / (37 - r);
    const hybrid = (epley + brzycki) / 2;
    return Math.round(hybrid * 10) / 10;
  }

  // r > 10
  const dampening = Math.pow(10 / r, 0.12);
  const dampenedEpley = w * (1 + r / 30) * dampening;
  return Math.round(dampenedEpley * 10) / 10;
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
