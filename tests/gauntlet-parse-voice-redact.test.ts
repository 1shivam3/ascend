import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../src/app/api/ai/parse-voice/route';

/**
 * Gauntlet SEC-15 regression: the parse-voice PARSE_FAILED path
 * returned the raw provider error verbatim, while the 500 path
 * redacted it. A provider error carrying a key must never reach the
 * client. Only the limiter, quota and provider layers are mocked;
 * the redaction itself runs for real.
 */
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ success: true, resetMs: 0 })),
  RateLimitUnavailableError: class RateLimitUnavailableError extends Error {},
}));

vi.mock('@/lib/ai-quota', () => ({
  checkAiDailyQuota: vi.fn(async () => ({
    allowed: true,
    actor: { kind: 'guest', guestKey: 'test' },
    limit: 10,
    remaining: 9,
    resetMs: 0,
  })),
  aiQuotaExceededResponse: vi.fn(() => new Response('quota', { status: 429 })),
}));

vi.mock('@/lib/ai-provider', () => ({
  executeMultiProviderText: vi.fn(async () => {
    throw new Error('provider failed with key sk-or-fake-test-key-1234567890abcdef');
  }),
}));

function voiceReq(body: unknown) {
  return new Request('http://test.local/api/ai/parse-voice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('gauntlet SEC-15: parse-voice PARSE_FAILED redacts provider errors', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns 422 PARSE_FAILED without the leaked key', async () => {
    const res = await POST(voiceReq({ transcript: 'bench 80 pe 5', currentExercise: 'Bench Press' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('PARSE_FAILED');
    expect(body.message).not.toContain('sk-or-fake-test-key');
    expect(body.message).toContain('[REDACTED_API_KEY]');
  });
});
