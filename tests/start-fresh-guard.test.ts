import { describe, it, expect } from 'vitest';
import {
  isGuestProfileId,
  isCrossAccountSwitch,
  decideStartFreshGate,
} from '@/lib/start-fresh-guard';

/**
 * Audit F21-B + F20 (brief option B): Start-fresh runs only after
 * sign-out is VERIFIED complete, and guest profiles (guest_ and the
 * legacy user_ form) are never classified as account switches.
 * Pure functions — the async orchestration in
 * SupabaseSyncEngine.startFreshAfterVerifiedSignOut is covered by the
 * same decision table (it feeds hadSession/signOutError/engineUserAfter/
 * sessionAfter into decideStartFreshGate and applies nothing on abort).
 */

describe('isGuestProfileId', () => {
  it('guest_ and user_ ids are guest profiles; auth uids are not', () => {
    expect(isGuestProfileId('guest_abcdef0123456789')).toBe(true);
    expect(isGuestProfileId('user_abcdef0123456789')).toBe(true);
    expect(isGuestProfileId('484886bb-f134-4fe8-b86d-debf4175f2ee')).toBe(false);
    expect(isGuestProfileId(null)).toBe(false);
    expect(isGuestProfileId(undefined)).toBe(false);
    expect(isGuestProfileId('')).toBe(false);
  });
});

describe('isCrossAccountSwitch (F20)', () => {
  it('guest_ profile + any session user → NOT a switch (merge branch)', () => {
    expect(isCrossAccountSwitch('guest_abcdef0123456789', 'auth-uid-1')).toBe(false);
  });

  it('legacy user_ profile + any session user → NOT a switch (merge branch)', () => {
    expect(isCrossAccountSwitch('user_abcdef0123456789', 'auth-uid-1')).toBe(false);
  });

  it('different non-guest id → switch (replace branch)', () => {
    expect(isCrossAccountSwitch('other-auth-uid', 'auth-uid-1')).toBe(true);
  });

  it('same id → not a switch; null local id → not a switch', () => {
    expect(isCrossAccountSwitch('auth-uid-1', 'auth-uid-1')).toBe(false);
    expect(isCrossAccountSwitch(null, 'auth-uid-1')).toBe(false);
  });
});

describe('decideStartFreshGate (F21-B)', () => {
  it('no session to begin with → proceed', () => {
    expect(
      decideStartFreshGate({
        hadSession: false,
        engineUserAfter: null,
        sessionAfter: null,
      }),
    ).toEqual({ proceed: true });
  });

  it('session + verified sign-out (both gone) → proceed', () => {
    expect(
      decideStartFreshGate({
        hadSession: true,
        signOutError: null,
        engineUserAfter: null,
        sessionAfter: null,
      }),
    ).toEqual({ proceed: true });
  });

  it('sign-out error → abort with a clear error (nothing applied)', () => {
    const d = decideStartFreshGate({
      hadSession: true,
      signOutError: 'network failed',
      engineUserAfter: null,
      sessionAfter: null,
    });
    expect(d.proceed).toBe(false);
    expect(d.error).toMatch(/Sign-out failed/);
  });

  it('session still alive after sign-out → abort (engine state alone is not proof)', () => {
    // The key regression: signOut() clears engine state BEFORE the
    // Supabase call completes, so engineUserAfter null with a live
    // session must still abort — otherwise the reset would run while
    // the session survives and the next push would overwrite the
    // server profile with defaults.
    const d = decideStartFreshGate({
      hadSession: true,
      signOutError: null,
      engineUserAfter: null,
      sessionAfter: { access_token: 'still-alive' },
    });
    expect(d.proceed).toBe(false);
    expect(d.error).toMatch(/session is still active/);
  });

  it('engine user lingers after sign-out → abort', () => {
    const d = decideStartFreshGate({
      hadSession: true,
      signOutError: null,
      engineUserAfter: { id: 'auth-uid-1' },
      sessionAfter: null,
    });
    expect(d.proceed).toBe(false);
  });

  it('session verification itself failed (undefined) → abort, fail-safe', () => {
    const d = decideStartFreshGate({
      hadSession: true,
      signOutError: null,
      engineUserAfter: null,
      sessionAfter: undefined,
    });
    expect(d.proceed).toBe(false);
  });
});
