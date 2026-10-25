import type { FoodItem } from './types';

/**
 * FND-03 — provenance rule for meal edits, kept pure so it is testable
 * without rendering the LOG MEAL form.
 *
 * An edited item whose name still matches an original item (case- and
 * whitespace-insensitive) keeps that original item's exact/estimated
 * provenance flags verbatim: a quantity/unit/macro edit must not flip
 * an estimate into an exact value or vice versa (the FND-10
 * inconsistency). Rows that match no original item — added during the
 * edit — keep whatever flags the form gave them.
 */
const PROVENANCE_KEYS = [
  'isUnmatched',
  'isApproximateMatch',
  'matchedEntry',
  'sourceRef',
  'customFoodId',
  'oilLevel',
  'oilAssumedTsp',
] as const;

export function mergeEditedMealFoods(
  cleanedFoods: FoodItem[],
  originalFoods: FoodItem[]
): FoodItem[] {
  return cleanedFoods.map((f) => {
    const original = originalFoods.find(
      (o) => o.name.trim().toLowerCase() === f.name.trim().toLowerCase()
    );
    if (!original) return f;
    const carried = {} as Partial<FoodItem>;
    for (const key of PROVENANCE_KEYS) {
      (carried as Record<string, unknown>)[key] = original[key];
    }
    return { ...f, ...carried };
  });
}
