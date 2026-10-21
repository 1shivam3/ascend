import { describe, it, expect } from 'vitest';
import {
  containsDevanagari,
  transliterateDevanagari,
  expandFoodQuery,
} from '../src/lib/devanagari';
import { getFoodSuggestions, parseNaturalMealOffline } from '../src/lib/macros';
import { searchFoods } from '../src/lib/food-search';

/**
 * QA4-029 — Devanagari food search.
 * The DB is Latin-keyed; typing दाल used to return [] and look like the
 * food did not exist. These tests pin the transliteration path.
 */
describe('QA4-029 transliterateDevanagari', () => {
  it('detects Devanagari script', () => {
    expect(containsDevanagari('दाल')).toBe(true);
    expect(containsDevanagari('dal')).toBe(false);
    expect(containsDevanagari('2 रोटी')).toBe(true);
  });

  it('maps staple words to their Latin DB spellings', () => {
    expect(transliterateDevanagari('दाल')).toBe('dal');
    expect(transliterateDevanagari('चावल')).toBe('chawal');
    expect(transliterateDevanagari('रोटी')).toBe('roti');
    expect(transliterateDevanagari('पनीर')).toBe('paneer');
    expect(transliterateDevanagari('आलू')).toBe('aloo');
  });

  it('passes Latin input through unchanged (lowercased)', () => {
    expect(transliterateDevanagari('Dal Tadka')).toBe('dal tadka');
    expect(expandFoodQuery('dal')).toEqual(['dal']);
  });

  it('expands चावल to both chawal and rice variants', () => {
    const variants = expandFoodQuery('चावल');
    expect(variants).toContain('chawal');
    expect(variants).toContain('rice');
  });

  it('converts Devanagari digits', () => {
    expect(transliterateDevanagari('२')).toBe('2');
  });
});

describe('QA4-029 getFoodSuggestions with Devanagari queries', () => {
  it('दाल returns real dal matches', () => {
    const results = getFoodSuggestions('दाल');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.toLowerCase().includes('dal'))).toBe(true);
  });

  it('चावल returns real rice/chawal matches', () => {
    const results = getFoodSuggestions('चावल');
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.some((r) => /chawal|rice/i.test(r)),
    ).toBe(true);
  });

  it('रोटी returns real roti matches', () => {
    const results = getFoodSuggestions('रोटी');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.toLowerCase().includes('roti'))).toBe(true);
  });

  it('पनीर and आलू also match', () => {
    expect(getFoodSuggestions('पनीर').some((r) => /paneer/i.test(r))).toBe(true);
    expect(getFoodSuggestions('आलू').some((r) => /aloo|potato/i.test(r))).toBe(true);
  });

  it('Latin queries behave as before', () => {
    expect(getFoodSuggestions('dal').length).toBeGreaterThan(0);
    expect(getFoodSuggestions('zzzznope').length).toBe(0);
  });
});

describe('QA4-029 searchFoods with Devanagari queries', () => {
  it('finds DB foods for दाल / चावल / रोटी', () => {
    expect(searchFoods('दाल', []).length).toBeGreaterThan(0);
    expect(searchFoods('चावल', []).length).toBeGreaterThan(0);
    expect(searchFoods('रोटी', []).length).toBeGreaterThan(0);
  });

  it('finds a Latin-named custom food from a Devanagari query', () => {
    const custom = [
      { name: 'My Dal', calories: 100, proteinG: 5, carbsG: 10, fatG: 2 } as never,
    ];
    const results = searchFoods('दाल', custom);
    expect(results[0]?.kind).toBe('custom');
    expect(results[0]?.name).toBe('My Dal');
  });
});

describe('QA4-029 parseNaturalMealOffline with Devanagari input', () => {
  it('parses "२ रोटी" and "दाल" into matched foods', () => {
    const items = parseNaturalMealOffline('२ रोटी, दाल');
    expect(items.length).toBe(2);
    expect(items.some((i) => i.isUnmatched !== true && /roti/i.test(i.name))).toBe(true);
    expect(items.some((i) => /dal/i.test(i.name))).toBe(true);
  });
});
