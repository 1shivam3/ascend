/**
 * P0-2 regression: editing a scanned meal item's quantity/macros must never
 * drop the item (or any other item) from the analysis result.
 * Simulates the exact handleSaveItemEdit -> recalculateMealResult data flow.
 */
import { describe, it, expect } from 'vitest';
import { recalculateMealResult } from '@/lib/ai-scan-meal';
import { estimateMacros } from '@/lib/macros';
import type { MealAnalysisResult, ScannedFoodItem } from '@/lib/types';

function scannedMeal(): MealAnalysisResult {
  return {
    mealName: 'Lunch',
    items: [
      { name: 'Chicken Biryani', quantity: '300g', estimatedGrams: 300, calories: 450, proteinG: 25, carbsG: 55, fatG: 12, confidence: 'high' },
      { name: 'Raita', quantity: '100g', estimatedGrams: 100, calories: 60, proteinG: 3, carbsG: 5, fatG: 3, confidence: 'medium' },
    ],
    totalCalories: 510,
    totalProtein: 28,
    totalCarbs: 60,
    totalFat: 15,
    confidence: 'high',
  };
}

/** Mirrors handleSaveItemEdit's item replacement logic — including
 * the Phase 3 (M1) source marking: values that differ from the food
 * database's estimate for the name + grams are stamped
 * macroSource 'user' so the recalculation keeps them verbatim. */
function applyItemEdit(
  analysis: MealAnalysisResult,
  index: number,
  edit: { name: string; grams: number; calories: number; proteinG: number; carbsG: number; fatG: number }
): MealAnalysisResult {
  const itemsCopy = [...analysis.items];
  const target = itemsCopy[index];
  const finalName = edit.name.trim() || target.name;
  const finalGrams = edit.grams > 0 ? edit.grams : 100;
  const finalCalories = Math.max(0, Math.round(Number(edit.calories) || 0));
  const finalProtein = Math.max(0, Math.round((Number(edit.proteinG) || 0) * 10) / 10);
  const finalCarbs = Math.max(0, Math.round((Number(edit.carbsG) || 0) * 10) / 10);
  const finalFat = Math.max(0, Math.round((Number(edit.fatG) || 0) * 10) / 10);
  const dbEst = estimateMacros(finalName, finalGrams, 'g');
  const userSourced =
    Math.abs(finalCalories - dbEst.calories) > 1 ||
    Math.abs(finalProtein - dbEst.proteinG) > 0.15 ||
    Math.abs(finalCarbs - dbEst.carbsG) > 0.15 ||
    Math.abs(finalFat - dbEst.fatG) > 0.15;
  itemsCopy[index] = {
    ...target,
    name: finalName,
    estimatedGrams: finalGrams,
    quantity: `${finalGrams}g`,
    calories: finalCalories,
    proteinG: finalProtein,
    carbsG: finalCarbs,
    fatG: finalFat,
    macroSource: userSourced ? 'user' : undefined,
  };
  return recalculateMealResult(analysis, itemsCopy);
}

describe('P0-2: scanned meal item edit never drops items', () => {
  it('editing quantity keeps all items with updated values', () => {
    const before = scannedMeal();
    const after = applyItemEdit(before, 0, {
      name: 'Chicken Biryani', grams: 200, calories: 300, proteinG: 16.7, carbsG: 36.7, fatG: 8,
    });
    expect(after.items).toHaveLength(2);
    expect(after.items[0].name).toBe('Chicken Biryani');
    expect(after.items[0].estimatedGrams).toBe(200);
    // The edited values differ from the DB estimate (390 kcal), so
    // they are user-sourced and kept verbatim (M1).
    expect(after.items[0].calories).toBe(300);
    expect(after.items[1].name).toBe('Raita'); // untouched item survives
    // Phase 3 (M1): the untouched item is re-priced from the food
    // database — raita is 75 kcal/100 g there, not the fixture's 60 —
    // so the total is 300 + 75, not the old 360.
    expect(after.items[1].calories).toBe(75);
    expect(after.totalCalories).toBe(375);
  });

  it('editing the last item keeps the first item', () => {
    const before = scannedMeal();
    const after = applyItemEdit(before, 1, {
      name: 'Raita', grams: 150, calories: 90, proteinG: 4.5, carbsG: 7.5, fatG: 4.5,
    });
    expect(after.items).toHaveLength(2);
    expect(after.items[0].name).toBe('Chicken Biryani');
    expect(after.items[1].estimatedGrams).toBe(150);
  });

  it('renaming an item to empty keeps the original name (no blank/vanished row)', () => {
    const before = scannedMeal();
    const after = applyItemEdit(before, 0, {
      name: '   ', grams: 300, calories: 450, proteinG: 25, carbsG: 55, fatG: 12,
    });
    expect(after.items).toHaveLength(2);
    expect(after.items[0].name).toBe('Chicken Biryani');
  });

  it('zero/negative macro inputs clamp to 0 instead of producing NaN rows', () => {
    const before = scannedMeal();
    const after = applyItemEdit(before, 0, {
      name: 'Chicken Biryani', grams: 0, calories: -5, proteinG: NaN, carbsG: 55, fatG: 12,
    });
    expect(after.items).toHaveLength(2);
    expect(after.items[0].estimatedGrams).toBe(100); // fallback
    expect(Number.isNaN(after.items[0].proteinG)).toBe(false);
    expect(Number.isNaN(after.totalCalories)).toBe(false);
  });
});
