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
  '8906067022144': {
    name: 'Raw Whey Isolate 90%',
    brand: 'MuscleBlaze',
    per100g: { calories: 387, proteinG: 90, carbsG: 2, fatG: 1.5 },
    servingSize: '1 scoop (30g)',
    servingQuantity: 30,
  },
  // Optimum Nutrition Gold Standard 100% Whey
  '748927028669': {
    name: 'Gold Standard 100% Whey Double Rich Chocolate',
    brand: 'Optimum Nutrition',
    per100g: { calories: 375, proteinG: 77.4, carbsG: 9.7, fatG: 3.2 },
    servingSize: '1 scoop (31g)',
    servingQuantity: 31,
  },
  '748927056341': {
    name: 'Gold Standard 100% Whey Vanilla Ice Cream',
    brand: 'Optimum Nutrition',
    per100g: { calories: 374, proteinG: 77, carbsG: 10, fatG: 3.1 },
    servingSize: '1 scoop (31g)',
    servingQuantity: 31,
  },
  // Dymatize ISO 100
  '705016110328': {
    name: 'ISO 100 Hydrolyzed Whey Gourmet Chocolate',
    brand: 'Dymatize',
    per100g: { calories: 373, proteinG: 83.3, carbsG: 3.3, fatG: 1.7 },
    servingSize: '1 scoop (30g)',
    servingQuantity: 30,
  },
  // MyProtein Impact Whey
  '5055534356788': {
    name: 'Impact Whey Protein Chocolate Smooth',
    brand: 'MyProtein',
    per100g: { calories: 412, proteinG: 75, carbsG: 8, fatG: 7.5 },
    servingSize: '1 scoop (25g)',
    servingQuantity: 25,
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
  '8906074490158': {
    name: 'High Protein Milkshake Chocolate',
    brand: 'Epigamia',
    per100g: { calories: 95, proteinG: 8.3, carbsG: 10, fatG: 2.2 },
    servingSize: '1 bottle (180ml)',
    servingQuantity: 180,
  },
  // Amul Taaza Milk
  '8901262010058': {
    name: 'Taaza Homogenised Toned Milk',
    brand: 'Amul',
    per100g: { calories: 58, proteinG: 3.0, carbsG: 4.7, fatG: 3.0 },
    servingSize: '1 glass (200ml)',
    servingQuantity: 200,
  },
  // Amul Gold Milk
  '8901262010065': {
    name: 'Amul Gold Full Cream Milk',
    brand: 'Amul',
    per100g: { calories: 87, proteinG: 3.5, carbsG: 5.0, fatG: 6.0 },
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
  // Amul High Protein Lassi
  '8901262084561': {
    name: 'High Protein Rose Lassi (15g Protein)',
    brand: 'Amul',
    per100g: { calories: 65, proteinG: 7.5, carbsG: 6.5, fatG: 1.0 },
    servingSize: '1 pack (200ml)',
    servingQuantity: 200,
  },
  // Amul High Protein Buttermilk
  '8901262084578': {
    name: 'High Protein Buttermilk (15g Protein)',
    brand: 'Amul',
    per100g: { calories: 43, proteinG: 7.5, carbsG: 2.5, fatG: 0.3 },
    servingSize: '1 pack (200ml)',
    servingQuantity: 200,
  },
  // Amul Cheese Slices
  '8901262020026': {
    name: 'Processed Cheese Slices',
    brand: 'Amul',
    per100g: { calories: 310, proteinG: 20, carbsG: 2.5, fatG: 25 },
    servingSize: '1 slice (20g)',
    servingQuantity: 20,
  },
  // Mother Dairy Classic Curd / Dahi
  '8901648007014': {
    name: 'Classic Dahi / Curd',
    brand: 'Mother Dairy',
    per100g: { calories: 60, proteinG: 3.7, carbsG: 4.8, fatG: 3.0 },
    servingSize: '1 katori (100g)',
    servingQuantity: 100,
  },
  // Mother Dairy Paneer
  '8901648012018': {
    name: 'Fresh Paneer',
    brand: 'Mother Dairy',
    per100g: { calories: 285, proteinG: 18.0, carbsG: 3.0, fatG: 22 },
    servingSize: '100g',
    servingQuantity: 100,
  },
  // Pintola Peanut Butter
  '8906109960014': {
    name: 'All Natural Peanut Butter Crunchy',
    brand: 'Pintola',
    per100g: { calories: 625, proteinG: 30, carbsG: 19, fatG: 49 },
    servingSize: '2 tbsp (32g)',
    servingQuantity: 32,
  },
  // MyFitness Peanut Butter
  '8906114170040': {
    name: 'Original Dark Chocolate Peanut Butter',
    brand: 'MyFitness',
    per100g: { calories: 580, proteinG: 26, carbsG: 28, fatG: 42 },
    servingSize: '2 tbsp (32g)',
    servingQuantity: 32,
  },
  // Britannia Whole Wheat Bread
  '8901063012031': {
    name: '100% Whole Wheat Bread',
    brand: 'Britannia',
    per100g: { calories: 245, proteinG: 9.5, carbsG: 46, fatG: 2.5 },
    servingSize: '2 slices (50g)',
    servingQuantity: 50,
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
  // Tata Sampann Chana Dal
  '8901058852314': {
    name: 'Unpolished Chana Dal',
    brand: 'Tata Sampann',
    per100g: { calories: 372, proteinG: 21.5, carbsG: 59.8, fatG: 5.6 },
    servingSize: '1 katori (50g raw)',
    servingQuantity: 50,
  },
  // Kellogg's Corn Flakes
  '8901499008017': {
    name: 'Original Corn Flakes',
    brand: "Kellogg's",
    per100g: { calories: 378, proteinG: 7.5, carbsG: 84, fatG: 0.8 },
    servingSize: '1 bowl (30g)',
    servingQuantity: 30,
  },
  // Yakult Probiotic Drink
  '8906038740015': {
    name: 'Probiotic Fermented Milk Drink',
    brand: 'Yakult',
    per100g: { calories: 75, proteinG: 1.2, carbsG: 17.5, fatG: 0.1 },
    servingSize: '1 bottle (65ml)',
    servingQuantity: 65,
  },
  // Red Bull Energy Drink
  '9002490100070': {
    name: 'Energy Drink Original',
    brand: 'Red Bull',
    per100g: { calories: 45, proteinG: 0, carbsG: 11, fatG: 0 },
    servingSize: '1 can (250ml)',
    servingQuantity: 250,
  },
  '90162602': {
    name: 'Energy Drink Original',
    brand: 'Red Bull',
    per100g: { calories: 45, proteinG: 0, carbsG: 11, fatG: 0 },
    servingSize: '1 can (250ml)',
    servingQuantity: 250,
  },
  // Farm Fresh Eggs
  '8908006321010': {
    name: 'Farm Fresh Brown Eggs (Pack of 6)',
    brand: 'Eggoz',
    per100g: { calories: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5 },
    servingSize: '1 egg (50g)',
    servingQuantity: 50,
  },
  // Maggi Noodles
  '8901058859016': {
    name: '2-Minute Masala Noodles',
    brand: 'Maggi',
    per100g: { calories: 427, proteinG: 8.0, carbsG: 63.5, fatG: 15.7 },
    servingSize: '1 pack (70g)',
    servingQuantity: 70,
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
