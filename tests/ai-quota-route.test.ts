import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '../src/app/api/ai/coach/route';

/**
 * Audit F-02 (brief option A), route level: the ai/coach route enforces
 * the per-actor daily quota AFTER the per-minute IP check and BEFORE
 * body parsing, via the real ai-quota module. Only the rate-limit
 * backing store is mocked (controllable per test); the quota decision,
 * the 429 shape, and the 503 mapping are all real code.
 */

const quotaState = vi.hoisted(() => ({
  mode: 'allow' as 'allow' | 'deny' | 'down',
}));

vi.mock('@/lib/rate-limit', () => {
  class RateLimitUnavailableError extends Error {}
  return {
    checkRateLimit: vi.fn(async () => ({ success: true, resetMs: 0 })),
    checkRateLimitForKey: vi.fn(async () => {
      if (quotaState.mode === 'deny') {
        return { success: false, resetMs: 60000, remaining: 0, limit: 10 };
      }
      if (quotaState.mode === 'down') {
        throw new RateLimitUnavailableError('limiter down');
      }
      return { success: true, resetMs: 0, remaining: 9, limit: 10 };
    }),
    // The provider layer's shared 500/day global cap also reads this
    // module; success keeps the allow-path on the route's own logic.
    checkGlobalRateLimit: vi.fn(async () => ({ success: true, resetMs: 0, remaining: 499, limit: 500 })),
    getClientIp: () => '127.0.0.1',
    RateLimitUnavailableError,
  };
});

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://test.local/api/ai/coach', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  quotaState.mode = 'allow';
});

describe('ai/coach daily quota wiring', () => {
  it('denied quota → honest 429 AI_QUOTA_EXCEEDED with reset timing', async () => {
    quotaState.mode = 'deny';
    const res = await POST(post({}));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('AI_QUOTA_EXCEEDED');
    expect(typeof body.message).toBe('string');
    expect(body.message).toMatch(/daily/i);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('quota is checked BEFORE body handling: denied quota + oversized body still 429, not 413', async () => {
    quotaState.mode = 'deny';
    const res = await POST(post(JSON.stringify({ pad: 'x'.repeat(70 * 1024) })));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('AI_QUOTA_EXCEEDED');
  });

  it('limiter outage → 503 (fail-closed, same as the per-minute check)', async () => {
    quotaState.mode = 'down';
    const res = await POST(post({}));
    expect(res.status).toBe(503);
  });

  it('allowed quota → request proceeds past quota to the route’s own validation', async () => {
    quotaState.mode = 'allow';
    const res = await POST(post({}));
    // {} fails the route's own body validation downstream; the point
    // is it is NOT a quota rejection (429) or a limiter outage (503).
    expect(res.status).not.toBe(429);
    expect(res.status).not.toBe(503);
  });
});
