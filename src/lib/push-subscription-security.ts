/**
 * Web Push subscription security helpers (QA4-009 / QA4A-003).
 *
 * Endpoint validation: a PushSubscription endpoint is only ever issued by a
 * real web-push service, so anything else is junk or an attempt to store
 * attacker-controlled rows. The allowlist mirrors the services the app's
 * own client can produce across supported browsers:
 *  - Chrome / Android / Edge (FCM): fcm.googleapis.com
 *  - Edge / Windows (WNS): *.wns.windows.com, *.notify.windows.com
 *  - Firefox (Mozilla autopush): updates.push.services.mozilla.com
 *  - Safari (Apple): web.push.apple.com, *.push.apple.com
 */
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const ALLOWED_PUSH_HOSTNAMES = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
]);

const ALLOWED_PUSH_HOST_SUFFIXES = ['.wns.windows.com', '.notify.windows.com', '.push.apple.com'];

export function isValidPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > 2048) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (ALLOWED_PUSH_HOSTNAMES.has(host)) return true;
  return ALLOWED_PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** Generates a fresh per-subscription delete token (returned to the client once). */
export function generateSubscriptionDeleteToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash stored server-side; the raw token never touches the database. */
export function hashSubscriptionDeleteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time check of a presented token against the stored hash. */
export function verifySubscriptionDeleteToken(token: unknown, storedHash: unknown): boolean {
  if (typeof token !== 'string' || typeof storedHash !== 'string' || !storedHash) {
    return false;
  }
  const presented = Buffer.from(hashSubscriptionDeleteToken(token), 'utf8');
  const stored = Buffer.from(storedHash, 'utf8');
  if (presented.length !== stored.length) return false;
  return timingSafeEqual(presented, stored);
}
