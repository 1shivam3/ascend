/**
 * Gauntlet SEC-22 route-level: the coach route validates model
 * output before returning it. The provider is mocked; rate limit and
 * quota are stubbed permissive (covered by their own suites).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const providerResult = { current: null as any };

vi.mock('@/lib/ai-provider', () => ({
  executeMultiProviderText: vi.fn(async () => providerResult.current),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ success: true, resetMs: 0 })),
  checkRateLimitForKey: vi.fn(async () => ({ success: true, resetMs: 0 })),
  getClientIp: () => '127.0.0.1',
  RateLimitUnavailableError: class RateLimitUnavailableError extends Error {},
}));

vi.mock('@/lib/ai-quota', () => ({
  checkAiDailyQuota: vi.fn(async () => ({ allowed: true, actor: { kind: 'guest' }, resetMs: 0 })),
  aiQuotaExceededResponse: vi.fn(),
  AiActorAuthError: class AiActorAuthError extends Error {},
}));

import { POST } from '../src/app/api/ai/coach/route';

function coachReq(body: unknown) {
  return new Request('https://ascend.app/api/ai/coach', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('SEC-22: coach route output gate', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('clean output passes through with only schema fields', async () => {
    providerResult.current = {
      provider: 'test',
      model: 'test-model',
      data: {
        volumeTrend: 'Up 4%.',
        recoveryStatus: 'Good.',
        tacticalAdvice: 'Add 2.5 kg.',
        fatigueWarning: '',
        hallucinated: 'field',
      },
    };
    const res = await POST(coachReq({ task: 'COACH_INSIGHT', userContext: 'ctx' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.hallucinated).toBeUndefined();
    expect(body.data.volumeTrend).toBe('Up 4%.');
    expect(body.safetyFiltered).toBeUndefined();
  });

  it('guardrail-violating advice is replaced and flagged', async () => {
    providerResult.current = {
      provider: 'test',
      model: 'test-model',
      data: {
        volumeTrend: 'Up.',
        recoveryStatus: 'Ok.',
        tacticalAdvice: 'Train through the pain, no pain no gain.',
      },
    };
    const res = await POST(coachReq({ task: 'COACH_INSIGHT', userContext: 'ctx' }));
    const body = await res.json();
    expect(body.safetyFiltered).toBe(true);
    expect(body.data.tacticalAdvice).not.toContain('no pain no gain');
  });

  it('non-object model output is a 500 INVALID_MODEL_OUTPUT', async () => {
    providerResult.current = { provider: 'test', model: 'test-model', data: 'free text' };
    const res = await POST(coachReq({ task: 'COACH_INSIGHT', userContext: 'ctx' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('INVALID_MODEL_OUTPUT');
  });
});
