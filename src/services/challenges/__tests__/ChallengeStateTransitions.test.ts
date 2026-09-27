import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChallengeEngine } from '../ChallengeEngine';
import { ChallengeRepository } from '../../../database/repositories/ChallengeRepository';
import { Challenge, ChallengeEventPayload } from '../../../types/challenge.types';

// In-memory SQLite state emulation
const state = {
  challenges: [] as any[],
  challenge_participants: [] as any[],
  challenge_events: [] as any[],
  user_titles: [] as any[],
  xp_transactions: [] as any[],
};

vi.mock('../../../database/sqlite', () => ({
  getDatabase: vi.fn().mockResolvedValue({
    runAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.startsWith('INSERT INTO challenges')) {
        const [
          id, title, description, type, metric, target, start_at, end_at,
          visibility, created_by, status, config, reward_xp, reward_title_id, reward_title_name, reward_badge, created_at, updated_at
        ] = params;
        state.challenges.push({
          id, title, description, type, metric, target, start_at, end_at,
          visibility, created_by, status, config, reward_xp, reward_title_id, reward_title_name, reward_badge, created_at, updated_at
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

      if (s.startsWith('UPDATE challenge_participants SET status = \'PAUSED\'')) {
        const [last_updated_at, challenge_id, user_id] = params;
        const p = state.challenge_participants.find(
          cp => cp.challenge_id === challenge_id && cp.user_id === user_id
        );
        if (p) {
          p.status = 'PAUSED';
          p.last_updated_at = last_updated_at;
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      if (s.startsWith('UPDATE challenge_participants SET status = \'CANCELLED\'')) {
        const [last_updated_at, challenge_id, user_id] = params;
        const p = state.challenge_participants.find(
          cp => cp.challenge_id === challenge_id && cp.user_id === user_id
        );
        if (p) {
          p.status = 'CANCELLED';
          p.last_updated_at = last_updated_at;
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      if (s.startsWith('UPDATE challenge_participants SET status = \'COMPLETED\'')) {
        const [completed_at, last_updated_at, challenge_id, user_id] = params;
        const p = state.challenge_participants.find(
          cp => cp.challenge_id === challenge_id && cp.user_id === user_id
        );
        if (p) {
          p.status = 'COMPLETED';
          p.completed_at = completed_at;
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

      if (s.startsWith('INSERT INTO challenge_events')) {
        const [id, challenge_id, user_id, event_id, event_type, contribution_value, processed_at] = params;
        state.challenge_events.push({
          id, challenge_id, user_id, event_id, event_type, contribution_value, processed_at
        });
        return { changes: 1 };
      }

      if (s.includes('INSERT OR IGNORE INTO user_titles') || s.includes('INSERT INTO user_titles')) {
        const [id, user_id, title_id, unlocked_at, created_at, updated_at] = params;
        state.user_titles.push({
          id, user_id, title_id, unlocked_at, is_active: 0, created_at, updated_at
        });
        return { changes: 1 };
      }

      return { changes: 1 };
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

      if (s.startsWith('SELECT * FROM user_titles WHERE user_id = ? AND title_id = ?')) {
        const [user_id, title_id] = params;
        return state.user_titles.find(ut => ut.user_id === user_id && ut.title_id === title_id) || null;
      }

      return null;
    }),

    getAllAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.includes('FROM challenge_participants cp JOIN challenges c')) {
        const [userId] = params;
        const joined = state.challenge_participants.filter(cp => cp.user_id === userId && cp.status !== 'LEFT');
        return joined.map(cp => {
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
      }

      if (s.includes('FROM challenges c LEFT JOIN challenge_participants cp')) {
        const [userId] = params;
        return state.challenges.map(c => {
          const cp = state.challenge_participants.find(p => p.challenge_id === c.id && p.user_id === userId);
          return {
            ...c,
            p_id: cp?.id,
            p_progress: cp?.progress,
            p_rank: cp?.rank,
            p_status: cp?.status,
            p_joined_at: cp?.joined_at,
            p_completed_at: cp?.completed_at,
            p_last_updated_at: cp?.last_updated_at,
            participants_count: state.challenge_participants.filter(p => p.challenge_id === c.id && p.status !== 'LEFT').length,
          };
        });
      }

      if (s.includes('SELECT id FROM challenge_participants WHERE challenge_id = ?')) {
        return [];
      }

      return [];
    }),
  }),
}));

vi.mock('../../../database/repositories/SyncQueueRepository', () => ({
  SyncQueueRepository: { enqueue: vi.fn().mockResolvedValue(true) },
}));

vi.mock('../../social/SocialFeedService', () => ({
  SocialFeedService: { publishEvent: vi.fn().mockResolvedValue(true) },
}));

vi.mock('../../../database/repositories/XpRepository', () => ({
  XpRepository: {
    recordTransaction: vi.fn().mockImplementation(async (userId, source, refId, amount, description) => {
      state.xp_transactions.push({ userId, source, refId, amount, description });
      return { id: 'xp-1', amount };
    }),
  },
}));

describe('Challenge State Transitions & Title Rewards', () => {
  const userId = 'user-cadet-1';
  const now = new Date();
  const startAt = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const endAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const testChallenge: Omit<Challenge, 'createdAt' | 'updatedAt'> = {
    id: 'ch-strength-spree',
    title: 'Strength Spree',
    description: 'Complete 3 strength workouts to forge resilience and claim the title.',
    type: 'COMMUNITY',
    metric: 'WORKOUTS',
    target: 3,
    startAt,
    endAt,
    visibility: 'PUBLIC',
    createdBy: 'SYSTEM',
    status: 'ACTIVE',
    config: {},
    rewardXp: 500,
    rewardTitleId: 'title-power-builder',
    rewardTitleName: 'Power Builder',
    rewardBadge: 'badge_strength',
  };

  beforeEach(async () => {
    state.challenges.length = 0;
    state.challenge_participants.length = 0;
    state.challenge_events.length = 0;
    state.user_titles.length = 0;
    state.xp_transactions.length = 0;
    vi.clearAllMocks();

    await ChallengeRepository.createChallenge(testChallenge);
  });

  it('starts challenge in ACTIVE state upon join', async () => {
    const participant = await ChallengeEngine.joinChallenge(userId, testChallenge.id);

    expect(participant.status).toBe('ACTIVE');
    expect(participant.progress).toBe(0);
    expect(participant.completedAt).toBeNull();

    const stored = await ChallengeRepository.getParticipant(testChallenge.id, userId);
    expect(stored?.status).toBe('ACTIVE');
  });

  it('transitions from ACTIVE to PAUSED and ignores workout contributions while paused', async () => {
    await ChallengeEngine.joinChallenge(userId, testChallenge.id);

    // Pause participation
    await ChallengeEngine.pauseChallenge(userId, testChallenge.id);
    let stored = await ChallengeRepository.getParticipant(testChallenge.id, userId);
    expect(stored?.status).toBe('PAUSED');

    // Attempt to process a workout event while PAUSED
    const event: ChallengeEventPayload = {
      eventId: 'workout-101',
      eventType: 'WORKOUT',
      timestamp: new Date().toISOString(),
    };

    const updates = await ChallengeEngine.processEvent(userId, event);
    expect(updates.length).toBe(0);

    // Progress remains 0
    stored = await ChallengeRepository.getParticipant(testChallenge.id, userId);
    expect(stored?.progress).toBe(0);
  });

  it('resumes from PAUSED to ACTIVE and correctly processes workout contributions', async () => {
    await ChallengeEngine.joinChallenge(userId, testChallenge.id);
    await ChallengeEngine.pauseChallenge(userId, testChallenge.id);

    // Resume
    await ChallengeEngine.resumeChallenge(userId, testChallenge.id);
    let stored = await ChallengeRepository.getParticipant(testChallenge.id, userId);
    expect(stored?.status).toBe('ACTIVE');

    // Process event while resumed
    const event: ChallengeEventPayload = {
      eventId: 'workout-102',
      eventType: 'WORKOUT',
      timestamp: new Date().toISOString(),
    };

    const updates = await ChallengeEngine.processEvent(userId, event);
    expect(updates.length).toBe(1);
    expect(updates[0].newProgress).toBe(1);
    expect(updates[0].contribution).toBe(1);

    stored = await ChallengeRepository.getParticipant(testChallenge.id, userId);
    expect(stored?.progress).toBe(1);
    expect(stored?.status).toBe('ACTIVE');
  });

  it('transitions to CANCELLED state and reactivates cleanly upon re-joining', async () => {
    await ChallengeEngine.joinChallenge(userId, testChallenge.id);

    // Cancel
    await ChallengeEngine.cancelChallenge(userId, testChallenge.id);
    let stored = await ChallengeRepository.getParticipant(testChallenge.id, userId);
    expect(stored?.status).toBe('CANCELLED');

    // Re-join
    const rejoined = await ChallengeEngine.joinChallenge(userId, testChallenge.id);
    expect(rejoined.status).toBe('ACTIVE');

    stored = await ChallengeRepository.getParticipant(testChallenge.id, userId);
    expect(stored?.status).toBe('ACTIVE');
  });

  it('completes challenge upon reaching target, awarding configured reward title and XP', async () => {
    await ChallengeEngine.joinChallenge(userId, testChallenge.id);

    // Workout 1
    await ChallengeEngine.processEvent(userId, {
      eventId: 'w-session-1',
      eventType: 'WORKOUT',
      timestamp: new Date().toISOString(),
    });

    // Workout 2
    await ChallengeEngine.processEvent(userId, {
      eventId: 'w-session-2',
      eventType: 'WORKOUT',
      timestamp: new Date().toISOString(),
    });

    // Workout 3 -> Reaches target of 3!
    const updates = await ChallengeEngine.processEvent(userId, {
      eventId: 'w-session-3',
      eventType: 'WORKOUT',
      timestamp: new Date().toISOString(),
    });

    expect(updates.length).toBe(1);
    expect(updates[0].isNewlyCompleted).toBe(true);
    expect(updates[0].rewardXpEarned).toBe(500);

    const stored = await ChallengeRepository.getParticipant(testChallenge.id, userId);
    expect(stored?.status).toBe('COMPLETED');
    expect(stored?.completedAt).not.toBeNull();

    // Verify Title Reward was unlocked
    expect(state.user_titles.some(ut => ut.user_id === userId && ut.title_id === 'title-power-builder')).toBe(true);

    // Verify XP reward transaction recorded
    expect(state.xp_transactions.some(tx => tx.userId === userId && tx.amount === 500)).toBe(true);
  });

  it('fetches all challenges with user statuses (AVAILABLE, ACTIVE, PAUSED, COMPLETED)', async () => {
    const allWithStatus = await ChallengeEngine.getAllChallengesWithUserStatus(userId);
    expect(allWithStatus.length).toBe(1);
    expect(allWithStatus[0].userStatus).toBe('AVAILABLE');

    await ChallengeEngine.joinChallenge(userId, testChallenge.id);
    let updatedList = await ChallengeEngine.getAllChallengesWithUserStatus(userId);
    expect(updatedList[0].userStatus).toBe('ACTIVE');

    await ChallengeEngine.pauseChallenge(userId, testChallenge.id);
    updatedList = await ChallengeEngine.getAllChallengesWithUserStatus(userId);
    expect(updatedList[0].userStatus).toBe('PAUSED');

    await ChallengeEngine.completeChallenge(userId, testChallenge.id);
    updatedList = await ChallengeEngine.getAllChallengesWithUserStatus(userId);
    expect(updatedList[0].userStatus).toBe('COMPLETED');
  });
});
