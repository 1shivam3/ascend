/**
 * Coach AI Actions, Slice A (2026-11-05): the route passes a VALID
 * action through to the client, drops an invalid one silently (the
 * reply is still served), and never attaches an action to a static
 * safety/topic-lock reply. Provider, rate limit, and quota are mocked
 * exactly as in tests/coach-chat.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../src/app/api/ai/coach-chat/route';

vi.mock('@/lib/rate-limit', () => {
  class RateLimitUnavailableError extends Error {}
  return {
    checkRateLimit: vi.fn(async () => ({ success: true, remaining: 9, resetMs: 0 })),
    RateLimitUnavailableError,
  };
});

vi.mock('@/lib/ai-quota', () => {
  class AiActorAuthError extends Error {}
  return {
    AiActorAuthError,
    checkAiDailyQuota: vi.fn(async () => ({
      allowed: true,
      actor: { kind: 'guest', guestKey: 'g' },
      limit: 10,
      remaining: 9,
      resetMs: 0,
    })),
    aiQuotaExceededResponse: () =>
      new Response(JSON.stringify({ error: 'AI_QUOTA_EXCEEDED' }), { status: 429 }),
  };
});

const providerState = vi.hoisted(() => ({
  data: { reply: '', action: null as unknown },
  calls: [] as Array<{ prompt: string; systemPrompt: string }>,
}));
vi.mock('@/lib/ai-provider', () => ({
  executeMultiProviderText: vi.fn(async (args: { prompt: string; systemPrompt: string }) => {
    providerState.calls.push(args);
    return { data: providerState.data, provider: 'groq', model: 'llama-test' };
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

function post(body: unknown) {
  return new Request('https://ascend.app/api/ai/coach-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ASK = { history: [], language: 'en', context: { contextText: '', evidence: [], hasData: true } };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  providerState.calls = [];
  providerState.data = { reply: 'Here is the change I drafted — tap Apply to set it.', action: null };
});

describe('coach-actions route: action passthrough', () => {
  it('a valid set_macro_goals action rides along with the reply', async () => {
    providerState.data = {
      reply: 'Drafted: protein to 160 g. Nothing changes until you tap Apply.',
      action: { type: 'set_macro_goals', proteinG: 160 },
    };
    const res = await POST(post({ ...ASK, message: 'raise my protein target to 160' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toContain('tap Apply');
    expect(body.action).toEqual({ type: 'set_macro_goals', proteinG: 160 });
  });

  it('a valid propose_program action rides along, unknown keys stripped', async () => {
    providerState.data = {
      reply: 'Drafted a 4-day muscle block. Nothing changes until you tap Apply.',
      action: {
        type: 'propose_program',
        goal: 'muscle',
        daysPerWeek: 4,
        sessionMinutes: 60,
        equipment: 'full_gym',
        experience: 'intermediate',
        limitations: ['knee'],
        providerJunk: 'strip me',
      },
    };
    const res = await POST(post({ ...ASK, message: 'make me a muscle-gain program' }));
    const body = await res.json();
    expect(body.action).toEqual({
      type: 'propose_program',
      goal: 'muscle',
      daysPerWeek: 4,
      sessionMinutes: 60,
      equipment: 'full_gym',
      experience: 'intermediate',
      limitations: ['knee'],
    });
  });

  it('an out-of-range action is dropped while the reply survives', async () => {
    providerState.data = {
      reply: 'I drafted a target change for you.',
      action: { type: 'set_macro_goals', calories: 900 }, // below the 1200 floor
    };
    const res = await POST(post({ ...ASK, message: 'set my calories to 900' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toContain('drafted a target change');
    expect(body.action).toBeUndefined();
    expect('action' in body).toBe(false);
  });

  it('a string-typed number is not coerced — the action is dropped', async () => {
    providerState.data = {
      reply: 'Drafted.',
      action: { type: 'set_macro_goals', proteinG: '160' },
    };
    const res = await POST(post({ ...ASK, message: 'set protein to 160' }));
    const body = await res.json();
    expect('action' in body).toBe(false);
  });

  it('no action from the model → no action field in the response', async () => {
    providerState.data = { reply: 'Your squat is trending up.', action: null };
    const res = await POST(post({ ...ASK, message: 'how is my squat going?' }));
    const body = await res.json();
    expect(body.reply).toContain('trending up');
    expect('action' in body).toBe(false);
  });

  it('the prompt asks for the {reply, action} envelope', async () => {
    await POST(post({ ...ASK, message: 'how is my squat going?' }));
    expect(providerState.calls).toHaveLength(1);
    expect(providerState.calls[0].prompt).toContain('"action"');
    expect(providerState.calls[0].systemPrompt).toContain('ACTIONS');
    expect(providerState.calls[0].systemPrompt).toContain('set_macro_goals');
    expect(providerState.calls[0].systemPrompt).toContain('propose_program');
  });
});

describe('coach-actions route: static paths never carry actions', () => {
  it('safety stop reply has no action field (provider never called)', async () => {
    const res = await POST(post({ ...ASK, message: 'my shoulder hurts when I press' }));
    const body = await res.json();
    expect(body.provider).toBe('safety');
    expect('action' in body).toBe(false);
    expect(providerState.calls).toHaveLength(0);
  });

  it('topic-lock reply has no action field (provider never called)', async () => {
    const res = await POST(post({ ...ASK, message: 'who won the football match yesterday?' }));
    const body = await res.json();
    expect(body.provider).toBe('topic-lock');
    expect('action' in body).toBe(false);
    expect(providerState.calls).toHaveLength(0);
  });

  it('a guardrail-violating reply loses its action with its text', async () => {
    providerState.data = {
      reply: 'Train through the pain, no pain no gain.',
      action: { type: 'set_macro_goals', proteinG: 160 },
    };
    const res = await POST(post({ ...ASK, message: 'set protein to 160 and push through' }));
    const body = await res.json();
    expect(body.safetyFiltered).toBe(true);
    expect('action' in body).toBe(false);
  });
});
