import { LiftLevel, OverallLevel, Gender, ExerciseRank, OverallTitle, EquipmentType } from './types';
import { getAllExerciseNames } from './exercise-library';

export function calculateOneRepMax(weight: number, reps: number): number {
  if (weight <= 0) return 0;
  if (reps <= 0) return weight;
  if (reps === 1) return weight;
  // Dampened Epley formula:
  // For reps <= 10: standard linear Epley (weight * (1 + reps / 30))
  // For reps > 10: non-linear dampening to prevent physiological divergence (high rep fatigue)
  if (reps <= 10) {
    return weight * (1 + reps / 30);
  }
  return weight * (1 + 10 / 30 + (reps - 10) / 45);
}

/**
 * Suggests working load based on estimated 1RM, target reps, and target RPE.
 * Rounds to nearest standard plate step (2.5 kg or 5 lbs).
 * e.g. suggestLoad(75, 4, 8) → 62.5
 */
export function suggestLoad(
  e1rm: number,
  reps: number,
  rpe: number = 8,
  unit: 'kg' | 'lbs' = 'kg'
): number {
  if (!e1rm || e1rm <= 0) return 0;
  const safeReps = Math.max(1, reps);
  const safeRpe = Math.min(10, Math.max(5, rpe));
  const load = e1rm / (1 + (safeReps + (10 - safeRpe)) / 30);
  const step = unit === 'lbs' ? 5 : 2.5;
  return Math.round(load / step) * step;
}


// Breakpoints for males. Keys are level milestones (1, 20, 35, 50, 70, 85, 100)
// Calibrated so a 120kg squat at 75-80kg bodyweight is Level ~43, 85kg bench is ~31, 175kg deadlift is ~47.
const MALE_STANDARDS: Record<string, { [key: number]: number }> = {
  // ── Barbell Compounds ──────────────────────────────────────────────
  'Bench Press':            { 1: 0.40, 20: 0.75, 35: 1.15, 50: 1.45, 70: 1.80, 85: 2.15, 100: 2.45 },
  'Squat':                  { 1: 0.50, 20: 0.95, 35: 1.30, 50: 1.65, 70: 2.10, 85: 2.50, 100: 2.90 },
  'Deadlift':               { 1: 0.70, 20: 1.20, 35: 1.65, 50: 2.25, 70: 2.80, 85: 3.30, 100: 3.80 },
  'Overhead Press':         { 1: 0.25, 20: 0.50, 35: 0.75, 50: 0.95, 70: 1.20, 85: 1.40, 100: 1.65 },
  'Barbell Row':            { 1: 0.40, 20: 0.70, 35: 1.00, 50: 1.25, 70: 1.55, 85: 1.85, 100: 2.15 },
  'Romanian Deadlift':      { 1: 0.50, 20: 0.95, 35: 1.35, 50: 1.75, 70: 2.20, 85: 2.65, 100: 3.10 },
  'Incline Bench':          { 1: 0.35, 20: 0.65, 35: 0.95, 50: 1.25, 70: 1.55, 85: 1.85, 100: 2.15 },
  'Front Squat':            { 1: 0.40, 20: 0.75, 35: 1.05, 50: 1.35, 70: 1.70, 85: 2.00, 100: 2.30 },
  'Close Grip Bench':       { 1: 0.35, 20: 0.65, 35: 0.95, 50: 1.20, 70: 1.50, 85: 1.75, 100: 2.05 },
  'Sumo Deadlift':          { 1: 0.70, 20: 1.20, 35: 1.65, 50: 2.25, 70: 2.80, 85: 3.30, 100: 3.80 },

  // ── Cable ──────────────────────────────────────────────────────────
  'Lat Pulldown':           { 1: 0.35, 20: 0.65, 35: 0.90, 50: 1.15, 70: 1.40, 85: 1.65, 100: 1.95 },
  'Cable Row':              { 1: 0.35, 20: 0.65, 35: 0.90, 50: 1.15, 70: 1.40, 85: 1.65, 100: 1.90 },
  'Chest Fly':              { 1: 0.15, 20: 0.28, 35: 0.42, 50: 0.55, 70: 0.70, 85: 0.85, 100: 1.00 },
  'Face Pull':              { 1: 0.20, 20: 0.35, 35: 0.50, 50: 0.65, 70: 0.80, 85: 0.95, 100: 1.10 },
  'Tricep Pushdown':        { 1: 0.20, 20: 0.38, 35: 0.55, 50: 0.70, 70: 0.90, 85: 1.05, 100: 1.25 },

  // ── Machine ────────────────────────────────────────────────────────
  'Leg Press':              { 1: 1.20, 20: 2.20, 35: 3.20, 50: 4.20, 70: 5.50, 85: 6.80, 100: 8.00 },
  'Leg Curl':               { 1: 0.30, 20: 0.55, 35: 0.75, 50: 1.00, 70: 1.25, 85: 1.45, 100: 1.70 },
  'Leg Extension':          { 1: 0.40, 20: 0.70, 35: 1.00, 50: 1.30, 70: 1.55, 85: 1.80, 100: 2.10 },

  // ── Bodyweight ─────────────────────────────────────────────────────
  // ratio = added_weight / bodyweight (0 = bodyweight only is base)
  'Pull-ups':               { 1: 0.00, 20: 0.15, 35: 0.35, 50: 0.55, 70: 0.80, 85: 1.05, 100: 1.30 },
  'Dips':                   { 1: 0.00, 20: 0.20, 35: 0.40, 50: 0.60, 70: 0.90, 85: 1.15, 100: 1.40 },
  'Push-ups':               { 1: 0.00, 20: 0.10, 35: 0.25, 50: 0.40, 70: 0.60, 85: 0.80, 100: 1.00 },

  // ── Dumbbell ───────────────────────────────────────────────────────
  // ratio = (dumbbell_weight_per_hand) / bodyweight
  'Dumbbell Curl':          { 1: 0.10, 20: 0.20, 35: 0.32, 50: 0.45, 70: 0.60, 85: 0.75, 100: 0.90 },
  'Dumbbell Press':         { 1: 0.15, 20: 0.28, 35: 0.42, 50: 0.55, 70: 0.70, 85: 0.85, 100: 1.00 },
  'Dumbbell Row':           { 1: 0.20, 20: 0.35, 35: 0.50, 50: 0.65, 70: 0.80, 85: 0.95, 100: 1.10 },
  'Incline Dumbbell Press': { 1: 0.12, 20: 0.23, 35: 0.35, 50: 0.47, 70: 0.60, 85: 0.73, 100: 0.87 },
  'Dumbbell Shoulder Press':{ 1: 0.12, 20: 0.22, 35: 0.33, 50: 0.43, 70: 0.55, 85: 0.67, 100: 0.80 },
  'Dumbbell Lateral Raise': { 1: 0.05, 20: 0.09, 35: 0.14, 50: 0.20, 70: 0.27, 85: 0.35, 100: 0.43 },
  'Dumbbell Fly':           { 1: 0.08, 20: 0.15, 35: 0.22, 50: 0.30, 70: 0.40, 85: 0.50, 100: 0.60 },
  'Hammer Curl':            { 1: 0.10, 20: 0.20, 35: 0.32, 50: 0.43, 70: 0.57, 85: 0.72, 100: 0.87 },
  'Tricep Kickback':        { 1: 0.06, 20: 0.11, 35: 0.17, 50: 0.23, 70: 0.30, 85: 0.38, 100: 0.47 },
  'Goblet Squat':           { 1: 0.25, 20: 0.45, 35: 0.65, 50: 0.85, 70: 1.05, 85: 1.25, 100: 1.50 },
  'Dumbbell Lunge':         { 1: 0.15, 20: 0.28, 35: 0.40, 50: 0.52, 70: 0.65, 85: 0.78, 100: 0.92 },
  'Arnold Press':           { 1: 0.10, 20: 0.20, 35: 0.30, 50: 0.40, 70: 0.52, 85: 0.65, 100: 0.78 },
  'Preacher Curl':          { 1: 0.12, 20: 0.22, 35: 0.33, 50: 0.45, 70: 0.58, 85: 0.72, 100: 0.88 },
};

const LEVELS = [1, 20, 35, 50, 70, 85, 100];

// Main foundational compound lifts that define athletic & powerlifting strength
export const MAIN_COMPOUND_LIFTS = new Set([
  'Bench Press',
  'Squat',
  'Deadlift',
  'Overhead Press',
  'Barbell Row',
  'Pull-ups',
  'Dips',
  'Romanian Deadlift',
  'Incline Bench',
  'Front Squat',
  'Sumo Deadlift',
]);

export function isMainCompoundLift(exercise: string): boolean {
  if (MAIN_COMPOUND_LIFTS.has(exercise)) return true;
  const name = exercise.toLowerCase();
  return (
    (name.includes('bench') && !name.includes('dumbbell') && !name.includes('close grip')) ||
    (name.includes('squat') && !name.includes('goblet') && !name.includes('split')) ||
    name.includes('deadlift') ||
    name.includes('overhead press') ||
    name.includes('barbell row') ||
    name.includes('pull-up') ||
    name.includes('chin-up')
  );
}

// Exercises where the tracked "weight" is ADDED weight beyond bodyweight (or 0 for pure bodyweight)
const BODYWEIGHT_EXERCISES = new Set([
  'Pull-ups', 'Dips', 'Push-ups',
]);

// Exercises where ratio is PER-HAND dumbbell weight (not total barbell load)
const DUMBBELL_EXERCISES = new Set([
  'Dumbbell Curl', 'Dumbbell Press', 'Dumbbell Row', 'Incline Dumbbell Press',
  'Dumbbell Shoulder Press', 'Dumbbell Lateral Raise', 'Dumbbell Fly',
  'Hammer Curl', 'Tricep Kickback', 'Goblet Squat', 'Dumbbell Lunge',
  'Arnold Press', 'Preacher Curl',
]);

const CABLE_EXERCISES = new Set([
  'Lat Pulldown', 'Cable Row', 'Chest Fly', 'Face Pull', 'Tricep Pushdown',
]);

const MACHINE_EXERCISES = new Set([
  'Leg Press', 'Leg Curl', 'Leg Extension',
]);

export function isBodyweightExercise(exercise: string): boolean {
  if (BODYWEIGHT_EXERCISES.has(exercise)) return true;
  const name = exercise.toLowerCase();
  return (
    name.includes('pull-up') ||
    name.includes('pullup') ||
    name.includes('chin-up') ||
    name.includes('chinup') ||
    name.includes('dip') ||
    name.includes('push-up') ||
    name.includes('pushup') ||
    name.includes('bodyweight') ||
    name.includes('leg raise') ||
    name.includes('knee raise') ||
    name.includes('plank') ||
    name.includes('crunch') ||
    name.includes('sit-up') ||
    name.includes('hyperextension') ||
    name.includes('inverted row')
  );
}

export function isDumbbellExercise(exercise: string): boolean {
  if (DUMBBELL_EXERCISES.has(exercise)) return true;
  const name = exercise.toLowerCase();
  return (
    name.includes('dumbbell') ||
    name.includes('db ') ||
    name.includes('goblet') ||
    name.includes('arnold')
  );
}

export function isCableExercise(exercise: string): boolean {
  if (CABLE_EXERCISES.has(exercise)) return true;
  const name = exercise.toLowerCase();
  return (
    name.includes('cable') ||
    name.includes('pulldown') ||
    name.includes('pushdown') ||
    name.includes('face pull')
  );
}

export function isMachineExercise(exercise: string): boolean {
  if (MACHINE_EXERCISES.has(exercise)) return true;
  const name = exercise.toLowerCase();
  return (
    name.includes('machine') ||
    name.includes('press machine') ||
    name.includes('smith') ||
    name.includes('hack') ||
    name.includes('leg press') ||
    name.includes('leg curl') ||
    name.includes('leg extension')
  );
}

export function getExerciseEquipment(exerciseName: string): EquipmentType {
  if (BODYWEIGHT_EXERCISES.has(exerciseName)) return 'bodyweight';
  if (DUMBBELL_EXERCISES.has(exerciseName)) return 'dumbbell';
  if (CABLE_EXERCISES.has(exerciseName)) return 'cable';
  if (MACHINE_EXERCISES.has(exerciseName)) return 'machine';

  const name = exerciseName.toLowerCase();
  if (name.includes('pull-up') || name.includes('dip') || name.includes('push-up') || name.includes('chin-up') || name.includes('bodyweight')) {
    return 'bodyweight';
  }
  if (name.includes('dumbbell') || name.includes('db ') || name.includes('goblet') || name.includes('arnold')) {
    return 'dumbbell';
  }
  if (name.includes('cable') || name.includes('pulldown') || name.includes('pushdown') || name.includes('face pull')) {
    return 'cable';
  }
  if (name.includes('machine') || name.includes('press machine') || name.includes('smith') || name.includes('hack') || name.includes('leg press') || name.includes('leg curl') || name.includes('leg extension')) {
    return 'machine';
  }
  return 'barbell';
}

export { getExerciseEquipment as getEquipmentType };

/**
 * Movement-specific female ratio multipliers grounded in exercise physiology.
 * Lower body lifts retain ~72% ratio, upper body compounds ~58%, accessories/cables ~65%.
 */
export function getFemaleMultiplier(exercise: string): number {
  const name = exercise.toLowerCase();
  // Lower body compound & leg lifts: ~72% of male bodyweight ratio
  if (
    name.includes('squat') ||
    name.includes('deadlift') ||
    name.includes('leg press') ||
    name.includes('leg curl') ||
    name.includes('leg extension') ||
    name.includes('lunge') ||
    name.includes('hip thrust')
  ) {
    return 0.72;
  }
  // Upper body compound pressing: ~58% of male bodyweight ratio
  if (
    name.includes('bench') ||
    name.includes('overhead press') ||
    name.includes('shoulder press') ||
    name.includes('incline') ||
    name.includes('dip') ||
    name.includes('push-up') ||
    name.includes('arnold')
  ) {
    return 0.58;
  }
  // Pulling, back, arms, cables, general defaults: ~65%
  return 0.65;
}

/**
 * Canonical exercise name normalizer to resolve aliases, whitespace, and case differences
 */
export function normalizeExerciseName(exercise: string): string {
  if (!exercise) return '';
  const trimmed = exercise.trim();
  const lower = trimmed.toLowerCase();

  // Map common aliases to canonical names in MALE_STANDARDS
  if (lower === 'bench' || lower === 'barbell bench' || lower === 'flat bench' || lower === 'flat bench press' || lower === 'barbell bench press') return 'Bench Press';
  if (lower === 'back squat' || lower === 'barbell squat') return 'Squat';
  if (lower === 'conventional deadlift' || lower === 'barbell deadlift') return 'Deadlift';
  if (lower === 'ohp' || lower === 'military press' || lower === 'strict press' || lower === 'barbell overhead press') return 'Overhead Press';
  if (lower === 'bent over row' || lower === 'barbell bent over row') return 'Barbell Row';
  if (lower === 'rdl') return 'Romanian Deadlift';
  if (lower === 'pullup' || lower === 'pullups' || lower === 'pull up' || lower === 'pull ups' || lower === 'chin up' || lower === 'chinups' || lower === 'chin-up') return 'Pull-ups';
  if (lower === 'dip') return 'Dips';
  if (lower === 'pushup' || lower === 'pushups' || lower === 'push up') return 'Push-ups';
  if (lower === 'lat pull' || lower === 'lat pulldowns') return 'Lat Pulldown';
  if (lower === 'seated cable row') return 'Cable Row';

  // Return matching standard key if case differs
  const stdKeys = Object.keys(MALE_STANDARDS);
  const found = stdKeys.find((k) => k.toLowerCase() === lower);
  return found || trimmed;
}

/**
 * Calculates the true physiological load for an exercise set,
 * properly accounting for bodyweight in exercises like Pull-ups, Dips, and Push-ups.
 */
export function getEffectiveExerciseLoad(
  exercise: string,
  externalWeightKg: number,
  bodyweightKg: number
): number {
  const safeBW = Math.max(20, bodyweightKg || 75);
  const safeExt = Math.max(0, externalWeightKg || 0);
  if (isBodyweightExercise(exercise)) {
    return safeBW + safeExt;
  }
  return safeExt;
}

export function getExerciseList(): string[] {
  const stdLifts = Object.keys(MALE_STANDARDS);
  const libLifts = getAllExerciseNames();
  return Array.from(new Set([...stdLifts, ...libLifts]));
}

/** Group exercises by category for pretty dropdown with 5 clean equipment categories */
export function getExercisesByCategory(): { category: string; exercises: string[] }[] {
  return [
    {
      category: 'Barbell Compounds',
      exercises: ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Romanian Deadlift', 'Incline Bench', 'Front Squat', 'Close Grip Bench', 'Sumo Deadlift'],
    },
    {
      category: 'Dumbbell',
      exercises: ['Dumbbell Press', 'Dumbbell Row', 'Dumbbell Curl', 'Incline Dumbbell Press', 'Dumbbell Shoulder Press', 'Dumbbell Lateral Raise', 'Dumbbell Fly', 'Hammer Curl', 'Tricep Kickback', 'Goblet Squat', 'Dumbbell Lunge', 'Arnold Press', 'Preacher Curl'],
    },
    {
      category: 'Bodyweight',
      exercises: ['Pull-ups', 'Dips', 'Push-ups'],
    },
    {
      category: 'Cable',
      exercises: ['Lat Pulldown', 'Cable Row', 'Chest Fly', 'Face Pull', 'Tricep Pushdown'],
    },
    {
      category: 'Machine',
      exercises: ['Leg Press', 'Leg Curl', 'Leg Extension'],
    },
  ];
}

/**
 * Overall Character Titles based on composite average level
 */
export function getOverallTitle(level: number): OverallTitle {
  if (level <= 10) return 'INITIATE';
  if (level <= 20) return 'FORGED';
  if (level <= 35) return 'ADEPT';
  if (level <= 50) return 'VANGUARD';
  if (level <= 65) return 'ELITE';
  if (level <= 80) return 'ASCENDANT';
  if (level <= 95) return 'APEX';
  if (level <= 100) return 'TRANSCENDENT';
  if (level <= 120) return 'TITAN';
  return 'IMMORTAL';
}

/**
 * Exercise Lift Rank Category (shown on lift cards)
 */
export function getExerciseRank(level: number): ExerciseRank {
  if (level <= 15) return 'FOUNDATION';
  if (level <= 30) return 'TRAINED';
  if (level <= 45) return 'SKILLED';
  if (level <= 65) return 'ADVANCED';
  if (level <= 80) return 'ELITE';
  if (level <= 95) return 'MASTER';
  return 'GRANDMASTER';
}

/**
 * Calculates the exact strength level (1-100+) using smooth continuous interpolation
 */
export function getLiftLevel(
  exercise: string,
  oneRepMaxKg: number,
  bodyweightKg: number,
  gender: Gender
): LiftLevel {
  const normExercise = normalizeExerciseName(exercise);
  const standards = MALE_STANDARDS[normExercise] || MALE_STANDARDS['Bench Press'];
  const safeBW = Math.max(20, bodyweightKg || 75);
  const ratio = oneRepMaxKg / safeBW;
  const genderMultiplier = gender === 'female' ? getFemaleMultiplier(normExercise) : 1.0;

  let level = 1;
  let lowerBoundLevel = 1;
  let lowerBoundRatio = standards[1] * genderMultiplier;

  if (ratio <= lowerBoundRatio) {
    level = Math.max(1, Math.round((ratio / lowerBoundRatio) * 1));
  } else {
    let matched = false;
    for (let i = 1; i < LEVELS.length; i++) {
      const currentLevel = LEVELS[i];
      const currentRatio = standards[currentLevel] * genderMultiplier;

      if (ratio <= currentRatio) {
        const rangeLevel = currentLevel - lowerBoundLevel;
        const rangeRatio = currentRatio - lowerBoundRatio;
        const ratioInRange = ratio - lowerBoundRatio;
        const percentageInRange = rangeRatio > 0 ? ratioInRange / rangeRatio : 0;

        level = Math.round(lowerBoundLevel + percentageInRange * rangeLevel);
        matched = true;
        break;
      }

      lowerBoundLevel = currentLevel;
      lowerBoundRatio = currentRatio;
    }

    // If beyond level 100, extrapolate beyond 100
    if (!matched) {
      const topLevel = LEVELS[LEVELS.length - 1]; // 100
      const prevLevel = LEVELS[LEVELS.length - 2]; // 85
      const topRatio = standards[topLevel] * genderMultiplier;
      const prevRatio = standards[prevLevel] * genderMultiplier;
      const deltaRatio = topRatio - prevRatio;
      const extraRatio = ratio - topRatio;
      const extraLevels = deltaRatio > 0 ? (extraRatio / deltaRatio) * (topLevel - prevLevel) : 0;
      level = Math.round(100 + extraLevels);
    }
  }

  level = Math.max(1, level);
  const rank = getExerciseRank(level);
  const equipment = getExerciseEquipment(exercise);

  return {
    exercise,
    level,
    title: rank,
    ratio: Number(ratio.toFixed(2)),
    category: rank,
    rank,
    equipment,
  };
}

export function getOverallLevel(liftLevels: LiftLevel[]): OverallLevel {
  if (!liftLevels || liftLevels.length === 0) {
    return { level: 1, title: 'INITIATE', averageRatio: 0, isMainLiftsOnly: false, mainLiftsCount: 0 };
  }

  // Count main compound lifts first to reflect true athletic & strength capacity
  const mainLifts = liftLevels.filter((l) => isMainCompoundLift(l.exercise));
  const targetLifts = mainLifts.length > 0 ? mainLifts : liftLevels;

  const avgLevel = Math.round(
    targetLifts.reduce((sum, l) => sum + l.level, 0) / targetLifts.length
  );
  const avgRatio =
    targetLifts.reduce((sum, l) => sum + l.ratio, 0) / targetLifts.length;

  return {
    level: avgLevel,
    title: getOverallTitle(avgLevel),
    averageRatio: Number(avgRatio.toFixed(2)),
    isMainLiftsOnly: mainLifts.length > 0,
    mainLiftsCount: mainLifts.length,
  };
}

/**
 * Calculates next milestone target for an exercise (e.g. 175kg -> 180kg, or user target)
 */
export function getNextMilestone(current1RM: number, customTarget?: number): number {
  if (customTarget && customTarget > current1RM) {
    return customTarget;
  }
  if (current1RM <= 0) return 20;

  // Round up to next milestone
  const step = current1RM < 50 ? 2.5 : current1RM < 140 ? 5 : 10;
  const next = Math.ceil((current1RM + 0.5) / step) * step;
  return next <= current1RM ? next + step : next;
}

/**
 * Returns what 1RM (in kg) is needed to reach the next level.
 * Also returns what the next tier rank boundary is.
 */
export function getNextLevelInfo(
  exercise: string,
  currentLevel: number,
  bodyweightKg: number,
  gender: Gender
): {
  nextLevel: number;
  nextRank: ExerciseRank;
  requiredRatioKg: number;   // 1RM in kg needed for next level
  currentRank: ExerciseRank;
  levelsToNextRank: number;
} {
  const normExercise = normalizeExerciseName(exercise);
  const standards = MALE_STANDARDS[normExercise] || MALE_STANDARDS['Bench Press'];
  const safeBW = Math.max(20, bodyweightKg || 75);
  const genderMultiplier = gender === 'female' ? getFemaleMultiplier(normExercise) : 1.0;
  const nextLevel = Math.min(100, currentLevel + 1);

  // Reverse-interpolate: given target level, find required ratio
  let requiredRatio = 0;

  // Find which segment nextLevel falls in
  for (let i = 1; i < LEVELS.length; i++) {
    const lbLevel = LEVELS[i - 1];
    const ubLevel = LEVELS[i];
    if (nextLevel >= lbLevel && nextLevel <= ubLevel) {
      const lbRatio = standards[lbLevel] * genderMultiplier;
      const ubRatio = standards[ubLevel] * genderMultiplier;
      const t = (nextLevel - lbLevel) / (ubLevel - lbLevel);
      requiredRatio = lbRatio + t * (ubRatio - lbRatio);
      break;
    }
  }

  if (requiredRatio === 0 && nextLevel >= 100) {
    requiredRatio = standards[100] * genderMultiplier;
  }

  const requiredRatioKg = Number((requiredRatio * safeBW).toFixed(1));
  const currentRank = getExerciseRank(currentLevel);
  const nextRank = getExerciseRank(nextLevel);

  // How many levels until rank changes
  let levelsToNextRank = 0;
  const rankBoundaries = [15, 30, 45, 65, 80, 95, 100];
  for (const boundary of rankBoundaries) {
    if (currentLevel < boundary) {
      levelsToNextRank = boundary - currentLevel;
      break;
    }
  }

  return { nextLevel, nextRank, requiredRatioKg, currentRank, levelsToNextRank };
}
