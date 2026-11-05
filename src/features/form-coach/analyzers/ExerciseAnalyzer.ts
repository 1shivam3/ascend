/**
 * ASCEND Form Coach — Extensible Exercise Analyzer Interface
 *
 * Defines the contract that all exercise analyzers must fulfill.
 * Future movement analyzers (Deadlift, Bench Press, OHP) can plug in seamlessly.
 */

import { NormalizedLandmark, PoseLandmarkIndex, DetectedSide } from '../models/pose.types';
import { FormCue, FormObservation, MovementPhase } from '../models/form-feedback.types';
import { FormRep, FormSessionSummary } from '../models/form-session.types';

export interface AnalyzerFrameResult {
  phase: MovementPhase;
  activeCue: FormCue | null;
  completedRep: FormRep | null;
  currentKneeAngleDeg: number | null;
  /** Running minimum knee angle of the current rep (null if not yet measurable). */
  minKneeAngleDeg: number | null;
  torsoInclinationDeg: number | null;
  detectedSide: DetectedSide;
  trackingConfidence: number;
  readiness: {
    isReady: boolean;
    reason?: string;
  };
}

/**
 * D6: what the tracked motion, taken as a whole, actually looks like.
 * 'not_squat' is a POSITIVE finding — the movement signature matches a
 * different pattern (for the squat analyzer: a hip hinge) — never a
 * guess from missing data. 'insufficient_evidence' means the analyzer
 * could not judge either way and callers must keep the default path.
 */
export type MovementSignature = 'squat' | 'not_squat' | 'insufficient_evidence';

export interface MovementAssessment {
  signature: MovementSignature;
  /** Frames (profile view) where both knee and hip angles were measurable. */
  assessedFrames: number;
  /** Frames matching the non-squat (hip-hinge) signature. */
  hingeFrames: number;
  /** Frames with genuine squat-depth knee flexion and no hinge dominance. */
  deepKneeFrames: number;
}

export interface ExerciseAnalyzer {
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly supportedCameraViews: ('side' | 'front')[];
  readonly requiredLandmarks: PoseLandmarkIndex[];

  initialize(config?: Record<string, unknown>): void;

  /**
   * Processes a single pose detection frame.
   */
  processFrame(
    landmarks: NormalizedLandmark[] | null,
    timestampMs: number,
    aspectRatio?: number
  ): AnalyzerFrameResult;

  /**
   * Resets all internal states for a fresh attempt.
   */
  reset(): void;

  /**
   * Compiles the complete post-set summary report.
   */
  finishSet(
    workoutId?: string,
    setIndex?: number,
    depthTargetDeg?: number
  ): FormSessionSummary;

  /**
   * Optional frame accounting: how many frames were offered to the
   * analyzer vs how many carried a detected pose. Lets the UI tell
   * "tracking never found a person" apart from "tracked fine, no valid
   * reps" (D4). Analyzers that do not implement it are treated as
   * having tracked normally.
   */
  getTrackingStats?: () => { framesProcessed: number; framesTracked: number };

  /**
   * Optional D6 movement-signature assessment: does the tracked motion
   * actually match the movement this analyzer grades? Lets the UI say
   * "this doesn't look like a squat" instead of grading a different
   * lift with this exercise's faults. Analyzers that do not implement
   * it are treated as matching.
   */
  getMovementAssessment?: () => MovementAssessment;

  /**
   * Releases resources if necessary.
   */
  cleanup(): void;
}
