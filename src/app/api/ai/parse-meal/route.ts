import { NextResponse } from 'next/server';
import { RateLimitUnavailableError, checkRateLimit } from '@/lib/rate-limit';
import { executeMultiProviderText } from '@/lib/ai-provider';
import { rateLimitResponse, rateLimitUnavailableResponse, redactSecrets } from '@/lib/server-security';
import { parseNaturalMealOffline, calculateMealMacros } from '@/lib/macros';
import { FoodItem } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ParseMealRequestBody {
  query: string;
}

export async function POST(req: Request) {
  // 1. Rate limiting: 25 requests per minute per client IP
  let rateLimit;
  try {
    rateLimit = await checkRateLimit(req, {
      windowMs: 60 * 1000,
      maxRequests: 25,
      keyPrefix: 'ai-parse-meal',
    });
  } catch (err) {
    if (err instanceof RateLimitUnavailableError) {
      return rateLimitUnavailableResponse();
    }
    throw err;
  }

  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit.resetMs);
  }

  try {
    const body: ParseMealRequestBody = await req.json();
    const rawQuery = body?.query?.trim();

    if (!rawQuery) {
      return NextResponse.json(
        { error: 'NO_QUERY', message: 'No food text query provided.' },
        { status: 400 }
      );
    }

    // 2. Bound query length to 500 characters
    const query = rawQuery.slice(0, 500);


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

    try {
      const execResult = await executeMultiProviderText<any>({
        prompt: `Parse this meal accurately into individual food items with exact macros:\n"${query}"`,
        systemPrompt,
        timeoutMs: 15000,
      });

      const parsed = execResult.data;
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
          source: execResult.provider,
          model: execResult.model,
          mealName: parsed.mealName || 'Quick Meal',
          foods: validatedFoods,
          totalCalories: totals.calories,
          totalProteinG: totals.proteinG,
          totalCarbsG: totals.carbsG,
          totalFatG: totals.fatG,
        });
      }
    } catch (modelErr) {
      console.warn('Multi-provider parse-meal failed, falling back to calibrated offline heuristics:', modelErr);
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
    const rawMsg = err?.message || 'Failed to parse meal.';
    console.error('Parse meal API error:', redactSecrets(rawMsg));
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: redactSecrets(rawMsg) },
      { status: 500 }
    );
  }
}
