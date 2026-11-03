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
   * Releases resources if necessary.
   */
  cleanup(): void;
}
