/**
 * Scan confidence, computed — never self-reported (UI/UX audit P0-4).
 *
 * The vision model used to grade its own homework: the scan-meal
 * route passed the model's `confidence` field straight to the UI
 * (defaulting to "high" when absent), and every detected item in the
 * audit recording showed HIGH CONFIDENCE — including a mislabeled
 * one. A model's self-assessment is not checkable, so it is no
 * longer displayed anywhere. Displayed confidence is computed here
 * from signals the app can verify itself:
 *
 *  (a) DB match — the item's name resolves to a known food in the
 *      local database (estimateMacros). A loose word-overlap match
 *      (a different food supplied the values) can never support High.
 *  (b) Portion plausibility — grams inside an absolute band for a
 *      single plate item, energy density physically possible, and
 *      the stated macros agreeing with the stated calories (Atwater
 *      4/4/9) and with the matched DB entry's density.
 *  (c) Item-set consistency — the result looks like distinct items
 *      on a plate, not one dish deconstructed into ingredients:
 *      1–5 items, no duplicate foods (alias-aware), and no bare
 *      raw-ingredient items (ghee/oil/sugar…) the user did not flag
 *      as hidden ingredients.
 *  (d) User verification — an item the user edited (or added by
 *      hand) is re-scored over the user's own values instead of the
 *      model's. The flag is surfaced in the signals for honesty; it
 *      never inflates a level by itself.
 *
 * Levels: High only when (a) is a real match, (b) fully passes and
 * (c) passes. Low when the food is unknown to the DB or the portion
 * is physically implausible. Everything else is Medium. The meal
 * level is the weakest item's level, dropped to Low when the item
 * set itself is inconsistent.
 *
 * Pure functions, unit-tested (tests/scan-trust.test.ts). Used by
 * the scan-meal route (stamps the response) and by ScanMealModal
 * (recomputes live, so edits re-score immediately).
 */
import { estimateMacros, getMacroCalorieDrift } from './macros';
import { foodIdentityKey } from './food-aliases';

export type ScanConfidenceLevel = 'high' | 'medium' | 'low';

export interface ScanItemLike {
  name: string;
  estimatedGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface ItemConfidenceSignals {
  dbMatch: boolean;
  dbApproximate: boolean;
  portionPlausible: boolean;
  numbersConsistent: boolean;
  itemSetConsistent: boolean;
  userVerified: boolean;
}

export interface ItemConfidence {
  level: ScanConfidenceLevel;
  signals: ItemConfidenceSignals;
}

/** Bare ingredients that indicate a deconstructed dish when the user
 *  did not flag them as hidden ingredients (prompt rule 1/2). */
const RAW_INGREDIENT_IDENTITIES = new Set([
  'ghee',
  'cooking oil',
  'vegetable oil',
  'oil',
  'sugar',
  'butter',
  'salt',
]);

const MAX_PLAUSIBLE_GRAMS = 1500;
const MAX_ENERGY_DENSITY_PER_100G = 950; // pure fat is ~900

export function assessItemSetConsistent(
  items: ScanItemLike[],
  hiddenIngredients?: string[]
): boolean {
  if (items.length === 0 || items.length > 5) return false;

  const seen = new Set<string>();
  for (const item of items) {
    const identity = foodIdentityKey(item.name);
    if (seen.has(identity)) return false; // same food listed twice
    seen.add(identity);
  }

  const userFlagged = (hiddenIngredients?.length ?? 0) > 0;
  if (!userFlagged) {
    for (const item of items) {
      if (RAW_INGREDIENT_IDENTITIES.has(foodIdentityKey(item.name))) {
        return false; // raw ingredient leaked in as its own item
      }
    }
  }

  return true;
}

export function computeItemConfidence(
  item: ScanItemLike,
  ctx: { itemSetConsistent: boolean; userVerified?: boolean }
): ItemConfidence {
  const grams = Number(item.estimatedGrams) || 0;
  const est = estimateMacros(item.name, grams > 0 ? grams : 100, 'g');
  const dbMatch = !est.isUnmatched;
  const dbApproximate = dbMatch && !!est.isApproximateMatch;

  // (b) hard plausibility: band + physically possible density.
  let portionPlausible = grams >= 1 && grams <= MAX_PLAUSIBLE_GRAMS;
  const density = grams > 0 ? (item.calories / grams) * 100 : 0;
  if (density > MAX_ENERGY_DENSITY_PER_100G) portionPlausible = false;

  // (b) soft consistency: macros must agree with calories (Atwater),
  // and with the matched DB entry's energy density when there is one.
  let numbersConsistent = true;
  const drift = Math.abs(
    getMacroCalorieDrift(item.calories, item.proteinG, item.carbsG, item.fatG)
  );
  if (drift > Math.max(30, item.calories * 0.25)) numbersConsistent = false;
  if (dbMatch && !dbApproximate && grams > 0 && est.calories > 0) {
    const dbDensity = (est.calories / grams) * 100;
    if (dbDensity > 0) {
      const ratio = density / dbDensity;
      if (ratio < 0.35 || ratio > 3) numbersConsistent = false;
    }
  }

  const signals: ItemConfidenceSignals = {
    dbMatch,
    dbApproximate,
    portionPlausible,
    numbersConsistent,
    itemSetConsistent: ctx.itemSetConsistent,
    userVerified: !!ctx.userVerified,
  };

  let level: ScanConfidenceLevel;
  if (!dbMatch || !portionPlausible) {
    level = 'low';
  } else if (
    !dbApproximate &&
    numbersConsistent &&
    ctx.itemSetConsistent
  ) {
    level = 'high';
  } else {
    level = 'medium';
  }

  return { level, signals };
}

export interface MealConfidence {
  level: ScanConfidenceLevel;
  perItem: ItemConfidence[];
  itemSetConsistent: boolean;
}

export function computeMealConfidence(
  items: ScanItemLike[],
  ctx?: { hiddenIngredients?: string[]; editedIndices?: ReadonlySet<number> }
): MealConfidence {
  const itemSetConsistent = assessItemSetConsistent(items, ctx?.hiddenIngredients);
  const perItem = items.map((item, idx) =>
    computeItemConfidence(item, {
      itemSetConsistent,
      userVerified: ctx?.editedIndices?.has(idx) ?? false,
    })
  );

  if (items.length === 0) {
    return { level: 'low', perItem, itemSetConsistent };
  }

  let level: ScanConfidenceLevel = 'high';
  for (const item of perItem) {
    if (item.level === 'low') {
      level = 'low';
      break;
    }
    if (item.level === 'medium') level = 'medium';
  }
  // A meal whose item set is itself untrustworthy (duplicates,
  // deconstruction, too many items) is Low as a meal even when each
  // item individually matched something.
  if (!itemSetConsistent) level = 'low';

  return { level, perItem, itemSetConsistent };
}

/**
 * Route-side stamping: overwrite every model-supplied confidence
 * value (items + meal) with the computed ones, so no consumer of the
 * API response can ever surface the model's self-assessment.
 */
export function stampScanConfidence<T extends ScanItemLike & { confidence: ScanConfidenceLevel }>(
  items: T[],
  hiddenIngredients?: string[]
): { items: T[]; mealConfidence: ScanConfidenceLevel } {
  const meal = computeMealConfidence(items, { hiddenIngredients });
  return {
    items: items.map((item, idx) => ({ ...item, confidence: meal.perItem[idx].level })),
    mealConfidence: meal.level,
  };
}
