import { describe, it, expect } from 'vitest';
import { effectiveMacroGoals, dayScaledGoals, type EffectiveGoalsProfile } from '@/lib/effective-goals';
import { minorMaintenanceFor, MINOR_MAINTENANCE_TOLERANCE_KCAL } from '@/lib/minor-targets';
import type { MacroGoals } from '@/lib/types';

/**
 * Audit F16/N2/N3 regression: one canonical derivation for today's
 * targets. Stored goals always win; otherwise the profile-derived
 * recommendation (same function Onboarding uses) applies; day-kind
 * scaling is applied on top, never instead of the base goals.
 */

const stored: MacroGoals = {
  calories: 2600,
  proteinG: 150,
  carbsG: 300,
  fatG: 80,
};

describe('effectiveMacroGoals', () => {
  it('returns stored goals unchanged when present', () => {
    expect(
      effectiveMacroGoals(stored, { bodyweightKg: 70, goals: ['lose_fat'] }),
    ).toBe(stored);
  });

  it('derives build_muscle goals from the profile (1.8 g/kg protein)', () => {
    const goals = effectiveMacroGoals(null, {
      bodyweightKg: 70,
      goals: ['build_muscle'],
      gender: 'male',
    });
    expect(goals).not.toBeNull();
    expect(goals!.proteinG).toBe(126); // 70 x 1.8
    expect(goals!.calories).toBeGreaterThan(1500);
    // Derived goals carry the same informational fields Onboarding writes.
    expect(goals!.maintenanceCalories).toBeDefined();
    expect(goals!.calorieDelta).toBeDefined();
  });

  it('derives lose_fat goals with the higher protein factor (2.2 g/kg)', () => {
    const goals = effectiveMacroGoals(null, {
      bodyweightKg: 70,
      goals: ['lose_fat'],
      gender: 'male',
    });
    expect(goals!.proteinG).toBe(154); // 70 x 2.2
  });

  it('returns null when neither stored goals nor a profile exist', () => {
    expect(effectiveMacroGoals(null, null)).toBeNull();
    expect(effectiveMacroGoals(undefined, { bodyweightKg: undefined })).toBeNull();
  });
});

describe('dayScaledGoals', () => {
  it('returns base goals unchanged with no day kind', () => {
    expect(dayScaledGoals(stored, null)).toBe(stored);
    expect(dayScaledGoals(stored, undefined)).toBe(stored);
  });

  it('scales calories -30% on a one-meal fast, protein unchanged', () => {
    const scaled = dayScaledGoals(stored, 'one_meal_fast')!;
    expect(scaled.calories).toBe(Math.round(2600 * 0.7));
    expect(scaled.proteinG).toBe(150);
  });

  it('adds 400 kcal on a festival day, protein unchanged', () => {
    const scaled = dayScaledGoals(stored, 'festival_feast')!;
    expect(scaled.calories).toBe(3000);
    expect(scaled.proteinG).toBe(150);
  });

  it('returns null when there are no base goals', () => {
    expect(dayScaledGoals(null, 'festival_feast')).toBeNull();
  });
});

describe('dayScaledGoals — minor day-kind clamp (owner decision 2026-11-08)', () => {
  // PR #108 clamped minors at target computation and on every write
  // path, but deliberately left the day-kind DISPLAY scaling
  // unclamped: a minor declaring a one-meal fast still saw a x0.7
  // target, a festival day +400. The owner closed that gap on
  // 2026-11-08 — after day-kind scaling, a known minor's displayed
  // target must sit inside the same maintenance band (±10 kcal) the
  // write-path clamp uses. Adults and unknown ages are unchanged.
  const minorProfile: EffectiveGoalsProfile = {
    bodyweightKg: 60,
    heightCm: 165,
    age: 16,
    gender: 'male',
    bodyweightSource: 'user',
    heightSource: 'user',
  };
  const maintenance = minorMaintenanceFor(minorProfile)!;
  const minorBase: MacroGoals = {
    calories: maintenance,
    proteinG: 108,
    carbsG: 300,
    fatG: 70,
  };

  it('minor + declared one-meal fast: displayed target stays in the maintenance band', () => {
    const out = dayScaledGoals(minorBase, 'one_meal_fast', minorProfile)!;
    expect(Math.abs(out.calories - maintenance)).toBeLessThanOrEqual(
      MINOR_MAINTENANCE_TOLERANCE_KCAL,
    );
    // Mirrors the main-path clamp: protein grams are preserved.
    expect(out.proteinG).toBe(108);
  });

  it('minor + declared festival day: displayed target stays in the maintenance band', () => {
    const out = dayScaledGoals(minorBase, 'festival_feast', minorProfile)!;
    expect(Math.abs(out.calories - maintenance)).toBeLessThanOrEqual(
      MINOR_MAINTENANCE_TOLERANCE_KCAL,
    );
    expect(out.proteinG).toBe(108);
  });

  it('adult + one-meal fast: x0.7 scaling unchanged', () => {
    const adultProfile: EffectiveGoalsProfile = { ...minorProfile, age: 30 };
    const out = dayScaledGoals(stored, 'one_meal_fast', adultProfile)!;
    expect(out.calories).toBe(Math.round(2600 * 0.7));
    expect(out.proteinG).toBe(150);
  });

  it('adult + festival day: +400 unchanged', () => {
    const adultProfile: EffectiveGoalsProfile = { ...minorProfile, age: 30 };
    const out = dayScaledGoals(stored, 'festival_feast', adultProfile)!;
    expect(out.calories).toBe(3000);
    expect(out.proteinG).toBe(150);
  });

  it('unknown age + one-meal fast: scaling unchanged (no clamp without a known age)', () => {
    const unknownAgeProfile: EffectiveGoalsProfile = { ...minorProfile, age: undefined };
    const out = dayScaledGoals(stored, 'one_meal_fast', unknownAgeProfile)!;
    expect(out.calories).toBe(Math.round(2600 * 0.7));
  });
});
