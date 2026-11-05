/**
 * ASCEND Form Coach — Shared Base for Cycle Analyzers (Batch A+B)
 *
 * The squat and deadlift analyzers each carry the full per-analyzer
 * boilerplate (side determination, frame accounting, view votes,
 * feedback plumbing, summary assembly). The batch analyzers share
 * that structure through this base instead of copying it eight more
 * times: the base owns the frame pipeline and the FormSessionSummary
 * shape; each analyzer owns only what is genuinely its own — the
 * cycle signal, the machine thresholds, its feedback rules, the
 * per-rep measurements it stamps, and its aggregate observations.
 *
 * Everything measured here is a 2D landmark measurement, reported as
 * such — never a diagnosis and never a claim about the bar, the load,
 * or anything the camera cannot see.
 */

import {
  ExerciseAnalyzer,
  AnalyzerFrameResult,
} from '../analyzers/ExerciseAnalyzer';
import { NormalizedLandmark, PoseLandmarkIndex, DetectedSide } from '../models/pose.types';
import { FormObservation } from '../models/form-feedback.types';
import { FormRep, FormSessionSummary } from '../models/form-session.types';
import {
  calculateDistance,
  calculateJointAngle,
  calculateSegmentInclination,
  isLandmarkReliable,
} from '../services/analysis/LandmarkGeometry';
import {
  CycleRepStateMachine,
  CycleRepStateMachineConfig,
} from '../services/analysis/CycleRepStateMachine';
import { FormFeedbackEngine, FeedbackRule } from '../services/analysis/FormFeedbackEngine';
import { safeRandomId } from '@/lib/formatters';

/** Same per-rep view discipline as the squat/deadlift analyzers (D1). */
const FRONT_CONFIDENT_MIN_VOTES = 4;
const FRONT_CONFIDENT_SHARE = 0.6;

/** Majority view over classified votes; front must win outright. */
export function majorityFormView(votes: DetectedSide[]): DetectedSide {
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

/** Same profile/front discrimination as the squat/deadlift analyzers. */
export function determineFormSide(landmarks: NormalizedLandmark[]): DetectedSide {
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

/** Standard per-frame measurements on the tracked subject. */
export interface FrameMeasurements {
  side: DetectedSide;
  shoulder: NormalizedLandmark;
  hip: NormalizedLandmark;
  elbow: NormalizedLandmark;
  wrist: NormalizedLandmark;
  knee: NormalizedLandmark;
  ankle: NormalizedLandmark;
  foot: NormalizedLandmark;
  kneeAngleDeg: number | null;
  hipAngleDeg: number | null;
  elbowAngleDeg: number | null;
  /** Far-side elbow, when measurable (alternating-arm lifts). */
  elbowOtherAngleDeg: number | null;
  /** Near-side knee pair minimum — the lunge's driving angle. */
  minKneeAngleDeg: number | null;
  torsoInclinationDeg: number | null;
  /** Interior shoulder–hip–ankle angle; 180° is a straight body line. */
  bodyLineAngleDeg: number | null;
  torsoLen: number | null;
  /** (shoulder.y − wrist.y) / torsoLen: 0 = wrist at shoulder height. */
  wristHeightRatio: number | null;
  trackingConfidence: number;
}

/** Generic per-rep aggregates the base tracks for every cycle. */
export interface RepBag {
  frames: number;
  minElbow: number;
  minKnee: number;
  maxTorsoInclination: number;
  maxBodyLineDeviation: number;
  maxWristHeightRatio: number;
  hipXMin: number;
  hipXMax: number;
  hipYMin: number;
  hipYMax: number;
  shoulderXMin: number;
  shoulderXMax: number;
  wristXMin: number;
  wristXMax: number;
  torsoLen: number;
}

function emptyBag(): RepBag {
  return {
    frames: 0,
    minElbow: Infinity,
    minKnee: Infinity,
    maxTorsoInclination: 0,
    maxBodyLineDeviation: 0,
    maxWristHeightRatio: -Infinity,
    hipXMin: Infinity,
    hipXMax: -Infinity,
    hipYMin: Infinity,
    hipYMax: -Infinity,
    shoulderXMin: Infinity,
    shoulderXMax: -Infinity,
    wristXMin: Infinity,
    wristXMax: -Infinity,
    torsoLen: 0,
  };
}

export abstract class CycleAnalyzerBase implements ExerciseAnalyzer {
  abstract readonly exerciseId: string;
  abstract readonly exerciseName: string;
  abstract readonly supportedCameraViews: ('side' | 'front')[];
  abstract readonly requiredLandmarks: PoseLandmarkIndex[];
  protected abstract readonly analyzerVersion: string;
  /** Landmarks whose visibility makes up the tracking confidence. */
  protected abstract readonly keyLandmarks: PoseLandmarkIndex[];

  protected stateMachine: CycleRepStateMachine;
  protected feedbackEngine: FormFeedbackEngine;
  protected completedReps: FormRep[] = [];
  protected sessionStartTimeMs = 0;
  protected detectedSide: DetectedSide = 'unknown';
  protected trackingConfidences: number[] = [];
  protected currentRepViewVotes: DetectedSide[] = [];
  protected completedRepViews: DetectedSide[] = [];
  protected framesProcessed = 0;
  protected framesTracked = 0;
  private bag: RepBag = emptyBag();
  private prevPhase: string = 'standing';

  protected constructor(machineConfig: CycleRepStateMachineConfig) {
    this.stateMachine = new CycleRepStateMachine(machineConfig);
    this.feedbackEngine = new FormFeedbackEngine([]);
  }

  /** Rules are built lazily (subclass fields are not ready in the
   * base constructor); called on first use and on reset. */
  protected abstract buildRules(): FeedbackRule[];

  /** The cycle's driving signal for this frame, and its top gate. */
  protected abstract measureSignal(
    m: FrameMeasurements
  ): { signal: number | null; topGate?: boolean };

  /** Stamp this analyzer's measurements onto a finished rep. */
  protected abstract decorateRep(rep: FormRep, bag: RepBag): void;

  /** Aggregate findings the per-frame rules cannot express. */
  protected aggregateObservations(_reps: FormRep[]): FormObservation[] {
    return [];
  }

  /** Extra blocking readiness reason, or null. The base already
   * blocks on tracking confidence and on front view for side-only
   * exercises. */
  protected readinessBlock(_m: FrameMeasurements): string | null {
    return null;
  }

  /** HUD angle fields; default: none of the knee/hip tiles apply. */
  protected hudFields(
    _m: FrameMeasurements,
    _minSignal: number | null
  ): Partial<
    Pick<
      AnalyzerFrameResult,
      'currentKneeAngleDeg' | 'minKneeAngleDeg' | 'currentHipAngleDeg' | 'minHipAngleDeg'
    >
  > {
    return {};
  }

  private rulesReady = false;
  private ensureRules(): void {
    if (!this.rulesReady) {
      this.feedbackEngine = new FormFeedbackEngine(this.buildRules());
      this.rulesReady = true;
    }
  }

  initialize(_config?: Record<string, unknown>): void {
    this.reset();
  }

  reset(): void {
    this.ensureRules();
    this.stateMachine.reset();
    this.feedbackEngine.reset();
    this.completedReps = [];
    this.sessionStartTimeMs = Date.now();
    this.detectedSide = 'unknown';
    this.trackingConfidences = [];
    this.currentRepViewVotes = [];
    this.completedRepViews = [];
    this.framesProcessed = 0;
    this.framesTracked = 0;
    this.bag = emptyBag();
    this.prevPhase = 'standing';
  }

  getTrackingStats(): { framesProcessed: number; framesTracked: number } {
    return { framesProcessed: this.framesProcessed, framesTracked: this.framesTracked };
  }

  private currentRepConfidentlyFront(): boolean {
    const classified = this.currentRepViewVotes.filter((v) => v !== 'unknown');
    if (classified.length < FRONT_CONFIDENT_MIN_VOTES) return false;
    const front = classified.filter((v) => v === 'front').length;
    return front / classified.length >= FRONT_CONFIDENT_SHARE && majorityFormView(classified) === 'front';
  }

  private accumulateBag(m: FrameMeasurements, aspectRatio: number): void {
    const b = this.bag;
    b.frames += 1;
    if (m.elbowAngleDeg !== null && m.elbowAngleDeg < b.minElbow) b.minElbow = m.elbowAngleDeg;
    if (m.minKneeAngleDeg !== null && m.minKneeAngleDeg < b.minKnee) b.minKnee = m.minKneeAngleDeg;
    if (m.torsoInclinationDeg !== null && m.torsoInclinationDeg > b.maxTorsoInclination) {
      b.maxTorsoInclination = m.torsoInclinationDeg;
    }
    if (m.bodyLineAngleDeg !== null) {
      const dev = Math.abs(180 - m.bodyLineAngleDeg);
      if (dev > b.maxBodyLineDeviation) b.maxBodyLineDeviation = dev;
    }
    if (m.wristHeightRatio !== null && m.wristHeightRatio > b.maxWristHeightRatio) {
      b.maxWristHeightRatio = m.wristHeightRatio;
    }
    const hipX = m.hip.x * aspectRatio;
    const shoulderX = m.shoulder.x * aspectRatio;
    const wristX = m.wrist.x * aspectRatio;
    if (isLandmarkReliable(m.hip)) {
      b.hipXMin = Math.min(b.hipXMin, hipX);
      b.hipXMax = Math.max(b.hipXMax, hipX);
      b.hipYMin = Math.min(b.hipYMin, m.hip.y);
      b.hipYMax = Math.max(b.hipYMax, m.hip.y);
    }
    if (isLandmarkReliable(m.shoulder)) {
      b.shoulderXMin = Math.min(b.shoulderXMin, shoulderX);
      b.shoulderXMax = Math.max(b.shoulderXMax, shoulderX);
    }
    if (isLandmarkReliable(m.wrist)) {
      b.wristXMin = Math.min(b.wristXMin, wristX);
      b.wristXMax = Math.max(b.wristXMax, wristX);
    }
    if (m.torsoLen !== null) b.torsoLen = m.torsoLen;
  }

  processFrame(
    landmarks: NormalizedLandmark[] | null,
    timestampMs: number,
    aspectRatio = 1.0
  ): AnalyzerFrameResult {
    this.ensureRules();
    this.framesProcessed += 1;
    if (!landmarks || landmarks.length < 33) {
      const activeCue = this.feedbackEngine.evaluate({
        exerciseId: this.exerciseId,
        phase: 'tracking_lost',
        currentKneeAngleDeg: null,
        minKneeAngleDeg: null,
        currentHipAngleDeg: null,
        minHipAngleDeg: null,
        currentElbowAngleDeg: null,
        minElbowAngleDeg: null,
        wristHeightRatio: null,
        bodyLineDeviationDeg: null,
        torsoInclinationDeg: null,
        trackingConfidence: 0,
        feetVisible: false,
        anklesVisible: false,
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
        readiness: { isReady: false, reason: 'No person detected in frame.' },
      };
    }

    const side = determineFormSide(landmarks);
    this.detectedSide = side;
    this.framesTracked += 1;

    const preferLeft = side === 'left' || side === 'unknown' || side === 'front';
    const idx = (left: PoseLandmarkIndex, right: PoseLandmarkIndex) =>
      landmarks[preferLeft ? left : right];
    const shoulder = idx(PoseLandmarkIndex.LEFT_SHOULDER, PoseLandmarkIndex.RIGHT_SHOULDER);
    const hip = idx(PoseLandmarkIndex.LEFT_HIP, PoseLandmarkIndex.RIGHT_HIP);
    const elbow = idx(PoseLandmarkIndex.LEFT_ELBOW, PoseLandmarkIndex.RIGHT_ELBOW);
    const wrist = idx(PoseLandmarkIndex.LEFT_WRIST, PoseLandmarkIndex.RIGHT_WRIST);
    const knee = idx(PoseLandmarkIndex.LEFT_KNEE, PoseLandmarkIndex.RIGHT_KNEE);
    const ankle = idx(PoseLandmarkIndex.LEFT_ANKLE, PoseLandmarkIndex.RIGHT_ANKLE);
    const foot = idx(PoseLandmarkIndex.LEFT_FOOT_INDEX, PoseLandmarkIndex.RIGHT_FOOT_INDEX);
    const elbowOther = landmarks[
      preferLeft ? PoseLandmarkIndex.RIGHT_ELBOW : PoseLandmarkIndex.LEFT_ELBOW
    ];
    const shoulderOther = landmarks[
      preferLeft ? PoseLandmarkIndex.RIGHT_SHOULDER : PoseLandmarkIndex.LEFT_SHOULDER
    ];
    const wristOther = landmarks[
      preferLeft ? PoseLandmarkIndex.RIGHT_WRIST : PoseLandmarkIndex.LEFT_WRIST
    ];
    const hipOther = landmarks[preferLeft ? PoseLandmarkIndex.RIGHT_HIP : PoseLandmarkIndex.LEFT_HIP];
    const kneeOther = landmarks[
      preferLeft ? PoseLandmarkIndex.RIGHT_KNEE : PoseLandmarkIndex.LEFT_KNEE
    ];
    const ankleOther = landmarks[
      preferLeft ? PoseLandmarkIndex.RIGHT_ANKLE : PoseLandmarkIndex.LEFT_ANKLE
    ];

    const keyVisible = this.keyLandmarks.filter((i) => isLandmarkReliable(landmarks[i])).length;
    const trackingConfidence = this.keyLandmarks.length > 0 ? keyVisible / this.keyLandmarks.length : 0;
    this.trackingConfidences.push(trackingConfidence);

    const kneeAngleDeg = calculateJointAngle(hip, knee, ankle, aspectRatio);
    const kneeOtherAngleDeg = calculateJointAngle(hipOther, kneeOther, ankleOther, aspectRatio);
    const kneeAngles = [kneeAngleDeg, kneeOtherAngleDeg].filter((v): v is number => v !== null);
    const torsoLen = calculateDistance(shoulder, hip, aspectRatio);
    const wristHeightRatio =
      torsoLen !== null && torsoLen > 1e-6 && isLandmarkReliable(wrist)
        ? (shoulder.y - wrist.y) / torsoLen
        : null;

    const m: FrameMeasurements = {
      side,
      shoulder,
      hip,
      elbow,
      wrist,
      knee,
      ankle,
      foot,
      kneeAngleDeg,
      hipAngleDeg: calculateJointAngle(shoulder, hip, knee, aspectRatio),
      elbowAngleDeg: calculateJointAngle(shoulder, elbow, wrist, aspectRatio),
      elbowOtherAngleDeg: calculateJointAngle(shoulderOther, elbowOther, wristOther, aspectRatio),
      minKneeAngleDeg: kneeAngles.length > 0 ? Math.min(...kneeAngles) : null,
      torsoInclinationDeg: calculateSegmentInclination(shoulder, hip, aspectRatio),
      bodyLineAngleDeg: calculateJointAngle(shoulder, hip, ankle, aspectRatio),
      torsoLen,
      wristHeightRatio,
      trackingConfidence,
    };

    const { signal, topGate } = this.measureSignal(m);

    // A fresh cycle's measurement bag starts when the machine opens
    // the cycle (see below); frames outside a cycle never accumulate.
    const wasInCycle = this.stateMachine.isCycleInProgress();
    const completedRep = this.stateMachine.update(signal, topGate ?? false, trackingConfidence, timestampMs);
    const currentPhase = this.stateMachine.getCurrentPhase();
    if (!wasInCycle && this.stateMachine.isCycleInProgress()) {
      this.bag = emptyBag();
    }
    if (
      currentPhase === 'descending' ||
      currentPhase === 'bottom' ||
      currentPhase === 'ascending' ||
      completedRep
    ) {
      this.accumulateBag(m, aspectRatio);
    }
    this.prevPhase = currentPhase;

    if (completedRep) {
      this.decorateRep(completedRep, this.bag);
      this.currentRepViewVotes.push(side);
      this.completedRepViews.push(majorityFormView(this.currentRepViewVotes));
      this.currentRepViewVotes = [];
      this.completedReps.push(completedRep);
      this.bag = emptyBag();
    } else if (
      currentPhase === 'descending' ||
      currentPhase === 'bottom' ||
      currentPhase === 'ascending'
    ) {
      this.currentRepViewVotes.push(side);
    }

    let isReady = true;
    let readinessReason: string | undefined;
    if (this.supportedCameraViews.length === 1 && this.supportedCameraViews[0] === 'side' && side === 'front') {
      isReady = false;
      readinessReason = 'Position camera at a 90° side profile.';
    } else if (
      this.supportedCameraViews.length === 1 &&
      this.supportedCameraViews[0] === 'front' &&
      (side === 'left' || side === 'right')
    ) {
      isReady = false;
      readinessReason = 'Position camera facing you, square-on.';
    } else if (trackingConfidence < 0.6) {
      isReady = false;
      readinessReason = 'Improve lighting or adjust distance to improve tracking.';
    }
    if (isReady) {
      const block = this.readinessBlock(m);
      if (block) {
        isReady = false;
        readinessReason = block;
      }
    }

    const minSignal = this.stateMachine.getCurrentRepMinSignal();
    const activeCue = this.feedbackEngine.evaluate({
      exerciseId: this.exerciseId,
      phase: currentPhase,
      currentKneeAngleDeg: m.kneeAngleDeg,
      minKneeAngleDeg: null,
      currentHipAngleDeg: m.hipAngleDeg,
      minHipAngleDeg: null,
      currentElbowAngleDeg: m.elbowAngleDeg,
      minElbowAngleDeg: this.bag.minElbow < Infinity ? this.bag.minElbow : null,
      wristHeightRatio: m.wristHeightRatio,
      bodyLineDeviationDeg:
        m.bodyLineAngleDeg !== null ? Math.abs(180 - m.bodyLineAngleDeg) : null,
      torsoInclinationDeg: m.torsoInclinationDeg,
      trackingConfidence,
      feetVisible: isLandmarkReliable(foot),
      anklesVisible: isLandmarkReliable(ankle),
      sideViewDetected: !this.currentRepConfidentlyFront(),
      depthTargetDeg: 0,
      currentRepNumber: this.completedReps.filter((r) => r.isValid).length,
      timestampMs,
    });

    const hud = this.hudFields(m, minSignal);
    return {
      phase: currentPhase,
      activeCue,
      completedRep,
      currentKneeAngleDeg: hud.currentKneeAngleDeg ?? null,
      minKneeAngleDeg: hud.minKneeAngleDeg ?? null,
      currentHipAngleDeg: hud.currentHipAngleDeg ?? null,
      minHipAngleDeg: hud.minHipAngleDeg ?? null,
      torsoInclinationDeg: m.torsoInclinationDeg !== null ? Math.round(m.torsoInclinationDeg) : null,
      detectedSide: side,
      trackingConfidence,
      readiness: { isReady, reason: readinessReason },
    };
  }

  finishSet(workoutId?: string, setIndex?: number): FormSessionSummary {
    const now = Date.now();
    const durationSeconds = Math.max(1, Math.round((now - this.sessionStartTimeMs) / 1000));
    const validReps = this.completedReps.filter((r) => r.isValid);

    const avgConfidence =
      this.trackingConfidences.length > 0
        ? Math.round(
            (this.trackingConfidences.reduce((a, b) => a + b, 0) / this.trackingConfidences.length) *
              100
          ) / 100
        : 0;

    const totalRepTime = validReps.reduce((acc, r) => acc + r.durationSeconds, 0);
    const avgRepDurationSeconds =
      validReps.length > 0 ? Math.round((totalRepTime / validReps.length) * 10) / 10 : 0;

    const observations: FormObservation[] = [
      ...this.feedbackEngine.getAggregatedObservations(),
      ...this.aggregateObservations(this.completedReps),
    ];

    const sessionView: DetectedSide =
      this.completedRepViews.length > 0
        ? majorityFormView(this.completedRepViews)
        : this.currentRepViewVotes.length > 0
          ? majorityFormView(this.currentRepViewVotes)
          : this.detectedSide;

    return {
      id: safeRandomId(),
      workoutId,
      setIndex,
      exerciseId: this.exerciseId,
      exerciseName: this.exerciseName,
      analyzerVersion: this.analyzerVersion,
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
