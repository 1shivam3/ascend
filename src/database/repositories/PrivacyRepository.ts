import { getDatabase } from '../sqlite';
import { PrivacySettings, SocialVisibility } from '../../types/social.types';
import { SqlitePrivacySettingsRow } from '../types';

export class PrivacyRepository {
  /**
   * Get user's privacy settings. Returns defaults if not yet initialized.
   */
  static async getSettings(userId: string): Promise<PrivacySettings> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqlitePrivacySettingsRow>(
      `SELECT * FROM privacy_settings WHERE user_id = ?;`,
      [userId]
    );

    if (row) {
      return {
        id: row.id,
        userId: row.user_id,
        profileVisibility: (row.profile_visibility as SocialVisibility) || 'FRIENDS',
        feedVisibilityDefault: (row.feed_visibility_default as SocialVisibility) || 'FRIENDS',
        showWorkoutsInFeed: Boolean(row.show_workouts_in_feed),
        showPrsInFeed: Boolean(row.show_prs_in_feed),
        showLevelUpsInFeed: Boolean(row.show_level_ups_in_feed),
        showRankUpsInFeed: Boolean(row.show_rank_ups_in_feed),
        showAchievementsInFeed: Boolean(row.show_achievements_in_feed),
        showChallengesInFeed: Boolean(row.show_challenges_in_feed),
        showEvolutionInFeed: Boolean(row.show_evolution_in_feed),
        allowFriendRequests: Boolean(row.allow_friend_requests),
        showMasteryOnProfile: Boolean(row.show_mastery_on_profile),
        showAchievementsOnProfile: Boolean(row.show_achievements_on_profile),
        showStreakOnProfile: Boolean(row.show_streak_on_profile),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }

    // Default privacy settings
    const now = new Date().toISOString();
    const defaultSettings: PrivacySettings = {
      id: `ps-${userId}`,
      userId,
      profileVisibility: 'FRIENDS',
      feedVisibilityDefault: 'FRIENDS',
      showWorkoutsInFeed: true,
      showPrsInFeed: true,
      showLevelUpsInFeed: true,
      showRankUpsInFeed: true,
      showAchievementsInFeed: true,
      showChallengesInFeed: true,
      showEvolutionInFeed: true,
      allowFriendRequests: true,
      showMasteryOnProfile: true,
      showAchievementsOnProfile: true,
      showStreakOnProfile: true,
      createdAt: now,
      updatedAt: now,
    };

    await db.runAsync(
      `INSERT OR IGNORE INTO privacy_settings (
        id, user_id, profile_visibility, feed_visibility_default,
        show_workouts_in_feed, show_prs_in_feed, show_level_ups_in_feed,
        show_rank_ups_in_feed, show_achievements_in_feed, show_challenges_in_feed,
        show_evolution_in_feed, allow_friend_requests, show_mastery_on_profile,
        show_achievements_on_profile, show_streak_on_profile, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        defaultSettings.id,
        userId,
        defaultSettings.profileVisibility,
        defaultSettings.feedVisibilityDefault,
        defaultSettings.showWorkoutsInFeed ? 1 : 0,
        defaultSettings.showPrsInFeed ? 1 : 0,
        defaultSettings.showLevelUpsInFeed ? 1 : 0,
        defaultSettings.showRankUpsInFeed ? 1 : 0,
        defaultSettings.showAchievementsInFeed ? 1 : 0,
        defaultSettings.showChallengesInFeed ? 1 : 0,
        defaultSettings.showEvolutionInFeed ? 1 : 0,
        defaultSettings.allowFriendRequests ? 1 : 0,
        defaultSettings.showMasteryOnProfile ? 1 : 0,
        defaultSettings.showAchievementsOnProfile ? 1 : 0,
        defaultSettings.showStreakOnProfile ? 1 : 0,
        now,
        now,
      ]
    );

    return defaultSettings;
  }

  /**
   * Update user's privacy settings.
   */
  static async updateSettings(
    userId: string,
    updates: Partial<PrivacySettings>
  ): Promise<PrivacySettings> {
    const current = await this.getSettings(userId);
    const updated: PrivacySettings = {
      ...current,
      ...updates,
      userId, // guarantee user_id immutable
      updatedAt: new Date().toISOString(),
    };

    const db = await getDatabase();
    await db.runAsync(
      `UPDATE privacy_settings SET
        profile_visibility = ?,
        feed_visibility_default = ?,
        show_workouts_in_feed = ?,
        show_prs_in_feed = ?,
        show_level_ups_in_feed = ?,
        show_rank_ups_in_feed = ?,
        show_achievements_in_feed = ?,
        show_challenges_in_feed = ?,
        show_evolution_in_feed = ?,
        allow_friend_requests = ?,
        show_mastery_on_profile = ?,
        show_achievements_on_profile = ?,
        show_streak_on_profile = ?,
        updated_at = ?
      WHERE user_id = ?;`,
      [
        updated.profileVisibility,
        updated.feedVisibilityDefault,
        updated.showWorkoutsInFeed ? 1 : 0,
        updated.showPrsInFeed ? 1 : 0,
        updated.showLevelUpsInFeed ? 1 : 0,
        updated.showRankUpsInFeed ? 1 : 0,
        updated.showAchievementsInFeed ? 1 : 0,
        updated.showChallengesInFeed ? 1 : 0,
        updated.showEvolutionInFeed ? 1 : 0,
        updated.allowFriendRequests ? 1 : 0,
        updated.showMasteryOnProfile ? 1 : 0,
        updated.showAchievementsOnProfile ? 1 : 0,
        updated.showStreakOnProfile ? 1 : 0,
        updated.updatedAt,
        userId,
      ]
    );

    return updated;
  }
}
