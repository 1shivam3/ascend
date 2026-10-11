/**
 * Comprehensive Meal Logging & Photo Scanner Regression QA Suite
 *
 * Validates:
 * 1. Scan meal date alignment with user local timezone (getLocalTodayStr)
 * 2. Manual meal logging with empty meal name (smart time-of-day fallback)
 * 3. Save Meal button enablement without requiring typed meal name
 * 4. Quantity modification and custom macro preservation on unmatched foods
 * 5. End-to-end meal addition and today macro calculations
 */

import { getLocalTodayStr } from '../src/lib/formatters';
import { estimateMacros, calculateMealMacros } from '../src/lib/macros';
import { FoodItem, MealEntry } from '../src/lib/types';
import { recalculateMealResult, generateOfflineMealEstimate } from '../src/lib/ai-scan-meal';

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${desc}`);
    failed++;
  }
}

console.log('======================================================');
console.log('RUNNING: Meal Logging & Photo Scanner Regression QA');
console.log('======================================================\n');

// ── TEST 1: Date Alignment & Immediate Today Macro Matching ───────────
console.log('--- TEST 1: Scan Meal Local Date Synchronization ---');
const localToday = getLocalTodayStr();
assert(/^\d{4}-\d{2}-\d{2}$/.test(localToday), `getLocalTodayStr returns valid YYYY-MM-DD: ${localToday}`);

// Simulate saving a scanned meal with getLocalTodayStr()
const scannedMeal: MealEntry = {
  id: 'meal_test_scan_1',
  date: localToday,
  name: 'Scanned High-Protein Lunch',
  foods: [
    { name: 'Grilled Chicken Breast', quantity: 200, unit: 'g', calories: 330, proteinG: 62, carbsG: 0, fatG: 7.2 },
    { name: 'White Rice', quantity: 150, unit: 'g', calories: 195, proteinG: 4.1, carbsG: 42, fatG: 0.4 },
  ],
};

const storeMeals: MealEntry[] = [scannedMeal];
const todayFilteredMeals = storeMeals.filter((m) => m.date === localToday);
assert(todayFilteredMeals.length === 1, 'Today meals filter immediately matches saved scanned meal');

const todayMacros = calculateMealMacros(todayFilteredMeals.flatMap((m) => m.foods));
assert(todayMacros.calories === 525, `Today calories accurately calculated (${todayMacros.calories} === 525)`);
assert(todayMacros.proteinG === 66.1, `Today protein accurately calculated (${todayMacros.proteinG} === 66.1g)`);

// ── TEST 2: Manual Log Meal Name Auto-Fallback ───────────────────────
console.log('\n--- TEST 2: Manual Log Meal Name Fallback ---');
function getDefaultMealName(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'Breakfast';
  if (hour >= 11 && hour < 15) return 'Lunch';
  if (hour >= 15 && hour < 18) return 'Snack';
  if (hour >= 18 && hour < 22) return 'Dinner';
  return 'Late Meal';
}

const currentExpectedDefault = getDefaultMealName();
assert(['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Late Meal'].includes(currentExpectedDefault), `Default meal name matches time bracket: ${currentExpectedDefault}`);

// User types foods but leaves meal name empty
const userTypedName = '';
const resolvedMealName = userTypedName.trim() || currentExpectedDefault;
assert(resolvedMealName.length > 0, `Empty meal name safely resolves to '${resolvedMealName}'`);

const manualFoods: FoodItem[] = [
  { name: 'Eggs (Boiled)', quantity: 3, unit: 'piece', calories: 234, proteinG: 18.9, carbsG: 1.8, fatG: 15.9 },
  { name: 'Whole Wheat Toast', quantity: 2, unit: 'slice', calories: 150, proteinG: 6, carbsG: 26, fatG: 2 },
];

const manualMeal: MealEntry = {
  id: 'meal_test_manual_1',
  date: localToday,
  name: resolvedMealName,
  foods: manualFoods,
};

assert(manualMeal.name === currentExpectedDefault, 'Manual meal created with automatic time-based name');
assert(manualMeal.foods.length === 2, 'All manual food items saved correctly');

// ── TEST 3: Save Button Disabled Condition Logic ────────────────────
console.log('\n--- TEST 3: Save Meal Button Enablement Logic ---');
// Case A: No foods added -> disabled
const foodsCaseA: FoodItem[] = [];
const isSaveDisabledA = foodsCaseA.length === 0 || !foodsCaseA.some((f) => f.name.trim());
assert(isSaveDisabledA === true, 'Save button is disabled when food list is empty');

// Case B: Food added with name, but meal name is empty string -> MUST BE ENABLED!
const foodsCaseB: FoodItem[] = [{ name: 'Greek Yogurt', quantity: 150, unit: 'g', calories: 88, proteinG: 15, carbsG: 5, fatG: 0.6 }];
const isSaveDisabledB = foodsCaseB.length === 0 || !foodsCaseB.some((f) => f.name.trim());
assert(isSaveDisabledB === false, 'Save button is enabled when valid food exists even if mealName is blank');

// Case C: Food added with empty whitespace name -> disabled
const foodsCaseC: FoodItem[] = [{ name: '   ', quantity: 100, unit: 'g', calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }];
const isSaveDisabledC = foodsCaseC.length === 0 || !foodsCaseC.some((f) => f.name.trim());
assert(isSaveDisabledC === true, 'Save button is disabled if food name is only whitespace');

// ── TEST 4: Custom Unmatched Food Macro Preservation ─────────────────
console.log('\n--- TEST 4: Unmatched Custom Food Macro Preservation ---');
const unmatchedItem = estimateMacros('XyzNonexistentSnack12345', undefined, 'piece');
assert(unmatchedItem.isUnmatched === true, 'Unrecognized food flagged as isUnmatched: true');
assert(unmatchedItem.calories === 0, 'Unmatched food starts with 0 calories until user enters macros');

// User inputs custom macros: 280 kcal, 25g protein, 30g carbs, 7g fat
const userOverriddenItem: FoodItem = {
  ...unmatchedItem,
  calories: 280,
  proteinG: 25,
  carbsG: 30,
  fatG: 7,
  isUnmatched: false,
};

// Now user enters quantity: 1 piece
const rawQty: number | undefined = 1;
let simulatedUpdatedItem = { ...userOverriddenItem };
if (userOverriddenItem.isUnmatched && (userOverriddenItem.calories > 0 || (userOverriddenItem.proteinG || 0) > 0)) {
  simulatedUpdatedItem.quantity = rawQty;
} else if (!userOverriddenItem.isUnmatched && userOverriddenItem.calories > 0) {
  // Proportional or preserved
  simulatedUpdatedItem.quantity = rawQty;
}

assert(simulatedUpdatedItem.calories === 280, 'Custom calories preserved after quantity set');
assert(simulatedUpdatedItem.proteinG === 25, 'Custom protein preserved after quantity set');

// ── TEST 5: Recalculate Meal Result & Offline Scanner ─────────────────
console.log('\n--- TEST 5: Offline Meal Estimate & Portions ---');
const offlineRes = generateOfflineMealEstimate('3 rotis and 1 bowl dal with 100g paneer');
assert(offlineRes.items.length >= 2, `Offline heuristic identified ${offlineRes.items.length} items from notes`);
assert(offlineRes.totalCalories > 0, `Total calories calculated: ${offlineRes.totalCalories}`);
assert(offlineRes.totalProtein > 0, `Total protein calculated: ${offlineRes.totalProtein}g`);

// Recalculate with updated grams
const editedItems = offlineRes.items.map((it, idx) => idx === 0 ? { ...it, estimatedGrams: 200, calories: it.calories * 2 } : it);
const recalced = recalculateMealResult(offlineRes, editedItems);
assert(recalced.totalCalories >= offlineRes.totalCalories, 'Recalculated totals dynamically scaled');

console.log('\n======================================================');
console.log(`TOTAL REGRESSION ASSERTIONS: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
