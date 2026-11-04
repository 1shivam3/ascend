import type { FoodItem } from './types';

/**
 * Certification F7 — meal-builder row rules, kept pure so they are
 * testable without rendering the LOG MEAL sheet.
 *
 * The builder always keeps a blank template row (FOOD 1) so the user
 * can type a food. Add paths that arrive from outside the sheet —
 * quick-add favorites, the page-level food search, barcode scans —
 * used to APPEND a new block, leaving the blank template in place.
 * The result priced invisibly: the sheet showed two blocks for what
 * the user saw as one item, and the blank row's own quantity input
 * sat first in DOM order, inviting quantity entry onto a row with no
 * food (functional round 1b-2, finding F7: a single 200 g paneer
 * displayed a 795 kcal total — the priced sum of two blocks).
 *
 * Rules:
 *  1. Adding a food fills the first blank row instead of appending
 *     past it; append only when no blank row exists.
 *  2. A blank row (no food chosen) never contributes quantity or
 *     totals — the builder's MEAL TOTAL is computed over named rows
 *     only.
 */

export function isBlankFoodRow(food: FoodItem): boolean {
  return !food.name || food.name.trim().length === 0;
}

export function addFoodToBuilderRows(rows: FoodItem[], item: FoodItem): FoodItem[] {
  const blankIndex = rows.findIndex(isBlankFoodRow);
  if (blankIndex === -1) return [...rows, item];
  const next = [...rows];
  next[blankIndex] = item;
  return next;
}

/** Rows that count toward the builder's displayed totals. */
export function builderCountableFoods(rows: FoodItem[]): FoodItem[] {
  return rows.filter((f) => !isBlankFoodRow(f));
}
