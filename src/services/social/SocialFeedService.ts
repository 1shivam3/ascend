import { ActivityFeedRepository } from '../../database/repositories/ActivityFeedRepository';
import { PrivacyService } from './PrivacyService';
import {
  ActivityFeedItem,
  ActivityEventType,
  ActivityReactionType,
  CreateActivityInput,
  ActivityFeedMetadata,
} from '../../types/social.types';

export class SocialFeedService {
  /**
   * Sanitizes metadata to ensure ZERO health or biometric data leakage.
   * Strips bodyweight, injuries, health notes, set-by-set raw logs, and medical restrictions.
   */
  static sanitizeMetadata(raw: ActivityFeedMetadata = {}): ActivityFeedMetadata {
    const clean: ActivityFeedMetadata = {};

    // Allowed public athletic telemetry
    if (raw.workoutId) clean.workoutId = String(raw.workoutId);
    if (typeof raw.durationMinutes === 'number') clean.durationMinutes = Math.round(raw.durationMinutes);
    if (typeof raw.totalVolumeKg === 'number') clean.totalVolumeKg = Math.round(raw.totalVolumeKg);
    if (typeof raw.exerciseCount === 'number') clean.exerciseCount = Math.round(raw.exerciseCount);
    if (Array.isArray(raw.primaryExercises)) {
      clean.primaryExercises = raw.primaryExercises.slice(0, 5).map(String);
    }
    if (raw.prExerciseName) clean.prExerciseName = String(raw.prExerciseName);
    if (raw.prType) clean.prType = String(raw.prType);
    if (typeof raw.prValue === 'number') clean.prValue = Number(raw.prValue);
    if (typeof raw.oldLevel === 'number') clean.oldLevel = raw.oldLevel;
    if (typeof raw.newLevel === 'number') clean.newLevel = raw.newLevel;
    if (raw.oldRankTier) clean.oldRankTier = raw.oldRankTier;
    if (raw.newRankTier) clean.newRankTier = raw.newRankTier;
    if (typeof raw.oldDivision === 'number') clean.oldDivision = raw.oldDivision;
    if (typeof raw.newDivision === 'number') clean.newDivision = raw.newDivision;
    if (raw.achievementId) clean.achievementId = String(raw.achievementId);
    if (raw.achievementTitle) clean.achievementTitle = String(raw.achievementTitle);
    if (raw.achievementIcon) clean.achievementIcon = String(raw.achievementIcon);
    if (raw.challengeId) clean.challengeId = String(raw.challengeId);
    if (raw.challengeTitle) clean.challengeTitle = String(raw.challengeTitle);
    if (typeof raw.challengeXp === 'number') clean.challengeXp = raw.challengeXp;
    if (typeof raw.evolutionStage === 'number') clean.evolutionStage = raw.evolutionStage;
    if (raw.evolutionForm) clean.evolutionForm = String(raw.evolutionForm);

    return clean;
  }

  /**
   * Publish an athletic event to the activity feed.
   * Gated by the user's granular privacy settings.
   */
  static async publishEvent(
    userId: string,
    event: CreateActivityInput
  ): Promise<ActivityFeedItem | null> {
    const isAllowed = await PrivacyService.shouldPublishEvent(userId, event.eventType);
    if (!isAllowed) {
      return null;
    }

    const settings = await PrivacyService.getSettings(userId);
    const visibility = event.visibility || settings.feedVisibilityDefault || 'FRIENDS';

    const cleanMetadata = this.sanitizeMetadata(event.metadata);

    return ActivityFeedRepository.createItem(
      userId,
      event.eventType,
      event.title,
      event.summary,
      cleanMetadata,
      visibility
    );
  }

  /**
   * Get activity feed items for current user.
   */
  static async getFeed(
    currentUserId: string,
    filter: 'ALL' | 'SQUAD' | 'GLOBAL' = 'ALL'
  ): Promise<ActivityFeedItem[]> {
    return ActivityFeedRepository.getFeed(currentUserId, filter);
  }

  /**
   * React to an activity feed item with athletic reaction.
   */
  static async reactToActivity(
    userId: string,
    activityId: string,
    reactionType: ActivityReactionType
  ): Promise<void> {
    return ActivityFeedRepository.addReaction(activityId, userId, reactionType);
  }

  /**
   * Remove reaction from activity.
   */
  static async removeReaction(
    userId: string,
    activityId: string,
    reactionType: ActivityReactionType
  ): Promise<void> {
    return ActivityFeedRepository.removeReaction(activityId, userId, reactionType);
  }

  /**
   * Delete an activity feed item.
   */
  static async deleteActivity(userId: string, activityId: string): Promise<void> {
    return ActivityFeedRepository.deleteItem(activityId, userId);
  }
}
