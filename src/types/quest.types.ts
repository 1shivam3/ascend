export type QuestType = 'DAILY' | 'WEEKLY' | 'CAMPAIGN';

export type QuestCategory =
  | 'WORKOUT_COUNT'
  | 'VOLUME_TOTAL'
  | 'FAILURE_SETS'
  | 'COMPOUND_SETS'
  | 'MASTERY_LEVEL'
  | 'HEAVY_COMPOUND'
  | 'TARGET_VOLUME'
  | 'TARGET_DISTANCE'
  | 'POWER_CONDITIONING'
  | 'CALISTHENICS_REPS';

export type QuestState = 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';

export interface Quest {
  id: string;
  title: string;
  description: string;
  type: QuestType;
  category: QuestCategory;
  targetValue: number;
  unit: string;
  xpReward: number;
  badgeVariant: 'cyan' | 'amber' | 'emerald' | 'violet';
  minLevelRequired?: number;
}

export interface UserQuestProgress {
  id: string;
  userId: string;
  questId: string;
  currentProgress: number;
  targetValue: number;
  completed: boolean;
  completedAt: string | null;
  lastResetDate: string;
  quest?: Quest;
  state?: QuestState;
}
