import { z } from 'zod';
import { EquipmentTier } from '../../types/domain.types';

export const GenerationInputSchema = z.object({
  goal: z.string().default('STRENGTH'),
  primary_goal: z.string().optional(),
  secondary_goals: z.array(z.string()).optional(),
  custom_goal_description: z.string().optional(),
  sport_name: z.string().optional(),
  age: z.number().int().min(12).max(100).default(25),
  height: z.number().min(80).max(250).default(175), // in cm
  weight: z.number().min(30).max(300).default(75), // in kg
  experience: z.string().default('INTERMEDIATE'),
  days_per_week: z.number().int().min(1).max(7).default(4),
  session_duration: z.number().int().min(15).max(180).default(60), // in minutes
  equipment: z.array(z.string()).default(['BARBELL', 'DUMBBELL', 'CABLE', 'MACHINE', 'BODYWEIGHT']),
  training_location: z.string().default('COMMERCIAL_GYM'),
  preferred_exercises: z.array(z.string()).default([]),
  excluded_exercises: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
});

export type GenerationInput = z.infer<typeof GenerationInputSchema>;

export const AIExercisePrescriptionSchema = z.object({
  exercise_id: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int().min(0),
  sets: z.number().int().min(1).max(10),
  target_reps: z.union([z.number().int().min(1).max(100), z.string().min(1)]),
  target_rpe: z.number().min(5).max(10).nullable().optional(),
  rest_seconds: z.number().int().min(15).max(360).default(90),
  instructions: z.string().nullable().optional(),
  alternatives: z.array(z.string()).default([]),
  target_distance_meters: z.number().nullable().optional(),
  target_duration_seconds: z.number().nullable().optional(),
  target_pace_seconds_per_km: z.number().nullable().optional(),
});

export type AIExercisePrescription = z.infer<typeof AIExercisePrescriptionSchema>;

export const AIWorkoutDaySchema = z.object({
  day_number: z.number().int().min(1).max(7),
  name: z.string().min(1),
  focus: z.string().min(1),
  estimated_duration_min: z.number().int().min(15).max(180),
  exercises: z.array(AIExercisePrescriptionSchema).min(1),
});

export type AIWorkoutDay = z.infer<typeof AIWorkoutDaySchema>;

export const AIWorkoutPlanSchema = z.object({
  id: z.string().min(1).default(() => `plan-${Date.now()}`),
  name: z.string().min(1),
  split_type: z.string().min(1),
  days_per_week: z.number().int().min(1).max(7),
  difficulty: z.string().default('INTERMEDIATE'),
  weekly_structure: z.string().min(1),
  progression_suggestions: z.string().min(1),
  days: z.array(AIWorkoutDaySchema).min(1),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type AIWorkoutPlan = z.infer<typeof AIWorkoutPlanSchema>;

export const FeedbackTypeSchema = z.enum(['TOO_EASY', 'GOOD', 'TOO_HARD']);
export type FeedbackType = z.infer<typeof FeedbackTypeSchema>;

export const AdaptationActionSchema = z.enum([
  'REGENERATE_WORKOUT',
  'REPLACE_EXERCISE',
  'CHANGE_DIFFICULTY',
  'HOME_WORKOUT',
  'NO_EQUIPMENT',
]);
export type AdaptationAction = z.infer<typeof AdaptationActionSchema>;
