/**
 * Regression tests for Build-my-block findings F-01 and F-02
 * (see ~/workspace/ascend-bmb-audit/FINDINGS.md; scenarios S3a/S3b).
 *
 * F-01: approving a second block the same day with an unchanged intake
 * produced duplicate plan IDs (the proposal id is a deterministic hash
 * of {intake, today, focus}), corrupting every by-ID lookup and the
 * planned_workouts sync upsert.
 * F-02: approving a new block left the previous block's plans scheduled
 * on weekdays the new block does not cover, and archived the replaced
 * block as "completed" even when it never ran.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@/lib/store';
import {
  getInitialCoachBlocksState,
  materializeProposal,
  type BlockProposal,
} from '@/lib/block-engine';
import type { BlockIntake } from '@/lib/block-intake';
import { dayPlanRef, type PlannedWorkout, type WeeklySchedule } from '@/lib/types';

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

function seedBase() {
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
}

beforeEach(() => seedBase());

describe('F-01: same-day re-approval with an unchanged intake', () => {
  it('never creates duplicate plan ids, and first-time ids stay unchanged', () => {
    const s = useStore.getState();
    const p1 = s.proposeCoachBlock(BASE_INTAKE);
    const firstIds = p1.days.map((d) => d.planId);
    expect(s.approveBlockProposal(p1)).toBe(true);
    // First approval keeps the deterministic ids exactly as generated.
    expect(useStore.getState().plannedWorkouts.map((p) => p.id)).toEqual(
      expect.arrayContaining(firstIds)
    );

    // "Build next block" the same day with an unchanged prefill submits
    // the identical intake — the proposal id is the same by design.
    const p2 = s.proposeCoachBlock(BASE_INTAKE);
    expect(p2.id).toBe(p1.id);
    expect(s.approveBlockProposal(p2)).toBe(true);

    const after = useStore.getState();
    const ids = after.plannedWorkouts.map((p) => p.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
    // Both blocks' plans exist side by side (4 + 4).
    expect(ids).toHaveLength(8);
    // The schedule points at the ACTIVE (second) block's plans only.
    const activeIds = new Set(after.coachBlocks.activeBlock!.planIds);
    for (const entry of Object.values(after.weeklySchedule)) {
      if (entry.workoutPlanId && entry.workoutPlanId !== 'rest') {
        expect(activeIds.has(entry.workoutPlanId)).toBe(true);
      }
    }
  });

  it('materializeProposal itself refuses to emit a plan id that already exists', () => {
    const s = useStore.getState();
    const proposal = s.proposeCoachBlock(BASE_INTAKE);
    const first = materializeProposal(proposal, [], { ...NULL_SCHEDULE }, '2026-11-03');
    const second = materializeProposal(proposal, first.plans, first.schedule, '2026-11-03');
    const ids = second.plans.map((p) => p.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    // No collision → ids pass through unchanged.
    expect(first.plans.map((p) => p.id)).toEqual(
      proposal.days.filter((d) => d.exercises.length > 0).map((d) => d.planId)
    );
  });
});

describe('F-02: replacing a block clears its schedule residue', () => {
  it('a 3-day block replacing a 4-day block leaves no old plan scheduled', () => {
    const s = useStore.getState();
    const p1 = s.proposeCoachBlock(BASE_INTAKE); // 4 days
    expect(s.approveBlockProposal(p1)).toBe(true);
    const block1PlanIds = new Set(useStore.getState().plannedWorkouts.map((p) => p.id));

    const p2 = s.proposeCoachBlock({ ...BASE_INTAKE, daysPerWeek: 3 });
    expect(s.approveBlockProposal(p2)).toBe(true);

    const after = useStore.getState();
    const stillScheduledOld: string[] = [];
    for (const [day, entry] of Object.entries(after.weeklySchedule)) {
      if (entry.workoutPlanId && block1PlanIds.has(entry.workoutPlanId)) {
        stillScheduledOld.push(`${day}:${entry.workoutPlanId}`);
      }
    }
    expect(stillScheduledOld).toEqual([]);
    // Exactly the new block's 3 days are scheduled.
    // (§18, Phase 3.3: read via dayPlanRef — retired days are now
    // {kind: 'rest'} with no plan id, which the old literal
    // predicate `workoutPlanId !== 'rest'` miscounted as scheduled.)
    const scheduled = Object.values(after.weeklySchedule).filter(
      (v) => dayPlanRef(v).kind === 'plan'
    );
    expect(scheduled).toHaveLength(3);
  });

  it('a block replaced before it ended is archived as replaced, not completed', () => {
    const s = useStore.getState();
    s.proposeCoachBlock(BASE_INTAKE);
    s.approveBlockProposal();
    s.proposeCoachBlock({ ...BASE_INTAKE, goal: 'get_stronger' });
    s.approveBlockProposal();
    const blocks = useStore.getState().coachBlocks;
    expect(blocks.pastBlocks).toHaveLength(1);
    expect(blocks.pastBlocks[0].status).toBe('replaced');
  });

  it('materializeProposal retires the superseded block’s plan ids from uncovered weekdays', () => {
    // Reconciled onto the merged coach stack: schedule retirement is
    // materializeProposal's own coachBlockId-based mechanism (it
    // retires every plan owned by a different coach block), so no
    // replaced-id list is passed in. The invariant asserted below is
    // unchanged from the original F-02 test.
    const s = useStore.getState();
    const p1 = s.proposeCoachBlock(BASE_INTAKE);
    const first = materializeProposal(p1, [], { ...NULL_SCHEDULE }, '2026-11-03');
    const p2 = s.proposeCoachBlock({ ...BASE_INTAKE, daysPerWeek: 3 });
    const second = materializeProposal(
      p2 as BlockProposal,
      first.plans,
      first.schedule,
      '2026-11-03'
    );
    const oldIds = new Set(first.activeBlock.planIds);
    for (const entry of Object.values(second.schedule)) {
      expect(entry.workoutPlanId ? oldIds.has(entry.workoutPlanId) : false).toBe(false);
    }
  });
});
