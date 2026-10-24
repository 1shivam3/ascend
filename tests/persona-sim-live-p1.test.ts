/**
 * LIVE-P1 FIXES — tests for the 4 defects found by the real browser
 * tap-through of the Round 5 preview (guest onboarding: Beginner /
 * 4 days / Full gym / 70 kg / 175 cm).
 *
 * P1-1 blank optional weight · P1-2 fake 1 kcal fat-loss target ·
 * P1-3 Hindi leaks on Today · P1-4 silent body-measurement save.
 *
 * Rendered-English equality is the core guarantee for P1-3: every
 * converted coach sentence, rendered through the i18n system in
 * English, must be identical to the stored English text — except the
 * adherence headline, where the fix is INTENTIONALLY different
 * (capitalized weekday: the P2 "monday" fix).
 */
import { describe, it, expect } from 'vitest';
import { validatePlanExercises } from '../src/lib/plan-validation';
import {
  calculateRecommendedMacroGoals,
  normalizeCalorieDelta,
} from '../src/lib/macros';
import { hasBodyMetricChanges } from '../src/components/BodyMetricsModal';
import {
  generateCheckIn,
  generateCheckInDetails,
  suggestCalorieAdjustment,
  adjustNextTargets,
  type PlannedTarget,
} from '../src/lib/coach-engine';
import { getProteinGapSuggestion } from '../src/lib/nutrition-coach';
import { buildWeeklyReview, buildBlockDebrief, type WeeklyReviewInput } from '../src/lib/weekly-review';
import { getInitialCoachBlocksState, deriveAdoptionSchemes } from '../src/lib/block-engine';
import { getLevelName, getLevelNameKey } from '../src/lib/xp-system';
import { monthlyChallenges } from '../src/lib/challenges';
import { translate } from '../src/lib/i18n';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';
import {
  renderLocalizedSentence,
  formatCheckInList,
  dayOfWeekId,
} from '../src/lib/coach-i18n';
import type { PlannedWorkout, WeeklySchedule, WorkoutEntry, WorkoutExercise, WorkoutSet } from '../src/lib/types';
import type { AthleteModel } from '../src/lib/athlete-model';
import type { StallFlag } from '../src/lib/coach-engine';

// English / Hindi renderers over the real dictionaries.
const tEn = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate('en', key, params);
const tHi = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate('hi', key, params);
const renderEn = (s: Parameters<typeof renderLocalizedSentence>[2], fallback: string) =>
  renderLocalizedSentence(tEn, 'en', s, fallback);
const renderHi = (s: Parameters<typeof renderLocalizedSentence>[2], fallback: string) =>
  renderLocalizedSentence(tHi, 'hi', s, fallback);

// ── P1-1: blank optional weight ──────────────────────────────────────────────

describe('LIVE-P1-01 blank optional weight', () => {
  const squat = (weight: unknown) => ({
    name: 'Squat',
    targetSets: 3,
    targetReps: 8,
    targetWeight: weight,
  }) as unknown as PlannedWorkout['exercises'][number];

  it('blank weight (undefined / null / empty string) is valid', () => {
    for (const w of [undefined, null, '']) {
      const r = validatePlanExercises([squat(w)]);
      expect(r.ok).toBe(true);
    }
  });

  it('zero weight is valid (a real prescribed load)', () => {
    expect(validatePlanExercises([squat(0)]).ok).toBe(true);
  });

  it('a present negative or non-numeric weight still fails', () => {
    const neg = validatePlanExercises([squat(-5)]);
    expect(neg.ok).toBe(false);
    if (!neg.ok) {
      expect(neg.error).toEqual({ name: 'Squat', kind: 'weight' });
    }
    expect(validatePlanExercises([squat('abc')]).ok).toBe(false);
  });

  it('sets / reps rules are preserved', () => {
    const sets = validatePlanExercises([{ name: 'Squat', targetSets: 0, targetReps: 8 } as never]);
    expect(sets.ok).toBe(false);
    if (!sets.ok) expect(sets.error.kind).toBe('sets');
    const reps = validatePlanExercises([{ name: 'Squat', targetSets: 3, targetReps: 0 } as never]);
    expect(reps.ok).toBe(false);
    if (!reps.ok) expect(reps.error.kind).toBe('reps');
  });
});

// ── P1-2: fake fat-loss target ───────────────────────────────────────────────

describe('LIVE-P1-02 calorie delta rounding band', () => {
  it('normalizes rounding noise (|delta| <= 10) to zero', () => {
    expect(normalizeCalorieDelta(0)).toBe(0);
    expect(normalizeCalorieDelta(1)).toBe(0);
    expect(normalizeCalorieDelta(-1)).toBe(0);
    expect(normalizeCalorieDelta(10)).toBe(0);
    expect(normalizeCalorieDelta(-10)).toBe(0);
    expect(normalizeCalorieDelta(NaN)).toBe(0);
    expect(normalizeCalorieDelta(Infinity)).toBe(0);
  });

  it('leaves real deficits / surpluses untouched', () => {
    expect(normalizeCalorieDelta(11)).toBe(11);
    expect(normalizeCalorieDelta(-11)).toBe(-11);
    expect(normalizeCalorieDelta(-451)).toBe(-451);
    expect(normalizeCalorieDelta(100)).toBe(100);
  });

  it('guest General Fitness (70 kg / male / 175 cm / 25 y / light) reads as maintenance, not fat loss', () => {
    const goals = calculateRecommendedMacroGoals(70, 'general_fitness', 'male', 175, 25, 'light');
    expect(goals.calories).toBe(2300);
    expect(goals.maintenanceCalories).toBe(2301);
    expect(goals.calorieDelta).toBe(0);
  });

  it('an explicit fat-loss goal for the same guest gets a real standard deficit', () => {
    const goals = calculateRecommendedMacroGoals(70, 'lose_fat', 'male', 175, 25, 'light');
    expect(goals.maintenanceCalories).toBe(2301);
    // 20% of maintenance, capped at 450 kcal — a real deficit, not 1 kcal.
    expect(goals.calories).toBeLessThan(goals.maintenanceCalories! - 300);
    expect(goals.calorieDelta).toBeLessThanOrEqual(-300);
    expect(goals.calorieDelta).toBe(goals.calories - goals.maintenanceCalories!);
  });
});

// ── P1-4: body-measurement change detection ──────────────────────────────────

describe('LIVE-P1-04 hasBodyMetricChanges', () => {
  const guest = {
    weightKg: 70,
    heightCm: 175,
    bodyFatPct: undefined,
    chestIn: undefined,
    waistIn: undefined,
    hipsIn: undefined,
  };

  it('unchanged values (profile prefill) are not a change', () => {
    expect(hasBodyMetricChanges(guest, { ...guest })).toBe(false);
  });

  it('a blank height falling back to the profile height is not a change', () => {
    // The modal submits heightCm ?? profile.heightCm, so an untouched
    // height field arrives as the profile value, not as a new measurement.
    expect(hasBodyMetricChanges(guest, { ...guest, heightCm: 175 })).toBe(false);
  });

  it('store rounding applies (70.04 kg == 70.0 kg)', () => {
    expect(hasBodyMetricChanges(guest, { ...guest, weightKg: 70.04 })).toBe(false);
    expect(hasBodyMetricChanges(guest, { ...guest, weightKg: 70.1 })).toBe(true);
  });

  it('a changed weight or a newly entered circumference is a change', () => {
    expect(hasBodyMetricChanges(guest, { ...guest, weightKg: 71 })).toBe(true);
    expect(hasBodyMetricChanges(guest, { ...guest, chestIn: 40 })).toBe(true);
    expect(hasBodyMetricChanges(guest, { ...guest, bodyFatPct: 18 })).toBe(true);
  });
});

// ── P1-3: i18n parity for every new key ──────────────────────────────────────

const NEW_HOME_KEYS = [
  'home.adaptiveSplit',
  'home.quickLogPast',
  'home.restDayLine',
  'home.durationExercises',
  'home.details',
  'home.why',
  'home.doItToday',
  'home.nextSessionCalls',
  'home.coachSuggestsKcal',
  'home.medicalDisclaimer',
  'home.applyKcal',
  'home.missedOne',
  'home.missedMany',
  'home.streakOne',
  'home.streakMany',
  'home.streakStart',
  'home.freezesOne',
  'home.freezesMany',
  'home.freezeCovered',
  'home.hydrationToday',
  'home.toLevel',
  'home.joinChallenge',
  'home.todaysTraining',
  'home.scheduledToday',
  'home.workoutsWeek',
  'home.workoutsWeekOf',
  'home.changeWorkoutTitle',
  'home.changeWorkoutHint',
  'home.availableRoutines',
  'home.managePlans',
  'home.todaysPlan',
  'home.selectedForToday',
  'home.setAsToday',
  'home.noPlans',
  'home.setRestDay',
  'home.viewNutritionDetails',
  'home.viewProteinDetails',
  'home.athleteProfile',
  'home.dismissCheckin',
  'home.dismissSuggestion',
  'home.dismissChallenge',
  'home.viewReadinessDetails',
  'home.viewLevelDetails',
  'home.viewChallenges',
  'home.readinessPrimed',
  'home.readinessReady',
  'home.readinessEasy',
  'home.readinessRest',
  'home.monSun',
  'home.bodyPartChest',
  'home.bodyPartBack',
  'home.bodyPartLegs',
  'home.bodyPartShoulders',
  'home.bodyPartArms',
  'home.bodyPartCore',
  'home.bodyPartFullBody',
  'home.bodyPartConditioning',
] as const;

const NEW_PREFIXES = [
  'coachDigest.',
  'nutritionCoach.',
  'coachModel.fact',
  'chal.monthly',
  'level.name',
  'language.',
] as const;

const NEW_EXPLICIT_KEYS = [
  'weeklyReview.focusSafetyHeadline',
  'weeklyReview.painEscalation',
  'weeklyReview.focusAdherenceHeadline',
  'weeklyReview.focusAdherenceDetail',
  'weeklyReview.focusStallHeadline',
  'weeklyReview.focusStallDetail',
  'weeklyReview.focusProgressHeadline',
  'weeklyReview.focusProgressDetail',
  'weeklyReview.focusConsistencyHeadline',
  'weeklyReview.focusConsistencyDetailOne',
  'weeklyReview.focusConsistencyDetailMany',
  'weeklyReview.focusQuietHeadline',
  'weeklyReview.focusQuietDetail',
  'weeklyReview.debriefCompletion',
  'weeklyReview.debriefNoPlan',
  'settings.unitKg',
  'settings.unitLbs',
  'bodyMetrics.noChanges',
  'bodyMetrics.prefillHint',
] as const;

// 'language.hindi' is 'हिंदी' in both dictionaries by design.
const IDENTICAL_BY_DESIGN = new Set(['language.hindi']);

function newKeys(): string[] {
  const fromPrefixes = (Object.keys(en) as string[]).filter((k) =>
    NEW_PREFIXES.some((p) => k.startsWith(p))
  );
  return [...NEW_HOME_KEYS, ...NEW_EXPLICIT_KEYS, ...fromPrefixes];
}

describe('LIVE-P1-03 i18n parity for new keys', () => {
  it('every new key exists in both dictionaries', () => {
    const keys = newKeys();
    expect(keys.length).toBeGreaterThan(100);
    for (const key of keys) {
      expect((en as Record<string, string>)[key], `missing en key: ${key}`).toBeDefined();
      expect((hi as Record<string, string>)[key], `missing hi key: ${key}`).toBeDefined();
    }
  });

  it('every new Hindi value is Devanagari and differs from English (except by-design identicals)', () => {
    for (const key of newKeys()) {
      const hv = (hi as Record<string, string>)[key];
      const ev = (en as Record<string, string>)[key];
      expect(hv, `hi not Devanagari: ${key}`).toMatch(/[\u0900-\u097F]/);
      if (!IDENTICAL_BY_DESIGN.has(key)) {
        expect(hv, `hi identical to en: ${key}`).not.toBe(ev);
      }
    }
  });

  it('{param} sets match between en and hi for every new key', () => {
    const params = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
    for (const key of newKeys()) {
      const ev = (en as Record<string, string>)[key];
      const hv = (hi as Record<string, string>)[key];
      expect([...params(hv)].sort(), `param mismatch: ${key}`).toEqual([...params(ev)].sort());
    }
  });
});

// ── P1-3: rendered-English equality ──────────────────────────────────────────

describe('LIVE-P1-03 check-in sentences', () => {
  it('one missed session renders identically in English, localized in Hindi', () => {
    const missed = [{ date: '2026-10-12', name: 'Leg Day' }];
    const details = generateCheckInDetails(missed);
    expect(details.key).toBe('coachDigest.checkinOne');
    expect(details.sessions).toEqual([{ name: 'Leg Day', day: 'monday' }]);
    expect(tEn(details.key, { list: formatCheckInList(details.sessions, 'en') })).toBe(
      generateCheckIn(missed)
    );
    const hiText = tHi(details.key, { list: formatCheckInList(details.sessions, 'hi') });
    expect(hiText).toContain('सोमवार');
    expect(hiText).toContain('आज ही करें');
    expect(hiText).not.toContain('Do it today');
  });

  it('many missed sessions render identically in English, localized in Hindi', () => {
    const missed = [
      { date: '2026-10-12', name: 'Leg Day' },
      { date: '2026-10-14', name: 'Push Day' },
      { date: '2026-10-16', name: 'Pull Day' },
    ];
    const details = generateCheckInDetails(missed);
    expect(details.key).toBe('coachDigest.checkinMany');
    expect(tEn(details.key, { list: formatCheckInList(details.sessions, 'en') })).toBe(
      generateCheckIn(missed)
    );
    const hiText = tHi(details.key, { list: formatCheckInList(details.sessions, 'hi') });
    expect(hiText).toContain('सोमवार');
    expect(hiText).toContain('बुधवार');
    expect(hiText).toContain('शुक्रवार');
  });

  it('no missed sessions renders identically', () => {
    const details = generateCheckInDetails([]);
    expect(details.key).toBe('coachDigest.checkinNone');
    expect(tEn(details.key)).toBe(generateCheckIn([]));
  });

  it('dayOfWeekId and list joins follow language rules', () => {
    expect(dayOfWeekId('2026-10-12')).toBe('monday');
    expect(dayOfWeekId('2026-10-18')).toBe('sunday');
    expect(formatCheckInList([{ name: 'A', day: 'monday' }], 'en')).toBe('A (Monday)');
    expect(
      formatCheckInList(
        [
          { name: 'A', day: 'monday' },
          { name: 'B', day: 'tuesday' },
        ],
        'hi'
      )
    ).toBe('A (सोमवार) और B (मंगलवार)');
  });
});

describe('LIVE-P1-03 calorie suggestion sentences', () => {
  const flat = {
    slopeKgPerWeek: 0.05,
    rSquared: 0.1,
    dataPoints: 8,
    spanDays: 21,
    direction: 'flat' as const,
    startWeightKg: 85,
    currentWeightKg: 85.1,
  };
  const targets = { calories: 2200, proteinG: 170 } as never;

  const cases: Array<[string, Parameters<typeof suggestCalorieAdjustment>]> = [
    ['hold, not enough data', [{ ...flat, dataPoints: 2 }, 'general_fitness', targets, 'male']],
    ['lose sweet spot', [{ ...flat, direction: 'losing' as const, slopeKgPerWeek: -0.6 }, 'lose_fat', targets, 'male']],
    ['lose too fast', [{ ...flat, direction: 'losing' as const, slopeKgPerWeek: -1.4 }, 'lose_fat', targets, 'male']],
    ['lose flat', [flat, 'lose_fat', targets, 'male']],
    ['lose climbing', [{ ...flat, direction: 'gaining' as const, slopeKgPerWeek: 0.5 }, 'lose_fat', targets, 'male']],
    ['gain sweet spot', [{ ...flat, direction: 'gaining' as const, slopeKgPerWeek: 0.2 }, 'build_muscle', targets, 'male']],
    ['gain too fast', [{ ...flat, direction: 'gaining' as const, slopeKgPerWeek: 0.8 }, 'build_muscle', targets, 'male']],
    ['gain drift', [{ ...flat, direction: 'gaining' as const, slopeKgPerWeek: 0.4 }, 'build_muscle', targets, 'male']],
    ['grow flat', [flat, 'build_muscle', targets, 'male']],
    ['grow losing', [{ ...flat, direction: 'losing' as const, slopeKgPerWeek: -0.3 }, 'build_muscle', targets, 'male']],
    ['maint flat', [flat, 'general_fitness', targets, 'male']],
    ['maint gain', [{ ...flat, direction: 'gaining' as const, slopeKgPerWeek: 0.3 }, 'general_fitness', targets, 'male']],
    ['maint lose', [{ ...flat, direction: 'losing' as const, slopeKgPerWeek: -0.3 }, 'general_fitness', targets, 'male']],
    ['safe floor', [flat, 'lose_fat', { calories: 1550, proteinG: 150 } as never, 'male']],
  ];

  it.each(cases)('%s: English render equals the stored reason', (_name, args) => {
    const s = suggestCalorieAdjustment(...args);
    expect(s.reasonI18n).toBeDefined();
    expect(renderEn(s.reasonI18n, s.reason)).toBe(s.reason);
  });

  it('safe-floor case carries the floor struct', () => {
    const s = suggestCalorieAdjustment(flat, 'lose_fat', { calories: 1550, proteinG: 150 } as never, 'male');
    expect(s.atSafeMinimum).toBe(true);
    expect(s.reasonI18n?.key).toBe('coachDigest.calFloorHold');
  });

  it('a Hindi calorie render is Devanagari, not English', () => {
    const s = suggestCalorieAdjustment({ ...flat, direction: 'losing' as const, slopeKgPerWeek: -0.6 }, 'lose_fat', targets, 'male');
    const hiText = renderHi(s.reasonI18n, s.reason);
    expect(hiText).toMatch(/[\u0900-\u097F]/);
    expect(hiText).not.toContain('sweet spot');
  });
});

describe('LIVE-P1-03 next-target adjustment sentences', () => {
  const target = (exercise = 'Barbell Bench Press', weight = 80): PlannedTarget => ({
    exercise,
    weight,
    reps: 8,
    sets: 3,
    unit: 'kg',
  });
  const wset = (weight: number, reps: number, rpe: number, extra: Record<string, unknown> = {}): WorkoutSet =>
    ({ weight, reps, rpe, unit: 'kg', status: 'completed', isCompleted: true, ...extra }) as unknown as WorkoutSet;
  const wex = (name: string, sets: WorkoutSet[], extra: Record<string, unknown> = {}): WorkoutExercise =>
    ({ name, sets, ...extra }) as unknown as WorkoutExercise;
  const wentry = (date: string, exercises: WorkoutExercise[], extra: Record<string, unknown> = {}): WorkoutEntry =>
    ({ id: 'w', name: 'Session', date, duration: 60, exercises, ...extra }) as unknown as WorkoutEntry;

  const cases: Array<[string, WorkoutEntry, PlannedTarget[]]> = [
    [
      'back_off 5%',
      wentry('2026-10-12', [
        wex('Barbell Bench Press', [
          wset(80, 8, 9.5, { prescribedReps: 8 }),
          wset(80, 6, 10, { prescribedReps: 8 }),
          wset(80, 5, 10, { prescribedReps: 8 }),
        ]),
      ]),
      [target()],
    ],
    [
      'back_off 2.5%',
      wentry('2026-10-12', [
        wex('Barbell Bench Press', [wset(80, 8, 9.5), wset(80, 8, 9), wset(80, 8, 9.5)]),
      ]),
      [target()],
    ],
    [
      'push 5%',
      wentry('2026-10-12', [
        wex('Barbell Bench Press', [wset(80, 8, 6), wset(80, 8, 6), wset(80, 8, 5.5)]),
      ]),
      [target()],
    ],
    [
      'push 2.5%',
      wentry('2026-10-12', [
        wex('Barbell Bench Press', [wset(80, 8, 7), wset(80, 8, 7), wset(80, 8, 6.5)]),
      ]),
      [target()],
    ],
    [
      'hold',
      wentry('2026-10-12', [
        wex('Barbell Bench Press', [wset(80, 8, 8), wset(80, 8, 8.5), wset(80, 8, 8)]),
      ]),
      [target()],
    ],
    [
      'hold with missed reps',
      wentry('2026-10-12', [
        wex('Barbell Bench Press', [
          wset(80, 8, 8, { prescribedReps: 8 }),
          wset(80, 5, 8, { prescribedReps: 8 }),
        ]),
      ]),
      [target()],
    ],
    [
      'pain hold',
      wentry(
        '2026-10-12',
        [wex('Barbell Bench Press', [wset(80, 8, 6), wset(80, 8, 6)])],
        { reportsPain: true }
      ),
      [target()],
    ],
    [
      'rounding hold',
      wentry('2026-10-12', [
        wex('Barbell Bench Press', [wset(2.5, 8, 5), wset(2.5, 8, 5)]),
      ]),
      [target('Barbell Bench Press', 2.5)],
    ],
  ];

  it.each(cases)('%s: English render equals the stored reason', (_name, last, targets) => {
    const [adj] = adjustNextTargets(last, targets);
    expect(adj).toBeDefined();
    expect(adj.reasonI18n).toBeDefined();
    expect(renderEn(adj.reasonI18n, adj.reason)).toBe(adj.reason);
  });

  it('rounding hold is really a hold with the up key', () => {
    const last = wentry('2026-10-12', [
      wex('Barbell Bench Press', [wset(2.5, 8, 5), wset(2.5, 8, 5)]),
    ]);
    const [adj] = adjustNextTargets(last, [target('Barbell Bench Press', 2.5)]);
    expect(adj.action).toBe('hold');
    expect(adj.reasonI18n?.key).toBe('coachDigest.adjRoundingHoldUp');
  });

  it('a Hindi push render uses the Hindi exercise name', () => {
    const last = wentry('2026-10-12', [
      wex('Barbell Bench Press', [wset(80, 8, 6), wset(80, 8, 6), wset(80, 8, 5.5)]),
    ]);
    const [adj] = adjustNextTargets(last, [target()]);
    expect(renderHi(adj.reasonI18n, adj.reason)).toContain('बारबेल बेंच प्रेस');
  });
});

describe('LIVE-P1-03 protein coach sentences', () => {
  it.each([
    [40, 120],
    [100, 120],
    [80, 120],
  ])('gap %i → %i: English render equals the stored message', (logged, targetG) => {
    const s = getProteinGapSuggestion({ diet: 'vegetarian', proteinLoggedG: logged, proteinTargetG: targetG, hour: 19 });
    expect(s).not.toBeNull();
    expect(s!.messageI18n).toBeDefined();
    expect(['nutritionCoach.proteinGapFull', 'nutritionCoach.proteinGapMost', 'nutritionCoach.proteinGapPartial']).toContain(
      s!.messageI18n!.key
    );
    expect(renderEn(s!.messageI18n, s!.message)).toBe(s!.message);
  });

  it('a Hindi protein render keeps the food portion but localizes the sentence', () => {
    const s = getProteinGapSuggestion({ diet: 'vegetarian', proteinLoggedG: 40, proteinTargetG: 120, hour: 19 });
    const hiText = renderHi(s!.messageI18n, s!.message);
    expect(hiText).toMatch(/[\u0900-\u097F]/);
    expect(hiText).not.toContain('Protein is tracking low');
    // The food portion description itself is NOT translated.
    expect(hiText).toContain(s!.anchor.detail);
  });
});

// ── Weekly review focus + debrief ─────────────────────────────────────────────

const SCHEDULE: WeeklySchedule = {
  monday: { workoutPlanId: 'p1' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'p1' },
  thursday: { workoutPlanId: 'rest' },
  friday: { workoutPlanId: 'p1' },
  saturday: { workoutPlanId: 'rest' },
  sunday: { workoutPlanId: 'rest' },
};

function rwset(weight: number, reps: number) {
  return { reps, weight, unit: 'kg' as const, status: 'completed' as const, isCompleted: true };
}

function rwent(id: string, date: string, name: string, sets: ReturnType<typeof rwset>[]): WorkoutEntry {
  return { id, name: 'Session', date, duration: 60, exercises: [{ name, sets }] } as unknown as WorkoutEntry;
}

function estimate<T>(value: T, n = 6, tier: 'prior' | 'emerging' | 'established' = 'emerging') {
  return { value, n, tier, evidence: 'fixture' } as const;
}

function athleteModel(partial: Partial<AthleteModel> = {}): AthleteModel {
  const baseline = { value: 3, n: 0, tier: 'prior' as const, spread: 0, evidence: '' };
  return {
    version: 1,
    todayStr: '2026-10-22',
    workoutsAnalyzed: 40,
    checkinBaselines: { sleep: baseline, soreness: baseline, energy: baseline },
    lifts: [],
    recovery: [],
    adherence: {
      windowWeeks: 8,
      plannedSessions: 24,
      completedSessions: 20,
      unscheduledSessions: 0,
      adherenceRate: estimate(0.83),
      mostSkippedDay: null,
      mostTrainedDay: null,
    },
    pain: { episodes: [], episodesLast28dByFamily: {}, flaggedFamilies: [], recentPainExerciseKeys: [] },
    lowReadinessShare: estimate(0),
    topFacts: [],
    ...partial,
  } as AthleteModel;
}

function reviewInput(over: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput {
  return {
    anyDateInWeek: '2026-10-14',
    workouts: [],
    plannedWorkouts: [],
    weeklySchedule: SCHEDULE,
    athleteModel: null,
    coachBlocks: getInitialCoachBlocksState(),
    prs: [],
    dailyCheckins: {},
    policyRecords: [],
    stalls: [],
    unit: 'kg',
    bodyweightKg: 80,
    todayStr: '2026-10-22',
    ...over,
  };
}

describe('LIVE-P1-03 weekly review focus sentences', () => {
  const missedWeek = [rwent('a', '2026-10-12', 'Bench Press', [rwset(100, 5), rwset(100, 5), rwset(100, 5)])];
  const fullWeek = [
    rwent('a', '2026-10-12', 'Bench Press', [rwset(100, 5), rwset(100, 5), rwset(100, 5)]),
    rwent('b', '2026-10-14', 'Bench Press', [rwset(100, 5), rwset(100, 5), rwset(100, 5)]),
    rwent('c', '2026-10-16', 'Bench Press', [rwset(100, 5), rwset(100, 5), rwset(100, 5)]),
  ];

  it('safety focus + pain escalation render identically in English', () => {
    const review = buildWeeklyReview(
      reviewInput({
        workouts: missedWeek,
        athleteModel: athleteModel({
          pain: { episodes: [], episodesLast28dByFamily: { squat: 2 }, flaggedFamilies: ['squat'], recentPainExerciseKeys: [] },
        }),
      })
    );
    expect(review.focus.kind).toBe('safety');
    expect(renderEn(review.focus.headlineI18n, review.focus.headline)).toBe(review.focus.headline);
    expect(renderEn(review.focus.detailI18n, review.focus.detail)).toBe(review.focus.detail);
    expect(renderEn(review.painEscalationI18n, review.painEscalation!)).toBe(review.painEscalation);
    expect(renderHi(review.painEscalationI18n, review.painEscalation!)).toContain('स्क्वैट');
  });

  it('adherence focus renders with a CAPITALIZED weekday (P2 monday fix)', () => {
    const review = buildWeeklyReview(reviewInput({ workouts: missedWeek }));
    expect(review.focus.kind).toBe('adherence');
    // Stored English keeps the raw lowercase id (legacy); the i18n
    // render is the fix — "Wednesday", not "wednesday".
    expect(review.focus.headline).toMatch(/wednesday/);
    expect(renderEn(review.focus.headlineI18n, review.focus.headline)).toBe(
      'Protect your Wednesday session'
    );
    expect(renderEn(review.focus.detailI18n, review.focus.detail)).toContain('Wednesday was missed');
    const hiDetail = renderHi(review.focus.detailI18n, review.focus.detail);
    expect(hiDetail).toContain('बुधवार');
  });

  it('stall focus renders identically in English', () => {
    const plan: PlannedWorkout = {
      id: 'p1',
      name: 'Upper',
      createdAt: '2026-01-01',
      exercises: [{ name: 'Bench Press', targetSets: 4, targetReps: 6, targetWeight: 80, targetUnit: 'kg' }],
    };
    const stall: StallFlag = {
      exercise: 'Bench Press',
      sessionsStalled: 3,
      sessionsAnalyzed: 5,
      lastE1rmKg: 97,
      peakE1rmKg: 100,
      suggestion: 'variation',
      explanation: 'flat',
    };
    const review = buildWeeklyReview(
      reviewInput({
        workouts: fullWeek,
        coachBlocks: {
          ...getInitialCoachBlocksState(),
          adoptedPlans: { p1: { planId: 'p1', adoptedOn: '2026-10-01', schemes: deriveAdoptionSchemes(plan, null) } },
        },
        stalls: [stall],
      })
    );
    expect(review.focus.kind).toBe('stall');
    expect(renderEn(review.focus.headlineI18n, review.focus.headline)).toBe(review.focus.headline);
    expect(renderEn(review.focus.detailI18n, review.focus.detail)).toBe(review.focus.detail);
  });

  it('progression focus renders identically in English', () => {
    const review = buildWeeklyReview(
      reviewInput({
        workouts: fullWeek,
        policyRecords: [
          { ruleId: 'LOAD-PROG-01', exerciseName: 'Barbell Bench Press', createdAt: '2026-10-14' } as never,
        ],
      })
    );
    expect(review.focus.kind).toBe('progression');
    expect(renderEn(review.focus.headlineI18n, review.focus.headline)).toBe(review.focus.headline);
    expect(renderEn(review.focus.detailI18n, review.focus.detail)).toBe(review.focus.detail);
    expect(renderHi(review.focus.detailI18n, review.focus.detail)).toContain('बारबेल बेंच प्रेस');
  });

  it('consistency focus renders identically in English (many sessions)', () => {
    const review = buildWeeklyReview(reviewInput({ workouts: fullWeek }));
    expect(review.focus.kind).toBe('consistency');
    expect(renderEn(review.focus.headlineI18n, review.focus.headline)).toBe(review.focus.headline);
    expect(renderEn(review.focus.detailI18n, review.focus.detail)).toBe(review.focus.detail);
  });

  it('quiet focus renders identically in English (no sessions, nothing scheduled)', () => {
    const allRest: WeeklySchedule = {
      monday: { workoutPlanId: 'rest' },
      tuesday: { workoutPlanId: 'rest' },
      wednesday: { workoutPlanId: 'rest' },
      thursday: { workoutPlanId: 'rest' },
      friday: { workoutPlanId: 'rest' },
      saturday: { workoutPlanId: 'rest' },
      sunday: { workoutPlanId: 'rest' },
    };
    const review = buildWeeklyReview(reviewInput({ workouts: [], weeklySchedule: allRest }));
    expect(review.focus.kind).toBe('consistency');
    expect(review.focus.headline).toMatch(/quiet week/i);
    expect(renderEn(review.focus.headlineI18n, review.focus.headline)).toBe(review.focus.headline);
    expect(renderEn(review.focus.detailI18n, review.focus.detail)).toBe(review.focus.detail);
  });
});

describe('LIVE-P1-03 block debrief completion line', () => {
  it('renders identically in English for a full block', () => {
    const workouts: WorkoutEntry[] = [];
    for (let w = 0; w < 6; w++) {
      for (const off of [0, 2, 4]) {
        const d = new Date(2026, 8, 7 + w * 7 + off);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        workouts.push(rwent(`w${w}-${off}`, ds, 'Bench Press', [rwset(80, 5), rwset(80, 5)]));
      }
    }
    const block = {
      name: 'Test Block',
      startMonday: '2026-09-07',
      weeks: [{}, {}, {}, {}, {}, {}],
      schemes: [],
      planIds: ['p1'],
    } as never;
    const debrief = buildBlockDebrief({
      block,
      workouts,
      plannedWorkouts: [{ id: 'p1', name: 'Upper A', createdAt: '2026-01-01', exercises: [] }],
      weeklySchedule: SCHEDULE,
      athleteModel: null,
    });
    expect(debrief.completionLine).toBe('You completed 18 of 18 planned block sessions (100%).');
    expect(renderEn(debrief.completionI18n, debrief.completionLine)).toBe(debrief.completionLine);
  });

  it('renders identically for a block with no planned sessions', () => {
    const block = {
      name: 'Test Block',
      startMonday: '2026-09-07',
      weeks: [{}, {}, {}, {}, {}, {}],
      schemes: [],
      planIds: ['nope'],
    } as never;
    const debrief = buildBlockDebrief({
      block,
      workouts: [],
      plannedWorkouts: [],
      weeklySchedule: SCHEDULE,
      athleteModel: null,
    });
    expect(debrief.completionLine).toBe('The block ran its course.');
    expect(debrief.completionI18n?.key).toBe('weeklyReview.debriefNoPlan');
    expect(renderEn(debrief.completionI18n, debrief.completionLine)).toBe(debrief.completionLine);
  });
});

// ── Level names + challenge defs ─────────────────────────────────────────────

describe('LIVE-P1-03 level names and challenge defs', () => {
  it('every level key renders the same English name as getLevelName', () => {
    for (const level of [0, 1, 5, 10, 15, 20, 25, 30, 42]) {
      expect(tEn(getLevelNameKey(level))).toBe(getLevelName(level));
    }
  });

  it('monthly challenge defs carry keys that render their English title/description', () => {
    const defs = monthlyChallenges('2026-10');
    expect(defs).toHaveLength(4);
    for (const def of defs) {
      expect(def.titleKey).toBeDefined();
      expect(def.descriptionKey).toBeDefined();
      expect(tEn(def.titleKey!)).toBe(def.title);
      expect(tEn(def.descriptionKey!)).toBe(def.description);
      expect(tHi(def.titleKey!)).toMatch(/[\u0900-\u097F]/);
    }
  });
});

// ── coach-i18n helper edge cases ──────────────────────────────────────────────

describe('LIVE-P1-03 coach-i18n helpers', () => {
  it('falls back to stored English when no struct is present', () => {
    expect(renderEn(undefined, 'old English text')).toBe('old English text');
    expect(renderHi(null, 'old English text')).toBe('old English text');
  });

  it('localizes family ids and passes user content through', () => {
    expect(
      renderEn({ key: 'weeklyReview.painEscalation', params: { fams: 'horizontal_push, squat' } }, '')
    ).toContain('horizontal push, squat');
    expect(
      renderHi({ key: 'weeklyReview.painEscalation', params: { fams: 'horizontal_push, squat' } }, '')
    ).toContain('हॉरिज़ॉन्टल पुश, स्क्वैट');
  });

  it('unknown exercise names fall back to the original in Hindi mode', () => {
    expect(
      renderHi({ key: 'coachDigest.adjPain', params: { exercise: 'My Custom Lift' } }, '')
    ).toContain('My Custom Lift');
  });
});
