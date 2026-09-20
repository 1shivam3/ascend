import { RankTier } from './domain.types';

export type ChallengeType =
  | 'WORKOUT_COUNT'
  | 'XP_EARNED'
  | 'TRAINING_VOLUME'
  | 'STEPS'
  | 'DISTANCE'
  | 'CARDIO_DURATION'
  | 'SPECIFIC_EXERCISE'
  | 'GOAL_METRIC'
  | 'SYSTEM'
  | 'COMMUNITY'
  | 'SQUAD'
  | 'DUEL'
  | 'USER_CREATED';

export type ChallengeMetric =
  | 'WORKOUTS'
  | 'XP'
  | 'VOLUME_KG'
  | 'STEPS'
  | 'DISTANCE_KM'
  | 'DURATION_MINUTES'
  | 'EXERCISE_VOLUME_KG'
  | 'EXERCISE_REPS'
  | 'DAYS_ACTIVE'
  | 'SESSIONS';

export type ChallengeVisibility = 'PUBLIC' | 'FRIENDS' | 'PRIVATE' | 'GROUP';

export type ChallengeStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';

export type ParticipantStatus = 'ACTIVE' | 'COMPLETED' | 'LEFT';

export interface ChallengeConfig {
  exerciseId?: string;
  exerciseName?: string;
  minWeightKg?: number;
  minDurationMinutes?: number;
  targetSplit?: string;
  targetGoal?: string;
  allowedSquadIds?: string[];
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  type: ChallengeType;
  metric: ChallengeMetric;
  target: number;
  startAt: string; // ISO
  endAt: string;   // ISO
  visibility: ChallengeVisibility;
  createdBy: string; // userId or 'SYSTEM'
  status: ChallengeStatus;
  config?: ChallengeConfig;
  rewardXp?: number;
  participantsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChallengeParticipant {
  id: string;
  challengeId: string;
  userId: string;
  progress: number;
  rank: number;
  status: ParticipantStatus;
  joinedAt: string;
  completedAt: string | null;
  lastUpdatedAt: string;
  user?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    friendCode?: string;
    rankTier?: RankTier;
    rankDivision?: number;
    globalLevel?: number;
  };
}

export interface ChallengeLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  rankTier: RankTier;
  rankDivision: number;
  globalLevel: number;
  progress: number;
  target: number;
  percentage: number;
  isCompleted: boolean;
  completedAt: string | null;
  isCurrentUser: boolean;
}

export interface ChallengeEventPayload {
  eventId: string; // e.g. workout ID, daily step ID, cardio session ID
  eventType: 'WORKOUT' | 'CARDIO' | 'STEPS' | 'XP';
  timestamp: string;
  // Athletic metrics
  volumeKg?: number;
  durationMinutes?: number;
  distanceKm?: number;
  stepsCount?: number;
  xpEarned?: number;
  exerciseId?: string;
  exerciseVolumeKg?: number;
  exerciseReps?: number;
  isQualifyingStrength?: boolean;
}

export interface ChallengeProgressUpdate {
  challengeId: string;
  challengeTitle: string;
  previousProgress: number;
  newProgress: number;
  target: number;
  contribution: number;
  wasCompletedBefore: boolean;
  isNewlyCompleted: boolean;
  rewardXpEarned: number;
}
