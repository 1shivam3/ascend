/**
 * %1RM programming — optional per-plan intensity mode.
 *
 * RPE remains the default everywhere. When a plan opts in
 * (PlannedWorkout.intensityMode === 'percent'), the main compound
 * lifts get suggested loads from the user's estimated 1RM:
 *   - top set (first working set): 80% of e1RM
 *   - back-off sets:               70% of e1RM
 * Loads are rounded to loadable steps (2.5 kg / 5 lbs) and remain
 * fully editable — they land as prescribed weights, never locks.
 *
 * e1RM sources, in order: recorded PRs (their stored 1RM, or derived
 * from weight × reps), then the best completed set in workout history
 * via the same dampened-Epley calculateOneRepMax the coach uses.
 * No data → null → the feature hides its effect and the plan editor
 * explains what's missing. A plan's own explicit targetWeight ALWAYS
 * wins over a % suggestion.
 */
import { calculateOneRepMax, resolveCompoundVariant } from './strength-standards';
import { isSetCompleted } from './types';
import { kgToLbs, lbsToKg } from './units';
import type { PersonalRecord, PlannedWorkout, Unit, WorkoutEntry } from './types';

export const TOP_SET_PCT = 0.8;
export const BACKOFF_PCT = 0.7;

const MAIN_COMPOUND_KEYS = new Set([
  'Squat',
  'Bench Press',
  'Deadlift',
  'Overhead Press',
  'Barbell Row',
  'Front Squat',
  'Incline Bench',
  'Romanian Deadlift',
  'Sumo Deadlift',
]);

/**
 * Canonical key for a main compound lift, or null for everything
 * else. Variant lifts stay separate (a front-squat e1RM must never
 * price a back squat) — and identity is canonical, never substring:
 * resolution goes through resolveCompoundVariant (normalizeExerciseName
 * aliases + the closed COMPOUND_VARIANT_ALIASES table), so an
 * accessory whose name merely CONTAINS a compound's name — Bulgarian
 * Split Squat, Goblet Squat, Hack Squat Machine, Bodyweight Squats,
 * Overhead Tricep Extension, Dumbbell Bench Press — resolves to
 * itself and inherits nothing. Substring matching previously priced
 * Bulgarian Split Squat off the barbell squat's e1RM (the sim
 * measured it prescribed at 107.5→112.5 kg).
 */
export function mainCompoundKey(name: string): string | null {
  if (!name) return null;
  const canonical = resolveCompoundVariant(name);
  return MAIN_COMPOUND_KEYS.has(canonical) ? canonical : null;
}

export function isMainCompound(name: string): boolean {
  return mainCompoundKey(name) !== null;
}

function toKg(weight: number, unit: Unit | undefined): number {
  return unit === 'lbs' ? lbsToKg(weight) : weight;
}

/**
 * Best estimated 1RM (kg) for the lift an exercise name refers to.
 * PRs win over workout history: a recorded PR is a deliberate record,
 * workout bests are the fallback when no PR exists.
 */
export function estimateE1rmKg(
  exerciseName: string,
  prs: PersonalRecord[],
  workouts: WorkoutEntry[]
): number | null {
  const key = mainCompoundKey(exerciseName);
  if (!key) return null;

  let bestPr = 0;
  for (const pr of prs || []) {
    if (mainCompoundKey(pr.exercise) !== key) continue;
    const fromStored = pr.oneRepMax > 0 ? pr.oneRepMax : 0;
    const fromSet =
      pr.weightKg > 0 && pr.reps > 0 ? calculateOneRepMax(pr.weightKg, pr.reps) : 0;
    bestPr = Math.max(bestPr, fromStored, fromSet);
  }
  if (bestPr > 0) return Math.round(bestPr * 10) / 10;

  let bestWorkout = 0;
  for (const w of workouts || []) {
    for (const ex of w.exercises || []) {
      if (mainCompoundKey(ex.name) !== key) continue;
      for (const s of ex.sets || []) {
        if (!isSetCompleted(s) || s.isWarmup) continue;
        if (typeof s.weight !== 'number' || !(s.weight > 0) || !(s.reps > 0)) continue;
        const e1rm = calculateOneRepMax(toKg(s.weight, s.unit), s.reps);
        if (e1rm > bestWorkout) bestWorkout = e1rm;
      }
    }
  }
  return bestWorkout > 0 ? Math.round(bestWorkout * 10) / 10 : null;
}

/** Round to a loadable step: 2.5 kg or 5 lbs, never below one step. */
export function roundToLoadable(weight: number, unit: Unit): number {
  const step = unit === 'lbs' ? 5 : 2.5;
  return Math.max(step, Math.round(weight / step) * step);
}

export interface PercentSuggestion {
  /** The exercise's canonical compound key. */
  key: string;
  e1rmKg: number;
  unit: Unit;
  /** Per-set suggested loads in `unit`: [top set, ...back-offs]. */
  weights: number[];
}

/** Suggested loads for one exercise: set 1 = top set (80%), rest 70%. */
export function percentSetWeights(
  e1rmKg: number,
  setCount: number,
  unit: Unit
): number[] {
  const e1rm = unit === 'lbs' ? kgToLbs(e1rmKg) : e1rmKg;
  const count = Math.max(1, setCount || 1);
  return Array.from({ length: count }, (_, i) =>
    roundToLoadable(e1rm * (i === 0 ? TOP_SET_PCT : BACKOFF_PCT), unit)
  );
}

/**
 * Suggestions for a whole plan, keyed by exercise index. Only main
 * compounds with a known e1RM AND no explicit targetWeight appear —
 * an explicit plan weight always wins.
 */
export function buildPercentSuggestions(
  plan: PlannedWorkout,
  prs: PersonalRecord[],
  workouts: WorkoutEntry[],
  fallbackUnit: Unit = 'kg'
): Record<number, PercentSuggestion> {
  const out: Record<number, PercentSuggestion> = {};
  if (plan.intensityMode !== 'percent') return out;
  (plan.exercises || []).forEach((ex, idx) => {
    if (typeof ex.targetWeight === 'number') return;
    const key = mainCompoundKey(ex.name);
    if (!key) return;
    const e1rmKg = estimateE1rmKg(ex.name, prs, workouts);
    if (!e1rmKg) return;
    const unit = (ex.targetUnit as Unit) || fallbackUnit;
    out[idx] = {
      key,
      e1rmKg,
      unit,
      weights: percentSetWeights(e1rmKg, ex.targetSets || 1, unit),
    };
  });
  return out;
}
