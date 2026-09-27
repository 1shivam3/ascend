export type MovementPattern = 
  | 'SQUAT' 
  | 'HINGE' 
  | 'PUSH_HORIZONTAL' 
  | 'PUSH_VERTICAL' 
  | 'PULL_HORIZONTAL' 
  | 'PULL_VERTICAL' 
  | 'CARRY' 
  | 'LUNGE' 
  | 'ISOLATION'
  | 'CARDIO'
  | 'ATHLETIC';

export type EquipmentTier = 
  | 'BARBELL' 
  | 'DUMBBELL' 
  | 'CABLE' 
  | 'MACHINE' 
  | 'BODYWEIGHT' 
  | 'KETTLEBELL' 
  | 'OTHER';

export type ExerciseTier = 
  | 'COMPOUND_PRIMARY' 
  | 'COMPOUND_SECONDARY' 
  | 'ACCESSORY' 
  | 'ISOLATION';

export type SetType = 
  | 'WARMUP' 
  | 'NORMAL' 
  | 'DROP' 
  | 'FAILURE';

export type RankTier = 
  | 'E' 
  | 'D' 
  | 'C' 
  | 'B' 
  | 'A' 
  | 'S' 
  | 'SS' 
  | 'SSS';

export interface CharacterAttributes {
  strength: number;    // 10-100 (Relative compound strength, 1RM/Wilks)
  endurance: number;   // 10-100 (Work capacity, rep volume, session density)
  mobility?: number;   // 10-100 (Mobility sessions, active recovery, full-ROM movement)
  consistency: number; // 10-100 (Calendar adherence, frequency, streak momentum)
  agility: number;     // 10-100 (Relative bodyweight strength, unilateral stability)

  // Backward-compatibility aliases for legacy UI/tests
  stamina: number;
  discipline: number;
  vitality: number;
}

export type PerformanceMetricType =
  | 'TESTED_1RM'
  | 'ESTIMATED_1RM'
  | 'BEST_WORKING_SET'
  | 'ENDURANCE_SET';

export type DataVerificationSource = 'VERIFIED_SESSION' | 'SELF_REPORTED';

export type RankConfirmationStatus = 'CONFIRMED' | 'PROVISIONAL';

export type PrimaryGoal =
  | 'BUILD_MUSCLE'
  | 'GET_STRONGER'
  | 'ATHLETIC_PERFORMANCE'
  | 'LOSE_FAT'
  | 'ENDURANCE'
  | 'GENERAL_FITNESS'
  | 'SPORT_PERFORMANCE'
  | 'CALISTHENICS'
  | 'MOBILITY'
  | 'COMBINATION'
  | 'CUSTOM';

export interface TrainingPreferences {
  daysPerWeek: number;
  sessionDurationMinutes: number;
  equipment: EquipmentTier[];
  trainingLocation: 'COMMERCIAL_GYM' | 'HOME_GYM' | 'OUTDOORS' | 'BODYWEIGHT_ONLY';
  preferredExerciseIds: string[];
  excludedExerciseIds: string[];
  limitations: string[];
  customGoalDescription?: string;
  sportName?: string;
}

import { AvatarConfig } from './avatar.types';

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarConfig?: AvatarConfig | null;
  goal: string;
  primaryGoal?: PrimaryGoal;
  primary_goal?: PrimaryGoal;
  secondaryGoals?: PrimaryGoal[];
  secondary_goals?: PrimaryGoal[];
  experience: string;
  age: number;
  heightCm: number;
  weightKg: number;
  trainingPreferences: TrainingPreferences;
  globalLevel: number;
  totalXp: number;
  rankTier: RankTier;
  rankDivision: number; // 1 - 4
  attributes: CharacterAttributes;
  currentStreak: number;
  longestStreak: number;
  streakFreezeTokens: number;
  lastWorkoutDate: string | null;
  isGuest: boolean;
  onboardingCompleted: boolean;
  authId?: string | null;
  friendCode?: string;
  activeTitle?: string | null;
  activeTitleId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface UserSettings {
  userId: string;
  preferredUnit: 'kg' | 'lbs';
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  defaultRestSeconds: number;
  pushNotificationsEnabled: boolean;
  streakFreezeAutoUse: boolean;
  themeMode?: ThemeMode;
}

export type ProgressionType =
  | 'BARBELL_COMPOUND'
  | 'DUMBBELL_COMPOUND'
  | 'MACHINE'
  | 'BODYWEIGHT'
  | 'WEIGHTED_BODYWEIGHT'
  | 'ISOLATION'
  | 'CARDIO'
  | 'ATHLETIC'
  | 'MOBILITY';

export type ExerciseDifficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface Exercise {
  id: string;
  name: string;
  slug: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: EquipmentTier;
  movementPattern: MovementPattern;
  tier: ExerciseTier;
  difficulty?: ExerciseDifficulty;
  progressionType?: ProgressionType;
  supports1Rm?: boolean;
  supportsRelativeStrength?: boolean;
  isBodyweight?: boolean;
  instructions?: string;
  commonMistakes?: string[];
  suitableAlternatives?: string[];
  videoUrl?: string;
  isCustom: boolean;
}

export interface ExercisePrescription {
  exercise_id: string;
  order: number;
  sets: number;
  target_reps: number | string;
  target_weight: number | null;
  rest_seconds: number;
  instructions?: string | null;
  alternatives?: string[];
}

export interface SetLog {
  id: string;
  exerciseLogId: string;
  userId: string;
  setNumber: number;
  setType: SetType;
  weightKg: number;
  reps: number;
  rpe: number | null;
  estimated1RmKg: number;
  isPr: boolean;
  completed: boolean;
  completedAt: string | null;
  isSkipped?: boolean;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  paceSecondsPerKm?: number | null;

  // Prompt schema aliases
  set_number?: number;
  target_reps?: number | string;
  actual_reps?: number;
  weight?: number;
  RPE?: number | null;
  completed_at?: string | null;
  target_weight?: number | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
  pace_seconds_per_km?: number | null;
}

export interface ExerciseLog {
  id: string;
  workoutId: string;
  exerciseId: string;
  userId: string;
  orderIndex: number;
  notes?: string;
  sets: SetLog[];
  exercise?: Exercise;
  prescription?: ExercisePrescription;
  supersetId?: string | null;
  supersetOrder?: number | null;
}

export interface WorkoutSession {
  id: string;
  userId: string;
  planId?: string | null;
  title: string;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number;
  totalVolumeKg: number;
  totalReps: number;
  totalSets: number;
  status: 'ACTIVE' | 'COMPLETED' | 'DISCARDED';
  xpEarned: number;
  notes?: string;
  exercises: ExerciseLog[];

  // Prompt schema aliases
  name?: string;
  goal?: string;
  difficulty?: string;
  duration?: number;
  started_at?: string;
  completed_at?: string | null;
}

export type Workout = WorkoutSession;

export interface ExerciseMastery {
  id: string;
  userId: string;
  exerciseId: string;
  masteryLevel: number; // 1-100+
  masteryXp: number;
  rank?: RankTier; // E, D, C, B, A, S, SS, SSS
  estimated1RmKg: number;
  bestWeightKg: number;
  bestReps: number;
  bestVolumeKg: number;
  relativeStrength?: number | null; // e.g. 1.67 for 1.67x bodyweight
  totalSessions: number;
  totalSets: number;
  totalReps: number;
  totalVolumeKg: number;
  personalRecordsCount?: number;
  milestonesUnlockedCount?: number;
  recentPerformance: {
    date: string;
    weightKg: number;
    reps: number;
    estimated1RmKg: number;
    distanceMeters?: number;
    durationSeconds?: number;
  }[];
  lastTrainedAt: string | null;

  trend?: 'IMPROVING' | 'MAINTAINING' | 'REGRESSING' | 'NEW';
  xpToNextLevel?: number;
  bestDistanceMeters?: number;
  bestDurationSeconds?: number;
  bestPaceSecondsPerKm?: number;
  totalDistanceMeters?: number;
  totalDurationSeconds?: number;

  // Schema aliases matching direct SQL table definitions
  user_id?: string;
  exercise_id?: string;
  mastery_level?: number;
  mastery_xp?: number;
  xp_to_next_level?: number;
  estimated_1rm?: number;
  best_weight?: number;
  best_reps?: number;
  best_volume?: number;
  total_volume?: number;
  total_sessions?: number;
  last_performed_at?: string | null;
  relative_strength?: number | null;
  personal_records_count?: number;
  milestones_unlocked?: number;
  best_distance_meters?: number;
  best_duration_seconds?: number;
  best_pace_seconds_per_km?: number;
  total_distance_meters?: number;
  total_duration_seconds?: number;
}

export type PrType =
  | 'MAX_WEIGHT'
  | 'MAX_REPS'
  | 'MAX_VOLUME'
  | 'MAX_ESTIMATED_1RM'
  | 'HEAVIEST_WEIGHT'
  | 'MOST_REPS'
  | 'BEST_ESTIMATED_1RM'
  | 'HIGHEST_VOLUME'
  | 'BEST_DISTANCE'
  | 'BEST_PACE'
  | 'LONGEST_DURATION'
  | 'TESTED_1RM'
  | 'ESTIMATED_1RM'
  | 'BEST_WORKING_SET'
  | 'REPETITION_PR'
  | 'VOLUME_PR';

export type CategorizedPrCategory =
  | 'TESTED_1RM'
  | 'ESTIMATED_1RM'
  | 'BEST_WORKING_SET'
  | 'REPETITION_PR'
  | 'VOLUME_PR';

export interface PersonalRecord {
  id: string;
  userId: string;
  exerciseId: string;
  prType: PrType;
  value: number;
  setLogId?: string | null;
  achievedAt: string;
}

export type MilestoneMetric = 'BEST_E1RM' | 'BEST_WEIGHT' | 'TOTAL_VOLUME' | 'SESSION_COUNT';

export interface ExerciseMilestone {
  id: string;
  exerciseId: string;
  metric: MilestoneMetric;
  threshold: number;
  rewardXp: number;
  title: string;
  description: string;
  createdAt?: string;
}

export interface UserExerciseMilestone {
  id: string;
  userId: string;
  milestoneId: string;
  exerciseId: string;
  unlockedAt: string;
  xpAwarded: number;
  createdAt?: string;
  milestone?: ExerciseMilestone;
}

export type TemplateSplitType = 'PUSH' | 'PULL' | 'LEGS' | 'UPPER' | 'LOWER' | 'FULL_BODY' | 'CUSTOM';

export interface WorkoutTemplateExercise {
  id: string;
  templateId: string;
  exerciseId: string;
  orderIndex: number;
  targetSets: number;
  targetReps: number | string;
  targetWeightKg: number | null;
  targetRpe?: number | null;
  restSeconds: number;
  supersetId?: string | null;
  notes?: string | null;
  createdAt?: string;
  exercise?: Exercise;
}

export interface WorkoutTemplate {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  splitType: TemplateSplitType;
  folder?: string | null;
  isPreset: boolean;
  estimatedDurationMin: number;
  createdAt: string;
  updatedAt: string;
  exercises: WorkoutTemplateExercise[];
}

