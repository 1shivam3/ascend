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
 * Resolves the server-side Groq API key securely from environment variables.
 */
export function getServerGroqApiKey(): string | undefined {
  const envKey = process.env.GROQ_API_KEY?.trim();
  if (envKey && envKey.length > 5) {
    return envKey;
  }
  return undefined;
}

/**
 * Resolves the server-side OpenRouter API key securely from environment variables.
 */
export function getServerOpenRouterApiKey(): string | undefined {
  const envKey = process.env.OPENROUTER_API_KEY?.trim();
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
    .replace(/gsk_[A-Za-z0-9_-]+/g, '[REDACTED_API_KEY]')
    .replace(/sk-or-[A-Za-z0-9_-]+/g, '[REDACTED_API_KEY]')
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
 * Thrown when a request body exceeds the route's maximum allowed size.
 * Routes catch this to return a 413 Payload Too Large response.
 */
export class RequestBodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Request body exceeds maximum allowed size of ${maxBytes} bytes`);
    this.name = 'RequestBodyTooLargeError';
  }
}

/**
 * Reads a request body through a counting stream reader that aborts
 * past the cap (gauntlet SEC-11). The old implementation did
 * `await req.text()` THEN measured length, so an oversized body was
 * fully buffered before rejection; chunked bodies (no
 * content-length) bypassed the declared-length pre-checks entirely.
 * This reads chunk by chunk and cancels the stream as soon as the
 * cap is exceeded, so at most cap + one chunk is ever buffered.
 * Falls back to req.text() when the request has no stream body
 * (GET requests, some test doubles).
 */
export async function readBytesBodyWithLimit(req: Request, maxBytes: number): Promise<Uint8Array> {
  const stream = (req as unknown as { body?: ReadableStream<Uint8Array> | null }).body;
  if (!stream || typeof stream.getReader !== 'function') {
    const text = await req.text();
    if (new TextEncoder().encode(text).length > maxBytes) {
      throw new RequestBodyTooLargeError(maxBytes);
    }
    return new TextEncoder().encode(text);
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            // Best effort: the throw below is the signal.
          }
          throw new RequestBodyTooLargeError(maxBytes);
        }
        chunks.push(value);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Already cancelled or released.
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/** Streaming text-body read with the same cap semantics. */
export async function readTextBodyWithLimit(req: Request, maxBytes: number): Promise<string> {
  return new TextDecoder().decode(await readBytesBodyWithLimit(req, maxBytes));
}

/**
 * Streaming multipart read with a byte cap. formData() buffers the
 * whole body before any file-size cap can run, so chunked multipart
 * uploads bypassed the scan-meal 10 MB file cap. This streams with
 * the cap first (at most cap + one chunk buffered), then parses the
 * buffered bytes — the parse itself never sees more than the cap.
 */
export async function readMultipartFormDataWithLimit(req: Request, maxBytes: number): Promise<FormData> {
  const bytes = await readBytesBodyWithLimit(req, maxBytes);
  const contentType = req.headers.get('content-type') || '';
  const reparsed = new Request(req.url, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: bytes as unknown as BodyInit,
  });
  return reparsed.formData();
}

/**
 * Reads and JSON-parses a request body with a hard byte cap, so oversized
 * payloads are rejected before parsing instead of being buffered whole
 * (QA4-033). Returns the parsed value ({} for an empty body). The cap
 * is enforced while streaming (SEC-11), not after a full read.
 */
export async function readJsonBodyWithLimit<T = any>(req: Request, maxBytes: number): Promise<T> {
  const text = await readTextBodyWithLimit(req, maxBytes);
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

/** Standard 413 response for oversized request bodies. */
export function requestBodyTooLargeResponse(): NextResponse {
  return NextResponse.json(
    { error: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
    { status: 413 }
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
