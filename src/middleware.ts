import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Central API floor (gauntlet SEC-20).
 *
 * /api/* used to rely on every route opting into rate limiting
 * individually. This middleware adds the floor for ALL API traffic:
 * unknown API paths are denied outright (the route set below is the
 * inventory from src/app/api), and every known route gets a default
 * per-IP ceiling on top of its own stricter limits. The limiter is
 * an in-memory anchored fixed window (same semantics as
 * lib/rate-limit.ts) implemented inline: middleware runs on the edge
 * runtime and must not import the Node-oriented limiter module.
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
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const normalized =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (!KNOWN_API_ROUTES.has(normalized)) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'Unknown API route.' },
      { status: 404 },
    );
  }
  if (apiRateLimited(clientIp(req), Date.now())) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
