import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculateRecommendedMacroGoals, calculateMaintenanceCalories } from '../src/lib/macros';
import { enforceUnknownAgeMacroGoals, hasKnownAge } from '../src/lib/minor-targets';
import { missingTargetInputs, type EffectiveGoalsProfile } from '../src/lib/effective-goals';
import { useStore } from '../src/lib/store';
import type { MacroGoals } from '../src/lib/types';

// QA-hardening R5 — targets with missing inputs.
//
// Audit of what the engine actually reads: bodyweight, height, age,
// sex, activity (calculateMaintenanceCalories /
// calculateRecommendedMacroGoals). Defaults that used to sneak in:
// age 25, a gendered default height, the male BMR offset via
// `gender ?? 'male'` at call sites, the default activity multiplier,
// and a 72 kg fallback bodyweight. Rules now: unknown age (no DOB)
// means NO deficit anywhere — engine-derived, store-written, or
// coach-applied — and a derived target with missing inputs is a
// labelled estimate naming what is missing.

const profile = (over: Partial<EffectiveGoalsProfile> = {}): EffectiveGoalsProfile => ({
  bodyweightKg: 80,
  heightCm: 178,
  gender: 'male',
  age: 30,
  activityLevel: 'light',
  bodyweightSource: 'user',
  heightSource: 'user',
  goals: ['lose_fat'],
  ...over,
});

describe('QA R5 — engine: unknown age gets no deficit (and no surplus)', () => {
  it('lose_fat without an age lands exactly on maintenance', () => {
    const goals = calculateRecommendedMacroGoals(80, 'lose_fat', 'male', 178, undefined, 'light');
    const maintenance = calculateMaintenanceCalories(80, 'male', 178, undefined, 'light');
    expect(goals.calorieDelta ?? 0).toBe(0);
    expect(Math.abs(goals.calories - maintenance)).toBeLessThanOrEqual(10);
    // Protein stays goal-driven (2.2 g/kg), as in the minor clamp.
    expect(goals.proteinG).toBe(Math.round(80 * 2.2));
  });

  it('build_muscle without an age also lands on maintenance', () => {
    const goals = calculateRecommendedMacroGoals(80, 'build_muscle', 'male', 178, undefined, 'light');
    expect(goals.calorieDelta ?? 0).toBe(0);
  });

  it('a known adult age still gets the real deficit (no regression)', () => {
    const goals = calculateRecommendedMacroGoals(80, 'lose_fat', 'male', 178, 30, 'light');
    expect(goals.calorieDelta ?? 0).toBeLessThan(0);
  });

  it('a minor age still clamps via the Phase-3 rule (unchanged)', () => {
    const goals = calculateRecommendedMacroGoals(80, 'lose_fat', 'male', 178, 16, 'light');
    expect(goals.calorieDelta ?? 0).toBe(0);
  });
});

describe('QA R5 — store write guard for unknown age', () => {
  const deficitGoals: MacroGoals = {
    calories: 1800,
    proteinG: 176,
    carbsG: 150,
    fatG: 60,
    maintenanceCalories: 2400,
    calorieDelta: -600,
  };

  it('hasKnownAge: plausible recorded ages only', () => {
    expect(hasKnownAge(30)).toBe(true);
    expect(hasKnownAge(13)).toBe(true);
    expect(hasKnownAge(undefined)).toBe(false);
    expect(hasKnownAge(null)).toBe(false);
    expect(hasKnownAge(0)).toBe(false);
    expect(hasKnownAge(NaN)).toBe(false);
  });

  it('enforceUnknownAgeMacroGoals clamps a written deficit to maintenance', () => {
    const p = profile({ age: undefined });
    const out = enforceUnknownAgeMacroGoals(deficitGoals, p, 'light');
    expect(out).not.toBeNull();
    expect(Math.abs((out?.calories ?? 0) - (out?.maintenanceCalories ?? 0))).toBeLessThanOrEqual(10);
  });

  it('known-age profiles pass through untouched (same reference)', () => {
    const p = profile({ age: 30 });
    expect(enforceUnknownAgeMacroGoals(deficitGoals, p, 'light')).toBe(deficitGoals);
  });

  it('placeholder stats: no honest maintenance, stored numbers untouched', () => {
    const p = profile({ age: undefined, bodyweightSource: 'default', heightSource: 'default' });
    expect(enforceUnknownAgeMacroGoals(deficitGoals, p, 'light')).toBe(deficitGoals);
  });
});

describe('QA R5 — missing-input audit (one test per field)', () => {
  it('complete profile: nothing missing', () => {
    expect(missingTargetInputs(profile())).toEqual([]);
  });
  it('missing weight', () => {
    expect(missingTargetInputs(profile({ bodyweightKg: undefined }))).toContain('weight');
    expect(missingTargetInputs(profile({ bodyweightSource: 'default' }))).toContain('weight');
  });
  it('missing height', () => {
    expect(missingTargetInputs(profile({ heightCm: undefined }))).toContain('height');
    expect(missingTargetInputs(profile({ heightSource: 'default' }))).toContain('height');
  });
  it('missing age (no DOB)', () => {
    expect(missingTargetInputs(profile({ age: undefined }))).toContain('age');
    expect(missingTargetInputs(profile({ age: null }))).toContain('age');
  });
  it('missing gender', () => {
    expect(missingTargetInputs(profile({ gender: undefined }))).toContain('gender');
  });
  it('missing activity level', () => {
    expect(missingTargetInputs(profile({ activityLevel: undefined }))).toContain('activity');
  });
  it('no profile at all: everything missing', () => {
    expect(missingTargetInputs(null)).toEqual(['weight', 'height', 'age', 'gender', 'activity']);
  });
});

describe('QA R5 — wiring', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('setMacroGoals with no DOB on file cannot write a deficit', () => {
    useStore.setState({
      profile: {
        ...(useStore.getState().profile ?? ({} as never)),
        bodyweightKg: 80,
        heightCm: 178,
        gender: 'male',
        age: undefined,
        bodyweightSource: 'user',
        heightSource: 'user',
      } as never,
      macroGoals: null,
    });
    useStore.getState().setMacroGoals({
      calories: 1800,
      proteinG: 176,
      carbsG: 150,
      fatG: 60,
      maintenanceCalories: 2400,
      calorieDelta: -600,
    });
    const stored = useStore.getState().macroGoals;
    expect(stored).not.toBeNull();
    expect(Math.abs((stored?.calories ?? 0) - (stored?.maintenanceCalories ?? 0))).toBeLessThanOrEqual(10);
  });

  it('surfaces: estimate note on Home + Meals; DOB prompt on Lose Fat', () => {
    expect(readFileSync('src/components/HomePage.tsx', 'utf8')).toContain('TargetEstimateNote');
    expect(readFileSync('src/components/MealsPage.tsx', 'utf8')).toContain('TargetEstimateNote');
    expect(readFileSync('src/components/GoalSelectorModal.tsx', 'utf8')).toContain('loseFatDobMsg');
  });
});
