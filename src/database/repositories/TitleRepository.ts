import { getDatabase } from '../sqlite';
import { UserTitle, TitleDefinition } from '../../types/title.types';
import { TITLES_CATALOG, getTitleById } from '../../config/titles.config';
import { SqliteUserTitleRow } from '../types';
import { ProfileRepository } from './ProfileRepository';

export interface TitleWithStatus {
  definition: TitleDefinition;
  isUnlocked: boolean;
  unlockedAt: string | null;
  isActive: boolean;
}

export class TitleRepository {
  /**
   * Fetch all titles unlocked by an athlete.
   */
  static async getUserTitles(userId: string): Promise<UserTitle[]> {
    if (!userId) return [];
    const db = await getDatabase();
    const rows = await db.getAllAsync<SqliteUserTitleRow>(
      `SELECT * FROM user_titles WHERE user_id = ? ORDER BY unlocked_at DESC;`,
      [userId]
    );

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      titleId: r.title_id,
      unlockedAt: r.unlocked_at,
      isActive: Boolean(r.is_active),
      definition: getTitleById(r.title_id),
    }));
  }

  /**
   * Fetch currently equipped active title.
   */
  static async getActiveTitle(userId: string): Promise<UserTitle | null> {
    if (!userId) return null;
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqliteUserTitleRow>(
      `SELECT * FROM user_titles WHERE user_id = ? AND is_active = 1 LIMIT 1;`,
      [userId]
    );

    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      titleId: row.title_id,
      unlockedAt: row.unlocked_at,
      isActive: true,
      definition: getTitleById(row.title_id),
    };
  }

  /**
   * Select and equip one active title. Un-equips all other titles.
   * If titleId is null, de-selects the active title.
   */
  static async setActiveTitle(userId: string, titleId: string | null): Promise<void> {
    if (!userId) return;
    const db = await getDatabase();
    const now = new Date().toISOString();

    // 1. Reset all active flags for this user
    await db.runAsync(`UPDATE user_titles SET is_active = 0, updated_at = ? WHERE user_id = ?;`, [
      now,
      userId,
    ]);

    let activeTitleName: string | null = null;

    // 2. Set active flag for selected title if provided
    if (titleId) {
      await db.runAsync(
        `UPDATE user_titles SET is_active = 1, updated_at = ? WHERE user_id = ? AND title_id = ?;`,
        [now, userId, titleId]
      );
      const def = getTitleById(titleId);
      activeTitleName = def ? def.name : null;
    }

    // 3. Sync to user profile table
    await ProfileRepository.updateActiveTitle(userId, titleId, activeTitleName);
  }

  /**
   * Unlocks a title for a user. Supports multiple users unlocking the same title,
   * and a user unlocking multiple titles.
   */
  static async unlockTitle(userId: string, titleId: string): Promise<UserTitle> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const id = `ut-${userId}-${titleId}`;

    await db.runAsync(
      `INSERT OR IGNORE INTO user_titles (
        id, user_id, title_id, unlocked_at, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?);`,
      [id, userId, titleId, now, now, now]
    );

    const row = await db.getFirstAsync<SqliteUserTitleRow>(
      `SELECT * FROM user_titles WHERE user_id = ? AND title_id = ?;`,
      [userId, titleId]
    );

    return {
      id: row?.id || id,
      userId,
      titleId,
      unlockedAt: row?.unlocked_at || now,
      isActive: Boolean(row?.is_active),
      definition: getTitleById(titleId),
    };
  }

  /**
   * Returns all catalog titles with the user's unlock and active status.
   */
  static async getAllTitlesWithStatus(userId: string): Promise<TitleWithStatus[]> {
    const userTitles = await this.getUserTitles(userId);
    const unlockedMap = new Map<string, UserTitle>();
    for (const ut of userTitles) {
      unlockedMap.set(ut.titleId, ut);
    }

    return TITLES_CATALOG.map((def) => {
      const userEntry = unlockedMap.get(def.id);
      return {
        definition: def,
        isUnlocked: Boolean(userEntry),
        unlockedAt: userEntry?.unlockedAt || null,
        isActive: Boolean(userEntry?.isActive),
      };
    });
  }
}
