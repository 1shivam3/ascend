import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XpRepository } from '../../../database/repositories/XpRepository';
import { MasteryRepository } from '../../../database/repositories/MasteryRepository';
import { WorkoutRepository } from '../../../database/repositories/WorkoutRepository';
import { SyncQueueRepository } from '../../../database/repositories/SyncQueueRepository';
import { StreakEngine } from '../../progression/StreakEngine';
import { AchievementEngine } from '../../progression/AchievementEngine';
import { AchievementRepository } from '../../../database/repositories/AchievementRepository';
import { PersonalRecord } from '../../../types/domain.types';

// In-memory mock tables for deterministic verification
let xpTransactionsTable: Array<{ id: string; user_id: string; source_type: string; source_id: string; amount: number }> = [];
let profilesTable: Record<string, { total_xp: number }> = {};
let workoutsTable: Record<string, { status: string; xp_earned: number }> = {};
let prsTable: Record<string, { id: string; user_id: string; exercise_id: string; pr_type: string; value: number }> = {};
let syncQueueTable: Record<string, { id: string; idempotency_key: string; status: string; payload: string }> = {};

vi.mock('../../../database/sqlite', () => ({
  getDatabase: vi.fn().mockResolvedValue({
    runAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      // 1. XpRepository INSERT OR IGNORE INTO xp_transactions
      if (sql.includes('INSERT OR IGNORE INTO xp_transactions')) {
        const [id, userId, sourceType, sourceId, amount] = params;
        const exists = xpTransactionsTable.some(
          t => t.user_id === userId && t.source_type === sourceType && t.source_id === sourceId
        );
        if (exists) {
          return { changes: 0, lastInsertRowId: 0 };
        }
        xpTransactionsTable.push({ id, user_id: userId, source_type: sourceType, source_id: sourceId, amount });
        return { changes: 1, lastInsertRowId: xpTransactionsTable.length };
      }

      // 2. Profile total_xp update
      if (sql.includes('UPDATE profiles SET total_xp = total_xp + ?')) {
        const [amount, , userId] = params;
        if (!profilesTable[userId]) profilesTable[userId] = { total_xp: 0 };
        profilesTable[userId].total_xp += amount;
        return { changes: 1, lastInsertRowId: 0 };
      }

      // 3. WorkoutRepository finishWorkout
      if (sql.includes('UPDATE workouts SET') && sql.includes("status != 'COMPLETED'")) {
        const workoutId = params[params.length - 1];
        const workout = workoutsTable[workoutId];
        if (!workout || workout.status === 'COMPLETED') {
          return { changes: 0, lastInsertRowId: 0 };
        }
        workout.status = 'COMPLETED';
        workout.xp_earned = params[params.length - 3];
        return { changes: 1, lastInsertRowId: 0 };
      }

      // 4. MasteryRepository savePersonalRecord
      if (sql.includes('UPDATE personal_records SET')) {
        const [value, , , , prId] = params;
        const pr = prsTable[prId];
        if (pr) {
          pr.value = value;
          return { changes: 1, lastInsertRowId: 0 };
        }
        return { changes: 0, lastInsertRowId: 0 };
      }

      if (sql.includes('INSERT INTO personal_records')) {
        const [id, userId, exerciseId, prType, value] = params;
        prsTable[id] = { id, user_id: userId, exercise_id: exerciseId, pr_type: prType, value };
        return { changes: 1, lastInsertRowId: 1 };
      }

      // 5. SyncQueueRepository enqueue
      if (sql.includes('UPDATE local_sync_queue SET')) {
        const [payload, , id] = params;
        if (syncQueueTable[id]) {
          syncQueueTable[id].payload = payload;
          syncQueueTable[id].status = 'PENDING';
          return { changes: 1, lastInsertRowId: 0 };
        }
        return { changes: 0, lastInsertRowId: 0 };
      }

      if (sql.includes('INSERT INTO local_sync_queue')) {
        const [id, key, , , , payload] = params;
        syncQueueTable[id] = { id, idempotency_key: key, status: 'PENDING', payload };
        return { changes: 1, lastInsertRowId: 1 };
      }

      return { changes: 1, lastInsertRowId: 1 };
    }),

    getFirstAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      // Personal records query
      if (sql.includes('FROM personal_records')) {
        const [userId, exerciseId, prType] = params;
        const match = Object.values(prsTable).find(
          p => p.user_id === userId && p.exercise_id === exerciseId && p.pr_type === prType
        );
        return match || null;
      }

      // Sync queue idempotency check
      if (sql.includes('FROM local_sync_queue WHERE idempotency_key = ?')) {
        const [key] = params;
        const match = Object.values(syncQueueTable).find(q => q.idempotency_key === key);
        return match || null;
      }

      return null;
    }),

    getAllAsync: vi.fn().mockResolvedValue([]),
  }),
}));

describe('ASCEND Strict Idempotency & Conflict Resolution Tests', () => {
  const userId = 'user-combat-alpha';

  beforeEach(() => {
    vi.clearAllMocks();
    xpTransactionsTable = [];
    profilesTable = { [userId]: { total_xp: 1000 } };
    workoutsTable = {};
    prsTable = {};
    syncQueueTable = {};
  });

  describe('1. XP Transaction Ledger Idempotency', () => {
    it('awards XP on initial transaction and rejects identical duplicate transactions', async () => {
      const workoutId = 'w-chest-day-1';

      // First transaction call
      const firstResult = await XpRepository.recordTransaction(
        userId,
        'WORKOUT',
        workoutId,
        500,
        'Workout Completed: Chest Hypertrophy'
      );

      expect(firstResult.awarded).toBe(true);
      expect(firstResult.amountAwarded).toBe(500);
      expect(profilesTable[userId].total_xp).toBe(1500); // 1000 + 500
      expect(xpTransactionsTable).toHaveLength(1);

      // Attempt duplicate submission (simulating retry or double tap)
      const duplicateResult = await XpRepository.recordTransaction(
        userId,
        'WORKOUT',
        workoutId,
        500,
        'Workout Completed: Chest Hypertrophy'
      );

      expect(duplicateResult.awarded).toBe(false);
      expect(duplicateResult.amountAwarded).toBe(0);
      // Invariant: Profile XP must NOT increment twice
      expect(profilesTable[userId].total_xp).toBe(1500);
      // Invariant: No duplicate transaction rows inserted
      expect(xpTransactionsTable).toHaveLength(1);
    });

    it('rejects 10 concurrent duplicate transaction attempts with zero XP inflation', async () => {
      const questId = 'quest-weekly-volume-1';

      // 10 concurrent calls with identical compound key
      const results = await Promise.all(
        Array.from({ length: 10 }).map(() =>
          XpRepository.recordTransaction(userId, 'QUEST', questId, 250, 'Quest Volume Milestone')
        )
      );

      const awardedCount = results.filter(r => r.awarded).length;
      const rejectedCount = results.filter(r => !r.awarded).length;

      expect(awardedCount).toBe(1);
      expect(rejectedCount).toBe(9);
      expect(profilesTable[userId].total_xp).toBe(1250); // 1000 + 250 exactly
    });
  });

  describe('2. Workout Completion Atomic Idempotency', () => {
    it('prevents double-completion of the same workout session', async () => {
      const workoutId = 'w-session-99';
      workoutsTable[workoutId] = { status: 'IN_PROGRESS', xp_earned: 0 };

      const firstFinish = await WorkoutRepository.finishWorkout(
        workoutId,
        '2026-09-19T12:00:00.000Z',
        3600,
        8000,
        75,
        15,
        450
      );
      expect(firstFinish).toBe(true);
      expect(workoutsTable[workoutId].status).toBe('COMPLETED');
      expect(workoutsTable[workoutId].xp_earned).toBe(450);

      // Second finish call on the completed workout
      const secondFinish = await WorkoutRepository.finishWorkout(
        workoutId,
        '2026-09-19T12:00:00.000Z',
        3600,
        8000,
        75,
        15,
        450
      );
      // Invariant: Atomic guard AND status != 'COMPLETED' returns false
      expect(secondFinish).toBe(false);
    });
  });

  describe('3. Personal Record Highest Value Wins', () => {
    it('saves initial PR, rejects lower/equal values, and accepts higher values', async () => {
      const exerciseId = 'ex-bench-press';

      // 1. Initial PR: 100kg
      const pr100: PersonalRecord = {
        id: 'pr-bench-1',
        userId,
        exerciseId,
        prType: 'MAX_ESTIMATED_1RM',
        value: 100,
        achievedAt: '2026-09-19T10:00:00.000Z',
      };
      const saved100 = await MasteryRepository.savePersonalRecord(pr100);
      expect(saved100).toBe(true);

      // 2. Regressed attempt: 90kg (e.g. from out-of-order sync or lighter session)
      const pr90: PersonalRecord = {
        id: 'pr-bench-2',
        userId,
        exerciseId,
        prType: 'MAX_ESTIMATED_1RM',
        value: 90,
        achievedAt: '2026-09-19T11:00:00.000Z',
      };
      const saved90 = await MasteryRepository.savePersonalRecord(pr90);
      // Invariant: Lower PR must NOT overwrite or duplicate
      expect(saved90).toBe(false);
      expect(prsTable['pr-bench-1'].value).toBe(100);

      // 3. Duplicate equal attempt: 100kg
      const pr100Dup: PersonalRecord = {
        id: 'pr-bench-3',
        userId,
        exerciseId,
        prType: 'MAX_ESTIMATED_1RM',
        value: 100,
        achievedAt: '2026-09-19T11:30:00.000Z',
      };
      const saved100Dup = await MasteryRepository.savePersonalRecord(pr100Dup);
      expect(saved100Dup).toBe(false);
      expect(prsTable['pr-bench-1'].value).toBe(100);

      // 4. True PR progression: 112.5kg
      const pr112: PersonalRecord = {
        id: 'pr-bench-4',
        userId,
        exerciseId,
        prType: 'MAX_ESTIMATED_1RM',
        value: 112.5,
        achievedAt: '2026-09-19T12:00:00.000Z',
      };
      const saved112 = await MasteryRepository.savePersonalRecord(pr112);
      expect(saved112).toBe(true);
      expect(prsTable['pr-bench-1'].value).toBe(112.5);
    });
  });

  describe('4. Streak Calendar-Date Idempotency', () => {
    it('advances streak on first workout of calendar day, does NOT increment on same-day follow-up', () => {
      const lastWorkoutDate = '2026-09-18';
      const today = '2026-09-19';

      // First workout today advances streak from 3 to 4
      const firstEvaluation = StreakEngine.evaluateStreak(
        lastWorkoutDate,
        today,
        3,
        5,
        1
      );
      expect(firstEvaluation.currentStreak).toBe(4);
      expect(firstEvaluation.longestStreak).toBe(5);

      // Second workout later the same day
      const secondEvaluation = StreakEngine.evaluateStreak(
        today, // user already logged a workout today
        today,
        4,
        5,
        1
      );
      // Invariant: Same-day workouts do not double-increment streak
      expect(secondEvaluation.currentStreak).toBe(4);
    });
  });

  describe('5. Sync Queue Idempotency Key De-duplication', () => {
    it('updates existing queue item instead of creating duplicate rows when identical key is enqueued', async () => {
      const idempotencyKey = 'workout:w-session-42:complete';

      // First enqueue
      const id1 = await SyncQueueRepository.enqueue(
        'workout',
        'w-session-42',
        'UPDATE',
        { id: 'w-session-42', status: 'COMPLETED', xp: 400 },
        idempotencyKey
      );

      expect(Object.keys(syncQueueTable)).toHaveLength(1);

      // Second enqueue with same idempotency key (e.g. user retried or updated notes)
      const id2 = await SyncQueueRepository.enqueue(
        'workout',
        'w-session-42',
        'UPDATE',
        { id: 'w-session-42', status: 'COMPLETED', xp: 450 },
        idempotencyKey
      );

      // Invariant: Returns same existing ID, does not insert a duplicate row
      expect(id2).toBe(id1);
      expect(Object.keys(syncQueueTable)).toHaveLength(1);
      expect(syncQueueTable[id1].payload).toContain('450');
    });
  });
});
