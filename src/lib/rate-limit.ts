/**
 * Server-Side Rate Limiter for Next.js API Routes
 *
 * Implements a sliding-window counter with a Supabase-backed distributed
 * store so that limits are enforced consistently across serverless function
 * instances. Falls back to in-process memory when Supabase is unavailable
 * (e.g. offline mode or local development without credentials).
 *
 * Prevents API quota exhaustion, DoS attacks, and credential stuffing.
 */

import { createClient } from '@supabase/supabase-js';
import { getSupabaseCredentials } from './supabase/config';

interface RateLimitRecord {
  timestamps: number[];
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

  const { url, anonKey, isConfigured } = getSupabaseCredentials();
  if (!isConfigured || !url || !anonKey) return null;

  try {
    supabaseRateLimiter = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    supabaseRateLimiter = null;
  }
  return supabaseRateLimiter;
}

// Cleanup stale in-memory rate limit entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      const recent = record.timestamps.filter((ts) => now - ts < 10 * 60 * 1000);
      if (recent.length === 0) {
        rateLimitStore.delete(key);
      } else {
        record.timestamps = recent;
      }
    }
  }, CLEANUP_INTERVAL_MS).unref?.();
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  /** When true, returns 503 if distributed rate limiter is unavailable */
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
  const cfConnectingIp = req.headers.get('cf-connecting-ip')?.trim();
  if (cfConnectingIp && isValidIpFormat(cfConnectingIp)) return cfConnectingIp;

  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp && isValidIpFormat(realIp)) return realIp;

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]?.trim();
    if (firstIp && isValidIpFormat(firstIp)) return firstIp;
  }

  return '127.0.0.1';
}

/**
 * In-process sliding window rate limit check (fallback when Supabase is unavailable).
 */
function checkRateLimitInMemory(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const windowStart = now - options.windowMs;

  let record = rateLimitStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    rateLimitStore.set(key, record);
  }

  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  if (record.timestamps.length >= options.maxRequests) {
    const oldestTimestamp = record.timestamps[0] || now;
    const resetMs = Math.max(0, oldestTimestamp + options.windowMs - now);
    return {
      success: false,
      limit: options.maxRequests,
      remaining: 0,
      resetMs,
    };
  }

  record.timestamps.push(now);
  return {
    success: true,
    limit: options.maxRequests,
    remaining: Math.max(0, options.maxRequests - record.timestamps.length),
    resetMs: options.windowMs,
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
export async function checkRateLimit(
  req: Request,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const key = `${options.keyPrefix || 'global'}:${ip}`;

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
  }

  // Fall back to in-process memory when Supabase is not configured
  return checkRateLimitInMemory(key, options);
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
