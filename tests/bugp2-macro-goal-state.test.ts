import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@/lib/store';
import { calculateMaintenanceCalories, calculateRecommendedMacroGoals } from '@/lib/macros';
import { goalSource, roundMacroGoals, stampMacroGoals } from '@/lib/macro-goal-state';
import {
  macroGuardrailWarnings,
  FAT_MIN_FRACTION_OF_KCAL,
  FAT_MIN_G_PER_KG,
  PROTEIN_MIN_G_PER_KG,
} from '@/lib/macro-guardrails';
import type { MacroGoals, UserProfile } from '@/lib/types';

/**
 * Bug program Phase 2 — N1 (single source of truth + read-back),
 * N2 (guardrails), N3 (manual protection, diagnostics).
 *
 * The centrepiece is the gym-video case (WA0004, 2026-11-19): a
 * profile with NO date of birth saves 3,000 kcal; the unknown-age
 * safety rule clamps the stored target to maintenance — that rule
 * stays — but the save must now REPORT the clamped numbers
 * (read-back) instead of the toast quoting the typed ones, and the
 * clamp must land in the diagnostics log.
 */

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u-bugp2',
    name: 'Test Athlete',
    gender: 'male',
    bodyweightKg: 72,
    bodyweightLbs: 158.7,
    heightCm: 178,
    age: 25,
    unit: 'kg',
    createdAt: '2026-01-01T00:00:00.000Z',
    goals: ['build_muscle'],
    bodyweightSource: 'user',
    heightSource: 'user',
    ...overrides,
  } as UserProfile;
}

function seed(overrides: Record<string, unknown> = {}) {
  useStore.setState({
    profile: makeProfile(),
    macroGoals: null,
    trainingProfile: { activityLevel: 'light' },
    goals: ['build_muscle'],
    bodyMetrics: [],
    autoRecalculateGoals: true,
    goalRecalcPromptSeen: false,
    goalDiagnostics: [],
    ...overrides,
  } as never);
}

beforeEach(() => seed());

const MANUAL_3000: MacroGoals = { calories: 3000, proteinG: 130, carbsG: 512, fatG: 48 };

describe('N1: setMacroGoals stamps provenance and returns the read-back', () => {
  it('known-age adult: manual save lands verbatim, stamped manual', () => {
    const stored = useStore.getState().setMacroGoals(MANUAL_3000, 'manual');
    expect(stored).not.toBeNull();
    expect(stored!.calories).toBe(3000);
    expect(stored!.source).toBe('manual');
    expect(stored!.updatedAt).toBeTruthy();
    expect(stored!.inputsSnapshot?.bodyweightKg).toBe(72);
    expect(useStore.getState().macroGoals).toEqual(stored);
  });

  it('rounding rule: fractional targets are stored as whole kcal/grams', () => {
    const stored = useStore.getState().setMacroGoals(
      { calories: 2500.6, proteinG: 150.4, carbsG: 300.5, fatG: 70.2 },
      'manual',
    );
    expect(stored!.calories).toBe(2501);
    expect(stored!.proteinG).toBe(150);
    expect(stored!.carbsG).toBe(301);
    expect(stored!.fatG).toBe(70);
  });

  it('default source is recommended (engine writes)', () => {
    const stored = useStore.getState().setMacroGoals({ calories: 2500, proteinG: 150 });
    expect(stored!.source).toBe('recommended');
  });

  it('clearing goals still works and returns null', () => {
    useStore.getState().setMacroGoals(MANUAL_3000, 'manual');
    const cleared = useStore.getState().setMacroGoals(null);
    expect(cleared).toBeNull();
    expect(useStore.getState().macroGoals).toBeNull();
  });
});

describe('N1/N3: the gym-video case — unknown age clamps, but never silently', () => {
  it('save of 3000 with no DOB returns the maintenance-clamped read-back + a diagnostics entry', () => {
    seed({ profile: makeProfile({ age: undefined }) });
    const maintenance = calculateMaintenanceCalories(72, 'male', 178, undefined, 'light');
    const stored = useStore.getState().setMacroGoals(MANUAL_3000, 'manual');
    // The safety rule still holds: no off-maintenance target. The
    // clamp reconciles to integer grams, so the stored figure sits
    // inside the app's ±10 kcal maintenance band, not necessarily
    // on the exact maintenance integer.
    expect(Math.abs(stored!.calories - maintenance)).toBeLessThanOrEqual(10);
    expect(stored!.calories).toBeLessThan(3000);
    // The read-back IS what is stored — a caller quoting it cannot lie.
    expect(useStore.getState().macroGoals!.calories).toBe(stored!.calories);
    // Provenance survives the clamp (scaleMacroGoalsToCalories
    // rebuilds the object; the clamp re-attaches the stamp).
    expect(stored!.source).toBe('manual');
    // And the clamp is on the record.
    const log = useStore.getState().goalDiagnostics;
    expect(log).toHaveLength(1);
    expect(log[0].kind).toBe('safety-clamp');
    expect(log[0].reason).toBe('unknown-age');
    expect(log[0].beforeKcal).toBe(3000);
    expect(log[0].afterKcal).toBe(stored!.calories);
  });
});

describe('N1: a manual target is never overwritten automatically', () => {
  it('adding a DOB later does NOT recompute a manual target', () => {
    seed({ profile: makeProfile({ age: undefined }) });
    const stored = useStore.getState().setMacroGoals(MANUAL_3000, 'manual');
    const clampedKcal = stored!.calories;
    useStore.getState().setProfile(makeProfile({ age: 25 }));
    expect(useStore.getState().macroGoals!.calories).toBe(clampedKcal);
    expect(useStore.getState().macroGoals!.source).toBe('manual');
  });

  it('legacy goals (no recorded source) still unlock — pre-Phase-2 targets were never promised manual permanence', () => {
    seed({
      profile: makeProfile({ age: undefined }),
      macroGoals: { calories: 2356, proteinG: 130, carbsG: 378, fatG: 36 },
    });
    useStore.getState().setProfile(makeProfile({ age: 25 }));
    const expected = calculateRecommendedMacroGoals(72, 'build_muscle', 'male', 178, 25, 'light');
    expect(useStore.getState().macroGoals!.calories).toBe(expected.calories);
    // The unlock is an engine write and is stamped + logged as one.
    expect(useStore.getState().macroGoals!.source).toBe('recommended');
    expect(useStore.getState().goalDiagnostics.some((e) => e.kind === 'profile-recalc')).toBe(true);
  });

  it('a recommended target DOES unlock when the DOB arrives (auto-recalc on)', () => {
    seed({ profile: makeProfile({ age: undefined }) });
    const clamped = useStore.getState().setMacroGoals(MANUAL_3000, 'recommended');
    useStore.getState().setProfile(makeProfile({ age: 25 }));
    const expected = calculateRecommendedMacroGoals(72, 'build_muscle', 'male', 178, 25, 'light');
    expect(useStore.getState().macroGoals!.calories).toBe(expected.calories);
    expect(useStore.getState().macroGoals!.calories).not.toBe(clamped!.calories);
    const log = useStore.getState().goalDiagnostics;
    expect(log.some((e) => e.kind === 'profile-recalc')).toBe(true);
  });

  it('auto-recalculate OFF blocks the unlock recompute too', () => {
    seed({ profile: makeProfile({ age: undefined }), autoRecalculateGoals: false });
    const clamped = useStore.getState().setMacroGoals(MANUAL_3000, 'recommended');
    useStore.getState().setProfile(makeProfile({ age: 25 }));
    expect(useStore.getState().macroGoals!.calories).toBe(clamped!.calories);
  });
});

describe('macro-goal-state helpers', () => {
  it('goalSource returns null for unrecorded (legacy) provenance', () => {
    expect(goalSource(null)).toBeNull();
    expect(goalSource({ calories: 2000, proteinG: 100 })).toBeNull();
    expect(goalSource({ calories: 2000, proteinG: 100, source: 'coach' })).toBe('coach');
  });

  it('roundMacroGoals leaves absent optional fields absent', () => {
    const out = roundMacroGoals({ calories: 2000.4, proteinG: 100.6 });
    expect(out.calories).toBe(2000);
    expect(out.proteinG).toBe(101);
    expect(out.carbsG).toBeUndefined();
  });

  it('stampMacroGoals snapshots the derivation inputs', () => {
    const out = stampMacroGoals({ calories: 2500, proteinG: 150 }, 'coach', makeProfile(), 'light');
    expect(out.source).toBe('coach');
    expect(out.inputsSnapshot).toMatchObject({ bodyweightKg: 72, heightCm: 178, age: 25, goal: 'build_muscle' });
  });
});

describe('N2: guardrails warn, never block', () => {
  it('fat below 20% of kcal warns on the fraction floor', () => {
    const w = macroGuardrailWarnings({ calories: 3000, proteinG: 160, fatG: 48 }, 72);
    expect(w).toContain('fat-below-kcal-fraction');
  });

  it('fat below 0.6 g/kg warns on the per-kg floor', () => {
    // 40 g at 72 kg = 0.56 g/kg; fraction is fine at 1800 kcal (20%).
    const w = macroGuardrailWarnings({ calories: 1800, proteinG: 160, fatG: 40 }, 72);
    expect(w).toContain('fat-below-per-kg');
    expect(w).not.toContain('fat-below-kcal-fraction');
  });

  it('protein below 1.2 g/kg warns', () => {
    const w = macroGuardrailWarnings({ calories: 2600, proteinG: 80, fatG: 80 }, 72);
    expect(w).toEqual(['protein-below-per-kg']);
  });

  it('a sane target earns no warnings', () => {
    const w = macroGuardrailWarnings({ calories: 2600, proteinG: 160, fatG: 80 }, 72);
    expect(w).toEqual([]);
  });

  it('without bodyweight only the fraction floor can run', () => {
    const w = macroGuardrailWarnings({ calories: 2600, proteinG: 10, fatG: 80 }, null);
    expect(w).toEqual([]);
  });

  it('the constants are the documented floors', () => {
    expect(FAT_MIN_FRACTION_OF_KCAL).toBe(0.2);
    expect(FAT_MIN_G_PER_KG).toBe(0.6);
    expect(PROTEIN_MIN_G_PER_KG).toBe(1.2);
  });
});
