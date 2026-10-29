/**
 * Server-Side Rate Limiter for Next.js API Routes
 *
 * Implements an anchored fixed-window counter with a Supabase-backed
 * distributed store so that limits are enforced consistently across
 * serverless function instances. Calls that do NOT opt into
 * `failClosed` fall back to in-process memory when Supabase is
 * unavailable (e.g. offline mode or local development without
 * credentials). Fail-closed calls never degrade: when the
 * distributed limiter cannot run — including when the service key
 * is absent entirely (gauntlet SEC-02) — they throw
 * RateLimitUnavailableError so the caller can reject with 503.
 *
 * Gauntlet SEC-24: the in-memory fallback used to be sliding-window
 * while the Supabase RPC is fixed-window (reset_at bucket), so the two
 * backends behaved differently at window boundaries. Both are now
 * anchored fixed-window: a window starts at the first request after
 * the previous window expired and lasts exactly windowMs. The
 * boundary-burst property (up to 2x maxRequests across a boundary)
 * is therefore identical in both backends — documented, not hidden.
 *
 * Prevents API quota exhaustion, DoS attacks, and credential stuffing.
 */

import { createClient } from '@supabase/supabase-js';

interface RateLimitRecord {
  /** Start of the current anchored window (ms since epoch). */
  windowStartMs: number;
  /** Requests counted in the current window. */
  count: number;
  /** Window length this record was created with (ms). */
  windowMs: number;
}

/**
 * In-process fallback for when Supabase is not configured.
 * Each key maps to an array of request timestamps within the sliding window.
 */
const rateLimitStore = new Map<string, RateLimitRecord>();

/** Exported for test cleanup: resets the in-memory rate limit store and client. */
export function resetRateLimitStoreForTests(): void {
  rateLimitStore.clear();
  supabaseRateLimiter = null;
  supabaseCheckAttempted = false;
}

/** Exported for testing distributed Supabase RPC handling without live network calls. */
export function setRateLimiterSupabaseForTests(client: any): void {
  supabaseRateLimiter = client;
  supabaseCheckAttempted = true;
}

// Reuse a single Supabase client instance across invocations within the same
// serverless instance to avoid reconnect overhead.
let supabaseRateLimiter: ReturnType<typeof createClient> | null = null;
let supabaseCheckAttempted = false;

function getRateLimiterSupabase() {
  if (supabaseCheckAttempted) return supabaseRateLimiter;
  supabaseCheckAttempted = true;

  // Crucial security control: Only invoke the rate limiter RPC via the privileged service-role key.
  // Never attempt to call the RPC with an anonymous or unprivileged key.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) return null;

  try {
    supabaseRateLimiter = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    supabaseRateLimiter = null;
  }
  return supabaseRateLimiter;
}

/**
 * Prunes expired in-memory windows. Gauntlet SEC-05: the old cleanup
 * dropped every timestamp older than a hardcoded 10 minutes, which
 * silently truncated every longer window (15-min deletion, 24-h AI
 * daily) to 10 minutes. Cleanup now respects each record's own
 * window: only windows that have fully expired are removed.
 * Exported for tests; the interval below calls it in production.
 */
export function pruneRateLimitStoreForTests(now: number = Date.now()): void {
  for (const [key, record] of rateLimitStore.entries()) {
    if (now >= record.windowStartMs + record.windowMs) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup stale in-memory rate limit entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(() => pruneRateLimitStoreForTests(), CLEANUP_INTERVAL_MS).unref?.();
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  /** When true, returns 503 (throws RateLimitUnavailableError) if the
   * distributed rate limiter is unavailable OR not configured at all
   * (service key absent — gauntlet SEC-02). */
  failClosed?: boolean;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

/**
 * Validates basic IP address string format to prevent header injection or bloated key allocations.
 */
function isValidIpFormat(ip: string): boolean {
  if (!ip || ip.length > 45) return false;
  return /^[0-9a-fA-F:.]+$/.test(ip);
}

/**
 * Extracts the real client IP from standard reverse proxy headers.
 * Prioritizes trusted edge headers (Cloudflare, verified proxy) over client-spoofable forwarded headers.
 */
export function getClientIp(req: Request): string {
  // P1-2: cf-connecting-ip and x-real-ip are NOT set by Vercel's edge —
  // anyone could send them and rotate their apparent IP at will,
  // defeating every per-IP rate limit. Only x-forwarded-for is trusted,
  // first entry only (the edge-written client IP on this hosting), and
  // only when it parses as an IP. Everything else is the loopback
  // fallback, which rate-limits as a single bucket rather than a bypass.
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]?.trim();
    if (firstIp && isValidIpFormat(firstIp)) return firstIp;
  }

  return '127.0.0.1';
}

/**
 * In-process anchored fixed-window rate limit check (fallback when
 * Supabase is unavailable). Matches the Supabase RPC semantics
 * (SEC-24): a window starts at the first request after the previous
 * window expired and lasts exactly windowMs; requests past the limit
 * inside the window are denied until the window rolls over.
 */
function checkRateLimitInMemory(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();

  let record = rateLimitStore.get(key);
  if (!record || record.windowMs !== options.windowMs || now >= record.windowStartMs + record.windowMs) {
    record = { windowStartMs: now, count: 0, windowMs: options.windowMs };
    rateLimitStore.set(key, record);
  }

  if (record.count >= options.maxRequests) {
    return {
      success: false,
      limit: options.maxRequests,
      remaining: 0,
      resetMs: Math.max(0, record.windowStartMs + record.windowMs - now),
    };
  }

  record.count += 1;
  return {
    success: true,
    limit: options.maxRequests,
    remaining: Math.max(0, options.maxRequests - record.count),
    resetMs: Math.max(0, record.windowStartMs + record.windowMs - now),
  };
}

/**
 * Supabase-backed distributed rate limit check.
 * Uses a dedicated `api_rate_limits` table with upsert for cross-instance consistency.
 */
async function checkRateLimitSupabase(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult | null> {
  const supabase = getRateLimiterSupabase();
  if (!supabase) return null;

  const now = Date.now();
  const windowStart = now - options.windowMs;

try {
     // Atomically claim a slot: insert a row only if the count within the
     // current window is still under the limit. The upsert + filter pattern
     // ensures race-safe behavior within a single database transaction.
     const { data, error } = await (supabase as any).rpc('ascend_check_rate_limit', {
       p_key: key,
       p_window_ms: options.windowMs,
       p_max_requests: options.maxRequests,
     });

    if (error) {
      // Fall back to in-memory if the RPC is unavailable
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== 'object') return null;

    const count = Number(row.count) || 1;
    const resetMs = Number(row.reset_ms);

    return {
      success: Boolean(row.allowed),
      limit: options.maxRequests,
      remaining: Math.max(0, options.maxRequests - count),
      resetMs: !isNaN(resetMs) && resetMs >= 0 ? resetMs : options.windowMs,
    };
  } catch {
    return null;
  }
}

/**
 * Checks whether the incoming request is within the allowed rate limit.
 *
 * Tries the Supabase-backed distributed limiter first for cross-instance
 * consistency in serverless environments. Falls back to in-process memory
 * when Supabase is unavailable.
 *
 * When `failClosed` is true, the function throws a RateLimitUnavailableError
 * if the distributed limiter cannot be reached, so the caller can return
 * a 503 Service Unavailable instead of silently relying on a weaker policy.
 */
async function checkRateLimitByKey(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  // Attempt distributed check first if Supabase is configured
  const supabase = getRateLimiterSupabase();
  if (supabase) {
    const distributedResult = await checkRateLimitSupabase(key, options);
    if (distributedResult) return distributedResult;

    // Distributed limiter configured but unavailable/failed
    if (options.failClosed) {
      throw new RateLimitUnavailableError(
        `Distributed rate limiter unavailable for key prefix: ${options.keyPrefix || 'global'}`
      );
    }
  } else if (options.failClosed) {
    // Gauntlet SEC-02 (user decision 2026-10-29: reject-all). The
    // distributed limiter is not configured at all — the service-role
    // key is absent. Fail-closed callers must NOT silently degrade to
    // per-instance in-memory counting here: every serverless instance
    // would mint its own bucket and multiply the cap by the instance
    // count. Reject instead; callers map this error to 503. (The
    // in-memory fallback below remains for callers that never opted
    // into failClosed — local/guest surfaces and the SEC-20 edge
    // floor are unaffected.)
    throw new RateLimitUnavailableError(
      `Distributed rate limiter not configured (service key absent) for key prefix: ${options.keyPrefix || 'global'}`
    );
  }

  // Fall back to in-process memory when Supabase is not configured
  return checkRateLimitInMemory(key, options);
}

export async function checkRateLimit(
  req: Request,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const key = `${options.keyPrefix || 'global'}:${ip}`;
  return checkRateLimitByKey(key, options);
}

/**
 * Key-based rate limit check (F-02, audit): same distributed backing
 * store as checkRateLimit, but the caller supplies the full key instead
 * of it being derived from the client IP. Used for per-actor daily AI
 * quotas, where the key is a verified account id or a server-derived
 * anonymous guest key — never a client-supplied identifier.
 */
export async function checkRateLimitForKey(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  return checkRateLimitByKey(key, options);
}

/**
 * Global (not per-IP) rate limit check sharing the same backing store.
 * Used for fleet-wide circuit breakers — e.g. the AI daily spend cap —
 * where the limit must apply across all clients and instances combined.
 */
export async function checkGlobalRateLimit(
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const key = `${options.keyPrefix || 'global'}:global`;
  return checkRateLimitByKey(key, options);
}

/**
 * Error thrown when a fail-closed rate limiter cannot reach the
 * distributed backend. Callers can catch this to return 503.
 */
export class RateLimitUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitUnavailableError';
  }
}
