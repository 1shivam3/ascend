import { describe, expect, it } from 'vitest';
import { FOOD_DB } from '@/lib/macros';
import { FOOD_NAME_HI, getFoodHindiName } from '@/lib/food-hindi';
import { containsDevanagari } from '@/lib/devanagari';

/**
 * Persona-sim round 5 — Round 4 (SIM-P1-05, food names, honest partial):
 * Hindi display names come ONLY from the repo's own curated
 * DEVANAGARI_WORD_MAP, inverted. No IFCT mechanical renderings ship:
 * the IFCT mapping was audited and rejected (it produces पलक for
 * spinach, अलु for potato, छेना for paneer — see food-hindi.ts header).
 * These tests pin the curated set and the audit failures.
 */
describe('Curated Hindi food names (SIM-P1-05 Round 4)', () => {
  it('covers a pinned curated set, all keys real FOOD_DB entries', () => {
    const keys = Object.keys(FOOD_NAME_HI);
    expect(keys.length).toBe(65);
    const unknown = keys.filter((k) => !(k in FOOD_DB));
    expect(unknown).toEqual([]);
    for (const k of keys) {
      expect(containsDevanagari(FOOD_NAME_HI[k])).toBe(true);
      expect(FOOD_NAME_HI[k]).not.toBe(k);
    }
  });

  it('spot-checks the standard spellings', () => {
    expect(FOOD_NAME_HI['spinach']).toBe('पालक');
    expect(FOOD_NAME_HI['potato']).toBe('आलू');
    expect(FOOD_NAME_HI['paneer']).toBe('पनीर');
    expect(FOOD_NAME_HI['chawal']).toBe('चावल');
    expect(FOOD_NAME_HI['egg']).toBe('अंडा');
    expect(FOOD_NAME_HI['cauliflower']).toBe('गोभी');
    expect(FOOD_NAME_HI['chicken']).toBe('चिकन');
    expect(FOOD_NAME_HI['dal']).toBe('दाल');
  });

  it('never ships the audited IFCT misspellings', () => {
    expect(FOOD_NAME_HI['spinach']).not.toBe('पलक');
    expect(FOOD_NAME_HI['potato']).not.toBe('अलु');
    expect(FOOD_NAME_HI['paneer']).not.toBe('छेना');
    expect(FOOD_NAME_HI['egg']).not.toBe('अंदा');
    expect(FOOD_NAME_HI['carrot']).not.toBe('गजर');
    expect(FOOD_NAME_HI['rajma']).not.toBe('रज्मह');
  });

  it('resolves case-insensitively and returns undefined when unmapped', () => {
    expect(getFoodHindiName('Spinach')).toBe('पालक');
    expect(getFoodHindiName('  dal  ')).toBe('दाल');
    expect(getFoodHindiName('Palak Paneer')).toBeUndefined();
    expect(getFoodHindiName('')).toBeUndefined();
  });
});
