import { describe, it, expect } from 'vitest';
import { redactSecrets, rateLimitResponse } from '@/lib/server-security';
import { getClientIp, checkRateLimit } from '@/lib/rate-limit';

describe('Server Security Utilities', () => {
  describe('redactSecrets', () => {
    it('redacts Google API keys matching AIzaSy format', () => {
      const msg = 'Failed request with key AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q in url';
      expect(redactSecrets(msg)).toBe('Failed request with key [REDACTED_API_KEY] in url');
    });

    it('redacts token, secret, apiKey, and password preserving the key identifier', () => {
      expect(redactSecrets('error on secret=my_super_secret_value_123')).toBe('error on secret=[REDACTED]');
      expect(redactSecrets('auth failed token="jwt.token.here"')).toBe('auth failed token=[REDACTED]');
      expect(redactSecrets('apiKey: 9876543210-xyz')).toBe('apiKey: [REDACTED]');
      expect(redactSecrets('password=\x27plainPass123\x27')).toBe('password=[REDACTED]');
    });

    it('redacts Bearer tokens in Authorization headers', () => {
      const msg = 'HTTP 401: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 was rejected';
      expect(redactSecrets(msg)).toBe('HTTP 401: Bearer [REDACTED] was rejected');
    });

    it('leaves safe operational messages unmodified', () => {
      const safe = 'Database query succeeded with 42 rows in 12ms';
      expect(redactSecrets(safe)).toBe(safe);
    });

    it('handles empty or falsy messages safely', () => {
      expect(redactSecrets('')).toBe('');
    });
  });

  describe('rateLimitResponse', () => {
    it('returns a 429 response with proper Retry-After headers', () => {
      const res = rateLimitResponse(3000);
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('3');
      expect(res.headers.get('X-RateLimit-Reset')).toBeDefined();
    });
  });
});

describe('Rate Limiter IP Extraction & Hardening', () => {
  it('prioritizes trusted cf-connecting-ip over spoofed x-forwarded-for', () => {
    const req = new Request('https://ascend.app/api/ai/coach', {
      headers: {
        'x-forwarded-for': '198.51.100.1, 203.0.113.1',
        'cf-connecting-ip': '192.0.2.42',
      },
    });
    expect(getClientIp(req)).toBe('192.0.2.42');
  });

  it('prioritizes x-real-ip when cf-connecting-ip is absent', () => {
    const req = new Request('https://ascend.app/api/ai/coach', {
      headers: {
        'x-forwarded-for': '198.51.100.1, 203.0.113.1',
        'x-real-ip': '10.0.0.5',
      },
    });
    expect(getClientIp(req)).toBe('10.0.0.5');
  });

  it('falls back to first IP in x-forwarded-for when edge headers are absent', () => {
    const req = new Request('https://ascend.app/api/ai/coach', {
      headers: {
        'x-forwarded-for': '198.51.100.99, 10.0.0.1',
      },
    });
    expect(getClientIp(req)).toBe('198.51.100.99');
  });

  it('rejects header injection and invalid IP formats, falling back to 127.0.0.1', () => {
    const req = new Request('https://ascend.app/api/ai/coach', {
      headers: {
        'cf-connecting-ip': 'malicious<script>alert(1)</script>',
      },
    });
    expect(getClientIp(req)).toBe('127.0.0.1');
  });

  it('enforces sliding window rate limit correctly', () => {
    const fakeIp = '203.0.113.50';
    const makeReq = () =>
      new Request('https://ascend.app/api/test', {
        headers: { 'cf-connecting-ip': fakeIp },
      });

    const opts = { windowMs: 1000, maxRequests: 2, keyPrefix: 'test-limiter' };

    const first = checkRateLimit(makeReq(), opts);
    expect(first.success).toBe(true);
    expect(first.remaining).toBe(1);

    const second = checkRateLimit(makeReq(), opts);
    expect(second.success).toBe(true);
    expect(second.remaining).toBe(0);

    const third = checkRateLimit(makeReq(), opts);
    expect(third.success).toBe(false);
    expect(third.remaining).toBe(0);
  });
});

import { importFullBackupJSON } from '@/lib/storage';

describe('Storage Import Data Integrity & Sanitization', () => {
  it('rejects oversized JSON payloads exceeding 50MB', () => {
    // Generate empty mock payload larger than 50MB
    const bigString = ' '.repeat(51 * 1024 * 1024);
    expect(importFullBackupJSON(bigString)).toBe(false);
  });

  it('safely strips prototype pollution keys and credentials from backup imports', () => {
    const maliciousPayload = JSON.stringify({
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      source: 'test',
      __proto__: { polluted: true },
      constructor: { prototype: { admin: true } },
      customGeminiKey: 'AIzaSySecretLeakedKey123456789012345',
      apiKey: 'should-be-stripped',
      token: 'should-be-stripped',
      workouts: [
        {
          id: 'w1',
          name: 'Chest Day',
          date: '2026-10-14',
          customGeminiKey: 'nested-leak',
          __proto__: { nestedPollution: true },
          exercises: [],
        },
      ],
    });

    const storeMap = new Map<string, string>();
    const originalWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        localStorage: {
          getItem: (k: string) => storeMap.get(k) || null,
          setItem: (k: string, v: string) => storeMap.set(k, v),
          removeItem: (k: string) => storeMap.delete(k),
          clear: () => storeMap.clear(),
        },
      };

      const success = importFullBackupJSON(maliciousPayload);
      expect(success).toBe(true);
      expect((Object.prototype as any).polluted).toBeUndefined();
      expect((Object.prototype as any).nestedPollution).toBeUndefined();

      // Verify stored state does not contain stripped sensitive keys
      const stored = JSON.parse(storeMap.get('ascend_store') || '{}');
      expect(stored.state?.customGeminiKey).toBeUndefined();
      expect(stored.state?.apiKey).toBeUndefined();
      expect(stored.state?.token).toBeUndefined();
      expect(stored.state?.workouts?.[0]?.customGeminiKey).toBeUndefined();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });
});
