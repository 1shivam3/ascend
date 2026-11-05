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
  /**
   * Batch-analyzer measurements (stamped only by the analyzers named;
   * squat/deadlift reps leave these undefined).
   * minElbowAngleDeg: deepest elbow flexion of the rep (overhead press,
   * bent-over row, bicep curl, push-up, bench press).
   * peakWristHeightRatio: highest the wrist reached during the rep, in
   * torso lengths relative to shoulder height — 0 = wrist at shoulder
   * height, negative = below it (lateral raise).
   * swayDetected: the hips/shoulders swayed measurably during the rep
   * (bicep curl, lateral raise swing check).
   * bodyLineDeviationDeg: worst shoulder–hip–ankle deviation from a
   * straight line during the rep (push-up sag/pike check).
   * wristDriftRatio: horizontal wrist travel during the rep, in torso
   * lengths — a side-view image-space proxy only (bench press).
   */
  minElbowAngleDeg?: number;
  peakWristHeightRatio?: number;
  swayDetected?: boolean;
  bodyLineDeviationDeg?: number;
  wristDriftRatio?: number;
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
  /**
   * Plank measurements (stamped by the plank analyzer only — a hold
   * has no reps, so the session's numbers live here instead).
   * holdDurationSeconds: how long the tracked horizontal hold lasted.
   * alignedHoldPercent: share of the hold with the shoulder–hip–ankle
   * line inside the alignment tolerance.
   */
  holdDurationSeconds?: number;
  alignedHoldPercent?: number;
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
