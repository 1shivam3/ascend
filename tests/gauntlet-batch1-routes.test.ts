/**
 * Gauntlet batch-1 route-level fixes: SEC-08 (subscribe fails closed
 * on a lookup error instead of overwriting the stored row) and
 * SEC-18 (unauthenticated preferences GET is rate-limited).
 *
 * The Supabase client factory is mocked; the rate limiter is the REAL
 * in-memory implementation (no Supabase client configured).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV = process.env as Record<string, string | undefined>;
const lookupBehavior = { current: 'throw' as 'throw' | 'null' };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (lookupBehavior.current === 'throw') throw new Error('lookup failed');
            return { data: null, error: null };
          },
        }),
        in: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
      delete: () => ({ eq: async () => ({ error: null }) }),
      upsert: async () => ({ error: null }),
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  }),
}));

import { POST as subscribePost } from '../src/app/api/notifications/subscribe/route';
import { GET as preferencesGet } from '../src/app/api/notifications/preferences/route';
import {
  resetRateLimitStoreForTests,
  setRateLimiterSupabaseForTests,
} from '../src/lib/rate-limit';

const OLD_ENV = {
  url: ENV.NEXT_PUBLIC_SUPABASE_URL,
  anon: ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  svc: ENV.SUPABASE_SERVICE_ROLE_KEY,
};

beforeEach(() => {
  resetRateLimitStoreForTests();
  setRateLimiterSupabaseForTests(null);
  lookupBehavior.current = 'throw';
});

afterEach(() => {
  delete ENV.NEXT_PUBLIC_SUPABASE_URL;
  delete ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete ENV.SUPABASE_SERVICE_ROLE_KEY;
  if (OLD_ENV.url !== undefined) ENV.NEXT_PUBLIC_SUPABASE_URL = OLD_ENV.url;
  if (OLD_ENV.anon !== undefined) ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY = OLD_ENV.anon;
  if (OLD_ENV.svc !== undefined) ENV.SUPABASE_SERVICE_ROLE_KEY = OLD_ENV.svc;
  resetRateLimitStoreForTests();
});

function subscribeReq(ip: string) {
  return new Request('https://ascend.app/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
        keys: { p256dh: 'key-data', auth: 'auth-data' },
      },
    }),
  });
}

describe('SEC-08: subscribe lookup error fails closed', () => {
  it('lookup failure returns 500 DATABASE_ERROR (no silent overwrite)', async () => {
    ENV.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
    ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder-anon-key';
    ENV.SUPABASE_SERVICE_ROLE_KEY = 'placeholder-service-key';
    const res = await subscribePost(subscribeReq('203.0.113.20'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DATABASE_ERROR');
  });

  it('row truly absent still proceeds (200, success)', async () => {
    lookupBehavior.current = 'null';
    ENV.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
    ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder-anon-key';
    ENV.SUPABASE_SERVICE_ROLE_KEY = 'placeholder-service-key';
    const res = await subscribePost(subscribeReq('203.0.113.21'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

describe('SEC-18: preferences GET is rate-limited', () => {
  it('serves defaults without auth, then 429s past 30/min per IP', async () => {
    // No Supabase env: the route returns the documented defaults.
    const ip = '203.0.113.30';
    let last: Response | null = null;
    for (let i = 0; i < 31; i += 1) {
      last = await preferencesGet(
        new Request('https://ascend.app/api/notifications/preferences', {
          headers: { 'x-forwarded-for': ip },
        }),
      );
    }
    expect(last!.status).toBe(429);
  });

  it('a different IP is not affected', async () => {
    const res = await preferencesGet(
      new Request('https://ascend.app/api/notifications/preferences', {
        headers: { 'x-forwarded-for': '203.0.113.31' },
      }),
    );
    expect(res.status).toBe(200);
  });
});
