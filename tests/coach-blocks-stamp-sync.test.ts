import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  decideCoachBlocksSync,
  coachBlocksSignature,
  readCoachBlocksSyncMeta,
  writeCoachBlocksSyncMeta,
  COACH_BLOCKS_SYNC_META_KEY,
  type CoachBlocksSyncMeta,
} from '@/lib/supabase/sync';
import type { CoachBlocksState } from '@/lib/block-engine';
import { getInitialCoachBlocksState } from '@/lib/block-engine';

/**
 * S3 — coach_blocks stamp-gated adoption.
 *
 * Before S3, shouldAdoptCoachBlocks never adopted when both sides
 * were non-empty: two devices with a block each diverged silently
 * and whichever pushed last won. decideCoachBlocksSync orders the
 * both-non-empty case by stamps against a settled baseline:
 * local unchanged → take remote changes; remote unchanged → keep
 * local; both changed → newer stamp wins (tie → remote, so devices
 * converge); no baseline → keep local (pre-S3 behaviour) while the
 * engine seeds one.
 */

const T1 = '2026-11-01T10:00:00.000Z';
const T2 = '2026-11-02T10:00:00.000Z';
const T3 = '2026-11-03T10:00:00.000Z';

function stateWithBlock(id: string): CoachBlocksState {
  const base = getInitialCoachBlocksState();
  return { ...base, activeBlock: { id } as any };
}

const EMPTY = getInitialCoachBlocksState();
const LOCAL = stateWithBlock('local-block');
const REMOTE = stateWithBlock('remote-block');

function meta(overrides: Partial<CoachBlocksSyncMeta> = {}): CoachBlocksSyncMeta {
  return {
    sig: coachBlocksSignature(LOCAL),
    remoteStamp: T1,
    localEditedAt: null,
    ...overrides,
  };
}

describe('decideCoachBlocksSync — F-11 cases preserved', () => {
  it('no remote state → keep local', () => {
    expect(
      decideCoachBlocksSync({
        isCrossAccountSwitch: false, local: LOCAL, remote: null,
        remoteUpdatedAt: null, localSignature: coachBlocksSignature(LOCAL), meta: meta(),
      }),
    ).toBe('keep-local');
  });

  it('empty remote state → keep local', () => {
    expect(
      decideCoachBlocksSync({
        isCrossAccountSwitch: false, local: LOCAL, remote: EMPTY,
        remoteUpdatedAt: T2, localSignature: coachBlocksSignature(LOCAL), meta: meta(),
      }),
    ).toBe('keep-local');
  });

  it('cross-account switch → adopt the new account’s row', () => {
    expect(
      decideCoachBlocksSync({
        isCrossAccountSwitch: true, local: LOCAL, remote: REMOTE,
        remoteUpdatedAt: T2, localSignature: coachBlocksSignature(LOCAL), meta: meta(),
      }),
    ).toBe('adopt');
  });

  it('empty local → adopt (fresh-device recovery)', () => {
    expect(
      decideCoachBlocksSync({
        isCrossAccountSwitch: false, local: EMPTY, remote: REMOTE,
        remoteUpdatedAt: T2, localSignature: coachBlocksSignature(EMPTY), meta: null,
      }),
    ).toBe('adopt');
  });
});

describe('decideCoachBlocksSync — stamp gate, both sides non-empty', () => {
  it('no baseline → keep local (pre-S3 behaviour; the engine seeds one)', () => {
    expect(
      decideCoachBlocksSync({
        isCrossAccountSwitch: false, local: LOCAL, remote: REMOTE,
        remoteUpdatedAt: T3, localSignature: coachBlocksSignature(LOCAL), meta: null,
      }),
    ).toBe('keep-local');
  });

  it('local unchanged, remote changed → adopt (the S3 fix: the other device’s newer block arrives)', () => {
    expect(
      decideCoachBlocksSync({
        isCrossAccountSwitch: false, local: LOCAL, remote: REMOTE,
        remoteUpdatedAt: T2, localSignature: coachBlocksSignature(LOCAL), meta: meta(),
      }),
    ).toBe('adopt');
  });

  it('neither side changed → keep local (no-op)', () => {
    expect(
      decideCoachBlocksSync({
        isCrossAccountSwitch: false, local: LOCAL, remote: REMOTE,
        remoteUpdatedAt: T1, localSignature: coachBlocksSignature(LOCAL), meta: meta(),
      }),
    ).toBe('keep-local');
  });

  it('local changed, remote unchanged → keep local (push carries it up)', () => {
    expect(
      decideCoachBlocksSync({
        isCrossAccountSwitch: false, local: LOCAL, remote: REMOTE,
        remoteUpdatedAt: T1,
        localSignature: coachBlocksSignature(stateWithBlock('edited')),
        meta: meta({ localEditedAt: T2 }),
      }),
    ).toBe('keep-local');
  });

  it('both changed, remote newer → adopt', () => {
    expect(
      decideCoachBlocksSync({
        isCrossAccountSwitch: false, local: LOCAL, remote: REMOTE,
        remoteUpdatedAt: T3,
        localSignature: coachBlocksSignature(stateWithBlock('edited')),
        meta: meta({ localEditedAt: T2 }),
      }),
    ).toBe('adopt');
  });

  it('both changed, local newer → keep local', () => {
    expect(
      decideCoachBlocksSync({
        isCrossAccountSwitch: false, local: LOCAL, remote: REMOTE,
        remoteUpdatedAt: T2,
        localSignature: coachBlocksSignature(stateWithBlock('edited')),
        meta: meta({ localEditedAt: T3 }),
      }),
    ).toBe('keep-local');
  });

  it('both changed, tie → adopt (devices converge on the server copy)', () => {
    expect(
      decideCoachBlocksSync({
        isCrossAccountSwitch: false, local: LOCAL, remote: REMOTE,
        remoteUpdatedAt: T2,
        localSignature: coachBlocksSignature(stateWithBlock('edited')),
        meta: meta({ localEditedAt: T2 }),
      }),
    ).toBe('adopt');
  });

  it('both changed but the local edit is untimed → never adopted over', () => {
    expect(
      decideCoachBlocksSync({
        isCrossAccountSwitch: false, local: LOCAL, remote: REMOTE,
        remoteUpdatedAt: T3,
        localSignature: coachBlocksSignature(stateWithBlock('edited')),
        meta: meta({ localEditedAt: null }),
      }),
    ).toBe('keep-local');
  });
});

describe('coach-blocks sync meta persistence', () => {
  class MockStorage implements Storage {
    private store = new Map<string, string>();
    get length() {
      return this.store.size;
    }
    clear() {
      this.store.clear();
    }
    getItem(key: string) {
      return this.store.has(key) ? this.store.get(key)! : null;
    }
    key(index: number) {
      return Array.from(this.store.keys())[index] || null;
    }
    removeItem(key: string) {
      this.store.delete(key);
    }
    setItem(key: string, value: string) {
      this.store.set(key, String(value));
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(global, 'localStorage', {
      value: new MockStorage(),
      writable: true,
      configurable: true,
    });
    // readCoachBlocksSyncMeta guards on `typeof window` — provide one.
    (global as any).window = global;
  });

  it('round-trips a baseline', () => {
    writeCoachBlocksSyncMeta({ sig: 'sig-1', remoteStamp: T1, localEditedAt: null });
    expect(readCoachBlocksSyncMeta()).toEqual({
      sig: 'sig-1',
      remoteStamp: T1,
      localEditedAt: null,
    });
    expect(localStorage.getItem(COACH_BLOCKS_SYNC_META_KEY)).toContain('sig-1');
  });

  it('a malformed baseline reads as null (fails safe to keep-local)', () => {
    localStorage.setItem(COACH_BLOCKS_SYNC_META_KEY, '{not json');
    expect(readCoachBlocksSyncMeta()).toBeNull();
    localStorage.setItem(COACH_BLOCKS_SYNC_META_KEY, JSON.stringify({ nope: 1 }));
    expect(readCoachBlocksSyncMeta()).toBeNull();
  });

  it('signatures differ when the state differs', () => {
    expect(coachBlocksSignature(LOCAL)).not.toBe(coachBlocksSignature(REMOTE));
    expect(coachBlocksSignature(LOCAL)).toBe(coachBlocksSignature(stateWithBlock('local-block')));
  });
});
