/**
 * Phase 3.5 — §19 block lifecycle + §20 decision vocabulary.
 *
 * §19: a block whose weeks ran out is persisted 'completed' by a
 * settle pass (not left 'active' until a successor is approved);
 * the past-blocks cap folds overflow into a compacted COUNT
 * instead of silently dropping; dismissal is recorded under the
 * one convention — status 'dismissed'.
 * §20: decisions share ONE status vocabulary; policy decisions
 * gain a tested effective-status selector that derives 'applied'
 * from the record + audit list (the stored status stays
 * 'accepted' — the application validator depends on it); the
 * per-exercise TrainingDecision gains its missing dismiss action.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  archivePastBlock,
  getInitialCoachBlocksState,
  isBlockEnded,
  settleCoachBlocks,
  type ActiveCoachBlock,
  type BlockProposal,
  type CoachBlocksState,
} from '@/lib/block-engine';
import { isBlockEnded as isBlockEndedViaReview } from '@/lib/weekly-review';
import { decisionEffectiveStatus } from '@/lib/training-decision-policy';
import type { TrainingDecisionRecord } from '@/lib/training-decision-policy';
import type { PolicyDecisionApplicationAudit, TrainingDecision } from '@/lib/types';
import { useStore } from '@/lib/store';

const block = (over: Partial<ActiveCoachBlock> = {}): ActiveCoachBlock =>
  ({
    proposalId: 'bp-1',
    name: 'Strength Block',
    focus: 'strength',
    planIds: ['p1'],
    startMonday: '2026-10-05',
    weeks: [
      { index: 0, type: 'build' },
      { index: 1, type: 'build' },
    ],
    schemes: [],
    intake: {},
    status: 'active',
    createdOn: '2026-10-05',
    ...over,
  }) as ActiveCoachBlock;

const proposal = (id: string): BlockProposal =>
  ({
    id,
    name: `Block ${id}`,
    focus: 'strength',
    focusReason: 'test',
    summary: 'test',
    weeks: [{ index: 0, type: 'build' }],
    days: [],
    schemes: [],
    startMonday: '2026-11-16',
    intake: {},
    warnings: [],
  }) as unknown as BlockProposal;

const TODAY = '2026-11-13'; // Friday; the fixture block ended Sun 2026-10-18

describe('§19 settle pass', () => {
  it('an ended active block is persisted completed and archived', () => {
    const state: CoachBlocksState = {
      ...getInitialCoachBlocksState(),
      activeBlock: block(),
    };
    const settled = settleCoachBlocks(state, TODAY);
    expect(settled).not.toBe(state);
    expect(settled.activeBlock).toBeNull();
    expect(settled.pastBlocks).toHaveLength(1);
    expect(settled.pastBlocks[0].status).toBe('completed');
  });

  it('a block still in its weeks is untouched (same reference)', () => {
    const state: CoachBlocksState = {
      ...getInitialCoachBlocksState(),
      activeBlock: block({ startMonday: '2026-11-02' }),
    };
    expect(settleCoachBlocks(state, TODAY)).toBe(state);
  });

  it('no active block → same reference', () => {
    const state = getInitialCoachBlocksState();
    expect(settleCoachBlocks(state, TODAY)).toBe(state);
  });

  it('settling into a full history folds the overflow into the count', () => {
    const past = Array.from({ length: 8 }, (_, i) =>
      block({ proposalId: `old-${i}`, status: 'completed' })
    );
    const state: CoachBlocksState = {
      ...getInitialCoachBlocksState(),
      activeBlock: block(),
      pastBlocks: past,
      compactedBlockCount: 2,
    };
    const settled = settleCoachBlocks(state, TODAY);
    expect(settled.pastBlocks).toHaveLength(8);
    expect(settled.pastBlocks[0].proposalId).toBe('bp-1');
    expect(settled.compactedBlockCount).toBe(3);
  });

  it('pre-§19 shapes (no dismissedProposals / compactedBlockCount) settle safely', () => {
    const legacy = {
      pendingProposal: null,
      activeBlock: block(),
      pastBlocks: [],
      adoptedPlans: {},
      plateauProposals: [],
    } as CoachBlocksState;
    const settled = settleCoachBlocks(legacy, TODAY);
    expect(settled.activeBlock).toBeNull();
    expect(settled.compactedBlockCount).toBe(0);
  });

  it('isBlockEnded lives in block-engine; weekly-review re-exports the same fn', () => {
    expect(isBlockEndedViaReview).toBe(isBlockEnded);
    expect(isBlockEnded(block(), TODAY)).toBe(true);
    expect(isBlockEnded(block({ startMonday: '2026-11-09' }), TODAY)).toBe(false);
  });
});

describe('§19 archivePastBlock', () => {
  it('prepends under the cap without counting', () => {
    const out = archivePastBlock([block({ proposalId: 'a', status: 'completed' })], block({ status: 'replaced' }), 0);
    expect(out.pastBlocks.map((b) => b.proposalId)).toEqual(['bp-1', 'a']);
    expect(out.compactedBlockCount).toBe(0);
  });

  it('overflow folds into the count — never a silent drop', () => {
    const past = Array.from({ length: 8 }, (_, i) => block({ proposalId: `old-${i}`, status: 'completed' }));
    const out = archivePastBlock(past, block({ status: 'completed' }), 5);
    expect(out.pastBlocks).toHaveLength(8);
    expect(out.compactedBlockCount).toBe(6);
  });
});

describe('§19 store wiring', () => {
  beforeEach(() => {
    useStore.setState({ coachBlocks: getInitialCoachBlocksState() });
  });

  it('dismissal is RECORDED with status dismissed, newest first, capped at 3', () => {
    const s = useStore.getState();
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      useStore.setState((st) => ({
        coachBlocks: { ...st.coachBlocks, pendingProposal: proposal(id) },
      }));
      s.dismissBlockProposal();
    }
    const after = useStore.getState().coachBlocks;
    expect(after.pendingProposal).toBeNull();
    expect(after.dismissedProposals?.map((d) => d.id)).toEqual(['p4', 'p3', 'p2']);
    expect(after.dismissedProposals?.[0].status).toBe('dismissed');
    expect(after.dismissedProposals?.[0].dismissedOn).toBeTruthy();
  });

  it('dismissing with nothing pending is a no-op', () => {
    const before = useStore.getState().coachBlocks;
    useStore.getState().dismissBlockProposal();
    expect(useStore.getState().coachBlocks).toBe(before);
  });

  it('the settle action archives an ended block exactly once', () => {
    useStore.setState((st) => ({
      coachBlocks: { ...st.coachBlocks, activeBlock: block() },
    }));
    useStore.getState().settleCoachBlocks();
    const after = useStore.getState().coachBlocks;
    // The fixture ended 2026-10-18 — ended under any real "today"
    // this test could run at (it is a fixed historical block).
    expect(after.activeBlock).toBeNull();
    expect(after.pastBlocks[0]?.status).toBe('completed');
    const ref = useStore.getState().coachBlocks;
    useStore.getState().settleCoachBlocks();
    expect(useStore.getState().coachBlocks).toBe(ref);
  });

  it('completeActiveBlock folds overflow into the compacted count', () => {
    const past = Array.from({ length: 8 }, (_, i) =>
      block({ proposalId: `old-${i}`, status: 'completed' })
    );
    useStore.setState((st) => ({
      coachBlocks: {
        ...st.coachBlocks,
        activeBlock: block({ startMonday: '2026-11-09' }),
        pastBlocks: past,
        compactedBlockCount: 0,
      },
    }));
    useStore.getState().completeActiveBlock();
    const after = useStore.getState().coachBlocks;
    expect(after.pastBlocks).toHaveLength(8);
    expect(after.compactedBlockCount).toBe(1);
  });
});

describe('§20 decision vocabulary', () => {
  const record = (over: Partial<TrainingDecisionRecord> = {}): TrainingDecisionRecord =>
    ({ id: 'dec-1', status: 'accepted', ...over }) as TrainingDecisionRecord;
  const audit = (decisionId: string): PolicyDecisionApplicationAudit =>
    ({ id: `audit-${decisionId}`, decisionId, status: 'applied' }) as PolicyDecisionApplicationAudit;

  it('effective status passes stored statuses through', () => {
    expect(decisionEffectiveStatus(record({ status: 'pending' }))).toBe('pending');
    expect(decisionEffectiveStatus(record({ status: 'overridden' }))).toBe('overridden');
    expect(decisionEffectiveStatus(record({ status: 'dismissed' }))).toBe('dismissed');
    expect(decisionEffectiveStatus(record({ status: 'accepted' }))).toBe('accepted');
  });

  it("accepted + appliedAt stamp reads 'applied'", () => {
    expect(decisionEffectiveStatus(record({ appliedAt: '2026-11-10T00:00:00Z' }))).toBe('applied');
  });

  it("accepted + an audit entry reads 'applied' even without the stamp", () => {
    expect(decisionEffectiveStatus(record(), [audit('dec-1')])).toBe('applied');
    expect(decisionEffectiveStatus(record(), [audit('someone-else')])).toBe('accepted');
    expect(decisionEffectiveStatus(record(), [])).toBe('accepted');
  });

  it('a non-accepted record never reads applied', () => {
    expect(
      decisionEffectiveStatus(record({ status: 'dismissed', appliedAt: '2026-11-10T00:00:00Z' }), [
        audit('dec-1'),
      ])
    ).toBe('dismissed');
  });

  it('dismissTrainingDecision records the dismissal in state + ledger', () => {
    const decision = {
      id: 'td-1',
      exerciseName: 'Bench Press',
      status: 'pending',
    } as TrainingDecision;
    useStore.setState({ trainingDecisions: { 'Bench Press': decision }, decisionsLedgerHistory: [] });
    useStore.getState().dismissTrainingDecision('Bench Press');
    const after = useStore.getState();
    expect(after.trainingDecisions['Bench Press'].status).toBe('dismissed');
    expect(after.decisionsLedgerHistory[0]?.id).toBe('td-1');
    expect(after.decisionsLedgerHistory[0]?.status).toBe('dismissed');
  });

  it('the vocabulary is one shared type (source guard)', () => {
    const types = readFileSync('src/lib/types.ts', 'utf8');
    const policy = readFileSync('src/lib/training-decision-policy.ts', 'utf8');
    expect(types).toContain("export type DecisionStatus = 'pending' | 'accepted' | 'overridden' | 'dismissed'");
    expect(types).toContain('status: DecisionStatus;');
    expect(policy).toContain('status: DecisionStatus;');
    expect(policy).not.toContain("status: 'pending' | 'accepted' | 'overridden' | 'dismissed';");
  });
});
