import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncEngine, RemoteSyncClient } from '../SyncEngine';
import { SyncQueueRepository, LocalSyncQueueItem } from '../../../database/repositories/SyncQueueRepository';
import { MasteryRepository } from '../../../database/repositories/MasteryRepository';
import { useSyncStore } from '../../../store/useSyncStore';

// Mock NetInfo
vi.mock('@react-native-community/netinfo', () => ({
  default: {
    addEventListener: vi.fn(() => vi.fn()),
    fetch: vi.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  },
}));

// Mock Supabase
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-pilot' } } } }),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }),
    },
  },
}));

describe('ASCEND SyncEngine & Offline Reliability Pass', () => {
  let inMemoryQueue: LocalSyncQueueItem[] = [];

  // Create a controlled mock remote client
  const mockRemoteClient: RemoteSyncClient = {
    upsert: vi.fn().mockResolvedValue({ data: { id: 'remote-1' }, error: null }),
    fetchRecord: vi.fn().mockResolvedValue({ data: null, error: null }),
    refreshSession: vi.fn().mockResolvedValue({ session: {}, error: null }),
    isAuthenticated: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    inMemoryQueue = [];
    useSyncStore.getState().reset();

    // Wire SyncQueueRepository methods to use in-memory queue for deterministic inspection
    vi.spyOn(SyncQueueRepository, 'getPending').mockImplementation(async (limit = 50, maxAttempts = 5) => {
      const now = Date.now();
      return inMemoryQueue
        .filter(
          item =>
            item.status === 'PENDING' &&
            item.attempts < maxAttempts &&
            (!item.nextRetryAt || item.nextRetryAt <= now)
        )
        .slice(0, limit);
    });

    vi.spyOn(SyncQueueRepository, 'getQueueStats').mockImplementation(async () => {
      let pending = 0;
      let inFlight = 0;
      let failed = 0;
      for (const item of inMemoryQueue) {
        if (item.status === 'PENDING') pending++;
        else if (item.status === 'IN_FLIGHT') inFlight++;
        else if (item.status === 'FAILED') failed++;
      }
      return { pending, inFlight, failed, total: pending + inFlight + failed };
    });

    vi.spyOn(SyncQueueRepository, 'markInFlight').mockImplementation(async (ids: string[]) => {
      for (const id of ids) {
        const item = inMemoryQueue.find(q => q.id === id);
        if (item) {
          item.status = 'IN_FLIGHT';
          item.attempts += 1;
        }
      }
    });

    vi.spyOn(SyncQueueRepository, 'markApplied').mockImplementation(async (ids: string[]) => {
      inMemoryQueue = inMemoryQueue.filter(item => !ids.includes(item.id));
    });

    vi.spyOn(SyncQueueRepository, 'markRetry').mockImplementation(async (id: string, error: string, backoffMs: number) => {
      const item = inMemoryQueue.find(q => q.id === id);
      if (item) {
        item.status = 'PENDING';
        item.lastError = error;
        item.nextRetryAt = Date.now() + backoffMs;
      }
    });

    vi.spyOn(SyncQueueRepository, 'markFailed').mockImplementation(async (id: string, error: string) => {
      const item = inMemoryQueue.find(q => q.id === id);
      if (item) {
        item.status = 'FAILED';
        item.lastError = error;
      }
    });

    vi.spyOn(SyncQueueRepository, 'retryAllFailed').mockImplementation(async () => {
      let count = 0;
      for (const item of inMemoryQueue) {
        if (item.status === 'FAILED') {
          item.status = 'PENDING';
          item.attempts = 0;
          item.nextRetryAt = null;
          item.lastError = null;
          count++;
        }
      }
      return count;
    });

    // Configure test client and reset network override
    SyncEngine.setRemoteClient(mockRemoteClient);
    SyncEngine.setNetworkOverride(true);
  });

  it('1. Offline mode: mutations remain in SQLite queue and are not dispatched', async () => {
    // Simulate device being offline
    SyncEngine.setNetworkOverride(false);

    inMemoryQueue.push({
      id: 'item-offline-1',
      entityType: 'workout',
      entityId: 'w-1',
      operation: 'UPDATE',
      payload: { id: 'w-1', status: 'COMPLETED', xp_earned: 450 },
      clientTimestamp: Date.now(),
      attempts: 0,
      status: 'PENDING',
    });

    const result = await SyncEngine.syncPendingOperations();

    expect(result.status).toBe('OFFLINE');
    expect(result.syncedCount).toBe(0);
    // Verified: Remote client was never touched while offline
    expect(mockRemoteClient.upsert).not.toHaveBeenCalled();
    // Verified: Queue item remains safely in queue with status PENDING
    expect(inMemoryQueue).toHaveLength(1);
    expect(inMemoryQueue[0].status).toBe('PENDING');
    expect(useSyncStore.getState().status).toBe('OFFLINE');
  });

  it('2. Network restored: auto-syncs pending operations to remote gateway and drains queue', async () => {
    SyncEngine.setNetworkOverride(true);

    inMemoryQueue.push(
      {
        id: 'item-1',
        entityType: 'workout',
        entityId: 'w-1',
        operation: 'UPDATE',
        payload: { id: 'w-1', status: 'COMPLETED' },
        clientTimestamp: Date.now(),
        attempts: 0,
        status: 'PENDING',
      },
      {
        id: 'item-2',
        entityType: 'xp_transaction',
        entityId: 'tx-1',
        operation: 'INSERT',
        payload: { id: 'tx-1', amount: 500, user_id: 'user-pilot' },
        clientTimestamp: Date.now() + 10,
        attempts: 0,
        status: 'PENDING',
      }
    );

    const result = await SyncEngine.syncPendingOperations();

    expect(result.status).toBe('IDLE');
    expect(result.syncedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    // Queue items have been acknowledged and drained
    expect(inMemoryQueue).toHaveLength(0);
    expect(mockRemoteClient.upsert).toHaveBeenCalledTimes(2);
    expect(useSyncStore.getState().lastSyncAt).not.toBeNull();
  });

  it('3. App restart while offline: queued items persist and are restored from SQLite', async () => {
    // Stage pending mutations in queue as if written by previous app session
    inMemoryQueue.push({
      id: 'persisted-1',
      idempotencyKey: 'workout:w-persisted:complete',
      entityType: 'workout',
      entityId: 'w-persisted',
      operation: 'UPDATE',
      payload: { id: 'w-persisted', status: 'COMPLETED' },
      clientTimestamp: Date.now() - 60000,
      attempts: 0,
      status: 'PENDING',
    });

    // Boot fresh engine and check stats
    const stats = await SyncEngine.refreshQueueStats();
    expect(stats.pending).toBe(1);
    expect(useSyncStore.getState().pendingCount).toBe(1);

    // Sync when connection is active
    const result = await SyncEngine.syncPendingOperations();
    expect(result.syncedCount).toBe(1);
    expect(inMemoryQueue).toHaveLength(0);
  });

  it('4. Concurrent sync protection: avoids duplicate processing cycles via sync lock', async () => {
    inMemoryQueue.push({
      id: 'item-concurrent',
      entityType: 'workout',
      entityId: 'w-lock',
      operation: 'UPDATE',
      payload: { id: 'w-lock' },
      clientTimestamp: Date.now(),
      attempts: 0,
      status: 'PENDING',
    });

    // Simulate slow upsert
    (mockRemoteClient.upsert as any).mockImplementationOnce(
      () => new Promise(resolve => setTimeout(() => resolve({ error: null }), 50))
    );

    // Trigger two sync operations concurrently
    const [res1, res2] = await Promise.all([
      SyncEngine.syncPendingOperations(),
      SyncEngine.syncPendingOperations(),
    ]);

    // One handles the sync, the other detects in-progress sync and yields safely
    const totalSynced = res1.syncedCount + res2.syncedCount;
    expect(totalSynced).toBe(1);
    expect(mockRemoteClient.upsert).toHaveBeenCalledTimes(1);
  });

  it('5. Partial sync failure: server accepts item 1, fails item 2 (500), accepts item 3', async () => {
    inMemoryQueue.push(
      {
        id: 'q-item-1',
        entityType: 'workout',
        entityId: 'w-1',
        operation: 'UPDATE',
        payload: { id: 'w-1' },
        clientTimestamp: 100,
        attempts: 0,
        status: 'PENDING',
      },
      {
        id: 'q-item-2',
        entityType: 'user_quest',
        entityId: 'uq-1',
        operation: 'UPDATE',
        payload: { id: 'uq-1' },
        clientTimestamp: 200,
        attempts: 0,
        status: 'PENDING',
      },
      {
        id: 'q-item-3',
        entityType: 'nutrition_log',
        entityId: 'nl-1',
        operation: 'UPDATE',
        payload: { id: 'nl-1' },
        clientTimestamp: 300,
        attempts: 0,
        status: 'PENDING',
      }
    );

    // Item 1 succeeds, Item 2 fails with 500, Item 3 succeeds
    (mockRemoteClient.upsert as any)
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'Database busy', status: 500 } })
      .mockResolvedValueOnce({ error: null });

    const result = await SyncEngine.syncPendingOperations();

    expect(result.syncedCount).toBe(2);
    expect(result.failedCount).toBe(1);
    // Only item 2 remains in queue for retry; item 1 and 3 are removed
    expect(inMemoryQueue).toHaveLength(1);
    expect(inMemoryQueue[0].id).toBe('q-item-2');
    expect(inMemoryQueue[0].status).toBe('PENDING');
    expect(inMemoryQueue[0].attempts).toBe(1);
    expect(inMemoryQueue[0].nextRetryAt).toBeGreaterThan(Date.now());
  });

  it('6. Exponential backoff on transient 503 error', async () => {
    inMemoryQueue.push({
      id: 'item-503',
      entityType: 'workout',
      entityId: 'w-503',
      operation: 'UPDATE',
      payload: { id: 'w-503' },
      clientTimestamp: Date.now(),
      attempts: 2, // Already failed twice
      status: 'PENDING',
    });

    (mockRemoteClient.upsert as any).mockResolvedValueOnce({
      error: { message: 'Service Unavailable', status: 503 },
    });

    const result = await SyncEngine.syncPendingOperations();
    expect(result.failedCount).toBe(1);

    const item = inMemoryQueue[0];
    expect(item.attempts).toBe(3);
    // Backoff for attempt 3: 2^3 * 1000 = 8000ms (+ jitter)
    expect(item.nextRetryAt).toBeGreaterThanOrEqual(Date.now() + 7000);
  });

  it('7. Authentication expiration (401): attempts token refresh, pauses queue if expired', async () => {
    inMemoryQueue.push({
      id: 'item-401',
      entityType: 'workout',
      entityId: 'w-auth',
      operation: 'UPDATE',
      payload: { id: 'w-auth' },
      clientTimestamp: Date.now(),
      attempts: 0,
      status: 'PENDING',
    });

    // Remote returns 401 Unauthorized
    (mockRemoteClient.upsert as any).mockResolvedValueOnce({
      error: { message: 'JWT expired', status: 401 },
    });
    // Token refresh also fails (refresh token expired)
    (mockRemoteClient.refreshSession as any).mockResolvedValueOnce({
      error: { message: 'Invalid refresh token', status: 401 },
    });

    const result = await SyncEngine.syncPendingOperations();

    expect(result.status).toBe('PAUSED');
    expect(useSyncStore.getState().status).toBe('PAUSED');
    // Item is preserved with backoff, zero data loss
    expect(inMemoryQueue).toHaveLength(1);
    expect(inMemoryQueue[0].status).toBe('PENDING');
  });

  it('8. Manual retry: retryFailed resets failed items and restarts sync', async () => {
    inMemoryQueue.push({
      id: 'failed-item',
      entityType: 'workout',
      entityId: 'w-dead',
      operation: 'UPDATE',
      payload: { id: 'w-dead' },
      clientTimestamp: Date.now(),
      attempts: 5,
      status: 'FAILED',
      lastError: 'Max retries exhausted',
    });

    (mockRemoteClient.upsert as any).mockResolvedValueOnce({ error: null });

    const result = await SyncEngine.retryFailed();

    expect(result.syncedCount).toBe(1);
    expect(inMemoryQueue).toHaveLength(0);
  });

  it('9. Highest Value Wins: Personal Record conflict reconciliation', async () => {
    vi.spyOn(MasteryRepository, 'savePersonalRecord').mockResolvedValue(true);

    inMemoryQueue.push({
      id: 'item-pr',
      entityType: 'personal_record',
      entityId: 'pr-1',
      operation: 'INSERT',
      payload: {
        id: 'pr-1',
        user_id: 'user-pilot',
        exercise_id: 'ex-squat',
        pr_type: 'ESTIMATED_1RM',
        value: 120,
      },
      clientTimestamp: Date.now(),
      attempts: 0,
      status: 'PENDING',
    });

    // Server has a HIGHER PR of 135kg
    (mockRemoteClient.fetchRecord as any).mockResolvedValueOnce({
      data: {
        id: 'pr-server-1',
        user_id: 'user-pilot',
        exercise_id: 'ex-squat',
        pr_type: 'ESTIMATED_1RM',
        value: 135,
        achieved_at: '2026-09-19T00:00:00.000Z',
      },
      error: null,
    });

    const result = await SyncEngine.syncPendingOperations();

    expect(result.syncedCount).toBe(1);
    // Local SQLite adopted server's higher 135kg value
    expect(MasteryRepository.savePersonalRecord).toHaveBeenCalledWith(
      expect.objectContaining({ value: 135 })
    );
    // Queue item marked applied/reconciled
    expect(inMemoryQueue).toHaveLength(0);
  });
});
