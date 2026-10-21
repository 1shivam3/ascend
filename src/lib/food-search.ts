import type { CustomFood } from './types';
import { getFoodSuggestions } from './macros';
import { expandFoodQuery } from './devanagari';

/**
 * Unified food search for the meal builder.
 *
 * The user's own versions ("my dal, my way") always come first — that is
 * the household-recipe moat: once a family teaches the app how their dal
 * is made, it should never lose to the generic database entry again.
 */
export interface FoodSearchResult {
  kind: 'custom' | 'db';
  /** Display name (also the name written onto the FoodItem). */
  name: string;
  customFood?: CustomFood;
}

export function searchFoods(
  query: string,
  customFoods: CustomFood[],
  limit = 6
): FoodSearchResult[] {
  if (!query || query.trim().length < 1) return [];
  // QA4-029: match custom foods against every Latin expansion of a
  // Devanagari query (दाल → dal), not just the raw script.
  const queryVariants = expandFoodQuery(query);

  const customMatches: FoodSearchResult[] = (customFoods || [])
    .filter((f) => queryVariants.some((q) => f.name.toLowerCase().includes(q)))
    .slice(0, 3)
    .map((f) => ({ kind: 'custom' as const, name: f.name, customFood: f }));

  const seen = new Set(customMatches.map((r) => r.name.toLowerCase()));
  const dbResults: FoodSearchResult[] = getFoodSuggestions(query)
    .filter((name) => !seen.has(name.toLowerCase()))
    .slice(0, Math.max(0, limit - customMatches.length))
    .map((name) => ({ kind: 'db' as const, name }));

  return [...customMatches, ...dbResults];
}
