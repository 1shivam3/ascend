import { getDatabase } from '../sqlite';
import {
  HealthRecord,
  HealthRecordType,
  HealthSyncState,
  HealthPermission,
} from '../../types/health.types';
import {
  SqliteHealthRecordRow,
  SqliteHealthSyncStateRow,
} from '../types';

export class HealthRepository {
  /**
   * Save a batch of health records into SQLite.
   * Enforces idempotency via INSERT OR IGNORE on primary key id.
   */
  static async saveRecords(
    records: HealthRecord[]
  ): Promise<{ inserted: number; skipped: number }> {
    if (records.length === 0) {
      return { inserted: 0, skipped: 0 };
    }

    const db = await getDatabase();
    const now = new Date().toISOString();
    let inserted = 0;
    let skipped = 0;

    for (const record of records) {
      const metadataStr = JSON.stringify(record.metadata || {});
      const syncedAt = record.syncedAt || now;
      const createdAt = record.createdAt || now;

      const result = await db.runAsync(
        `INSERT OR IGNORE INTO health_records (
          id, user_id, record_type, source_client, external_id,
          start_time, end_time, value, unit, metadata,
          is_deduplicated, synced_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          record.id,
          record.userId,
          record.recordType,
          record.sourceClient,
          record.externalId,
          record.startTime,
          record.endTime,
          record.value,
          record.unit,
          metadataStr,
          record.isDeduplicated ? 1 : 0,
          syncedAt,
          createdAt,
        ]
      );

      if ((result?.changes ?? 0) > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }

    return { inserted, skipped };
  }

  /**
   * Check if an external Health Connect record UID has already been ingested.
   */
  static async hasRecordByExternalId(
    userId: string,
    externalId: string
  ): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM health_records WHERE user_id = ? AND external_id = ?;`,
      [userId, externalId]
    );
    return row !== null;
  }

  /**
   * Fetch health records within a given time range.
   */
  static async getRecords(
    userId: string,
    recordType: HealthRecordType,
    startTime: string,
    endTime: string
  ): Promise<HealthRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SqliteHealthRecordRow>(
      `SELECT * FROM health_records
       WHERE user_id = ? 
         AND record_type = ? 
         AND start_time >= ? 
         AND end_time <= ?
         AND is_deduplicated = 0
       ORDER BY start_time ASC;`,
      [userId, recordType, startTime, endTime]
    );

    return rows.map(this.mapRecordRow);
  }

  /**
   * Get aggregated metric for a time range.
   * E.g., SUM for steps/distance/calories, AVG for heart rate, LATEST for weight.
   */
  static async getAggregatedMetric(
    userId: string,
    recordType: HealthRecordType,
    startTime: string,
    endTime: string
  ): Promise<number> {
    const db = await getDatabase();

    if (recordType === 'WEIGHT') {
      const row = await db.getFirstAsync<{ value: number }>(
        `SELECT value FROM health_records
         WHERE user_id = ? AND record_type = 'WEIGHT' AND start_time >= ? AND end_time <= ? AND is_deduplicated = 0
         ORDER BY start_time DESC LIMIT 1;`,
        [userId, startTime, endTime]
      );
      return row ? Number(row.value) : 0;
    }

    if (recordType === 'HEART_RATE') {
      const row = await db.getFirstAsync<{ avg_val: number }>(
        `SELECT AVG(value) as avg_val FROM health_records
         WHERE user_id = ? AND record_type = 'HEART_RATE' AND start_time >= ? AND end_time <= ? AND is_deduplicated = 0;`,
        [userId, startTime, endTime]
      );
      return row?.avg_val ? Math.round(Number(row.avg_val)) : 0;
    }

    // Default SUM (STEPS, DISTANCE, CALORIES)
    const row = await db.getFirstAsync<{ sum_val: number }>(
      `SELECT SUM(value) as sum_val FROM health_records
       WHERE user_id = ? AND record_type = ? AND start_time >= ? AND end_time <= ? AND is_deduplicated = 0;`,
      [userId, recordType, startTime, endTime]
    );

    return row?.sum_val ? Number(row.sum_val) : 0;
  }

  /**
   * Get the current user's Health Connect synchronization state.
   */
  static async getSyncState(userId: string): Promise<HealthSyncState | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqliteHealthSyncStateRow>(
      `SELECT * FROM health_sync_state WHERE user_id = ?;`,
      [userId]
    );

    if (!row) return null;
    return this.mapSyncStateRow(row);
  }

  /**
   * Upsert the user's Health Connect synchronization state.
   */
  static async updateSyncState(
    syncState: {
      userId: string;
      isConnected?: boolean;
      grantedPermissions?: HealthPermission[];
      lastSyncTime?: string | null;
      syncCursor?: string | null;
    }
  ): Promise<HealthSyncState> {
    const db = await getDatabase();
    const existing = await this.getSyncState(syncState.userId);
    const now = new Date().toISOString();

    if (existing) {
      const isConnected = syncState.isConnected ?? existing.isConnected;
      const grantedPermissions = syncState.grantedPermissions ?? existing.grantedPermissions;
      const lastSyncTime = syncState.lastSyncTime !== undefined ? syncState.lastSyncTime : existing.lastSyncTime;
      const syncCursor = syncState.syncCursor !== undefined ? syncState.syncCursor : existing.syncCursor;

      await db.runAsync(
        `UPDATE health_sync_state
         SET is_connected = ?,
             granted_permissions = ?,
             last_sync_time = ?,
             sync_cursor = ?,
             updated_at = ?
         WHERE user_id = ?;`,
        [
          isConnected ? 1 : 0,
          JSON.stringify(grantedPermissions),
          lastSyncTime,
          syncCursor,
          now,
          syncState.userId,
        ]
      );

      return {
        id: existing.id,
        userId: syncState.userId,
        isConnected,
        grantedPermissions,
        lastSyncTime,
        syncCursor,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
    }

    const id = `hss-${syncState.userId}`;
    const isConnected = syncState.isConnected ?? false;
    const grantedPermissions = syncState.grantedPermissions ?? [];
    const lastSyncTime = syncState.lastSyncTime ?? null;
    const syncCursor = syncState.syncCursor ?? null;

    await db.runAsync(
      `INSERT INTO health_sync_state (
        id, user_id, is_connected, granted_permissions, last_sync_time, sync_cursor, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        syncState.userId,
        isConnected ? 1 : 0,
        JSON.stringify(grantedPermissions),
        lastSyncTime,
        syncCursor,
        now,
        now,
      ]
    );

    return {
      id,
      userId: syncState.userId,
      isConnected,
      grantedPermissions,
      lastSyncTime,
      syncCursor,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Mark integration as disconnected and clear granted permissions.
   */
  static async disconnect(userId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE health_sync_state
       SET is_connected = 0,
           granted_permissions = '[]',
           updated_at = ?
       WHERE user_id = ?;`,
      [now, userId]
    );
  }

  private static mapRecordRow(row: SqliteHealthRecordRow): HealthRecord {
    let metadata = {};
    try {
      metadata = JSON.parse(row.metadata || '{}');
    } catch {
      // fallback
    }

    return {
      id: row.id,
      userId: row.user_id,
      recordType: row.record_type as HealthRecordType,
      sourceClient: row.source_client,
      externalId: row.external_id,
      startTime: row.start_time,
      endTime: row.end_time,
      value: Number(row.value),
      unit: row.unit as any,
      metadata,
      isDeduplicated: Boolean(row.is_deduplicated),
      syncedAt: row.synced_at,
      createdAt: row.created_at,
    };
  }

  private static mapSyncStateRow(row: SqliteHealthSyncStateRow): HealthSyncState {
    let grantedPermissions: HealthPermission[] = [];
    try {
      grantedPermissions = JSON.parse(row.granted_permissions || '[]');
    } catch {
      // fallback
    }

    return {
      id: row.id,
      userId: row.user_id,
      isConnected: Boolean(row.is_connected),
      grantedPermissions,
      lastSyncTime: row.last_sync_time,
      syncCursor: row.sync_cursor,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
