/**
 * Regression tests for the Build-my-block audit — PR F (F-11,
 * coach_blocks sync).
 *
 * F-11: the coach_blocks table has existed in the schema since the
 * coach-blocks feature shipped (§16), and planned_workouts sync —
 * but the client never wrote or read coach_blocks. The active block,
 * a pending proposal and the progression schemes lived only in
 * local persistence, so a device switch silently lost the block
 * (its plans arrived; the block that explains and progresses them
 * did not).
 *
 * The sync is a per-user JSONB singleton (id = user id, the profiles
 * pattern): payload <-> CoachBlocksState mapping, a content-gated
 * push, and an adoption rule (cross-account: take the row; same
 * account: adopt only into an empty local state — the fresh-device
 * recovery case). A deployment where the §16 migration has not been
 * applied yet answers with table-not-found; that exact error is
 * tolerated (state stays local-only, as before F-11) while real
 * errors still surface.
 *
 * These tests cover the pure mapping/decision layer. The live
 * Supabase round-trip is NOT covered here (no live backend in the
 * test environment) — same status as the audit's NOT TESTED note.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@/lib/store';
import {
  getInitialCoachBlocksState,
  type CoachBlocksState,
} from '@/lib/block-engine';
import type { BlockIntake } from '@/lib/block-intake';
import type { WeeklySchedule } from '@/lib/types';
import {
  coachBlocksRowForPush,
  coachBlocksStateFromPayload,
  isCoachBlocksStateEmpty,
  isMissingCoachBlocksTable,
} from '@/lib/supabase/sync';

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

/** A realistic, non-empty CoachBlocksState built through the real flow. */
function realState(): CoachBlocksState {
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
  const s = useStore.getState();
  const proposal = s.proposeCoachBlock(BASE_INTAKE);
  expect(s.approveBlockProposal(proposal)).toBe(true);
  return useStore.getState().coachBlocks;
}

beforeEach(() => {
  useStore.setState({ coachBlocks: getInitialCoachBlocksState() } as never);
});

describe('F-11: row mapping', () => {
  it('push row is a per-user singleton: id = user id, payload = the whole state', () => {
    const state = realState();
    const row = coachBlocksRowForPush(state, 'user-123');
    expect(row.id).toBe('user-123');
    expect(row.user_id).toBe('user-123');
    expect(row.payload).toBe(state);
    expect(typeof row.updated_at).toBe('string');
  });

  it('round-trip: payload -> state preserves the block, proposal and schemes', () => {
    const state = realState();
    const parsed = coachBlocksStateFromPayload(JSON.parse(JSON.stringify(state)));
    expect(parsed).not.toBeNull();
    expect(parsed!.activeBlock?.proposalId).toBe(state.activeBlock?.proposalId);
    expect(parsed!.activeBlock?.planIds).toEqual(state.activeBlock?.planIds);
    expect(parsed!.pendingProposal).toBeNull();
    // Schemes ride inside the active block / proposals.
    expect(parsed!.activeBlock?.schemes.length).toBeGreaterThan(0);
  });

  it('malformed payloads degrade to initial fields, never a half-shaped slice', () => {
    expect(coachBlocksStateFromPayload(null)).toBeNull();
    expect(coachBlocksStateFromPayload('nope')).toBeNull();
    expect(coachBlocksStateFromPayload([1, 2])).toBeNull();
    const parsed = coachBlocksStateFromPayload({
      activeBlock: { proposalId: 'block_x' },
      pastBlocks: 'not-an-array',
      adoptedPlans: [1],
      plateauProposals: undefined,
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.activeBlock?.proposalId).toBe('block_x');
    expect(parsed!.pastBlocks).toEqual([]);
    expect(parsed!.adoptedPlans).toEqual({});
    expect(parsed!.plateauProposals).toEqual([]);
    expect(parsed!.pendingProposal).toBeNull();
  });
});

describe('F-11: emptiness', () => {
  it('the initial state is empty; a state with an active block is not', () => {
    expect(isCoachBlocksStateEmpty(getInitialCoachBlocksState())).toBe(true);
    expect(isCoachBlocksStateEmpty(null)).toBe(true);
    expect(isCoachBlocksStateEmpty(realState())).toBe(false);
  });

  // The four adoption cases that used to pin shouldAdoptCoachBlocks
  // (removed in Phase 2.3 §11 — no production caller) are covered
  // against the live stamp-gated successor, decideCoachBlocksSync,
  // in tests/coach-blocks-stamp-sync.test.ts: no remote → keep,
  // empty remote → keep, cross-account → adopt, empty local →
  // adopt, both non-empty without a baseline → keep.
});

describe('F-11: missing-table tolerance is exact', () => {
  it('recognizes PostgREST / Postgres table-not-found errors', () => {
    expect(isMissingCoachBlocksTable({ code: 'PGRST205', message: "Could not find the table 'public.coach_blocks' in the schema cache" })).toBe(true);
    expect(isMissingCoachBlocksTable({ code: '42P01', message: 'relation "public.coach_blocks" does not exist' })).toBe(true);
    expect(isMissingCoachBlocksTable({ message: 'Could not find the table' })).toBe(true);
  });

  it('does NOT swallow real errors', () => {
    expect(isMissingCoachBlocksTable(null)).toBe(false);
    expect(isMissingCoachBlocksTable({ code: '42501', message: 'permission denied for table coach_blocks' })).toBe(false);
    expect(isMissingCoachBlocksTable({ message: 'JWT expired' })).toBe(false);
  });
});
