/**
 * GENERIC-FALLBACK LABEL — live finding on the 2l6v9mfoi preview
 * (guest mode), after the dialog quantity-change fix.
 *
 * Live repro: Fuel > Add Manually > type a made-up name "Zqxwv fruit",
 * 100 g, without tapping any suggestion. The dialog showed ~60 kcal /
 * 1.2 g / 13 g / 0.4 g with NO unmatched banner and NO estimate label.
 *
 * ROOT CAUSE (proven here, not assumed): the values are NOT a generic
 * fallback profile — they are dragon fruit's real library values
 * (FOOD_DB 'dragon fruit' = 60 / 1.2 / 13 / 0.4). The estimator's
 * word-overlap fallback matched on the single shared generic word
 * "fruit" (overlap 1 / max(2, 2) = 0.5 >= 0.3), so isUnmatched came
 * back false and the banner's render condition (food.isUnmatched)
 * correctly — per its condition — did not fire. The banner logic was
 * fine; the matcher silently substituted a different food's values
 * for the typed name with no trace of the substitution.
 *
 * FIX: the estimator reports provenance for word-overlap matches
 * (isApproximateMatch + matchedEntry), and the dialog renders the
 * amber estimate banner for approximate rows, naming the entry the
 * values actually came from. Exact and substring matches are NOT
 * relabeled: their values come from the entry the user typed (or a
 * key contained in it), which is the established matched behavior.
 * FOOD_DB values are untouched throughout.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  estimateMacros,
  nextFoodItemOnQuantityChange,
} from '../src/lib/macros';

describe('generic-fallback estimate labeling (live finding, 2l6v9mfoi)', () => {
  it('a made-up name sharing one generic word is flagged approximate, not silently matched', () => {
    const est = estimateMacros('Zqxwv fruit', 100, 'g');
    // Values are dragon fruit's library values — the overlap match.
    expect(est.calories).toBe(60);
    expect(est.proteinG).toBe(1.2);
    expect(est.carbsG).toBe(13);
    expect(est.fatG).toBe(0.4);
    // ...but the dialog must know this is an approximation, not a match.
    expect(est.isUnmatched).toBe(false);
    expect(est.isApproximateMatch).toBe(true);
    expect(est.matchedEntry).toBe('dragon fruit');
  });

  it('quantity changes preserve the approximate flag and rescale the matched entry', () => {
    const at100 = estimateMacros('Zqxwv fruit', 100, 'g');
    const at150 = nextFoodItemOnQuantityChange(at100, 150);
    expect(at150.isApproximateMatch).toBe(true);
    expect(at150.matchedEntry).toBe('dragon fruit');
    expect(at150.calories).toBe(90);
    expect(at150.proteinG).toBe(1.8);
    expect(at150.carbsG).toBe(19.5);
    expect(at150.fatG).toBe(0.6);
  });

  it('matched paths are NOT labeled approximate', () => {
    const lib = estimateMacros('Chicken breast', 150, 'g');
    expect(lib.calories).toBe(248);
    expect(lib.proteinG).toBe(46.5);
    expect(lib.carbsG).toBe(0);
    expect(lib.fatG).toBe(5.4);
    expect(lib.isApproximateMatch).not.toBe(true);
    expect(lib.matchedEntry).toBeUndefined();
    const exact = estimateMacros('dragon fruit', 100, 'g');
    expect(exact.calories).toBe(60);
    expect(exact.isApproximateMatch).not.toBe(true);
    expect(exact.matchedEntry).toBeUndefined();
  });

  it('a name sharing no word with any entry stays unmatched with zero values', () => {
    const est = estimateMacros('Zqxwv', 100, 'g');
    expect(est.isUnmatched).toBe(true);
    expect(est.calories).toBe(0);
    expect(est.proteinG).toBe(0);
    expect(est.isApproximateMatch).not.toBe(true);
  });

  it('the dialog renders an estimate label for approximate rows', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/MealsPage.tsx'),
      'utf-8',
    );
    // The banner block must reference the approximate flag, not only
    // isUnmatched — otherwise the label can never appear live.
    expect(src).toContain('isApproximateMatch');
    expect(src).toContain('meals.estimatedFrom');
  });

  it('the estimate label exists in English and Hindi (i18n parity)', () => {
    const en = readFileSync(join(process.cwd(), 'src/lib/i18n/en.ts'), 'utf-8');
    const hi = readFileSync(join(process.cwd(), 'src/lib/i18n/hi.ts'), 'utf-8');
    expect(en).toContain('meals.estimatedFrom');
    expect(hi).toContain('meals.estimatedFrom');
  });
});
