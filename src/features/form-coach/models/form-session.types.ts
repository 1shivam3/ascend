/**
 * ASCEND Form Coach — Session & Repetition Data Models
 */

import { FormObservation, MovementPhase } from './form-feedback.types';
import { DetectedSide } from './pose.types';

export type SquatDepthClassification = 'above_parallel' | 'parallel' | 'below_parallel' | 'unknown';

/**
 * Per-rep verdict (audit P0-3, 2026-11-06). A rep is 'valid' when it
 * met the exercise's criteria on measured evidence, 'failed' when the
 * criteria were measurable and not met, and 'unverified' when a
 * criterion could not be judged at all because the landmarks it needs
 * were below the visibility threshold for that rep — absence of
 * evidence is never reported as a failure. Only the deadlift analyzer
 * currently produces 'unverified' reps: its machine runs on the hip
 * angle, but lockout also requires the knee angle, which needs a
 * visible ankle; when the ankle/foot is out of frame for most of an
 * attempt, a no-lockout record proves nothing. The squat and cycle
 * machines emit a rep record only when the very signal that judges
 * the rep was measurable throughout, so their reps are never
 * 'unverified'.
 */
export type FormRepStatus = 'valid' | 'failed' | 'unverified';

/** Status of a rep, tolerating legacy records saved before the
 * status field existed (they fall back to the isValid verdict). */
export function getRepStatus(rep: FormRep): FormRepStatus {
  return rep.status ?? (rep.isValid ? 'valid' : 'failed');
}

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
  /** P0-3 verdict: see FormRepStatus. Stamped by every state machine
   * ('valid'/'failed' from the measured criteria); the deadlift
   * analyzer may upgrade a 'failed' to 'unverified' when the lockout
   * landmarks were not visible enough to judge. */
  status?: FormRepStatus;
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
  /** Reps whose deciding criterion could not be judged (landmarks
   * below the visibility threshold) — neither valid nor failed.
   * Stamped by every analyzer (0 when none); optional only so
   * summaries saved by older builds still load. */
  totalUnverifiedReps?: number;
  analysedRepCount: number;
  averageTrackingConfidence: number;
  /**
   * Average set time per valid rep: durationSeconds / totalValidReps
   * (0 when no rep was valid). NOT a mean of per-rep machine windows —
   * that excluded setup/rest and incomplete attempts and could report
   * e.g. 0.7s for a 27s set (phone-polish fix, 2026-11-06).
   */
  averageRepDurationSeconds: number;
  /**
   * Tempo (audit P0-3, 2026-11-06): the report's ONE per-rep time
   * figure — the mean of the per-rep durations (descent start →
   * ascent end, from the reps' own timestamps) over all detected
   * reps, or null when that figure fails the sanity check in
   * services/analysis/tempo.ts (the UI then shows "Tempo
   * unavailable"). This supersedes displaying
   * averageRepDurationSeconds in the report: that field remains the
   * set-time-per-valid-rep aggregate the coach context and weekly
   * review weight by (its tempo × valid = set duration identity is
   * what their math needs), but it is not a movement tempo and is no
   * longer shown as one.
   */
  tempoSeconds?: number | null;
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
