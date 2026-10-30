/**
 * Audit-3 P3 batch — server-side fixes:
 *  SEC2-3 Hindi output guardrails + caution triggers (coach-output / coach-chat)
 *  SEC2-4 legacy /api/ai/coach deterministic pre-provider safety stop
 *  SEC2-5 middleware must not trust x-real-ip
 *  SEC2-6 dispatch route caps the body before QStash signature verification
 *  DI2-2 parse-meal per-item clamps + item-count cap
 *  DI2-3 parse-voice output clamps
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { violatesCoachGuardrails } from '../src/lib/coach-output';
import { findReplyRisk, COACH_CHAT_REFER_OUT } from '../src/lib/coach-chat';

// ── SEC2-3: Hindi output-side guardrails ────────────────────────────────────

describe('audit3 SEC2-3: Hindi coach-output guardrails', () => {
  it('blocks Hindi "train through the pain"', () => {
    expect(violatesCoachGuardrails('दर्द के बावजूद ट्रेनिंग जारी रखो, यही तरीका है।')).toBe(true);
  });

  it('blocks Hindi "ignore the pain"', () => {
    expect(violatesCoachGuardrails('दर्द को अनदेखा करो और सेट पूरा करो।')).toBe(true);
  });

  it('blocks Hindi "no need for a doctor"', () => {
    expect(violatesCoachGuardrails('घबराओ मत, डॉक्टर की कोई ज़रूरत नहीं है।')).toBe(true);
  });

  it('blocks Hindi drug advice', () => {
    expect(violatesCoachGuardrails('सेट से पहले पैरासिटामोल ले लो।')).toBe(true);
  });

  it('blocks Hindi sub-1200 kcal directives', () => {
    expect(violatesCoachGuardrails('केवल 800 कैलोरी खाओ और वज़न तेज़ी से घटाओ।')).toBe(true);
    expect(violatesCoachGuardrails('800 कैलोरी प्रतिदिन का प्लान अपनाओ।')).toBe(true);
  });

  it('does NOT block ordinary Hindi coaching text', () => {
    expect(violatesCoachGuardrails('आज हल्का वज़न लो और फ़ॉर्म पर ध्यान दो। दर्द हो तो रुक जाओ और आराम करो।')).toBe(false);
    expect(violatesCoachGuardrails('रोज़ 2200 कैलोरी का संतुलित भोजन लो।')).toBe(false);
  });
});

describe('audit3 SEC2-3: Hindi caution triggers (findReplyRisk)', () => {
  it('flags a Hindi large deficit (घाटा)', () => {
    expect(findReplyRisk('रोज़ 800 kcal का घाटा रखो, वज़न जल्दी घटेगा।')).toBe('large-deficit');
  });

  it('flags a Hindi 1200–1499 daily total', () => {
    expect(findReplyRisk('तुम्हें प्रतिदिन 1400 कैलोरी खानी चाहिए।')).toBe('large-deficit');
  });

  it('flags a Hindi ≥1 kg/week loss rate', () => {
    expect(findReplyRisk('हर सप्ताह 1.5 किलो वज़न घटाओ।')).toBe('large-deficit');
  });

  it('flags Hindi near-max phrasing', () => {
    expect(findReplyRisk('आज अधिकतम प्रयास से अंतिम सेट लगाओ।')).toBe('near-max');
  });

  it('flags Hindi volume doubling', () => {
    expect(findReplyRisk('अगले हफ़्ते से वॉल्यूम दोगुना कर दो।')).toBe('volume-jump');
  });

  it('leaves ordinary Hindi advice unflagged', () => {
    expect(findReplyRisk('आज 60 किलो से 5 रेप के 3 सेट लगाओ और अच्छी नींद लो।')).toBeNull();
  });
});

// ── SEC2-4 + DI2-2 + DI2-3: route-level (provider mocked) ──────────────────

const providerFn = vi.fn(async (..._args: unknown[]) => providerResult.current);
const providerResult: { current: any } = { current: null };

vi.mock('@/lib/ai-provider', () => ({
  executeMultiProviderText: (...args: any[]) => providerFn(...args),
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
import { POST as parseMealPOST } from '../src/app/api/ai/parse-meal/route';
import { POST as parseVoicePOST } from '../src/app/api/ai/parse-voice/route';

function jsonReq(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('audit3 SEC2-4: legacy coach route safety stop', () => {
  beforeEach(() => {
    providerFn.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('pain instruction → refer-out with NO provider call', async () => {
    const res = await coachPOST(
      jsonReq('https://ascend.app/api/ai/coach', {
        task: 'WORKOUT_COMMAND',
        command: { instruction: 'my shoulder has sharp pain, change the workout', activeWorkout: { name: 'Upper', exercises: [] } },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(providerFn).not.toHaveBeenCalled();
    expect(body.safetyStop).toBe('pain');
    expect(body.source).toBe('safety-stop');
    expect(body.data.coachAdvice).toBe(COACH_CHAT_REFER_OUT.pain.en);
    expect(body.data.modifiedExercises).toEqual([]);
  });

  it('Hindi pain instruction → refer-out with NO provider call', async () => {
    const res = await coachPOST(
      jsonReq('https://ascend.app/api/ai/coach', {
        task: 'WORKOUT_COMMAND',
        command: { instruction: 'मेरे कंधे में बहुत दर्द है, वर्कआउट बदल दो', activeWorkout: { name: 'Upper', exercises: [] } },
      }),
    );
    const body = await res.json();
    expect(providerFn).not.toHaveBeenCalled();
    expect(body.safetyStop).toBe('pain');
  });

  it('benign instruction still reaches the provider', async () => {
    providerResult.current = {
      provider: 'test',
      model: 'test-model',
      data: { actionType: 'SHORTEN_TIME', summary: 'Trimmed.', coachAdvice: 'Drop the last set.', modifiedExercises: [] },
    };
    const res = await coachPOST(
      jsonReq('https://ascend.app/api/ai/coach', {
        task: 'WORKOUT_COMMAND',
        command: { instruction: 'only have 30 mins today', activeWorkout: { name: 'Upper', exercises: [] } },
      }),
    );
    expect(res.status).toBe(200);
    expect(providerFn).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.safetyStop).toBeUndefined();
  });
});

describe('audit3 DI2-2: parse-meal clamps model items', () => {
  beforeEach(() => {
    providerFn.mockClear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('clamps absurd per-item values, drops negatives to 0, caps item count at 50', async () => {
    const foods = Array.from({ length: 60 }, (_, i) => ({
      name: `Food ${i}`,
      quantity: 99999,
      unit: 'g',
      calories: 1e9,
      proteinG: -50,
      carbsG: 5000,
      fatG: 20,
    }));
    providerResult.current = { provider: 'test', model: 'm', data: { mealName: 'Feast', foods } };
    const res = await parseMealPOST(
      jsonReq('https://ascend.app/api/ai/parse-meal', { query: 'a huge thali' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.foods).toHaveLength(50);
    for (const f of body.foods) {
      expect(f.calories).toBeLessThanOrEqual(5000);
      expect(f.proteinG).toBe(0);
      expect(f.carbsG).toBeLessThanOrEqual(1000);
      expect(f.quantity).toBeLessThanOrEqual(10000);
    }
    // Totals are recomputed from the clamped items: 50 × 5000 kcal.
    expect(body.totalCalories).toBe(50 * 5000);
  });
});

describe('audit3 DI2-3: parse-voice clamps model output', () => {
  beforeEach(() => {
    providerFn.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('clamps weight/reps/RPE/setIndex to sane ranges', async () => {
    providerResult.current = {
      provider: 'test',
      model: 'm',
      data: { exerciseName: 'Squat', weight: 99999, reps: 100000, rpe: 999, setIndex: 0 },
    };
    const res = await parseVoicePOST(
      jsonReq('https://ascend.app/api/ai/parse-voice', { transcript: 'squat bahut bhaari', currentExercise: 'Squat' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.weight).toBe(500);
    expect(body.result.reps).toBe(1000);
    expect(body.result.rpe).toBe(10);
    expect(body.result.setIndex).toBeUndefined();
  });

  it('negative weight clamps to 0; normal values pass through', async () => {
    providerResult.current = {
      provider: 'test',
      model: 'm',
      data: { exerciseName: 'Bench Press', weight: -20, reps: 5, rpe: 8, setIndex: 2 },
    };
    const res = await parseVoicePOST(
      jsonReq('https://ascend.app/api/ai/parse-voice', { transcript: 'bench 80 pe 5', currentExercise: 'Bench Press' }),
    );
    const body = await res.json();
    expect(body.result.weight).toBe(0);
    expect(body.result.reps).toBe(5);
    expect(body.result.rpe).toBe(8);
    expect(body.result.setIndex).toBe(2);
  });
});

// ── SEC2-5: middleware IP trust ─────────────────────────────────────────────

describe('audit3 SEC2-5: middleware ignores spoofable x-real-ip', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('rotating x-real-ip (no x-forwarded-for) shares ONE bucket and hits the ceiling', async () => {
    const { middleware } = await import('../src/middleware');
    const { NextRequest } = await import('next/server');
    let lastStatus = 0;
    for (let i = 0; i < 305; i++) {
      const req = new NextRequest('https://ascend.app/api/ai/coach-chat', {
        headers: { 'x-real-ip': `203.0.113.${(i % 250) + 1}` },
      });
      lastStatus = middleware(req).status;
      if (i < 300) expect(lastStatus).toBe(200);
    }
    expect(lastStatus).toBe(429);
  });

  it('distinct x-forwarded-for values still get distinct buckets', async () => {
    const { middleware } = await import('../src/middleware');
    const { NextRequest } = await import('next/server');
    for (let i = 0; i < 305; i++) {
      const req = new NextRequest('https://ascend.app/api/ai/coach-chat', {
        headers: { 'x-forwarded-for': `198.51.100.${(i % 250) + 1}` },
      });
      // Each IP appears ~2 times — far below the 300 ceiling.
      expect(middleware(req).status).toBe(200);
    }
  });
});

// ── SEC2-6: dispatch body cap before signature verification ─────────────────

const verifyFn = vi.fn(async () => false);
vi.mock('@upstash/qstash', () => ({
  Receiver: class {
    verify = verifyFn;
  },
}));

import { POST as dispatchPOST } from '../src/app/api/notifications/dispatch/route';

describe('audit3 SEC2-6: dispatch caps body before QStash verification', () => {
  const savedEnv = { ...process.env };
  beforeEach(() => {
    verifyFn.mockClear();
    process.env.QSTASH_CURRENT_SIGNING_KEY = 'test-signing-key';
    delete process.env.CRON_SECRET;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('oversized body: verification never receives it (401, verify not called)', async () => {
    const big = 'x'.repeat(200 * 1024);
    const req = new Request('https://ascend.app/api/notifications/dispatch', {
      method: 'POST',
      headers: { 'upstash-signature': 'bogus' },
      body: big,
    });
    const res = await dispatchPOST(req);
    expect(res.status).toBe(401);
    expect(verifyFn).not.toHaveBeenCalled();
  });

  it('small body: verification receives exactly the small body', async () => {
    const req = new Request('https://ascend.app/api/notifications/dispatch', {
      method: 'POST',
      headers: { 'upstash-signature': 'bogus' },
      body: 'hello',
    });
    const res = await dispatchPOST(req);
    expect(res.status).toBe(401);
    expect(verifyFn).toHaveBeenCalledTimes(1);
    expect((verifyFn.mock.calls[0] as any[])[0].body).toBe('hello');
  });
});
