import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * Re-audit batch 2 (the "fix all" round): pins for the deliberately
 * deferred items now implemented —
 *   E2E-R1 mechanical coach-chat enforcement (topic gate pre-provider,
 *          output caution prepend, model-citation stripping),
 *   E2E-R8 dailyRemaining reports the BINDING quota,
 *   SEC-R5 deletion-nonce ledger read fails CLOSED,
 *   DI-R4  Settings restore is single-path through the stamped import.
 * (SEC-R3's pin lives with the middleware suite in
 * tests/gauntlet-batch4-big.test.ts; UX-R4/R5 are pinned by the i18n
 * parity/wiring tests.)
 */

// ── Coach-chat route harness (mirrors tests/reaudit-fixes.test.ts) ──────
const routeState = vi.hoisted(() => ({
  minuteOk: true,
  dailyOk: true,
  quotaAllowed: true,
  quotaRemaining: 25,
  providerCalls: [] as unknown[],
  providerReply: 'Steady progress — your squat is moving well.',
}));

vi.mock('@/lib/rate-limit', () => {
  class RateLimitUnavailableError extends Error {}
  return {
    checkRateLimit: async (_req: unknown, opts: { keyPrefix: string }) => {
      if (opts.keyPrefix === 'coach-chat-daily') {
        return routeState.dailyOk
          ? { success: true, remaining: 29, resetMs: 0 }
          : { success: false, remaining: 0, resetMs: 60000 };
      }
      return routeState.minuteOk
        ? { success: true, remaining: 9, resetMs: 0 }
        : { success: false, remaining: 0, resetMs: 60000 };
    },
    RateLimitUnavailableError,
  };
});

vi.mock('@/lib/ai-quota', () => {
  class AiActorAuthError extends Error {}
  return {
    AiActorAuthError,
    checkAiDailyQuota: async () =>
      routeState.quotaAllowed
        ? {
            allowed: true,
            actor: { kind: 'guest', guestKey: 'g' },
            limit: 10,
            remaining: routeState.quotaRemaining,
            resetMs: 0,
          }
        : {
            allowed: false,
            actor: { kind: 'guest', guestKey: 'g' },
            limit: 10,
            remaining: 0,
            resetMs: 60000,
          },
    aiQuotaExceededResponse: () =>
      new Response(JSON.stringify({ error: 'AI_QUOTA_EXCEEDED' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
  };
});

vi.mock('@/lib/ai-provider', () => ({
  executeMultiProviderText: async (args: unknown) => {
    routeState.providerCalls.push(args);
    return { data: { reply: routeState.providerReply }, provider: 'groq', model: 'mock-model' };
  },
  AiGlobalCapExceededError: class AiGlobalCapExceededError extends Error {},
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
import {
  COACH_CHAT_CAUTION,
  ensureReplyCaution,
  findReplyRisk,
  isCoachChatInScope,
  stripModelCitations,
} from '../src/lib/coach-chat';

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ai/coach-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  routeState.minuteOk = true;
  routeState.dailyOk = true;
  routeState.quotaAllowed = true;
  routeState.quotaRemaining = 25;
  routeState.providerCalls = [];
  routeState.providerReply = 'Steady progress — your squat is moving well.';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('E2E-R1 topic gate — route behavior', () => {
  it('declines an off-topic message with ZERO provider calls', async () => {
    const res = await POST(
      post({
        message: 'what is the score in the cricket match?',
        history: [],
        language: 'en',
        context: {},
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('topic-lock');
    expect(body.topicLock).toBe(true);
    expect(body.reply).toContain('training, nutrition, recovery, or sleep');
    expect(routeState.providerCalls).toHaveLength(0);
  });

  it('serves the decline even when the chat daily cap is exhausted (static copy, like the safety path)', async () => {
    routeState.dailyOk = false;
    const res = await POST(
      post({ message: 'tell me a joke', history: [], language: 'en', context: {} }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).provider).toBe('topic-lock');
    expect(routeState.providerCalls).toHaveLength(0);
  });

  it('lets a clearly in-scope question reach the provider', async () => {
    const res = await POST(
      post({ message: 'how much protein should I eat?', history: [], language: 'en', context: {} }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('groq');
    expect(routeState.providerCalls).toHaveLength(1);
  });

  it('lets a Hindi in-scope question reach the provider', async () => {
    const res = await POST(
      post({
        message: 'मुझे प्रोटीन कितना लेना चाहिए?',
        history: [],
        language: 'hi',
        context: {},
      }),
    );
    expect((await res.json()).provider).toBe('groq');
    expect(routeState.providerCalls).toHaveLength(1);
  });

  it('treats a short follow-up with history as an in-scope continuation', async () => {
    const res = await POST(
      post({
        message: 'yes',
        history: [
          { role: 'user', content: 'what should I train today?' },
          { role: 'assistant', content: 'Legs today — squats first.' },
        ],
        language: 'en',
        context: {},
      }),
    );
    expect((await res.json()).provider).toBe('groq');
    expect(routeState.providerCalls).toHaveLength(1);
  });

  it('safety outranks the topic gate: a zero-signal pain message gets the safety stop, not the decline', async () => {
    // 'pain'/'hurts' are safety signals but NOT topic-lexicon terms —
    // this message would fail the topic gate on its own. The safety
    // scan runs first and must win.
    const res = await POST(
      post({ message: 'it hurts since yesterday', history: [], language: 'en', context: {} }),
    );
    const body = await res.json();
    expect(body.provider).toBe('safety');
    expect(body.safetyStop).toBe('pain');
    expect(routeState.providerCalls).toHaveLength(0);
  });
});

describe('E2E-R8 binding quota — route counter honesty', () => {
  it('reports min(chat remaining, shared remaining) on the success path', async () => {
    routeState.quotaRemaining = 4;
    const res = await POST(
      post({ message: 'how is my squat going?', history: [], language: 'en', context: {} }),
    );
    expect((await res.json()).dailyRemaining).toBe(4);
  });

  it('reports the binding number on the safety and topic-lock paths too', async () => {
    routeState.quotaRemaining = 4;
    const safety = await POST(
      post({
        message: 'my shoulder hurts when I press',
        history: [],
        language: 'en',
        context: {},
      }),
    );
    expect((await safety.json()).dailyRemaining).toBe(4);

    const topic = await POST(
      post({ message: 'who won the election?', history: [], language: 'en', context: {} }),
    );
    expect((await topic.json()).dailyRemaining).toBe(4);
  });
});

describe('E2E-R1 caution enforcement + citation integrity — route behavior', () => {
  it('prepends a caution to a caution-less near-max reply', async () => {
    routeState.providerReply = 'Jump straight to 95% of your 1RM today and test a new max single.';
    const res = await POST(
      post({ message: 'how should I test my strength?', history: [], language: 'en', context: {} }),
    );
    const body = await res.json();
    expect(body.cautionAdded).toBe('near-max');
    expect(body.reply.startsWith('Caution:')).toBe(true);
    expect(body.reply).toContain('95% of your 1RM');
  });

  it('prepends the Hindi caution for a Hindi conversation', async () => {
    routeState.providerReply = 'Work at RPE 10 for your top set today.';
    const res = await POST(
      post({ message: 'आज वर्कआउट में कितना भारी उठाऊं?', history: [], language: 'hi', context: {} }),
    );
    const body = await res.json();
    expect(body.cautionAdded).toBe('near-max');
    expect(body.reply.startsWith('सावधानी:')).toBe(true);
  });

  it('leaves a reply that already carries a caution line untouched', async () => {
    const careful = 'Work up to 95% of your 1RM for one set.\nCaution: only attempt this fully rested.';
    routeState.providerReply = careful;
    const res = await POST(
      post({ message: 'how should I test my strength?', history: [], language: 'en', context: {} }),
    );
    const body = await res.json();
    expect(body.reply).toBe(careful);
    expect(body.cautionAdded).toBeUndefined();
  });

  it('strips a model-written citation lead-in; the reply text carries no attribution', async () => {
    routeState.providerReply =
      'Based on your data: your squat volume rose this week.\nKeep the same plan.';
    const res = await POST(
      post({ message: 'how is my squat going?', history: [], language: 'en', context: {} }),
    );
    const body = await res.json();
    expect(body.reply).not.toContain('Based on your data');
    expect(body.reply).toContain('your squat volume rose this week.');
    expect(Array.isArray(body.evidence)).toBe(true);
  });
});

describe('E2E-R1 lib classifiers', () => {
  it('isCoachChatInScope: zero-signal messages are out, signal-bearing are in', () => {
    expect(isCoachChatInScope('what is the score in the cricket match?')).toBe(false);
    expect(isCoachChatInScope('who won the election yesterday?')).toBe(false);
    expect(isCoachChatInScope('')).toBe(false);
    expect(isCoachChatInScope('yes')).toBe(false);
    expect(isCoachChatInScope('how much protein should I eat?')).toBe(true);
    expect(isCoachChatInScope('मुझे नींद नहीं आ रही')).toBe(true);
    expect(isCoachChatInScope('I did 5x5 at 100kg')).toBe(true);
    expect(
      isCoachChatInScope('yes', [{ role: 'user', content: 'what should I train today?' }]),
    ).toBe(true);
  });

  it('findReplyRisk flags the three rule-8 categories and passes ordinary advice', () => {
    expect(findReplyRisk('Train at 95% of your 1RM this week.')).toBe('near-max');
    expect(findReplyRisk('Hold an 800 kcal deficit until you reach your goal.')).toBe(
      'large-deficit',
    );
    expect(findReplyRisk('Stick to 1400 kcal per day for now.')).toBe('large-deficit');
    expect(findReplyRisk('You can lose 1 kg a week on this plan.')).toBe('large-deficit');
    expect(findReplyRisk('Double your training volume next week.')).toBe('volume-jump');
    expect(findReplyRisk('Add 60% more volume over the block.')).toBe('volume-jump');
    expect(findReplyRisk('Add one easy session and eat at maintenance this week.')).toBeNull();
    expect(findReplyRisk('Keep protein high and sleep 8 hours.')).toBeNull();
  });

  it('ensureReplyCaution prepends only when the caution is missing', () => {
    const risky = 'Go for RPE 10 on the top set.';
    const added = ensureReplyCaution(risky, 'en');
    expect(added.risk).toBe('near-max');
    expect(added.reply).toBe(`${COACH_CHAT_CAUTION['near-max'].en}\n\n${risky}`);
    const present = ensureReplyCaution(`${risky}\nCaution: stop if form breaks down.`, 'en');
    expect(present.risk).toBeNull();
    expect(present.reply).toContain('RPE 10');
  });

  it('stripModelCitations removes solo attribution lines (EN + HI) and EN lead-ins only', () => {
    expect(stripModelCitations('As per your logs:\nVolume is up this week.')).toBe(
      'Volume is up this week.',
    );
    expect(stripModelCitations('आपके डेटा के अनुसार:\nप्रोटीन कम है, थोड़ा और लें।')).toBe(
      'प्रोटीन कम है, थोड़ा और लें।',
    );
    // Mid-text mentions of the user's data are ordinary sentences.
    expect(stripModelCitations('Your logs show steady progress this month.')).toBe(
      'Your logs show steady progress this month.',
    );
  });
});

// ── SEC-R5: deletion-nonce ledger fails closed ────────────────────────────
import { createDeletionToken, verifyDeletionToken } from '../src/lib/deletion-token';

type FakeResult = { data: unknown; error: unknown };
function fakeDb(result: FakeResult | 'throw') {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (result === 'throw') throw new Error('ledger unreachable');
            return result;
          },
        }),
      }),
    }),
  } as never;
}

describe('SEC-R5 verifyDeletionToken fails closed on ledger errors', () => {
  beforeAll(() => {
    process.env.SUPABASE_DELETION_SECRET = 'batch2-test-secret-0123456789abcdef0123456789';
  });

  it('rejects when the ledger read returns an error', async () => {
    const token = createDeletionToken('user-sec5', 'person@example.com');
    const res = await verifyDeletionToken(
      token,
      'person@example.com',
      fakeDb({ data: null, error: { message: 'db down' } }),
    );
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.error).toBe('REPLAY_CHECK_UNAVAILABLE');
  });

  it('rejects when the ledger read throws', async () => {
    const token = createDeletionToken('user-sec5', 'person@example.com');
    const res = await verifyDeletionToken(token, 'person@example.com', fakeDb('throw'));
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.error).toBe('REPLAY_CHECK_UNAVAILABLE');
  });

  it('still rejects a consumed token and accepts a fresh one when the ledger answers', async () => {
    const consumed = createDeletionToken('user-sec5', 'person@example.com');
    const used = await verifyDeletionToken(
      consumed,
      'person@example.com',
      fakeDb({ data: { jti: 'x', status: 'consumed' }, error: null }),
    );
    expect(used.valid).toBe(false);
    if (!used.valid) expect(used.error).toBe('TOKEN_ALREADY_USED');

    const fresh = createDeletionToken('user-sec5', 'person@example.com');
    const ok = await verifyDeletionToken(
      fresh,
      'person@example.com',
      fakeDb({ data: null, error: null }),
    );
    expect(ok.valid).toBe(true);
  });
});

// ── DI-R4: restore is single-path through the stamped import ─────────────
describe('DI-R4 Settings restore single-path', () => {
  it('SettingsView no longer calls the raw blob overwrite path', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/components/SettingsView.tsx'),
      'utf8',
    );
    expect(src).not.toContain('importFullBackupJSON');
    expect(src).toContain('restoreBackupSideData');
  });

  it('Onboarding keeps the direct-blob import (deliberately out of scope)', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/components/Onboarding.tsx'),
      'utf8',
    );
    expect(src).toContain('importFullBackupJSON');
  });
});

describe('DI-R4 restoreBackupSideData helper', () => {
  let memory: Map<string, string>;

  beforeEach(async () => {
    vi.resetModules();
    memory = new Map<string, string>();
    const stub = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, String(v));
      },
      removeItem: (k: string) => {
        memory.delete(k);
      },
      clear: () => memory.clear(),
      get length() {
        return memory.size;
      },
      key: (i: number) => Array.from(memory.keys())[i] ?? null,
    };
    vi.stubGlobal('window', {
      localStorage: stub,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal('localStorage', stub);
  });

  it('restores barcodes + photos to their own keys and never writes the store blob', async () => {
    const { restoreBackupSideData } = await import('../src/lib/storage');
    const payload: Record<string, unknown> = {
      customBarcodes: { '8901234': { name: 'Test Bar', calories: 100 } },
      progressPhotos: [
        { id: 'p1', dataUrl: 'data:image/png;base64,AAAA' },
        { id: 'bad', dataUrl: 'https://example.com/not-a-photo' },
      ],
    };
    restoreBackupSideData(payload);
    expect(JSON.parse(memory.get('ascend_custom_barcodes') ?? '{}')).toMatchObject({
      '8901234': { name: 'Test Bar' },
    });
    const photos = JSON.parse(memory.get('ascend_progress_photos_v1') ?? '[]');
    expect(photos).toHaveLength(1);
    expect(photos[0].id).toBe('p1');
    expect(memory.has('ascend_store')).toBe(false);
    // Mutates like the original inline code: photos never land in a blob.
    expect('progressPhotos' in payload).toBe(false);
  });
});

describe('DI-R4 restore preserves R1 stamps (newest-wins)', () => {
  let memory: Map<string, string>;
  let useStore: any;

  beforeEach(async () => {
    vi.resetModules();
    memory = new Map<string, string>();
    const stub = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, String(v));
      },
      removeItem: (k: string) => {
        memory.delete(k);
      },
      clear: () => memory.clear(),
      get length() {
        return memory.size;
      },
      key: (i: number) => Array.from(memory.keys())[i] ?? null,
    };
    vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
    vi.stubGlobal('document', { addEventListener: () => {}, removeEventListener: () => {} });
    vi.stubGlobal('localStorage', stub);
    ({ useStore } = await import('../src/lib/store'));
    useStore.getState().clearAllData();
  });

  it('an imported backup row carries the restore-time stamp in state AND in the persisted blob', () => {
    const before = Date.now();
    const ok = useStore.getState().importAllData({
      workouts: [
        {
          id: 'restored-1',
          date: '2026-10-21',
          name: 'Restored session',
          exercises: [],
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(ok).toBe(true);
    const row = useStore.getState().workouts.find((w: any) => w.id === 'restored-1');
    expect(row).toBeTruthy();
    const stamp = Date.parse(row.updatedAt);
    expect(stamp).toBeGreaterThan(before - 1000);
    expect(stamp).toBeLessThan(Date.now() + 60_000);

    // The persisted blob — what a reload (and the next sync push) reads —
    // carries the same fresh stamp, not the backup's 2020 stamp. This is
    // the invariant the old two-path Settings restore broke: Path B's
    // raw blob write overwrote exactly this value.
    const blob = JSON.parse(memory.get('ascend_store') ?? '{}');
    const blobRow = blob.state.workouts.find((w: any) => w.id === 'restored-1');
    expect(blobRow).toBeTruthy();
    expect(blobRow.updatedAt).toBe(row.updatedAt);
  });
});
