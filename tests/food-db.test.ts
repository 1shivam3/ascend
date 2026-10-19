import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FOOD_DB } from '../src/lib/macros';

const SRC = readFileSync(join(process.cwd(), 'src/lib/macros.ts'), 'utf-8');
const DB_SRC = SRC.slice(SRC.indexOf('const FOOD_DB'), SRC.indexOf('};', SRC.indexOf('const FOOD_DB')));

function foodDbKeys(): string[] {
  return [...DB_SRC.matchAll(/^  '([^']+)':/gm)].map((m) => m[1]);
}

describe('food database integrity', () => {
  it('has no duplicate keys in the FOOD_DB literal', () => {
    const keys = foodDbKeys();
    const seen = new Set<string>();
    const dups = keys.filter((k) => (seen.has(k) ? true : (seen.add(k), false)));
    expect(dups).toEqual([]);
  });

  it('has at least 480 entries', () => {
    expect(Object.keys(FOOD_DB).length).toBeGreaterThanOrEqual(480);
  });

  it('every entry is within 20% of Atwater (4P + 4C + 9F)', () => {
    const bad: string[] = [];
    for (const [name, v] of Object.entries(FOOD_DB)) {
      const expected = 4 * v.proteinG + 4 * v.carbsG + 9 * v.fatG;
      if (v.calories < 0 || v.proteinG < 0 || v.carbsG < 0 || v.fatG < 0) {
        bad.push(`${name}: negative value`);
        continue;
      }
      if (expected === 0) {
        if (v.calories !== 0) bad.push(`${name}: zero macros but ${v.calories} cal`);
        continue;
      }
      // Very-low-calorie items (fibrous veg, black coffee, tea): Atwater
      // overestimates because fiber isn't fully metabolizable, and a relative
      // band is meaningless at 1-2 cal — use an absolute tolerance instead.
      const ok =
        expected < 50
          ? Math.abs(v.calories - expected) <= 8
          : Math.abs(v.calories - expected) / expected <= 0.2;
      if (!ok) bad.push(`${name}: ${v.calories} cal vs atwater ${expected.toFixed(1)}`);
    }
    expect(bad).toEqual([]);
  });

  it('spot-checks well-known values', () => {
    const spots: Array<[string, number]> = [
      ['chicken breast', 165],
      ['roti', 297],
      ['paneer', 265],
      ['dal', 116],
      ['gulab jamun', 320],
      ['jalebi', 400],
      ['masala dosa', 185],
      ['biryani', 180],
      ['samosa', 260],
      ['chai', 65],
    ];
    for (const [name, cal] of spots) {
      expect(FOOD_DB[name], `missing: ${name}`).toBeDefined();
      expect(Math.abs(FOOD_DB[name].calories - cal) / cal).toBeLessThan(0.15);
    }
  });

  it('has deep Indian coverage', () => {
    const keys = new Set(Object.keys(FOOD_DB));
    for (const must of [
      'rasgulla', 'kaju katli', 'motichoor ladoo', 'rasmalai', 'mysore pak',
      'pani puri', 'bhel puri', 'vada pav', 'pav bhaji', 'misal pav', 'dabeli',
      'uttapam', 'ven pongal', 'appam', 'puttu', 'curd rice', 'bisibelebath',
      'sarson ka saag', 'makki di roti', 'baingan bharta', 'thepla', 'dhokla',
      'tandoori roti', 'bhatura', 'missi roti', 'jeera rice', 'veg pulao',
      'haldirams aloo bhujia', 'murukku', 'makhana', 'parle-g',
      'filter coffee', 'cutting chai', 'sugarcane juice',
      'veg momos', 'chole bhature', 'rajma chawal', 'tandoori chicken',
      'phulka', 'lady finger', 'brinjal', 'jaggery', 'kishmish', 'anjeer',
    ]) {
      expect(keys.has(must), `missing Indian staple: ${must}`).toBe(true);
    }
  });
});
