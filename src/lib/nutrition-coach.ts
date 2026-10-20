import { FOOD_DB } from './macros';
import type { DietPreference, MacroGoals, MealDayKind } from './types';

/**
 * Nutrition coach — vegetarian protein guidance, whole-day adaptation,
 * and fast/festival day patterns.
 *
 * Design rules (user's customization philosophy):
 *  - Suggestions only. Nothing here ever mutates the user's saved goals.
 *  - One concrete suggestion, computed from real logged data, with real
 *    DB protein values — cooked dal in a katori is ~10 g protein, not
 *    the 24 g a dry-weight chart would claim.
 *  - Dismissible per day, behind the coachEnabled toggle in the UI.
 */

// ── Dismissal (per date + kind, localStorage) ─────────────────────────

const DISMISS_KEY = 'ascend_nutrition_hints_dismissed_v1';

function readDismissals(): Record<string, string[]> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(DISMISS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function isHintDismissed(date: string, kind: string): boolean {
  return (readDismissals()[date] || []).includes(kind);
}

export function dismissHint(date: string, kind: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const all = readDismissals();
    const kinds = new Set(all[date] || []);
    kinds.add(kind);
    all[date] = [...kinds];
    localStorage.setItem(DISMISS_KEY, JSON.stringify(all));
  } catch {
    /* storage full/blocked — dismissal just won't persist */
  }
}

// ── Vegetarian protein coach ──────────────────────────────────────────

export interface ProteinAnchor {
  /** Display name, e.g. "100 g paneer" */
  detail: string;
  proteinG: number;
}

interface AnchorDef {
  foodKey: string;
  grams: number;
  detail: string;
  diets: DietPreference[];
}

const VEG: DietPreference[] = ['vegetarian', 'eggitarian', 'vegan'];
const VEG_EGG: DietPreference[] = ['vegetarian', 'eggitarian'];
const EGG_ONLY: DietPreference[] = ['eggitarian'];

// Portions a person would actually eat, with protein taken from the
// food DB at that portion (never dry-chart numbers for cooked food).
const ANCHORS: AnchorDef[] = [
  { foodKey: 'paneer', grams: 100, detail: '100 g paneer', diets: VEG_EGG },
  { foodKey: 'soya chunks', grams: 30, detail: '30 g soya chunks (dry) tossed into a sabzi or curry', diets: VEG },
  { foodKey: 'greek yogurt', grams: 150, detail: '150 g Greek yogurt or hung curd', diets: VEG_EGG },
  { foodKey: 'milk', grams: 500, detail: '500 ml milk across the evening', diets: VEG_EGG },
  { foodKey: 'eggs', grams: 120, detail: '2 eggs', diets: EGG_ONLY },
  { foodKey: 'sattu', grams: 50, detail: 'a 50 g sattu drink', diets: VEG },
  { foodKey: 'boiled chana', grams: 150, detail: '1 katori (150 g) boiled chana', diets: VEG },
  { foodKey: 'whey protein', grams: 30, detail: '1 scoop whey', diets: VEG_EGG },
  { foodKey: 'tofu', grams: 150, detail: '150 g tofu', diets: VEG },
  { foodKey: 'dal tadka', grams: 150, detail: '1 katori dal tadka', diets: VEG },
];

function anchorProtein(def: AnchorDef): number {
  const entry = FOOD_DB[def.foodKey];
  if (!entry) return 0;
  return Number(((entry.proteinG * def.grams) / 100).toFixed(1));
}

export interface ProteinGapSuggestion {
  gapG: number;
  anchor: ProteinAnchor;
  message: string;
}

/**
 * One concrete protein anchor when a veg/eggitarian/vegan user's logged
 * protein is tracking below target into the afternoon/evening.
 * Returns null when there's nothing useful to say.
 */
export function getProteinGapSuggestion(input: {
  diet: DietPreference;
  proteinLoggedG: number;
  proteinTargetG: number;
  hour: number;
}): ProteinGapSuggestion | null {
  const { diet, proteinLoggedG, proteinTargetG, hour } = input;
  if (!VEG.includes(diet)) return null;
  if (!(proteinTargetG > 0)) return null;
  if (hour < 14) return null; // too early in the day to call it

  const gapG = Math.round(proteinTargetG - proteinLoggedG);
  if (gapG < 15) return null;

  const eligible = ANCHORS.filter((a) => a.diets.includes(diet))
    .map((a) => ({ detail: a.detail, proteinG: anchorProtein(a) }))
    .filter((a) => a.proteinG > 0);
  if (eligible.length === 0) return null;

  // Smallest anchor that still covers the gap; if none covers it, the
  // biggest one (it gets the user closest).
  const covering = eligible
    .filter((a) => a.proteinG >= gapG)
    .sort((a, b) => a.proteinG - b.proteinG);
  const anchor =
    covering[0] ??
    eligible.slice().sort((a, b) => b.proteinG - a.proteinG)[0];

  return {
    gapG,
    anchor,
    message: `Protein is tracking low today — about ${gapG} g to go. Adding ${anchor.detail} (~${anchor.proteinG} g protein) would close most of the gap.`,
  };
}

// ── Whole-day adaptation ──────────────────────────────────────────────

export interface WholeDayAdaptation {
  consumedPct: number;
  remainingKcal: number;
  suggestedDinnerKcal: number;
  reason: string;
}

/**
 * When most of the day's calories are already logged by mid-afternoon,
 * suggest a lighter dinner budget. A suggestion only — saved goals are
 * never touched.
 */
export function getWholeDayAdaptation(input: {
  caloriesLogged: number;
  calorieTarget: number;
  hour: number;
}): WholeDayAdaptation | null {
  const { caloriesLogged, calorieTarget, hour } = input;
  if (!(calorieTarget > 0)) return null;
  if (hour < 14) return null;

  const pct = caloriesLogged / calorieTarget;
  if (pct < 0.65) return null;

  const remainingKcal = Math.round(calorieTarget - caloriesLogged);
  if (remainingKcal <= 0) return null;

  const consumedPct = Math.round(pct * 100);
  return {
    consumedPct,
    remainingKcal,
    suggestedDinnerKcal: remainingKcal,
    reason: `You've logged about ${consumedPct}% of today's ${calorieTarget.toLocaleString()} kcal target by this afternoon. A dinner near ${remainingKcal.toLocaleString()} kcal lands the day right on target — this is just for today; your saved goals don't change.`,
  };
}

// ── Fast / festival day patterns ──────────────────────────────────────

export interface DayKindTargets {
  calories: number;
  proteinG: number;
  note: string;
}

/**
 * Target adjustments for a fasting/festival day. Deliberately small and
 * honest: the numbers are guidance, and the copy says so.
 */
export function getDayKindTargets(
  kind: MealDayKind | null | undefined,
  goals: MacroGoals
): DayKindTargets | null {
  if (!kind) return null;
  switch (kind) {
    case 'no_grain_fast':
      return {
        calories: goals.calories,
        proteinG: goals.proteinG,
        note: 'Fasting day (no grains): protein can still come from paneer, curd, milk, nuts and sabudana/fruit meals. Targets stay the same — treat them as guidance, not rules.',
      };
    case 'one_meal_fast':
      return {
        calories: Math.round(goals.calories * 0.7),
        proteinG: goals.proteinG,
        note: 'One-meal day: calories are guided ~30% lower and protein stays at target — try to get most of it into that one meal.',
      };
    case 'festival_feast':
      return {
        calories: goals.calories + 400,
        proteinG: goals.proteinG,
        note: 'Festival day: a +400 kcal buffer is built into today. Enjoy the food — one day never decides anything.',
      };
  }
}
