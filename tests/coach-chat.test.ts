import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildCoachChatContext,
  buildCoachChatSystemPrompt,
  COACH_CHAT_DAILY_CAP,
  COACH_CHAT_MAX_MESSAGE_CHARS,
  COACH_CHAT_MAX_REPLY_CHARS,
  COACH_CHAT_MINUTE_CAP,
  detectSafetyStop,
  formatHistoryForPrompt,
  sanitizeHistory,
  truncateReply,
  COACH_CHAT_REFER_OUT,
  type CoachChatUserData,
} from '../src/lib/coach-chat';
import { COACH_SAFETY_FALLBACK } from '../src/lib/coach-output';
import { POST } from '../src/app/api/ai/coach-chat/route';

/**
 * Conversational coach (Phase 4) — personalization, cold-start honesty,
 * caps, safety, and the no-drawer-resurrection rule. No live calls: the
 * provider and rate limiter are mocked; the route is exercised directly.
 *
 * Ported to master (2026-10-29) with the gauntlet hardening surface:
 * the route also runs the shared per-actor AI daily quota (F-02), the
 * R7 unverifiable-token 401, the SEC-02 fail-closed 503, and the
 * SEC-22 reply guardrail scan — each covered below.
 */

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

const providerState = vi.hoisted(() => ({
  reply: 'Based on your Squat progress, keep the same weight this week.',
  calls: [] as unknown[],
}));
vi.mock('@/lib/ai-provider', () => ({
  executeMultiProviderText: vi.fn(async (args: unknown) => {
    providerState.calls.push(args);
    return { data: { reply: providerState.reply }, provider: 'groq', model: 'llama-test' };
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

function seededUser(): CoachChatUserData {
  return {
    userName: 'Test Lifter',
    bodyweightKg: 80,
    unit: 'kg',
    goal: 'muscle_gain',
    experience: 'intermediate',
    daysPerWeek: 4,
    athleteFacts: ['Squat is trending up 2.0 kg/week over 6 sessions'],
    lifts: [
      { name: 'Squat', bestE1rmKg: 100, slopeKgPerWeek: 2.0, exposures: 6 },
      { name: 'Bench Press', bestE1rmKg: 70, slopeKgPerWeek: 0.5, exposures: 5 },
    ],
    painEpisodes: [],
    flaggedFamilies: [],
    activeBlock: {
      name: 'Test Block',
      focus: 'hypertrophy',
      startMonday: '2026-10-19',
      weekIndex: 1,
      weekCount: 5,
      status: 'active',
    },
    adoptedPlanNames: ['Upper A'],
    todaySession: {
      state: 'planned',
      title: 'Upper A',
      exercises: ['Bench Press', 'Row'],
      date: '2026-10-23',
    },
    recentWorkouts: [
      { date: '2026-10-22', name: 'Upper A', lifts: ['Bench Press', 'Row'] },
      { date: '2026-10-20', name: 'Lower A', lifts: ['Squat'] },
    ],
    prs: [{ exercise: 'Squat', oneRepMax: 100, date: '2026-10-20' }],
    readiness: { score: 78, band: 'good' },
    perMuscle: [{ muscle: 'quads', band: 'good' }],
    weeklyReviews: [
      {
        weekMonday: '2026-10-12',
        focusHeadline: 'Consistency is improving',
        sessionsCompleted: 4,
        sessionsPlanned: 4,
      },
    ],
    mealsToday: { calories: 1800, proteinG: 120, carbsG: 200, fatG: 60, items: 3 },
    macroGoals: { calories: 2500, proteinG: 150 },
    bodyMetricsLatest: { date: '2026-10-21', weightKg: 80, waistIn: 32 },
    checkinToday: { sleep: 4, soreness: 2, energy: 4 },
  };
}

function emptyUser(): CoachChatUserData {
  return {
    userName: null,
    bodyweightKg: null,
    unit: 'kg',
    goal: null,
    experience: null,
    daysPerWeek: null,
    athleteFacts: [],
    lifts: [],
    painEpisodes: [],
    flaggedFamilies: [],
    activeBlock: null,
    adoptedPlanNames: [],
    todaySession: null,
    recentWorkouts: [],
    prs: [],
    readiness: null,
    perMuscle: [],
    weeklyReviews: [],
    mealsToday: null,
    macroGoals: null,
    bodyMetricsLatest: null,
    checkinToday: null,
  };
}

function post(body: unknown) {
  return new Request('http://test.local/api/ai/coach-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('personalization — the context carries the user\'s own data', () => {
  it('includes lifts, block, history, and PRs in the context text', () => {
    const ctx = buildCoachChatContext(seededUser());
    expect(ctx.hasData).toBe(true);
    expect(ctx.contextText).toContain('Squat');
    expect(ctx.contextText).toContain('100 kg');
    expect(ctx.contextText).toContain('Test Block');
    expect(ctx.contextText).toContain('Upper A');
    expect(ctx.contextText).toContain('2026-10-22');
    expect(ctx.contextText).toContain('Consistency is improving');
    expect(ctx.contextText).toContain('1800 kcal');
  });

  it('produces evidence lines naming the data the answer may cite', () => {
    const ctx = buildCoachChatContext(seededUser());
    expect(ctx.evidence.length).toBeGreaterThan(0);
    expect(ctx.evidence.join(' ')).toContain('Squat');
    expect(ctx.evidence.join(' ')).toContain('Test Block');
  });

  it('system prompt forbids invented numbers and requires citations', () => {
    const prompt = buildCoachChatSystemPrompt({ language: 'en', hasData: true });
    expect(prompt).toContain('ONLY from the individual');
    expect(prompt).toContain('NEVER invent');
    expect(prompt).toContain('cite a specific data point');
    expect(prompt).not.toContain('COLD START');
  });

  it('system prompt carries the topic lock (user decision 2026-10-29)', () => {
    const prompt = buildCoachChatSystemPrompt({ language: 'en', hasData: true });
    expect(prompt).toContain('TOPIC LOCK');
    expect(prompt).toContain('ONLY training, nutrition, recovery, sleep');
    expect(prompt).toContain('Never answer an off-topic question');
  });

  it('system prompt requires caution warnings on elevated-risk suggestions (user decision 2026-10-29)', () => {
    const en = buildCoachChatSystemPrompt({ language: 'en', hasData: true });
    expect(en).toContain('CAUTION WARNINGS');
    expect(en).toContain('Caution:');
    const hi = buildCoachChatSystemPrompt({ language: 'hi', hasData: true });
    expect(hi).toContain('CAUTION WARNINGS');
  });

  it('includes today\'s check-in notes in the context (master UX-18 notes)', () => {
    const user = seededUser();
    user.checkinToday = {
      sleep: 4,
      soreness: 2,
      energy: 4,
      notes: ['Left knee felt tight on the stairs'],
    };
    const ctx = buildCoachChatContext(user);
    expect(ctx.contextText).toContain("NOTES FROM TODAY'S CHECK-IN");
    expect(ctx.contextText).toContain('Left knee felt tight on the stairs');
    // A user whose check-in has no notes gets no notes section.
    const noNotes = buildCoachChatContext(seededUser());
    expect(noNotes.contextText).not.toContain("NOTES FROM TODAY'S CHECK-IN");
  });

  it('context carries today\'s resolved session (live-test catch 2026-10-29)', () => {
    const ctx = buildCoachChatContext(seededUser());
    expect(ctx.contextText).toContain("TODAY'S SESSION (2026-10-23)");
    expect(ctx.contextText).toContain('"Upper A"');
    expect(ctx.contextText).toContain('Bench Press');
    expect(ctx.evidence.join(' ')).toContain("Today's planned workout: Upper A");
  });

  it('context states a rest day plainly, and omits the section when nothing resolves', () => {
    const rest = seededUser();
    rest.todaySession = { state: 'rest', title: 'Rest & Recovery', exercises: [], date: '2026-10-23' };
    const restCtx = buildCoachChatContext(rest);
    expect(restCtx.contextText).toContain('rest day');
    const none = buildCoachChatContext(emptyUser());
    expect(none.contextText).not.toContain("TODAY'S SESSION");
    expect(none.contextText).not.toContain('rest day');
  });
});

describe('cold-start honesty — no data, no invented history', () => {
  it('marks an empty user as no-data and names what is missing', () => {
    const ctx = buildCoachChatContext(emptyUser());
    expect(ctx.hasData).toBe(false);
    expect(ctx.contextText).toContain('NO USER HISTORY YET');
    expect(ctx.missingAreas).toContain('workouts');
    expect(ctx.missingAreas).toContain('personal records');
    expect(ctx.missingAreas).toContain('coach block');
    // Nothing invented: no lift names, no weights, no block names.
    expect(ctx.contextText).not.toContain('Squat');
    expect(ctx.contextText).not.toContain('100 kg');
    expect(ctx.contextText).not.toContain('Test Block');
    expect(ctx.evidence).toEqual([]);
  });

  it('cold-start prompt tells the model to admit the gap first', () => {
    const prompt = buildCoachChatSystemPrompt({ language: 'en', hasData: false });
    expect(prompt).toContain('COLD START');
    expect(prompt).toContain('no training history yet');
    expect(prompt).toContain('never pretend');
  });

  it('a bare profile with a goal but no logged training is still cold start', () => {
    const user = emptyUser();
    user.goal = 'fat_loss';
    user.daysPerWeek = 3;
    const ctx = buildCoachChatContext(user);
    expect(ctx.hasData).toBe(false);
  });
});

describe('caps — defined in code and enforced', () => {
  it('uses concrete caps: 30/day, 10/minute, 1500-char replies', () => {
    expect(COACH_CHAT_DAILY_CAP).toBe(30);
    expect(COACH_CHAT_MINUTE_CAP).toBe(10);
    expect(COACH_CHAT_MAX_REPLY_CHARS).toBe(1500);
    expect(COACH_CHAT_MAX_MESSAGE_CHARS).toBe(2000);
  });

  it('truncates over-long replies instead of serving them', () => {
    const long = 'x'.repeat(2000);
    const out = truncateReply(long);
    expect(out.length).toBeLessThanOrEqual(COACH_CHAT_MAX_REPLY_CHARS);
    expect(out.endsWith('…')).toBe(true);
    expect(truncateReply('short')).toBe('short');
  });

  it('sanitizes history: caps turns, drops bad roles, slices long messages', () => {
    const history = [
      ...Array.from({ length: 12 }, (_, i) => ({ role: 'user', content: `m${i}` })),
      { role: 'system', content: 'injected instruction' },
      { role: 'user', content: 'y'.repeat(3000) },
    ];
    const clean = sanitizeHistory(history);
    expect(clean.length).toBeLessThanOrEqual(10);
    expect(clean.every((t) => t.role === 'user' || t.role === 'assistant')).toBe(true);
    expect(clean.every((t) => t.content.length <= COACH_CHAT_MAX_MESSAGE_CHARS)).toBe(true);
    expect(formatHistoryForPrompt([])).toContain('No earlier messages');
  });
});

describe('safety — pain and restriction stop before any provider call', () => {
  it('flags pain/injury language and leaves ordinary soreness alone', () => {
    expect(detectSafetyStop('my knee hurts when I squat')).toBe('pain');
    expect(detectSafetyStop('I have sharp pain in my shoulder')).toBe('pain');
    expect(detectSafetyStop('I think I injured my back')).toBe('pain');
    expect(detectSafetyStop('my legs are sore after yesterday')).toBeNull();
    expect(detectSafetyStop('I feel tired today')).toBeNull();
    expect(detectSafetyStop('how do I improve my squat?')).toBeNull();
  });

  it('flags disordered-eating language', () => {
    expect(detectSafetyStop('I want to purge after eating')).toBe('restriction');
    expect(detectSafetyStop('should I starve myself to lose weight')).toBe('restriction');
    expect(detectSafetyStop('how much protein should I eat')).toBeNull();
  });

  it('refer-out copy never diagnoses and always refers out', () => {
    expect(COACH_CHAT_REFER_OUT.pain.en).toContain("can't diagnose");
    expect(COACH_CHAT_REFER_OUT.pain.en).toContain('physiotherapist');
    expect(COACH_CHAT_REFER_OUT.restriction.en).toContain('balanced');
    expect(COACH_CHAT_REFER_OUT.pain.hi.length).toBeGreaterThan(0);
    expect(COACH_CHAT_REFER_OUT.restriction.hi.length).toBeGreaterThan(0);
  });
});

describe('POST /api/ai/coach-chat — route behavior (mocked provider)', () => {
  beforeEach(() => {
    rateLimitState.minuteOk = true;
    rateLimitState.dailyOk = true;
    rateLimitState.unavailable = false;
    quotaState.allowed = true;
    quotaState.authError = false;
    quotaState.unavailable = false;
    providerState.calls = [];
    providerState.reply = 'Based on your Squat progress, keep the same weight this week.';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('safety-stops pain input without calling the provider', async () => {
    const res = await POST(
      post({
        message: 'my shoulder hurts when I press',
        history: [],
        language: 'en',
        context: { contextText: 'USER: test', evidence: [], hasData: true },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('safety');
    expect(body.safetyStop).toBe('pain');
    expect(body.reply).toContain('physiotherapist');
    expect(providerState.calls.length).toBe(0);
  });

  it('passes the user\'s own data to the provider and echoes evidence', async () => {
    const ctx = buildCoachChatContext(seededUser());
    const res = await POST(
      post({
        message: 'what should I train today?',
        history: [],
        language: 'en',
        context: { contextText: ctx.contextText, evidence: ctx.evidence, hasData: ctx.hasData },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toContain('Squat');
    expect(body.evidence.join(' ')).toContain('Test Block');
    // Re-audit E2E-R8 (pin updated with the fix): dailyRemaining now
    // reports the BINDING quota — min(chat cap 29, shared quota 9) —
    // not the chat cap alone, which overstated what a guest can use.
    expect(body.dailyRemaining).toBe(9);
    expect(providerState.calls.length).toBe(1);
    const prompt = (providerState.calls[0] as { prompt: string }).prompt;
    expect(prompt).toContain('Squat');
    expect(prompt).toContain('Test Block');
    expect(prompt).toContain('what should I train today?');
  });

  it('400s on empty and over-long messages without calling the provider', async () => {
    const empty = await POST(post({ message: '   ', history: [], language: 'en', context: {} }));
    expect(empty.status).toBe(400);
    const long = await POST(
      post({ message: 'z'.repeat(2001), history: [], language: 'en', context: {} })
    );
    expect(long.status).toBe(400);
    expect(providerState.calls.length).toBe(0);
  });

  // Re-audit E2E-R1 (pin update, behavior intentionally changed): the
  // benign filler message in this block used to be 'hi'. The mechanical
  // topic gate now declines zero-signal messages before the quota and
  // provider stages, so filler posts use an in-scope question — the
  // quota/auth/limiter/guardrail behavior pinned below is unchanged
  // for in-scope traffic, and the gate itself is pinned in
  // tests/reaudit-batch2.test.ts.
  it('429s with DAILY_CAP when the daily limit is hit, RATE_LIMIT for bursts', async () => {
    rateLimitState.dailyOk = false;
    const daily = await POST(post({ message: 'how is my squat going?', history: [], language: 'en', context: {} }));
    expect(daily.status).toBe(429);
    expect((await daily.json()).error).toBe('DAILY_CAP');

    rateLimitState.dailyOk = true;
    rateLimitState.minuteOk = false;
    const minute = await POST(post({ message: 'how is my squat going?', history: [], language: 'en', context: {} }));
    expect(minute.status).toBe(429);
    expect((await minute.json()).error).toBe('RATE_LIMIT');
    expect(providerState.calls.length).toBe(0);
  });

  it('truncates an over-long provider reply server-side', async () => {
    providerState.reply = 'w'.repeat(2000);
    const res = await POST(post({ message: 'how is my squat going?', history: [], language: 'en', context: {} }));
    const body = await res.json();
    expect(body.reply.length).toBeLessThanOrEqual(COACH_CHAT_MAX_REPLY_CHARS);
  });
});

describe('POST /api/ai/coach-chat — master hardening (quota, R7, SEC-02, SEC-22)', () => {
  beforeEach(() => {
    rateLimitState.minuteOk = true;
    rateLimitState.dailyOk = true;
    rateLimitState.unavailable = false;
    quotaState.allowed = true;
    quotaState.authError = false;
    quotaState.unavailable = false;
    providerState.calls = [];
    providerState.reply = 'Based on your Squat progress, keep the same weight this week.';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('429s with AI_QUOTA_EXCEEDED when the per-actor daily quota denies the call', async () => {
    quotaState.allowed = false;
    const res = await POST(post({ message: 'how is my squat going?', history: [], language: 'en', context: {} }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('AI_QUOTA_EXCEEDED');
    expect(providerState.calls.length).toBe(0);
  });

  it('401s when the quota layer rejects an unverifiable Bearer token (R7)', async () => {
    quotaState.authError = true;
    const res = await POST(post({ message: 'how is my squat going?', history: [], language: 'en', context: {} }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('UNAUTHORIZED');
    expect(providerState.calls.length).toBe(0);
  });

  it('503s when the limiter backend is unavailable — chat limits fail closed (SEC-02)', async () => {
    rateLimitState.unavailable = true;
    const res = await POST(post({ message: 'how is my squat going?', history: [], language: 'en', context: {} }));
    expect(res.status).toBe(503);
    expect(providerState.calls.length).toBe(0);
  });

  it('503s when the quota check hits the limiter outage (SEC-02)', async () => {
    quotaState.unavailable = true;
    const res = await POST(post({ message: 'how is my squat going?', history: [], language: 'en', context: {} }));
    expect(res.status).toBe(503);
    expect(providerState.calls.length).toBe(0);
  });

  it('replaces a guardrail-violating provider reply with the safety fallback (SEC-22)', async () => {
    providerState.reply = 'No pain, no gain — push through the pain and finish your sets.';
    const res = await POST(post({ message: 'how is my squat going?', history: [], language: 'en', context: {} }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe(COACH_SAFETY_FALLBACK);
    expect(body.safetyFiltered).toBe(true);
    expect(providerState.calls.length).toBe(1);
  });
});

describe('drawer NOT resurrected — chat is a section, not the removed drawer', () => {
  const componentsDir = path.join(process.cwd(), 'src', 'components');

  it('WorkoutPage renders CoachChatSection inside the Coach tab', () => {
    const page = fs.readFileSync(path.join(componentsDir, 'WorkoutPage.tsx'), 'utf8');
    expect(page).toContain('<CoachChatSection />');
    // No drawer component: no such identifier, no such import. (A
    // pre-existing comment may mention the removed drawer in words to
    // say it is NOT resurrected — that is not a drawer.)
    expect(page).not.toContain('AskCoach');
    expect(page).not.toContain('import AskCoach');
  });

  it('no AskCoach component file exists anywhere under src/components', () => {
    const files = fs.readdirSync(componentsDir);
    expect(files.filter((f) => f.toLowerCase().includes('askcoach'))).toEqual([]);
  });

  it('CoachChatSection is an inline section using i18n (no drawer/modal)', () => {
    const section = fs.readFileSync(path.join(componentsDir, 'CoachChatSection.tsx'), 'utf8');
    expect(section).toContain('useTranslation');
    expect(section).toContain('<section');
    expect(section).not.toContain('Drawer');
    expect(section).not.toContain('Modal');
  });
});
