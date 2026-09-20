import { create } from 'zustand';
import {
  ActivityFeedItem,
  ActivityReactionType,
  FriendRequest,
  PrivacySettings,
  PublicUserSummary,
} from '../types/social.types';
import { FriendService } from '../services/social/FriendService';
import { SocialFeedService } from '../services/social/SocialFeedService';
import { PrivacyService } from '../services/social/PrivacyService';

interface SocialState {
  friends: PublicUserSummary[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  blockedUsers: PublicUserSummary[];
  feedItems: ActivityFeedItem[];
  feedFilter: 'ALL' | 'SQUAD' | 'GLOBAL';
  privacySettings: PrivacySettings | null;
  isLoading: boolean;
  isSearching: boolean;
  searchResults: PublicUserSummary[];

  // Actions
  loadAllSocialData: (userId: string) => Promise<void>;
  loadFeed: (userId: string, filter?: 'ALL' | 'SQUAD' | 'GLOBAL') => Promise<void>;
  setFeedFilter: (userId: string, filter: 'ALL' | 'SQUAD' | 'GLOBAL') => Promise<void>;
  loadFriends: (userId: string) => Promise<void>;
  loadRequests: (userId: string) => Promise<void>;
  loadBlocked: (userId: string) => Promise<void>;
  loadPrivacySettings: (userId: string) => Promise<PrivacySettings>;
  updatePrivacySettings: (userId: string, updates: Partial<PrivacySettings>) => Promise<void>;
  searchOperatives: (userId: string, query: string) => Promise<PublicUserSummary[]>;
  clearSearch: () => void;
  sendFriendRequest: (senderId: string, targetIdentifier: string) => Promise<void>;
  acceptFriendRequest: (receiverId: string, requestId: string) => Promise<void>;
  rejectFriendRequest: (receiverId: string, requestId: string) => Promise<void>;
  cancelFriendRequest: (senderId: string, requestId: string) => Promise<void>;
  removeFriend: (userId: string, friendId: string) => Promise<void>;
  blockUser: (blockerId: string, blockedId: string) => Promise<void>;
  unblockUser: (blockerId: string, blockedId: string) => Promise<void>;
  reactToActivity: (userId: string, activityId: string, reactionType: ActivityReactionType) => Promise<void>;
  deleteActivity: (userId: string, activityId: string) => Promise<void>;
}

export const useSocialStore = create<SocialState>((set, get) => ({
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  blockedUsers: [],
  feedItems: [],
  feedFilter: 'ALL',
  privacySettings: null,
  isLoading: false,
  isSearching: false,
  searchResults: [],

  loadAllSocialData: async (userId: string) => {
    if (!userId) return;
    set({ isLoading: true });
    try {
      const [friends, incoming, outgoing, blocked, feed, privacy] = await Promise.all([
        FriendService.getFriends(userId),
        FriendService.getIncomingRequests(userId),
        FriendService.getOutgoingRequests(userId),
        FriendService.getBlockedUsers(userId),
        SocialFeedService.getFeed(userId, get().feedFilter),
        PrivacyService.getSettings(userId),
      ]);
      set({
        friends,
        incomingRequests: incoming,
        outgoingRequests: outgoing,
        blockedUsers: blocked,
        feedItems: feed,
        privacySettings: privacy,
      });
    } catch (err) {
      console.error('Failed to load social telemetry:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  loadFeed: async (userId: string, filter?: 'ALL' | 'SQUAD' | 'GLOBAL') => {
    if (!userId) return;
    const targetFilter = filter || get().feedFilter;
    try {
      const feedItems = await SocialFeedService.getFeed(userId, targetFilter);
      set({ feedItems, feedFilter: targetFilter });
    } catch (err) {
      console.error('Failed to load feed:', err);
    }
  },

  setFeedFilter: async (userId: string, filter: 'ALL' | 'SQUAD' | 'GLOBAL') => {
    set({ feedFilter: filter });
    await get().loadFeed(userId, filter);
  },

  loadFriends: async (userId: string) => {
    if (!userId) return;
    try {
      const friends = await FriendService.getFriends(userId);
      set({ friends });
    } catch (err) {
      console.error('Failed to load friends:', err);
    }
  },

  loadRequests: async (userId: string) => {
    if (!userId) return;
    try {
      const [incoming, outgoing] = await Promise.all([
        FriendService.getIncomingRequests(userId),
        FriendService.getOutgoingRequests(userId),
      ]);
      set({ incomingRequests: incoming, outgoingRequests: outgoing });
    } catch (err) {
      console.error('Failed to load requests:', err);
    }
  },

  loadBlocked: async (userId: string) => {
    if (!userId) return;
    try {
      const blockedUsers = await FriendService.getBlockedUsers(userId);
      set({ blockedUsers });
    } catch (err) {
      console.error('Failed to load blocked users:', err);
    }
  },

  loadPrivacySettings: async (userId: string) => {
    const privacySettings = await PrivacyService.getSettings(userId);
    set({ privacySettings });
    return privacySettings;
  },

  updatePrivacySettings: async (userId: string, updates: Partial<PrivacySettings>) => {
    const updated = await PrivacyService.updateSettings(userId, updates);
    set({ privacySettings: updated });
  },

  searchOperatives: async (userId: string, query: string) => {
    set({ isSearching: true });
    try {
      const searchResults = await FriendService.searchOperatives(userId, query);
      set({ searchResults });
      return searchResults;
    } catch (err) {
      console.error('Search error:', err);
      set({ searchResults: [] });
      return [];
    } finally {
      set({ isSearching: false });
    }
  },

  clearSearch: () => set({ searchResults: [], isSearching: false }),

  sendFriendRequest: async (senderId: string, targetIdentifier: string) => {
    await FriendService.sendFriendRequest(senderId, targetIdentifier);
    await Promise.all([
      get().loadRequests(senderId),
      get().loadFriends(senderId),
    ]);
  },

  acceptFriendRequest: async (receiverId: string, requestId: string) => {
    await FriendService.acceptFriendRequest(receiverId, requestId);
    await Promise.all([
      get().loadFriends(receiverId),
      get().loadRequests(receiverId),
      get().loadFeed(receiverId),
    ]);
  },

  rejectFriendRequest: async (receiverId: string, requestId: string) => {
    await FriendService.rejectFriendRequest(receiverId, requestId);
    await get().loadRequests(receiverId);
  },

  cancelFriendRequest: async (senderId: string, requestId: string) => {
    await FriendService.cancelFriendRequest(senderId, requestId);
    await get().loadRequests(senderId);
  },

  removeFriend: async (userId: string, friendId: string) => {
    await FriendService.removeFriend(userId, friendId);
    await Promise.all([
      get().loadFriends(userId),
      get().loadFeed(userId),
    ]);
  },

  blockUser: async (blockerId: string, blockedId: string) => {
    await FriendService.blockUser(blockerId, blockedId);
    await Promise.all([
      get().loadFriends(blockerId),
      get().loadRequests(blockerId),
      get().loadBlocked(blockerId),
      get().loadFeed(blockerId),
    ]);
  },

  unblockUser: async (blockerId: string, blockedId: string) => {
    await FriendService.unblockUser(blockerId, blockedId);
    await get().loadBlocked(blockerId);
  },

  reactToActivity: async (
    userId: string,
    activityId: string,
    reactionType: ActivityReactionType
  ) => {
    await SocialFeedService.reactToActivity(userId, activityId, reactionType);
    // Refresh feed to get updated counts & user reaction state
    await get().loadFeed(userId);
  },

  deleteActivity: async (userId: string, activityId: string) => {
    await SocialFeedService.deleteActivity(userId, activityId);
    await get().loadFeed(userId);
  },
}));
