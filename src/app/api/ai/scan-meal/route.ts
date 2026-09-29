import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { MealAnalysisResult } from '@/lib/types';

export const runtime = 'nodejs';

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

    const apiKey =
      (headerKey && headerKey.trim()) ||
      (body.customApiKey && body.customApiKey.trim()) ||
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'NO_API_KEY',
          message:
            'No Gemini API key configured. Please add GEMINI_API_KEY in .env.local or enter your custom key in Settings.',
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

    const prompt = `You are ASCEND's precision AI Sports Nutritionist and Computer Vision Food Analyst.
Analyze the attached meal photo with high clinical and athletic precision.

CRITICAL INSTRUCTIONS:
1. Deconstruct the meal into individual visible food components (e.g. separate Roti, Cooked Rice, Dal, Paneer, Salad, etc.). Do not return a single vague aggregate number.
2. INDIAN & REGIONAL CUISINE SPECIALTY: Accurately distinguish Indian staples:
   - Breads: Roti/Chapati (typically 35-40g each), Paratha (plain ~75g, stuffed ~110-120g), Naan (~90g).
   - Lentils & Legumes: Dal Tadka (yellow dal ~120-130 kcal/bowl), Dal Makhani (~170 kcal/bowl with cream/butter), Rajma (~130 kcal/100g), Chole (~150 kcal/100g).
   - Curries & Sabjis: Paneer Butter Masala, Palak Paneer, Paneer Bhurji, Aloo Gobi, Bhindi Masala, Mixed Sabji.
   - Rice & Grains: Steamed Rice, Jeera Rice, Pulao, Biryani, Khichdi, Poha, Upma.
   - South Indian: Idli, Dosa, Masala Dosa, Medu Vada, Sambar.
   - Dairy/Sides: Dahi/Curd, Raita, Chaas, Lassi, Boondi.
   - Global Fitness Foods: Chicken breast, eggs/omelet, oats, salmon, sweet potato, protein shake, etc.
3. USER OBSERVATIONS / NOTES: "${userNotes || 'None'}"
   If the user specified portion context (e.g. "3 rotis, 1 bowl dal, hostel dinner"), prioritize the user's explicit quantities and count.
4. HIDDEN INGREDIENTS REPORTED: ${hiddenIngredients.length > 0 ? hiddenIngredients.join(', ') : 'None'}
   If 'Extra Oil / Ghee' is indicated, include an item for Ghee/Oil (typically 10-15g, 90-135 kcal, 100% fat) or incorporate it into the rich curries.
   If 'Sugar / Sweet' is indicated, factor into beverages or sweet items.
5. ESTIMATION LABELS:
   All numbers must be rounded estimates (~650 kcal, ~23g protein, ~120g carbs, ~10g fat). Do not invent artificial decimal precision for calories.
6. CONFIDENCE RATING:
   Assign 'high', 'medium', or 'low' confidence to each detected food item based on visual clarity and visibility.
7. ONE BRIEF ACTIONABLE COACHING NOTE:
   Provide exactly ONE concise sentence summarizing protein adequacy or macro balance relative to strength/muscle maintenance (e.g. "Solid high-protein meal with good complex carbs. Perfect fuel for recovery.").

OUTPUT FORMAT:
Return ONLY valid, parseable JSON matching this schema with NO markdown ticks or conversational text:
{
  "mealName": "Descriptive meal name e.g. Indian Lunch (Roti, Dal & Rice)",
  "items": [
    {
      "name": "Food name (e.g. Roti, Cooked Basmati Rice, Dal Tadka)",
      "quantity": "Human readable portion e.g. 2 pieces, 1 cup, 1 bowl, 150g",
      "estimatedGrams": 80,
      "calories": 220,
      "proteinG": 7,
      "carbsG": 40,
      "fatG": 5,
      "confidence": "high",
      "preparation": "Dry roasted without oil"
    }
  ],
  "totalCalories": 650,
  "totalProtein": 23,
  "totalCarbs": 120,
  "totalFat": 10.5,
  "hiddenIngredients": ["Extra Ghee"],
  "confidence": "high",
  "coachingNote": "Good protein meal with balanced carbs for muscle recovery."
}`;

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-flash-latest',
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
