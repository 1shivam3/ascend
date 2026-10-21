import { FoodItem, MacroTotals, MacroGoals, AthleteGoal, Gender } from './types';
import { INDIAN_FOOD_VALUES, getHouseholdUnitGrams } from './indian-foods';
import { containsDevanagari, expandFoodQuery, transliterateDevanagari } from './devanagari';

// Macros per 100g or 100ml (unless noted)
const FOOD_DB_BASE: Record<string, Omit<FoodItem, 'name'>> = {
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
  // Hindi household names for the same staples — a Hindi-first user
  // types what she says: chawal (rice), anda (egg), doodh (milk),
  // sabzi (mixed vegetable curry).
  'chawal': { calories: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 },
  'anda': { calories: 155, proteinG: 13, carbsG: 1.1, fatG: 11 },
  'doodh': { calories: 50, proteinG: 3.4, carbsG: 4.8, fatG: 2 },
  'sabzi': { calories: 85, proteinG: 2.5, carbsG: 8, fatG: 4.5 },
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
  // ── Indian Sweets & Desserts ──
  'jalebi': { calories: 400, proteinG: 2, carbsG: 85, fatG: 8 },
  'rasgulla': { calories: 140, proteinG: 4, carbsG: 28, fatG: 1.5 },
  'kaju katli': { calories: 440, proteinG: 8, carbsG: 62, fatG: 18 },
  'motichoor ladoo': { calories: 450, proteinG: 6, carbsG: 65, fatG: 18 },
  'besan ladoo': { calories: 480, proteinG: 9, carbsG: 58, fatG: 24 },
  'rasmalai': { calories: 180, proteinG: 6, carbsG: 22, fatG: 8 },
  'milk barfi': { calories: 420, proteinG: 9, carbsG: 58, fatG: 17 },
  'gajar halwa': { calories: 200, proteinG: 4, carbsG: 30, fatG: 7.5 },
  'suji halwa': { calories: 340, proteinG: 5, carbsG: 52, fatG: 13 },
  'kulfi': { calories: 220, proteinG: 5, carbsG: 28, fatG: 10 },
  'mysore pak': { calories: 500, proteinG: 7, carbsG: 55, fatG: 29 },
  'sandesh': { calories: 180, proteinG: 8, carbsG: 28, fatG: 4 },
  'shrikhand': { calories: 190, proteinG: 5, carbsG: 26, fatG: 7 },
  'misti doi': { calories: 130, proteinG: 4, carbsG: 20, fatG: 4 },
  'balushahi': { calories: 430, proteinG: 5, carbsG: 62, fatG: 18 },
  'imarti': { calories: 390, proteinG: 3, carbsG: 80, fatG: 8 },
  'kalakand': { calories: 400, proteinG: 10, carbsG: 55, fatG: 14 },
  'peda': { calories: 430, proteinG: 9, carbsG: 60, fatG: 17 },
  'kheer': { calories: 140, proteinG: 4.5, carbsG: 22, fatG: 4 },
  'phirni': { calories: 150, proteinG: 4.5, carbsG: 24, fatG: 4.5 },
  'til ladoo': { calories: 480, proteinG: 10, carbsG: 52, fatG: 28 },
  'coconut ladoo': { calories: 450, proteinG: 5, carbsG: 55, fatG: 28 },
  'anjeer barfi': { calories: 380, proteinG: 6, carbsG: 65, fatG: 12 },
  'soan papdi': { calories: 460, proteinG: 6, carbsG: 62, fatG: 22 },
  'malpua': { calories: 380, proteinG: 6, carbsG: 52, fatG: 16 },
  'shahi tukda': { calories: 320, proteinG: 6, carbsG: 44, fatG: 14 },
  'mohanthal': { calories: 470, proteinG: 8, carbsG: 56, fatG: 24 },
  'coconut barfi': { calories: 440, proteinG: 6, carbsG: 58, fatG: 27 },
  'dry fruit barfi': { calories: 460, proteinG: 8, carbsG: 52, fatG: 26 },
  'chamcham': { calories: 150, proteinG: 5, carbsG: 30, fatG: 2.5 },
  'rajbhog': { calories: 160, proteinG: 5, carbsG: 32, fatG: 3 },
  // ── Indian Chaats & Street Food ──
  'pani puri': { calories: 180, proteinG: 4, carbsG: 30, fatG: 5 },
  'bhel puri': { calories: 160, proteinG: 4, carbsG: 30, fatG: 3.5 },
  'sev puri': { calories: 220, proteinG: 5, carbsG: 28, fatG: 12 },
  'dahi puri': { calories: 150, proteinG: 5, carbsG: 22, fatG: 5 },
  'aloo tikki': { calories: 200, proteinG: 4, carbsG: 30, fatG: 7 },
  'papdi chaat': { calories: 230, proteinG: 6, carbsG: 32, fatG: 9 },
  'samosa chaat': { calories: 210, proteinG: 6, carbsG: 28, fatG: 9 },
  'vada pav': { calories: 290, proteinG: 7, carbsG: 40, fatG: 11 },
  'pav bhaji': { calories: 190, proteinG: 5, carbsG: 28, fatG: 7 },
  'misal pav': { calories: 160, proteinG: 7, carbsG: 24, fatG: 5 },
  'dabeli': { calories: 280, proteinG: 6, carbsG: 42, fatG: 10 },
  'kachori': { calories: 350, proteinG: 7, carbsG: 42, fatG: 17 },
  'dahi bhalla': { calories: 140, proteinG: 6, carbsG: 20, fatG: 4.5 },
  'aloo chaat': { calories: 150, proteinG: 3, carbsG: 28, fatG: 4 },
  'chana chaat': { calories: 130, proteinG: 6, carbsG: 20, fatG: 3 },
  'bread pakora': { calories: 300, proteinG: 7, carbsG: 35, fatG: 15 },
  'sabudana vada': { calories: 320, proteinG: 3, carbsG: 45, fatG: 12 },
  'mirchi vada': { calories: 280, proteinG: 5, carbsG: 32, fatG: 15 },
  'kothimbir vadi': { calories: 250, proteinG: 8, carbsG: 30, fatG: 11 },
  'chakli': { calories: 480, proteinG: 8, carbsG: 56, fatG: 26 },
  'sev': { calories: 520, proteinG: 10, carbsG: 50, fatG: 32 },
  'gathiya': { calories: 500, proteinG: 11, carbsG: 52, fatG: 28 },
  'fafda': { calories: 420, proteinG: 10, carbsG: 58, fatG: 18 },
  'mathri': { calories: 460, proteinG: 9, carbsG: 58, fatG: 26 },
  'namak para': { calories: 470, proteinG: 9, carbsG: 60, fatG: 24 },
  'shakarpara': { calories: 450, proteinG: 6, carbsG: 66, fatG: 20 },
  'khakhra': { calories: 380, proteinG: 11, carbsG: 62, fatG: 12 },
  'ratlami sev': { calories: 510, proteinG: 10, carbsG: 52, fatG: 30 },
  'dahi ke kebab': { calories: 220, proteinG: 10, carbsG: 12, fatG: 15 },
  'hara bhara kebab': { calories: 180, proteinG: 7, carbsG: 20, fatG: 8 },
  'veg cutlet': { calories: 220, proteinG: 6, carbsG: 28, fatG: 11 },
  'bread roll': { calories: 260, proteinG: 6, carbsG: 36, fatG: 10 },
  'poha chivda': { calories: 450, proteinG: 8, carbsG: 62, fatG: 20 },
  'corn chaat': { calories: 120, proteinG: 4, carbsG: 22, fatG: 3 },
  'sprouts chaat': { calories: 110, proteinG: 8, carbsG: 16, fatG: 2 },
  'paneer pakora': { calories: 280, proteinG: 12, carbsG: 14, fatG: 19 },
  'masala papad': { calories: 380, proteinG: 10, carbsG: 62, fatG: 12 },
  'roasted papad': { calories: 340, proteinG: 11, carbsG: 60, fatG: 6 },
  // ── Indian Regional (South + Mains) ──
  'uttapam': { calories: 190, proteinG: 5, carbsG: 32, fatG: 5 },
  'ven pongal': { calories: 150, proteinG: 5, carbsG: 25, fatG: 3.5 },
  'pongal': { calories: 150, proteinG: 5, carbsG: 25, fatG: 3.5 },
  'appam': { calories: 140, proteinG: 3, carbsG: 28, fatG: 3 },
  'puttu': { calories: 200, proteinG: 4, carbsG: 40, fatG: 3 },
  'idiyappam': { calories: 170, proteinG: 3.5, carbsG: 36, fatG: 1.5 },
  'pesarattu': { calories: 180, proteinG: 9, carbsG: 28, fatG: 4 },
  'adai dosa': { calories: 210, proteinG: 8, carbsG: 30, fatG: 7 },
  'curd rice': { calories: 110, proteinG: 4, carbsG: 18, fatG: 2.5 },
  'thayir sadam': { calories: 110, proteinG: 4, carbsG: 18, fatG: 2.5 },
  'lemon rice': { calories: 180, proteinG: 4, carbsG: 32, fatG: 5 },
  'bisibelebath': { calories: 150, proteinG: 5, carbsG: 26, fatG: 3.5 },
  'rava dosa': { calories: 220, proteinG: 5, carbsG: 34, fatG: 8 },
  'neer dosa': { calories: 130, proteinG: 2.5, carbsG: 28, fatG: 1 },
  'set dosa': { calories: 200, proteinG: 5, carbsG: 36, fatG: 5 },
  'tomato bath': { calories: 160, proteinG: 4, carbsG: 30, fatG: 4 },
  'puliyodarai': { calories: 200, proteinG: 4, carbsG: 36, fatG: 6 },
  'ghee roast dosa': { calories: 240, proteinG: 5, carbsG: 34, fatG: 10 },
  'onion dosa': { calories: 190, proteinG: 5, carbsG: 30, fatG: 6 },
  'paper dosa': { calories: 210, proteinG: 5, carbsG: 36, fatG: 6 },
  'mysore masala dosa': { calories: 220, proteinG: 5, carbsG: 32, fatG: 9 },
  'sarson ka saag': { calories: 90, proteinG: 4, carbsG: 10, fatG: 4.5 },
  'makki di roti': { calories: 240, proteinG: 6, carbsG: 44, fatG: 5 },
  'dal baati churma': { calories: 320, proteinG: 8, carbsG: 48, fatG: 11 },
  'baingan bharta': { calories: 80, proteinG: 2.5, carbsG: 9, fatG: 4.5 },
  'dum aloo': { calories: 140, proteinG: 3, carbsG: 18, fatG: 7 },
  'lauki sabzi': { calories: 60, proteinG: 2, carbsG: 8, fatG: 2.5 },
  'undhiyu': { calories: 130, proteinG: 5, carbsG: 16, fatG: 6 },
  'thepla': { calories: 260, proteinG: 7, carbsG: 40, fatG: 8 },
  'dhokla': { calories: 160, proteinG: 6, carbsG: 28, fatG: 3 },
  'khandvi': { calories: 180, proteinG: 7, carbsG: 22, fatG: 7 },
  'goan fish curry': { calories: 120, proteinG: 14, carbsG: 4, fatG: 5.5 },
  'chettinad chicken curry': { calories: 170, proteinG: 18, carbsG: 4, fatG: 9 },
  'malabar parotta': { calories: 340, proteinG: 7, carbsG: 52, fatG: 12 },
  'dal dhokli': { calories: 170, proteinG: 7, carbsG: 28, fatG: 4 },
  'gatte ki sabzi': { calories: 190, proteinG: 8, carbsG: 18, fatG: 10 },
  'bajra roti': { calories: 230, proteinG: 7, carbsG: 42, fatG: 4.5 },
  'jowar roti': { calories: 220, proteinG: 7, carbsG: 44, fatG: 2.5 },
  'ragi mudde': { calories: 150, proteinG: 4, carbsG: 32, fatG: 1.5 },
  'avial': { calories: 110, proteinG: 3.5, carbsG: 10, fatG: 7 },
  'thoran': { calories: 90, proteinG: 3, carbsG: 8, fatG: 5.5 },
  'poriyal': { calories: 85, proteinG: 3, carbsG: 9, fatG: 4.5 },
  'kootu': { calories: 100, proteinG: 5, carbsG: 14, fatG: 3 },
  'olan': { calories: 120, proteinG: 3, carbsG: 8, fatG: 9 },
  'erissery': { calories: 140, proteinG: 5, carbsG: 12, fatG: 8.5 },
  'chole kulche': { calories: 230, proteinG: 8, carbsG: 38, fatG: 6 },
  'matar kulcha': { calories: 200, proteinG: 7, carbsG: 34, fatG: 5 },
  'litti chokha': { calories: 220, proteinG: 7, carbsG: 38, fatG: 5 },
  'sattu paratha': { calories: 270, proteinG: 10, carbsG: 42, fatG: 6 },
  'gobi paratha': { calories: 240, proteinG: 6, carbsG: 38, fatG: 8 },
  'mooli paratha': { calories: 230, proteinG: 5, carbsG: 38, fatG: 7 },
  'rava idli': { calories: 150, proteinG: 4, carbsG: 28, fatG: 3 },
  'pav': { calories: 260, proteinG: 8, carbsG: 50, fatG: 3 },
  'usal': { calories: 140, proteinG: 8, carbsG: 20, fatG: 4 },
  // ── Indian Breads & Rice ──
  'tandoori roti': { calories: 270, proteinG: 8, carbsG: 52, fatG: 3 },
  'rumali roti': { calories: 250, proteinG: 7, carbsG: 50, fatG: 2 },
  'bhatura': { calories: 340, proteinG: 8, carbsG: 50, fatG: 12 },
  'amritsari kulcha': { calories: 290, proteinG: 8, carbsG: 48, fatG: 7 },
  'lachha paratha': { calories: 330, proteinG: 7, carbsG: 46, fatG: 14 },
  'missi roti': { calories: 280, proteinG: 9, carbsG: 44, fatG: 8 },
  'sheermal': { calories: 320, proteinG: 7, carbsG: 55, fatG: 9 },
  'bakarkhani': { calories: 380, proteinG: 8, carbsG: 58, fatG: 16 },
  'warqi paratha': { calories: 360, proteinG: 7, carbsG: 50, fatG: 16 },
  'cheese naan': { calories: 310, proteinG: 9, carbsG: 52, fatG: 8 },
  'garlic naan': { calories: 300, proteinG: 8, carbsG: 54, fatG: 6 },
  'jeera rice': { calories: 170, proteinG: 4, carbsG: 34, fatG: 2.5 },
  'ghee rice': { calories: 210, proteinG: 4, carbsG: 36, fatG: 6 },
  'veg pulao': { calories: 160, proteinG: 4, carbsG: 30, fatG: 3.5 },
  'egg biryani': { calories: 175, proteinG: 8, carbsG: 26, fatG: 5 },
  'tomato rice': { calories: 170, proteinG: 4, carbsG: 33, fatG: 3 },
  'coconut rice': { calories: 220, proteinG: 4, carbsG: 36, fatG: 7 },
  'sambar rice': { calories: 140, proteinG: 5, carbsG: 24, fatG: 3 },
  'mint rice': { calories: 165, proteinG: 4, carbsG: 32, fatG: 3 },
  'vangi bath': { calories: 170, proteinG: 4, carbsG: 32, fatG: 4 },
  'schezwan fried rice': { calories: 190, proteinG: 5, carbsG: 32, fatG: 5 },
  'tawa pulao': { calories: 180, proteinG: 5, carbsG: 32, fatG: 4 },
  // ── Packaged Snacks ──
  'haldirams aloo bhujia': { calories: 520, proteinG: 10, carbsG: 52, fatG: 30 },
  'moong dal namkeen': { calories: 460, proteinG: 18, carbsG: 40, fatG: 26 },
  'chana chor garam': { calories: 430, proteinG: 14, carbsG: 48, fatG: 20 },
  'kurkure masala munch': { calories: 540, proteinG: 7, carbsG: 58, fatG: 32 },
  'lays magic masala': { calories: 530, proteinG: 7, carbsG: 56, fatG: 32 },
  'balaji masala wafers': { calories: 540, proteinG: 6, carbsG: 54, fatG: 34 },
  'parle hide and seek': { calories: 480, proteinG: 6, carbsG: 66, fatG: 22 },
  'britannia good day': { calories: 490, proteinG: 6, carbsG: 64, fatG: 24 },
  'sunfeast dark fantasy': { calories: 500, proteinG: 5, carbsG: 62, fatG: 25 },
  'parle monaco': { calories: 470, proteinG: 8, carbsG: 64, fatG: 22 },
  'krackjack': { calories: 450, proteinG: 7, carbsG: 68, fatG: 18 },
  'too yumm multigrain chips': { calories: 460, proteinG: 9, carbsG: 60, fatG: 21 },
  'makhana': { calories: 350, proteinG: 9, carbsG: 70, fatG: 3 },
  'roasted peanuts': { calories: 570, proteinG: 26, carbsG: 16, fatG: 49 },
  'banana chips': { calories: 520, proteinG: 3, carbsG: 58, fatG: 34 },
  'tapioca chips': { calories: 500, proteinG: 2, carbsG: 62, fatG: 28 },
  'murukku': { calories: 470, proteinG: 9, carbsG: 54, fatG: 26 },
  'thattai': { calories: 450, proteinG: 8, carbsG: 58, fatG: 22 },
  'bikaji bhujia': { calories: 520, proteinG: 11, carbsG: 50, fatG: 31 },
  'uncle chipps': { calories: 550, proteinG: 6, carbsG: 52, fatG: 36 },
  'bingo mad angles': { calories: 530, proteinG: 8, carbsG: 58, fatG: 30 },
  'britannia 50 50': { calories: 480, proteinG: 7, carbsG: 66, fatG: 21 },
  'sunfeast moms magic': { calories: 490, proteinG: 6, carbsG: 64, fatG: 24 },
  'haldirams navratan mixture': { calories: 480, proteinG: 12, carbsG: 48, fatG: 28 },
  'maggi masala noodles': { calories: 380, proteinG: 8, carbsG: 62, fatG: 11 },
  'yippee noodles': { calories: 370, proteinG: 8, carbsG: 64, fatG: 9 },
  'parle-g': { calories: 450, proteinG: 7, carbsG: 72, fatG: 15 },
  'marie gold': { calories: 440, proteinG: 7, carbsG: 74, fatG: 13 },
  'bingo tedhe medhe': { calories: 520, proteinG: 8, carbsG: 60, fatG: 28 },
  'garden farali chevdo': { calories: 450, proteinG: 8, carbsG: 58, fatG: 22 },
  // ── Indian Beverages & Dairy ──
  'filter coffee': { calories: 60, proteinG: 2.5, carbsG: 8, fatG: 2 },
  'cutting chai': { calories: 65, proteinG: 2.5, carbsG: 8, fatG: 2.5 },
  'nimbu pani': { calories: 40, proteinG: 0.2, carbsG: 10, fatG: 0 },
  'aam panna': { calories: 55, proteinG: 0.3, carbsG: 14, fatG: 0 },
  'jaljeera': { calories: 35, proteinG: 0.5, carbsG: 8, fatG: 0.2 },
  'sugarcane juice': { calories: 70, proteinG: 0.3, carbsG: 18, fatG: 0.1 },
  'cold coffee': { calories: 90, proteinG: 3, carbsG: 14, fatG: 2.5 },
  'badam milk': { calories: 110, proteinG: 4, carbsG: 14, fatG: 4.5 },
  'thandai': { calories: 130, proteinG: 4, carbsG: 18, fatG: 5 },
  'haldi doodh': { calories: 80, proteinG: 3.5, carbsG: 9, fatG: 3.5 },
  'mango lassi': { calories: 120, proteinG: 3, carbsG: 20, fatG: 3.5 },
  'solkadhi': { calories: 50, proteinG: 1.5, carbsG: 6, fatG: 2.5 },
  'sattu drink': { calories: 90, proteinG: 4, carbsG: 16, fatG: 1.5 },
  'kesar milk': { calories: 120, proteinG: 4.5, carbsG: 16, fatG: 4.5 },
  'rose sharbat': { calories: 70, proteinG: 0.2, carbsG: 18, fatG: 0 },
  'masala milk': { calories: 110, proteinG: 4, carbsG: 13, fatG: 5 },
  'strawberry lassi': { calories: 125, proteinG: 3, carbsG: 21, fatG: 3.5 },
  'amrakhand': { calories: 200, proteinG: 5, carbsG: 28, fatG: 7.5 },
  'masala chaas': { calories: 40, proteinG: 2, carbsG: 4, fatG: 1.5 },
  'khoa': { calories: 420, proteinG: 12, carbsG: 30, fatG: 28 },
  'mawa': { calories: 420, proteinG: 12, carbsG: 30, fatG: 28 },
  'rabri': { calories: 280, proteinG: 8, carbsG: 28, fatG: 15 },
  'basundi': { calories: 220, proteinG: 7, carbsG: 26, fatG: 11 },
  'sheer khurma': { calories: 180, proteinG: 5, carbsG: 24, fatG: 8 },
  'hung curd': { calories: 90, proteinG: 6, carbsG: 6, fatG: 5 },
  // ── Restaurant & Indo-Chinese ──
  'veg momos': { calories: 180, proteinG: 6, carbsG: 30, fatG: 4 },
  'chicken momos': { calories: 200, proteinG: 10, carbsG: 28, fatG: 4 },
  'veg hakka noodles': { calories: 160, proteinG: 5, carbsG: 28, fatG: 3.5 },
  'veg manchurian': { calories: 190, proteinG: 6, carbsG: 24, fatG: 10 },
  'veg fried rice': { calories: 170, proteinG: 4.5, carbsG: 32, fatG: 3 },
  'paneer tikka sandwich': { calories: 240, proteinG: 10, carbsG: 28, fatG: 10 },
  'chole bhature': { calories: 250, proteinG: 8, carbsG: 36, fatG: 9 },
  'rajma chawal': { calories: 150, proteinG: 6, carbsG: 26, fatG: 2.5 },
  'kadhi chawal': { calories: 140, proteinG: 5, carbsG: 24, fatG: 3 },
  'kadhi': { calories: 90, proteinG: 4, carbsG: 8, fatG: 6 },
  'chilli paneer': { calories: 220, proteinG: 12, carbsG: 12, fatG: 14 },
  'veg kolhapuri': { calories: 150, proteinG: 5, carbsG: 14, fatG: 9 },
  'dal fry': { calories: 120, proteinG: 7, carbsG: 14, fatG: 4.5 },
  'egg bhurji': { calories: 170, proteinG: 11, carbsG: 3, fatG: 13 },
  'chicken 65': { calories: 280, proteinG: 20, carbsG: 12, fatG: 17 },
  'tandoori chicken': { calories: 170, proteinG: 25, carbsG: 2, fatG: 7 },
  'omelette': { calories: 180, proteinG: 11, carbsG: 2, fatG: 14 },
  'shahi paneer': { calories: 230, proteinG: 9, carbsG: 10, fatG: 18 },
  'matar paneer': { calories: 190, proteinG: 10, carbsG: 10, fatG: 13 },
  'kadhai paneer': { calories: 210, proteinG: 11, carbsG: 8, fatG: 15 },
  'malai kofta': { calories: 240, proteinG: 8, carbsG: 14, fatG: 18 },
  'navratan korma': { calories: 200, proteinG: 6, carbsG: 16, fatG: 13 },
  'mix veg': { calories: 110, proteinG: 3.5, carbsG: 12, fatG: 6 },
  'paneer do pyaza': { calories: 200, proteinG: 10, carbsG: 9, fatG: 14 },
  'mushroom masala': { calories: 140, proteinG: 4, carbsG: 8, fatG: 11 },
  'hummus': { calories: 180, proteinG: 5, carbsG: 12, fatG: 12 },
  'cheese sandwich': { calories: 280, proteinG: 10, carbsG: 32, fatG: 12 },
  'french fries': { calories: 320, proteinG: 3.5, carbsG: 38, fatG: 17 },
  'garlic bread': { calories: 350, proteinG: 9, carbsG: 50, fatG: 14 },
  'veg sandwich': { calories: 220, proteinG: 7, carbsG: 34, fatG: 6 },
  'gobi manchurian': { calories: 180, proteinG: 6, carbsG: 22, fatG: 8 },
  'schezwan noodles': { calories: 190, proteinG: 6, carbsG: 32, fatG: 6 },
  // ── More Fruits ──
  'papaya': { calories: 43, proteinG: 0.5, carbsG: 11, fatG: 0.3 },
  'pomegranate': { calories: 83, proteinG: 1.7, carbsG: 18.7, fatG: 1.2 },
  'guava': { calories: 68, proteinG: 2.6, carbsG: 14.3, fatG: 1 },
  'sapota': { calories: 83, proteinG: 0.4, carbsG: 20, fatG: 1.1 },
  'custard apple': { calories: 94, proteinG: 2.1, carbsG: 23.6, fatG: 0.3 },
  'kiwi': { calories: 61, proteinG: 1.1, carbsG: 14.7, fatG: 0.5 },
  'jamun': { calories: 62, proteinG: 0.7, carbsG: 15.6, fatG: 0.2 },
  'litchi': { calories: 66, proteinG: 0.8, carbsG: 16.5, fatG: 0.4 },
  'pear': { calories: 57, proteinG: 0.4, carbsG: 15.2, fatG: 0.1 },
  'peach': { calories: 39, proteinG: 0.9, carbsG: 9.5, fatG: 0.3 },
  'plum': { calories: 46, proteinG: 0.7, carbsG: 11.4, fatG: 0.3 },
  'ber': { calories: 70, proteinG: 1.2, carbsG: 17, fatG: 0.3 },
  'dragon fruit': { calories: 60, proteinG: 1.2, carbsG: 13, fatG: 0.4 },
  'bael': { calories: 140, proteinG: 3, carbsG: 32, fatG: 1 },
  'tamarind': { calories: 240, proteinG: 3, carbsG: 62, fatG: 0.6 },
  'amla': { calories: 44, proteinG: 0.9, carbsG: 10.2, fatG: 0.6 },
  // ── More Vegetables ──
  'cabbage': { calories: 25, proteinG: 1.3, carbsG: 5.8, fatG: 0.1 },
  'mushrooms': { calories: 27, proteinG: 3.1, carbsG: 3.3, fatG: 0.3 },
  'carrots': { calories: 41, proteinG: 0.9, carbsG: 9.6, fatG: 0.2 },
  'beetroot': { calories: 43, proteinG: 1.6, carbsG: 9.6, fatG: 0.2 },
  'radish': { calories: 16, proteinG: 0.7, carbsG: 3.4, fatG: 0.1 },
  'pumpkin': { calories: 26, proteinG: 1, carbsG: 6.5, fatG: 0.1 },
  'bottle gourd': { calories: 14, proteinG: 0.6, carbsG: 3.4, fatG: 0.02 },
  'ridge gourd': { calories: 20, proteinG: 0.8, carbsG: 4.3, fatG: 0.2 },
  'bitter gourd': { calories: 19, proteinG: 1, carbsG: 3.7, fatG: 0.2 },
  'drumstick': { calories: 40, proteinG: 2.5, carbsG: 8, fatG: 0.3 },
  'colocasia': { calories: 112, proteinG: 1.5, carbsG: 26.5, fatG: 0.2 },
  'raw banana': { calories: 110, proteinG: 1.2, carbsG: 28, fatG: 0.3 },
  'tinda': { calories: 20, proteinG: 0.8, carbsG: 4, fatG: 0.2 },
  'parwal': { calories: 25, proteinG: 1, carbsG: 5, fatG: 0.3 },
  'suran': { calories: 80, proteinG: 1.5, carbsG: 18, fatG: 0.3 },
  // ── Dals, Flours & Grains ──
  'dalia': { calories: 340, proteinG: 11, carbsG: 72, fatG: 1.5 },
  'ragi flour': { calories: 330, proteinG: 7.5, carbsG: 72, fatG: 1.8 },
  'bajra flour': { calories: 360, proteinG: 11, carbsG: 67, fatG: 5 },
  'jowar flour': { calories: 350, proteinG: 10, carbsG: 72, fatG: 3 },
  'besan': { calories: 360, proteinG: 22, carbsG: 58, fatG: 6.5 },
  'suji': { calories: 360, proteinG: 10, carbsG: 73, fatG: 1.5 },
  'maida': { calories: 364, proteinG: 10, carbsG: 76, fatG: 1 },
  'rice flour': { calories: 360, proteinG: 6, carbsG: 78, fatG: 1 },
  'muesli': { calories: 360, proteinG: 10, carbsG: 66, fatG: 6 },
  'cornflakes': { calories: 370, proteinG: 7, carbsG: 84, fatG: 1 },
  'granola': { calories: 450, proteinG: 10, carbsG: 60, fatG: 20 },
  'masoor dal': { calories: 120, proteinG: 9, carbsG: 20, fatG: 0.8 },
  'green moong dal': { calories: 130, proteinG: 9, carbsG: 22, fatG: 1 },
  'urad dal': { calories: 140, proteinG: 9, carbsG: 24, fatG: 1.2 },
  'moth beans': { calories: 120, proteinG: 8, carbsG: 20, fatG: 1 },
  'lobia': { calories: 125, proteinG: 8, carbsG: 22, fatG: 0.8 },
  'chana dal': { calories: 135, proteinG: 9, carbsG: 23, fatG: 1 },
  // ── Proteins, Nuts, Seeds & Extras ──
  'soy chaap': { calories: 180, proteinG: 16, carbsG: 10, fatG: 9 },
  'keema': { calories: 220, proteinG: 18, carbsG: 3, fatG: 15 },
  'flaxseeds': { calories: 534, proteinG: 18, carbsG: 29, fatG: 42 },
  'chia seeds': { calories: 486, proteinG: 17, carbsG: 42, fatG: 31 },
  'sunflower seeds': { calories: 584, proteinG: 21, carbsG: 20, fatG: 51 },
  'pumpkin seeds': { calories: 559, proteinG: 30, carbsG: 11, fatG: 49 },
  'sesame seeds': { calories: 573, proteinG: 18, carbsG: 23, fatG: 50 },
  'coconut': { calories: 354, proteinG: 3.3, carbsG: 15, fatG: 33.5 },
  'coconut milk': { calories: 150, proteinG: 1.5, carbsG: 4, fatG: 14 },
  'phulka': { calories: 265, proteinG: 8, carbsG: 53, fatG: 2 },
  'lady finger': { calories: 90, proteinG: 2.2, carbsG: 9, fatG: 5 },
  'eggplant': { calories: 35, proteinG: 1, carbsG: 8, fatG: 0.3 },
  'brinjal': { calories: 35, proteinG: 1, carbsG: 8, fatG: 0.3 },
  'jaggery': { calories: 380, proteinG: 0.5, carbsG: 97, fatG: 0.2 },
  'gur': { calories: 380, proteinG: 0.5, carbsG: 97, fatG: 0.2 },
  'raisins': { calories: 300, proteinG: 3, carbsG: 79, fatG: 0.5 },
  'kishmish': { calories: 300, proteinG: 3, carbsG: 79, fatG: 0.5 },
  'figs': { calories: 260, proteinG: 3.5, carbsG: 64, fatG: 1 },
  'anjeer': { calories: 260, proteinG: 3.5, carbsG: 64, fatG: 1 },
  'sitaphal': { calories: 94, proteinG: 2.1, carbsG: 23.6, fatG: 0.3 },
  'sapodilla': { calories: 83, proteinG: 0.4, carbsG: 20, fatG: 1.1 },
  'sugar': { calories: 387, proteinG: 0, carbsG: 100, fatG: 0 },
  'soya milk': { calories: 45, proteinG: 3.5, carbsG: 4, fatG: 2 },
  'brown bread': { calories: 250, proteinG: 9, carbsG: 46, fatG: 3.5 },
};

/**
 * The live food database: base entries plus the curated Indian thali
 * overlay (lib/indian-foods.ts) — IFCT-aligned values for the classic
 * confusables (dal tadka vs makhani vs sambar vs rasam vs kadhi) and
 * thali staples. Overlay keys win where both define a dish.
 */
export const FOOD_DB: Record<string, Omit<FoodItem, 'name'>> = {
  ...FOOD_DB_BASE,
  ...INDIAN_FOOD_VALUES,
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
  // One thali = one full plate (~650 g). Without this, the text parser
  // matched 'veg thali' but weighed it as a generic 100 g piece (R3).
  thali: 650,
  'veg thali': 650,
  'pre-workout': 10,
  preworkout: 10,
  bcaa: 7,
  'jalebi': 20,
  'rasgulla': 40,
  'kaju katli': 15,
  'motichoor ladoo': 30,
  'besan ladoo': 30,
  'rasmalai': 80,
  'milk barfi': 20,
  'gajar halwa': 150,
  'suji halwa': 150,
  'kulfi': 80,
  'mysore pak': 25,
  'sandesh': 30,
  'shrikhand': 150,
  'misti doi': 100,
  'balushahi': 35,
  'imarti': 25,
  'kalakand': 25,
  'peda': 20,
  'kheer': 150,
  'phirni': 150,
  'til ladoo': 25,
  'coconut ladoo': 25,
  'anjeer barfi': 20,
  'soan papdi': 20,
  'malpua': 40,
  'shahi tukda': 80,
  'mohanthal': 25,
  'coconut barfi': 20,
  'dry fruit barfi': 20,
  'chamcham': 40,
  'rajbhog': 40,
  'pani puri': 20,
  'bhel puri': 150,
  'sev puri': 25,
  'dahi puri': 25,
  'aloo tikki': 60,
  'papdi chaat': 150,
  'samosa chaat': 200,
  'vada pav': 150,
  'pav bhaji': 300,
  'misal pav': 300,
  'dabeli': 120,
  'kachori': 60,
  'dahi bhalla': 150,
  'aloo chaat': 150,
  'chana chaat': 150,
  'bread pakora': 80,
  'sabudana vada': 50,
  'mirchi vada': 60,
  'kothimbir vadi': 40,
  'chakli': 15,
  'fafda': 30,
  'mathri': 20,
  'khakhra': 30,
  'dahi ke kebab': 40,
  'hara bhara kebab': 40,
  'veg cutlet': 50,
  'bread roll': 80,
  'uttapam': 120,
  'ven pongal': 200,
  'pongal': 200,
  'appam': 60,
  'puttu': 150,
  'idiyappam': 50,
  'pesarattu': 120,
  'adai dosa': 120,
  'curd rice': 200,
  'thayir sadam': 200,
  'lemon rice': 200,
  'bisibelebath': 250,
  'rava dosa': 120,
  'neer dosa': 60,
  'set dosa': 80,
  'tomato bath': 200,
  'puliyodarai': 200,
  'ghee roast dosa': 130,
  'onion dosa': 120,
  'paper dosa': 60,
  'mysore masala dosa': 150,
  'sarson ka saag': 200,
  'makki di roti': 60,
  'dal baati churma': 250,
  'baingan bharta': 200,
  'dum aloo': 200,
  'lauki sabzi': 200,
  'undhiyu': 200,
  'thepla': 40,
  'dhokla': 30,
  'khandvi': 20,
  'goan fish curry': 200,
  'chettinad chicken curry': 200,
  'malabar parotta': 90,
  'dal dhokli': 250,
  'gatte ki sabzi': 200,
  'bajra roti': 60,
  'jowar roti': 60,
  'ragi mudde': 150,
  'avial': 200,
  'thoran': 150,
  'poriyal': 150,
  'kootu': 200,
  'olan': 200,
  'erissery': 200,
  'chole kulche': 250,
  'matar kulcha': 250,
  'litti chokha': 200,
  'sattu paratha': 90,
  'gobi paratha': 110,
  'mooli paratha': 110,
  'rava idli': 40,
  'pav': 50,
  'usal': 200,
  'tandoori roti': 50,
  'rumali roti': 30,
  'bhatura': 70,
  'amritsari kulcha': 90,
  'lachha paratha': 80,
  'missi roti': 60,
  'sheermal': 60,
  'bakarkhani': 60,
  'warqi paratha': 80,
  'cheese naan': 110,
  'garlic naan': 100,
  'jeera rice': 200,
  'ghee rice': 200,
  'veg pulao': 200,
  'egg biryani': 250,
  'tomato rice': 200,
  'coconut rice': 200,
  'sambar rice': 250,
  'mint rice': 200,
  'vangi bath': 200,
  'schezwan fried rice': 200,
  'tawa pulao': 200,
  'haldirams aloo bhujia': 30,
  'moong dal namkeen': 30,
  'chana chor garam': 30,
  'kurkure masala munch': 30,
  'lays magic masala': 30,
  'balaji masala wafers': 30,
  'parle hide and seek': 10,
  'britannia good day': 10,
  'sunfeast dark fantasy': 10,
  'parle monaco': 10,
  'krackjack': 10,
  'too yumm multigrain chips': 30,
  'makhana': 30,
  'roasted peanuts': 30,
  'banana chips': 30,
  'tapioca chips': 30,
  'murukku': 15,
  'thattai': 15,
  'bikaji bhujia': 30,
  'uncle chipps': 30,
  'bingo mad angles': 30,
  'britannia 50 50': 10,
  'sunfeast moms magic': 10,
  'haldirams navratan mixture': 30,
  'maggi masala noodles': 70,
  'yippee noodles': 70,
  'parle-g': 10,
  'marie gold': 8,
  'bingo tedhe medhe': 30,
  'garden farali chevdo': 30,
  'filter coffee': 150,
  'cutting chai': 100,
  'nimbu pani': 250,
  'aam panna': 250,
  'jaljeera': 250,
  'sugarcane juice': 250,
  'cold coffee': 250,
  'badam milk': 200,
  'thandai': 200,
  'haldi doodh': 200,
  'mango lassi': 250,
  'solkadhi': 200,
  'sattu drink': 250,
  'kesar milk': 200,
  'rose sharbat': 250,
  'masala milk': 200,
  'strawberry lassi': 250,
  'amrakhand': 100,
  'masala chaas': 250,
  'rabri': 100,
  'basundi': 100,
  'sheer khurma': 150,
  'hung curd': 100,
  'veg momos': 25,
  'chicken momos': 25,
  'veg hakka noodles': 200,
  'veg manchurian': 200,
  'veg fried rice': 200,
  'paneer tikka sandwich': 150,
  'chole bhature': 350,
  'rajma chawal': 300,
  'kadhi chawal': 300,
  'kadhi': 200,
  'chilli paneer': 200,
  'veg kolhapuri': 200,
  'dal fry': 200,
  'egg bhurji': 150,
  'chicken 65': 200,
  'tandoori chicken': 200,
  'omelette': 100,
  'shahi paneer': 200,
  'matar paneer': 200,
  'kadhai paneer': 200,
  'malai kofta': 200,
  'navratan korma': 200,
  'mix veg': 200,
  'paneer do pyaza': 200,
  'mushroom masala': 200,
  'hummus': 50,
  'cheese sandwich': 120,
  'french fries': 150,
  'garlic bread': 100,
  'veg sandwich': 120,
  'papaya': 200,
  'pomegranate': 200,
  'guava': 150,
  'sapota': 80,
  'custard apple': 200,
  'kiwi': 75,
  'jamun': 10,
  'litchi': 15,
  'pear': 180,
  'peach': 150,
  'plum': 70,
  'ber': 15,
  'dragon fruit': 200,
  'bael': 200,
  'amla': 20,
  'carrots': 60,
  'beetroot': 150,
  'radish': 100,
  'bitter gourd': 100,
  'raw banana': 120,
  'muesli': 50,
  'cornflakes': 30,
  'granola': 50,
  'masoor dal': 200,
  'green moong dal': 200,
  'urad dal': 200,
  'moth beans': 150,
  'lobia': 150,
  'chana dal': 150,
  'soy chaap': 100,
  'keema': 200,
  'flaxseeds': 10,
  'chia seeds': 10,
  'sunflower seeds': 10,
  'pumpkin seeds': 10,
  'sesame seeds': 10,
  'coconut': 100,
  'coconut milk': 200,
  'phulka': 30,
  'jaggery': 10,
  'gur': 10,
  'raisins': 8,
  'kishmish': 8,
  'figs': 15,
  'anjeer': 15,
  'sitaphal': 200,
  'sapodilla': 80,
  'sugar': 5,
  'soya milk': 250,
  'brown bread': 30,
  'poha chivda': 30,
  'corn chaat': 150,
  'sprouts chaat': 150,
  'paneer pakora': 50,
  'gobi manchurian': 200,
  'schezwan noodles': 200,
  'masala papad': 15,
  'roasted papad': 15,
};

function findBestMatch(normalizedName: string): string {
  if (normalizedName.length < 2) return '';

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
    if (normalizedName.length >= 3 && key.includes(normalizedName)) {
      const score = normalizedName.length / key.length;
      if (score > bestScore + 0.05) { bestScore = score + 0.05; bestKey = key; }
    }
  }

  if (bestKey && bestScore >= 0.25) return bestKey;

  // 3) Word overlap fallback
  const inputWords = normalizedName.split(/\s+/).filter(w => w.length >= 3);
  for (const key of Object.keys(FOOD_DB)) {
    const keyWords = key.split(/\s+/).filter(w => w.length >= 3);
    const overlap = inputWords.filter(w => keyWords.includes(w)).length;
    if (overlap > 0) {
      const score = overlap / Math.max(inputWords.length, keyWords.length);
      if (score > bestScore && score >= 0.3) { bestScore = score; bestKey = key; }
    }
  }

  return bestScore >= 0.25 ? bestKey : '';
}

export function estimateMacros(foodName: string, quantity?: number, unit: string = 'g'): FoodItem {
  let normalizedName = foodName.toLowerCase().trim();

  if (!normalizedName) {
    return { name: foodName, calories: 0, proteinG: 0, carbsG: 0, fatG: 0, quantity, unit, isUnmatched: true };
  }

  // Strip common conversational filler words: "about", "around", "approx", "of", "having", "some"
  normalizedName = normalizedName
    .replace(/\b(i ate|i had|ate|had|having|about|around|approx|approximately|some|of|a plate of|a bowl of|a cup of)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let effectiveQty = quantity;
  let effectiveUnit = unit || 'g';
  let cleanFoodName = normalizedName;

  // If quantity was not explicitly supplied or was left as 1, check if foodName itself contains quantity & unit
  // e.g. "oats 100gm", "100g oats", "2 roti", "150g paneer"
  if (effectiveQty === undefined || effectiveQty === null || effectiveQty === 1) {
    const prefixMatch = cleanFoodName.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.+)$/);
    const suffixMatch = cleanFoodName.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/);

    if (prefixMatch) {
      const q = parseFloat(prefixMatch[1]);
      const potentialU = (prefixMatch[2] || '').toLowerCase();
      const rest = prefixMatch[3].trim();
      const knownUnits = ['g', 'gm', 'gram', 'grams', 'ml', 'oz', 'lb', 'lbs', 'kg', 'scoop', 'scoops', 'cup', 'cups', 'bowl', 'bowls', 'plate', 'plates', 'slice', 'slices', 'piece', 'pieces', 'pc', 'pcs', 'handful', 'katori', 'glass'];
      if (knownUnits.includes(potentialU)) {
        effectiveQty = q;
        effectiveUnit = potentialU.replace(/s$/, '').replace(/gm$/, 'g').replace(/gram$/, 'g').replace(/pc$/, 'piece');
        cleanFoodName = rest;
      } else if (!potentialU) {
        effectiveQty = q;
        effectiveUnit = 'piece';
        cleanFoodName = rest;
      }
    } else if (suffixMatch) {
      const q = parseFloat(suffixMatch[2]);
      const potentialU = (suffixMatch[3] || 'g').toLowerCase();
      effectiveQty = q;
      effectiveUnit = potentialU.replace(/s$/, '').replace(/gm$/, 'g').replace(/gram$/, 'g');
      cleanFoodName = suffixMatch[1].trim();
    }
  }

  const matchedKey = findBestMatch(cleanFoodName);
  const isUnmatched = !matchedKey || !FOOD_DB[matchedKey];
  const baseMacros = !isUnmatched ? FOOD_DB[matchedKey] : EMPTY_MACROS;

  // If still no quantity provided, return raw per-100g data without scaling
  if (effectiveQty === undefined || effectiveQty === null || effectiveQty === 0) {
    return {
      name: foodName,
      calories: Math.round(baseMacros.calories),
      proteinG: Number(baseMacros.proteinG.toFixed(1)),
      carbsG: Number(baseMacros.carbsG.toFixed(1)),
      fatG: Number(baseMacros.fatG.toFixed(1)),
      quantity: undefined,
      unit: effectiveUnit,
      isUnmatched,
    };
  }

  const safeQty = Number.isFinite(effectiveQty) && effectiveQty > 0 ? effectiveQty : 1;
  const u = (effectiveUnit || 'g').toLowerCase().trim();

  // Calculate equivalent in grams
  let grams = safeQty;
  if (u === 'g' || u === 'ml' || u === 'gm' || u === 'gram' || u === 'grams') {
    grams = safeQty;
  } else if (u === 'kg' || u === 'l') {
    grams = safeQty * 1000;
  } else if (u === 'oz') {
    grams = safeQty * 28.3495;
  } else if (u === 'lb' || u === 'lbs') {
    grams = safeQty * 453.592;
  } else if (u === 'scoop' || u === 'scoops') {
    grams = safeQty * 30; // 1 standard protein scoop ~30g
  } else if (u === 'tbsp') {
    grams = safeQty * 15;
  } else if (u === 'tsp') {
    grams = safeQty * 5;
  } else if (u === 'slice' || u === 'slices') {
    grams = safeQty * 35; // 1 slice ~35g
  } else if (u === 'piece' || u === 'pieces' || u === 'pcs' || u === 'pc') {
    // Curated Indian household units win (a phulka is 30g, a tandoori
    // roti 40g), then the generic piece-weight table.
    const metaPiece = matchedKey ? getHouseholdUnitGrams(matchedKey, 'piece') : undefined;
    const pieceWeight =
      metaPiece ??
      (PIECE_WEIGHTS[cleanFoodName] ||
        (matchedKey ? PIECE_WEIGHTS[matchedKey] : undefined) ||
        100);
    grams = safeQty * pieceWeight;
  } else if (u === 'cup' || u === 'cups') {
    grams = safeQty * 240;
  } else if (u === 'bowl' || u === 'bowls') {
    grams = safeQty * ((matchedKey ? getHouseholdUnitGrams(matchedKey, 'bowl') : undefined) ?? 200);
  } else if (u === 'katori') {
    // A katori of sabzi (~120g) is lighter than a katori of dal (~150g) —
    // the curated per-food equivalent wins when defined.
    grams = safeQty * ((matchedKey ? getHouseholdUnitGrams(matchedKey, 'katori') : undefined) ?? 150);
  } else if (u === 'glass' || u === 'glas') {
    grams = safeQty * ((matchedKey ? getHouseholdUnitGrams(matchedKey, 'glass') : undefined) ?? 200);
  } else if (u === 'plate' || u === 'plates' || u === 'serving') {
    grams = safeQty * ((matchedKey ? getHouseholdUnitGrams(matchedKey, 'plate') : undefined) ?? 250);
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
    unit: effectiveUnit,
    isUnmatched,
  };
}

/**
 * Computes exact Atwater calories from macronutrients: (4 * P) + (4 * C) + (9 * F)
 */
export function calculateCaloriesFromMacros(proteinG: number, carbsG: number, fatG: number): number {
  const p = Math.max(0, Number(proteinG) || 0);
  const c = Math.max(0, Number(carbsG) || 0);
  const f = Math.max(0, Number(fatG) || 0);
  return Math.round(4 * p + 4 * c + 9 * f);
}

/**
 * Returns difference between stated calories and expected Atwater calories.
 */
export function getMacroCalorieDrift(calories: number, proteinG: number, carbsG: number, fatG: number): number {
  const expected = calculateCaloriesFromMacros(proteinG, carbsG, fatG);
  const stated = Math.max(0, Number(calories) || 0);
  return stated - expected;
}

export function calculateMealMacros(foods: FoodItem[]): MacroTotals {
  if (!foods || !Array.isArray(foods)) {
    return { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  }

  const totals: MacroTotals = foods.reduce(
    (acc, food) => {
      const p = Math.max(0, Number(food.proteinG) || 0);
      const c = Math.max(0, Number(food.carbsG) || 0);
      const f = Math.max(0, Number(food.fatG) || 0);
      let cal = Math.max(0, Number(food.calories) || 0);

      // If calories is 0 or unrecorded but macros are present, reconcile via Atwater
      if (cal === 0 && (p > 0 || c > 0 || f > 0)) {
        cal = Math.round(4 * p + 4 * c + 9 * f);
      }

      return {
        calories: acc.calories + cal,
        proteinG: Number((acc.proteinG + p).toFixed(1)),
        carbsG: Number((acc.carbsG + c).toFixed(1)),
        fatG: Number((acc.fatG + f).toFixed(1)),
      };
    },
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );

  // Sugar totals only when at least one item actually carries sugar data
  // (barcode scans do; most DB entries don't). Unknown stays unknown.
  const sugarItems = foods.filter((f) => typeof f.sugarG === 'number');
  if (sugarItems.length > 0) {
    totals.sugarG = Number(
      sugarItems.reduce((sum, f) => sum + Math.max(0, Number(f.sugarG) || 0), 0).toFixed(1)
    );
  }
  return totals;
}

/** Returns food names from DB for autocomplete */
export function getFoodSuggestions(query: string): string[] {
  if (!query || query.length < 1) return [];
  // QA4-029: Devanagari queries (दाल, चावल, रोटी) are expanded to their
  // Latin equivalents first — the DB is Latin-keyed, so matching the raw
  // script against it always returned [] and looked like "food missing".
  const queries = expandFoodQuery(query);
  const keys = Object.keys(FOOD_DB);
  const matched: string[] = [];
  const seenKeys = new Set<string>();
  for (const q of queries) {
    for (const k of keys) {
      if (seenKeys.has(k)) continue;
      if (k.includes(q) || q.includes(k.split(' ')[0])) {
        seenKeys.add(k);
        matched.push(k);
        if (matched.length >= 6) break;
      }
    }
    if (matched.length >= 6) break;
  }
  return matched
    .slice(0, 6)
    .map(k => k.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
}

/**
 * Natural language food parser for offline and fast local processing.
 * Parses input strings like "2 roti, 1 bowl dal, 100g paneer", "oats about 100gm", or "1 scoop whey, 400ml milk"
 */
// Hindi number words a Hindi-first user actually types ("do roti",
// "ek katori dal"). Mapped before the numeric quantity parsing runs.
const HINDI_NUMBER_WORDS: Record<string, number> = {
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  chhe: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  aadha: 0.5,
  adha: 0.5,
};

export function parseNaturalMealOffline(input: string): FoodItem[] {
  if (!input || !input.trim()) return [];

  // QA4-029: a Devanagari meal ("दो रोटी, एक कटोरी दाल") transliterates
  // to Latin first ("do roti, ek katori dal") so the Latin-keyed DB and
  // the Hindi number-word mapping below both work on it.
  const source = containsDevanagari(input) ? transliterateDevanagari(input) : input;

  // Split by commas, plus signs, newlines, " and ", or Hindi " aur "
  const tokens = source
    .split(/,|\n|\+|\band\b|\baur\b/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const parsedItems: FoodItem[] = [];

  for (let rawToken of tokens) {
    // Leading Hindi number word → digits ("do roti" → "2 roti")
    rawToken = rawToken.replace(
      /^(ek|do|teen|char|chaar|paanch|chhe|saat|aath|nau|das|aadha|adha)\b/i,
      (m) => String(HINDI_NUMBER_WORDS[m.toLowerCase()] ?? m)
    );
    // Strip filler phrases like "i ate", "had", "about", "around", "of"
    let token = rawToken
      .replace(/\b(i ate|i had|ate|had|having|about|around|approx|approximately|some|of|a plate of|a bowl of|a cup of)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!token) continue;

    const qtyUnitMatch = token.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.+)$/);
    const suffixQtyMatch = token.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/);

    let quantity = 1;
    let unit = 'g';
    let foodName = token;

    if (qtyUnitMatch) {
      quantity = parseFloat(qtyUnitMatch[1]);
      const potentialUnit = (qtyUnitMatch[2] || '').toLowerCase();
      const rest = qtyUnitMatch[3].trim();

      const knownUnits = ['g', 'gm', 'gram', 'grams', 'ml', 'oz', 'lb', 'lbs', 'kg', 'scoop', 'scoops', 'cup', 'cups', 'bowl', 'bowls', 'plate', 'plates', 'slice', 'slices', 'piece', 'pieces', 'pc', 'pcs', 'handful', 'katori', 'glass'];
      if (knownUnits.includes(potentialUnit)) {
        unit = potentialUnit.replace(/s$/, '').replace(/gm$/, 'g').replace(/gram$/, 'g').replace(/pc$/, 'piece');
        foodName = rest;
      } else {
        foodName = `${qtyUnitMatch[2] ? qtyUnitMatch[2] + ' ' : ''}${rest}`.trim();
        unit = 'piece'; // Default for discrete foods like "2 eggs", "2 roti", "2 bananas"
      }
    } else if (suffixQtyMatch) {
      foodName = suffixQtyMatch[1].trim();
      quantity = parseFloat(suffixQtyMatch[2]);
      const potentialUnit = (suffixQtyMatch[3] || 'g').toLowerCase();
      unit = potentialUnit.replace(/s$/, '').replace(/gm$/, 'g').replace(/gram$/, 'g');
    } else {
      // Just a food name, e.g. "roti" or "paneer"
      foodName = token;
      quantity = 100;
      unit = 'g';
    }

    const estimated = estimateMacros(foodName, quantity, unit);
    // Use the cleaned food name for display so user doesn't see "oats about"
    parsedItems.push({
      ...estimated,
      name: estimated.name.charAt(0).toUpperCase() + estimated.name.slice(1),
    });
  }

  return parsedItems;
}

/**
 * Detect a junk/gibberish meal parse: nothing recognized and zero calories.
 * Callers must refuse to log and show an error, never silently record a
 * 0-calorie phantom meal.
 */
export function isJunkMealParse(foods: FoodItem[]): boolean {
  if (!foods || foods.length === 0) return true;
  const totals = calculateMealMacros(foods);
  const allUnmatched = foods.every((f) => f.isUnmatched);
  return allUnmatched && totals.calories === 0;
}

/**
 * Flags a single food item whose quantity is implausible for one person in
 * one meal (e.g. "100 rotis" → 12,000 kcal). Returns a human-readable
 * warning, or null when the quantity looks sane. Callers should refuse to
 * log and ask the user to re-enter, rather than silently recording junk.
 */
export function getAbsurdQuantityWarning(food: { name?: string; calories?: number; quantity?: number; unit?: string }): string | null {
  const qty = typeof food.quantity === 'number' && isFinite(food.quantity) ? food.quantity : 0;
  const cal = typeof food.calories === 'number' && isFinite(food.calories) ? food.calories : 0;
  const unit = (food.unit || 'g').toLowerCase().trim();
  const label = (food.name || 'This item').trim() || 'This item';
  if (cal > 6000) {
    return `${label}: ~${Math.round(cal).toLocaleString()} kcal in a single item looks wrong. Please check the quantity.`;
  }
  if ((unit === 'g' || unit === 'ml') && qty > 2500) {
    return `${label}: ${qty.toLocaleString()} ${unit} in a single item looks wrong. Please check the quantity.`;
  }
  if ((unit === 'kg' || unit === 'l') && qty > 2.5) {
    return `${label}: ${qty} ${unit} in a single item looks wrong. Please check the quantity.`;
  }
  if (['piece', 'cup', 'bowl', 'plate', 'slice', 'scoop', 'handful', 'katori', 'glass'].includes(unit) && qty > 25) {
    return `${label}: ${qty} ${unit}s in a single item looks wrong. Please check the quantity.`;
  }
  return null;
}

/**
 * Calculates evidence-based macro targets and caloric goals based on athlete bodyweight,
 * primary goal, gender, and optional height.
 * Uses Mifflin-St Jeor / standard active gym-goer TDEE multipliers with zero Atwater drift.
 */
/**
 * Daily activity OUTSIDE training drives the maintenance multiplier.
 * A hardcoded 1.4 ("active trainee") overestimates a desk worker who lifts
 * 4x/week by ~150-250 kcal/day — for a fat-loss user that silently eats the
 * entire intended deficit. Asked once at onboarding, editable via targets.
 */
export type ActivityLevel = 'sedentary' | 'light' | 'active' | 'very_active';

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  active: 1.55,
  very_active: 1.725,
};

export const DEFAULT_ACTIVITY_LEVEL: ActivityLevel = 'light';

/**
 * Safe minimum daily calorie intake by gender — the floor below which the
 * app never prescribes, suggests, or accepts a target. SINGLE SOURCE OF
 * TRUTH: the initial prescription (below), the coach engine's adjustment
 * suggestions, the manual target editor, and the AI coach prompt copy all
 * derive from this table. (Previously five different floors — 1400 flat,
 * M1500/F1200, "1400" UI copy, 800 in the manual editor, 1200 in the AI
 * prompt — let every guard be bypassed by walking to a different door.)
 */
export const SAFE_MIN_CALORIES: Record<Gender, number> = {
  male: 1500,
  female: 1200,
  other: 1400,
};

export function getSafeMinCalories(gender: Gender = 'male'): number {
  return SAFE_MIN_CALORIES[gender] ?? SAFE_MIN_CALORIES.male;
}

/**
 * Mifflin-St Jeor maintenance estimate.
 * Single source of truth for maintenance — used by both the auto
 * calibration and manual Edit Targets, so the deficit/surplus explanation
 * line never goes stale.
 */
export function calculateMaintenanceCalories(
  bodyweightKg: number,
  gender: Gender = 'male',
  heightCm?: number,
  ageYears?: number,
  activityLevel: ActivityLevel = DEFAULT_ACTIVITY_LEVEL
): number {
  const bw = Math.max(35, Math.min(250, bodyweightKg));
  const defaultHeight = gender === 'male' ? 175 : gender === 'female' ? 162 : 168.5;
  const height = heightCm && heightCm >= 100 && heightCm <= 250 ? heightCm : defaultHeight;
  const age = ageYears && ageYears >= 13 && ageYears <= 90 ? ageYears : 25; // User age (default 25 if unspecified). Onboarding admits 13+ (under-13 guard), so the clamp must start at 13 — a 13-year-old was silently BMR-costed as a 25-year-old.

  // Mifflin-St Jeor BMR:
  // Male: +5, Female: -161.
  // For 'other' (non-binary) athletes where biological sex assumptions do not apply,
  // clinical exercise physiology applies the midpoint constant (-78) between male and female offsets.
  const genderOffset = gender === 'male' ? 5 : gender === 'female' ? -161 : -78;
  const bmr = 10 * bw + 6.25 * height - 5 * age + genderOffset;
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? ACTIVITY_MULTIPLIERS[DEFAULT_ACTIVITY_LEVEL];
  return Math.round(bmr * multiplier);
}

export function calculateRecommendedMacroGoals(
  bodyweightKg: number,
  goal: AthleteGoal = 'build_muscle',
  gender: Gender = 'male',
  heightCm?: number,
  ageYears?: number,
  activityLevel: ActivityLevel = DEFAULT_ACTIVITY_LEVEL
): MacroGoals {
  const bw = Math.max(35, Math.min(250, bodyweightKg));
  const maintenance = calculateMaintenanceCalories(bodyweightKg, gender, heightCm, ageYears, activityLevel);

  let targetCalories = maintenance;
  let proteinPerKg = 1.8;

  switch (goal) {
    case 'build_muscle':
      targetCalories = maintenance + 250; // Lean caloric surplus
      proteinPerKg = 1.8;
      break;
    case 'get_stronger':
      targetCalories = maintenance + 150; // Performance slight surplus
      proteinPerKg = 1.8;
      break;
    case 'lose_fat': {
      proteinPerKg = 2.2; // Elevated protein to preserve lean mass
      const floor = getSafeMinCalories(gender);
      const isMinor = typeof ageYears === 'number' && ageYears > 0 && ageYears < 18;
      // Deficit scales with maintenance (20%, capped at 450 kcal): a flat
      // −450 is a gentle cut for a large athlete but a 27% crash for a
      // small sedentary one, which pinned her exactly at the floor.
      const deficit = Math.min(450, Math.round(maintenance * 0.2));
      if (isMinor) {
        // Never prescribe an energy deficit to a minor — growth comes first.
        targetCalories = maintenance;
      } else if (maintenance - deficit < floor) {
        // Small athletes: the gendered floor would erase (or invert) the
        // deficit. Prescribe the floor — but never ABOVE maintenance,
        // which used to label a surplus as fat loss.
        targetCalories = Math.min(floor, maintenance);
      } else {
        targetCalories = maintenance - deficit;
      }
      break;
    }
    case 'stamina':
      targetCalories = maintenance; // Energy balance
      proteinPerKg = 1.6;
      break;
    case 'general_fitness':
    default:
      targetCalories = maintenance; // Sustainable baseline
      proteinPerKg = 1.6;
      break;
  }

  // Protein calculation
  const proteinG = Math.round(bw * proteinPerKg);
  const proteinCalories = proteinG * 4;

  // Fat calculation (approx 25% of calories, minimum 40g)
  const fatCalories = Math.max(360, Math.round(targetCalories * 0.25));
  const fatG = Math.max(40, Math.round(fatCalories / 9));

  // Carbs calculation (remaining calories, minimum 50g)
  const remainingCalories = Math.max(200, targetCalories - proteinCalories - (fatG * 9));
  const carbsG = Math.round(remainingCalories / 4);

  // Reconcile total calories exactly to 4P + 4C + 9F to guarantee zero Atwater drift
  const exactCalories = proteinG * 4 + carbsG * 4 + fatG * 9;

  return {
    calories: exactCalories,
    proteinG,
    fatG,
    carbsG,
    maintenanceCalories: maintenance,
    calorieDelta: exactCalories - maintenance,
  };
}

/**
 * Re-derive a full MacroGoals at a new calorie target. Used when the coach's
 * calorie suggestion is applied: protein grams are preserved (they are
 * bodyweight-driven, not calorie-driven), remaining calories are split
 * between fat and carbs in the current ratio, and maintenance/delta are
 * carried through — so the saved goals stay Atwater-consistent instead of
 * leaving protein/carbs/fat and the deficit explanation stale at the old
 * target (which broke the app's zero-drift guarantee and made the Meals
 * explanation line print arithmetic that didn't add up).
 */
export function scaleMacroGoalsToCalories(current: MacroGoals, newCalories: number): MacroGoals {
  const target = Math.max(0, Math.round(newCalories));
  const maintenance = current.maintenanceCalories ?? current.calories;
  const proteinG = Math.max(0, Math.round(current.proteinG || 0));
  const proteinCalories = proteinG * 4;

  let fatG: number;
  let carbsG: number;
  if (target <= proteinCalories) {
    // Degenerate target: scale everything proportionally instead.
    const ratio = current.calories > 0 ? target / current.calories : 0;
    fatG = Math.round((current.fatG || 0) * ratio);
    carbsG = Math.round((current.carbsG || 0) * ratio);
    const scaledProtein = Math.round(proteinG * ratio);
    const exact = scaledProtein * 4 + carbsG * 4 + fatG * 9;
    return {
      calories: exact,
      proteinG: scaledProtein,
      fatG,
      carbsG,
      maintenanceCalories: maintenance,
      calorieDelta: exact - maintenance,
    };
  }

  const remaining = target - proteinCalories;
  const fatShare = (current.fatG || 0) * 9;
  const carbShare = (current.carbsG || 0) * 4;
  const shareTotal = fatShare + carbShare;
  const fatCalories = shareTotal > 0 ? Math.round(remaining * (fatShare / shareTotal)) : Math.round(remaining * 0.25);
  fatG = Math.round(fatCalories / 9);
  carbsG = Math.max(0, Math.round((remaining - fatG * 9) / 4));
  const exact = proteinCalories + carbsG * 4 + fatG * 9;
  return {
    calories: exact,
    proteinG,
    fatG,
    carbsG,
    maintenanceCalories: maintenance,
    calorieDelta: exact - maintenance,
  };
}

export interface MealFoodsValidation {
  /** Every item unrecognized — the parse is junk and must be rejected. */
  junk: boolean;
  /** Names of items that couldn't be matched (logged at 0 kcal). */
  unmatchedNames: string[];
  /** First implausible-quantity warning, if any (e.g. "100 rotis"). */
  absurdWarning: string | null;
}

/**
 * Shared guards for EVERY natural-language meal-logging entry point.
 * Round 1 added these checks to the Meals page only; the Quick Action
 * sheet kept logging phantom 0-kcal meals and 11,880-kcal "100 rotis"
 * with a success toast. One validator, all doors.
 */
export function validateMealFoods(foods: FoodItem[]): MealFoodsValidation {
  const list = foods || [];
  return {
    junk: isJunkMealParse(list),
    unmatchedNames: list.filter((f) => f.isUnmatched).map((f) => f.name),
    absurdWarning: list.map(getAbsurdQuantityWarning).find((w) => w !== null) ?? null,
  };
}

/**
 * Scale a food item's calories/macros proportionally when its quantity
 * changes. Regression guard: the manual builder once read the quantity from
 * the already-updated row, making the ratio always 1 and silently dropping
 * the scaling (200 g chicken saved as 100 g values).
 */
export function scaleFoodByQuantity(prevItem: FoodItem, newQty: number): FoodItem {
  const prevQty =
    typeof prevItem.quantity === 'number' && prevItem.quantity > 0 ? prevItem.quantity : null;
  if (!prevQty || !(prevItem.calories > 0) || !(newQty > 0)) return prevItem;
  const ratio = newQty / prevQty;
  return {
    ...prevItem,
    quantity: newQty,
    calories: Math.max(0, Math.round(prevItem.calories * ratio)),
    proteinG: Math.max(0, Math.round((prevItem.proteinG || 0) * ratio * 10) / 10),
    carbsG: Math.max(0, Math.round((prevItem.carbsG || 0) * ratio * 10) / 10),
    fatG: Math.max(0, Math.round((prevItem.fatG || 0) * ratio * 10) / 10),
  };
}
