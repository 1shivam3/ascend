import {
  HealthRecord,
  HealthDeduplicationResult,
  HealthRecordType,
} from '../../types/health.types';

export class HealthDeduplicationEngine {
  /**
   * Deterministically deduplicates an incoming batch of health records
   * against both existing records and internal batch overlaps.
   */
  static deduplicate(
    userId: string,
    incoming: HealthRecord[],
    existing: HealthRecord[]
  ): HealthDeduplicationResult {
    let uniqueIngested = 0;
    let duplicatesSkipped = 0;
    let supersededRecords = 0;

    const existingExternalIds = new Set(
      existing.filter(e => e.externalId).map(e => e.externalId as string)
    );

    const existingIdMap = new Map(existing.map(e => [e.id, e]));
    const deduplicatedRecords: HealthRecord[] = [];

    // Group incoming records by record type
    const byType = new Map<HealthRecordType, HealthRecord[]>();
    for (const record of incoming) {
      if (!byType.has(record.recordType)) {
        byType.set(record.recordType, []);
      }
      byType.get(record.recordType)!.push(record);
    }

    for (const [recordType, records] of byType.entries()) {
      // Sort chronologically by startTime, then higher source priority, then value
      records.sort((a, b) => {
        const timeDiff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        if (timeDiff !== 0) return timeDiff;
        const pDiff = this.getSourcePriority(b.sourceClient) - this.getSourcePriority(a.sourceClient);
        if (pDiff !== 0) return pDiff;
        return (b.value || 0) - (a.value || 0);
      });

      const processedTypeRecords: HealthRecord[] = [];

      for (const record of records) {
        // 1. External ID dedup check
        if (record.externalId && existingExternalIds.has(record.externalId)) {
          duplicatesSkipped++;
          continue;
        }

        // Generate deterministic primary key
        const deterministicId = this.generateRecordId(userId, record);
        record.id = deterministicId;
        record.userId = userId;

        // Check if exact deterministic ID exists in database
        if (existingIdMap.has(deterministicId)) {
          duplicatesSkipped++;
          continue;
        }

        // 2. Overlap Resolution for Exercise Sessions
        if (recordType === 'EXERCISE_SESSION') {
          const overlap = this.findOverlappingSession(record, [
            ...existing.filter(e => e.recordType === 'EXERCISE_SESSION'),
            ...processedTypeRecords,
          ]);

          if (overlap) {
            // Compare source priority and data richness
            const recordScore = this.scoreSessionFidelity(record);
            const overlapScore = this.scoreSessionFidelity(overlap);

            if (recordScore <= overlapScore) {
              // Mark incoming record as superseded
              record.isDeduplicated = true;
              supersededRecords++;
            } else {
              // Current record is superior; mark incoming as primary
              record.isDeduplicated = false;
              uniqueIngested++;
              if (!overlap.isDeduplicated) {
                overlap.isDeduplicated = true;
                supersededRecords++;
                uniqueIngested = Math.max(0, uniqueIngested - 1);
              }
            }
          } else {
            record.isDeduplicated = false;
            uniqueIngested++;
          }
        }
        // 3. Overlap Resolution for Cumulative Metrics (Steps, Distance, Calories)
        else if (
          recordType === 'STEPS' ||
          recordType === 'DISTANCE' ||
          recordType === 'CALORIES'
        ) {
          const overlap = this.findOverlappingCumulative(record, [
            ...existing.filter(e => e.recordType === recordType && !e.isDeduplicated),
            ...processedTypeRecords.filter(p => !p.isDeduplicated),
          ]);

          if (overlap) {
            // Overlapping time bucket from different sources
            // e.g. Phone vs Watch for the same hour window
            if (record.sourceClient !== overlap.sourceClient) {
              // Retain higher fidelity wearable, or max value if same tier
              const recordPriority = this.getSourcePriority(record.sourceClient);
              const overlapPriority = this.getSourcePriority(overlap.sourceClient);

              if (recordPriority < overlapPriority || (recordPriority === overlapPriority && record.value <= overlap.value)) {
                record.isDeduplicated = true;
                supersededRecords++;
              } else {
                record.isDeduplicated = false;
                uniqueIngested++;
                if (!overlap.isDeduplicated) {
                  overlap.isDeduplicated = true;
                  supersededRecords++;
                  uniqueIngested = Math.max(0, uniqueIngested - 1);
                }
              }
            } else {
              // Same source duplicate interval
              duplicatesSkipped++;
              continue;
            }
          } else {
            record.isDeduplicated = false;
            uniqueIngested++;
          }
        }
        // Discrete points (WEIGHT, HEART_RATE)
        else {
          record.isDeduplicated = false;
          uniqueIngested++;
        }

        if (record.externalId) {
          existingExternalIds.add(record.externalId);
        }
        processedTypeRecords.push(record);
        deduplicatedRecords.push(record);
      }
    }

    return {
      totalReceived: incoming.length,
      uniqueIngested,
      duplicatesSkipped,
      supersededRecords,
      records: deduplicatedRecords,
    };
  }

  /**
   * Generates a deterministic record ID based on composite identity.
   */
  static generateRecordId(userId: string, record: HealthRecord): string {
    const cleanClient = (record.sourceClient || 'generic').replace(/[^a-zA-Z0-9]/g, '_');
    const startMs = new Date(record.startTime).getTime();
    const endMs = new Date(record.endTime).getTime();
    const extKey = record.externalId ? `-${record.externalId}` : '';
    return `hr-${userId}-${record.recordType.toLowerCase()}-${cleanClient}-${startMs}-${endMs}${extKey}`;
  }

  /**
   * Detects if an exercise session overlaps >= 50% with an existing session.
   */
  private static findOverlappingSession(
    target: HealthRecord,
    candidates: HealthRecord[]
  ): HealthRecord | null {
    const tStart = new Date(target.startTime).getTime();
    const tEnd = new Date(target.endTime).getTime();
    const tDuration = tEnd - tStart;
    if (tDuration <= 0) return null;

    for (const c of candidates) {
      const cStart = new Date(c.startTime).getTime();
      const cEnd = new Date(c.endTime).getTime();

      const overlapStart = Math.max(tStart, cStart);
      const overlapEnd = Math.min(tEnd, cEnd);
      const overlapDuration = overlapEnd - overlapStart;

      if (overlapDuration > 0) {
        const overlapRatio = overlapDuration / Math.min(tDuration, cEnd - cStart);
        if (overlapRatio >= 0.5) {
          return c;
        }
      }
    }

    return null;
  }

  /**
   * Detects if cumulative steps/distance overlaps heavily (> 75%) with another record.
   */
  private static findOverlappingCumulative(
    target: HealthRecord,
    candidates: HealthRecord[]
  ): HealthRecord | null {
    const tStart = new Date(target.startTime).getTime();
    const tEnd = new Date(target.endTime).getTime();
    const tDuration = tEnd - tStart;
    if (tDuration <= 0) return null;

    for (const c of candidates) {
      const cStart = new Date(c.startTime).getTime();
      const cEnd = new Date(c.endTime).getTime();

      const overlapStart = Math.max(tStart, cStart);
      const overlapEnd = Math.min(tEnd, cEnd);
      const overlapDuration = overlapEnd - overlapStart;

      if (overlapDuration > 0) {
        const overlapRatio = overlapDuration / Math.min(tDuration, cEnd - cStart);
        if (overlapRatio >= 0.75) {
          return c;
        }
      }
    }

    return null;
  }

  /**
   * Score session fidelity: Dedicated wearable > phone sensors; higher metrics > sparse metrics.
   */
  private static scoreSessionFidelity(session: HealthRecord): number {
    let score = this.getSourcePriority(session.sourceClient) * 10;
    if (session.metadata?.distanceMeters) score += 5;
    if (session.metadata?.avgHeartRate) score += 10;
    if (session.metadata?.activeCaloriesBurned) score += 5;
    return score;
  }

  /**
   * Source priority: Wearable OEM apps > generic fitness aggregators > phone sensors.
   */
  private static getSourcePriority(sourcePackage: string): number {
    const pkg = (sourcePackage || '').toLowerCase();
    if (pkg.includes('garmin') || pkg.includes('polar') || pkg.includes('whoop') || pkg.includes('coros')) {
      return 3; // Dedicated sports wearable
    }
    if (pkg.includes('samsung.health') || pkg.includes('pixel') || pkg.includes('watch') || pkg.includes('fitbit')) {
      return 2; // Smartwatch OEM
    }
    if (pkg.includes('google.android.apps.fitness') || pkg.includes('healthconnect')) {
      return 1; // General platform/phone sensor
    }
    return 1;
  }
}
