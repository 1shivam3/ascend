import { describe, it, expect } from 'vitest';
import { FOOD_DB, estimateMacros } from '../src/lib/macros';
import {
  INDIAN_FOOD_VALUES,
  INDIAN_FOOD_META,
  resolveIndianMeta,
  getHouseholdUnits,
  getHouseholdUnitGrams,
  isIndianDish,
} from '../src/lib/indian-foods';

describe('curated Indian overlay', () => {
  it('adds at least 45 curated dishes on top of the base DB', () => {
    expect(Object.keys(INDIAN_FOOD_VALUES).length).toBeGreaterThanOrEqual(45);
    expect(Object.keys(FOOD_DB).length).toBeGreaterThanOrEqual(525);
  });

  it('keeps the classic confusables distinct (dal tadka ≠ makhani ≠ sambar ≠ rasam ≠ kadhi)', () => {
    const cals = ['dal tadka', 'dal makhani', 'sambar', 'rasam', 'kadhi'].map(
      (k) => FOOD_DB[k].calories
    );
    expect(new Set(cals).size).toBe(5);
    // Makhani (butter-cream) must be far richer than rasam (thin pepper water)
    expect(FOOD_DB['dal makhani'].calories).toBeGreaterThan(FOOD_DB['rasam'].calories * 3);
    expect(FOOD_DB['dal makhani'].fatG).toBeGreaterThan(FOOD_DB['dal tadka'].fatG);
  });

  it('every meta entry has an assumption, units and an oil baseline', () => {
    for (const [key, meta] of Object.entries(INDIAN_FOOD_META)) {
      expect(meta.assumption.length, key).toBeGreaterThan(10);
      expect(meta.units.length, key).toBeGreaterThan(0);
      expect(meta.assumedOilTsp, key).toBeGreaterThanOrEqual(0);
      for (const u of meta.units) expect(u.grams, `${key}/${u.id}`).toBeGreaterThan(0);
    }
    expect(Object.keys(INDIAN_FOOD_META).length).toBeGreaterThanOrEqual(80);
  });
});

describe('household unit conversion math', () => {
  it('1 katori dal tadka = 150g of the per-100g values', () => {
    const est = estimateMacros('dal tadka', 1, 'katori');
    expect(est.calories).toBe(Math.round(FOOD_DB['dal tadka'].calories * 1.5));
    expect(est.proteinG).toBeCloseTo(FOOD_DB['dal tadka'].proteinG * 1.5, 1);
  });

  it('a katori of sabzi is lighter than a katori of dal (120g vs 150g)', () => {
    expect(getHouseholdUnitGrams('cabbage sabzi', 'katori')).toBe(120);
    expect(getHouseholdUnitGrams('dal tadka', 'katori')).toBe(150);
    const est = estimateMacros('cabbage sabzi', 1, 'katori');
    expect(est.calories).toBe(Math.round(FOOD_DB['cabbage sabzi'].calories * 1.2));
  });

  it('roti logs by piece at 30g, not the old generic 40g', () => {
    const est = estimateMacros('roti', 2, 'piece');
    expect(est.calories).toBe(Math.round(FOOD_DB['roti'].calories * 0.6));
  });

  it('tandoori roti piece is 40g (bigger than a home phulka)', () => {
    expect(getHouseholdUnitGrams('tandoori roti', 'piece')).toBe(40);
    const est = estimateMacros('tandoori roti', 1, 'piece');
    expect(est.calories).toBe(Math.round(FOOD_DB['tandoori roti'].calories * 0.4));
  });

  it('2 katori sambar uses the dal-unit set', () => {
    const est = estimateMacros('sambar', 2, 'katori');
    expect(est.calories).toBe(Math.round(FOOD_DB['sambar'].calories * 3));
  });

  it('non-Indian foods keep the legacy generic katori (150g)', () => {
    const est = estimateMacros('oats', 1, 'katori');
    expect(est.calories).toBe(Math.round(FOOD_DB['oats'].calories * 1.5));
  });
});

describe('meta resolution', () => {
  it('resolves exact and fuzzy names', () => {
    expect(resolveIndianMeta('dal tadka')?.key).toBe('dal tadka');
    expect(resolveIndianMeta('Dal Makhani')?.key).toBe('dal makhani');
    expect(isIndianDish('paneer butter masala')).toBe(true);
    expect(isIndianDish('chicken breast')).toBe(false);
    expect(getHouseholdUnits('chicken breast')).toEqual([]);
  });

  it('dal dishes carry a ghee-tadka assumption and are oil-relevant', () => {
    const meta = resolveIndianMeta('dal tadka')!.meta;
    expect(meta.assumption).toMatch(/ghee/i);
    expect(meta.oilRelevant).toBe(true);
    expect(meta.assumedOilTsp).toBe(1);
  });

  it('steamed/fried-through dishes are not oil-selector relevant', () => {
    expect(resolveIndianMeta('idli')!.meta.oilRelevant).toBe(false);
    expect(resolveIndianMeta('bhatura')!.meta.oilRelevant).toBe(false);
    expect(resolveIndianMeta('curd')!.meta.oilRelevant).toBe(false);
  });
});
