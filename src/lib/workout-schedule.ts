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

/**
 * Constructs an intelligent default weekly schedule based on available planned workouts and days per week.
 */
export function buildDefaultWeeklySchedule(
  plans: PlannedWorkout[],
  daysPerWeek: number = 4
): WeeklySchedule {
  const schedule: WeeklySchedule = {
    monday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    tuesday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    wednesday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    thursday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    friday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    saturday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
    sunday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
  };

  if (!plans || plans.length === 0) {
    return schedule;
  }

  const getPlanConfig = (plan: PlannedWorkout): DayScheduleConfig => ({
    workoutPlanId: plan.id,
    customTitle: plan.name,
    bodyParts: getWorkoutBodyParts(plan.exercises),
  });

  // 4-Day Upper / Lower (Mon/Tue/Thu/Fri)
  if (daysPerWeek === 4 || plans.length === 4) {
    schedule.monday = getPlanConfig(plans[0]);
    schedule.tuesday = getPlanConfig(plans[1] || plans[0]);
    schedule.wednesday = { workoutPlanId: 'rest', customTitle: 'Rest & Recovery', bodyParts: [] };
    schedule.thursday = getPlanConfig(plans[2] || plans[0]);
    schedule.friday = getPlanConfig(plans[3] || plans[1] || plans[0]);
    schedule.saturday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    schedule.sunday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    return schedule;
  }

  // 3-Day Full Body or Push/Pull/Legs (Mon/Wed/Fri)
  if (daysPerWeek === 3 || plans.length === 3) {
    schedule.monday = getPlanConfig(plans[0]);
    schedule.tuesday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    schedule.wednesday = getPlanConfig(plans[1] || plans[0]);
    schedule.thursday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    schedule.friday = getPlanConfig(plans[2] || plans[0]);
    schedule.saturday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    schedule.sunday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    return schedule;
  }

  // 5-Day Split (Mon-Fri)
  if (daysPerWeek === 5 || plans.length === 5) {
    schedule.monday = getPlanConfig(plans[0]);
    schedule.tuesday = getPlanConfig(plans[1] || plans[0]);
    schedule.wednesday = getPlanConfig(plans[2] || plans[0]);
    schedule.thursday = getPlanConfig(plans[3] || plans[0]);
    schedule.friday = getPlanConfig(plans[4] || plans[1] || plans[0]);
    schedule.saturday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    schedule.sunday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    return schedule;
  }

  // 6-Day Split (Mon-Sat)
  if (daysPerWeek === 6 || plans.length >= 6) {
    schedule.monday = getPlanConfig(plans[0]);
    schedule.tuesday = getPlanConfig(plans[1] || plans[0]);
    schedule.wednesday = getPlanConfig(plans[2] || plans[0]);
    schedule.thursday = getPlanConfig(plans[3] || plans[0]);
    schedule.friday = getPlanConfig(plans[4] || plans[1] || plans[0]);
    schedule.saturday = getPlanConfig(plans[5] || plans[2] || plans[0]);
    schedule.sunday = { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] };
    return schedule;
  }

  // Fallback: assign plans sequentially to weekdays
  const weekdays: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  for (let i = 0; i < Math.min(daysPerWeek, weekdays.length); i++) {
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

  const foundPlan = plans.find((p) => p.id === dayConfig.workoutPlanId);
  const title = dayConfig.customTitle || foundPlan?.name || 'Workout';
  const bodyParts =
    dayConfig.bodyParts && dayConfig.bodyParts.length > 0
      ? dayConfig.bodyParts
      : foundPlan
      ? getWorkoutBodyParts(foundPlan.exercises)
      : [];

  return {
    plan: foundPlan || null,
    isRest: false,
    bodyParts,
    title,
  };
}
