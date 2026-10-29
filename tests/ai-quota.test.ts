import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  deriveAiActorKey,
  aiActorQuotaKey,
  aiActorDailyLimit,
  resolveAiActor,
  checkAiDailyQuota,
  AiActorAuthError,
  DEFAULT_AI_QUOTA_SIGNED_IN_DAILY,
  DEFAULT_AI_QUOTA_GUEST_DAILY,
  type AiActorVerifier,
} from '@/lib/ai-quota';
import {
  resetRateLimitStoreForTests,
  setRateLimiterSupabaseForTests,
} from '@/lib/rate-limit';

/**
 * Audit F-02 (brief option A): per-account + per-guest daily AI quotas.
 * Identity is NEVER taken from a client claim: the actor is a verified
 * uid (Bearer token via auth.getUser) or a server-derived guest bucket
 * (sha256 of the server-observed IP only; gauntlet SEC-01 removed the
 * User-Agent from the key because rotating it minted fresh buckets).
 * These tests prove the separation, the caps, and the anti-spoofing
 * rule against a fake distributed limiter.
 *
 * SEC-02 contract change (2026-10-29): checkAiDailyQuota is
 * fail-closed, and fail-closed calls no longer degrade to the
 * in-memory limiter when the distributed backend is missing — they
 * throw. The enforcement tests therefore inject a fake
 * ascend_check_rate_limit RPC client (fixed-window counting in a
 * Map) instead of pinning the null-client in-memory path.
 */

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://test.local/api/ai/coach', { headers });
}

/** Fake verifier: only 'valid-token-a' belongs to user-a; anything else is nobody. */
const fakeVerifier: AiActorVerifier = {
  auth: {
    getUser: async (token: string) => ({
      data: { user: token === 'valid-token-a' ? { id: 'user-a' } : null },
    }),
  },
};

/**
 * Fake distributed limiter: implements the ascend_check_rate_limit
 * RPC contract (anchored fixed-window count per key) in a Map, so
 * quota enforcement is exercised end-to-end without a live backend.
 */
function makeFakeDistributedLimiter() {
  const counts = new Map<string, number>();
  return {
    rpc: async (
      _fn: string,
      params: { p_key: string; p_window_ms: number; p_max_requests: number }
    ) => {
      const next = (counts.get(params.p_key) ?? 0) + 1;
      counts.set(params.p_key, next);
      return {
        data: [
          {
            allowed: next <= params.p_max_requests,
            count: next,
            reset_ms: params.p_window_ms,
          },
        ],
        error: null,
      };
    },
  };
}

beforeEach(() => {
  // Distributed path only (SEC-02): a fresh fake RPC client per test.
  // The fail-closed quota check throws when no distributed limiter
  // exists, so the old null-client in-memory pinning is gone.
  resetRateLimitStoreForTests();
  setRateLimiterSupabaseForTests(makeFakeDistributedLimiter());
  delete process.env.AI_DAILY_SIGNED_IN_CAP;
  delete process.env.AI_DAILY_GUEST_CAP;
});

afterEach(() => {
  resetRateLimitStoreForTests();
  delete process.env.AI_DAILY_SIGNED_IN_CAP;
  delete process.env.AI_DAILY_GUEST_CAP;
});

describe('deriveAiActorKey / quota keys', () => {
  it('verified uid → per-account key; no uid → guest bucket key', () => {
    const user = deriveAiActorKey({ verifiedUserId: 'user-a', ip: '1.2.3.4' });
    expect(user.kind).toBe('user');
    expect(aiActorQuotaKey(user)).toBe('ai-daily:user:user-a');

    const guest = deriveAiActorKey({ verifiedUserId: null, ip: '1.2.3.4' });
    expect(guest.kind).toBe('guest');
    expect(aiActorQuotaKey(guest)).toMatch(/^ai-daily:guest:[0-9a-f]{64}$/);
  });

  it('guest bucket is stable for the same IP and differs across IPs (UA no longer participates)', () => {
    const a = deriveAiActorKey({ verifiedUserId: null, ip: '1.2.3.4' });
    const b = deriveAiActorKey({ verifiedUserId: null, ip: '1.2.3.4' });
    const c = deriveAiActorKey({ verifiedUserId: null, ip: '5.6.7.8' });
    expect(aiActorQuotaKey(a)).toBe(aiActorQuotaKey(b));
    expect(aiActorQuotaKey(a)).not.toBe(aiActorQuotaKey(c));
  });

  it('defaults are 50 signed-in / 10 guest; positive env overrides win, junk env is ignored', () => {
    expect(DEFAULT_AI_QUOTA_SIGNED_IN_DAILY).toBe(50);
    expect(DEFAULT_AI_QUOTA_GUEST_DAILY).toBe(10);
    expect(aiActorDailyLimit({ kind: 'user', userId: 'u' })).toBe(50);
    expect(aiActorDailyLimit({ kind: 'guest', guestKey: 'g' })).toBe(10);
    process.env.AI_DAILY_SIGNED_IN_CAP = '25';
    process.env.AI_DAILY_GUEST_CAP = '3';
    expect(aiActorDailyLimit({ kind: 'user', userId: 'u' })).toBe(25);
    expect(aiActorDailyLimit({ kind: 'guest', guestKey: 'g' })).toBe(3);
    process.env.AI_DAILY_SIGNED_IN_CAP = 'not-a-number';
    process.env.AI_DAILY_GUEST_CAP = '-5';
    expect(aiActorDailyLimit({ kind: 'user', userId: 'u' })).toBe(50);
    expect(aiActorDailyLimit({ kind: 'guest', guestKey: 'g' })).toBe(10);
  });
});

describe('resolveAiActor anti-spoofing', () => {
  it('forged x-user-id header without a token → guest bucket, never that account', async () => {
    const actor = await resolveAiActor(
      req({ 'x-user-id': 'user-a', 'x-forwarded-for': '1.2.3.4' }),
      fakeVerifier,
    );
    expect(actor.kind).toBe('guest');
    expect(aiActorQuotaKey(actor)).not.toContain('user-a');
  });

  it('forged x-user-id header WITH a valid token → the verified uid wins, not the header', async () => {
    const actor = await resolveAiActor(
      req({ Authorization: 'Bearer valid-token-a', 'x-user-id': 'user-b' }),
      fakeVerifier,
    );
    expect(actor).toEqual({ kind: 'user', userId: 'user-a' });
  });

  it('invalid token → AiActorAuthError (gauntlet R7: never a silent guest downgrade)', async () => {
    // Pre-R7 behavior bucketed a forged/expired token as a guest,
    // which handed quota-dodgers a fresh bucket and hid expired
    // sessions. A PRESENT but unverifiable token now throws; the AI
    // routes map it to 401. Guests are only requests with NO token.
    await expect(
      resolveAiActor(req({ Authorization: 'Bearer forged-token' }), fakeVerifier),
    ).rejects.toBeInstanceOf(AiActorAuthError);
    await expect(
      checkAiDailyQuota(req({ Authorization: 'Bearer forged-token' }), fakeVerifier),
    ).rejects.toBeInstanceOf(AiActorAuthError);
  });

  it('spoofable IP headers are ignored: x-real-ip does not change the bucket', async () => {
    const a = await resolveAiActor(req({ 'x-real-ip': '9.9.9.9' }), fakeVerifier);
    const b = await resolveAiActor(req({}), fakeVerifier);
    expect(aiActorQuotaKey(a)).toBe(aiActorQuotaKey(b));
  });
});

describe('checkAiDailyQuota enforcement (fake distributed limiter)', () => {
  it('guest cap: 10 allowed, 11th denied', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await checkAiDailyQuota(req(), fakeVerifier);
      expect(r.allowed).toBe(true);
      expect(r.actor.kind).toBe('guest');
      expect(r.limit).toBe(10);
    }
    const denied = await checkAiDailyQuota(req(), fakeVerifier);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it('signed-in cap is independent: guest exhaustion does not touch the account bucket', async () => {
    for (let i = 0; i < 10; i++) {
      await checkAiDailyQuota(req(), fakeVerifier);
    }
    expect((await checkAiDailyQuota(req(), fakeVerifier)).allowed).toBe(false);
    // Same IP, but a verified account: fresh 50-bucket.
    const userReq = req({ Authorization: 'Bearer valid-token-a' });
    for (let i = 0; i < 50; i++) {
      const r = await checkAiDailyQuota(userReq, fakeVerifier);
      expect(r.allowed).toBe(true);
      expect(r.limit).toBe(50);
    }
    expect((await checkAiDailyQuota(userReq, fakeVerifier)).allowed).toBe(false);
  });

  it('different accounts get different buckets', async () => {
    const verifierB: AiActorVerifier = {
      auth: {
        getUser: async (token: string) => ({
          data: { user: token === 'valid-token-b' ? { id: 'user-b' } : null },
        }),
      },
    };
    const a = await checkAiDailyQuota(req({ Authorization: 'Bearer valid-token-a' }), fakeVerifier);
    const b = await checkAiDailyQuota(req({ Authorization: 'Bearer valid-token-b' }), verifierB);
    expect(a.actor).toEqual({ kind: 'user', userId: 'user-a' });
    expect(b.actor).toEqual({ kind: 'user', userId: 'user-b' });
    expect(aiActorQuotaKey(a.actor)).not.toBe(aiActorQuotaKey(b.actor));
  });
});
