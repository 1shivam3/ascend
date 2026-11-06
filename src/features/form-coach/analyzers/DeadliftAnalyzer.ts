/**
 * ASCEND Form Coach — Conventional Deadlift Movement Analyzer (V1)
 *
 * Side-view analysis of the hip-hinge pattern: setup → pull → lockout.
 * Mirrors the SquatAnalyzer's structure and report shape — rep counting
 * from tracked landmarks, evidence-backed observations, movement
 * measurements only (never a diagnosis, never a claim about the bar or
 * the spine that 2D landmarks cannot support).
 */

import { ExerciseAnalyzer, AnalyzerFrameResult } from './ExerciseAnalyzer';
import { NormalizedLandmark, PoseLandmarkIndex, DetectedSide } from '../models/pose.types';
import { FormObservation } from '../models/form-feedback.types';
import { FormRep, FormSessionSummary } from '../models/form-session.types';
import {
  calculateJointAngle,
  calculateSegmentInclination,
  isLandmarkReliable,
} from '../services/analysis/LandmarkGeometry';
import {
  DeadliftRepStateMachine,
  DeadliftRepStateMachineConfig,
  DEFAULT_DEADLIFT_CONFIG,
} from '../services/analysis/DeadliftRepStateMachine';
import { FormFeedbackEngine, FeedbackRule } from '../services/analysis/FormFeedbackEngine';
import { safeRandomId } from '@/lib/formatters';

export const DEADLIFT_ANALYZER_VERSION = '1.0.0';

// Same sustained-dropout discipline as the squat analyzer (D2): the
// feet-out-of-frame alert requires the absence to be sustained.
const VISIBILITY_WINDOW_MS = 1200;
const VISIBILITY_MIN_SPAN_MS = 700;
const VISIBILITY_BAD_SHARE = 0.6;

// Same per-rep view discipline as the squat analyzer (D1): a rep counts
// as confidently FRONT only on a sustained front majority of its own
// frames.
const FRONT_CONFIDENT_MIN_VOTES = 4;
const FRONT_CONFIDENT_SHARE = 0.6;

/** Majority view over classified votes; front must win outright. */
function majorityView(votes: DetectedSide[]): DetectedSide {
  const counts = { left: 0, right: 0, front: 0 };
  for (const v of votes) {
    if (v === 'left' || v === 'right' || v === 'front') counts[v] += 1;
  }
  const sideBest = counts.left >= counts.right ? 'left' : 'right';
  const sideCount = Math.max(counts.left, counts.right);
  if (counts.front > sideCount) return 'front';
  if (sideCount > 0) return sideBest as DetectedSide;
  if (counts.front > 0) return 'front';
  return 'unknown';
}

interface VisibilitySample {
  t: number;
  ok: boolean;
}

export class DeadliftAnalyzer implements ExerciseAnalyzer {
  readonly exerciseId = 'deadlift';
  readonly exerciseName = 'Conventional Deadlift';
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

  private stateMachine: DeadliftRepStateMachine;
  private feedbackEngine: FormFeedbackEngine;
  private completedReps: FormRep[] = [];
  private sessionStartTimeMs: number = 0;
  private detectedSide: DetectedSide = 'unknown';
  private trackingConfidences: number[] = [];
  private currentRepViewVotes: DetectedSide[] = [];
  private completedRepViews: DetectedSide[] = [];
  private feetVisibilityWindow: VisibilitySample[] = [];
  private anklesVisibilityWindow: VisibilitySample[] = [];
  private framesProcessed = 0;
  private framesTracked = 0;

  constructor(config: Partial<DeadliftRepStateMachineConfig> = {}) {
    this.stateMachine = new DeadliftRepStateMachine({
      ...DEFAULT_DEADLIFT_CONFIG,
      ...config,
    });
    this.feedbackEngine = new FormFeedbackEngine(this.buildRules());
  }

  private buildRules(): FeedbackRule[] {
    return [
      {
        id: 'rule-deadlift-feet-out-of-frame',
        exerciseId: 'deadlift',
        title: 'Feet Out of Frame',
        message: 'Step back: keep your feet and ankles fully inside the frame.',
        priority: 'critical',
        cooldownMs: 4000,
        limitation: 'Pose model cannot verify the setup position without ankle and foot tracking.',
        evaluate: (ctx) => ctx.feetSustainedOut === true || ctx.anklesSustainedOut === true,
        formatEvidence: () => 'Feet or ankle landmarks dropped below visibility threshold.',
      },
      {
        id: 'rule-deadlift-camera-view-front',
        exerciseId: 'deadlift',
        title: 'Camera Angle Guidance',
        message: 'Move camera to side view: hinge depth and lockout are best analyzed from perpendicular profile.',
        priority: 'high',
        cooldownMs: 6000,
        limitation: 'Front view causes perspective compression for hip and knee extension.',
        evaluate: (ctx) => !ctx.sideViewDetected && ctx.trackingConfidence >= 0.5,
        formatEvidence: () => 'Both shoulders and hips are equidistant with no profile displacement.',
      },
      {
        id: 'rule-deadlift-lockout',
        exerciseId: 'deadlift',
        title: 'Lockout Reached',
        message: 'Full lockout: hips and knees extended at the top.',
        priority: 'low',
        cooldownMs: 3500,
        evaluate: (ctx) =>
          ctx.phase === 'ascending' &&
          ctx.currentHipAngleDeg !== null &&
          ctx.currentHipAngleDeg !== undefined &&
          ctx.currentHipAngleDeg >= DEFAULT_DEADLIFT_CONFIG.lockoutHipAngleDeg &&
          ctx.currentKneeAngleDeg !== null &&
          ctx.currentKneeAngleDeg >= DEFAULT_DEADLIFT_CONFIG.lockoutKneeAngleDeg,
        formatEvidence: (ctx) =>
          `Hip angle ${Math.round(ctx.currentHipAngleDeg ?? 0)}°, knee angle ${Math.round(ctx.currentKneeAngleDeg ?? 0)}° at the top.`,
      },
      {
        id: 'rule-deadlift-trunk-angle',
        exerciseId: 'deadlift',
        title: 'Trunk Angle Observation',
        message: 'Your trunk measured near-horizontal during the pull. A very flat trunk angle usually means the hips started high — check your setup position.',
        priority: 'medium',
        cooldownMs: 5000,
        limitation: 'Side-view 2D estimate of trunk inclination only; it cannot assess spinal curvature or bar path.',
        evaluate: (ctx) =>
          (ctx.phase === 'ascending' || ctx.phase === 'bottom') &&
          ctx.torsoInclinationDeg !== null &&
          ctx.torsoInclinationDeg > 78,
        formatEvidence: (ctx) =>
          `Trunk inclination reached ~${Math.round(ctx.torsoInclinationDeg ?? 0)}° from vertical.`,
      },
    ];
  }

  initialize(_config?: Record<string, unknown>): void {
    this.reset();
  }

  reset(): void {
    this.stateMachine.reset();
    this.feedbackEngine.reset();
    this.completedReps = [];
    this.sessionStartTimeMs = Date.now();
    this.detectedSide = 'unknown';
    this.trackingConfidences = [];
    this.currentRepViewVotes = [];
    this.completedRepViews = [];
    this.feetVisibilityWindow = [];
    this.anklesVisibilityWindow = [];
    this.framesProcessed = 0;
    this.framesTracked = 0;
  }

  getTrackingStats(): { framesProcessed: number; framesTracked: number } {
    return { framesProcessed: this.framesProcessed, framesTracked: this.framesTracked };
  }

  private sustainedOut(window: VisibilitySample[], ok: boolean, timestampMs: number): boolean {
    window.push({ t: timestampMs, ok });
    const cutoff = timestampMs - VISIBILITY_WINDOW_MS;
    while (window.length > 1 && window[0].t < cutoff) {
      window.shift();
    }
    if (window.length === 0) return false;
    const span = timestampMs - window[0].t;
    if (span < VISIBILITY_MIN_SPAN_MS) return false;
    const bad = window.reduce((acc, s) => acc + (s.ok ? 0 : 1), 0);
    return bad / window.length >= VISIBILITY_BAD_SHARE;
  }

  private currentRepConfidentlyFront(): boolean {
    const classified = this.currentRepViewVotes.filter((v) => v !== 'unknown');
    if (classified.length < FRONT_CONFIDENT_MIN_VOTES) return false;
    const front = classified.filter((v) => v === 'front').length;
    return front / classified.length >= FRONT_CONFIDENT_SHARE && majorityView(classified) === 'front';
  }

  private determineSide(landmarks: NormalizedLandmark[]): DetectedSide {
    const leftHip = landmarks[PoseLandmarkIndex.LEFT_HIP];
    const rightHip = landmarks[PoseLandmarkIndex.RIGHT_HIP];
    const leftShoulder = landmarks[PoseLandmarkIndex.LEFT_SHOULDER];
    const rightShoulder = landmarks[PoseLandmarkIndex.RIGHT_SHOULDER];

    const leftVis = ((leftHip?.visibility ?? 0) + (leftShoulder?.visibility ?? 0)) / 2;
    const rightVis = ((rightHip?.visibility ?? 0) + (rightShoulder?.visibility ?? 0)) / 2;

    const shoulderDistX = Math.abs((leftShoulder?.x ?? 0) - (rightShoulder?.x ?? 0));

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
    this.framesProcessed += 1;
    if (!landmarks || landmarks.length < 33) {
      const activeCue = this.feedbackEngine.evaluate({
        exerciseId: this.exerciseId,
        phase: 'tracking_lost',
        currentKneeAngleDeg: null,
        minKneeAngleDeg: null,
        currentHipAngleDeg: null,
        minHipAngleDeg: null,
        torsoInclinationDeg: null,
        trackingConfidence: 0,
        feetVisible: false,
        anklesVisible: false,
        feetSustainedOut: false,
        anklesSustainedOut: false,
        sideViewDetected: !this.currentRepConfidentlyFront(),
        depthTargetDeg: 0,
        currentRepNumber: this.completedReps.filter((r) => r.isValid).length,
        timestampMs,
      });

      return {
        phase: 'tracking_lost',
        activeCue,
        completedRep: null,
        currentKneeAngleDeg: null,
        minKneeAngleDeg: null,
        currentHipAngleDeg: null,
        minHipAngleDeg: null,
        torsoInclinationDeg: null,
        detectedSide: 'unknown',
        trackingConfidence: 0,
        readiness: {
          isReady: false,
          reason: 'No person detected in frame.',
        },
      };
    }

    const side = this.determineSide(landmarks);
    this.detectedSide = side;
    this.framesTracked += 1;

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

    const visibleCount = [hipReliable, kneeReliable, ankleReliable, footReliable, shoulderReliable].filter(Boolean).length;
    const trackingConfidence = visibleCount / 5;
    this.trackingConfidences.push(trackingConfidence);

    const kneeAngleDeg = calculateJointAngle(hip, knee, ankle, aspectRatio);
    const hipAngleDeg = calculateJointAngle(shoulder, hip, knee, aspectRatio);
    const torsoInclinationDeg = calculateSegmentInclination(shoulder, hip, aspectRatio);

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

    const completedRep = this.stateMachine.update(
      hipAngleDeg,
      kneeAngleDeg,
      torsoInclinationDeg,
      hipReliable ? hip.y : null,
      shoulderReliable ? shoulder.y : null,
      trackingConfidence,
      timestampMs
    );

    const currentPhase = this.stateMachine.getCurrentPhase();

    // Per-rep view votes (D1 discipline): only frames belonging to an
    // attempt vote; the completing frame votes before the view is set.
    if (completedRep) {
      this.currentRepViewVotes.push(side);
      this.completedRepViews.push(majorityView(this.currentRepViewVotes));
      this.currentRepViewVotes = [];
      this.completedReps.push(completedRep);
    } else if (
      currentPhase === 'descending' ||
      currentPhase === 'bottom' ||
      currentPhase === 'ascending'
    ) {
      this.currentRepViewVotes.push(side);
    }

    const feetSustainedOut = this.sustainedOut(this.feetVisibilityWindow, feetInFrame, timestampMs);
    const anklesSustainedOut = this.sustainedOut(
      this.anklesVisibilityWindow,
      anklesInFrame,
      timestampMs
    );

    const repMinHipAngleDeg = this.stateMachine.getCurrentRepMinHipAngleDeg();

    const activeCue = this.feedbackEngine.evaluate({
      exerciseId: this.exerciseId,
      phase: currentPhase,
      currentKneeAngleDeg: kneeAngleDeg,
      minKneeAngleDeg: null,
      currentHipAngleDeg: hipAngleDeg,
      minHipAngleDeg: repMinHipAngleDeg,
      torsoInclinationDeg,
      trackingConfidence,
      feetVisible: feetInFrame,
      anklesVisible: anklesInFrame,
      feetSustainedOut,
      anklesSustainedOut,
      sideViewDetected: !this.currentRepConfidentlyFront(),
      depthTargetDeg: 0,
      currentRepNumber: this.completedReps.filter((r) => r.isValid).length,
      timestampMs,
    });

    return {
      phase: currentPhase,
      activeCue,
      completedRep,
      currentKneeAngleDeg: kneeAngleDeg !== null ? Math.round(kneeAngleDeg) : null,
      minKneeAngleDeg: null,
      currentHipAngleDeg: hipAngleDeg !== null ? Math.round(hipAngleDeg) : null,
      minHipAngleDeg: repMinHipAngleDeg !== null ? Math.round(repMinHipAngleDeg) : null,
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
    setIndex?: number
  ): FormSessionSummary {
    const now = Date.now();
    const durationSeconds = Math.max(1, Math.round((now - this.sessionStartTimeMs) / 1000));
    const validReps = this.completedReps.filter((r) => r.isValid);
    const incompleteReps = this.completedReps.filter((r) => !r.lockoutAchieved);

    const avgConfidence =
      this.trackingConfidences.length > 0
        ? Math.round((this.trackingConfidences.reduce((a, b) => a + b, 0) / this.trackingConfidences.length) * 100) / 100
        : 0;

    // Average set time per valid rep: total measured set duration
    // divided by valid reps. (This used to average the state machine's
    // per-rep window durations over valid reps only — a window spans
    // just the machine's rep anchor to lockout, excluding setup/rest
    // and every incomplete attempt, so a 27s set with 1 valid rep
    // reported "Avg / repetition 0.7s": the single rep's window, which
    // is the machine's minimum valid duration. Phone-polish fix,
    // 2026-11-06.)
    const avgRepDurationSeconds =
      validReps.length > 0 ? Math.round((durationSeconds / validReps.length) * 10) / 10 : 0;

    const observations: FormObservation[] = this.feedbackEngine.getAggregatedObservations();

    // Rep-aggregate findings the per-frame rules cannot express: both
    // are direct counts/measurements over the finished attempts.
    const hipsFirstReps = this.completedReps.filter((r) => r.hipsRoseFirst);
    if (hipsFirstReps.length > 0) {
      observations.push({
        id: 'rule-hips-rise-first',
        ruleId: 'rule-hips-rise-first',
        title: 'Hips Rose Before Shoulders',
        message:
          'On some reps your hips rose noticeably ahead of your shoulders early in the pull, which turns the lift into a stiff-leg pull. Push the floor away and let your chest rise with your hips.',
        severity: 'warning',
        count: hipsFirstReps.length,
        evidence: `Hips rose ahead of shoulders on ${hipsFirstReps.length} of ${this.completedReps.length} pulls (side-view landmark travel).`,
        repsTriggered: hipsFirstReps.map((r) => r.repNumber),
        limitation: 'Estimated from 2D landmarks — a cue to check against the video, not a measurement of bar path.',
      });
    }
    if (incompleteReps.length > 0) {
      observations.push({
        id: 'rule-incomplete-lockout',
        ruleId: 'rule-incomplete-lockout',
        title: 'Incomplete Lockouts',
        message:
          'Some pulls ended before your hips and knees fully extended at the top, so they were counted as incomplete attempts, not reps.',
        severity: 'info',
        count: incompleteReps.length,
        evidence: `Lockout not reached on ${incompleteReps.length} of ${this.completedReps.length} pulls.`,
        repsTriggered: incompleteReps.map((r) => r.repNumber),
      });
    }

    const sessionView: DetectedSide =
      this.completedRepViews.length > 0
        ? majorityView(this.completedRepViews)
        : this.currentRepViewVotes.length > 0
          ? majorityView(this.currentRepViewVotes)
          : this.detectedSide;

    return {
      id: safeRandomId(),
      workoutId,
      setIndex,
      exerciseId: this.exerciseId,
      exerciseName: this.exerciseName,
      analyzerVersion: DEADLIFT_ANALYZER_VERSION,
      cameraView: sessionView,
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
      savedToWorkout: false,
    };
  }

  cleanup(): void {
    this.reset();
  }
}
