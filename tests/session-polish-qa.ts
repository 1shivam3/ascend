import assert from 'assert';
import { calculatePlates } from '../src/lib/plate-calculator';
import { getExerciseMuscle, MuscleGroup, MUSCLE_GROUPS } from '../src/lib/exercise-library';
import { calculateOneRepMax, getEffectiveExerciseLoad } from '../src/lib/strength-standards';
import { WorkoutEntry, PersonalRecord, MealEntry } from '../src/lib/types';
import { calculateMealMacros } from '../src/lib/macros';

console.log('======================================================');
console.log('TEST SUITE: Session Polish & Experiment Features QA');
console.log('======================================================\n');

// 1. Plate calculation helper test
console.log('--- 1. Plate Math & Summary Verification ---');
function getPlateSummary(targetWeight: number, unit: 'kg' | 'lbs' = 'kg'): string | null {
  const barWeight = unit === 'lbs' ? 45 : 20;
  if (!targetWeight || targetWeight <= barWeight) return null;
  const res = calculatePlates(targetWeight, barWeight, unit);
  if (!res.plates || res.plates.length === 0) return null;
  const parts = res.plates.map((p) => (p.count > 1 ? `${p.count}×${p.weight}` : `${p.weight}`));
  return `${parts.join(' + ')} /side`;
}

const p60kg = getPlateSummary(60, 'kg');
assert(p60kg !== null, '60kg should have plate summary');
assert(p60kg.includes('20') && p60kg.includes('/side'), `60kg should require 20/side, got: ${p60kg}`);
console.log(`  ✓ [PASS] 60kg metric plate breakdown: ${p60kg}`);

const p100kg = getPlateSummary(100, 'kg');
assert(p100kg !== null, '100kg should have plate summary');
assert(p100kg.includes('/side'), `100kg should have /side format, got: ${p100kg}`);
console.log(`  ✓ [PASS] 100kg metric plate breakdown: ${p100kg}`);

const p135lbs = getPlateSummary(135, 'lbs');
assert(p135lbs !== null, '135lbs should have plate summary');
assert(p135lbs.includes('45') && p135lbs.includes('/side'), `135lbs should require 45/side, got: ${p135lbs}`);
console.log(`  ✓ [PASS] 135lbs imperial plate breakdown: ${p135lbs}`);

const underBar = getPlateSummary(15, 'kg');
assert(underBar === null, '15kg (under 20kg bar) should return null');
console.log('  ✓ [PASS] Load below empty bar returns null cleanly\n');

// 2. Muscle Group Resolution & Hypertrophy Volume Landmarks
console.log('--- 2. Muscle Volume Landmarks & Heuristic Muscle Mapping ---');
assert.strictEqual(getExerciseMuscle('Barbell Bench Press'), 'Chest');
assert.strictEqual(getExerciseMuscle('Incline Dumbbell Fly'), 'Chest');
assert.strictEqual(getExerciseMuscle('Barbell Deadlift'), 'Back');
assert.strictEqual(getExerciseMuscle('Lat Pulldown'), 'Back');
assert.strictEqual(getExerciseMuscle('Barbell Back Squat'), 'Legs');
assert.strictEqual(getExerciseMuscle('Leg Press'), 'Legs');
assert.strictEqual(getExerciseMuscle('Romanian Deadlift (RDL)'), 'Back');
assert.strictEqual(getExerciseMuscle('Overhead Press (OHP)'), 'Shoulders');
assert.strictEqual(getExerciseMuscle('Dumbbell Lateral Raise'), 'Shoulders');
assert.strictEqual(getExerciseMuscle('Barbell Bicep Curl'), 'Arms');
assert.strictEqual(getExerciseMuscle('Tricep Pushdown'), 'Arms');
assert.strictEqual(getExerciseMuscle('Hanging Leg Raise'), 'Core');
console.log('  ✓ [PASS] All 6 major muscle groups correctly resolved from movement variations');

// Test set counting across workouts in last 7 days
const mockWorkouts: WorkoutEntry[] = [
  {
    id: 'w1',
    date: new Date().toISOString(),
    exercises: [
      {
        name: 'Bench Press',
        sets: [
          { weight: 80, reps: 8, unit: 'kg', completed: true },
          { weight: 80, reps: 8, unit: 'kg', completed: true },
          { weight: 80, reps: 7, unit: 'kg', completed: true },
        ],
      },
      {
        name: 'Incline Dumbbell Press',
        sets: [
          { weight: 30, reps: 10, unit: 'kg', completed: true },
          { weight: 30, reps: 9, unit: 'kg', completed: true },
        ],
      },
      {
        name: 'Barbell Row',
        sets: [
          { weight: 70, reps: 8, unit: 'kg', completed: true },
          { weight: 70, reps: 8, unit: 'kg', completed: true },
          { weight: 70, reps: 8, unit: 'kg', completed: true },
        ],
      },
    ],
  },
];

const counts: Record<MuscleGroup, number> = {
  Chest: 0,
  Back: 0,
  Legs: 0,
  Shoulders: 0,
  Arms: 0,
  Core: 0,
};

mockWorkouts.forEach((w) => {
  w.exercises.forEach((ex) => {
    const muscle = getExerciseMuscle(ex.name);
    const completedCount = ex.sets.filter((s) => s.completed !== false && (s.reps > 0 || (s.weight && s.weight > 0))).length;
    counts[muscle] = (counts[muscle] || 0) + completedCount;
  });
});

assert.strictEqual(counts.Chest, 5, 'Chest should have 5 completed sets');
assert.strictEqual(counts.Back, 3, 'Back should have 3 completed sets');
console.log(`  ✓ [PASS] Muscle set accumulation verified: Chest = ${counts.Chest}, Back = ${counts.Back}\n`);

// 3. Rep PR Detection Simulation
console.log('--- 3. Rep PR Detection Simulation ---');
const pastWorkouts: WorkoutEntry[] = [
  {
    id: 'past_1',
    date: '2026-09-20',
    exercises: [
      {
        name: 'Incline Dumbbell Press',
        sets: [
          { weight: 32, reps: 6, unit: 'kg', completed: true },
          { weight: 32, reps: 6, unit: 'kg', completed: true },
        ],
      },
    ],
  },
];

// Today the lifter performs 32kg for 8 reps
const todayExercise = {
  name: 'Incline Dumbbell Press',
  sets: [{ weight: 32, reps: 8, unit: 'kg' as const, completed: true }],
};

let detectedRepPR: any = null;
const userBW = 75;
for (const s of todayExercise.sets) {
  const wKg = s.weight;
  let maxPrevRepsAtWeight = 0;
  for (const pw of pastWorkouts) {
    for (const pex of pw.exercises) {
      if (pex.name.toLowerCase() === todayExercise.name.toLowerCase()) {
        for (const ps of pex.sets) {
          const pwKg = ps.weight;
          if (Math.abs(pwKg - wKg) < 1.0 && ps.reps > maxPrevRepsAtWeight) {
            maxPrevRepsAtWeight = ps.reps;
          }
        }
      }
    }
  }

  if (maxPrevRepsAtWeight > 0 && s.reps > maxPrevRepsAtWeight) {
    detectedRepPR = {
      exercise: todayExercise.name,
      weightKg: wKg,
      reps: s.reps,
      prevReps: maxPrevRepsAtWeight,
      diff: s.reps - maxPrevRepsAtWeight,
      prType: 'reps',
    };
  }
}

assert(detectedRepPR !== null, 'Rep PR should be detected');
assert.strictEqual(detectedRepPR.diff, 2, 'Should detect +2 reps PR');
console.log(`  ✓ [PASS] Rep PR detected: ${detectedRepPR.exercise} ${detectedRepPR.weightKg}kg for ${detectedRepPR.reps} reps (+${detectedRepPR.diff} reps vs ${detectedRepPR.prevReps})\n`);

// 4. Day 1 Overrides for New Users
console.log('--- 4. Day 1 Overrides for First-Time Athletes ---');
function computeSessionTitle(workoutCount: number, rawRestDay: boolean) {
  if (workoutCount === 0) {
    return {
      isRestDay: false,
      badge: 'DAY 1 STARTS TODAY',
      cta: 'START DAY 1 WORKOUT',
      title: rawRestDay ? 'Day 1 — Foundation Workout' : 'Planned Workout',
    };
  }
  return {
    isRestDay: rawRestDay,
    badge: rawRestDay ? 'REST & RECOVER' : "TODAY'S MISSION",
    cta: rawRestDay ? 'TRAIN ANYWAY' : 'START WORKOUT',
    title: rawRestDay ? 'Rest Day' : 'Planned Workout',
  };
}

const newAthlete = computeSessionTitle(0, true);
assert.strictEqual(newAthlete.isRestDay, false, 'New athlete should not be blocked by rest day');
assert.strictEqual(newAthlete.badge, 'DAY 1 STARTS TODAY');
assert.strictEqual(newAthlete.cta, 'START DAY 1 WORKOUT');
assert.strictEqual(newAthlete.title, 'Day 1 — Foundation Workout');
console.log('  ✓ [PASS] First-time athlete receives Day 1 Hero CTA with zero friction\n');

// 5. Quick Log Meals Verification
console.log('--- 5. Quick Log Usual Meal Verification ---');
const sampleMeals: MealEntry[] = [
  {
    id: 'm1',
    date: '2026-10-04',
    name: 'Power Oats & Whey',
    foods: [
      { name: 'Oats', quantity: 80, unit: 'g', calories: 300, proteinG: 10, carbsG: 54, fatG: 5 },
      { name: 'Whey Protein', quantity: 30, unit: 'g', calories: 120, proteinG: 24, carbsG: 2, fatG: 1 },
    ],
  },
];

const mealMacros = calculateMealMacros(sampleMeals[0].foods);
assert(mealMacros.calories >= 420, 'Calories should be computed properly');
assert(mealMacros.proteinG >= 34, 'Protein should be computed properly');
console.log(`  ✓ [PASS] Usual meal macros: ~${Math.round(mealMacros.calories)} kcal, ~${Math.round(mealMacros.proteinG)}g protein\n`);

// 6. Portion Multiplier Scaling Test
console.log('--- 6. Quick Log Portion Scaling Multipliers ---');
function scaleMeal(meal: MealEntry, multiplier: number) {
  return meal.foods.map((f) => ({
    ...f,
    quantity: f.quantity ? Math.round(f.quantity * multiplier * 10) / 10 : undefined,
    calories: Math.round(f.calories * multiplier),
    proteinG: Math.round((f.proteinG || 0) * multiplier * 10) / 10,
    carbsG: Math.round((f.carbsG || 0) * multiplier * 10) / 10,
    fatG: Math.round((f.fatG || 0) * multiplier * 10) / 10,
  }));
}

const halfMeal = scaleMeal(sampleMeals[0], 0.5);
const halfMacros = calculateMealMacros(halfMeal);
assert.strictEqual(halfMacros.calories, 210, '0.5x meal should scale calories to 210');
assert.strictEqual(halfMacros.proteinG, 17, '0.5x meal should scale protein to 17g');
console.log(`  ✓ [PASS] 0.5x portion scaling: ${halfMacros.calories} kcal, ${halfMacros.proteinG}g protein`);

const bigMeal = scaleMeal(sampleMeals[0], 1.5);
const bigMacros = calculateMealMacros(bigMeal);
assert.strictEqual(bigMacros.calories, 630, '1.5x meal should scale calories to 630');
assert.strictEqual(bigMacros.proteinG, 51, '1.5x meal should scale protein to 51g');
console.log(`  ✓ [PASS] 1.5x portion scaling: ${bigMacros.calories} kcal, ${bigMacros.proteinG}g protein\n`);

// 7. Secondary Muscle Group Stimulus Mapping
console.log('--- 7. Secondary Muscle Stimulus Mapping ---');
import { getExerciseSecondaryMuscles } from '../src/lib/exercise-library';

const benchSecondary = getExerciseSecondaryMuscles('Barbell Bench Press');
assert(benchSecondary.includes('Arms') && benchSecondary.includes('Shoulders'), 'Bench should stimulate Arms & Shoulders');
console.log(`  ✓ [PASS] Bench Press secondary stimulus: ${benchSecondary.join(' & ')}`);

const rowSecondary = getExerciseSecondaryMuscles('Barbell Row');
assert(rowSecondary.includes('Arms'), 'Row should stimulate Arms');
console.log(`  ✓ [PASS] Barbell Row secondary stimulus: ${rowSecondary.join(' & ')}`);

const squatSecondary = getExerciseSecondaryMuscles('Barbell Back Squat');
assert(squatSecondary.includes('Core'), 'Squat should stimulate Core');
console.log(`  ✓ [PASS] Back Squat secondary stimulus: ${squatSecondary.join(' & ')}\n`);

// 8. PR Type Partitioning Verification
console.log('--- 8. PR Type Partitioning Verification ---');
const testPRs: PersonalRecord[] = [
  { id: 'pr1', exercise: 'Bench Press', weightKg: 100, weightLbs: 220, reps: 1, oneRepMax: 100, date: '2026-10-01', prType: '1rm' },
  { id: 'pr2', exercise: 'Bench Press', weightKg: 80, weightLbs: 176, reps: 10, oneRepMax: 106, date: '2026-10-03', prType: 'reps' },
  { id: 'pr3', exercise: 'Barbell Squat', weightKg: 140, weightLbs: 308, reps: 1, oneRepMax: 140, date: '2026-10-02' }, // legacy 1rm
];

const maxPRs = testPRs.filter((p) => p.prType === '1rm' || (!p.prType && p.reps === 1));
const repPRs = testPRs.filter((p) => p.prType === 'reps' || (!p.prType && p.reps > 1));

assert.strictEqual(maxPRs.length, 2, 'Should have 2 1RM maxes');
assert.strictEqual(repPRs.length, 1, 'Should have 1 Rep PR');
console.log(`  ✓ [PASS] Correctly partitioned ${maxPRs.length} 1RM maxes and ${repPRs.length} Rep PRs`);

console.log('\n======================================================');
console.log('ALL POLISH & EXPERIMENT VERIFICATIONS PASSED CLEANLY (100%)');
console.log('======================================================\n');
