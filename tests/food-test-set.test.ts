/**
 * M1 (bug program Phase 3) — the food-database golden set.
 *
 * qa/FOOD_TEST_SET.json pins per-100g values for 79 foods. This test
 * asserts the live database (via estimateMacros at exactly 100 g)
 * stays within the file's tolerance of the pinned values. If a DB
 * value changes DELIBERATELY, regenerate the JSON in the same commit
 * and say why — silent drift fails here instead of reaching users.
 *
 * The same file carries the M3 scan-level regressions: pigeon pea
 * resolves to toor dal values and is NEVER priced or displayed as
 * chana (chickpea).
 */
import { describe, expect, it } from 'vitest';
import { estimateMacros } from '../src/lib/macros';
import { verifyScanItem } from '../src/lib/scan-verification';
import { canonicalDisplayName, resolveFoodAlias } from '../src/lib/food-aliases';
import testSet from '../qa/FOOD_TEST_SET.json';

interface GoldenFood {
  name: string;
  per100g: { calories: number; proteinG: number; carbsG: number; fatG: number };
}

const foods = (testSet as { foods: GoldenFood[] }).foods;
const tolerancePct = (testSet as { tolerancePct: number }).tolerancePct;

function withinTolerance(actual: number, expected: number): boolean {
  const tolerance = Math.max((tolerancePct / 100) * Math.abs(expected), expected === 0 ? 0.35 : 0.25);
  return Math.abs(actual - expected) <= tolerance;
}

describe('FOOD_TEST_SET golden values', () => {
  it('covers at least 60 foods', () => {
    expect(foods.length).toBeGreaterThanOrEqual(60);
  });

  it('the database still matches the pinned values within tolerance', () => {
    const drift: string[] = [];
    for (const food of foods) {
      const est = estimateMacros(food.name, 100, 'g');
      if (est.isUnmatched) {
        drift.push(`${food.name}: no longer in the database`);
        continue;
      }
      for (const field of ['calories', 'proteinG', 'carbsG', 'fatG'] as const) {
        if (!withinTolerance(est[field], food.per100g[field])) {
          drift.push(`${food.name}.${field}: db=${est[field]} pinned=${food.per100g[field]}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });
});

describe('M1: scanned macros come from the database', () => {
  it('a matched item gets DB values, not the model\u2019s (the 136 kcal pineapple)', () => {
    const item = verifyScanItem({
      name: 'Pineapple',
      quantity: '200g',
      estimatedGrams: 200,
      calories: 136, // the model's number from the gym video
      proteinG: 1.1,
      carbsG: 35,
      fatG: 0.2,
      confidence: 'high' as const,
    });
    expect(item.verified).toBe(true);
    expect(item.macroSource).toBe('database');
    // DB: pineapple is 50 kcal/100 g → 200 g = 100 kcal.
    expect(item.calories).toBe(100);
  });

  it('an unknown food keeps the model numbers but is flagged unverified', () => {
    const item = verifyScanItem({
      name: 'Qwzx Vbnm',
      quantity: '150g',
      estimatedGrams: 150,
      calories: 210,
      proteinG: 2,
      carbsG: 40,
      fatG: 5,
      confidence: 'high' as const,
    });
    expect(item.verified).toBe(false);
    expect(item.macroSource).toBe('model');
    expect(item.calories).toBe(210); // estimate preserved, but flagged
  });

  it('a word-overlap match takes the matched entry\u2019s values but stays unverified', () => {
    // "Zqxwv fruit" overlaps "dragon fruit" on the generic word
    // "fruit" — a different food may have supplied the values, so
    // the item is labelled with its source entry, never verified.
    const item = verifyScanItem({
      name: 'Zqxwv Fruit',
      quantity: '150g',
      estimatedGrams: 150,
      calories: 210,
      proteinG: 2,
      carbsG: 40,
      fatG: 5,
      confidence: 'high' as const,
    });
    expect(item.verified).toBe(false);
    expect(item.macroSource).toBe('database');
    expect(item.matchedEntry).toBeTruthy();
  });

  it('user-sourced items keep the user\u2019s numbers verbatim', () => {
    const item = verifyScanItem({
      name: 'Pineapple',
      quantity: '200g',
      estimatedGrams: 200,
      calories: 999,
      proteinG: 9,
      carbsG: 9,
      fatG: 9,
      confidence: 'high' as const,
      macroSource: 'user' as const,
    });
    expect(item.calories).toBe(999);
    expect(item.verified).toBe(true);
  });
});

describe('M3: aliases at the scan layer', () => {
  it('pigeon pea resolves to toor dal — never chana', () => {
    expect(resolveFoodAlias('Pigeon Pea')).toBe('toor dal');
    expect(resolveFoodAlias('Cooked Pigeon Peas (Chana)')).toBe('toor dal');
    expect(canonicalDisplayName('Cooked Pigeon Peas (Chana)')).toBe('Toor Dal (Pigeon Pea)');
  });

  it('a scanned "Pigeon Pea" is priced as toor dal, not chickpea', () => {
    const item = verifyScanItem({
      name: 'Toor Dal (Pigeon Pea)',
      quantity: '150g',
      estimatedGrams: 150,
      calories: 999,
      proteinG: 99,
      carbsG: 99,
      fatG: 99,
      confidence: 'high' as const,
    });
    const toor = estimateMacros('toor dal', 150, 'g');
    const chana = estimateMacros('chana', 150, 'g');
    expect(item.calories).toBe(toor.calories);
    expect(item.calories).not.toBe(chana.calories);
    expect(item.verified).toBe(true);
  });

  it('chana still means chickpea, and chana dal is its own food', () => {
    expect(resolveFoodAlias('chickpeas')).toBe('chana');
    expect(resolveFoodAlias('chana dal')).toBeNull(); // DB key of its own
    const est = estimateMacros('chana dal', 100, 'g');
    expect(est.isUnmatched).toBe(false);
  });
});
