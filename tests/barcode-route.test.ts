import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../src/app/api/barcode/route';

/**
 * Barcode money-path — API route half (P0-5). Exercises the OFF v2 → v0
 * mapping in src/app/api/barcode/route.ts with a mocked network: response
 * mapping, per-100g normalization, kJ→kcal conversion, per-serving math,
 * missing/partial nutrients, product-not-found, and the local catalog.
 * No live calls. (Rate limiting is mocked out — it has its own tests.)
 */

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ success: true, resetMs: 0 })),
}));
vi.mock('@/lib/server-security', () => ({
  rateLimitResponse: vi.fn(() => new Response('{}', { status: 429 })),
  redactSecrets: (s: string) => s,
}));

const fetchMock = vi.fn();

function res(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}
function offV2(product: unknown) {
  return res({ status: 1, product });
}
function req(code?: string) {
  return new Request(`http://test.local/api/barcode${code !== undefined ? `?code=${code}` : ''}`);
}
async function bodyOf(r: Response) {
  return r.json();
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /api/barcode — validation and local catalog', () => {
  it('400s when the code is missing or too short', async () => {
    const r1 = await GET(req());
    expect(r1.status).toBe(400);
    expect((await bodyOf(r1)).error).toBe('INVALID_CODE');
    const r2 = await GET(req('12'));
    expect(r2.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves the local verified catalog without touching the network', async () => {
    const r = await GET(req('8906067022137'));
    const b = await bodyOf(r);
    expect(b).toMatchObject({
      found: true,
      source: 'local_catalog',
      name: 'Biozyme Performance Whey',
      brand: 'MuscleBlaze',
      servingQuantity: 36,
      per100g: { calories: 388, proteinG: 70, carbsG: 10, fatG: 7 },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/barcode — Open Food Facts v2 mapping', () => {
  it('maps a complete v2 product: per-100g and per-serving', async () => {
    fetchMock.mockResolvedValue(offV2({
      product_name: 'Test Whey',
      brands: 'TestBrand',
      serving_size: '1 scoop (30 g)',
      serving_quantity: 30,
      nutriments: {
        'energy-kcal_100g': 400, proteins_100g: 80, carbohydrates_100g: 8, fat_100g: 4, sugars_100g: 2,
        'energy-kcal_serving': 120, proteins_serving: 24, carbohydrates_serving: 2.4, fat_serving: 1.2, sugars_serving: 0.6,
      },
    }));
    const b = await bodyOf(await GET(req('1234567890123')));
    expect(b).toMatchObject({
      found: true,
      source: 'open_food_facts',
      name: 'Test Whey',
      brand: 'TestBrand',
      per100g: { calories: 400, proteinG: 80, carbsG: 8, fatG: 4, sugarG: 2 },
      perServing: { calories: 120, proteinG: 24, carbsG: 2.4, fatG: 1.2, sugarG: 0.6 },
    });
  });

  it('converts kJ-only energy to kcal (energy_100g / 4.184)', async () => {
    fetchMock.mockResolvedValue(offV2({
      product_name: 'KJ Bar',
      nutriments: { energy_100g: 2092, proteins_100g: 10, carbohydrates_100g: 50, fat_100g: 20 },
    }));
    const b = await bodyOf(await GET(req('1234567890123')));
    expect(b.per100g.calories).toBe(500);
  });

  it('falls back to unsuffixed nutrient fields — including sugar (regression: sugar was dropped)', async () => {
    fetchMock.mockResolvedValue(offV2({
      product_name: 'Legacy Fields Product',
      nutriments: { 'energy-kcal': 350, proteins: 25, carbohydrates: 40, fat: 12, sugars: 30 },
    }));
    const b = await bodyOf(await GET(req('1234567890123')));
    expect(b.per100g).toEqual({ calories: 350, proteinG: 25, carbsG: 40, fatG: 12, sugarG: 30 });
  });

  it('derives missing per-serving macros from per-100g × serving size instead of zeroing them (regression)', async () => {
    fetchMock.mockResolvedValue(offV2({
      product_name: 'Partial Serving Whey',
      serving_quantity: 30,
      nutriments: {
        'energy-kcal_100g': 400, proteins_100g: 80, carbohydrates_100g: 10, fat_100g: 5, sugars_100g: 3,
        'energy-kcal_serving': 120, // only energy provided per serving
      },
    }));
    const b = await bodyOf(await GET(req('1234567890123')));
    expect(b.perServing).toEqual({ calories: 120, proteinG: 24, carbsG: 3, fatG: 1.5, sugarG: 0.9 });
  });

  it('handles a product with partial nutrients: missing fields are 0, missing sugar stays absent', async () => {
    fetchMock.mockResolvedValue(offV2({
      product_name: 'Sparse Product',
      nutriments: { 'energy-kcal_100g': 100, proteins_100g: 5 },
    }));
    const b = await bodyOf(await GET(req('1234567890123')));
    expect(b.per100g).toEqual({ calories: 100, proteinG: 5, carbsG: 0, fatG: 0 });
    expect('sugarG' in b.per100g).toBe(false);
    expect(b.perServing).toBeUndefined();
  });

  it('clamps negative nutrient values to zero', async () => {
    fetchMock.mockResolvedValue(offV2({
      product_name: 'Bad Data Product',
      nutriments: { 'energy-kcal_100g': 100, proteins_100g: -2, fat_100g: -5 },
    }));
    const b = await bodyOf(await GET(req('1234567890123')));
    expect(b.per100g.proteinG).toBe(0);
    expect(b.per100g.fatG).toBe(0);
  });

  it('falls back to brand-based naming when the product has no name', async () => {
    fetchMock.mockResolvedValue(offV2({
      brands: 'NamelessBrand',
      nutriments: { 'energy-kcal_100g': 100 },
    }));
    const b = await bodyOf(await GET(req('1234567890123')));
    expect(b.name).toBe('NamelessBrand Product');
  });
});

describe('GET /api/barcode — v0 fallback and not-found', () => {
  it('uses the v0 API when v2 reports not-found, with unsuffixed fallbacks', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ status: 0 }))
      .mockResolvedValueOnce(res({
        status: 1,
        product: {
          product_name: 'V0 Bar',
          brands: 'V0Brand',
          nutriments: { energy_100g: 1673.6, proteins: 10, carbohydrates_100g: 60, fat: 12, sugars: 22 },
        },
      }));
    const b = await bodyOf(await GET(req('1234567890123')));
    expect(b).toMatchObject({
      found: true,
      source: 'open_food_facts_v0',
      name: 'V0 Bar',
      per100g: { calories: 400, proteinG: 10, carbsG: 60, fatG: 12, sugarG: 22 },
    });
  });

  it('falls through to v0 when the v2 request itself fails (network)', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(res({ status: 0 }));
    const b = await bodyOf(await GET(req('1234567890123')));
    expect(b.found).toBe(false);
  });

  it('returns found:false when no source has the product', async () => {
    fetchMock.mockResolvedValue(res({ status: 0 }));
    const b = await bodyOf(await GET(req('1234567890123')));
    expect(b).toMatchObject({ found: false, barcode: '1234567890123' });
    expect(fetchMock).toHaveBeenCalledTimes(2); // v2 tried, then v0
  });
});
