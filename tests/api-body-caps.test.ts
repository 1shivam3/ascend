import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { POST as subscribePost, DELETE as subscribeDelete } from '../src/app/api/notifications/subscribe/route';
import { POST as prefsPost } from '../src/app/api/notifications/preferences/route';
import { POST as scanMealPost } from '../src/app/api/ai/scan-meal/route';

/**
 * Audit Cycle B (F-04 extension): the non-AI routes that read a JSON
 * body must cap it before parsing, exactly like the AI routes already
 * do. A PushSubscription / preferences object is a few KB, so 64 KB is
 * generous; malformed small bodies must still fall back to {} (the old
 * req.json().catch() behavior) so validation errors stay unchanged.
 *
 * Only the rate limiter is mocked: every 413 below returns before any
 * Supabase client is touched, and the small-body subscribe case fails
 * on validation before any client call.
 */

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ success: true, resetMs: 0 })),
  // F-02 (audit): ai-quota routes import this alongside checkRateLimit;
  // success keeps these tests on the pre-existing paths.
  checkRateLimitForKey: vi.fn(async () => ({ success: true, resetMs: 0 })),
  getClientIp: () => '127.0.0.1',
  RateLimitUnavailableError: class RateLimitUnavailableError extends Error {},
}));

function bigJsonReq(url: string) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pad: 'x'.repeat(70 * 1024) }),
  });
}

describe('B2: non-AI routes cap JSON bodies before parsing', () => {
  it('subscribe POST rejects a >64 KB body with 413', async () => {
    const res = await subscribePost(bigJsonReq('http://test.local/api/notifications/subscribe'));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('PAYLOAD_TOO_LARGE');
  });

  it('subscribe DELETE rejects a >64 KB body with 413', async () => {
    const req = bigJsonReq('http://test.local/api/notifications/subscribe');
    const res = await subscribeDelete(req as never);
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('PAYLOAD_TOO_LARGE');
  });

  it('preferences POST rejects a >64 KB body with 413', async () => {
    const res = await prefsPost(bigJsonReq('http://test.local/api/notifications/preferences'));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('PAYLOAD_TOO_LARGE');
  });

  it('subscribe POST still treats a small malformed body as {} (validation 400, not 413)', async () => {
    const req = new Request('http://test.local/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await subscribePost(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_SUBSCRIPTION');
  });

  it('delete-account route uses the capped read with a 413 path (source-level)', () => {
    const s = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'auth', 'delete-account', 'route.ts'), 'utf8');
    expect(s).toContain('readJsonBodyWithLimit(req, 64 * 1024)');
    expect(s).toContain('RequestBodyTooLargeError');
    expect(s).toContain('PAYLOAD_TOO_LARGE');
    expect(s).not.toContain('await req.json()');
  });

  it('scan-meal multipart pre-check rejects on declared content-length before formData()', async () => {
    let formDataCalled = false;
    const req = {
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === 'content-type') return 'multipart/form-data; boundary=x';
          if (name.toLowerCase() === 'content-length') return String(13 * 1024 * 1024);
          return null;
        },
      },
      formData: async () => {
        formDataCalled = true;
        throw new Error('must not be reached');
      },
    };
    const res = await scanMealPost(req as never);
    expect(formDataCalled).toBe(false);
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('IMAGE_TOO_LARGE');
  });
});
