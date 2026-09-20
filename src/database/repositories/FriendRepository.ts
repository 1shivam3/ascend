import { getDatabase } from '../sqlite';
import {
  Friendship,
  FriendRequest,
  BlockRecord,
  PublicUserSummary,
  FriendRequestStatus,
} from '../../types/social.types';
import {
  SqliteFriendshipRow,
  SqliteFriendRequestRow,
  SqliteBlockRow,
  SqliteProfileRow,
} from '../types';
import { RankTier } from '../../types/domain.types';

export class FriendRepository {
  /**
   * Search for operatives by exact friend code, username, or display name.
   * Strictly filters out self and bidirectional blocks.
   */
  static async searchUsers(currentUserId: string, query: string): Promise<PublicUserSummary[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const db = await getDatabase();
    const cleanCode = trimmed.toUpperCase();
    const pattern = `%${trimmed}%`;

    const rows = await db.getAllAsync<SqliteProfileRow>(
      `SELECT p.id, p.username, p.display_name, p.avatar_url, p.friend_code, p.global_level, p.rank_tier, p.rank_division, p.current_streak
       FROM profiles p
       WHERE p.id != ?
         AND (
           UPPER(p.friend_code) = ?
           OR p.username LIKE ?
           OR p.display_name LIKE ?
         )
         AND p.id NOT IN (
           SELECT blocked_id FROM blocks WHERE blocker_id = ?
           UNION
           SELECT blocker_id FROM blocks WHERE blocked_id = ?
         )
       LIMIT 20;`,
      [currentUserId, cleanCode, pattern, pattern, currentUserId, currentUserId]
    );

    return rows.map(r => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      friendCode: r.friend_code || 'ASC-0000',
      globalLevel: r.global_level,
      rankTier: (['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'].includes(r.rank_tier) ? r.rank_tier : 'E') as RankTier,
      rankDivision: r.rank_division,
      currentStreak: r.current_streak,
    }));
  }

  /**
   * Find an operative by exact friend code.
   */
  static async findByFriendCode(friendCode: string): Promise<PublicUserSummary | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqliteProfileRow>(
      `SELECT id, username, display_name, avatar_url, friend_code, global_level, rank_tier, rank_division, current_streak
       FROM profiles
       WHERE UPPER(friend_code) = UPPER(?);`,
      [friendCode.trim()]
    );

    if (!row) return null;

    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      friendCode: row.friend_code || 'ASC-0000',
      globalLevel: row.global_level,
      rankTier: (['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'].includes(row.rank_tier) ? row.rank_tier : 'E') as RankTier,
      rankDivision: row.rank_division,
      currentStreak: row.current_streak,
    };
  }

  /**
   * Send a friend request.
   * Throws if: self, blocked, already friends, pending request exists, or receiver disabled requests.
   */
  static async sendRequest(senderId: string, receiverId: string): Promise<FriendRequest> {
    if (senderId === receiverId) {
      throw new Error('Cannot send friend request to yourself');
    }

    const db = await getDatabase();

    // Check if either party blocked the other
    const blockCheck = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM blocks 
       WHERE (blocker_id = ? AND blocked_id = ?)
          OR (blocker_id = ? AND blocked_id = ?);`,
      [senderId, receiverId, receiverId, senderId]
    );
    if (blockCheck) {
      throw new Error('Unable to send request: operative unavailable');
    }

    // Check if already friends
    const friendCheck = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?;`,
      [senderId, receiverId]
    );
    if (friendCheck) {
      throw new Error('Operatives are already squadmates');
    }

    // Check if recipient allows friend requests
    const privacy = await db.getFirstAsync<{ allow_friend_requests: number }>(
      `SELECT allow_friend_requests FROM privacy_settings WHERE user_id = ?;`,
      [receiverId]
    );
    if (privacy && privacy.allow_friend_requests === 0) {
      throw new Error('Operative is not accepting friend requests');
    }

    // Check for reverse pending request — if B already requested A, auto-accept!
    const reverseReq = await db.getFirstAsync<SqliteFriendRequestRow>(
      `SELECT * FROM friend_requests 
       WHERE sender_id = ? AND receiver_id = ? AND status = 'PENDING';`,
      [receiverId, senderId]
    );
    if (reverseReq) {
      await this.acceptRequest(senderId, reverseReq.id);
      return {
        id: reverseReq.id,
        senderId: receiverId,
        receiverId: senderId,
        status: 'ACCEPTED',
        createdAt: reverseReq.created_at,
        updatedAt: new Date().toISOString(),
      };
    }

    // Check for existing pending request from A to B
    const existingReq = await db.getFirstAsync<SqliteFriendRequestRow>(
      `SELECT * FROM friend_requests 
       WHERE sender_id = ? AND receiver_id = ? AND status = 'PENDING';`,
      [senderId, receiverId]
    );
    if (existingReq) {
      return {
        id: existingReq.id,
        senderId: existingReq.sender_id,
        receiverId: existingReq.receiver_id,
        status: 'PENDING',
        createdAt: existingReq.created_at,
        updatedAt: existingReq.updated_at,
      };
    }

    const now = new Date().toISOString();
    const requestId = `freq-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    await db.runAsync(
      `INSERT INTO friend_requests (id, sender_id, receiver_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'PENDING', ?, ?);`,
      [requestId, senderId, receiverId, now, now]
    );

    return {
      id: requestId,
      senderId,
      receiverId,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Accept an incoming friend request.
   * Creates mutual bilateral friendships and updates request status.
   */
  static async acceptRequest(receiverId: string, requestId: string): Promise<void> {
    const db = await getDatabase();
    const req = await db.getFirstAsync<SqliteFriendRequestRow>(
      `SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ? AND status = 'PENDING';`,
      [requestId, receiverId]
    );
    if (!req) {
      throw new Error('Friend request not found or not pending');
    }

    const now = new Date().toISOString();

    // Update request status
    await db.runAsync(
      `UPDATE friend_requests SET status = 'ACCEPTED', updated_at = ? WHERE id = ?;`,
      [now, requestId]
    );

    // Insert bilateral friendship entries
    const fId1 = `frnd-${Date.now()}-1`;
    const fId2 = `frnd-${Date.now()}-2`;

    await db.runAsync(
      `INSERT OR IGNORE INTO friendships (id, user_id, friend_id, created_at)
       VALUES (?, ?, ?, ?);`,
      [fId1, req.sender_id, req.receiver_id, now]
    );

    await db.runAsync(
      `INSERT OR IGNORE INTO friendships (id, user_id, friend_id, created_at)
       VALUES (?, ?, ?, ?);`,
      [fId2, req.receiver_id, req.sender_id, now]
    );
  }

  /**
   * Reject an incoming friend request.
   */
  static async rejectRequest(receiverId: string, requestId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE friend_requests SET status = 'REJECTED', updated_at = ?
       WHERE id = ? AND receiver_id = ?;`,
      [now, requestId, receiverId]
    );
  }

  /**
   * Cancel an outgoing friend request.
   */
  static async cancelRequest(senderId: string, requestId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE friend_requests SET status = 'CANCELLED', updated_at = ?
       WHERE id = ? AND sender_id = ?;`,
      [now, requestId, senderId]
    );
  }

  /**
   * Remove a friend symmetrically.
   */
  static async removeFriend(userId: string, friendId: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `DELETE FROM friendships 
       WHERE (user_id = ? AND friend_id = ?)
          OR (user_id = ? AND friend_id = ?);`,
      [userId, friendId, friendId, userId]
    );
  }

  /**
   * Block an operative.
   * Dissolves friendships and purges pending requests between them.
   */
  static async blockUser(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new Error('Cannot block yourself');
    }

    const db = await getDatabase();
    const now = new Date().toISOString();
    const blockId = `blk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // 1. Insert block record
    await db.runAsync(
      `INSERT OR IGNORE INTO blocks (id, blocker_id, blocked_id, created_at)
       VALUES (?, ?, ?, ?);`,
      [blockId, blockerId, blockedId, now]
    );

    // 2. Remove friendship if exists
    await this.removeFriend(blockerId, blockedId);

    // 3. Cancel/reject any pending requests between both parties
    await db.runAsync(
      `DELETE FROM friend_requests
       WHERE (sender_id = ? AND receiver_id = ?)
          OR (sender_id = ? AND receiver_id = ?);`,
      [blockerId, blockedId, blockedId, blockerId]
    );
  }

  /**
   * Unblock an operative.
   */
  static async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?;`,
      [blockerId, blockedId]
    );
  }

  /**
   * Get an operative's active friend list.
   */
  static async getFriends(userId: string): Promise<PublicUserSummary[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SqliteProfileRow>(
      `SELECT p.id, p.username, p.display_name, p.avatar_url, p.friend_code, p.global_level, p.rank_tier, p.rank_division, p.current_streak
       FROM friendships f
       JOIN profiles p ON f.friend_id = p.id
       WHERE f.user_id = ?
         AND p.id NOT IN (
           SELECT blocked_id FROM blocks WHERE blocker_id = ?
           UNION
           SELECT blocker_id FROM blocks WHERE blocked_id = ?
         )
       ORDER BY p.global_level DESC, p.username ASC;`,
      [userId, userId, userId]
    );

    return rows.map(r => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      friendCode: r.friend_code || 'ASC-0000',
      globalLevel: r.global_level,
      rankTier: (['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'].includes(r.rank_tier) ? r.rank_tier : 'E') as RankTier,
      rankDivision: r.rank_division,
      currentStreak: r.current_streak,
    }));
  }

  /**
   * Get pending incoming friend requests.
   */
  static async getIncomingRequests(userId: string): Promise<FriendRequest[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<
      SqliteFriendRequestRow & {
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
      `SELECT fr.*, p.username, p.display_name, p.avatar_url, p.friend_code, p.global_level, p.rank_tier, p.rank_division, p.current_streak
       FROM friend_requests fr
       JOIN profiles p ON fr.sender_id = p.id
       WHERE fr.receiver_id = ?
         AND fr.status = 'PENDING'
         AND fr.sender_id NOT IN (
           SELECT blocked_id FROM blocks WHERE blocker_id = ?
           UNION
           SELECT blocker_id FROM blocks WHERE blocked_id = ?
         )
       ORDER BY fr.created_at DESC;`,
      [userId, userId, userId]
    );

    return rows.map(r => ({
      id: r.id,
      senderId: r.sender_id,
      receiverId: r.receiver_id,
      status: r.status as FriendRequestStatus,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      sender: {
        id: r.sender_id,
        username: r.username,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        friendCode: r.friend_code || 'ASC-0000',
        globalLevel: r.global_level,
        rankTier: (['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'].includes(r.rank_tier) ? r.rank_tier : 'E') as RankTier,
        rankDivision: r.rank_division,
        currentStreak: r.current_streak,
      },
    }));
  }

  /**
   * Get pending outgoing friend requests.
   */
  static async getOutgoingRequests(userId: string): Promise<FriendRequest[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<
      SqliteFriendRequestRow & {
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
      `SELECT fr.*, p.username, p.display_name, p.avatar_url, p.friend_code, p.global_level, p.rank_tier, p.rank_division, p.current_streak
       FROM friend_requests fr
       JOIN profiles p ON fr.receiver_id = p.id
       WHERE fr.sender_id = ?
         AND fr.status = 'PENDING'
         AND fr.receiver_id NOT IN (
           SELECT blocked_id FROM blocks WHERE blocker_id = ?
           UNION
           SELECT blocker_id FROM blocks WHERE blocked_id = ?
         )
       ORDER BY fr.created_at DESC;`,
      [userId, userId, userId]
    );

    return rows.map(r => ({
      id: r.id,
      senderId: r.sender_id,
      receiverId: r.receiver_id,
      status: r.status as FriendRequestStatus,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      receiver: {
        id: r.receiver_id,
        username: r.username,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        friendCode: r.friend_code || 'ASC-0000',
        globalLevel: r.global_level,
        rankTier: (['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'].includes(r.rank_tier) ? r.rank_tier : 'E') as RankTier,
        rankDivision: r.rank_division,
        currentStreak: r.current_streak,
      },
    }));
  }

  /**
   * Get blocked operatives.
   */
  static async getBlockedUsers(userId: string): Promise<PublicUserSummary[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SqliteProfileRow>(
      `SELECT p.id, p.username, p.display_name, p.avatar_url, p.friend_code, p.global_level, p.rank_tier, p.rank_division, p.current_streak
       FROM blocks b
       JOIN profiles p ON b.blocked_id = p.id
       WHERE b.blocker_id = ?
       ORDER BY b.created_at DESC;`,
      [userId]
    );

    return rows.map(r => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      friendCode: r.friend_code || 'ASC-0000',
      globalLevel: r.global_level,
      rankTier: (['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'].includes(r.rank_tier) ? r.rank_tier : 'E') as RankTier,
      rankDivision: r.rank_division,
      currentStreak: r.current_streak,
    }));
  }

  /**
   * Check if two users are mutual friends.
   */
  static async areFriends(userA: string, userB: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?;`,
      [userA, userB]
    );
    return Boolean(row);
  }

  /**
   * Check if either user has blocked the other.
   */
  static async isBlocked(userA: string, userB: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM blocks 
       WHERE (blocker_id = ? AND blocked_id = ?)
          OR (blocker_id = ? AND blocked_id = ?);`,
      [userA, userB, userB, userA]
    );
    return Boolean(row);
  }

  /**
   * Determine the relationship status between two users.
   */
  static async getRelationship(
    currentUserId: string,
    targetUserId: string
  ): Promise<'SELF' | 'FRIEND' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'NONE' | 'BLOCKED'> {
    if (currentUserId === targetUserId) return 'SELF';

    const db = await getDatabase();

    // Check blocks
    const block = await db.getFirstAsync<{ blocker_id: string }>(
      `SELECT blocker_id FROM blocks 
       WHERE (blocker_id = ? AND blocked_id = ?)
          OR (blocker_id = ? AND blocked_id = ?);`,
      [currentUserId, targetUserId, targetUserId, currentUserId]
    );
    if (block) return 'BLOCKED';

    // Check friendship
    const friend = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?;`,
      [currentUserId, targetUserId]
    );
    if (friend) return 'FRIEND';

    // Check pending request sent by me
    const reqSent = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM friend_requests 
       WHERE sender_id = ? AND receiver_id = ? AND status = 'PENDING';`,
      [currentUserId, targetUserId]
    );
    if (reqSent) return 'REQUEST_SENT';

    // Check pending request received from them
    const reqReceived = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM friend_requests 
       WHERE sender_id = ? AND receiver_id = ? AND status = 'PENDING';`,
      [targetUserId, currentUserId]
    );
    if (reqReceived) return 'REQUEST_RECEIVED';

    return 'NONE';
  }
}
