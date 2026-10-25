import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '@/lib/store';
import { mergeEditedMealFoods } from '@/lib/meal-edit';
import type { FoodItem, MealEntry } from '@/lib/types';

// FND-03: meal correction edits in place — same id, same date, no
// duplicate row — and a quantity edit never flips an item's
// exact/estimated provenance flags.

const ORIGINAL: FoodItem[] = [
  {
    name: 'Dal',
    quantity: 1,
    unit: 'katori',
    calories: 100,
    proteinG: 5,
    carbsG: 15,
    fatG: 2,
    isApproximateMatch: true,
    matchedEntry: 'Masoor Dal',
  },
  {
    name: 'Rice',
    quantity: 1,
    unit: 'katori',
    calories: 200,
    proteinG: 4,
    carbsG: 44,
    fatG: 1,
  },
];

const MEAL: MealEntry = {
  id: 'meal-1',
  date: '2026-10-20',
  name: 'Lunch',
  foods: ORIGINAL,
};

beforeEach(() => {
  useStore.setState({ meals: [MEAL] } as never);
});

describe('updateMeal — edit in place', () => {
  it('quantity change updates totals, keeps id and date, adds no row', () => {
    const edited: FoodItem[] = [
      { ...ORIGINAL[0], quantity: 2, calories: 200, proteinG: 10, carbsG: 30, fatG: 4 },
      ORIGINAL[1],
    ];
    useStore.getState().updateMeal('meal-1', { foods: edited });
    const meals = useStore.getState().meals;
    expect(meals).toHaveLength(1);
    expect(meals[0].id).toBe('meal-1');
    expect(meals[0].date).toBe('2026-10-20');
    expect(meals[0].foods[0].quantity).toBe(2);
    expect(meals[0].foods[0].calories).toBe(200);
  });

  it('updating an unknown id changes nothing', () => {
    useStore.getState().updateMeal('meal-nope', { name: 'Ghost' });
    expect(useStore.getState().meals).toHaveLength(1);
    expect(useStore.getState().meals[0].name).toBe('Lunch');
  });
});

describe('mergeEditedMealFoods — provenance preserved', () => {
  it('a quantity edit keeps the original estimate flags verbatim', () => {
    const cleaned: FoodItem[] = [
      // Form row lost its flags (e.g. re-typed macros): the merge
      // restores the original estimate, it does not invent exactness.
      { name: 'dal', quantity: 2, unit: 'katori', calories: 200, proteinG: 10, carbsG: 30, fatG: 4 },
      ORIGINAL[1],
    ];
    const merged = mergeEditedMealFoods(cleaned, ORIGINAL);
    expect(merged[0].isApproximateMatch).toBe(true);
    expect(merged[0].matchedEntry).toBe('Masoor Dal');
    expect(merged[0].quantity).toBe(2);
    // The exact item stays exact: no estimate flags appear on it.
    expect(merged[1].isApproximateMatch).toBeUndefined();
    expect(merged[1].matchedEntry).toBeUndefined();
  });

  it('a row added during the edit keeps the flags the form gave it', () => {
    const cleaned: FoodItem[] = [
      ORIGINAL[0],
      {
        name: 'Paneer',
        quantity: 1,
        unit: 'g',
        calories: 250,
        proteinG: 18,
        carbsG: 3,
        fatG: 20,
        isUnmatched: true,
      },
    ];
    const merged = mergeEditedMealFoods(cleaned, ORIGINAL);
    expect(merged[1].isUnmatched).toBe(true);
  });
});
