import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FriendService } from '../FriendService';
import { SocialFeedService } from '../SocialFeedService';
import { FriendProfileService } from '../FriendProfileService';
import { ActivityReactionType } from '../../../types/social.types';

// In-memory mock database state
const { mockDb, tables } = vi.hoisted(() => {
  const state = {
    profiles: [] as any[],
    friendships: [] as any[],
    friend_requests: [] as any[],
    blocks: [] as any[],
    privacy_settings: [] as any[],
    activity_feed: [] as any[],
    activity_reactions: [] as any[],
  };

  const db = {
    runAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      // INSERT INTO blocks
      if (s.startsWith('INSERT INTO blocks') || s.startsWith('INSERT OR IGNORE INTO blocks')) {
        const [id, blocker_id, blocked_id, created_at] = params;
        state.blocks.push({ id, blocker_id, blocked_id, created_at });
        return { changes: 1 };
      }

      // DELETE FROM blocks
      if (s.startsWith('DELETE FROM blocks')) {
        const [blocker_id, blocked_id] = params;
        const init = state.blocks.length;
        state.blocks = state.blocks.filter(b => !(b.blocker_id === blocker_id && b.blocked_id === blocked_id));
        return { changes: init - state.blocks.length };
      }

      // INSERT INTO friendships
      if (s.startsWith('INSERT INTO friendships') || s.startsWith('INSERT OR IGNORE INTO friendships')) {
        const [id, user_id, friend_id, created_at] = params;
        if (!state.friendships.some(f => f.user_id === user_id && f.friend_id === friend_id)) {
          state.friendships.push({ id, user_id, friend_id, created_at });
        }
        return { changes: 1 };
      }

      // DELETE FROM friendships
      if (s.startsWith('DELETE FROM friendships')) {
        const [u1, f1, u2, f2] = params;
        const init = state.friendships.length;
        state.friendships = state.friendships.filter(
          f => !(
            (f.user_id === u1 && f.friend_id === f1) ||
            (f.user_id === u2 && f.friend_id === f2)
          )
        );
        return { changes: init - state.friendships.length };
      }

      // DELETE FROM friend_requests
      if (s.startsWith('DELETE FROM friend_requests')) {
        const [u1, u2, u3, u4] = params;
        state.friend_requests = state.friend_requests.filter(
          r => !(
            (r.sender_id === u1 && r.receiver_id === u2) ||
            (r.sender_id === u3 && r.receiver_id === u4)
          )
        );
        return { changes: 1 };
      }

      // INSERT INTO activity_feed
      if (s.startsWith('INSERT INTO activity_feed')) {
        const [id, user_id, event_type, title, summary, metadata, visibility, created_at] = params;
        state.activity_feed.push({
          id,
          user_id,
          event_type,
          title,
          summary,
          metadata,
          visibility,
          likes_count: 0,
          created_at,
        });
        return { changes: 1 };
      }

      // INSERT INTO activity_reactions
      if (s.startsWith('INSERT INTO activity_reactions')) {
        const [id, activity_id, user_id, reaction_type, created_at] = params;
        state.activity_reactions.push({
          id,
          activity_id,
          user_id,
          reaction_type,
          created_at,
        });
        return { changes: 1 };
      }

      // DELETE FROM activity_reactions
      if (s.startsWith('DELETE FROM activity_reactions')) {
        const [activity_id, user_id, reaction_type] = params;
        state.activity_reactions = state.activity_reactions.filter(
          r => !(r.activity_id === activity_id && r.user_id === user_id && r.reaction_type === reaction_type)
        );
        return { changes: 1 };
      }

      // UPDATE activity_feed SET likes_count
      if (s.startsWith('UPDATE activity_feed SET likes_count')) {
        return { changes: 1 };
      }

      return { changes: 1 };
    }),

    getFirstAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.includes('FROM blocks')) {
        const [p1, p2, p3, p4] = params;
        return state.blocks.find(
          b => (b.blocker_id === p1 && b.blocked_id === p2) || (b.blocker_id === p3 && b.blocked_id === p4)
        ) || null;
      }
      if (s.includes('FROM friendships WHERE user_id = ? AND friend_id = ?')) {
        const [u, f] = params;
        return state.friendships.find(fr => fr.user_id === u && fr.friend_id === f) || null;
      }
      if (s.includes('FROM privacy_settings WHERE user_id = ?')) {
        const [userId] = params;
        const existing = state.privacy_settings.find(ps => ps.user_id === userId);
        if (existing) return existing;
        return {
          id: `ps-${userId}`,
          user_id: userId,
          profile_visibility: 'FRIENDS',
          feed_visibility_default: 'FRIENDS',
          show_workouts_in_feed: 1,
          show_prs_in_feed: 1,
          show_level_ups_in_feed: 1,
          show_rank_ups_in_feed: 1,
          show_achievements_in_feed: 1,
          show_challenges_in_feed: 1,
          show_evolution_in_feed: 1,
          allow_friend_requests: 1,
          show_mastery_on_profile: 1,
          show_achievements_on_profile: 1,
          show_streak_on_profile: 1,
        };
      }
      if (s.includes('FROM profiles WHERE id = ?')) {
        const [id] = params;
        return state.profiles.find(p => p.id === id) || null;
      }
      if (s.includes('FROM activity_reactions WHERE activity_id = ? AND user_id = ? AND reaction_type = ?')) {
        const [actId, uId, rxType] = params;
        return state.activity_reactions.find(
          r => r.activity_id === actId && r.user_id === uId && r.reaction_type === rxType
        ) || null;
      }
      return null;
    }),

    getAllAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      // Search users
      if (s.includes('FROM profiles p') && s.includes('UPPER(p.friend_code) = ?')) {
        const [currentUserId, code, patternUser, patternDisplay] = params;
        const queryTerm = patternUser.replace(/%/g, '').toLowerCase();
        return state.profiles.filter(p => {
          if (p.id === currentUserId) return false;
          // check blocks
          const isBlocked = state.blocks.some(
            b => (b.blocker_id === currentUserId && b.blocked_id === p.id) ||
                 (b.blocker_id === p.id && b.blocked_id === currentUserId)
          );
          if (isBlocked) return false;
          return (
            p.friend_code?.toUpperCase() === code ||
            p.username.toLowerCase().includes(queryTerm) ||
            p.display_name.toLowerCase().includes(queryTerm)
          );
        });
      }

      // Friends list
      if (s.includes('FROM friendships f') && s.includes('JOIN profiles p ON f.friend_id = p.id')) {
        const userId = params[0];
        const friendIds = state.friendships.filter(f => f.user_id === userId).map(f => f.friend_id);
        return state.profiles.filter(p => {
          if (!friendIds.includes(p.id)) return false;
          const isBlocked = state.blocks.some(
            b => (b.blocker_id === userId && b.blocked_id === p.id) ||
                 (b.blocker_id === p.id && b.blocked_id === userId)
          );
          return !isBlocked;
        });
      }

      // Activity feed query
      if (s.includes('FROM activity_feed af') && s.includes('JOIN profiles p ON af.user_id = p.id')) {
        const [currentUserId] = params;
        return state.activity_feed
          .filter(af => {
            // Block check
            const isBlocked = state.blocks.some(
              b => (b.blocker_id === currentUserId && b.blocked_id === af.user_id) ||
                   (b.blocker_id === af.user_id && b.blocked_id === currentUserId)
            );
            if (isBlocked) return false;

            // Visibility filter
            if (af.user_id === currentUserId) return true;
            if (af.visibility === 'PUBLIC') return true;
            if (af.visibility === 'FRIENDS') {
              return state.friendships.some(f => f.user_id === currentUserId && f.friend_id === af.user_id);
            }
            return false;
          })
          .map(af => {
            const author = state.profiles.find(p => p.id === af.user_id);
            return {
              ...af,
              username: author?.username || 'user',
              display_name: author?.display_name || 'Operative',
              avatar_url: author?.avatar_url || '⚔️',
              friend_code: author?.friend_code || 'ASC-0000',
              global_level: author?.global_level || 1,
              rank_tier: author?.rank_tier || 'E',
              rank_division: author?.rank_division || 4,
              current_streak: author?.current_streak || 0,
            };
          });
      }

      // Activity reactions batch query
      if (s.includes('FROM activity_reactions WHERE activity_id IN')) {
        return state.activity_reactions;
      }

      return [];
    }),
  };

  return { mockDb: db, tables: state };
});

vi.mock('../../../database/sqlite', () => ({
  getDatabase: vi.fn().mockResolvedValue(mockDb),
}));

describe('Block Mechanism and Athletic Interactions', () => {
  const userA = {
    id: 'user-alpha',
    username: 'vanguard_alpha',
    display_name: 'Alpha Vanguard',
    avatar_url: '⚔️',
    friend_code: 'ASC-ALPH-0001',
    global_level: 25,
    rank_tier: 'B',
    rank_division: 2,
    current_streak: 12,
  };

  const userB = {
    id: 'user-bravo',
    username: 'iron_bravo',
    display_name: 'Bravo Operator',
    avatar_url: '🛡️',
    friend_code: 'ASC-BRAV-0002',
    global_level: 18,
    rank_tier: 'C',
    rank_division: 1,
    current_streak: 5,
  };

  const userC = {
    id: 'user-charlie',
    username: 'charlie_scout',
    display_name: 'Charlie Scout',
    avatar_url: '⚡',
    friend_code: 'ASC-CHAR-0003',
    global_level: 12,
    rank_tier: 'D',
    rank_division: 3,
    current_streak: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tables.profiles = [{ ...userA }, { ...userB }, { ...userC }];
    tables.friendships = [
      { id: 'fr-1', user_id: userA.id, friend_id: userB.id },
      { id: 'fr-2', user_id: userB.id, friend_id: userA.id },
    ];
    tables.friend_requests = [
      { id: 'req-old', sender_id: userB.id, receiver_id: userA.id, status: 'PENDING' },
    ];
    tables.blocks = [];
    const makeSettings = (userId: string) => ({
      id: `ps-${userId}`,
      user_id: userId,
      profile_visibility: 'FRIENDS',
      feed_visibility_default: 'FRIENDS',
      show_workouts_in_feed: 1,
      show_prs_in_feed: 1,
      show_level_ups_in_feed: 1,
      show_rank_ups_in_feed: 1,
      show_achievements_in_feed: 1,
      show_challenges_in_feed: 1,
      show_evolution_in_feed: 1,
      allow_friend_requests: 1,
      show_mastery_on_profile: 1,
      show_achievements_on_profile: 1,
      show_streak_on_profile: 1,
    });
    tables.privacy_settings = [
      makeSettings(userA.id),
      makeSettings(userB.id),
      makeSettings(userC.id),
    ];
    tables.activity_feed = [];
    tables.activity_reactions = [];
  });

  describe('1. Blocking Architecture and Enforcement', () => {
    it('blocking dissolves bilateral friendship and purges pending requests', async () => {
      // User A blocks User B
      await FriendService.blockUser(userA.id, userB.id);

      // Check block record created
      expect(tables.blocks).toHaveLength(1);
      expect(tables.blocks[0].blocker_id).toBe(userA.id);
      expect(tables.blocks[0].blocked_id).toBe(userB.id);

      // Symmetrical friendship severed
      expect(tables.friendships).toHaveLength(0);
      expect(await FriendService.getFriends(userA.id)).toHaveLength(0);
      expect(await FriendService.getFriends(userB.id)).toHaveLength(0);

      // Pending requests wiped
      expect(tables.friend_requests).toHaveLength(0);

      // Relationship checks
      expect(await FriendService.isBlocked(userA.id, userB.id)).toBe(true);
      expect(await FriendService.isBlocked(userB.id, userA.id)).toBe(true);
      expect(await FriendService.getRelationship(userA.id, userB.id)).toBe('BLOCKED');
      expect(await FriendService.getRelationship(userB.id, userA.id)).toBe('BLOCKED');
    });

    it('blocked user cannot send friend requests to blocker', async () => {
      await FriendService.blockUser(userA.id, userB.id);

      await expect(
        FriendService.sendFriendRequest(userB.id, userA.id)
      ).rejects.toThrow('operative unavailable');
    });

    it('blocked users are completely excluded from search results', async () => {
      await FriendService.blockUser(userA.id, userB.id);

      // User A searching for Bravo -> empty
      const searchFromA = await FriendService.searchOperatives(userA.id, 'bravo');
      expect(searchFromA).toHaveLength(0);

      // User B searching for Alpha -> empty
      const searchFromB = await FriendService.searchOperatives(userB.id, 'alpha');
      expect(searchFromB).toHaveLength(0);

      // Charlie (unrelated) can still search and find both
      const searchFromC = await FriendService.searchOperatives(userC.id, 'alpha');
      expect(searchFromC).toHaveLength(1);
      expect(searchFromC[0].id).toBe(userA.id);
    });

    it('public profile dossier returns null if operative is blocked', async () => {
      await FriendService.blockUser(userA.id, userB.id);

      const dossierForB = await FriendProfileService.getPublicProfile(userB.id, userA.id);
      expect(dossierForB).toBeNull();

      const dossierForA = await FriendProfileService.getPublicProfile(userA.id, userB.id);
      expect(dossierForA).toBeNull();
    });

    it('unblocking removes restriction and restores searchability', async () => {
      await FriendService.blockUser(userA.id, userB.id);
      expect(await FriendService.isBlocked(userA.id, userB.id)).toBe(true);

      // User A unblocks User B
      await FriendService.unblockUser(userA.id, userB.id);
      expect(await FriendService.isBlocked(userA.id, userB.id)).toBe(false);
      expect(tables.blocks).toHaveLength(0);

      // Searchability restored
      const searchAfter = await FriendService.searchOperatives(userA.id, 'bravo');
      expect(searchAfter).toHaveLength(1);
      expect(searchAfter[0].id).toBe(userB.id);
    });
  });

  describe('2. Feed Isolation and Athletic Interactions', () => {
    it('excludes blocked users items from activity feed', async () => {
      // User B creates a public activity
      await SocialFeedService.publishEvent(userB.id, {
        eventType: 'WORKOUT_COMPLETED',
        title: 'Tactical Back Session',
        summary: 'Heavy pulls and rows',
        visibility: 'PUBLIC',
      });

      // Initially User A can see User B's post
      const feedBefore = await SocialFeedService.getFeed(userA.id);
      expect(feedBefore).toHaveLength(1);
      expect(feedBefore[0].userId).toBe(userB.id);

      // User A blocks User B
      await FriendService.blockUser(userA.id, userB.id);

      // Now User A's feed is isolated: User B's post does not appear
      const feedAfter = await SocialFeedService.getFeed(userA.id);
      expect(feedAfter).toHaveLength(0);
    });

    it('supports athletic reactions (toggle, breakdown, and userReaction tracking)', async () => {
      // User A publishes PR event
      const item = await SocialFeedService.publishEvent(userA.id, {
        eventType: 'PR_ACHIEVED',
        title: 'NEW PR: Barbell Deadlift',
        summary: '220 kg breakthrough',
        metadata: { prExerciseName: 'Barbell Deadlift', prValue: 220 },
        visibility: 'PUBLIC',
      });
      expect(item).not.toBeNull();
      const activityId = item!.id;

      // 1. User B reacts with FIRE 🔥
      await SocialFeedService.reactToActivity(userB.id, activityId, 'FIRE');

      // Verify reaction stored
      expect(tables.activity_reactions).toHaveLength(1);
      expect(tables.activity_reactions[0].reaction_type).toBe('FIRE');
      expect(tables.activity_reactions[0].user_id).toBe(userB.id);

      // User B reads feed -> sees FIRE count = 1 and userReaction = FIRE
      let feedB = await SocialFeedService.getFeed(userB.id);
      expect(feedB[0]?.reactions?.FIRE).toBe(1);
      expect(feedB[0]?.userReaction).toBe('FIRE');
      expect(feedB[0]?.likesCount).toBe(1);

      // 2. User C also reacts with WARRIOR ⚔️ and PRECISION 🎯
      await SocialFeedService.reactToActivity(userC.id, activityId, 'WARRIOR');
      await SocialFeedService.reactToActivity(userC.id, activityId, 'PRECISION');

      let feedC = await SocialFeedService.getFeed(userC.id);
      expect(feedC[0]?.reactions?.FIRE).toBe(1);
      expect(feedC[0]?.reactions?.WARRIOR).toBe(1);
      expect(feedC[0]?.reactions?.PRECISION).toBe(1);
      expect(feedC[0]?.likesCount).toBe(3);

      // 3. User B toggles FIRE off (tapping FIRE again un-reacts)
      await SocialFeedService.reactToActivity(userB.id, activityId, 'FIRE');

      feedB = await SocialFeedService.getFeed(userB.id);
      expect(feedB[0]?.reactions?.FIRE).toBe(0);
      expect(feedB[0]?.userReaction).toBeNull();
      expect(feedB[0]?.likesCount).toBe(2); // WARRIOR + PRECISION remain
    });
  });
});
