import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { RateLimitUnavailableError, checkRateLimit } from '@/lib/rate-limit';
import { getServerGeminiApiKey, rateLimitResponse, rateLimitUnavailableResponse, redactSecrets } from '@/lib/server-security';

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

  try {
    const body = await req.json();
    const rawTranscript = body?.transcript?.trim();
    const fallbackExercise = String(body?.currentExercise || 'Unknown').slice(0, 100);
    const userUnit = body?.userUnit === 'lbs' ? 'lbs' : 'kg';

    if (!rawTranscript) {
      return NextResponse.json({ error: 'NO_TRANSCRIPT', message: 'No voice transcript provided' }, { status: 400 });
    }

    // 2. Bound transcript length to 1000 characters
    const transcript = rawTranscript.slice(0, 1000);

    const apiKey = getServerGeminiApiKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'NO_API_KEY',
          message: 'Voice recognition is temporarily unavailable. Please enter workout details manually.',
        },
        { status: 503 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const candidateModels = [
      'gemini-1.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-2.0-flash-lite',
    ];

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

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: `Transcript: "${transcript}"` }] }],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });

        const rawText = response.text?.trim() || '{}';
        const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        parsed = JSON.parse(cleanJson);
        if (parsed && typeof parsed.weight === 'number' && typeof parsed.reps === 'number' && parsed.reps > 0) {
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (!parsed || typeof parsed.reps !== 'number' || parsed.reps <= 0) {
      return NextResponse.json({
        error: 'PARSE_FAILED',
        message: lastError?.message || 'Could not extract valid weight and reps',
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
    const rawMsg = err?.message || 'Failed to parse voice';
    return NextResponse.json({ error: 'AI_PARSE_FAILED', message: redactSecrets(rawMsg) }, { status: 500 });
  }
}
