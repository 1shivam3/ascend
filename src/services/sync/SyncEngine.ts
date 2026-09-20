import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { supabase } from '../../lib/supabase';
import {
  SyncQueueRepository,
  LocalSyncQueueItem,
  SyncQueueStats,
} from '../../database/repositories/SyncQueueRepository';
import { useSyncStore, SyncStatus } from '../../store/useSyncStore';
import { MasteryRepository } from '../../database/repositories/MasteryRepository';

export interface RemoteSyncError {
  message: string;
  status?: number;
  code?: string;
}

export interface RemoteSyncClient {
  upsert(
    table: string,
    payload: Record<string, unknown>,
    options?: { onConflict?: string; ignoreDuplicates?: boolean }
  ): Promise<{ error?: RemoteSyncError | null; data?: unknown }>;
  fetchRecord(
    table: string,
    filter: Record<string, unknown>
  ): Promise<{ data?: any; error?: RemoteSyncError | null }>;
  refreshSession(): Promise<{ error?: RemoteSyncError | null; session?: unknown }>;
  isAuthenticated(): Promise<boolean>;
}

export interface SyncResult {
  status: SyncStatus;
  syncedCount: number;
  failedCount: number;
  remainingCount: number;
}

/**
 * Default production remote client communicating with Supabase.
 */
export class SupabaseSyncClient implements RemoteSyncClient {
  async upsert(
    table: string,
    payload: Record<string, unknown>,
    options?: { onConflict?: string; ignoreDuplicates?: boolean }
  ): Promise<{ error?: RemoteSyncError | null; data?: unknown }> {
    try {
      const query = supabase.from(table).upsert(payload, options as any);
      const { data, error } = await query;
      if (error) {
        return {
          error: {
            message: error.message,
            status: (error as any).status || 500,
            code: error.code,
          },
        };
      }
      return { data };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network request failed';
      return { error: { message, status: 503 } };
    }
  }

  async fetchRecord(
    table: string,
    filter: Record<string, unknown>
  ): Promise<{ data?: any; error?: RemoteSyncError | null }> {
    try {
      let query = supabase.from(table).select('*');
      for (const [key, value] of Object.entries(filter)) {
        query = query.eq(key, value);
      }
      const { data, error } = await query.maybeSingle();
      if (error) {
        return {
          error: {
            message: error.message,
            status: (error as any).status || 500,
            code: error.code,
          },
        };
      }
      return { data };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Fetch failed';
      return { error: { message, status: 503 } };
    }
  }

  async refreshSession(): Promise<{ error?: RemoteSyncError | null; session?: unknown }> {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        return {
          error: {
            message: error.message,
            status: (error as any).status || 401,
          },
        };
      }
      return { session: data.session };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Auth refresh failed';
      return { error: { message, status: 401 } };
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const { data } = await supabase.auth.getSession();
      return Boolean(data.session);
    } catch {
      return false;
    }
  }
}

export class SyncEngine {
  private static remoteClient: RemoteSyncClient = new SupabaseSyncClient();
  private static isSyncing = false;
  private static unsubscribeNetInfo: (() => void) | null = null;
  private static networkOverride: boolean | null = null;
  private static readonly OPERATION_TIMEOUT_MS = 10000; // 10s per request
  private static readonly MAX_RETRIES = 5;

  /**
   * Overrides remote client for unit testing / simulated failure scenarios.
   */
  static setRemoteClient(client: RemoteSyncClient | null): void {
    this.remoteClient = client || new SupabaseSyncClient();
  }

  /**
   * Overrides network connection state for testing offline/online transitions.
   */
  static setNetworkOverride(isConnected: boolean | null): void {
    this.networkOverride = isConnected;
  }

  /**
   * Initializes background synchronization listeners.
   */
  static init(): void {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
    }

    this.unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (online) {
        // Automatically drain sync queue when connection is restored
        this.syncPendingOperations().catch(err => {
          console.warn('[SyncEngine] Background sync on reconnect failed:', err);
        });
      } else {
        useSyncStore.getState().setStatus('OFFLINE');
      }
    });

    // Update queue stats on boot
    this.refreshQueueStats().catch(() => {});
  }

  /**
   * Cleans up listeners.
   */
  static destroy(): void {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
  }

  /**
   * Resets all failed queue items and triggers an immediate sync cycle.
   */
  static async retryFailed(): Promise<SyncResult> {
    await SyncQueueRepository.retryAllFailed();
    await this.refreshQueueStats();
    return this.syncPendingOperations();
  }

  /**
   * Executes a full synchronization cycle of pending operations.
   */
  static async syncPendingOperations(batchSize: number = 25): Promise<SyncResult> {
    // 1. Check network state
    const isOnline = await this.checkIsOnline();
    if (!isOnline) {
      useSyncStore.getState().setStatus('OFFLINE');
      const stats = await SyncQueueRepository.getQueueStats();
      useSyncStore.getState().updateStats(stats);
      return {
        status: 'OFFLINE',
        syncedCount: 0,
        failedCount: 0,
        remainingCount: stats.pending,
      };
    }

    // 2. Prevent concurrent sync executions (idempotent lock)
    if (this.isSyncing) {
      const stats = await SyncQueueRepository.getQueueStats();
      return {
        status: 'SYNCING',
        syncedCount: 0,
        failedCount: 0,
        remainingCount: stats.pending,
      };
    }

    this.isSyncing = true;
    useSyncStore.getState().setStatus('SYNCING');

    let syncedCount = 0;
    let failedCount = 0;
    let isAuthPaused = false;

    try {
      // 3. Check authentication status
      const isAuth = await this.remoteClient.isAuthenticated();
      if (!isAuth) {
        // In Guest mode or logged-out state, pause remote sync while keeping local queue safe
        useSyncStore.getState().setStatus('PAUSED', 'Authentication required for remote sync');
        const stats = await SyncQueueRepository.getQueueStats();
        useSyncStore.getState().updateStats(stats);
        return {
          status: 'PAUSED',
          syncedCount: 0,
          failedCount: 0,
          remainingCount: stats.pending,
        };
      }

      // 4. Fetch eligible pending operations
      const pendingItems = await SyncQueueRepository.getPending(batchSize, this.MAX_RETRIES);
      if (pendingItems.length === 0) {
        const stats = await SyncQueueRepository.getQueueStats();
        useSyncStore.getState().updateStats(stats);
        useSyncStore.getState().setStatus('IDLE');
        return {
          status: 'IDLE',
          syncedCount: 0,
          failedCount: 0,
          remainingCount: stats.pending,
        };
      }

      // 5. Mark items in-flight
      const itemIds = pendingItems.map(item => item.id);
      await SyncQueueRepository.markInFlight(itemIds);

      // 6. Process each mutation with server acknowledgement & conflict resolution
      for (const item of pendingItems) {
        const result = await this.processQueueItemWithTimeout(item);

        if (result.success) {
          await SyncQueueRepository.markApplied([item.id]);
          syncedCount++;
        } else if (result.authExpired) {
          // 401 Unauthorized: Attempt token refresh
          const refreshResult = await this.remoteClient.refreshSession();
          if (!refreshResult.error) {
            // Refreshed successfully: retry current item once
            const retryResult = await this.processQueueItemWithTimeout(item);
            if (retryResult.success) {
              await SyncQueueRepository.markApplied([item.id]);
              syncedCount++;
              continue;
            }
          }
          // Refresh failed or user logged out: pause queue without dropping items!
          isAuthPaused = true;
          await SyncQueueRepository.markRetry(item.id, 'Authentication expired', 5000);
          failedCount++;
          break; // Stop processing further items until user re-authenticates
        } else if (result.permanentFailure) {
          // Permanent failure (e.g. 400 Bad Request or malformed): mark failed, proceed to next
          await SyncQueueRepository.markFailed(item.id, result.error || 'Permanent error');
          failedCount++;
        } else {
          // Transient error (5xx, timeout, network glitch): exponential backoff with jitter
          const attempts = item.attempts + 1;
          const backoffMs = Math.min(60000, 1000 * Math.pow(2, attempts)) + Math.random() * 500;
          await SyncQueueRepository.markRetry(item.id, result.error || 'Sync failed', backoffMs);
          failedCount++;
        }
      }

      // 7. Update store stats & timestamps
      const now = new Date().toISOString();
      if (syncedCount > 0) {
        useSyncStore.getState().setLastSyncAt(now);
      }

      const finalStats = await SyncQueueRepository.getQueueStats();
      useSyncStore.getState().updateStats(finalStats);

      const finalStatus: SyncStatus = isAuthPaused ? 'PAUSED' : failedCount > 0 ? 'ERROR' : 'IDLE';
      const statusError = isAuthPaused ? 'Authentication session expired' : failedCount > 0 ? `${failedCount} operations failed` : null;
      useSyncStore.getState().setStatus(finalStatus, statusError);

      return {
        status: finalStatus,
        syncedCount,
        failedCount,
        remainingCount: finalStats.pending,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sync cycle encountered an unexpected error';
      useSyncStore.getState().setStatus('ERROR', message);
      const stats = await SyncQueueRepository.getQueueStats();
      useSyncStore.getState().updateStats(stats);
      return {
        status: 'ERROR',
        syncedCount,
        failedCount,
        remainingCount: stats.pending,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Resets all failed operations and immediately triggers sync.
   */
  static async retryFailedOperations(): Promise<SyncResult> {
    await SyncQueueRepository.retryAllFailed();
    return this.syncPendingOperations();
  }

  /**
   * Refreshes queue statistics in the store.
   */
  static async refreshQueueStats(): Promise<SyncQueueStats> {
    const stats = await SyncQueueRepository.getQueueStats();
    useSyncStore.getState().updateStats(stats);
    return stats;
  }

  /**
   * Processes a single queue item wrapped in a timeout promise to handle slow networks.
   */
  private static async processQueueItemWithTimeout(
    item: LocalSyncQueueItem
  ): Promise<{ success: boolean; error?: string; authExpired?: boolean; permanentFailure?: boolean }> {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<{
      success: boolean;
      error?: string;
      authExpired?: boolean;
      permanentFailure?: boolean;
    }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          success: false,
          error: `Request timed out after ${this.OPERATION_TIMEOUT_MS}ms`,
        });
      }, this.OPERATION_TIMEOUT_MS);
    });

    const executionPromise = this.dispatchMutation(item);

    try {
      const result = await Promise.race([executionPromise, timeoutPromise]);
      return result;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * Dispatches the local mutation to the remote sync client with deterministic conflict resolution.
   */
  private static async dispatchMutation(
    item: LocalSyncQueueItem
  ): Promise<{ success: boolean; error?: string; authExpired?: boolean; permanentFailure?: boolean }> {
    const { entityType, payload } = item;

    // Entity-specific conflict handling
    if (entityType === 'personal_record') {
      return this.handlePersonalRecordSync(payload);
    }

    const table = this.resolveTableName(entityType);
    if (!table) {
      return { success: false, error: `Unknown entity type: ${entityType}`, permanentFailure: true };
    }

    const conflictOptions = this.getConflictOptions(entityType);
    const { error } = await this.remoteClient.upsert(table, payload, conflictOptions);

    if (error) {
      if (error.status === 401) {
        return { success: false, error: error.message, authExpired: true };
      }
      if (error.status === 400) {
        return { success: false, error: error.message, permanentFailure: true };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  /**
   * Handles Personal Record synchronization with Highest Value Wins conflict resolution.
   */
  private static async handlePersonalRecordSync(
    payload: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string; authExpired?: boolean; permanentFailure?: boolean }> {
    const userId = payload.user_id as string;
    const exerciseId = payload.exercise_id as string;
    const prType = payload.pr_type as string;
    const clientValue = Number(payload.value);

    // Check remote record
    const { data: serverRecord, error: fetchError } = await this.remoteClient.fetchRecord(
      'personal_records',
      { user_id: userId, exercise_id: exerciseId, pr_type: prType }
    );

    if (fetchError && fetchError.status === 401) {
      return { success: false, error: fetchError.message, authExpired: true };
    }

    if (serverRecord) {
      const serverValue = Number(serverRecord.value);
      if (serverValue > clientValue) {
        // Highest Value Wins: Server PR is higher, adopt server value locally
        await MasteryRepository.savePersonalRecord({
          id: serverRecord.id,
          userId: serverRecord.user_id,
          exerciseId: serverRecord.exercise_id,
          prType: serverRecord.pr_type,
          value: serverValue,
          setLogId: serverRecord.set_log_id,
          achievedAt: serverRecord.achieved_at,
        });
        // Acknowledged as reconciled
        return { success: true };
      }
    }

    // Client value is equal or higher: upsert to remote
    const { error } = await this.remoteClient.upsert('personal_records', payload, {
      onConflict: 'user_id,exercise_id,pr_type',
    });

    if (error) {
      if (error.status === 401) return { success: false, error: error.message, authExpired: true };
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  private static resolveTableName(entityType: string): string | null {
    switch (entityType) {
      case 'workout':
        return 'workouts';
      case 'exercise_log':
        return 'exercise_logs';
      case 'set_log':
        return 'set_logs';
      case 'exercise_mastery':
        return 'exercise_mastery';
      case 'personal_record':
        return 'personal_records';
      case 'user_quest':
        return 'user_quests';
      case 'xp_transaction':
        return 'xp_transactions';
      case 'user_achievement':
        return 'user_achievements';
      case 'nutrition_log':
        return 'nutrition_logs';
      case 'profile':
        return 'profiles';
      case 'challenge':
        return 'challenges';
      case 'challenge_participant':
        return 'challenge_participants';
      default:
        return null;
    }
  }

  private static getConflictOptions(entityType: string): { onConflict?: string; ignoreDuplicates?: boolean } {
    switch (entityType) {
      case 'xp_transaction':
        return { onConflict: 'user_id,source_type,source_id', ignoreDuplicates: true };
      case 'user_achievement':
        return { onConflict: 'user_id,achievement_id', ignoreDuplicates: true };
      case 'nutrition_log':
        return { onConflict: 'user_id,date' };
      case 'exercise_mastery':
        return { onConflict: 'user_id,exercise_id' };
      case 'challenge_participant':
        return { onConflict: 'challenge_id,user_id' };
      default:
        return {};
    }
  }

  private static async checkIsOnline(): Promise<boolean> {
    if (this.networkOverride !== null) {
      return this.networkOverride;
    }
    try {
      const state = await NetInfo.fetch();
      return Boolean(state.isConnected && state.isInternetReachable !== false);
    } catch {
      return false;
    }
  }
}
