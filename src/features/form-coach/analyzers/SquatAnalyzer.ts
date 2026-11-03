/**
 * ASCEND Form Coach — Barbell Back Squat Movement Analyzer (V1)
 *
 * Implements side-view biomechanical analysis, phase detection,
 * joint-angle tracking, depth estimation, and evidence-backed observations.
 */

import { ExerciseAnalyzer, AnalyzerFrameResult } from './ExerciseAnalyzer';
import { NormalizedLandmark, PoseLandmarkIndex, DetectedSide } from '../models/pose.types';
import { FormCue, FormObservation, MovementPhase } from '../models/form-feedback.types';
import { FormRep, FormSessionSummary } from '../models/form-session.types';
import {
  calculateJointAngle,
  calculateSegmentInclination,
  isLandmarkReliable,
  MIN_LANDMARK_VISIBILITY,
} from '../services/analysis/LandmarkGeometry';
import { RepStateMachine, RepStateMachineConfig, DEFAULT_SQUAT_CONFIG } from '../services/analysis/RepStateMachine';
import { FormFeedbackEngine, FeedbackRule, RuleEvaluationContext } from '../services/analysis/FormFeedbackEngine';
import { safeRandomId } from '@/lib/formatters';

export const SQUAT_ANALYZER_VERSION = '1.0.0';

export class SquatAnalyzer implements ExerciseAnalyzer {
  readonly exerciseId = 'squat';
  readonly exerciseName = 'Barbell Back Squat';
  readonly supportedCameraViews: ('side' | 'front')[] = ['side'];
  readonly requiredLandmarks: PoseLandmarkIndex[] = [
    PoseLandmarkIndex.LEFT_SHOULDER,
    PoseLandmarkIndex.RIGHT_SHOULDER,
    PoseLandmarkIndex.LEFT_HIP,
    PoseLandmarkIndex.RIGHT_HIP,
    PoseLandmarkIndex.LEFT_KNEE,
    PoseLandmarkIndex.RIGHT_KNEE,
    PoseLandmarkIndex.LEFT_ANKLE,
    PoseLandmarkIndex.RIGHT_ANKLE,
    PoseLandmarkIndex.LEFT_HEEL,
    PoseLandmarkIndex.RIGHT_HEEL,
  ];

  private stateMachine: RepStateMachine;
  private feedbackEngine: FormFeedbackEngine;
  private completedReps: FormRep[] = [];
  private sessionStartTimeMs: number = 0;
  private detectedSide: DetectedSide = 'unknown';
  private trackingConfidences: number[] = [];
  private depthTargetDeg: number = 90;

  constructor(config: Partial<RepStateMachineConfig> = {}) {
    this.depthTargetDeg = config.depthTargetDeg ?? DEFAULT_SQUAT_CONFIG.depthTargetDeg;
    this.stateMachine = new RepStateMachine({
      ...DEFAULT_SQUAT_CONFIG,
      ...config,
    });
    this.feedbackEngine = new FormFeedbackEngine(this.buildRules());
  }

  private buildRules(): FeedbackRule[] {
    return [
      {
        id: 'rule-feet-out-of-frame',
        exerciseId: 'squat',
        title: 'Feet Out of Frame',
        message: 'Step back: keep your feet and ankles fully inside the frame.',
        priority: 'critical',
        cooldownMs: 4000,
        limitation: 'Pose model cannot verify squat depth without ankle and foot tracking.',
        evaluate: (ctx) => !ctx.feetVisible || !ctx.anklesVisible,
        formatEvidence: (ctx) => 'Feet or ankle landmarks dropped below visibility threshold.',
      },
      {
        id: 'rule-camera-view-front',
        exerciseId: 'squat',
        title: 'Camera Angle Guidance',
        message: 'Move camera to side view: squat depth is best analyzed from perpendicular profile.',
        priority: 'high',
        cooldownMs: 6000,
        limitation: 'Front view causes perspective compression for knee flexion and hip depth.',
        evaluate: (ctx) => !ctx.sideViewDetected && ctx.trackingConfidence >= 0.5,
        formatEvidence: (ctx) => 'Both shoulders and hips are equidistant with no profile displacement.',
      },
      {
        id: 'rule-depth-shallow',
        exerciseId: 'squat',
        title: 'Squat Depth Observation',
        message: 'Depth above target: aim for hip crease level with top of knees.',
        priority: 'medium',
        cooldownMs: 4000,
        limitation: 'Hip joint landmark is an approximation of the external hip crease.',
        evaluate: (ctx) =>
          ctx.phase === 'bottom' &&
          ctx.minKneeAngleDeg !== null &&
          ctx.minKneeAngleDeg > ctx.depthTargetDeg + 12,
        formatEvidence: (ctx) => `Estimated bottom knee angle ${Math.round(ctx.minKneeAngleDeg ?? 0)}° (target ≤ ${ctx.depthTargetDeg}°).`,
      },
      {
        id: 'rule-depth-good',
        exerciseId: 'squat',
        title: 'Target Depth Reached',
        message: 'Good depth: hip crease reached parallel with knees.',
        priority: 'low',
        cooldownMs: 3500,
        evaluate: (ctx) =>
          ctx.phase === 'bottom' &&
          ctx.minKneeAngleDeg !== null &&
          ctx.minKneeAngleDeg <= ctx.depthTargetDeg + 5,
        formatEvidence: (ctx) => `Estimated bottom knee angle ${Math.round(ctx.minKneeAngleDeg ?? 0)}° achieved.`,
      },
      {
        id: 'rule-torso-inclination',
        exerciseId: 'squat',
        title: 'Torso Inclination',
        message: 'Brace your core and keep your chest proud to avoid excessive forward lean.',
        priority: 'medium',
        cooldownMs: 5000,
        limitation: 'Individual torso angle naturally varies with femur length and bar position (high bar vs low bar).',
        evaluate: (ctx) =>
          (ctx.phase === 'bottom' || ctx.phase === 'ascending') &&
          ctx.torsoInclinationDeg !== null &&
          ctx.torsoInclinationDeg > 52,
        formatEvidence: (ctx) => `Torso inclination reached ~${Math.round(ctx.torsoInclinationDeg ?? 0)}° from vertical.`,
      },
    ];
  }

  initialize(config?: Record<string, unknown>): void {
    if (config?.depthTargetDeg && typeof config.depthTargetDeg === 'number') {
      this.depthTargetDeg = config.depthTargetDeg;
    }
    this.reset();
  }

  reset(): void {
    this.stateMachine.reset();
    this.feedbackEngine.reset();
    this.completedReps = [];
    this.sessionStartTimeMs = Date.now();
    this.detectedSide = 'unknown';
    this.trackingConfidences = [];
  }

  /**
   * Determines if the user is in left-profile, right-profile, or facing front.
   */
  private determineSide(landmarks: NormalizedLandmark[]): DetectedSide {
    const leftHip = landmarks[PoseLandmarkIndex.LEFT_HIP];
    const rightHip = landmarks[PoseLandmarkIndex.RIGHT_HIP];
    const leftShoulder = landmarks[PoseLandmarkIndex.LEFT_SHOULDER];
    const rightShoulder = landmarks[PoseLandmarkIndex.RIGHT_SHOULDER];

    const leftVis = ((leftHip?.visibility ?? 0) + (leftShoulder?.visibility ?? 0)) / 2;
    const rightVis = ((rightHip?.visibility ?? 0) + (rightShoulder?.visibility ?? 0)) / 2;

    const shoulderDistX = Math.abs((leftShoulder?.x ?? 0) - (rightShoulder?.x ?? 0));

    // If both shoulders are far apart horizontally and both highly visible, user is facing camera
    if (shoulderDistX > 0.18 && leftVis > 0.65 && rightVis > 0.65) {
      return 'front';
    }

    if (leftVis > rightVis + 0.1) {
      return 'left';
    } else if (rightVis > leftVis + 0.1) {
      return 'right';
    }

    return shoulderDistX < 0.12 ? (leftVis >= rightVis ? 'left' : 'right') : 'unknown';
  }

  processFrame(
    landmarks: NormalizedLandmark[] | null,
    timestampMs: number,
    aspectRatio = 1.0
  ): AnalyzerFrameResult {
    if (!landmarks || landmarks.length < 33) {
      const activeCue = this.feedbackEngine.evaluate({
        exerciseId: this.exerciseId,
        phase: 'tracking_lost',
        currentKneeAngleDeg: null,
        minKneeAngleDeg: null,
        torsoInclinationDeg: null,
        trackingConfidence: 0,
        feetVisible: false,
        anklesVisible: false,
        sideViewDetected: false,
        depthTargetDeg: this.depthTargetDeg,
        currentRepNumber: this.completedReps.length,
        timestampMs,
      });

      return {
        phase: 'tracking_lost',
        activeCue,
        completedRep: null,
        currentKneeAngleDeg: null,
        torsoInclinationDeg: null,
        detectedSide: 'unknown',
        trackingConfidence: 0,
        readiness: {
          isReady: false,
          reason: 'No person detected in frame.',
        },
      };
    }

    // Determine side profile
    const side = this.determineSide(landmarks);
    this.detectedSide = side;

    // Pick primary side landmarks (fallback to opposite side if primary is occluded)
    const preferLeft = side === 'left' || side === 'unknown' || side === 'front';

    const hipIndex = preferLeft ? PoseLandmarkIndex.LEFT_HIP : PoseLandmarkIndex.RIGHT_HIP;
    const kneeIndex = preferLeft ? PoseLandmarkIndex.LEFT_KNEE : PoseLandmarkIndex.RIGHT_KNEE;
    const ankleIndex = preferLeft ? PoseLandmarkIndex.LEFT_ANKLE : PoseLandmarkIndex.RIGHT_ANKLE;
    const footIndex = preferLeft ? PoseLandmarkIndex.LEFT_FOOT_INDEX : PoseLandmarkIndex.RIGHT_FOOT_INDEX;
    const shoulderIndex = preferLeft ? PoseLandmarkIndex.LEFT_SHOULDER : PoseLandmarkIndex.RIGHT_SHOULDER;

    const hip = landmarks[hipIndex];
    const knee = landmarks[kneeIndex];
    const ankle = landmarks[ankleIndex];
    const foot = landmarks[footIndex];
    const shoulder = landmarks[shoulderIndex];

    const hipReliable = isLandmarkReliable(hip);
    const kneeReliable = isLandmarkReliable(knee);
    const ankleReliable = isLandmarkReliable(ankle);
    const footReliable = isLandmarkReliable(foot);
    const shoulderReliable = isLandmarkReliable(shoulder);

    // Feet in frame check (normalized coordinates must be between 0.02 and 0.98)
    const feetInFrame =
      footReliable &&
      foot.y >= 0.02 &&
      foot.y <= 0.98 &&
      foot.x >= 0.02 &&
      foot.x <= 0.98;

    const anklesInFrame =
      ankleReliable &&
      ankle.y >= 0.02 &&
      ankle.y <= 0.98;

    // Overall tracking confidence
    const visibleCount = [hipReliable, kneeReliable, ankleReliable, footReliable, shoulderReliable].filter(Boolean).length;
    const trackingConfidence = visibleCount / 5;
    this.trackingConfidences.push(trackingConfidence);

    // Calculate joint angles
    const kneeAngleDeg = calculateJointAngle(hip, knee, ankle, aspectRatio);
    const torsoInclinationDeg = calculateSegmentInclination(shoulder, hip, aspectRatio);

    // Check readiness
    let isReady = true;
    let readinessReason: string | undefined;

    if (!feetInFrame || !anklesInFrame) {
      isReady = false;
      readinessReason = 'Step back: feet and ankles must be inside the camera view.';
    } else if (side === 'front') {
      isReady = false;
      readinessReason = 'Position camera at a 90° side profile.';
    } else if (trackingConfidence < 0.6) {
      isReady = false;
      readinessReason = 'Improve lighting or adjust distance to improve tracking.';
    }

    // Update state machine
    const completedRep = this.stateMachine.update(
      kneeAngleDeg,
      torsoInclinationDeg,
      trackingConfidence,
      timestampMs
    );

    if (completedRep) {
      this.completedReps.push(completedRep);
    }

    const currentPhase = this.stateMachine.getCurrentPhase();

    // Evaluate feedback rules
    const activeCue = this.feedbackEngine.evaluate({
      exerciseId: this.exerciseId,
      phase: currentPhase,
      currentKneeAngleDeg: kneeAngleDeg,
      minKneeAngleDeg: kneeAngleDeg, // or pass state machine minimum
      torsoInclinationDeg,
      trackingConfidence,
      feetVisible: feetInFrame,
      anklesVisible: anklesInFrame,
      sideViewDetected: side === 'left' || side === 'right',
      depthTargetDeg: this.depthTargetDeg,
      currentRepNumber: this.completedReps.length,
      timestampMs,
    });

    return {
      phase: currentPhase,
      activeCue,
      completedRep,
      currentKneeAngleDeg: kneeAngleDeg !== null ? Math.round(kneeAngleDeg) : null,
      torsoInclinationDeg: torsoInclinationDeg !== null ? Math.round(torsoInclinationDeg) : null,
      detectedSide: side,
      trackingConfidence,
      readiness: {
        isReady,
        reason: readinessReason,
      },
    };
  }

  finishSet(
    workoutId?: string,
    setIndex?: number,
    depthTargetDeg = this.depthTargetDeg
  ): FormSessionSummary {
    const now = Date.now();
    const durationSeconds = Math.max(1, Math.round((now - this.sessionStartTimeMs) / 1000));
    const validReps = this.completedReps.filter((r) => r.isValid);

    const avgConfidence =
      this.trackingConfidences.length > 0
        ? Math.round((this.trackingConfidences.reduce((a, b) => a + b, 0) / this.trackingConfidences.length) * 100) / 100
        : 0;

    const totalRepTime = validReps.reduce((acc, r) => acc + r.durationSeconds, 0);
    const avgRepDurationSeconds =
      validReps.length > 0 ? Math.round((totalRepTime / validReps.length) * 10) / 10 : 0;

    const observations: FormObservation[] = this.feedbackEngine.getAggregatedObservations();

    return {
      id: safeRandomId(),
      workoutId,
      setIndex,
      exerciseId: this.exerciseId,
      exerciseName: this.exerciseName,
      analyzerVersion: SQUAT_ANALYZER_VERSION,
      cameraView: this.detectedSide,
      startedAt: this.sessionStartTimeMs,
      endedAt: now,
      durationSeconds,
      totalDetectedReps: this.completedReps.length,
      totalValidReps: validReps.length,
      analysedRepCount: this.completedReps.length,
      averageTrackingConfidence: avgConfidence,
      averageRepDurationSeconds: avgRepDurationSeconds,
      reps: this.completedReps,
      observations,
      depthTargetDeg,
      savedToWorkout: false,
    };
  }

  cleanup(): void {
    this.reset();
  }
}
