/**
 * ASCEND Form Coach — Movement Classifier (auto-detect)
 *
 * Decides WHICH supported exercise a tracked landmark stream shows,
 * before any analyzer grades it. It extends the D6 movement-signature
 * machinery (originally built so the squat analyzer would stop grading
 * hip hinges as squats) into a routing step over the same evidence:
 *
 *  - Angle evidence (profile frames only): a frame is HINGE evidence
 *    when the hip folds deeply while the knee stays comparatively
 *    straight; DEEP evidence when the knee reaches squat-depth flexion
 *    without hinge dominance — the D6 definitions, unchanged.
 *  - Grip evidence: on a bent (hinge or deep) frame, where the hands
 *    are separates lifts the angles cannot. A deadlift's hands hang
 *    below the hips holding the bar; a back squat's hands sit up at
 *    shoulder height holding the bar on the back. A deep-knee deadlift
 *    (the owner's WA0002: bottom knee 71° / hip 63° — squat geometry by
 *    angles alone) is a deadlift by its grip. When the wrist is not
 *    measurable, the frame falls back to its angle class.
 *
 * Verdicts are deliberately conservative: 'deadlift' and 'squat' are
 * POSITIVE findings on dominating evidence; 'unknown' means the
 * movement was measurable but matched neither pattern; and
 * 'insufficient_evidence' means there was not enough measurable
 * movement to judge at all. Callers must never force an analyzer on
 * the last two.
 */

import { NormalizedLandmark, PoseLandmarkIndex, DetectedSide } from '../../models/pose.types';
import { FormExerciseId } from '../../analyzers/ExerciseAnalyzer';
import {
  calculateJointAngle,
  isLandmarkReliable,
} from './LandmarkGeometry';

export type DetectedExercise = FormExerciseId | 'unknown' | 'insufficient_evidence';

export interface ClassificationEvidence {
  /** Frames offered to the classifier. */
  framesProcessed: number;
  /** Frames carrying a detected pose. */
  framesTracked: number;
  /** Profile-view frames where both knee and hip angles were measurable. */
  assessedFrames: number;
  /** Bent frames matching the hip-hinge angle pattern. */
  hingeFrames: number;
  /** Bent frames matching the squat-depth knee pattern. */
  deepKneeFrames: number;
  /** Bent frames whose total evidence (angles + grip) points to deadlift. */
  deadliftFrames: number;
  /** Bent frames whose total evidence points to squat. */
  squatFrames: number;
}

export interface ClassificationResult {
  exercise: DetectedExercise;
  evidence: ClassificationEvidence;
}

// Thresholds mirror the D6 signature rules so the classifier and the
// squat analyzer's own assessment agree on the same stream: hinge
// dominance at 0.7, squat at 0.5, with per-kind and total minima so a
// handful of frames can never produce a confident call.
const HINGE_HIP_MAX_DEG = 98;
const HINGE_KNEE_HIP_MIN_DIFF_DEG = 35;
const DEEP_KNEE_MAX_DEG = 110;
const CLASSIFY_MIN_ASSESSED_FRAMES = 20;
const CLASSIFY_MIN_EVIDENCE_FRAMES = 8;
const CLASSIFY_MIN_KIND_FRAMES = 5;
const DEADLIFT_SHARE = 0.7;
const SQUAT_SHARE = 0.5;
/** Hand counts as "high" (bar on back) when it sits in the top 35% of
 * the shoulder→hip vertical span; "low" (deadlift grip) below the hip. */
const HAND_HIGH_TORSO_FRACTION = 0.35;

export class MovementClassifier {
  private framesProcessed = 0;
  private framesTracked = 0;
  private assessedFrames = 0;
  private hingeFrames = 0;
  private deepKneeFrames = 0;
  private deadliftFrames = 0;
  private squatFrames = 0;

  reset(): void {
    this.framesProcessed = 0;
    this.framesTracked = 0;
    this.assessedFrames = 0;
    this.hingeFrames = 0;
    this.deepKneeFrames = 0;
    this.deadliftFrames = 0;
    this.squatFrames = 0;
  }

  getTrackingStats(): { framesProcessed: number; framesTracked: number } {
    return { framesProcessed: this.framesProcessed, framesTracked: this.framesTracked };
  }

  getEvidence(): ClassificationEvidence {
    return {
      framesProcessed: this.framesProcessed,
      framesTracked: this.framesTracked,
      assessedFrames: this.assessedFrames,
      hingeFrames: this.hingeFrames,
      deepKneeFrames: this.deepKneeFrames,
      deadliftFrames: this.deadliftFrames,
      squatFrames: this.squatFrames,
    };
  }

  /** Same profile/front discrimination the analyzers use. */
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
    aspectRatio = 1.0
  ): void {
    this.framesProcessed += 1;
    if (!landmarks || landmarks.length < 33) return;
    this.framesTracked += 1;

    const side = this.determineSide(landmarks);
    // The signature, like every measurement here, is a side-view
    // measurement: front projections distort both angles and the grip
    // test, so front/unknown frames never become evidence.
    if (side !== 'left' && side !== 'right') return;

    const preferLeft = side === 'left';
    const hip = landmarks[preferLeft ? PoseLandmarkIndex.LEFT_HIP : PoseLandmarkIndex.RIGHT_HIP];
    const knee = landmarks[preferLeft ? PoseLandmarkIndex.LEFT_KNEE : PoseLandmarkIndex.RIGHT_KNEE];
    const ankle = landmarks[preferLeft ? PoseLandmarkIndex.LEFT_ANKLE : PoseLandmarkIndex.RIGHT_ANKLE];
    const shoulder =
      landmarks[preferLeft ? PoseLandmarkIndex.LEFT_SHOULDER : PoseLandmarkIndex.RIGHT_SHOULDER];
    const wrist = landmarks[preferLeft ? PoseLandmarkIndex.LEFT_WRIST : PoseLandmarkIndex.RIGHT_WRIST];

    const kneeAngleDeg = calculateJointAngle(hip, knee, ankle, aspectRatio);
    if (kneeAngleDeg === null) return;
    const hipAngleDeg = calculateJointAngle(shoulder, hip, knee, aspectRatio);
    if (hipAngleDeg === null) return;

    this.assessedFrames += 1;

    const isHinge =
      hipAngleDeg <= HINGE_HIP_MAX_DEG &&
      kneeAngleDeg - hipAngleDeg >= HINGE_KNEE_HIP_MIN_DIFF_DEG;
    const isDeep = !isHinge && kneeAngleDeg <= DEEP_KNEE_MAX_DEG;
    if (isHinge) this.hingeFrames += 1;
    if (isDeep) this.deepKneeFrames += 1;
    if (!isHinge && !isDeep) return;

    // Grip evidence on bent frames: where is the hand relative to the
    // torso? Below the hip joint = holding a bar at arm's length
    // (deadlift); up at shoulder height = holding a bar on the back
    // (squat). Between the two, or unmeasurable, the angle class rules.
    let hand: 'low' | 'high' | 'neutral' = 'neutral';
    if (isLandmarkReliable(wrist) && isLandmarkReliable(shoulder) && isLandmarkReliable(hip)) {
      if (wrist.y > hip.y) {
        hand = 'low';
      } else if (wrist.y < shoulder.y + HAND_HIGH_TORSO_FRACTION * (hip.y - shoulder.y)) {
        hand = 'high';
      }
    }

    if (hand === 'low') {
      this.deadliftFrames += 1;
    } else if (hand === 'high') {
      this.squatFrames += 1;
    } else if (isHinge) {
      this.deadliftFrames += 1;
    } else {
      this.squatFrames += 1;
    }
  }

  /**
   * The verdict over everything fed so far. Safe to call mid-stream
   * (the UI uses it as a leaning indicator) and at the end (routing).
   */
  classify(): ClassificationResult {
    const evidence = this.getEvidence();
    const totalEvidence = this.deadliftFrames + this.squatFrames;

    let exercise: DetectedExercise = 'unknown';
    if (
      this.assessedFrames < CLASSIFY_MIN_ASSESSED_FRAMES ||
      totalEvidence < CLASSIFY_MIN_EVIDENCE_FRAMES
    ) {
      exercise = 'insufficient_evidence';
    } else if (
      this.deadliftFrames >= CLASSIFY_MIN_KIND_FRAMES &&
      this.deadliftFrames / totalEvidence >= DEADLIFT_SHARE
    ) {
      exercise = 'deadlift';
    } else if (
      this.squatFrames >= CLASSIFY_MIN_KIND_FRAMES &&
      this.squatFrames / totalEvidence >= SQUAT_SHARE
    ) {
      exercise = 'squat';
    }
    return { exercise, evidence };
  }
}
