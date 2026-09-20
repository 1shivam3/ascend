import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChallengeEngine } from '../ChallengeEngine';
import { ChallengeRepository } from '../../../database/repositories/ChallengeRepository';
import { FriendRepository } from '../../../database/repositories/FriendRepository';
import { Challenge, ChallengeParticipant } from '../../../types/challenge.types';

// Mock sqlite database in-memory emulation
const { mockDb, state } = vi.hoisted(() => {
  const state = {
    challenges: [] as any[],
    challenge_participants: [] as any[],
    challenge_events: [] as any[],
    friendships: [] as any[],
    blocks: [] as any[],
    profiles: [] as any[],
  };

  const db = {
    runAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.startsWith('INSERT INTO challenges')) {
        const [
          id, title, description, type, metric, target, start_at, end_at,
          visibility, created_by, status, config, reward_xp, created_at, updated_at
        ] = params;
        state.challenges.push({
          id, title, description, type, metric, target, start_at, end_at,
          visibility, created_by, status, config, reward_xp, created_at, updated_at
        });
        return { changes: 1 };
      }

      if (s.startsWith('INSERT INTO challenge_participants')) {
        const [id, challenge_id, user_id, joined_at, last_updated_at] = params;
        state.challenge_participants.push({
          id,
          challenge_id,
          user_id,
          progress: 0.0,
          rank: 1,
          status: 'ACTIVE',
          joined_at,
          completed_at: null,
          last_updated_at,
        });
        return { changes: 1 };
      }

      if (s.startsWith('UPDATE challenge_participants SET status = \'ACTIVE\'')) {
        const [last_updated_at, challenge_id, user_id] = params;
        const p = state.challenge_participants.find(
          cp => cp.challenge_id === challenge_id && cp.user_id === user_id
        );
        if (p) {
          p.status = 'ACTIVE';
          p.last_updated_at = last_updated_at;
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      if (s.startsWith('UPDATE challenge_participants SET status = \'LEFT\'')) {
        const [last_updated_at, challenge_id, user_id] = params;
        const p = state.challenge_participants.find(
          cp => cp.challenge_id === challenge_id && cp.user_id === user_id
        );
        if (p) {
          p.status = 'LEFT';
          p.last_updated_at = last_updated_at;
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      if (s.startsWith('UPDATE challenge_participants SET progress =')) {
        const [progress, status, completed_at, last_updated_at, challenge_id, user_id] = params;
        const p = state.challenge_participants.find(
          cp => cp.challenge_id === challenge_id && cp.user_id === user_id
        );
        if (p) {
          p.progress = progress;
          p.status = status;
          if (completed_at) p.completed_at = completed_at;
          p.last_updated_at = last_updated_at;
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      if (s.startsWith('UPDATE challenge_participants SET rank =')) {
        const [rank, id] = params;
        const p = state.challenge_participants.find(cp => cp.id === id);
        if (p) {
          p.rank = rank;
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      if (s.startsWith('INSERT INTO challenge_events')) {
        const [id, challenge_id, user_id, event_id, event_type, contribution_value, processed_at] = params;
        state.challenge_events.push({
          id, challenge_id, user_id, event_id, event_type, contribution_value, processed_at
        });
        return { changes: 1 };
      }

      return { changes: 0 };
    }),

    getFirstAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.startsWith('SELECT * FROM challenges WHERE id = ?')) {
        const [id] = params;
        return state.challenges.find(c => c.id === id) || null;
      }

      if (s.startsWith('SELECT * FROM challenge_participants WHERE challenge_id = ? AND user_id = ?')) {
        const [challenge_id, user_id] = params;
        return state.challenge_participants.find(
          cp => cp.challenge_id === challenge_id && cp.user_id === user_id
        ) || null;
      }

      if (s.startsWith('SELECT id FROM challenge_events WHERE challenge_id = ? AND user_id = ? AND event_id = ?')) {
        const [challenge_id, user_id, event_id] = params;
        return state.challenge_events.find(
          ce => ce.challenge_id === challenge_id && ce.user_id === user_id && ce.event_id === event_id
        ) || null;
      }

      if (s.startsWith('SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?')) {
        const [user_id, friend_id] = params;
        return state.friendships.find(
          f => f.user_id === user_id && f.friend_id === friend_id
        ) || null;
      }

      return null;
    }),

    getAllAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.startsWith('SELECT id FROM challenge_participants WHERE challenge_id = ? AND status != \'LEFT\'')) {
        const [challenge_id] = params;
        const list = state.challenge_participants
          .filter(cp => cp.challenge_id === challenge_id && cp.status !== 'LEFT')
          .sort((a, b) => {
            // Completed first (earliest completed_at wins), then progress desc
            if (a.completed_at && !b.completed_at) return -1;
            if (!a.completed_at && b.completed_at) return 1;
            if (a.completed_at && b.completed_at) {
              return new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime();
            }
            return b.progress - a.progress;
          });
        return list.map(cp => ({ id: cp.id }));
      }

      if (s.includes('FROM challenge_participants cp JOIN challenges c ON cp.challenge_id = c.id')) {
        const [user_id] = params;
        const joined = state.challenge_participants
          .filter(cp => cp.user_id === user_id && cp.status !== 'LEFT')
          .map(cp => {
            const c = state.challenges.find(ch => ch.id === cp.challenge_id);
            return {
              ...c,
              p_id: cp.id,
              progress: cp.progress,
              rank: cp.rank,
              p_status: cp.status,
              joined_at: cp.joined_at,
              completed_at: cp.completed_at,
              last_updated_at: cp.last_updated_at,
            };
          });
        return joined;
      }

      if (s.includes('FROM challenge_participants cp JOIN profiles p ON cp.user_id = p.id')) {
        const [challenge_id, current_user_id] = params;
        const blockedUserIds = new Set(
          state.blocks
            .filter(b => b.blocker_id === current_user_id || b.blocked_id === current_user_id)
            .map(b => (b.blocker_id === current_user_id ? b.blocked_id : b.blocker_id))
        );

        const list = state.challenge_participants
          .filter(cp => cp.challenge_id === challenge_id && cp.status !== 'LEFT' && !blockedUserIds.has(cp.user_id))
          .sort((a, b) => a.rank - b.rank)
          .map(cp => {
            const p = state.profiles.find(prof => prof.id === cp.user_id) || {
              username: 'operative',
              display_name: 'Operative',
              avatar_url: '⚔️',
              rank_tier: 'E',
              rank_division: 1,
              global_level: 1,
            };
            return {
              rank: cp.rank,
              user_id: cp.user_id,
              progress: cp.progress,
              completed_at: cp.completed_at,
              status: cp.status,
              username: p.username,
              display_name: p.display_name,
              avatar_url: p.avatar_url,
              rank_tier: p.rank_tier,
              rank_division: p.rank_division,
              global_level: p.global_level,
            };
          });
        return list;
      }

      return [];
    }),
  };

  return { mockDb: db, state };
});

vi.mock('../../../database/sqlite', () => ({
  getDatabase: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock('../../../database/repositories/SyncQueueRepository', () => ({
  SyncQueueRepository: {
    enqueue: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../database/repositories/XpRepository', () => ({
  XpRepository: {
    recordTransaction: vi.fn().mockResolvedValue({ awarded: true, amountAwarded: 250, transactionId: 'tx-1' }),
  },
}));

vi.mock('../../social/SocialFeedService', () => ({
  SocialFeedService: {
    publishEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('Challenge Lifecycle Suite', () => {
  const user1 = 'user-alpha';
  const user2 = 'user-bravo';
  const user3 = 'user-charlie';

  beforeEach(() => {
    vi.clearAllMocks();
    state.challenges = [];
    state.challenge_participants = [];
    state.challenge_events = [];
    state.friendships = [];
    state.blocks = [];
    state.profiles = [
      { id: user1, username: 'alpha', display_name: 'Vanguard Alpha', avatar_url: '🐺', rank_tier: 'B', rank_division: 1, global_level: 25 },
      { id: user2, username: 'bravo', display_name: 'Iron Bravo', avatar_url: '⚡', rank_tier: 'C', rank_division: 2, global_level: 18 },
      { id: user3, username: 'charlie', display_name: 'Ghost Charlie', avatar_url: '🛡️', rank_tier: 'D', rank_division: 3, global_level: 10 },
    ];
  });

  describe('Joining Challenges', () => {
    it('allows joining a public system challenge', async () => {
      await ChallengeRepository.createChallenge({
        id: 'ch-public-1',
        title: 'THE CLIMB',
        description: 'Complete 4 workouts',
        type: 'SYSTEM',
        metric: 'WORKOUTS',
        target: 4,
        startAt: new Date(Date.now() - 86400000).toISOString(),
        endAt: new Date(Date.now() + 86400000 * 7).toISOString(),
        visibility: 'PUBLIC',
        createdBy: 'SYSTEM',
        status: 'ACTIVE',
      });

      const participant = await ChallengeEngine.joinChallenge(user1, 'ch-public-1');
      expect(participant).toBeDefined();
      expect(participant.challengeId).toBe('ch-public-1');
      expect(participant.userId).toBe(user1);
      expect(participant.status).toBe('ACTIVE');
      expect(participant.progress).toBe(0);
      expect(participant.rank).toBe(1);
    });

    it('enforces friend-only challenge visibility permissions', async () => {
      await ChallengeRepository.createChallenge({
        id: 'ch-friends-only',
        title: 'SQUAD IRON WEEK',
        description: 'Friends only volume challenge',
        type: 'USER_CREATED',
        metric: 'VOLUME_KG',
        target: 20000,
        startAt: new Date(Date.now() - 86400000).toISOString(),
        endAt: new Date(Date.now() + 86400000 * 7).toISOString(),
        visibility: 'FRIENDS',
        createdBy: user1,
        status: 'ACTIVE',
      });

      // User 1 is creator -> can join
      const pCreator = await ChallengeEngine.joinChallenge(user1, 'ch-friends-only');
      expect(pCreator.userId).toBe(user1);

      // User 2 is NOT a friend -> should be rejected
      await expect(
        ChallengeEngine.joinChallenge(user2, 'ch-friends-only')
      ).rejects.toThrow('This challenge is reserved for squadmates of the creator');

      // Add friendship between user1 and user2
      state.friendships.push({ id: 'f-1', user_id: user2, friend_id: user1, created_at: new Date().toISOString() });

      // User 2 is now a friend -> can join successfully
      const pFriend = await ChallengeEngine.joinChallenge(user2, 'ch-friends-only');
      expect(pFriend.userId).toBe(user2);
      expect(pFriend.status).toBe('ACTIVE');
    });

    it('rejects joining expired or cancelled challenges', async () => {
      await ChallengeRepository.createChallenge({
        id: 'ch-expired-1',
        title: 'OLD CONQUEST',
        description: 'Past challenge',
        type: 'SYSTEM',
        metric: 'WORKOUTS',
        target: 5,
        startAt: new Date(Date.now() - 86400000 * 14).toISOString(),
        endAt: new Date(Date.now() - 86400000 * 7).toISOString(),
        visibility: 'PUBLIC',
        createdBy: 'SYSTEM',
        status: 'EXPIRED',
      });

      await expect(
        ChallengeEngine.joinChallenge(user1, 'ch-expired-1')
      ).rejects.toThrow('Challenge is no longer active');
    });
  });

  describe('Leaving Challenges', () => {
    it('marks participant status as LEFT and preserves progress', async () => {
      await ChallengeRepository.createChallenge({
        id: 'ch-leave-test',
        title: 'CARDIO RUSH',
        description: 'Run 15 km',
        type: 'SYSTEM',
        metric: 'DISTANCE_KM',
        target: 15,
        startAt: new Date(Date.now() - 86400000).toISOString(),
        endAt: new Date(Date.now() + 86400000 * 7).toISOString(),
        visibility: 'PUBLIC',
        createdBy: 'SYSTEM',
        status: 'ACTIVE',
      });

      await ChallengeEngine.joinChallenge(user1, 'ch-leave-test');

      // Simulate partial progress
      state.challenge_participants[0].progress = 8.5;

      // Leave challenge
      await ChallengeEngine.leaveChallenge(user1, 'ch-leave-test');

      const participant = await ChallengeRepository.getParticipant('ch-leave-test', user1);
      expect(participant?.status).toBe('LEFT');
      expect(participant?.progress).toBe(8.5);

      // Rejoining re-activates participation and keeps progress intact
      const rejoined = await ChallengeEngine.joinChallenge(user1, 'ch-leave-test');
      expect(rejoined.status).toBe('ACTIVE');
      expect(rejoined.progress).toBe(8.5);
    });
  });

  describe('Multiple Participants and Ranking Recalculation', () => {
    it('ranks participants based on progress and completion time', async () => {
      await ChallengeRepository.createChallenge({
        id: 'ch-multi-rank',
        title: 'IRON WEEK',
        description: '20,000 kg volume',
        type: 'COMMUNITY',
        metric: 'VOLUME_KG',
        target: 20000,
        startAt: new Date(Date.now() - 86400000).toISOString(),
        endAt: new Date(Date.now() + 86400000 * 7).toISOString(),
        visibility: 'PUBLIC',
        createdBy: 'SYSTEM',
        status: 'ACTIVE',
      });

      // Join 3 users
      await ChallengeEngine.joinChallenge(user1, 'ch-multi-rank');
      await ChallengeEngine.joinChallenge(user2, 'ch-multi-rank');
      await ChallengeEngine.joinChallenge(user3, 'ch-multi-rank');

      // User 1 has 12,000 kg
      state.challenge_participants.find(p => p.user_id === user1)!.progress = 12000;
      // User 2 completed first at T1
      const p2 = state.challenge_participants.find(p => p.user_id === user2)!;
      p2.progress = 20000;
      p2.status = 'COMPLETED';
      p2.completed_at = '2026-09-18T10:00:00Z';
      // User 3 completed second at T2
      const p3 = state.challenge_participants.find(p => p.user_id === user3)!;
      p3.progress = 21000;
      p3.status = 'COMPLETED';
      p3.completed_at = '2026-09-19T14:00:00Z';

      await ChallengeRepository.recalculateRanks('ch-multi-rank');

      const p2Updated = await ChallengeRepository.getParticipant('ch-multi-rank', user2);
      const p3Updated = await ChallengeRepository.getParticipant('ch-multi-rank', user3);
      const p1Updated = await ChallengeRepository.getParticipant('ch-multi-rank', user1);

      // User 2 finished first -> Rank #1
      expect(p2Updated?.rank).toBe(1);
      // User 3 finished second -> Rank #2
      expect(p3Updated?.rank).toBe(2);
      // User 1 not completed -> Rank #3
      expect(p1Updated?.rank).toBe(3);
    });
  });

  describe('Privacy-Safe Leaderboard & Social Isolation', () => {
    it('returns privacy-safe leaderboard entries and filters blocked operatives', async () => {
      await ChallengeRepository.createChallenge({
        id: 'ch-leaderboard-privacy',
        title: 'CONSISTENCY',
        description: 'Train 5 days',
        type: 'SYSTEM',
        metric: 'DAYS_ACTIVE',
        target: 5,
        startAt: new Date(Date.now() - 86400000).toISOString(),
        endAt: new Date(Date.now() + 86400000 * 7).toISOString(),
        visibility: 'PUBLIC',
        createdBy: 'SYSTEM',
        status: 'ACTIVE',
      });

      await ChallengeEngine.joinChallenge(user1, 'ch-leaderboard-privacy');
      await ChallengeEngine.joinChallenge(user2, 'ch-leaderboard-privacy');
      await ChallengeEngine.joinChallenge(user3, 'ch-leaderboard-privacy');

      // User 1 blocked User 3
      state.blocks.push({
        id: 'b-1',
        blocker_id: user1,
        blocked_id: user3,
        created_at: new Date().toISOString(),
      });

      const leaderboard = await ChallengeEngine.getLeaderboard('ch-leaderboard-privacy', user1);

      // User 3 should be omitted from User 1's view
      expect(leaderboard.some(e => e.userId === user3)).toBe(false);
      expect(leaderboard.some(e => e.userId === user1)).toBe(true);
      expect(leaderboard.some(e => e.userId === user2)).toBe(true);

      // Verify privacy guarantees: no health details, no bodyweight, no personal notes
      for (const entry of leaderboard) {
        expect((entry as any).bodyweight).toBeUndefined();
        expect((entry as any).height).toBeUndefined();
        expect((entry as any).medicalHistory).toBeUndefined();
        expect((entry as any).notes).toBeUndefined();
        expect(entry.progress).toBeDefined();
        expect(entry.target).toBe(5);
      }
    });
  });
});
