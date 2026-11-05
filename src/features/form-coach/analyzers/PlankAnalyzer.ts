/**
 * ASCEND Form Coach — Plank Analyzer (Batch B)
 *
 * A plank is a hold, not a rep cycle, so this analyzer does not use
 * the cycle machine: it measures how long the tracked body stayed
 * near-horizontal and how much of that time the shoulder–hip–ankle
 * line stayed inside the alignment tolerance. The session summary
 * carries the hold numbers on dedicated fields (holdDurationSeconds,
 * alignedHoldPercent) and zero reps — a hold has no reps to count,
 * and the report says what it measured instead of inventing any.
 */

import { ExerciseAnalyzer, AnalyzerFrameResult } from './ExerciseAnalyzer';
import { NormalizedLandmark, PoseLandmarkIndex, DetectedSide } from '../models/pose.types';
import { FormObservation } from '../models/form-feedback.types';
import { FormSessionSummary } from '../models/form-session.types';
import {
  calculateJointAngle,
  calculateSegmentInclination,
  isLandmarkReliable,
} from '../services/analysis/LandmarkGeometry';
import { FormFeedbackEngine, FeedbackRule } from '../services/analysis/FormFeedbackEngine';
import { determineFormSide, majorityFormView } from './CycleAnalyzerBase';
import { safeRandomId } from '@/lib/formatters';

export const PLANK_ANALYZER_VERSION = '1.0.0';

/** Torso inclination at/above which the body counts as horizontal. */
const HORIZONTAL_TORSO_MIN_DEG = 65;
/** Shoulder–hip–ankle deviation from straight that counts as aligned. */
const ALIGNMENT_TOLERANCE_DEG = 15;
/** Deviation at/above which the line counts as broken for the cue. */
const LINE_BROKEN_MIN_DEG = 25;
/** A hold shorter than this is a position check, not a plank set. */
const MIN_HOLD_SECONDS = 3;

export class PlankAnalyzer implements ExerciseAnalyzer {
  readonly exerciseId = 'plank';
  readonly exerciseName = 'Plank';
  readonly supportedCameraViews: ('side' | 'front')[] = ['side'];
  readonly requiredLandmarks: PoseLandmarkIndex[] = [
    PoseLandmarkIndex.LEFT_SHOULDER,
    PoseLandmarkIndex.RIGHT_SHOULDER,
    PoseLandmarkIndex.LEFT_HIP,
    PoseLandmarkIndex.RIGHT_HIP,
    PoseLandmarkIndex.LEFT_ANKLE,
    PoseLandmarkIndex.RIGHT_ANKLE,
    PoseLandmarkIndex.LEFT_ELBOW,
    PoseLandmarkIndex.RIGHT_ELBOW,
  ];

  private feedbackEngine: FormFeedbackEngine;
  private sessionStartTimeMs = 0;
  private detectedSide: DetectedSide = 'unknown';
  private trackingConfidences: number[] = [];
  private framesProcessed = 0;
  private framesTracked = 0;
  private firstHoldTs: number | null = null;
  private lastHoldTs: number | null = null;
  private holdFrames = 0;
  private alignedFrames = 0;
  private worstDeviationDeg = 0;
  private viewVotes: DetectedSide[] = [];

  constructor() {
    this.feedbackEngine = new FormFeedbackEngine(this.buildRules());
  }

  private buildRules(): FeedbackRule[] {
    return [
      {
        id: 'rule-plank-line-broken',
        exerciseId: 'plank',
        title: 'Body Line Observation',
        message:
          'Your shoulder–hip–ankle line is bending — hips sagging or piked. Reset into one straight line from head to heels.',
        priority: 'medium',
        cooldownMs: 5000,
        limitation: 'Side-view 2D estimate of the body line only; landmarks cannot separate sagging from piking in every setup.',
        evaluate: (ctx) =>
          ctx.bodyLineDeviationDeg !== null &&
          ctx.bodyLineDeviationDeg !== undefined &&
          ctx.bodyLineDeviationDeg >= LINE_BROKEN_MIN_DEG,
        formatEvidence: (ctx) =>
          `Body line deviated ~${Math.round(ctx.bodyLineDeviationDeg ?? 0)}° from straight.`,
      },
    ];
  }

  initialize(_config?: Record<string, unknown>): void {
    this.reset();
  }

  reset(): void {
    this.feedbackEngine.reset();
    this.sessionStartTimeMs = Date.now();
    this.detectedSide = 'unknown';
    this.trackingConfidences = [];
    this.framesProcessed = 0;
    this.framesTracked = 0;
    this.firstHoldTs = null;
    this.lastHoldTs = null;
    this.holdFrames = 0;
    this.alignedFrames = 0;
    this.worstDeviationDeg = 0;
    this.viewVotes = [];
  }

  getTrackingStats(): { framesProcessed: number; framesTracked: number } {
    return { framesProcessed: this.framesProcessed, framesTracked: this.framesTracked };
  }

  processFrame(
    landmarks: NormalizedLandmark[] | null,
    timestampMs: number,
    aspectRatio = 1.0
  ): AnalyzerFrameResult {
    this.framesProcessed += 1;
    if (!landmarks || landmarks.length < 33) {
      return {
        phase: 'tracking_lost',
        activeCue: null,
        completedRep: null,
        currentKneeAngleDeg: null,
        minKneeAngleDeg: null,
        currentHipAngleDeg: null,
        minHipAngleDeg: null,
        torsoInclinationDeg: null,
        detectedSide: 'unknown',
        trackingConfidence: 0,
        readiness: { isReady: false, reason: 'No person detected in frame.' },
      };
    }

    const side = determineFormSide(landmarks);
    this.detectedSide = side;
    this.framesTracked += 1;
    this.viewVotes.push(side);

    const preferLeft = side === 'left' || side === 'unknown' || side === 'front';
    const shoulder = landmarks[preferLeft ? PoseLandmarkIndex.LEFT_SHOULDER : PoseLandmarkIndex.RIGHT_SHOULDER];
    const hip = landmarks[preferLeft ? PoseLandmarkIndex.LEFT_HIP : PoseLandmarkIndex.RIGHT_HIP];
    const ankle = landmarks[preferLeft ? PoseLandmarkIndex.LEFT_ANKLE : PoseLandmarkIndex.RIGHT_ANKLE];

    const keyVisible = this.requiredLandmarks.filter((i) => isLandmarkReliable(landmarks[i])).length;
    const trackingConfidence = keyVisible / this.requiredLandmarks.length;
    this.trackingConfidences.push(trackingConfidence);

    const torsoInclinationDeg = calculateSegmentInclination(shoulder, hip, aspectRatio);
    const bodyLineAngleDeg = calculateJointAngle(shoulder, hip, ankle, aspectRatio);
    const deviationDeg = bodyLineAngleDeg !== null ? Math.abs(180 - bodyLineAngleDeg) : null;

    const isHorizontal = torsoInclinationDeg !== null && torsoInclinationDeg >= HORIZONTAL_TORSO_MIN_DEG;
    if (isHorizontal && deviationDeg !== null) {
      if (this.firstHoldTs === null) this.firstHoldTs = timestampMs;
      this.lastHoldTs = timestampMs;
      this.holdFrames += 1;
      if (deviationDeg <= ALIGNMENT_TOLERANCE_DEG) this.alignedFrames += 1;
      if (deviationDeg > this.worstDeviationDeg) this.worstDeviationDeg = deviationDeg;
    }

    let isReady = true;
    let readinessReason: string | undefined;
    if (side === 'front') {
      isReady = false;
      readinessReason = 'Position camera at a 90° side profile.';
    } else if (!isHorizontal) {
      isReady = false;
      readinessReason = 'Get into the plank position: body in one horizontal line.';
    } else if (trackingConfidence < 0.6) {
      isReady = false;
      readinessReason = 'Improve lighting or adjust distance to improve tracking.';
    }

    const activeCue = this.feedbackEngine.evaluate({
      exerciseId: this.exerciseId,
      phase: isHorizontal ? 'bottom' : 'standing',
      currentKneeAngleDeg: null,
      minKneeAngleDeg: null,
      torsoInclinationDeg,
      trackingConfidence,
      feetVisible: isLandmarkReliable(landmarks[preferLeft ? PoseLandmarkIndex.LEFT_FOOT_INDEX : PoseLandmarkIndex.RIGHT_FOOT_INDEX]),
      anklesVisible: isLandmarkReliable(ankle),
      sideViewDetected: side !== 'front',
      depthTargetDeg: 0,
      currentRepNumber: 0,
      timestampMs,
      bodyLineDeviationDeg: deviationDeg,
    });

    return {
      phase: isHorizontal ? 'bottom' : 'standing',
      activeCue,
      completedRep: null,
      currentKneeAngleDeg: null,
      minKneeAngleDeg: null,
      currentHipAngleDeg: null,
      minHipAngleDeg: null,
      torsoInclinationDeg: torsoInclinationDeg !== null ? Math.round(torsoInclinationDeg) : null,
      detectedSide: side,
      trackingConfidence,
      readiness: { isReady, reason: readinessReason },
    };
  }

  finishSet(workoutId?: string, setIndex?: number): FormSessionSummary {
    const now = Date.now();
    const durationSeconds = Math.max(1, Math.round((now - this.sessionStartTimeMs) / 1000));
    const holdDurationSeconds =
      this.firstHoldTs !== null && this.lastHoldTs !== null
        ? Math.round(((this.lastHoldTs - this.firstHoldTs) / 1000) * 10) / 10
        : 0;
    const alignedHoldPercent =
      this.holdFrames > 0 ? Math.round((this.alignedFrames / this.holdFrames) * 100) : 0;

    const avgConfidence =
      this.trackingConfidences.length > 0
        ? Math.round(
            (this.trackingConfidences.reduce((a, b) => a + b, 0) / this.trackingConfidences.length) *
              100
          ) / 100
        : 0;

    const observations: FormObservation[] = [...this.feedbackEngine.getAggregatedObservations()];
    if (holdDurationSeconds >= MIN_HOLD_SECONDS) {
      observations.push({
        id: 'rule-plank-hold-measured',
        ruleId: 'rule-plank-hold-measured',
        title: 'Hold Measured',
        message:
          alignedHoldPercent >= 70
            ? 'Your body line stayed inside the alignment band for most of the hold.'
            : 'Your body line spent much of the hold outside the alignment band — shorter, straighter holds build the position better than long sagging ones.',
        severity: alignedHoldPercent >= 70 ? 'info' : 'warning',
        count: 1,
        evidence: `Hold ${holdDurationSeconds}s; shoulder–hip–ankle line within ${ALIGNMENT_TOLERANCE_DEG}° of straight for ${alignedHoldPercent}% of it; worst deviation ${Math.round(this.worstDeviationDeg)}°.`,
        repsTriggered: [],
        limitation: 'Timing starts and ends when the tracked body is horizontal — stepping in or out of position is not part of the hold.',
      });
    } else if (this.framesTracked > 0) {
      observations.push({
        id: 'rule-plank-no-hold',
        ruleId: 'rule-plank-no-hold',
        title: 'No Hold Measured',
        message:
          'No sustained horizontal hold was measured in this video, so there is no plank timing to report.',
        severity: 'info',
        count: 1,
        evidence: `Tracked ${this.framesTracked} frames without a ${MIN_HOLD_SECONDS}s horizontal hold.`,
        repsTriggered: [],
      });
    }

    return {
      id: safeRandomId(),
      workoutId,
      setIndex,
      exerciseId: this.exerciseId,
      exerciseName: this.exerciseName,
      analyzerVersion: PLANK_ANALYZER_VERSION,
      cameraView: this.viewVotes.length > 0 ? majorityFormView(this.viewVotes) : this.detectedSide,
      startedAt: this.sessionStartTimeMs,
      endedAt: now,
      durationSeconds,
      totalDetectedReps: 0,
      totalValidReps: 0,
      analysedRepCount: 0,
      averageTrackingConfidence: avgConfidence,
      averageRepDurationSeconds: 0,
      reps: [],
      observations,
      savedToWorkout: false,
      holdDurationSeconds,
      alignedHoldPercent,
    };
  }

  cleanup(): void {
    this.reset();
  }
}
