import { DayOfWeek, DayScheduleConfig, WeeklySchedule, PlannedWorkout } from './types';

export const DAYS_OF_WEEK: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const DAY_DISPLAY_INFO: Record<DayOfWeek, { short: string; label: string; index: number }> = {
  monday: { short: 'Mon', label: 'Monday', index: 1 },
  tuesday: { short: 'Tue', label: 'Tuesday', index: 2 },
  wednesday: { short: 'Wed', label: 'Wednesday', index: 3 },
  thursday: { short: 'Thu', label: 'Thursday', index: 4 },
  friday: { short: 'Fri', label: 'Friday', index: 5 },
  saturday: { short: 'Sat', label: 'Saturday', index: 6 },
  sunday: { short: 'Sun', label: 'Sunday', index: 0 },
};

export const AVAILABLE_BODY_PARTS: string[] = [
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
  'Conditioning',
  'Full Body',
];

/**
 * Maps an exercise name to its primary targeted body part.
 */
export function getExerciseBodyPart(exerciseName: string): string {
  const name = exerciseName.toLowerCase().trim();
  if (
    name.includes('cycle') ||
    name.includes('bike') ||
    name.includes('treadmill') ||
    name.includes('rowing') ||
    name.includes('stair') ||
    name.includes('jump rope') ||
    name.includes('kettlebell') ||
    name.includes('conditioning') ||
    name.includes('farmer')
  ) {
    return 'Conditioning';
  }
  if (
    name.includes('bench') ||
    name.includes('chest') ||
    name.includes('push-up') ||
    name.includes('pushup') ||
    name.includes('dip') ||
    name.includes('fly')
  ) {
    return 'Chest';
  }
  if (
    name.includes('row') ||
    name.includes('pulldown') ||
    name.includes('pull-up') ||
    name.includes('pullup') ||
    name.includes('chin-up') ||
    name.includes('chinup') ||
    name.includes('lat') ||
    name.includes('deadlift')
  ) {
    return 'Back';
  }
  if (
    name.includes('squat') ||
    name.includes('leg') ||
    name.includes('calf') ||
    name.includes('calves') ||
    name.includes('lunge') ||
    name.includes('hamstring') ||
    name.includes('quad') ||
    name.includes('glute')
  ) {
    return 'Legs';
  }
  if (
    name.includes('overhead press') ||
    name.includes('shoulder') ||
    name.includes('ohp') ||
    name.includes('lateral raise') ||
    name.includes('arnold') ||
    name.includes('face pull')
  ) {
    return 'Shoulders';
  }
  if (
    name.includes('curl') ||
    name.includes('tricep') ||
    name.includes('bicep') ||
    name.includes('close grip') ||
    name.includes('kickback')
  ) {
    return 'Arms';
  }
  if (
    name.includes('crunch') ||
    name.includes('plank') ||
    name.includes('ab') ||
    name.includes('core')
  ) {
    return 'Core';
  }
  return 'Full Body';
}

/**
 * Extracts and deduplicates targeted body parts from a workout routine's exercises.
 */
export function getWorkoutBodyParts(exercises: { name: string }[]): string[] {
  if (!exercises || exercises.length === 0) return [];
  const parts = new Set<string>();
  for (const ex of exercises) {
    if (ex.name && ex.name.trim()) {
      parts.add(getExerciseBodyPart(ex.name));
    }
  }
  return Array.from(parts);
}

/**
 * Returns today's day of the week in lowercase ('monday', 'tuesday', etc.)
 * based on local time or an optional YYYY-MM-DD date string.
 */
export function getTodayDayOfWeek(dateStr?: string): DayOfWeek {
  const d = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
  const dayIndex = d.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const map: DayOfWeek[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  return map[dayIndex] || 'monday';
}

export interface SplitGenerationResult {
  plans: PlannedWorkout[];
  schedule: WeeklySchedule;
  daysPerWeek: number;
  splitName: string;
}

/**
 * Deterministically generates both the planned workouts and the weekly schedule
 * for any training split (PPL, Upper/Lower, Arnold, Bro Split, Full Body).
 */
export function generateSplitWeeklySchedule(
  splitType: 'ppl' | 'upper_lower' | 'arnold' | 'bro_split' | 'full_body' | string,
  userUnit: 'kg' | 'lbs' = 'kg'
): SplitGenerationResult {
  const isLbs = userUnit === 'lbs';

  if (splitType === 'ppl' || splitType === 'push_pull_legs') {
    const pushDay: PlannedWorkout = {
      id: 'plan_push_day',
      name: 'Push Day (Chest, Shoulders & Triceps)',
      createdAt: new Date().toISOString(),
      exercises: [
        { name: 'Bench Press', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 155 : 70, targetUnit: userUnit },
        { name: 'Overhead Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 95 : 42.5, targetUnit: userUnit },
        { name: 'Incline Dumbbell Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 45 : 20, targetUnit: userUnit },
        { name: 'Dumbbell Lateral Raise', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 20 : 10, targetUnit: userUnit },
        { name: 'Tricep Pushdown', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 50 : 25, targetUnit: userUnit },
      ],
    };

    const pullDay: PlannedWorkout = {
      id: 'plan_pull_day',
      name: 'Pull Day (Back, Biceps & Rear Delts)',
      createdAt: new Date().toISOString(),
      exercises: [
        { name: 'Deadlift', targetSets: 3, targetReps: 5, targetWeight: isLbs ? 245 : 110, targetUnit: userUnit },
        { name: 'Barbell Row', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 135 : 60, targetUnit: userUnit },
        { name: 'Lat Pulldown', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 120 : 55, targetUnit: userUnit },
        { name: 'Face Pull', targetSets: 3, targetReps: 15, targetWeight: isLbs ? 35 : 16, targetUnit: userUnit },
        { name: 'Dumbbell Curl', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 25 : 12, targetUnit: userUnit },
      ],
    };

    const legDay: PlannedWorkout = {
      id: 'plan_leg_day',
      name: 'Leg Day (Quads, Hamstrings & Core)',
      createdAt: new Date().toISOString(),
      exercises: [
        { name: 'Squat', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 205 : 92.5, targetUnit: userUnit },
        { name: 'Romanian Deadlift', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 165 : 75, targetUnit: userUnit },
        { name: 'Leg Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 350 : 160, targetUnit: userUnit },
        { name: 'Hamstring Curl', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 100 : 45, targetUnit: userUnit },
        { name: 'Calf Raise', targetSets: 3, targetReps: 15, targetWeight: isLbs ? 110 : 50, targetUnit: userUnit },
      ],
    };

    const plans = [pushDay, pullDay, legDay];
    const schedule: WeeklySchedule = {
      monday: { workoutPlanId: pushDay.id, customTitle: pushDay.name, bodyParts: getWorkoutBodyParts(pushDay.exercises) },
      tuesday: { workoutPlanId: pullDay.id, customTitle: pullDay.name, bodyParts: getWorkoutBodyParts(pullDay.exercises) },
      wednesday: { workoutPlanId: legDay.id, customTitle: legDay.name, bodyParts: getWorkoutBodyParts(legDay.exercises) },
      thursday: { workoutPlanId: pushDay.id, customTitle: pushDay.name, bodyParts: getWorkoutBodyParts(pushDay.exercises) },
      friday: { workoutPlanId: pullDay.id, customTitle: pullDay.name, bodyParts: getWorkoutBodyParts(pullDay.exercises) },
      saturday: { workoutPlanId: legDay.id, customTitle: legDay.name, bodyParts: getWorkoutBodyParts(legDay.exercises) },
      sunday: { workoutPlanId: 'rest', customTitle: 'Rest & Recovery', bodyParts: [] },
    };

    return {
      plans,
      schedule,
      daysPerWeek: 6,
      splitName: 'Push / Pull / Legs (PPL)',
    };
  }

  if (splitType === 'arnold') {
    const chestBack: PlannedWorkout = {
      id: 'plan_arnold_chest_back',
      name: 'Chest & Back (Antagonist)',
      createdAt: new Date().toISOString(),
      exercises: [
        { name: 'Bench Press', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 155 : 70, targetUnit: userUnit },
        { name: 'Barbell Row', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 135 : 60, targetUnit: userUnit },
        { name: 'Incline Bench', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 135 : 60, targetUnit: userUnit },
        { name: 'Pull-ups', targetSets: 3, targetReps: 8, targetWeight: 0, targetUnit: userUnit },
      ],
    };

    const shouldersArms: PlannedWorkout = {
      id: 'plan_arnold_shoulders_arms',
      name: 'Shoulders & Arms',
      createdAt: new Date().toISOString(),
      exercises: [
        { name: 'Overhead Press', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 95 : 42.5, targetUnit: userUnit },
        { name: 'Dumbbell Lateral Raise', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 20 : 10, targetUnit: userUnit },
        { name: 'Dumbbell Curl', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 25 : 12, targetUnit: userUnit },
        { name: 'Tricep Pushdown', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 50 : 25, targetUnit: userUnit },
      ],
    };

    const legsAbs: PlannedWorkout = {
      id: 'plan_arnold_legs_abs',
      name: 'Legs & Core',
      createdAt: new Date().toISOString(),
      exercises: [
        { name: 'Squat', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 205 : 92.5, targetUnit: userUnit },
        { name: 'Romanian Deadlift', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 165 : 75, targetUnit: userUnit },
        { name: 'Leg Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 350 : 160, targetUnit: userUnit },
        { name: 'Calf Raise', targetSets: 3, targetReps: 15, targetWeight: isLbs ? 110 : 50, targetUnit: userUnit },
      ],
    };

    const plans = [chestBack, shouldersArms, legsAbs];
    const schedule: WeeklySchedule = {
      monday: { workoutPlanId: chestBack.id, customTitle: chestBack.name, bodyParts: getWorkoutBodyParts(chestBack.exercises) },
      tuesday: { workoutPlanId: shouldersArms.id, customTitle: shouldersArms.name, bodyParts: getWorkoutBodyParts(shouldersArms.exercises) },
      wednesday: { workoutPlanId: legsAbs.id, customTitle: legsAbs.name, bodyParts: getWorkoutBodyParts(legsAbs.exercises) },
      thursday: { workoutPlanId: chestBack.id, customTitle: chestBack.name, bodyParts: getWorkoutBodyParts(chestBack.exercises) },
      friday: { workoutPlanId: shouldersArms.id, customTitle: shouldersArms.name, bodyParts: getWorkoutBodyParts(shouldersArms.exercises) },
      saturday: { workoutPlanId: legsAbs.id, customTitle: legsAbs.name, bodyParts: getWorkoutBodyParts(legsAbs.exercises) },
      sunday: { workoutPlanId: 'rest', customTitle: 'Rest & Recovery', bodyParts: [] },
    };

    return {
      plans,
      schedule,
      daysPerWeek: 6,
      splitName: 'Arnold Split',
    };
  }

  if (splitType === 'bro_split') {
    const chest: PlannedWorkout = {
      id: 'plan_bro_chest',
      name: 'Chest Day',
      createdAt: new Date().toISOString(),
      exercises: [
        { name: 'Bench Press', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 155 : 70, targetUnit: userUnit },
        { name: 'Incline Dumbbell Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 45 : 20, targetUnit: userUnit },
        { name: 'Chest Fly', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 30 : 14, targetUnit: userUnit },
      ],
    };
    const back: PlannedWorkout = {
      id: 'plan_bro_back',
      name: 'Back Day',
      createdAt: new Date().toISOString(),
      exercises: [
        { name: 'Deadlift', targetSets: 3, targetReps: 5, targetWeight: isLbs ? 245 : 110, targetUnit: userUnit },
        { name: 'Barbell Row', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 135 : 60, targetUnit: userUnit },
        { name: 'Lat Pulldown', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 120 : 55, targetUnit: userUnit },
      ],
    };
    const shoulders: PlannedWorkout = {
      id: 'plan_bro_shoulders',
      name: 'Shoulders Day',
      createdAt: new Date().toISOString(),
      exercises: [
        { name: 'Overhead Press', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 95 : 42.5, targetUnit: userUnit },
        { name: 'Dumbbell Lateral Raise', targetSets: 4, targetReps: 12, targetWeight: isLbs ? 20 : 10, targetUnit: userUnit },
        { name: 'Face Pull', targetSets: 3, targetReps: 15, targetWeight: isLbs ? 35 : 16, targetUnit: userUnit },
      ],
    };
    const arms: PlannedWorkout = {
      id: 'plan_bro_arms',
      name: 'Arms Day',
      createdAt: new Date().toISOString(),
      exercises: [
        { name: 'Close Grip Bench', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 135 : 60, targetUnit: userUnit },
        { name: 'Dumbbell Curl', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 25 : 12, targetUnit: userUnit },
        { name: 'Tricep Pushdown', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 50 : 25, targetUnit: userUnit },
      ],
    };
    const legs: PlannedWorkout = {
      id: 'plan_bro_legs',
      name: 'Legs Day',
      createdAt: new Date().toISOString(),
      exercises: [
        { name: 'Squat', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 205 : 92.5, targetUnit: userUnit },
        { name: 'Leg Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 350 : 160, targetUnit: userUnit },
        { name: 'Romanian Deadlift', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 165 : 75, targetUnit: userUnit },
      ],
    };

    const plans = [chest, back, shoulders, arms, legs];
    const schedule: WeeklySchedule = {
      monday: { workoutPlanId: chest.id, customTitle: chest.name, bodyParts: getWorkoutBodyParts(chest.exercises) },
      tuesday: { workoutPlanId: back.id, customTitle: back.name, bodyParts: getWorkoutBodyParts(back.exercises) },
      wednesday: { workoutPlanId: shoulders.id, customTitle: shoulders.name, bodyParts: getWorkoutBodyParts(shoulders.exercises) },
      thursday: { workoutPlanId: arms.id, customTitle: arms.name, bodyParts: getWorkoutBodyParts(arms.exercises) },
      friday: { workoutPlanId: legs.id, customTitle: legs.name, bodyParts: getWorkoutBodyParts(legs.exercises) },
      saturday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
      sunday: { workoutPlanId: 'rest', customTitle: 'Rest & Recovery', bodyParts: [] },
    };

    return {
      plans,
      schedule,
      daysPerWeek: 5,
      splitName: 'Targeted Bodypart Split',
    };
  }

  if (splitType === 'full_body') {
    const fullBodyA: PlannedWorkout = {
      id: 'plan_full_body_a',
      name: 'Full Body A (Squat & Press)',
      createdAt: new Date().toISOString(),
      exercises: [
        { name: 'Squat', targetSets: 4, targetReps: 6, targetWeight: isLbs ? 205 : 92.5, targetUnit: userUnit },
        { name: 'Bench Press', targetSets: 4, targetReps: 6, targetWeight: isLbs ? 155 : 70, targetUnit: userUnit },
        { name: 'Barbell Row', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 135 : 60, targetUnit: userUnit },
        { name: 'Overhead Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 95 : 42.5, targetUnit: userUnit },
        { name: 'Dumbbell Curl', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 25 : 12, targetUnit: userUnit },
      ],
    };

    const fullBodyB: PlannedWorkout = {
      id: 'plan_full_body_b',
      name: 'Full Body B (Deadlift & Push)',
      createdAt: new Date().toISOString(),
      exercises: [
        { name: 'Deadlift', targetSets: 3, targetReps: 5, targetWeight: isLbs ? 245 : 110, targetUnit: userUnit },
        { name: 'Incline Bench', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 135 : 60, targetUnit: userUnit },
        { name: 'Lat Pulldown', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 120 : 55, targetUnit: userUnit },
        { name: 'Leg Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 350 : 160, targetUnit: userUnit },
        { name: 'Tricep Pushdown', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 50 : 25, targetUnit: userUnit },
      ],
    };

    const fullBodyC: PlannedWorkout = {
      id: 'plan_full_body_c',
      name: 'Full Body C (Front Squat & Pull)',
      createdAt: new Date().toISOString(),
      exercises: [
        { name: 'Front Squat', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 145 : 65, targetUnit: userUnit },
        { name: 'Pull-ups', targetSets: 3, targetReps: 8, targetWeight: 0, targetUnit: userUnit },
        { name: 'Dumbbell Shoulder Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 45 : 20, targetUnit: userUnit },
        { name: 'Romanian Deadlift', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 165 : 75, targetUnit: userUnit },
        { name: 'Dumbbell Lateral Raise', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 20 : 10, targetUnit: userUnit },
      ],
    };

    const plans = [fullBodyA, fullBodyB, fullBodyC];
    const schedule: WeeklySchedule = {
      monday: { workoutPlanId: fullBodyA.id, customTitle: fullBodyA.name, bodyParts: getWorkoutBodyParts(fullBodyA.exercises) },
      tuesday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
      wednesday: { workoutPlanId: fullBodyB.id, customTitle: fullBodyB.name, bodyParts: getWorkoutBodyParts(fullBodyB.exercises) },
      thursday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
      friday: { workoutPlanId: fullBodyC.id, customTitle: fullBodyC.name, bodyParts: getWorkoutBodyParts(fullBodyC.exercises) },
      saturday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
      sunday: { workoutPlanId: 'rest', customTitle: 'Rest & Recovery', bodyParts: [] },
    };

    return {
      plans,
      schedule,
      daysPerWeek: 3,
      splitName: 'Full Body (3-Day)',
    };
  }

  // Default: Upper / Lower (4-Day)
  const upperA: PlannedWorkout = {
    id: 'plan_upper_a',
    name: 'Upper A (Bench & Row)',
    createdAt: new Date().toISOString(),
    exercises: [
      { name: 'Bench Press', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 155 : 70, targetUnit: userUnit },
      { name: 'Barbell Row', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 135 : 60, targetUnit: userUnit },
      { name: 'Overhead Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 95 : 42.5, targetUnit: userUnit },
      { name: 'Lat Pulldown', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 120 : 55, targetUnit: userUnit },
      { name: 'Dumbbell Curl', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 25 : 12, targetUnit: userUnit },
    ],
  };
  const lowerA: PlannedWorkout = {
    id: 'plan_lower_a',
    name: 'Lower A (Squat & Quads)',
    createdAt: new Date().toISOString(),
    exercises: [
      { name: 'Squat', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 205 : 92.5, targetUnit: userUnit },
      { name: 'Romanian Deadlift', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 165 : 75, targetUnit: userUnit },
      { name: 'Leg Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 350 : 160, targetUnit: userUnit },
      { name: 'Calf Raise', targetSets: 3, targetReps: 15, targetWeight: isLbs ? 110 : 50, targetUnit: userUnit },
    ],
  };
  const upperB: PlannedWorkout = {
    id: 'plan_upper_b',
    name: 'Upper B (Incline & Shoulders)',
    createdAt: new Date().toISOString(),
    exercises: [
      { name: 'Incline Bench', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 135 : 60, targetUnit: userUnit },
      { name: 'Pull-ups', targetSets: 3, targetReps: 8, targetWeight: 0, targetUnit: userUnit },
      { name: 'Dumbbell Shoulder Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 45 : 20, targetUnit: userUnit },
      { name: 'Dumbbell Lateral Raise', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 20 : 10, targetUnit: userUnit },
      { name: 'Tricep Pushdown', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 50 : 25, targetUnit: userUnit },
    ],
  };
  const lowerB: PlannedWorkout = {
    id: 'plan_lower_b',
    name: 'Lower B (Deadlift & Posterior)',
    createdAt: new Date().toISOString(),
    exercises: [
      { name: 'Deadlift', targetSets: 3, targetReps: 5, targetWeight: isLbs ? 245 : 110, targetUnit: userUnit },
      { name: 'Front Squat', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 145 : 65, targetUnit: userUnit },
      { name: 'Hamstring Curl', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 100 : 45, targetUnit: userUnit },
    ],
  };

  const plans = [upperA, lowerA, upperB, lowerB];
  const schedule: WeeklySchedule = {
    monday: { workoutPlanId: upperA.id, customTitle: upperA.name, bodyParts: getWorkoutBodyParts(upperA.exercises) },
    tuesday: { workoutPlanId: lowerA.id, customTitle: lowerA.name, bodyParts: getWorkoutBodyParts(lowerA.exercises) },
    wednesday: { workoutPlanId: 'rest', customTitle: 'Rest & Recovery', bodyParts: [] },
    thursday: { workoutPlanId: upperB.id, customTitle: upperB.name, bodyParts: getWorkoutBodyParts(upperB.exercises) },
    friday: { workoutPlanId: lowerB.id, customTitle: lowerB.name, bodyParts: getWorkoutBodyParts(lowerB.exercises) },
    saturday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    sunday: { workoutPlanId: 'rest', customTitle: 'Rest & Recovery', bodyParts: [] },
  };

  return {
    plans,
    schedule,
    daysPerWeek: 4,
    splitName: 'Upper / Lower',
  };
}

/**
 * Constructs an intelligent default weekly schedule based on available planned workouts and days per week.
 */
/**
 * The plan OFFER must match the schedule that will actually run: a 2-day
 * user shown 3 generated workouts gets one installed-but-never-scheduled
 * plan. Slicing to daysPerWeek aligns offer and buildDefaultWeeklySchedule
 * (which consumes plans in order).
 */
export function limitPlansToDays(plans: PlannedWorkout[], daysPerWeek: number): PlannedWorkout[] {
  if (!plans || plans.length === 0) return plans || [];
  const n = Math.max(1, Math.min(plans.length, Math.floor(daysPerWeek) || 1));
  return plans.slice(0, n);
}

export function buildDefaultWeeklySchedule(
  plans: PlannedWorkout[],
  daysPerWeek: number = 4
): WeeklySchedule {
  if (!plans || plans.length === 0) {
    const fallback = generateSplitWeeklySchedule(
      daysPerWeek === 6 ? 'ppl' : daysPerWeek === 5 ? 'bro_split' : daysPerWeek === 3 ? 'full_body' : 'upper_lower'
    );
    return fallback.schedule;
  }

  const schedule: WeeklySchedule = {
    monday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    tuesday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    wednesday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    thursday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    friday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    saturday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    sunday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
  };

  const getPlanConfig = (plan: PlannedWorkout): DayScheduleConfig => ({
    workoutPlanId: plan.id,
    customTitle: plan.name,
    bodyParts: getWorkoutBodyParts(plan.exercises),
  });

  // 1. Explicit training frequency evaluation (strict adherence to daysPerWeek)
  if (daysPerWeek === 7) {
    schedule.monday = getPlanConfig(plans[0 % plans.length]);
    schedule.tuesday = getPlanConfig(plans[1 % plans.length]);
    schedule.wednesday = getPlanConfig(plans[2 % plans.length]);
    schedule.thursday = getPlanConfig(plans[3 % plans.length]);
    schedule.friday = getPlanConfig(plans[4 % plans.length]);
    schedule.saturday = getPlanConfig(plans[5 % plans.length]);
    schedule.sunday = getPlanConfig(plans[6 % plans.length]);
    return schedule;
  }

  // 6-Day Split (Mon-Sat, Sunday Rest)
  if (daysPerWeek === 6) {
    schedule.monday = getPlanConfig(plans[0 % plans.length]);
    schedule.tuesday = getPlanConfig(plans[1 % plans.length]);
    schedule.wednesday = getPlanConfig(plans[2 % plans.length]);
    schedule.thursday = getPlanConfig(plans[3 % plans.length]);
    schedule.friday = getPlanConfig(plans[4 % plans.length]);
    schedule.saturday = getPlanConfig(plans[5 % plans.length]);
    schedule.sunday = { workoutPlanId: 'rest', customTitle: 'Rest & Recovery', bodyParts: [] };
    return schedule;
  }

  // 5-Day Split (Mon-Fri, Weekend Rest)
  if (daysPerWeek === 5) {
    schedule.monday = getPlanConfig(plans[0 % plans.length]);
    schedule.tuesday = getPlanConfig(plans[1 % plans.length]);
    schedule.wednesday = getPlanConfig(plans[2 % plans.length]);
    schedule.thursday = getPlanConfig(plans[3 % plans.length]);
    schedule.friday = getPlanConfig(plans[4 % plans.length]);
    schedule.saturday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    schedule.sunday = { workoutPlanId: 'rest', customTitle: 'Rest & Recovery', bodyParts: [] };
    return schedule;
  }

  // 4-Day Upper / Lower (Mon/Tue/Thu/Fri, Wed/Sat/Sun Rest)
  if (daysPerWeek === 4) {
    schedule.monday = getPlanConfig(plans[0 % plans.length]);
    schedule.tuesday = getPlanConfig(plans[1 % plans.length]);
    schedule.wednesday = { workoutPlanId: 'rest', customTitle: 'Rest & Recovery', bodyParts: [] };
    schedule.thursday = getPlanConfig(plans[2 % plans.length]);
    schedule.friday = getPlanConfig(plans[3 % plans.length]);
    schedule.saturday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    schedule.sunday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    return schedule;
  }

  // 3-Day Full Body or Push/Pull/Legs (Mon/Wed/Fri, Tue/Thu/Sat/Sun Rest)
  if (daysPerWeek === 3) {
    schedule.monday = getPlanConfig(plans[0 % plans.length]);
    schedule.tuesday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    schedule.wednesday = getPlanConfig(plans[1 % plans.length]);
    schedule.thursday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    schedule.friday = getPlanConfig(plans[2 % plans.length]);
    schedule.saturday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    schedule.sunday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    return schedule;
  }

  // 2-Day Split (Tue/Thu)
  if (daysPerWeek === 2) {
    schedule.tuesday = getPlanConfig(plans[0 % plans.length]);
    schedule.thursday = getPlanConfig(plans[1 % plans.length]);
    return schedule;
  }

  // 1-Day Split (Saturday)
  if (daysPerWeek === 1) {
    schedule.saturday = getPlanConfig(plans[0 % plans.length]);
    return schedule;
  }

  // 2. Fallback heuristic based solely on template count when daysPerWeek is unprovided / outside 1-7
  if (plans.length >= 6) {
    schedule.monday = getPlanConfig(plans[0]);
    schedule.tuesday = getPlanConfig(plans[1] || plans[0]);
    schedule.wednesday = getPlanConfig(plans[2] || plans[0]);
    schedule.thursday = getPlanConfig(plans[3] || plans[0]);
    schedule.friday = getPlanConfig(plans[4] || plans[1] || plans[0]);
    schedule.saturday = getPlanConfig(plans[5] || plans[2] || plans[0]);
    schedule.sunday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    return schedule;
  }

  if (plans.length === 5) {
    schedule.monday = getPlanConfig(plans[0]);
    schedule.tuesday = getPlanConfig(plans[1] || plans[0]);
    schedule.wednesday = getPlanConfig(plans[2] || plans[0]);
    schedule.thursday = getPlanConfig(plans[3] || plans[0]);
    schedule.friday = getPlanConfig(plans[4] || plans[1] || plans[0]);
    schedule.saturday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    schedule.sunday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    return schedule;
  }

  if (plans.length === 4) {
    schedule.monday = getPlanConfig(plans[0]);
    schedule.tuesday = getPlanConfig(plans[1] || plans[0]);
    schedule.wednesday = { workoutPlanId: 'rest', customTitle: 'Rest & Recovery', bodyParts: [] };
    schedule.thursday = getPlanConfig(plans[2] || plans[0]);
    schedule.friday = getPlanConfig(plans[3] || plans[1] || plans[0]);
    schedule.saturday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    schedule.sunday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    return schedule;
  }

  if (plans.length === 3) {
    schedule.monday = getPlanConfig(plans[0]);
    schedule.tuesday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    schedule.wednesday = getPlanConfig(plans[1] || plans[0]);
    schedule.thursday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    schedule.friday = getPlanConfig(plans[2] || plans[0]);
    schedule.saturday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    schedule.sunday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    return schedule;
  }

  // Fallback: assign plans sequentially to weekdays
  const weekdays: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  for (let i = 0; i < Math.min(daysPerWeek || 4, weekdays.length); i++) {
    const plan = plans[i % plans.length];
    schedule[weekdays[i]] = getPlanConfig(plan);
  }

  return schedule;
}

/**
 * Resolves the scheduled workout details for any given day of the week.
 */
export function getScheduledWorkoutForDay(
  schedule: WeeklySchedule | undefined,
  day: DayOfWeek,
  plans: PlannedWorkout[]
): {
  plan: PlannedWorkout | null;
  isRest: boolean;
  bodyParts: string[];
  title: string;
} {
  const dayConfig = schedule?.[day];

  if (!dayConfig || dayConfig.workoutPlanId === 'rest') {
    return {
      plan: null,
      isRest: true,
      bodyParts: [],
      title: dayConfig?.customTitle || 'Rest & Recovery',
    };
  }

  let foundPlan = plans.find((p) => p.id === dayConfig.workoutPlanId || p.name.toLowerCase() === dayConfig.workoutPlanId?.toLowerCase());

  // If schedule references a builtin template but the user has created custom plans, prioritize user's custom plan
  const userCustomPlans = plans.filter((p) => !p.id.startsWith('builtin_'));
  if ((!foundPlan || dayConfig.workoutPlanId?.startsWith('builtin_')) && userCustomPlans.length > 0) {
    foundPlan = userCustomPlans[0];
  }

  const title = foundPlan?.name || dayConfig.customTitle || 'Workout';
  const bodyParts =
    foundPlan
      ? getWorkoutBodyParts(foundPlan.exercises)
      : dayConfig.bodyParts && dayConfig.bodyParts.length > 0
      ? dayConfig.bodyParts
      : [];

  return {
    plan: foundPlan || null,
    isRest: false,
    bodyParts,
    title,
  };
}
