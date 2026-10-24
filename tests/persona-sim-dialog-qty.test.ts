/**
 * DIALOG QUANTITY-CHANGE BUG — live-reproduced twice on the i09i2i0cm
 * preview (guest mode), and consistent with two earlier observations.
 *
 * Live repro: Fuel > Add Manually > tap the "Chicken Breast" suggestion.
 * The dialog sets 100 g with CORRECT library values (165 kcal / 31 g /
 * 0 g / 3.6 g). Change the quantity to 150 g and the line flips to
 * ~300 kcal / 45 g / 0 g / 0 g — and the Meal Total follows it.
 *
 * ROOT CAUSE (proven here, not assumed): the quantity input is a
 * controlled input, so typing "150" over "100" fires one change per
 * keystroke: 100 -> 1 -> 15 -> 150. The old quantity branch re-scaled
 * the ALREADY-ROUNDED display values at every keystroke, so rounding
 * error compounded: 165 -> 2 -> 30 -> 300 kcal, 31 -> 0.3 -> 4.5 -> 45 g
 * protein, 3.6 -> 0.0 -> 0 -> 0 g fat. The dialog never "lost" the
 * library selection (the name stayed matched, no banner — correctly);
 * it destroyed precision by re-scaling rounded values. The previous
 * round tested estimateMacros in isolation and wrongly concluded the
 * 45 g figure was unreproducible; the bug is in the dialog's state
 * handling, which these tests exercise directly through the helper the
 * dialog actually calls.
 *
 * FIX: when a row's current values are exactly what the estimator
 * produces for its previous quantity/unit (a "clean" row: selected
 * suggestion or fresh estimate, untouched since), a quantity change
 * recomputes from the canonical profile instead of scaling the rounded
 * display values — so every keystroke lands on the exact value. Rows
 * that carry user edits, scanned values, or saved custom foods are NOT
 * clean, so they keep proportional scaling (their edits survive).
 */
import { describe, it, expect } from 'vitest';
import {
  estimateMacros,
  calculateMealMacros,
  nextFoodItemOnQuantityChange,
} from '../src/lib/macros';
import type { FoodItem } from '../src/lib/types';

// Simulate one keystroke sequence through the dialog's quantity handler:
// each entry is one onChange firing (select-all + type "150" fires 1, 15, 150).
function typeQuantity(item: FoodItem, keystrokes: (number | undefined)[]): FoodItem {
  let current = item;
  for (const qty of keystrokes) {
    current = nextFoodItemOnQuantityChange(current, qty);
  }
  return current;
}

describe('dialog quantity-change bug (live repro, i09i2i0cm)', () => {
  it('suggestion state at 100 g carries the library values', () => {
    const at100 = estimateMacros('Chicken Breast', 100, 'g');
    expect(at100.calories).toBe(165);
    expect(at100.proteinG).toBe(31);
    expect(at100.carbsG).toBe(0);
    expect(at100.fatG).toBe(3.6);
    expect(at100.isUnmatched).toBe(false);
  });

  it('selecting the suggestion then typing 150 g scales the LIBRARY values', () => {
    const at100 = estimateMacros('Chicken Breast', 100, 'g');
    // Keystroke sequence for select-all + type "150" over "100".
    const at150 = typeQuantity(at100, [1, 15, 150]);
    expect(at150.quantity).toBe(150);
    expect(at150.calories).toBe(248);
    expect(at150.proteinG).toBe(46.5);
    expect(at150.carbsG).toBe(0);
    expect(at150.fatG).toBe(5.4);
    expect(at150.isUnmatched).toBe(false);
    // The Meal Total follows the line item.
    const total = calculateMealMacros([at150]);
    expect(total.calories).toBe(248);
    expect(total.proteinG).toBe(46.5);
    expect(total.fatG).toBe(5.4);
  });

  it('a direct 100 g -> 150 g jump also scales the library values', () => {
    const at100 = estimateMacros('Chicken Breast', 100, 'g');
    const at150 = nextFoodItemOnQuantityChange(at100, 150);
    expect(at150.calories).toBe(248);
    expect(at150.proteinG).toBe(46.5);
    expect(at150.fatG).toBe(5.4);
  });

  it('free-text "Chicken breast" typed then set to 150 g matches the library', () => {
    const blank: FoodItem = {
      name: 'Chicken breast',
      quantity: undefined,
      unit: 'g',
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    };
    // Typing the quantity into an empty field fires the same keystrokes.
    const at150 = typeQuantity(blank, [1, 15, 150]);
    expect(at150.calories).toBe(248);
    expect(at150.proteinG).toBe(46.5);
    expect(at150.carbsG).toBe(0);
    expect(at150.fatG).toBe(5.4);
    // The name matches the library, so no "not in DB" banner is correct.
    expect(at150.isUnmatched).toBe(false);
  });

  it('a manually edited row keeps its EDITED values through quantity changes', () => {
    const at100 = estimateMacros('Chicken Breast', 100, 'g');
    // User overrides protein to 40 g (manual macro edit).
    const edited: FoodItem = { ...at100, proteinG: 40 };
    const at150 = nextFoodItemOnQuantityChange(edited, 150);
    // Scales the edit (40 * 1.5 = 60), NOT the library 46.5.
    expect(at150.proteinG).toBe(60);
    expect(at150.calories).toBe(248);
    expect(at150.fatG).toBe(5.4);
  });

  it('a saved custom food keeps its custom values through quantity changes', () => {
    const custom: FoodItem = {
      name: 'My Chicken',
      quantity: 100,
      unit: 'g',
      calories: 200,
      proteinG: 25,
      carbsG: 2,
      fatG: 8,
      isUnmatched: false,
      customFoodId: 'cf-test-1',
    };
    const at150 = nextFoodItemOnQuantityChange(custom, 150);
    expect(at150.calories).toBe(300);
    expect(at150.proteinG).toBe(37.5);
    expect(at150.fatG).toBe(12);
    expect(at150.customFoodId).toBe('cf-test-1');
  });

  it('a genuinely unmatched name keeps its estimate AND the unmatched flag', () => {
    const blank: FoodItem = {
      name: 'Zzqx plorp',
      quantity: undefined,
      unit: 'g',
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    };
    const at150 = nextFoodItemOnQuantityChange(blank, 150);
    // No library entry: generic (zero) estimate, honestly flagged unmatched
    // so the dialog shows the "not in DB" banner instead of a fake value.
    expect(at150.isUnmatched).toBe(true);
    expect(at150.calories).toBe(0);
    // The flag survives further quantity edits.
    const at200 = nextFoodItemOnQuantityChange(at150, 200);
    expect(at200.isUnmatched).toBe(true);
  });

  it('user-entered macros on an unmatched row scale (not wiped) on quantity edits', () => {
    const unmatched: FoodItem = {
      name: 'Zzqx plorp',
      quantity: 100,
      unit: 'g',
      calories: 200,
      proteinG: 10,
      carbsG: 20,
      fatG: 5,
      isUnmatched: true,
    };
    // Proportional scaling preserves the entered per-unit ratio; the
    // unmatched flag survives so the banner still shows.
    const at150 = nextFoodItemOnQuantityChange(unmatched, 150);
    expect(at150.quantity).toBe(150);
    expect(at150.calories).toBe(300);
    expect(at150.proteinG).toBe(15);
    expect(at150.carbsG).toBe(30);
    expect(at150.fatG).toBe(7.5);
    expect(at150.isUnmatched).toBe(true);
  });
});
