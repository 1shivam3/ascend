import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';

// ── In-memory Supabase mock ──────────────────────────────────────────────────
const db = vi.hoisted(() => ({
  subs: [] as any[],
  prefs: [] as any[],
  error: null as string | null,
  missingDeleteTokenColumn: false,
}));

vi.mock('@supabase/supabase-js', () => {
  const missingColumnError = () =>
    Object.assign(
      new Error(
        "Could not find the 'delete_token_hash' column of 'push_subscriptions' in the schema cache"
      ),
      { code: 'PGRST204' }
    );
  return {
  createClient: vi.fn(() => ({
    auth: {
      getUser: async (token: string) => ({
        data: {
          user:
            token === 'token-user-a'
              ? { id: 'user-a' }
              : token === 'token-user-b'
                ? { id: 'user-b' }
                : null,
        },
        error: null,
      }),
    },
    rpc: async () => ({ data: null, error: new Error('rpc unavailable in mock') }),
    from: (table: string) => {
      if (table === 'push_subscriptions') {
        return {
          select: (columns?: string) => ({
            eq: (_field: string, val: string) => ({
              maybeSingle: async () => {
                if (
                  db.missingDeleteTokenColumn &&
                  typeof columns === 'string' &&
                  columns.includes('delete_token_hash')
                ) {
                  return { data: null, error: missingColumnError() };
                }
                return {
                  data: db.subs.find((s) => s.endpoint === val) ?? null,
                  error: null,
                };
              },
            }),
          }),
          upsert: async (record: any) => {
            if (db.missingDeleteTokenColumn && 'delete_token_hash' in record) {
              return { error: missingColumnError() };
            }
            if (db.error) return { error: new Error(db.error) };
            const idx = db.subs.findIndex((s) => s.endpoint === record.endpoint);
            if (idx >= 0) db.subs[idx] = { ...db.subs[idx], ...record };
            else db.subs.push({ ...record });
            return { error: null };
          },
          delete: () => ({
            eq: async (_field: string, val: string) => {
              if (db.error) return { error: new Error(db.error) };
              db.subs = db.subs.filter((s) => s.endpoint !== val);
              return { error: null };
            },
          }),
        };
      }
      if (table === 'notification_preferences') {
        return {
          upsert: async (record: any) => {
            if (db.error) return { error: new Error(db.error) };
            const idx = db.prefs.findIndex((p) => p.user_id === record.user_id);
            if (idx >= 0) db.prefs[idx] = { ...record };
            else db.prefs.push({ ...record });
            return { error: null };
          },
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: new Error('not found') }),
            }),
          }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        upsert: async () => ({ error: null }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
    },
  })),
  };
});

import { POST as subscribePost, DELETE as subscribeDelete } from '../src/app/api/notifications/subscribe/route';
import { POST as prefsPost } from '../src/app/api/notifications/preferences/route';
import { POST as parseVoicePost } from '../src/app/api/ai/parse-voice/route';
import { POST as parseMealPost } from '../src/app/api/ai/parse-meal/route';
import {
  resetRateLimitStoreForTests,
  setRateLimiterSupabaseForTests,
} from '@/lib/rate-limit';
import {
  executeMultiProviderText,
  AiGlobalCapExceededError,
  getAiDailyGlobalCap,
  DEFAULT_AI_DAILY_GLOBAL_CAP,
} from '@/lib/ai-provider';
import { isValidPushEndpoint } from '@/lib/push-subscription-security';

const FCM_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/device-token-1';
let ipCounter = 0;
function req(url: string, init: RequestInit = {}): Request {
  ipCounter += 1;
  return new Request(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': `10.9.0.${ipCounter}`,
      ...(init.headers || {}),
    },
  });
}

function subscribeReq(endpoint: string, headers: Record<string, string> = {}): Request {
  return req('http://localhost:3000/api/notifications/subscribe', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      subscription: { endpoint, keys: { p256dh: 'p256-key', auth: 'auth-secret' } },
      userAgent: 'test-agent',
      timezone: 'UTC',
    }),
  });
}

beforeEach(() => {
  db.subs = [];
  db.prefs = [];
  db.error = null;
  db.missingDeleteTokenColumn = false;
  resetRateLimitStoreForTests();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
});

afterEach(() => {
  delete process.env.AI_DAILY_GLOBAL_CAP;
  resetRateLimitStoreForTests();
});

// ── QA4-009: endpoint validation ─────────────────────────────────────────────
describe('QA4-009 push endpoint validation', () => {
  it('accepts real web-push service endpoints only', () => {
    expect(isValidPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isValidPushEndpoint('https://wns2-db5p.notify.windows.com/?token=abc')).toBe(true);
    expect(isValidPushEndpoint('https://db5p.wns.windows.com/?token=abc')).toBe(true);
    expect(isValidPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isValidPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isValidPushEndpoint('not-a-url')).toBe(false);
    expect(isValidPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false); // https only
    expect(isValidPushEndpoint('https://fcm.googleapis.com.evil.com/abc')).toBe(false);
    expect(isValidPushEndpoint('https://evil.example.com/abc')).toBe(false);
    expect(isValidPushEndpoint('')).toBe(false);
    expect(isValidPushEndpoint(null)).toBe(false);
  });

  it('rejects a junk endpoint with 400 and stores nothing', async () => {
    const res = await subscribePost(subscribeReq('not-a-url'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_ENDPOINT');
    expect(db.subs).toHaveLength(0);
  });

  it('rejects an unknown https host with 400', async () => {
    const res = await subscribePost(subscribeReq('https://push.example.com/sub-1'));
    expect(res.status).toBe(400);
    expect(db.subs).toHaveLength(0);
  });
});

// ── QA4-009 / QA4A-003: subscribe ownership + delete proof ───────────────────
describe('QA4-009/QA4A-003 subscription ownership and DELETE proof', () => {
  it('issues a delete token at subscribe and stores only its hash', async () => {
    const res = await subscribePost(subscribeReq(FCM_ENDPOINT));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.deleteToken).toBe('string');
    expect(db.subs).toHaveLength(1);
    expect(db.subs[0].user_id).toBeNull();
    const expectedHash = createHash('sha256').update(body.deleteToken).digest('hex');
    expect(db.subs[0].delete_token_hash).toBe(expectedHash);
    expect(db.subs[0].delete_token_hash).not.toBe(body.deleteToken);
  });

  it('an anonymous re-register cannot null out a signed-in owner (QA4A-003)', async () => {
    // Signed-in user registers
    const res1 = await subscribePost(
      subscribeReq(FCM_ENDPOINT, { authorization: 'Bearer token-user-a' })
    );
    expect(res1.status).toBe(200);
    expect(db.subs[0].user_id).toBe('user-a');

    // Stranger re-POSTs the same endpoint anonymously
    const res2 = await subscribePost(subscribeReq(FCM_ENDPOINT));
    expect(res2.status).toBe(403);
    expect(db.subs[0].user_id).toBe('user-a');

    // A different signed-in user cannot claim it either
    const res3 = await subscribePost(
      subscribeReq(FCM_ENDPOINT, { authorization: 'Bearer token-user-b' })
    );
    expect(res3.status).toBe(403);
    expect(db.subs[0].user_id).toBe('user-a');
  });

  it('unauthenticated DELETE without a token returns 401 and keeps the row', async () => {
    await subscribePost(subscribeReq(FCM_ENDPOINT));
    const res = await subscribeDelete(
      req('http://localhost:3000/api/notifications/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: FCM_ENDPOINT }),
      })
    );
    expect(res.status).toBe(401);
    expect(db.subs).toHaveLength(1);
  });

  it('DELETE with a wrong token returns 401; with the issued token succeeds', async () => {
    const post = await subscribePost(subscribeReq(FCM_ENDPOINT));
    const { deleteToken } = await post.json();

    const wrong = await subscribeDelete(
      req('http://localhost:3000/api/notifications/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: FCM_ENDPOINT, deleteToken: 'wrong-token' }),
      })
    );
    expect(wrong.status).toBe(401);
    expect(db.subs).toHaveLength(1);

    const ok = await subscribeDelete(
      req('http://localhost:3000/api/notifications/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: FCM_ENDPOINT, deleteToken }),
      })
    );
    expect(ok.status).toBe(200);
    expect(db.subs).toHaveLength(0);
  });

  it('DELETE succeeds for the owning signed-in user without a token', async () => {
    await subscribePost(subscribeReq(FCM_ENDPOINT, { authorization: 'Bearer token-user-a' }));
    const res = await subscribeDelete(
      req('http://localhost:3000/api/notifications/subscribe', {
        method: 'DELETE',
        headers: { authorization: 'Bearer token-user-a' },
        body: JSON.stringify({ endpoint: FCM_ENDPOINT }),
      })
    );
    expect(res.status).toBe(200);
    expect(db.subs).toHaveLength(0);
  });

  it('DELETE is rate limited', async () => {
    const ip = '10.8.8.8';
    let lastStatus = 0;
    for (let i = 0; i < 31; i++) {
      const res = await subscribeDelete(
        new Request('http://localhost:3000/api/notifications/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'x-real-ip': ip },
          body: JSON.stringify({}),
        })
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

// ── Pre-migration: delete_token_hash column missing (opportunistic fallback) ─
describe('pre-migration push subscriptions (delete_token_hash column absent)', () => {
  beforeEach(() => {
    db.missingDeleteTokenColumn = true;
  });

  it('subscribe POST still succeeds and stores the subscription without the column', async () => {
    const res = await subscribePost(subscribeReq(FCM_ENDPOINT));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // No token can be issued: its hash has nowhere to be stored.
    expect(body.deleteToken).toBeUndefined();
    expect(db.subs).toHaveLength(1);
    expect(db.subs[0].endpoint).toBe(FCM_ENDPOINT);
    expect(db.subs[0].p256dh).toBe('p256-key');
    expect(db.subs[0].auth).toBe('auth-secret');
    expect('delete_token_hash' in db.subs[0]).toBe(false);
  });

  it('subscribe POST for a signed-in user still stores user_id pre-migration', async () => {
    const res = await subscribePost(
      subscribeReq(FCM_ENDPOINT, { authorization: 'Bearer token-user-a' })
    );
    expect(res.status).toBe(200);
    expect(db.subs).toHaveLength(1);
    expect(db.subs[0].user_id).toBe('user-a');
  });

  it('DELETE with owner session still succeeds (200) pre-migration', async () => {
    await subscribePost(subscribeReq(FCM_ENDPOINT, { authorization: 'Bearer token-user-a' }));
    expect(db.subs).toHaveLength(1);
    const res = await subscribeDelete(
      req('http://localhost:3000/api/notifications/subscribe', {
        method: 'DELETE',
        headers: { authorization: 'Bearer token-user-a' },
        body: JSON.stringify({ endpoint: FCM_ENDPOINT }),
      })
    );
    expect(res.status).toBe(200);
    expect(db.subs).toHaveLength(0);
  });

  it('DELETE anonymous still returns 401 pre-migration and keeps the row', async () => {
    await subscribePost(subscribeReq(FCM_ENDPOINT, { authorization: 'Bearer token-user-a' }));
    const res = await subscribeDelete(
      req('http://localhost:3000/api/notifications/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: FCM_ENDPOINT, deleteToken: 'any-token' }),
      })
    );
    expect(res.status).toBe(401);
    expect(db.subs).toHaveLength(1);
  });

  it('DELETE anonymous on a legacy guest row still returns 401 pre-migration', async () => {
    await subscribePost(subscribeReq(FCM_ENDPOINT));
    const res = await subscribeDelete(
      req('http://localhost:3000/api/notifications/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: FCM_ENDPOINT }),
      })
    );
    expect(res.status).toBe(401);
    expect(db.subs).toHaveLength(1);
  });
});

// ── QA4-036: preferences POST honesty ────────────────────────────────────────
describe('QA4-036 notification preferences POST', () => {
  it('unauthenticated POST returns 401 and persists nothing (no fake success)', async () => {
    const res = await prefsPost(
      req('http://localhost:3000/api/notifications/preferences', {
        method: 'POST',
        body: JSON.stringify({ enabled: true }),
      })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('UNAUTHORIZED');
    expect(body.success).toBeUndefined();
    expect(db.prefs).toHaveLength(0);
  });

  it('authenticated POST persists and returns success', async () => {
    const res = await prefsPost(
      req('http://localhost:3000/api/notifications/preferences', {
        method: 'POST',
        headers: { authorization: 'Bearer token-user-a' },
        body: JSON.stringify({ enabled: true }),
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(db.prefs).toHaveLength(1);
    expect(db.prefs[0].user_id).toBe('user-a');
  });
});

// ── QA4-002: AI routes fail closed on limiter outage ─────────────────────────
describe('QA4-002 AI routes fail closed when the limiter backend is down', () => {
  it('parse-voice returns 503 instead of degrading to in-memory counting', async () => {
    setRateLimiterSupabaseForTests({
      rpc: async () => ({ data: null, error: { message: 'limiter backend down' } }),
    });
    const res = await parseVoicePost(
      req('http://localhost:3000/api/ai/parse-voice', {
        method: 'POST',
        body: JSON.stringify({ transcript: 'bench 80 for 5' }),
      })
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('SERVICE_UNAVAILABLE');
  });

  it('parse-meal returns 503 on limiter outage', async () => {
    setRateLimiterSupabaseForTests({
      rpc: async () => ({ data: null, error: { message: 'limiter backend down' } }),
    });
    const res = await parseMealPost(
      req('http://localhost:3000/api/ai/parse-meal', {
        method: 'POST',
        body: JSON.stringify({ query: '2 roti and dal' }),
      })
    );
    expect(res.status).toBe(503);
  });
});

// ── QA4-002: global daily circuit breaker ────────────────────────────────────
describe('QA4-002 AI global daily circuit breaker', () => {
  const savedKeys = {
    groq: process.env.GROQ_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    google: process.env.GOOGLE_API_KEY,
  };

  beforeEach(() => {
    // No provider keys: executions fail fast with "all providers failed",
    // which still proves the breaker counted them.
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  afterEach(() => {
    if (savedKeys.groq) process.env.GROQ_API_KEY = savedKeys.groq;
    if (savedKeys.openrouter) process.env.OPENROUTER_API_KEY = savedKeys.openrouter;
    if (savedKeys.gemini) process.env.GEMINI_API_KEY = savedKeys.gemini;
    if (savedKeys.google) process.env.GOOGLE_API_KEY = savedKeys.google;
  });

  it('has a generous default cap', () => {
    delete process.env.AI_DAILY_GLOBAL_CAP;
    expect(getAiDailyGlobalCap()).toBe(DEFAULT_AI_DAILY_GLOBAL_CAP);
    expect(DEFAULT_AI_DAILY_GLOBAL_CAP).toBeGreaterThanOrEqual(1000);
  });

  it('trips at the configured cap and fails with a clear error', async () => {
    process.env.AI_DAILY_GLOBAL_CAP = '3';
    resetRateLimitStoreForTests();

    for (let i = 0; i < 3; i++) {
      await expect(
        executeMultiProviderText({ prompt: 'hello' })
      ).rejects.not.toBeInstanceOf(AiGlobalCapExceededError);
    }

    await expect(executeMultiProviderText({ prompt: 'hello' })).rejects.toBeInstanceOf(
      AiGlobalCapExceededError
    );
    await expect(executeMultiProviderText({ prompt: 'hello' })).rejects.toThrow(
      /daily limit reached/
    );
  });
});

// ── QA4-033: request-size caps ───────────────────────────────────────────────
describe('QA4-033 AI route body size caps', () => {
  it('parse-meal rejects an oversized body with 413', async () => {
    // Healthy limiter so the request reaches the body-size check.
    setRateLimiterSupabaseForTests({
      rpc: async () => ({ data: [{ allowed: true, count: 1, reset_ms: 60000 }], error: null }),
    });
    const res = await parseMealPost(
      req('http://localhost:3000/api/ai/parse-meal', {
        method: 'POST',
        body: JSON.stringify({ query: 'x'.repeat(6000) }),
      })
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('PAYLOAD_TOO_LARGE');
  });
});
