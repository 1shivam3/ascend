/**
 * Server-Side Security Utilities for ASCEND API Routes
 * Secure credential retrieval, secret redaction, and standard security responses.
 */

import { NextResponse } from 'next/server';

/**
 * Resolves the server-side Gemini API key securely from environment variables.
 * Never attempts filesystem reads at runtime; never logs or prints the key.
 */
export function getServerGeminiApiKey(): string | undefined {
  const envKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (envKey && envKey.length > 5) {
    return envKey;
  }
  return undefined;
}

/**
 * Redacts any potential API keys, tokens, or credentials from error strings or logs.
 */
export function redactSecrets(message: string): string {
  if (!message) return '';
  return message
    .replace(/AIzaSy[A-Za-z0-9_-]{33}/g, '[REDACTED_API_KEY]')
    .replace(/re_[A-Za-z0-9_-]+/g, '[REDACTED_API_KEY]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/((?:api_?key|key|token|secret|password)\s*[:=]\s*)["']?[A-Za-z0-9_.-]+["']?/gi, '$1[REDACTED]')
    .replace(/del_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_TOKEN]')
    .replace(/bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer [REDACTED]');
}

/**
 * Returns a standard 429 Too Many Requests response with Retry-After header.
 */
export function rateLimitResponse(resetMs: number): NextResponse {
  const retryAfterSec = Math.ceil(resetMs / 1000) || 1;
  return NextResponse.json(
    {
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests. Please slow down and try again in ${retryAfterSec} seconds.`,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Reset': String(Math.ceil((Date.now() + resetMs) / 1000)),
      },
    }
  );
}

/**
 * Returns a 503 Service Unavailable response when the rate limiter
 * infrastructure is unavailable. This is used for fail-closed behavior
 * on expensive operations to prevent uncontrolled backend costs.
 */
export function rateLimitUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'SERVICE_UNAVAILABLE',
      message:
        'Rate limiting service is temporarily unavailable. Please try again later.',
    },
    { status: 503 }
  );
}
