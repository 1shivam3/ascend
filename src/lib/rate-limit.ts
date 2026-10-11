/**
 * Server-Side Rate Limiter for Next.js API Routes
 * Sliding window token bucket algorithm implemented in memory.
 * Prevents API quota exhaustion, DoS attacks, and credential stuffing.
 */

interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Cleanup stale rate limit entries every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      // Keep only timestamps from the last 10 minutes
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
  windowMs: number; // Duration of window in ms (e.g., 60,000 for 1 minute)
  maxRequests: number; // Maximum requests permitted within windowMs
  keyPrefix?: string; // Namespace for different routes
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

/**
 * Extracts the real client IP from standard reverse proxy headers.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const cfConnectingIp = req.headers.get('cf-connecting-ip')?.trim();
  if (cfConnectingIp) return cfConnectingIp;
  return '127.0.0.1';
}

/**
 * Checks whether the incoming request is within the allowed rate limit.
 */
export function checkRateLimit(
  req: Request,
  options: RateLimitOptions
): RateLimitResult {
  const ip = getClientIp(req);
  const key = `${options.keyPrefix || 'global'}:${ip}`;
  const now = Date.now();
  const windowStart = now - options.windowMs;

  let record = rateLimitStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    rateLimitStore.set(key, record);
  }

  // Filter timestamps within current sliding window
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
