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
import type { PlannedWorkout, WeeklySchedule, WorkoutEntry } from '@/lib/types';
import type { StallFlag } from '@/lib/coach-engine';
import { findLibraryExercise, type MovementFamily } from '@/lib/exercise-library';
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

describe('continuity (Fix D)', () => {
  it('cold-start hypertrophy copy never claims logged progress; with history it may', () => {
    const cold = generateBlockProposal(input());
    expect(cold.summary).not.toContain('where your logged progress has come from');
    expect(cold.summary).toContain('conservative defaults that calibrate');
    const warm = generateBlockProposal(
      input({ workouts: [{ id: 'w1', date: TODAY, exercises: [] }] })
    );
    expect(warm.summary).toContain('where your logged progress has come from');
  });

  it('generation unifies one starting load per lift across the block\'s days', () => {
    // Was: per-template skeleton defaults disagreed (Lat Pulldown
    // 30 kg on one day, 0 kg on another in the same cold-start block).
    // The beginner 3-day split is where lifts repeat across days
    // (Lat Pulldown on both Full Body and Upper B).
    const p = generateBlockProposal(
      input({ intake: baseIntake({ daysPerWeek: 3, experience: 'beginner' }) })
    );
    const pulldowns = p.days.flatMap((d) =>
      d.exercises.filter((e) => e.name === 'Lat Pulldown').map((e) => e.targetWeight)
    );
    expect(pulldowns.length).toBeGreaterThanOrEqual(2);
    expect(new Set(pulldowns).size).toBe(1);
    expect(pulldowns[0]).toBeGreaterThan(0);
    const byKey = new Map<string, (number | undefined)[]>();
    for (const day of p.days) {
      for (const ex of day.exercises) {
        const k = canonicalizeExerciseName(ex.name);
        byKey.set(k, [...(byKey.get(k) ?? []), ex.targetWeight]);
      }
    }
    let repeated = 0;
    for (const [, weights] of byKey) {
      if (weights.length < 2) continue;
      repeated++;
      const positives = new Set(weights.filter((w) => typeof w === 'number' && w > 0));
      expect(positives.size).toBeLessThanOrEqual(1);
      if (positives.size === 1) {
        // A real load somewhere means no zero prescription anywhere.
        expect(weights).not.toContain(0);
      }
    }
    expect(repeated).toBeGreaterThan(0);
  });

  it('generation preserves supplied current weekdays when the day count matches', () => {
    const current: BlockEngineInput['currentWeekdays'] = [
      'tuesday',
      'thursday',
      'saturday',
      'sunday',
    ];
    const p = generateBlockProposal(input({ currentWeekdays: current }));
    expect(p.days.map((d) => d.weekday)).toEqual(current);
    expect(p.summary).toContain('training days stay');
    // Day-count change re-opens the choice (no preservation claim).
    const changed = generateBlockProposal(input({ currentWeekdays: ['monday', 'wednesday', 'friday'] }));
    expect(changed.days).toHaveLength(4);
    expect(changed.summary).not.toContain('training days stay');
  });

  it('pain-flagged pressing is excluded at generation, and returns when the flags clear', () => {
    // The athlete model's pain window is 28 days (aging pinned in
    // athlete-model.test.ts): once episodes age out, flaggedFamilies
    // and recentPainExerciseKeys come back empty — the cleared model
    // below — and generation must treat pressing as eligible again.
    const flagged = generateBlockProposal(
      input({
        athleteModel: athleteModel({
          pain: {
            episodes: [],
            episodesLast28dByFamily: { horizontal_push: 2 },
            flaggedFamilies: ['horizontal_push'],
            recentPainExerciseKeys: [canonicalizeExerciseName('Bench Press')],
          },
        }),
      })
    );
    const flaggedNames = flagged.days.flatMap((d) => d.exercises.map((e) => e.name));
    expect(flaggedNames).not.toContain('Bench Press');

    const cleared = generateBlockProposal(input({ athleteModel: athleteModel() }));
    const clearedNames = cleared.days.flatMap((d) => d.exercises.map((e) => e.name));
    expect(clearedNames).toContain('Bench Press');
  });

  it('materializeProposal retires the superseded block\'s schedule days to rest', () => {
    const p = generateBlockProposal(input());
    const used = new Set(p.days.map((d) => d.weekday));
    const spare = (['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).filter(
      (d) => !used.has(d)
    );
    expect(spare.length).toBeGreaterThanOrEqual(2);
    const oldBlockPlan: PlannedWorkout = {
      id: 'old-plan',
      name: 'Old Block · Upper A',
      createdAt: '2026-01-01',
      exercises: [],
      coachBlockId: 'block_old',
    };
    const userPlan: PlannedWorkout = {
      id: 'user-plan',
      name: 'My own plan',
      createdAt: '2026-01-01',
      exercises: [],
    };
    const scheduleIn: WeeklySchedule = {
      ...EMPTY_SCHEDULE,
      [spare[0]]: { workoutPlanId: 'old-plan' },
      [spare[1]]: { workoutPlanId: 'user-plan' },
    };
    const { schedule } = materializeProposal(p, [oldBlockPlan, userPlan], scheduleIn, TODAY);
    // Stale coach-block day → rest; the lifter's own plan is untouched.
    expect(schedule[spare[0]].workoutPlanId).toBe('rest');
    expect(schedule[spare[1]].workoutPlanId).toBe('user-plan');
    // And the new block's own days are set as before.
    for (const day of p.days) {
      expect(schedule[day.weekday]?.workoutPlanId).toBe(day.planId);
    }
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

describe('managedPlanIdByExerciseKey — block plan ownership', () => {
  const planA: PlannedWorkout = {
    id: 'pa',
    name: 'Upper A',
    createdAt: '2026-01-01',
    exercises: [
      { name: 'Bench Press', targetSets: 4, targetReps: 6, targetWeight: 80, targetUnit: 'kg' },
      { name: 'Barbell Row', targetSets: 4, targetReps: 8, targetWeight: 60, targetUnit: 'kg' },
    ],
  };
  const planB: PlannedWorkout = {
    id: 'pb',
    name: 'Lower A',
    createdAt: '2026-01-01',
    exercises: [
      { name: 'Squat', targetSets: 4, targetReps: 5, targetWeight: 100, targetUnit: 'kg' },
    ],
  };

  function blockWith(plans: PlannedWorkout[], extraSchemeNames: string[] = []) {
    const schemes = plans
      .flatMap((p) => deriveAdoptionSchemes(p, null))
      .concat(
        extraSchemeNames.map((name) =>
          deriveAdoptionSchemes(
            {
              id: 'ghost',
              name: 'Ghost',
              createdAt: '2026-01-01',
              exercises: [{ name, targetSets: 3, targetReps: 8 }],
            },
            null
          )
        ).flat()
      );
    const blocks: CoachBlocksState = {
      ...getInitialCoachBlocksState(),
      activeBlock: {
        proposalId: 'prop-1',
        name: 'Test Block',
        focus: 'hypertrophy',
        planIds: plans.map((p) => p.id),
        startMonday: '2026-01-05',
        weeks: [{ index: 1, type: 'build' }],
        schemes,
        intake: baseIntake(),
        status: 'active',
        createdOn: TODAY,
      },
    };
    return blocks;
  }

  it('maps each block lift to the plan that actually contains it — not the last plan', () => {
    const map = managedPlanIdByExerciseKey(blockWith([planA, planB]), [planA, planB]);
    expect(map['bench press']).toBe('pa');
    expect(map['barbell row']).toBe('pa');
    expect(map['squat']).toBe('pb');
  });

  it('a lift appearing in two block plans maps to the first plan in planIds order', () => {
    const planB2: PlannedWorkout = {
      ...planB,
      exercises: [
        ...planB.exercises,
        { name: 'Bench Press', targetSets: 3, targetReps: 8, targetWeight: 70, targetUnit: 'kg' },
      ],
    };
    const map = managedPlanIdByExerciseKey(blockWith([planA, planB2]), [planA, planB2]);
    expect(map['bench press']).toBe('pa');
    expect(map['squat']).toBe('pb');
  });

  it('a managed scheme whose lift is in no block plan is left unmapped (unmanaged, not misrouted)', () => {
    const map = managedPlanIdByExerciseKey(blockWith([planA, planB], ['Deadlift']), [
      planA,
      planB,
    ]);
    expect(map['deadlift']).toBeUndefined();
  });

  it('block ownership wins over an adopted plan for the same lift; adopted fills the gaps', () => {
    const adopted: PlannedWorkout = {
      id: 'mine',
      name: 'My Plan',
      createdAt: '2026-01-01',
      exercises: [
        { name: 'Bench Press', targetSets: 4, targetReps: 6, targetWeight: 75, targetUnit: 'kg' },
        { name: 'Leg Extension', targetSets: 3, targetReps: 12, targetWeight: 40, targetUnit: 'kg' },
      ],
    };
    const blocks: CoachBlocksState = {
      ...blockWith([planA, planB]),
      adoptedPlans: {
        mine: { planId: 'mine', adoptedOn: TODAY, schemes: deriveAdoptionSchemes(adopted, null) },
      },
    };
    const map = managedPlanIdByExerciseKey(blocks, [planA, planB, adopted]);
    expect(map['bench press']).toBe('pa'); // block plan, not the adopted one
    expect(map['leg extension']).toBe('mine'); // adopted fills what the block lacks
    expect(map['squat']).toBe('pb');
  });

  it('on a real generated block, every scheme key maps to a plan containing that lift', () => {
    const p = generateBlockProposal(input());
    const { plans, activeBlock } = materializeProposal(p, [], EMPTY_SCHEDULE, TODAY);
    const blocks: CoachBlocksState = { ...getInitialCoachBlocksState(), activeBlock };
    const map = managedPlanIdByExerciseKey(blocks, plans);
    const planById = new Map(plans.map((pl) => [pl.id, pl]));
    for (const s of activeBlock.schemes) {
      const owner = planById.get(map[s.exerciseKey]);
      expect(owner, `scheme ${s.exerciseKey} mapped`).toBeDefined();
      expect(
        owner!.exercises.some((e) => canonicalizeExerciseName(e.name) === s.exerciseKey)
      ).toBe(true);
    }
    // Regression guard for the original bug: keys must NOT all collapse
    // onto the last plan of the block.
    expect(new Set(Object.values(map)).size).toBeGreaterThan(1);
  });
});

describe('block load continuity (demonstrated-capacity floor)', () => {
  function logged(id: string, date: string, name: string, weight: number, reps: number): WorkoutEntry {
    return {
      id,
      date,
      exercises: [
        {
          name,
          sets: Array.from({ length: 3 }, () => ({
            reps,
            weight,
            unit: 'kg' as const,
            completed: true,
          })),
        },
      ],
    } as WorkoutEntry;
  }

  // Demonstrated bench level: 77.5 kg x 5 across three recent sessions
  // (best e1RM ~90.4 kg), all inside the 6-week recency window of TODAY.
  const benchHistory = [
    logged('b1', '2026-10-08', 'Bench Press', 77.5, 5),
    logged('b2', '2026-10-12', 'Bench Press', 77.5, 5),
    logged('b3', '2026-10-19', 'Bench Press', 77.5, 5),
  ];

  function proposed(p: ReturnType<typeof generateBlockProposal>, name: string) {
    for (const d of p.days) {
      const ex = d.exercises.find(
        (e) => canonicalizeExerciseName(e.name) === canonicalizeExerciseName(name)
      );
      if (ex) return ex;
    }
    return undefined;
  }

  it('floors a main lift at its demonstrated level instead of the %1RM restart', () => {
    // The bare hypertrophy anchor restarts bench at 90.4 x 0.72 = 65 kg.
    // The floor converts the demonstrated e1RM at the new target reps
    // (8): 90.4 / (1 + 8/30) ~ 71.4 -> 72.5 kg loadable.
    const p = generateBlockProposal(input({ workouts: benchHistory }));
    const bench = proposed(p, 'Bench Press');
    expect(bench?.targetReps).toBe(8);
    expect(bench?.targetWeight).toBe(72.5);
  });

  it('floors accessories too — a library default is not a demonstrated load', () => {
    const workouts = [
      ...benchHistory,
      logged('c1', '2026-10-09', 'Dumbbell Curl', 20, 12),
      logged('c2', '2026-10-13', 'Dumbbell Curl', 20, 12),
      logged('c3', '2026-10-20', 'Dumbbell Curl', 20, 12),
    ];
    const p = generateBlockProposal(input({ workouts }));
    expect(proposed(p, 'Dumbbell Curl')?.targetWeight).toBe(20);
    // Same proposal without curl history: the library default stands.
    const bare = generateBlockProposal(input({ workouts: benchHistory }));
    expect(proposed(bare, 'Dumbbell Curl')?.targetWeight).toBe(14);
  });

  it('does not floor over a stale demonstration (last session > 6 weeks ago)', () => {
    const stale = [
      logged('s1', '2026-08-20', 'Bench Press', 77.5, 5),
      logged('s2', '2026-08-24', 'Bench Press', 77.5, 5),
      logged('s3', '2026-08-31', 'Bench Press', 77.5, 5),
    ];
    const p = generateBlockProposal(input({ workouts: stale }));
    expect(proposed(p, 'Bench Press')?.targetWeight).toBe(65); // bare %1RM anchor
  });

  it("an ENTERED top lift is the athlete's own statement — the floor does not override it", () => {
    const p = generateBlockProposal(
      input({
        workouts: benchHistory,
        intake: baseIntake({
          topLifts: [{ name: 'Bench Press', e1rmKg: 95, source: 'entered' }],
        }),
      })
    );
    expect(proposed(p, 'Bench Press')?.targetWeight).toBe(67.5); // 95 x 0.72 anchor, unfloored
  });

  it('a prefill-derived (history) top lift is an estimate — the floor still governs', () => {
    const p = generateBlockProposal(
      input({
        workouts: benchHistory,
        intake: baseIntake({
          topLifts: [{ name: 'Bench Press', e1rmKg: 95, source: 'history' }],
        }),
      })
    );
    expect(proposed(p, 'Bench Press')?.targetWeight).toBe(72.5);
  });

  it('cold start: no history, no floor — generation is unchanged', () => {
    const p = generateBlockProposal(input());
    expect(proposed(p, 'Bench Press')?.targetWeight).toBe(70);
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

  it('a variation swap can never rename a lift onto a name already in the plan', () => {
    // Was a pinned defect: applyPlateauProposalToPlan performed no
    // collision check, so swapping Squat -> Leg Press in a plan that
    // already contained Leg Press left two exercises named 'Leg
    // Press'. The apply path now refuses with 'duplicate_target'
    // (and 'placeholder_target' for invented names), and proposal
    // creation re-picks a clean candidate when plans are supplied —
    // both pinned below.
    const plan: PlannedWorkout = {
      id: 'p1',
      name: 'Lower A',
      createdAt: '2026-01-01',
      exercises: [
        { name: 'Squat', targetSets: 4, targetReps: 5, targetWeight: 100, targetUnit: 'kg' },
        { name: 'Leg Press', targetSets: 3, targetReps: 10, targetWeight: 200, targetUnit: 'kg' },
      ],
    };
    const schemes = deriveAdoptionSchemes(plan, null);
    const blocks: CoachBlocksState = {
      ...getInitialCoachBlocksState(),
      adoptedPlans: { p1: { planId: 'p1', adoptedOn: TODAY, schemes } },
    };
    const squatFlag: StallFlag = {
      ...flag,
      exercise: 'Squat',
      variationName: 'Leg Press',
      variationSets: 3,
      variationReps: 10,
    };
    const [proposal] = snapshotPlateauExpectations(
      buildPlateauProposals({
        stalls: [squatFlag],
        blocks,
        planIdByExerciseKey: { squat: 'p1' },
        acknowledgedKeys: new Set(),
        todayStr: TODAY,
      }),
      [plan]
    );
    const result = applyPlateauProposalToPlan(plan, schemes, proposal, TODAY);
    expect(result).toEqual({ error: 'duplicate_target' });
    // The plan is untouched: exactly one Leg Press, Squat intact.
    expect(plan.exercises.filter((e) => e.name === 'Leg Press')).toHaveLength(1);
    expect(plan.exercises[0].name).toBe('Squat');
  });

  it('proposal creation skips a colliding candidate for the next clean one, and bans apply', () => {
    const { plan, blocks } = setup();
    const squatFlag: StallFlag = {
      ...flag,
      exercise: 'Squat',
      variationName: 'Leg Press',
      variationCandidates: [
        { name: 'Leg Press', sets: 3, reps: 10 },
        { name: 'Hack Squat', sets: 3, reps: 8 },
      ],
    };
    const planWithLegPress: PlannedWorkout = {
      ...plan,
      exercises: [
        ...plan.exercises,
        { name: 'Leg Press', targetSets: 3, targetReps: 10, targetWeight: 200, targetUnit: 'kg' },
      ],
    };
    // Leg Press already in the plan → the next candidate is proposed.
    const squatProposal = buildPlateauProposals({
      stalls: [squatFlag],
      blocks,
      planIdByExerciseKey: { squat: 'p1' },
      acknowledgedKeys: new Set(),
      todayStr: TODAY,
      plans: [planWithLegPress],
    });
    expect(squatProposal).toHaveLength(1);
    expect(squatProposal[0].change).toMatchObject({ type: 'variation', newName: 'Hack Squat' });
    // With the squat family banned, no candidate survives → no proposal.
    const banned = buildPlateauProposals({
      stalls: [squatFlag],
      blocks,
      planIdByExerciseKey: { squat: 'p1' },
      acknowledgedKeys: new Set(),
      todayStr: TODAY,
      plans: [planWithLegPress],
      bannedFamilies: new Set<MovementFamily>(['squat']),
    });
    expect(banned).toHaveLength(0);
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
