import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { POST } from '../src/app/api/ai/scan-meal/route';
import {
  resetRateLimitStoreForTests,
  setRateLimiterSupabaseForTests,
} from '../src/lib/rate-limit';
import { recalculateMealResult, generateOfflineMealEstimate } from '../src/lib/ai-scan-meal';
import { MealAnalysisResult, MealEntry } from '../src/lib/types';
import { calculateMealMacros } from '../src/lib/macros';
import { getLocalTodayStr } from '../src/lib/formatters';

// Load local environment for tests if not already loaded by runner
if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
  for (const envFile of ['.env.local', '.env']) {
    const envPath = path.join(process.cwd(), envFile);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const match = trimmed.match(/^([A-Za-z0-9_]+)=(.*)$/);
          if (match && !process.env[match[1]]) {
            process.env[match[1]] = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
          }
        }
      }
    }
  }
}

describe('Meal Scanner API & Nutrition Pipeline', () => {
  beforeAll(() => {
    // SEC-02 contract change (2026-10-29): the route's AI quota and
    // limiter are fail-closed — with no distributed limiter configured
    // they now reject with 503 instead of degrading to per-instance
    // memory. This suite exercises the real route, so it installs a
    // fake ascend_check_rate_limit RPC client (fixed-window counting)
    // to provide the distributed limiter production gets from
    // Supabase. Request validation/behaviour assertions are unchanged.
    const counts = new Map<string, number>();
    resetRateLimitStoreForTests();
    setRateLimiterSupabaseForTests({
      rpc: async (
        _fn: string,
        params: { p_key: string; p_window_ms: number; p_max_requests: number }
      ) => {
        const next = (counts.get(params.p_key) ?? 0) + 1;
        counts.set(params.p_key, next);
        return {
          data: [
            {
              allowed: next <= params.p_max_requests,
              count: next,
              reset_ms: params.p_window_ms,
            },
          ],
          error: null,
        };
      },
    });
  });

  it('returns 400 when no image data is provided in FormData', async () => {
    const formData = new FormData();
    formData.append('userNotes', 'Just a note');
    const req = new Request('http://localhost:3000/api/ai/scan-meal', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('NO_IMAGE');
  });

  it('returns 400 when no imageBase64 is provided in JSON payload', async () => {
    const req = new Request('http://localhost:3000/api/ai/scan-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userNotes: 'No image' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('NO_IMAGE');
  });

  it('returns 415 when unsupported MIME type is provided', async () => {
    const formData = new FormData();
    const fakeBlob = new Blob(['fake content'], { type: 'text/plain' });
    formData.append('image', fakeBlob, 'document.txt');

    const req = new Request('http://localhost:3000/api/ai/scan-meal', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(415);
    const data = await res.json();
    expect(data.error).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('correctly scans real meal photo and returns structured MealAnalysisResult', async () => {
    const imagePath = path.join(process.cwd(), 'tests/fixtures/meals/indian_curry.jpg');
    if (!fs.existsSync(imagePath)) {
      // If fixture is not present in local checkout, skip gracefully
      return;
    }

    const buffer = fs.readFileSync(imagePath);
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('image', blob, 'curry.jpg');
    formData.append('userNotes', 'Indian dinner with rice');

    const req = new Request('http://localhost:3000/api/ai/scan-meal', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    if (res.status === 500) {
      const err = await res.json();
      if (err.error === 'SCAN_FAILED' && (err.message?.includes('high demand') || err.message?.includes('quota') || err.message?.includes('UNAVAILABLE') || err.message?.includes('RESOURCE_EXHAUSTED'))) {
        console.warn('Skipping assertion: upstream Gemini API temporarily unavailable (503/429)');
        return;
      }
    }
    expect(res.status).toBe(200);

    const data: MealAnalysisResult = await res.json();
    expect(data.mealName).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.totalCalories).toBeGreaterThan(0);
    expect(data.totalProtein).toBeGreaterThanOrEqual(0);
    expect(data.totalCarbs).toBeGreaterThanOrEqual(0);
    expect(data.totalFat).toBeGreaterThanOrEqual(0);

    for (const item of data.items) {
      expect(item.name).toBeTruthy();
      expect(item.estimatedGrams).toBeGreaterThan(0);
      expect(item.calories).toBeGreaterThanOrEqual(0);
    }
  }, 30000);

  it('recognizes non-food photos and returns empty items array without crashing', async () => {
    const imagePath = path.join(process.cwd(), 'tests/fixtures/meals/gym_dumbbells_nonfood.jpg');
    if (!fs.existsSync(imagePath)) {
      return;
    }

    const buffer = fs.readFileSync(imagePath);
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('image', blob, 'dumbbells.jpg');

    const req = new Request('http://localhost:3000/api/ai/scan-meal', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    if (res.status === 500) {
      const err = await res.json();
      if (err.error === 'SCAN_FAILED' && (err.message?.includes('high demand') || err.message?.includes('quota') || err.message?.includes('UNAVAILABLE') || err.message?.includes('RESOURCE_EXHAUSTED'))) {
        console.warn('Skipping assertion: upstream Gemini API temporarily unavailable (503/429)');
        return;
      }
    }
    expect(res.status).toBe(200);

    const data: MealAnalysisResult = await res.json();
    expect(data.items.length).toBe(0);
    expect(data.totalCalories).toBe(0);
  }, 30000);

  it('recalculates meal totals accurately when items are modified', () => {
    const baseAnalysis: MealAnalysisResult = {
      mealName: 'Test Meal',
      items: [
        {
          name: 'Chicken Breast',
          quantity: '100g',
          estimatedGrams: 100,
          calories: 165,
          proteinG: 31,
          carbsG: 0,
          fatG: 3.6,
          confidence: 'high',
        },
        {
          name: 'White Rice',
          quantity: '150g',
          estimatedGrams: 150,
          calories: 195,
          proteinG: 4,
          carbsG: 42,
          fatG: 0.5,
          confidence: 'high',
        },
      ],
      totalCalories: 360,
      totalProtein: 35,
      totalCarbs: 42,
      totalFat: 4.1,
      confidence: 'high',
      timestamp: new Date().toISOString(),
    };

    // User doubles chicken portion to 200g
    const updatedItems = [
      {
        ...baseAnalysis.items[0],
        estimatedGrams: 200,
        quantity: '200g',
        calories: 330,
        proteinG: 62,
        carbsG: 0,
        fatG: 7.2,
      },
      baseAnalysis.items[1],
    ];

    const recalculated = recalculateMealResult(baseAnalysis, updatedItems);
    expect(recalculated.totalCalories).toBe(525);
    expect(recalculated.totalProtein).toBe(66);
    expect(recalculated.totalCarbs).toBe(42);
    expect(recalculated.totalFat).toBe(7.7);
  });

  it('generates offline fallback estimation for Indian staples', () => {
    const estimate = generateOfflineMealEstimate('2 roti, 1 bowl dal, 100g paneer');
    expect(estimate.items.length).toBeGreaterThan(0);
    expect(estimate.totalCalories).toBeGreaterThan(0);
    expect(estimate.totalProtein).toBeGreaterThan(0);

    const names = estimate.items.map((i) => i.name.toLowerCase());
    const hasRoti = names.some((n) => n.includes('roti') || n.includes('chapati'));
    const hasDal = names.some((n) => n.includes('dal'));
    const hasPaneer = names.some((n) => n.includes('paneer'));

    expect(hasRoti).toBe(true);
    expect(hasDal).toBe(true);
    expect(hasPaneer).toBe(true);
  });

  it('correctly maps scanned meal result to MealEntry for today and calculates today macros', () => {
    const today = getLocalTodayStr();
    const scannedResult: MealAnalysisResult = {
      mealName: 'Post Workout Recovery Bowl',
      items: [
        {
          name: 'Grilled Chicken',
          quantity: '150g',
          estimatedGrams: 150,
          calories: 248,
          proteinG: 46.5,
          carbsG: 0,
          fatG: 5.4,
          confidence: 'high',
        },
        {
          name: 'Boiled Rice',
          quantity: '200g',
          estimatedGrams: 200,
          calories: 260,
          proteinG: 5.4,
          carbsG: 56,
          fatG: 0.6,
          confidence: 'high',
        },
      ],
      totalCalories: 508,
      totalProtein: 51.9,
      totalCarbs: 56,
      totalFat: 6,
      confidence: 'high',
      timestamp: new Date().toISOString(),
    };

    const mealEntry: MealEntry = {
      id: 'meal_test_e2e_123',
      date: today,
      name: scannedResult.mealName,
      foods: scannedResult.items.map((it) => ({
        name: it.name,
        quantity: it.estimatedGrams,
        unit: 'g',
        calories: it.calories,
        proteinG: it.proteinG,
        carbsG: it.carbsG,
        fatG: it.fatG,
      })),
    };

    expect(mealEntry.date).toBe(today);
    expect(mealEntry.foods.length).toBe(2);

    const calculated = calculateMealMacros(mealEntry.foods);
    expect(calculated.calories).toBe(508);
    expect(calculated.proteinG).toBe(51.9);
    expect(calculated.carbsG).toBe(56);
    expect(calculated.fatG).toBe(6);
  });
});
