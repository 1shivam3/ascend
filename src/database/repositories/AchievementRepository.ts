import { getDatabase } from '../sqlite';

export interface UserAchievementRow {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
  xp_awarded: number;
  created_at: string;
}

export class AchievementRepository {
  static async getUserAchievements(userId: string): Promise<UserAchievementRow[]> {
    const db = await getDatabase();
    return db.getAllAsync<UserAchievementRow>(
      `SELECT * FROM user_achievements WHERE user_id = ? ORDER BY unlocked_at DESC;`,
      [userId]
    );
  }

  static async getUnlockedIds(userId: string): Promise<Set<string>> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ achievement_id: string }>(
      `SELECT achievement_id FROM user_achievements WHERE user_id = ?;`,
      [userId]
    );
    return new Set(rows.map(r => r.achievement_id));
  }

  static async unlockAchievement(
    userId: string,
    achievementId: string,
    xpAwarded: number
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const id = `ua-${userId}-${achievementId}`;

    await db.runAsync(
      `INSERT OR IGNORE INTO user_achievements (
        id, user_id, achievement_id, unlocked_at, xp_awarded, created_at
      ) VALUES (?, ?, ?, ?, ?, ?);`,
      [id, userId, achievementId, now, xpAwarded, now]
    );
  }

  static async hasUnlocked(userId: string, achievementId: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM user_achievements WHERE user_id = ? AND achievement_id = ?;`,
      [userId, achievementId]
    );
    return Boolean(row && row.count > 0);
  }
}
