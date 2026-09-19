import { getDatabase } from '../sqlite';
import { UserProfile, UserSettings, CharacterAttributes, RankTier } from '../../types/domain.types';

export class ProfileRepository {
  static async getProfile(userId: string): Promise<UserProfile | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<any>(
      `SELECT * FROM profiles WHERE id = ?;`,
      [userId]
    );

    if (!row) return null;

    let attributes: CharacterAttributes = { strength: 10, stamina: 10, agility: 10, discipline: 10, vitality: 10 };
    try {
      attributes = JSON.parse(row.attributes);
    } catch {
      // fallback
    }

    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      globalLevel: row.global_level,
      totalXp: row.total_xp,
      rankTier: row.rank_tier as RankTier,
      rankDivision: row.rank_division,
      attributes,
      currentStreak: row.current_streak,
      longestStreak: row.longest_streak,
      streakFreezeTokens: row.streak_freeze_tokens,
      lastWorkoutDate: row.last_workout_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  static async updateProgression(
    userId: string,
    globalLevel: number,
    totalXp: number,
    rankTier: RankTier,
    rankDivision: number,
    attributes: CharacterAttributes,
    currentStreak: number,
    longestStreak: number,
    streakFreezeTokens: number,
    lastWorkoutDate: string
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE profiles SET
        global_level = ?,
        total_xp = ?,
        rank_tier = ?,
        rank_division = ?,
        attributes = ?,
        current_streak = ?,
        longest_streak = ?,
        streak_freeze_tokens = ?,
        last_workout_date = ?,
        updated_at = ?
      WHERE id = ?;`,
      [
        globalLevel,
        totalXp,
        rankTier,
        rankDivision,
        JSON.stringify(attributes),
        currentStreak,
        longestStreak,
        streakFreezeTokens,
        lastWorkoutDate,
        now,
        userId,
      ]
    );
  }

  static async getSettings(userId: string): Promise<UserSettings | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<any>(
      `SELECT * FROM user_settings WHERE user_id = ?;`,
      [userId]
    );

    if (!row) return null;

    return {
      userId: row.user_id,
      preferredUnit: row.preferred_unit as 'kg' | 'lbs',
      soundEnabled: Boolean(row.sound_enabled),
      hapticsEnabled: Boolean(row.haptics_enabled),
      defaultRestSeconds: row.default_rest_seconds,
      pushNotificationsEnabled: Boolean(row.push_notifications_enabled),
      streakFreezeAutoUse: Boolean(row.streak_freeze_auto_use),
    };
  }

  static async updateUnit(userId: string, unit: 'kg' | 'lbs'): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE user_settings SET preferred_unit = ?, updated_at = ? WHERE user_id = ?;`,
      [unit, now, userId]
    );
  }
}
