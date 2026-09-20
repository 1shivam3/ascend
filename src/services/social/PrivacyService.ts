import { PrivacyRepository } from '../../database/repositories/PrivacyRepository';
import { PrivacySettings, ActivityEventType } from '../../types/social.types';

export class PrivacyService {
  /**
   * Get user's privacy settings.
   */
  static async getSettings(userId: string): Promise<PrivacySettings> {
    return PrivacyRepository.getSettings(userId);
  }

  /**
   * Update user's privacy settings.
   */
  static async updateSettings(
    userId: string,
    updates: Partial<PrivacySettings>
  ): Promise<PrivacySettings> {
    return PrivacyRepository.updateSettings(userId, updates);
  }

  /**
   * Check if a specific athletic event type is allowed to be published based on user settings.
   */
  static async shouldPublishEvent(
    userId: string,
    eventType: ActivityEventType
  ): Promise<boolean> {
    const settings = await this.getSettings(userId);

    switch (eventType) {
      case 'WORKOUT_COMPLETED':
        return settings.showWorkoutsInFeed;
      case 'PR_ACHIEVED':
        return settings.showPrsInFeed;
      case 'LEVEL_UP':
        return settings.showLevelUpsInFeed;
      case 'RANK_UP':
        return settings.showRankUpsInFeed;
      case 'ACHIEVEMENT_UNLOCKED':
        return settings.showAchievementsInFeed;
      case 'CHALLENGE_COMPLETED':
        return settings.showChallengesInFeed;
      case 'CHARACTER_EVOLUTION':
        return settings.showEvolutionInFeed;
      default:
        return true;
    }
  }
}
