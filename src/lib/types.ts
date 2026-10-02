export type Gender = 'male' | 'female';
export type Unit = 'kg' | 'lbs';
export type Theme = 'dark' | 'light';

export type AthleteGoal = 'build_muscle' | 'get_stronger' | 'lose_fat' | 'stamina' | 'general_fitness';

export interface AthleteGoalConfig {
  id: AthleteGoal;
  label: string;
  tagline: string;
  trainingEmphasis: string;
  nutritionEmphasis: string;
  defaultRepRange: { min: number; max: number };
  defaultRestSeconds: number;
}

export const ATHLETE_GOAL_CONFIGS: Record<AthleteGoal, AthleteGoalConfig> = {
  build_muscle: {
    id: 'build_muscle',
    label: 'Build Muscle',
    tagline: 'Hypertrophy volume, exercise selection, progressive overload',
    trainingEmphasis: 'Moderate-to-high rep brackets (8–12 reps), high set volume, hypertrophy progressive overload',
    nutritionEmphasis: 'Lean surplus (+250 kcal), optimal protein (1.8g/kg) to fuel muscle protein synthesis',
    defaultRepRange: { min: 8, max: 12 },
    defaultRestSeconds: 90,
  },
  get_stronger: {
    id: 'get_stronger',
    label: 'Get Stronger',
    tagline: 'Compound lifts, RPE, strength progression, PRs',
    trainingEmphasis: 'Heavy compound singles/triples (3–6 reps), velocity maintenance, 1RM milestones & DOTS tracking',
    nutritionEmphasis: 'Maintenance to slight surplus (+150 kcal), high complex carbohydrates for CNS and glycogen stores',
    defaultRepRange: { min: 3, max: 6 },
    defaultRestSeconds: 150,
  },
  lose_fat: {
    id: 'lose_fat',
    label: 'Lose Fat',
    tagline: 'Calorie target, weight trend, resistance training, activity',
    trainingEmphasis: 'Preserve heavy mechanical tension to spare lean mass while maintaining training density',
    nutritionEmphasis: 'Moderate deficit (-450 kcal), elevated protein (2.0–2.2g/kg) to prevent muscle breakdown',
    defaultRepRange: { min: 6, max: 10 },
    defaultRestSeconds: 75,
  },
  stamina: {
    id: 'stamina',
    label: 'Improve Fitness / Stamina',
    tagline: 'Conditioning, work capacity, cardio progression',
    trainingEmphasis: 'High density sets (12–15+ reps), supersets, shorter rest timers to elevate aerobic capacity',
    nutritionEmphasis: 'Maintenance calories, balanced hydration, electrolyte replenishment, and sustained energy carbs',
    defaultRepRange: { min: 12, max: 15 },
    defaultRestSeconds: 60,
  },
  general_fitness: {
    id: 'general_fitness',
    label: 'General Fitness',
    tagline: 'Balanced strength + conditioning',
    trainingEmphasis: 'Well-rounded strength, joint longevity, functional movements, and sustainable routine adherence',
    nutritionEmphasis: 'Nutritious whole-food baseline, consistent hydration, and balanced macros (~1.6g/kg protein)',
    defaultRepRange: { min: 6, max: 10 },
    defaultRestSeconds: 90,
  },
};

export type OverallTitle =
  | 'INITIATE'
  | 'FORGED'
  | 'ADEPT'
  | 'VANGUARD'
  | 'ELITE'
  | 'ASCENDANT'
  | 'APEX'
  | 'TRANSCENDENT'
  | 'TITAN'
  | 'IMMORTAL';

export type ExerciseRank =
  | 'FOUNDATION'
  | 'TRAINED'
  | 'SKILLED'
  | 'ADVANCED'
  | 'ELITE'
  | 'MASTER'
  | 'GRANDMASTER';

export interface BodyMetricEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
  heightCm?: number;
  notes?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  gender: Gender;
  bodyweightKg: number;
  bodyweightLbs: number;
  heightCm?: number;
  unit: Unit;
  createdAt: string;
  goals?: AthleteGoal[];
}

export interface PersonalRecord {
  id: string;
  exercise: string;
  weightKg: number;
  weightLbs: number;
  reps: number;
  oneRepMax: number;
  date: string;
  notes?: string;
  isBaseline?: boolean;
}

export interface WorkoutSet {
  reps: number;
  weight: number;
  unit: Unit;
  completed?: boolean;
  rpe?: number;
  isPR?: boolean;
}

export interface WorkoutExercise {
  name: string;
  sets: WorkoutSet[];
  notes?: string;
}

export interface WorkoutEntry {
  id: string;
  date: string; // YYYY-MM-DD
  name?: string;
  durationMinutes?: number;
  exercises: WorkoutExercise[];
}

export interface FoodItem {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  quantity?: number;
  unit?: string;
}

export interface MealEntry {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  foods: FoodItem[];
}

export interface MacroTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export type EquipmentType = 'barbell' | 'dumbbell' | 'cable' | 'bodyweight' | 'machine' | 'other';

export interface LiftLevel {
  exercise: string;
  level: number;
  title: string;
  ratio: number;
  category: ExerciseRank;
  rank: ExerciseRank;
  equipment?: EquipmentType;
}

export interface OverallLevel {
  level: number;
  title: OverallTitle;
  averageRatio: number;
  isMainLiftsOnly?: boolean;
  mainLiftsCount?: number;
}

export interface MacroGoals {
  calories: number;
  proteinG: number;
  carbsG?: number;
  fatG?: number;
}

export interface PlannedExercise {
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeight?: number;
  targetUnit?: Unit;
  notes?: string;
}

export interface PlannedWorkout {
  id: string;
  name: string;
  exercises: PlannedExercise[];
  createdAt: string;
}

export interface FavoriteFood {
  id: string;
  name: string;
  defaultQuantity?: number;
  unit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  barcode?: string;
  notes?: string;
}

export type DayType = 'training' | 'rest';

export interface HydrationConfig {
  baseMl?: number;
  dailyTargetMl: number;
  activityBonusMl: number;
  climateAdjustmentMl?: number;
  isCustomTarget?: boolean;
}

export interface WaterLogBatch {
  id: string;
  amountMl: number;
  timestamp: string; // ISO string
}

export interface CreatineLog {
  taken: boolean;
  amountG: number;
  timestamp?: string; // ISO string
}

export interface CreatineConfig {
  dailyTargetG: number;
  reminderTime?: string;
  enabled: boolean;
}

export interface CreatineSupply {
  containerG: number;
  currentAmountG: number;
  lastUpdated: string; // YYYY-MM-DD
}

export interface DailyTimelineEvent {
  id: string;
  time: string; // "HH:MM"
  type: 'workout' | 'creatine' | 'water' | 'meal' | 'weight';
  title: string;
  detail?: string;
  completed: boolean;
}

export interface AICoachInsight {
  date: string; // YYYY-MM-DD
  source: 'gemini' | 'offline_heuristic';
  volumeTrend: string;
  recoveryStatus: string;
  tacticalAdvice: string;
  fatigueWarning?: string;
  timestamp: string;
}

export interface AITrainingProfile {
  goal: 'muscle_gain' | 'strength' | 'fat_loss' | 'general_fitness';
  experience: 'beginner' | 'intermediate' | 'advanced';
  daysPerWeek: number;
  preferredDurationMin: number;
  equipment: 'full_gym' | 'home_dumbbells' | 'bodyweight_only' | 'barbell_only';
  preferredSplit: 'push_pull_legs' | 'upper_lower' | 'full_body' | 'bro_split';
  dislikedExercises: string[];
  injuriesOrLimitations: string[];
  coachingStyle: 'concise' | 'balanced' | 'detailed';
}

export interface AIPlannedExercise {
  exercise: string;
  sets: number;
  reps: string;
  targetWeightKg: number;
  restSeconds: number;
  reason: string;
}

export interface AIPlannedWorkout {
  id: string;
  date: string; // YYYY-MM-DD
  workoutName: string;
  estimatedDurationMin: number;
  focus: string;
  whyThisWorkout: string;
  exercises: AIPlannedExercise[];
  source: 'gemini' | 'offline_deterministic';
  createdAt: string;
}

export interface AISubstitutionResult {
  originalExercise: string;
  replacementExercise: string;
  reason: string;
  movementPattern: string;
  targetWeightKg?: number;
  targetReps?: string;
  targetSets?: number;
}

export interface AIWorkoutCommandResult {
  actionType: 'SHORTEN_TIME' | 'SWAP_EQUIPMENT' | 'DELOAD_INTENSITY' | 'WEIGHT_ADVICE' | 'CUSTOM';
  summary: string;
  coachAdvice: string;
  modifiedExercises?: AIPlannedExercise[];
}

export interface AIPostWorkoutTake {
  headline: string;
  volumeVsLastWeek: string;
  keyAchievements: string[];
  nextSessionTarget: string;
  source: 'gemini' | 'offline_heuristic';
}

export interface AIWeeklyReview {
  id: string;
  date: string; // YYYY-MM-DD
  weekSummary: string;
  workoutsCompleted: number;
  plannedDaysPerWeek: number;
  strengthHighlight: string;
  habitInsight: string;
  focusNextWeek: string;
  source: 'gemini' | 'offline_heuristic';
  createdAt: string;
}

// ── Photo AI Meal Scanner Types ──────────────────────────────────────────────

export interface ScannedFoodItem {
  name: string;
  quantity: string;
  estimatedGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: 'high' | 'medium' | 'low';
  preparation?: string;
  notes?: string;
}

export interface MealAnalysisResult {
  mealName: string;
  items: ScannedFoodItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  hiddenIngredients?: string[];
  confidence: 'high' | 'medium' | 'low';
  coachingNote?: string;
  timestamp?: string;
  imageUrl?: string;
}

// ─── Lifter Twin & Adaptive Training Ledger Types ───────────────────────────

export type TrainingDecisionReason =
  | 'exceeded_rpe'
  | 'missed_reps'
  | 'progressive_overload'
  | 'rpe_drift'
  | 'fatigue_hold'
  | 'time_constraint'
  | 'equipment_unavailable'
  | 'low_readiness'
  | 'user_override';

export interface TrainingDecision {
  id: string;
  exerciseName: string;
  date: string; // YYYY-MM-DD
  programIntent: 'strength' | 'hypertrophy' | 'technique' | 'readiness_adaptation' | 'progressive_overload';
  previousPerformance: {
    weight: number;
    reps: number;
    rpe?: number;
    sets: number;
  };
  nextPrescription: {
    weight: number;
    reps: number;
    targetRpe: number;
    sets: number;
  };
  expectedRpe: number;
  actualExecution?: {
    weight: number;
    reps: number;
    actualRpe: number;
    completedSets: number;
  };
  predictionError?: number; // actualRpe - expectedRpe (e.g. +0.5 RPE)
  reasonType: TrainingDecisionReason;
  headline: string;
  explanation: string;
  deltaKg: number;
  deltaPercent: number;
  confidence: 'high' | 'established' | 'early_signal' | 'calibrating' | 'medium';
  evidenceCount: number;
  status: 'pending' | 'accepted' | 'overridden';
  userOverrideWeight?: number;
  timestamp: string;
}

export type LifterConfidenceTier = 'calibrating' | 'early_signal' | 'established' | 'high_confidence';

export interface LifterExerciseProfile {
  exerciseName: string;
  evidenceCount: number;
  confidenceTier: LifterConfidenceTier;
  calibrationStatus?: 'calibrating' | 'early_trend' | 'calibrated'; // legacy compatibility
  bestSupportedRepRange: { min: number; max: number };
  optimalRepRange?: { min: number; max: number }; // legacy compatibility
  targetRpeRange: { min: number; max: number };
  withinSessionEffortDrift: 'low' | 'moderate' | 'high';
  fatigueSensitivity?: 'low' | 'moderate' | 'high'; // legacy compatibility
  rpeDriftPerSet: number; // e.g. +0.3 RPE / set
  observedWeeklyFrequencyRange: { min: number; max: number }; // e.g. 1-2x/week (honest integer range)
  recommendedWeeklyFrequency?: number; // legacy compatibility
  bestProgressionStepKg: number; // e.g. 2.5
  observedRecoveryIntervalDays: { min: number; max: number }; // e.g. 3-5 days
  recoveryDaysNeeded?: number; // legacy compatibility
  e1RMTrend: 'rising' | 'stable' | 'fatigued' | 'plateau';
  averagePredictionError?: number; // e.g. ±0.4 RPE
  observations: string[]; // transparent empirical evidence statements
}

export interface LifterTwinProfile {
  totalAnalyzedExposures: number;
  exercises: Record<string, LifterExerciseProfile>;
  lastUpdated: string;
}

export interface RealWorldConstraint {
  type: 'time' | 'equipment' | 'readiness' | 'fatigue';
  availableMinutes?: number;
  targetExerciseName?: string;
  substituteExerciseName?: string;
  readinessOption?: 'reduce_volume' | 'cap_rpe' | 'maintain_load';
  notes?: string;
}

