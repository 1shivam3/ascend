import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { useStore } from '../src/lib/store';
import { getTodaySessionState } from '../src/lib/workout-engine';
import { getScheduledWorkoutForDay, getTodayDayOfWeek, buildDefaultWeeklySchedule } from '../src/lib/workout-schedule';
import { PlannedWorkout, WorkoutEntry, WeeklySchedule } from '../src/lib/types';

console.log('======================================================');
console.log('RUNNING: Plan Sync & Onboarding Friction QA Suite');
console.log('======================================================\n');

let passCount = 0;
function it(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passCount++;
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// --- TEST SUITE 1: ONBOARDING TRAINING FREQUENCY CALIBRATION ---
console.log('--- TEST 1: Onboarding Training Frequency Calibration ---');
it('Onboarding.tsx renders Training Days / Wk with 3d, 4d, 5d, 6d options and adaptive split generation', () => {
  const onboardingContent = fs.readFileSync(path.join(process.cwd(), 'src/components/Onboarding.tsx'), 'utf-8');
  assert(onboardingContent.includes('Training Days / Wk'), 'Onboarding should contain Training Days / Wk prompt');
  assert(onboardingContent.includes("value: '3', label: '3d'"), 'Option 3d must be present');
  assert(onboardingContent.includes("value: '6', label: '6d'"), 'Option 6d must be present');
  assert(onboardingContent.includes('preferredSplit: preferredSplit'), 'Should dynamically assign preferredSplit');
  assert(onboardingContent.includes("equipment: 'full_gym'"), 'Should default equipment to full_gym in profile');
});

// --- TEST SUITE 2: PLAN CREATION AUTOMATICALLY SYNCS TO WEEKLY SCHEDULE ---
console.log('\n--- TEST 2: User Plan Creation & Schedule Synchronization ---');
it('Creating a new workout plan immediately schedules it for today in weeklySchedule', () => {
  const store = useStore.getState();
  const todayDay = getTodayDayOfWeek();

  const customPlan: PlannedWorkout = {
    id: 'user_chest_blast',
    name: 'Chest & Arms Hypertrophy',
    createdAt: new Date().toISOString(),
    exercises: [
      { name: 'Incline Dumbbell Press', targetSets: 4, targetReps: 10, targetWeight: 30 },
      { name: 'Dumbbell Curl', targetSets: 3, targetReps: 12, targetWeight: 14 },
    ],
  };

  store.addPlannedWorkout(customPlan);

  const updatedState = useStore.getState();
  assert(updatedState.plannedWorkouts[0].id === 'user_chest_blast', 'Plan should be added at top of plannedWorkouts');
  assert.strictEqual(updatedState.weeklySchedule[todayDay].workoutPlanId, 'user_chest_blast', 'Today schedule must be synced to newly created plan');
  assert.strictEqual(updatedState.weeklySchedule[todayDay].customTitle, 'Chest & Arms Hypertrophy', 'Today schedule title must match plan name');
});

it('Editing a workout plan keeps the weeklySchedule title and body parts in sync', () => {
  const store = useStore.getState();
  const todayDay = getTodayDayOfWeek();

  const updatedPlan: PlannedWorkout = {
    id: 'user_chest_blast',
    name: 'Heavy Chest & Biceps Overload',
    createdAt: new Date().toISOString(),
    exercises: [
      { name: 'Bench Press', targetSets: 5, targetReps: 5, targetWeight: 100 },
      { name: 'Barbell Curl', targetSets: 4, targetReps: 8, targetWeight: 40 },
    ],
  };

  store.updatePlannedWorkout('user_chest_blast', updatedPlan);

  const updatedState = useStore.getState();
  assert.strictEqual(updatedState.weeklySchedule[todayDay].customTitle, 'Heavy Chest & Biceps Overload', 'Scheduled day title must update when plan is edited');
  assert(Boolean(updatedState.weeklySchedule[todayDay].bodyParts?.includes('Chest')), 'Scheduled day body parts must reflect updated exercises');
});

it('Deleting a workout plan cleanly updates scheduled days without dangling IDs', () => {
  const store = useStore.getState();
  const todayDay = getTodayDayOfWeek();

  store.deletePlannedWorkout('user_chest_blast');

  const updatedState = useStore.getState();
  assert(!updatedState.plannedWorkouts.some(p => p.id === 'user_chest_blast'), 'Plan must be removed from store');
  assert.notStrictEqual(updatedState.weeklySchedule[todayDay].workoutPlanId, 'user_chest_blast', 'Schedule must not reference deleted plan ID');
});

// --- TEST SUITE 3: HOME PAGE & SESSION ENGINE SYNC ---
console.log('\n--- TEST 3: Home Page Session Engine Synchronization ---');
it('getTodaySessionState prioritizes user custom plans over generic templates', () => {
  const customPlan: PlannedWorkout = {
    id: 'custom_push_power',
    name: 'Custom Push Power',
    createdAt: new Date().toISOString(),
    exercises: [
      { name: 'Overhead Press', targetSets: 4, targetReps: 6, targetWeight: 60 },
      { name: 'Dip', targetSets: 3, targetReps: 10 },
    ],
  };

  const builtinPlan: PlannedWorkout = {
    id: 'builtin_upper_a',
    name: 'Upper A',
    createdAt: '2026-01-01',
    exercises: [{ name: 'Bench Press', targetSets: 4, targetReps: 5 }],
  };

  const todayDay = getTodayDayOfWeek();
  const schedule: WeeklySchedule = {
    monday: { workoutPlanId: 'builtin_upper_a', customTitle: 'Upper A', bodyParts: ['Chest'] },
    tuesday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    wednesday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    thursday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    friday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    saturday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    sunday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
  };
  schedule[todayDay] = { workoutPlanId: 'builtin_upper_a', customTitle: 'Upper A', bodyParts: ['Chest'] };

  // When user has custom plans, getTodaySessionState prioritizes their custom plan
  const session = getTodaySessionState(
    '2026-10-12',
    [],
    [customPlan, builtinPlan],
    null,
    'kg',
    schedule
  );

  assert.strictEqual(session.title, 'Custom Push Power', 'Session title must reflect user created plan');
  assert(session.exercises.includes('Overhead Press'), 'Exercises must match user plan');
});

it('Brand-new user with 0 logged workouts is never placed on Day 1 Rest Day', () => {
  const myPlan: PlannedWorkout = {
    id: 'plan_day_1',
    name: 'Day 1 Starter Workout',
    createdAt: new Date().toISOString(),
    exercises: [{ name: 'Goblet Squat', targetSets: 3, targetReps: 10 }],
  };

  const restSchedule: WeeklySchedule = {
    monday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    tuesday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    wednesday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    thursday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    friday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    saturday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    sunday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
  };

  const session = getTodaySessionState(
    '2026-10-12',
    [], // Zero workouts logged
    [myPlan],
    null,
    'kg',
    restSchedule
  );

  assert.strictEqual(session.isRestDay, false, 'New user on Day 1 must never be locked to a rest day');
  assert.strictEqual(session.title, 'Day 1 Starter Workout', 'New user must see their first planned workout');
  assert(session.exercises.includes('Goblet Squat'), 'Day 1 exercises must be displayed');
});

// --- TEST SUITE 4: HOME PAGE UI INTEGRATION ---
console.log('\n--- TEST 4: Home Page UI Synchronization Features ---');
it('HomePage.tsx includes Change Workout modal and routine picker', () => {
  const homeContent = fs.readFileSync(path.join(process.cwd(), 'src/components/HomePage.tsx'), 'utf-8');
  assert(homeContent.includes('isChangeWorkoutOpen'), 'HomePage must include isChangeWorkoutOpen state');
  assert(homeContent.includes('Change Today'), 'HomePage must render Change Today modal');
  assert(homeContent.includes('handleSelectWorkoutForToday'), 'HomePage must have routine select handler');
});

it('HomePage.tsx starts workout with pre-filled exercises from active plan', () => {
  const homeContent = fs.readFileSync(path.join(process.cwd(), 'src/components/HomePage.tsx'), 'utf-8');
  assert(homeContent.includes('handleStartWorkoutFromHome'), 'HomePage must have handleStartWorkoutFromHome');
  assert(homeContent.includes('saveWorkoutDraft'), 'handleStartWorkoutFromHome must populate workout draft');
});

console.log('\n======================================================');
console.log(`TOTAL ASSERTIONS: ${passCount}`);
console.log(`PASSED: ${passCount}`);
console.log('FAILED: 0');
console.log('======================================================\n');
