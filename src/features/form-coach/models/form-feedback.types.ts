/**
 * ASCEND Form Coach — Movement Phases & Feedback Models
 */

export type MovementPhase =
  | 'standing'
  | 'descending'
  | 'bottom'
  | 'ascending'
  /** The deadlift's top position: entered when a pull reaches
   * full hip+knee extension (the rep is emitted on entry) and
   * held until the next hinge begins. §31: this member used to
   * be dead — no machine ever assigned it. 'rep_completed' was
   * deleted in the same pass: grep proved zero assignments
   * anywhere (its only traces were an unreachable squat switch
   * arm and a UI label for a phase that could never occur). */
  | 'lockout'
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
