/**
 * M1 (bug program Phase 3) — scanned-item macro verification.
 *
 * The rule: a scanned item's macros come from the app's verified
 * food database (FOOD_DB via estimateMacros), never from the vision
 * model's own numbers. The model is good at WHAT and HOW MUCH (name
 * + grams); it is not a nutrition database — the gym-video scan
 * priced 200 g of pineapple at 136 kcal where the app's own table
 * says 100 kcal, and presented it as fact.
 *
 * Outcomes per item:
 *  - Exact DB match → macros REPLACED by the DB values for the
 *    item's grams; `verified: true`, `macroSource: 'database'`.
 *  - Word-overlap (approximate) match → macros taken from the
 *    matched DB entry (a better estimate than the model's), but
 *    `verified: false` and `matchedEntry` records which entry
 *    supplied them — the food may not be the food.
 *  - No DB match → the model's numbers stay as an ESTIMATE,
 *    `verified: false`, `macroSource: 'model'`. The review shows
 *    "Not verified" and the item must be edited or explicitly
 *    confirmed before the meal can be saved.
 *  - Items the user edited by hand (`macroSource: 'user'`) keep the
 *    user's numbers untouched — the user IS the source then.
 *
 * Applied in the scan-meal route (server), in the client's
 * recalculateMealResult (edits/refines), and when the review modal
 * ingests any result, so no path can resurrect model numbers.
 */
import { estimateMacros } from './macros';
import type { ScannedFoodItem } from './types';

/** The structural minimum this module needs — satisfied by both
 * ScannedFoodItem and the route's SanitizedScannedItem. */
export interface ScanItemLike {
  name: string;
  estimatedGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  verified?: boolean;
  macroSource?: 'database' | 'model' | 'user';
  userConfirmed?: boolean;
  matchedEntry?: string;
}

export function verifyScanItem<T extends ScanItemLike>(item: T): T {
  if (item.macroSource === 'user') {
    return { ...item, verified: true };
  }
  const grams = item.estimatedGrams > 0 ? item.estimatedGrams : 100;
  const est = estimateMacros(item.name, grams, 'g');
  if (!est.isUnmatched && !est.isApproximateMatch) {
    return {
      ...item,
      calories: est.calories,
      proteinG: est.proteinG,
      carbsG: est.carbsG,
      fatG: est.fatG,
      verified: true,
      macroSource: 'database' as const,
      matchedEntry: undefined,
    };
  }
  if (!est.isUnmatched && est.isApproximateMatch) {
    return {
      ...item,
      calories: est.calories,
      proteinG: est.proteinG,
      carbsG: est.carbsG,
      fatG: est.fatG,
      verified: false,
      macroSource: 'database' as const,
      matchedEntry: est.matchedEntry,
    };
  }
  return {
    ...item,
    verified: false,
    macroSource: 'model' as const,
    matchedEntry: undefined,
  };
}

export function applyDatabaseMacros<T extends ScanItemLike>(items: T[]): T[] {
  return items.map((item) => verifyScanItem(item));
}

/** True when an item still needs the user's confirmation to save. */
export function itemNeedsConfirmation(item: ScanItemLike): boolean {
  return item.verified !== true && !item.userConfirmed;
}

export type { ScannedFoodItem };
