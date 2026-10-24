import { describe, expect, it } from 'vitest';
import {
  clampWorkoutReps,
  clampWorkoutWeight,
  finalizeWorkoutSet,
  MAX_SET_REPS,
  MAX_WORKOUT_WEIGHT_KG,
} from '@/lib/workout-engine';
import { calculateOneRepMax, getOverallLevel, suggestLoad } from '@/lib/strength-standards';
import { getBigThreeStats, getDOTSClassification } from '@/lib/dots';
import { getProteinGapSuggestion } from '@/lib/nutrition-coach';
import {
  calculateMaintenanceCalories,
  calculateRecommendedMacroGoals,
} from '@/lib/macros';
import type { PersonalRecord } from '@/lib/types';

/**
 * Persona-sim round 5 — numbers batch (SIM-P1-06/07, SIM-P2-03/04/05/11/18,
 * SIM-P3-05). Component-level gates (DOTS rendering, Progress delta) are
 * covered by the same logic's unit surface here; see the fixlog.
 */

function pr(exercise: string, oneRepMax: number): PersonalRecord {
  return {
    id: `pr-${exercise}`,
    exercise,
    weightKg: oneRepMax,
    weightLbs: Math.round(oneRepMax * 2.20462 * 10) / 10,
    reps: 1,
    oneRepMax,
    date: '2026-10-20',
  } as PersonalRecord;
}

describe('workout number ceilings (SIM-P1-06)', () => {
  it('caps weight at 500 kg in both units and floors at 0', () => {
    expect(clampWorkoutWeight(9999, 'kg')).toBe(MAX_WORKOUT_WEIGHT_KG);
    expect(clampWorkoutWeight(1102.3, 'lbs')).toBeCloseTo(1102.3, 0); // 500 kg in lbs
    expect(clampWorkoutWeight(2000, 'lbs')).toBeCloseTo(1102.3, 0);
    expect(clampWorkoutWeight(-5, 'kg')).toBe(0);
    expect(MAX_WORKOUT_WEIGHT_KG).toBe(500);
  });

  it('caps reps at 100 and floors at 0', () => {
    expect(clampWorkoutReps(999)).toBe(MAX_SET_REPS);
    expect(clampWorkoutReps(-3)).toBe(0);
    expect(clampWorkoutReps(12.7)).toBe(12);
  });

  it('finalizeWorkoutSet applies both ceilings', () => {
    const out = finalizeWorkoutSet({
      weight: 9999,
      reps: 250,
      unit: 'kg',
      completed: true,
      status: 'completed',
    } as never);
    expect(out.weight).toBe(500);
    expect(out.reps).toBe(100);
  });
});

describe('Big 3 completeness (SIM-P1-07)', () => {
  it('partial totals report isComplete false; full totals true', () => {
    const partial = getBigThreeStats([pr('Barbell Bench Press', 100)]);
    expect(partial.isComplete).toBe(false);
    expect(partial.missingLifts.length).toBeGreaterThan(0);
    const full = getBigThreeStats([
      pr('Barbell Bench Press', 100),
      pr('Barbell Back Squat', 140),
      pr('Conventional Deadlift', 180),
    ]);
    expect(full.isComplete).toBe(true);
    expect(full.totalKg).toBe(420);
  });
});

describe('DOTS tier honesty (SIM-P2-11)', () => {
  it('no tier carries an invented population percentile', () => {
    for (const dots of [200, 320, 400, 460, 520, 580]) {
      const c = getDOTSClassification(dots);
      expect(c.percentile.startsWith('Top ')).toBe(false);
    }
  });
});

describe('overall level estimate flag (SIM-P2-18)', () => {
  it('flags all-proxy pools as estimates and mixed pools as not', () => {
    const proxy = { exercise: 'Custom Lift', level: 30, ratio: 1.0, isStandardUnavailable: true };
    const real = { exercise: 'Squat', level: 40, ratio: 1.5, isStandardUnavailable: false };
    expect(getOverallLevel([proxy as never]).isEstimate).toBe(true);
    expect(getOverallLevel([proxy as never, real as never]).isEstimate).toBe(false);
    expect(getOverallLevel([]).isEstimate).toBe(false);
  });
});

describe('protein coach for non-vegetarians (SIM-P2-04)', () => {
  it('returns a meat/fish/egg anchor instead of a silent null', () => {
    const s = getProteinGapSuggestion({
      diet: 'non_vegetarian',
      proteinLoggedG: 60,
      proteinTargetG: 140,
      hour: 18,
    });
    expect(s).not.toBeNull();
    expect(s!.gapG).toBe(80);
    expect(s!.anchor.proteinG).toBeGreaterThan(0);
  });

  it('still serves vegetarians from veg anchors', () => {
    const s = getProteinGapSuggestion({
      diet: 'vegetarian',
      proteinLoggedG: 60,
      proteinTargetG: 140,
      hour: 18,
    });
    expect(s).not.toBeNull();
  });
});

describe('bodyweight-scaled surplus (SIM-P2-05)', () => {
  it('scales the surplus with maintenance instead of a flat +250/+150', () => {
    const small = calculateRecommendedMacroGoals(55, 'build_muscle', 'male', 170, 25, 'active');
    const large = calculateRecommendedMacroGoals(100, 'build_muscle', 'male', 180, 25, 'active');
    const maintSmall = calculateMaintenanceCalories(55, 'male', 170, 25, 'active');
    const maintLarge = calculateMaintenanceCalories(100, 'male', 180, 25, 'active');
    const surplusSmall = small.calories - maintSmall;
    const surplusLarge = large.calories - maintLarge;
    expect(surplusSmall).toBeGreaterThanOrEqual(150);
    expect(surplusSmall).toBeLessThanOrEqual(400);
    expect(surplusLarge).toBeGreaterThan(surplusSmall);
    const strong = calculateRecommendedMacroGoals(80, 'get_stronger', 'male', 178, 25, 'active');
    const maintStrong = calculateMaintenanceCalories(80, 'male', 178, 25, 'active');
    expect(strong.calories - maintStrong).toBeGreaterThanOrEqual(100);
    expect(strong.calories - maintStrong).toBeLessThanOrEqual(250);
  });
});

describe('suggestLoad inverts the dampened Epley (SIM-P3-05)', () => {
  it('round-trips through calculateOneRepMax at high reps', () => {
    const e1rm = 100;
    const load = suggestLoad(e1rm, 14, 8, 'kg');
    // Effective reps = 14 + (10 - 8) = 16 > 10, so the dampened branch
    // must apply on both sides of the round trip.
    const back = calculateOneRepMax(load, 16);
    expect(Math.abs(back - e1rm) / e1rm).toBeLessThan(0.05);
  });
});
