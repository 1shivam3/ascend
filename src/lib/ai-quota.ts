/**
 * Per-actor daily AI quotas (audit F-02, brief option A).
 *
 * Problem: the four AI routes were unauthenticated with only per-IP
 * per-minute limits and one shared 500/day global cap. A distributed
 * caller could burn the whole day's cap in minutes, denying AI to every
 * legitimate user, and the provider bill for those calls is the
 * project's. The routes do NOT read the database, so this is about who
 * may spend quota — not about stored-data leakage.
 *
 * Scheme (three layers, all enforced before any provider call):
 *  1. Per-minute per-IP limits — unchanged, already in each route.
 *  2. Per-actor DAILY quotas (this module): signed-in users get a higher
 *     per-account cap; guests get a lower cap. Both share the same
 *     distributed backing store as the per-minute limiter
 *     (api_rate_limits via checkRateLimitForKey), so the caps hold
 *     across serverless instances.
 *  3. Shared 500/day global cap — unchanged, enforced inside the
 *     provider layer (assertAiDailyBudget) as the fleet backstop.
 *
 * Actor identity — the anti-spoofing rule, read this before touching
 * this file: the actor NEVER comes from the request body, query string,
 * cookies, or any client-chosen header (x-user-id and friends are
 * ignored outright). Exactly two sources exist:
 *  - a Bearer token VERIFIED via Supabase auth.getUser → per-account
 *    quota keyed by the verified uid;
 *  - a missing token → a guest key the SERVER derives as sha256(ip);
 *  - a present-but-unverifiable token → 401 (gauntlet R7, fail closed;
 *    never a silent guest downgrade).
 *    The guest key is a quota bucket, not an identity: users behind one
 *    NAT share it, and a guest who rotates IPs gets a fresh bucket.
 *    That is acceptable for a low guest tier, and the per-minute IP
 *    limits plus the global cap still bound a distributed guest attack
 *    (it now needs many more actors to exhaust the day than before).
 *    Gauntlet SEC-01: the key used to be sha256(ip + UA), but the
 *    User-Agent is attacker-controlled, so rotating it minted a fresh
 *    daily bucket per request and one IP could burn the shared 500/day
 *    fleet cap. UA no longer participates in the key at all.
 *
 * Residual risk (documented, not hidden): a sufficiently distributed
 * caller can still exhaust the shared 500/day global cap, since the
 * global cap is a single pool. Per-actor caps raise the cost of that
 * attack from one IP to many actors; they do not make it impossible.
 * Alerting on global-cap exhaustion is the recommended complement.
 *
 * Tuning: AI_DAILY_SIGNED_IN_CAP / AI_DAILY_GUEST_CAP env vars override
 * the defaults below when they parse to a positive integer. The window
 * is an anchored fixed 24h window (same semantics as the per-minute
 * limiter, gauntlet SEC-24), not a calendar day.
 */

import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  checkRateLimitForKey,
  getClientIp,
} from './rate-limit';

export const AI_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_AI_QUOTA_SIGNED_IN_DAILY = 50;
export const DEFAULT_AI_QUOTA_GUEST_DAILY = 10;

function envCap(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return fallback;
}

export function getAiQuotaSignedInDaily(): number {
  return envCap('AI_DAILY_SIGNED_IN_CAP', DEFAULT_AI_QUOTA_SIGNED_IN_DAILY);
}

export function getAiQuotaGuestDaily(): number {
  return envCap('AI_DAILY_GUEST_CAP', DEFAULT_AI_QUOTA_GUEST_DAILY);
}

export type AiActor = { kind: 'user'; userId: string } | { kind: 'guest'; guestKey: string };

/**
 * Pure actor-key derivation. Takes ONLY a verified uid (or null) plus
 * the server-observed IP. There is deliberately no parameter for a
 * client-claimed identity: a caller cannot influence its quota bucket
 * by sending an id, because no such input exists. Gauntlet SEC-01: the
 * User-Agent used to be mixed into the guest key, but it is
 * attacker-controlled, so it is no longer read here at all — rotating
 * it must not mint a fresh bucket.
 */
export function deriveAiActorKey(input: {
  verifiedUserId: string | null;
  ip: string;
}): AiActor {
  if (input.verifiedUserId) {
    return { kind: 'user', userId: input.verifiedUserId };
  }
  // The guest key is a quota bucket, not an identity: sha256 of the
  // server-observed IP only. No client input participates.
  const digest = createHash('sha256').update(input.ip).digest('hex');
  return { kind: 'guest', guestKey: digest };
}

export function aiActorQuotaKey(actor: AiActor): string {
  return actor.kind === 'user' ? `ai-daily:user:${actor.userId}` : `ai-daily:guest:${actor.guestKey}`;
}

export function aiActorDailyLimit(actor: AiActor): number {
  return actor.kind === 'user' ? getAiQuotaSignedInDaily() : getAiQuotaGuestDaily();
}

/** Minimal client shape resolveAiActor needs; injectable for tests. */
export interface AiActorVerifier {
  auth: {
    getUser: (token: string) => Promise<{ data: { user: { id: string } | null } }>;
  };
}

function getVerifierClient(): AiActorVerifier | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  try {
    // Anon key only: token verification needs no privilege, and the
    // service-role key must never be used for caller authentication.
    return createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as unknown as AiActorVerifier;
  } catch {
    return null;
  }
}

/**
 * Thrown when a request carries a Bearer token that cannot be verified
 * (invalid, expired, or unverifiable). Gauntlet R7: a present-but-bad
 * token must fail closed with 401 — it must NOT silently fall back to
 * the guest quota bucket, which let a caller with a dead session spend
 * guest quota and masked auth failures. Routes map this to 401.
 */
export class AiActorAuthError extends Error {
  constructor(message = 'Invalid or expired session token. Sign in again to continue.') {
    super(message);
    this.name = 'AiActorAuthError';
  }
}

/**
 * Resolve the calling actor for one request. Bearer token, when present
 * and valid, wins. A MISSING token means guest (server-derived key).
 * A PRESENT token that fails verification — invalid, expired, or
 * unverifiable because no verifier client exists — throws
 * AiActorAuthError (gauntlet R7, fail closed). Forged identity headers
 * and body fields are never read here.
 */
export async function resolveAiActor(
  req: Request,
  clientOverride?: AiActorVerifier | null,
): Promise<AiActor> {
  const ip = getClientIp(req);
  const authHeader = req.headers.get('authorization');
  let verifiedUserId: string | null = null;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) {
      let verified = false;
      try {
        const client = clientOverride !== undefined ? clientOverride : getVerifierClient();
        const { data } = await (client?.auth.getUser(token) as Promise<{
          data: { user: { id: string } | null };
        }>);
        if (data?.user?.id) {
          verifiedUserId = data.user.id;
          verified = true;
        }
      } catch {
        verified = false;
      }
      if (!verified) {
        throw new AiActorAuthError();
      }
    }
  }
  return deriveAiActorKey({ verifiedUserId, ip });
}

export interface AiQuotaCheck {
  allowed: boolean;
  actor: AiActor;
  limit: number;
  remaining: number;
  resetMs: number;
}

/**
 * Enforce the per-actor daily quota for one AI call. Call AFTER the
 * per-minute IP check and BEFORE body parsing / provider calls, so a
 * denied call consumes nothing downstream. A denied call DOES consume
 * one daily slot on the way in (same property as the per-minute
 * limiter); the slot is claimed by this check itself.
 *
 * Throws RateLimitUnavailableError when the limiter backend is down and
 * the route is fail-closed — callers map that to 503, exactly like the
 * per-minute check.
 */
export async function checkAiDailyQuota(
  req: Request,
  clientOverride?: AiActorVerifier | null,
): Promise<AiQuotaCheck> {
  const actor = await resolveAiActor(req, clientOverride);
  const limit = aiActorDailyLimit(actor);
  // Fail-closed propagation: a limiter-backend outage throws
  // RateLimitUnavailableError, which callers map to 503 exactly like
  // the per-minute check.
  const result = await checkRateLimitForKey(aiActorQuotaKey(actor), {
    windowMs: AI_QUOTA_WINDOW_MS,
    maxRequests: limit,
    keyPrefix: 'ai-daily',
    failClosed: true,
  });
  return {
    allowed: result.success,
    actor,
    limit,
    remaining: result.remaining,
    resetMs: result.resetMs,
  };
}

/**
 * Honest exhaustion response: 429 naming the daily quota (not a vague
 * "slow down"), with reset timing and, for guests, the real remedy —
 * sign in for a higher daily limit. Never a fake success.
 */
export function aiQuotaExceededResponse(actor: AiActor, resetMs: number): NextResponse {
  const retryAfterSec = Math.ceil(resetMs / 1000) || 1;
  const limit = aiActorDailyLimit(actor);
  const message =
    actor.kind === 'guest'
      ? `Daily AI limit reached for guests (${limit} requests per 24 hours). Sign in for a higher daily limit. AI features resume when the window resets.`
      : `Daily AI limit reached (${limit} requests per 24 hours). AI features resume when the window resets.`;
  return NextResponse.json(
    {
      error: 'AI_QUOTA_EXCEEDED',
      message,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Reset': String(Math.ceil((Date.now() + resetMs) / 1000)),
      },
    },
  );
}
