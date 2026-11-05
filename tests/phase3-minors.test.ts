/**
 * Phase 3, Task 3.1 — minors (13–17) are MAINTENANCE-ONLY.
 *
 * Coverage map:
 *  - the age band itself and the boundary birthdays (turning 13
 *    today = minor; turning 18 today = adult; one day short of 13
 *    = under-13, which every entry point rejects);
 *  - the derivation engine (calculateRecommendedMacroGoals) for
 *    ages 12 / 13 / 17 / 18 across every goal;
 *  - the engine helpers in lib/minor-targets.ts;
 *  - the store write path (setMacroGoals clamp) and the DOB
 *    re-evaluation in setProfile (into the band, out of the band,
 *    and no-change writes);
 *  - the coach-action executor's blocked state;
 *  - the deterministic coach suggestion guard;
 *  - the coach-chat system prompt's MINOR ATHLETE rule + the age
 *    line in the grounded context.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { calculateAgeFromDob, dobPickerBounds } from '../src/lib/age';
import {
  calculateMaintenanceCalories,
  calculateRecommendedMacroGoals,
} from '../src/lib/macros';
import {
  clampGoalsToMinorMaintenance,
  enforceMinorMacroGoals,
  isMinorAge,
  minorMaintenanceFor,
  MINOR_MAINTENANCE_TOLERANCE_KCAL,
} from '../src/lib/minor-targets';
import { suggestCalorieAdjustment, type WeightTrend } from '../src/lib/coach-engine';
import { applyMacroGoalsAction } from '../src/lib/coach-action-executor';
import {
  buildCoachChatContext,
  buildCoachChatSystemPrompt,
  type CoachChatUserData,
} from '../src/lib/coach-chat';
import { useStore } from '../src/lib/store';
import type { MacroGoals, UserProfile } from '../src/lib/types';

const BW = 60;
const HEIGHT = 175;

function maintenance(age: number): number {
  return calculateMaintenanceCalories(BW, 'male', HEIGHT, age, 'light');
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u-phase3',
    name: 'Test Athlete',
    gender: 'male',
    bodyweightKg: BW,
    bodyweightLbs: 132.3,
    heightCm: HEIGHT,
    age: 25,
    unit: 'kg',
    createdAt: '2026-01-01T00:00:00.000Z',
    goals: ['build_muscle'],
    bodyweightSource: 'user',
    heightSource: 'user',
    ...overrides,
  };
}

function seedStore(overrides: Record<string, unknown> = {}) {
  useStore.setState({
    profile: makeProfile(),
    macroGoals: null,
    trainingProfile: { activityLevel: 'light' },
    goals: ['build_muscle'],
    bodyMetrics: [],
    ...overrides,
  } as never);
}

beforeEach(() => seedStore());

// ─────────────────────────────────────────────────────────────────────────────
// The band + boundary birthdays (ages 12 / 13 / 17 / 18)
// ─────────────────────────────────────────────────────────────────────────────

describe('isMinorAge: the 13–17 band', () => {
  it.each([
    [12, false],
    [13, true],
    [15, true],
    [17, true],
    [18, false],
    [40, false],
  ])('age %i → minor %s', (age, expected) => {
    expect(isMinorAge(age)).toBe(expected);
  });

  it('unknown ages are not minors', () => {
    expect(isMinorAge(undefined)).toBe(false);
    expect(isMinorAge(null)).toBe(false);
    expect(isMinorAge(NaN)).toBe(false);
  });
});

describe('boundary birthdays (today = 2026-11-05, local)', () => {
  const TODAY = new Date(2026, 10, 5);

  it('turning 13 today → age 13 → minor band', () => {
    const age = calculateAgeFromDob('2013-11-05', TODAY);
    expect(age).toBe(13);
    expect(isMinorAge(age)).toBe(true);
  });

  it('one day short of 13 → age 12 → under-13 (rejected at entry)', () => {
    const age = calculateAgeFromDob('2013-11-06', TODAY);
    expect(age).toBe(12);
    expect(isMinorAge(age)).toBe(false);
    // The DOB picker itself cannot select an under-13 date: its max
    // is exactly the 13-years-ago boundary.
    expect(dobPickerBounds(TODAY).max).toBe('2013-11-05');
  });

  it('turning 18 today → age 18 → adult, band left', () => {
    const age = calculateAgeFromDob('2008-11-05', TODAY);
    expect(age).toBe(18);
    expect(isMinorAge(age)).toBe(false);
  });

  it('one day short of 18 → age 17 → still a minor', () => {
    const age = calculateAgeFromDob('2008-11-06', TODAY);
    expect(age).toBe(17);
    expect(isMinorAge(age)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Derivation engine: maintenance for minors, unchanged for adults
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateRecommendedMacroGoals: minor clamp in the engine', () => {
  it.each([13, 15, 17])(
    'age %i: every goal derives to maintenance',
    (age) => {
      for (const goal of ['build_muscle', 'get_stronger', 'lose_fat', 'stamina', 'general_fitness'] as const) {
        const rec = calculateRecommendedMacroGoals(BW, goal, 'male', HEIGHT, age, 'light');
        expect(rec.maintenanceCalories).toBe(maintenance(age));
        expect(Math.abs((rec.calories ?? 0) - (rec.maintenanceCalories ?? 0))).toBeLessThanOrEqual(
          MINOR_MAINTENANCE_TOLERANCE_KCAL
        );
        expect(rec.calorieDelta).toBe(0);
      }
    }
  );

  it('age 12: engine defense — even an under-13 record gets maintenance, never a surplus/deficit', () => {
    for (const goal of ['build_muscle', 'lose_fat'] as const) {
      const rec = calculateRecommendedMacroGoals(BW, goal, 'male', HEIGHT, 12, 'light');
      expect(Math.abs((rec.calories ?? 0) - (rec.maintenanceCalories ?? 0))).toBeLessThanOrEqual(
        MINOR_MAINTENANCE_TOLERANCE_KCAL
      );
    }
  });

  it('age 18: adult rules return the same day the band is left', () => {
    const bulk = calculateRecommendedMacroGoals(BW, 'build_muscle', 'male', HEIGHT, 18, 'light');
    expect(bulk.calories).toBeGreaterThan(maintenance(18) + 100);
    const cut = calculateRecommendedMacroGoals(BW, 'lose_fat', 'male', HEIGHT, 18, 'light');
    expect(cut.calories).toBeLessThan(maintenance(18) - 100);
  });

  it('protein stays goal-driven for minors (it is not an energy target)', () => {
    expect(calculateRecommendedMacroGoals(BW, 'build_muscle', 'male', HEIGHT, 15, 'light').proteinG).toBe(108);
    expect(calculateRecommendedMacroGoals(BW, 'lose_fat', 'male', HEIGHT, 15, 'light').proteinG).toBe(132);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Engine helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('minor-targets helpers', () => {
  it('minorMaintenanceFor computes only for minors with real stats', () => {
    expect(minorMaintenanceFor(makeProfile({ age: 16 }), 'light')).toBe(maintenance(16));
    expect(minorMaintenanceFor(makeProfile({ age: 25 }), 'light')).toBeNull();
    expect(minorMaintenanceFor(makeProfile({ age: 12 }), 'light')).toBeNull();
    expect(
      minorMaintenanceFor(makeProfile({ age: 16, bodyweightSource: 'default' }), 'light')
    ).toBeNull();
    expect(minorMaintenanceFor(null, 'light')).toBeNull();
  });

  it('clamp brings an off-band target onto maintenance, preserving protein', () => {
    const m = maintenance(16);
    const goals: MacroGoals = {
      calories: m + 500,
      proteinG: 108,
      carbsG: 400,
      fatG: 90,
      maintenanceCalories: m,
      calorieDelta: 500,
    };
    const clamped = clampGoalsToMinorMaintenance(goals, m);
    expect(Math.abs(clamped.calories - m)).toBeLessThanOrEqual(MINOR_MAINTENANCE_TOLERANCE_KCAL);
    expect(clamped.proteinG).toBe(108);
    expect(clamped.maintenanceCalories).toBe(m);
    expect(clamped.calorieDelta).toBe(0);
  });

  it('clamp is a no-op (same reference) inside the band — enforcement cannot drift numbers', () => {
    const m = maintenance(16);
    const goals: MacroGoals = { calories: m, proteinG: 108, carbsG: 200, fatG: 60, maintenanceCalories: m };
    expect(clampGoalsToMinorMaintenance(goals, m)).toBe(goals);
  });

  it('enforce passes adults, placeholder-stat minors, and null through verbatim', () => {
    const goals: MacroGoals = { calories: 3000, proteinG: 150, carbsG: 300, fatG: 90 };
    expect(enforceMinorMacroGoals(goals, makeProfile({ age: 25 }), 'light')).toBe(goals);
    expect(
      enforceMinorMacroGoals(goals, makeProfile({ age: 16, heightSource: 'default' }), 'light')
    ).toBe(goals);
    expect(enforceMinorMacroGoals(null, makeProfile({ age: 16 }), 'light')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Store write path: setMacroGoals
// ─────────────────────────────────────────────────────────────────────────────

describe('store.setMacroGoals: the write-path clamp', () => {
  it('a minor cannot save an off-band target through the setter', () => {
    seedStore({ profile: makeProfile({ age: 16 }) });
    const m = maintenance(16);
    useStore.getState().setMacroGoals({
      calories: m - 600,
      proteinG: 108,
      carbsG: 150,
      fatG: 50,
      maintenanceCalories: m,
    });
    const stored = useStore.getState().macroGoals;
    expect(stored).not.toBeNull();
    expect(Math.abs((stored?.calories ?? 0) - m)).toBeLessThanOrEqual(
      MINOR_MAINTENANCE_TOLERANCE_KCAL
    );
    expect(stored?.proteinG).toBe(108);
  });

  it('an adult saves the same numbers verbatim', () => {
    seedStore({ profile: makeProfile({ age: 25 }) });
    const goals: MacroGoals = { calories: 1900, proteinG: 150, carbsG: 180, fatG: 60 };
    useStore.getState().setMacroGoals(goals);
    expect(useStore.getState().macroGoals).toEqual(goals);
  });

  it('clearing targets (null) stays allowed for a minor', () => {
    seedStore({ profile: makeProfile({ age: 16 }), macroGoals: { calories: 2000, proteinG: 100 } });
    useStore.getState().setMacroGoals(null);
    expect(useStore.getState().macroGoals).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Store setProfile: DOB re-evaluation
// ─────────────────────────────────────────────────────────────────────────────

describe('store.setProfile: entering / leaving the band re-evaluates targets', () => {
  it('editing DOB into the band (25 → 16) clamps stored surplus targets to maintenance', () => {
    const adult = makeProfile({ age: 25 });
    const surplus = calculateRecommendedMacroGoals(BW, 'build_muscle', 'male', HEIGHT, 25, 'light');
    expect(surplus.calories).toBeGreaterThan(maintenance(25) + 100);
    seedStore({ profile: adult, macroGoals: surplus });

    useStore.getState().setProfile({ ...adult, age: 16, dateOfBirth: '2010-03-01' });

    const stored = useStore.getState().macroGoals;
    expect(Math.abs((stored?.calories ?? 0) - maintenance(16))).toBeLessThanOrEqual(
      MINOR_MAINTENANCE_TOLERANCE_KCAL
    );
    expect(stored?.calorieDelta).toBe(0);
  });

  it('leaving the band (16 → 18) recomputes targets under adult rules', () => {
    const minor = makeProfile({ age: 16 });
    const minorGoals = calculateRecommendedMacroGoals(BW, 'build_muscle', 'male', HEIGHT, 16, 'light');
    seedStore({ profile: minor, macroGoals: minorGoals });

    useStore.getState().setProfile({ ...minor, age: 18, dateOfBirth: '2008-03-01' });

    const stored = useStore.getState().macroGoals;
    expect(stored?.calories).toBeGreaterThan(maintenance(18) + 100);
    expect(stored?.maintenanceCalories).toBe(maintenance(18));
  });

  it('an unrelated profile write (unit toggle) leaves adult targets untouched', () => {
    const adult = makeProfile({ age: 25 });
    const goals: MacroGoals = { calories: 2750, proteinG: 160, carbsG: 300, fatG: 80 };
    seedStore({ profile: adult, macroGoals: goals });

    useStore.getState().setProfile({ ...adult, unit: 'lbs' });

    expect(useStore.getState().macroGoals).toEqual(goals);
  });

  it('a minor with NO stored goals keeps none (derivation surfaces handle display)', () => {
    const adult = makeProfile({ age: 25 });
    seedStore({ profile: adult, macroGoals: null });
    useStore.getState().setProfile({ ...adult, age: 15, dateOfBirth: '2011-03-01' });
    expect(useStore.getState().macroGoals).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coach-action executor: blocked state
// ─────────────────────────────────────────────────────────────────────────────

describe('executor: minor maintenance guard', () => {
  const minorGoals = () =>
    calculateRecommendedMacroGoals(BW, 'build_muscle', 'male', HEIGHT, 16, 'light');

  it('an off-band calorie action for a minor is blocked and writes nothing', () => {
    const goals = minorGoals();
    seedStore({ profile: makeProfile({ age: 16 }), macroGoals: { ...goals } });
    const m = goals.maintenanceCalories as number;

    const result = applyMacroGoalsAction(
      { type: 'set_macro_goals', calories: m - 400 },
      { ...goals }
    );
    expect(result).toEqual({ ok: false, stale: false, blocked: 'minor-maintenance-only' });
    expect(useStore.getState().macroGoals).toEqual(goals);
  });

  it('a maintenance-level calorie action for a minor applies', () => {
    const goals = minorGoals();
    seedStore({ profile: makeProfile({ age: 16 }), macroGoals: { ...goals } });
    const result = applyMacroGoalsAction(
      { type: 'set_macro_goals', calories: goals.calories },
      { ...goals }
    );
    expect(result.ok).toBe(true);
  });

  it('a gram-only action for a minor applies (calorie target untouched)', () => {
    const goals = minorGoals();
    seedStore({ profile: makeProfile({ age: 16 }), macroGoals: { ...goals } });
    const result = applyMacroGoalsAction(
      { type: 'set_macro_goals', proteinG: 120 },
      { ...goals }
    );
    expect(result.ok).toBe(true);
    expect(useStore.getState().macroGoals?.calories).toBe(goals.calories);
    expect(useStore.getState().macroGoals?.proteinG).toBe(120);
  });

  it('the same off-band action for an adult applies normally', () => {
    const goals: MacroGoals = { calories: 2500, proteinG: 150, carbsG: 260, fatG: 80, maintenanceCalories: 2400 };
    seedStore({ profile: makeProfile({ age: 25 }), macroGoals: { ...goals } });
    const result = applyMacroGoalsAction(
      { type: 'set_macro_goals', calories: 2000 },
      { ...goals }
    );
    expect(result.ok).toBe(true);
    expect(useStore.getState().macroGoals?.calories).toBe(2000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic coach suggestion guard
// ─────────────────────────────────────────────────────────────────────────────

describe('suggestCalorieAdjustment: minors always hold at maintenance', () => {
  const flatTrend: WeightTrend = {
    slopeKgPerWeek: 0,
    rSquared: 0.9,
    dataPoints: 12,
    spanDays: 35,
    direction: 'flat',
    startWeightKg: 60,
    currentWeightKg: 60,
  };
  const targets: MacroGoals = { calories: 2100, proteinG: 130, carbsG: 220, fatG: 65 };

  it('minor + fat-loss goal + flat trend → hold, never the −125 trim an adult gets', () => {
    const minor = suggestCalorieAdjustment(flatTrend, 'lose_fat', targets, 'male', 16);
    expect(minor.action).toBe('hold');
    expect(minor.deltaKcal).toBe(0);
    expect(minor.newCalories).toBe(2100);
    expect(minor.reasonI18n?.key).toBe('coachDigest.calMinorHold');

    const adult = suggestCalorieAdjustment(flatTrend, 'lose_fat', targets, 'male', 25);
    expect(adult.action).toBe('decrease');
  });

  it('minor + muscle goal + flat trend → hold, never the +100 fuel-up', () => {
    const minor = suggestCalorieAdjustment(flatTrend, 'build_muscle', targets, 'male', 13);
    expect(minor.action).toBe('hold');
    expect(minor.newCalories).toBe(2100);
  });

  it('age 18 is an adult to the suggestion engine', () => {
    const adult = suggestCalorieAdjustment(flatTrend, 'build_muscle', targets, 'male', 18);
    expect(adult.action).toBe('increase');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coach chat: prompt rule + context age line
// ─────────────────────────────────────────────────────────────────────────────

describe('coach chat: MINOR ATHLETE rule', () => {
  it('the system prompt carries the rule only when the minor flag is set', () => {
    const minorPrompt = buildCoachChatSystemPrompt({ language: 'en', hasData: true, minor: true });
    expect(minorPrompt).toContain('MINOR ATHLETE');
    expect(minorPrompt).toContain('maintenance');
    const adultPrompt = buildCoachChatSystemPrompt({ language: 'en', hasData: true });
    expect(adultPrompt).not.toContain('MINOR ATHLETE');
  });

  it('the grounded context shows the age when provided', () => {
    const data: CoachChatUserData = {
      userName: 'Kid',
      ageYears: 16,
      bodyweightKg: 60,
      unit: 'kg',
      goal: null,
      experience: null,
      daysPerWeek: null,
      athleteFacts: [],
      lifts: [],
      painEpisodes: [],
      flaggedFamilies: [],
      activeBlock: null,
      adoptedPlanNames: [],
      todaySession: null,
      recentWorkouts: [],
      prs: [],
      readiness: null,
      perMuscle: [],
      weeklyReviews: [],
      mealsToday: null,
      macroGoals: null,
      bodyMetricsLatest: null,
      checkinToday: null,
    };
    expect(buildCoachChatContext(data).contextText).toContain('Age: 16');
  });
});
