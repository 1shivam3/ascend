/**
 * Phase 0 helper smoke tests (state-machines program): the shared
 * assert/invariant helpers, the persisted-fixture seeder, and the fake
 * clock. These pin the helpers' contracts before Phases 1-5 build on them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertNever, invariant, __resetInvariantLogCache } from '@/lib/assert';
import {
  installMemoryStorage,
  seedPersistedState,
  storeEnvelopeFixture,
} from './helpers/persisted-fixtures';
import {
  legacySetEncodings,
  quarantineV1WithRawMessage,
  unscopedAdoptionSignature,
} from './fixtures/persisted/legacy-shapes';
import { installFakeClock, type FakeClock } from './helpers/fake-clock';

describe('assertNever', () => {
  it('throws with the offending value rendered', () => {
    expect(() => assertNever('bogus' as never, 'test-switch')).toThrow(/unhandled value "bogus" \(test-switch\)/);
  });
});

describe('invariant', () => {
  it('passes silently when the condition holds', () => {
    expect(() => invariant(true, 'must not fire')).not.toThrow();
  });

  it('throws in the test environment when violated', () => {
    expect(() => invariant(false, 'boom')).toThrow(/invariant violated: boom/);
  });

  it('log-cache reset hook runs', () => {
    __resetInvariantLogCache();
  });
});

describe('persisted-fixture seeding', () => {
  it('installs memory storage and writes fixture entries verbatim', () => {
    const storage = installMemoryStorage();
    seedPersistedState(unscopedAdoptionSignature);
    expect(storage.getItem('ascend_last_pushed_signature')).toBe('sig-of-account-a-data');
  });

  it('legacy set-encodings fixture parses through the real envelope shape', () => {
    const storage = installMemoryStorage();
    seedPersistedState(legacySetEncodings);
    const parsed = JSON.parse(storage.getItem('ascend_store') as string);
    expect(parsed.version).toBe(3);
    const sets = parsed.state.workouts[0].exercises[0].sets;
    expect(sets[0]).toEqual({ reps: 5, weight: 100, completed: true });
    expect(sets[0].status).toBeUndefined();
    expect(sets[2]).toEqual({ reps: 8, weight: 60 });
  });

  it('quarantine v1 fixture carries the raw message + null stamp (the §7 starting point)', () => {
    const storage = installMemoryStorage();
    seedPersistedState(quarantineV1WithRawMessage);
    const parsed = JSON.parse(storage.getItem('ascend_sync_quarantine_v1') as string);
    expect(parsed.user_1[0].stamp).toBeNull();
    expect(parsed.user_1[0].message).toContain('duplicate key');
  });

  it('storeEnvelopeFixture honors an explicit older envelope version', () => {
    const fixture = storeEnvelopeFixture('ascend_store', { profile: null }, 2);
    const parsed = JSON.parse(fixture.entries.ascend_store);
    expect(parsed.version).toBe(2);
  });
});

describe('fake clock', () => {
  let clock: FakeClock | null = null;
  afterEach(() => {
    clock?.restore();
    clock = null;
  });

  it('freezes Date at the start instant and advances timers + Date together', () => {
    clock = installFakeClock('2026-11-13T08:00:00+05:30');
    const start = clock.now();
    const fired: number[] = [];
    setTimeout(() => fired.push(Date.now()), 30_000);
    clock.advance(29_999);
    expect(fired).toHaveLength(0);
    clock.advance(1);
    expect(fired).toEqual([start + 30_000]);
    expect(clock.now()).toBe(start + 30_000);
  });

  it('set() jumps the mocked Date', () => {
    clock = installFakeClock('2026-11-13T08:00:00+05:30');
    clock.set('2026-11-13T09:30:00+05:30');
    expect(clock.now()).toBe(Date.parse('2026-11-13T09:30:00+05:30'));
  });

  it('restore() returns to real timers', () => {
    clock = installFakeClock('2026-11-13T08:00:00+05:30');
    clock.restore();
    expect(vi.isFakeTimers()).toBe(false);
    clock = null;
  });
});
