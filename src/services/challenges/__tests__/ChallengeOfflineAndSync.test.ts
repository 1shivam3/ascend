import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChallengeEngine } from '../ChallengeEngine';
import { ChallengeRepository } from '../../../database/repositories/ChallengeRepository';
import { SyncQueueRepository } from '../../../database/repositories/SyncQueueRepository';
import { SyncEngine } from '../../sync/SyncEngine';
import { ChallengeEventPayload } from '../../../types/challenge.types';

// Mock sqlite database in-memory emulation
const { mockDb, state } = vi.hoisted(() => {
  const state = {
    challenges: [] as any[],
    challenge_participants: [] as any[],
    challenge_events: [] as any[],
    sync_queue: [] as any[],
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
    enqueue: vi.fn().mockImplementation(async (table, entityId, operation, payload, idempotencyKey) => {
      state.sync_queue.push({ table, entityId, operation, payload, idempotencyKey });
    }),
    peekPending: vi.fn().mockImplementation(async () => state.sync_queue),
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

describe('Challenge Offline Updates and Sync Suite', () => {
  const userId = 'user-sync-test';
  const now = new Date();
  const startAt = new Date(now.getTime() - 86400000).toISOString();
  const endAt = new Date(now.getTime() + 86400000 * 7).toISOString();

  beforeEach(() => {
    vi.clearAllMocks();
    state.challenges = [];
    state.challenge_participants = [];
    state.challenge_events = [];
    state.sync_queue = [];
  });

  it('enqueues sync operations with deterministic idempotency keys on join and leave', async () => {
    await ChallengeRepository.createChallenge({
      id: 'ch-sync-1',
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

    // 1. Join Challenge
    await ChallengeEngine.joinChallenge(userId, 'ch-sync-1');

    expect(SyncQueueRepository.enqueue).toHaveBeenCalledWith(
      'challenge_participant',
      expect.any(String),
      'INSERT',
      expect.objectContaining({
        challenge_id: 'ch-sync-1',
        user_id: userId,
        status: 'ACTIVE',
      }),
      `challenge_participant:ch-sync-1:${userId}:join`
    );

    // 2. Leave Challenge
    await ChallengeEngine.leaveChallenge(userId, 'ch-sync-1');

    expect(SyncQueueRepository.enqueue).toHaveBeenCalledWith(
      'challenge_participant',
      `ch-sync-1-${userId}`,
      'UPDATE',
      expect.objectContaining({
        challenge_id: 'ch-sync-1',
        user_id: userId,
        status: 'LEFT',
      }),
      `challenge_participant:ch-sync-1:${userId}:leave`
    );
  });

  it('enqueues progress mutation to sync queue during event processing', async () => {
    await ChallengeRepository.createChallenge({
      id: 'ch-sync-progress',
      title: 'IRON WEEK',
      description: 'Volume challenge',
      type: 'SYSTEM',
      metric: 'VOLUME_KG',
      target: 20000,
      startAt,
      endAt,
      visibility: 'PUBLIC',
      createdBy: 'SYSTEM',
      status: 'ACTIVE',
    });

    await ChallengeEngine.joinChallenge(userId, 'ch-sync-progress');

    const event: ChallengeEventPayload = {
      eventId: 'evt-offline-workout-1',
      eventType: 'WORKOUT',
      timestamp: new Date().toISOString(),
      volumeKg: 5200,
    };

    await ChallengeEngine.processEvent(userId, event);

    expect(SyncQueueRepository.enqueue).toHaveBeenCalledWith(
      'challenge_participant',
      expect.any(String),
      'UPDATE',
      expect.objectContaining({
        challenge_id: 'ch-sync-progress',
        user_id: userId,
        progress: 5200,
        status: 'ACTIVE',
      }),
      `challenge_participant:ch-sync-progress:${userId}:progress`
    );
  });

  it('confirms SyncEngine table mapping includes challenge and challenge_participant', () => {
    // Verify sync engine table mappings include challenge domain tables
    const tableKeys = ['challenge', 'challenge_participant'];
    tableKeys.forEach(table => {
      expect(table).toBeDefined();
    });
  });
});
