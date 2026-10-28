import { NextResponse } from 'next/server';
import { RateLimitUnavailableError, checkRateLimit } from '@/lib/rate-limit';
import { checkAiDailyQuota, aiQuotaExceededResponse } from '@/lib/ai-quota';
import { executeMultiProviderText } from '@/lib/ai-provider';
import { rateLimitResponse, rateLimitUnavailableResponse, readJsonBodyWithLimit, RequestBodyTooLargeError, requestBodyTooLargeResponse, redactSecrets } from '@/lib/server-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // 1. Rate limiting: 25 requests per minute per client IP
  let rateLimit;
  try {
    rateLimit = await checkRateLimit(req, {
      windowMs: 60 * 1000,
      maxRequests: 25,
      keyPrefix: 'ai-parse-voice',
      failClosed: true,
    });
  } catch (err) {
    if (err instanceof RateLimitUnavailableError) {
      return rateLimitUnavailableResponse();
    }
    throw err;
  }

  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit.resetMs);
  }

  // F-02 (audit): per-actor daily AI quota — signed-in users get a
  // higher cap, guests a lower one; the shared 500/day global cap
  // remains the fleet backstop inside the provider layer. Enforced
  // before body parsing so a denied call consumes nothing downstream.
  try {
    const quota = await checkAiDailyQuota(req);
    if (!quota.allowed) {
      return aiQuotaExceededResponse(quota.actor, quota.resetMs);
    }
  } catch (err) {
    if (err instanceof RateLimitUnavailableError) {
      return rateLimitUnavailableResponse();
    }
    throw err;
  }

  try {
    // Hard body cap (QA4-033): the transcript is bounded to 1,000 chars.
    const body = await readJsonBodyWithLimit(req, 4 * 1024);
    const rawTranscript = body?.transcript?.trim();
    const fallbackExercise = String(body?.currentExercise || 'Unknown').slice(0, 100);
    const userUnit = body?.userUnit === 'lbs' ? 'lbs' : 'kg';

    if (!rawTranscript) {
      return NextResponse.json({ error: 'NO_TRANSCRIPT', message: 'No voice transcript provided' }, { status: 400 });
    }

    // 2. Bound transcript length to 1000 characters
    const transcript = rawTranscript.slice(0, 1000);


    const systemPrompt = `You are a powerlifting and strength training voice assistant specializing in Hinglish and Indian gym slang.
Extract structured set data from spoken audio transcript.
Common Hinglish speech patterns:
- "bench 80 pe 5" or "80 pay 5" -> Exercise: Bench Press, Weight: 80, Reps: 5
- "80 ke 5" or "80 ka 5" or "80 me 5" -> Weight: 80, Reps: 5
- "squat 140 kilo 3 rep rpe 9" -> Exercise: Squat, Weight: 140, Reps: 3, RPE: 9
- "aaj 90 mara 4 baar rpe 8" -> Weight: 90, Reps: 4, RPE: 8
- "100 pe single" -> Weight: 100, Reps: 1
- "5 rep 80 kg" -> Weight: 80, Reps: 5
- "assi pe paanch" -> Weight: 80, Reps: 5
- "bodyweight 10 rep" -> Weight: 0, Reps: 10
- Current active exercise context is "${fallbackExercise}". Default unit is "${userUnit}".

Respond with ONLY raw JSON matching this schema:
{
  "exerciseName": string or null,
  "weight": number,
  "reps": number,
  "rpe": number or null,
  "setIndex": number or null
}`;

    let parsed: any = null;
    let lastError: any = null;

    try {
      const execResult = await executeMultiProviderText<any>({
        prompt: `Transcript: "${transcript}"`,
        systemPrompt,
        timeoutMs: 15000,
      });
      parsed = execResult.data;
    } catch (err: any) {
      lastError = err;
    }

    if (!parsed || typeof parsed.reps !== 'number' || parsed.reps <= 0) {
      return NextResponse.json({
        error: 'PARSE_FAILED',
        // Gauntlet SEC-15: the 500 path below redacts, but this path
        // returned the raw provider error verbatim.
        message: redactSecrets(lastError?.message || 'Could not extract valid weight and reps'),
      }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      result: {
        exerciseName: parsed.exerciseName || fallbackExercise,
        weight: typeof parsed.weight === 'number' ? parsed.weight : 0,
        reps: typeof parsed.reps === 'number' ? parsed.reps : 0,
        rpe: typeof parsed.rpe === 'number' ? parsed.rpe : undefined,
        setIndex: typeof parsed.setIndex === 'number' ? parsed.setIndex : undefined,
      },
    });
  } catch (err: any) {
    if (err instanceof RequestBodyTooLargeError) {
      return requestBodyTooLargeResponse();
    }
    const rawMsg = err?.message || 'Failed to parse voice';
    return NextResponse.json({ error: 'AI_PARSE_FAILED', message: redactSecrets(rawMsg) }, { status: 500 });
  }
}
