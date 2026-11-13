/**
 * §8 / Phase 1.2 — the last-pushed-signature adoption baseline must be
 * scoped per user. Before the fix the baseline was ONE global
 * localStorage string: account A's baseline could satisfy account B's
 * adoption check whenever the two datasets' signatures coincided,
 * letting B's next pull adopt remote rows wholesale on the strength of
 * a push B never made.
 *
 * Contract pinned here:
 * - write/read round-trips per user id;
 * - a baseline written for A is invisible to B (no cross-account adoption);
 * - the legacy unscoped key is DISCARDED on first contact (removed, never
 *   honored) — losing it costs one full reconciliation, never data.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  LAST_PUSHED_SIGNATURE_KEY,
  lastPushedSignatureKey,
  readLastPushedSignature,
  shouldAdoptRemoteChanges,
  writeLastPushedSignature,
} from '@/lib/supabase/sync';
import { installMemoryStorage, seedPersistedState } from './helpers/persisted-fixtures';
import { unscopedAdoptionSignature } from './fixtures/persisted/legacy-shapes';

(globalThis as { window?: unknown }).window = globalThis;

const storage = installMemoryStorage();

beforeEach(() => {
  storage.clear();
});

describe('§8 adoption baseline scoping', () => {
  it('round-trips a baseline for the user who wrote it', () => {
    writeLastPushedSignature('user_a', 'sig-1');
    expect(readLastPushedSignature('user_a')).toBe('sig-1');
    expect(storage.getItem(lastPushedSignatureKey('user_a'))).toBe('sig-1');
  });

  it('account B cannot see account A\u2019s baseline — no cross-account adoption', () => {
    writeLastPushedSignature('user_a', 'sig-shared');
    expect(readLastPushedSignature('user_b')).toBeNull();
    // The brief's scenario: B's fresh signature coincidentally equals A's
    // baseline. Adoption must stay off because B never pushed it.
    expect(
      shouldAdoptRemoteChanges(readLastPushedSignature('user_b'), 'sig-shared'),
    ).toBe(false);
    // …while A, the actual pusher, may adopt on the same signature.
    expect(
      shouldAdoptRemoteChanges(readLastPushedSignature('user_a'), 'sig-shared'),
    ).toBe(true);
  });

  it('discards the legacy unscoped key on first read and never honors it', () => {
    seedPersistedState(unscopedAdoptionSignature);
    expect(storage.getItem(LAST_PUSHED_SIGNATURE_KEY)).toBe('sig-of-account-a-data');
    // Even the account whose data produced the legacy signature gets no
    // adoption from it — the value is dropped, not migrated.
    expect(readLastPushedSignature('user_a')).toBeNull();
    expect(storage.getItem(LAST_PUSHED_SIGNATURE_KEY)).toBeNull();
  });

  it('discards the legacy unscoped key on first write too', () => {
    seedPersistedState(unscopedAdoptionSignature);
    writeLastPushedSignature('user_b', 'sig-b');
    expect(storage.getItem(LAST_PUSHED_SIGNATURE_KEY)).toBeNull();
    expect(readLastPushedSignature('user_b')).toBe('sig-b');
  });

  it('a failed scoped write leaves no baseline (fails safe to no-adopt)', () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    } as unknown as Storage;
    (globalThis as { localStorage?: Storage }).localStorage = throwing;
    expect(() => writeLastPushedSignature('user_a', 'sig-1')).not.toThrow();
    (globalThis as { localStorage?: Storage }).localStorage = storage;
    expect(readLastPushedSignature('user_a')).toBeNull();
  });
});
