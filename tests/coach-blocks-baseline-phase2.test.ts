import { describe, it, expect } from 'vitest';
import {
  coachBlocksSignature,
  nextCoachBlocksSyncMeta,
  decideCoachBlocksSync,
  type CoachBlocksSyncMeta,
} from '@/lib/supabase/sync';

/**
 * Phase 2.3 (§11) — coach-blocks sync baseline hygiene.
 *
 * 1. The signature must be CANONICAL: two states with identical
 *    content but different key order (a payload round-trip can
 *    reorder keys) are the same state. JSON.stringify made them
 *    "diverged", which poisoned the baseline and the edit stamp.
 * 2. localEditedAt must CLEAR when the local state returns to the
 *    baseline signature — the field's own contract ("null while it
 *    matches"). Before, the subscription only ever SET the stamp;
 *    a reverted edit left a stale divergence time behind.
 */

const blockA: any = {
  pendingProposal: null,
  activeBlock: { id: 'blk1', name: 'Base', weeks: [] },
  pastBlocks: [],
  adoptedPlans: { p1: { planId: 'p1', adoptedAt: '2026-11-01T00:00:00.000Z' } },
  plateauProposals: [],
};
// Same content, keys in a different order at every level.
const blockAReordered: any = {
  plateauProposals: [],
  adoptedPlans: { p1: { adoptedAt: '2026-11-01T00:00:00.000Z', planId: 'p1' } },
  pastBlocks: [],
  activeBlock: { weeks: [], name: 'Base', id: 'blk1' },
  pendingProposal: null,
};
const blockB: any = { ...blockA, activeBlock: { id: 'blk1', name: 'Changed', weeks: [] } };

describe('§11 canonical signature', () => {
  it('key order does not change the signature', () => {
    expect(coachBlocksSignature(blockA)).toBe(coachBlocksSignature(blockAReordered));
  });

  it('a content change does change the signature', () => {
    expect(coachBlocksSignature(blockA)).not.toBe(coachBlocksSignature(blockB));
  });

  it('array order still matters (pastBlocks sequence is content)', () => {
    const x: any = { ...blockA, pastBlocks: [{ id: 'a' }, { id: 'b' }] };
    const y: any = { ...blockA, pastBlocks: [{ id: 'b' }, { id: 'a' }] };
    expect(coachBlocksSignature(x)).not.toBe(coachBlocksSignature(y));
  });
});

describe('§11 baseline maintenance (nextCoachBlocksSyncMeta)', () => {
  const T1 = '2026-11-13T05:00:00.000Z';
  const T2 = '2026-11-13T06:00:00.000Z';
  const baseMeta: CoachBlocksSyncMeta = {
    sig: coachBlocksSignature(blockA),
    remoteStamp: '2026-11-12T00:00:00.000Z',
    localEditedAt: null,
  };

  it('no baseline -> no write', () => {
    expect(nextCoachBlocksSyncMeta(null, coachBlocksSignature(blockB), T1)).toBeNull();
  });

  it('diverging from the baseline stamps localEditedAt', () => {
    const next = nextCoachBlocksSyncMeta(baseMeta, coachBlocksSignature(blockB), T1);
    expect(next?.localEditedAt).toBe(T1);
  });

  it('REVERTING to the baseline signature CLEARS the stamp', () => {
    const diverged: CoachBlocksSyncMeta = { ...baseMeta, localEditedAt: T1 };
    const next = nextCoachBlocksSyncMeta(diverged, coachBlocksSignature(blockA), T2);
    expect(next?.localEditedAt).toBeNull();
  });

  it('matching the baseline with no stamp -> no write', () => {
    expect(nextCoachBlocksSyncMeta(baseMeta, coachBlocksSignature(blockA), T1)).toBeNull();
  });

  it('the gate treats a reverted (stamp-cleared) local as unchanged', () => {
    const diverged: CoachBlocksSyncMeta = { ...baseMeta, localEditedAt: T1 };
    const reverted = nextCoachBlocksSyncMeta(diverged, coachBlocksSignature(blockA), T2)!;
    const decision = decideCoachBlocksSync({
      isCrossAccountSwitch: false,
      local: blockA,
      remote: blockB,
      remoteUpdatedAt: '2026-11-13T07:00:00.000Z',
      localSignature: coachBlocksSignature(blockA),
      meta: reverted,
    });
    // Local unchanged + remote moved -> adopt the remote.
    expect(decision).toBe('adopt');
  });
});
