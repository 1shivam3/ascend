import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Central API floor (gauntlet SEC-20).
 *
 * This file stays on the middleware convention (src/middleware.ts,
 * Edge runtime) under Next 16. The proxy.ts rename was tried in the
 * Next 16 upgrade and REVERTED the same day (2026-10-29): with the
 * Node-runtime proxy, every POST API route hung on the Vercel
 * preview (GETs and proxy-generated 404s answered normally; the
 * identical build served POSTs fine locally and the Next 14
 * production was unaffected). Next 16 deprecates middleware.ts but
 * still supports it; revisit the rename once the platform-level
 * POST deadlock is resolved upstream. Behavior below is unchanged.
 *
 * /api/* used to rely on every route opting into rate limiting
 * individually. This proxy adds the floor for ALL API traffic:
 * unknown API paths are denied outright (the route set below is the
 * inventory from src/app/api), and every known route gets a default
 * per-IP ceiling on top of its own stricter limits. The limiter is
 * an in-memory anchored fixed window (same semantics as
 * lib/rate-limit.ts) implemented inline: the proxy must not import
 * the Node-oriented limiter module.
 * Per-instance, like the in-memory fallback everywhere else.
 *
 * SEC-16 NOTE: a nonce-CSP branch for pages was built here and
 * live-tested on 2026-10-29, then REMOVED: the app's pages are
 * statically generated, so their prerendered inline scripts never
 * receive the per-request nonce (verified: nonce present in the CSP
 * header, on 0 of 8 inline scripts in the served home page) and a
 * nonce policy would have broken hydration. The CSP therefore stays
 * in next.config.js; see the SEC-16 comment there for the decision
 * this waits on (force dynamic rendering app-wide, or keep
 * 'unsafe-inline' with the compensating controls).
 */

const KNOWN_API_ROUTES = new Set([
  '/api/ai/coach',
  '/api/ai/coach-chat',
  '/api/ai/parse-meal',
  '/api/ai/parse-voice',
  '/api/ai/scan-meal',
  '/api/auth/delete-account',
  '/api/barcode',
  '/api/coach',
  '/api/csp-report',
  '/api/feedback',
  '/api/notifications/dispatch',
  '/api/notifications/preferences',
  '/api/notifications/subscribe',
]);

const API_WINDOW_MS = 60 * 1000;
const API_MAX_PER_WINDOW = 300;
const apiHits = new Map<string, { windowStart: number; count: number }>();

function apiRateLimited(ip: string, now: number): boolean {
  const rec = apiHits.get(ip);
  if (!rec || now >= rec.windowStart + API_WINDOW_MS) {
    apiHits.set(ip, { windowStart: now, count: 1 });
    if (apiHits.size > 5000) {
      for (const [key, value] of apiHits) {
        if (now >= value.windowStart + API_WINDOW_MS) apiHits.delete(key);
      }
    }
    return false;
  }
  rec.count += 1;
  return rec.count > API_MAX_PER_WINDOW;
}

function clientIp(req: NextRequest): string {
  // Re-audit SEC-R2: validate the header values before trusting them as
  // rate-limit keys — same rule the main limiter applies
  // (lib/rate-limit.ts isValidIpFormat). An unvalidated first
  // x-forwarded-for entry lets a client mint unlimited fresh buckets.
  const isValidIpFormat = (ip: string) => ip.length <= 45 && /^[0-9a-fA-F:.]+$/.test(ip);
  const forwarded = req.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0].trim();
  if (first && isValidIpFormat(first)) return first;
  // Audit-3 SEC2-5: NO x-real-ip fallback. That header is not set by
  // Vercel's edge, so any client can send it and rotate its apparent IP
  // at will — minting a fresh floor bucket per request and defeating
  // this ceiling. This mirrors getClientIp's documented decision in
  // lib/rate-limit.ts: no trustworthy header → one shared bucket.
  return 'unknown';
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const normalized =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  // Re-audit SEC-R3: the per-IP ceiling runs BEFORE the allowlist 404,
  // so probing unknown routes is throttled by the floor too — an
  // enumerator now burns the same 300/min budget as legitimate
  // traffic. Both response shapes are unchanged (429 RATE_LIMITED with
  // Retry-After once over the ceiling; 404 NOT_FOUND otherwise).
  if (apiRateLimited(clientIp(req), Date.now())) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }
  if (!KNOWN_API_ROUTES.has(normalized)) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'Unknown API route.' },
      { status: 404 },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
