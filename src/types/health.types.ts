export type HealthPermission =
  | 'READ_STEPS'
  | 'READ_EXERCISE'
  | 'READ_DISTANCE'
  | 'READ_CALORIES'
  | 'READ_WEIGHT'
  | 'READ_HEART_RATE';

export type HealthRecordType =
  | 'STEPS'
  | 'EXERCISE_SESSION'
  | 'DISTANCE'
  | 'CALORIES'
  | 'WEIGHT'
  | 'HEART_RATE';

export type HealthConnectSdkStatus =
  | 'AVAILABLE'
  | 'PROVIDER_UPDATE_REQUIRED'
  | 'UNAVAILABLE';

export interface HealthRecord {
  id: string;
  userId: string;
  recordType: HealthRecordType;
  sourceClient: string;
  externalId: string | null;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  value: number;     // e.g. count, meters, kcal, kg, bpm
  unit: 'count' | 'meters' | 'kcal' | 'kg' | 'bpm';
  metadata?: Record<string, any>;
  isDeduplicated?: boolean;
  syncedAt?: string;
  createdAt?: string;
}

export interface HealthSyncState {
  id: string;
  userId: string;
  isConnected: boolean;
  grantedPermissions: HealthPermission[];
  lastSyncTime: string | null;
  syncCursor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseSessionPayload {
  externalId: string;
  title: string;
  exerciseType: string; // 'RUNNING' | 'CYCLING' | 'ROWING' | 'SWIMMING' | 'WALKING' | 'CALISTHENICS' | 'OTHER'
  startTime: string;
  endTime: string;
  durationMinutes: number;
  distanceMeters?: number;
  activeCaloriesBurned?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  sourcePackage: string;
}

export interface HealthDeduplicationResult {
  totalReceived: number;
  uniqueIngested: number;
  duplicatesSkipped: number;
  supersededRecords: number;
  records: HealthRecord[];
}

export interface HealthDailySummary {
  date: string; // YYYY-MM-DD
  steps: number;
  distanceMeters: number;
  activeCalories: number;
  weightKg: number | null;
  exerciseDurationMinutes: number;
  qualifyingCardioSessions: number;
  heartRateAvg: number | null;
}

export interface HealthQueryOptions {
  startTime: string;
  endTime: string;
  limit?: number;
}
