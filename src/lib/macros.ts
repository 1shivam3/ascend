import { FoodItem, MacroTotals } from './types';

// Macros per 100g or 100ml
const FOOD_DB: Record<string, Omit<FoodItem, 'name'>> = {
  // Proteins
  'chicken breast': { calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
  'chicken thigh': { calories: 209, proteinG: 26, carbsG: 0, fatG: 11 },
  'chicken': { calories: 180, proteinG: 28, carbsG: 0, fatG: 7 },
  'turkey breast': { calories: 135, proteinG: 30, carbsG: 0, fatG: 1 },
  'turkey': { calories: 145, proteinG: 28, carbsG: 0, fatG: 3 },
  'ground beef': { calories: 215, proteinG: 26, carbsG: 0, fatG: 12 },
  'beef': { calories: 250, proteinG: 26, carbsG: 0, fatG: 15 },
  'steak': { calories: 242, proteinG: 27, carbsG: 0, fatG: 14 },
  'salmon': { calories: 208, proteinG: 20, carbsG: 0, fatG: 13 },
  'tuna': { calories: 132, proteinG: 28, carbsG: 0, fatG: 1.3 },
  'cod': { calories: 82, proteinG: 18, carbsG: 0, fatG: 0.7 },
  'tilapia': { calories: 96, proteinG: 20, carbsG: 0, fatG: 1.7 },
  'shrimp': { calories: 99, proteinG: 24, carbsG: 0.2, fatG: 0.3 },
  'eggs': { calories: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5 },
  'egg': { calories: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5 },
  'egg whites': { calories: 52, proteinG: 10.9, carbsG: 0.7, fatG: 0.2 },
  'whey protein': { calories: 379, proteinG: 79.5, carbsG: 7.3, fatG: 3.3 },
  'protein powder': { calories: 380, proteinG: 80, carbsG: 7, fatG: 3 },
  'casein protein': { calories: 360, proteinG: 77, carbsG: 4, fatG: 1.5 },
  'tofu': { calories: 76, proteinG: 8, carbsG: 1.9, fatG: 4.8 },

  // Dairy
  'greek yogurt': { calories: 59, proteinG: 10, carbsG: 3.6, fatG: 0.4 },
  'cottage cheese': { calories: 98, proteinG: 11, carbsG: 3.4, fatG: 4.3 },
  'milk': { calories: 50, proteinG: 3.4, carbsG: 4.8, fatG: 2 },
  'whole milk': { calories: 61, proteinG: 3.2, carbsG: 4.8, fatG: 3.3 },
  'almond milk': { calories: 15, proteinG: 0.5, carbsG: 0.3, fatG: 1.2 },
  'cheese': { calories: 402, proteinG: 25, carbsG: 1.3, fatG: 33 },
  'mozzarella': { calories: 280, proteinG: 28, carbsG: 3, fatG: 17 },

  // Carbs & Grains
  'white rice': { calories: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 },
  'brown rice': { calories: 111, proteinG: 2.6, carbsG: 23, fatG: 0.9 },
  'rice': { calories: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 },
  'jasmine rice': { calories: 130, proteinG: 2.4, carbsG: 28.6, fatG: 0.4 },
  'oats': { calories: 389, proteinG: 16.9, carbsG: 66.3, fatG: 6.9 },
  'oatmeal': { calories: 71, proteinG: 2.5, carbsG: 12, fatG: 1.5 },
  'bread': { calories: 265, proteinG: 9, carbsG: 49, fatG: 3.2 },
  'whole wheat bread': { calories: 247, proteinG: 13, carbsG: 41, fatG: 3.4 },
  'toast': { calories: 265, proteinG: 9, carbsG: 49, fatG: 3.2 },
  'bagel': { calories: 250, proteinG: 10, carbsG: 49, fatG: 1.5 },
  'tortilla': { calories: 297, proteinG: 8, carbsG: 49, fatG: 7 },
  'pasta': { calories: 131, proteinG: 5, carbsG: 25, fatG: 1.1 },
  'spaghetti': { calories: 131, proteinG: 5, carbsG: 25, fatG: 1.1 },
  'quinoa': { calories: 120, proteinG: 4.4, carbsG: 21.3, fatG: 1.9 },
  'lentils': { calories: 116, proteinG: 9, carbsG: 20.1, fatG: 0.4 },
  'potatoes': { calories: 77, proteinG: 2, carbsG: 17, fatG: 0.1 },
  'potato': { calories: 77, proteinG: 2, carbsG: 17, fatG: 0.1 },
  'sweet potato': { calories: 86, proteinG: 1.6, carbsG: 20.1, fatG: 0.1 },

  // Fruits & Vegetables
  'banana': { calories: 89, proteinG: 1.1, carbsG: 22.8, fatG: 0.3 },
  'apple': { calories: 52, proteinG: 0.3, carbsG: 13.8, fatG: 0.2 },
  'orange': { calories: 47, proteinG: 0.9, carbsG: 11.8, fatG: 0.1 },
  'blueberries': { calories: 57, proteinG: 0.7, carbsG: 14.5, fatG: 0.3 },
  'strawberries': { calories: 32, proteinG: 0.7, carbsG: 7.7, fatG: 0.3 },
  'broccoli': { calories: 34, proteinG: 2.8, carbsG: 6.6, fatG: 0.4 },
  'spinach': { calories: 23, proteinG: 2.9, carbsG: 3.6, fatG: 0.4 },
  'asparagus': { calories: 20, proteinG: 2.2, carbsG: 3.9, fatG: 0.1 },
  'green beans': { calories: 31, proteinG: 1.8, carbsG: 7, fatG: 0.2 },

  // Fats & Oils
  'avocado': { calories: 160, proteinG: 2, carbsG: 8.5, fatG: 14.7 },
  'peanut butter': { calories: 588, proteinG: 25, carbsG: 20, fatG: 50 },
  'almond butter': { calories: 614, proteinG: 21, carbsG: 19, fatG: 56 },
  'almonds': { calories: 579, proteinG: 21, carbsG: 21.6, fatG: 49.9 },
  'walnuts': { calories: 654, proteinG: 15.2, carbsG: 13.7, fatG: 65.2 },
  'olive oil': { calories: 884, proteinG: 0, carbsG: 0, fatG: 100 },
  'butter': { calories: 717, proteinG: 0.9, carbsG: 0.1, fatG: 81 },
  'honey': { calories: 304, proteinG: 0.3, carbsG: 82.4, fatG: 0 },
};

const EMPTY_MACROS = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export function estimateMacros(foodName: string, quantity: number = 100, unit: string = 'g'): FoodItem {
  const normalizedName = foodName.toLowerCase().trim();
  
  if (!normalizedName) {
    return {
      name: foodName,
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      quantity,
      unit
    };
  }

  let bestMatch = '';
  let highestScore = 0;
  
  for (const dbFood of Object.keys(FOOD_DB)) {
    if (normalizedName === dbFood) {
      bestMatch = dbFood;
      highestScore = 1;
      break;
    }
    
    // Substring match score
    if (normalizedName.includes(dbFood) || dbFood.includes(normalizedName)) {
      const score = Math.min(normalizedName.length, dbFood.length) / Math.max(normalizedName.length, dbFood.length);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = dbFood;
      }
    }
  }

  const baseMacros = bestMatch ? FOOD_DB[bestMatch] : EMPTY_MACROS;
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
    // 1 standard protein scoop is ~30g
    grams = safeQty * 30;
  } else if (u === 'tbsp') {
    grams = safeQty * 15;
  } else if (u === 'tsp') {
    grams = safeQty * 5;
  } else if (u === 'slice') {
    // 1 slice of bread/cheese ~35g
    grams = safeQty * 35;
  } else if (u === 'piece') {
    // Context-dependent piece estimation
    if (normalizedName.includes('egg')) {
      grams = safeQty * 50; // 1 large egg is ~50g
    } else if (normalizedName.includes('banana')) {
      grams = safeQty * 118; // 1 medium banana is ~118g
    } else if (normalizedName.includes('apple')) {
      grams = safeQty * 180; // 1 medium apple is ~180g
    } else if (normalizedName.includes('orange')) {
      grams = safeQty * 130;
    } else if (normalizedName.includes('tortilla') || normalizedName.includes('wrap')) {
      grams = safeQty * 45;
    } else if (normalizedName.includes('bagel')) {
      grams = safeQty * 90;
    } else {
      grams = safeQty * 100; // General serving ~100g
    }
  }

  const multiplier = grams / 100;
  
  return {
    name: foodName,
    calories: Math.round(baseMacros.calories * multiplier),
    proteinG: Number((baseMacros.proteinG * multiplier).toFixed(1)),
    carbsG: Number((baseMacros.carbsG * multiplier).toFixed(1)),
    fatG: Number((baseMacros.fatG * multiplier).toFixed(1)),
    quantity: safeQty,
    unit
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
