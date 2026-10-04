/**
 * ASCEND Experiment Features Comprehensive QA Test Suite
 * Tests:
 * 1. Shareable Program Links (Encoding, Decoding, QR Payload, Versioning)
 * 2. Hinglish Hands-Free Voice Logger (Lexical parsing, number words, RPE, exercise matching)
 * 3. ASCEND Lifter Twin & Decision Ledger (Prediction error, confidence tiers, stimulus-preserving substitutions)
 * 4. Goal-Personalized Training & Nutrition Engine
 */

import { encodeProgramForSharing, decodeProgramFromHash } from '../src/lib/program-sharing';
import { parseHinglishWorkoutVoice } from '../src/lib/voice-logger';
import {
  generateTrainingDecision,
  getConfidenceTier,
  adaptWorkoutForConstraints,
  STIMULUS_PRESERVING_SWAPS,
  getStimulusPreservingSwaps,
} from '../src/lib/lifter-twin';
import {
  isBodyweightExercise,
  isDumbbellExercise,
  isCableExercise,
  isMachineExercise,
} from '../src/lib/strength-standards';
import { ATHLETE_GOAL_CONFIGS, AthleteGoal, PlannedWorkout, WorkoutEntry } from '../src/lib/types';

let total = 0;
let passed = 0;
let failed = 0;

function check(cond: boolean, name: string, detail?: string) {
  total++;
  if (cond) {
    passed++;
    console.log(`  ✓ [PASS] ${name}`);
  } else {
    failed++;
    console.error(`  ✗ [FAIL] ${name} ${detail ? `-> ${detail}` : ''}`);
  }
}

console.log('\n======================================================');
console.log('TEST SUITE 1: Shareable Program Links & QR Encoding');
console.log('======================================================');

const samplePlan: PlannedWorkout = {
  id: 'test_plan_1',
  name: 'Upper Hypertrophy',
  createdAt: '2026-10-02',
  exercises: [
    { name: 'Bench Press', targetSets: 4, targetReps: 8, targetWeight: 80, targetUnit: 'kg' },
    { name: 'Barbell Row', targetSets: 4, targetReps: 8, targetWeight: 70, targetUnit: 'kg' },
    { name: 'Incline Bench', targetSets: 3, targetReps: 10, targetWeight: 60, targetUnit: 'kg' },
  ],
};

const hash = encodeProgramForSharing(samplePlan, 'Coach Sharma');
check(Boolean(hash) && hash.startsWith('v1_'), 'Program encoded to hash with v1 prefix', hash);

const decoded = decodeProgramFromHash(hash);
check(decoded !== null, 'Hash successfully decoded');
check(decoded?.name === 'Upper Hypertrophy', 'Decoded plan name matches exactly');
check(decoded?.coachName === 'Coach Sharma', 'Decoded coach name matches exactly');
check(decoded?.exercises.length === 3, 'Decoded exercises length is 3');
check(decoded?.exercises[0].name === 'Bench Press', 'Decoded first exercise is Bench Press');
check(decoded?.exercises[0].targetWeight === 80, 'Decoded first exercise weight is 80kg');

console.log('\n======================================================');
console.log('TEST SUITE 2: Hinglish Hands-Free Voice Logger');
console.log('======================================================');

// Case 1: "bench 80 pe 5, rpe 8"
const res1 = parseHinglishWorkoutVoice('bench 80 pe 5, rpe 8');
check(res1 !== null, 'Voice result 1 is not null');
check(res1?.weight === 80, 'Weight parsed as 80', `Got ${res1?.weight}`);
check(res1?.reps === 5, 'Reps parsed as 5', `Got ${res1?.reps}`);
check(res1?.rpe === 8, 'RPE parsed as 8', `Got ${res1?.rpe}`);
check(res1?.exerciseName === 'Bench Press', 'Exercise identified as Bench Press', `Got ${res1?.exerciseName}`);

// Case 2: Hindi numbers "squat 100 char reps rpe saat" (char = 4, saat = 7)
const res2 = parseHinglishWorkoutVoice('squat 100 char reps rpe saat');
check(res2 !== null, 'Voice result 2 is not null');
check(res2?.weight === 100, 'Weight parsed as 100', `Got ${res2?.weight}`);
check(res2?.reps === 4, 'Reps parsed as 4 (char)', `Got ${res2?.reps}`);
check(res2?.rpe === 7, 'RPE parsed as 7 (saat)', `Got ${res2?.rpe}`);
check(res2?.exerciseName === 'Squat', 'Exercise identified as Squat', `Got ${res2?.exerciseName}`);

// Case 3: "deadlift 120 kilo paanch reps" (120kg, 5 reps)
const res3 = parseHinglishWorkoutVoice('deadlift 120 kilo paanch reps');
check(res3 !== null, 'Voice result 3 is not null');
check(res3?.weight === 120, 'Weight parsed as 120', `Got ${res3?.weight}`);
check(res3?.reps === 5, 'Reps parsed as 5 (paanch)', `Got ${res3?.reps}`);
check(res3?.exerciseName === 'Deadlift', 'Exercise identified as Deadlift', `Got ${res3?.exerciseName}`);

// Case 4: Pure numbers "70 pe aath" (70 for 8)
const res4 = parseHinglishWorkoutVoice('70 pe aath', 'Overhead Press');
check(res4 !== null, 'Voice result 4 is not null');
check(res4?.weight === 70, 'Weight parsed as 70', `Got ${res4?.weight}`);
check(res4?.reps === 8, 'Reps parsed as 8 (aath)', `Got ${res4?.reps}`);
check(res4?.exerciseName === 'Overhead Press', 'Context fallback exercise used', `Got ${res4?.exerciseName}`);

console.log('\n======================================================');
console.log('TEST SUITE 3: ASCEND Lifter Twin & Scientific Decision Engine');
console.log('======================================================');

// Confidence tiering
check(getConfidenceTier(3) === 'calibrating', 'Tier for 3 sessions is calibrating');
check(getConfidenceTier(6) === 'early_signal', 'Tier for 6 sessions is early_signal');
check(getConfidenceTier(12) === 'established', 'Tier for 12 sessions is established');
check(getConfidenceTier(22) === 'high_confidence', 'Tier for 22 sessions is high_confidence');

// Stimulus-preserving swaps
check(Boolean(STIMULUS_PRESERVING_SWAPS['Bench Press']), 'Bench Press has stimulus-preserving swaps');
check(Boolean(STIMULUS_PRESERVING_SWAPS['Squat']), 'Squat has stimulus-preserving swaps');
check(Boolean(STIMULUS_PRESERVING_SWAPS['Deadlift']), 'Deadlift has stimulus-preserving swaps');

// Real-world time constraint adaptation
const testWorkout = [
  {
    name: 'Bench Press',
    sets: [
      { weight: 80, reps: 5, unit: 'kg' as const },
      { weight: 80, reps: 5, unit: 'kg' as const },
      { weight: 80, reps: 5, unit: 'kg' as const },
      { weight: 80, reps: 5, unit: 'kg' as const },
      { weight: 80, reps: 5, unit: 'kg' as const },
    ],
  },
  {
    name: 'Incline Bench',
    sets: [
      { weight: 60, reps: 8, unit: 'kg' as const },
      { weight: 60, reps: 8, unit: 'kg' as const },
      { weight: 60, reps: 8, unit: 'kg' as const },
    ],
  },
  {
    name: 'Dumbbell Curl',
    sets: [
      { weight: 14, reps: 10, unit: 'kg' as const },
      { weight: 14, reps: 10, unit: 'kg' as const },
      { weight: 14, reps: 10, unit: 'kg' as const },
    ],
  },
  {
    name: 'Lateral Raise',
    sets: [
      { weight: 10, reps: 15, unit: 'kg' as const },
      { weight: 10, reps: 15, unit: 'kg' as const },
    ],
  },
];

const timeAdapted = adaptWorkoutForConstraints(testWorkout, { type: 'time', availableMinutes: 30 });
check(timeAdapted.timeSavedMinutes > 0, 'Time saved is greater than 0');
check(timeAdapted.adaptedExercises[0].sets.length <= 3, 'Compound sets capped at 3 working sets');
check(timeAdapted.changesSummary.length > 0, 'Changes summary generated');

// Equipment constraint adaptation
const eqAdapted = adaptWorkoutForConstraints(testWorkout, {
  type: 'equipment',
  targetExerciseName: 'Bench Press',
  substituteExerciseName: 'Dumbbell Press',
});
check(eqAdapted.adaptedExercises[0].name === 'Dumbbell Press', 'Bench Press swapped for Dumbbell Press');
check(eqAdapted.adaptedExercises[0].sets[0].weight < 80, 'Bench 80kg converted to safe dumbbell load (< 80kg)');

// Bodyweight equipment swap sets load to 0kg instead of machine load
const bwAdapted = adaptWorkoutForConstraints([
  {
    name: 'Lat Pulldown',
    sets: [{ weight: 70, reps: 10, unit: 'kg' as const }],
  },
], {
  type: 'equipment',
  targetExerciseName: 'Lat Pulldown',
  substituteExerciseName: 'Pull-ups',
});
check(bwAdapted.adaptedExercises[0].name === 'Pull-ups', 'Lat Pulldown swapped to Pull-ups');
check(bwAdapted.adaptedExercises[0].sets[0].weight === 0, 'Bodyweight Pull-ups load set to 0kg instead of 70kg pin load');

// Stimulus-preserving swap lookup resilience
const pullupSwaps = getStimulusPreservingSwaps('pullups');
check(pullupSwaps.length > 0, 'Substrings/aliases like pullups resolve stimulus-preserving swaps');
const latSwaps = getStimulusPreservingSwaps('Lat Pulldown');
check(latSwaps.some(s => s.target === 'Pull-ups'), 'Lat Pulldown swaps include Pull-ups');
const legPressSwaps = getStimulusPreservingSwaps('Leg Press');
check(legPressSwaps.some(s => s.target === 'Hack Squat'), 'Leg Press swaps include Hack Squat');

// Robust equipment categorization across naming variations
check(isBodyweightExercise('Pull-ups') && isBodyweightExercise('Push-ups') && isBodyweightExercise('dips'), 'isBodyweightExercise identifies pullups, pushups, dips');
check(isDumbbellExercise('Dumbbell Bench Press') && isDumbbellExercise('DB Curl'), 'isDumbbellExercise identifies variations');
check(isCableExercise('Cable Lat Pulldown') && isCableExercise('Tricep Cable Pushdown'), 'isCableExercise identifies variations');
check(isMachineExercise('Hack Squat Machine') && isMachineExercise('Seated Leg Curl'), 'isMachineExercise identifies variations');

console.log('\n======================================================');
console.log('TEST SUITE 4: Functional Multi-Goal Personalization Engine');
console.log('======================================================');

const sampleHistory: WorkoutEntry[] = [
  {
    id: 'w1',
    date: '2026-09-28',
    exercises: [
      {
        name: 'Squat',
        sets: [
          { weight: 100, reps: 5, unit: 'kg', rpe: 7.5 },
          { weight: 100, reps: 5, unit: 'kg', rpe: 8.0 },
          { weight: 100, reps: 5, unit: 'kg', rpe: 8.0 },
        ],
      },
    ],
  },
];

// Decision with Get Stronger goal
const strengthDecision = generateTrainingDecision('Squat', sampleHistory, 'kg', 8.0, ['get_stronger']);
check(strengthDecision !== null, 'Generated strength decision');
check(strengthDecision?.programIntent === 'strength', 'Intent is strength for get_stronger', strengthDecision?.programIntent);
check(strengthDecision?.nextPrescription.weight === 102.5, 'Prescribed weight is 102.5kg (+2.5kg)', `${strengthDecision?.nextPrescription.weight}`);
check(strengthDecision?.nextPrescription.reps === 4, 'Prescribed reps is in strength bracket (4 reps)', `${strengthDecision?.nextPrescription.reps}`);

// Decision with Build Muscle goal
const muscleDecision = generateTrainingDecision('Squat', sampleHistory, 'kg', 8.0, ['build_muscle']);
check(muscleDecision?.programIntent === 'hypertrophy', 'Intent is hypertrophy for build_muscle', muscleDecision?.programIntent);
check(muscleDecision?.nextPrescription.reps === 8, 'Prescribed reps adapts to hypertrophy bracket (8 reps)', `${muscleDecision?.nextPrescription.reps}`);

// Decision with Powerbuilding (Get Stronger + Build Muscle)
const pbDecision = generateTrainingDecision('Squat', sampleHistory, 'kg', 8.0, ['get_stronger', 'build_muscle']);
check(Boolean(pbDecision?.headline.includes('Powerbuilding')), 'Headline identifies Powerbuilding', pbDecision?.headline);
check(pbDecision?.nextPrescription.reps === 4, 'Prescribed reps balances heavy compound tension', `${pbDecision?.nextPrescription.reps}`);

// All 5 goals have complete configuration
const allGoals: AthleteGoal[] = ['build_muscle', 'get_stronger', 'lose_fat', 'stamina', 'general_fitness'];
allGoals.forEach((g) => {
  const conf = ATHLETE_GOAL_CONFIGS[g];
  check(Boolean(conf.label && conf.trainingEmphasis && conf.nutritionEmphasis), `Goal config for ${g} is fully specified`);
});

console.log('\n======================================================');
console.log('SUMMARY: Experiment Features QA Suite');
console.log('======================================================');
console.log(`Total: ${total}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\nALL EXPERIMENT QA TESTS PASSED CLEANLY!\n');
}
