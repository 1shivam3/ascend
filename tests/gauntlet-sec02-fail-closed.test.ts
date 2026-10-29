import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkRateLimit,
  checkRateLimitForKey,
  RateLimitUnavailableError,
  resetRateLimitStoreForTests,
  setRateLimiterSupabaseForTests,
} from '@/lib/rate-limit';
import { checkAiDailyQuota } from '@/lib/ai-quota';

/**
 * Gauntlet SEC-02 (user decision 2026-10-29: reject-all).
 *
 * Before: the fail-closed throw only fired when a Supabase client
 * existed; with the service key absent the code silently degraded to
 * per-instance in-memory counting, multiplying every cap by the
 * number of serverless instances. Now a fail-closed call with no
 * distributed limiter configured throws RateLimitUnavailableError
 * (callers map it to 503). Non-fail-closed calls keep the in-memory
 * fallback — local/guest surfaces never depended on the distributed
 * limiter.
 */

const ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
let savedEnv: Record<string, string | undefined> = {};

function req(): Request {
  return new Request('http://test.local/api/ai/coach', {
    headers: { 'x-forwarded-for': '203.0.113.10' },
  });
}

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  resetRateLimitStoreForTests();
  vi.restoreAllMocks();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  resetRateLimitStoreForTests();
});

describe('SEC-02 — fail-closed when the service key is absent', () => {
  it('checkRateLimit with failClosed throws instead of degrading to memory', async () => {
    await expect(
      checkRateLimit(req(), {
        windowMs: 60_000,
        maxRequests: 25,
        keyPrefix: 'ai-coach',
        failClosed: true,
      })
    ).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });

  it('checkRateLimitForKey with failClosed throws when unconfigured', async () => {
    await expect(
      checkRateLimitForKey('ai-daily:guest:abc', {
        windowMs: 86_400_000,
        maxRequests: 10,
        keyPrefix: 'ai-daily',
        failClosed: true,
      })
    ).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });

  it('the AI daily quota (fail-closed) rejects when the key is absent', async () => {
    await expect(checkAiDailyQuota(req())).rejects.toBeInstanceOf(
      RateLimitUnavailableError
    );
  });

  it('non-fail-closed calls still use the in-memory fallback (no regression)', async () => {
    const res = await checkRateLimit(req(), {
      windowMs: 60_000,
      maxRequests: 3,
      keyPrefix: 'feedback',
    });
    expect(res.success).toBe(true);
    expect(res.remaining).toBe(2);
  });
});

describe('SEC-02 — key present: normal limiting is unchanged', () => {
  it('distributed result is returned for fail-closed calls', async () => {
    setRateLimiterSupabaseForTests({
      rpc: async () => ({
        data: [{ allowed: true, count: 1, reset_ms: 30_000 }],
        error: null,
      }),
    });
    const res = await checkRateLimit(req(), {
      windowMs: 60_000,
      maxRequests: 25,
      keyPrefix: 'ai-coach',
      failClosed: true,
    });
    expect(res.success).toBe(true);
    expect(res.remaining).toBe(24);
    expect(res.resetMs).toBe(30_000);
  });

  it('distributed denial is honoured for fail-closed calls', async () => {
    setRateLimiterSupabaseForTests({
      rpc: async () => ({
        data: [{ allowed: false, count: 26, reset_ms: 30_000 }],
        error: null,
      }),
    });
    const res = await checkRateLimit(req(), {
      windowMs: 60_000,
      maxRequests: 25,
      keyPrefix: 'ai-coach',
      failClosed: true,
    });
    expect(res.success).toBe(false);
    expect(res.remaining).toBe(0);
  });

  it('configured-but-failing RPC still throws for fail-closed calls', async () => {
    setRateLimiterSupabaseForTests({
      rpc: async () => ({ data: null, error: { message: 'boom' } }),
    });
    await expect(
      checkRateLimit(req(), {
        windowMs: 60_000,
        maxRequests: 25,
        keyPrefix: 'ai-coach',
        failClosed: true,
      })
    ).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });
});
