export type MovementPattern = 
  | 'SQUAT' 
  | 'HINGE' 
  | 'PUSH_HORIZONTAL' 
  | 'PUSH_VERTICAL' 
  | 'PULL_HORIZONTAL' 
  | 'PULL_VERTICAL' 
  | 'CARRY' 
  | 'LUNGE' 
  | 'ISOLATION';

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
  | 'INITIATE' 
  | 'ADEPT' 
  | 'VANGUARD' 
  | 'CENTURION' 
  | 'SOVEREIGN' 
  | 'ASCENDANT';

export interface CharacterAttributes {
  strength: number;    // 1-100
  stamina: number;     // 1-100
  agility: number;     // 1-100
  discipline: number;  // 1-100
  vitality: number;    // 1-100
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  globalLevel: number;
  totalXp: number;
  rankTier: RankTier;
  rankDivision: number; // 1 - 4
  attributes: CharacterAttributes;
  currentStreak: number;
  longestStreak: number;
  streakFreezeTokens: number;
  lastWorkoutDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  userId: string;
  preferredUnit: 'kg' | 'lbs';
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  defaultRestSeconds: number;
  pushNotificationsEnabled: boolean;
  streakFreezeAutoUse: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  slug: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: EquipmentTier;
  movementPattern: MovementPattern;
  tier: ExerciseTier;
  instructions?: string;
  videoUrl?: string;
  isCustom: boolean;
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
  completedAt: string;
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
}

export interface ExerciseMastery {
  id: string;
  userId: string;
  exerciseId: string;
  masteryLevel: number; // 1-100
  masteryXp: number;
  estimated1RmKg: number;
  bestWeightKg: number;
  bestReps: number;
  bestVolumeKg: number;
  totalSessions: number;
  totalSets: number;
  totalReps: number;
  totalVolumeKg: number;
  recentPerformance: {
    date: string;
    weightKg: number;
    reps: number;
    estimated1RmKg: number;
  }[];
  lastTrainedAt: string | null;
}

export interface PersonalRecord {
  id: string;
  userId: string;
  exerciseId: string;
  prType: 'MAX_WEIGHT' | 'MAX_REPS' | 'MAX_VOLUME' | 'MAX_ESTIMATED_1RM';
  value: number;
  setLogId?: string | null;
  achievedAt: string;
}
