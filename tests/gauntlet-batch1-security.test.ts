/**
 * Gauntlet batch-1 security fixes: regression tests for the pure
 * helpers behind SEC-05, SEC-24, R7, SEC-07, SEC-11, R5/SEC-13,
 * SEC-14, SEC-19, SEC-06, SEC-09, SEC-10.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkRateLimit,
  resetRateLimitStoreForTests,
  setRateLimiterSupabaseForTests,
  pruneRateLimitStoreForTests,
} from '../src/lib/rate-limit';
import { resolveAiActor, AiActorAuthError } from '../src/lib/ai-quota';
import {
  findUserByEmail,
  DELETION_LOOKUP_MAX_PAGES,
} from '../src/lib/auth-admin-lookup';
import {
  readBytesBodyWithLimit,
  readJsonBodyWithLimit,
  readMultipartFormDataWithLimit,
  RequestBodyTooLargeError,
} from '../src/lib/server-security';
import {
  sanitizeFeedbackSubmission,
  sanitizeDiagnostics,
} from '../src/lib/feedback-sanitize';
import {
  sanitizeScannedItems,
  recomputeMealTotals,
} from '../src/lib/scan-meal-sanitize';
import { createDeletionToken, verifyDeletionToken } from '../src/lib/deletion-token';
import { parseDeletionUrl } from '../src/lib/deletion-url';
import {
  claimNotificationDelivery,
  fetchAllSubscriptions,
} from '../src/lib/notification-dispatch';

const ENV = process.env as Record<string, string | undefined>;

function reqWithIp(ip: string): Request {
  return new Request('https://ascend.app/api/test', {
    headers: { 'x-forwarded-for': ip },
  });
}

describe('SEC-05 + SEC-24: anchored fixed-window in-memory limiter', () => {
  let nowSpy: any;
  let now = 1_000_000;

  beforeEach(() => {
    resetRateLimitStoreForTests();
    setRateLimiterSupabaseForTests(null);
    now = 1_000_000;
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    nowSpy.mockRestore();
    resetRateLimitStoreForTests();
  });

  it('resets the count when the window rolls over (fixed, not sliding)', async () => {
    const opts = { windowMs: 1000, maxRequests: 2, keyPrefix: 'fixed-win' };
    expect((await checkRateLimit(reqWithIp('203.0.113.1'), opts)).success).toBe(true);
    expect((await checkRateLimit(reqWithIp('203.0.113.1'), opts)).success).toBe(true);
    expect((await checkRateLimit(reqWithIp('203.0.113.1'), opts)).success).toBe(false);
    now = 1_001_000; // exactly the next window
    expect((await checkRateLimit(reqWithIp('203.0.113.1'), opts)).success).toBe(true);
    expect((await checkRateLimit(reqWithIp('203.0.113.1'), opts)).success).toBe(true);
    expect((await checkRateLimit(reqWithIp('203.0.113.1'), opts)).success).toBe(false);
  });

  it('cleanup respects long windows (24h record survives a 30-min prune)', async () => {
    const opts = { windowMs: 24 * 60 * 60 * 1000, maxRequests: 1, keyPrefix: 'long-win' };
    expect((await checkRateLimit(reqWithIp('203.0.113.2'), opts)).success).toBe(true);
    expect((await checkRateLimit(reqWithIp('203.0.113.2'), opts)).success).toBe(false);
    pruneRateLimitStoreForTests(now + 30 * 60 * 1000);
    // Still blocked: the 10-minute hardcoded truncation is gone.
    expect((await checkRateLimit(reqWithIp('203.0.113.2'), opts)).success).toBe(false);
    pruneRateLimitStoreForTests(now + 24 * 60 * 60 * 1000 + 1);
    expect((await checkRateLimit(reqWithIp('203.0.113.2'), opts)).success).toBe(true);
  });

  it('short windows still expire on prune', async () => {
    const opts = { windowMs: 10 * 60 * 1000, maxRequests: 1, keyPrefix: 'short-win' };
    expect((await checkRateLimit(reqWithIp('203.0.113.3'), opts)).success).toBe(true);
    pruneRateLimitStoreForTests(now + 11 * 60 * 1000);
    expect((await checkRateLimit(reqWithIp('203.0.113.3'), opts)).success).toBe(true);
  });
});

describe('R7: present-but-bad AI token fails closed', () => {
  const ip = '203.0.113.10';
  const reqWithToken = (token: string | null) =>
    new Request('https://ascend.app/api/ai/coach', {
      headers: token
        ? { 'x-forwarded-for': ip, authorization: `Bearer ${token}` }
        : { 'x-forwarded-for': ip },
    });

  it('missing token means guest', async () => {
    const actor = await resolveAiActor(reqWithToken(null));
    expect(actor.kind).toBe('guest');
  });

  it('empty Bearer means guest', async () => {
    const actor = await resolveAiActor(reqWithToken(''));
    expect(actor.kind).toBe('guest');
  });

  it('valid token means user', async () => {
    const fake = { auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } };
    const actor = await resolveAiActor(reqWithToken('good-token'), fake as any);
    expect(actor).toEqual({ kind: 'user', userId: 'user-1' });
  });

  it('invalid token throws instead of downgrading to guest', async () => {
    const fake = { auth: { getUser: async () => ({ data: { user: null } }) } };
    await expect(resolveAiActor(reqWithToken('bad-token'), fake as any)).rejects.toBeInstanceOf(
      AiActorAuthError,
    );
  });

  it('verification error throws instead of downgrading to guest', async () => {
    const fake = {
      auth: {
        getUser: async () => {
          throw new Error('network down');
        },
      },
    };
    await expect(resolveAiActor(reqWithToken('any-token'), fake as any)).rejects.toBeInstanceOf(
      AiActorAuthError,
    );
  });
});

describe('SEC-07: capped admin lookup', () => {
  function fakeAdmin(totalUsers: number, matchAt: number | null, partialRow: any = null) {
    const users = Array.from({ length: totalUsers }, (_, i) => ({
      id: `user-${i + 1}`,
      email: matchAt === i + 1 ? 'target@example.com' : `user${i + 1}@example.com`,
    }));
    let calls = 0;
    return {
      calls: () => calls,
      client: {
        auth: {
          admin: {
            listUsers: async ({ page, perPage }: { page: number; perPage: number }) => {
              calls += 1;
              return { data: { users: users.slice((page - 1) * perPage, page * perPage) } };
            },
          },
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: partialRow }),
              }),
            }),
          }),
        }),
      },
    };
  }

  it('unmatched email issues at most MAX_PAGES admin calls', async () => {
    const fake = fakeAdmin(5000, null);
    const found = await findUserByEmail(fake.client as any, 'nobody@example.com');
    expect(found).toBeNull();
    expect(fake.calls()).toBe(DELETION_LOOKUP_MAX_PAGES);
    expect(DELETION_LOOKUP_MAX_PAGES).toBeLessThan(100);
  });

  it('matched email stops early and matches case-insensitively', async () => {
    const fake = fakeAdmin(500, 175);
    const found = await findUserByEmail(fake.client as any, 'TARGET@EXAMPLE.COM');
    expect(found).toEqual({ id: 'user-175', email: 'target@example.com' });
    expect(fake.calls()).toBe(2);
  });

  it('short page stops the scan', async () => {
    const fake = fakeAdmin(50, null);
    const found = await findUserByEmail(fake.client as any, 'nobody@example.com');
    expect(found).toBeNull();
    expect(fake.calls()).toBe(1);
  });

  it('falls back to the partial-recovery ledger', async () => {
    const fake = fakeAdmin(10, null, { user_id: 'user-9', email: 'partial@example.com' });
    const found = await findUserByEmail(fake.client as any, 'partial@example.com');
    expect(found).toEqual({ id: 'user-9', email: 'partial@example.com' });
  });
});

describe('SEC-11: streaming body caps', () => {
  function streamReq(totalBytes: number, chunkBytes: number): { req: Request; pulls: () => number } {
    let sent = 0;
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (sent >= totalBytes) {
          controller.close();
          return;
        }
        const n = Math.min(chunkBytes, totalBytes - sent);
        sent += n;
        controller.enqueue(new Uint8Array(n).fill(120)); // 'x'
      },
    });
    const req = new Request('https://ascend.app/api/test', {
      method: 'POST',
      body: stream as any,
      duplex: 'half',
    } as any);
    return { req, pulls: () => pulls };
  }

  it('aborts an over-cap chunked body early without consuming it all', async () => {
    const { req, pulls } = streamReq(100 * 1024, 1024);
    await expect(readBytesBodyWithLimit(req, 32 * 1024)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
    expect(pulls()).toBeLessThanOrEqual(40); // 33 chunks to exceed 32KB; far below 100
  });

  it('reads an under-cap body fully and parses JSON', async () => {
    const body = JSON.stringify({ hello: 'world' });
    const req = new Request('https://ascend.app/api/test', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    });
    await expect(readJsonBodyWithLimit(req, 64 * 1024)).resolves.toEqual({ hello: 'world' });
  });

  it('parses an under-cap multipart body and rejects an over-cap one', async () => {
    const boundary = '----testboundary';
    const smallPart =
      `--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\nhello\r\n--${boundary}--\r\n`;
    const smallReq = new Request('https://ascend.app/api/test', {
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body: smallPart,
    });
    const form = await readMultipartFormDataWithLimit(smallReq, 64 * 1024);
    expect(form.get('note')).toBe('hello');

    const bigPart =
      `--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\n${'x'.repeat(100 * 1024)}\r\n--${boundary}--\r\n`;
    const bigReq = new Request('https://ascend.app/api/test', {
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body: bigPart,
    });
    await expect(readMultipartFormDataWithLimit(bigReq, 64 * 1024)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it('falls back gracefully for a bodyless request', async () => {
    const req = new Request('https://ascend.app/api/test');
    await expect(readBytesBodyWithLimit(req, 1024)).resolves.toEqual(new Uint8Array(0));
  });
});

describe('R5 / SEC-13: feedback sanitization', () => {
  it('guest submissions are anonymous with allowlisted diagnostics only', () => {
    const out = sanitizeFeedbackSubmission(
      {
        category: 'bug',
        title: 'Crash',
        message: 'App crashes on save',
        userEmail: 'someone-else@example.com',
        userName: 'Mallory',
        diagnostics: {
          os: 'Android',
          browser: 'Chrome',
          evil: 'pasted PII: 555-1234',
          nested: { deep: 'data' },
        },
      },
      null,
    );
    expect(out).not.toBeNull();
    expect(out!.userEmail).toBeNull();
    expect(out!.userName).toBeNull();
    expect(out!.diagnostics).toEqual({ os: 'Android', browser: 'Chrome' });
  });

  it('signed-in submissions force the session email and drop client email', () => {
    const out = sanitizeFeedbackSubmission(
      {
        category: 'feature',
        message: 'Please add dark mode toggle',
        userEmail: 'victim@example.com',
        userName: 'Client Name',
      },
      { email: 'real-user@example.com', name: 'Real User' },
    );
    expect(out!.userEmail).toBe('real-user@example.com');
    expect(out!.userName).toBe('Real User');
  });

  it('signed-in without metadata name falls back to the client profile name', () => {
    const out = sanitizeFeedbackSubmission(
      { message: 'Feedback here', userName: 'Profile Name' },
      { email: 'real-user@example.com', name: null },
    );
    expect(out!.userName).toBe('Profile Name');
  });

  it('rejects short messages and clamps fields', () => {
    expect(sanitizeFeedbackSubmission({ message: 'hi' }, null)).toBeNull();
    const out = sanitizeFeedbackSubmission(
      { message: 'x'.repeat(4000), title: 't'.repeat(300), category: 'nope', rating: 9 },
      null,
    );
    expect(out!.message.length).toBe(3000);
    expect(out!.title.length).toBe(200);
    expect(out!.category).toBe('general');
    expect(out!.rating).toBeUndefined();
  });

  it('diagnostics with no object shape become empty', () => {
    expect(sanitizeDiagnostics('junk')).toEqual({});
    expect(sanitizeDiagnostics(null)).toEqual({});
  });
});

describe('SEC-14: scan-meal totals recomputed, items clamped', () => {
  it('ignores model totals: items summing to 500 win over totalCalories 9000', () => {
    const items = sanitizeScannedItems([
      { name: 'Rice', calories: 300, proteinG: 6, carbsG: 65, fatG: 1 },
      { name: 'Dal', calories: 200, proteinG: 12, carbsG: 30, fatG: 2 },
    ]);
    // recompute takes ONLY items — there is no model-total input to trust.
    expect(recomputeMealTotals(items)).toEqual({
      totalCalories: 500,
      totalProtein: 18,
      totalCarbs: 95,
      totalFat: 3,
    });
  });

  it('clamps absurd per-item values', () => {
    const [item] = sanitizeScannedItems([
      { name: 'Bomb', calories: 1e9, proteinG: -5, carbsG: 1e6, fatG: NaN, estimatedGrams: 1e9 },
    ]);
    expect(item.calories).toBe(5000);
    expect(item.proteinG).toBe(0);
    expect(item.carbsG).toBe(1000);
    expect(item.fatG).toBe(0);
    expect(item.estimatedGrams).toBe(10000);
  });

  it('non-array items become empty', () => {
    expect(sanitizeScannedItems(undefined)).toEqual([]);
    expect(recomputeMealTotals([])).toEqual({
      totalCalories: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
    });
  });
});

describe('SEC-19: deletion tokens need the dedicated secret', () => {
  const OLD = {
    del: ENV.SUPABASE_DELETION_SECRET,
    svc: ENV.SUPABASE_SERVICE_ROLE_KEY,
    cron: ENV.CRON_SECRET,
    app: ENV.APP_SECRET,
  };

  beforeEach(() => {
    ENV.SUPABASE_DELETION_SECRET = 'test-dedicated-secret-123456';
    delete ENV.SUPABASE_SERVICE_ROLE_KEY;
    delete ENV.CRON_SECRET;
    delete ENV.APP_SECRET;
  });

  afterEach(() => {
    if (OLD.del === undefined) delete ENV.SUPABASE_DELETION_SECRET;
    else ENV.SUPABASE_DELETION_SECRET = OLD.del;
    if (OLD.svc === undefined) delete ENV.SUPABASE_SERVICE_ROLE_KEY;
    else ENV.SUPABASE_SERVICE_ROLE_KEY = OLD.svc;
    if (OLD.cron === undefined) delete ENV.CRON_SECRET;
    else ENV.CRON_SECRET = OLD.cron;
    if (OLD.app === undefined) delete ENV.APP_SECRET;
    else ENV.APP_SECRET = OLD.app;
  });

  it('creates and verifies with the dedicated secret', async () => {
    const token = createDeletionToken('user-1', 'a@example.com', 15 * 60 * 1000);
    const res = await verifyDeletionToken(token, 'a@example.com', null);
    expect(res.valid).toBe(true);
  });

  it('throws when no dedicated secret is configured (no fallback)', () => {
    delete ENV.SUPABASE_DELETION_SECRET;
    expect(() => createDeletionToken('user-1', 'a@example.com')).toThrow(
      /SUPABASE_DELETION_SECRET/,
    );
  });
});

describe('SEC-06: fragment-only deletion URLs', () => {
  it('reads token + email from the fragment', () => {
    expect(
      parseDeletionUrl('https://ascend.app/delete-account#token=abc123&email=a%40example.com'),
    ).toEqual({ token: 'abc123', email: 'a@example.com' });
  });

  it('ignores query-string tokens entirely', () => {
    expect(
      parseDeletionUrl('https://ascend.app/delete-account?token=leaked&email=q@example.com'),
    ).toEqual({ token: null, email: null });
  });

  it('fragment wins and query is ignored when both are present', () => {
    expect(
      parseDeletionUrl('https://ascend.app/delete-account?token=leaked#token=frag123'),
    ).toEqual({ token: 'frag123', email: null });
  });

  it('no fragment means no token', () => {
    expect(parseDeletionUrl('https://ascend.app/delete-account')).toEqual({
      token: null,
      email: null,
    });
  });
});

describe('SEC-09: subscription pagination', () => {
  function fakeSubClient(total: number) {
    const rows = Array.from({ length: total }, (_, i) => ({
      endpoint: `https://example.com/push/${String(i).padStart(4, '0')}`,
      p256dh: 'k',
      auth: 'a',
      user_id: 'u1',
      timezone: 'UTC',
    }));
    return {
      from: () => ({
        select: () => ({
          order: () => ({
            range: async (from: number, to: number) => ({
              data: rows.slice(from, to + 1),
              error: null,
            }),
          }),
        }),
      }),
    };
  }

  it('pages past the old 500 cap', async () => {
    const { subscriptions, truncated } = await fetchAllSubscriptions(fakeSubClient(1200) as any, {
      pageSize: 500,
    });
    expect(subscriptions.length).toBe(1200);
    expect(truncated).toBe(false);
  });

  it('reports truncation at the safety cap instead of dropping silently', async () => {
    const { subscriptions, truncated } = await fetchAllSubscriptions(fakeSubClient(1200) as any, {
      pageSize: 500,
      maxTotal: 1000,
    });
    expect(subscriptions.length).toBe(1000);
    expect(truncated).toBe(true);
  });
});

describe('SEC-10: guarded delivery claim', () => {
  function fakeClaimClient(opts: {
    rpc?: any;
    existing?: any;
    updateRows?: any[] | null;
    updateError?: any;
    insertError?: any;
  }) {
    const calls: { updateFilters: Array<[string, unknown]> } = { updateFilters: [] };
    return {
      calls,
      client: {
        rpc: async () => opts.rpc ?? { data: null, error: new Error('no rpc') },
        from: (table: string) => {
          if (table === 'notification_deliveries') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: opts.existing ?? null }),
                }),
              }),
              update: (fields: any) => ({
                eq: (col: string, val: unknown) => ({
                  eq: (col2: string, val2: unknown) => ({
                    eq: (col3: string, val3: unknown) => ({
                      select: async () => {
                        calls.updateFilters.push([col, val], [col2, val2], [col3, val3]);
                        return { data: opts.updateRows ?? null, error: opts.updateError ?? null };
                      },
                    }),
                  }),
                }),
              }),
              insert: async () => ({ error: opts.insertError ?? null }),
            };
          }
          return {};
        },
      },
    };
  }

  const params = {
    idempotencyKey: 'key-1',
    endpoint: 'https://example.com/push/1',
    userId: 'u1',
    notificationType: 'water',
  };

  it('RPC true wins without touching the fallback', async () => {
    const fake = fakeClaimClient({ rpc: { data: true, error: null } });
    await expect(claimNotificationDelivery(fake.client as any, params)).resolves.toBe(true);
  });

  it('sent rows are never re-claimed', async () => {
    const fake = fakeClaimClient({ existing: { status: 'sent', updated_at: '2026-01-01T00:00:00Z', attempt_count: 1 } });
    await expect(claimNotificationDelivery(fake.client as any, params)).resolves.toBe(false);
  });

  it('failed rows re-claim only when the guarded update affects a row', async () => {
    const existing = { status: 'failed', updated_at: '2026-01-01T00:00:00Z', attempt_count: 2 };
    const ok = fakeClaimClient({ existing, updateRows: [{ idempotency_key: 'key-1' }] });
    await expect(claimNotificationDelivery(ok.client as any, params)).resolves.toBe(true);
    // Guards: same key, same status, same updated_at.
    expect(ok.calls.updateFilters).toEqual([
      ['idempotency_key', 'key-1'],
      ['status', 'failed'],
      ['updated_at', '2026-01-01T00:00:00Z'],
    ]);

    const lost = fakeClaimClient({ existing, updateRows: [] });
    await expect(claimNotificationDelivery(lost.client as any, params)).resolves.toBe(false);
  });

  it('insert failure (duplicate key) does not claim', async () => {
    const fake = fakeClaimClient({ existing: null, insertError: { code: '23505' } });
    await expect(claimNotificationDelivery(fake.client as any, params)).resolves.toBe(false);
  });
});
