import { describe, it, expect } from 'vitest';
import {
  GHEE_TSP_FAT_G,
  GHEE_TSP_KCAL,
  OIL_LEVELS,
  tspForOilLevel,
  oilLevelForTsp,
  applyOilDelta,
  withOilLevel,
  defaultOilForFood,
} from '../src/lib/oil-adjust';
import { householdDraftFor } from '../src/lib/indian-foods';

describe('ghee/oil fat math', () => {
  it('uses Atwater-consistent constants (1 tsp ≈ 36 kcal, 1 tbsp ≈ 108)', () => {
    expect(GHEE_TSP_FAT_G * 9).toBe(GHEE_TSP_KCAL);
    expect(tspForOilLevel('tbsp') * GHEE_TSP_KCAL).toBe(108);
    expect(tspForOilLevel('tbsp2') * GHEE_TSP_KCAL).toBe(216);
    expect(OIL_LEVELS.map((l) => l.id)).toEqual(['none', 'tsp', 'tbsp', 'tbsp2']);
  });

  it('moving from the 1 tsp assumption to 1 tbsp adds 2 tsp of fat', () => {
    const item = { calories: 192, proteinG: 10.5, carbsG: 25.5, fatG: 5.4 };
    const adj = applyOilDelta(item, 1, 3);
    expect(adj.fatG).toBeCloseTo(5.4 + 2 * GHEE_TSP_FAT_G, 1);
    expect(adj.calories).toBe(192 + 2 * GHEE_TSP_KCAL);
    // Other macros untouched
    expect(adj.proteinG).toBe(10.5);
    expect(adj.carbsG).toBe(25.5);
  });

  it('choosing None removes exactly the assumed fat', () => {
    const item = { calories: 192, fatG: 5.4 };
    const adj = applyOilDelta(item, 1, 0);
    expect(adj.fatG).toBeCloseTo(1.4, 1);
    expect(adj.calories).toBe(192 - GHEE_TSP_KCAL);
  });

  it('never drives fat or calories below zero', () => {
    const adj = applyOilDelta({ calories: 20, fatG: 1 }, 6, 0);
    expect(adj.fatG).toBe(0);
    expect(adj.calories).toBeGreaterThanOrEqual(0);
  });

  it('withOilLevel is reversible: tbsp then back to tsp restores the item', () => {
    const base = { calories: 192, fatG: 5.4, oilAssumedTsp: 1, oilLevel: 'tsp' as const };
    const richer = withOilLevel(base, 'tbsp');
    expect(richer.calories).toBe(192 + 72);
    const back = withOilLevel(richer, 'tsp');
    expect(back.calories).toBe(192);
    expect(back.fatG).toBeCloseTo(5.4, 1);
    expect(back.oilLevel).toBe('tsp');
  });

  it('withOilLevel uses the DB assumption as baseline before any choice', () => {
    const item = { calories: 100, fatG: 4, oilAssumedTsp: 2 };
    const adj = withOilLevel(item, 'tsp');
    expect(adj.calories).toBe(100 - GHEE_TSP_KCAL);
  });

  it('oilLevelForTsp snaps assumptions to the nearest selector step', () => {
    expect(oilLevelForTsp(0)).toBe('none');
    expect(oilLevelForTsp(0.25)).toBe('none');
    expect(oilLevelForTsp(0.5)).toBe('tsp');
    expect(oilLevelForTsp(1)).toBe('tsp');
    expect(oilLevelForTsp(2)).toBe('tbsp');
    expect(oilLevelForTsp(3)).toBe('tbsp');
    expect(oilLevelForTsp(6)).toBe('tbsp2');
  });

  it('defaultOilForFood only fires for oil-relevant Indian dishes', () => {
    expect(defaultOilForFood('dal tadka')).toEqual({ assumedTsp: 1, level: 'tsp' });
    expect(defaultOilForFood('paneer butter masala')?.assumedTsp).toBe(2);
    expect(defaultOilForFood('idli')).toBeNull();
    expect(defaultOilForFood('bhatura')).toBeNull();
    expect(defaultOilForFood('chicken breast')).toBeNull();
  });
});

describe('household drafts for scan results', () => {
  it('300g of dal tadka becomes 2 katori', () => {
    expect(householdDraftFor('dal tadka', 300)).toEqual({ quantity: 2, unit: 'katori' });
  });

  it('60g of roti becomes 2 pieces', () => {
    expect(householdDraftFor('roti', 60)).toEqual({ quantity: 2, unit: 'piece' });
  });

  it('amounts that fit no clean unit count stay in grams', () => {
    expect(householdDraftFor('dal tadka', 40)).toBeNull();
    expect(householdDraftFor('chicken breast', 200)).toBeNull();
  });
});
