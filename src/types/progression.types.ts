import { CharacterAttributes, RankTier } from './domain.types';

export interface LevelInfo {
  level: number;
  currentLevelXp: number;
  xpRequiredForNextLevel: number;
  progressPercent: number;
}

export interface MasteryLevelInfo {
  level: number;
  masteryTierTitle: string;
  currentLevelXp: number;
  xpRequiredForNextLevel: number;
  progressPercent: number;
}

export interface WorkoutProgressionResult {
  xpEarned: number;
  newTotalXp: number;
  oldGlobalLevel: number;
  newGlobalLevel: number;
  didLevelUp: boolean;
  newRank: {
    tier: RankTier;
    division: number;
  };
  attributesDelta: CharacterAttributes;
  newAttributes: CharacterAttributes;
  exerciseMasteryUpdates: {
    exerciseId: string;
    exerciseName: string;
    xpEarned: number;
    oldLevel: number;
    newLevel: number;
    didLevelUp: boolean;
    new1RmKg: number;
    prsBroken: {
      type: 'MAX_WEIGHT' | 'MAX_REPS' | 'MAX_VOLUME' | 'MAX_ESTIMATED_1RM';
      value: number;
    }[];
  }[];
  prsBrokenCount: number;
  streakUpdated: {
    currentStreak: number;
    longestStreak: number;
    isMilestone: boolean;
  };
}
