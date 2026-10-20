import type { OilLevelId } from './types';
import { resolveIndianMeta, getHouseholdUnitGrams } from './indian-foods';

/**
 * Ghee/oil honesty adjustment.
 *
 * Photo AI (and most recipe databases) systematically undercount Indian
 * food because the fat is invisible — absorbed into the tadka, smeared
 * on the roti, finished with butter. The fix is one honest question:
 * "Ghee/oil in this?" with four levels, adjusted against the amount the
 * database values already assume for the dish.
 *
 * Fat math (verified against the DB's ghee entry: 900 kcal/100g):
 * 1 tsp ghee ≈ 4.2 g, essentially all fat → ≈ 4 g fat ≈ 36 kcal.
 * 1 tbsp = 3 tsp ≈ 108 kcal. Kept Atwater-consistent (9 kcal/g fat) so
 * meal totals never drift from their macros.
 */
export const GHEE_TSP_FAT_G = 4;
export const GHEE_TSP_KCAL = 36;

export interface OilLevel {
  id: OilLevelId;
  label: string;
  tsp: number;
}

export const OIL_LEVELS: OilLevel[] = [
  { id: 'none', label: 'None', tsp: 0 },
  { id: 'tsp', label: '1 tsp', tsp: 1 },
  { id: 'tbsp', label: '1 tbsp', tsp: 3 },
  { id: 'tbsp2', label: '2 tbsp', tsp: 6 },
];

export function tspForOilLevel(id: OilLevelId | undefined): number {
  return OIL_LEVELS.find((l) => l.id === id)?.tsp ?? 0;
}

/** Closest selector level for an assumed tsp amount (ties round up). */
export function oilLevelForTsp(tsp: number): OilLevelId {
  let best: OilLevel = OIL_LEVELS[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const level of OIL_LEVELS) {
    const d = Math.abs(level.tsp - tsp);
    if (d < bestDist || (d === bestDist && level.tsp > best.tsp)) {
      best = level;
      bestDist = d;
    }
  }
  return best.id;
}

export interface MacroSnapshot {
  calories: number;
  fatG: number;
}

/**
 * Adjust calories/fat when the oil amount moves from `fromTsp` to
 * `toTsp`. Pure delta math — the rest of the dish is untouched, and the
 * result can never go below zero fat.
 */
export function applyOilDelta<T extends MacroSnapshot>(
  item: T,
  fromTsp: number,
  toTsp: number
): T {
  const deltaTsp = toTsp - fromTsp;
  if (deltaTsp === 0) return item;
  const fat = Math.max(0, item.fatG + deltaTsp * GHEE_TSP_FAT_G);
  const fatApplied = fat - item.fatG;
  return {
    ...item,
    fatG: Number(fat.toFixed(1)),
    calories: Math.max(0, Math.round(item.calories + fatApplied * 9)),
  };
}

/**
 * How many standard servings an item represents, for oil math. The DB
 * assumption (assumedOilTsp) is per standard serving — the dish's first
 * household unit (1 katori / 1 piece / 1 plate). A 2-katori portion
 * carries twice the assumed oil, so the selector delta must scale with
 * it; applying a single-serving delta to a multi-serving row left half
 * the assumed oil in place when the user picked "None" (R3 finding).
 * Falls back to 1 whenever the portion can't be resolved.
 */
export function servingsForOil(
  name: string | undefined,
  quantity?: number,
  unit?: string,
  grams?: number
): number {
  if (!name) return 1;
  const resolved = resolveIndianMeta(name);
  if (!resolved) return 1;
  const standard = resolved.meta.units[0]?.grams;
  if (!standard || standard <= 0) return 1;

  let totalGrams = grams;
  if ((totalGrams === undefined || !(totalGrams > 0)) && quantity && quantity > 0 && unit) {
    const perUnit =
      getHouseholdUnitGrams(name, unit) ??
      (unit === 'g' || unit === 'ml'
        ? 1
        : unit === 'kg' || unit === 'l'
          ? 1000
          : undefined);
    if (perUnit) totalGrams = quantity * perUnit;
  }
  if (!totalGrams || totalGrams <= 0) return 1;
  const servings = totalGrams / standard;
  return servings > 0 ? servings : 1;
}

/**
 * Set an item's oil level, adjusting its macros relative to where they
 * currently stand. The baseline is the item's current level if one is
 * set, otherwise the DB assumption stored on the item. The delta is
 * scaled by the number of servings in the row (see servingsForOil).
 */
export function withOilLevel<
  T extends MacroSnapshot & {
    oilLevel?: OilLevelId;
    oilAssumedTsp?: number;
    name?: string;
    quantity?: number;
    unit?: string;
  }
>(item: T, level: OilLevelId): T {
  const fromTsp =
    item.oilLevel !== undefined
      ? tspForOilLevel(item.oilLevel)
      : item.oilAssumedTsp ?? 0;
  const servings = servingsForOil(item.name, item.quantity, item.unit);
  const adjusted = applyOilDelta(
    item,
    fromTsp * servings,
    tspForOilLevel(level) * servings
  );
  return { ...adjusted, oilLevel: level };
}

/**
 * The default oil state for a dish name, or null when the ghee question
 * doesn't apply (not a curated Indian dish, or oil isn't a user choice
 * for it — e.g. steamed idli, deep-fried bhatura).
 */
export function defaultOilForFood(
  name: string
): { assumedTsp: number; level: OilLevelId } | null {
  const resolved = resolveIndianMeta(name);
  if (!resolved || !resolved.meta.oilRelevant) return null;
  return {
    assumedTsp: resolved.meta.assumedOilTsp,
    level: oilLevelForTsp(resolved.meta.assumedOilTsp),
  };
}
