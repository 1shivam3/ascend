import { getDatabase } from '../sqlite';
import { UserQuestProgress, Quest, QuestType, QuestCategory, QuestState } from '../../types/quest.types';
import { SqliteQuestRow, SqliteUserQuestRow } from '../types';

export class QuestRepository {
  /**
   * Retrieves all quest progresses for a user, joining quest definitions.
   */
  static async getUserQuests(userId: string): Promise<UserQuestProgress[]> {
    const db = await getDatabase();

    // Ensure all available quests are provisioned for this user
    const allQuests = await db.getAllAsync<SqliteQuestRow>('SELECT * FROM quests;');
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    for (const q of allQuests) {
      await db.runAsync(
        `INSERT OR IGNORE INTO user_quests (
          id, user_id, quest_id, current_progress, target_value, completed, completed_at, last_reset_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [`uq-${userId}-${q.id}`, userId, q.id, 0, q.target_value, 0, null, today, now, now]
      );
    }

    const rows = await db.getAllAsync<SqliteUserQuestRow & SqliteQuestRow>(
      `SELECT 
        uq.id, uq.user_id, uq.quest_id, uq.current_progress, uq.target_value,
        uq.completed, uq.completed_at, uq.last_reset_date,
        q.title, q.description, q.type, q.category, q.unit, q.xp_reward, q.badge_variant
       FROM user_quests uq
       JOIN quests q ON uq.quest_id = q.id
       WHERE uq.user_id = ?
       ORDER BY 
         CASE q.type 
           WHEN 'DAILY' THEN 1 
           WHEN 'WEEKLY' THEN 2 
           ELSE 3 
         END,
         q.target_value ASC;`,
      [userId]
    );

    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      questId: r.quest_id,
      currentProgress: r.current_progress,
      targetValue: r.target_value,
      completed: Boolean(r.completed),
      completedAt: r.completed_at,
      lastResetDate: r.last_reset_date,
      quest: {
        id: r.quest_id,
        title: r.title,
        description: r.description,
        type: r.type as QuestType,
        category: r.category as QuestCategory,
        targetValue: r.target_value,
        unit: r.unit,
        xpReward: r.xp_reward,
        badgeVariant: r.badge_variant as 'cyan' | 'amber' | 'emerald' | 'violet',
      },
    }));
  }

  /**
   * Updates progress for a specific user quest.
   */
  static async updateProgress(
    userId: string,
    questId: string,
    currentProgress: number,
    completed: boolean
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    await db.runAsync(
      `UPDATE user_quests
       SET current_progress = ?,
           completed = ?,
           completed_at = CASE WHEN ? = 1 AND completed = 0 THEN ? ELSE completed_at END,
           updated_at = ?
       WHERE user_id = ? AND quest_id = ?;`,
      [currentProgress, completed ? 1 : 0, completed ? 1 : 0, now, now, userId, questId]
    );
  }

  /**
   * Resets daily quests if the date has changed since last reset.
   */
  static async resetDailyQuestsIfNeeded(userId: string, currentDateStr: string): Promise<void> {
    const db = await getDatabase();
    const cleanDate = currentDateStr.split('T')[0];
    const now = new Date().toISOString();

    await db.runAsync(
      `UPDATE user_quests
       SET current_progress = 0,
           completed = 0,
           completed_at = NULL,
           last_reset_date = ?,
           updated_at = ?
       WHERE user_id = ? 
         AND quest_id IN (SELECT id FROM quests WHERE type = 'DAILY')
         AND last_reset_date < ?;`,
      [cleanDate, now, userId, cleanDate]
    );
  }

  /**
   * Computes the current lifecycle state of a quest for a given user level and date.
   */
  static getQuestStatus(
    uq: UserQuestProgress,
    userLevel: number = 1,
    currentDateStr: string = new Date().toISOString()
  ): QuestState {
    if (uq.completed) {
      return 'COMPLETED';
    }

    const quest = uq.quest;
    const minLevel = quest?.minLevelRequired || 1;
    if (userLevel < minLevel) {
      return 'LOCKED';
    }

    if (uq.currentProgress > 0) {
      return 'IN_PROGRESS';
    }

    return 'AVAILABLE';
  }

  /**
   * Retrieves all quest progresses with computed dynamic state.
   */
  static async getQuestsWithState(userId: string, userLevel: number = 1): Promise<UserQuestProgress[]> {
    const quests = await this.getUserQuests(userId);
    const today = new Date().toISOString();
    return quests.map(q => ({
      ...q,
      state: this.getQuestStatus(q, userLevel, today),
    }));
  }
}
