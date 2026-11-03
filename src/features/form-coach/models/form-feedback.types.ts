/**
 * ASCEND Form Coach — Movement Phases & Feedback Models
 */

export type MovementPhase =
  | 'standing'
  | 'descending'
  | 'bottom'
  | 'ascending'
  | 'lockout'
  | 'rep_completed'
  | 'tracking_lost';

export type CuePriority = 'critical' | 'high' | 'medium' | 'low';

export interface FormCue {
  id: string;
  exerciseId: string;
  title: string;
  message: string;
  priority: CuePriority;
  confidence: number;
  triggeredAt: number;
  measurement?: number;
  measurementUnit?: string;
  evidence?: string;
  limitation?: string;
}

export type ObservationSeverity = 'info' | 'warning' | 'alert';

export interface FormObservation {
  id: string;
  ruleId: string;
  title: string;
  message: string;
  severity: ObservationSeverity;
  count: number;
  evidence?: string;
  repsTriggered: number[];
  limitation?: string;
}
