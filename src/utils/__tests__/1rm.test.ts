import { describe, it, expect } from 'vitest';
import { calculateEstimated1RM, calculateBarbellPlates, kgToLbs, lbsToKg } from '../1rm';

describe('1RM Calculator — Dampened Hybrid Brzycki-Epley', () => {
  it('returns weight for single rep (r = 1)', () => {
    expect(calculateEstimated1RM(100, 1)).toBe(100);
    expect(calculateEstimated1RM(220, 1)).toBe(220);
  });

  it('returns 0 for non-positive weight or reps', () => {
    expect(calculateEstimated1RM(0, 5)).toBe(0);
    expect(calculateEstimated1RM(100, 0)).toBe(0);
    expect(calculateEstimated1RM(-50, 5)).toBe(0);
  });

  it('calculates hybrid value for 2 to 10 reps', () => {
    // 100kg x 5 reps
    // Epley: 100 * (1 + 5/30) = 116.666
    // Brzycki: (100 * 36) / (37 - 5) = 3600 / 32 = 112.5
    // Hybrid: (116.666 + 112.5) / 2 = 114.58 -> rounded 114.6
    const e1rm = calculateEstimated1RM(100, 5);
    expect(e1rm).toBeCloseTo(114.6, 1);
  });

  it('applies dampening penalty for high reps (>10) to avoid endurance inflation', () => {
    // 100kg x 20 reps
    // Unconstrained Epley: 100 * (1 + 20/30) = 166.7kg
    // Dampened with (10/20)^0.12 = 0.920
    // Expected: ~153.4kg
    const dampened = calculateEstimated1RM(100, 20);
    expect(dampened).toBeLessThan(166.7);
    expect(dampened).toBeGreaterThan(140);
  });

  it('clamps extreme outlier inputs', () => {
    // 1000kg should be clamped to MAX_PLAUSIBLE_WEIGHT_KG (550kg)
    const result = calculateEstimated1RM(1000, 1);
    expect(result).toBe(550);
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
