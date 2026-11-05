/**
 * ASCEND Form Coach — Session & Repetition Data Models
 */

import { FormObservation, MovementPhase } from './form-feedback.types';
import { DetectedSide } from './pose.types';

export type SquatDepthClassification = 'above_parallel' | 'parallel' | 'below_parallel' | 'unknown';

export interface FormRep {
  repNumber: number;
  startTime: number; // epoch ms
  endTime: number; // epoch ms
  durationSeconds: number;
  descentDurationSeconds: number;
  ascentDurationSeconds: number;
  bottomHoldDurationSeconds?: number;
  minKneeAngleDeg: number;
  estimatedDepth: SquatDepthClassification;
  maxTorsoInclinationDeg: number;
  trackingConfidence: number;
  observations: string[];
  isValid: boolean;
  invalidReason?: string;
  /**
   * Deadlift measurements (stamped by the deadlift analyzer only; squat
   * reps leave these undefined). minHipAngleDeg is the deepest hip fold
   * of the rep; lockoutAchieved says whether the rep finished with hips
   * and knees fully extended; hipsRoseFirst flags the measured pattern
   * of the hips rising ahead of the shoulders during the pull.
   */
  minHipAngleDeg?: number;
  lockoutAchieved?: boolean;
  hipsRoseFirst?: boolean;
}

export interface FormSessionSummary {
  id: string;
  workoutId?: string;
  setIndex?: number;
  exerciseId: string;
  exerciseName: string;
  analyzerVersion: string;
  cameraView: DetectedSide;
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  durationSeconds: number;
  totalDetectedReps: number;
  totalValidReps: number;
  analysedRepCount: number;
  averageTrackingConfidence: number;
  averageRepDurationSeconds: number;
  reps: FormRep[];
  observations: FormObservation[];
  depthTargetDeg?: number;
  savedToWorkout: boolean;
  userCorrectedReps?: number;
}

export interface FormCoachConfig {
  depthTargetDeg: number; // e.g. 90 deg for parallel squat
  minTrackingConfidence: number; // e.g. 0.5
  preferredCamera: 'environment' | 'user';
  audioFeedbackEnabled: boolean;
  smoothingEnabled: boolean;
}

export const DEFAULT_FORM_COACH_CONFIG: FormCoachConfig = {
  depthTargetDeg: 90,
  minTrackingConfidence: 0.5,
  preferredCamera: 'environment',
  audioFeedbackEnabled: true,
  smoothingEnabled: true,
};
