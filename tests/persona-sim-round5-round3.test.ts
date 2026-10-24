import { describe, expect, it } from 'vitest';
import {
  EXERCISE_LIBRARY,
  EXERCISE_NAME_HI,
  getExerciseHindiName,
} from '@/lib/exercise-library';
import { en } from '@/lib/i18n/en';
import { hi } from '@/lib/i18n/hi';

/**
 * Persona-sim round 5 — Round 3 (SIM-P1-05): Devanagari display names.
 * Display-only: English names stay the key everywhere; these strings
 * never feed matching, PRs, or history.
 */

describe('Hindi exercise names (SIM-P1-05 Round 3)', () => {
  it('covers every library exercise (104/104)', () => {
    expect(EXERCISE_LIBRARY.length).toBe(104);
    const missing = EXERCISE_LIBRARY.filter((e) => !EXERCISE_NAME_HI[e.id]);
    expect(missing).toEqual([]);
  });

  it('spot-checks transliterations', () => {
    expect(EXERCISE_NAME_HI.squat).toBe('बारबेल बैक स्क्वाट');
    expect(EXERCISE_NAME_HI.deadlift).toBe('कन्वेंशनल डेडलिफ्ट');
    expect(EXERCISE_NAME_HI.bench_press).toBe('बारबेल बेंच प्रेस');
    expect(EXERCISE_NAME_HI.plank).toBe('फ्रंट प्लैंक (सेकंड्स)');
    expect(EXERCISE_NAME_HI.farmers_walk).toBe('फ़ार्मर्स वॉक');
  });

  it('resolves shorthand/alias names and returns undefined when unknown', () => {
    expect(getExerciseHindiName('Squat')).toBe('बारबेल बैक स्क्वाट');
    expect(getExerciseHindiName('Barbell Bench Press')).toBe('बारबेल बेंच प्रेस');
    expect(getExerciseHindiName('Not A Real Exercise')).toBeUndefined();
  });
});

describe('Toast i18n coverage, core journeys (SIM-P2-01 Round 3)', () => {
  const toastKeys = (Object.keys(en) as string[]).filter((k) => k.startsWith('toast.'));
  const paramsOf = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it('converts the core-journey toast set (33 calls) and keeps en/hi in parity', () => {
    expect(toastKeys.length).toBeGreaterThanOrEqual(60);
    const missingInHi = toastKeys.filter((k) => !(k in hi));
    expect(missingInHi).toEqual([]);
  });

  it('keeps {param} tokens identical between en and hi templates', () => {
    const mismatched = toastKeys.filter((k) => {
      const e = (en as Record<string, string>)[k];
      const h = (hi as Record<string, string>)[k];
      return typeof e === 'string' && typeof h === 'string'
        && JSON.stringify(paramsOf(e)) !== JSON.stringify(paramsOf(h));
    });
    expect(mismatched).toEqual([]);
  });

  it('keeps one/many quick-log variants distinct (no "1 items")', () => {
    expect((en as Record<string, string>)['toast.mealLoggedQuickOne']).not.toContain('{count}');
    expect((en as Record<string, string>)['toast.mealLoggedQuickMany']).toContain('{count}');
  });
});
