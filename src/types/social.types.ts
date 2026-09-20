import { RankTier } from './domain.types';

export type ActivityEventType =
  | 'WORKOUT_COMPLETED'
  | 'PR_ACHIEVED'
  | 'LEVEL_UP'
  | 'RANK_UP'
  | 'ACHIEVEMENT_UNLOCKED'
  | 'CHALLENGE_COMPLETED'
  | 'CHARACTER_EVOLUTION';

export type ActivityReactionType =
  | 'LIKE'
  | 'FIRE'
  | 'RESPECT'
  | 'WARRIOR'
  | 'LIGHTNING'
  | 'STRENGTH'
  | 'PRECISION';

export type SocialVisibility = 'PUBLIC' | 'FRIENDS' | 'PRIVATE';

export type FriendRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  createdAt: string;
}

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt: string;
  sender?: PublicUserSummary;
  receiver?: PublicUserSummary;
}

export interface BlockRecord {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

export interface ActivityFeedMetadata {
  workoutId?: string;
  durationMinutes?: number;
  totalVolumeKg?: number;
  exerciseCount?: number;
  primaryExercises?: string[];
  prExerciseName?: string;
  prType?: string;
  prValue?: number;
  oldLevel?: number;
  newLevel?: number;
  oldRankTier?: RankTier;
  newRankTier?: RankTier;
  oldDivision?: number;
  newDivision?: number;
  achievementId?: string;
  achievementTitle?: string;
  achievementIcon?: string;
  challengeId?: string;
  challengeTitle?: string;
  challengeXp?: number;
  evolutionStage?: number;
  evolutionForm?: string;
  [key: string]: any;
}

export interface ActivityFeedItem {
  id: string;
  userId: string;
  eventType: ActivityEventType;
  title: string;
  summary: string;
  metadata: ActivityFeedMetadata;
  visibility: SocialVisibility;
  likesCount: number;
  createdAt: string;
  author?: PublicUserSummary;
  reactions?: Record<ActivityReactionType, number>;
  userReaction?: ActivityReactionType | null;
}

export interface ActivityReaction {
  id: string;
  activityId: string;
  userId: string;
  reactionType: ActivityReactionType;
  createdAt: string;
}

export interface PrivacySettings {
  id: string;
  userId: string;
  profileVisibility: SocialVisibility;
  feedVisibilityDefault: SocialVisibility;
  showWorkoutsInFeed: boolean;
  showPrsInFeed: boolean;
  showLevelUpsInFeed: boolean;
  showRankUpsInFeed: boolean;
  showAchievementsInFeed: boolean;
  showChallengesInFeed: boolean;
  showEvolutionInFeed: boolean;
  allowFriendRequests: boolean;
  showMasteryOnProfile: boolean;
  showAchievementsOnProfile: boolean;
  showStreakOnProfile: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  friendCode: string;
  globalLevel: number;
  rankTier: RankTier;
  rankDivision: number;
  currentStreak?: number;
}

export interface PublicMasterySummary {
  exerciseId: string;
  exerciseName: string;
  rank: RankTier;
  masteryLevel: number;
  estimated1RmKg: number;
  bestWeightKg: number;
  relativeStrength?: number | null;
}

export interface PublicAchievementSummary {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt: string;
}

export interface PublicUserProfile extends PublicUserSummary {
  relationship: 'SELF' | 'FRIEND' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'NONE' | 'BLOCKED';
  selectedMastery: PublicMasterySummary[];
  selectedAchievements: PublicAchievementSummary[];
  challengesCompletedCount: number;
  lifetimeTonnageKg?: number;
  totalWorkoutsCompleted?: number;
  evolutionStage?: {
    stageNumber: number;
    title: string;
  };
}

export interface CreateActivityInput {
  eventType: ActivityEventType;
  title: string;
  summary: string;
  metadata?: ActivityFeedMetadata;
  visibility?: SocialVisibility;
}
