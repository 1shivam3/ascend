import { describe, it, expect } from 'vitest';
import { HealthDeduplicationEngine } from '../HealthDeduplicationEngine';
import { HealthRecord } from '../../../types/health.types';

describe('Health Deduplication Engine Suite', () => {
  const userId = 'user-dedup-test';

  it('generates identical deterministic IDs for identical records', () => {
    const record: HealthRecord = {
      id: '',
      userId: '',
      recordType: 'STEPS',
      sourceClient: 'com.google.android.apps.fitness',
      externalId: 'ext-step-101',
      startTime: '2026-09-20T10:00:00.000Z',
      endTime: '2026-09-20T11:00:00.000Z',
      value: 1250,
      unit: 'count',
    };

    const id1 = HealthDeduplicationEngine.generateRecordId(userId, record);
    const id2 = HealthDeduplicationEngine.generateRecordId(userId, record);

    expect(id1).toBe(id2);
    expect(id1).toContain('steps');
    expect(id1).toContain('ext-step-101');
  });

  it('skips records that already exist in the database by external ID', () => {
    const existing: HealthRecord[] = [
      {
        id: 'hr-1',
        userId,
        recordType: 'STEPS',
        sourceClient: 'com.garmin.connect',
        externalId: 'garmin-step-999',
        startTime: '2026-09-20T08:00:00.000Z',
        endTime: '2026-09-20T09:00:00.000Z',
        value: 1100,
        unit: 'count',
        isDeduplicated: false,
      },
    ];

    const incoming: HealthRecord[] = [
      {
        id: 'hr-incoming-1',
        userId,
        recordType: 'STEPS',
        sourceClient: 'com.garmin.connect',
        externalId: 'garmin-step-999', // Duplicate external ID
        startTime: '2026-09-20T08:00:00.000Z',
        endTime: '2026-09-20T09:00:00.000Z',
        value: 1100,
        unit: 'count',
      },
      {
        id: 'hr-incoming-2',
        userId,
        recordType: 'STEPS',
        sourceClient: 'com.garmin.connect',
        externalId: 'garmin-step-1000', // Fresh external ID
        startTime: '2026-09-20T09:00:00.000Z',
        endTime: '2026-09-20T10:00:00.000Z',
        value: 1450,
        unit: 'count',
      },
    ];

    const result = HealthDeduplicationEngine.deduplicate(userId, incoming, existing);

    expect(result.totalReceived).toBe(2);
    expect(result.duplicatesSkipped).toBe(1);
    expect(result.uniqueIngested).toBe(1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].externalId).toBe('garmin-step-1000');
  });

  it('resolves multi-source overlapping steps by prioritizing dedicated wearables', () => {
    // Both phone and watch recorded steps during the same 10:00 - 11:00 AM window
    const incoming: HealthRecord[] = [
      {
        id: 'step-phone',
        userId,
        recordType: 'STEPS',
        sourceClient: 'com.google.android.apps.fitness', // Phone sensor (Priority 1)
        externalId: 'phone-step-1',
        startTime: '2026-09-20T10:00:00.000Z',
        endTime: '2026-09-20T11:00:00.000Z',
        value: 800,
        unit: 'count',
      },
      {
        id: 'step-watch',
        userId,
        recordType: 'STEPS',
        sourceClient: 'com.garmin.connect', // Dedicated sports wearable (Priority 3)
        externalId: 'garmin-step-1',
        startTime: '2026-09-20T10:00:00.000Z',
        endTime: '2026-09-20T11:00:00.000Z',
        value: 850,
        unit: 'count',
      },
    ];

    const result = HealthDeduplicationEngine.deduplicate(userId, incoming, []);

    expect(result.totalReceived).toBe(2);
    // The wearable record should be primary, and phone marked as superseded (isDeduplicated = true)
    const primary = result.records.find(r => !r.isDeduplicated);
    const superseded = result.records.find(r => r.isDeduplicated);

    expect(primary?.sourceClient).toBe('com.garmin.connect');
    expect(primary?.value).toBe(850);
    expect(superseded?.sourceClient).toBe('com.google.android.apps.fitness');
    expect(superseded?.isDeduplicated).toBe(true);
  });

  it('resolves overlapping exercise sessions by data richness and telemetry fidelity', () => {
    // Phone logged a basic running session, while Garmin logged the run with heart rate & distance
    const incoming: HealthRecord[] = [
      {
        id: 'sess-phone',
        userId,
        recordType: 'EXERCISE_SESSION',
        sourceClient: 'com.google.android.apps.fitness',
        externalId: 'fit-run-1',
        startTime: '2026-09-20T07:00:00.000Z',
        endTime: '2026-09-20T07:45:00.000Z',
        value: 45,
        unit: 'count',
        metadata: {
          exerciseType: 'RUNNING',
          durationMinutes: 45,
        },
      },
      {
        id: 'sess-watch',
        userId,
        recordType: 'EXERCISE_SESSION',
        sourceClient: 'com.garmin.connect',
        externalId: 'garmin-run-1',
        startTime: '2026-09-20T07:00:00.000Z',
        endTime: '2026-09-20T07:45:00.000Z',
        value: 45,
        unit: 'count',
        metadata: {
          exerciseType: 'RUNNING',
          durationMinutes: 45,
          distanceMeters: 6500,
          avgHeartRate: 155,
          activeCaloriesBurned: 480,
        },
      },
    ];

    const result = HealthDeduplicationEngine.deduplicate(userId, incoming, []);

    const primary = result.records.find(r => !r.isDeduplicated);
    const superseded = result.records.find(r => r.isDeduplicated);

    expect(primary?.sourceClient).toBe('com.garmin.connect');
    expect(superseded?.sourceClient).toBe('com.google.android.apps.fitness');
    expect(superseded?.isDeduplicated).toBe(true);
  });
});
