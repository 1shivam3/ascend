/**
 * Audit-3 (2026-10-30) fix regressions:
 *  - SEC2-2: the coach-chat safety scan must never match the app's own
 *    generated context scaffolding ("PAIN EPISODES ON RECORD" header,
 *    athlete-model facts quoting pain history) — that false positive
 *    permanently safety-stopped every message from any user with a
 *    pain episode on record. Only user-authored channels are scanned:
 *    the current message, user history turns, and the check-in notes
 *    section of the context.
 *  - PERF-1: static replies (safety stop, topic lock) must return after
 *    the per-minute burst limit ONLY — no shared-quota RPC, no chat-cap
 *    RPC. The provider path still runs quota + daily cap (in parallel)
 *    before the provider call, with denial precedence unchanged.
 * Route tests use a call-logging harness so the ORDER and COUNT of
 * limiter/quota invocations are asserted, not just the responses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildCoachChatContext,
  extractCheckinNotes,
  findSafetyStop,
  type CoachChatUserData,
} from '../src/lib/coach-chat';

// ── Unit level: SEC2-2 scan channels ────────────────────────────────────

function userWithPainHistory(): CoachChatUserData {
  return {
    userName: 'Test',
    bodyweightKg: 80,
    unit: 'kg',
    goal: 'strength',
    experience: 'intermediate',
    daysPerWeek: 4,
    athleteFacts: [
      'Pain has come up on 3 separate days in the last month around squat movements (e.g. Back Squat) — your coach will steer clear of that pattern, and it\'s worth getting checked if it persists.',
    ],
    lifts: [{ name: 'Squat', bestE1rmKg: 140, slopeKgPerWeek: 0.5, exposures: 9 }],
    painEpisodes: [{ exerciseName: 'Back Squat', date: '2026-10-20' }],
    flaggedFamilies: ['squat'],
    activeBlock: null,
    adoptedPlanNames: [],
    todaySession: null,
    recentWorkouts: [{ date: '2026-10-28', name: 'Upper A', lifts: ['Bench Press'] }],
    prs: [],
    readiness: null,
    perMuscle: [],
    weeklyReviews: [],
    mealsToday: null,
    macroGoals: null,
    bodyMetricsLatest: null,
    checkinToday: { sleep: 4, soreness: 2, energy: 4 },
  };
}

describe('audit-3 SEC2-2: safety scan ignores generated context scaffolding', () => {
  it('the trap is armed: the built context contains the PAIN header and pain-history facts', () => {
    const ctx = buildCoachChatContext(userWithPainHistory());
    expect(ctx.contextText).toContain('PAIN EPISODES ON RECORD');
    expect(ctx.contextText).toContain('Pain has come up on 3 separate days');
  });

  it('(a) pain-history context + benign message → NO safety stop', () => {
    const ctx = buildCoachChatContext(userWithPainHistory());
    const stop = findSafetyStop({
      message: 'what should I train today?',
      history: [],
      contextText: ctx.contextText,
    });
    expect(stop).toBeNull();
  });

  it('(a2) a hand-built context carrying only the PAIN header → NO safety stop', () => {
    const stop = findSafetyStop({
      message: 'how is my progress?',
      history: [],
      contextText:
        'PAIN EPISODES ON RECORD (respect these — do not program the flagged lifts):\n- Back Squat on 2026-10-20',
    });
    expect(stop).toBeNull();
  });

  it('(a3) pain-history context + painless check-in notes → NO safety stop', () => {
    const user = userWithPainHistory();
    user.checkinToday = { sleep: 3, soreness: 2, energy: 3, notes: ['Slept badly, feeling tired'] };
    const ctx = buildCoachChatContext(user);
    const stop = findSafetyStop({
      message: 'what should I train today?',
      history: [],
      contextText: ctx.contextText,
    });
    expect(stop).toBeNull();
  });

  it('(b) real pain in the current message stops — EN and HI', () => {
    const ctx = buildCoachChatContext(userWithPainHistory());
    expect(
      findSafetyStop({ message: 'my shoulder pain is back', history: [], contextText: ctx.contextText }),
    ).toBe('pain');
    expect(
      findSafetyStop({ message: 'मेरे कंधे में दर्द है', history: [], contextText: ctx.contextText }),
    ).toBe('pain');
  });

  it('(b2) real pain typed into the check-in notes stops — EN and HI', () => {
    const en = userWithPainHistory();
    en.checkinToday = { sleep: 4, soreness: 5, energy: 3, notes: ['Knee pain got worse on stairs'] };
    const enCtx = buildCoachChatContext(en);
    expect(
      findSafetyStop({ message: 'what should I train today?', history: [], contextText: enCtx.contextText }),
    ).toBe('pain');

    const hi = userWithPainHistory();
    hi.checkinToday = { sleep: 4, soreness: 5, energy: 3, notes: ['घुटने में बहुत दर्द है'] };
    const hiCtx = buildCoachChatContext(hi);
    expect(
      findSafetyStop({ message: 'आज क्या ट्रेन करूँ?', history: [], contextText: hiCtx.contextText }),
    ).toBe('pain');
  });

  it('(c) pain in a history user turn stops', () => {
    const stop = findSafetyStop({
      message: 'and what about tomorrow?',
      history: [
        { role: 'user', content: 'my ankle hurts since the run' },
        { role: 'assistant', content: 'Let us adjust.' },
      ],
      contextText: '',
    });
    expect(stop).toBe('pain');
  });

  it('extractCheckinNotes returns only the notes body', () => {
    const ctx = buildCoachChatContext({
      ...userWithPainHistory(),
      checkinToday: { sleep: 4, soreness: 2, energy: 4, notes: ['First note', 'Second note'] },
    });
    expect(extractCheckinNotes(ctx.contextText)).toBe('First note\nSecond note');
    const noNotes = buildCoachChatContext(userWithPainHistory());
    expect(extractCheckinNotes(noNotes.contextText)).toBe('');
    expect(extractCheckinNotes('')).toBe('');
  });
});

// ── Route level: SEC2-2 un-bricking + PERF-1 call ordering ─────────────

const routeState = vi.hoisted(() => ({
  minuteOk: true,
  dailyOk: true,
  quotaAllowed: true,
  calls: [] as string[],
  providerCalls: 0,
}));

vi.mock('@/lib/rate-limit', () => {
  class RateLimitUnavailableError extends Error {}
  return {
    checkRateLimit: vi.fn(async (_req: unknown, opts: { keyPrefix: string }) => {
      routeState.calls.push(`limit:${opts.keyPrefix}`);
      if (opts.keyPrefix === 'coach-chat-daily') {
        return routeState.dailyOk
          ? { success: true, remaining: 29, resetMs: 0 }
          : { success: false, remaining: 0, resetMs: 60000 };
      }
      return routeState.minuteOk
        ? { success: true, remaining: 9, resetMs: 0 }
        : { success: false, remaining: 0, resetMs: 60000 };
    }),
    RateLimitUnavailableError,
  };
});

vi.mock('@/lib/ai-quota', () => {
  class AiActorAuthError extends Error {}
  return {
    AiActorAuthError,
    checkAiDailyQuota: vi.fn(async () => {
      routeState.calls.push('quota');
      return routeState.quotaAllowed
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

vi.mock('@/lib/ai-provider', () => ({
  executeMultiProviderText: vi.fn(async () => {
    routeState.calls.push('provider');
    routeState.providerCalls += 1;
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

describe('audit-3: POST /api/ai/coach-chat', () => {
  beforeEach(() => {
    routeState.minuteOk = true;
    routeState.dailyOk = true;
    routeState.quotaAllowed = true;
    routeState.calls = [];
    routeState.providerCalls = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('SEC2-2: a user with pain episodes on record gets a real answer, not the refer-out', async () => {
    const ctx = buildCoachChatContext(userWithPainHistory());
    const res = await POST(
      post({
        message: 'what should I train today?',
        history: [],
        language: 'en',
        context: { contextText: ctx.contextText, evidence: ctx.evidence, hasData: ctx.hasData },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('groq');
    expect(body.safetyStop).toBeNull();
    expect(routeState.providerCalls).toBe(1);
  });

  it('SEC2-2: pain disclosed in the check-in notes still stops before the provider', async () => {
    const user = userWithPainHistory();
    user.checkinToday = { sleep: 4, soreness: 5, energy: 3, notes: ['Sharp pain in my left knee'] };
    const ctx = buildCoachChatContext(user);
    const res = await POST(
      post({
        message: 'what should I train today?',
        history: [],
        language: 'en',
        context: { contextText: ctx.contextText, evidence: ctx.evidence, hasData: ctx.hasData },
      }),
    );
    const body = await res.json();
    expect(body.provider).toBe('safety');
    expect(body.safetyStop).toBe('pain');
    expect(routeState.providerCalls).toBe(0);
  });

  it('PERF-1: a safety reply burns ONLY the per-minute burst-limit call', async () => {
    const res = await POST(
      post({ message: 'my shoulder hurts when I press', history: [], language: 'en', context: {} }),
    );
    const body = await res.json();
    expect(body.provider).toBe('safety');
    expect(routeState.calls).toEqual(['limit:coach-chat']);
    // No quota state was consulted, so the counter reports null and the
    // client keeps its last known value.
    expect(body.dailyRemaining).toBeNull();
  });

  it('PERF-1: a topic-lock reply burns ONLY the per-minute burst-limit call', async () => {
    const res = await POST(
      post({ message: 'who won the cricket match yesterday?', history: [], language: 'en', context: {} }),
    );
    const body = await res.json();
    expect(body.provider).toBe('topic-lock');
    expect(routeState.calls).toEqual(['limit:coach-chat']);
    expect(body.dailyRemaining).toBeNull();
  });

  it('PERF-1: the safety stop is served even when the shared quota is exhausted — without consulting it', async () => {
    routeState.quotaAllowed = false;
    const res = await POST(
      post({ message: 'मेरे कंधे में दर्द है', history: [], language: 'hi', context: {} }),
    );
    const body = await res.json();
    expect(body.provider).toBe('safety');
    expect(routeState.calls).toEqual(['limit:coach-chat']);
  });

  it('PERF-1: the provider path still claims quota + chat cap before the provider call', async () => {
    const res = await POST(
      post({ message: 'how is my squat going?', history: [], language: 'en', context: {} }),
    );
    const body = await res.json();
    expect(body.provider).toBe('groq');
    expect(routeState.calls[0]).toBe('limit:coach-chat');
    expect(routeState.calls).toContain('quota');
    expect(routeState.calls).toContain('limit:coach-chat-daily');
    expect(routeState.calls[routeState.calls.length - 1]).toBe('provider');
    // Binding counter on the provider path is unchanged (E2E-R8).
    expect(body.dailyRemaining).toBe(9);
  });

  it('PERF-1: denial precedence on the provider path is unchanged (shared quota before chat cap)', async () => {
    routeState.quotaAllowed = false;
    routeState.dailyOk = false;
    const res = await POST(
      post({ message: 'how is my squat going?', history: [], language: 'en', context: {} }),
    );
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('AI_QUOTA_EXCEEDED');
  });

  it('PERF-1: the chat daily cap still denies a benign message when the shared quota allows', async () => {
    routeState.dailyOk = false;
    const res = await POST(
      post({ message: 'how is my squat going?', history: [], language: 'en', context: {} }),
    );
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('DAILY_CAP');
  });
});
