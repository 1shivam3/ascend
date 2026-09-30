import { estimateMacros, parseNaturalMealOffline } from '../src/lib/macros';
import { useStore } from '../src/lib/store';
import { generateExercisesFromSelection } from '../src/components/SuggestedWorkoutModal';

async function runTests() {
  console.log("=== Testing Natural Language Food Parsing ===");

  // 1. "oats about 100gm"
  const oatsResult = parseNaturalMealOffline("oats about 100gm");
  console.log("oats about 100gm parsed:", oatsResult);
  if (oatsResult.length === 0) throw new Error("Failed to parse 'oats about 100gm'");
  const oats = oatsResult[0];
  if (oats.calories < 300 || oats.proteinG < 10) {
    throw new Error(`Oats macros incorrect: got ${oats.calories} cal, ${oats.proteinG}g protein`);
  }
  console.log("✓ 'oats about 100gm' parsed accurately with real macros!");

  // 2. "around 200g paneer"
  const paneerResult = parseNaturalMealOffline("around 200g paneer");
  console.log("around 200g paneer parsed:", paneerResult);
  if (paneerResult.length === 0) throw new Error("Failed to parse 'around 200g paneer'");
  const paneer = paneerResult[0];
  if (paneer.proteinG < 30) {
    throw new Error(`Paneer macros incorrect: got ${paneer.proteinG}g protein`);
  }
  console.log("✓ 'around 200g paneer' parsed accurately!");

  // 3. Multi-item: "2 roti, 1 bowl dal, 100g paneer"
  const comboResult = parseNaturalMealOffline("2 roti, 1 bowl dal, 100g paneer");
  console.log("Combo meal parsed:", comboResult);
  if (comboResult.length < 3) throw new Error(`Expected at least 3 items, got ${comboResult.length}`);
  console.log("✓ Combo meal parsed accurately!");

  console.log("\n=== Testing Gym Log Toggle & Store ===");
  const store = useStore.getState();
  const today = new Date().toISOString().split('T')[0];
  const initial = store.gymLogs[today] || false;
  const toggled = store.toggleGymToday(today);
  if (toggled === initial) throw new Error("Gym log toggle did not invert status");
  console.log(`✓ Gym log toggle verified: ${initial} -> ${toggled}`);
  // revert
  store.toggleGymToday(today);

  console.log("\n=== Testing Multi-Bodypart Split Generator ===");
  // Chest + Arms
  const exercises = generateExercisesFromSelection(['chest', 'arms'], 'medium', 'kg');
  console.log(`Generated Chest + Arms plan with ${exercises.length} exercises:`);
  exercises.forEach((ex) => console.log(` - ${ex.name} (${ex.targetSets} sets × ${ex.targetReps} reps)`));
  
  const hasChest = exercises.some((e) => /bench|chest|fly/i.test(e.name));
  const hasArms = exercises.some((e) => /curl|tricep|dip|extension/i.test(e.name));
  if (!hasChest || !hasArms) {
    throw new Error("Plan missing either chest or arms exercises");
  }
  console.log("✓ Multi-bodypart generator successfully combined both target groups!");

  console.log("\nALL NEW FEATURE TESTS PASSED SUCCESSFULLY! 🚀");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
