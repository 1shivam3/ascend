import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '@/lib/store';
import { getInitialCoachBlocksState } from '@/lib/block-engine';
import type { BlockIntake } from '@/lib/block-intake';
import type { PlannedWorkout, WeeklySchedule } from '@/lib/types';

/**
 * PR-B store actions: proposal lifecycle, atomic materialization,
 * adoption, plateau apply — and the guarantee that approving nothing
 * changes nothing (D3).
 */

const NULL_SCHEDULE: WeeklySchedule = {
  monday: { workoutPlanId: 'rest' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'rest' },
  thursday: { workoutPlanId: 'rest' },
  friday: { workoutPlanId: 'rest' },
  saturday: { workoutPlanId: 'rest' },
  sunday: { workoutPlanId: 'rest' },
};

const INTAKE: BlockIntake = {
  goal: 'build_muscle',
  daysPerWeek: 4,
  sessionMinutes: 75,
  equipment: 'full_gym',
  limitations: [],
  experience: 'intermediate',
  topLifts: [],
};

function seedBase() {
  useStore.setState({
    plannedWorkouts: [],
    weeklySchedule: { ...NULL_SCHEDULE },
    coachBlocks: getInitialCoachBlocksState(),
    athleteModel: null,
    prs: [],
    workouts: [],
    profile: null,
  } as never);
}

beforeEach(seedBase);

describe('coach block proposal lifecycle', () => {
  it('proposing changes NO plan and NO schedule entry (D3)', () => {
    const s = useStore.getState();
    const proposal = s.proposeCoachBlock(INTAKE);
    expect(proposal.days).toHaveLength(4);
    const after = useStore.getState();
    expect(after.plannedWorkouts).toHaveLength(0);
    expect(Object.values(after.weeklySchedule).every((v) => v.workoutPlanId === 'rest')).toBe(true);
    expect(after.coachBlocks.pendingProposal?.id).toBe(proposal.id);
    expect(after.coachBlocks.activeBlock).toBeNull();
  });

  it('dismissing a proposal leaves plans, schedule and blocks untouched', () => {
    const s = useStore.getState();
    s.proposeCoachBlock(INTAKE);
    s.dismissBlockProposal();
    const after = useStore.getState();
    expect(after.coachBlocks.pendingProposal).toBeNull();
    expect(after.plannedWorkouts).toHaveLength(0);
    expect(after.coachBlocks.activeBlock).toBeNull();
  });

  it('approving materializes plans + schedule + active block in one action', () => {
    const s = useStore.getState();
    const proposal = s.proposeCoachBlock(INTAKE);
    s.approveBlockProposal();
    const after = useStore.getState();
    expect(after.coachBlocks.pendingProposal).toBeNull();
    expect(after.coachBlocks.activeBlock?.proposalId).toBe(proposal.id);
    expect(after.plannedWorkouts).toHaveLength(4);
    for (const plan of after.plannedWorkouts) {
      expect(plan.coachBlockId).toBe(proposal.id);
    }
    const scheduled = Object.values(after.weeklySchedule).filter((v) => v.workoutPlanId !== 'rest');
    expect(scheduled).toHaveLength(4);
    // Approving twice is a no-op (no pending proposal left).
    after.approveBlockProposal();
    expect(useStore.getState().plannedWorkouts).toHaveLength(4);
  });

  it('approving an EDITED proposal materializes the edit; a foreign proposal is ignored', () => {
    const s = useStore.getState();
    const proposal = s.proposeCoachBlock(INTAKE);
    // User removes the first exercise of day 1 in review.
    const edited = {
      ...proposal,
      days: proposal.days.map((d, i) =>
        i === 0 ? { ...d, exercises: d.exercises.slice(1) } : d
      ),
    };
    const removedName = proposal.days[0].exercises[0].name;
    s.approveBlockProposal(edited);
    const after = useStore.getState();
    const dayOne = after.plannedWorkouts.find((p) => p.id === proposal.days[0].planId)!;
    expect(dayOne.exercises.some((e) => e.name === removedName)).toBe(false);

    // A proposal that is not the pending one must never materialize.
    seedBase();
    const s2 = useStore.getState();
    const pending = s2.proposeCoachBlock(INTAKE);
    s2.approveBlockProposal({ ...pending, id: 'block_foreign' });
    const after2 = useStore.getState();
    expect(after2.coachBlocks.activeBlock?.proposalId).toBe(pending.id);
    expect(after2.plannedWorkouts.every((p) => p.coachBlockId === pending.id)).toBe(true);
  });

  it('a second approved block retires the first into pastBlocks', () => {
    const s = useStore.getState();
    s.proposeCoachBlock(INTAKE);
    s.approveBlockProposal();
    const firstId = useStore.getState().coachBlocks.activeBlock!.proposalId;
    s.proposeCoachBlock({ ...INTAKE, goal: 'get_stronger' });
    s.approveBlockProposal();
    const blocks = useStore.getState().coachBlocks;
    expect(blocks.activeBlock?.proposalId).not.toBe(firstId);
    expect(blocks.pastBlocks.map((b) => b.proposalId)).toContain(firstId);
    expect(blocks.pastBlocks[0].status).toBe('completed');
  });
});

describe('adoption', () => {
  const myPlan: PlannedWorkout = {
    id: 'mine-1',
    name: 'My Upper Day',
    createdAt: '2026-01-01',
    exercises: [
      { name: 'Bench Press', targetSets: 4, targetReps: 5, targetWeight: 80, targetUnit: 'kg' },
    ],
  };

  it('adopting manages the plan without changing a single number in it', () => {
    useStore.setState({ plannedWorkouts: [myPlan] } as never);
    const snapshot = JSON.parse(JSON.stringify(myPlan));
    useStore.getState().adoptPlanForCoaching('mine-1');
    const after = useStore.getState();
    expect(after.plannedWorkouts[0]).toEqual(snapshot);
    const adopted = after.coachBlocks.adoptedPlans['mine-1'];
    expect(adopted).toBeTruthy();
    const bench = adopted.schemes.find((sc) => sc.exerciseKey === 'bench press')!;
    expect([bench.repMin, bench.repMax]).toEqual([5, 6]);
    // Unadopt removes management, plan still untouched.
    after.unadoptPlanForCoaching('mine-1');
    expect(useStore.getState().coachBlocks.adoptedPlans['mine-1']).toBeUndefined();
  });

  it('adopting a missing plan is a no-op', () => {
    useStore.getState().adoptPlanForCoaching('nope');
    expect(useStore.getState().coachBlocks.adoptedPlans).toEqual({});
  });
});

describe('managed policy wiring through addWorkout (D2)', () => {
  const plan: PlannedWorkout = {
    id: 'p-wire',
    name: 'Upper A',
    createdAt: '2026-01-01',
    exercises: [
      { id: 'pe-bench', name: 'Bench Press', targetSets: 3, targetReps: 5, targetWeight: 80, targetUnit: 'kg', targetRpe: 8 },
    ],
  };

  function benchWorkout(id: string, date: string, reps: number) {
    return {
      id,
      name: 'Upper A',
      planId: 'p-wire',
      date,
      duration: 60,
      exercises: [
        {
          name: 'Bench Press',
          planExerciseId: 'pe-bench',
          sets: [0, 1, 2].map(() => ({
            reps,
            weight: 80,
            unit: 'kg' as const,
            rpe: 8,
            prescribedReps: reps,
            prescribedWeight: 80,
            prescribedUnit: 'kg' as const,
            prescribedRpe: 8,
            isCompleted: true,
          })),
        },
      ],
    };
  }

  it('a coach-managed lift at its scheme ceiling earns a LOAD-PROG-01 decision; unmanaged does not', () => {
    // Two clean prescribed sessions already in history at 5 reps.
    useStore.setState({
      plannedWorkouts: [plan],
      workouts: [benchWorkout('h1', '2026-10-06', 5), benchWorkout('h2', '2026-10-13', 5)] as never,
    } as never);
    const s = useStore.getState();
    s.adoptPlanForCoaching('p-wire'); // scheme: 5–6 reps, +2.5 kg coach-approved
    // Third session hits the scheme ceiling (6 reps, RPE at target).
    s.addWorkout(benchWorkout('h3', '2026-10-20', 6) as never);
    const decisions = Object.values(useStore.getState().policyDecisionRecords);
    expect(decisions.some((d) => d.ruleId === 'LOAD-PROG-01')).toBe(true);

    // Control: identical history, plan NOT adopted → wiring stays inert.
    seedBase();
    useStore.setState({
      plannedWorkouts: [plan],
      workouts: [benchWorkout('h1', '2026-10-06', 5), benchWorkout('h2', '2026-10-13', 5)] as never,
    } as never);
    useStore.getState().addWorkout(benchWorkout('h3', '2026-10-20', 6) as never);
    const control = Object.values(useStore.getState().policyDecisionRecords);
    expect(control.some((d) => d.ruleId === 'LOAD-PROG-01')).toBe(false);
  });
});

describe('plateau proposals through the store', () => {
  it('refresh builds proposals only for managed, stalled lifts; apply edits the plan once', () => {
    const plan: PlannedWorkout = {
      id: 'p-stall',
      name: 'Upper',
      createdAt: '2026-01-01',
      exercises: [
        { name: 'Bench Press', targetSets: 4, targetReps: 6, targetWeight: 80, targetUnit: 'kg' },
      ],
    };
    // Six flat bench sessions — enough for detectStalls (≥4, ≥3 stalled).
    const workouts = [0, 7, 14, 21, 28, 35].map((d) => {
      const date = new Date(2026, 8, 1 + d);
      const ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return {
        id: `w${d}`,
        name: 'Upper',
        date: ds,
        duration: 60,
        exercises: [
          {
            name: 'Bench Press',
            sets: [0, 1, 2, 3].map(() => ({
              reps: 6,
              weight: 80,
              unit: 'kg' as const,
              isCompleted: true,
            })),
          },
        ],
      };
    });
    useStore.setState({ plannedWorkouts: [plan], workouts: workouts as never } as never);
    const s = useStore.getState();
    s.adoptPlanForCoaching('p-stall');
    s.refreshPlateauProposals();
    const proposals = useStore.getState().coachBlocks.plateauProposals;
    expect(proposals.length).toBeGreaterThanOrEqual(1);
    const proposal = proposals[0];
    expect(proposal.status).toBe('pending');
    // Applying edits per the approved change exactly once.
    s.applyPlateauProposal(proposal.id);
    const after = useStore.getState();
    expect(after.coachBlocks.plateauProposals[0].status).toBe('applied');
    // Second apply is a no-op.
    const planSnapshot = JSON.stringify(after.plannedWorkouts);
    after.applyPlateauProposal(proposal.id);
    expect(JSON.stringify(useStore.getState().plannedWorkouts)).toBe(planSnapshot);
  });

  it('dismissed proposals stay dismissed across refreshes', () => {
    const plan: PlannedWorkout = {
      id: 'p-stall2',
      name: 'Upper',
      createdAt: '2026-01-01',
      exercises: [
        { name: 'Bench Press', targetSets: 4, targetReps: 6, targetWeight: 80, targetUnit: 'kg' },
      ],
    };
    const workouts = [0, 7, 14, 21, 28, 35].map((d) => {
      const date = new Date(2026, 8, 1 + d);
      const ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return {
        id: `x${d}`,
        name: 'Upper',
        date: ds,
        duration: 60,
        exercises: [
          {
            name: 'Bench Press',
            sets: [0, 1, 2, 3].map(() => ({
              reps: 6,
              weight: 80,
              unit: 'kg' as const,
              isCompleted: true,
            })),
          },
        ],
      };
    });
    useStore.setState({ plannedWorkouts: [plan], workouts: workouts as never } as never);
    const s = useStore.getState();
    s.adoptPlanForCoaching('p-stall2');
    s.refreshPlateauProposals();
    const first = useStore.getState().coachBlocks.plateauProposals[0];
    expect(first).toBeTruthy();
    s.dismissPlateauProposal(first.id);
    s.refreshPlateauProposals();
    const all = useStore.getState().coachBlocks.plateauProposals;
    expect(all.filter((p) => p.status === 'pending')).toHaveLength(0);
  });
});
