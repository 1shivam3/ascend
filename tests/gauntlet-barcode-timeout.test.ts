import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../src/app/api/barcode/route';

/**
 * Gauntlet SEC-12 regression: the Open Food Facts v0 fallback fetch
 * had no timeout while the v2 fetch aborts at 6.5s — a stalled v0
 * hung the route indefinitely. The v0 fetch now aborts at 6.5s and
 * the route falls through to the not-found response.
 */
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ success: true, resetMs: 0 })),
}));
vi.mock('@/lib/server-security', () => ({
  rateLimitResponse: vi.fn(() => new Response('{}', { status: 429 })),
  redactSecrets: (s: string) => s,
}));

const fetchMock = vi.fn();

function req(code: string) {
  return new Request(`http://test.local/api/barcode?code=${code}`);
}

describe('gauntlet SEC-12: barcode v0 fallback aborts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a stalled v0 resolves to not-found after the 6.5s abort', async () => {
    // v2 fails fast (network), v0 hangs until its signal aborts.
    fetchMock.mockRejectedValueOnce(new Error('v2 network down'));
    fetchMock.mockImplementationOnce((_url: string, opts: any) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });
    const pending = GET(req('1234567890123'));
    await vi.advanceTimersByTimeAsync(6500);
    const res = await pending;
    const body = await res.json();
    expect(body.found).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
