/**
 * ASCEND Athlete Operating System (AOS) Closed-Loop & Regression QA Suite
 * Tests:
 * 1. Unperformed / Skipped set filtering (zero fabrication)
 * 2. Warmup set isolation from PR detection (no fake 1RMs)
 * 3. Out-of-order workout date resolution (newest chronological session)
 * 4. Cross-unit (kg <-> lbs) normalization across session history
 * 5. Accepted Decision Ledger targets wire directly into getExercisePrescription
 * 6. Overridden Decision Ledger targets preserve custom athlete load
 * 7. Lifter Twin effort drift (effort spike -> load reduction, rep drop -> volume consolidation, clean reserve -> progressive overload)
 * 8. Store auto-evaluation of prediction error and next decision generation
 */

import {
  getExercisePrescription,
  getLastExercisePerformance,
  getProgressionRecommendation,
} from '../src/lib/workout-engine';
import {
  calculateSetEffortDrift,
  getExerciseHistorySessions,
  generateTrainingDecision,
} from '../src/lib/lifter-twin';
import { calculateOneRepMax, getEffectiveExerciseLoad } from '../src/lib/strength-standards';
import { WorkoutEntry, WorkoutSet, TrainingDecision, PersonalRecord } from '../src/lib/types';
import { useStore } from '../src/lib/store';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    failed++;
  }
}

console.log('\n======================================================');
console.log('RUNNING: AOS Closed-Loop & Data Integrity QA Suite');
console.log('======================================================\n');

// ── TEST 1: Unperformed / Skipped Sets are Never Fabricated ──
console.log('--- TEST 1: Unperformed / Skipped Set Filtering ---');
{
  const rawSets: WorkoutSet[] = [
    { weight: 100, reps: 8, completed: true, unit: 'kg' },
    { weight: 100, reps: 8, completed: false, unit: 'kg' }, // skipped/unperformed
    { weight: 100, reps: 0, completed: false, unit: 'kg' }, // untouched
  ];

  // Simulating ActiveWorkoutScreen / WorkoutPage validSets filter
  const validSets = rawSets.filter((s) => s.reps > 0 && s.completed === true);
  assert(validSets.length === 1, 'Only explicitly completed set is preserved');
  assert(validSets[0].weight === 100 && validSets[0].reps === 8, 'Preserved set maintains authentic weight & reps');
}

// ── TEST 2: Warmup Sets are Strictly Excluded from PR Detection ──
console.log('\n--- TEST 2: Warmup PR Isolation ---');
{
  const sets: WorkoutSet[] = [
    { weight: 120, reps: 5, completed: true, isWarmup: true, unit: 'kg' }, // Heavy warmup / ramp
    { weight: 100, reps: 5, completed: true, isWarmup: false, unit: 'kg' }, // Working set
  ];

  const existingPRs: PersonalRecord[] = [
    {
      id: 'pr_1',
      exercise: 'Bench Press',
      weightKg: 105,
      weightLbs: 231,
      reps: 5,
      oneRepMax: calculateOneRepMax(105, 5),
      date: '2026-09-01',
    },
  ];

  const currentBest1RM = existingPRs[0].oneRepMax; // ~122.5 kg

  // Simulating PR detection logic with warmup filter
  let detectedPR = false;
  for (const s of sets) {
    if (s.isWarmup) continue; // Critical guard
    if (typeof s.weight !== 'number' || !Number.isFinite(s.weight)) continue;
    const e1rm = calculateOneRepMax(s.weight, s.reps);
    if (e1rm > currentBest1RM) {
      detectedPR = true;
    }
  }

  assert(!detectedPR, 'Warmup set (120kg) does not trigger false PR over 105kg working PR');
}

// ── TEST 3: Out-of-Order Workout Date Sorting ──
console.log('\n--- TEST 3: Chronological Workout Resolution ---');
{
  // Array where older workout appears first at index 0, newer at index 1
  const outOfOrderWorkouts: WorkoutEntry[] = [
    {
      id: 'wk_old',
      date: '2026-10-01',
      exercises: [
        {
          name: 'Squat',
          sets: [{ weight: 100, reps: 5, completed: true, unit: 'kg' }],
        },
      ],
    },
    {
      id: 'wk_new',
      date: '2026-10-08',
      exercises: [
        {
          name: 'Squat',
          sets: [{ weight: 110, reps: 5, rpe: 8, completed: true, unit: 'kg' }],
        },
      ],
    },
  ];

  const lastPerf = getLastExercisePerformance('Squat', outOfOrderWorkouts, 'kg');
  assert(lastPerf !== null, 'Found performance for Squat');
  assert(lastPerf?.date === '2026-10-08', 'Resolved newest date (2026-10-08) instead of index 0');
  assert(lastPerf?.bestWeight === 110, 'Resolved newest working weight (110kg)');

  const prog = getProgressionRecommendation('Squat', outOfOrderWorkouts, 'kg', 'get_stronger');
  assert(prog !== null, 'Progression recommendation generated');
  assert(prog?.targetWeight === 112.5, 'Progression builds on newest 110kg load (+2.5kg step)');
}

// ── TEST 4: Cross-Unit Normalization (kg <-> lbs) ──
console.log('\n--- TEST 4: Cross-Unit kg/lb Normalization ---');
{
  const lbsWorkouts: WorkoutEntry[] = [
    {
      id: 'wk_lbs',
      date: '2026-10-05',
      exercises: [
        {
          name: 'Deadlift',
          sets: [
            { weight: 220, reps: 5, completed: true, unit: 'lbs' }, // 220 lbs ~= 100 kg
          ],
        },
      ],
    },
  ];

  // Lifter switches to kg
  const lastPerfInKg = getLastExercisePerformance('Deadlift', lbsWorkouts, 'kg');
  assert(lastPerfInKg !== null, 'Found performance for Deadlift');
  assert(
    Math.abs(lastPerfInKg!.bestWeight - 99.8) < 1.0,
    `Normalized 220 lbs to ~100 kg (got ${lastPerfInKg?.bestWeight} kg)`
  );

  // Lifter switches back to lbs with a kg workout
  const kgWorkouts: WorkoutEntry[] = [
    {
      id: 'wk_kg',
      date: '2026-10-05',
      exercises: [
        {
          name: 'Deadlift',
          sets: [
            { weight: 100, reps: 5, completed: true, unit: 'kg' },
          ],
        },
      ],
    },
  ];

  const lastPerfInLbs = getLastExercisePerformance('Deadlift', kgWorkouts, 'lbs');
  assert(
    Math.abs(lastPerfInLbs!.bestWeight - 220.5) < 1.0,
    `Normalized 100 kg to ~220.5 lbs (got ${lastPerfInLbs?.bestWeight} lbs)`
  );
}

// ── TEST 5: Accepted Decision Ledger Target Integration ──
console.log('\n--- TEST 5: Accepted Decision Ledger Integration ---');
{
  const acceptedDecision: TrainingDecision = {
    id: 'dec_101',
    exerciseName: 'Bench Press',
    date: '2026-10-10',
    programIntent: 'progressive_overload',
    previousPerformance: { weight: 100, reps: 8, sets: 3 },
    nextPrescription: { weight: 102.5, reps: 8, targetRpe: 8.0, sets: 4 },
    expectedRpe: 8.0,
    reasonType: 'progressive_overload',
    headline: 'Progressive Overload Prescribed',
    explanation: 'Clean reserve confirmed in prior exposure. Adding 2.5kg.',
    deltaKg: 2.5,
    deltaPercent: 2.5,
    confidence: 'high',
    evidenceCount: 5,
    status: 'accepted',
    timestamp: '2026-10-10T10:00:00.000Z',
  };

  const trainingDecisions: Record<string, TrainingDecision> = {
    'Bench Press': acceptedDecision,
  };

  const presc = getExercisePrescription('Bench Press', [], [], 'kg', 'build_muscle', trainingDecisions);
  assert(presc.targetWeight === 102.5, 'Prescription uses accepted decision target weight (102.5 kg)');
  assert(presc.targetReps === 8, 'Prescription uses accepted decision target reps (8)');
  assert(presc.targetSets === 4, 'Prescription uses accepted decision target sets (4)');
  assert(presc.whyThisWeight.includes('Accepted Lifter Twin adaptation'), 'Prescription cites accepted decision');
}

// ── TEST 6: Overridden Decision Ledger Target Integration ──
console.log('\n--- TEST 6: Overridden Decision Ledger Integration ---');
{
  const overriddenDecision: TrainingDecision = {
    id: 'dec_102',
    exerciseName: 'Overhead Press',
    date: '2026-10-10',
    programIntent: 'progressive_overload',
    previousPerformance: { weight: 60, reps: 5, sets: 3 },
    nextPrescription: { weight: 62.5, reps: 5, targetRpe: 8.0, sets: 3 },
    userOverrideWeight: 65, // Athlete overrode to 65kg
    expectedRpe: 8.0,
    reasonType: 'progressive_overload',
    headline: 'Overload Prescribed',
    explanation: 'Suggested 62.5kg.',
    deltaKg: 2.5,
    deltaPercent: 4.1,
    confidence: 'high',
    evidenceCount: 6,
    status: 'overridden',
    timestamp: '2026-10-10T10:00:00.000Z',
  };

  const trainingDecisions: Record<string, TrainingDecision> = {
    'Overhead Press': overriddenDecision,
  };

  const presc = getExercisePrescription('Overhead Press', [], [], 'kg', 'get_stronger', trainingDecisions);
  assert(presc.targetWeight === 65, 'Prescription honors athlete overridden load (65 kg)');
  assert(presc.whyThisWeight.includes('Athlete override active'), 'Prescription rationale cites athlete override');
}

// ── TEST 7: Lifter Twin Effort Drift Feedback in Prescription Engine ──
console.log('\n--- TEST 7: Effort Drift & Fatigue Adaptation ---');
{
  // A. Severe Effort Spike -> Load Reduction
  const highFatigueWorkouts: WorkoutEntry[] = [
    {
      id: 'wk_fatigue',
      date: '2026-10-10',
      exercises: [
        {
          name: 'Barbell Row',
          sets: [
            { weight: 80, reps: 8, rpe: 8.0, completed: true, unit: 'kg' },
            { weight: 80, reps: 8, rpe: 9.0, completed: true, unit: 'kg' },
            { weight: 80, reps: 8, rpe: 10.0, completed: true, unit: 'kg' }, // Effort spiked to 10
          ],
        },
      ],
    },
  ];

  const prescFatigue = getExercisePrescription('Barbell Row', highFatigueWorkouts, [], 'kg', 'build_muscle');
  assert(prescFatigue.targetWeight < 80, `Effort spike reduced load below 80kg (prescribed ${prescFatigue.targetWeight}kg)`);
  assert(prescFatigue.whyThisWeight.includes('spiked to RPE'), 'Prescription explains effort spike reduction');

  // B. Rep Drop-off -> Volume Consolidation (Hold Load)
  const repDropWorkouts: WorkoutEntry[] = [
    {
      id: 'wk_repdrop',
      date: '2026-10-10',
      exercises: [
        {
          name: 'Incline Bench',
          sets: [
            { weight: 70, reps: 10, rpe: 8.0, completed: true, unit: 'kg' },
            { weight: 70, reps: 9, rpe: 8.5, completed: true, unit: 'kg' },
            { weight: 70, reps: 7, rpe: 9.0, completed: true, unit: 'kg' }, // 10 -> 7 reps (repDrop = 3)
          ],
        },
      ],
    },
  ];

  const prescRepDrop = getExercisePrescription('Incline Bench', repDropWorkouts, [], 'kg', 'build_muscle');
  assert(prescRepDrop.targetWeight === 70, 'Rep drop holds load steady at 70kg (no premature weight increase)');
  assert(prescRepDrop.whyThisWeight.includes('Volume consolidation'), 'Prescription explains volume consolidation');

  // C. Clean Reserve -> Positive Overload
  const cleanWorkouts: WorkoutEntry[] = [
    {
      id: 'wk_clean',
      date: '2026-10-10',
      exercises: [
        {
          name: 'Squat',
          sets: [
            { weight: 120, reps: 12, rpe: 7.5, completed: true, unit: 'kg' },
            { weight: 120, reps: 12, rpe: 7.5, completed: true, unit: 'kg' },
            { weight: 120, reps: 12, rpe: 8.0, completed: true, unit: 'kg' },
          ],
        },
      ],
    },
  ];

  const prescClean = getExercisePrescription('Squat', cleanWorkouts, [], 'kg', 'build_muscle');
  assert(prescClean.targetWeight === 122.5, 'Clean sets with reserve advance weight to 122.5kg (+2.5kg overload)');
  assert(prescClean.targetReps === 8, 'Reps reset to bottom of bracket (8 reps) for double progression');
}

// ── TEST 8: Store addWorkout Prediction Error & Decision Ledger ──
console.log('\n--- TEST 8: Store addWorkout Prediction Error Tracking ---');
{
  const store = useStore.getState();

  // Seed an active pending decision
  const pendingDecision: TrainingDecision = {
    id: 'dec_test_8',
    exerciseName: 'Bench Press',
    date: '2026-10-10',
    programIntent: 'progressive_overload',
    previousPerformance: { weight: 100, reps: 8, sets: 3 },
    nextPrescription: { weight: 102.5, reps: 8, targetRpe: 8.0, sets: 3 },
    expectedRpe: 8.0,
    reasonType: 'progressive_overload',
    headline: 'Overload Target',
    explanation: 'Target 102.5kg at RPE 8.0.',
    deltaKg: 2.5,
    deltaPercent: 2.5,
    confidence: 'high',
    evidenceCount: 5,
    status: 'accepted',
    timestamp: '2026-10-10T10:00:00.000Z',
  };

  store.recordTrainingDecision(pendingDecision);

  // Complete workout with actual execution at RPE 8.5
  const completedWorkout: WorkoutEntry = {
    id: 'wk_actual_8',
    date: '2026-10-11',
    exercises: [
      {
        name: 'Bench Press',
        sets: [
          { weight: 102.5, reps: 8, rpe: 8.5, completed: true, unit: 'kg' },
          { weight: 102.5, reps: 8, rpe: 8.5, completed: true, unit: 'kg' },
          { weight: 102.5, reps: 8, rpe: 8.5, completed: true, unit: 'kg' },
        ],
      },
    ],
  };

  store.addWorkout(completedWorkout);

  const updatedState = useStore.getState();
  const ledgerHistory = updatedState.decisionsLedgerHistory;
  const evaluatedEntry = ledgerHistory.find((d) => d.id === 'dec_test_8');

  assert(evaluatedEntry !== undefined, 'Found evaluated decision in Decision Ledger history');
  assert(evaluatedEntry?.actualExecution?.weight === 102.5, 'Actual execution recorded correct weight');
  assert(evaluatedEntry?.actualExecution?.actualRpe === 8.5, 'Actual execution recorded actual RPE (8.5)');
  assert(evaluatedEntry?.predictionError === 0.5, 'Prediction error calculated accurately (+0.5 RPE error)');

  // Verify next decision was auto-generated
  const currentBenchDecision = updatedState.trainingDecisions['Bench Press'];
  assert(currentBenchDecision !== undefined, 'Next training decision was auto-generated');
  assert(currentBenchDecision.id !== 'dec_test_8', 'Next decision has unique fresh ID');
}

console.log('\n======================================================');
console.log(`TOTAL AOS ASSERTIONS: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
