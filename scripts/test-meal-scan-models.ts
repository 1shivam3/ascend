import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { getServerGeminiApiKey } from '../src/lib/server-security';

const apiKey = getServerGeminiApiKey();
if (!apiKey) {
  console.error('No Gemini API key found.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

const candidateModels = [
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.8-flash',
];

async function testScan(imgPath: string, userNotes: string = '') {
  console.log(`\n======================================================`);
  console.log(`TESTING IMAGE: ${imgPath}`);
  console.log(`User Notes: "${userNotes}"`);
  console.log(`======================================================`);

  if (!fs.existsSync(imgPath)) {
    console.error(`File not found: ${imgPath}`);
    return;
  }

  const fileBuffer = fs.readFileSync(imgPath);
  const base64Data = fileBuffer.toString('base64');

  const prompt = `You are ASCEND's precision AI Sports Nutritionist, Supplement Analyst, and Computer Vision Food Classifier.
Analyze the attached photograph with clinical precision.

STRICT ANTI-HALLUCINATION & ANTI-EXTRA-FOOD RULES:
1. ONLY IDENTIFY WHAT IS DIRECTLY & CLEARLY VISIBLE.
2. DO NOT OVER-DECONSTRUCT PREPARED DISHES.
3. MINIMALIST ITEM COUNT (1-4 items).
4. If clearly NOT food, drink, or nutritional supplements:
   - mealName: "No Food or Supplement Detected"
   - items: []
   - totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0
   - coachingNote: "No food or fitness supplement was recognized in this photo."
5. USER CONTEXT: "${userNotes || 'None'}"

OUTPUT FORMAT:
Return ONLY valid JSON matching this schema:
{
  "mealName": "Descriptive meal name",
  "items": [
    {
      "name": "Food name",
      "quantity": "Portion e.g. 1 bowl (200g)",
      "estimatedGrams": 200,
      "calories": 250,
      "proteinG": 15,
      "carbsG": 30,
      "fatG": 8,
      "confidence": "high"
    }
  ],
  "totalCalories": 250,
  "totalProtein": 15,
  "totalCarbs": 30,
  "totalFat": 8,
  "confidence": "high",
  "coachingNote": "Nutrition summary note"
}`;

  for (const model of candidateModels) {
    try {
      console.log(`Trying model: ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: 'image/jpeg',
            },
          },
          prompt,
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });

      const raw = response.text || '';
      const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      console.log(`✓ Model ${model} SUCCESS!`);
      console.log(`  Meal Name: "${parsed.mealName}"`);
      console.log(`  Items detected (${parsed.items?.length || 0}):`);
      for (const item of parsed.items || []) {
        console.log(`    - ${item.name}: ${item.quantity} (~${item.calories} kcal, ${item.proteinG}g P, ${item.carbsG}g C, ${item.fatG}g F)`);
      }
      console.log(`  Totals: ~${parsed.totalCalories} kcal, ${parsed.totalProtein}g protein, ${parsed.totalCarbs}g carbs, ${parsed.totalFat}g fat`);
      console.log(`  Confidence: ${parsed.confidence}`);
      console.log(`  Coaching Note: "${parsed.coachingNote}"`);
      return parsed;
    } catch (err: any) {
      console.warn(`  ✗ Model ${model} failed: ${err.message || err}`);
    }
  }

  throw new Error('All candidate models failed for image: ' + imgPath);
}

async function run() {
  // 1. Simple Salad / Chicken bowl
  await testScan('tests/fixtures/meals/simple_salad_chicken.jpg', 'Post-workout lunch');

  // 2. Indian Curry
  await testScan('tests/fixtures/meals/indian_curry.jpg', 'Dinner with roti');

  // 3. Biryani rice
  await testScan('tests/fixtures/meals/biryani_rice.jpg', 'Chicken biryani bowl');

  // 4. Protein smoothie
  await testScan('tests/fixtures/meals/protein_smoothie.jpg', 'Whey protein shake with banana and berries');

  // 5. Non-food test (gym dumbbells)
  await testScan('tests/fixtures/meals/gym_dumbbells_nonfood.jpg');

  console.log('\n======================================================');
  console.log('ALL REPRESENTATIVE MEAL SCANS COMPLETED SUCCESSFULLY!');
  console.log('======================================================');
}

run().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
