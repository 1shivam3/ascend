import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChallengeEngine } from '../ChallengeEngine';
import { ChallengeRepository } from '../../../database/repositories/ChallengeRepository';
import { XpRepository } from '../../../database/repositories/XpRepository';
import { SocialFeedService } from '../../social/SocialFeedService';
import { Challenge, ChallengeEventPayload } from '../../../types/challenge.types';

// Mock sqlite database in-memory emulation
const { mockDb, state } = vi.hoisted(() => {
  const state = {
    challenges: [] as any[],
    challenge_participants: [] as any[],
    challenge_events: [] as any[],
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

      if (s.startsWith('INSERT INTO challenge_events')) {
        const [id, challenge_id, user_id, event_id, event_type, contribution_value, processed_at] = params;
        state.challenge_events.push({
          id, challenge_id, user_id, event_id, event_type, contribution_value, processed_at
        });
        return { changes: 1 };
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

      return null;
    }),

    getAllAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.startsWith('SELECT id FROM challenge_participants WHERE challenge_id = ? AND status != \'LEFT\'')) {
        const [challenge_id] = params;
        const list = state.challenge_participants
          .filter(cp => cp.challenge_id === challenge_id && cp.status !== 'LEFT');
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
    recordTransaction: vi.fn().mockResolvedValue({ awarded: true, amountAwarded: 500, transactionId: 'tx-500' }),
  },
}));

vi.mock('../../social/SocialFeedService', () => ({
  SocialFeedService: {
    publishEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('Challenge Scoring and Anti-Tamper Suite', () => {
  const userId = 'user-operative-1';
  const now = new Date();
  const startAt = new Date(now.getTime() - 86400000).toISOString();
  const endAt = new Date(now.getTime() + 86400000 * 7).toISOString();

  beforeEach(() => {
    vi.clearAllMocks();
    state.challenges = [];
    state.challenge_participants = [];
    state.challenge_events = [];
  });

  describe('Deterministic Metric Contribution Calculation', () => {
    it('evaluates WORKOUTS metric (1 per completed workout)', () => {
      const challenge: Challenge = {
        id: 'c-workouts',
        title: 'THE CLIMB',
        description: 'Complete 4 workouts',
        type: 'SYSTEM',
        metric: 'WORKOUTS',
        target: 4,
        startAt,
        endAt,
        visibility: 'PUBLIC',
        createdBy: 'SYSTEM',
        status: 'ACTIVE',
        createdAt: startAt,
        updatedAt: startAt,
      };

      const event1: ChallengeEventPayload = {
        eventId: 'evt-w1',
        eventType: 'WORKOUT',
        timestamp: new Date().toISOString(),
      };
      expect(ChallengeEngine.evaluateContribution(challenge, event1)).toBe(1);

      const event2: ChallengeEventPayload = {
        eventId: 'evt-c1',
        eventType: 'CARDIO',
        timestamp: new Date().toISOString(),
      };
      expect(ChallengeEngine.evaluateContribution(challenge, event2)).toBe(0);
    });

    it('evaluates VOLUME_KG metric deterministically', () => {
      const challenge: Challenge = {
        id: 'c-volume',
        title: 'IRON WEEK',
        description: 'Accumulate 20,000 kg volume',
        type: 'SYSTEM',
        metric: 'VOLUME_KG',
        target: 20000,
        startAt,
        endAt,
        visibility: 'PUBLIC',
        createdBy: 'SYSTEM',
        status: 'ACTIVE',
        createdAt: startAt,
        updatedAt: startAt,
      };

      const event: ChallengeEventPayload = {
        eventId: 'evt-v1',
        eventType: 'WORKOUT',
        timestamp: new Date().toISOString(),
        volumeKg: 6450.5,
      };
      expect(ChallengeEngine.evaluateContribution(challenge, event)).toBe(6450.5);
    });

    it('evaluates DISTANCE_KM metric deterministically', () => {
      const challenge: Challenge = {
        id: 'c-distance',
        title: 'CARDIO RUSH',
        description: '15 km run',
        type: 'SYSTEM',
        metric: 'DISTANCE_KM',
        target: 15,
        startAt,
        endAt,
        visibility: 'PUBLIC',
        createdBy: 'SYSTEM',
        status: 'ACTIVE',
        createdAt: startAt,
        updatedAt: startAt,
      };

      const event: ChallengeEventPayload = {
        eventId: 'evt-d1',
        eventType: 'CARDIO',
        timestamp: new Date().toISOString(),
        distanceKm: 5.75,
      };
      expect(ChallengeEngine.evaluateContribution(challenge, event)).toBe(5.75);
    });

    it('evaluates SESSIONS metric (qualifying strength sessions only)', () => {
      const challenge: Challenge = {
        id: 'c-sessions',
        title: 'STRENGTH PUSH',
        description: '3 qualifying strength sessions',
        type: 'SYSTEM',
        metric: 'SESSIONS',
        target: 3,
        startAt,
        endAt,
        visibility: 'PUBLIC',
        createdBy: 'SYSTEM',
        status: 'ACTIVE',
        createdAt: startAt,
        updatedAt: startAt,
      };

      const qualifyingEvent: ChallengeEventPayload = {
        eventId: 'evt-s1',
        eventType: 'WORKOUT',
        timestamp: new Date().toISOString(),
        isQualifyingStrength: true,
      };
      expect(ChallengeEngine.evaluateContribution(challenge, qualifyingEvent)).toBe(1);

      const lightEvent: ChallengeEventPayload = {
        eventId: 'evt-s2',
        eventType: 'WORKOUT',
        timestamp: new Date().toISOString(),
        isQualifyingStrength: false,
      };
      expect(ChallengeEngine.evaluateContribution(challenge, lightEvent)).toBe(0);
    });

    it('evaluates EXERCISE_VOLUME_KG for target exercise only', () => {
      const challenge: Challenge = {
        id: 'c-bench',
        title: 'BENCH PRESS MASTERY',
        description: '5,000 kg on Barbell Bench Press',
        type: 'SYSTEM',
        metric: 'EXERCISE_VOLUME_KG',
        target: 5000,
        startAt,
        endAt,
        visibility: 'PUBLIC',
        createdBy: 'SYSTEM',
        status: 'ACTIVE',
        config: { exerciseId: 'bench-press-1' },
        createdAt: startAt,
        updatedAt: startAt,
      };

      const matchingEvent: ChallengeEventPayload = {
        eventId: 'evt-e1',
        eventType: 'WORKOUT',
        timestamp: new Date().toISOString(),
        exerciseId: 'bench-press-1',
        exerciseVolumeKg: 2400,
      };
      expect(ChallengeEngine.evaluateContribution(challenge, matchingEvent)).toBe(2400);

      const nonMatchingEvent: ChallengeEventPayload = {
        eventId: 'evt-e2',
        eventType: 'WORKOUT',
        timestamp: new Date().toISOString(),
        exerciseId: 'squat-1',
        exerciseVolumeKg: 4000,
      };
      expect(ChallengeEngine.evaluateContribution(challenge, nonMatchingEvent)).toBe(0);
    });

    it('rejects events outside temporal challenge window [startAt, endAt]', () => {
      const challenge: Challenge = {
        id: 'c-temporal',
        title: 'TEMPORAL TEST',
        description: 'Must occur during challenge window',
        type: 'SYSTEM',
        metric: 'WORKOUTS',
        target: 3,
        startAt: '2026-09-01T00:00:00Z',
        endAt: '2026-09-07T23:59:59Z',
        visibility: 'PUBLIC',
        createdBy: 'SYSTEM',
        status: 'ACTIVE',
        createdAt: startAt,
        updatedAt: startAt,
      };

      const pastEvent: ChallengeEventPayload = {
        eventId: 'evt-past',
        eventType: 'WORKOUT',
        timestamp: '2026-08-31T22:00:00Z',
      };
      expect(ChallengeEngine.evaluateContribution(challenge, pastEvent)).toBe(0);

      const futureEvent: ChallengeEventPayload = {
        eventId: 'evt-future',
        eventType: 'WORKOUT',
        timestamp: '2026-09-08T01:00:00Z',
      };
      expect(ChallengeEngine.evaluateContribution(challenge, futureEvent)).toBe(0);

      const validEvent: ChallengeEventPayload = {
        eventId: 'evt-valid',
        eventType: 'WORKOUT',
        timestamp: '2026-09-03T12:00:00Z',
      };
      expect(ChallengeEngine.evaluateContribution(challenge, validEvent)).toBe(1);
    });
  });

  describe('Anti-Tamper & Duplicate Event Prevention (Idempotency)', () => {
    it('prevents duplicate events from inflating progress', async () => {
      await ChallengeRepository.createChallenge({
        id: 'c-dedup',
        title: 'THE CLIMB',
        description: 'Complete 4 workouts',
        type: 'SYSTEM',
        metric: 'WORKOUTS',
        target: 4,
        startAt,
        endAt,
        visibility: 'PUBLIC',
        createdBy: 'SYSTEM',
        status: 'ACTIVE',
      });

      await ChallengeEngine.joinChallenge(userId, 'c-dedup');

      const event: ChallengeEventPayload = {
        eventId: 'workout-session-unique-123',
        eventType: 'WORKOUT',
        timestamp: new Date().toISOString(),
      };

      // First submission -> processes and updates progress from 0 to 1
      const update1 = await ChallengeEngine.processEvent(userId, event);
      expect(update1).toHaveLength(1);
      expect(update1[0].newProgress).toBe(1);
      expect(update1[0].contribution).toBe(1);

      const pAfterFirst = await ChallengeRepository.getParticipant('c-dedup', userId);
      expect(pAfterFirst?.progress).toBe(1);

      // Re-submitting the exact same event -> must be skipped entirely
      const update2 = await ChallengeEngine.processEvent(userId, event);
      expect(update2).toHaveLength(0);

      const pAfterDuplicate = await ChallengeRepository.getParticipant('c-dedup', userId);
      expect(pAfterDuplicate?.progress).toBe(1); // STILL 1, NOT 2
    });
  });

  describe('Completion Detection & XP Reward Ledger', () => {
    it('detects completion, records timestamp, awards bonus XP, and broadcasts feed event', async () => {
      await ChallengeRepository.createChallenge({
        id: 'c-complete-test',
        title: 'STRENGTH PUSH',
        description: 'Complete 2 qualifying sessions',
        type: 'SYSTEM',
        metric: 'SESSIONS',
        target: 2,
        startAt,
        endAt,
        visibility: 'PUBLIC',
        createdBy: 'SYSTEM',
        status: 'ACTIVE',
        rewardXp: 350,
      });

      await ChallengeEngine.joinChallenge(userId, 'c-complete-test');

      // Session 1
      const s1: ChallengeEventPayload = {
        eventId: 'sess-1',
        eventType: 'WORKOUT',
        isQualifyingStrength: true,
        timestamp: new Date().toISOString(),
      };
      const res1 = await ChallengeEngine.processEvent(userId, s1);
      expect(res1[0].isNewlyCompleted).toBe(false);
      expect(res1[0].newProgress).toBe(1);
      expect(XpRepository.recordTransaction).not.toHaveBeenCalled();

      // Session 2 -> Completes Challenge!
      const s2: ChallengeEventPayload = {
        eventId: 'sess-2',
        eventType: 'WORKOUT',
        isQualifyingStrength: true,
        timestamp: new Date().toISOString(),
      };
      const res2 = await ChallengeEngine.processEvent(userId, s2);
      expect(res2[0].isNewlyCompleted).toBe(true);
      expect(res2[0].newProgress).toBe(2);
      expect(res2[0].rewardXpEarned).toBe(350);

      const pFinal = await ChallengeRepository.getParticipant('c-complete-test', userId);
      expect(pFinal?.status).toBe('COMPLETED');
      expect(pFinal?.completedAt).not.toBeNull();

      // Verify bonus XP recorded via XP repository
      expect(XpRepository.recordTransaction).toHaveBeenCalledWith(
        userId,
        'CHALLENGE',
        'c-complete-test',
        350,
        expect.stringContaining('Challenge Completed: STRENGTH PUSH')
      );

      // Verify social feed broadcast
      expect(SocialFeedService.publishEvent).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          eventType: 'CHALLENGE_COMPLETED',
          title: expect.stringContaining('STRENGTH PUSH'),
        })
      );
    });
  });
});
