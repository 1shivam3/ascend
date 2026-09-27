export type TitleCategory =
  | 'STRENGTH'
  | 'CONSISTENCY'
  | 'CHALLENGE'
  | 'PROGRESSION'
  | 'MOBILITY'
  | 'MASTERY';

export type TitleRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export type TitleRequirementType =
  | 'WORKOUT_COUNT'
  | 'STRENGTH_RATIO'
  | 'STREAK_DAYS'
  | 'MOBILITY_SCORE'
  | 'MOBILITY_WORKOUTS'
  | 'CHALLENGES_COMPLETED'
  | 'LEVEL_REACHED'
  | 'RANK_TIER'
  | 'LIFETIME_VOLUME_KG';

export interface TitleDefinition {
  id: string;
  name: string;
  description: string;
  unlockConditionText: string;
  category: TitleCategory;
  rarity: TitleRarity;
  icon: string; // Ionicons name
  requirementType: TitleRequirementType;
  requirementThreshold: number;
  requirementMeta?: {
    exerciseId?: string;
    exerciseName?: string;
    minRankTier?: string;
    minLevel?: number;
  };
}

export interface UserTitle {
  id: string;
  userId: string;
  titleId: string;
  unlockedAt: string;
  isActive: boolean;
  definition?: TitleDefinition;
}

export interface TitleEvaluationContext {
  userId: string;
  totalWorkouts: number;
  currentStreak: number;
  longestStreak: number;
  maxRelativeStrength: number;
  mobilityScore: number;
  mobilityWorkoutsCount: number;
  completedChallengesCount: number;
  globalLevel: number;
  rankTier: string;
  totalVolumeKg: number;
  // Specific exercises best relative strength (e.g. bench, squat, deadlift)
  exerciseRelativeStrengths?: Record<string, number>;
}
