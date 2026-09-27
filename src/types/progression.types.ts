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

export interface DimensionalProgress {
  dimension: 'strength' | 'endurance' | 'mobility' | 'consistency';
  label: string;
  score: number; // 10-100
  target: number;
  satisfied: boolean;
  unit?: string;
  description: string;
}

export interface DimensionHighlight {
  dimension: string;
  title: string;
  score: number;
  description: string;
  actionRecommendation: string;
}

export interface NextMilestoneRequirements {
  nextRankTier: RankTier;
  nextRankTitle: string;
  levelProgress: {
    current: number;
    required: number;
    percent: number;
  };
  relativeStrengthProgress?: {
    current: number;
    required: number;
    percent: number;
  };
  dimensions: DimensionalProgress[];
  summaryMessage: string;
}

export interface UnifiedProgressionStatus {
  currentLevel: number;
  currentLevelXp: number;
  xpRequiredForNextLevel: number;
  progressPercent: number;
  nominalRank: import('../config/progression.config').RankDefinition;
  effectiveRank: import('../config/progression.config').RankDefinition;
  rankDivision: number;
  confirmationStatus: 'CONFIRMED' | 'PROVISIONAL';
  verifiedSessionsCount: number;
  sessionsNeededForConfirmation: number;
  ascensionBlocked: boolean;
  blockedReasons: string[];
  attributes: CharacterAttributes;
  topStrength: DimensionHighlight;
  areaForImprovement: DimensionHighlight;
  nextMilestone: NextMilestoneRequirements;
  maxRelativeCompoundRatio?: number;
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
  unifiedStatus?: UnifiedProgressionStatus;
  isVerifiedSession?: boolean;
}
