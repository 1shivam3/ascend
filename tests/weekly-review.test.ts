import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildBlockDebrief,
  buildSessionDebrief,
  buildWeeklyReview,
  isBlockEnded,
  lastCompletedWeekMonday,
  type WeeklyReviewInput,
} from '@/lib/weekly-review';
import { deriveAdoptionSchemes, getInitialCoachBlocksState, type ActiveCoachBlock } from '@/lib/block-engine';
import type { AthleteModel } from '@/lib/athlete-model';
import type { PlannedWorkout, WeeklySchedule, WorkoutEntry } from '@/lib/types';
import type { StallFlag } from '@/lib/coach-engine';
import { useStore } from '@/lib/store';
import { getLocalTodayStr } from '@/lib/formatters';

// Week under review: Mon 2026-10-12 → Sun 2026-10-18.
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

function wset(weight: number, reps: number, unit: 'kg' | 'lbs' = 'kg') {
  return { reps, weight, unit, status: 'completed' as const, isCompleted: true };
}

function went(id: string, date: string, name: string, sets: ReturnType<typeof wset>[]): WorkoutEntry {
  return {
    id,
    name: 'Session',
    date,
    duration: 60,
    exercises: [{ name, sets }],
  } as unknown as WorkoutEntry;
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
    pain: { episodes: [], episodesLast28dByFamily: {}, flaggedFamilies: [] },
    lowReadinessShare: estimate(0),
    topFacts: [],
    ...partial,
  } as AthleteModel;
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

describe('buildWeeklyReview — Mon–Sun aggregation', () => {
  it('counts Sunday inside the week and the next Monday outside it', () => {
    const review = buildWeeklyReview(
      input({
        workouts: [
          went('a', '2026-10-12', 'Bench Press', [wset(100, 5), wset(100, 5), wset(100, 5)]),
          went('b', '2026-10-18', 'Barbell Squat', [wset(120, 5)]), // Sunday
          went('c', '2026-10-19', 'Bench Press', [wset(999, 1)]), // next Monday — excluded
        ],
      })
    );
    expect(review.weekMonday).toBe(MON);
    expect(review.weekSunday).toBe('2026-10-18');
    expect(review.tonnageKg).toBe(1500 + 600);
    expect(review.sessionsCompleted).toBe(1); // only Monday of the 3 scheduled days was trained (Sunday was extra)
    expect(review.sessionsPlanned).toBe(3);
    expect(review.missedDays).toEqual(['wednesday', 'friday']);
  });

  it('tonnage converts lbs to kg and deltas against the prior week', () => {
    const review = buildWeeklyReview(
      input({
        workouts: [
          went('a', '2026-10-12', 'Bench Press', [wset(220, 5, 'lbs'), wset(220, 5, 'lbs'), wset(220, 5, 'lbs')]),
          went('p', '2026-10-05', 'Bench Press', [wset(80, 5), wset(80, 5), wset(80, 5)]),
        ],
      })
    );
    expect(review.tonnageKg).toBe(1497); // 220 lbs ≈ 99.8 kg × 15 reps
    expect(review.tonnageDeltaPct).toBe(25); // 1200 → 1497 ≈ +25%
  });

  it('an empty week yields a short, honest review — no invented numbers', () => {
    const review = buildWeeklyReview(
      input({ weeklySchedule: {
        monday: { workoutPlanId: 'rest' }, tuesday: { workoutPlanId: 'rest' },
        wednesday: { workoutPlanId: 'rest' }, thursday: { workoutPlanId: 'rest' },
        friday: { workoutPlanId: 'rest' }, saturday: { workoutPlanId: 'rest' },
        sunday: { workoutPlanId: 'rest' },
      } })
    );
    expect(review.sessionsPlanned).toBe(0);
    expect(review.sessionsCompleted).toBe(0);
    expect(review.tonnageKg).toBe(0);
    expect(review.tonnageDeltaPct).toBeNull();
    expect(review.volumeHighlights).toEqual([]);
    expect(review.focus.kind).toBe('consistency');
    expect(review.focus.headline).toMatch(/quiet week/i);
  });

  it('PRs inside the week are listed; PRs outside are not', () => {
    const review = buildWeeklyReview(
      input({
        prs: [
          { id: '1', exercise: 'Bench Press', weightKg: 100, weightLbs: 220, reps: 1, oneRepMax: 100, date: '2026-10-15' },
          { id: '2', exercise: 'Deadlift', weightKg: 180, weightLbs: 397, reps: 1, oneRepMax: 180, date: '2026-10-05' },
        ] as never,
      })
    );
    expect(review.prs).toHaveLength(1);
    expect(review.prs[0].exercise).toBe('Bench Press');
  });
});

describe('buildWeeklyReview — focus priority', () => {
  const missedWeek = [
    went('a', '2026-10-12', 'Bench Press', [wset(100, 5), wset(100, 5), wset(100, 5)]),
  ];

  it('safety (pain pattern) outranks adherence', () => {
    const review = buildWeeklyReview(
      input({
        workouts: missedWeek,
        athleteModel: athleteModel({
          pain: { episodes: [], episodesLast28dByFamily: { squat: 2 }, flaggedFamilies: ['squat'] },
        }),
      })
    );
    expect(review.focus.kind).toBe('safety');
    expect(review.painEscalation).toMatch(/squat/i);
  });

  it('adherence fires when completion < 75% with a missed day', () => {
    const review = buildWeeklyReview(input({ workouts: missedWeek }));
    expect(review.focus.kind).toBe('adherence');
    expect(review.focus.headline).toMatch(/wednesday/i);
  });

  it('a managed stall outranks the consistency fallback', () => {
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
      input({
        workouts: [
          went('a', '2026-10-12', 'Bench Press', [wset(100, 5), wset(100, 5), wset(100, 5)]),
          went('b', '2026-10-14', 'Bench Press', [wset(100, 5), wset(100, 5), wset(100, 5)]),
          went('c', '2026-10-16', 'Bench Press', [wset(100, 5), wset(100, 5), wset(100, 5)]),
        ],
        coachBlocks: {
          ...getInitialCoachBlocksState(),
          adoptedPlans: { p1: { planId: 'p1', adoptedOn: '2026-10-01', schemes: deriveAdoptionSchemes(plan, null) } },
        },
        stalls: [stall],
      })
    );
    expect(review.focus.kind).toBe('stall');
    expect(review.revisions.some((r) => r.kind === 'stall_change')).toBe(true);
  });
});

describe('buildWeeklyReview — revisions', () => {
  it('proposes a schedule move for the repeatedly-skipped day (model + this week agree)', () => {
    const review = buildWeeklyReview(
      input({
        workouts: [
          went('a', '2026-10-12', 'Bench Press', [wset(100, 5)]),
          went('b', '2026-10-14', 'Bench Press', [wset(100, 5)]),
        ],
        athleteModel: athleteModel({
          adherence: {
            windowWeeks: 8,
            plannedSessions: 24,
            completedSessions: 18,
            unscheduledSessions: 0,
            adherenceRate: estimate(0.75),
            mostSkippedDay: 'friday',
            mostTrainedDay: 'monday',
          },
        }),
      })
    );
    const move = review.revisions.find((r) => r.kind === 'schedule_move');
    expect(move).toBeTruthy();
    if (move && move.kind === 'schedule_move') {
      expect(move.fromDay).toBe('friday');
      expect(move.toDay).toBe('thursday'); // nearest free adjacent day
      expect(move.planId).toBe('p1');
    }
  });

  it('no schedule move when the skipped day was trained this week', () => {
    const review = buildWeeklyReview(
      input({
        workouts: [
          went('a', '2026-10-12', 'Bench Press', [wset(100, 5)]),
          went('b', '2026-10-14', 'Bench Press', [wset(100, 5)]),
          went('c', '2026-10-16', 'Bench Press', [wset(100, 5)]),
        ],
        athleteModel: athleteModel({
          adherence: {
            windowWeeks: 8,
            plannedSessions: 24,
            completedSessions: 18,
            unscheduledSessions: 0,
            adherenceRate: estimate(0.75),
            mostSkippedDay: 'friday',
            mostTrainedDay: 'monday',
          },
        }),
      })
    );
    expect(review.revisions.some((r) => r.kind === 'schedule_move')).toBe(false);
  });

  it('announces next week type for an active block', () => {
    const block: ActiveCoachBlock = {
      proposalId: 'b1',
      name: 'Strength Block',
      focus: 'strength',
      planIds: ['p1'],
      startMonday: '2026-09-21',
      weeks: [
        { index: 1, type: 'build' }, { index: 2, type: 'build' }, { index: 3, type: 'build' },
        { index: 4, type: 'build' }, { index: 5, type: 'deload' }, { index: 6, type: 'test' },
      ],
      schemes: [],
      intake: { goal: 'get_stronger', daysPerWeek: 3, sessionMinutes: 75, equipment: 'full_gym', limitations: [], experience: 'intermediate', topLifts: [] },
      status: 'active',
      createdOn: '2026-09-20',
    };
    // Review week Oct 12–18 = block week 4; next week (Oct 19) = week 5 = deload.
    const review = buildWeeklyReview(
      input({ coachBlocks: { ...getInitialCoachBlocksState(), activeBlock: block } })
    );
    const rev = review.revisions.find((r) => r.kind === 'next_week_type');
    expect(rev?.text).toMatch(/deload/i);
  });
});

describe('lastCompletedWeekMonday', () => {
  it('on a Monday, the completed week is the one that just ended', () => {
    expect(lastCompletedWeekMonday('2026-10-19')).toBe('2026-10-12'); // Monday
    expect(lastCompletedWeekMonday('2026-10-22')).toBe('2026-10-12'); // Thursday
    expect(lastCompletedWeekMonday('2026-10-25')).toBe('2026-10-12'); // Sunday
  });
});

describe('buildSessionDebrief', () => {
  const plan: PlannedWorkout = {
    id: 'p1',
    name: 'Upper A',
    createdAt: '2026-01-01',
    exercises: [{ name: 'Bench Press', targetSets: 3, targetReps: 5, targetWeight: 80, targetUnit: 'kg' }],
  };
  const blocks = {
    ...getInitialCoachBlocksState(),
    adoptedPlans: { p1: { planId: 'p1', adoptedOn: '2026-10-01', schemes: deriveAdoptionSchemes(plan, null) } },
  };

  it('returns null for an unmanaged workout', () => {
    const out = buildSessionDebrief({
      workoutName: 'Upper A',
      exercises: [{ name: 'Bench Press', sets: [{ reps: 6, weight: 80, completed: true }] }],
      plannedWorkouts: [plan],
      coachBlocks: getInitialCoachBlocksState(),
      dateStr: '2026-10-22',
      unit: 'kg',
    });
    expect(out).toBeNull();
  });

  it('reports a ceiling hit with the scheme increment as the cue', () => {
    const out = buildSessionDebrief({
      workoutName: 'Upper A',
      exercises: [
        {
          name: 'Bench Press',
          sets: [0, 1, 2].map(() => ({ reps: 6, weight: 80, completed: true })),
        },
      ],
      plannedWorkouts: [plan],
      coachBlocks: blocks,
      dateStr: '2026-10-22',
      unit: 'kg',
    });
    expect(out).not.toBeNull();
    expect(out!.lines.join(' ')).toMatch(/top of its 5–6 range/);
    expect(out!.cue).toMatch(/2\.5 kg/);
  });

  it('a deload week frames the session honestly (loads held by design)', () => {
    const block: ActiveCoachBlock = {
      proposalId: 'b1',
      name: 'Strength Block',
      focus: 'strength',
      planIds: ['p1'],
      startMonday: '2026-09-28',
      weeks: [
        { index: 1, type: 'build' }, { index: 2, type: 'build' }, { index: 3, type: 'build' },
        { index: 4, type: 'deload' }, { index: 5, type: 'test' },
      ],
      schemes: deriveAdoptionSchemes(plan, null),
      intake: { goal: 'get_stronger', daysPerWeek: 3, sessionMinutes: 75, equipment: 'full_gym', limitations: [], experience: 'intermediate', topLifts: [] },
      status: 'active',
      createdOn: '2026-09-27',
    };
    const out = buildSessionDebrief({
      workoutName: 'Upper A',
      exercises: [
        { name: 'Bench Press', sets: [{ reps: 5, weight: 70, completed: true }] },
      ],
      plannedWorkouts: [plan],
      coachBlocks: { ...getInitialCoachBlocksState(), activeBlock: block },
      dateStr: '2026-10-22', // week 4 = deload
      unit: 'kg',
    });
    expect(out).not.toBeNull();
    expect(out!.lines[0]).toMatch(/deload week/i);
  });
});

describe('block debrief', () => {
  const block: ActiveCoachBlock = {
    proposalId: 'b1',
    name: 'Muscle Block',
    focus: 'hypertrophy',
    planIds: ['p1'],
    startMonday: '2026-09-07',
    weeks: [
      { index: 1, type: 'build' }, { index: 2, type: 'build' }, { index: 3, type: 'build' },
      { index: 4, type: 'build' }, { index: 5, type: 'deload' }, { index: 6, type: 'test' },
    ],
    schemes: [
      {
        exerciseKey: 'bench press',
        displayName: 'Bench Press',
        kind: 'double_progression',
        repMin: 6,
        repMax: 10,
        incrementKg: 2.5,
        incrementSource: 'equipment_default',
        assumption: 'fixture',
      },
    ],
    intake: { goal: 'build_muscle', daysPerWeek: 3, sessionMinutes: 75, equipment: 'full_gym', limitations: [], experience: 'intermediate', topLifts: [] },
    status: 'active',
    createdOn: '2026-09-06',
  };

  it('isBlockEnded flips only after the final Sunday', () => {
    expect(isBlockEnded(block, '2026-10-18')).toBe(false);
    expect(isBlockEnded(block, '2026-10-19')).toBe(true);
  });

  it('computes e1RM change first week → test week and completion', () => {
    const workouts: WorkoutEntry[] = [];
    // Train Mon/Wed/Fri of every block week (18 sessions).
    for (let w = 0; w < 6; w++) {
      for (const off of [0, 2, 4]) {
        const d = new Date(2026, 8, 7 + w * 7 + off);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const isTestWeek = w === 5;
        workouts.push(
          went(`w${w}-${off}`, ds, 'Bench Press', [
            wset(isTestWeek ? 90 : 80, isTestWeek ? 3 : 5),
            wset(isTestWeek ? 90 : 80, isTestWeek ? 3 : 5),
          ])
        );
      }
    }
    const debrief = buildBlockDebrief({
      block,
      workouts,
      plannedWorkouts: [
        { id: 'p1', name: 'Upper A', createdAt: '2026-01-01', exercises: [] },
      ],
      weeklySchedule: SCHEDULE,
      athleteModel: null,
    });
    expect(debrief.completionLine).toMatch(/18 of 18/);
    const bench = debrief.liftChanges.find((l) => l.name === 'Bench Press')!;
    expect(bench.fromKg).toBeCloseTo(93.3, 0); // 80×5 e1rm
    expect(bench.toKg).toBeCloseTo(99, 0); // 90×3 e1rm
    expect(bench.line).toMatch(/\+5\.7 kg|\+5\.6 kg/);
  });
});

describe('store: weekly review lifecycle', () => {
  beforeEach(() => {
    useStore.setState({
      weeklyReviews: [],
      workouts: [],
      plannedWorkouts: [],
      weeklySchedule: SCHEDULE,
      coachBlocks: getInitialCoachBlocksState(),
      athleteModel: null,
      prs: [],
      profile: null,
      dailyCheckins: {},
      policyDecisionRecords: {},
    } as never);
  });

  it('refresh builds exactly one review for the last completed week', () => {
    const s = useStore.getState();
    s.refreshWeeklyReview();
    s.refreshWeeklyReview();
    const reviews = useStore.getState().weeklyReviews;
    expect(reviews).toHaveLength(1);
    expect(reviews[0].weekMonday).toBe(lastCompletedWeekMonday(getLocalTodayStr()));
    s.markWeeklyReviewSeen(reviews[0].weekMonday);
    expect(useStore.getState().weeklyReviews[0].seen).toBe(true);
  });

  it('applyScheduleRevision moves the plan and marks the revision applied once', () => {
    const review = buildWeeklyReview(
      input({
        workouts: [
          went('a', '2026-10-12', 'Bench Press', [wset(100, 5)]),
          went('b', '2026-10-14', 'Bench Press', [wset(100, 5)]),
        ],
        athleteModel: athleteModel({
          adherence: {
            windowWeeks: 8, plannedSessions: 24, completedSessions: 18, unscheduledSessions: 0,
            adherenceRate: estimate(0.75), mostSkippedDay: 'friday', mostTrainedDay: 'monday',
          },
        }),
      })
    );
    useStore.setState({
      weeklyReviews: [review],
      plannedWorkouts: [{ id: 'p1', name: 'Upper', createdAt: '2026-01-01', exercises: [{ name: 'Bench Press', targetSets: 3, targetReps: 5 }] }],
      weeklySchedule: SCHEDULE,
    } as never);
    useStore.getState().applyScheduleRevision('2026-10-12');
    const after = useStore.getState();
    expect(after.weeklySchedule.friday.workoutPlanId).toBe('rest');
    expect(after.weeklySchedule.thursday.workoutPlanId).toBe('p1');
    const rev = after.weeklyReviews[0].revisions.find((r) => r.kind === 'schedule_move');
    expect(rev && rev.kind === 'schedule_move' && rev.applied).toBe(true);
    // Second apply: no-op (already applied).
    const snapshot = JSON.stringify(after.weeklySchedule);
    after.applyScheduleRevision('2026-10-12');
    expect(JSON.stringify(useStore.getState().weeklySchedule)).toBe(snapshot);
  });
});
