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
 *  - Grip balance (stream level): a bar stays on the back for the
 *    WHOLE set — between reps too — while a deadlift's hands are
 *    never up at shoulder height. When the bent-frame evidence is
 *    inconclusive because the set's bottoms were under-sampled (the
 *    owner's WA0011: ~5 fast reps, only 3 frames at squat depth in
 *    the whole stream), repeated clear knee flexion plus a set-long
 *    dominance of high hands over low hands still identifies a squat.
 *    The flexion requirement is what keeps a standing bystander with
 *    raised hands (WA0013's spotter) out of this path.
 *
 * Batch A+B (2026-11-05) extends the same evidence approach to the
 * rest of the catalogue. The new signals are WHICH SEGMENTS MOVE and
 * WHERE THE BODY IS, measured on the same tracked stream:
 *  - Orientation: a near-horizontal shoulder→hip line marks the
 *    floor/bench family — but only when the body is actually down
 *    (near-straight shoulder–hip–ankle line, or wrists driven above
 *    the shoulder line at lockout); a strict row's torso reads just
 *    as horizontal while its body line folds at the hip, and it must
 *    fall through to the hinge rules. Inside the family, body travel
 *    separates push-ups (the whole body rises and falls with the
 *    elbows) from bench press (shoulders and hips stay on the bench;
 *    only the arms cycle), and a near-static horizontal stream is a
 *    plank.
 *  - Split stance: lunges separate the feet front-to-back and flex
 *    one knee far more than the other; squats keep the feet together
 *    and flex both knees together. Split-stance dominance is judged
 *    before the squat/deadlift verdicts, because a dumbbell lunge's
 *    bent frames would otherwise fall to angle/grip classes they do
 *    not belong to.
 *  - Held hinge + arm cycles: a bent-over row folds the hip like a
 *    deadlift but NEVER extends it back to standing — the hips stay
 *    parked while the elbows cycle. A deadlift always stands the hip
 *    back up (≥ 145°), so "hinge evidence, elbow cycles, zero hip
 *    extension" is a row, judged before the deadlift verdict.
 *  - Upright arm patterns (either view): wrists driven overhead with
 *    elbow cycles = overhead press; elbow flexion/extension cycles
 *    with the wrists never overhead = bicep curl; straight-elbow arcs
 *    that lift the wrists from hip height to shoulder height but
 *    never overhead = lateral raise. (A front raise projects almost
 *    identically to a lateral raise in 2D and reads as one — a known
 *    limit of the camera, not a claim about the lifter.)
 *  - Squat variants: on bent frames the grip refines a squat verdict —
 *    hands together at the chest = goblet; hands high with the elbows
 *    up at shoulder height = front squat (front rack); hands high
 *    with the elbows dropped = barbell back squat (the default).
 *
 * Verdicts are deliberately conservative: a named exercise is a
 * POSITIVE finding on dominating evidence; 'unknown' means the
 * movement was measurable but matched no supported pattern; and
 * 'insufficient_evidence' means there was not enough measurable
 * movement to judge at all. Callers must never force an analyzer on
 * the last two.
 *
 * Measurement floor: the classifier accumulates evidence over many
 * frames, so it measures at a lower landmark-visibility floor (0.3)
 * than the analyzers' per-rep gates (0.5). On real gym footage the
 * ankle is occluded by plates on a large share of frames (the
 * deadlift setup especially); at the strict floor most of a set is
 * unmeasurable and no honest verdict is possible at all. Dominance
 * thresholds over the accumulated evidence — not per-frame purity —
 * are what keep the verdict honest. Frames whose knee angle is
 * anatomically implausible for either lift (< 25°) are landmark
 * glitches and never become evidence.
 */

import { NormalizedLandmark, PoseLandmarkIndex, DetectedSide } from '../../models/pose.types';
import { FormExerciseId } from '../../analyzers/ExerciseAnalyzer';
import {
  calculateDistance,
  calculateJointAngle,
  calculateSegmentInclination,
  isLandmarkReliable,
} from './LandmarkGeometry';

export type DetectedExercise = FormExerciseId | 'unknown' | 'insufficient_evidence';

/** Squat grip variants the classifier can positively identify. */
export type SquatVariant = 'goblet' | 'front';

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
  /** Assessed frames with clear knee flexion (≤ 135°) — flexion cycles. */
  flexedFrames: number;
  /** Assessed frames with hands measured high (bar-on-back position). */
  handHighFrames: number;
  /** Assessed frames with hands measured low (hanging grip position). */
  handLowFrames: number;
  /** Front-view frames (both shoulders/hips visible, facing camera). */
  frontFrames: number;
  /** Profile frames where torso inclination was measurable. */
  orientationFrames: number;
  /** Orientation frames with a near-horizontal shoulder→hip line. */
  horizontalFrames: number;
  /** Horizontal-torso frames where the shoulder–hip–ankle line is
   * also near-straight — the body itself is lying down (push-up,
   * plank, bench with legs extended). A bent-over row's torso is
   * just as horizontal, but its body line folds at the hip (~95°),
   * so it never lands here. */
  horizontalStraightFrames: number;
  /** Horizontal-torso frames with the wrist driven well above the
   * shoulder line — a bench press's lockout. A row's wrists stay at
   * or below shoulder height for the whole set. */
  wristAboveFrames: number;
  /** Assessed frames with the feet split front-to-back (split stance). */
  splitStanceFrames: number;
  /** Assessed frames with one knee flexed far more than the other. */
  asymFlexFrames: number;
  /** Assessed frames with the hip extended to standing (≥ 145°). */
  hipExtensionFrames: number;
  /** Frames (either view) where an elbow angle was measurable. */
  armAssessedFrames: number;
  /** Arm frames with a deeply flexed elbow (≤ 105°). */
  elbowFlexFrames: number;
  /** Arm frames with a near-extended elbow (≥ 150°). */
  elbowExtFrames: number;
  /** Arm frames with the wrist driven overhead (≥ 0.55 torso lengths
   * above shoulder height). */
  overheadFrames: number;
  /** Arm frames with the wrist in the shoulder-height band. */
  shoulderBandFrames: number;
  /** Arm frames measured while the torso was upright and hips straight. */
  uprightArmFrames: number;
  /** Bent frames with the hands together at the chest (goblet grip). */
  gobletFrames: number;
  /** Bent frames with hands high and elbows up (front-rack grip). */
  frontRackFrames: number;
  /** Bent frames with hands high and elbows dropped (back-squat grip). */
  backGripFrames: number;
}

export interface ClassificationResult {
  exercise: DetectedExercise;
  evidence: ClassificationEvidence;
  /** Set only when the verdict is 'squat' and the grip evidence
   * confidently identifies a variant; null = plain back squat. */
  squatVariant: SquatVariant | null;
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
/** Visibility floor for the classifier's own angle measurements —
 * lower than the analyzers' gates; see the module header. */
const CLASSIFY_MIN_VISIBILITY = 0.3;
/** Knee angles below this are landmark glitches, not human squats. */
const KNEE_GLITCH_FLOOR_DEG = 25;
/** Grip-balance path: clear knee flexion (well past standing noise)
 * plus set-long high-hand dominance identifies an under-sampled
 * squat set. See the module header for why both halves are required. */
const FLEXED_KNEE_MAX_DEG = 135;
const GRIP_PATH_MIN_FLEXED_FRAMES = 4;
const GRIP_PATH_MIN_HAND_FRAMES = 8;
const GRIP_PATH_SHARE = 0.65;

// ── Batch A+B evidence thresholds ────────────────────────────────
/** Torso inclination at/above which the body counts as horizontal. */
const HORIZONTAL_TORSO_MIN_DEG = 65;
const HORIZONTAL_MIN_FRAMES = 15;
const HORIZONTAL_SHARE = 0.6;
/** On horizontal frames: elbow flexion cycles that move the whole
 * body (shoulder travel) are push-ups; cycles over a still body are
 * bench press; neither is a plank hold. */
const HORIZONTAL_MIN_ELBOW_FLEX_FRAMES = 4;
const BODY_TRAVEL_MIN = 0.04;
const PLANK_MAX_ELBOW_RANGE_DEG = 20;
const PLANK_MIN_FRAMES = 25;
/** The horizontal family is entered only when the body is actually
 * down: a near-straight shoulder–hip–ankle line on the horizontal
 * frames, or wrists driven above the shoulder line (bench lockout).
 * A held hinge (row) satisfies neither and falls through to the
 * hinge rules below. */
const BODY_LINE_STRAIGHT_MIN_DEG = 160;
const HORIZONTAL_MIN_STRAIGHT_FRAMES = 10;
const WRIST_ABOVE_MIN = 0.5;
const HORIZONTAL_MIN_WRIST_ABOVE_FRAMES = 4;
/** Lunge: split stance + asymmetric flexion dominating the stream. */
const LUNGE_MIN_SPLIT_FRAMES = 8;
const LUNGE_MIN_ASYM_FRAMES = 6;
const LUNGE_SPLIT_SHARE = 0.35;
const SPLIT_ANKLE_MIN = 0.15;
const SPLIT_ANKLE_LEG_FRACTION = 0.5;
const ASYM_KNEE_MIN_DIFF_DEG = 30;
/** The flexed knee must be clearly bent (≤ 135°, the same "clear
 * flexion" line the grip path uses) — not necessarily deep. A
 * shallow lunge is still a lunge PATTERN: the stance identifies the
 * family, and the lunge analyzer is what reports that no descent
 * reached depth. Without this, a shallow split-stance descent falls
 * into the hinge pile and gets graded as a deadlift. */
const ASYM_KNEE_FLEXED_MAX_DEG = 135;
/** Row: hinge dominance with elbow cycles and NO hip extension —
 * a deadlift always stands the hip back up past this angle. */
const ROW_MIN_HINGE_SHARE = 0.7;
const ROW_MIN_ELBOW_CYCLE_FRAMES = 6;
const HIP_EXTENSION_MIN_DEG = 145;
/** Upright arm patterns. Wrist height is measured in torso lengths
 * relative to shoulder height: 0 = at the shoulder, positive above. */
const WRIST_OVERHEAD_MIN = 0.55;
const WRIST_BAND_MIN = -0.15;
const WRIST_BAND_MAX = 0.4;
const ELBOW_FLEXED_MAX_DEG = 105;
const ELBOW_EXTENDED_MIN_DEG = 150;
const UPRIGHT_TORSO_MAX_DEG = 30;
const ARM_MIN_UPRIGHT_FRAMES = 12;
const ARM_UPRIGHT_SHARE = 0.5;
const PRESS_MIN_OVERHEAD_FRAMES = 6;
const PRESS_MIN_ELBOW_FLEX_FRAMES = 5;
const CURL_MIN_CYCLE_FRAMES = 6;
const CURL_MAX_OVERHEAD_FRAMES = 2;
/** Arm patterns are judged only when the legs stay quiet. A leg
 * exercise whose deep frames were lost to occlusion (the owner's
 * WA0011: tracked top halves of squat reps — knees clearly flexing
 * on 11 frames, hip extending on 37, elbows noisy behind plates)
 * otherwise satisfies the curl gates on incidental arm noise and
 * earns a confident WRONG verdict. A genuine curl/press/raise set —
 * filmed full-body or waist-up — keeps the knees near-straight
 * (flexed ≈ 0) or out of frame entirely. */
const ARM_MAX_LEG_FLEX_FRAMES = 4;
const RAISE_MIN_EXT_FRAMES = 12;
const RAISE_MAX_FLEX_FRAMES = 2;
const RAISE_MIN_BAND_FRAMES = 6;
const RAISE_MIN_HEIGHT_RANGE = 0.45;
/** Squat variant grip calls need a small pile of agreeing frames. */
const VARIANT_MIN_FRAMES = 5;

export class MovementClassifier {
  private framesProcessed = 0;
  private framesTracked = 0;
  private assessedFrames = 0;
  private hingeFrames = 0;
  private deepKneeFrames = 0;
  private deadliftFrames = 0;
  private squatFrames = 0;
  private flexedFrames = 0;
  private handHighFrames = 0;
  private handLowFrames = 0;
  private frontFrames = 0;
  private orientationFrames = 0;
  private horizontalFrames = 0;
  private horizontalStraightFrames = 0;
  private wristAboveFrames = 0;
  private splitStanceFrames = 0;
  private asymFlexFrames = 0;
  private hipExtensionFrames = 0;
  private armAssessedFrames = 0;
  private elbowFlexFrames = 0;
  private elbowExtFrames = 0;
  private overheadFrames = 0;
  private shoulderBandFrames = 0;
  private uprightArmFrames = 0;
  private gobletFrames = 0;
  private frontRackFrames = 0;
  private backGripFrames = 0;
  // Stream ranges (not evidence counters): judged at classify() time.
  private horizontalElbowFlexFrames = 0;
  private horizontalElbowMin = 180;
  private horizontalElbowMax = 0;
  private horizontalShoulderMinY = Infinity;
  private horizontalShoulderMaxY = -Infinity;
  private wristHeightMin = Infinity;
  private wristHeightMax = -Infinity;

  reset(): void {
    this.framesProcessed = 0;
    this.framesTracked = 0;
    this.assessedFrames = 0;
    this.hingeFrames = 0;
    this.deepKneeFrames = 0;
    this.deadliftFrames = 0;
    this.squatFrames = 0;
    this.flexedFrames = 0;
    this.handHighFrames = 0;
    this.handLowFrames = 0;
    this.frontFrames = 0;
    this.orientationFrames = 0;
    this.horizontalFrames = 0;
    this.horizontalStraightFrames = 0;
    this.wristAboveFrames = 0;
    this.splitStanceFrames = 0;
    this.asymFlexFrames = 0;
    this.hipExtensionFrames = 0;
    this.armAssessedFrames = 0;
    this.elbowFlexFrames = 0;
    this.elbowExtFrames = 0;
    this.overheadFrames = 0;
    this.shoulderBandFrames = 0;
    this.uprightArmFrames = 0;
    this.gobletFrames = 0;
    this.frontRackFrames = 0;
    this.backGripFrames = 0;
    this.horizontalElbowFlexFrames = 0;
    this.horizontalElbowMin = 180;
    this.horizontalElbowMax = 0;
    this.horizontalShoulderMinY = Infinity;
    this.horizontalShoulderMaxY = -Infinity;
    this.wristHeightMin = Infinity;
    this.wristHeightMax = -Infinity;
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
      flexedFrames: this.flexedFrames,
      handHighFrames: this.handHighFrames,
      handLowFrames: this.handLowFrames,
      frontFrames: this.frontFrames,
      orientationFrames: this.orientationFrames,
      horizontalFrames: this.horizontalFrames,
      horizontalStraightFrames: this.horizontalStraightFrames,
      wristAboveFrames: this.wristAboveFrames,
      splitStanceFrames: this.splitStanceFrames,
      asymFlexFrames: this.asymFlexFrames,
      hipExtensionFrames: this.hipExtensionFrames,
      armAssessedFrames: this.armAssessedFrames,
      elbowFlexFrames: this.elbowFlexFrames,
      elbowExtFrames: this.elbowExtFrames,
      overheadFrames: this.overheadFrames,
      shoulderBandFrames: this.shoulderBandFrames,
      uprightArmFrames: this.uprightArmFrames,
      gobletFrames: this.gobletFrames,
      frontRackFrames: this.frontRackFrames,
      backGripFrames: this.backGripFrames,
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

  /**
   * Orientation + arm evidence from one frame's primary side. Runs
   * independently of the leg measurements: an overhead press filmed
   * waist-up, or a bench press with the knees bent out of the leg
   * gates, still owes the classifier its arm evidence. Returns the
   * frame's torso inclination (null when unmeasurable) so callers can
   * file the elbow under the horizontal family when the body is down.
   */
  private processArmEvidence(
    shoulder: NormalizedLandmark,
    hip: NormalizedLandmark,
    elbow: NormalizedLandmark,
    wrist: NormalizedLandmark,
    ankle: NormalizedLandmark,
    hipAngleDeg: number | null,
    aspectRatio: number
  ): void {
    const torsoInclinationDeg = calculateSegmentInclination(
      shoulder,
      hip,
      aspectRatio,
      CLASSIFY_MIN_VISIBILITY
    );
    let isHorizontal = false;
    if (torsoInclinationDeg !== null) {
      this.orientationFrames += 1;
      if (torsoInclinationDeg >= HORIZONTAL_TORSO_MIN_DEG) {
        isHorizontal = true;
        this.horizontalFrames += 1;
        if (shoulder.y < this.horizontalShoulderMinY) this.horizontalShoulderMinY = shoulder.y;
        if (shoulder.y > this.horizontalShoulderMaxY) this.horizontalShoulderMaxY = shoulder.y;
        // Is the BODY down, or only the torso? A lying body's
        // shoulder–hip–ankle line stays near-straight; a hinged
        // lifter's folds at the hip. This is what keeps a strict
        // bent-over row (torso ~80° from vertical) out of the
        // floor/bench family.
        const bodyLineDeg = calculateJointAngle(
          shoulder,
          hip,
          ankle,
          aspectRatio,
          CLASSIFY_MIN_VISIBILITY
        );
        if (bodyLineDeg !== null && bodyLineDeg >= BODY_LINE_STRAIGHT_MIN_DEG) {
          this.horizontalStraightFrames += 1;
        }
      }
    }

    const elbowAngleDeg = calculateJointAngle(
      shoulder,
      elbow,
      wrist,
      aspectRatio,
      CLASSIFY_MIN_VISIBILITY
    );
    if (elbowAngleDeg === null) return;
    this.armAssessedFrames += 1;
    if (elbowAngleDeg <= ELBOW_FLEXED_MAX_DEG) this.elbowFlexFrames += 1;
    if (elbowAngleDeg >= ELBOW_EXTENDED_MIN_DEG) this.elbowExtFrames += 1;
    if (isHorizontal) {
      if (elbowAngleDeg <= ELBOW_FLEXED_MAX_DEG) this.horizontalElbowFlexFrames += 1;
      if (elbowAngleDeg < this.horizontalElbowMin) this.horizontalElbowMin = elbowAngleDeg;
      if (elbowAngleDeg > this.horizontalElbowMax) this.horizontalElbowMax = elbowAngleDeg;
    }

    // Wrist height in torso lengths relative to the shoulder:
    // 0 = wrist at shoulder height, positive = above it.
    const torsoLen = calculateDistance(shoulder, hip, aspectRatio, CLASSIFY_MIN_VISIBILITY);
    if (torsoLen !== null && torsoLen > 1e-6 && isLandmarkReliable(wrist, CLASSIFY_MIN_VISIBILITY)) {
      const h = (shoulder.y - wrist.y) / torsoLen;
      if (h < this.wristHeightMin) this.wristHeightMin = h;
      if (h > this.wristHeightMax) this.wristHeightMax = h;
      if (h >= WRIST_OVERHEAD_MIN) this.overheadFrames += 1;
      if (h >= WRIST_BAND_MIN && h <= WRIST_BAND_MAX) this.shoulderBandFrames += 1;
      // On a horizontal torso, a wrist driven well above the
      // shoulder line is a bench lockout — the second way into the
      // floor/bench family (a bench lifter's bent legs fold the
      // body line, so the straight-line test alone would miss it).
      if (isHorizontal && h >= WRIST_ABOVE_MIN) this.wristAboveFrames += 1;
    }

    if (
      torsoInclinationDeg !== null &&
      torsoInclinationDeg <= UPRIGHT_TORSO_MAX_DEG &&
      (hipAngleDeg === null || hipAngleDeg >= HIP_EXTENSION_MIN_DEG)
    ) {
      this.uprightArmFrames += 1;
    }
  }

  /**
   * Front-view frames: no leg evidence (the D6 semantics — front
   * projections distort knee/hip angles), but the arms are measured
   * in the plane they actually move in from this view: both elbows
   * averaged, wrist height against the shoulder line. This is the
   * only view a lateral raise is visible from at all.
   */
  private processFrontFrame(landmarks: NormalizedLandmark[], aspectRatio: number): void {
    this.frontFrames += 1;
    const sL = landmarks[PoseLandmarkIndex.LEFT_SHOULDER];
    const sR = landmarks[PoseLandmarkIndex.RIGHT_SHOULDER];
    const hL = landmarks[PoseLandmarkIndex.LEFT_HIP];
    const hR = landmarks[PoseLandmarkIndex.RIGHT_HIP];
    if (
      !isLandmarkReliable(sL, CLASSIFY_MIN_VISIBILITY) ||
      !isLandmarkReliable(sR, CLASSIFY_MIN_VISIBILITY) ||
      !isLandmarkReliable(hL, CLASSIFY_MIN_VISIBILITY) ||
      !isLandmarkReliable(hR, CLASSIFY_MIN_VISIBILITY)
    ) {
      return;
    }
    const shoulderMid = { x: (sL.x + sR.x) / 2, y: (sL.y + sR.y) / 2 };
    const hipMid = { x: (hL.x + hR.x) / 2, y: (hL.y + hR.y) / 2 };
    const torsoLen = Math.hypot(
      (shoulderMid.x - hipMid.x) * aspectRatio,
      shoulderMid.y - hipMid.y
    );
    if (torsoLen < 1e-6) return;

    const elbowL = calculateJointAngle(
      sL,
      landmarks[PoseLandmarkIndex.LEFT_ELBOW],
      landmarks[PoseLandmarkIndex.LEFT_WRIST],
      aspectRatio,
      CLASSIFY_MIN_VISIBILITY
    );
    const elbowR = calculateJointAngle(
      sR,
      landmarks[PoseLandmarkIndex.RIGHT_ELBOW],
      landmarks[PoseLandmarkIndex.RIGHT_WRIST],
      aspectRatio,
      CLASSIFY_MIN_VISIBILITY
    );
    const elbows = [elbowL, elbowR].filter((v): v is number => v !== null);
    if (elbows.length === 0) return;
    const elbowAvg = elbows.reduce((a, b) => a + b, 0) / elbows.length;
    this.armAssessedFrames += 1;
    if (elbowAvg <= ELBOW_FLEXED_MAX_DEG) this.elbowFlexFrames += 1;
    if (elbowAvg >= ELBOW_EXTENDED_MIN_DEG) this.elbowExtFrames += 1;

    const wrists = [landmarks[PoseLandmarkIndex.LEFT_WRIST], landmarks[PoseLandmarkIndex.RIGHT_WRIST]]
      .filter((w) => isLandmarkReliable(w, CLASSIFY_MIN_VISIBILITY));
    if (wrists.length > 0) {
      const wristY = wrists.reduce((acc, w) => acc + w.y, 0) / wrists.length;
      const h = (shoulderMid.y - wristY) / torsoLen;
      if (h < this.wristHeightMin) this.wristHeightMin = h;
      if (h > this.wristHeightMax) this.wristHeightMax = h;
      if (h >= WRIST_OVERHEAD_MIN) this.overheadFrames += 1;
      if (h >= WRIST_BAND_MIN && h <= WRIST_BAND_MAX) this.shoulderBandFrames += 1;
    }

    const torsoUpright =
      Math.abs(shoulderMid.x - hipMid.x) * aspectRatio <= 0.3 * torsoLen &&
      shoulderMid.y < hipMid.y;
    if (torsoUpright) this.uprightArmFrames += 1;
  }

  processFrame(
    landmarks: NormalizedLandmark[] | null,
    aspectRatio = 1.0
  ): void {
    this.framesProcessed += 1;
    if (!landmarks || landmarks.length < 33) return;
    this.framesTracked += 1;

    const side = this.determineSide(landmarks);
    // Front frames carry arm evidence only (see processFrontFrame);
    // the angle/grip signature below stays a side-view measurement,
    // exactly as before. 'unknown' frames — where the side could not
    // be called confidently — are measured on the more visible side,
    // the same leniency the analyzers apply.
    if (side === 'front') {
      this.processFrontFrame(landmarks, aspectRatio);
      return;
    }

    const leftVis =
      ((landmarks[PoseLandmarkIndex.LEFT_HIP]?.visibility ?? 0) +
        (landmarks[PoseLandmarkIndex.LEFT_SHOULDER]?.visibility ?? 0)) /
      2;
    const rightVis =
      ((landmarks[PoseLandmarkIndex.RIGHT_HIP]?.visibility ?? 0) +
        (landmarks[PoseLandmarkIndex.RIGHT_SHOULDER]?.visibility ?? 0)) /
      2;
    const preferLeft = side === 'left' || (side === 'unknown' && leftVis >= rightVis);

    const hip = landmarks[preferLeft ? PoseLandmarkIndex.LEFT_HIP : PoseLandmarkIndex.RIGHT_HIP];
    const knee = landmarks[preferLeft ? PoseLandmarkIndex.LEFT_KNEE : PoseLandmarkIndex.RIGHT_KNEE];
    const ankle = landmarks[preferLeft ? PoseLandmarkIndex.LEFT_ANKLE : PoseLandmarkIndex.RIGHT_ANKLE];
    const shoulder =
      landmarks[preferLeft ? PoseLandmarkIndex.LEFT_SHOULDER : PoseLandmarkIndex.RIGHT_SHOULDER];
    const elbow =
      landmarks[preferLeft ? PoseLandmarkIndex.LEFT_ELBOW : PoseLandmarkIndex.RIGHT_ELBOW];
    const wrist = landmarks[preferLeft ? PoseLandmarkIndex.LEFT_WRIST : PoseLandmarkIndex.RIGHT_WRIST];

    const hipAngleDeg = calculateJointAngle(shoulder, hip, knee, aspectRatio, CLASSIFY_MIN_VISIBILITY);
    // Arm/orientation evidence is gathered even when the leg angles
    // below turn out unmeasurable — the batch exercises are judged on
    // their own denominators.
    this.processArmEvidence(shoulder, hip, elbow, wrist, ankle, hipAngleDeg, aspectRatio);

    const kneeAngleDeg = calculateJointAngle(hip, knee, ankle, aspectRatio, CLASSIFY_MIN_VISIBILITY);
    if (kneeAngleDeg === null || kneeAngleDeg < KNEE_GLITCH_FLOOR_DEG) return;
    if (hipAngleDeg === null) return;

    this.assessedFrames += 1;

    if (kneeAngleDeg <= FLEXED_KNEE_MAX_DEG) this.flexedFrames += 1;
    if (hipAngleDeg >= HIP_EXTENSION_MIN_DEG) this.hipExtensionFrames += 1;

    // Split stance / knee asymmetry: the lunge signature. Needs the
    // far leg too — measured when its landmarks clear the same floor.
    const hipOther = landmarks[preferLeft ? PoseLandmarkIndex.RIGHT_HIP : PoseLandmarkIndex.LEFT_HIP];
    const kneeOther = landmarks[preferLeft ? PoseLandmarkIndex.RIGHT_KNEE : PoseLandmarkIndex.LEFT_KNEE];
    const ankleOther =
      landmarks[preferLeft ? PoseLandmarkIndex.RIGHT_ANKLE : PoseLandmarkIndex.LEFT_ANKLE];
    const kneeOtherDeg = calculateJointAngle(
      hipOther,
      kneeOther,
      ankleOther,
      aspectRatio,
      CLASSIFY_MIN_VISIBILITY
    );
    if (kneeOtherDeg !== null) {
      if (
        Math.abs(kneeAngleDeg - kneeOtherDeg) >= ASYM_KNEE_MIN_DIFF_DEG &&
        Math.min(kneeAngleDeg, kneeOtherDeg) <= ASYM_KNEE_FLEXED_MAX_DEG
      ) {
        this.asymFlexFrames += 1;
      }
      const legLenNear = calculateDistance(hip, ankle, aspectRatio, CLASSIFY_MIN_VISIBILITY);
      const legLenFar = calculateDistance(hipOther, ankleOther, aspectRatio, CLASSIFY_MIN_VISIBILITY);
      if (legLenNear !== null && legLenFar !== null) {
        const separation = Math.abs(ankle.x - ankleOther.x) * aspectRatio;
        const legLen = (legLenNear + legLenFar) / 2;
        if (separation >= SPLIT_ANKLE_MIN && separation >= SPLIT_ANKLE_LEG_FRACTION * legLen) {
          this.splitStanceFrames += 1;
        }
      }
    }

    // Hand position on every assessed frame: below the hip joint =
    // holding a bar at arm's length (deadlift); up at shoulder height
    // = holding a bar on the back (squat). Between the two, or
    // unmeasurable, the frame is neutral.
    let hand: 'low' | 'high' | 'neutral' = 'neutral';
    if (isLandmarkReliable(wrist) && isLandmarkReliable(shoulder) && isLandmarkReliable(hip)) {
      if (wrist.y > hip.y) {
        hand = 'low';
      } else if (wrist.y < shoulder.y + HAND_HIGH_TORSO_FRACTION * (hip.y - shoulder.y)) {
        hand = 'high';
      }
    }
    if (hand === 'low') this.handLowFrames += 1;
    if (hand === 'high') this.handHighFrames += 1;

    const isHinge =
      hipAngleDeg <= HINGE_HIP_MAX_DEG &&
      kneeAngleDeg - hipAngleDeg >= HINGE_KNEE_HIP_MIN_DIFF_DEG;
    const isDeep = !isHinge && kneeAngleDeg <= DEEP_KNEE_MAX_DEG;
    if (isHinge) this.hingeFrames += 1;
    if (isDeep) this.deepKneeFrames += 1;
    if (!isHinge && !isDeep) return;

    // Squat-variant grip refinement on bent frames: hands together at
    // the chest (neutral band, held close to the torso) = goblet;
    // hands high with the elbows up at shoulder height = front rack;
    // hands high with dropped elbows = the bar on the back.
    if (
      isLandmarkReliable(wrist) &&
      isLandmarkReliable(elbow) &&
      isLandmarkReliable(shoulder) &&
      isLandmarkReliable(hip)
    ) {
      const span = hip.y - shoulder.y;
      if (hand === 'high') {
        if (elbow.y <= shoulder.y + 0.05 * span) {
          this.frontRackFrames += 1;
        } else {
          this.backGripFrames += 1;
        }
      } else if (
        hand === 'neutral' &&
        wrist.y >= shoulder.y + 0.3 * span &&
        wrist.y <= hip.y - 0.05 * span &&
        Math.abs(wrist.x - hip.x) * aspectRatio <= 0.18
      ) {
        this.gobletFrames += 1;
      }
    }

    // Bent-frame verdict: the grip decides when it is measurable (a
    // deep-knee deadlift is a deadlift by its hands); otherwise the
    // angle class rules.
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
   *
   * Verdict order matters: the batch families are judged on their own
   * evidence BEFORE the squat/deadlift dominance rules wherever their
   * bent frames would otherwise be claimed by the wrong class (a
   * held-hinge row reads as deadlift angles; a dumbbell lunge's deep
   * frames read as squat/deadlift grip classes). The squat/deadlift
   * rules themselves are unchanged, and the upright arm patterns —
   * which produce almost no bent evidence at all — are judged after
   * them, before the grip-balance fallback.
   */
  classify(): ClassificationResult {
    const evidence = this.getEvidence();
    const finish = (exercise: DetectedExercise): ClassificationResult => ({
      exercise,
      evidence,
      squatVariant: exercise === 'squat' ? this.squatVariant() : null,
    });

    // ── Horizontal family (push-up / bench press / plank) ──
    // Entered only when the body is actually down — a near-straight
    // body line on the horizontal frames, or wrists driven above
    // the shoulder line — so a held hinge whose torso merely reads
    // horizontal (a strict row) falls through to the hinge rules.
    if (
      this.horizontalFrames >= HORIZONTAL_MIN_FRAMES &&
      this.orientationFrames > 0 &&
      this.horizontalFrames / this.orientationFrames >= HORIZONTAL_SHARE &&
      (this.horizontalStraightFrames >= HORIZONTAL_MIN_STRAIGHT_FRAMES ||
        this.wristAboveFrames >= HORIZONTAL_MIN_WRIST_ABOVE_FRAMES)
    ) {
      const shoulderTravel =
        this.horizontalShoulderMaxY > this.horizontalShoulderMinY
          ? this.horizontalShoulderMaxY - this.horizontalShoulderMinY
          : 0;
      const elbowRange =
        this.horizontalElbowMax > this.horizontalElbowMin
          ? this.horizontalElbowMax - this.horizontalElbowMin
          : 0;
      if (
        this.horizontalFrames >= PLANK_MIN_FRAMES &&
        elbowRange <= PLANK_MAX_ELBOW_RANGE_DEG &&
        shoulderTravel < BODY_TRAVEL_MIN
      ) {
        // Near-static horizontal hold. Judged BEFORE the cycle split:
        // a forearm plank's elbows sit flexed (~90°) the whole hold,
        // so a flex-frame count alone would misread it as bench
        // press — what separates a hold from a lift is that neither
        // the elbows nor the body actually travel.
        return finish('plank');
      }
      if (this.horizontalElbowFlexFrames >= HORIZONTAL_MIN_ELBOW_FLEX_FRAMES) {
        // The elbows cycle: if the whole body travels with them it is
        // a push-up; over a still body (shoulders parked) it is a
        // bench press.
        return finish(shoulderTravel >= BODY_TRAVEL_MIN ? 'push-up' : 'bench-press');
      }
      // Horizontal and measurable, but no pattern matched: unknown,
      // never a forced upright verdict on a body that stayed down.
      return finish('unknown');
    }

    // ── Lunge (split stance dominates) ──
    // The stance is the family signature; knee asymmetry is the
    // primary descent evidence, but a shallow descent bends both
    // knees together and produces little asymmetry — there, split
    // dominance plus clear flexion of the driving knee still
    // identifies the pattern (and the analyzer judges its depth).
    if (
      this.splitStanceFrames >= LUNGE_MIN_SPLIT_FRAMES &&
      (this.asymFlexFrames >= LUNGE_MIN_ASYM_FRAMES ||
        this.flexedFrames >= LUNGE_MIN_ASYM_FRAMES) &&
      this.assessedFrames > 0 &&
      this.splitStanceFrames / this.assessedFrames >= LUNGE_SPLIT_SHARE
    ) {
      return finish('lunge');
    }

    // ── Bent-over row (held hinge, cycling elbows, hip never extends) ──
    if (
      this.hingeFrames >= CLASSIFY_MIN_EVIDENCE_FRAMES &&
      this.assessedFrames > 0 &&
      this.hingeFrames / this.assessedFrames >= ROW_MIN_HINGE_SHARE &&
      this.hipExtensionFrames === 0 &&
      this.elbowFlexFrames >= ROW_MIN_ELBOW_CYCLE_FRAMES &&
      this.elbowExtFrames >= ROW_MIN_ELBOW_CYCLE_FRAMES
    ) {
      return finish('bent-over-row');
    }

    // ── Squat / deadlift (the original D6 + grip rules, unchanged) ──
    const totalEvidence = this.deadliftFrames + this.squatFrames;
    if (this.assessedFrames >= CLASSIFY_MIN_ASSESSED_FRAMES) {
      if (
        totalEvidence >= CLASSIFY_MIN_EVIDENCE_FRAMES &&
        this.deadliftFrames >= CLASSIFY_MIN_KIND_FRAMES &&
        this.deadliftFrames / totalEvidence >= DEADLIFT_SHARE
      ) {
        return finish('deadlift');
      }
      if (
        totalEvidence >= CLASSIFY_MIN_EVIDENCE_FRAMES &&
        this.squatFrames >= CLASSIFY_MIN_KIND_FRAMES &&
        this.squatFrames / totalEvidence >= SQUAT_SHARE
      ) {
        return finish('squat');
      }
      if (totalEvidence >= CLASSIFY_MIN_EVIDENCE_FRAMES) {
        // Plentiful bent evidence, split between the patterns: the
        // movement was measurable and matched neither — unknown.
        return finish('unknown');
      }
    }

    // ── Upright arm patterns (overhead press / bicep curl / lateral raise) ──
    if (
      this.uprightArmFrames >= ARM_MIN_UPRIGHT_FRAMES &&
      this.armAssessedFrames > 0 &&
      this.uprightArmFrames / this.armAssessedFrames >= ARM_UPRIGHT_SHARE &&
      this.flexedFrames <= ARM_MAX_LEG_FLEX_FRAMES
    ) {
      if (
        this.overheadFrames >= PRESS_MIN_OVERHEAD_FRAMES &&
        this.elbowFlexFrames >= PRESS_MIN_ELBOW_FLEX_FRAMES
      ) {
        return finish('overhead-press');
      }
      if (
        this.elbowFlexFrames >= CURL_MIN_CYCLE_FRAMES &&
        this.elbowExtFrames >= CURL_MIN_CYCLE_FRAMES &&
        this.overheadFrames <= CURL_MAX_OVERHEAD_FRAMES
      ) {
        return finish('bicep-curl');
      }
      const wristHeightRange =
        this.wristHeightMax > this.wristHeightMin
          ? this.wristHeightMax - this.wristHeightMin
          : 0;
      if (
        this.elbowExtFrames >= RAISE_MIN_EXT_FRAMES &&
        this.elbowFlexFrames <= RAISE_MAX_FLEX_FRAMES &&
        this.overheadFrames === 0 &&
        this.shoulderBandFrames >= RAISE_MIN_BAND_FRAMES &&
        wristHeightRange >= RAISE_MIN_HEIGHT_RANGE
      ) {
        return finish('lateral-raise');
      }
    }

    if (this.assessedFrames < CLASSIFY_MIN_ASSESSED_FRAMES) {
      return finish('insufficient_evidence');
    }
    if (this.gripPathSquat()) {
      // Bent evidence too thin to judge (the set's bottoms were
      // under-sampled): the stream-level grip balance decides.
      return finish('squat');
    }
    return finish('insufficient_evidence');
  }

  /** Variant call for a squat verdict, from the bent-frame grip pile. */
  private squatVariant(): SquatVariant | null {
    if (
      this.gobletFrames >= VARIANT_MIN_FRAMES &&
      this.gobletFrames >= this.frontRackFrames &&
      this.gobletFrames >= this.backGripFrames
    ) {
      return 'goblet';
    }
    if (
      this.frontRackFrames >= VARIANT_MIN_FRAMES &&
      this.frontRackFrames > this.backGripFrames &&
      this.frontRackFrames >= this.gobletFrames
    ) {
      return 'front';
    }
    return null;
  }

  /**
   * Grip-balance squat path: repeated clear knee flexion plus a
   * set-long dominance of high hands (bar on the back) over low
   * hands. Both halves are required — flexion alone is just movement,
   * and high hands alone are just a standing person.
   */
  private gripPathSquat(): boolean {
    const handTotal = this.handHighFrames + this.handLowFrames;
    return (
      this.flexedFrames >= GRIP_PATH_MIN_FLEXED_FRAMES &&
      this.handHighFrames >= GRIP_PATH_MIN_HAND_FRAMES &&
      handTotal > 0 &&
      this.handHighFrames / handTotal >= GRIP_PATH_SHARE
    );
  }
}
