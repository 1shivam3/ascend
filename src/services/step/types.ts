export type StepSensorStatus =
  | 'INITIALIZING'
  | 'READY'
  | 'UNAVAILABLE'
  | 'PERMISSION_DENIED';

export interface StepTrackerState {
  todaySteps: number;
  stepGoal: number;
  lastSensorValue: number;
  baseline: number;
  lastUpdatedAt: string;
  status: StepSensorStatus;
  date: string; // YYYY-MM-DD
}

export interface StepDailySummary {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  todaySteps: number;
  stepGoal: number;
  lastSensorValue: number;
  baseline: number;
  lastUpdatedAt: string;
  syncedAt?: string | null;
  createdAt: string;
}

export interface StepSensorEvent {
  rawSensorValue: number;
  timestamp: number;
}
