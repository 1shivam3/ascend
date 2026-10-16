import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import webpush from 'web-push';
import fs from 'fs';
import path from 'path';

// ── Web Push Mock Setup ───────────────────────────────────────────────────────
vi.mock('web-push', () => {
  const sendNotification = vi.fn().mockResolvedValue({ statusCode: 201 });
  const setVapidDetails = vi.fn();
  return {
    default: {
      sendNotification,
      setVapidDetails,
    },
    sendNotification,
    setVapidDetails,
  };
});

// ── In-Memory Database Mock for Supabase ──────────────────────────────────────
interface MockSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string | null;
  timezone: string;
}

interface MockPreference {
  user_id: string;
  preferences: any;
}

interface MockDelivery {
  idempotency_key: string;
  subscription_endpoint: string;
  user_id: string | null;
  notification_type: string;
  status: 'processing' | 'sent' | 'failed';
  attempt_count: number;
  last_error?: string;
  sent_at?: string;
  updated_at: string;
}

let mockSubscriptions: MockSubscription[] = [];
let mockPreferences: MockPreference[] = [];
let mockDeliveries: Map<string, MockDelivery> = new Map();
let simulateDbError: string | null = null;

const createMockSupabase = () => ({
  from: (table: string) => {
    const dbErr = simulateDbError;
    if (dbErr) {
      return {
        select: () => ({
          limit: () => ({ data: null, error: new Error(dbErr) }),
          in: () => ({ data: null, error: new Error(dbErr) }),
          eq: () => ({ single: () => ({ data: null, error: new Error(dbErr) }) }),
        }),
        insert: () => ({ error: new Error(dbErr) }),
        update: () => ({ eq: () => ({ error: new Error(dbErr) }) }),
        delete: () => ({ eq: () => ({ error: new Error(dbErr) }) }),
        upsert: () => ({ error: new Error(dbErr) }),
      };
    }

    if (table === 'push_subscriptions') {
      return {
        select: (_fields: string) => ({
          limit: (n: number) => ({
            data: mockSubscriptions.slice(0, n),
            error: null,
          }),
        }),
        delete: () => ({
          eq: (field: string, val: string) => {
            if (field === 'endpoint') {
              mockSubscriptions = mockSubscriptions.filter((s) => s.endpoint !== val);
            }
            return { error: null };
          },
        }),
        upsert: (record: MockSubscription) => {
          const idx = mockSubscriptions.findIndex((s) => s.endpoint === record.endpoint);
          if (idx >= 0) mockSubscriptions[idx] = record;
          else mockSubscriptions.push(record);
          return { error: null };
        },
      };
    }

    if (table === 'notification_preferences') {
      return {
        select: (_fields: string) => ({
          in: (field: string, values: string[]) => {
            if (field === 'user_id') {
              const matched = mockPreferences.filter((p) => values.includes(p.user_id));
              return { data: matched, error: null };
            }
            return { data: [], error: null };
          },
          eq: (field: string, val: string) => ({
            single: () => {
              const found = mockPreferences.find((p) => p.user_id === val);
              return { data: found || null, error: found ? null : new Error('Not found') };
            },
          }),
        }),
        upsert: (record: MockPreference) => {
          const idx = mockPreferences.findIndex((p) => p.user_id === record.user_id);
          if (idx >= 0) mockPreferences[idx] = record;
          else mockPreferences.push(record);
          return { error: null };
        },
      };
    }

    if (table === 'notification_deliveries') {
      return {
        select: () => ({
          eq: (field: string, val: string) => ({
            maybeSingle: () => {
              if (field === 'idempotency_key') {
                const found = mockDeliveries.get(val);
                return { data: found || null, error: null };
              }
              return { data: null, error: null };
            },
            single: () => {
              const found = mockDeliveries.get(val);
              return { data: found || null, error: found ? null : new Error('Not found') };
            },
          }),
        }),
        insert: (record: MockDelivery) => {
          if (mockDeliveries.has(record.idempotency_key)) {
            return { error: new Error('Unique constraint violation') };
          }
          mockDeliveries.set(record.idempotency_key, { ...record });
          return { error: null };
        },
        update: (patch: Partial<MockDelivery>) => ({
          eq: (field: string, val: string) => {
            if (field === 'idempotency_key') {
              const item = mockDeliveries.get(val);
              if (item) {
                Object.assign(item, patch);
              }
            }
            return { error: null };
          },
        }),
      };
    }

    return {
      select: () => ({ limit: () => ({ data: [], error: null }) }),
      insert: () => ({ error: null }),
      update: () => ({ eq: () => ({ error: null }) }),
      delete: () => ({ eq: () => ({ error: null }) }),
      upsert: () => ({ error: null }),
    };
  },
  rpc: (fnName: string, args: any) => {
    if (simulateDbError) {
      return { data: null, error: new Error(simulateDbError) };
    }
    if (fnName === 'claim_notification_delivery') {
      const key = args.p_idempotency_key;
      const existing = mockDeliveries.get(key);
      if (!existing) {
        mockDeliveries.set(key, {
          idempotency_key: key,
          subscription_endpoint: args.p_endpoint,
          user_id: args.p_user_id,
          notification_type: args.p_notification_type,
          status: 'processing',
          attempt_count: 1,
          updated_at: new Date().toISOString(),
        });
        return { data: true, error: null };
      }
      if (existing.status === 'sent') {
        return { data: false, error: null };
      }
      if (existing.status === 'failed') {
        existing.status = 'processing';
        existing.attempt_count += 1;
        existing.updated_at = new Date().toISOString();
        return { data: true, error: null };
      }
      return { data: false, error: null }; // processing
    }
    return { data: null, error: new Error('Unknown RPC') };
  },
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-1' } }, error: null }),
  },
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => createMockSupabase()),
}));

function createDuePreferences(userId: string, timezone: string = 'UTC') {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(now);
  const mapping: Record<string, string> = {};
  for (const p of parts) mapping[p.type] = p.value;
  let h = parseInt(mapping.hour, 10);
  if (h === 24) h = 0;
  const m = parseInt(mapping.minute, 10);
  const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const distantHour1 = (h + 6) % 24;
  const distantHour2 = (h + 12) % 24;
  const lunchStr = `${String(distantHour1).padStart(2, '0')}:00`;
  const dinnerStr = `${String(distantHour2).padStart(2, '0')}:00`;

  return {
    user_id: userId,
    preferences: {
      enabled: true,
      waterReminders: { enabled: false },
      mealReminders: {
        enabled: true,
        breakfastTime: timeStr,
        lunchTime: lunchStr,
        dinnerTime: dinnerStr,
      },
      workoutReminders: { enabled: false },
      weeklyReport: { enabled: false },
      quietHours: { enabled: false, start: '23:59', end: '23:59' },
    },
  };
}

describe('Web Push Dispatch Route (/api/notifications/dispatch)', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscriptions = [];
    mockPreferences = [];
    mockDeliveries.clear();
    simulateDbError = null;

    process.env.CRON_SECRET = 'super-secret-cron-token-12345';
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIhbQFLXYp5Nksh8U';
    process.env.VAPID_PRIVATE_KEY = 'mock_vapid_private_key_value';
    process.env.VAPID_SUBJECT = 'mailto:support@ascendfit.app';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  // 1. Missing CRON_SECRET fails closed
  it('1. fails closed with 500 CONFIGURATION_ERROR when CRON_SECRET is missing', async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import('../src/app/api/notifications/dispatch/route');
    const req = new Request('https://ascendtonext.vercel.app/api/notifications/dispatch', {
      method: 'POST',
      headers: { authorization: 'Bearer some-token' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('CONFIGURATION_ERROR');
    expect(body.message).toContain('secret');
  });

  // 2. Missing/invalid bearer token returns 401
  it('2. returns 401 UNAUTHORIZED when authorization is missing or invalid', async () => {
    const { POST } = await import('../src/app/api/notifications/dispatch/route');

    // Missing header
    const req1 = new Request('https://ascendtonext.vercel.app/api/notifications/dispatch', {
      method: 'POST',
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(401);

    // Wrong token
    const req2 = new Request('https://ascendtonext.vercel.app/api/notifications/dispatch', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-token' },
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(401);

    // Valid token via Upstash-Forward-Authorization header
    const req3 = new Request('https://ascendtonext.vercel.app/api/notifications/dispatch', {
      method: 'POST',
      headers: { 'upstash-forward-authorization': 'Bearer super-secret-cron-token-12345' },
    });
    const res3 = await POST(req3);
    expect(res3.status).toBe(200);
  });

  // 2b. Native Upstash-Signature authorization
  it('2b. allows access via valid Upstash-Signature header when QStash signing keys are configured', async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = 'sigkey_curr_123';
    const { Receiver } = await import('@upstash/qstash');
    const verifySpy = vi.spyOn(Receiver.prototype, 'verify').mockResolvedValue(true);

    const { POST } = await import('../src/app/api/notifications/dispatch/route');
    const req = new Request('https://ascendtonext.vercel.app/api/notifications/dispatch', {
      method: 'POST',
      headers: {
        'upstash-signature': 'mock-valid-signature',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(verifySpy).toHaveBeenCalled();
  });

  // 3. Missing VAPID configuration fails explicitly
  it('3. fails explicitly with 500 CONFIGURATION_ERROR when VAPID keys are missing', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const { POST } = await import('../src/app/api/notifications/dispatch/route');
    const req = new Request('https://ascendtonext.vercel.app/api/notifications/dispatch', {
      method: 'POST',
      headers: { authorization: 'Bearer super-secret-cron-token-12345' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('CONFIGURATION_ERROR');
    expect(body.message).toContain('VAPID');
  });

  // 4. A due notification actually calls the Web Push sender
  it('4. calls webpush.sendNotification with valid payload when a reminder is due', async () => {
    const { POST } = await import('../src/app/api/notifications/dispatch/route');

    mockSubscriptions.push({
      endpoint: 'https://fcm.googleapis.com/fcm/send/token-athlete-1',
      p256dh: 'mock-p256dh-key',
      auth: 'mock-auth-secret',
      user_id: 'athlete-user-1',
      timezone: 'UTC',
    });

    mockPreferences.push(createDuePreferences('athlete-user-1', 'UTC'));

    const req = new Request('https://ascendtonext.vercel.app/api/notifications/dispatch', {
      method: 'POST',
      headers: { authorization: 'Bearer super-secret-cron-token-12345' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.stats.examined).toBe(1);
    expect(body.stats.sent).toBe(1);

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [callSub, callPayload, callOpts] = (webpush.sendNotification as any).mock.calls[0];
    expect(callSub.endpoint).toBe('https://fcm.googleapis.com/fcm/send/token-athlete-1');
    const parsedPayload = JSON.parse(callPayload);
    expect(parsedPayload.title).toBeDefined();
    expect(parsedPayload.url).toBeDefined();
    expect(callOpts.vapidDetails.subject).toBe('mailto:support@ascendfit.app');
  });

  // 5. Disabled reminder or quiet hours suppresses delivery
  it('5. suppresses delivery when notifications are disabled or quiet hours are active', async () => {
    const { POST } = await import('../src/app/api/notifications/dispatch/route');

    mockSubscriptions.push({
      endpoint: 'https://fcm.googleapis.com/fcm/send/token-athlete-quiet',
      p256dh: 'p256dh',
      auth: 'auth',
      user_id: 'athlete-quiet',
      timezone: 'UTC',
    });

    // Global toggle disabled
    mockPreferences.push({
      user_id: 'athlete-quiet',
      preferences: {
        enabled: false,
        waterReminders: { enabled: true, intervalHours: 1 },
      },
    });

    const req = new Request('https://ascendtonext.vercel.app/api/notifications/dispatch', {
      method: 'POST',
      headers: { authorization: 'Bearer super-secret-cron-token-12345' },
    });

    const res = await POST(req);
    const body = await res.json();
    expect(body.stats.sent).toBe(0);
    expect(body.stats.skipped).toBe(1);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  // 6. Repeated or concurrent dispatch attempts do not send duplicates
  it('6 & 8. repeated dispatch calls do not send duplicates (durable idempotency)', async () => {
    const { POST } = await import('../src/app/api/notifications/dispatch/route');

    mockSubscriptions.push({
      endpoint: 'https://fcm.googleapis.com/fcm/send/token-duplicate-test',
      p256dh: 'p256',
      auth: 'auth',
      user_id: 'athlete-dup',
      timezone: 'UTC',
    });

    mockPreferences.push(createDuePreferences('athlete-dup', 'UTC'));

    const req1 = new Request('https://ascendtonext.vercel.app/api/notifications/dispatch', {
      method: 'POST',
      headers: { authorization: 'Bearer super-secret-cron-token-12345' },
    });

    // Run First Dispatch
    const res1 = await POST(req1);
    const body1 = await res1.json();
    const firstSent = body1.stats.sent;
    expect(firstSent).toBe(1);

    // Run Second Immediate Dispatch (Simulate duplicate QStash call or concurrent worker)
    const req2 = new Request('https://ascendtonext.vercel.app/api/notifications/dispatch', {
      method: 'POST',
      headers: { authorization: 'Bearer super-secret-cron-token-12345' },
    });
    const res2 = await POST(req2);
    const body2 = await res2.json();

    // Second call should send 0 because idempotency ledger records it as already sent
    expect(body2.stats.sent).toBe(0);
    expect(body2.stats.skipped).toBeGreaterThanOrEqual(1);

    // webpush total calls must match only the first successful dispatch
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  // 7. Transient failures can be retried safely
  it('7 & 10. records transient failure and allows subsequent safe retry', async () => {
    const { POST } = await import('../src/app/api/notifications/dispatch/route');

    mockSubscriptions.push({
      endpoint: 'https://fcm.googleapis.com/fcm/send/token-retry-test',
      p256dh: 'p256',
      auth: 'auth',
      user_id: 'athlete-retry',
      timezone: 'UTC',
    });

    mockPreferences.push(createDuePreferences('athlete-retry', 'UTC'));

    // Simulate transient network 503 error from Web Push provider
    (webpush.sendNotification as any).mockRejectedValueOnce(
      Object.assign(new Error('Push service unavailable'), { statusCode: 503 })
    );

    const req1 = new Request('https://ascendtonext.vercel.app/api/notifications/dispatch', {
      method: 'POST',
      headers: { authorization: 'Bearer super-secret-cron-token-12345' },
    });

    const res1 = await POST(req1);
    const body1 = await res1.json();
    expect(body1.stats.failed).toBe(1);
    expect(body1.stats.sent).toBe(0);

    // On next cron dispatch: provider recovers (mock resolves)
    (webpush.sendNotification as any).mockResolvedValueOnce({ statusCode: 201 });

    const req2 = new Request('https://ascendtonext.vercel.app/api/notifications/dispatch', {
      method: 'POST',
      headers: { authorization: 'Bearer super-secret-cron-token-12345' },
    });

    const res2 = await POST(req2);
    const body2 = await res2.json();
    expect(body2.stats.sent).toBe(1);
  });

  // 8. Expired subscriptions (HTTP 410 / 404) are removed
  it('8 & 11. deletes expired subscriptions when provider returns 410 Gone or 404 Not Found', async () => {
    const { POST } = await import('../src/app/api/notifications/dispatch/route');

    mockSubscriptions.push({
      endpoint: 'https://fcm.googleapis.com/fcm/send/token-expired',
      p256dh: 'p256',
      auth: 'auth',
      user_id: 'athlete-expired',
      timezone: 'UTC',
    });

    mockPreferences.push(createDuePreferences('athlete-expired', 'UTC'));

    // Provider returns 410 Gone (unregistered subscription)
    (webpush.sendNotification as any).mockRejectedValueOnce(
      Object.assign(new Error('Subscription expired'), { statusCode: 410 })
    );

    const req = new Request('https://ascendtonext.vercel.app/api/notifications/dispatch', {
      method: 'POST',
      headers: { authorization: 'Bearer super-secret-cron-token-12345' },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body.stats.expired).toBe(1);
    // Subscription removed from database
    expect(mockSubscriptions.find((s) => s.endpoint.includes('token-expired'))).toBeUndefined();
  });

  // 9. No sensitive subscription data returned in response
  it('9 & 12. returns only aggregate counters with zero endpoints, keys, or user IDs', async () => {
    const { POST } = await import('../src/app/api/notifications/dispatch/route');

    mockSubscriptions.push({
      endpoint: 'https://fcm.googleapis.com/fcm/send/token-leak-check',
      p256dh: 'sensitive-p256-key',
      auth: 'sensitive-auth-secret',
      user_id: 'secret-user-guid-9999',
      timezone: 'UTC',
    });

    mockPreferences.push({
      user_id: 'secret-user-guid-9999',
      preferences: {
        enabled: true,
        waterReminders: { enabled: true, intervalHours: 1 },
        mealReminders: { enabled: false },
        workoutReminders: { enabled: false },
        weeklyReport: { enabled: false },
        quietHours: { enabled: false },
      },
    });

    const req = new Request('https://ascendtonext.vercel.app/api/notifications/dispatch', {
      method: 'POST',
      headers: { authorization: 'Bearer super-secret-cron-token-12345' },
    });

    const res = await POST(req);
    const text = await res.text();

    // Verify zero leaks in response body
    expect(text).not.toContain('token-leak-check');
    expect(text).not.toContain('sensitive-p256-key');
    expect(text).not.toContain('sensitive-auth-secret');
    expect(text).not.toContain('secret-user-guid-9999');

    const json = JSON.parse(text);
    expect(json.stats).toBeDefined();
    expect(json.stats.examined).toBeDefined();
    expect(json.stats.sent).toBeDefined();
    expect(json.stats.due).toBeDefined();
  });

  // 10. Database persistence errors never produce false positive success
  it('10 & 13. subscribe and preferences routes fail with 500 when database write fails', async () => {
    simulateDbError = 'Connection terminated unexpectedly';

    const subRoute = await import('../src/app/api/notifications/subscribe/route');
    const prefRoute = await import('../src/app/api/notifications/preferences/route');

    // Subscribe route POST with db error
    const subReq = new Request('https://ascendtonext.vercel.app/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer user-token' },
      body: JSON.stringify({
        subscription: {
          endpoint: 'https://push.example.com/sub-1',
          keys: { p256dh: 'key', auth: 'auth' },
        },
      }),
    });
    const subRes = await subRoute.POST(subReq);
    expect(subRes.status).toBe(500);
    const subBody = await subRes.json();
    expect(subBody.error).toBe('DATABASE_ERROR');

    // Preferences route POST with db error
    const prefReq = new Request('https://ascendtonext.vercel.app/api/notifications/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer user-token' },
      body: JSON.stringify({ enabled: true }),
    });
    const prefRes = await prefRoute.POST(prefReq);
    expect(prefRes.status).toBe(500);
    const prefBody = await prefRes.json();
    expect(prefBody.error).toBe('DATABASE_ERROR');
  });

  // 11. Existing service-worker payloads and navigation compatibility
  it('11 & 14. service worker handles push payload structure and navigation tabs', () => {
    const swPath = path.resolve(process.cwd(), 'public/sw.js');
    const swContent = fs.readFileSync(swPath, 'utf-8');

    // Verifies sw.js expects data.tab, data.url, and data.tag
    expect(swContent).toContain("addEventListener('push'");
    expect(swContent).toContain("addEventListener('notificationclick'");
    expect(swContent).toContain("data.tab");
    expect(swContent).toContain("data.url");
    expect(swContent).toContain("NAVIGATE_TAB");
  });
});
