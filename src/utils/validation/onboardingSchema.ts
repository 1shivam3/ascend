import { z } from 'zod';
import { EquipmentTier, PrimaryGoal } from '../../types/domain.types';

export const PRIMARY_GOALS = [
  'BUILD_MUSCLE',
  'GET_STRONGER',
  'ATHLETIC_PERFORMANCE',
  'LOSE_FAT',
  'ENDURANCE',
  'GENERAL_FITNESS',
  'SPORT_PERFORMANCE',
  'CALISTHENICS',
  'CUSTOM',
] as const;

export const ATHLETIC_GOALS = [
  'BUILD_STRENGTH',
  'HYPERTROPHY',
  'ATHLETICISM',
  'FAT_LOSS',
  'ENDURANCE',
] as const;

export const ALL_GOALS = [
  ...PRIMARY_GOALS,
  ...ATHLETIC_GOALS,
] as const;

export type AthleticGoal = (typeof ATHLETIC_GOALS)[number];

export function normalizeGoal(goal: string): PrimaryGoal {
  switch (goal) {
    case 'BUILD_STRENGTH':
      return 'GET_STRONGER';
    case 'HYPERTROPHY':
      return 'BUILD_MUSCLE';
    case 'ATHLETICISM':
      return 'ATHLETIC_PERFORMANCE';
    case 'FAT_LOSS':
      return 'LOSE_FAT';
    case 'ENDURANCE':
      return 'ENDURANCE';
    case 'BUILD_MUSCLE':
    case 'GET_STRONGER':
    case 'ATHLETIC_PERFORMANCE':
    case 'LOSE_FAT':
    case 'GENERAL_FITNESS':
    case 'SPORT_PERFORMANCE':
    case 'CALISTHENICS':
    case 'CUSTOM':
      return goal as PrimaryGoal;
    default:
      return 'GET_STRONGER';
  }
}

export const TRAINING_EXPERIENCES = [
  'NOVICE',
  'INTERMEDIATE',
  'ADVANCED',
  'ELITE',
] as const;

export type TrainingExperience = (typeof TRAINING_EXPERIENCES)[number];

export const TRAINING_LOCATIONS = [
  'COMMERCIAL_GYM',
  'HOME_GYM',
  'OUTDOORS',
  'BODYWEIGHT_ONLY',
] as const;

export type TrainingLocation = (typeof TRAINING_LOCATIONS)[number];

export const VALID_EQUIPMENT: EquipmentTier[] = [
  'BARBELL',
  'DUMBBELL',
  'CABLE',
  'MACHINE',
  'BODYWEIGHT',
  'KETTLEBELL',
  'OTHER',
];

// Unit conversion helpers
export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { feet, inches };
}

export function ftInToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * 2.54);
}

export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

export function lbsToKg(lbs: number): number {
  return Math.round((lbs / 2.20462) * 10) / 10;
}

// Granular Zod schemas
export const ageSchema = z
  .number({ invalid_type_error: 'Age must be a valid number' })
  .int('Age must be a whole number')
  .min(13, 'Age must be at least 13 years')
  .max(100, 'Age must be 100 years or less');

export const heightCmSchema = z
  .number({ invalid_type_error: 'Height must be a valid number' })
  .min(100, "Height must be at least 100 cm (3'3\")")
  .max(250, "Height must be 250 cm (8'2\") or less");

export const weightKgSchema = z
  .number({ invalid_type_error: 'Weight must be a valid number' })
  .min(30, 'Weight must be at least 30 kg (66 lbs)')
  .max(350, 'Weight must be 350 kg (770 lbs) or less');

export const goalSchema = z.enum(ALL_GOALS, {
  errorMap: () => ({ message: 'Please select a valid athletic directive/goal' }),
});

export const primaryGoalSchema = z.enum(PRIMARY_GOALS, {
  errorMap: () => ({ message: 'Please select a valid primary training goal' }),
});

export const secondaryGoalsSchema = z.array(z.enum(PRIMARY_GOALS)).default([]);

export const experienceSchema = z.enum(TRAINING_EXPERIENCES, {
  errorMap: () => ({ message: 'Please select your training experience tier' }),
});

export const frequencySchema = z
  .number({ invalid_type_error: 'Training days must be a number' })
  .int('Training days must be a whole number')
  .min(2, 'Select at least 2 training days per week')
  .max(6, 'Training days cannot exceed 6 days per week to ensure adequate recovery');

export const durationSchema = z
  .number({ invalid_type_error: 'Session duration must be a number' })
  .int('Session duration must be a whole number')
  .min(20, 'Session duration must be at least 20 minutes')
  .max(180, 'Session duration cannot exceed 180 minutes');

export const equipmentSchema = z
  .array(z.string())
  .min(1, 'Select at least 1 equipment type or bodyweight');

export const locationSchema = z.enum(TRAINING_LOCATIONS, {
  errorMap: () => ({ message: 'Please select your primary training location' }),
});

export const usernameSchema = z
  .string({ required_error: 'Call-sign is required' })
  .trim()
  .min(3, 'Call-sign must be at least 3 characters')
  .max(20, 'Call-sign cannot exceed 20 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Call-sign can only contain letters, numbers, and underscores');

// Complete Onboarding Data Schema
export const onboardingSchema = z.object({
  goal: goalSchema,
  primaryGoal: primaryGoalSchema.optional(),
  primary_goal: primaryGoalSchema.optional(),
  secondaryGoals: secondaryGoalsSchema.optional().default([]),
  secondary_goals: secondaryGoalsSchema.optional().default([]),
  customGoalDescription: z.string().optional(),
  sportName: z.string().optional(),
  age: ageSchema,
  heightCm: heightCmSchema,
  weightKg: weightKgSchema,
  experience: experienceSchema,
  daysPerWeek: frequencySchema,
  sessionDurationMinutes: durationSchema,
  equipment: equipmentSchema,
  trainingLocation: locationSchema,
  preferredExerciseIds: z.array(z.string()).default([]),
  excludedExerciseIds: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  username: usernameSchema,
  avatarUrl: z.string().default('⚔️'),
});

export type OnboardingData = z.infer<typeof onboardingSchema>;

// Quick validators returning { isValid, error, value }
export function validateField<T>(
  schema: z.ZodType<T>,
  value: unknown
): { isValid: boolean; error?: string; data?: T } {
  const result = schema.safeParse(value);
  if (result.success) {
    return { isValid: true, data: result.data };
  }
  return { isValid: false, error: result.error.errors[0]?.message || 'Invalid input' };
}
