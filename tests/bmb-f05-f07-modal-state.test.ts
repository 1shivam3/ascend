/**
 * Regression tests for the Build-my-block audit — PR D
 * (F-05 + F-07 store semantics; F-10 is a CoachChatTab effect, covered
 * by code review — the repo's component tests are SSR-only).
 *
 *  F-05: review edits (remove exercise, change sets/load) lived only
 *        in CoachBlockModal component state. Closing the modal threw
 *        them away silently; reopening showed the pristine proposal.
 *        Edits now persist on the pending proposal itself via
 *        updatePendingProposal — only Start over (regenerate),
 *        approve and dismiss clear them.
 *  F-07: a double-tap on Approve fired the handler twice: success
 *        toast, then the "nothing was created" error, because the
 *        second call found no pending proposal. The store contract
 *        the modal's fix relies on: after a successful approve the
 *        pending proposal is gone and a repeat approve is a no-op
 *        false that creates nothing — the modal reads exactly that
 *        state to close silently instead of erroring.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@/lib/store';
import { getInitialCoachBlocksState, type BlockProposal } from '@/lib/block-engine';
import type { BlockIntake } from '@/lib/block-intake';
import type { WeeklySchedule } from '@/lib/types';

const NULL_SCHEDULE: WeeklySchedule = {
  monday: { workoutPlanId: 'rest' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'rest' },
  thursday: { workoutPlanId: 'rest' },
  friday: { workoutPlanId: 'rest' },
  saturday: { workoutPlanId: 'rest' },
  sunday: { workoutPlanId: 'rest' },
};

const BASE_INTAKE: BlockIntake = {
  goal: 'build_muscle',
  daysPerWeek: 4,
  sessionMinutes: 75,
  equipment: 'full_gym',
  limitations: [],
  experience: 'intermediate',
  topLifts: [],
};

beforeEach(() => {
  useStore.setState({
    plannedWorkouts: [],
    weeklySchedule: { ...NULL_SCHEDULE },
    coachBlocks: getInitialCoachBlocksState(),
    athleteModel: null,
    prs: [],
    workouts: [],
    profile: null,
    trainingProfile: null,
  } as never);
});

/** Mirror of the modal's removeExercise edit construction. */
function removeFirstExercise(proposal: BlockProposal): BlockProposal {
  const dayIdx = proposal.days.findIndex((d) => d.exercises.length > 1);
  if (dayIdx < 0) throw new Error('test setup: need a day with 2+ exercises');
  const removedName = proposal.days[dayIdx].exercises[0].name;
  const next: BlockProposal = {
    ...proposal,
    days: proposal.days.map((d, di) =>
      di === dayIdx ? { ...d, exercises: d.exercises.slice(1) } : d
    ),
  };
  return Object.assign(next, { __removedName: removedName }) as BlockProposal & {
    __removedName: string;
  };
}

describe('F-05: review edits persist on the pending proposal', () => {
  it('updatePendingProposal stores the edit; it survives a close/reopen cycle', () => {
    const s = useStore.getState();
    const proposal = s.proposeCoachBlock(BASE_INTAKE);
    const edited = removeFirstExercise(proposal) as BlockProposal & { __removedName: string };
    expect(s.updatePendingProposal(edited)).toBe(true);

    // "Close" the modal: nothing clears the pending proposal.
    // "Reopen": the pending proposal IS the edited copy.
    const pending = useStore.getState().coachBlocks.pendingProposal;
    expect(pending).not.toBeNull();
    const allNames = pending!.days.flatMap((d) => d.exercises.map((e) => e.name));
    expect(allNames).not.toContain(edited.__removedName);
  });

  it('an edit with a foreign id is refused (same trust rule as approve)', () => {
    const s = useStore.getState();
    const proposal = s.proposeCoachBlock(BASE_INTAKE);
    const foreign = { ...proposal, id: 'block_someone_elses' };
    expect(s.updatePendingProposal(foreign)).toBe(false);
    expect(useStore.getState().coachBlocks.pendingProposal?.id).toBe(proposal.id);
  });

  it('updatePendingProposal with nothing pending is a no-op false', () => {
    const s = useStore.getState();
    const proposal = s.proposeCoachBlock(BASE_INTAKE);
    s.dismissBlockProposal();
    expect(s.updatePendingProposal(proposal)).toBe(false);
  });

  it('approving with no edited copy materializes the PERSISTED edits', () => {
    const s = useStore.getState();
    const proposal = s.proposeCoachBlock(BASE_INTAKE);
    const edited = removeFirstExercise(proposal) as BlockProposal & { __removedName: string };
    expect(s.updatePendingProposal(edited)).toBe(true);
    // The modal's approve passes its local copy, but a reopen-then-
    // approve flow passes the pending itself; either way the removed
    // exercise must not come back.
    expect(s.approveBlockProposal()).toBe(true);
    const planNames = useStore
      .getState()
      .plannedWorkouts.flatMap((p) => p.exercises.map((e) => e.name));
    expect(planNames).not.toContain(edited.__removedName);
  });

  it('Start over (regenerate from the same intake) replaces the edits with a pristine proposal', () => {
    const s = useStore.getState();
    const proposal = s.proposeCoachBlock(BASE_INTAKE);
    const edited = removeFirstExercise(proposal);
    expect(s.updatePendingProposal(edited)).toBe(true);
    const fresh = s.proposeCoachBlock(BASE_INTAKE);
    const pending = useStore.getState().coachBlocks.pendingProposal;
    expect(pending).toBe(fresh);
    const freshNames = fresh.days.flatMap((d) => d.exercises.map((e) => e.name));
    const editedNames = edited.days.flatMap((d) => d.exercises.map((e) => e.name));
    expect(freshNames.length).toBeGreaterThan(editedNames.length);
  });
});

describe('F-07: double approve creates exactly one block and the second call is a clean no-op', () => {
  it('second approve returns false, pending is null, nothing extra is created', () => {
    const s = useStore.getState();
    const proposal = s.proposeCoachBlock(BASE_INTAKE);
    expect(s.approveBlockProposal(proposal)).toBe(true);
    const afterFirst = useStore.getState();
    const plansAfterFirst = afterFirst.plannedWorkouts.length;
    expect(afterFirst.coachBlocks.pendingProposal).toBeNull();
    expect(afterFirst.coachBlocks.activeBlock).not.toBeNull();

    // The racing second tap:
    expect(s.approveBlockProposal(proposal)).toBe(false);
    const afterSecond = useStore.getState();
    expect(afterSecond.plannedWorkouts.length).toBe(plansAfterFirst);
    expect(afterSecond.coachBlocks.activeBlock?.proposalId).toBe(
      afterFirst.coachBlocks.activeBlock?.proposalId
    );
    // This (pending === null after a false) is the exact signal the
    // modal uses to close silently instead of showing approveEmpty.
  });
});
