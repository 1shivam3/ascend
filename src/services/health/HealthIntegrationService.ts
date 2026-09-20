import {
  HealthPermission,
  HealthRecordType,
  HealthConnectSdkStatus,
  HealthDailySummary,
} from '../../types/health.types';
import {
  getHealthConnectAdapter,
  HealthConnectClientInterface,
} from './HealthConnectAdapter';
import { HealthRepository } from '../../database/repositories/HealthRepository';
import { HealthDeduplicationEngine } from './HealthDeduplicationEngine';
import { HealthQuestBridge } from './HealthQuestBridge';

export class HealthIntegrationService {
  private static adapterOverride: HealthConnectClientInterface | null = null;

  static setAdapter(adapter: HealthConnectClientInterface | null) {
    this.adapterOverride = adapter;
  }

  private static getAdapter(): HealthConnectClientInterface {
    return this.adapterOverride || getHealthConnectAdapter();
  }

  /**
   * Check Android Health Connect SDK availability.
   */
  static async checkSdkStatus(): Promise<HealthConnectSdkStatus> {
    const adapter = this.getAdapter();
    return adapter.checkSdkStatus();
  }

  /**
   * Query granted Health Connect permissions.
   */
  static async getGrantedPermissions(): Promise<HealthPermission[]> {
    const adapter = this.getAdapter();
    return adapter.getGrantedPermissions();
  }

  /**
   * Connect to Health Connect and request granular user permissions.
   * Only requests permissions for user-selected features.
   */
  static async connect(
    userId: string,
    requestedPermissions: HealthPermission[]
  ): Promise<HealthPermission[]> {
    const adapter = this.getAdapter();
    const granted = await adapter.requestPermissions(requestedPermissions);

    const isConnected = granted.length > 0;
    await HealthRepository.updateSyncState({
      userId,
      isConnected,
      grantedPermissions: granted,
    });

    return granted;
  }

  /**
   * Disconnect integration and revoke local state.
   */
  static async disconnect(userId: string): Promise<void> {
    const adapter = this.getAdapter();
    try {
      await adapter.revokeAllPermissions();
    } catch {
      // ignore
    }
    await HealthRepository.disconnect(userId);
  }

  /**
   * Synchronize health records from Health Connect into ASCEND.
   * Flow:
   * 1. Query external records for granted permissions.
   * 2. Run deterministic deduplication against existing SQLite records.
   * 3. Persist deduplicated records in local SQLite.
   * 4. Bridge qualifying steps & cardio to challenges (Zero gym XP awarded).
   * 5. Strictly enforce zero health data leakage into social feeds.
   */
  static async sync(userId: string): Promise<{
    ingested: number;
    deduplicated: number;
    superseded: number;
    challengeUpdates: number;
  }> {
    const syncState = await HealthRepository.getSyncState(userId);
    if (!syncState || !syncState.isConnected) {
      return { ingested: 0, deduplicated: 0, superseded: 0, challengeUpdates: 0 };
    }

    const adapter = this.getAdapter();
    const granted = syncState.grantedPermissions;

    const now = new Date();
    // Default window: last 7 days or lastSyncTime
    const startTime = syncState.lastSyncTime
      ? new Date(new Date(syncState.lastSyncTime).getTime() - 86400000).toISOString() // 24h buffer
      : new Date(now.getTime() - 86400000 * 7).toISOString();
    const endTime = now.toISOString();

    const rawRecordsToIngest = [];

    // Map permissions to record types
    if (granted.includes('READ_STEPS')) {
      const steps = await adapter.readRecords('STEPS', { startTime, endTime });
      rawRecordsToIngest.push(...steps);
    }
    if (granted.includes('READ_EXERCISE')) {
      const exercises = await adapter.readRecords('EXERCISE_SESSION', { startTime, endTime });
      rawRecordsToIngest.push(...exercises);
    }
    if (granted.includes('READ_DISTANCE')) {
      const distances = await adapter.readRecords('DISTANCE', { startTime, endTime });
      rawRecordsToIngest.push(...distances);
    }
    if (granted.includes('READ_CALORIES')) {
      const calories = await adapter.readRecords('CALORIES', { startTime, endTime });
      rawRecordsToIngest.push(...calories);
    }
    if (granted.includes('READ_WEIGHT')) {
      const weights = await adapter.readRecords('WEIGHT', { startTime, endTime });
      rawRecordsToIngest.push(...weights);
    }
    if (granted.includes('READ_HEART_RATE')) {
      const hr = await adapter.readRecords('HEART_RATE', { startTime, endTime });
      rawRecordsToIngest.push(...hr);
    }

    // Populate userId on incoming records
    for (const r of rawRecordsToIngest) {
      r.userId = userId;
    }

    // Load existing records for the time window
    const existingRecords = [];
    const recordTypesToCheck: HealthRecordType[] = [
      'STEPS',
      'EXERCISE_SESSION',
      'DISTANCE',
      'CALORIES',
      'WEIGHT',
      'HEART_RATE',
    ];

    for (const t of recordTypesToCheck) {
      const existing = await HealthRepository.getRecords(userId, t, startTime, endTime);
      existingRecords.push(...existing);
    }

    // Run deterministic deduplication
    const dedupResult = HealthDeduplicationEngine.deduplicate(
      userId,
      rawRecordsToIngest,
      existingRecords
    );

    // Save records to SQLite
    await HealthRepository.saveRecords(dedupResult.records);

    // Bridge qualifying records to challenges & quests
    const bridgeResult = await HealthQuestBridge.evaluateHealthRecords(
      userId,
      dedupResult.records
    );

    // Update last sync time
    await HealthRepository.updateSyncState({
      userId,
      lastSyncTime: endTime,
    });

    return {
      ingested: dedupResult.uniqueIngested,
      deduplicated: dedupResult.duplicatesSkipped,
      superseded: dedupResult.supersededRecords,
      challengeUpdates: bridgeResult.challengeUpdatesCount,
    };
  }

  /**
   * Get aggregated daily activity summary for a user.
   */
  static async getDailySummary(userId: string, dateStr?: string): Promise<HealthDailySummary> {
    const targetDate = dateStr || new Date().toISOString().substring(0, 10);
    const startTime = `${targetDate}T00:00:00.000Z`;
    const endTime = `${targetDate}T23:59:59.999Z`;

    const [steps, distanceMeters, activeCalories, weightKg, heartRateAvg] = await Promise.all([
      HealthRepository.getAggregatedMetric(userId, 'STEPS', startTime, endTime),
      HealthRepository.getAggregatedMetric(userId, 'DISTANCE', startTime, endTime),
      HealthRepository.getAggregatedMetric(userId, 'CALORIES', startTime, endTime),
      HealthRepository.getAggregatedMetric(userId, 'WEIGHT', startTime, endTime),
      HealthRepository.getAggregatedMetric(userId, 'HEART_RATE', startTime, endTime),
    ]);

    const sessions = await HealthRepository.getRecords(
      userId,
      'EXERCISE_SESSION',
      startTime,
      endTime
    );

    let exerciseDurationMinutes = 0;
    let qualifyingCardioSessions = 0;
    for (const s of sessions) {
      exerciseDurationMinutes += Number(s.metadata?.durationMinutes || 0);
      const exType = (s.metadata?.exerciseType || '').toUpperCase();
      if (['RUNNING', 'CYCLING', 'ROWING', 'SWIMMING', 'WALKING'].includes(exType)) {
        qualifyingCardioSessions++;
      }
    }

    return {
      date: targetDate,
      steps,
      distanceMeters,
      activeCalories,
      weightKg: weightKg > 0 ? weightKg : null,
      exerciseDurationMinutes,
      qualifyingCardioSessions,
      heartRateAvg: heartRateAvg > 0 ? heartRateAvg : null,
    };
  }
}
