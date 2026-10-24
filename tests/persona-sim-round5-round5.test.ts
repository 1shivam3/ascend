/**
 * Persona sim Round 5 — Round 5 regression tests (SIM-P1-05 how-to + TabGuard).
 *
 * - Every exercise that has English howTo also has Hindi howToHi, with the
 *   SAME step count, non-empty steps, steps that differ from the English
 *   originals, and Devanagari content in every step.
 * - getExerciseFormCues(name, 'hi') returns the Hindi steps when they exist
 *   and the English steps otherwise (honest fallback, never blanks);
 *   without a language it returns English exactly as before.
 * - tabGuard.* keys exist in both dictionaries (parity test covers all keys,
 *   these pins name the Round 5 pair explicitly).
 */
import { describe, expect, it } from 'vitest';
import { EXERCISE_LIBRARY, getExerciseFormCues } from '@/lib/exercise-library';
import { en } from '@/lib/i18n/en';
import { hi } from '@/lib/i18n/hi';

const DEVANAGARI = /[\u0900-\u097F]/;

describe('Hindi exercise how-to (SIM-P1-05 Round 5)', () => {
  it('covers every exercise that has English howTo, with matching step counts', () => {
    const withHowTo = EXERCISE_LIBRARY.filter((e) => e.howTo && e.howTo.length > 0);
    expect(withHowTo.length).toBe(20);
    for (const e of withHowTo) {
      expect(e.howToHi, `${e.id} missing howToHi`).toBeDefined();
      expect(e.howToHi!.length).toBe(e.howTo!.length);
    }
  });

  it('every Hindi step is non-empty, Devanagari, and not a copy of the English step', () => {
    const withHowTo = EXERCISE_LIBRARY.filter((e) => e.howTo && e.howTo.length > 0);
    for (const e of withHowTo) {
      e.howToHi!.forEach((step, i) => {
        expect(step.trim().length).toBeGreaterThan(10);
        expect(DEVANAGARI.test(step)).toBe(true);
        expect(step).not.toBe(e.howTo![i]);
      });
    }
  });

  it('getExerciseFormCues prefers Hindi in hi mode, English otherwise', () => {
    const hiCues = getExerciseFormCues('Barbell Bench Press', 'hi');
    expect(hiCues.length).toBe(3);
    expect(hiCues[0]).toContain('बार के ठीक नीचे');
    const enCues = getExerciseFormCues('Barbell Bench Press');
    expect(enCues[0]).toContain('Lie with eyes under the bar');
    const enExplicit = getExerciseFormCues('Barbell Bench Press', 'en');
    expect(enExplicit).toEqual(enCues);
    // An exercise WITHOUT howToHi falls back to English cues, never blanks.
    const fallback = getExerciseFormCues('Bicep Curls', 'hi');
    expect(fallback.length).toBeGreaterThan(0);
  });

  it('tabGuard keys exist in both dictionaries', () => {
    expect(en['tabGuard.message']).toContain('another tab');
    expect(en['tabGuard.useThisTab']).toBe('Use this tab instead');
    expect(hi['tabGuard.message']).toContain('दूसरे टैब');
    expect(hi['tabGuard.useThisTab']).toBe('इसी टैब का इस्तेमाल करें');
  });
});
