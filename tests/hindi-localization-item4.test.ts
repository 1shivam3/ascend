/**
 * Item-4 (2026-11-05): Hindi localization of the deterministic /
 * generated strings that still rendered English-only in Hindi mode.
 *
 * Pattern (LIVE-P1-03): generators attach a LocalizedSentence next to
 * the English text; renderers resolve it via renderLocalizedSentence.
 * The proofs here follow tests/persona-sim-live-p1-residuals.test.ts:
 * real dictionaries, EN renders byte-identical to the generator's
 * English (one deliberate exception: schedule-move day names gain
 * proper capitalization through localizeDay), HI renders real
 * Devanagari.
 *
 * Machine translations — the user's Hindi review is parked.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { translate } from '../src/lib/i18n';
import { en } from '../src/lib/i18n/en';
import { hi } from '../src/lib/i18n/hi';
import { localizeDay, renderLocalizedSentence, type LocalizedSentence } from '../src/lib/coach-i18n';
import { buildWeeklyReview, type WeeklyReviewInput } from '../src/lib/weekly-review';
import { getInitialCoachBlocksState } from '../src/lib/block-engine';
import type { AthleteModel } from '../src/lib/athlete-model';
import type { PersonalRecord, WeeklySchedule } from '../src/lib/types';
import type { TrainingDecisionRecord } from '../src/lib/training-decision-policy';
import { getDayKindTargets, getWholeDayAdaptation } from '../src/lib/nutrition-coach';
import { localizedUserMessage, toUserMessage, toUserMessageLocalized } from '../src/lib/user-error';

const tEn = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate('en', key, params);
const tHi = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate('hi', key, params);
const renderEn = (s: LocalizedSentence | null | undefined, fallback: string) =>
  renderLocalizedSentence(tEn, 'en', s, fallback);
const renderHi = (s: LocalizedSentence | null | undefined, fallback: string) =>
  renderLocalizedSentence(tHi, 'hi', s, fallback);

const NEW_KEYS = [
  'weeklyReview.prEstimated1RM', 'weeklyReview.prSet',
  'weeklyReview.recoverySleepAbove', 'weeklyReview.recoverySleepBelow',
  'weeklyReview.recoverySorenessAbove', 'weeklyReview.recoverySorenessBelow',
  'weeklyReview.recoveryEnergyAbove', 'weeklyReview.recoveryEnergyBelow',
  'weeklyReview.recoveryBaselineOk',
  'weeklyReview.coachLoadProgression', 'weeklyReview.coachRepProgression',
  'weeklyReview.coachSafetyHold', 'weeklyReview.coachPlateauApplied',
  'weeklyReview.coachFormChecksReps', 'weeklyReview.coachFormChecksNoReps',
  'weeklyReview.revisionNextWeekDeload', 'weeklyReview.revisionNextWeekTest',
  'weeklyReview.revisionNextWeekBuild', 'weeklyReview.revisionStallChange',
  'weeklyReview.revisionScheduleMove',
  'nutritionCoach.wholeDayReason', 'nutritionCoach.dayKindNoGrainFast',
  'nutritionCoach.dayKindOneMealFast', 'nutritionCoach.dayKindFestivalFeast',
  'userError.cancelled', 'userError.quotaScan', 'userError.quotaGeneric',
  'userError.lowMemory', 'userError.noConnection', 'userError.timeout',
  'userError.unavailableScan', 'userError.unavailableGeneric',
  'userError.rateLimit', 'userError.badImage', 'userError.fallbackScan',
  'userError.fallbackImage', 'userError.fallbackGeneric',
  'health.sourceLabel', 'meals.aiLogged', 'meals.saveAsMyVersion',
  'meals.updateMyVersion',
] as const;

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('item-4 dictionaries', () => {
  it('every new key exists in en and hi with matching placeholders', () => {
    // The form-check keys are the one documented exception: the Hindi
    // templates drop the {scope} param (an English "<exercise>
    // sessions" fragment that cannot sit inside the Hindi sentence) —
    // every placeholder Hindi DOES use must still be provided.
    const SCOPE_DROPPED = new Set(['weeklyReview.coachFormChecksReps', 'weeklyReview.coachFormChecksNoReps']);
    for (const key of NEW_KEYS) {
      expect(en[key], `en missing ${key}`).toBeTruthy();
      expect(hi[key], `hi missing ${key}`).toBeTruthy();
      if (SCOPE_DROPPED.has(key)) {
        expect(placeholders(hi[key]!), key).not.toContain('scope');
        expect(placeholders(hi[key]!), key).toEqual(
          placeholders(en[key]).filter((p) => p !== 'scope')
        );
      } else {
        expect(placeholders(hi[key]!), key).toEqual(placeholders(en[key]));
      }
    }
  });

  it('Hindi is real Devanagari and differs from English (except the Health Connect proper noun)', () => {
    for (const key of NEW_KEYS) {
      if (key === 'health.sourceLabel') {
        // Settings precedent: the Google product name stays Latin.
        expect(hi[key]).toBe('Health Connect');
        continue;
      }
      expect(hi[key], key).not.toBe(en[key]);
      expect(hi[key], key).toMatch(/[ऀ-ॏ]/);
    }
  });
});

describe('localizeDay (missedDays path)', () => {
  it('localizes full weekday names and passes unknown ids through', () => {
    expect(localizeDay('monday', 'en')).toBe('Monday');
    expect(localizeDay('monday', 'hi')).toBe('सोमवार');
    expect(localizeDay('sunday', 'hi')).toBe('रविवार');
    expect(localizeDay('not-a-day', 'hi')).toBe('not-a-day');
  });

  it('fromDay/toDay params localize like day', () => {
    const s: LocalizedSentence = {
      key: 'weeklyReview.revisionScheduleMove',
      params: { fromDay: 'monday', toDay: 'tuesday' },
    };
    expect(renderHi(s, '')).toContain('सोमवार');
    expect(renderHi(s, '')).toContain('मंगलवार');
    expect(renderEn(s, '')).toContain('Monday');
  });
});

// ── Weekly review fixtures (shape mirrors tests/weekly-review.test.ts) ──

const MON = '2026-10-12';
const SCHEDULE: WeeklySchedule = {
  monday: { workoutPlanId: 'p1' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'p1' },
  thursday: { workoutPlanId: 'rest' },
  friday: { workoutPlanId: 'p1' },
  saturday: { workoutPlanId: 'rest' },
  sunday: { workoutPlanId: 'rest' },
};

function estimate<T>(value: T, tier: 'prior' | 'emerging' | 'established' = 'established') {
  return { value, n: 6, tier, evidence: 'fixture' } as const;
}

function baseline(value: number) {
  return { value, n: 6, tier: 'established' as const, spread: 0.4, evidence: 'fixture' };
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
  } as unknown as AthleteModel;
}

function input(over: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput {
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

describe('weekly review — PR details carry structs', () => {
  it('estimated-1RM and weight×reps PRs render identically in EN and in Hindi', () => {
    const prs = [
      { exercise: 'Barbell Bench Press', date: '2026-10-13', weightKg: 100, reps: 5, oneRepMax: 116.7 },
      { exercise: 'Deadlift', date: '2026-10-15', weightKg: 140, reps: 3, oneRepMax: 0 },
    ] as unknown as PersonalRecord[];
    const review = buildWeeklyReview(input({ prs }));
    expect(review.prs).toHaveLength(2);
    expect(review.prs[0].detail).toBe('estimated 1RM 117 kg');
    expect(review.prs[0].detailI18n).toEqual({
      key: 'weeklyReview.prEstimated1RM',
      params: { value: 117 },
    });
    expect(review.prs[1].detailI18n).toEqual({
      key: 'weeklyReview.prSet',
      params: { value: 140, reps: 3 },
    });
    for (const pr of review.prs) {
      expect(renderEn(pr.detailI18n, pr.detail)).toBe(pr.detail);
      expect(renderHi(pr.detailI18n, pr.detail)).toContain('किग्रा');
    }
  });
});

describe('weekly review — recovery lines carry aligned structs', () => {
  it('a sleep line above baseline localizes; arrays stay index-aligned', () => {
    const model = athleteModel({
      checkinBaselines: {
        sleep: baseline(3),
        soreness: baseline(3),
        energy: baseline(3),
      },
    });
    const review = buildWeeklyReview(
      input({
        athleteModel: model,
        dailyCheckins: {
          '2026-10-13': { sleep: 4.5, soreness: 3 },
          '2026-10-15': { sleep: 4.5, soreness: 3.2 },
        },
      })
    );
    expect(review.recoveryLines.length).toBeGreaterThan(0);
    expect(review.recoveryLinesI18n).toHaveLength(review.recoveryLines.length);
    const i = review.recoveryLines.findIndex((l) => l.startsWith('Sleep averaged'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(review.recoveryLinesI18n![i]).toEqual({
      key: 'weeklyReview.recoverySleepAbove',
      params: { mean: 4.5, baseline: 3 },
    });
    expect(renderEn(review.recoveryLinesI18n![i], review.recoveryLines[i])).toBe(review.recoveryLines[i]);
    expect(renderHi(review.recoveryLinesI18n![i], review.recoveryLines[i])).toContain('नींद');
  });

  it('the no-flags fallback line carries the baseline-ok struct', () => {
    const review = buildWeeklyReview(
      input({ dailyCheckins: { '2026-10-14': { sleep: 3, soreness: 3 } } })
    );
    expect(review.recoveryLines).toEqual([
      'Check-ins this week sat close to your usual baselines — no recovery flags.',
    ]);
    expect(review.recoveryLinesI18n).toEqual([{ key: 'weeklyReview.recoveryBaselineOk' }]);
    expect(renderHi(review.recoveryLinesI18n![0], review.recoveryLines[0])).toContain('बेसलाइन');
  });
});

describe('weekly review — coach lines carry aligned structs', () => {
  it('a load-progression policy record localizes with the exercise param', () => {
    const record = {
      id: 'dec_1',
      policyVersion: '0.1.0',
      createdAt: '2026-10-14T10:00:00.000Z',
      exerciseName: 'Barbell Bench Press',
      ruleId: 'LOAD-PROG-01',
    } as unknown as TrainingDecisionRecord;
    const review = buildWeeklyReview(input({ policyRecords: [record] }));
    expect(review.coachLines).toHaveLength(1);
    expect(review.coachLinesI18n).toHaveLength(1);
    expect(review.coachLinesI18n![0]).toEqual({
      key: 'weeklyReview.coachLoadProgression',
      params: { exercise: 'Barbell Bench Press' },
    });
    expect(renderEn(review.coachLinesI18n![0], review.coachLines[0])).toBe(review.coachLines[0]);
    expect(renderHi(review.coachLinesI18n![0], review.coachLines[0])).toContain('लोड प्रोग्रेशन');
  });
});

describe('weekly review — revision proposals carry structs', () => {
  it('schedule_move: day params localize (EN gains proper capitalization)', () => {
    const model = athleteModel({
      adherence: {
        windowWeeks: 8,
        plannedSessions: 24,
        completedSessions: 20,
        unscheduledSessions: 0,
        adherenceRate: estimate(0.83),
        mostSkippedDay: 'monday',
        mostTrainedDay: null,
      } as AthleteModel['adherence'],
    });
    // profileCreatedAt before the week: Mon/Wed/Fri were due and, with
    // no workouts logged, missed — monday is the most-skipped day.
    const review = buildWeeklyReview(input({ athleteModel: model, profileCreatedAt: '2026-10-01' }));
    const move = review.revisions.find((r) => r.kind === 'schedule_move');
    expect(move).toBeDefined();
    expect(move!.text).toContain('monday keeps getting skipped');
    expect(move!.textI18n).toEqual({
      key: 'weeklyReview.revisionScheduleMove',
      params: { fromDay: 'monday', toDay: 'tuesday' },
    });
    // Through the key the day names are proper weekday names — the one
    // deliberate EN difference from the legacy raw text.
    expect(renderEn(move!.textI18n, move!.text)).toContain('Monday keeps getting skipped');
    expect(renderEn(move!.textI18n, move!.text)).toContain('Move this session to Tuesday?');
    const hiText = renderHi(move!.textI18n, move!.text);
    expect(hiText).toContain('सोमवार');
    expect(hiText).toContain('मंगलवार');
  });

  it('stall_change and next_week_type keys render the generator copy in EN', () => {
    // Generator wiring for these two needs a live block/stall fixture;
    // the structs are pinned at the render layer + source pins below.
    const stall: LocalizedSentence = {
      key: 'weeklyReview.revisionStallChange',
      params: { exercise: 'Squat' },
    };
    expect(renderEn(stall, '')).toBe('A plateau change for Squat is waiting in Train → Your Coach.');
    const build: LocalizedSentence = {
      key: 'weeklyReview.revisionNextWeekBuild',
      params: { week: 3 },
    };
    expect(renderEn(build, '')).toBe(
      'Next week is week 3 of your block — a build week. Same plan, progression rules live.'
    );
  });
});

describe('nutrition coach — day-kind notes and whole-day reason', () => {
  const goals = { calories: 2000, proteinG: 120, carbsG: 250, fatG: 67 };

  it('each day kind carries its note struct; EN is byte-identical, Hindi keeps the diabetes caution', () => {
    const kinds = [
      ['no_grain_fast', 'nutritionCoach.dayKindNoGrainFast'],
      ['one_meal_fast', 'nutritionCoach.dayKindOneMealFast'],
      ['festival_feast', 'nutritionCoach.dayKindFestivalFeast'],
    ] as const;
    for (const [kind, key] of kinds) {
      const out = getDayKindTargets(kind, goals)!;
      expect(out.noteI18n).toEqual({ key });
      expect(renderEn(out.noteI18n, out.note)).toBe(out.note);
    }
    for (const kind of ['no_grain_fast', 'one_meal_fast'] as const) {
      const out = getDayKindTargets(kind, goals)!;
      expect(out.note).toContain('diabetes');
      expect(renderHi(out.noteI18n, out.note)).toContain('डायबिटीज़');
      expect(renderHi(out.noteI18n, out.note)).toContain('डॉक्टर');
    }
  });

  it('whole-day reason carries pre-formatted number params', () => {
    const out = getWholeDayAdaptation({ caloriesLogged: 1500, calorieTarget: 2000, hour: 15 })!;
    expect(out.reasonI18n).toEqual({
      key: 'nutritionCoach.wholeDayReason',
      params: { pct: 75, target: '2,000', remaining: '500' },
    });
    expect(renderEn(out.reasonI18n, out.reason)).toBe(out.reason);
    expect(renderHi(out.reasonI18n, out.reason)).toContain('2,000');
  });
});

describe('user-error — localized sanitizer', () => {
  const cases: [unknown, 'scan' | 'image' | 'generic', string][] = [
    [new Error('AbortError: the user aborted'), 'generic', 'userError.cancelled'],
    [{ code: 'AI_QUOTA_EXCEEDED' }, 'scan', 'userError.quotaScan'],
    [{ code: 'AI_DAILY_CAP' }, 'generic', 'userError.quotaGeneric'],
    [new Error('QuotaExceededError: quota'), 'generic', 'userError.lowMemory'],
    [new Error('Failed to fetch'), 'generic', 'userError.noConnection'],
    [new Error('request timed out'), 'generic', 'userError.timeout'],
    [{ code: 'NO_API_KEY' }, 'scan', 'userError.unavailableScan'],
    [{ code: '503' }, 'generic', 'userError.unavailableGeneric'],
    [{ code: '429' }, 'generic', 'userError.rateLimit'],
    [new Error('image too large'), 'image', 'userError.badImage'],
    [new Error('POST https://api.example.com/v1 500 {secret}'), 'scan', 'userError.fallbackScan'],
    [new Error('POST https://api.example.com/v1 500 {secret}'), 'image', 'userError.fallbackImage'],
    [null, 'generic', 'userError.fallbackGeneric'],
  ];

  it('every fixed branch attaches its key and the English text is unchanged', () => {
    for (const [err, ctx, key] of cases) {
      const m = toUserMessageLocalized(err, ctx, false);
      expect(m.i18n?.key, key).toBe(key);
      expect(m.text).toBe(toUserMessage(err, ctx, false));
      expect(localizedUserMessage(tEn, 'en', err, ctx, false)).toBe(m.text);
    }
  });

  it('renders real Hindi in Hindi mode', () => {
    expect(localizedUserMessage(tHi, 'hi', new Error('Failed to fetch'), 'generic', false)).toBe(
      hi['userError.noConnection']
    );
    expect(localizedUserMessage(tHi, 'hi', { code: 'AI_QUOTA_EXCEEDED' }, 'scan', false)).toBe(
      hi['userError.quotaScan']
    );
    expect(localizedUserMessage(tHi, 'hi', null, 'generic', false)).toBe(hi['userError.fallbackGeneric']);
  });

  it('pass-through messages carry no struct and render as written in both languages', () => {
    const err = new Error('That date is already booked.');
    const m = toUserMessageLocalized(err, 'generic', false);
    expect(m.i18n).toBeUndefined();
    expect(m.text).toBe('That date is already booked.');
    expect(localizedUserMessage(tHi, 'hi', err, 'generic', false)).toBe('That date is already booked.');
  });

  it('all callers are client components — no server route imports the sanitizer', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && fs.readFileSync(full, 'utf8').includes('user-error')) {
          hits.push(path.relative(process.cwd(), full));
        }
      }
    };
    walk(path.join(process.cwd(), 'src/app/api'));
    expect(hits).toEqual([]);
  });
});

describe('item-4 renderer wiring (source pins)', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

  it('CoachWeeklyReviewModal localizes missed days, lines, PRs and revisions', () => {
    const modal = read('src/components/CoachWeeklyReviewModal.tsx');
    expect(modal).toContain('review.missedDays.map((d) => localizeDay(d, language))');
    expect(modal).toContain('review.recoveryLinesI18n?.[i]');
    expect(modal).toContain('review.coachLinesI18n?.[i]');
    expect(modal).toContain('pr.detailI18n');
    expect(modal).toContain('rev.textI18n');
  });

  it('MealsPage renders the note/reason structs and the formerly-hardcoded literals via t()', () => {
    const meals = read('src/components/MealsPage.tsx');
    expect(meals).toContain('dayTargets.noteI18n');
    expect(meals).toContain('dayAdaptation.reasonI18n');
    expect(meals).toContain("{t('meals.aiLogged')}");
    expect(meals).toContain("title={t('common.reportAiContent')}");
    expect(meals).not.toContain('title="Report AI content"');
    expect(meals).toContain("t('meals.saveAsMyVersion')");
    expect(meals).toContain("t('meals.updateMyVersion')");
  });

  it('HomePage steps source label goes through t()', () => {
    const home = read('src/components/HomePage.tsx');
    expect(home).toContain("{t('health.sourceLabel')}");
    expect(home).not.toContain('>Health Connect</span>');
  });

  it('ActiveWorkoutScreen: aria cluster wired, Form Coach via keys, volume in the user unit', () => {
    const aws = read('src/components/ActiveWorkoutScreen.tsx');
    for (const label of [
      'aria-label="Discard Workout"', 'aria-label="Pause and save draft"',
      'aria-label="Finish workout"', 'aria-label="ASCEND Form Coach"',
      'aria-label="Form cues for this exercise"', 'aria-label="Warm-up sets"',
      'aria-label="Workout Tools & Options"', 'aria-label="Clear search"',
      'aria-label="Add set"', 'aria-label="Remove last set"',
      'aria-label="Dismiss set complete screen"',
    ]) {
      expect(aws, label).not.toContain(label);
    }
    expect(aws).toContain("aria-label={t('tools.formCoachTitle')}");
    expect(aws).toContain("{t('workout.formCoach')}");
    expect(aws).toContain("<span>{t('tools.formCoachTitle')}</span>");
    expect(aws).toContain('Math.round(kgToLbs(sessionStats.totalVolumeKg))');
    expect(aws).not.toContain('{sessionStats.totalVolumeKg} kg');
  });

  it('weekly-review generator attaches the revision structs (stall + next-week-type)', () => {
    const gen = read('src/lib/weekly-review.ts');
    expect(gen).toContain("'weeklyReview.revisionStallChange'");
    expect(gen).toContain("'weeklyReview.revisionNextWeekDeload'");
    expect(gen).toContain("'weeklyReview.revisionNextWeekTest'");
    expect(gen).toContain("'weeklyReview.revisionNextWeekBuild'");
    expect(gen).toContain("'weeklyReview.coachFormChecksReps'");
  });
});
