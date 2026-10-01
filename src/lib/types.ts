export type Gender = 'male' | 'female';
export type Unit = 'kg' | 'lbs';
export type Theme = 'dark' | 'light';

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

