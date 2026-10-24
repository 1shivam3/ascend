import { describe, expect, it } from 'vitest';
import {
  applyPlateauProposalToPlan,
  buildPlateauProposals,
  deriveAdoptionSchemes,
  generateBlockProposal,
  getInitialCoachBlocksState,
  managedPlanIdByExerciseKey,
  materializeProposal,
  resolveManagedPolicy,
  snapshotPlateauExpectations,
  weekTypeForDate,
  type BlockEngineInput,
  type CoachBlocksState,
} from '@/lib/block-engine';
import { buildIntakePrefill, type BlockIntake } from '@/lib/block-intake';
import type { AthleteModel, LiftResponse } from '@/lib/athlete-model';
import type { PlannedWorkout, WeeklySchedule } from '@/lib/types';
import type { StallFlag } from '@/lib/coach-engine';
import { findLibraryExercise } from '@/lib/exercise-library';
import { adaptExerciseForEquipment, getMovementFamily } from '@/lib/workout-engine';
import { canonicalizeExerciseName } from '@/lib/workout-outcome-evidence';

const TODAY = '2026-10-22'; // Thursday

function baseIntake(over: Partial<BlockIntake> = {}): BlockIntake {
  return {
    goal: 'build_muscle',
    daysPerWeek: 4,
    sessionMinutes: 75,
    equipment: 'full_gym',
    limitations: [],
    experience: 'intermediate',
    topLifts: [],
    ...over,
  };
}

function estimate<T>(value: T, n = 6, tier: 'prior' | 'emerging' | 'established' = 'emerging') {
  return { value, n, tier, evidence: 'test fixture' } as const;
}

function lift(partial: Partial<LiftResponse> & { displayName: string }): LiftResponse {
  return {
    key: canonicalizeExerciseName(partial.displayName),
    exposures: 8,
    firstDate: '2026-08-01',
    lastDate: '2026-10-20',
    bestE1rmKg: 100,
    slopeKgPerWeek: estimate<number | null>(1.2),
    sessionsBetweenProgress: estimate<number | null>(2),
    typicalIncrementKg: estimate<number | null>(2.5),
    sessionsSinceProgress: 0,
    lastProgressDate: '2026-10-20',
    ...partial,
  };
}

function athleteModel(partial: Partial<AthleteModel> = {}): AthleteModel {
  const baseline = { mean: null, sd: null, n: 0, tier: 'prior' as const, evidence: '' };
  return {
    version: 1,
    todayStr: TODAY,
    workoutsAnalyzed: 40,
    checkinBaselines: { sleep: baseline, soreness: baseline, energy: baseline },
    lifts: [],
    recovery: [],
    adherence: {
      windowWeeks: 8,
      plannedSessions: 0,
      completedSessions: 0,
      unscheduledSessions: 0,
      adherenceRate: estimate(0),
      mostSkippedDay: null,
      mostTrainedDay: null,
    },
    pain: { episodes: [], episodesLast28dByFamily: {}, flaggedFamilies: [], recentPainExerciseKeys: [] },
    lowReadinessShare: estimate(0),
    topFacts: [],
    ...partial,
  } as AthleteModel;
}

function input(over: Partial<BlockEngineInput> = {}): BlockEngineInput {
  return {
    intake: baseIntake(),
    athleteModel: null,
    prs: [],
    workouts: [],
    existingPlans: [],
    unit: 'kg',
    todayStr: TODAY,
    ...over,
  };
}

const EMPTY_SCHEDULE: WeeklySchedule = {
  monday: { workoutPlanId: 'rest' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'rest' },
  thursday: { workoutPlanId: 'rest' },
  friday: { workoutPlanId: 'rest' },
  saturday: { workoutPlanId: 'rest' },
  sunday: { workoutPlanId: 'rest' },
};

describe('generateBlockProposal — structure', () => {
  it('is deterministic: identical inputs produce an identical proposal', () => {
    const a = generateBlockProposal(input());
    const b = generateBlockProposal(input());
    expect(a).toEqual(b);
  });

  it('cold start (no model, no history) still produces a complete, honest block', () => {
    const p = generateBlockProposal(input());
    expect(p.days).toHaveLength(4);
    expect(p.weeks.map((w) => w.type)).toEqual([
      'build',
      'build',
      'build',
      'build',
      'deload',
      'test',
    ]);
    // Every exercise carries a written rationale and a scheme exists for it.
    for (const day of p.days) {
      expect(day.exercises.length).toBeGreaterThan(0);
      for (const ex of day.exercises) {
        expect(day.whyByExercise[canonicalizeExerciseName(ex.name)]).toBeTruthy();
      }
    }
    const schemeKeys = new Set(p.schemes.map((s) => s.exerciseKey));
    for (const day of p.days) {
      for (const ex of day.exercises) {
        expect(schemeKeys.has(canonicalizeExerciseName(ex.name))).toBe(true);
      }
    }
    // Block starts on a Monday (next Monday, since today is Thursday).
    expect(p.startMonday).toBe('2026-10-26');
  });

  it('beginners and 2-day athletes get the shorter 5-week block', () => {
    const beginner = generateBlockProposal(input({ intake: baseIntake({ experience: 'beginner' }) }));
    expect(beginner.weeks.map((w) => w.type)).toEqual(['build', 'build', 'build', 'deload', 'test']);
    const twoDay = generateBlockProposal(input({ intake: baseIntake({ daysPerWeek: 2 }) }));
    expect(twoDay.days).toHaveLength(2);
    expect(twoDay.days.map((d) => d.label)).toEqual(['Full Body A', 'Full Body B']);
    expect(twoDay.weeks).toHaveLength(5);
  });

  it('6-day split composes Push/Pull/Legs twice with no empty day', () => {
    const p = generateBlockProposal(input({ intake: baseIntake({ daysPerWeek: 6 }) }));
    expect(p.days).toHaveLength(6);
    expect(p.days.map((d) => d.label)).toEqual([
      'Push A',
      'Pull A',
      'Legs A',
      'Push B',
      'Pull B',
      'Legs B',
    ]);
    for (const day of p.days) expect(day.exercises.length).toBeGreaterThan(0);
    expect(p.days.map((d) => d.weekday)).toEqual([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ]);
  });

  it('5-day split adds a weak-points day with targeted work', () => {
    const p = generateBlockProposal(input({ intake: baseIntake({ daysPerWeek: 5 }) }));
    expect(p.days).toHaveLength(5);
    const weakDay = p.days[4];
    expect(weakDay.label).toBe('Weak Points');
    expect(weakDay.exercises.length).toBeGreaterThan(0);
    for (const ex of weakDay.exercises) {
      expect(weakDay.whyByExercise[canonicalizeExerciseName(ex.name)]).toMatch(/weak-point/i);
    }
  });

  it('plan names never collide with existing plans', () => {
    const existing: PlannedWorkout[] = [
      { id: 'x', name: 'Muscle Block · Upper A', exercises: [], createdAt: '2026-01-01' },
    ];
    const p = generateBlockProposal(input({ existingPlans: existing }));
    const dayA = p.days.find((d) => d.label === 'Upper A')!;
    expect(dayA.planName).toBe('Muscle Block · Upper A (2)');
  });
});

describe('generateBlockProposal — athlete fitting', () => {
  it('bodyweight-only equipment: every programmed exercise is bodyweight-feasible', () => {
    const p = generateBlockProposal(input({ intake: baseIntake({ equipment: 'bodyweight_only' }) }));
    // Feasibility is judged by the app's own adapter: each exercise must
    // be a fixed point of adaptExerciseForEquipment under bodyweight
    // access (the library's raw equipment tag disagrees for a few
    // entries — e.g. Calf Raise — but the adapter is the authority).
    for (const day of p.days) {
      for (const ex of day.exercises) {
        const adapted = adaptExerciseForEquipment(ex, 'bodyweight_only', false, []);
        expect(adapted?.name).toBe(ex.name);
      }
    }
  });

  it('a declared knee limitation removes every squat-family movement', () => {
    const p = generateBlockProposal(
      input({ intake: baseIntake({ limitations: ['Knee pain'] }) })
    );
    for (const day of p.days) {
      for (const ex of day.exercises) {
        expect(getMovementFamily(ex.name)).not.toBe('squat');
        expect(ex.name).not.toMatch(/barbell squat/i);
      }
    }
  });

  it('a pain-flagged family (athlete model) is swapped or dropped even with no declared limitation', () => {
    const model = athleteModel({ pain: { episodes: [], episodesLast28dByFamily: { squat: 2 }, flaggedFamilies: ['squat'], recentPainExerciseKeys: [] } });
    const p = generateBlockProposal(input({ athleteModel: model }));
    for (const day of p.days) {
      for (const ex of day.exercises) {
        expect(getMovementFamily(ex.name)).not.toBe('squat');
      }
    }
  });

  it('session budget trims accessories but never below 3 exercises or the mains', () => {
    const p = generateBlockProposal(input({ intake: baseIntake({ sessionMinutes: 30 }) }));
    for (const day of p.days) {
      expect(day.estimatedMinutes).toBeLessThanOrEqual(45);
      expect(day.exercises.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('starting loads come from the estimated 1RM when history exists', () => {
    const p = generateBlockProposal(
      input({
        prs: [
          {
            id: 'pr1',
            exerciseName: 'Bench Press',
            weight: 100,
            reps: 1,
            unit: 'kg',
            date: '2026-10-01',
            estimated1RM: 100,
          } as never,
        ],
      })
    );
    const bench = p.days
      .flatMap((d) => d.exercises)
      .find((e) => e.name === 'Bench Press');
    expect(bench).toBeTruthy();
    // hypertrophy main at 72% of 100 kg, loadable-rounded.
    expect(bench!.targetWeight).toBeGreaterThanOrEqual(65);
    expect(bench!.targetWeight).toBeLessThanOrEqual(80);
  });

  it("the athlete's own observed increment drives the scheme when known", () => {
    const model = athleteModel({
      lifts: [lift({ displayName: 'Bench Press', typicalIncrementKg: estimate(5, 7, 'established') })],
    });
    const p = generateBlockProposal(input({ athleteModel: model }));
    const scheme = p.schemes.find((s) => s.exerciseKey === 'bench press')!;
    expect(scheme.incrementKg).toBe(5);
    expect(scheme.incrementSource).toBe('athlete');
    expect(scheme.assumption).toContain('5 kg');
  });

  it("an entered top lift outranks history and sets the starting load", () => {
    const p = generateBlockProposal(
      input({
        intake: baseIntake({
          topLifts: [{ name: 'Bench Press', e1rmKg: 120, source: 'entered' }],
        }),
      })
    );
    const bench = p.days
      .flatMap((d) => d.exercises)
      .find((e) => e.name === 'Bench Press');
    expect(bench).toBeTruthy();
    // 72% of the ENTERED 120 kg ≈ 86.5 loadable.
    expect(bench!.targetWeight).toBeGreaterThanOrEqual(82);
    expect(bench!.targetWeight).toBeLessThanOrEqual(90);
  });

  it('strength goal produces a strength focus with heavy main ranges', () => {
    const p = generateBlockProposal(input({ intake: baseIntake({ goal: 'get_stronger' }) }));
    expect(p.focus).toBe('strength');
    const bench = p.schemes.find((s) => s.exerciseKey === 'bench press')!;
    expect([bench.repMin, bench.repMax]).toEqual([4, 6]);
  });
});

describe('materializeProposal + week types', () => {
  it('materializes plans with coachBlockId, schedule entries, and an active block', () => {
    const p = generateBlockProposal(input());
    const { plans, schedule, activeBlock } = materializeProposal(p, [], EMPTY_SCHEDULE, TODAY);
    expect(plans).toHaveLength(4);
    for (const plan of plans) expect(plan.coachBlockId).toBe(p.id);
    for (const day of p.days) {
      expect(schedule[day.weekday]?.workoutPlanId).toBe(day.planId);
    }
    expect(activeBlock.planIds).toEqual(plans.map((pl) => pl.id));
    expect(activeBlock.status).toBe('active');
  });

  it('weekTypeForDate walks build → deload → test and tolerates out-of-range dates', () => {
    const block = {
      startMonday: '2026-10-26',
      weeks: [
        { index: 1, type: 'build' as const },
        { index: 2, type: 'build' as const },
        { index: 3, type: 'build' as const },
        { index: 4, type: 'build' as const },
        { index: 5, type: 'deload' as const },
        { index: 6, type: 'test' as const },
      ],
    };
    expect(weekTypeForDate(block, '2026-10-25')).toBe('build'); // before start
    expect(weekTypeForDate(block, '2026-11-02')).toBe('build'); // week 2
    expect(weekTypeForDate(block, '2026-11-23')).toBe('deload'); // week 5
    expect(weekTypeForDate(block, '2026-11-30')).toBe('test'); // week 6
    expect(weekTypeForDate(block, '2027-01-04')).toBe('build'); // expired
  });
});

describe('resolveManagedPolicy', () => {
  function blocksWithBlock(): { blocks: CoachBlocksState; planId: string } {
    const p = generateBlockProposal(input());
    const { activeBlock } = materializeProposal(p, [], EMPTY_SCHEDULE, TODAY);
    const blocks: CoachBlocksState = {
      ...getInitialCoachBlocksState(),
      activeBlock,
    };
    return { blocks, planId: activeBlock.planIds[0] };
  }

  it('returns null for unmanaged plans and unknown exercises', () => {
    const { blocks, planId } = blocksWithBlock();
    expect(resolveManagedPolicy(blocks, 'some-other-plan', 'Bench Press', TODAY)).toBeNull();
    expect(resolveManagedPolicy(blocks, planId, 'Nonexistent Lift XYZ', TODAY)).toBeNull();
    expect(resolveManagedPolicy(blocks, null, 'Bench Press', TODAY)).toBeNull();
  });

  it('resolves a scheme + week type for a managed lift', () => {
    const { blocks, planId } = blocksWithBlock();
    const day = generateBlockProposal(input()).days[0];
    const exName = day.exercises[0].name;
    const res = resolveManagedPolicy(blocks, planId, exName, '2026-11-23');
    expect(res).not.toBeNull();
    expect(res!.weekType).toBe('deload');
    expect(res!.origin).toBe('block');
  });

  it('a scheme holdUntil turns the lift deload for 7 days', () => {
    const { blocks, planId } = blocksWithBlock();
    const scheme = blocks.activeBlock!.schemes[0];
    scheme.holdUntil = '2026-11-02';
    const res = resolveManagedPolicy(blocks, planId, scheme.displayName, '2026-11-05');
    expect(res!.weekType).toBe('deload');
    const after = resolveManagedPolicy(blocks, planId, scheme.displayName, '2026-11-20');
    expect(after!.weekType).not.toBe('deload');
  });
});

describe('adoption (deriveAdoptionSchemes)', () => {
  const plan: PlannedWorkout = {
    id: 'mine',
    name: 'My Plan',
    createdAt: '2026-01-01',
    exercises: [
      { name: 'Barbell Squat', targetSets: 4, targetReps: 5, targetWeight: 100, targetUnit: 'kg' },
      { name: 'Leg Extension', targetSets: 3, targetReps: 12, targetWeight: 40, targetUnit: 'kg' },
      { name: 'Custom Thing', targetSets: 2, targetReps: 10 },
    ],
  };

  it('derives schemes anchored to the plan without mutating it', () => {
    const snapshot = JSON.parse(JSON.stringify(plan));
    const schemes = deriveAdoptionSchemes(plan, null);
    expect(plan).toEqual(snapshot);
    const squat = schemes.find((s) => s.exerciseKey === 'barbell squat')!;
    expect([squat.repMin, squat.repMax]).toEqual([5, 6]); // main: +1
    const legExt = schemes.find((s) => s.exerciseKey === 'leg extension')!;
    expect([legExt.repMin, legExt.repMax]).toEqual([12, 15]); // other: +3
    // Custom (non-library) exercises are managed too.
    expect(schemes.some((s) => s.exerciseKey === 'custom thing')).toBe(true);
  });

  it('managedPlanIdByExerciseKey covers block + adopted plans, block wins', () => {
    const blocks: CoachBlocksState = {
      ...getInitialCoachBlocksState(),
      adoptedPlans: {
        mine: { planId: 'mine', adoptedOn: TODAY, schemes: deriveAdoptionSchemes(plan, null) },
      },
    };
    const map = managedPlanIdByExerciseKey(blocks, [plan]);
    expect(map['barbell squat']).toBe('mine');
    expect(map['custom thing']).toBe('mine');
  });
});

describe('plateau proposals', () => {
  const flag: StallFlag = {
    exercise: 'Bench Press',
    sessionsStalled: 3,
    sessionsAnalyzed: 5,
    lastE1rmKg: 97,
    peakE1rmKg: 100,
    suggestion: 'variation',
    variationName: 'Close-Grip Bench Press',
    variationSets: 4,
    variationReps: 6,
    explanation: 'No new best in the last 3 comparable sessions.',
  };

  function setup() {
    const plan: PlannedWorkout = {
      id: 'p1',
      name: 'Upper A',
      createdAt: '2026-01-01',
      exercises: [
        { name: 'Bench Press', targetSets: 4, targetReps: 6, targetWeight: 80, targetUnit: 'kg' },
      ],
    };
    const schemes = deriveAdoptionSchemes(plan, null);
    const blocks: CoachBlocksState = {
      ...getInitialCoachBlocksState(),
      adoptedPlans: { p1: { planId: 'p1', adoptedOn: TODAY, schemes } },
    };
    return { plan, schemes, blocks };
  }

  it('fires exactly at the detectStalls threshold with real numbers as evidence', () => {
    const { blocks } = setup();
    const out = buildPlateauProposals({
      stalls: [flag],
      blocks,
      planIdByExerciseKey: { 'bench press': 'p1' },
      acknowledgedKeys: new Set(),
      todayStr: TODAY,
    });
    expect(out).toHaveLength(1);
    expect(out[0].evidence).toContain('3 of the last 5');
    expect(out[0].evidence).toContain('100');
    expect(out[0].change).toEqual({
      type: 'variation',
      newName: 'Close-Grip Bench Press',
      sets: 4,
      reps: 6,
    });
  });

  it('never proposes for unmanaged lifts, acknowledged lifts, or a dismissed same-change', () => {
    const { blocks } = setup();
    expect(
      buildPlateauProposals({
        stalls: [flag],
        blocks,
        planIdByExerciseKey: {},
        acknowledgedKeys: new Set(),
        todayStr: TODAY,
      })
    ).toHaveLength(0);
    expect(
      buildPlateauProposals({
        stalls: [flag],
        blocks,
        planIdByExerciseKey: { 'bench press': 'p1' },
        acknowledgedKeys: new Set(['bench press']),
        todayStr: TODAY,
      })
    ).toHaveLength(0);
    const dismissed: CoachBlocksState = {
      ...blocks,
      plateauProposals: [
        {
          id: 'old',
          exerciseKey: 'bench press',
          displayName: 'Bench Press',
          planId: 'p1',
          suggestion: 'variation',
          evidence: '',
          change: { type: 'variation', newName: 'X', sets: 3, reps: 8 },
          changeText: '',
          expected: {},
          status: 'dismissed',
          createdOn: '2026-10-01',
        },
      ],
    };
    expect(
      buildPlateauProposals({
        stalls: [flag],
        blocks: dismissed,
        planIdByExerciseKey: { 'bench press': 'p1' },
        acknowledgedKeys: new Set(),
        todayStr: TODAY,
      })
    ).toHaveLength(0);
  });

  it('applying a variation renames the lift, clears the load, and re-keys the scheme', () => {
    const { plan, schemes, blocks } = setup();
    const [proposal] = snapshotPlateauExpectations(
      buildPlateauProposals({
        stalls: [flag],
        blocks,
        planIdByExerciseKey: { 'bench press': 'p1' },
        acknowledgedKeys: new Set(),
        todayStr: TODAY,
      }),
      [plan]
    );
    const result = applyPlateauProposalToPlan(plan, schemes, proposal, TODAY);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.plan.exercises[0].name).toBe('Close-Grip Bench Press');
    expect(result.plan.exercises[0].targetWeight).toBeUndefined();
    expect(result.schemes.some((s) => s.exerciseKey === 'close-grip bench press')).toBe(true);
    expect(result.schemes.some((s) => s.exerciseKey === 'bench press')).toBe(false);
  });

  it('a stale proposal (plan moved on) refuses to edit', () => {
    const { plan, schemes, blocks } = setup();
    const [proposal] = snapshotPlateauExpectations(
      buildPlateauProposals({
        stalls: [flag],
        blocks,
        planIdByExerciseKey: { 'bench press': 'p1' },
        acknowledgedKeys: new Set(),
        todayStr: TODAY,
      }),
      [plan]
    );
    const movedPlan: PlannedWorkout = {
      ...plan,
      exercises: [{ ...plan.exercises[0], targetWeight: 85 }],
    };
    const result = applyPlateauProposalToPlan(movedPlan, schemes, proposal, TODAY);
    expect(result).toEqual({ error: 'stale' });
  });

  it('technique reset drops the load 10% (loadable-rounded) and narrows the scheme', () => {
    const { plan, schemes, blocks } = setup();
    const techFlag: StallFlag = { ...flag, suggestion: 'technique', variationName: undefined };
    const [proposal] = snapshotPlateauExpectations(
      buildPlateauProposals({
        stalls: [techFlag],
        blocks,
        planIdByExerciseKey: { 'bench press': 'p1' },
        acknowledgedKeys: new Set(),
        todayStr: TODAY,
      }),
      [plan]
    );
    const result = applyPlateauProposalToPlan(plan, schemes, proposal, TODAY);
    if ('error' in result) throw new Error('unexpected stale');
    expect(result.plan.exercises[0].targetWeight).toBe(72.5); // 80 * 0.9 = 72 → loadable 72.5
  });
});

describe('buildIntakePrefill', () => {
  it('pre-ticks limitation chips for pain-flagged families and says why', () => {
    const model = athleteModel({ pain: { episodes: [], episodesLast28dByFamily: { squat: 2 }, flaggedFamilies: ['squat'], recentPainExerciseKeys: [] } });
    const { intake, flaggedChips } = buildIntakePrefill({
      profile: null,
      trainingProfile: null,
      athleteModel: model,
      workouts: [],
      prs: [],
    });
    expect(intake.limitations).toContain('Knee');
    expect(flaggedChips.some((f) => /pain/i.test(f.reason))).toBe(true);
  });

  it('cold start prefills safe defaults and no limitations', () => {
    const { intake } = buildIntakePrefill({
      profile: null,
      trainingProfile: null,
      athleteModel: null,
      workouts: [],
      prs: [],
    });
    expect(intake.daysPerWeek).toBe(3);
    expect(intake.limitations).toEqual([]);
    expect(intake.topLifts).toEqual([]);
  });
});
