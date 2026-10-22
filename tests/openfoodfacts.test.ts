import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchProductByBarcode, scannedProductToFoodItem } from '../src/lib/openfoodfacts';
import type { ScannedProduct } from '../src/lib/openfoodfacts';
import { getCustomBarcode } from '../src/lib/storage';

/**
 * Barcode money-path — client half (P0-5). src/lib/openfoodfacts.ts had
 * ZERO tests before this file. Everything is mocked: the user's custom
 * barcode store and the /api/barcode network call. No live requests.
 */

vi.mock('../src/lib/storage', () => ({
  getCustomBarcode: vi.fn(),
}));

const mockGetCustom = vi.mocked(getCustomBarcode);
const fetchMock = vi.fn();

function apiResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

const API_PRODUCT = {
  found: true,
  source: 'open_food_facts',
  barcode: '8906067022137',
  name: 'Biozyme Performance Whey',
  brand: 'MuscleBlaze',
  servingSize: '1 scoop (36g)',
  servingQuantity: 36,
  per100g: { calories: 388, proteinG: 70, carbsG: 10, fatG: 7, sugarG: 3 },
  perServing: { calories: 140, proteinG: 25, carbsG: 3.6, fatG: 2.5, sugarG: 1.1 },
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  mockGetCustom.mockReset();
  mockGetCustom.mockReturnValue(null);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchProductByBarcode', () => {
  it('rejects unusable barcodes without any lookup', async () => {
    expect(await fetchProductByBarcode('')).toBeNull();
    expect(await fetchProductByBarcode('12')).toBeNull();
    expect(await fetchProductByBarcode('abcd')).toBeNull();
    expect(mockGetCustom).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('strips non-digits before lookup', async () => {
    fetchMock.mockResolvedValue(apiResponse(API_PRODUCT));
    const p = await fetchProductByBarcode(' 8906-0670 22137 ');
    expect(p?.barcode).toBe('8906067022137');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/barcode?code=8906067022137',
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('prefers the user custom barcode over the network', async () => {
    mockGetCustom.mockReturnValue({
      barcode: '12345678',
      name: 'My Homemade Granola',
      brand: 'Home',
      servingSize: '1 bowl (50g)',
      servingQuantity: 50,
      per100g: { calories: 450, proteinG: 12, carbsG: 55, fatG: 20 },
    } as any);
    const p = await fetchProductByBarcode('12345678');
    expect(p?.name).toBe('My Homemade Granola');
    expect(p?.per100g.calories).toBe(450);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a found API product, including per-serving data', async () => {
    fetchMock.mockResolvedValue(apiResponse(API_PRODUCT));
    const p = await fetchProductByBarcode('8906067022137');
    expect(p).toMatchObject({
      name: 'Biozyme Performance Whey',
      brand: 'MuscleBlaze',
      servingQuantity: 36,
      per100g: { calories: 388, proteinG: 70, sugarG: 3 },
      perServing: { calories: 140, proteinG: 25 },
    });
  });

  it('returns null when the API reports not found', async () => {
    fetchMock.mockResolvedValue(apiResponse({ found: false, barcode: '99999999' }));
    expect(await fetchProductByBarcode('99999999')).toBeNull();
  });

  it('returns null on an HTTP error response', async () => {
    fetchMock.mockResolvedValue(apiResponse({}, false));
    expect(await fetchProductByBarcode('8906067022137')).toBeNull();
  });

  it('returns null (never throws) on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    expect(await fetchProductByBarcode('8906067022137')).toBeNull();
  });

  it('returns null when a "found" payload is missing nutrition data', async () => {
    fetchMock.mockResolvedValue(apiResponse({ found: true, name: 'Ghost Product' }));
    expect(await fetchProductByBarcode('8906067022137')).toBeNull();
  });
});

describe('scannedProductToFoodItem', () => {
  const product: ScannedProduct = {
    barcode: '8906067022137',
    name: 'Biozyme Performance Whey',
    brand: 'MuscleBlaze',
    servingQuantity: 36,
    per100g: { calories: 388, proteinG: 70, carbsG: 10, fatG: 7, sugarG: 3 },
    perServing: { calories: 140, proteinG: 25, carbsG: 3.6, fatG: 2.5, sugarG: 1.1 },
  };

  it('100g mode: identity at the default quantity, brand in the name', () => {
    const item = scannedProductToFoodItem(product);
    expect(item).toEqual({
      name: 'Biozyme Performance Whey (MuscleBlaze)',
      calories: 388,
      proteinG: 70,
      carbsG: 10,
      fatG: 7,
      sugarG: 3,
      quantity: 100,
      unit: 'g',
    });
  });

  it('100g mode: scales linearly with quantity and rounds correctly', () => {
    const item = scannedProductToFoodItem(product, '100g', 50);
    expect(item.calories).toBe(194);
    expect(item.proteinG).toBe(35);
    expect(item.carbsG).toBe(5);
    expect(item.fatG).toBe(3.5);
    expect(item.sugarG).toBe(1.5);
    expect(item.quantity).toBe(50);
  });

  it('serving mode: uses per-serving values, unit "serving" when a serving size exists', () => {
    const item = scannedProductToFoodItem(product, 'serving');
    expect(item).toMatchObject({
      calories: 140,
      proteinG: 25,
      carbsG: 3.6,
      fatG: 2.5,
      sugarG: 1.1,
      quantity: 1,
      unit: 'serving',
    });
  });

  it('serving mode: multiplies by the serving count', () => {
    const item = scannedProductToFoodItem(product, 'serving', 2);
    expect(item.calories).toBe(280);
    expect(item.proteinG).toBe(50);
    expect(item.quantity).toBe(2);
  });

  it('serving mode without per-serving data falls back to the 100g basis', () => {
    const noServing: ScannedProduct = { ...product, perServing: undefined };
    const item = scannedProductToFoodItem(noServing, 'serving');
    expect(item.unit).toBe('g');
    expect(item.quantity).toBe(100);
    expect(item.calories).toBe(388);
  });

  it('serving mode without a serving quantity uses unit "piece"', () => {
    const noQty: ScannedProduct = { ...product, servingQuantity: undefined };
    expect(scannedProductToFoodItem(noQty, 'serving').unit).toBe('piece');
  });

  it('omits sugarG entirely when the source has no sugar data (unknown ≠ zero)', () => {
    const noSugar: ScannedProduct = {
      barcode: '1',
      name: 'Plain Oats',
      per100g: { calories: 389, proteinG: 16, carbsG: 66, fatG: 7 },
    };
    const item = scannedProductToFoodItem(noSugar);
    expect('sugarG' in item).toBe(false);
    expect(item.name).toBe('Plain Oats'); // no brand suffix without a brand
  });

  it('keeps an explicit sugarG of 0 when the source reports zero sugar', () => {
    const zeroSugar: ScannedProduct = {
      barcode: '2',
      name: 'Sugar-Free Gum',
      per100g: { calories: 150, proteinG: 0, carbsG: 60, fatG: 0, sugarG: 0 },
    };
    expect(scannedProductToFoodItem(zeroSugar).sugarG).toBe(0);
  });
});
