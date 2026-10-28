import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  deriveAiActorKey,
  aiActorQuotaKey,
  aiActorDailyLimit,
  resolveAiActor,
  checkAiDailyQuota,
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
 * (sha256 of IP + User-Agent). These tests prove the separation, the
 * caps, and the anti-spoofing rule against the real in-memory limiter.
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

beforeEach(() => {
  // In-memory limiter only: reset clears the store, and the null client
  // with "attempted" set pins the in-memory path even if Supabase env
  // vars happen to be present in the test runner.
  resetRateLimitStoreForTests();
  setRateLimiterSupabaseForTests(null);
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
    const user = deriveAiActorKey({ verifiedUserId: 'user-a', ip: '1.2.3.4', userAgent: 'ua' });
    expect(user.kind).toBe('user');
    expect(aiActorQuotaKey(user)).toBe('ai-daily:user:user-a');

    const guest = deriveAiActorKey({ verifiedUserId: null, ip: '1.2.3.4', userAgent: 'ua' });
    expect(guest.kind).toBe('guest');
    expect(aiActorQuotaKey(guest)).toMatch(/^ai-daily:guest:[0-9a-f]{64}$/);
  });

  it('guest bucket is stable for the same IP+UA and differs across IP or UA', () => {
    const a = deriveAiActorKey({ verifiedUserId: null, ip: '1.2.3.4', userAgent: 'ua' });
    const b = deriveAiActorKey({ verifiedUserId: null, ip: '1.2.3.4', userAgent: 'ua' });
    const c = deriveAiActorKey({ verifiedUserId: null, ip: '5.6.7.8', userAgent: 'ua' });
    const d = deriveAiActorKey({ verifiedUserId: null, ip: '1.2.3.4', userAgent: 'other' });
    expect(aiActorQuotaKey(a)).toBe(aiActorQuotaKey(b));
    expect(aiActorQuotaKey(a)).not.toBe(aiActorQuotaKey(c));
    expect(aiActorQuotaKey(a)).not.toBe(aiActorQuotaKey(d));
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

  it('invalid token → guest bucket (no error, no account quota)', async () => {
    const actor = await resolveAiActor(
      req({ Authorization: 'Bearer forged-token' }),
      fakeVerifier,
    );
    expect(actor.kind).toBe('guest');
  });

  it('spoofable IP headers are ignored: x-real-ip does not change the bucket', async () => {
    const a = await resolveAiActor(req({ 'x-real-ip': '9.9.9.9' }), fakeVerifier);
    const b = await resolveAiActor(req({}), fakeVerifier);
    expect(aiActorQuotaKey(a)).toBe(aiActorQuotaKey(b));
  });
});

describe('checkAiDailyQuota enforcement (real in-memory limiter)', () => {
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
