import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { parseNaturalMealOffline, calculateMealMacros } from '@/lib/macros';
import { FoodItem } from '@/lib/types';

export const runtime = 'nodejs';

function getResolvedApiKey(headerKey?: string | null, bodyKey?: string | null): string | undefined {
  if (headerKey && headerKey.trim()) return headerKey.trim();
  if (bodyKey && bodyKey.trim()) return bodyKey.trim();

  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }
  if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim()) {
    return process.env.GOOGLE_API_KEY.trim();
  }

  // Fallback: Read directly from local env files if process.env wasn't populated yet
  const envFiles = ['.env.local', '.env', '.env.production.local', '.env.development.local'];
  for (const envFile of envFiles) {
    try {
      const filePath = path.resolve(process.cwd(), envFile);
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('GEMINI_API_KEY=') || trimmed.startsWith('GOOGLE_API_KEY=')) {
            const val = trimmed.split('=')[1]?.trim().replace(/^['"]|['"]$/g, '');
            if (val) return val;
          }
        }
      }
    } catch {
      // Ignore filesystem errors
    }
  }

  return undefined;
}

interface ParseMealRequestBody {
  query: string;
  customApiKey?: string;
}

export async function POST(req: Request) {
  try {
    const headerKey = req.headers.get('x-gemini-api-key');
    const body: ParseMealRequestBody = await req.json();
    const query = body?.query?.trim();

    if (!query) {
      return NextResponse.json(
        { error: 'NO_QUERY', message: 'No food text query provided.' },
        { status: 400 }
      );
    }

    const apiKey = getResolvedApiKey(headerKey, body.customApiKey);

    // If no API key, use calibrated offline parser
    if (!apiKey) {
      const offlineFoods = parseNaturalMealOffline(query);
      const totals = calculateMealMacros(offlineFoods);
      return NextResponse.json({
        source: 'offline_heuristic',
        mealName: 'Logged Meal',
        foods: offlineFoods,
        totalCalories: totals.calories,
        totalProteinG: totals.proteinG,
        totalCarbsG: totals.carbsG,
        totalFatG: totals.fatG,
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const candidateModels = [
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-2.0-flash',
    ];

    const systemPrompt = `You are ASCEND's precision Sports Nutritionist and Indian Food Database parser.
Given a natural language meal description (e.g. "2 roti, 1 bowl dal, 100g paneer" or "1 scoop whey, 400ml milk, 2 bananas"), parse every food item and calculate exact nutritional macros.

RULES FOR PRECISION:
1. Always calibrate Indian foods accurately according to the Indian Food Composition Tables (IFCT):
   - 1 Roti / Chapati (medium ~40g): ~120 kcal, 3.2g protein, 22g carbs, 1.5g fat.
   - 1 bowl Dal (medium ~200g cooked): ~230 kcal, 14g protein, 36g carbs, 1.6g fat.
   - Paneer (raw, per 100g): ~265 kcal, 18.3g protein, 4.5g carbs, 20.8g fat.
   - Curd / Dahi (1 bowl ~150g): ~92 kcal, 5.3g protein, 7g carbs, 5g fat.
   - Soya Chunks (50g dry): ~172 kcal, 26g protein, 16.5g carbs, 0.3g fat.
   - Sattu (50g): ~206 kcal, 13g protein, 32g carbs, 2.5g fat.
   - Boiled Chana (100g): ~164 kcal, 8.9g protein, 27.4g carbs, 2.6g fat.
   - White Rice (150g cooked): ~195 kcal, 4.1g protein, 42g carbs, 0.5g fat.
   - Oats / Oatmeal (raw, per 100g): ~389 kcal, 16.9g protein, 66.3g carbs, 6.9g fat.
   - Whey Protein (1 scoop ~30g): ~120 kcal, 24g protein, 2.2g carbs, 1g fat.

2. Always output valid JSON strictly adhering to this schema:
{
  "mealName": "Meal name inferred from time or foods (e.g. Lunch, High-Protein Snack, Breakfast)",
  "foods": [
    {
      "name": "Food Item Name",
      "quantity": 2,
      "unit": "piece | bowl | g | ml | scoop | slice | cup",
      "calories": 240,
      "proteinG": 6.4,
      "carbsG": 44,
      "fatG": 3
    }
  ],
  "totalCalories": 240,
  "totalProteinG": 6.4,
  "totalCarbsG": 44,
  "totalFatG": 3
}`;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [{ text: `Parse this meal accurately into individual food items with exact macros:\n"${query}"` }],
            },
          ],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });

        const rawText = response.text?.trim() || '';
        const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        if (parsed && Array.isArray(parsed.foods) && parsed.foods.length > 0) {
          const validatedFoods: FoodItem[] = parsed.foods.map((f: any) => ({
            name: String(f.name || 'Food'),
            quantity: typeof f.quantity === 'number' ? f.quantity : 1,
            unit: String(f.unit || 'g'),
            calories: Math.round(Number(f.calories) || 0),
            proteinG: Math.round((Number(f.proteinG) || 0) * 10) / 10,
            carbsG: Math.round((Number(f.carbsG) || 0) * 10) / 10,
            fatG: Math.round((Number(f.fatG) || 0) * 10) / 10,
          }));

          const totals = calculateMealMacros(validatedFoods);

          return NextResponse.json({
            source: 'gemini',
            model: modelName,
            mealName: parsed.mealName || 'Quick Meal',
            foods: validatedFoods,
            totalCalories: totals.calories,
            totalProteinG: totals.proteinG,
            totalCarbsG: totals.carbsG,
            totalFatG: totals.fatG,
          });
        }
      } catch (modelErr) {
        console.warn(`Gemini model ${modelName} failed to parse meal, trying next model:`, modelErr);
      }
    }

    // Fallback if all Gemini models fail or rate limit
    const offlineFoods = parseNaturalMealOffline(query);
    const totals = calculateMealMacros(offlineFoods);
    return NextResponse.json({
      source: 'offline_fallback',
      mealName: 'Logged Meal',
      foods: offlineFoods,
      totalCalories: totals.calories,
      totalProteinG: totals.proteinG,
      totalCarbsG: totals.carbsG,
      totalFatG: totals.fatG,
    });
  } catch (err: any) {
    console.error('Parse meal API error:', err);
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err.message || 'Failed to parse meal.' },
      { status: 500 }
    );
  }
}
