/**
 * Account Deletion Verification Token Utilities
 *
 * Implements cryptographically signed, single-use, time-limited verification tokens
 * for secure account deletion by external users (e.g. users who uninstalled the app
 * or have no active session).
 *
 * Security Protections:
 * - HMAC-SHA256 cryptographic signature (prevents forgery of user IDs or emails).
 * - Time-limited expiry (default 15 minutes).
 * - Durable single-use nonce (JTI) tracking in Supabase with in-process caching to prevent replay
 *   attacks across multiple serverless function instances and container restarts.
 * - Recovery tracking for partial deletions (HTTP 207) so incomplete cleanups can be safely retried.
 * - Constant-time signature comparison to prevent timing attacks.
 * - Secret redaction in all error and diagnostic outputs.
 */

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface DeletionTokenPayload {
  sub: string; // userId
  email: string; // normalized email
  exp: number; // expiration timestamp in ms
  jti: string; // unique nonce to prevent replay
  purpose: 'account_deletion';
}

export type DeletionTokenVerificationResult =
  | { valid: true; payload: DeletionTokenPayload }
  | {
      valid: false;
      error:
        | 'INVALID_TOKEN'
        | 'TOKEN_EXPIRED'
        | 'TOKEN_ALREADY_USED'
        | 'EMAIL_MISMATCH'
        | 'REPLAY_CHECK_UNAVAILABLE';
      message: string;
    };

export type NonceStatus = 'consumed' | 'partial';

/**
 * In-memory cache of nonces: maps jti -> { status, consumedAt }.
 * Serves as fast cache and offline fallback.
 */
const inMemoryNonces = new Map<string, { status: NonceStatus; timestamp: number }>();

/**
 * Resolves the secret used to sign deletion tokens.
 *
 * Gauntlet SEC-19: the old chain fell back to the service-role key,
 * the cron secret, or APP_SECRET. Those are shared secrets with other
 * jobs: rotating or leaking either one would forge deletion tokens,
 * and token validity silently depended on unrelated config. Only a
 * dedicated secret is accepted now; with none configured, token
 * creation/verification throws instead of signing with a fallback.
 *
 * DEPLOY NOTE: SUPABASE_DELETION_SECRET must be set in the hosting
 * environment BEFORE this change ships, or deletion verification
 * breaks outright (fail-closed by design). Tokens live 15 minutes,
 * so switching secrets invalidates at most one outstanding token
 * generation window.
 */
function getSigningSecret(): string {
  const secret = process.env.SUPABASE_DELETION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'Deletion token signing secret is not configured (set SUPABASE_DELETION_SECRET). Refusing to sign with a fallback.'
    );
  }
  return secret;
}

/**
 * Periodically purge in-memory nonces older than 2 hours.
 */
function cleanupExpiredNonces() {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [jti, record] of inMemoryNonces.entries()) {
    if (record.timestamp < cutoff) {
      inMemoryNonces.delete(jti);
    }
  }
}

/**
 * Generates a signed, time-limited, single-use deletion token.
 *
 * @param userId - Verified Supabase user ID
 * @param email - Verified account email
 * @param ttlMs - Time-to-live in milliseconds (defaults to 15 minutes)
 */
export function createDeletionToken(
  userId: string,
  email: string,
  ttlMs = 15 * 60 * 1000
): string {
  if (!userId || !email) {
    throw new Error('userId and email are required to generate deletion token');
  }

  const payload: DeletionTokenPayload = {
    sub: userId,
    email: email.trim().toLowerCase(),
    exp: Date.now() + ttlMs,
    jti: crypto.randomUUID(),
    purpose: 'account_deletion',
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const secret = getSigningSecret();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');

  return `del_${payloadB64}.${signature}`;
}

/**
 * Validates a deletion verification token.
 * Checks HMAC signature, expiration, email match, and durable replay ledger.
 *
 * @param token - The raw token string
 * @param expectedEmail - Optional email to verify matching subject
 * @param dbClient - Optional Supabase client (service role) to query durable nonce ledger
 */
export async function verifyDeletionToken(
  token: string,
  expectedEmail?: string | null,
  dbClient?: SupabaseClient | null
): Promise<DeletionTokenVerificationResult> {
  if (!token || typeof token !== 'string') {
    return {
      valid: false,
      error: 'INVALID_TOKEN',
      message: 'Verification token is missing or malformed.',
    };
  }

  const cleanToken = token.trim();
  const stripped = cleanToken.startsWith('del_') ? cleanToken.slice(4) : cleanToken;
  const parts = stripped.split('.');

  if (parts.length !== 2) {
    return {
      valid: false,
      error: 'INVALID_TOKEN',
      message: 'Verification token format is invalid.',
    };
  }

  const [payloadB64, signature] = parts;
  const secret = getSigningSecret();

  // 1. Verify HMAC signature using timing-safe comparison
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return {
      valid: false,
      error: 'INVALID_TOKEN',
      message: 'Verification token signature is invalid or has been tampered with.',
    };
  }

  // 2. Decode and validate JSON payload
  let payload: DeletionTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return {
      valid: false,
      error: 'INVALID_TOKEN',
      message: 'Verification token payload cannot be decoded.',
    };
  }

  if (payload.purpose !== 'account_deletion' || !payload.sub || !payload.email) {
    return {
      valid: false,
      error: 'INVALID_TOKEN',
      message: 'Verification token has an invalid purpose or missing fields.',
    };
  }

  // 3. Expiration check
  if (Date.now() > payload.exp) {
    return {
      valid: false,
      error: 'TOKEN_EXPIRED',
      message: 'Verification token has expired. Please request a new verification link.',
    };
  }

  // 4. Replay protection (in-memory + durable database store)
  // Check memory first
  const memRecord = inMemoryNonces.get(payload.jti);
  if (memRecord && memRecord.status === 'consumed') {
    return {
      valid: false,
      error: 'TOKEN_ALREADY_USED',
      message: 'Verification token has already been used. Tokens are strictly single-use.',
    };
  }

  // Check durable Supabase ledger (across serverless restarts & instances)
  if (dbClient) {
    // Re-audit SEC-R5: the replay check fails CLOSED. When a durable
    // ledger was supplied but the read errors or throws, verification
    // is rejected outright — degrading to the per-instance memory map
    // (the old behavior) let a token consumed on another instance
    // verify again inside its window whenever the ledger hiccuped.
    // Same fail-closed doctrine as the AI limiters (SEC-02); the
    // token's HMAC + 15-minute expiry still bound everything else.
    let ledgerRow: { status?: unknown } | null = null;
    try {
      const { data, error } = await dbClient
        .from('consumed_deletion_nonces')
        .select('jti, status')
        .eq('jti', payload.jti)
        .maybeSingle();
      if (error) {
        return {
          valid: false,
          error: 'REPLAY_CHECK_UNAVAILABLE',
          message:
            'Token verification is temporarily unavailable. Please request a new verification link.',
        };
      }
      ledgerRow = data;
    } catch {
      return {
        valid: false,
        error: 'REPLAY_CHECK_UNAVAILABLE',
        message:
          'Token verification is temporarily unavailable. Please request a new verification link.',
      };
    }

    if (ledgerRow) {
      const data = ledgerRow as { status?: NonceStatus };
      // Cache locally for subsequent calls
      inMemoryNonces.set(payload.jti, {
        status: (data.status as NonceStatus) || 'consumed',
        timestamp: Date.now(),
      });

      if (data.status === 'consumed') {
        return {
          valid: false,
          error: 'TOKEN_ALREADY_USED',
          message: 'Verification token has already been used. Tokens are strictly single-use.',
        };
      }
      // If data.status === 'partial', we explicitly ALLOW retry to complete incomplete deletion!
    }
  }

  // 5. Email matching check (if expectedEmail provided)
  if (expectedEmail) {
    const normalizedExpected = expectedEmail.trim().toLowerCase();
    if (payload.email !== normalizedExpected) {
      return {
        valid: false,
        error: 'EMAIL_MISMATCH',
        message: 'The provided email address does not match the verification token.',
      };
    }
  }

  return { valid: true, payload };
}

/**
 * Records a token's unique nonce (jti) in the durable ledger and memory cache.
 *
 * @param jti - Token unique identifier
 * @param payload - Token payload details
 * @param status - 'consumed' for full deletion, 'partial' when some cleanup failed
 * @param dbClient - Optional Supabase service-role client for durable storage
 */
export async function consumeDeletionNonce(
  jti: string,
  payload: DeletionTokenPayload,
  status: NonceStatus = 'consumed',
  dbClient?: SupabaseClient | null
): Promise<void> {
  // 1. Update in-memory cache
  inMemoryNonces.set(jti, { status, timestamp: Date.now() });
  cleanupExpiredNonces();

  // 2. Persist to durable database store if available
  if (dbClient) {
    const isConsumed = status === 'consumed';
    const { error } = await dbClient.from('consumed_deletion_nonces').upsert(
      {
        jti,
        // Anonymize personal identifiers upon successful deletion; preserve only for partial recovery
        user_id: isConsumed ? null : payload.sub,
        email: isConsumed ? null : payload.email,
        status,
        consumed_at: new Date().toISOString(),
        expires_at: new Date(payload.exp).toISOString(),
      },
      { onConflict: 'jti' }
    );
    if (error) {
      console.warn('Failed to record deletion nonce to durable ledger:', error.message);
      throw new Error(`Durable nonce ledger write failed: ${error.message}`);
    }
  }
}

/**
 * Checks whether a nonce is already consumed in memory or database.
 */
export async function isNonceConsumed(
  jti: string,
  dbClient?: SupabaseClient | null
): Promise<boolean> {
  const mem = inMemoryNonces.get(jti);
  if (mem && mem.status === 'consumed') return true;

  if (dbClient) {
    try {
      const { data } = await dbClient
        .from('consumed_deletion_nonces')
        .select('status')
        .eq('jti', jti)
        .maybeSingle();
      if (data && data.status === 'consumed') return true;
    } catch {
      // Ignore
    }
  }

  return false;
}

/**
 * Resets the in-memory nonces store. Used strictly in test suites.
 */
export function resetConsumedNoncesForTests(): void {
  inMemoryNonces.clear();
}
