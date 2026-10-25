/**
 * Exact-vs-estimated display honesty (UX redesign live-fix L8).
 *
 * The meal list used to prefix EVERY number with "~" — even rows carrying
 * the green "Exact" chip for a verified database match — while meal totals
 * showed "~" with no Estimated label at all. That made an exact value read
 * as a guess and an estimated total read as precise.
 *
 * Single rule, used by every meal-number surface (food rows, meal headers,
 * day total, builder total, toasts):
 * - A food is exact iff it is neither unmatched nor an approximate (word-
 *   overlap fallback) match — i.e. exactly the condition that earns the
 *   green "Exact" chip.
 * - A total is exact iff it has at least one food AND every food is exact;
 *   otherwise it carries "~" and the UI adds an "Estimated" label.
 * - An empty list renders no prefix and no label (0 kcal is 0, not ~0).
 */

import type { FoodItem } from './types';

type Flaggable = Pick<FoodItem, 'isUnmatched' | 'isApproximateMatch'>;

/** True iff this food's values come from its own verified DB entry. */
export function isExactFoodItem(food: Flaggable): boolean {
  return !food.isUnmatched && !food.isApproximateMatch;
}

/** True iff the list is non-empty and every food is exact. */
export function foodsAllExact(foods: readonly Flaggable[]): boolean {
  return foods.length > 0 && foods.every(isExactFoodItem);
}

/**
 * The "~" prefix for a total over `foods`: "" when the total is exact,
 * "~" otherwise (including the empty list, where callers render 0 and
 * should suppress the label separately).
 */
export function tildeForFoods(foods: readonly Flaggable[]): '' | '~' {
  return foodsAllExact(foods) ? '' : '~';
}
