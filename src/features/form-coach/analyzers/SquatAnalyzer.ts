/**
 * ASCEND Form Coach — Barbell Back Squat Movement Analyzer (V1)
 *
 * Implements side-view biomechanical analysis, phase detection,
 * joint-angle tracking, depth estimation, and evidence-backed observations.
 */

import { ExerciseAnalyzer, AnalyzerFrameResult, MovementAssessment } from './ExerciseAnalyzer';
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

/**
 * D2: the feet-out-of-frame alert requires a SUSTAINED dropout — the feet
 * or ankles must be missing for at least this share of the samples inside
 * the trailing window, and the window must span at least the minimum
 * duration, before the absence counts as real.
 */
const VISIBILITY_WINDOW_MS = 1200;
const VISIBILITY_MIN_SPAN_MS = 700;
const VISIBILITY_BAD_SHARE = 0.6;

/**
 * D1: a rep counts as confidently FRONT only when front classifications
 * are at least this share of the rep's classified frames (and there are
 * enough of them to judge at all).
 */
const FRONT_CONFIDENT_MIN_VOTES = 4;
const FRONT_CONFIDENT_SHARE = 0.6;

/**
 * D6: movement-signature thresholds. The analyzer previously graded ANY
 * tracked movement as a squat — a deadlift set came back as valid squat
 * reps with depth and torso faults (owner report, 2026-11-05). A frame
 * is HINGE evidence when the hip is flexed deeply (≤ HINGE_HIP_MAX_DEG)
 * while the knee stays at least HINGE_KNEE_HIP_MIN_DIFF_DEG straighter
 * than the hip — the hip-hinge pattern of a deadlift/RDL. A frame is
 * DEEP evidence when the knee reaches squat-depth flexion
 * (≤ DEEP_KNEE_MAX_DEG, the state machine's valid-depth band) without
 * hinge dominance: a genuine squat bottom flexes knee and hip together
 * (small differential), and even a good-morning squat passes through
 * deep-knee frames with a small differential on the way down and up.
 * Only profile-view frames count — the signature, like every other
 * measurement here, is a side-view measurement.
 */
const HINGE_HIP_MAX_DEG = 98;
const HINGE_KNEE_HIP_MIN_DIFF_DEG = 35;
const DEEP_KNEE_MAX_DEG = 110;
const SIGNATURE_MIN_ASSESSED_FRAMES = 20;
const SIGNATURE_MIN_HINGE_FRAMES = 10;
const SIGNATURE_MIN_DEEP_FRAMES = 10;
const SIGNATURE_HINGE_SHARE = 0.7;
const SIGNATURE_SQUAT_SHARE = 0.5;

/** Majority view over classified votes; 'front' must win outright — a tie
 * resolves to a side view, so the front-view guidance never fires on
 * ambiguous evidence. 'unknown' votes carry no information and are ignored. */
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
  // D1: camera-view votes, accumulated ONLY over frames that belong to a
  // rep (descending/bottom/ascending), and the decided view per completed
  // rep. The session view and the front-view guidance are judged from
  // these — never from the final frame, which may be the lifter turning
  // to face the camera and walking toward it after the set.
  private currentRepViewVotes: DetectedSide[] = [];
  private completedRepViews: DetectedSide[] = [];
  // D2: trailing visibility windows for the feet/ankles sustained-dropout
  // test.
  private feetVisibilityWindow: VisibilitySample[] = [];
  private anklesVisibilityWindow: VisibilitySample[] = [];
  // D4: frame accounting so the UI can distinguish "never tracked at all"
  // from "tracked, but no valid reps".
  private framesProcessed = 0;
  private framesTracked = 0;
  // D6: movement-signature accounting (profile-view frames where both
  // the knee and hip angles were measurable).
  private signatureAssessedFrames = 0;
  private signatureHingeFrames = 0;
  private signatureDeepKneeFrames = 0;

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
        // D2: only a SUSTAINED dropout alerts. A single frame's visibility
        // dip (the owner's rep 3: pose found on every frame, one ankle
        // landmark briefly under threshold) must not raise this.
        evaluate: (ctx) => ctx.feetSustainedOut === true || ctx.anklesSustainedOut === true,
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
        // Judged at ASCENT, not at the bottom crossing: shallowness is a
        // property of the rep's FINAL minimum, which does not exist until
        // the descent ends. At the first bottom-threshold frame the
        // running minimum can still be ~103° on a rep that goes on to
        // bottom out at 46° — judging there flagged deep reps as shallow
        // (and contradicted the good-depth observation on the same rep).
        evaluate: (ctx) =>
          ctx.phase === 'ascending' &&
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
        // Evidence cites the MEASURED rep minimum (kept current by the
        // engine's evidence refresh); the target is named separately as
        // a target, never as the achieved angle (D3 fix).
        formatEvidence: (ctx) => `Estimated bottom knee angle ${Math.round(ctx.minKneeAngleDeg ?? 0)}° (target ≤ ${ctx.depthTargetDeg}°).`,
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
    this.currentRepViewVotes = [];
    this.completedRepViews = [];
    this.feetVisibilityWindow = [];
    this.anklesVisibilityWindow = [];
    this.framesProcessed = 0;
    this.framesTracked = 0;
    this.signatureAssessedFrames = 0;
    this.signatureHingeFrames = 0;
    this.signatureDeepKneeFrames = 0;
  }

  /** D4: how many frames were offered vs how many carried a detected pose. */
  getTrackingStats(): { framesProcessed: number; framesTracked: number } {
    return { framesProcessed: this.framesProcessed, framesTracked: this.framesTracked };
  }

  /**
   * D6: does the tracked motion actually look like a squat? A set is
   * judged 'not_squat' only on POSITIVE hinge evidence — many assessed
   * frames, at least SIGNATURE_MIN_HINGE_FRAMES of them hinge-patterned,
   * and hinge frames dominating the decisive (hinge or deep) frames.
   * Anything ambiguous stays 'insufficient_evidence' and the caller
   * keeps the normal squat-report path: a shallow squat, a brief clip,
   * or noisy tracking must never be relabeled as another exercise.
   */
  getMovementAssessment(): MovementAssessment {
    const decisive = this.signatureHingeFrames + this.signatureDeepKneeFrames;
    let signature: MovementAssessment['signature'] = 'insufficient_evidence';
    if (
      this.signatureAssessedFrames >= SIGNATURE_MIN_ASSESSED_FRAMES &&
      this.signatureHingeFrames >= SIGNATURE_MIN_HINGE_FRAMES &&
      decisive > 0 &&
      this.signatureHingeFrames / decisive >= SIGNATURE_HINGE_SHARE
    ) {
      signature = 'not_squat';
    } else if (
      this.signatureDeepKneeFrames >= SIGNATURE_MIN_DEEP_FRAMES &&
      decisive > 0 &&
      this.signatureDeepKneeFrames / decisive >= SIGNATURE_SQUAT_SHARE
    ) {
      signature = 'squat';
    }
    return {
      signature,
      assessedFrames: this.signatureAssessedFrames,
      hingeFrames: this.signatureHingeFrames,
      deepKneeFrames: this.signatureDeepKneeFrames,
    };
  }

  /**
   * D2: push one visibility sample into a trailing window and report
   * whether the absence is SUSTAINED — window spans at least
   * VISIBILITY_MIN_SPAN_MS and at least VISIBILITY_BAD_SHARE of its
   * samples are not-ok. A brief dip inside an otherwise visible window
   * returns false.
   */
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

  /** D1: is the CURRENT rep confidently front-view across its frames so far? */
  private currentRepConfidentlyFront(): boolean {
    const classified = this.currentRepViewVotes.filter((v) => v !== 'unknown');
    if (classified.length < FRONT_CONFIDENT_MIN_VOTES) return false;
    const front = classified.filter((v) => v === 'front').length;
    return front / classified.length >= FRONT_CONFIDENT_SHARE && majorityView(classified) === 'front';
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
    this.framesProcessed += 1;
    if (!landmarks || landmarks.length < 33) {
      // No pose at all on this frame. That is a TRACKING state, not feet
      // evidence: "feet out of frame" is a claim about a tracked person,
      // so no-pose frames never enter the visibility windows and never
      // raise the alert. (On the owner's video the only bad feet samples
      // were post-set — feet leaving the frame as he walked to the
      // camera, then no-pose frames; the set itself was clean.)
      const activeCue = this.feedbackEngine.evaluate({
        exerciseId: this.exerciseId,
        phase: 'tracking_lost',
        currentKneeAngleDeg: null,
        minKneeAngleDeg: null,
        torsoInclinationDeg: null,
        trackingConfidence: 0,
        feetVisible: false,
        anklesVisible: false,
        feetSustainedOut: false,
        anklesSustainedOut: false,
        sideViewDetected: !this.currentRepConfidentlyFront(),
        depthTargetDeg: this.depthTargetDeg,
        currentRepNumber: this.completedReps.length,
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

    // Determine side profile
    const side = this.determineSide(landmarks);
    this.detectedSide = side;
    this.framesTracked += 1;

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

    // D6: movement-signature accounting. The hip angle (shoulder–hip–knee)
    // is what separates a squat from a hip hinge: at a squat bottom the
    // knee and hip flex together, while a deadlift folds the hip deeply
    // with the knee comparatively straight. Profile views only — front
    // projections distort both angles, and front view already carries
    // its own refilm guidance.
    if ((side === 'left' || side === 'right') && kneeAngleDeg !== null) {
      const hipAngleDeg = calculateJointAngle(shoulder, hip, knee, aspectRatio);
      if (hipAngleDeg !== null) {
        this.signatureAssessedFrames += 1;
        if (
          hipAngleDeg <= HINGE_HIP_MAX_DEG &&
          kneeAngleDeg - hipAngleDeg >= HINGE_KNEE_HIP_MIN_DIFF_DEG
        ) {
          this.signatureHingeFrames += 1;
        } else if (kneeAngleDeg <= DEEP_KNEE_MAX_DEG) {
          this.signatureDeepKneeFrames += 1;
        }
      }
    }

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

    const currentPhase = this.stateMachine.getCurrentPhase();

    // D1: camera-view votes accumulate ONLY over frames that belong to a
    // rep. The frame that completes a rep is that rep's last frame; its
    // vote counts before the rep's view is decided by majority. Frames
    // outside reps — setup, standing between reps, and the post-set
    // turn/walk toward the camera — never vote, so they can neither
    // relabel the session nor trigger the front-view guidance.
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

    // D2: sustained-dropout tracking for the feet/ankles alert.
    const feetSustainedOut = this.sustainedOut(this.feetVisibilityWindow, feetInFrame, timestampMs);
    const anklesSustainedOut = this.sustainedOut(
      this.anklesVisibilityWindow,
      anklesInFrame,
      timestampMs
    );

    // The feedback engine judges depth against the rep's running minimum
    // knee angle (the same minimum stamped onto the completed rep), not the
    // angle of the single frame that happens to be labelled "bottom".
    const repMinKneeAngleDeg = this.stateMachine.getCurrentRepMinKneeAngleDeg();

    // Evaluate feedback rules
    const activeCue = this.feedbackEngine.evaluate({
      exerciseId: this.exerciseId,
      phase: currentPhase,
      currentKneeAngleDeg: kneeAngleDeg,
      minKneeAngleDeg: repMinKneeAngleDeg,
      torsoInclinationDeg,
      trackingConfidence,
      feetVisible: feetInFrame,
      anklesVisible: anklesInFrame,
      feetSustainedOut,
      anklesSustainedOut,
      // D1: the front-view guidance fires only when the CURRENT REP is
      // confidently front across most of its frames so far — a per-frame
      // side classification (which flickers, and flips entirely during
      // the post-set walk-off) no longer drives it.
      sideViewDetected: !this.currentRepConfidentlyFront(),
      depthTargetDeg: this.depthTargetDeg,
      currentRepNumber: this.completedReps.length,
      timestampMs,
    });

    return {
      phase: currentPhase,
      activeCue,
      completedRep,
      currentKneeAngleDeg: kneeAngleDeg !== null ? Math.round(kneeAngleDeg) : null,
      minKneeAngleDeg: repMinKneeAngleDeg !== null ? Math.round(repMinKneeAngleDeg) : null,
      currentHipAngleDeg: null,
      minHipAngleDeg: null,
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

    // D1: the session's camera view is the majority of the views decided
    // per rep — the view DURING the work. It used to be whatever the very
    // last frame classified as, which is the lifter turning to face the
    // camera after the set, so side-filmed sets were summarized as
    // "front". Falls back to the in-progress rep's votes, then to the
    // last frame classification when no rep was ever in progress.
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
      analyzerVersion: SQUAT_ANALYZER_VERSION,
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
      depthTargetDeg,
      savedToWorkout: false,
    };
  }

  cleanup(): void {
    this.reset();
  }
}
