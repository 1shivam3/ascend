/**
 * Task 2.5 — AI endpoints must receive and honor the UI language.
 *
 * Before this task only coach-chat got `language`; Coach's Take,
 * meal scan, and text meal parse always answered in English for
 * Hindi users. These tests drive the real route handlers with a
 * capturing provider mock and assert the reply-language instruction
 * (and, for the coach safety stop, the localized static copy) —
 * plus source pins for the four client send sites.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const captured = { textArgs: [] as any[], visionArgs: [] as any[] };
const textResult = { current: null as any };
const visionResult = { current: null as any };

vi.mock('@/lib/ai-provider', () => ({
  executeMultiProviderText: vi.fn(async (args: any) => {
    captured.textArgs.push(args);
    return textResult.current;
  }),
  executeMultiProviderVision: vi.fn(async (args: any) => {
    captured.visionArgs.push(args);
    return visionResult.current;
  }),
  AiGlobalCapExceededError: class AiGlobalCapExceededError extends Error {},
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
    actor: { kind: 'guest' },
    resetMs: 0,
  })),
  aiQuotaExceededResponse: vi.fn(),
  AiActorAuthError: class AiActorAuthError extends Error {},
}));

import { POST as coachPOST } from '../src/app/api/ai/coach/route';
import { POST as parseMealPOST } from '../src/app/api/ai/parse-meal/route';
import { POST as scanMealPOST } from '../src/app/api/ai/scan-meal/route';
import { COACH_CHAT_REFER_OUT } from '../src/lib/coach-chat';

function jsonReq(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const COACH_INSIGHT_RESULT = {
  provider: 'test',
  model: 'test-model',
  data: {
    volumeTrend: 'Up 4%.',
    recoveryStatus: 'Good.',
    tacticalAdvice: 'Add 2.5 kg.',
    fatigueWarning: '',
  },
};

beforeEach(() => {
  captured.textArgs.length = 0;
  captured.visionArgs.length = 0;
  textResult.current = null;
  visionResult.current = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe("coach route (Coach's Take path)", () => {
  it('language hi puts the Hindi reply instruction in the guardrails', async () => {
    textResult.current = COACH_INSIGHT_RESULT;
    const res = await coachPOST(
      jsonReq('http://t/api/ai/coach', { task: 'COACH_INSIGHT', userContext: 'ctx', language: 'hi' })
    );
    expect(res.status).toBe(200);
    expect(captured.textArgs[0].systemPrompt).toContain(
      'Reply in Hindi (Devanagari) for all text fields'
    );
  });

  it('absent or unknown language stays English', async () => {
    textResult.current = COACH_INSIGHT_RESULT;
    await coachPOST(jsonReq('http://t/api/ai/coach', { task: 'COACH_INSIGHT', userContext: 'ctx' }));
    expect(captured.textArgs[0].systemPrompt).toContain('Reply in English.');
    captured.textArgs.length = 0;
    await coachPOST(
      jsonReq('http://t/api/ai/coach', { task: 'COACH_INSIGHT', userContext: 'ctx', language: 'xx' })
    );
    expect(captured.textArgs[0].systemPrompt).toContain('Reply in English.');
  });

  it('the safety refer-out is served in Hindi when language is hi', async () => {
    const res = await coachPOST(
      jsonReq('http://t/api/ai/coach', {
        task: 'WORKOUT_COMMAND',
        language: 'hi',
        command: { instruction: 'my knee hurts, swap the squat' },
      })
    );
    const body = await res.json();
    expect(body.safetyStop).toBe('pain');
    expect(body.data.coachAdvice).toBe(COACH_CHAT_REFER_OUT.pain.hi);
    expect(body.data.coachAdvice).not.toBe(COACH_CHAT_REFER_OUT.pain.en);
    // The provider is never called on a safety stop.
    expect(captured.textArgs.length).toBe(0);
  });
});

describe('parse-meal route', () => {
  const PARSE_RESULT = {
    provider: 'test',
    model: 'test-model',
    data: {
      mealName: 'Lunch',
      foods: [
        { name: 'Dal', quantity: 1, unit: 'bowl', calories: 230, proteinG: 14, carbsG: 36, fatG: 1.6 },
      ],
    },
  };

  it('language hi asks for a Hindi mealName (food names stay English)', async () => {
    textResult.current = PARSE_RESULT;
    const res = await parseMealPOST(
      jsonReq('http://t/api/ai/parse-meal', { query: '1 bowl dal', language: 'hi' })
    );
    expect(res.status).toBe(200);
    expect(captured.textArgs[0].systemPrompt).toContain('Write "mealName" in Hindi (Devanagari)');
    expect(captured.textArgs[0].systemPrompt).toContain('food "name" in English');
  });

  it('no language → no reply-language line', async () => {
    textResult.current = PARSE_RESULT;
    await parseMealPOST(jsonReq('http://t/api/ai/parse-meal', { query: '1 bowl dal' }));
    expect(captured.textArgs[0].systemPrompt).not.toContain('REPLY LANGUAGE');
  });
});

describe('scan-meal route', () => {
  const VISION_RESULT = {
    provider: 'test',
    model: 'test-model',
    data: {
      mealName: 'Chicken Bowl',
      items: [
        {
          name: 'Chicken',
          quantity: '1 bowl',
          estimatedGrams: 200,
          calories: 300,
          proteinG: 40,
          carbsG: 0,
          fatG: 12,
          confidence: 'high',
          preparation: 'Grilled',
        },
      ],
      coachingNote: 'Solid protein.',
    },
  };

  it('multipart: language hi localizes coachingNote/preparation only', async () => {
    visionResult.current = VISION_RESULT;
    const fd = new FormData();
    fd.append('image', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), 'meal.jpg');
    fd.append('language', 'hi');
    const res = await scanMealPOST(
      new Request('http://t/api/ai/scan-meal', { method: 'POST', body: fd })
    );
    expect(res.status).toBe(200);
    expect(captured.visionArgs[0].prompt).toContain('REPLY LANGUAGE');
    expect(captured.visionArgs[0].prompt).toContain('"coachingNote"');
    expect(captured.visionArgs[0].prompt).toContain('"preparation" in Hindi (Devanagari)');
    expect(captured.visionArgs[0].prompt).toContain('food names are never translated');
  });

  it('JSON branch: language hi is honored; absent stays English', async () => {
    visionResult.current = VISION_RESULT;
    const imageBase64 = Buffer.from('fake-jpeg-bytes').toString('base64');
    const res = await scanMealPOST(
      jsonReq('http://t/api/ai/scan-meal', { imageBase64, mimeType: 'image/jpeg', language: 'hi' })
    );
    expect(res.status).toBe(200);
    expect(captured.visionArgs[0].prompt).toContain('REPLY LANGUAGE');

    captured.visionArgs.length = 0;
    const res2 = await scanMealPOST(
      jsonReq('http://t/api/ai/scan-meal', { imageBase64, mimeType: 'image/jpeg' })
    );
    expect(res2.status).toBe(200);
    expect(captured.visionArgs[0].prompt).not.toContain('REPLY LANGUAGE');
  });
});

describe('client send sites (source pins)', () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

  it('all four clients send the app language', () => {
    // Coach's Take: read from the AppState already in scope.
    expect(read('src/lib/ai-coach.ts')).toContain(
      "language: state.uiPreferences?.language === 'hi' ? 'hi' : 'en'"
    );
    // Meal scan: ai-scan-meal is shared with server code, so the
    // language arrives as an option from its client callers.
    expect(read('src/lib/ai-scan-meal.ts')).toContain(
      "formData.append('language', options.language === 'hi' ? 'hi' : 'en')"
    );
    expect(read('src/components/ScanMealModal.tsx')).toContain('language: getCurrentLanguage()');
    expect(read('src/components/BarcodeScannerModal.tsx')).toContain(
      'language: getCurrentLanguage()'
    );
    expect(read('src/components/MealsPage.tsx')).toContain('language: getCurrentLanguage()');
    // Voice logger: recognizer starts in the app language.
    expect(read('src/components/VoiceWorkoutLoggerModal.tsx')).toContain(
      "language === 'hi' ? 'hi-IN' : 'en-IN'"
    );
  });
});
