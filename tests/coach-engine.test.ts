import { describe, it, expect } from 'vitest';
import {
  detectStalls,
  adjustNextTargets,
  calculateReadiness,
  generateCoachTake,
  generateCoachWeeklyReview,
  detectMissedSessions,
  detectPatterns,
  generateCheckIn,
  analyzeWeightTrend,
  suggestCalorieAdjustment,
  answerPlateau,
  getInitialCoachState,
  getWeightLogStats,
  isCalorieSuggestionSuppressed,
  CalorieAdjustmentRecord,
  PlannedTarget,
} from '../src/lib/coach-engine';
import {
  WorkoutEntry,
  WorkoutExercise,
  WorkoutSet,
  BodyMetricEntry,
  Unit,
} from '../src/lib/types';

// ── Fixture builders ─────────────────────────────────────────────────────────

let wid = 0;
const wset = (
  weight: number,
  reps: number,
  rpe?: number,
  unit: Unit = 'kg',
  extra: Partial<WorkoutSet> = {}
): WorkoutSet => ({ reps, weight, unit, rpe, completed: true, status: 'completed', ...extra });

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

const bmetric = (date: string, weightKg: number): BodyMetricEntry => ({ id: `m-${date}`, date, weightKg });

/** YYYY-MM-DD for n days ago (local). */
const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A bench session `n` days ago: 3 sets at given weight/reps/rpe. */
const benchSession = (n: number, weight: number, reps = 8, rpe = 8): WorkoutEntry =>
  wentry(daysAgo(n), [wex('Barbell Bench Press', [wset(weight, reps, rpe), wset(weight, reps, rpe), wset(weight, reps, rpe)])]);

// ── 1. STALL DETECTION ───────────────────────────────────────────────────────

describe('stall detection', () => {
  it('flags an exercise stalled after 3+ flat sessions', () => {
    // 5 sessions, same weight — e1RM flat (~100kg e1RM at 80x8)
    const workouts = [benchSession(28, 80, 8, 8), benchSession(21, 80, 8, 8), benchSession(14, 80, 8, 8.5), benchSession(7, 80, 8, 8.5), benchSession(1, 80, 8, 9)];
    const flags = detectStalls(workouts);
    expect(flags.length).toBe(1);
    expect(flags[0].exercise).toContain('Bench');
    expect(flags[0].sessionsStalled).toBeGreaterThanOrEqual(3);
    expect(flags[0].explanation).toContain('Bench');
    expect(flags[0].explanation.length).toBeGreaterThan(50);
  });

  it('suggests a concrete variation for a classic plateau', () => {
    // Flat load, stable moderate RPE → variation
    const workouts = [benchSession(28, 80, 8, 8), benchSession(21, 80, 8, 8), benchSession(14, 80, 8, 8), benchSession(7, 80, 8, 8), benchSession(1, 80, 8, 8)];
    const flags = detectStalls(workouts);
    expect(flags.length).toBe(1);
    expect(flags[0].suggestion).toBe('variation');
    expect(flags[0].variationName).toBeTruthy();
    expect(flags[0].explanation).toContain(flags[0].variationName!);
  });

  it('suggests deload when load is flat but RPE is climbing', () => {
    const workouts = [
      benchSession(28, 80, 8, 7),
      benchSession(21, 80, 8, 8),
      benchSession(14, 80, 8, 9),
      benchSession(7, 80, 8, 9.5),
      benchSession(1, 80, 8, 10),
    ];
    const flags = detectStalls(workouts);
    expect(flags.length).toBe(1);
    expect(flags[0].suggestion).toBe('deload');
    expect(flags[0].explanation.toLowerCase()).toContain('fatigue');
  });

  it('suggests a rep-scheme change when high reps feel easy but the lift is stuck', () => {
    const workouts = [
      benchSession(28, 60, 12, 7),
      benchSession(21, 60, 12, 7),
      benchSession(14, 60, 12, 6.5),
      benchSession(7, 60, 12, 7),
      benchSession(1, 60, 12, 6.5),
    ];
    const flags = detectStalls(workouts);
    expect(flags.length).toBe(1);
    expect(flags[0].suggestion).toBe('rep_scheme');
  });

  it('does NOT flag a steadily progressing lift', () => {
    // e1RM climbing: 80x8 → 82.5x8 → 85x8 → 87.5x8
    const workouts = [
      benchSession(28, 80, 8, 8),
      benchSession(21, 82.5, 8, 8),
      benchSession(14, 85, 8, 8.5),
      benchSession(7, 87.5, 8, 8.5),
    ];
    expect(detectStalls(workouts)).toEqual([]);
  });

  it('does NOT flag with fewer than 4 sessions', () => {
    const workouts = [benchSession(14, 80, 8, 8), benchSession(7, 80, 8, 8), benchSession(1, 80, 8, 8)];
    expect(detectStalls(workouts)).toEqual([]);
  });

  it('does NOT flag when the latest session is a new peak', () => {
    const workouts = [
      benchSession(21, 80, 8, 8),
      benchSession(14, 80, 8, 8),
      benchSession(7, 80, 8, 8),
      benchSession(1, 85, 8, 8.5), // new peak at the end
    ];
    expect(detectStalls(workouts)).toEqual([]);
  });

  it('handles empty input', () => {
    expect(detectStalls([])).toEqual([]);
  });
});

// ── 2. AUTO-REGULATION ───────────────────────────────────────────────────────

describe('auto-regulation', () => {
  const target = (exercise = 'Barbell Bench Press', weight = 80): PlannedTarget => ({
    exercise,
    weight,
    reps: 8,
    sets: 3,
    unit: 'kg',
  });

  it('backs off ~5% when RPE >= 9 and reps were missed', () => {
    const last = wentry(daysAgo(3), [
      wex('Barbell Bench Press', [
        wset(80, 8, 9.5, 'kg', { prescribedReps: 8 }),
        wset(80, 6, 10, 'kg', { prescribedReps: 8 }),
        wset(80, 5, 10, 'kg', { prescribedReps: 8 }),
      ]),
    ]);
    const [adj] = adjustNextTargets(last, [target()]);
    expect(adj.action).toBe('back_off');
    // 80 * 0.95 = 76 → rounds to 75 on the 2.5 step
    expect(adj.newTarget.weight).toBe(75);
    expect(adj.reason.toLowerCase()).toContain('grinder');
  });

  it('backs off 2.5% when RPE >= 9 but all reps were hit', () => {
    const last = wentry(daysAgo(3), [
      wex('Barbell Bench Press', [wset(80, 8, 9.5), wset(80, 8, 9), wset(80, 8, 9.5)]),
    ]);
    const [adj] = adjustNextTargets(last, [target()]);
    expect(adj.action).toBe('back_off');
    expect(adj.newTarget.weight).toBe(77.5); // 80 * 0.975 = 78 → 77.5 step
    expect(adj.reason).toContain('RPE 9');
  });

  it('pushes +5% when RPE <= 6 and everything was crisp', () => {
    const last = wentry(daysAgo(3), [
      wex('Barbell Bench Press', [wset(80, 8, 6), wset(80, 8, 6), wset(80, 8, 5.5)]),
    ]);
    const [adj] = adjustNextTargets(last, [target()]);
    expect(adj.action).toBe('push');
    expect(adj.newTarget.weight).toBe(85); // 80 * 1.05 = 84 → 85 step
  });

  it('pushes +2.5% when RPE is 7 and clean', () => {
    const last = wentry(daysAgo(3), [
      wex('Barbell Bench Press', [wset(80, 8, 7), wset(80, 8, 7), wset(80, 8, 6.5)]),
    ]);
    const [adj] = adjustNextTargets(last, [target()]);
    expect(adj.action).toBe('push');
    expect(adj.newTarget.weight).toBe(82.5);
  });

  it('holds when RPE is 8-8.5 on target', () => {
    const last = wentry(daysAgo(3), [
      wex('Barbell Bench Press', [wset(80, 8, 8), wset(80, 8, 8.5), wset(80, 8, 8)]),
    ]);
    const [adj] = adjustNextTargets(last, [target()]);
    expect(adj.action).toBe('hold');
    expect(adj.newTarget.weight).toBe(adj.oldTarget.weight);
    expect(adj.reason.toLowerCase()).toContain('holding');
  });

  it('holds (never pushes) when pain was flagged', () => {
    const last = wentry(
      daysAgo(3),
      [wex('Barbell Bench Press', [wset(80, 8, 6), wset(80, 8, 6)])],
      { reportsPain: true }
    );
    const [adj] = adjustNextTargets(last, [target()]);
    expect(adj.action).toBe('hold');
    expect(adj.reason.toLowerCase()).toContain('pain');
  });

  it('never suggests absurd jumps — caps a single adjustment', () => {
    // Even at RPE 10 with misses, the cut is bounded at 7.5%.
    const last = wentry(daysAgo(3), [
      wex('Barbell Bench Press', [
        wset(200, 3, 10, 'kg', { prescribedReps: 8 }),
        wset(200, 2, 10, 'kg', { prescribedReps: 8 }),
      ]),
    ]);
    const [adj] = adjustNextTargets(last, [target('Barbell Bench Press', 200)]);
    expect(adj.action).toBe('back_off');
    expect(adj.newTarget.weight).toBeGreaterThanOrEqual(200 * (1 - 0.075) - 2.5);
  });

  it('skips targets with no matching exercise in the last workout', () => {
    const last = wentry(daysAgo(3), [wex('Barbell Bench Press', [wset(80, 8, 8)])]);
    expect(adjustNextTargets(last, [target('Barbell Back Squat', 100)])).toEqual([]);
  });

  it('handles empty inputs', () => {
    expect(adjustNextTargets(wentry(daysAgo(1), []), [])).toEqual([]);
  });
});

// ── 3. READINESS ─────────────────────────────────────────────────────────────

describe('readiness score', () => {
  const steadyWeek = (startAgo: number, days: number[], rpe = 8): WorkoutEntry[] =>
    days.map((n) => benchSession(startAgo + n, 80, 8, rpe));

  it('scores a normal training week as ready/primed with no alarming factors', () => {
    // 3 sessions in the last 7 days + 3 more the week before, steady RPE
    const workouts = [...steadyWeek(1, [1, 3, 5]), ...steadyWeek(8, [1, 3, 5])];
    const res = calculateReadiness(workouts, [bmetric(daysAgo(10), 80), bmetric(daysAgo(1), 80)]);
    expect(res.score).toBeGreaterThanOrEqual(60);
    expect(['primed', 'ready']).toContain(res.band);
    expect(res.factors.length).toBeGreaterThan(0);
  });

  it('penalizes a sharp volume spike (acute:chronic > 1.5) toward caution', () => {
    // Quiet month, then 4 heavy sessions this week at double volume
    const base = [benchSession(24, 60, 8, 7), benchSession(17, 60, 8, 7)];
    const spike = [0, 1, 2, 3].map((n) =>
      wentry(daysAgo(n), [
        wex('Barbell Bench Press', [wset(100, 8, 9), wset(100, 8, 9), wset(100, 8, 9), wset(100, 8, 9), wset(100, 8, 9)]),
        wex('Barbell Back Squat', [wset(120, 8, 9), wset(120, 8, 9), wset(120, 8, 9), wset(120, 8, 9)]),
      ])
    );
    const res = calculateReadiness([...base, ...spike], []);
    expect(res.score).toBeLessThan(80);
    expect(res.factors.some((f) => f.toLowerCase().includes('spike'))).toBe(true);
  });

  it('suggests rest after many consecutive training days', () => {
    const workouts = Array.from({ length: 9 }, (_, i) => benchSession(i, 80, 8, 8));
    const res = calculateReadiness(workouts, []);
    expect(res.factors.some((f) => f.toLowerCase().includes('rest day'))).toBe(true);
    expect(res.score).toBeLessThan(90);
  });

  it('drops the score on a bad manual check-in', () => {
    const workouts = [...steadyWeek(1, [1, 3, 5]), ...steadyWeek(8, [1, 3, 5])];
    const good = calculateReadiness(workouts, [], { sleep: 5, soreness: 5, energy: 5 });
    const bad = calculateReadiness(workouts, [], { sleep: 1, soreness: 2, energy: 1 });
    expect(bad.score).toBeLessThan(good.score);
    expect(bad.factors.some((f) => f.toLowerCase().includes('sleep'))).toBe(true);
  });

  it('flags rising RPE trend as fatigue', () => {
    const workouts = [
      benchSession(20, 80, 8, 7),
      benchSession(17, 80, 8, 7),
      benchSession(14, 80, 8, 7),
      benchSession(6, 80, 8, 9),
      benchSession(3, 80, 8, 9.5),
      benchSession(1, 80, 8, 9.5),
    ];
    const res = calculateReadiness(workouts, []);
    expect(res.factors.some((f) => f.toLowerCase().includes('effort'))).toBe(true);
  });

  it('is conservative with no history — never primed on thin data', () => {
    const res = calculateReadiness([], []);
    expect(res.band).not.toBe('primed');
    expect(res.score).toBeLessThanOrEqual(75);
  });

  it('clamps score to 1-100', () => {
    const workouts = Array.from({ length: 12 }, (_, i) => benchSession(i, 120, 8, 10));
    const res = calculateReadiness(workouts, [], { sleep: 1, soreness: 1, energy: 1 });
    expect(res.score).toBeGreaterThanOrEqual(1);
    expect(res.score).toBeLessThanOrEqual(100);
  });
});

// ── 4. COACH'S VOICE ─────────────────────────────────────────────────────────

describe("coach's voice", () => {
  it('celebrates a PR specifically, not generically', () => {
    const history = [benchSession(7, 80, 8, 8)];
    const workout = wentry(daysAgo(0), [
      wex('Barbell Bench Press', [wset(85, 8, 9, 'kg', { isPR: true }), wset(85, 8, 9)]),
    ]);
    const take = generateCoachTake(workout, history);
    expect(take.toLowerCase()).toContain('pr');
    expect(take).toContain('Bench Press');
    // 2–3 sentences
    const sentences = take.split(/[.?!]\s+/).filter((s) => s.trim().length > 0);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    expect(sentences.length).toBeLessThanOrEqual(3);
  });

  it('flags an effort anomaly (RPE 10 on light weight) and mentions recovery', () => {
    const history = [benchSession(7, 100, 5, 8), benchSession(14, 100, 5, 8)];
    const workout = wentry(daysAgo(0), [wex('Barbell Bench Press', [wset(60, 8, 10), wset(60, 8, 10)])]);
    const take = generateCoachTake(workout, history);
    expect(take.toLowerCase()).toMatch(/sleep|stress|fatigue|recovery/);
  });

  it('diagnoses a stall with a concrete fix', () => {
    const history = [
      benchSession(28, 80, 8, 8),
      benchSession(21, 80, 8, 8),
      benchSession(14, 80, 8, 8),
      benchSession(7, 80, 8, 8),
    ];
    const workout = benchSession(0, 80, 8, 8);
    const take = generateCoachTake(workout, history);
    expect(take.toLowerCase()).toContain('stuck');
    expect(take).toContain('Bench');
  });

  it('does not sound like a robot reciting numbers', () => {
    const workout = benchSession(0, 80, 8, 8);
    const take = generateCoachTake(workout, [benchSession(7, 80, 8, 8)]);
    expect(take).not.toMatch(/you lifted \d+ kg/i);
    expect(take.length).toBeGreaterThan(80);
  });

  it('weekly review has three non-empty sections', () => {
    const week = [benchSession(1, 82.5, 8, 8), benchSession(3, 80, 8, 8), benchSession(5, 80, 8, 8)];
    const last = [benchSession(8, 80, 8, 8), benchSession(10, 80, 8, 8)];
    const review = generateCoachWeeklyReview(week, last, [bmetric(daysAgo(13), 81), bmetric(daysAgo(6), 80.8), bmetric(daysAgo(1), 80.6)]);
    expect(review.whatWorked.length).toBeGreaterThan(20);
    expect(review.whatDidnt.length).toBeGreaterThan(20);
    expect(review.nextWeek.length).toBeGreaterThan(20);
    expect(review.whatWorked.toLowerCase()).toContain('what worked');
    expect(review.nextWeek.toLowerCase()).toContain('next week');
  });

  it('weekly review handles an empty week without shaming', () => {
    const review = generateCoachWeeklyReview([], [benchSession(8, 80, 8, 8)], []);
    expect(review.whatWorked.length).toBeGreaterThan(10);
    expect(review.nextWeek.toLowerCase()).not.toMatch(/lazy|excuse|pathetic|failure/);
  });
});

// ── 5. ACCOUNTABILITY ─────────────────────────────────────────────────────────

describe('accountability', () => {
  const schedule = [
    { weekday: 0, name: 'Push Day' },
    { weekday: 2, name: 'Pull Day' },
    { weekday: 4, name: 'Leg Day' },
  ];

  it('lists planned sessions with no logged workout as missed', () => {
    // Last week's full Mon–Sun: everything is past, so everything unlogged is missed.
    const monday = (() => {
      const d = new Date();
      const wd = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - wd - 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const wed = (() => {
      const d = new Date(monday + 'T00:00:00');
      d.setDate(d.getDate() + 2);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const fri = (() => {
      const d = new Date(monday + 'T00:00:00');
      d.setDate(d.getDate() + 4);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const logged = [wentry(monday, [wex('Barbell Bench Press', [wset(80, 8, 8)])]), wentry(wed, [wex('Barbell Row', [wset(60, 8, 8)])])];
    const missed = detectMissedSessions(schedule, logged, { start: monday, end: fri });
    expect(missed.length).toBe(1);
    expect(missed[0].name).toBe('Leg Day');
    expect(missed[0].date).toBe(fri);
  });

  it('never flags future sessions as missed', () => {
    // Next week's range: nothing can be missed yet.
    const nextMonday = (() => {
      const d = new Date();
      const wd = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - wd + 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const missed = detectMissedSessions(schedule, [], { start: nextMonday, end: nextMonday });
    expect(missed.length).toBe(0);
  });

  // Live-fix L6 pin, updated by the FND-02 follow-up: the missed count is
  // an exact-date contract PLUS same-plan make-up coverage for the
  // check-in only. A session logged on an unscheduled day clears a missed
  // entry only when it carries the same plan (planId, else name) — this
  // answers the open L6 question as YES for the check-in, and is
  // revertible by deleting the make-up block in detectMissedSessions.
  // A planless or different-plan session still clears nothing, which is
  // what this test pins: the Sunday log below has no planId and no name
  // matching any planned session, so the count correctly stays 4.
  it('a session logged on an unscheduled day does not clear a missed planned day', () => {
    const monday = (() => {
      const d = new Date();
      const wd = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - wd - 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const at = (offset: number) => {
      const d = new Date(monday + 'T00:00:00');
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const fourDay = [
      { weekday: 0, name: 'Upper A' },
      { weekday: 2, name: 'Lower A' },
      { weekday: 4, name: 'Upper B' },
      { weekday: 5, name: 'Lower B' },
    ];
    const sundayLog = [wentry(at(6), [wex('Barbell Bench Press', [wset(80, 8, 8)])])];
    const missed = detectMissedSessions(fourDay, sundayLog, { start: monday, end: at(6) });
    expect(missed.length).toBe(4);
    expect(missed.map((m) => m.date).sort()).toEqual([at(0), at(2), at(4), at(5)].sort());
  });

  // FND-02 follow-up: same-plan make-up coverage. These tests pin the
  // derivation the Today coach headline reads, so a workout save that
  // adds a same-plan session on an unscheduled day moves the headline
  // without a reload (the digest memo already depends on workouts, and
  // addWorkout replaces the array — see use-coach-digest).
  it('a same-plan session logged on an unscheduled day clears that plan\'s missed entry', () => {
    const monday = (() => {
      const d = new Date();
      const wd = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - wd - 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const at = (offset: number) => {
      const d = new Date(monday + 'T00:00:00');
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const week = [
      { weekday: 0, name: 'Upper A', planId: 'p-upper-a' },
      { weekday: 1, name: 'Lower A', planId: 'p-lower-a' },
      { weekday: 3, name: 'Upper B', planId: 'p-upper-b' },
      { weekday: 4, name: 'Lower B', planId: 'p-lower-b' },
    ];
    const sundayMakeUp = [wentry(at(6), [wex('Barbell Bench Press', [wset(20, 8)])], { planId: 'p-upper-a', name: 'Upper A' })];
    const missed = detectMissedSessions(week, sundayMakeUp, { start: monday, end: at(6) });
    expect(missed.length).toBe(3);
    expect(missed.map((m) => m.date).sort()).toEqual([at(1), at(3), at(4)].sort());
  });

  it('a different-plan session on an unscheduled day clears nothing', () => {
    const monday = (() => {
      const d = new Date();
      const wd = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - wd - 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const at = (offset: number) => {
      const d = new Date(monday + 'T00:00:00');
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const week = [
      { weekday: 0, name: 'Upper A', planId: 'p-upper-a' },
      { weekday: 1, name: 'Lower A', planId: 'p-lower-a' },
      { weekday: 3, name: 'Upper B', planId: 'p-upper-b' },
      { weekday: 4, name: 'Lower B', planId: 'p-lower-b' },
    ];
    const sundayOther = [wentry(at(6), [wex('Barbell Squat', [wset(40, 8)])], { planId: 'p-squat', name: 'Squat Day' })];
    const missed = detectMissedSessions(week, sundayOther, { start: monday, end: at(6) });
    expect(missed.length).toBe(4);
  });

  it('a planless same-name session does not clear a planId missed entry', () => {
    const monday = (() => {
      const d = new Date();
      const wd = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - wd - 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const at = (offset: number) => {
      const d = new Date(monday + 'T00:00:00');
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const week = [
      { weekday: 0, name: 'Upper A', planId: 'p-upper-a' },
      { weekday: 1, name: 'Lower A', planId: 'p-lower-a' },
      { weekday: 3, name: 'Upper B', planId: 'p-upper-b' },
      { weekday: 4, name: 'Lower B', planId: 'p-lower-b' },
    ];
    const sundayNoPlan = [wentry(at(6), [wex('Barbell Bench Press', [wset(20, 8)])], { name: 'Upper A' })];
    const missed = detectMissedSessions(week, sundayNoPlan, { start: monday, end: at(6) });
    expect(missed.length).toBe(4);
  });

  it('one make-up workout covers exactly one missed entry (earliest first)', () => {
    const monday = (() => {
      const d = new Date();
      const wd = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - wd - 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const at = (offset: number) => {
      const d = new Date(monday + 'T00:00:00');
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const week = [
      { weekday: 0, name: 'Upper A', planId: 'p-upper-a' },
      { weekday: 1, name: 'Lower A', planId: 'p-lower-a' },
      { weekday: 3, name: 'Upper A', planId: 'p-upper-a' },
      { weekday: 4, name: 'Lower B', planId: 'p-lower-b' },
    ];
    const sundayMakeUp = [wentry(at(6), [wex('Barbell Bench Press', [wset(20, 8)])], { planId: 'p-upper-a', name: 'Upper A' })];
    const missed = detectMissedSessions(week, sundayMakeUp, { start: monday, end: at(6) });
    expect(missed.length).toBe(3);
    expect(missed.map((m) => m.date).sort()).toEqual([at(1), at(3), at(4)].sort());
  });

  it('a session logged on a scheduled day clears exactly that day', () => {
    const monday = (() => {
      const d = new Date();
      const wd = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - wd - 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const at = (offset: number) => {
      const d = new Date(monday + 'T00:00:00');
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const fourDay = [
      { weekday: 0, name: 'Upper A' },
      { weekday: 2, name: 'Lower A' },
      { weekday: 4, name: 'Upper B' },
      { weekday: 5, name: 'Lower B' },
    ];
    const logs = [
      wentry(at(6), [wex('Barbell Bench Press', [wset(80, 8, 8)])]),
      wentry(at(2), [wex('Barbell Back Squat', [wset(100, 6, 8)])]),
    ];
    const missed = detectMissedSessions(fourDay, logs, { start: monday, end: at(6) });
    expect(missed.length).toBe(3);
    expect(missed.map((m) => m.date)).not.toContain(at(2));
  });

  it('detects skipped legs across weeks', () => {
    // 4 weeks of training, only upper body in the last 3
    const workouts: WorkoutEntry[] = [];
    for (let wk = 0; wk < 4; wk++) {
      const base = wk * 7;
      workouts.push(
        wentry(daysAgo(base + 1), [wex('Barbell Bench Press', [wset(80, 8, 8)])]),
        wentry(daysAgo(base + 3), [wex('Barbell Row', [wset(60, 8, 8)])])
      );
    }
    // legs only in the oldest week
    workouts.push(wentry(daysAgo(22), [wex('Barbell Back Squat', [wset(100, 6, 8)])]));
    const patterns = detectPatterns(workouts);
    expect(patterns.some((p) => p.kind === 'skipped_muscle' && p.description.toLowerCase().includes('legs'))).toBe(true);
  });

  it('detects a training day that quietly disappeared', () => {
    // Saturdays trained in weeks 1-5 (oldest), nothing recent
    const workouts: WorkoutEntry[] = [];
    for (let wk = 7; wk >= 3; wk--) {
      // Saturday of each week: find a Saturday wk*7 days ago
      const d = new Date();
      d.setDate(d.getDate() - wk * 7);
      while ((d.getDay() + 6) % 7 !== 5) d.setDate(d.getDate() - 1);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      workouts.push(wentry(ds, [wex('Barbell Bench Press', [wset(80, 8, 8)])]));
    }
    // Recent weeks: train Mondays only
    for (let wk = 2; wk >= 0; wk--) {
      const d = new Date();
      d.setDate(d.getDate() - wk * 7);
      while ((d.getDay() + 6) % 7 !== 0) d.setDate(d.getDate() - 1);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      workouts.push(wentry(ds, [wex('Barbell Bench Press', [wset(80, 8, 8)])]));
    }
    const patterns = detectPatterns(workouts);
    expect(patterns.some((p) => p.kind === 'lost_training_day' && p.description.includes('Saturday'))).toBe(true);
  });

  it('check-in is gentle and offers a reschedule, never guilt', () => {
    const msg = generateCheckIn([{ date: daysAgo(2), name: 'Leg Day' }]);
    expect(msg.toLowerCase()).toMatch(/shift|reschedule|move/);
    expect(msg.toLowerCase()).not.toMatch(/lazy|excuse|disappoint|pathetic|failed you/);
    expect(msg.length).toBeGreaterThan(60);
  });

  it('check-in celebrates a clean week', () => {
    const msg = generateCheckIn([]);
    expect(msg.toLowerCase()).toMatch(/nice|great|all.*accounted/);
  });
});

// ── 6. DYNAMIC NUTRITION ─────────────────────────────────────────────────────

describe('weight trend analysis', () => {
  it('regresses a known steady loss correctly', () => {
    // -0.5 kg/week over 4 weeks
    const metrics = [0, 7, 14, 21, 28].map((n, i) => bmetric(daysAgo(28 - n), 90 - i * 0.5));
    const trend = analyzeWeightTrend(metrics);
    expect(trend.direction).toBe('losing');
    expect(trend.slopeKgPerWeek).toBeCloseTo(-0.5, 1);
    expect(trend.rSquared).toBeGreaterThan(0.95);
    expect(trend.dataPoints).toBe(5);
  });

  it('calls noisy daily bouncing flat, not a trend', () => {
    const weights = [80.2, 79.6, 80.4, 79.8, 80.1, 79.9, 80.3, 79.7];
    const metrics = weights.map((w, i) => bmetric(daysAgo(28 - i * 4), w));
    const trend = analyzeWeightTrend(metrics);
    expect(trend.direction).toBe('flat');
    expect(Math.abs(trend.slopeKgPerWeek)).toBeLessThan(0.25);
  });

  it('returns insufficient_data with too few weigh-ins', () => {
    const trend = analyzeWeightTrend([bmetric(daysAgo(10), 80), bmetric(daysAgo(3), 79.8)]);
    expect(trend.direction).toBe('insufficient_data');
  });

  it('detects gaining', () => {
    const metrics = [0, 7, 14, 21].map((n, i) => bmetric(daysAgo(21 - n), 78 + i * 0.4));
    const trend = analyzeWeightTrend(metrics);
    expect(trend.direction).toBe('gaining');
    expect(trend.slopeKgPerWeek).toBeCloseTo(0.4, 1);
  });
});

describe('calorie suggestions', () => {
  const flatTrend = { slopeKgPerWeek: 0.05, rSquared: 0.1, dataPoints: 8, spanDays: 21, direction: 'flat' as const, startWeightKg: 85, currentWeightKg: 85.1 };
  const targets = { calories: 2200, proteinG: 170 };

  it('suggests -100 to -150 kcal when cutting and the scale is flat', () => {
    const s = suggestCalorieAdjustment(flatTrend, 'lose_fat', targets, 'male');
    expect(s.action).toBe('decrease');
    expect(s.deltaKcal).toBeLessThanOrEqual(-100);
    expect(s.deltaKcal).toBeGreaterThanOrEqual(-150);
    expect(s.newCalories).toBe(2200 + s.deltaKcal);
    expect(s.reason.length).toBeGreaterThan(40);
  });

  it('holds when the cut is working at a healthy rate', () => {
    const losing = { ...flatTrend, direction: 'losing' as const, slopeKgPerWeek: -0.6 };
    const s = suggestCalorieAdjustment(losing, 'lose_fat', targets, 'male');
    expect(s.action).toBe('hold');
    expect(s.deltaKcal).toBe(0);
  });

  it('adds calories back when losing too fast', () => {
    const fast = { ...flatTrend, direction: 'losing' as const, slopeKgPerWeek: -1.4 };
    const s = suggestCalorieAdjustment(fast, 'lose_fat', targets, 'male');
    expect(s.action).toBe('increase');
    expect(s.deltaKcal).toBe(100);
  });

  it('trims a bulk that is gaining too fast', () => {
    const fast = { ...flatTrend, direction: 'gaining' as const, slopeKgPerWeek: 0.8 };
    const s = suggestCalorieAdjustment(fast, 'build_muscle', targets, 'male');
    expect(s.action).toBe('decrease');
    expect(s.deltaKcal).toBe(-100);
  });

  it('adds calories when trying to grow but the scale is flat', () => {
    const s = suggestCalorieAdjustment(flatTrend, 'build_muscle', targets, 'male');
    expect(s.action).toBe('increase');
    expect(s.deltaKcal).toBe(100);
  });

  it('never cuts below the safe minimum — flags it instead', () => {
    const low = { calories: 1550, proteinG: 150 };
    const s = suggestCalorieAdjustment(flatTrend, 'lose_fat', low, 'male');
    expect(s.atSafeMinimum).toBe(true);
    expect(s.action).toBe('hold');
    expect(s.newCalories).toBeGreaterThanOrEqual(1500);
    expect(s.reason.toLowerCase()).toContain('safe');
  });

  it('respects the female safe floor', () => {
    const low = { calories: 1250, proteinG: 130 };
    const s = suggestCalorieAdjustment(flatTrend, 'lose_fat', low, 'female');
    expect(s.atSafeMinimum).toBe(true);
    expect(s.newCalories).toBeGreaterThanOrEqual(1200);
  });
});

describe('calorie suggestion data gate', () => {
  const targets = { calories: 2200, proteinG: 170 };
  const flat = (dataPoints: number, spanDays: number) => ({
    slopeKgPerWeek: 0.02, rSquared: 0.05, dataPoints, spanDays,
    direction: 'flat' as const, startWeightKg: 85, currentWeightKg: 85,
  });

  it('holds with only 2 weigh-ins even when the goal is growth (regression: card fired too early)', () => {
    const s = suggestCalorieAdjustment(flat(2, 3), 'build_muscle', targets, 'male');
    expect(s.action).toBe('hold');
    expect(s.deltaKcal).toBe(0);
  });

  it('holds with 4 weigh-ins over a long span — the floor is 5', () => {
    const s = suggestCalorieAdjustment(flat(4, 14), 'build_muscle', targets, 'male');
    expect(s.action).toBe('hold');
    expect(s.deltaKcal).toBe(0);
  });

  it('holds with 5 weigh-ins but under 10 days of span', () => {
    const s = suggestCalorieAdjustment(flat(5, 9), 'build_muscle', targets, 'male');
    expect(s.action).toBe('hold');
    expect(s.deltaKcal).toBe(0);
  });

  it('fires on the boundary: 5 weigh-ins spanning 10 days', () => {
    const s = suggestCalorieAdjustment(flat(5, 10), 'build_muscle', targets, 'male');
    expect(s.action).toBe('increase');
    expect(s.deltaKcal).toBe(100);
    expect(s.newCalories).toBe(2300);
  });
});

describe('calorie suggestion suppression after apply/dismiss', () => {
  const rec = (appliedDaysAgo: number, basedOn: string, extra: Partial<CalorieAdjustmentRecord> = {}): CalorieAdjustmentRecord => ({
    appliedAt: daysAgo(appliedDaysAgo),
    appliedTargetKcal: 2600,
    basedOnWeightLogCount: 6,
    basedOnLatestWeightDate: basedOn,
    ...extra,
  });

  it('no record means no suppression', () => {
    expect(isCalorieSuggestionSuppressed(undefined, [bmetric(daysAgo(1), 85)], daysAgo(0))).toBe(false);
  });

  it('suppresses days after apply with only 2 fresh weigh-ins (regression: card re-offered +100 instantly)', () => {
    const logs = [bmetric(daysAgo(3), 85), bmetric(daysAgo(2), 85.1), bmetric(daysAgo(1), 85)];
    expect(isCalorieSuggestionSuppressed(rec(3, daysAgo(3)), logs, daysAgo(0))).toBe(true);
  });

  it('lifts suppression when 3 fresh weigh-ins land after the decision data', () => {
    const logs = [bmetric(daysAgo(4), 85), bmetric(daysAgo(3), 85), bmetric(daysAgo(2), 85.1), bmetric(daysAgo(1), 85)];
    expect(isCalorieSuggestionSuppressed(rec(3, daysAgo(4)), logs, daysAgo(0))).toBe(false);
  });

  it('lifts after the 14-day reassessment window even with no new logs', () => {
    const logs = [bmetric(daysAgo(14), 85)];
    expect(isCalorieSuggestionSuppressed(rec(14, daysAgo(14)), logs, daysAgo(0))).toBe(false);
  });

  it('stays suppressed on day 13 with no new logs', () => {
    const logs = [bmetric(daysAgo(13), 85)];
    expect(isCalorieSuggestionSuppressed(rec(13, daysAgo(13)), logs, daysAgo(0))).toBe(true);
  });

  it('dismissals suppress exactly like applies', () => {
    const logs = [bmetric(daysAgo(2), 85), bmetric(daysAgo(1), 85)];
    const dismissed = rec(2, daysAgo(2), { dismissed: true });
    expect(isCalorieSuggestionSuppressed(dismissed, logs, daysAgo(0))).toBe(true);
  });

  it('getWeightLogStats ignores invalid weigh-ins', () => {
    const logs = [
      bmetric(daysAgo(2), 85),
      { id: 'bad', date: daysAgo(1), weightKg: 12 }, // below human range
      { id: 'nodate', date: '', weightKg: 85 },
    ];
    const stats = getWeightLogStats(logs as any);
    expect(stats.count).toBe(1);
    expect(stats.latestDate).toBe(daysAgo(2));
  });
});

describe('plateau answers', () => {
  const flatLong = { slopeKgPerWeek: 0.02, rSquared: 0.05, dataPoints: 10, spanDays: 24, direction: 'flat' as const, startWeightKg: 85, currentWeightKg: 85 };

  it('calls a true plateau: flat 3+ weeks at good adherence', () => {
    const a = answerPlateau(flatLong, 0.9, 'lose_fat');
    expect(a.verdict).toBe('true_plateau');
    expect(a.explanation.toLowerCase()).toContain('plateau');
    expect(a.actionSteps.length).toBeGreaterThanOrEqual(2);
  });

  it('blames the adherence gap, not the plan, when consistency is low', () => {
    const a = answerPlateau(flatLong, 0.55, 'lose_fat');
    expect(a.verdict).toBe('adherence_gap');
    expect(a.explanation).toMatch(/55%/);
    expect(a.explanation.toLowerCase()).not.toMatch(/lazy|failure|disappoint/);
  });

  it('reassures when the trend is actually falling (noise)', () => {
    const losing = { ...flatLong, direction: 'losing' as const, slopeKgPerWeek: -0.5, rSquared: 0.8, spanDays: 24 };
    const a = answerPlateau(losing, 0.85, 'lose_fat');
    expect(a.verdict).toBe('noise');
    expect(a.explanation.toLowerCase()).toMatch(/not plateaued|falling/);
  });

  it('admits insufficient data honestly', () => {
    const thin = { ...flatLong, direction: 'insufficient_data' as const, dataPoints: 2, spanDays: 5 };
    const a = answerPlateau(thin, 0.9, 'lose_fat');
    expect(a.verdict).toBe('insufficient_data');
    expect(a.actionSteps.length).toBeGreaterThan(0);
  });
});

// ── Persisted state shape ────────────────────────────────────────────────────

describe('coach persisted state', () => {
  it('returns the documented initial shape', () => {
    const s = getInitialCoachState();
    expect(s.readinessHistory).toEqual([]);
    expect(s.dismissedCheckIns).toEqual([]);
    expect(s.stallFlags).toEqual({});
    expect(s.lastDeloadSuggestion).toBeUndefined();
    expect(s.lastWeeklyReviewDate).toBeUndefined();
  });

  it('starts with no calorie adjustment recorded', () => {
    expect(getInitialCoachState().lastCalorieAdjustment).toBeUndefined();
  });
});
