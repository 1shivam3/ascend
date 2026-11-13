/**
 * Phase 5 — §D2: NutritionPhase is DERIVED, once, from goal + age.
 *
 * Before: the type declared surplus/maintenance but the only
 * producer ever passed 'deficit' (lose_fat adults) or null, and
 * Fuel re-derived the same direction privately. Now
 * deriveNutritionPhase is the single rule: the store feeds it
 * to the block engine and Fuel's safety clamps are expressed
 * through it. These tests pin the table and prove Fuel's
 * calorie direction can never disagree with the phase.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveNutritionPhase } from '@/lib/nutrition-phase';
import { calculateRecommendedMacroGoals } from '@/lib/macros';
import type { AthleteGoal } from '@/lib/types';

const GOALS: AthleteGoal[] = ['build_muscle', 'get_stronger', 'lose_fat', 'stamina', 'general_fitness'];

describe('deriveNutritionPhase — goal mapping for adults', () => {
  it('maps each goal', () => {
    expect(deriveNutritionPhase('build_muscle', 30)).toBe('surplus');
    expect(deriveNutritionPhase('get_stronger', 30)).toBe('surplus');
    expect(deriveNutritionPhase('lose_fat', 30)).toBe('deficit');
    expect(deriveNutritionPhase('stamina', 30)).toBe('maintenance');
    expect(deriveNutritionPhase('general_fitness', 30)).toBe('maintenance');
    expect(deriveNutritionPhase(undefined, 30)).toBe('maintenance');
    expect(deriveNutritionPhase(null, 30)).toBe('maintenance');
  });
});

describe('deriveNutritionPhase — safety overrides beat the goal', () => {
  it('minors are maintenance-only for EVERY goal', () => {
    for (const goal of GOALS) {
      expect(deriveNutritionPhase(goal, 15)).toBe('maintenance');
      expect(deriveNutritionPhase(goal, 17)).toBe('maintenance');
      // Legacy/restored under-13 record: still never a deficit/surplus.
      expect(deriveNutritionPhase(goal, 10)).toBe('maintenance');
    }
  });

  it('unknown age is maintenance-only for EVERY goal', () => {
    for (const goal of GOALS) {
      expect(deriveNutritionPhase(goal, undefined)).toBe('maintenance');
      expect(deriveNutritionPhase(goal, null)).toBe('maintenance');
      expect(deriveNutritionPhase(goal, NaN)).toBe('maintenance');
      expect(deriveNutritionPhase(goal, 121)).toBe('maintenance');
    }
  });

  it('age 18 is an adult (goal mapping applies)', () => {
    expect(deriveNutritionPhase('lose_fat', 18)).toBe('deficit');
    expect(deriveNutritionPhase('build_muscle', 18)).toBe('surplus');
  });
});

describe('Fuel consistency — target direction always matches the phase', () => {
  const ages: (number | undefined)[] = [15, 30, undefined, 10, 121];
  for (const goal of GOALS) {
    for (const age of ages) {
      it(`${goal} @ age ${age ?? 'unknown'}`, () => {
        const phase = deriveNutritionPhase(goal, age);
        // Fuel's own direction signal: calorieDelta is the
        // Atwater-reconciled target minus maintenance, with the
        // ±10 kcal rounding band normalized to 0 — the same
        // number the Fuel UI explains to the user.
        const { calorieDelta } = calculateRecommendedMacroGoals(80, goal, 'male', 175, age);
        if (phase === 'surplus') expect(calorieDelta).toBeGreaterThan(0);
        else if (phase === 'deficit') expect(calorieDelta).toBeLessThan(0);
        else expect(calorieDelta).toBe(0);
      });
    }
  }
});

describe('wiring — both consumers use the one derivation', () => {
  it('store block proposals and Fuel clamps call deriveNutritionPhase', () => {
    const store = readFileSync(join(process.cwd(), 'src/lib/store.ts'), 'utf8');
    expect(store).toContain('deriveNutritionPhase(intake.goal, state.profile?.age)');
    const macros = readFileSync(join(process.cwd(), 'src/lib/macros.ts'), 'utf8');
    expect(macros).toContain("deriveNutritionPhase(goal, ageYears) === 'maintenance'");
  });
});
