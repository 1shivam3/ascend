import { describe, it, expect } from 'vitest';
import {
  calculateOneRepMax,
  suggestLoad,
  getLiftLevel,
  getOverallLevel,
  getOverallTitle,
  getExerciseRank,
  getFemaleMultiplier,
  normalizeExerciseName,
  getNextMilestone,
  getNextLevelInfo,
  isBodyweightExercise,
  isDumbbellExercise,
  isCableExercise,
  isMachineExercise,
  getExerciseEquipment,
} from '../src/lib/strength-standards';

describe('Epley Estimated 1RM (calculateOneRepMax)', () => {
  it('calculates 1RM accurately for normal values <= 10 reps using linear Epley', () => {
    // Standard Epley: weight * (1 + reps / 30)
    // 100kg for 5 reps: 100 * (1 + 5/30) = 116.666...
    const result = calculateOneRepMax(100, 5);
    expect(result).toBeCloseTo(116.67, 1);

    // 60kg for 10 reps: 60 * (1 + 10/30) = 80kg
    expect(calculateOneRepMax(60, 10)).toBe(80);
  });

  it('handles 1-rep boundary condition where 1RM equals weight', () => {
    expect(calculateOneRepMax(100, 1)).toBe(100);
    expect(calculateOneRepMax(225, 1)).toBe(225);
  });

  it('applies non-linear dampening for high reps (> 10) to prevent unrealistic divergence', () => {
    // Dampened formula: weight * (1 + 10/30 + (reps - 10)/45)
    // For 15 reps at 50kg: 50 * (1 + 0.3333 + 5/45) = 50 * (1 + 1/3 + 1/9) = 50 * (13/9) = ~72.22
    const dampened = calculateOneRepMax(50, 15);
    const naiveLinear = 50 * (1 + 15 / 30); // 75kg
    expect(dampened).toBeLessThan(naiveLinear);
    expect(dampened).toBeCloseTo(72.22, 1);
  });

  it('handles edge cases and invalid inputs gracefully', () => {
    // Weight <= 0 returns 0
    expect(calculateOneRepMax(0, 5)).toBe(0);
    expect(calculateOneRepMax(-50, 5)).toBe(0);

    // Reps <= 0 returns the input weight
    expect(calculateOneRepMax(100, 0)).toBe(100);
    expect(calculateOneRepMax(100, -2)).toBe(100);
  });
});

describe('Load Suggestion (suggestLoad)', () => {
  it('suggests appropriate working load rounded to nearest 2.5kg step', () => {
    // 100kg e1RM, 5 reps, RPE 8 -> load = 100 / (1 + (5 + 2)/30) = 100 / (1 + 7/30) = 81.08 -> rounded to 80 or 82.5
    const loadKg = suggestLoad(100, 5, 8, 'kg');
    expect(loadKg % 2.5).toBe(0);
    expect(loadKg).toBeGreaterThan(75);
    expect(loadKg).toBeLessThan(90);
  });

  it('suggests appropriate working load rounded to nearest 5 lbs step', () => {
    const loadLbs = suggestLoad(100, 5, 8, 'lbs');
    expect(loadLbs % 5).toBe(0);
  });

  it('handles boundary conditions: zero or negative e1RM returns 0', () => {
    expect(suggestLoad(0, 5, 8, 'kg')).toBe(0);
    expect(suggestLoad(-10, 5, 8, 'kg')).toBe(0);
  });
});

describe('Strength Classification & Rank Calculations', () => {
  it('classifies male Bench Press into valid rank and level based on bodyweight ratio', () => {
    // 80kg bodyweight, 80kg 1RM -> ratio 1.0 -> between Level 20 (0.75) and Level 35 (1.15)
    const result = getLiftLevel('Bench Press', 80, 80, 'male');
    expect(result.level).toBeGreaterThan(20);
    expect(result.level).toBeLessThan(35);
    expect(result.ratio).toBe(1.0);
    expect(result.rank).toBe('TRAINED');
    expect(result.equipment).toBe('barbell');
  });

  it('handles female physiological multiplier correctly', () => {
    // Female pressing multiplier is 0.58, lower body is 0.72
    expect(getFemaleMultiplier('Bench Press')).toBe(0.58);
    expect(getFemaleMultiplier('Squat')).toBe(0.72);
    expect(getFemaleMultiplier('Cable Row')).toBe(0.65);

    // 60kg female with 40kg bench vs 60kg male with 40kg bench
    const femaleLevel = getLiftLevel('Bench Press', 40, 60, 'female');
    const maleLevel = getLiftLevel('Bench Press', 40, 60, 'male');
    expect(femaleLevel.level).toBeGreaterThan(maleLevel.level);
  });

  it('handles lower boundary where ratio is below beginner standards', () => {
    // Extremely light weight (10kg bench at 100kg bodyweight -> ratio 0.1)
    const result = getLiftLevel('Bench Press', 10, 100, 'male');
    expect(result.level).toBe(1);
    expect(result.rank).toBe('FOUNDATION');
  });

  it('extrapolates beyond level 100 for world-class / elite performances', () => {
    // 300kg deadlift at 75kg bodyweight (ratio 4.0, standard 100 is 3.80)
    const result = getLiftLevel('Deadlift', 300, 75, 'male');
    expect(result.level).toBeGreaterThan(100);
    expect(result.rank).toBe('GRANDMASTER');
  });

  it('handles bodyweight exercises (Pull-ups, Dips) added load calculation', () => {
    expect(isBodyweightExercise('Pull-ups')).toBe(true);
    expect(isBodyweightExercise('Dips')).toBe(true);
    expect(isBodyweightExercise('Bench Press')).toBe(false);

    // 80kg lifter doing pull-ups with 20kg added -> ratio 20/80 = 0.25
    const result = getLiftLevel('Pull-ups', 20, 80, 'male');
    expect(result.equipment).toBe('bodyweight');
    expect(result.ratio).toBe(0.25);
  });

  it('normalizes common exercise aliases to canonical names', () => {
    expect(normalizeExerciseName('bench')).toBe('Bench Press');
    expect(normalizeExerciseName('barbell bench')).toBe('Bench Press');
    expect(normalizeExerciseName('back squat')).toBe('Squat');
    expect(normalizeExerciseName('rdl')).toBe('Romanian Deadlift');
    expect(normalizeExerciseName('ohp')).toBe('Overhead Press');
    expect(normalizeExerciseName('pullup')).toBe('Pull-ups');
  });

  it('maps overall level to correct character titles', () => {
    expect(getOverallTitle(5)).toBe('INITIATE');
    expect(getOverallTitle(15)).toBe('FORGED');
    expect(getOverallTitle(30)).toBe('ADEPT');
    expect(getOverallTitle(45)).toBe('VANGUARD');
    expect(getOverallTitle(60)).toBe('ELITE');
    expect(getOverallTitle(75)).toBe('ASCENDANT');
    expect(getOverallTitle(90)).toBe('APEX');
    expect(getOverallTitle(100)).toBe('TRANSCENDENT');
    expect(getOverallTitle(110)).toBe('TITAN');
    expect(getOverallTitle(130)).toBe('IMMORTAL');
  });

  it('maps individual levels to exercise rank tiers', () => {
    expect(getExerciseRank(10)).toBe('FOUNDATION');
    expect(getExerciseRank(25)).toBe('TRAINED');
    expect(getExerciseRank(40)).toBe('SKILLED');
    expect(getExerciseRank(55)).toBe('ADVANCED');
    expect(getExerciseRank(70)).toBe('ELITE');
    expect(getExerciseRank(90)).toBe('MASTER');
    expect(getExerciseRank(98)).toBe('GRANDMASTER');
  });

  it('calculates composite overall level, prioritizing main compound lifts', () => {
    const lifts = [
      getLiftLevel('Bench Press', 100, 80, 'male'),
      getLiftLevel('Squat', 140, 80, 'male'),
      getLiftLevel('Deadlift', 180, 80, 'male'),
    ];
    const overall = getOverallLevel(lifts);
    expect(overall.level).toBeGreaterThan(1);
    expect(overall.isMainLiftsOnly).toBe(true);
    expect(overall.mainLiftsCount).toBe(3);
  });

  it('handles empty lift levels gracefully', () => {
    const overall = getOverallLevel([]);
    expect(overall.level).toBe(1);
    expect(overall.title).toBe('INITIATE');
    expect(overall.averageRatio).toBe(0);
  });

  it('calculates next milestone targets with dynamic stepping', () => {
    // < 50kg steps by 2.5kg
    expect(getNextMilestone(40)).toBe(42.5);
    // 50kg - 140kg steps by 5kg
    expect(getNextMilestone(100)).toBe(105);
    // >= 140kg steps by 10kg
    expect(getNextMilestone(150)).toBe(160);
    // Custom target takes precedence if higher
    expect(getNextMilestone(100, 115)).toBe(115);
  });

  it('calculates next level info and remaining distance to next rank tier', () => {
    const info = getNextLevelInfo('Bench Press', 28, 80, 'male');
    expect(info.nextLevel).toBe(29);
    expect(info.currentRank).toBe('TRAINED');
    expect(info.levelsToNextRank).toBe(2); // 30 - 28 = 2
    expect(info.requiredRatioKg).toBeGreaterThan(0);
  });
});
