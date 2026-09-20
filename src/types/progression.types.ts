import { CharacterAttributes, RankTier, PrType } from './domain.types';
import { UserQuestProgress } from './quest.types';

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
  xpToNextLevel?: number;
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
    oldRank?: RankTier;
    newRank?: RankTier;
    didRankUp?: boolean;
    relativeStrength?: number | null;
    new1RmKg: number;
    prsBroken: {
      type: PrType;
      value: number;
    }[];
    unlockedMilestones?: {
      id: string;
      title: string;
      rewardXp: number;
    }[];
  }[];
  prsBrokenCount: number;
  streakUpdated: {
    currentStreak: number;
    longestStreak: number;
    isMilestone: boolean;
  };
  questsUpdated?: UserQuestProgress[];
  completedQuests?: UserQuestProgress[];
  newlyUnlockedAchievements?: import('../config/achievements.config').AchievementConfig[];
}
