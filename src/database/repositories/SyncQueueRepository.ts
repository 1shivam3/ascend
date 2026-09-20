import { getDatabase } from '../sqlite';
import { SqliteSyncQueueRow } from '../types';

export interface LocalSyncQueueItem {
  id: string;
  idempotencyKey?: string | null;
  entityType: string;
  entityId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown>;
  clientTimestamp: number;
  attempts: number;
  nextRetryAt?: number | null;
  lastError?: string | null;
  status: 'PENDING' | 'IN_FLIGHT' | 'FAILED';
}

export interface SyncQueueStats {
  pending: number;
  inFlight: number;
  failed: number;
  total: number;
}

export class SyncQueueRepository {
  /**
   * Enqueues a mutation operation for background synchronization.
   * If an idempotencyKey is provided and an operation with that key already exists,
   * it updates the payload and resets status to PENDING if not already completed.
   */
  static async enqueue(
    entityType: string,
    entityId: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: unknown,
    idempotencyKey?: string
  ): Promise<string> {
    const db = await getDatabase();
    const id = `sync-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();
    const key = idempotencyKey || `${entityType}:${entityId}:${operation}`;

    // If an item with the exact same idempotency key exists, update its payload
    const existing = await db.getFirstAsync<{ id: string; status: string }>(
      `SELECT id, status FROM local_sync_queue WHERE idempotency_key = ? LIMIT 1;`,
      [key]
    );

    if (existing) {
      await db.runAsync(
        `UPDATE local_sync_queue SET 
          payload = ?, 
          client_timestamp = ?, 
          status = 'PENDING',
          next_retry_at = NULL,
          last_error = NULL
        WHERE id = ?;`,
        [JSON.stringify(payload), now, existing.id]
      );
      return existing.id;
    }

    await db.runAsync(
      `INSERT INTO local_sync_queue (
        id, idempotency_key, entity_type, entity_id, operation, payload, client_timestamp, attempts, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'PENDING');`,
      [
        id,
        key,
        entityType,
        entityId,
        operation,
        JSON.stringify(payload),
        now,
      ]
    );

    return id;
  }

  /**
   * Retrieves pending operations eligible for execution.
   * Filters out items that haven't reached their next_retry_at backoff timestamp,
   * or items that have exceeded max attempts.
   */
  static async getPending(
    limit: number = 50,
    maxAttempts: number = 5
  ): Promise<LocalSyncQueueItem[]> {
    const db = await getDatabase();
    const now = Date.now();
    const rows = await db.getAllAsync<SqliteSyncQueueRow>(
      `SELECT * FROM local_sync_queue 
       WHERE status = 'PENDING' 
         AND attempts < ?
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY client_timestamp ASC 
       LIMIT ?;`,
      [maxAttempts, now, limit]
    );

    return rows.map(r => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(r.payload);
      } catch {
        // fallback
      }
      return {
        id: r.id,
        idempotencyKey: r.idempotency_key,
        entityType: r.entity_type,
        entityId: r.entity_id,
        operation: r.operation as 'INSERT' | 'UPDATE' | 'DELETE',
        payload,
        clientTimestamp: r.client_timestamp,
        attempts: r.attempts,
        nextRetryAt: r.next_retry_at,
        lastError: r.last_error,
        status: r.status as 'PENDING' | 'IN_FLIGHT' | 'FAILED',
      };
    });
  }

  /**
   * Marks operations as currently being processed.
   */
  static async markInFlight(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE local_sync_queue SET status = 'IN_FLIGHT', attempts = attempts + 1 WHERE id IN (${placeholders});`,
      ids
    );
  }

  /**
   * Marks operations as successfully acknowledged and removes them from the pending queue.
   */
  static async markApplied(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `DELETE FROM local_sync_queue WHERE id IN (${placeholders});`,
      ids
    );
  }

  /**
   * Marks an operation for retry with exponential backoff.
   */
  static async markRetry(id: string, error: string, backoffMs: number): Promise<void> {
    const db = await getDatabase();
    const nextRetryAt = Date.now() + backoffMs;
    await db.runAsync(
      `UPDATE local_sync_queue SET 
        status = 'PENDING', 
        next_retry_at = ?, 
        last_error = ? 
      WHERE id = ?;`,
      [nextRetryAt, error, id]
    );
  }

  /**
   * Marks an operation as permanently failed after exhausting retries or on critical error.
   */
  static async markFailed(id: string, error: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE local_sync_queue SET status = 'FAILED', last_error = ? WHERE id = ?;`,
      [error, id]
    );
  }

  /**
   * Resets all failed operations back to PENDING for manual or automated recovery.
   */
  static async retryAllFailed(): Promise<number> {
    const db = await getDatabase();
    const result = await db.runAsync(
      `UPDATE local_sync_queue SET 
        status = 'PENDING', 
        attempts = 0, 
        next_retry_at = NULL, 
        last_error = NULL 
      WHERE status = 'FAILED';`
    );
    return result.changes;
  }

  /**
   * Retrieves summary statistics of the synchronization queue.
   */
  static async getQueueStats(): Promise<SyncQueueStats> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count FROM local_sync_queue GROUP BY status;`
    );

    let pending = 0;
    let inFlight = 0;
    let failed = 0;

    for (const r of rows) {
      if (r.status === 'PENDING') pending = r.count;
      else if (r.status === 'IN_FLIGHT') inFlight = r.count;
      else if (r.status === 'FAILED') failed = r.count;
    }

    return {
      pending,
      inFlight,
      failed,
      total: pending + inFlight + failed,
    };
  }

  /**
   * Clears all queue items (used in testing or account reset).
   */
  static async clearQueue(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM local_sync_queue;');
  }
}
