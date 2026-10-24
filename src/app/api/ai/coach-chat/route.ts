import { NextResponse } from 'next/server';
import { AiGlobalCapExceededError, executeMultiProviderText } from '@/lib/ai-provider';
import {
  buildCoachChatSystemPrompt,
  COACH_CHAT_BODY_LIMIT,
  COACH_CHAT_DAILY_CAP,
  COACH_CHAT_MAX_HISTORY_TURNS,
  COACH_CHAT_MAX_MESSAGE_CHARS,
  COACH_CHAT_MINUTE_CAP,
  COACH_CHAT_PROVIDER_TIMEOUT_MS,
  COACH_CHAT_REFER_OUT,
  detectSafetyStop,
  formatHistoryForPrompt,
  sanitizeHistory,
  truncateReply,
} from '@/lib/coach-chat';
import { RateLimitUnavailableError, checkRateLimit } from '@/lib/rate-limit';
import {
  rateLimitUnavailableResponse,
  readJsonBodyWithLimit,
  RequestBodyTooLargeError,
  requestBodyTooLargeResponse,
  redactSecrets,
} from '@/lib/server-security';

export const runtime = 'nodejs';

interface CoachChatRequestBody {
  message?: unknown;
  history?: unknown;
  language?: unknown;
  context?: {
    contextText?: unknown;
    evidence?: unknown;
    hasData?: unknown;
  };
}

async function enforceLimit(
  req: Request,
  opts: { windowMs: number; maxRequests: number; keyPrefix: string; errorCode: string }
): Promise<{ ok: true; remaining: number } | { ok: false; response: Response }> {
  let result;
  try {
    result = await checkRateLimit(req, { ...opts, failClosed: true });
  } catch (err) {
    if (err instanceof RateLimitUnavailableError) {
      return { ok: false, response: rateLimitUnavailableResponse() };
    }
    throw err;
  }
  if (!result.success) {
    // Distinct code so the client can tell a burst limit from the daily cap.
    return { ok: false, response: NextResponse.json({ error: opts.errorCode }, { status: 429 }) };
  }
  return { ok: true, remaining: result.remaining };
}

export async function POST(req: Request) {
  // 1. Burst limit: 10 messages/minute per IP (fail closed on limiter outage).
  const minute = await enforceLimit(req, {
    windowMs: 60 * 1000,
    maxRequests: COACH_CHAT_MINUTE_CAP,
    keyPrefix: 'coach-chat',
    errorCode: 'RATE_LIMIT',
  });
  if (!minute.ok) return minute.response;

  // 2. Daily per-user cap: 30 messages/24h per IP (guest mode has no account
  // identity, so the IP is the user key — same pattern as the other routes).
  const daily = await enforceLimit(req, {
    windowMs: 24 * 60 * 60 * 1000,
    maxRequests: COACH_CHAT_DAILY_CAP,
    keyPrefix: 'coach-chat-daily',
    errorCode: 'DAILY_CAP',
  });
  if (!daily.ok) return daily.response;

  try {
    const body: CoachChatRequestBody = await readJsonBodyWithLimit(req, COACH_CHAT_BODY_LIMIT);

    const rawMessage = typeof body.message === 'string' ? body.message.trim() : '';
    if (rawMessage.length === 0 || rawMessage.length > COACH_CHAT_MAX_MESSAGE_CHARS) {
      return NextResponse.json({ error: 'INVALID_MESSAGE' }, { status: 400 });
    }

    const language = body.language === 'hi' ? 'hi' : 'en';
    const history = sanitizeHistory(body.history).slice(-COACH_CHAT_MAX_HISTORY_TURNS);

    const rawContext = body.context && typeof body.context === 'object' ? body.context : {};
    const contextText =
      typeof rawContext.contextText === 'string' ? rawContext.contextText.slice(0, 12000) : '';
    const hasData = rawContext.hasData === true;
    const evidence = Array.isArray(rawContext.evidence)
      ? rawContext.evidence.filter((e): e is string => typeof e === 'string').slice(0, 30)
      : [];

    // 3. Safety stop BEFORE any provider call: pain/injury or disordered
    // eating → refer-out copy, no model involved, no diagnosis, no advice.
    const stop = detectSafetyStop(rawMessage);
    if (stop) {
      return NextResponse.json({
        reply: COACH_CHAT_REFER_OUT[stop][language],
        evidence: [],
        provider: 'safety',
        model: null,
        safetyStop: stop,
        dailyRemaining: daily.remaining,
      });
    }

    const systemPrompt = buildCoachChatSystemPrompt({ language, hasData });
    const prompt = [
      'USER DATA (this specific user — the ONLY data you may cite):',
      contextText || 'No user data was provided with this message.',
      '',
      'CONVERSATION SO FAR:',
      formatHistoryForPrompt(history),
      '',
      'USER MESSAGE:',
      rawMessage,
      '',
      'Reply as JSON with a single "reply" field.',
    ].join('\n');

    const execResult = await executeMultiProviderText<{ reply: string }>({
      prompt,
      systemPrompt,
      timeoutMs: COACH_CHAT_PROVIDER_TIMEOUT_MS,
    });

    const data = execResult.data as unknown;
    const rawReply =
      typeof data === 'string' ? data : data && typeof data === 'object' && typeof (data as { reply?: unknown }).reply === 'string'
        ? ((data as { reply: string }).reply as string)
        : null;
    if (rawReply == null || rawReply.trim().length === 0) {
      return NextResponse.json({ error: 'PROVIDER_FAILED' }, { status: 502 });
    }

    return NextResponse.json({
      reply: truncateReply(rawReply.trim()),
      evidence,
      provider: execResult.provider,
      model: execResult.model,
      safetyStop: null,
      dailyRemaining: daily.remaining,
    });
  } catch (error: unknown) {
    if (error instanceof RequestBodyTooLargeError) {
      return requestBodyTooLargeResponse();
    }
    if (error instanceof AiGlobalCapExceededError) {
      return NextResponse.json({ error: 'AI_DAILY_CAP' }, { status: 429 });
    }
    // Never echo user content or provider internals in errors.
    console.error('Coach chat API error:', redactSecrets(error instanceof Error ? error.message : 'unknown'));
    return NextResponse.json({ error: 'PROVIDER_FAILED' }, { status: 502 });
  }
}
