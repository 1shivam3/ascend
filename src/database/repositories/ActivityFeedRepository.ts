import { getDatabase } from '../sqlite';
import {
  ActivityFeedItem,
  ActivityEventType,
  ActivityReactionType,
  SocialVisibility,
  ActivityFeedMetadata,
} from '../../types/social.types';
import {
  SqliteActivityFeedRow,
  SqliteActivityReactionRow,
  SqliteProfileRow,
} from '../types';
import { RankTier } from '../../types/domain.types';

export class ActivityFeedRepository {
  /**
   * Post a new activity event to the feed.
   */
  static async createItem(
    userId: string,
    eventType: ActivityEventType,
    title: string,
    summary: string,
    metadata: ActivityFeedMetadata = {},
    visibility: SocialVisibility = 'FRIENDS'
  ): Promise<ActivityFeedItem> {
    const db = await getDatabase();
    const id = `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO activity_feed (id, user_id, event_type, title, summary, metadata, visibility, likes_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?);`,
      [id, userId, eventType, title, summary, JSON.stringify(metadata), visibility, now]
    );

    return {
      id,
      userId,
      eventType,
      title,
      summary,
      metadata,
      visibility,
      likesCount: 0,
      createdAt: now,
      reactions: {
        LIKE: 0,
        FIRE: 0,
        RESPECT: 0,
        WARRIOR: 0,
        LIGHTNING: 0,
        STRENGTH: 0,
        PRECISION: 0,
      },
      userReaction: null,
    };
  }

  /**
   * Get activity feed items for current user with filtering, block enforcement, and reactions.
   * filter:
   *   'ALL': own + squad + public
   *   'SQUAD': friends + own
   *   'GLOBAL': public items
   */
  static async getFeed(
    currentUserId: string,
    filter: 'ALL' | 'SQUAD' | 'GLOBAL' = 'ALL'
  ): Promise<ActivityFeedItem[]> {
    const db = await getDatabase();

    let filterClause = '';
    const params: any[] = [currentUserId, currentUserId, currentUserId];

    if (filter === 'SQUAD') {
      filterClause = `
        AND (
          af.user_id = ?
          OR (
            af.user_id IN (SELECT friend_id FROM friendships WHERE user_id = ?)
            AND af.visibility IN ('FRIENDS', 'PUBLIC')
          )
        )
      `;
      params.push(currentUserId, currentUserId);
    } else if (filter === 'GLOBAL') {
      filterClause = `
        AND (
          af.visibility = 'PUBLIC'
          OR af.user_id = ?
        )
      `;
      params.push(currentUserId);
    } else {
      // 'ALL'
      filterClause = `
        AND (
          af.user_id = ?
          OR af.visibility = 'PUBLIC'
          OR (
            af.visibility = 'FRIENDS'
            AND af.user_id IN (SELECT friend_id FROM friendships WHERE user_id = ?)
          )
        )
      `;
      params.push(currentUserId, currentUserId);
    }

    const rows = await db.getAllAsync<
      SqliteActivityFeedRow & {
        username: string;
        display_name: string;
        avatar_url: string | null;
        friend_code: string | null;
        global_level: number;
        rank_tier: string;
        rank_division: number;
        current_streak: number;
      }
    >(
      `SELECT af.*, 
              p.username, p.display_name, p.avatar_url, p.friend_code, 
              p.global_level, p.rank_tier, p.rank_division, p.current_streak
       FROM activity_feed af
       JOIN profiles p ON af.user_id = p.id
       WHERE p.id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id = ?
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id = ?
       )
       ${filterClause}
       ORDER BY af.created_at DESC
       LIMIT 50;`,
      params
    );

    if (rows.length === 0) return [];

    // Gather reactions for all fetched feed items
    const feedIds = rows.map(r => r.id);
    const placeholders = feedIds.map(() => '?').join(',');

    const reactions = await db.getAllAsync<SqliteActivityReactionRow>(
      `SELECT activity_id, user_id, reaction_type 
       FROM activity_reactions 
       WHERE activity_id IN (${placeholders});`,
      feedIds
    );

    // Group reactions by activityId
    const reactionsMap: Record<
      string,
      { breakdown: Record<ActivityReactionType, number>; userReaction: ActivityReactionType | null }
    > = {};

    feedIds.forEach(id => {
      reactionsMap[id] = {
        breakdown: {
          LIKE: 0,
          FIRE: 0,
          RESPECT: 0,
          WARRIOR: 0,
          LIGHTNING: 0,
          STRENGTH: 0,
          PRECISION: 0,
        },
        userReaction: null,
      };
    });

    reactions.forEach(r => {
      const entry = reactionsMap[r.activity_id];
      if (entry) {
        const type = r.reaction_type as ActivityReactionType;
        if (entry.breakdown[type] !== undefined) {
          entry.breakdown[type]++;
        }
        if (r.user_id === currentUserId) {
          entry.userReaction = type;
        }
      }
    });

    return rows.map(r => {
      let metadata: ActivityFeedMetadata = {};
      try {
        metadata = JSON.parse(r.metadata);
      } catch {
        // fallback
      }

      const rInfo = reactionsMap[r.id] || {
        breakdown: { LIKE: 0, FIRE: 0, RESPECT: 0, WARRIOR: 0, LIGHTNING: 0, STRENGTH: 0 },
        userReaction: null,
      };

      const totalReactions = Object.values(rInfo.breakdown).reduce((a, b) => a + b, 0);

      return {
        id: r.id,
        userId: r.user_id,
        eventType: r.event_type as ActivityEventType,
        title: r.title,
        summary: r.summary,
        metadata,
        visibility: r.visibility as SocialVisibility,
        likesCount: totalReactions,
        createdAt: r.created_at,
        author: {
          id: r.user_id,
          username: r.username,
          displayName: r.display_name,
          avatarUrl: r.avatar_url,
          friendCode: r.friend_code || 'ASC-0000',
          globalLevel: r.global_level,
          rankTier: (['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'].includes(r.rank_tier) ? r.rank_tier : 'E') as RankTier,
          rankDivision: r.rank_division,
          currentStreak: r.current_streak,
        },
        reactions: rInfo.breakdown,
        userReaction: rInfo.userReaction,
      };
    });
  }

  /**
   * Add or toggle a lightweight athletic reaction.
   */
  static async addReaction(
    activityId: string,
    userId: string,
    reactionType: ActivityReactionType
  ): Promise<void> {
    const db = await getDatabase();

    // Check if user has already added this reaction
    const existing = await db.getFirstAsync<SqliteActivityReactionRow>(
      `SELECT * FROM activity_reactions 
       WHERE activity_id = ? AND user_id = ? AND reaction_type = ?;`,
      [activityId, userId, reactionType]
    );

    if (existing) {
      // Toggle off
      await this.removeReaction(activityId, userId, reactionType);
      return;
    }

    const id = `act-rx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO activity_reactions (id, activity_id, user_id, reaction_type, created_at)
       VALUES (?, ?, ?, ?, ?);`,
      [id, activityId, userId, reactionType, now]
    );

    await db.runAsync(
      `UPDATE activity_feed SET likes_count = likes_count + 1 WHERE id = ?;`,
      [activityId]
    );
  }

  /**
   * Remove a reaction from an activity.
   */
  static async removeReaction(
    activityId: string,
    userId: string,
    reactionType: ActivityReactionType
  ): Promise<void> {
    const db = await getDatabase();

    const deleted = await db.runAsync(
      `DELETE FROM activity_reactions 
       WHERE activity_id = ? AND user_id = ? AND reaction_type = ?;`,
      [activityId, userId, reactionType]
    );

    if (deleted.changes > 0) {
      await db.runAsync(
        `UPDATE activity_feed SET likes_count = MAX(0, likes_count - 1) WHERE id = ?;`,
        [activityId]
      );
    }
  }

  /**
   * Delete an activity feed item.
   */
  static async deleteItem(activityId: string, userId: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `DELETE FROM activity_feed WHERE id = ? AND user_id = ?;`,
      [activityId, userId]
    );
  }
}
