/**
 * Task 1.1 (2026-11-05): calorie targets must never be computed from
 * placeholder body stats.
 *
 * The defect: onboarding's simplified flow never asked weight/height
 * but seeded macro goals from ONBOARDING_DEFAULTS (70 kg / 175 cm),
 * and derivation surfaces (Today strip, Fuel, coach) happily computed
 * "personal" targets from those placeholders for users who skipped.
 *
 * The fix, covered here:
 *  - Profile carries body-stat provenance ('user' | 'default'); a
 *    missing flag (pre-change profile) counts as REAL — those users
 *    may genuinely have 70 kg stored from the manual Fuel prompt.
 *  - Derivation (effectiveMacroGoals) returns null when stats are
 *    placeholders and no stored goals exist; stored goals always win.
 *  - Validation/conversion for the new onboarding inputs follows the
 *    Body Metrics ranges (30–300 kg, 100–250 cm).
 *  - Later saves flip provenance to 'user' (updateBodyMetrics), which
 *    is what makes a target appear for a user who skipped onboarding
 *    stats.
 *  - Coach macro drafts: applying one must not complete the goal set
 *    from a placeholder-derived base (executor blocked result).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  hasRealBodyStats,
  heightIsReal,
  toStoredBodyStats,
  validateBodyStats,
  weightIsReal,
} from '../src/lib/body-stats';
import { effectiveMacroGoals } from '../src/lib/effective-goals';
import { calculateRecommendedMacroGoals } from '../src/lib/macros';
import { applyMacroGoalsAction } from '../src/lib/coach-action-executor';
import { useStore } from '../src/lib/store';
import type { UserProfile } from '../src/lib/types';

function profileWith(overrides: Partial<UserProfile>): UserProfile {
  return {
    id: 'guest_test',
    name: 'Test',
    gender: 'male',
    bodyweightKg: 70,
    bodyweightLbs: 154.3,
    heightCm: 175,
    unit: 'kg',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as UserProfile;
}

describe('body-stat provenance', () => {
  it('null profile has no real stats', () => {
    expect(hasRealBodyStats(null)).toBe(false);
    expect(weightIsReal(null)).toBe(false);
    expect(heightIsReal(undefined)).toBe(false);
  });

  it('legacy profiles (no provenance flags) count as real', () => {
    const legacy = profileWith({});
    expect(legacy.bodyweightSource).toBeUndefined();
    expect(hasRealBodyStats(legacy)).toBe(true);
  });

  it("either stat flagged 'default' makes the pair not real", () => {
    expect(hasRealBodyStats(profileWith({ bodyweightSource: 'default' }))).toBe(false);
    expect(hasRealBodyStats(profileWith({ heightSource: 'default' }))).toBe(false);
    expect(hasRealBodyStats(profileWith({ bodyweightSource: 'default', heightSource: 'default' }))).toBe(false);
  });

  it("both stats flagged 'user' are real", () => {
    expect(hasRealBodyStats(profileWith({ bodyweightSource: 'user', heightSource: 'user' }))).toBe(true);
  });
});

describe('validateBodyStats (Body Metrics ranges)', () => {
  it('accepts in-range metric values', () => {
    expect(validateBodyStats(70, 175, 'kg')).toBeNull();
    expect(validateBodyStats(30, 100, 'kg')).toBeNull();
    expect(validateBodyStats(300, 250, 'kg')).toBeNull();
  });

  it('rejects out-of-range weight and height in metric', () => {
    expect(validateBodyStats(29.9, 175, 'kg')).toBe('weight');
    expect(validateBodyStats(300.1, 175, 'kg')).toBe('weight');
    expect(validateBodyStats(70, 99, 'kg')).toBe('height');
    expect(validateBodyStats(70, 251, 'kg')).toBe('height');
  });

  it('validates imperial input against the imperial ranges', () => {
    expect(validateBodyStats(154, 69, 'lbs')).toBeNull();
    expect(validateBodyStats(65, 69, 'lbs')).toBe('weight');
    expect(validateBodyStats(661, 69, 'lbs')).toBe('weight');
    expect(validateBodyStats(154, 38, 'lbs')).toBe('height');
    expect(validateBodyStats(154, 99, 'lbs')).toBe('height');
  });

  it('rejects non-finite input', () => {
    expect(validateBodyStats(Number.NaN, 175, 'kg')).toBe('weight');
    expect(validateBodyStats(70, Number.POSITIVE_INFINITY, 'kg')).toBe('height');
  });
});

describe('toStoredBodyStats', () => {
  it('stores metric input canonically', () => {
    expect(toStoredBodyStats(80, 180, 'kg')).toEqual({
      bodyweightKg: 80,
      bodyweightLbs: 176.4,
      heightCm: 180,
    });
  });

  it('converts imperial input to canonical kg/cm', () => {
    const stored = toStoredBodyStats(176.4, 70.9, 'lbs');
    expect(stored.bodyweightKg).toBe(80);
    expect(stored.bodyweightLbs).toBe(176.4);
    expect(stored.heightCm).toBe(180);
  });
});

describe('effectiveMacroGoals gating', () => {
  const storedGoals = { calories: 2400, proteinG: 150, carbsG: 260, fatG: 75 };

  it('stored goals always win — even over placeholder stats', () => {
    const p = profileWith({ bodyweightSource: 'default', heightSource: 'default' });
    expect(effectiveMacroGoals(storedGoals, p)).toEqual(storedGoals);
  });

  it('no stored goals + placeholder stats → NO target', () => {
    const p = profileWith({ bodyweightSource: 'default', heightSource: 'default' });
    expect(effectiveMacroGoals(null, p)).toBeNull();
  });

  it('no stored goals + real stats → target derived from the real stats', () => {
    const p = profileWith({
      bodyweightKg: 82,
      heightCm: 181,
      bodyweightSource: 'user',
      heightSource: 'user',
    });
    expect(effectiveMacroGoals(null, p)).toEqual(
      calculateRecommendedMacroGoals(82, 'build_muscle', 'male', 181, undefined, undefined)
    );
  });

  it('no stored goals + legacy profile → target still derived (no regression)', () => {
    const p = profileWith({});
    expect(effectiveMacroGoals(null, p)).not.toBeNull();
  });

  it('no profile and no goals → null', () => {
    expect(effectiveMacroGoals(null, null)).toBeNull();
  });
});

describe('coach macro draft apply gating (executor)', () => {
  beforeEach(() => {
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  function seedState(profile: UserProfile | null, macroGoals: unknown) {
    useStore.setState({ profile, macroGoals } as never);
  }

  it('partial draft + placeholder stats + no stored goals → blocked, nothing written', () => {
    seedState(profileWith({ bodyweightSource: 'default', heightSource: 'default' }), null);
    const result = applyMacroGoalsAction({ type: 'set_macro_goals', proteinG: 150 }, null);
    expect(result).toEqual({ ok: false, stale: false, blocked: 'needs-body-stats' });
    expect(useStore.getState().macroGoals).toBeNull();
  });

  it('draft naming calories + protein applies with ONLY the named fields', () => {
    seedState(profileWith({ bodyweightSource: 'default', heightSource: 'default' }), null);
    const result = applyMacroGoalsAction(
      { type: 'set_macro_goals', calories: 2600, proteinG: 160 },
      null
    );
    expect(result.ok).toBe(true);
    const goals = useStore.getState().macroGoals;
    expect(goals?.calories).toBe(2600);
    expect(goals?.proteinG).toBe(160);
    // No derived fill from placeholder stats.
    expect(goals?.carbsG).toBeUndefined();
    expect(goals?.fatG).toBeUndefined();
    expect(goals?.maintenanceCalories).toBeUndefined();
  });

  it('partial draft + real stats + no stored goals → recommended base fills the rest', () => {
    seedState(profileWith({ bodyweightSource: 'user', heightSource: 'user' }), null);
    const result = applyMacroGoalsAction({ type: 'set_macro_goals', proteinG: 170 }, null);
    expect(result.ok).toBe(true);
    const goals = useStore.getState().macroGoals;
    expect(goals?.proteinG).toBe(170);
    expect(goals?.calories).toBeGreaterThan(0);
  });

  it('draft over STORED goals applies even when stats are placeholders (user-owned goals win)', () => {
    const stored = { calories: 2400, proteinG: 150, carbsG: 260, fatG: 75 };
    seedState(profileWith({ bodyweightSource: 'default', heightSource: 'default' }), stored);
    const result = applyMacroGoalsAction({ type: 'set_macro_goals', proteinG: 165 }, stored);
    expect(result.ok).toBe(true);
    expect(useStore.getState().macroGoals?.proteinG).toBe(165);
    expect(useStore.getState().macroGoals?.calories).toBe(2400);
  });
});

describe('later stat saves flip provenance (skip → target appears)', () => {
  beforeEach(() => {
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    };
    useStore.setState({
      profile: profileWith({ bodyweightSource: 'default', heightSource: 'default' }),
      macroGoals: null,
      bodyMetrics: [],
    } as never);
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  it('before any save: no derived target', () => {
    const { profile, macroGoals } = useStore.getState();
    expect(effectiveMacroGoals(macroGoals, profile)).toBeNull();
  });

  it('updateBodyMetrics marks the stats user-entered and the target appears', () => {
    useStore.getState().updateBodyMetrics(84, 182);
    const { profile, macroGoals } = useStore.getState();
    expect(profile?.bodyweightKg).toBe(84);
    expect(profile?.heightCm).toBe(182);
    expect(profile?.bodyweightSource).toBe('user');
    expect(profile?.heightSource).toBe('user');
    expect(effectiveMacroGoals(macroGoals, profile)).not.toBeNull();
  });
});
