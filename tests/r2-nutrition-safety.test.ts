import { describe, it, expect } from 'vitest';
import {
  calculateRecommendedMacroGoals,
  calculateMaintenanceCalories,
  getSafeMinCalories,
  scaleMacroGoalsToCalories,
  validateMealFoods,
  calculateMealMacros,
} from '../src/lib/macros';
import { FoodItem, MacroGoals } from '../src/lib/types';

/**
 * Round-2 persona regressions (Meera / Priya):
 * one calorie floor everywhere, never a surplus labelled as fat loss,
 * no deficit for minors, coach Apply keeps goals Atwater-consistent,
 * and every NL meal-logging door shares the same guards.
 */
describe('R2 calorie floor — single source of truth', () => {
  it('exposes gendered floors', () => {
    expect(getSafeMinCalories('male')).toBe(1500);
    expect(getSafeMinCalories('female')).toBe(1200);
    expect(getSafeMinCalories('other')).toBe(1400);
  });

  it('MEERA-4: small sedentary athlete is never prescribed a surplus as "fat loss"', () => {
    // 50 kg / 150 cm / 45 y / sedentary female → maintenance ≈ 1,262 kcal.
    const goals = calculateRecommendedMacroGoals(50, 'lose_fat', 'female', 150, 45, 'sedentary');
    expect(goals.maintenanceCalories).toBeLessThan(1400);
    expect(goals.calories).toBeLessThan(goals.maintenanceCalories!);
    expect(goals.calorieDelta).toBeLessThan(0);
    expect(goals.calories).toBeGreaterThanOrEqual(getSafeMinCalories('female'));
  });

  it('prescription never drops below the gendered floor', () => {
    const male = calculateRecommendedMacroGoals(60, 'lose_fat', 'male', 165, 30, 'sedentary');
    expect(male.calories).toBeGreaterThanOrEqual(1500);
    const female = calculateRecommendedMacroGoals(80, 'lose_fat', 'female', 170, 30, 'light');
    expect(female.calories).toBeGreaterThanOrEqual(1200);
  });

  it('ARYAN-1: minors are never prescribed a deficit', () => {
    const teen = calculateRecommendedMacroGoals(55, 'lose_fat', 'male', 165, 16, 'light');
    // Atwater reconciliation can drift a couple of kcal — the point is
    // maintenance, not a deficit (adult Rx for the same stats is −450).
    expect(Math.abs(teen.calorieDelta!)).toBeLessThanOrEqual(5);
    expect(teen.calories).toBeLessThanOrEqual(teen.maintenanceCalories! + 5);
  });

  it('ARYAN-2: a 13-year-old is BMR-costed at 13, not silently as 25', () => {
    const at13 = calculateMaintenanceCalories(50, 'male', 160, 13, 'light');
    const at25 = calculateMaintenanceCalories(50, 'male', 160, 25, 'light');
    expect(at13).toBeGreaterThan(at25);
  });
});

describe('R2 PRIYA-3 — applying a coach calorie suggestion rescales everything', () => {
  const current: MacroGoals = {
    calories: 2000,
    proteinG: 150,
    carbsG: 200,
    fatG: 67,
    maintenanceCalories: 2450,
    calorieDelta: -450,
  };

  it('keeps goals Atwater-exact and recomputes the delta', () => {
    const next = scaleMacroGoalsToCalories(current, 1900);
    expect(next.proteinG).toBe(150); // protein is bodyweight-driven — preserved
    expect(next.calories).toBe(next.proteinG! * 4 + next.carbsG! * 4 + next.fatG! * 9);
    expect(Math.abs(next.calories - 1900)).toBeLessThanOrEqual(5);
    expect(next.maintenanceCalories).toBe(2450);
    expect(next.calorieDelta).toBe(next.calories - 2450);
  });

  it('handles a target below protein calories without NaNs', () => {
    const next = scaleMacroGoalsToCalories(current, 400);
    expect(Number.isFinite(next.calories)).toBe(true);
    expect(next.calories).toBeGreaterThan(0);
  });
});

describe('R2 PRIYA-1 — shared meal guards (validateMealFoods)', () => {
  const roti: FoodItem = { name: 'Roti', calories: 120, proteinG: 3, carbsG: 24, fatG: 1 };
  const mystery: FoodItem = {
    name: 'Pizza Slice',
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    isUnmatched: true,
  };

  it('flags a mixed parse with an unmatched item', () => {
    const v = validateMealFoods([roti, mystery]);
    expect(v.junk).toBe(false);
    expect(v.unmatchedNames).toEqual(['Pizza Slice']);
  });

  it('flags an all-unmatched parse as junk', () => {
    const v = validateMealFoods([mystery]);
    expect(v.junk).toBe(true);
  });

  it('flags absurd quantities', () => {
    // "100 rotis" as the parser emits it: 100 pieces, calories scaled.
    const feast: FoodItem = { ...roti, quantity: 100, unit: 'piece', calories: 11880 };
    const v = validateMealFoods([feast]);
    expect(v.absurdWarning).not.toBeNull();
  });

  it('clean parse passes all guards', () => {
    const v = validateMealFoods([roti]);
    expect(v.junk).toBe(false);
    expect(v.unmatchedNames).toEqual([]);
    expect(v.absurdWarning).toBeNull();
  });
});

describe('R2 MEERA-5 — sugar totals are honest about unknowns', () => {
  it('sums sugar only from items that carry it', () => {
    const totals = calculateMealMacros([
      { name: 'Cola', calories: 140, proteinG: 0, carbsG: 39, fatG: 0, sugarG: 39 },
      { name: 'Roti', calories: 120, proteinG: 3, carbsG: 24, fatG: 1 },
    ]);
    expect(totals.sugarG).toBe(39);
  });

  it('leaves sugar undefined when no item carries data (never fabricates zero)', () => {
    const totals = calculateMealMacros([
      { name: 'Roti', calories: 120, proteinG: 3, carbsG: 24, fatG: 1 },
    ]);
    expect(totals.sugarG).toBeUndefined();
  });
});
