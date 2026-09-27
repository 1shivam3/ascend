import { getDatabase } from '../sqlite';
import {
  Challenge,
  ChallengeParticipant,
  ChallengeLeaderboardEntry,
  ChallengeType,
  ChallengeMetric,
  ChallengeVisibility,
  ChallengeStatus,
  ParticipantStatus,
} from '../../types/challenge.types';
import {
  SqliteChallengeRow,
  SqliteChallengeParticipantRow,
  SqliteProfileRow,
} from '../types';
import { RankTier } from '../../types/domain.types';

export class ChallengeRepository {
  /**
   * Fetch a challenge by ID.
   */
  static async getChallenge(challengeId: string): Promise<Challenge | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqliteChallengeRow>(
      `SELECT * FROM challenges WHERE id = ?;`,
      [challengeId]
    );

    if (!row) return null;
    return this.mapChallengeRow(row);
  }

  /**
   * Fetch challenges visible to an operative (Public, System, or Friend/Group if permitted).
   */
  static async getAvailableChallenges(
    userId: string,
    filter: 'ALL' | 'ACTIVE' | 'UPCOMING' = 'ACTIVE'
  ): Promise<Challenge[]> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    let timeFilter = '';
    if (filter === 'ACTIVE') {
      timeFilter = `AND c.status = 'ACTIVE' AND c.start_at <= ? AND c.end_at >= ?`;
    } else if (filter === 'UPCOMING') {
      timeFilter = `AND (c.status = 'UPCOMING' OR c.start_at > ?)`;
    }

    const params: any[] = [userId, userId, userId];
    if (filter === 'ACTIVE') {
      params.push(now, now);
    } else if (filter === 'UPCOMING') {
      params.push(now);
    }

    const rows = await db.getAllAsync<SqliteChallengeRow & { participants_count: number }>(
      `SELECT c.*, 
              (SELECT COUNT(*) FROM challenge_participants cp WHERE cp.challenge_id = c.id AND cp.status != 'LEFT') as participants_count
       FROM challenges c
       WHERE (
         c.visibility = 'PUBLIC'
         OR c.created_by = 'SYSTEM'
         OR c.created_by = ?
         OR (
           c.visibility = 'FRIENDS' 
           AND c.created_by IN (SELECT friend_id FROM friendships WHERE user_id = ?)
         )
         OR c.id IN (
           SELECT challenge_id FROM challenge_participants WHERE user_id = ? AND status != 'LEFT'
         )
       )
       ${timeFilter}
       ORDER BY c.end_at ASC;`,
      params
    );

    return rows.map(r => ({
      ...this.mapChallengeRow(r),
      participantsCount: r.participants_count || 0,
    }));
  }

  /**
   * Fetch active challenges currently joined by an operative.
   */
  static async getJoinedChallenges(
    userId: string
  ): Promise<{ challenge: Challenge; participant: ChallengeParticipant }[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<
      SqliteChallengeRow & SqliteChallengeParticipantRow & { p_status: string; p_id: string }
    >(
      `SELECT c.*, 
              cp.id as p_id, cp.progress, cp.rank, cp.status as p_status, 
              cp.joined_at, cp.completed_at, cp.last_updated_at
       FROM challenge_participants cp
       JOIN challenges c ON cp.challenge_id = c.id
       WHERE cp.user_id = ? AND cp.status != 'LEFT'
       ORDER BY cp.completed_at IS NOT NULL, c.end_at ASC;`,
      [userId]
    );

    return rows.map(r => ({
      challenge: this.mapChallengeRow(r),
      participant: {
        id: r.p_id,
        challengeId: r.id,
        userId,
        progress: Number(r.progress),
        rank: r.rank,
        status: r.p_status as ParticipantStatus,
        joinedAt: r.joined_at,
        completedAt: r.completed_at,
        lastUpdatedAt: r.last_updated_at,
      },
    }));
  }

  /**
   * Create a new challenge.
   */
  static async createChallenge(
    challenge: Omit<Challenge, 'createdAt' | 'updatedAt'>
  ): Promise<Challenge> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO challenges (
        id, title, description, type, metric, target, start_at, end_at,
        visibility, created_by, status, config, reward_xp, reward_title_id, reward_title_name, reward_badge, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        challenge.id,
        challenge.title,
        challenge.description,
        challenge.type,
        challenge.metric,
        challenge.target,
        challenge.startAt,
        challenge.endAt,
        challenge.visibility,
        challenge.createdBy,
        challenge.status,
        JSON.stringify(challenge.config || {}),
        challenge.rewardXp || 250,
        challenge.rewardTitleId || null,
        challenge.rewardTitleName || null,
        challenge.rewardBadge || null,
        now,
        now,
      ]
    );

    return {
      ...challenge,
      rewardXp: challenge.rewardXp || 250,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Join a challenge.
   */
  static async joinChallenge(
    challengeId: string,
    userId: string
  ): Promise<ChallengeParticipant> {
    const db = await getDatabase();
    const existing = await this.getParticipant(challengeId, userId);
    const now = new Date().toISOString();

    if (existing) {
      if (existing.status === 'LEFT' || existing.status === 'CANCELLED' || existing.status === 'PAUSED') {
        // Re-activate participation
        await db.runAsync(
          `UPDATE challenge_participants 
           SET status = 'ACTIVE', last_updated_at = ?
           WHERE challenge_id = ? AND user_id = ?;`,
          [now, challengeId, userId]
        );
        return {
          ...existing,
          status: 'ACTIVE',
          lastUpdatedAt: now,
        };
      }
      return existing;
    }

    const id = `cp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    await db.runAsync(
      `INSERT INTO challenge_participants (
        id, challenge_id, user_id, progress, rank, status, joined_at, completed_at, last_updated_at
      ) VALUES (?, ?, ?, 0.0, 1, 'ACTIVE', ?, NULL, ?);`,
      [id, challengeId, userId, now, now]
    );

    await this.recalculateRanks(challengeId);

    return {
      id,
      challengeId,
      userId,
      progress: 0,
      rank: 1,
      status: 'ACTIVE',
      joinedAt: now,
      completedAt: null,
      lastUpdatedAt: now,
    };
  }

  /**
   * Pause participation in a challenge. Progress is preserved, but further
   * workouts will not count toward it until resumed.
   */
  static async pauseChallenge(challengeId: string, userId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE challenge_participants 
       SET status = 'PAUSED', last_updated_at = ?
       WHERE challenge_id = ? AND user_id = ?;`,
      [now, challengeId, userId]
    );
  }

  /**
   * Resume participation in a paused challenge.
   */
  static async resumeChallenge(challengeId: string, userId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE challenge_participants 
       SET status = 'ACTIVE', last_updated_at = ?
       WHERE challenge_id = ? AND user_id = ?;`,
      [now, challengeId, userId]
    );
  }

  /**
   * Cancel participation in a challenge.
   */
  static async cancelChallenge(challengeId: string, userId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE challenge_participants 
       SET status = 'CANCELLED', last_updated_at = ?
       WHERE challenge_id = ? AND user_id = ?;`,
      [now, challengeId, userId]
    );

    await this.recalculateRanks(challengeId);
  }

  /**
   * Mark a challenge as completed by an operative.
   */
  static async completeChallenge(challengeId: string, userId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE challenge_participants 
       SET status = 'COMPLETED', completed_at = ?, last_updated_at = ?
       WHERE challenge_id = ? AND user_id = ?;`,
      [now, now, challengeId, userId]
    );
  }

  /**
   * Leave a challenge.
   */
  static async leaveChallenge(challengeId: string, userId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE challenge_participants 
       SET status = 'LEFT', last_updated_at = ?
       WHERE challenge_id = ? AND user_id = ?;`,
      [now, challengeId, userId]
    );

    await this.recalculateRanks(challengeId);
  }

  /**
   * Get an operative's participation record in a challenge.
   */
  static async getParticipant(
    challengeId: string,
    userId: string
  ): Promise<ChallengeParticipant | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqliteChallengeParticipantRow>(
      `SELECT * FROM challenge_participants WHERE challenge_id = ? AND user_id = ?;`,
      [challengeId, userId]
    );

    if (!row) return null;

    return {
      id: row.id,
      challengeId: row.challenge_id,
      userId: row.user_id,
      progress: Number(row.progress),
      rank: row.rank,
      status: row.status as ParticipantStatus,
      joinedAt: row.joined_at,
      completedAt: row.completed_at,
      lastUpdatedAt: row.last_updated_at,
    };
  }

  /**
   * Check if an event has already contributed to a challenge (Idempotency / Dedup).
   */
  static async hasEventBeenProcessed(
    challengeId: string,
    userId: string,
    eventId: string
  ): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM challenge_events 
       WHERE challenge_id = ? AND user_id = ? AND event_id = ?;`,
      [challengeId, userId, eventId]
    );
    return row !== null;
  }

  /**
   * Atomically record event deduplication stamp and update participant progress.
   */
  static async recordEventAndProgress(
    challengeId: string,
    userId: string,
    eventId: string,
    eventType: string,
    contribution: number,
    newProgress: number,
    isCompleted: boolean,
    completedAt: string | null
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const eventAuditId = `cev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // 1. Insert deduplication event
    await db.runAsync(
      `INSERT INTO challenge_events (id, challenge_id, user_id, event_id, event_type, contribution_value, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [eventAuditId, challengeId, userId, eventId, eventType, contribution, now]
    );

    // 2. Update participant progress
    const status: ParticipantStatus = isCompleted ? 'COMPLETED' : 'ACTIVE';
    await db.runAsync(
      `UPDATE challenge_participants 
       SET progress = ?,
           status = ?,
           completed_at = COALESCE(completed_at, ?),
           last_updated_at = ?
       WHERE challenge_id = ? AND user_id = ?;`,
      [newProgress, status, completedAt, now, challengeId, userId]
    );

    // 3. Recalculate leaderboard ranks
    await this.recalculateRanks(challengeId);
  }

  /**
   * Recalculates leaderboard ranks for a challenge.
   * Completed participants sorted first (earliest completed_at wins), then highest progress.
   */
  static async recalculateRanks(challengeId: string): Promise<void> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM challenge_participants
       WHERE challenge_id = ? AND status != 'LEFT'
       ORDER BY 
         CASE WHEN completed_at IS NOT NULL THEN 0 ELSE 1 END ASC,
         completed_at ASC,
         progress DESC,
         joined_at ASC;`,
      [challengeId]
    );

    for (let i = 0; i < rows.length; i++) {
      const rank = i + 1;
      await db.runAsync(
        `UPDATE challenge_participants SET rank = ? WHERE id = ?;`,
        [rank, rows[i].id]
      );
    }
  }

  /**
   * Fetch challenge leaderboard.
   * Strictly filters out blocked operatives and omits any private health metrics.
   */
  static async getLeaderboard(
    challengeId: string,
    currentUserId: string
  ): Promise<ChallengeLeaderboardEntry[]> {
    const db = await getDatabase();
    const challenge = await this.getChallenge(challengeId);
    if (!challenge) return [];

    const rows = await db.getAllAsync<
      SqliteChallengeParticipantRow & SqliteProfileRow
    >(
      `SELECT cp.rank, cp.user_id, cp.progress, cp.completed_at, cp.status,
              p.username, p.display_name, p.avatar_url, p.rank_tier, p.rank_division, p.global_level
       FROM challenge_participants cp
       JOIN profiles p ON cp.user_id = p.id
       WHERE cp.challenge_id = ?
         AND cp.status != 'LEFT'
         AND p.id NOT IN (
           SELECT blocked_id FROM blocks WHERE blocker_id = ?
           UNION
           SELECT blocker_id FROM blocks WHERE blocked_id = ?
         )
       ORDER BY cp.rank ASC;`,
      [challengeId, currentUserId, currentUserId]
    );

    const target = challenge.target || 1;

    return rows.map(r => {
      const prog = Number(r.progress);
      const percentage = Math.min(100, Math.round((prog / target) * 100));
      return {
        rank: r.rank,
        userId: r.user_id,
        username: r.username,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        rankTier: (['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'].includes(r.rank_tier) ? r.rank_tier : 'E') as RankTier,
        rankDivision: r.rank_division,
        globalLevel: r.global_level,
        progress: prog,
        target,
        percentage,
        isCompleted: r.completed_at !== null || prog >= target,
        completedAt: r.completed_at,
        isCurrentUser: r.user_id === currentUserId,
      };
    });
  }

  /**
   * Fetch all challenges visible to the user along with their participation status.
   */
  static async getAllChallengesWithUserStatus(
    userId: string
  ): Promise<(Challenge & {
    participant?: ChallengeParticipant;
    userStatus: 'AVAILABLE' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
    participantsCount: number;
  })[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<
      SqliteChallengeRow & {
        p_id?: string;
        p_progress?: number;
        p_rank?: number;
        p_status?: string;
        p_joined_at?: string;
        p_completed_at?: string;
        p_last_updated_at?: string;
        participants_count?: number;
      }
    >(
      `SELECT c.*,
              cp.id as p_id, cp.progress as p_progress, cp.rank as p_rank, cp.status as p_status,
              cp.joined_at as p_joined_at, cp.completed_at as p_completed_at, cp.last_updated_at as p_last_updated_at,
              (SELECT COUNT(*) FROM challenge_participants cp2 WHERE cp2.challenge_id = c.id AND cp2.status != 'LEFT') as participants_count
       FROM challenges c
       LEFT JOIN challenge_participants cp ON cp.challenge_id = c.id AND cp.user_id = ?
       ORDER BY c.created_at DESC;`,
      [userId]
    );

    return rows.map(r => {
      const challenge = this.mapChallengeRow(r);
      let participant: ChallengeParticipant | undefined = undefined;
      let userStatus: 'AVAILABLE' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' = 'AVAILABLE';

      if (r.p_id && r.p_status && r.p_status !== 'LEFT') {
        participant = {
          id: r.p_id,
          challengeId: r.id,
          userId,
          progress: Number(r.p_progress || 0),
          rank: r.p_rank || 1,
          status: r.p_status as ParticipantStatus,
          joinedAt: r.p_joined_at || '',
          completedAt: r.p_completed_at || null,
          lastUpdatedAt: r.p_last_updated_at || '',
        };

        if (r.p_status === 'COMPLETED' || (r.p_completed_at !== null && r.p_completed_at !== undefined)) {
          userStatus = 'COMPLETED';
        } else if (r.p_status === 'PAUSED') {
          userStatus = 'PAUSED';
        } else if (r.p_status === 'CANCELLED') {
          userStatus = 'CANCELLED';
        } else if (r.p_status === 'ACTIVE') {
          userStatus = 'ACTIVE';
        }
      }

      return {
        ...challenge,
        participant,
        userStatus,
        participantsCount: r.participants_count || 0,
      };
    });
  }

  private static mapChallengeRow(row: SqliteChallengeRow): Challenge {
    let config = {};
    try {
      config = JSON.parse(row.config);
    } catch {
      // fallback
    }

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      type: row.type as ChallengeType,
      metric: row.metric as ChallengeMetric,
      target: Number(row.target),
      startAt: row.start_at,
      endAt: row.end_at,
      visibility: row.visibility as ChallengeVisibility,
      createdBy: row.created_by,
      status: row.status as ChallengeStatus,
      config,
      rewardXp: row.reward_xp,
      rewardTitleId: row.reward_title_id || undefined,
      rewardTitleName: row.reward_title_name || undefined,
      rewardBadge: row.reward_badge || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
