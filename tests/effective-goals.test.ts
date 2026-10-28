import { describe, it, expect } from 'vitest';
import { effectiveMacroGoals, dayScaledGoals } from '@/lib/effective-goals';
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
