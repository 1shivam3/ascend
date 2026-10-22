import { describe, it, expect } from 'vitest';
import { FOOD_DB } from '../src/lib/macros';
import { FOOD_META, ALLERGEN_TAGS, getFoodMeta } from '../src/lib/food-meta';
import type { DietTag, FoodSourceRef } from '../src/lib/types';

/**
 * Food schema v2 (P0-4): every FOOD_DB entry carries fiberG, dietTag,
 * allergenTags (controlled vocabulary) and sourceRef in FOOD_META —
 * 100% field presence, enforced here so a future entry can't land
 * without its metadata.
 */

const DIET_TAGS: DietTag[] = ['vegan', 'veg', 'egg', 'non-veg'];
const SOURCE_REFS: FoodSourceRef[] = ['IFCT 2017', 'USDA FDC', 'label', 'estimated'];

/**
 * Known Atwater outliers at the time of the audit (2026-10-22): entries
 * whose stated calories drift >10% from 4P+4C+9F. Mostly fibrous produce
 * and near-zero-calorie drinks where fiber energy and rounding dominate,
 * plus a few entries that deserve a data revisit. This test REPORTS the
 * set — it must equal the allowlist exactly, so a newly drifting entry
 * (regression) or a fixed one (allowlist cleanup) both fail loudly
 * instead of the drift set changing silently. Macros are NOT silently
 * rewritten to satisfy Atwater; fixing the data is separate follow-up
 * work (see the P0-4 PR body for the list).
 */
const ATWATER_ALLOWLIST: string[] = [
  'amla',
  'apple',
  'asparagus',
  'banana',
  'black coffee',
  'blueberries',
  'bottle gourd',
  'brinjal',
  'broccoli',
  'buttermilk',
  'cabbage',
  'capsicum',
  'cauliflower',
  'chaas',
  'coconut barfi',
  'coffee',
  'corn',
  'cucumber',
  'custard apple',
  'dates',
  'drumstick',
  'eggplant',
  'grapes',
  'green beans',
  'green tea',
  'guava',
  'kishmish',
  'kiwi',
  'litchi',
  'mango',
  'mass gainer',
  'mushroom',
  'orange',
  'papaya',
  'peach',
  'pear',
  'plum',
  'pomegranate',
  'pre-workout',
  'preworkout',
  'pumpkin',
  'raisins',
  'ridge gourd',
  'sapodilla',
  'sapota',
  'sitaphal',
  'spinach',
  'strawberries',
  'tamarind',
  'tempeh',
  'tomato',
  'toor dal',
  'veg manchurian',
  'watermelon',
  'yellow dal',
];

describe('food schema v2 — completeness', () => {
  it('covers 100% of FOOD_DB keys, with no orphan meta entries', () => {
    const dbKeys = Object.keys(FOOD_DB).sort();
    const metaKeys = Object.keys(FOOD_META).sort();
    expect(metaKeys).toEqual(dbKeys);
    expect(dbKeys.length).toBeGreaterThanOrEqual(508);
  });

  it('every entry has all four fields present and well-typed', () => {
    const bad: string[] = [];
    for (const [key, m] of Object.entries(FOOD_META)) {
      if (typeof m.fiberG !== 'number' || Number.isNaN(m.fiberG)) bad.push(`${key}: fiberG`);
      if (!DIET_TAGS.includes(m.dietTag)) bad.push(`${key}: dietTag=${m.dietTag}`);
      if (!Array.isArray(m.allergenTags)) bad.push(`${key}: allergenTags not array`);
      if (!SOURCE_REFS.includes(m.sourceRef)) bad.push(`${key}: sourceRef=${m.sourceRef}`);
    }
    expect(bad).toEqual([]);
  });

  it('fiber values are plausible (0 to 40 g per 100 g)', () => {
    const bad = Object.entries(FOOD_META)
      .filter(([, m]) => m.fiberG < 0 || m.fiberG > 40)
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });
});

describe('food schema v2 — vocabulary enforcement', () => {
  it('allergen tags come only from the controlled vocabulary, without duplicates', () => {
    const vocab = new Set<string>(ALLERGEN_TAGS);
    const bad: string[] = [];
    for (const [key, m] of Object.entries(FOOD_META)) {
      for (const t of m.allergenTags) if (!vocab.has(t)) bad.push(`${key}: ${t}`);
      if (new Set(m.allergenTags).size !== m.allergenTags.length) bad.push(`${key}: duplicate tags`);
    }
    expect(bad).toEqual([]);
  });

  it('dietTag and allergen tags do not contradict each other', () => {
    const bad: string[] = [];
    for (const [key, m] of Object.entries(FOOD_META)) {
      // A vegan entry cannot list a dairy/egg ingredient allergen.
      if (m.dietTag === 'vegan' && (m.allergenTags.includes('milk') || m.allergenTags.includes('egg'))) {
        bad.push(`${key}: vegan but tagged milk/egg`);
      }
      // An egg-classified entry must carry the egg allergen.
      if (m.dietTag === 'egg' && !m.allergenTags.includes('egg')) {
        bad.push(`${key}: dietTag egg without egg allergen`);
      }
      // A veg/vegan entry cannot carry a meat allergen.
      if ((m.dietTag === 'veg' || m.dietTag === 'vegan') &&
          (m.allergenTags.includes('fish') || m.allergenTags.includes('shellfish'))) {
        bad.push(`${key}: ${m.dietTag} but tagged fish/shellfish`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('food schema v2 — Atwater sanity (reporting)', () => {
  it('the set of >10% drifters equals the documented allowlist', () => {
    const drifters: string[] = [];
    for (const [key, v] of Object.entries(FOOD_DB)) {
      const atwater = 4 * v.proteinG + 4 * v.carbsG + 9 * v.fatG;
      if (v.calories === 0) {
        if (atwater !== 0) drifters.push(key);
        continue;
      }
      if (Math.abs(atwater - v.calories) / v.calories > 0.1) drifters.push(key);
    }
    expect(drifters.sort()).toEqual([...ATWATER_ALLOWLIST].sort());
  });
});

describe('food schema v2 — spot checks', () => {
  it('matches reference values for well-known foods', () => {
    expect(getFoodMeta('almonds')).toMatchObject({ fiberG: 12.5, dietTag: 'vegan', allergenTags: ['tree-nut'] });
    expect(getFoodMeta('oats')?.fiberG).toBe(10.1);
    expect(getFoodMeta('chia seeds')?.fiberG).toBe(34.4);
    expect(getFoodMeta('egg')).toMatchObject({ fiberG: 0, dietTag: 'egg', allergenTags: ['egg'] });
    expect(getFoodMeta('chicken breast')).toMatchObject({ fiberG: 0, dietTag: 'non-veg', allergenTags: [] });
    expect(getFoodMeta('paneer')).toMatchObject({ dietTag: 'veg', allergenTags: ['milk'] });
    expect(getFoodMeta('shrimp')).toMatchObject({ dietTag: 'non-veg', allergenTags: ['shellfish'] });
    expect(getFoodMeta('tofu')).toMatchObject({ dietTag: 'vegan', allergenTags: ['soy'] });
    expect(getFoodMeta('sambar')).toMatchObject({ dietTag: 'vegan', sourceRef: 'IFCT 2017' });
    expect(getFoodMeta('whey protein')?.sourceRef).toBe('label');
    expect(getFoodMeta('getFoodMeta is case-insensitive')).toBeNull();
    expect(getFoodMeta('PANEER')?.dietTag).toBe('veg');
    expect(getFoodMeta('no such food')).toBeNull();
  });
});
