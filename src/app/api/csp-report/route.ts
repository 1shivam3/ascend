import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { rateLimitResponse, readTextBodyWithLimit, redactSecrets } from '@/lib/server-security';

export const runtime = 'nodejs';

/**
 * CSP violation report sink (gauntlet SEC-17 short-term).
 *
 * The nonce CSP (middleware.ts) reports violations here via
 * report-uri / report-to. Reports are logged (redacted, size-capped)
 * so a too-strict directive shows up in server logs instead of
 * silently breaking a surface. Rate-limited like every other route;
 * always 204 — a report must never produce an error worth retrying.
 */
export async function POST(req: Request) {
  try {
    const rateLimit = await checkRateLimit(req, {
      windowMs: 60 * 1000,
      maxRequests: 60,
      keyPrefix: 'csp-report',
    });
    if (!rateLimit.success) {
      return rateLimitResponse(rateLimit.resetMs);
    }
    const body = await readTextBodyWithLimit(req, 32 * 1024).catch(() => '');
    if (body) {
      // Re-audit SEC-R6: strip CR/LF so an attacker-supplied report body
      // cannot inject forged lines into the server log.
      console.warn('[CSP] violation report:', redactSecrets(body.slice(0, 2000)).replace(/[\r\n]+/g, ' '));
    }
  } catch {
    // Reporting must never fail loudly.
  }
  return new NextResponse(null, { status: 204 });
}
