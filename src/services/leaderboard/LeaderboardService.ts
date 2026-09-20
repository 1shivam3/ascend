import { getDatabase } from '../../database/sqlite';
import { RankTier } from '../../types/domain.types';

export interface PublicLeaderboardEntry {
  id: string;
  displayName: string;
  avatarUrl: string;
  level: number;
  rankTier: RankTier;
  rankDivision: number;
  weeklyXp: number;
  isCurrentUser: boolean;
}

export class LeaderboardService {
  /**
   * Updates an operative's explicit opt-in preference for the public weekly leaderboard.
   * Default is ALWAYS opted-out (0).
   */
  static async setOptIn(userId: string, optIn: boolean): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE profiles SET leaderboard_opt_in = ?, updated_at = ? WHERE id = ?;`,
      [optIn ? 1 : 0, now, userId]
    );
  }

  /**
   * Checks if user is currently opted into the leaderboard.
   */
  static async getOptInStatus(userId: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ leaderboard_opt_in: number }>(
      `SELECT leaderboard_opt_in FROM profiles WHERE id = ?;`,
      [userId]
    );
    return Boolean(row?.leaderboard_opt_in === 1);
  }

  /**
   * Aggregates total XP minted during the current calendar week for a user.
   */
  static async getWeeklyXpForUser(userId: string): Promise<number> {
    const db = await getDatabase();
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Mon
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const row = await db.getFirstAsync<{ total_xp: number | null }>(
      `SELECT SUM(amount) as total_xp FROM xp_transactions
       WHERE user_id = ? AND created_at >= ?;`,
      [userId, startOfWeek.toISOString()]
    );

    return Math.max(0, Math.round(row?.total_xp || 0));
  }

  /**
   * Retrieves the weekly leaderboard entries.
   * Supports 'GLOBAL' or 'FRIENDS' scopes.
   * PRIVACY GUARANTEE:
   * - ONLY returns users who have explicitly set leaderboard_opt_in = 1.
   * - ONLY exposes non-sensitive public attributes: id, display_name, avatar_url, global_level, rank_tier, rank_division, weekly_xp.
   * - NEVER exposes health data, biometrics, notes, or set logs.
   */
  static async getWeeklyLeaderboard(
    currentUserId: string,
    scope: 'GLOBAL' | 'FRIENDS' = 'GLOBAL'
  ): Promise<PublicLeaderboardEntry[]> {
    const db = await getDatabase();
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfWeekIso = startOfWeek.toISOString();

    let sql = `SELECT 
        p.id,
        p.display_name,
        p.avatar_url,
        p.global_level,
        p.rank_tier,
        p.rank_division,
        COALESCE(
          (SELECT SUM(xt.amount) 
           FROM xp_transactions xt 
           WHERE xt.user_id = p.id AND xt.created_at >= ?),
          0
        ) as weekly_xp
       FROM profiles p
       WHERE p.leaderboard_opt_in = 1`;

    const params: any[] = [startOfWeekIso];

    if (scope === 'FRIENDS') {
      sql += ` AND (
        p.id = ? 
        OR p.id IN (SELECT friend_id FROM friendships WHERE user_id = ?)
      )`;
      params.push(currentUserId, currentUserId);
    }

    sql += ` ORDER BY weekly_xp DESC, p.global_level DESC LIMIT 50;`;

    const rows = await db.getAllAsync<{
      id: string;
      display_name: string;
      avatar_url: string | null;
      global_level: number;
      rank_tier: string;
      rank_division: number;
      weekly_xp: number | null;
    }>(sql, params);

    return rows.map(r => ({
      id: r.id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url || '⚔️',
      level: r.global_level,
      rankTier: r.rank_tier as RankTier,
      rankDivision: r.rank_division,
      weeklyXp: Math.round(r.weekly_xp || 0),
      isCurrentUser: r.id === currentUserId,
    }));
  }
}
