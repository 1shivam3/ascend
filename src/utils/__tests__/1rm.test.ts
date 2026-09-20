import { describe, it, expect } from 'vitest';
import { calculateEstimated1RM, calculateEpley1RM, calculateRelativeStrength, calculateBarbellPlates, kgToLbs, lbsToKg } from '../1rm';

describe('1RM Calculator — Canonical Epley Formula', () => {
  it('returns weight for single rep (r = 1)', () => {
    expect(calculateEstimated1RM(100, 1)).toBe(100);
    expect(calculateEstimated1RM(220, 1)).toBe(220);
  });

  it('returns 0 for non-positive weight or reps', () => {
    expect(calculateEstimated1RM(0, 5)).toBe(0);
    expect(calculateEstimated1RM(100, 0)).toBe(0);
    expect(calculateEstimated1RM(-50, 5)).toBe(0);
  });

  it('calculates exact Epley value for 100kg x 5 reps (116.7kg)', () => {
    // 100kg x 5 reps: 100 * (1 + 5/30) = 116.666... -> rounded to 116.7
    const e1rm = calculateEstimated1RM(100, 5);
    expect(e1rm).toBe(116.7);
    expect(calculateEpley1RM(100, 5)).toBe(116.7);
  });

  it('calculates Epley value for high reps', () => {
    // 100kg x 20 reps: 100 * (1 + 20/30) = 166.7kg
    const e1rm = calculateEstimated1RM(100, 20);
    expect(e1rm).toBe(166.7);
  });

  it('clamps extreme outlier inputs', () => {
    // 1000kg should be clamped to MAX_PLAUSIBLE_WEIGHT_KG (550kg)
    const result = calculateEstimated1RM(1000, 1);
    expect(result).toBe(550);
  });
});

describe('Relative Strength Ratio', () => {
  it('calculates ratio accurately', () => {
    // 116.7 kg e1RM / 70 kg bodyweight = 1.67x
    expect(calculateRelativeStrength(116.7, 70)).toBe(1.67);
    // 140 kg squat / 70 kg bodyweight = 2.0x
    expect(calculateRelativeStrength(140, 70)).toBe(2.0);
  });

  it('returns null for missing or non-positive bodyweight or 1RM', () => {
    expect(calculateRelativeStrength(100, 0)).toBeNull();
    expect(calculateRelativeStrength(0, 75)).toBeNull();
  });
});

describe('Plate Calculator', () => {
  it('calculates standard plates per side for 100kg total', () => {
    // 100kg - 20kg bar = 80kg (40kg per side)
    // 40kg = 1x 25kg, 1x 15kg
    const { platesPerSide, remainderKg } = calculateBarbellPlates(100, 20);
    expect(remainderKg).toBe(0);
    expect(platesPerSide).toEqual([
      { plateWeight: 25, countPerSide: 1 },
      { plateWeight: 15, countPerSide: 1 },
    ]);
  });

  it('returns empty plates when target weight equals bar weight', () => {
    const { platesPerSide, remainderKg } = calculateBarbellPlates(20, 20);
    expect(platesPerSide).toEqual([]);
    expect(remainderKg).toBe(0);
  });
});

describe('Unit Conversions', () => {
  it('converts between kg and lbs correctly', () => {
    expect(kgToLbs(100)).toBeCloseTo(220.5, 1);
    expect(lbsToKg(220.5)).toBeCloseTo(100, 1);
  });
});
