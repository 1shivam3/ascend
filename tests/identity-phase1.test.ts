import { describe, it, expect } from 'vitest';
import { classifyIdentity, isCrossAccountProfile } from '@/lib/identity';
import { isCrossAccountSwitch as legacyIsCross } from '@/lib/start-fresh-guard';

/**
 * Phase 1.4 (§5/§6/§27) — ONE identity classifier.
 *
 * Before: the pull derived identity from the local profile id alone
 * (guest prefixes exempted), the push never classified at all, and a
 * getUser() network failure was caught into null and treated exactly
 * like "signed out". The matrix below pins the union:
 * guest-local | guest-anon | account | account-cross |
 * account-offline-stale — plus the provenance rules (createdByUid
 * decides when present; unprovenanced imports are cross; legacy
 * profiles without any new field classify exactly as before).
 */

const account = (id: string) => ({ id, isAnonymous: false });
const anon = (id: string) => ({ id, isAnonymous: true });

describe('§5 classifyIdentity matrix', () => {
  it('no session → guest-local', () => {
    expect(
      classifyIdentity({ sessionUser: null, sessionCheckFailed: false, lastKnownUserId: null, profile: { id: 'guest_abc' } }),
    ).toEqual({ kind: 'guest-local' });
  });

  it('anonymous session → guest-anon', () => {
    expect(
      classifyIdentity({ sessionUser: anon('anon-1'), sessionCheckFailed: false, lastKnownUserId: null, profile: { id: 'guest_abc' } }),
    ).toEqual({ kind: 'guest-anon', userId: 'anon-1' });
  });

  it('account session + own profile → account', () => {
    expect(
      classifyIdentity({ sessionUser: account('uid-a'), sessionCheckFailed: false, lastKnownUserId: null, profile: { id: 'uid-a' } }),
    ).toEqual({ kind: 'account', userId: 'uid-a' });
  });

  it('account session + guest profile → account (guest migration, not a switch)', () => {
    expect(
      classifyIdentity({ sessionUser: account('uid-a'), sessionCheckFailed: false, lastKnownUserId: null, profile: { id: 'guest_abc' } }),
    ).toEqual({ kind: 'account', userId: 'uid-a' });
    expect(
      classifyIdentity({ sessionUser: account('uid-a'), sessionCheckFailed: false, lastKnownUserId: null, profile: { id: 'user_legacy' } }),
    ).toEqual({ kind: 'account', userId: 'uid-a' });
  });

  it('account session + foreign uid profile → account-cross', () => {
    expect(
      classifyIdentity({ sessionUser: account('uid-b'), sessionCheckFailed: false, lastKnownUserId: null, profile: { id: 'uid-a' } }),
    ).toEqual({ kind: 'account-cross', userId: 'uid-b', profileId: 'uid-a' });
  });

  it('a FAILED session check is never guest: last known account → account-offline-stale', () => {
    expect(
      classifyIdentity({ sessionUser: null, sessionCheckFailed: true, lastKnownUserId: 'uid-a', profile: { id: 'uid-a' } }),
    ).toEqual({ kind: 'account-offline-stale', userId: 'uid-a' });
  });

  it('a failed check with nothing previously known → guest-local (cold start, no identity established)', () => {
    expect(
      classifyIdentity({ sessionUser: null, sessionCheckFailed: true, lastKnownUserId: null, profile: null }),
    ).toEqual({ kind: 'guest-local' });
  });
});

describe('§6 provenance rules (isCrossAccountProfile)', () => {
  it('createdByUid decides when present — matching uid is same-account even under a guest id', () => {
    expect(isCrossAccountProfile({ id: 'guest_abc', createdByUid: 'uid-a' }, 'uid-a')).toBe(false);
    expect(isCrossAccountProfile({ id: 'guest_abc', createdByUid: 'uid-a' }, 'uid-b')).toBe(true);
  });

  it('an unprovenanced import is cross-account; a same-uid import is not', () => {
    expect(isCrossAccountProfile({ id: 'guest_abc', importedFromBackup: true }, 'uid-a')).toBe(true);
    expect(
      isCrossAccountProfile({ id: 'uid-a', createdByUid: 'uid-a', importedFromBackup: true }, 'uid-a'),
    ).toBe(false);
    expect(
      isCrossAccountProfile({ id: 'uid-a', createdByUid: 'uid-a', importedFromBackup: true }, 'uid-b'),
    ).toBe(true);
  });

  it('no profile / no id / own id → never cross', () => {
    expect(isCrossAccountProfile(null, 'uid-a')).toBe(false);
    expect(isCrossAccountProfile(undefined, 'uid-a')).toBe(false);
    expect(isCrossAccountProfile({}, 'uid-a')).toBe(false);
    expect(isCrossAccountProfile({ id: 'uid-a' }, 'uid-a')).toBe(false);
  });

  it('LEGACY EQUIVALENCE: profiles without the new fields classify exactly as the old rule', () => {
    const ids: (string | null | undefined)[] = [
      'guest_0123456789abcdef',
      'user_legacyform',
      'uid-a',
      'uid-b',
      'some-random-string',
      '',
      null,
      undefined,
    ];
    for (const id of ids) {
      expect(isCrossAccountProfile({ id }, 'uid-a')).toBe(legacyIsCross(id, 'uid-a'));
      expect(isCrossAccountProfile({ id }, 'uid-b')).toBe(legacyIsCross(id, 'uid-b'));
    }
  });
});
