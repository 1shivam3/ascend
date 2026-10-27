import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../src/app/api/ai/scan-meal/route';

/**
 * Audit F-04 regression: the scan-meal JSON path must reject an
 * oversized body with 413 BEFORE JSON.parse runs (the old code called
 * req.json() unboundedly; the post-parse 14 MB base64 cap only ran
 * after parsing). The 16 MB pre-parse cap is above the largest
 * legitimate body (14 MB base64 + wrapper < 15 MB).
 *
 * Only the rate limiter is mocked: both assertions fail before any
 * vision provider is reached, so no provider mock is needed.
 */

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ success: true, resetMs: 0 })),
  // F-02 (audit): ai-quota routes import this alongside checkRateLimit;
  // success keeps these tests on the pre-existing paths.
  checkRateLimitForKey: vi.fn(async () => ({ success: true, resetMs: 0 })),
  getClientIp: () => '127.0.0.1',
  RateLimitUnavailableError: class RateLimitUnavailableError extends Error {},
}));

function jsonReq(body: unknown) {
  return new Request('http://test.local/api/ai/scan-meal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('F-04: scan-meal pre-parse body cap', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('rejects a >16 MB JSON body with 413 before parsing', async () => {
    const res = await POST(jsonReq({ imageBase64: 'x'.repeat(17 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe('PAYLOAD_TOO_LARGE');
  });

  it('still parses a small JSON body normally (400 NO_IMAGE, not 413)', async () => {
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('NO_IMAGE');
  });
});
