import { LiftLevel, OverallLevel, Gender } from './types';

export function calculateOneRepMax(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

// Breakpoints for males. Keys are percentages of the max possible level (1, 25, 50, 75, 90, 100)
const MALE_STANDARDS: Record<string, { [key: number]: number }> = {
  'Bench Press': { 1: 0.5, 25: 0.75, 50: 1.0, 75: 1.25, 90: 1.5, 100: 2.0 },
  'Squat': { 1: 0.75, 25: 1.0, 50: 1.25, 75: 1.75, 90: 2.0, 100: 2.75 },
  'Deadlift': { 1: 1.0, 25: 1.25, 50: 1.5, 75: 2.0, 90: 2.5, 100: 3.5 },
  'Overhead Press': { 1: 0.35, 25: 0.5, 50: 0.65, 75: 0.85, 90: 1.0, 100: 1.4 },
  'Barbell Row': { 1: 0.5, 25: 0.65, 50: 0.85, 75: 1.1, 90: 1.3, 100: 1.7 },
  'Pull-ups': { 1: 0, 25: 0.1, 50: 0.25, 75: 0.5, 90: 0.75, 100: 1.0 },
  'Dumbbell Curl': { 1: 0.15, 25: 0.2, 50: 0.3, 75: 0.4, 90: 0.5, 100: 0.65 },
  'Leg Press': { 1: 1.5, 25: 2.0, 50: 2.5, 75: 3.5, 90: 4.0, 100: 5.0 },
  'Romanian Deadlift': { 1: 0.5, 25: 0.75, 50: 1.0, 75: 1.35, 90: 1.65, 100: 2.25 },
  'Incline Bench': { 1: 0.4, 25: 0.6, 50: 0.8, 75: 1.05, 90: 1.25, 100: 1.7 },
  'Lat Pulldown': { 1: 0.4, 25: 0.55, 50: 0.7, 75: 0.9, 90: 1.05, 100: 1.3 }
};

const LEVELS = [1, 25, 50, 75, 90, 100];

export function getExerciseList(): string[] {
  return Object.keys(MALE_STANDARDS);
}

export function getLiftTitle(level: number): string {
  if (level <= 10) return 'First Steps';
  if (level <= 20) return 'Iron Initiate';
  if (level <= 30) return 'Steel Apprentice';
  if (level <= 40) return 'Forge Bound';
  if (level <= 50) return 'Iron Forged';
  if (level <= 60) return 'Steel Tempered';
  if (level <= 70) return 'Iron Will';
  if (level <= 80) return 'Titan Rising';
  if (level <= 90) return 'Apex Predator';
  return 'Mythic';
}

function getCategory(level: number): string {
  if (level <= 15) return 'Untrained';
  if (level <= 30) return 'Beginner';
  if (level <= 45) return 'Novice';
  if (level <= 65) return 'Intermediate';
  if (level <= 80) return 'Advanced';
  if (level <= 95) return 'Elite';
  return 'World Class';
}

export function getLiftLevel(exercise: string, oneRepMax: number, bodyweightKg: number, gender: Gender): LiftLevel {
  const standards = MALE_STANDARDS[exercise];
  if (!standards) {
    return { exercise, level: 1, title: getLiftTitle(1), ratio: 0, category: getCategory(1) };
  }

  const ratio = oneRepMax / bodyweightKg;
  const genderMultiplier = gender === 'female' ? 0.65 : 1.0;

  let level = 1;
  let lowerBoundLevel = 0;
  let lowerBoundRatio = 0;
  
  for (let i = 0; i < LEVELS.length; i++) {
    const currentLevel = LEVELS[i];
    const currentRatio = standards[currentLevel] * genderMultiplier;
    
    if (ratio >= currentRatio) {
      if (i === LEVELS.length - 1) {
        level = 100;
        break;
      }
      lowerBoundLevel = currentLevel;
      lowerBoundRatio = currentRatio;
    } else {
      if (i === 0) {
        level = 1;
      } else {
        const upperBoundLevel = currentLevel;
        const upperBoundRatio = currentRatio;
        
        const rangeLevel = upperBoundLevel - lowerBoundLevel;
        const rangeRatio = upperBoundRatio - lowerBoundRatio;
        const ratioInRange = ratio - lowerBoundRatio;
        const percentageInRange = ratioInRange / rangeRatio;
        
        level = Math.round(lowerBoundLevel + (percentageInRange * rangeLevel));
      }
      break;
    }
  }

  level = Math.max(1, Math.min(100, level));

  return {
    exercise,
    level,
    title: getLiftTitle(level),
    ratio: Number(ratio.toFixed(2)),
    category: getCategory(level)
  };
}

export function getOverallLevel(liftLevels: LiftLevel[]): OverallLevel {
  if (!liftLevels || liftLevels.length === 0) {
    return { level: 1, title: getLiftTitle(1), averageRatio: 0 };
  }
  
  const avgLevel = Math.round(liftLevels.reduce((sum, l) => sum + l.level, 0) / liftLevels.length);
  const avgRatio = liftLevels.reduce((sum, l) => sum + l.ratio, 0) / liftLevels.length;
  
  return {
    level: avgLevel,
    title: getLiftTitle(avgLevel),
    averageRatio: Number(avgRatio.toFixed(2))
  };
}
