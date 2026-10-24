import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '@/lib/i18n/en';
import { hi } from '@/lib/i18n/hi';
import { translate } from '@/lib/i18n';
import { getAbsurdQuantityWarning } from '@/lib/macros';
import { EXERCISE_CATEGORY_KEYS } from '@/lib/strength-standards';
import { OIL_LEVEL_LABEL_KEYS } from '@/lib/oil-adjust';

/**
 * Persona-sim round 5 — Round 4 (SIM-P2-01 completed, SIM-P1-05 narrowed
 * further): the remaining literal toast calls are converted, the absurd
 * -quantity guard speaks Hindi, and the small label sets (strength
 * categories, oil levels) plus a Devanagari font fallback land.
 */

const toastKeys = (Object.keys(en) as string[]).filter((k) => k.startsWith('toast.'));
const paramsOf = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('Toast i18n coverage, complete (SIM-P2-01 Round 4)', () => {
  it('covers every toast key in Hindi with identical {param} tokens', () => {
    expect(toastKeys.length).toBeGreaterThanOrEqual(170);
    const missingInHi = toastKeys.filter((k) => !(k in hi));
    expect(missingInHi).toEqual([]);
    const mismatched = toastKeys.filter((k) => {
      const e = (en as Record<string, string>)[k];
      const h = (hi as Record<string, string>)[k];
      return typeof e === 'string' && typeof h === 'string'
        && JSON.stringify(paramsOf(e)) !== JSON.stringify(paramsOf(h));
    });
    expect(mismatched).toEqual([]);
  });

  it('keeps every new one/many pair distinct (no "1 items", no "{count}" in One)', () => {
    const pairs: Array<[string, string]> = [
      ['toast.frequentPinnedOne', 'toast.frequentPinnedMany'],
      ['toast.mealPinnedOne', 'toast.mealPinnedMany'],
      ['toast.yesterdayCopiedOne', 'toast.yesterdayCopiedMany'],
      ['toast.mealsCopiedOne', 'toast.mealsCopiedMany'],
      ['toast.lastSessionLoadedOne', 'toast.lastSessionLoadedMany'],
      ['toast.newPRsOne', 'toast.newPRsMany'],
      ['toast.workoutLoggedOne', 'toast.workoutLoggedMany'],
      ['toast.interruptedSavedOne', 'toast.interruptedSavedMany'],
    ];
    for (const [one, many] of pairs) {
      expect((en as Record<string, string>)[one]).not.toContain('{count}');
      expect((en as Record<string, string>)[many]).toContain('{count}');
      expect((hi as Record<string, string>)[one]).not.toContain('{count}');
      expect((hi as Record<string, string>)[many]).toContain('{count}');
    }
  });

  it('renders converted toasts in Hindi with params interpolated', () => {
    expect(translate('hi', 'toast.voiceListening')).toContain('सुन रहा हूं');
    expect(translate('hi', 'toast.restReady')).toContain('आराम का समय समाप्त');
    expect(translate('hi', 'toast.pressBackAgain')).toContain('Back दबाएं');
    expect(translate('hi', 'toast.voiceLogged', { exercise: 'Squat', sets: '70×8, 70×8' }))
      .toContain('Squat');
    expect(translate('hi', 'toast.targetsCalibrated',
      { bw: 80, goal: 'Build Muscle', kcal: 2800, protein: 160, carbs: 300, fat: 90 }))
      .toContain('2800');
  });

  it('leaves no literal toast message in the converted files', () => {
    const files = [
      'src/components/MealsPage.tsx',
      'src/components/WorkoutPage.tsx',
      'src/components/HomePage.tsx',
      'src/components/Onboarding.tsx',
      'src/components/BarcodeScannerModal.tsx',
      'src/components/FriendChallengesSection.tsx',
      'src/lib/navigation.tsx',
    ];
    const literalFirstArg = /toast\.(success|error|info|warning)\(\s*['"`]/;
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      expect(src).not.toMatch(literalFirstArg);
    }
  });
});

describe('Absurd-quantity guard speaks Hindi (SIM-P2-01 Round 4)', () => {
  it('returns a key + params instead of an English string', () => {
    const w = getAbsurdQuantityWarning({ name: 'Roti', calories: 12000, quantity: 100, unit: 'piece' });
    expect(w).not.toBeNull();
    expect(w!.key).toBe('toast.absurdCalories');
    expect(translate('hi', w!.key, w!.params)).toContain('Roti');
    expect(translate('hi', w!.key, w!.params)).not.toContain('looks wrong');
    const pieces = getAbsurdQuantityWarning({ name: 'Roti', calories: 240, quantity: 100, unit: 'piece' });
    expect(pieces!.key).toBe('toast.absurdPieces');
    expect(getAbsurdQuantityWarning({ name: 'Roti', calories: 240, quantity: 2, unit: 'piece' })).toBeNull();
  });
});

describe('Small label sets in Hindi (SIM-P1-05 Round 4)', () => {
  it('maps every rendered strength category and oil level to a bilingual key', () => {
    for (const cat of ['Barbell Compounds', 'Dumbbell', 'Bodyweight', 'Cable', 'Machine']) {
      const key = EXERCISE_CATEGORY_KEYS[cat];
      expect(key).toBeDefined();
      expect((hi as Record<string, string>)[key]).toBeTruthy();
      expect((hi as Record<string, string>)[key]).not.toBe((en as Record<string, string>)[key]);
    }
    for (const id of ['none', 'tsp', 'tbsp', 'tbsp2'] as const) {
      const key = OIL_LEVEL_LABEL_KEYS[id];
      expect((hi as Record<string, string>)[key]).toBeTruthy();
    }
    expect(translate('hi', 'cat.barbellCompounds')).toBe('बारबेल कंपाउंड');
    expect(translate('hi', 'oil.levelTbsp')).toBe('1 बड़ा चम्मच');
  });
});
