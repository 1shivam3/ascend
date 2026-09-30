import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { MealAnalysisResult } from '@/lib/types';

import fs from 'fs';
import path from 'path';

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

interface ScanMealRequestBody {
  imageBase64: string;
  mimeType?: string;
  userNotes?: string;
  hiddenIngredients?: string[];
  customApiKey?: string;
}

export async function POST(req: Request) {
  try {
    const headerKey = req.headers.get('x-gemini-api-key');
    const body: ScanMealRequestBody = await req.json();

    const { imageBase64, mimeType = 'image/jpeg', userNotes = '', hiddenIngredients = [] } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'NO_IMAGE', message: 'No image data provided for meal scan.' },
        { status: 400 }
      );
    }

    const apiKey = getResolvedApiKey(headerKey, body.customApiKey);

    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'NO_API_KEY',
          message:
            'No Gemini API key configured. Please enter your API key in the Scan Meal modal or add GEMINI_API_KEY in .env.local.',
        },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Clean base64 string
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();

    const imagePart = {
      inlineData: {
        data: cleanBase64,
        mimeType: mimeType || 'image/jpeg',
      },
    };

    const prompt = `You are ASCEND's precision AI Sports Nutritionist, Supplement Analyst, and Computer Vision Food Classifier.
Analyze the attached photograph with high clinical and athletic precision.

CATEGORY INSTRUCTIONS:
1. FITNESS SUPPLEMENTS (VERY IMPORTANT):
   - If the photo shows a fitness supplement container, tub, box, bag, or shaker (e.g., Creatine, Whey Protein, Casein, Pre-Workout, BCAA, Mass Gainer, Multivitamin, Fish Oil, Protein Bar, Electrolytes):
     - Carefully read visible branding and labels (e.g., "Optimum Nutrition Creatine", "MuscleBlaze Whey", "Wellcore Creatine", "Creatine Monohydrate").
     - For CREATINE MONOHYDRATE:
       * Name: "[Brand] Creatine Monohydrate" (or "Creatine Monohydrate")
       * Portion: "1 scoop (3-5g)"
       * Estimated grams: 5
       * Calories: 0 kcal, Protein: 0g, Carbs: 0g, Fat: 0g (Creatine is an amino acid derivative with zero caloric macronutrient content)
       * Coaching note: "Creatine monohydrate detected. 0 calories, essential for muscular ATP resynthesis and strength output."
     - For WHEY PROTEIN / POWDER:
       * Portion: "1 scoop (30g)"
       * Calories: ~120-130 kcal, Protein: ~24-25g, Carbs: ~2-3g, Fat: ~1.5-2g
     - For PROTEIN BAR:
       * Portion: "1 bar (~60g)"
       * Calories: ~200-240 kcal, Protein: ~20g, Carbs: ~22g, Fat: ~7g

2. REAL MEALS & COOKED FOOD:
   - Deconstruct visible plates into individual food items (e.g. separate Roti, Rice, Dal, Paneer, Salad, Chicken).
   - Accurately estimate gram weights based on standard portion sizes.
   - Distinguish Indian specialties: Roti/Chapati (35-40g each), Paratha, Naan, Dal Tadka vs Makhani, Rajma, Chole, Paneer curries, Biryani, Poha, Idli, Dosa, Curd, etc.
   - Distinguish Global fitness foods: Chicken breast, eggs, salmon, oats, sweet potato, Greek yogurt, etc.

3. NON-FOOD OR UNRELATED IMAGES:
   - If the photo is clearly NOT food, drink, or nutritional supplements (e.g., gym weights, dumbbells, barbell, shoes, floor, wall, face, clothing, electronics):
     - mealName: "No Food or Supplement Detected"
     - items: [] (empty array)
     - totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0
     - coachingNote: "No food or fitness supplement was recognized in this photo. Please take a clear picture of a meal, snack, or supplement container."

4. USER OBSERVATIONS / NOTES: "${userNotes || 'None'}"
   If the user specified context (e.g. "3 rotis, 1 bowl dal", "taking my creatine scoop"), prioritize the user's explicit quantities.

5. HIDDEN INGREDIENTS: ${hiddenIngredients.length > 0 ? hiddenIngredients.join(', ') : 'None'}
   If 'Extra Oil / Ghee' is indicated, include an item for Ghee/Oil (10-15g, 90-135 kcal, 100% fat).

OUTPUT FORMAT:
Return ONLY valid, parseable JSON matching this schema with NO markdown ticks or conversational text:
{
  "mealName": "Descriptive meal name e.g. Creatine Monohydrate Supplement OR Indian Lunch (Roti, Dal & Rice)",
  "items": [
    {
      "name": "Food or supplement name e.g. Creatine Monohydrate",
      "quantity": "Human readable portion e.g. 1 scoop (5g) or 2 pieces",
      "estimatedGrams": 5,
      "calories": 0,
      "proteinG": 0,
      "carbsG": 0,
      "fatG": 0,
      "confidence": "high",
      "preparation": "Micronized powder"
    }
  ],
  "totalCalories": 0,
  "totalProtein": 0,
  "totalCarbs": 0,
  "totalFat": 0,
  "hiddenIngredients": [],
  "confidence": "high",
  "coachingNote": "One concise sentence on nutritional relevance or strength purpose."
}`;

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-flash-latest',
      'gemini-3.8-flash',
      'gemini-2.5-flash',
      'gemini-1.5-flash',
    ];

    let lastError: any = null;
    let resultJson: MealAnalysisResult | null = null;

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [imagePart, prompt],
          config: {
            responseMimeType: 'application/json',
          },
        });

        const rawText = response.text || '';
        const cleanJson = rawText
          .replace(/```json/g, '')
          .replace(/```/g, '')
          .trim();

        const parsed = JSON.parse(cleanJson);
        if (parsed && Array.isArray(parsed.items)) {
          // Calculate verified totals
          const calculatedTotalCalories = parsed.items.reduce(
            (sum: number, it: any) => sum + (Number(it.calories) || 0),
            0
          );
          const calculatedTotalProtein = Number(
            parsed.items
              .reduce((sum: number, it: any) => sum + (Number(it.proteinG) || 0), 0)
              .toFixed(1)
          );
          const calculatedTotalCarbs = Number(
            parsed.items
              .reduce((sum: number, it: any) => sum + (Number(it.carbsG) || 0), 0)
              .toFixed(1)
          );
          const calculatedTotalFat = Number(
            parsed.items
              .reduce((sum: number, it: any) => sum + (Number(it.fatG) || 0), 0)
              .toFixed(1)
          );

          resultJson = {
            mealName: parsed.mealName || 'Scanned Meal',
            items: parsed.items.map((it: any) => ({
              name: String(it.name || 'Food Item'),
              quantity: String(it.quantity || `${it.estimatedGrams || 100}g`),
              estimatedGrams: Number(it.estimatedGrams) || 100,
              calories: Math.round(Number(it.calories) || 0),
              proteinG: Number(Number(it.proteinG || 0).toFixed(1)),
              carbsG: Number(Number(it.carbsG || 0).toFixed(1)),
              fatG: Number(Number(it.fatG || 0).toFixed(1)),
              confidence: (['high', 'medium', 'low'].includes(it.confidence)
                ? it.confidence
                : 'high') as 'high' | 'medium' | 'low',
              preparation: it.preparation || undefined,
              notes: it.notes || undefined,
            })),
            totalCalories: Math.round(parsed.totalCalories || calculatedTotalCalories),
            totalProtein: Number((parsed.totalProtein || calculatedTotalProtein).toFixed(1)),
            totalCarbs: Number((parsed.totalCarbs || calculatedTotalCarbs).toFixed(1)),
            totalFat: Number((parsed.totalFat || calculatedTotalFat).toFixed(1)),
            hiddenIngredients: parsed.hiddenIngredients || hiddenIngredients,
            confidence: (['high', 'medium', 'low'].includes(parsed.confidence)
              ? parsed.confidence
              : 'high') as 'high' | 'medium' | 'low',
            coachingNote:
              parsed.coachingNote ||
              `Logged ~${calculatedTotalCalories} kcal and ${calculatedTotalProtein}g protein toward today's goals.`,
            timestamp: new Date().toISOString(),
          };
          break;
        }
      } catch (err) {
        lastError = err;
        console.warn(`Model ${model} failed for scan-meal:`, err);
      }
    }

    if (!resultJson) {
      throw lastError || new Error('Failed to generate structured meal analysis');
    }

    return NextResponse.json(resultJson);
  } catch (error: any) {
    console.error('Scan Meal API Route Error:', error);
    return NextResponse.json(
      {
        error: 'SCAN_FAILED',
        message:
          error?.message ||
          'Failed to analyze food image with Gemini. Check your network connection or try a clearer photo.',
      },
      { status: 500 }
    );
  }
}
