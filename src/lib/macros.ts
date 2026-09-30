import { FoodItem, MacroTotals } from './types';

// Macros per 100g or 100ml (unless noted)
const FOOD_DB: Record<string, Omit<FoodItem, 'name'>> = {
  // ── Proteins ───────────────────────────────────────────────────────
  'chicken breast': { calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
  'chicken thigh': { calories: 209, proteinG: 26, carbsG: 0, fatG: 11 },
  'chicken leg': { calories: 215, proteinG: 24, carbsG: 0, fatG: 13 },
  'chicken': { calories: 180, proteinG: 28, carbsG: 0, fatG: 7 },
  'turkey breast': { calories: 135, proteinG: 30, carbsG: 0, fatG: 1 },
  'turkey': { calories: 145, proteinG: 28, carbsG: 0, fatG: 3 },
  'ground beef': { calories: 215, proteinG: 26, carbsG: 0, fatG: 12 },
  'minced beef': { calories: 215, proteinG: 26, carbsG: 0, fatG: 12 },
  'beef': { calories: 250, proteinG: 26, carbsG: 0, fatG: 15 },
  'steak': { calories: 242, proteinG: 27, carbsG: 0, fatG: 14 },
  'lamb': { calories: 258, proteinG: 25, carbsG: 0, fatG: 17 },
  'pork': { calories: 242, proteinG: 27, carbsG: 0, fatG: 14 },
  'pork chop': { calories: 231, proteinG: 25, carbsG: 0, fatG: 14 },
  'bacon': { calories: 541, proteinG: 37, carbsG: 1.4, fatG: 42 },
  'ham': { calories: 145, proteinG: 21, carbsG: 1.5, fatG: 6 },
  'sausage': { calories: 301, proteinG: 11, carbsG: 2, fatG: 27 },

  // ── Fish & Seafood ────────────────────────────────────────────────
  'salmon': { calories: 208, proteinG: 20, carbsG: 0, fatG: 13 },
  'tuna': { calories: 132, proteinG: 28, carbsG: 0, fatG: 1.3 },
  'tuna can': { calories: 109, proteinG: 25, carbsG: 0, fatG: 0.7 },
  'cod': { calories: 82, proteinG: 18, carbsG: 0, fatG: 0.7 },
  'tilapia': { calories: 96, proteinG: 20, carbsG: 0, fatG: 1.7 },
  'shrimp': { calories: 99, proteinG: 24, carbsG: 0.2, fatG: 0.3 },
  'sardine': { calories: 208, proteinG: 25, carbsG: 0, fatG: 11 },
  'mackerel': { calories: 205, proteinG: 19, carbsG: 0, fatG: 14 },

  // ── Eggs & Dairy ──────────────────────────────────────────────────
  'eggs': { calories: 155, proteinG: 13, carbsG: 1.1, fatG: 11 },
  'egg': { calories: 155, proteinG: 13, carbsG: 1.1, fatG: 11 },
  'egg whites': { calories: 52, proteinG: 10.9, carbsG: 0.7, fatG: 0.2 },
  'whole egg': { calories: 155, proteinG: 13, carbsG: 1.1, fatG: 11 },
  'whey protein': { calories: 379, proteinG: 79.5, carbsG: 7.3, fatG: 3.3 },
  'protein powder': { calories: 380, proteinG: 80, carbsG: 7, fatG: 3 },
  'casein protein': { calories: 360, proteinG: 77, carbsG: 4, fatG: 1.5 },
  'tofu': { calories: 76, proteinG: 8, carbsG: 1.9, fatG: 4.8 },
  'tempeh': { calories: 193, proteinG: 19, carbsG: 9.4, fatG: 11 },
  'greek yogurt': { calories: 59, proteinG: 10, carbsG: 3.6, fatG: 0.4 },
  'cottage cheese': { calories: 98, proteinG: 11, carbsG: 3.4, fatG: 4.3 },
  'milk': { calories: 50, proteinG: 3.4, carbsG: 4.8, fatG: 2 },
  'whole milk': { calories: 61, proteinG: 3.2, carbsG: 4.8, fatG: 3.3 },
  'almond milk': { calories: 15, proteinG: 0.5, carbsG: 0.3, fatG: 1.2 },
  'skimmed milk': { calories: 35, proteinG: 3.5, carbsG: 5, fatG: 0.2 },
  'cheese': { calories: 402, proteinG: 25, carbsG: 1.3, fatG: 33 },
  'cheddar': { calories: 403, proteinG: 25, carbsG: 1.3, fatG: 33 },
  'mozzarella': { calories: 280, proteinG: 28, carbsG: 3, fatG: 17 },
  'paneer': { calories: 265, proteinG: 18, carbsG: 4, fatG: 20 },
  'yogurt': { calories: 61, proteinG: 3.5, carbsG: 7, fatG: 1.6 },
  'curd': { calories: 61, proteinG: 3.5, carbsG: 4.7, fatG: 3.3 },

  // ── Grains & Starches ────────────────────────────────────────────
  'white rice': { calories: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 },
  'brown rice': { calories: 111, proteinG: 2.6, carbsG: 23, fatG: 0.9 },
  'rice': { calories: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 },
  'jasmine rice': { calories: 130, proteinG: 2.4, carbsG: 28.6, fatG: 0.4 },
  'basmati rice': { calories: 121, proteinG: 2.7, carbsG: 26, fatG: 0.4 },
  'oats': { calories: 389, proteinG: 16.9, carbsG: 66.3, fatG: 6.9 },
  'oatmeal': { calories: 71, proteinG: 2.5, carbsG: 12, fatG: 1.5 },
  'rolled oats': { calories: 389, proteinG: 17, carbsG: 66, fatG: 7 },
  'bread': { calories: 265, proteinG: 9, carbsG: 49, fatG: 3.2 },
  'white bread': { calories: 265, proteinG: 9, carbsG: 49, fatG: 3.2 },
  'whole wheat bread': { calories: 247, proteinG: 13, carbsG: 41, fatG: 3.4 },
  'multigrain bread': { calories: 250, proteinG: 10, carbsG: 44, fatG: 3.5 },
  'toast': { calories: 313, proteinG: 11, carbsG: 57, fatG: 4 },
  'bagel': { calories: 250, proteinG: 10, carbsG: 49, fatG: 1.5 },
  'tortilla': { calories: 297, proteinG: 8, carbsG: 49, fatG: 7 },
  'roti': { calories: 297, proteinG: 8, carbsG: 55, fatG: 5 },
  'chapati': { calories: 297, proteinG: 8, carbsG: 55, fatG: 5 },
  'naan': { calories: 317, proteinG: 9, carbsG: 54, fatG: 7 },
  'pasta': { calories: 131, proteinG: 5, carbsG: 25, fatG: 1.1 },
  'spaghetti': { calories: 131, proteinG: 5, carbsG: 25, fatG: 1.1 },
  'quinoa': { calories: 120, proteinG: 4.4, carbsG: 21.3, fatG: 1.9 },
  'lentils': { calories: 116, proteinG: 9, carbsG: 20.1, fatG: 0.4 },
  'chickpeas': { calories: 164, proteinG: 8.9, carbsG: 27.4, fatG: 2.6 },
  'black beans': { calories: 132, proteinG: 8.9, carbsG: 23.7, fatG: 0.5 },
  'kidney beans': { calories: 127, proteinG: 8.7, carbsG: 22.8, fatG: 0.5 },
  'dal': { calories: 116, proteinG: 9, carbsG: 20, fatG: 0.4 },
  'dal tadka': { calories: 125, proteinG: 7, carbsG: 18, fatG: 4 },
  'dal makhani': { calories: 170, proteinG: 6.5, carbsG: 18, fatG: 9.5 },
  'yellow dal': { calories: 110, proteinG: 7, carbsG: 18, fatG: 2.5 },
  'toor dal': { calories: 110, proteinG: 7, carbsG: 18, fatG: 2.5 },
  'moong dal': { calories: 105, proteinG: 7.5, carbsG: 18, fatG: 1.5 },
  'rajma': { calories: 130, proteinG: 8.5, carbsG: 22, fatG: 2 },
  'chole': { calories: 155, proteinG: 7.5, carbsG: 24, fatG: 4.5 },
  'chana masala': { calories: 155, proteinG: 7.5, carbsG: 24, fatG: 4.5 },
  'chana': { calories: 164, proteinG: 8.9, carbsG: 27.4, fatG: 2.6 },
  'kala chana': { calories: 164, proteinG: 8.9, carbsG: 27.4, fatG: 2.6 },
  'boiled chana': { calories: 164, proteinG: 8.9, carbsG: 27.4, fatG: 2.6 },
  'sattu': { calories: 413, proteinG: 26, carbsG: 64, fatG: 5 },
  'soya chunks': { calories: 345, proteinG: 52, carbsG: 33, fatG: 0.5 },
  'soya': { calories: 345, proteinG: 52, carbsG: 33, fatG: 0.5 },
  'potatoes': { calories: 77, proteinG: 2, carbsG: 17, fatG: 0.1 },
  'potato': { calories: 77, proteinG: 2, carbsG: 17, fatG: 0.1 },
  'sweet potato': { calories: 86, proteinG: 1.6, carbsG: 20.1, fatG: 0.1 },
  'corn': { calories: 96, proteinG: 3.4, carbsG: 21, fatG: 1.5 },
  'poha': { calories: 198, proteinG: 4, carbsG: 44, fatG: 0.8 },
  'upma': { calories: 144, proteinG: 4, carbsG: 24, fatG: 4 },
  'idli': { calories: 58, proteinG: 2, carbsG: 12, fatG: 0.4 },
  'dosa': { calories: 168, proteinG: 4, carbsG: 24, fatG: 7 },
  'masala dosa': { calories: 185, proteinG: 4.5, carbsG: 28, fatG: 6.5 },
  'medu vada': { calories: 250, proteinG: 7, carbsG: 24, fatG: 14 },
  'paratha': { calories: 310, proteinG: 6, carbsG: 44, fatG: 13 },
  'plain paratha': { calories: 310, proteinG: 6, carbsG: 44, fatG: 13 },
  'aloo paratha': { calories: 260, proteinG: 5, carbsG: 38, fatG: 10 },
  'paneer paratha': { calories: 310, proteinG: 11, carbsG: 34, fatG: 14 },
  'biryani': { calories: 180, proteinG: 11, carbsG: 22, fatG: 6 },
  'chicken biryani': { calories: 195, proteinG: 13, carbsG: 22, fatG: 6.5 },
  'veg biryani': { calories: 150, proteinG: 4, carbsG: 26, fatG: 4 },
  'khichdi': { calories: 120, proteinG: 4.5, carbsG: 21, fatG: 2.5 },
  'sambar': { calories: 65, proteinG: 3, carbsG: 10, fatG: 1.5 },
  'paneer butter masala': { calories: 240, proteinG: 9, carbsG: 8, fatG: 19 },
  'palak paneer': { calories: 165, proteinG: 8.5, carbsG: 6, fatG: 12 },
  'paneer bhurji': { calories: 215, proteinG: 14, carbsG: 5, fatG: 16 },
  'paneer tikka': { calories: 195, proteinG: 16, carbsG: 6, fatG: 11 },
  'aloo gobi': { calories: 95, proteinG: 2.5, carbsG: 13, fatG: 4 },
  'bhindi masala': { calories: 90, proteinG: 2.2, carbsG: 9, fatG: 5 },
  'aloo sabji': { calories: 110, proteinG: 2, carbsG: 18, fatG: 4.5 },
  'mixed sabji': { calories: 95, proteinG: 2.5, carbsG: 11, fatG: 4.5 },
  'chicken curry': { calories: 165, proteinG: 17, carbsG: 4, fatG: 9 },
  'butter chicken': { calories: 220, proteinG: 15, carbsG: 7, fatG: 15 },
  'chicken tikka': { calories: 150, proteinG: 24, carbsG: 3, fatG: 4.5 },
  'egg curry': { calories: 145, proteinG: 10, carbsG: 4, fatG: 9.5 },
  'mutton curry': { calories: 235, proteinG: 20, carbsG: 4, fatG: 16 },
  'fish curry': { calories: 135, proteinG: 15, carbsG: 3, fatG: 7 },
  'dahi': { calories: 61, proteinG: 3.5, carbsG: 4.7, fatG: 3.3 },
  'raita': { calories: 75, proteinG: 3, carbsG: 6, fatG: 4 },
  'samosa': { calories: 260, proteinG: 4, carbsG: 28, fatG: 14 },
  'pakora': { calories: 280, proteinG: 6, carbsG: 25, fatG: 18 },
  'chai': { calories: 65, proteinG: 2.5, carbsG: 8, fatG: 2.5 },
  'milk tea': { calories: 65, proteinG: 2.5, carbsG: 8, fatG: 2.5 },
  'lassi': { calories: 115, proteinG: 3.5, carbsG: 17, fatG: 3.5 },
  'chaas': { calories: 35, proteinG: 2, carbsG: 3, fatG: 1 },
  'buttermilk': { calories: 35, proteinG: 2, carbsG: 3, fatG: 1 },
  'gulab jamun': { calories: 320, proteinG: 4, carbsG: 52, fatG: 11 },

  // ── Fruits ────────────────────────────────────────────────────────
  'banana': { calories: 89, proteinG: 1.1, carbsG: 22.8, fatG: 0.3 },
  'apple': { calories: 52, proteinG: 0.3, carbsG: 13.8, fatG: 0.2 },
  'orange': { calories: 47, proteinG: 0.9, carbsG: 11.8, fatG: 0.1 },
  'blueberries': { calories: 57, proteinG: 0.7, carbsG: 14.5, fatG: 0.3 },
  'strawberries': { calories: 32, proteinG: 0.7, carbsG: 7.7, fatG: 0.3 },
  'mango': { calories: 60, proteinG: 0.8, carbsG: 15, fatG: 0.4 },
  'grapes': { calories: 69, proteinG: 0.7, carbsG: 18, fatG: 0.2 },
  'watermelon': { calories: 30, proteinG: 0.6, carbsG: 7.6, fatG: 0.2 },
  'pineapple': { calories: 50, proteinG: 0.5, carbsG: 13, fatG: 0.1 },
  'dates': { calories: 282, proteinG: 2.5, carbsG: 75, fatG: 0.4 },

  // ── Vegetables ───────────────────────────────────────────────────
  'broccoli': { calories: 34, proteinG: 2.8, carbsG: 6.6, fatG: 0.4 },
  'spinach': { calories: 23, proteinG: 2.9, carbsG: 3.6, fatG: 0.4 },
  'asparagus': { calories: 20, proteinG: 2.2, carbsG: 3.9, fatG: 0.1 },
  'green beans': { calories: 31, proteinG: 1.8, carbsG: 7, fatG: 0.2 },
  'carrot': { calories: 41, proteinG: 0.9, carbsG: 9.6, fatG: 0.2 },
  'cucumber': { calories: 16, proteinG: 0.7, carbsG: 3.6, fatG: 0.1 },
  'tomato': { calories: 18, proteinG: 0.9, carbsG: 3.9, fatG: 0.2 },
  'onion': { calories: 40, proteinG: 1.1, carbsG: 9.3, fatG: 0.1 },
  'capsicum': { calories: 20, proteinG: 0.9, carbsG: 4.6, fatG: 0.3 },
  'peas': { calories: 81, proteinG: 5.4, carbsG: 14.5, fatG: 0.4 },
  'cauliflower': { calories: 25, proteinG: 2, carbsG: 5, fatG: 0.3 },
  'mushroom': { calories: 22, proteinG: 3.1, carbsG: 3.3, fatG: 0.3 },

  // ── Fats, Nuts & Oils ────────────────────────────────────────────
  'avocado': { calories: 160, proteinG: 2, carbsG: 8.5, fatG: 14.7 },
  'peanut butter': { calories: 588, proteinG: 25, carbsG: 20, fatG: 50 },
  'almond butter': { calories: 614, proteinG: 21, carbsG: 19, fatG: 56 },
  'almonds': { calories: 579, proteinG: 21, carbsG: 21.6, fatG: 49.9 },
  'walnuts': { calories: 654, proteinG: 15.2, carbsG: 13.7, fatG: 65.2 },
  'cashews': { calories: 553, proteinG: 18.2, carbsG: 30.2, fatG: 44 },
  'pistachios': { calories: 562, proteinG: 20.2, carbsG: 27.7, fatG: 45.3 },
  'peanuts': { calories: 567, proteinG: 25.8, carbsG: 16.1, fatG: 49.2 },
  'olive oil': { calories: 884, proteinG: 0, carbsG: 0, fatG: 100 },
  'coconut oil': { calories: 862, proteinG: 0, carbsG: 0, fatG: 100 },
  'butter': { calories: 717, proteinG: 0.9, carbsG: 0.1, fatG: 81 },
  'ghee': { calories: 900, proteinG: 0.3, carbsG: 0, fatG: 99.5 },
  'honey': { calories: 304, proteinG: 0.3, carbsG: 82.4, fatG: 0 },
  'dark chocolate': { calories: 546, proteinG: 4.9, carbsG: 60, fatG: 31 },

  // ── Drinks & Supplements ─────────────────────────────────────────
  'protein shake': { calories: 130, proteinG: 25, carbsG: 5, fatG: 2 },
  'mass gainer': { calories: 400, proteinG: 30, carbsG: 70, fatG: 5 },
  'creatine': { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  'creatine monohydrate': { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  'bcaa': { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  'pre-workout': { calories: 5, proteinG: 0, carbsG: 1, fatG: 0 },
  'preworkout': { calories: 5, proteinG: 0, carbsG: 1, fatG: 0 },
  'protein bar': { calories: 360, proteinG: 33, carbsG: 35, fatG: 11 },
  'orange juice': { calories: 45, proteinG: 0.7, carbsG: 10.4, fatG: 0.2 },
  'coconut water': { calories: 19, proteinG: 0.7, carbsG: 3.7, fatG: 0.2 },
  'coffee': { calories: 2, proteinG: 0.3, carbsG: 0, fatG: 0 },
  'black coffee': { calories: 2, proteinG: 0.3, carbsG: 0, fatG: 0 },
  'green tea': { calories: 1, proteinG: 0.1, carbsG: 0, fatG: 0 },
  'water': { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
};

const EMPTY_MACROS = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

// Piece/serving weights for common foods (grams per unit)
const PIECE_WEIGHTS: Record<string, number> = {
  egg: 60,
  eggs: 60,
  banana: 120,
  apple: 180,
  orange: 130,
  mango: 200,
  'sweet potato': 130,
  potato: 150,
  tortilla: 45,
  chapati: 40,
  roti: 40,
  naan: 90,
  paratha: 75,
  'plain paratha': 75,
  'aloo paratha': 110,
  'paneer paratha': 120,
  bagel: 100,
  idli: 40,
  dosa: 80,
  'masala dosa': 130,
  'medu vada': 50,
  samosa: 80,
  pakora: 30,
  'gulab jamun': 45,
  dates: 8,
  chai: 150,
  'milk tea': 150,
  lassi: 250,
  chaas: 250,
  curd: 150,
  dahi: 150,
  paneer: 100,
  dal: 200,
  'soya chunks': 50,
  sattu: 50,
  chana: 100,
  'boiled chana': 100,
  creatine: 5,
  'creatine monohydrate': 5,
  'protein powder': 30,
  'whey protein': 30,
  'protein bar': 60,
  'pre-workout': 10,
  preworkout: 10,
  bcaa: 7,
};

function findBestMatch(normalizedName: string): string {
  // 1) Exact match
  if (FOOD_DB[normalizedName]) return normalizedName;

  // 2) Check if user input contains a known DB key
  let bestKey = '';
  let bestScore = 0;

  for (const key of Object.keys(FOOD_DB)) {
    // Input includes the key (e.g. "grilled chicken breast" → "chicken breast")
    if (normalizedName.includes(key)) {
      const score = key.length / normalizedName.length;
      if (score > bestScore) { bestScore = score; bestKey = key; }
    }
    // Key includes the input (e.g. input "rice" → "white rice")
    if (key.includes(normalizedName)) {
      const score = normalizedName.length / key.length;
      if (score > bestScore + 0.05) { bestScore = score + 0.05; bestKey = key; }
    }
  }

  if (bestKey) return bestKey;

  // 3) Word overlap fallback
  const inputWords = normalizedName.split(/\s+/);
  for (const key of Object.keys(FOOD_DB)) {
    const keyWords = key.split(/\s+/);
    const overlap = inputWords.filter(w => keyWords.includes(w)).length;
    if (overlap > 0) {
      const score = overlap / Math.max(inputWords.length, keyWords.length);
      if (score > bestScore) { bestScore = score; bestKey = key; }
    }
  }

  return bestKey;
}

export function estimateMacros(foodName: string, quantity?: number, unit: string = 'g'): FoodItem {
  const normalizedName = foodName.toLowerCase().trim();

  if (!normalizedName) {
    return { name: foodName, calories: 0, proteinG: 0, carbsG: 0, fatG: 0, quantity, unit };
  }

  const matchedKey = findBestMatch(normalizedName);
  const baseMacros = matchedKey ? FOOD_DB[matchedKey] : EMPTY_MACROS;

  // If no quantity provided, return raw per-100g data without scaling
  if (quantity === undefined || quantity === null || quantity === 0) {
    return {
      name: foodName,
      calories: Math.round(baseMacros.calories),
      proteinG: Number(baseMacros.proteinG.toFixed(1)),
      carbsG: Number(baseMacros.carbsG.toFixed(1)),
      fatG: Number(baseMacros.fatG.toFixed(1)),
      quantity: undefined,
      unit,
    };
  }

  const safeQty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const u = (unit || 'g').toLowerCase().trim();

  // Calculate equivalent in grams
  let grams = safeQty;
  if (u === 'g' || u === 'ml') {
    grams = safeQty;
  } else if (u === 'kg' || u === 'l') {
    grams = safeQty * 1000;
  } else if (u === 'oz') {
    grams = safeQty * 28.3495;
  } else if (u === 'lb' || u === 'lbs') {
    grams = safeQty * 453.592;
  } else if (u === 'scoop') {
    grams = safeQty * 30; // 1 standard protein scoop ~30g
  } else if (u === 'tbsp') {
    grams = safeQty * 15;
  } else if (u === 'tsp') {
    grams = safeQty * 5;
  } else if (u === 'slice') {
    grams = safeQty * 35; // 1 slice ~35g
  } else if (u === 'piece' || u === 'pcs' || u === 'pc') {
    // Look up known piece weight, else fallback to 100g
    const pieceWeight = PIECE_WEIGHTS[normalizedName] || PIECE_WEIGHTS[matchedKey] || 100;
    grams = safeQty * pieceWeight;
  } else if (u === 'cup') {
    grams = safeQty * 240;
  } else if (u === 'bowl') {
    grams = safeQty * 200;
  } else if (u === 'plate' || u === 'serving') {
    grams = safeQty * 250;
  } else if (u === 'handful') {
    grams = safeQty * 30;
  }

  const multiplier = grams / 100;

  return {
    name: foodName,
    calories: Math.round(baseMacros.calories * multiplier),
    proteinG: Number((baseMacros.proteinG * multiplier).toFixed(1)),
    carbsG: Number((baseMacros.carbsG * multiplier).toFixed(1)),
    fatG: Number((baseMacros.fatG * multiplier).toFixed(1)),
    quantity: safeQty,
    unit,
  };
}

export function calculateMealMacros(foods: FoodItem[]): MacroTotals {
  if (!foods || !Array.isArray(foods)) {
    return { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  }

  return foods.reduce((acc, food) => ({
    calories: acc.calories + (Number(food.calories) || 0),
    proteinG: Number((acc.proteinG + (Number(food.proteinG) || 0)).toFixed(1)),
    carbsG: Number((acc.carbsG + (Number(food.carbsG) || 0)).toFixed(1)),
    fatG: Number((acc.fatG + (Number(food.fatG) || 0)).toFixed(1))
  }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
}

/** Returns food names from DB for autocomplete */
export function getFoodSuggestions(query: string): string[] {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase().trim();
  return Object.keys(FOOD_DB)
    .filter(k => k.includes(q) || q.includes(k.split(' ')[0]))
    .slice(0, 6)
    .map(k => k.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
}

/**
 * Natural language food parser for offline and fast local processing.
 * Parses input strings like "2 roti, 1 bowl dal, 100g paneer" or "1 scoop whey, 400ml milk"
 */
export function parseNaturalMealOffline(input: string): FoodItem[] {
  if (!input || !input.trim()) return [];

  // Split by commas, plus signs, newlines, or " and "
  const tokens = input
    .split(/,|\n|\+|\band\b/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const parsedItems: FoodItem[] = [];

  for (const token of tokens) {
    // Regex matching: (number) (optional unit) (food name)
    // or (food name) (number) (optional unit)
    const qtyUnitMatch = token.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.+)$/);
    const suffixQtyMatch = token.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/);

    let quantity = 1;
    let unit = 'g';
    let foodName = token;

    if (qtyUnitMatch) {
      quantity = parseFloat(qtyUnitMatch[1]);
      const potentialUnit = (qtyUnitMatch[2] || '').toLowerCase();
      const rest = qtyUnitMatch[3].trim();

      const knownUnits = ['g', 'gm', 'gram', 'grams', 'ml', 'oz', 'lb', 'lbs', 'kg', 'scoop', 'scoops', 'cup', 'cups', 'bowl', 'bowls', 'plate', 'plates', 'slice', 'slices', 'piece', 'pieces', 'pc', 'pcs', 'handful'];
      if (knownUnits.includes(potentialUnit)) {
        unit = potentialUnit.replace(/s$/, '').replace(/gm$/, 'g').replace(/gram$/, 'g').replace(/pc$/, 'piece');
        foodName = rest;
      } else {
        // unit might be missing, e.g. "2 roti" -> potentialUnit is "roti", rest is ""
        // or potentialUnit was part of the food name
        foodName = `${qtyUnitMatch[2] ? qtyUnitMatch[2] + ' ' : ''}${rest}`.trim();
        unit = 'piece'; // Default for discrete foods like "2 eggs", "2 roti", "2 bananas"
      }
    } else if (suffixQtyMatch) {
      foodName = suffixQtyMatch[1].trim();
      quantity = parseFloat(suffixQtyMatch[2]);
      const potentialUnit = (suffixQtyMatch[3] || '').toLowerCase();
      unit = potentialUnit || 'g';
    } else {
      // Just a food name, e.g. "roti" or "paneer"
      foodName = token;
      quantity = 100;
      unit = 'g';
    }

    const estimated = estimateMacros(foodName, quantity, unit);
    parsedItems.push(estimated);
  }

  return parsedItems;
}
