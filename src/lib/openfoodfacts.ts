import { FoodItem } from './types';
import { getCustomBarcode } from './storage';

export interface ScannedProduct {
  barcode: string;
  name: string;
  brand?: string;
  servingSize?: string;
  servingQuantity?: number;
  servingUnit?: string;
  per100g: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  perServing?: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
}

/**
 * Fetches verified product details and nutritional facts from Open Food Facts API.
 * Free, open-source worldwide database of 3M+ food products.
 */
export async function fetchProductByBarcode(barcode: string): Promise<ScannedProduct | null> {
  const cleanBarcode = barcode.trim().replace(/\D/g, '');
  if (!cleanBarcode || cleanBarcode.length < 5) return null;

  // 1. Check local user custom database first
  const custom = getCustomBarcode(cleanBarcode);
  if (custom) {
    return {
      barcode: custom.barcode,
      name: custom.name,
      brand: custom.brand,
      servingSize: custom.servingSize,
      servingQuantity: custom.servingQuantity,
      per100g: custom.per100g,
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    // Call internal Next.js API route to bypass browser CORS and User-Agent restrictions
    const res = await fetch(`/api/barcode?code=${cleanBarcode}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.found && data.per100g) {
        return {
          barcode: cleanBarcode,
          name: data.name,
          brand: data.brand,
          servingSize: data.servingSize,
          servingQuantity: data.servingQuantity,
          per100g: data.per100g,
          perServing: data.perServing,
        };
      }
    }
    return null;
  } catch (err) {
    console.warn('Error fetching barcode from /api/barcode:', err);
    return null;
  }
}

/**
 * Converts a ScannedProduct into a pre-filled FoodItem
 */
export function scannedProductToFoodItem(
  product: ScannedProduct,
  mode: '100g' | 'serving' = '100g',
  customQuantity?: number
): FoodItem {
  if (mode === 'serving' && product.perServing) {
    const qty = customQuantity ?? 1;
    return {
      name: product.brand ? `${product.name} (${product.brand})` : product.name,
      calories: Math.round(product.perServing.calories * qty),
      proteinG: Number((product.perServing.proteinG * qty).toFixed(1)),
      carbsG: Number((product.perServing.carbsG * qty).toFixed(1)),
      fatG: Number((product.perServing.fatG * qty).toFixed(1)),
      quantity: qty,
      unit: product.servingQuantity ? 'serving' : 'piece',
    };
  }

  // 100g mode
  const qty = customQuantity ?? 100;
  const multiplier = qty / 100;
  return {
    name: product.brand ? `${product.name} (${product.brand})` : product.name,
    calories: Math.round(product.per100g.calories * multiplier),
    proteinG: Number((product.per100g.proteinG * multiplier).toFixed(1)),
    carbsG: Number((product.per100g.carbsG * multiplier).toFixed(1)),
    fatG: Number((product.per100g.fatG * multiplier).toFixed(1)),
    quantity: qty,
    unit: 'g',
  };
}
