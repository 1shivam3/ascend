import { LiftLevel, OverallLevel, Gender, ExerciseRank, OverallTitle } from './types';

export function calculateOneRepMax(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  // Epley formula
  return weight * (1 + reps / 30);
}

// Breakpoints for males. Keys are level milestones (1, 20, 35, 50, 70, 85, 100)
// Calibrated so a 120kg squat at 75-80kg bodyweight is Level ~43, 85kg bench is ~31, 175kg deadlift is ~47.
const MALE_STANDARDS: Record<string, { [key: number]: number }> = {
  'Bench Press': { 1: 0.40, 20: 0.75, 35: 1.15, 50: 1.45, 70: 1.80, 85: 2.15, 100: 2.45 },
  'Squat': { 1: 0.50, 20: 0.95, 35: 1.30, 50: 1.65, 70: 2.10, 85: 2.50, 100: 2.90 },
  'Deadlift': { 1: 0.70, 20: 1.20, 35: 1.65, 50: 2.25, 70: 2.80, 85: 3.30, 100: 3.80 },
  'Overhead Press': { 1: 0.25, 20: 0.50, 35: 0.75, 50: 0.95, 70: 1.20, 85: 1.40, 100: 1.65 },
  'Barbell Row': { 1: 0.40, 20: 0.70, 35: 1.00, 50: 1.25, 70: 1.55, 85: 1.85, 100: 2.15 },
  'Pull-ups': { 1: 0.00, 20: 0.15, 35: 0.35, 50: 0.55, 70: 0.80, 85: 1.05, 100: 1.30 }, // added weight / bodyweight
  'Dumbbell Curl': { 1: 0.10, 20: 0.20, 35: 0.32, 50: 0.45, 70: 0.60, 85: 0.75, 100: 0.90 },
  'Leg Press': { 1: 1.20, 20: 2.20, 35: 3.20, 50: 4.20, 70: 5.50, 85: 6.80, 100: 8.00 },
  'Romanian Deadlift': { 1: 0.50, 20: 0.95, 35: 1.35, 50: 1.75, 70: 2.20, 85: 2.65, 100: 3.10 },
  'Incline Bench': { 1: 0.35, 20: 0.65, 35: 0.95, 50: 1.25, 70: 1.55, 85: 1.85, 100: 2.15 },
  'Lat Pulldown': { 1: 0.35, 20: 0.65, 35: 0.90, 50: 1.15, 70: 1.40, 85: 1.65, 100: 1.95 }
};

const LEVELS = [1, 20, 35, 50, 70, 85, 100];

export function getExerciseList(): string[] {
  return Object.keys(MALE_STANDARDS);
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
  const standards = MALE_STANDARDS[exercise] || MALE_STANDARDS['Bench Press'];
  const safeBW = Math.max(20, bodyweightKg || 75);
  const ratio = oneRepMaxKg / safeBW;
  const genderMultiplier = gender === 'female' ? 0.65 : 1.0;

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

  return {
    exercise,
    level,
    title: rank,
    ratio: Number(ratio.toFixed(2)),
    category: rank,
    rank
  };
}

export function getOverallLevel(liftLevels: LiftLevel[]): OverallLevel {
  if (!liftLevels || liftLevels.length === 0) {
    return { level: 1, title: 'INITIATE', averageRatio: 0 };
  }

  const avgLevel = Math.round(liftLevels.reduce((sum, l) => sum + l.level, 0) / liftLevels.length);
  const avgRatio = liftLevels.reduce((sum, l) => sum + l.ratio, 0) / liftLevels.length;

  return {
    level: avgLevel,
    title: getOverallTitle(avgLevel),
    averageRatio: Number(avgRatio.toFixed(2))
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
