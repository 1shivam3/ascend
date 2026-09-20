import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthIntegrationService } from '../HealthIntegrationService';
import { MockHealthConnectAdapter } from '../HealthConnectAdapter';
import { HealthRepository } from '../../../database/repositories/HealthRepository';
import { HealthPermission } from '../../../types/health.types';

// In-memory sqlite mock
const { mockDb, state } = vi.hoisted(() => {
  const state = {
    health_sync_state: [] as any[],
    health_records: [] as any[],
  };

  const db = {
    runAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.startsWith('INSERT INTO health_sync_state')) {
        const [id, user_id, is_connected, granted_permissions, last_sync_time, sync_cursor, created_at, updated_at] = params;
        state.health_sync_state.push({
          id, user_id, is_connected, granted_permissions, last_sync_time, sync_cursor, created_at, updated_at
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

describe('Health Connect Permissions & Availability Suite', () => {
  const userId = 'user-health-test';
  let mockAdapter: MockHealthConnectAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    state.health_sync_state = [];
    state.health_records = [];
    mockAdapter = new MockHealthConnectAdapter('AVAILABLE');
    HealthIntegrationService.setAdapter(mockAdapter);
  });

  it('handles full permissions granted flow', async () => {
    const requested: HealthPermission[] = [
      'READ_STEPS',
      'READ_EXERCISE',
      'READ_DISTANCE',
      'READ_WEIGHT',
    ];

    const granted = await HealthIntegrationService.connect(userId, requested);

    expect(granted).toEqual(requested);
    const syncState = await HealthRepository.getSyncState(userId);
    expect(syncState?.isConnected).toBe(true);
    expect(syncState?.grantedPermissions).toEqual(requested);
  });

  it('handles permissions denied flow gracefully without application disruption', async () => {
    // Adapter returns empty array on permission request (user pressed Deny)
    vi.spyOn(mockAdapter, 'requestPermissions').mockResolvedValueOnce([]);

    const requested: HealthPermission[] = ['READ_STEPS', 'READ_HEART_RATE'];
    const granted = await HealthIntegrationService.connect(userId, requested);

    expect(granted).toEqual([]);
    const syncState = await HealthRepository.getSyncState(userId);
    expect(syncState?.isConnected).toBe(false);
    expect(syncState?.grantedPermissions).toEqual([]);

    // Verify app continues functioning without permissions
    const summary = await HealthIntegrationService.getDailySummary(userId);
    expect(summary.steps).toBe(0);
    expect(summary.weightKg).toBeNull();
  });

  it('handles partial permissions flow (user grants Steps, denies Heart Rate)', async () => {
    // Simulate user granting only READ_STEPS and READ_DISTANCE
    vi.spyOn(mockAdapter, 'requestPermissions').mockResolvedValueOnce(['READ_STEPS', 'READ_DISTANCE']);

    const requested: HealthPermission[] = [
      'READ_STEPS',
      'READ_DISTANCE',
      'READ_HEART_RATE',
      'READ_WEIGHT',
    ];

    const granted = await HealthIntegrationService.connect(userId, requested);

    expect(granted).toEqual(['READ_STEPS', 'READ_DISTANCE']);
    expect(granted).not.toContain('READ_HEART_RATE');
    expect(granted).not.toContain('READ_WEIGHT');

    const syncState = await HealthRepository.getSyncState(userId);
    expect(syncState?.isConnected).toBe(true);
    expect(syncState?.grantedPermissions).toEqual(['READ_STEPS', 'READ_DISTANCE']);
  });

  it('handles revoked permissions on disconnect', async () => {
    // First connect
    await HealthIntegrationService.connect(userId, ['READ_STEPS']);
    let syncState = await HealthRepository.getSyncState(userId);
    expect(syncState?.isConnected).toBe(true);

    // User disconnects
    await HealthIntegrationService.disconnect(userId);

    syncState = await HealthRepository.getSyncState(userId);
    expect(syncState?.isConnected).toBe(false);
    expect(syncState?.grantedPermissions).toEqual([]);
  });

  it('handles SDK status check when provider requires update or is unavailable', async () => {
    mockAdapter.setSdkStatus('PROVIDER_UPDATE_REQUIRED');
    let status = await HealthIntegrationService.checkSdkStatus();
    expect(status).toBe('PROVIDER_UPDATE_REQUIRED');

    mockAdapter.setSdkStatus('UNAVAILABLE');
    status = await HealthIntegrationService.checkSdkStatus();
    expect(status).toBe('UNAVAILABLE');

    // Trying to connect when unavailable returns empty permissions safely
    const granted = await HealthIntegrationService.connect(userId, ['READ_STEPS']);
    expect(granted).toEqual([]);
  });
});
