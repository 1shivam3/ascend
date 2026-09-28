import { FoodItem } from './types';

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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json`, {
      headers: {
        'User-Agent': 'ASCEND-StrengthTracker - Web - Version 2.0 (github.com/1shivam3/ascend)',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const n = p.nutriments || {};

    const name = (
      p.product_name ||
      p.product_name_en ||
      (p.brands ? `${p.brands} Product` : `Product (${cleanBarcode})`)
    ).trim();
    const brand = p.brands ? p.brands.trim() : undefined;

    const kcal100 = Math.round(
      n['energy-kcal_100g'] ??
      n['energy-kcal'] ??
      (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0)
    );
    const prot100 = Number((n['proteins_100g'] ?? n['proteins'] ?? 0).toFixed(1));
    const carbs100 = Number((n['carbohydrates_100g'] ?? n['carbohydrates'] ?? 0).toFixed(1));
    const fat100 = Number((n['fat_100g'] ?? n['fat'] ?? 0).toFixed(1));

    let perServing: ScannedProduct['perServing'] | undefined = undefined;
    if (n['energy-kcal_serving'] !== undefined || n['proteins_serving'] !== undefined) {
      perServing = {
        calories: Math.round(
          n['energy-kcal_serving'] ??
          (n['energy_serving'] ? n['energy_serving'] / 4.184 : 0)
        ),
        proteinG: Number((n['proteins_serving'] ?? 0).toFixed(1)),
        carbsG: Number((n['carbohydrates_serving'] ?? 0).toFixed(1)),
        fatG: Number((n['fat_serving'] ?? 0).toFixed(1)),
      };
    }

    return {
      barcode: cleanBarcode,
      name,
      brand,
      servingSize: p.serving_size,
      servingQuantity: p.serving_quantity,
      per100g: {
        calories: Math.max(0, kcal100),
        proteinG: Math.max(0, prot100),
        carbsG: Math.max(0, carbs100),
        fatG: Math.max(0, fat100),
      },
      perServing,
    };
  } catch (err) {
    console.error('Error fetching from Open Food Facts:', err);
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
