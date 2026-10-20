import type { OilLevelId } from './types';
import { resolveIndianMeta } from './indian-foods';

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
 * Set an item's oil level, adjusting its macros relative to where they
 * currently stand. The baseline is the item's current level if one is
 * set, otherwise the DB assumption stored on the item.
 */
export function withOilLevel<
  T extends MacroSnapshot & { oilLevel?: OilLevelId; oilAssumedTsp?: number }
>(item: T, level: OilLevelId): T {
  const fromTsp =
    item.oilLevel !== undefined
      ? tspForOilLevel(item.oilLevel)
      : item.oilAssumedTsp ?? 0;
  const adjusted = applyOilDelta(item, fromTsp, tspForOilLevel(level));
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
