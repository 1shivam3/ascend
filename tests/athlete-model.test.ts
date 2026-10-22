import { describe, it, expect } from 'vitest';
import { buildAthleteModel, type AthleteModelInput } from '../src/lib/athlete-model';
import type {
  PlannedWorkout,
  Unit,
  WeeklySchedule,
  WorkoutEntry,
  WorkoutExercise,
  WorkoutSet,
} from '../src/lib/types';
import type { ManualCheckin, ReadinessHistoryEntry } from '../src/lib/coach-engine';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TODAY = '2026-10-22'; // a Thursday; current week's Monday is 2026-10-19

let wid = 0;
const wset = (
  weight: number,
  reps: number,
  unit: Unit = 'kg',
  extra: Partial<WorkoutSet> = {}
): WorkoutSet => ({ reps, weight, unit, completed: true, status: 'completed', ...extra });

const wex = (name: string, sets: WorkoutSet[], extra: Partial<WorkoutExercise> = {}): WorkoutExercise => ({
  name,
  sets,
  ...extra,
});

const wentry = (date: string, exercises: WorkoutExercise[], extra: Partial<WorkoutEntry> = {}): WorkoutEntry => ({
  id: `w${++wid}`,
  date,
  exercises,
  ...extra,
});

const emptySchedule: WeeklySchedule = {
  monday: { workoutPlanId: 'rest' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'rest' },
  thursday: { workoutPlanId: 'rest' },
  friday: { workoutPlanId: 'rest' },
  saturday: { workoutPlanId: 'rest' },
  sunday: { workoutPlanId: 'rest' },
};

const baseInput = (over: Partial<AthleteModelInput> = {}): AthleteModelInput => ({
  workouts: [],
  dailyCheckins: {},
  weeklySchedule: emptySchedule,
  plannedWorkouts: [],
  readinessHistory: [],
  ...over,
});

const plan = (id: string): PlannedWorkout => ({ id, name: `Plan ${id}`, exercises: [], createdAt: '2026-01-01' });

const scheduleWith = (days: Partial<WeeklySchedule>): WeeklySchedule => ({ ...emptySchedule, ...days });

// ── Cold start / sparse data ─────────────────────────────────────────────────

describe('athlete model — cold start honesty', () => {
  it('empty history: everything is a labelled default, nothing crashes, no NaN', () => {
    const m = buildAthleteModel(baseInput(), TODAY);
    expect(m.lifts).toEqual([]);
    expect(m.pain.flaggedFamilies).toEqual([]);
    expect(m.checkinBaselines.sleep.tier).toBe('prior');
    expect(m.checkinBaselines.sleep.value).toBe(3);
    expect(m.checkinBaselines.energy.n).toBe(0);
    expect(m.adherence.adherenceRate.tier).toBe('prior');
    expect(m.topFacts[0].kind).toBe('learning');
    const json = JSON.stringify(m);
    expect(json).not.toContain('NaN');
    expect(json).not.toContain('Infinity');
  });

  it('a single workout produces no lift response (needs a before/after)', () => {
    const m = buildAthleteModel(
      baseInput({ workouts: [wentry('2026-10-20', [wex('Barbell Bench Press', [wset(100, 1)])])] }),
      TODAY
    );
    expect(m.lifts).toEqual([]);
    expect(m.workoutsAnalyzed).toBe(1);
    expect(m.topFacts[0].kind).toBe('learning');
  });
});

// ── Check-in baselines ───────────────────────────────────────────────────────

describe('athlete model — check-in baselines', () => {
  const checkins = (count: number, sleep: number, startOffset: number): Record<string, ManualCheckin> => {
    const out: Record<string, ManualCheckin> = {};
    for (let i = 0; i < count; i++) {
      const d = new Date(2026, 9, 22);
      d.setDate(d.getDate() - startOffset - i * 2);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out[key] = { sleep, soreness: 3 };
    }
    return out;
  };

  it('personal mean replaces the default once check-ins exist', () => {
    const m = buildAthleteModel(baseInput({ dailyCheckins: checkins(6, 4, 1) }), TODAY);
    expect(m.checkinBaselines.sleep.value).toBe(4);
    expect(m.checkinBaselines.sleep.n).toBe(6);
    expect(m.checkinBaselines.sleep.tier).toBe('emerging');
    expect(m.checkinBaselines.sleep.evidence).toContain('4/5');
  });

  it('14+ check-ins is established; energy stays prior when never logged', () => {
    const m = buildAthleteModel(baseInput({ dailyCheckins: checkins(16, 5, 0) }), TODAY);
    expect(m.checkinBaselines.sleep.tier).toBe('established');
    expect(m.checkinBaselines.energy.tier).toBe('prior');
    expect(m.checkinBaselines.energy.value).toBe(3);
  });

  it('check-ins older than 8 weeks do not count', () => {
    const m = buildAthleteModel(baseInput({ dailyCheckins: checkins(6, 5, 100) }), TODAY);
    expect(m.checkinBaselines.sleep.n).toBe(0);
    expect(m.checkinBaselines.sleep.tier).toBe('prior');
  });
});

// ── Per-lift progression response ────────────────────────────────────────────

describe('athlete model — per-lift response', () => {
  /** One top single per session; with reps=1, e1RM == weight exactly. */
  const singlesSeries = (name: string, dates: string[], weights: number[], unit: Unit = 'kg') =>
    dates.map((d, i) => wentry(d, [wex(name, [wset(weights[i], 1, unit)])]));

  it('rising series gives a positive slope in kg/week with the lift named', () => {
    const workouts = singlesSeries(
      'Barbell Bench Press',
      ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06'],
      [100, 102.5, 105, 107.5, 110, 112.5]
    );
    const m = buildAthleteModel(baseInput({ workouts }), TODAY);
    const lift = m.lifts.find((l) => l.key === 'barbell bench press');
    expect(lift).toBeDefined();
    expect(lift!.slopeKgPerWeek.value).not.toBeNull();
    expect(Math.abs((lift!.slopeKgPerWeek.value as number) - 2.5)).toBeLessThan(0.2);
    expect(lift!.slopeKgPerWeek.evidence).toContain('Barbell Bench Press');
    expect(lift!.slopeKgPerWeek.evidence).toContain('climbing');
    expect(lift!.bestE1rmKg).toBe(112.5);
  });

  it('flat series reads flat, not progress', () => {
    const workouts = singlesSeries(
      'Squat',
      ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06'],
      [140, 141, 140, 139, 140, 141]
    );
    const m = buildAthleteModel(baseInput({ workouts }), TODAY);
    const lift = m.lifts.find((l) => l.key === 'squat');
    expect(Math.abs(lift!.slopeKgPerWeek.value as number)).toBeLessThan(0.2);
    expect(lift!.slopeKgPerWeek.evidence).toContain('flat');
  });

  it('fewer than 4 sessions or too-short a span claims no trend', () => {
    const three = singlesSeries('Deadlift', ['2026-10-01', '2026-10-08', '2026-10-15'], [180, 185, 190]);
    const m1 = buildAthleteModel(baseInput({ workouts: three }), TODAY);
    expect(m1.lifts[0].slopeKgPerWeek.value).toBeNull();

    const bunched = singlesSeries(
      'Deadlift',
      ['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-18'],
      [180, 185, 190, 195]
    );
    const m2 = buildAthleteModel(baseInput({ workouts: bunched }), TODAY);
    expect(m2.lifts[0].slopeKgPerWeek.value).toBeNull();
    expect(m2.lifts[0].slopeKgPerWeek.evidence).toContain('too few days');
  });

  it('progress rhythm: median sessions between new bests (needs ≥2 observed intervals)', () => {
    const workouts = singlesSeries(
      'Squat',
      ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'],
      [100, 99, 102, 100, 104, 103, 106]
    );
    const m = buildAthleteModel(baseInput({ workouts }), TODAY);
    const lift = m.lifts[0];
    expect(lift.sessionsBetweenProgress.value).toBe(2);
    expect(lift.sessionsSinceProgress).toBe(0);
    expect(lift.lastProgressDate).toBe('2026-10-19');
  });

  it('a single observed interval does NOT become a rhythm claim', () => {
    const workouts = singlesSeries(
      'Squat',
      ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'],
      [100, 99, 102, 100, 104, 103]
    );
    const m = buildAthleteModel(baseInput({ workouts }), TODAY);
    expect(m.lifts[0].sessionsBetweenProgress.value).toBeNull();
    expect(m.lifts[0].sessionsBetweenProgress.evidence).toContain('only one new-best interval');
  });

  it('typical increment is the median clean load jump at matched reps', () => {
    const dates = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'];
    const weights = [100, 102.5, 102.5, 105];
    const reps = [5, 5, 6, 5];
    const workouts = dates.map((d, i) => wentry(d, [wex('Overhead Press', [wset(weights[i], reps[i])])]));
    const m = buildAthleteModel(baseInput({ workouts }), TODAY);
    expect(m.lifts[0].typicalIncrementKg.value).toBe(2.5);
  });

  it('lbs sets are normalized to kg; warmups and skipped sets never count', () => {
    const workouts = [
      wentry('2026-10-05', [
        wex('Deadlift', [
          wset(300, 1, 'kg', { isWarmup: true }),
          wset(220, 1, 'lbs'),
          wset(999, 1, 'kg', { completed: false, status: 'skipped' }),
        ]),
      ]),
      wentry('2026-10-12', [wex('Deadlift', [wset(220, 1, 'lbs')])]),
    ];
    const m = buildAthleteModel(baseInput({ workouts }), TODAY);
    const lift = m.lifts[0];
    expect(lift.exposures).toBe(2);
    expect(Math.abs(lift.bestE1rmKg - 99.8)).toBeLessThan(0.2);
  });

  it('name keying is exact-canonical: case merges, different lifts do not', () => {
    const workouts = [
      wentry('2026-10-05', [wex('Bench Press', [wset(100, 1)])]),
      wentry('2026-10-12', [wex(' bench press ', [wset(102.5, 1)])]),
      wentry('2026-10-06', [wex('Incline Bench Press', [wset(80, 1)])]),
      wentry('2026-10-13', [wex('Incline Bench Press', [wset(82.5, 1)])]),
    ];
    const m = buildAthleteModel(baseInput({ workouts }), TODAY);
    const keys = m.lifts.map((l) => l.key).sort();
    expect(keys).toEqual(['bench press', 'incline bench press']);
  });
});

// ── Recovery profile ─────────────────────────────────────────────────────────

describe('athlete model — recovery', () => {
  it('a muscle trained every 3 days at full strength reads recovery ≈3 days', () => {
    const dates = ['2026-08-24', '2026-08-27', '2026-08-30', '2026-09-02', '2026-09-05', '2026-09-08', '2026-09-11', '2026-09-14', '2026-09-17'];
    const workouts = dates.map((d) => wentry(d, [wex('Barbell Bench Press', [wset(100, 1)])]));
    const m = buildAthleteModel(baseInput({ workouts }), TODAY);
    const chest = m.recovery.find((r) => r.muscle === 'Chest');
    expect(chest).toBeDefined();
    expect(chest!.recoveryDays.value).toBe(3);
    expect(chest!.recoveryDays.tier).toBe('emerging');
  });

  it('too few points falls back to the labelled 2-day default', () => {
    const workouts = [
      wentry('2026-10-05', [wex('Squat', [wset(100, 1)])]),
      wentry('2026-10-08', [wex('Squat', [wset(100, 1)])]),
    ];
    const m = buildAthleteModel(baseInput({ workouts }), TODAY);
    const legs = m.recovery.find((r) => r.muscle === 'Legs');
    expect(legs!.recoveryDays.value).toBe(2);
    expect(legs!.recoveryDays.tier).toBe('prior');
    expect(legs!.recoveryDays.evidence).toContain('stands in');
  });
});

// ── Adherence + Mon–Sun boundaries ────────────────────────────────────────────

describe('athlete model — adherence (Mon–Sun)', () => {
  it('Sunday belongs to the week it ends; the current week is not counted', () => {
    // Schedule: Sundays only. Complete Sundays in window: Aug 30 … Oct 18 (8).
    const workouts = [
      wentry('2026-10-11', [wex('Squat', [wset(100, 1)])]), // complete week
      wentry('2026-10-18', [wex('Squat', [wset(100, 1)])]), // Sunday ending last complete week
      wentry('2026-10-19', [wex('Squat', [wset(100, 1)])]), // Monday of CURRENT week — excluded
    ];
    const m = buildAthleteModel(
      baseInput({
        workouts,
        weeklySchedule: scheduleWith({ sunday: { workoutPlanId: 'p1' } }),
        plannedWorkouts: [plan('p1')],
      }),
      TODAY
    );
    expect(m.adherence.plannedSessions).toBe(8);
    expect(m.adherence.completedSessions).toBe(2);
  });

  it('most-skipped day comes from scheduled days with enough samples', () => {
    // Mon + Wed scheduled for all 8 complete weeks; every Wed of the last 4 missed.
    const mondays = ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'];
    const wednesdaysDone = ['2026-08-26', '2026-09-02', '2026-09-09', '2026-09-16'];
    const workouts = [...mondays, ...wednesdaysDone].map((d) => wentry(d, [wex('Squat', [wset(100, 1)])]));
    const m = buildAthleteModel(
      baseInput({
        workouts,
        weeklySchedule: scheduleWith({
          monday: { workoutPlanId: 'p1' },
          wednesday: { workoutPlanId: 'p1' },
        }),
        plannedWorkouts: [plan('p1')],
      }),
      TODAY
    );
    expect(m.adherence.plannedSessions).toBe(16);
    expect(m.adherence.completedSessions).toBe(12);
    expect(m.adherence.adherenceRate.value).toBe(0.75);
    expect(m.adherence.mostSkippedDay).toBe('wednesday');
    expect(m.adherence.adherenceRate.evidence).toContain('current weekly schedule');
  });
});

// ── Pain episodes ────────────────────────────────────────────────────────────

describe('athlete model — pain episodes', () => {
  const painSwapWorkout = (date: string) =>
    wentry(date, [
      wex('Romanian Deadlift', [wset(100, 5)], { reportsPain: true, painfulExerciseName: 'Deadlift' }),
    ]);

  it('a pain swap credits the ORIGINAL lift, never the substitute', () => {
    const m = buildAthleteModel(baseInput({ workouts: [painSwapWorkout('2026-10-10')] }), TODAY);
    expect(m.pain.episodes).toHaveLength(1);
    expect(m.pain.episodes[0].exerciseName).toBe('Deadlift');
    expect(m.pain.episodes[0].family).toBe('hinge');
    expect(m.pain.episodes.some((e) => e.exerciseName === 'Romanian Deadlift')).toBe(false);
  });

  it('two episodes in one family within 28 days flags the family', () => {
    const m = buildAthleteModel(
      baseInput({ workouts: [painSwapWorkout('2026-09-28'), painSwapWorkout('2026-10-12')] }),
      TODAY
    );
    expect(m.pain.flaggedFamilies).toContain('hinge');
    expect(m.pain.episodesLast28dByFamily.hinge).toBe(2);
    expect(m.topFacts[0].kind).toBe('pain');
  });

  it('a single episode does not flag; session-level pain is recorded unattributed', () => {
    const one = buildAthleteModel(baseInput({ workouts: [painSwapWorkout('2026-10-12')] }), TODAY);
    expect(one.pain.flaggedFamilies).toEqual([]);

    const sessionPain = wentry('2026-10-12', [wex('Squat', [wset(100, 5)])], { reportsPain: true });
    const m2 = buildAthleteModel(baseInput({ workouts: [sessionPain] }), TODAY);
    expect(m2.pain.episodes).toHaveLength(1);
    expect(m2.pain.episodes[0].exerciseKey).toBe('');
    expect(m2.pain.flaggedFamilies).toEqual([]);
  });

  it('episodes older than 90 days fall out of the record', () => {
    const m = buildAthleteModel(baseInput({ workouts: [painSwapWorkout('2026-06-01')] }), TODAY);
    expect(m.pain.episodes).toHaveLength(0);
  });
});

// ── Readiness history ────────────────────────────────────────────────────────

describe('athlete model — low readiness share', () => {
  it('counts caution/rest days over the last 28 days only', () => {
    const hist: ReadinessHistoryEntry[] = [
      ...Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${String(10 + i).padStart(2, '0')}`, score: 70, band: 'ready' as const })),
      ...Array.from({ length: 3 }, (_, i) => ({ date: `2026-10-${String(17 + i).padStart(2, '0')}`, score: 35, band: 'rest' as const })),
      { date: '2026-08-01', score: 30, band: 'rest' as const }, // too old
    ];
    const m = buildAthleteModel(baseInput({ readinessHistory: hist }), TODAY);
    expect(m.lowReadinessShare.n).toBe(10);
    expect(m.lowReadinessShare.value).toBe(0.3);
    expect(m.lowReadinessShare.tier).toBe('established');
  });
});

// ── Adversarial regressions (post-review fixes) ─────────────────────────────
// Each test pins a defect found by probing the engine with hostile data:
// inflated adherence, false accusations, per-session pain double-counts,
// future-dated logs, non-finite numbers, phantom sessions, entry-vs-day
// readiness counting.

describe('athlete model — adversarial regressions', () => {
  const MONDAYS = ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'];
  const WEDNESDAYS = ['2026-08-26', '2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07', '2026-10-14'];
  const SUNDAYS = ['2026-08-30', '2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18'];
  const benchDay = (date: string) => wentry(date, [wex('Barbell Bench Press', [wset(80, 5)])]);

  it('B1: unscheduled training never inflates adherence', () => {
    const workouts = [
      benchDay('2026-10-11'),
      benchDay('2026-10-18'),
      ...MONDAYS.map(benchDay),
      benchDay('2026-09-02'),
      benchDay('2026-09-09'),
    ];
    const m = buildAthleteModel(
      baseInput({
        workouts,
        weeklySchedule: scheduleWith({ sunday: { workoutPlanId: 'p1' } }),
        plannedWorkouts: [plan('p1')],
      }),
      TODAY
    );
    expect(m.adherence.plannedSessions).toBe(8);
    expect(m.adherence.completedSessions).toBe(2);
    expect(m.adherence.unscheduledSessions).toBe(10);
    expect(m.adherence.adherenceRate.value).toBe(0.25);
    expect(m.adherence.adherenceRate.evidence).toContain('completed 2 of 8 planned sessions');
    expect(m.adherence.adherenceRate.evidence).toContain('Plus 10 extra sessions');
  });

  it('M1: perfect adherence produces no "most often missed" accusation', () => {
    const workouts = [...MONDAYS, ...WEDNESDAYS].map(benchDay);
    const m = buildAthleteModel(
      baseInput({
        workouts,
        weeklySchedule: scheduleWith({
          monday: { workoutPlanId: 'p1' },
          wednesday: { workoutPlanId: 'p1' },
        }),
        plannedWorkouts: [plan('p1')],
      }),
      TODAY
    );
    expect(m.adherence.completedSessions).toBe(16);
    expect(m.adherence.mostSkippedDay).toBeNull();
    const fact = m.topFacts.find((f) => f.kind === 'adherence');
    expect(fact?.text).not.toContain('most often missed');
  });

  it('M2: a recovery curve that never recovers is reported as unmeasured, not "4+ days"', () => {
    const dates = ['2026-09-20', '2026-09-22', '2026-09-24', '2026-09-26', '2026-09-28', '2026-09-30', '2026-10-02', '2026-10-04', '2026-10-06'];
    const weights = [100, 95, 90, 85, 80, 80, 80, 80, 80];
    const workouts = dates.map((d, i) => wentry(d, [wex('Barbell Bench Press', [wset(weights[i], 1)])]));
    const m = buildAthleteModel(baseInput({ workouts }), TODAY);
    const chest = m.recovery.find((r) => r.muscle === 'Chest');
    expect(chest).toBeDefined();
    expect(chest!.measured).toBe(false);
    expect(chest!.recoveryDays.tier).toBe('prior');
    expect(chest!.recoveryDays.evidence).toContain("isn't back to full strength");
    expect(m.topFacts.some((f) => f.kind === 'recovery')).toBe(false);
  });

  it('M3: two painful lifts in ONE session is one bad day, not a flagged pattern', () => {
    const oneBadDay = [
      wentry('2026-10-15', [
        wex('Barbell Bench Press', [wset(80, 5)], { reportsPain: true }),
        wex('Incline Bench Press', [wset(60, 5)], { reportsPain: true }),
      ]),
    ];
    const m1 = buildAthleteModel(baseInput({ workouts: oneBadDay }), TODAY);
    expect(m1.pain.episodes.length).toBe(2);
    expect(m1.pain.flaggedFamilies).not.toContain('horizontal_push');

    const twoBadDays = [
      ...oneBadDay,
      wentry('2026-10-18', [wex('Barbell Bench Press', [wset(80, 5)], { reportsPain: true })]),
    ];
    const m2 = buildAthleteModel(baseInput({ workouts: twoBadDays }), TODAY);
    expect(m2.pain.flaggedFamilies).toContain('horizontal_push');
    expect(m2.pain.episodesLast28dByFamily.horizontal_push).toBe(2);
  });

  it('M4: future-dated workouts are ignored everywhere', () => {
    const past = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'].map((d, i) =>
      wentry(d, [wex('Squat', [wset(100 + i * 2, 1)])])
    );
    const future = wentry('2027-01-05', [wex('Squat', [wset(300, 1)])]);
    const m = buildAthleteModel(baseInput({ workouts: [...past, future] }), TODAY);
    expect(m.workoutsAnalyzed).toBe(4);
    expect(m.lifts[0].exposures).toBe(4);
    expect(m.lifts[0].bestE1rmKg).toBeLessThan(120);
  });

  it('m1: an Infinity-weight set cannot poison the model', () => {
    const workouts = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'].map((d, i) =>
      wentry(d, [wex('Squat', [wset(i === 3 ? Infinity : 100, 5)])])
    );
    const m = buildAthleteModel(baseInput({ workouts }), TODAY);
    const json = JSON.stringify(m);
    expect(json).not.toContain('Infinity');
    expect(json).not.toContain('NaN');
    expect(Number.isFinite(m.lifts[0].bestE1rmKg)).toBe(true);
  });

  it('m3: skipped-only workouts create neither exposures nor completions', () => {
    const skipped = wentry('2026-10-18', [
      wex('Squat', [{ reps: 5, weight: 100, unit: 'kg', completed: false, status: 'skipped' }]),
    ]);
    const m = buildAthleteModel(
      baseInput({
        workouts: [skipped],
        weeklySchedule: scheduleWith({ sunday: { workoutPlanId: 'p1' } }),
        plannedWorkouts: [plan('p1')],
      }),
      TODAY
    );
    expect(m.lifts).toEqual([]);
    expect(m.adherence.completedSessions).toBe(0);
    expect(m.adherence.plannedSessions).toBe(8);
  });

  it('m4: readiness share counts days, not entries (same-day duplicates collapse)', () => {
    const hist: ReadinessHistoryEntry[] = [
      { date: '2026-10-20', score: 30, band: 'rest' },
      { date: '2026-10-20', score: 32, band: 'rest' },
      { date: '2026-10-20', score: 28, band: 'rest' },
      { date: '2026-10-19', score: 75, band: 'ready' },
    ];
    const m = buildAthleteModel(baseInput({ readinessHistory: hist }), TODAY);
    expect(m.lowReadinessShare.n).toBe(2);
    expect(m.lowReadinessShare.value).toBe(0.5);
    expect(m.lowReadinessShare.evidence).toContain('1 of your last 2 scored days');
  });

  it('baselines carry a spread: constant check-ins spread 0, alternating spread 1', () => {
    // All inside the 56-day baseline window (today −55d = 2026-08-28).
    const DAYS = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'];
    const constant: Record<string, ManualCheckin> = {};
    DAYS.forEach((d) => (constant[d] = { sleep: 4, soreness: 3 }));
    const m1 = buildAthleteModel(baseInput({ dailyCheckins: constant }), TODAY);
    expect(m1.checkinBaselines.sleep.spread).toBe(0);

    const alternating: Record<string, ManualCheckin> = {};
    DAYS.forEach((d, i) => (alternating[d] = { sleep: i % 2 ? 5 : 3, soreness: 3 }));
    const m2 = buildAthleteModel(baseInput({ dailyCheckins: alternating }), TODAY);
    expect(m2.checkinBaselines.sleep.value).toBe(4);
    expect(m2.checkinBaselines.sleep.spread).toBe(1);
  });

  it('malformed input cannot throw (import robustness)', () => {
    const bad = {
      workouts: [{ id: 'x', date: '2026-10-20', exercises: { nope: true } }, null, { date: 42 }],
      dailyCheckins: null,
      weeklySchedule: undefined,
      plannedWorkouts: 'nope',
      readinessHistory: 7,
    } as unknown as AthleteModelInput;
    expect(() => buildAthleteModel(bad, TODAY)).not.toThrow();
    const m = buildAthleteModel(bad, TODAY);
    expect(m.lifts).toEqual([]);
  });
});
