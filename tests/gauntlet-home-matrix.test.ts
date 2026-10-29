import { describe, it, expect } from 'vitest';
import { getDaySummary, type MatrixInputs } from '../src/lib/home-matrix';
import { calculateMealMacros } from '../src/lib/macros';
import type { FoodItem, MealEntry } from '../src/lib/types';

/**
 * Gauntlet DI-04: home-matrix day totals used to sum raw food fields,
 * skipping the Atwater reconciliation calculateMealMacros applies
 * (0-kcal food with macros present → 4*P + 4*C + 9*F). Fuel/Home day
 * totals call calculateMealMacros over the flat food list, so the
 * matrix must agree with them exactly.
 */
const baseInputs = (meals: MealEntry[]): MatrixInputs => ({
  workouts: [],
  meals,
  waterLogs: {},
  creatineLogs: {},
  waterTargetMl: 2500,
  proteinTargetG: 100,
  showCreatine: false,
});

const meal = (id: string, foods: FoodItem[]): MealEntry => ({
  id,
  date: '2026-10-20',
  name: 'Lunch',
  foods,
});

describe('gauntlet DI-04: home-matrix totals use Atwater reconciliation', () => {
  it('a 0-kcal food with macros contributes Atwater calories, matching calculateMealMacros', () => {
    const foods: FoodItem[] = [
      { name: 'Mystery item', calories: 0, proteinG: 10, carbsG: 20, fatG: 5 },
    ];
    const summary = getDaySummary('2026-10-20', baseInputs([meal('m1', foods)]));
    const expected = calculateMealMacros(foods);
    expect(summary.macros.calories).toBe(expected.calories);
    expect(summary.macros.calories).toBe(4 * 10 + 4 * 20 + 9 * 5);
    expect(summary.macros.proteinG).toBe(expected.proteinG);
  });

  it('the protein habit value equals the reconciled day protein', () => {
    const meals = [
      meal('m1', [{ name: 'Dal', calories: 0, proteinG: 90, carbsG: 0, fatG: 0 }]),
    ];
    const summary = getDaySummary('2026-10-20', baseInputs(meals));
    const proteinHabit = summary.habits.find((h) => h.id === 'protein')!;
    expect(proteinHabit.value).toBe(summary.macros.proteinG);
    expect(proteinHabit.done).toBe(true); // 90 >= 100 * 0.85
  });

  it('an empty day stays zero, never reconciled into phantom calories', () => {
    const summary = getDaySummary('2026-10-20', baseInputs([]));
    expect(summary.macros).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    expect(summary.empty).toBe(true);
  });
});
