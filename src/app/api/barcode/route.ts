import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Common offline / quick catalog for popular fitness & Indian products
const COMMON_BARCODES: Record<string, {
  name: string;
  brand?: string;
  per100g: { calories: number; proteinG: number; carbsG: number; fatG: number };
  servingSize?: string;
  servingQuantity?: number;
}> = {
  // MuscleBlaze Whey
  '8906067022137': {
    name: 'Biozyme Performance Whey',
    brand: 'MuscleBlaze',
    per100g: { calories: 388, proteinG: 70, carbsG: 10, fatG: 7 },
    servingSize: '1 scoop (36g)',
    servingQuantity: 36,
  },
  // Optimum Nutrition Gold Standard 100% Whey
  '748927028669': {
    name: 'Gold Standard 100% Whey Double Rich Chocolate',
    brand: 'Optimum Nutrition',
    per100g: { calories: 375, proteinG: 77.4, carbsG: 9.7, fatG: 3.2 },
    servingSize: '1 scoop (31g)',
    servingQuantity: 31,
  },
  // Quaker Rolled Oats
  '8901491101907': {
    name: 'Rolled Oats',
    brand: 'Quaker',
    per100g: { calories: 389, proteinG: 12, carbsG: 69, fatG: 7 },
    servingSize: '1 bowl (40g)',
    servingQuantity: 40,
  },
  // Saffola Masala Oats
  '8901088004523': {
    name: 'Masala Oats',
    brand: 'Saffola',
    per100g: { calories: 386, proteinG: 8.5, carbsG: 68, fatG: 9 },
    servingSize: '1 pouch (38g)',
    servingQuantity: 38,
  },
  // Epigamia Greek Yogurt Natural
  '8906074490011': {
    name: 'Greek Yogurt Natural',
    brand: 'Epigamia',
    per100g: { calories: 84, proteinG: 6.8, carbsG: 5.5, fatG: 3.8 },
    servingSize: '1 cup (90g)',
    servingQuantity: 90,
  },
  // Amul Taaza Milk
  '8901262010058': {
    name: 'Taaza Homogenised Toned Milk',
    brand: 'Amul',
    per100g: { calories: 58, proteinG: 3.0, carbsG: 4.7, fatG: 3.0 },
    servingSize: '1 glass (200ml)',
    servingQuantity: 200,
  },
  // Amul Salted Butter
  '8901262010041': {
    name: 'Pasteurised Butter',
    brand: 'Amul',
    per100g: { calories: 722, proteinG: 0.6, carbsG: 0, fatG: 80 },
    servingSize: '1 tbsp (10g)',
    servingQuantity: 10,
  },
  // Amul Malai Paneer
  '8901262080013': {
    name: 'Malai Paneer',
    brand: 'Amul',
    per100g: { calories: 289, proteinG: 18.5, carbsG: 2.5, fatG: 23 },
    servingSize: '100g',
    servingQuantity: 100,
  },
  // Parle-G Biscuits
  '8901719101038': {
    name: 'Original Gluco Biscuits',
    brand: 'Parle-G',
    per100g: { calories: 454, proteinG: 6.5, carbsG: 78, fatG: 13 },
    servingSize: '4 biscuits (20g)',
    servingQuantity: 20,
  },
  // Tata Sampann Unpolished Toor Dal
  '8901058852338': {
    name: 'Unpolished Toor Dal',
    brand: 'Tata Sampann',
    per100g: { calories: 343, proteinG: 22, carbsG: 63, fatG: 1.5 },
    servingSize: '1 katori (50g raw)',
    servingQuantity: 50,
  },
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code')?.trim().replace(/\D/g, '');

    if (!code || code.length < 5) {
      return NextResponse.json(
        { error: 'INVALID_CODE', message: 'Valid barcode required (digits only).' },
        { status: 400 }
      );
    }

    // 1. Check quick local verified catalog
    if (COMMON_BARCODES[code]) {
      const match = COMMON_BARCODES[code];
      return NextResponse.json({
        found: true,
        source: 'local_catalog',
        barcode: code,
        name: match.name,
        brand: match.brand,
        servingSize: match.servingSize,
        servingQuantity: match.servingQuantity,
        per100g: match.per100g,
      });
    }

    // 2. Query Open Food Facts API v2
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

    try {
      const offUrl = `https://world.openfoodfacts.org/api/v2/product/${code}.json`;
      const res = await fetch(offUrl, {
        headers: {
          'User-Agent': 'ASCEND-StrengthTracker/2.0 (web@ascend.app)',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.status === 1 && data.product) {
          const p = data.product;
          const n = p.nutriments || {};

          const name = (
            p.product_name ||
            p.product_name_en ||
            (p.brands ? `${p.brands} Product` : `Product (${code})`)
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

          let perServing = undefined;
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

          return NextResponse.json({
            found: true,
            source: 'open_food_facts',
            barcode: code,
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
          });
        }
      }
    } catch (fetchErr) {
      console.warn('Open Food Facts v2 query failed or timed out:', fetchErr);
    }

    // 3. Fallback: Open Food Facts v0 API endpoint
    try {
      const v0Res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`, {
        headers: {
          'User-Agent': 'ASCEND-StrengthTracker/2.0 (web@ascend.app)',
          'Accept': 'application/json',
        },
      });
      if (v0Res.ok) {
        const v0Data = await v0Res.json();
        if (v0Data.status === 1 && v0Data.product) {
          const p = v0Data.product;
          const n = p.nutriments || {};
          const name = (p.product_name || p.product_name_en || `Item ${code}`).trim();
          const kcal100 = Math.round(n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0));
          return NextResponse.json({
            found: true,
            source: 'open_food_facts_v0',
            barcode: code,
            name,
            brand: p.brands,
            per100g: {
              calories: Math.max(0, kcal100),
              proteinG: Number((n['proteins_100g'] ?? 0).toFixed(1)),
              carbsG: Number((n['carbohydrates_100g'] ?? 0).toFixed(1)),
              fatG: Number((n['fat_100g'] ?? 0).toFixed(1)),
            },
          });
        }
      }
    } catch {}

    // Not found in any database
    return NextResponse.json({
      found: false,
      barcode: code,
      message: 'Product not found in Open Food Facts or local databases.',
    });
  } catch (err: any) {
    console.error('Barcode API route error:', err);
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err.message || 'Error looking up barcode.' },
      { status: 500 }
    );
  }
}
