import { getDatabase } from '../sqlite';

export interface LocalSyncQueueRow {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: any;
  clientTimestamp: number;
  attempts: number;
  lastError?: string | null;
  status: 'PENDING' | 'IN_FLIGHT' | 'FAILED';
}

export class SyncQueueRepository {
  static async enqueue(
    entityType: string,
    entityId: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: any
  ): Promise<void> {
    const db = await getDatabase();
    const id = `sync-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    await db.runAsync(
      `INSERT INTO local_sync_queue (
        id, entity_type, entity_id, operation, payload, client_timestamp, attempts, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING');`,
      [
        id,
        entityType,
        entityId,
        operation,
        JSON.stringify(payload),
        now,
        0,
      ]
    );
  }

  static async getPending(limit: number = 50): Promise<LocalSyncQueueRow[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM local_sync_queue 
       WHERE status = 'PENDING' 
       ORDER BY client_timestamp ASC LIMIT ?;`,
      [limit]
    );

    return rows.map(r => {
      let payload = {};
      try {
        payload = JSON.parse(r.payload);
      } catch {
        // fallback
      }
      return {
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        operation: r.operation,
        payload,
        clientTimestamp: r.client_timestamp,
        attempts: r.attempts,
        lastError: r.last_error,
        status: r.status,
      };
    });
  }

  static async markInFlight(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE local_sync_queue SET status = 'IN_FLIGHT', attempts = attempts + 1 WHERE id IN (${placeholders});`,
      ids
    );
  }

  static async markApplied(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `DELETE FROM local_sync_queue WHERE id IN (${placeholders});`,
      ids
    );
  }

  static async markFailed(id: string, error: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE local_sync_queue SET status = 'FAILED', last_error = ? WHERE id = ?;`,
      [error, id]
    );
  }
}
