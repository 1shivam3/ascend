import { describe, it, expect } from 'vitest';
import {
  estimateMacros,
  calculateCaloriesFromMacros,
  getMacroCalorieDrift,
  calculateMealMacros,
  getFoodSuggestions,
  parseNaturalMealOffline,
  calculateRecommendedMacroGoals,
} from '../src/lib/macros';
import { FoodItem } from '../src/lib/types';

describe('Atwater Macro & Calorie Calculations', () => {
  it('calculates calories accurately using standard 4/4/9 Atwater factors', () => {
    // 30g protein (120 kcal) + 40g carbs (160 kcal) + 10g fat (90 kcal) = 370 kcal
    expect(calculateCaloriesFromMacros(30, 40, 10)).toBe(370);

    // Pure protein: 25g * 4 = 100 kcal
    expect(calculateCaloriesFromMacros(25, 0, 0)).toBe(100);

    // Pure fat: 10g * 9 = 90 kcal
    expect(calculateCaloriesFromMacros(0, 0, 10)).toBe(90);
  });

  it('clamps invalid or negative inputs to zero', () => {
    expect(calculateCaloriesFromMacros(-10, -5, -2)).toBe(0);
    expect(calculateCaloriesFromMacros(0, 0, 0)).toBe(0);
  });

  it('calculates macro calorie drift between stated and expected values', () => {
    // Stated: 400 kcal, Atwater: 370 kcal -> drift = +30 kcal
    expect(getMacroCalorieDrift(400, 30, 40, 10)).toBe(30);

    // Perfect match -> drift = 0
    expect(getMacroCalorieDrift(370, 30, 40, 10)).toBe(0);
  });

  it('sums meal macros across food items and reconciles zero-calorie entries', () => {
    const foods: FoodItem[] = [
      { name: 'Chicken Breast', quantity: 150, unit: 'g', calories: 248, proteinG: 46.5, carbsG: 0, fatG: 5.4 },
      { name: 'White Rice', quantity: 200, unit: 'g', calories: 260, proteinG: 5.4, carbsG: 56, fatG: 0.6 },
      // Unrecorded calories should be reconciled via Atwater: 20*4 + 0*4 + 0*9 = 80 kcal
      { name: 'Whey Protein', quantity: 25, unit: 'g', calories: 0, proteinG: 20, carbsG: 0, fatG: 0 },
    ];

    const totals = calculateMealMacros(foods);
    expect(totals.proteinG).toBeCloseTo(71.9, 1);
    expect(totals.carbsG).toBeCloseTo(56, 1);
    expect(totals.fatG).toBeCloseTo(6, 1);
    expect(totals.calories).toBe(248 + 260 + 80);
  });

  it('handles empty foods list returning zero macros', () => {
    expect(calculateMealMacros([])).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
});

describe('Food Database Estimation & Autocomplete', () => {
  it('estimates macros for known foods scaled by quantity', () => {
    // 100g Chicken Breast is 165 kcal, 31g P, 0g C, 3.6g F
    const chicken100 = estimateMacros('Chicken Breast', 100, 'g');
    expect(chicken100.calories).toBe(165);
    expect(chicken100.proteinG).toBe(31);

    // 200g Chicken Breast should scale by 2x
    const chicken200 = estimateMacros('Chicken Breast', 200, 'g');
    expect(chicken200.calories).toBe(330);
    expect(chicken200.proteinG).toBe(62);
  });

  it('supports volume and piece units (e.g. scoops, eggs, roti)', () => {
    // 1 scoop whey protein (~30g)
    const whey = estimateMacros('whey protein', 1, 'scoop');
    expect(whey.proteinG).toBeGreaterThan(20);

    // 2 whole eggs
    const eggs = estimateMacros('eggs', 2, 'piece');
    expect(eggs.proteinG).toBeGreaterThan(10);
    expect(eggs.calories).toBeGreaterThan(120);
  });

  it('flags unmatched food items gracefully', () => {
    const unknown = estimateMacros('Super Exotic Galactic Berries', 100, 'g');
    expect(unknown.isUnmatched).toBe(true);
    expect(unknown.calories).toBe(0);
    expect(unknown.proteinG).toBe(0);
  });

  it('provides autocomplete food suggestions matching query', () => {
    const suggestions = getFoodSuggestions('chi');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.toLowerCase().includes('chicken'))).toBe(true);

    expect(getFoodSuggestions('')).toEqual([]);
  });
});

describe('Natural Language Meal Parsing (Offline Heuristic Parser)', () => {
  it('parses single item with quantity and unit suffix ("oats about 100gm")', () => {
    const parsed = parseNaturalMealOffline('oats about 100gm');
    expect(parsed.length).toBe(1);
    expect(parsed[0].name.toLowerCase()).toContain('oat');
    expect(parsed[0].quantity).toBe(100);
    expect(parsed[0].unit).toBe('g');
    expect(parsed[0].calories).toBeGreaterThan(300);
    expect(parsed[0].proteinG).toBeGreaterThan(10);
  });

  it('parses prefix quantity items ("around 200g paneer")', () => {
    const parsed = parseNaturalMealOffline('around 200g paneer');
    expect(parsed.length).toBe(1);
    expect(parsed[0].name.toLowerCase()).toContain('paneer');
    expect(parsed[0].quantity).toBe(200);
    expect(parsed[0].unit).toBe('g');
    expect(parsed[0].proteinG).toBeGreaterThan(30);
  });

  it('parses multi-item combos separated by commas or "and"', () => {
    const parsed = parseNaturalMealOffline('2 roti, 1 bowl dal and 100g paneer');
    expect(parsed.length).toBe(3);

    const roti = parsed.find((p) => p.name.toLowerCase().includes('roti'));
    const dal = parsed.find((p) => p.name.toLowerCase().includes('dal'));
    const paneer = parsed.find((p) => p.name.toLowerCase().includes('paneer'));

    expect(roti).toBeDefined();
    expect(roti?.quantity).toBe(2);

    expect(dal).toBeDefined();
    expect(dal?.quantity).toBe(1);

    expect(paneer).toBeDefined();
    expect(paneer?.quantity).toBe(100);
  });

  it('parses scoop and ml liquid quantities ("1 scoop whey, 400ml milk")', () => {
    const parsed = parseNaturalMealOffline('1 scoop whey, 400ml milk');
    expect(parsed.length).toBe(2);

    const whey = parsed.find((p) => p.name.toLowerCase().includes('whey'));
    expect(whey?.unit).toBe('scoop');
    expect(whey?.quantity).toBe(1);

    const milk = parsed.find((p) => p.name.toLowerCase().includes('milk'));
    expect(milk?.unit).toBe('ml');
    expect(milk?.quantity).toBe(400);
  });

  it('strips colloquial conversational filler phrases cleanly', () => {
    const parsed = parseNaturalMealOffline('I ate a bowl of white rice');
    expect(parsed.length).toBe(1);
    expect(parsed[0].name.toLowerCase()).toContain('rice');
  });

  it('returns empty array for empty or whitespace-only inputs', () => {
    expect(parseNaturalMealOffline('')).toEqual([]);
    expect(parseNaturalMealOffline('   ')).toEqual([]);
  });
});

describe('Athlete Macro Goal Calculations (calculateRecommendedMacroGoals)', () => {
  it('calculates balanced calorie and macro targets for muscle building', () => {
    const goals = calculateRecommendedMacroGoals(80, 'build_muscle', 'male', 178, 25);
    expect(goals.calories).toBeGreaterThan(2000);
    // Muscle building targets 1.8-2.2g protein per kg
    expect(goals.proteinG).toBeGreaterThanOrEqual(140);
    expect(goals.carbsG).toBeGreaterThan(150);
    expect(goals.fatG).toBeGreaterThan(40);
  });

  it('calculates deficit calories and high protein for fat loss', () => {
    const fatLoss = calculateRecommendedMacroGoals(80, 'lose_fat', 'male', 178, 25);
    const muscleGain = calculateRecommendedMacroGoals(80, 'build_muscle', 'male', 178, 25);
    // Fat loss calories should be lower than muscle building calories
    expect(fatLoss.calories).toBeLessThan(muscleGain.calories);
    // Protein remains high in a deficit to preserve lean tissue (2.0g/kg+)
    expect(fatLoss.proteinG).toBeGreaterThanOrEqual(160);
  });

  it('handles female demographics with adjusted BMR calculation', () => {
    const maleGoals = calculateRecommendedMacroGoals(65, 'build_muscle', 'male', 165, 25);
    const femaleGoals = calculateRecommendedMacroGoals(65, 'build_muscle', 'female', 165, 25);
    expect(femaleGoals.calories).toBeLessThan(maleGoals.calories);
  });
});
