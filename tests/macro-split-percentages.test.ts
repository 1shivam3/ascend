import { describe, it, expect } from 'vitest';
import { macroSplitPercentages } from '../src/lib/effective-goals';

/**
 * Preview-fix F16: macro-split percentages must describe the macro
 * split, not divide unscaled grams by a day-kind-scaled calorie
 * total. On a one-meal fast (2530 kcal → 1771, grams unchanged at
 * 126/349/70) the old formula gave P28 + C79 + F36 = 143%.
 */

describe('F16: macroSplitPercentages', () => {
  it('gives 20/55/25 for the observed 75 kg profile', () => {
    expect(macroSplitPercentages(126, 349, 70)).toEqual({
      proteinPct: 20,
      carbsPct: 55,
      fatPct: 25,
    });
  });

  it('is independent of the displayed calorie total', () => {
    // Same grams, normal day (2530) and fast day (1771): the split
    // must not change, because the grams did not change.
    const normal = macroSplitPercentages(126, 349, 70);
    const fast = macroSplitPercentages(126, 349, 70);
    expect(fast).toEqual(normal);
    expect(normal.proteinPct + normal.carbsPct + normal.fatPct).toBe(100);
  });

  it('sums to 99–101 under independent rounding', () => {
    const cases: Array<[number, number, number]> = [
      [100, 100, 100],
      [140, 220, 70],
      [90, 300, 80],
      [200, 150, 50],
    ];
    for (const [p, c, f] of cases) {
      const s = macroSplitPercentages(p, c, f);
      const sum = s.proteinPct + s.carbsPct + s.fatPct;
      expect(sum).toBeGreaterThanOrEqual(99);
      expect(sum).toBeLessThanOrEqual(101);
    }
  });

  it('returns zeros when there are no macros', () => {
    expect(macroSplitPercentages(0, 0, 0)).toEqual({
      proteinPct: 0,
      carbsPct: 0,
      fatPct: 0,
    });
    expect(macroSplitPercentages(-5, 0, 0)).toEqual({
      proteinPct: 0,
      carbsPct: 0,
      fatPct: 0,
    });
  });
});
