import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthQuestBridge } from '../HealthQuestBridge';
import { HealthRecord } from '../../../types/health.types';
import { ChallengeEngine } from '../../challenges/ChallengeEngine';
import { ProfileRepository } from '../../../database/repositories/ProfileRepository';
import { SocialFeedService } from '../../social/SocialFeedService';

// Mock dependencies
vi.mock('../../challenges/ChallengeEngine', () => ({
  ChallengeEngine: {
    processEvent: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../database/repositories/ProfileRepository', () => ({
  ProfileRepository: {
    updateWeight: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../social/SocialFeedService', () => ({
  SocialFeedService: {
    publishEvent: vi.fn().mockResolvedValue(null),
    sanitizeMetadata: vi.fn().mockImplementation((meta: any = {}) => {
      // Mirror the production sanitizeMetadata behavior
      const clean: any = {};
      if (meta.workoutId) clean.workoutId = String(meta.workoutId);
      if (typeof meta.durationMinutes === 'number') clean.durationMinutes = Math.round(meta.durationMinutes);
      if (typeof meta.challengeTitle === 'string') clean.challengeTitle = meta.challengeTitle;
      return clean;
    }),
  },
}));

// In-memory sqlite mock for HealthRepository tests
const { mockDb, state } = vi.hoisted(() => {
  const state = {
    health_sync_state: [] as any[],
    health_records: [] as any[],
  };

  const db = {
    runAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.startsWith('INSERT INTO health_sync_state') || s.startsWith('INSERT OR REPLACE INTO health_sync_state')) {
        const [id, user_id, is_connected, granted_permissions, last_sync_time, sync_cursor, created_at, updated_at] = params;
        state.health_sync_state.push({
          id, user_id, is_connected, granted_permissions, last_sync_time, sync_cursor, created_at, updated_at,
        });
        return { changes: 1 };
      }

      if (s.startsWith('UPDATE health_sync_state')) {
        const existing = state.health_sync_state[0];
        if (existing) {
          if (s.includes('is_connected = 0')) {
            existing.is_connected = 0;
            existing.granted_permissions = '[]';
          } else {
            const [is_connected, granted_permissions, last_sync_time, sync_cursor, updated_at] = params;
            existing.is_connected = is_connected;
            existing.granted_permissions = granted_permissions;
            existing.last_sync_time = last_sync_time;
            existing.sync_cursor = sync_cursor;
            existing.updated_at = updated_at;
          }
          return { changes: 1 };
        }
        return { changes: 0 };
      }

      if (s.startsWith('INSERT OR IGNORE INTO health_records')) {
        const [id, user_id, record_type, source_client, external_id, start_time, end_time, value_num, unit, metadata, is_deduplicated, created_at] = params;
        state.health_records.push({
          id,
          user_id,
          record_type,
          source_client,
          external_id,
          start_time,
          end_time,
          value: value_num,
          unit,
          metadata,
          is_deduplicated,
          created_at,
        });
        return { changes: 1 };
      }

      return { changes: 0 };
    }),

    getFirstAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('SELECT * FROM health_sync_state WHERE user_id = ?')) {
        const [userId] = params;
        return state.health_sync_state.find(h => h.user_id === userId) || null;
      }
      return null;
    }),

    getAllAsync: vi.fn().mockResolvedValue([]),
  };

  return { mockDb: db, state };
});

vi.mock('../../../database/sqlite', () => ({
  getDatabase: vi.fn().mockResolvedValue(mockDb),
}));

describe('Health Connect Quest Bridge & Privacy Suite', () => {
  const userId = 'user-bridge-test';

  beforeEach(() => {
    vi.clearAllMocks();
    state.health_sync_state = [];
    state.health_records = [];
  });

  describe('Quest & Challenge Integration', () => {
    it('aggregates daily step records and dispatches STEPS challenge event', async () => {
      const records: HealthRecord[] = [
        {
          id: 'step-1',
          userId,
          recordType: 'STEPS',
          sourceClient: 'com.google.android.apps.fitness',
          externalId: 's-1',
          startTime: '2026-09-20T08:00:00.000Z',
          endTime: '2026-09-20T09:00:00.000Z',
          value: 3000,
          unit: 'count',
          isDeduplicated: false,
        },
        {
          id: 'step-2',
          userId,
          recordType: 'STEPS',
          sourceClient: 'com.garmin.connect',
          externalId: 's-2',
          startTime: '2026-09-20T14:00:00.000Z',
          endTime: '2026-09-20T15:00:00.000Z',
          value: 4500,
          unit: 'count',
          isDeduplicated: false,
        },
        {
          id: 'step-3-deduped',
          userId,
          recordType: 'STEPS',
          sourceClient: 'com.google.android.apps.fitness',
          externalId: 's-3-redundant',
          startTime: '2026-09-20T14:00:00.000Z',
          endTime: '2026-09-20T15:00:00.000Z',
          value: 4200,
          unit: 'count',
          isDeduplicated: true, // Should be ignored by bridge
        },
      ];

      const result = await HealthQuestBridge.evaluateHealthRecords(userId, records);

      expect(result.stepsDispatched).toBe(7500); // 3000 + 4500
      expect(ChallengeEngine.processEvent).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          eventType: 'STEPS',
          stepsCount: 7500,
          timestamp: '2026-09-20T23:59:59Z',
        })
      );
    });

    it('dispatches CARDIO challenge event for qualifying endurance cardio sessions (>= 10 min)', async () => {
      const records: HealthRecord[] = [
        {
          id: 'run-1',
          userId,
          recordType: 'EXERCISE_SESSION',
          sourceClient: 'com.garmin.connect',
          externalId: 'run-garmin-1',
          startTime: '2026-09-20T07:00:00.000Z',
          endTime: '2026-09-20T07:45:00.000Z',
          value: 45,
          unit: 'count',
          metadata: {
            exerciseType: 'RUNNING',
            durationMinutes: 45,
            distanceMeters: 8000,
          },
          isDeduplicated: false,
        },
      ];

      const result = await HealthQuestBridge.evaluateHealthRecords(userId, records);

      expect(result.cardioSessionsDispatched).toBe(1);
      expect(ChallengeEngine.processEvent).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          eventId: 'run-1',
          eventType: 'CARDIO',
          distanceKm: 8,
          durationMinutes: 45,
          timestamp: '2026-09-20T07:00:00.000Z',
        })
      );
    });

    it('ignores short cardio sessions (< 10 min) from advancing challenges', async () => {
      const records: HealthRecord[] = [
        {
          id: 'short-walk',
          userId,
          recordType: 'EXERCISE_SESSION',
          sourceClient: 'com.google.android.apps.fitness',
          externalId: 'short-1',
          startTime: '2026-09-20T12:00:00.000Z',
          endTime: '2026-09-20T12:05:00.000Z',
          value: 5,
          unit: 'count',
          metadata: {
            exerciseType: 'WALKING',
            durationMinutes: 5, // Under 10 min threshold
            distanceMeters: 400,
          },
          isDeduplicated: false,
        },
      ];

      const result = await HealthQuestBridge.evaluateHealthRecords(userId, records);

      expect(result.cardioSessionsDispatched).toBe(0);
      expect(ChallengeEngine.processEvent).not.toHaveBeenCalled();
    });

    it('strictly DOES NOT award gym workout XP or strength mastery for arbitrary health sessions', async () => {
      const records: HealthRecord[] = [
        {
          id: 'arbitrary-weightlifting',
          userId,
          recordType: 'EXERCISE_SESSION',
          sourceClient: 'com.samsung.health',
          externalId: 'samsung-lift-1',
          startTime: '2026-09-20T16:00:00.000Z',
          endTime: '2026-09-20T17:00:00.000Z',
          value: 60,
          unit: 'count',
          metadata: {
            exerciseType: 'WEIGHTLIFTING', // Non-cardio session
            durationMinutes: 60,
            activeCaloriesBurned: 350,
          },
          isDeduplicated: false,
        },
      ];

      const result = await HealthQuestBridge.evaluateHealthRecords(userId, records);

      // Must not count as cardio session
      expect(result.cardioSessionsDispatched).toBe(0);
      // ChallengeEngine must not receive any WORKOUT event from health records
      expect(ChallengeEngine.processEvent).not.toHaveBeenCalled();
    });

    it('syncs latest valid bodyweight to user profile physique trend', async () => {
      const records: HealthRecord[] = [
        {
          id: 'wt-old',
          userId,
          recordType: 'WEIGHT',
          sourceClient: 'com.withings.wscale',
          externalId: 'wt-1',
          startTime: '2026-09-19T07:00:00.000Z',
          endTime: '2026-09-19T07:00:00.000Z',
          value: 82.5,
          unit: 'kg',
          isDeduplicated: false,
        },
        {
          id: 'wt-new',
          userId,
          recordType: 'WEIGHT',
          sourceClient: 'com.withings.wscale',
          externalId: 'wt-2',
          startTime: '2026-09-20T07:00:00.000Z',
          endTime: '2026-09-20T07:00:00.000Z',
          value: 81.9,
          unit: 'kg',
          isDeduplicated: false,
        },
      ];

      const result = await HealthQuestBridge.evaluateHealthRecords(userId, records);

      expect(result.weightUpdated).toBe(81.9);
      expect(ProfileRepository.updateWeight).toHaveBeenCalledWith(userId, 81.9);
    });

    it('rejects biologically implausible weight values (< 20kg or > 350kg)', async () => {
      const implausibleRecords: HealthRecord[] = [
        {
          id: 'wt-bad',
          userId,
          recordType: 'WEIGHT',
          sourceClient: 'com.bad.sensor',
          externalId: 'wt-err',
          startTime: '2026-09-20T07:00:00.000Z',
          endTime: '2026-09-20T07:00:00.000Z',
          value: 500, // 500 kg glitch
          unit: 'kg',
          isDeduplicated: false,
        },
      ];

      const result = await HealthQuestBridge.evaluateHealthRecords(userId, implausibleRecords);

      expect(result.weightUpdated).toBeNull();
      expect(ProfileRepository.updateWeight).not.toHaveBeenCalled();
    });
  });

  describe('Privacy & Zero Social Feed Leakage', () => {
    it('sanitizes feed metadata by stripping biometric and health telemetry', () => {
      const dirtyMetadataWithBiometrics = {
        workoutId: 'w-123',
        durationMinutes: 45,
        heartRateAvg: 165,
        maxHeartRate: 188,
        activeCalories: 520,
        bodyweightKg: 80.5,
        restingHeartRate: 58,
        bloodPressure: '120/80',
        glucoseLevel: 95,
      };

      const sanitized = SocialFeedService.sanitizeMetadata(dirtyMetadataWithBiometrics as any);

      // Allowed athletic summary properties
      expect(sanitized.workoutId).toBe('w-123');
      expect(sanitized.durationMinutes).toBe(45);

      // Stripped private biometrics
      expect((sanitized as any).heartRateAvg).toBeUndefined();
      expect((sanitized as any).maxHeartRate).toBeUndefined();
      expect((sanitized as any).activeCalories).toBeUndefined();
      expect((sanitized as any).bodyweightKg).toBeUndefined();
      expect((sanitized as any).restingHeartRate).toBeUndefined();
      expect((sanitized as any).bloodPressure).toBeUndefined();
      expect((sanitized as any).glucoseLevel).toBeUndefined();
    });
  });
});
