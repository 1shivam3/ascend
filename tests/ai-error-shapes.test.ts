/**
 * Task 2.3 (2026-11-05): AI error-shape consistency on the EXISTING
 * quota infrastructure. The architecture was already sound (server-
 * only keys — verified by grepping the production client bundle:
 * zero hits for key patterns, env names, or provider URLs — plus a
 * shared Supabase-RPC daily quota). The gaps were consistency:
 *  1. The fleet-wide daily cap (AiGlobalCapExceededError) surfaced
 *     as 500 GEMINI_ERROR on /api/ai/coach and as 422 PARSE_FAILED
 *     on /api/ai/parse-voice; coach-chat already returned the
 *     correct 429 {error:'AI_DAILY_CAP'}. Both routes now match it.
 *  2. parse-meal logged the RAW provider Error object (every sibling
 *     logs redactSecrets(message) only).
 *  3. A scan that hit the daily quota lost the remedy copy:
 *     toUserMessage had no branch for AI_QUOTA_EXCEEDED/AI_DAILY_CAP,
 *     so the error fell through to the generic scan fallback. The
 *     branch must also precede the DEVICE-storage 'quota' branch.
 *  4. The coach route's prompt-bound nested arrays
 *     (command.activeWorkout, completedWorkout) were capped only by
 *     the 64 KB body limit; they are now sliced to 50/50 like
 *     parse-meal's MAX_MEAL_ITEMS precedent.
 * Only the limiter, quota and provider layers are mocked; error
 * mapping, redaction and capping run for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const behavior = vi.hoisted(() => ({
  mode: 'cap' as 'cap' | 'capture',
  capturedPrompt: '' as string,
}));

vi.mock('@/lib/ai-provider', () => ({
  AiGlobalCapExceededError: class AiGlobalCapExceededError extends Error {
    constructor(cap = 500) {
      super(`Daily AI cap of ${cap} requests reached across all users.`);
      this.name = 'AiGlobalCapExceededError';
    }
  },
  executeMultiProviderText: vi.fn(async (args: { prompt: string }) => {
    if (behavior.mode === 'capture') {
      behavior.capturedPrompt = args.prompt;
      throw new Error('capture complete');
    }
    // 'cap' mode: throw the fleet-cap error. Imported lazily from the
    // mocked module itself so instanceof in the routes matches.
    const mod = await import('@/lib/ai-provider');
    throw new mod.AiGlobalCapExceededError(500);
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ success: true, resetMs: 0 })),
  checkRateLimitForKey: vi.fn(async () => ({ success: true, resetMs: 0 })),
  getClientIp: () => '127.0.0.1',
  RateLimitUnavailableError: class RateLimitUnavailableError extends Error {},
}));

vi.mock('@/lib/ai-quota', () => ({
  checkAiDailyQuota: vi.fn(async () => ({
    allowed: true,
    actor: { kind: 'guest', guestKey: 'test' },
    limit: 10,
    remaining: 9,
    resetMs: 0,
  })),
  aiQuotaExceededResponse: vi.fn(() => new Response('quota', { status: 429 })),
  AiActorAuthError: class AiActorAuthError extends Error {},
}));

import { POST as coachPOST } from '../src/app/api/ai/coach/route';
import { POST as voicePOST } from '../src/app/api/ai/parse-voice/route';
import { toUserMessage } from '../src/lib/user-error';

const jsonReq = (url: string, body: unknown) =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('fleet-cap error shape (Task 2.3)', () => {
  beforeEach(() => {
    behavior.mode = 'cap';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('coach route: global cap → 429 AI_DAILY_CAP (not 500 GEMINI_ERROR)', async () => {
    const res = await coachPOST(
      jsonReq('http://test.local/api/ai/coach', { task: 'COACH_INSIGHT', userContext: 'ctx' }),
    );
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('AI_DAILY_CAP');
  });

  it('parse-voice route: global cap → 429 AI_DAILY_CAP (not 422 PARSE_FAILED)', async () => {
    const res = await voicePOST(
      jsonReq('http://test.local/api/ai/parse-voice', {
        transcript: 'bench 80 pe 5',
        currentExercise: 'Bench Press',
      }),
    );
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('AI_DAILY_CAP');
  });

  it('coach route: prompt-bound arrays are capped at 50 exercises / 50 sets', async () => {
    behavior.mode = 'capture';
    const manySets = Array.from({ length: 60 }, () => ({ reps: 5, weight: 100, unit: 'kg' }));
    const exercises = Array.from({ length: 60 }, (_, i) => ({
      name: `Ex${i}`,
      sets: i === 0 ? manySets : [{ reps: 5, weight: 50, unit: 'kg' }],
    }));
    const res = await coachPOST(
      jsonReq('http://test.local/api/ai/coach', {
        task: 'WORKOUT_COMMAND',
        command: { instruction: 'make it harder', activeWorkout: { name: 'W', exercises } },
      }),
    );
    // The provider mock throws after capture, so the route 500s —
    // what matters is the prompt it built.
    expect(res.status).toBe(500);
    const prompt = behavior.capturedPrompt;
    expect(prompt).toContain('Active Workout:');
    // One "sets" key per exercise object: 60 in → 50 after the cap.
    expect((prompt.match(/"sets"/g) || []).length).toBe(50);
    // Total set entries: first exercise capped 60→50, plus 49 × 1.
    expect((prompt.match(/"reps"/g) || []).length).toBe(99);
  });
});

describe('toUserMessage AI quota branch (Task 2.3)', () => {
  const quotaErr = {
    code: 'AI_QUOTA_EXCEEDED',
    status: 429,
    message: 'Daily AI limit reached for guests (10 requests per 24 hours). Sign in for a higher daily limit.',
  };

  it('scan context: the sign-in remedy survives (was the generic fallback)', () => {
    const out = toUserMessage(quotaErr, 'scan', false);
    expect(out).toContain('scan limit');
    expect(out).toContain('signing in raises the limit');
    expect(out).not.toContain('could not be read');
  });

  it('AI_DAILY_CAP gets the same remedy copy in generic context', () => {
    const out = toUserMessage({ code: 'AI_DAILY_CAP', status: 429 }, 'generic', false);
    expect(out).toContain("today's AI limit");
  });

  it('device-storage QuotaExceededError still maps to the storage copy (branch order)', () => {
    const err = new Error('storage is full');
    err.name = 'QuotaExceededError';
    expect(toUserMessage(err, 'scan', false)).toContain('low on memory or storage');
  });
});

describe('parse-meal log redaction (Task 2.3)', () => {
  it('the fallback warn logs the redacted message, never the raw Error object', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/ai/parse-meal/route.ts'),
      'utf8',
    );
    expect(src).toContain('redactSecrets(modelErr');
    expect(src).not.toContain("heuristics:', modelErr)");
  });

  it('coach route no longer imports the unused Gemini key getter', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/ai/coach/route.ts'),
      'utf8',
    );
    expect(src).not.toContain('getServerGeminiApiKey');
  });
});
