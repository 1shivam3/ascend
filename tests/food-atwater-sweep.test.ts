import { describe, it, expect } from 'vitest';
import { FOOD_DB } from '../src/lib/macros';

/**
 * Slop-audit WS1 (next batch): full-DB Atwater sweep, encoded as an
 * invariant so the check that was run by hand stays run.
 *
 * Band rule (the same one the sweep used):
 *  - Atwater A = 4·protein + 4·carbs + 9·fat.
 *  - A < 50 kcal: absolute tolerance of ±8 kcal. At this scale a relative
 *    band is meaningless (black coffee: 2 stated vs 1.2 Atwater), and the
 *    fibrous vegetables live here — their stated values are reference
 *    values (USDA-matching) whose carb totals include fibre, which
 *    yields ~2 kcal/g, not 4, so reference kcal legitimately sit below
 *    naive Atwater. Mirrors the convention already used in
 *    tests/food-db.test.ts.
 *  - A ≥ 50 kcal: stated calories must be within 15% of Atwater.
 *
 * The four dishes the audit sampled as wrong are pinned to their
 * corrected ranges below. Their defects were macro-level (impossible
 * fat / protein for the dish), which Atwater alone cannot see — poha's
 * old line was perfectly Atwater-consistent at 0.8 g fat.
 */
const atwater = (v: { proteinG: number; carbsG: number; fatG: number }) =>
  4 * v.proteinG + 4 * v.carbsG + 9 * v.fatG;

describe('food DB Atwater sweep (slop-audit WS1)', () => {
  it('every entry sits inside the sweep band', () => {
    const bad: string[] = [];
    for (const [name, v] of Object.entries(FOOD_DB)) {
      const a = atwater(v);
      if (a === 0) {
        if (v.calories !== 0) bad.push(`${name}: zero macros but ${v.calories} cal`);
        continue;
      }
      const ok =
        a < 50
          ? Math.abs(v.calories - a) <= 8
          : Math.abs(v.calories - a) / a <= 0.15;
      if (!ok) bad.push(`${name}: ${v.calories} cal vs atwater ${a.toFixed(1)}`);
    }
    expect(bad).toEqual([]);
  });

  it('poha carries its tadka: fat in line with the upma anchor, cooked calories', () => {
    const poha = FOOD_DB['poha'];
    // Its own recipe meta assumes a peanut-mustard tadka in 1 tsp oil —
    // 0.8 g fat/100 g was impossible. Sibling upma (same tadka) sits at 4 g.
    expect(poha.fatG).toBeGreaterThanOrEqual(3);
    expect(poha.fatG).toBeLessThanOrEqual(6);
    expect(poha.calories).toBeGreaterThanOrEqual(110);
    expect(poha.calories).toBeLessThanOrEqual(175);
    expect(Math.abs(poha.calories - atwater(poha)) / atwater(poha)).toBeLessThanOrEqual(0.05);
  });

  it('generic biryani is not chicken biryani in disguise', () => {
    const generic = FOOD_DB['biryani'];
    // 11 g protein/100 g was chicken-level; a veg logger over-counted
    // ~2.5×. Generic sits between the veg and chicken entries.
    expect(generic.proteinG).toBeGreaterThan(FOOD_DB['veg biryani'].proteinG);
    expect(generic.proteinG).toBeLessThanOrEqual(8);
    expect(generic.proteinG).toBeLessThan(FOOD_DB['chicken biryani'].proteinG);
  });

  it('roti/chapati fat matches their own "no ghee counted" meta', () => {
    for (const key of ['roti', 'chapati']) {
      const v = FOOD_DB[key];
      // Plain atta roti: only the flour's intrinsic fat (~1.5 g/100 g).
      expect(v.fatG, key).toBeLessThanOrEqual(2);
      expect(Math.abs(v.calories - atwater(v)) / atwater(v)).toBeLessThanOrEqual(0.05);
    }
    expect(FOOD_DB['roti']).toEqual(FOOD_DB['chapati']);
  });

  it('coconut barfi calories agree with its own macros', () => {
    const v = FOOD_DB['coconut barfi'];
    // Was stated 440 against 499 Atwater from its own macros.
    expect(Math.abs(v.calories - atwater(v)) / atwater(v)).toBeLessThanOrEqual(0.05);
  });
});
