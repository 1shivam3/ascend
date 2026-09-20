import { FriendRepository } from '../../database/repositories/FriendRepository';
import { ProfileRepository } from '../../database/repositories/ProfileRepository';
import {
  FriendRequest,
  PublicUserSummary,
} from '../../types/social.types';

export class FriendService {
  /**
   * Search operatives by callsign, display name, or friend code.
   */
  static async searchOperatives(
    currentUserId: string,
    query: string
  ): Promise<PublicUserSummary[]> {
    return FriendRepository.searchUsers(currentUserId, query);
  }

  /**
   * Look up an operative by their exact friend code.
   */
  static async lookupByFriendCode(friendCode: string): Promise<PublicUserSummary | null> {
    return FriendRepository.findByFriendCode(friendCode);
  }

  /**
   * Send a friend request by friend code, user ID, or username.
   */
  static async sendFriendRequest(
    senderId: string,
    targetIdentifier: string
  ): Promise<FriendRequest> {
    const trimmed = targetIdentifier.trim();
    if (!trimmed) {
      throw new Error('Please enter a valid callsign or friend code');
    }

    let targetUserId = trimmed;

    // Check if targetIdentifier is a friend code (starts with ASC-)
    if (trimmed.toUpperCase().startsWith('ASC-')) {
      const targetUser = await FriendRepository.findByFriendCode(trimmed);
      if (!targetUser) {
        throw new Error(`Operative with friend code "${trimmed}" not found`);
      }
      targetUserId = targetUser.id;
    } else {
      // Check if it matches an existing profile ID directly
      const direct = await ProfileRepository.getProfile(trimmed);
      if (!direct) {
        // Search by exact username
        const candidates = await FriendRepository.searchUsers(senderId, trimmed);
        const match = candidates.find(
          c => c.username.toLowerCase() === trimmed.toLowerCase()
        );
        if (!match) {
          throw new Error(`Operative "${trimmed}" not found`);
        }
        targetUserId = match.id;
      }
    }

    return FriendRepository.sendRequest(senderId, targetUserId);
  }

  /**
   * Accept an incoming friend request.
   */
  static async acceptFriendRequest(receiverId: string, requestId: string): Promise<void> {
    return FriendRepository.acceptRequest(receiverId, requestId);
  }

  /**
   * Reject an incoming friend request.
   */
  static async rejectFriendRequest(receiverId: string, requestId: string): Promise<void> {
    return FriendRepository.rejectRequest(receiverId, requestId);
  }

  /**
   * Cancel a sent friend request.
   */
  static async cancelFriendRequest(senderId: string, requestId: string): Promise<void> {
    return FriendRepository.cancelRequest(senderId, requestId);
  }

  /**
   * Remove an operative from friends symmetrically.
   */
  static async removeFriend(userId: string, friendId: string): Promise<void> {
    return FriendRepository.removeFriend(userId, friendId);
  }

  /**
   * Block an operative.
   */
  static async blockUser(blockerId: string, blockedId: string): Promise<void> {
    return FriendRepository.blockUser(blockerId, blockedId);
  }

  /**
   * Unblock an operative.
   */
  static async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    return FriendRepository.unblockUser(blockerId, blockedId);
  }

  /**
   * Retrieve active friends list.
   */
  static async getFriends(userId: string): Promise<PublicUserSummary[]> {
    return FriendRepository.getFriends(userId);
  }

  /**
   * Retrieve incoming friend requests.
   */
  static async getIncomingRequests(userId: string): Promise<FriendRequest[]> {
    return FriendRepository.getIncomingRequests(userId);
  }

  /**
   * Retrieve outgoing friend requests.
   */
  static async getOutgoingRequests(userId: string): Promise<FriendRequest[]> {
    return FriendRepository.getOutgoingRequests(userId);
  }

  /**
   * Retrieve blocked operatives.
   */
  static async getBlockedUsers(userId: string): Promise<PublicUserSummary[]> {
    return FriendRepository.getBlockedUsers(userId);
  }

  /**
   * Check relationship between current user and target user.
   */
  static async getRelationship(
    currentUserId: string,
    targetUserId: string
  ): Promise<'SELF' | 'FRIEND' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'NONE' | 'BLOCKED'> {
    return FriendRepository.getRelationship(currentUserId, targetUserId);
  }

  /**
   * Check if either party has blocked the other.
   */
  static async isBlocked(userId1: string, userId2: string): Promise<boolean> {
    return FriendRepository.isBlocked(userId1, userId2);
  }
}

