/**
 * Re-audit (2026-10-29) fix regressions. Each test pins one fix from the
 * re-audit ledger (docs/reaudit/11-fix-and-retest-ledger.md):
 *  - SEC-R1/E2E-R2: safety scan covers history + context, Hindi patterns.
 *  - SEC-R8/E2E-R4: sanitizeHistory keeps the most recent turns.
 *  - E2E-R3: the safety refer-out outranks quota denials.
 *  - DI-R1: body-metric sync dedupe by date.
 * Route tests reuse the mock scaffolding pattern of tests/coach-chat.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectSafetyStop,
  findSafetyStop,
  sanitizeHistory,
  COACH_CHAT_MAX_HISTORY_TURNS,
} from '../src/lib/coach-chat';
import { dedupeBodyMetricsByDate } from '../src/lib/supabase/reconcile';

describe('re-audit: safety scan coverage (SEC-R1/E2E-R2)', () => {
  it('flags Hindi pain and purging language', () => {
    expect(detectSafetyStop('मेरे कंधे में दर्द है')).toBe('pain');
    expect(detectSafetyStop('मुझे चोट लगी है')).toBe('pain');
    expect(detectSafetyStop('खाने के बाद उल्टी आती है')).toBe('restriction');
    expect(detectSafetyStop('आज मैं बहुत थका हूँ')).toBeNull();
  });

  it('finds a stop in user history turns, not only the current message', () => {
    const stop = findSafetyStop({
      message: 'what should I train today?',
      history: [
        { role: 'user', content: 'my knee hurts since yesterday' },
        { role: 'assistant', content: 'Let us look at your plan.' },
      ],
      contextText: '',
    });
    expect(stop).toBe('pain');
  });

  it('finds a stop in the grounding context (check-in notes channel)', () => {
    const stop = findSafetyStop({
      message: 'how is my progress?',
      history: [],
      contextText: 'CHECK-IN NOTE: sharp pain in left shoulder since Tuesday',
    });
    expect(stop).toBe('pain');
  });

  it('does not scan assistant turns (the coach quoting a refer-out is not a new disclosure)', () => {
    const stop = findSafetyStop({
      message: 'ok, understood',
      history: [{ role: 'assistant', content: 'Rest if you feel pain or get injured.' }],
      contextText: '',
    });
    expect(stop).toBeNull();
  });

  it('returns null for a fully benign request', () => {
    expect(
      findSafetyStop({ message: 'how much protein today?', history: [], contextText: 'Squat 100 kg' })
    ).toBeNull();
  });
});

describe('re-audit: sanitizeHistory keeps the most recent turns (SEC-R8/E2E-R4)', () => {
  it('drops the OLDEST turns past the cap', () => {
    const history = Array.from({ length: 14 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    const clean = sanitizeHistory(history);
    expect(clean.length).toBe(COACH_CHAT_MAX_HISTORY_TURNS);
    expect(clean[0].content).toBe('m4');
    expect(clean[clean.length - 1].content).toBe('m13');
  });
});

describe('re-audit: body-metric date dedupe (DI-R1)', () => {
  const row = (id: string, date: string, updatedAt?: string) => ({ id, date, updatedAt });

  it('keeps the newest row per date and reports the loser as superseded', () => {
    const { rows, supersededIds } = dedupeBodyMetricsByDate([
      row('local-1', '2026-10-29', '2026-10-29T08:00:00.000Z'),
      row('remote-2', '2026-10-29', '2026-10-29T09:00:00.000Z'),
      row('other', '2026-10-28', '2026-10-28T09:00:00.000Z'),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['remote-2', 'other']);
    expect(supersededIds).toEqual(['local-1']);
  });

  it('treats a missing stamp as oldest and keeps the first row on ties (local wins)', () => {
    const { rows, supersededIds } = dedupeBodyMetricsByDate([
      row('local-1', '2026-10-29'),
      row('remote-2', '2026-10-29'),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['local-1']);
    expect(supersededIds).toEqual(['remote-2']);
  });

  it('leaves distinct dates untouched', () => {
    const input = [row('a', '2026-10-27'), row('b', '2026-10-28'), row('c', '2026-10-29')];
    const { rows, supersededIds } = dedupeBodyMetricsByDate(input);
    expect(rows).toEqual(input);
    expect(supersededIds).toEqual([]);
  });
});

// ── Route level: safety outranks quota (E2E-R3) ─────────────────────────

const rateLimitState = vi.hoisted(() => ({ minuteOk: true, dailyOk: true, unavailable: false }));
vi.mock('@/lib/rate-limit', () => {
  class RateLimitUnavailableError extends Error {}
  return {
    checkRateLimit: vi.fn(async (_req: unknown, opts: { keyPrefix: string }) => {
      if (rateLimitState.unavailable) {
        throw new RateLimitUnavailableError('limiter unavailable');
      }
      if (opts.keyPrefix === 'coach-chat-daily') {
        return rateLimitState.dailyOk
          ? { success: true, remaining: 29, resetMs: 0 }
          : { success: false, remaining: 0, resetMs: 60000 };
      }
      return rateLimitState.minuteOk
        ? { success: true, remaining: 9, resetMs: 0 }
        : { success: false, remaining: 0, resetMs: 60000 };
    }),
    RateLimitUnavailableError,
  };
});

const quotaState = vi.hoisted(() => ({ allowed: true, authError: false, unavailable: false }));
vi.mock('@/lib/ai-quota', () => {
  class AiActorAuthError extends Error {}
  return {
    AiActorAuthError,
    checkAiDailyQuota: vi.fn(async () => {
      if (quotaState.authError) throw new AiActorAuthError('unverifiable token');
      if (quotaState.unavailable) {
        const rl = await import('@/lib/rate-limit');
        throw new rl.RateLimitUnavailableError('limiter unavailable');
      }
      return quotaState.allowed
        ? { allowed: true, actor: { kind: 'guest', guestKey: 'g' }, limit: 10, remaining: 9, resetMs: 0 }
        : { allowed: false, actor: { kind: 'guest', guestKey: 'g' }, limit: 10, remaining: 0, resetMs: 60000 };
    }),
    aiQuotaExceededResponse: () =>
      new Response(JSON.stringify({ error: 'AI_QUOTA_EXCEEDED' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
  };
});

const providerState = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('@/lib/ai-provider', () => ({
  executeMultiProviderText: vi.fn(async (args: unknown) => {
    providerState.calls.push(args);
    return { data: { reply: 'Keep the same weight this week.' }, provider: 'groq', model: 'llama-test' };
  }),
  AiGlobalCapExceededError: class extends Error {},
}));

vi.mock('@/lib/server-security', () => {
  class RequestBodyTooLargeError extends Error {}
  return {
    rateLimitUnavailableResponse: () => new Response('{}', { status: 503 }),
    readJsonBodyWithLimit: async (req: Request, limit: number) => {
      const text = await req.text();
      if (text.length > limit) throw new RequestBodyTooLargeError('too large');
      return JSON.parse(text);
    },
    RequestBodyTooLargeError,
    requestBodyTooLargeResponse: () => new Response('{}', { status: 413 }),
    redactSecrets: (s: string) => s,
  };
});

import { POST } from '../src/app/api/ai/coach-chat/route';

function post(body: unknown) {
  return new Request('http://test.local/api/ai/coach-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('re-audit: POST /api/ai/coach-chat — safety outranks quota (E2E-R3)', () => {
  beforeEach(() => {
    rateLimitState.minuteOk = true;
    rateLimitState.dailyOk = true;
    rateLimitState.unavailable = false;
    quotaState.allowed = true;
    quotaState.authError = false;
    quotaState.unavailable = false;
    providerState.calls = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('serves the refer-out even when the shared AI quota is exhausted', async () => {
    quotaState.allowed = false;
    const res = await POST(
      post({ message: 'my shoulder hurts when I press', history: [], language: 'en', context: {} })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('safety');
    expect(body.safetyStop).toBe('pain');
    expect(providerState.calls.length).toBe(0);
  });

  it('serves the refer-out for a Hindi pain message', async () => {
    const res = await POST(
      post({ message: 'मेरे कंधे में दर्द है', history: [], language: 'hi', context: {} })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('safety');
    expect(body.safetyStop).toBe('pain');
    expect(providerState.calls.length).toBe(0);
  });

  it('serves the refer-out when pain arrives via history, not the message', async () => {
    const res = await POST(
      post({
        message: 'what should I train today?',
        history: [{ role: 'user', content: 'my knee hurts since yesterday' }],
        language: 'en',
        context: {},
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('safety');
    expect(providerState.calls.length).toBe(0);
  });

  it('still denies a benign message when the shared quota is exhausted (precedence preserved)', async () => {
    quotaState.allowed = false;
    const res = await POST(post({ message: 'how is my squat going?', history: [], language: 'en', context: {} }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('AI_QUOTA_EXCEEDED');
    expect(providerState.calls.length).toBe(0);
  });

  it('still denies a benign message at the chat daily cap', async () => {
    rateLimitState.dailyOk = false;
    const res = await POST(post({ message: 'how is my squat going?', history: [], language: 'en', context: {} }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('DAILY_CAP');
    expect(providerState.calls.length).toBe(0);
  });
});
