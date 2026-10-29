/**
 * Scan-meal result sanitization (gauntlet SEC-14).
 *
 * The scan-meal route used to trust model-reported totals whenever
 * present (`parsed.totalCalories || calculatedTotalCalories`) and
 * never range-checked per-item values — a single item could report
 * 10^9 kcal and land in the user's log. Totals are now ALWAYS
 * recomputed from the validated items (as parse-meal already does),
 * and per-item values are clamped to sane maxima. Model totals are
 * ignored outright, not averaged in.
 *
 * Pure functions, unit-tested. The route still requires the user to
 * review/edit before saving (ScanMealModal), so this is defense in
 * depth on top of that review step.
 */

export const MAX_ITEM_CALORIES = 5000;
export const MAX_ITEM_MACRO_G = 1000;
export const MAX_ITEM_GRAMS = 10000;

export interface SanitizedScannedItem {
  name: string;
  quantity: string;
  estimatedGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: 'high' | 'medium' | 'low';
  preparation?: string;
  notes?: string;
}

function clampNum(value: unknown, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(max, n);
}

function clampMacro(value: unknown): number {
  return Number(clampNum(value, MAX_ITEM_MACRO_G, 0).toFixed(1));
}

export function sanitizeScannedItems(items: unknown): SanitizedScannedItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw: any) => {
    const it = raw && typeof raw === 'object' ? raw : {};
    const estimatedGrams = clampNum(it.estimatedGrams, MAX_ITEM_GRAMS, 100);
    return {
      name: String(it.name || 'Food Item').slice(0, 200),
      quantity: String(it.quantity || `${estimatedGrams}g`).slice(0, 100),
      estimatedGrams,
      calories: Math.round(clampNum(it.calories, MAX_ITEM_CALORIES, 0)),
      proteinG: clampMacro(it.proteinG),
      carbsG: clampMacro(it.carbsG),
      fatG: clampMacro(it.fatG),
      confidence: (['high', 'medium', 'low'].includes(it.confidence)
        ? it.confidence
        : 'high') as 'high' | 'medium' | 'low',
      preparation:
        typeof it.preparation === 'string' ? it.preparation.slice(0, 200) : undefined,
      notes: typeof it.notes === 'string' ? it.notes.slice(0, 500) : undefined,
    };
  });
}

export interface RecomputedMealTotals {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}

/** Totals derived ONLY from sanitized items — model totals are never an input. */
export function recomputeMealTotals(items: SanitizedScannedItem[]): RecomputedMealTotals {
  const sum = (field: 'calories' | 'proteinG' | 'carbsG' | 'fatG'): number =>
    items.reduce((acc, it) => acc + (Number(it[field]) || 0), 0);
  return {
    totalCalories: Math.round(sum('calories')),
    totalProtein: Number(sum('proteinG').toFixed(1)),
    totalCarbs: Number(sum('carbsG').toFixed(1)),
    totalFat: Number(sum('fatG').toFixed(1)),
  };
}
