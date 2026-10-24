/**
 * form-check.ts — LIVE FORM CHECK v1: pure, unit-testable coaching logic.
 *
 * NO camera, NO DOM, NO network in this module. It consumes pose
 * landmarks (MediaPipe PoseLandmarker 33-point layout, normalized x/y)
 * and returns rep counts, live cues, and a post-set summary. The camera
 * UI (FormCheckSection) is a thin shell around it.
 *
 * HONESTY RULES (non-negotiable, enforced by construction):
 *  - Every frame carries landmark visibility. A frame that fails the
 *    gate produces NO rep, NO cue, and NO score — only the explicit
 *    "can't see you clearly" state. Nothing is ever guessed from
 *    low-confidence landmarks.
 *  - A rep that spans ANY unclear frame is tainted and is NEVER
 *    counted, even if it later returns to the top position.
 *  - A partial rep (never reaches the bottom threshold, or never
 *    returns to the top) is NEVER counted.
 *  - Hysteresis + a 2-frame confirmation rule stop jitter from
 *    double-counting: a threshold crossing must hold for 2 consecutive
 *    clear frames before the phase changes.
 *  - All angle ranges below are COACHING HEURISTICS for a phone camera
 *    at 2D (x/y only; z/depth is ignored — a side view is required, see
 *    the camera-angle gate). They are NOT medical, biomechanical, or
 *    diagnostic measurements, and no cue copy in this module uses
 *    injury or diagnosis language — fatigue/load signals only.
 *  - Pain is never diagnosed or explained away. The UI's "I feel pain"
 *    control calls requestPainStop(); the summary then carries
 *    stoppedForPain + PAIN_REFER_OUT_MESSAGE and nothing else is
 *    inferred from it.
 *  - SIDE-VIEW TRUST: in a side view the far side is occluded by the
 *    body, so the gate trusts whichever side is complete and angles
 *    come from trusted sides only. The far side is don't-care, never
 *    a reason to refuse a good side view.
 *
 * MediaPipe 33-point landmark indices used here (Google AI Edge docs):
 *   11 left shoulder, 12 right shoulder, 13 left elbow, 14 right elbow,
 *   15 left wrist, 16 right wrist, 23 left hip, 24 right hip,
 *   25 left knee, 26 right knee, 27 left ankle, 28 right ankle.
 * In image coordinates y grows DOWNWARD (0 = top of frame).
 */

/** One pose landmark: normalized x/y (0–1) + optional visibility (0–1). */
export interface PoseLandmark {
  x: number;
  y: number;
  z?: number;
  /** MediaPipe visibility; absent = unknown → treated as NOT visible. */
  visibility?: number;
}

export interface FormFrame {
  landmarks: PoseLandmark[];
  /** Monotonic timestamp in ms (performance.now() or video time). */
  timestampMs: number;
}

export type LiftId = 'squat' | 'bench' | 'deadlift' | 'overhead-press' | 'barbell-row';

export type UnclearReason = 'low-visibility' | 'occlusion' | 'camera-angle';

/** Body-part group a missing/low-visibility landmark belongs to. */
export type JointGroup = 'shoulders' | 'elbows' | 'wrists' | 'hips' | 'knees' | 'ankles';

/**
 * Exactly why a frame is unclear, with the failing body parts named.
 * outOfFrame = required landmarks not finite at all (joint outside the
 * frame); lowVisibility = present but below the trust floor (dim,
 * blurred, or occluded). For camera-angle both lists are empty — every
 * joint reads fine, the problem is the viewing angle, not the joints.
 * side = which side the lists describe (the better side, see
 * betterSide); null for camera-angle.
 */
export interface UnclearDetail {
  reason: UnclearReason;
  outOfFrame: JointGroup[];
  lowVisibility: JointGroup[];
  side: 'left' | 'right' | null;
}

const JOINT_GROUP_OF: Record<number, JointGroup> = {
  11: 'shoulders',
  12: 'shoulders',
  13: 'elbows',
  14: 'elbows',
  15: 'wrists',
  16: 'wrists',
  23: 'hips',
  24: 'hips',
  25: 'knees',
  26: 'knees',
  27: 'ankles',
  28: 'ankles',
};

/** Landmark index per side for each joint group. */
const SIDE_LANDMARKS: Record<JointGroup, { left: number; right: number }> = {
  shoulders: { left: 11, right: 12 },
  elbows: { left: 13, right: 14 },
  wrists: { left: 15, right: 16 },
  hips: { left: 23, right: 24 },
  knees: { left: 25, right: 26 },
  ankles: { left: 27, right: 28 },
};

type BodySide = 'left' | 'right';

/**
 * Required joint groups for a lift, in required-landmark order,
 * deduplicated. Every lift's required set is symmetric: both sides of
 * each group.
 */
function requiredGroups(liftId: LiftId): JointGroup[] {
  const groups: JointGroup[] = [];
  for (const idx of LIFT_CONFIGS[liftId].requiredLandmarks) {
    const group = JOINT_GROUP_OF[idx];
    if (group && !groups.includes(group)) groups.push(group);
  }
  return groups;
}

/** True when this side's landmark for the group is finite and trusted. */
function sideLandmarkTrusted(landmarks: PoseLandmark[], idx: number): boolean {
  const lm = landmarks[idx];
  return (
    isFiniteLandmark(lm) && lm.visibility !== undefined && lm.visibility >= VISIBILITY_MIN
  );
}

/** How many of the lift's required groups this side has trusted. */
function sideTrustedCount(
  liftId: LiftId,
  landmarks: PoseLandmark[],
  side: BodySide
): number {
  let count = 0;
  for (const group of requiredGroups(liftId)) {
    if (sideLandmarkTrusted(landmarks, SIDE_LANDMARKS[group][side])) count += 1;
  }
  return count;
}

/**
 * The better side: more trusted required groups; left wins ties.
 * On unclear frames the detail lists describe this side only, so a
 * far-side-only failure can never again masquerade as "nothing is
 * visible" — if the better side is complete the frame is clear, and
 * if it is not, its own failures are what the user must fix.
 */
function betterSide(liftId: LiftId, landmarks: PoseLandmark[]): BodySide {
  return sideTrustedCount(liftId, landmarks, 'left') >=
    sideTrustedCount(liftId, landmarks, 'right')
    ? 'left'
    : 'right';
}

/** Why a frame could not be read. UI copy for all three is the same
 *  "can't see you clearly — adjust the camera" state; the reason only
 *  picks the extra hint (move into frame / unblock the view / film
 *  from the side). */
export type FrameStatus = 'clear' | 'unclear';

export type RepPhase = 'top' | 'bottom' | 'ascending' | 'awaiting-top';

export type IssueCode =
  | 'shallow'
  | 'torso-lean'
  | 'hips-first'
  | 'wrist-drift'
  | 'hinge-lost'
  | 'lean-back'
  | 'straight-leg-start';

export interface IssueSummary {
  code: IssueCode;
  count: number;
  /** Fatigue/load language only. Never injury or diagnosis language. */
  message: string;
}

export interface RepRecord {
  index: number;
  /** Smallest primary angle reached during the rep (degrees). */
  depthAngleDeg: number;
  /** True when depthAngleDeg met the lift's depth target. */
  depthGood: boolean;
  /** Bottom-confirmation to top-confirmation duration in seconds. */
  durationSec: number;
  flags: IssueCode[];
}

export interface SetSummary {
  liftId: LiftId;
  endReason: 'completed' | 'pain-stop' | 'cancelled';
  stoppedForPain: boolean;
  /** Refer-out copy shown on pain-stop; empty otherwise. */
  painMessage: string;
  repCount: number;
  reps: RepRecord[];
  depthGoodCount: number;
  /** 0–100, rounded; 0 when no reps were counted. */
  depthConsistencyPct: number;
  /** Median counted-rep duration in seconds, null when no reps. */
  medianTempoSec: number | null;
  /** Mean counted-rep duration in seconds, null when no reps. */
  meanTempoSec: number | null;
  /** Aggregated per-rep flags, most frequent first. */
  issues: IssueSummary[];
  /** Set duration in seconds, null when the set never started. */
  setDurationSec: number | null;
  /**
   * Detection instrumentation, attached by the UI (never the
   * counter): frames fed through detection in this run + mean detect
   * time in ms. Optional because the counter itself never sees
   * detection — the section fills these in at endSet so the summary
   * reports them without needing the debug toggle. Absent on
   * summaries built before this field existed.
   */
  framesProcessed?: number;
  /** Mean detect time in ms; null when no frame was processed. */
  avgDetectMs?: number | null;
}

export interface FrameResult {
  status: FrameStatus;
  unclearReason: UnclearReason | null;
  /** Named unclear detail (null on clear frames). */
  unclearDetail: UnclearDetail | null;
  /** Live cue for clear frames; the unclear copy for unclear frames;
   *  null when there is nothing to say (e.g. resting at the top). */
  liveCue: string | null;
  /** Stable code behind liveCue, so the UI can translate it: the
   *  flag code for a form cue, 'unclear' for unclear frames, null
   *  when there is nothing to say. Additive — liveCue is unchanged. */
  liveCueCode: IssueCode | 'unclear' | null;
  repCount: number;
  phase: RepPhase;
  /** True when this frame completed a counted rep. */
  repCountedThisFrame: boolean;
  /** Computed angles in degrees, null when the frame was unclear. */
  angles: ComputedAngles | null;
  stopped: boolean;
}

export interface ComputedAngles {
  knee: number | null;
  hip: number | null;
  elbow: number | null;
  shoulder: number | null;
  /** Hip→shoulder line vs vertical: 0 = upright, 90 = horizontal. */
  torsoLean: number | null;
}

/** Shown whenever a frame is unclear — the ONLY cue an unclear frame
 *  may ever produce. */
export const UNCLEAR_COPY = "Can't see you clearly — adjust the camera so your full body stays in frame.";

/** Shown on pain-stop. A refer-out, never a diagnosis, never advice
 *  to continue. */
export const PAIN_REFER_OUT_MESSAGE =
  'Set stopped. Rest, and if the pain persists or worries you, talk to a physiotherapist or coach in person — this app cannot diagnose pain or tell you whether it is safe to continue.';

/** Visibility below this = the landmark is not trusted. */
export const VISIBILITY_MIN = 0.5;
/** Consecutive clear frames a threshold crossing must hold to count. */
export const CONFIRM_FRAMES = 2;
/** Consecutive unclear frames after which a partial rep is discarded
 *  outright and the counter waits to re-acquire the top position. */
export const UNCLEAR_RESET_FRAMES = 5;
/** Hysteresis band (degrees) between the bottom threshold and the
 *  angle that starts the ascent phase. */
export const HYSTERESIS_DEG = 15;
/** Side-view gate: if shoulder width exceeds this fraction of torso
 *  length, the camera is seeing the front, not the side, and depth /
 *  hinge angles are meaningless → unclear (camera-angle). */
export const SIDE_VIEW_MAX_RATIO = 0.55;

const LM = {
  shoulderL: 11,
  shoulderR: 12,
  elbowL: 13,
  elbowR: 14,
  wristL: 15,
  wristR: 16,
  hipL: 23,
  hipR: 24,
  kneeL: 25,
  kneeR: 26,
  ankleL: 27,
  ankleR: 28,
} as const;

export type PrimaryAngle = 'knee' | 'hip' | 'elbow';

export interface LiftConfig {
  id: LiftId;
  name: string;
  /** Which angle drives the rep state machine. */
  primaryAngle: PrimaryAngle;
  /** At or above this primary angle = top position (degrees). */
  topThreshold: number;
  /** At or below this primary angle = bottom position (degrees). */
  bottomThreshold: number;
  /** A counted rep is "deep enough" when its minimum primary angle
   *  is at or below this (degrees). Shallower = counted, but flagged. */
  depthTarget: number;
  /** Landmark indices that must ALL be visible for a clear frame. */
  requiredLandmarks: readonly number[];
  /** What the camera must show (shown in the UI before starting). */
  cameraHint: string;
  /** Plain-words definition of the angles for this lift. */
  angleNotes: string;
}

/**
 * PER-LIFT ANGLE TABLE — coaching heuristics, NOT medical thresholds.
 *
 * How to read it: the primary angle is 180° at full extension and
 * shrinks as the joint bends. A rep = top → bottom (held 2 frames) →
 * top (held 2 frames). Depth target is stricter than the bottom
 * threshold on purpose: a rep that bottoms out between the two still
 * counts, but is flagged 'shallow' so the summary stays honest.
 *
 *  squat:         knee = hip–knee–ankle (both sides averaged).
 *                 hip = shoulder–hip–knee; torsoLean = hip→shoulder
 *                 vs vertical. Top knee ≥160, bottom ≤120, deep ≤100.
 *                 Torso lean >45° at the bottom flags 'torso-lean'.
 *  bench press:   elbow = shoulder–elbow–wrist (both sides averaged).
 *                 Top ≥150, bottom ≤110, bar-to-chest proxy ≤90.
 *                 Near lockout (elbow ≥130° while ascending), a wrist
 *                 sitting sideways off the shoulder line by more than
 *                 40% of torso length flags 'wrist-drift'. Torso length
 *                 (not shoulder width) is the normalizer because in a
 *                 side view the shoulders overlap and shoulder width
 *                 collapses toward zero, which would flag every rep.
 *  deadlift:      hip = shoulder–hip–knee (primary); knee secondary.
 *                 Top hip ≥160, bottom ≤100, set-up deep ≤90.
 *                 Hips rising while knees stay bent flags 'hips-first';
 *                 knees near-straight at the set-up flags
 *                 'straight-leg-start'.
 *  overhead press: elbow = shoulder–elbow–wrist (primary).
 *                 Top (lockout) ≥160, bottom (rack) ≤115, deep ≤100.
 *                 Torso lean >20° at lockout flags 'lean-back'.
 *  barbell row:   elbow = shoulder–elbow–wrist (primary; straight arm
 *                 at the hang, bent at the pull). Top ≥150, bottom
 *                 (pull) ≤110, pull deep ≤90. Hip angle rising above
 *                 150° during the pull flags 'hinge-lost'.
 */
export const LIFT_CONFIGS: Record<LiftId, LiftConfig> = {
  squat: {
    id: 'squat',
    name: 'Squat',
    primaryAngle: 'knee',
    topThreshold: 160,
    bottomThreshold: 120,
    depthTarget: 100,
    requiredLandmarks: [11, 12, 23, 24, 25, 26, 27, 28],
    cameraHint: 'Film from the side, full body in frame, feet to head.',
    angleNotes: 'Knee angle = hip–knee–ankle. Hip angle = shoulder–hip–knee. Torso lean = hip→shoulder vs vertical.',
  },
  bench: {
    id: 'bench',
    name: 'Bench Press',
    primaryAngle: 'elbow',
    topThreshold: 150,
    bottomThreshold: 110,
    depthTarget: 90,
    requiredLandmarks: [11, 12, 13, 14, 15, 16],
    cameraHint: 'Film from the side of the bench, arms and chest in frame.',
    angleNotes: 'Elbow angle = shoulder–elbow–wrist. Depth proxy: elbow ≤90° means the bar reached the chest.',
  },
  deadlift: {
    id: 'deadlift',
    name: 'Deadlift',
    primaryAngle: 'hip',
    topThreshold: 160,
    bottomThreshold: 100,
    depthTarget: 90,
    requiredLandmarks: [11, 12, 23, 24, 25, 26, 27, 28],
    cameraHint: 'Film from the side, full body in frame, bar path visible.',
    angleNotes: 'Hip angle = shoulder–hip–knee (the hinge). Knee angle = hip–knee–ankle (the leg drive).',
  },
  'overhead-press': {
    id: 'overhead-press',
    name: 'Overhead Press',
    primaryAngle: 'elbow',
    topThreshold: 160,
    bottomThreshold: 115,
    depthTarget: 100,
    requiredLandmarks: [11, 12, 13, 14, 15, 16, 23, 24],
    cameraHint: 'Film from the side, head to hips in frame.',
    angleNotes: 'Elbow angle = shoulder–elbow–wrist. Torso lean = hip→shoulder vs vertical at lockout.',
  },
  'barbell-row': {
    id: 'barbell-row',
    name: 'Barbell Row',
    primaryAngle: 'elbow',
    topThreshold: 150,
    bottomThreshold: 110,
    depthTarget: 90,
    requiredLandmarks: [11, 12, 13, 14, 15, 16, 23, 24, 25, 26],
    cameraHint: 'Film from the side, hinged torso and arms in frame.',
    angleNotes: 'Elbow angle = shoulder–elbow–wrist (straight at the hang, bent at the pull). Hip angle = shoulder–hip–knee (the hinge, held through the pull).',
  },
};

export const LIFT_ORDER: LiftId[] = ['squat', 'bench', 'deadlift', 'overhead-press', 'barbell-row'];

const ISSUE_MESSAGES: Record<IssueCode, string> = {
  shallow: 'Some reps stopped short of full depth — try a slightly longer lowering phase next set.',
  'torso-lean': 'Your torso tipped forward on some reps — brace and keep your chest up as you drive.',
  'hips-first': 'Hips rose before the legs drove on some reps — push the floor away and keep hips and chest rising together.',
  'wrist-drift': 'Wrists drifted off the elbow line on some reps — stack wrists over elbows before you press.',
  'hinge-lost': 'You stood up out of the hinge on some pulls — hold the bent-over position through the whole pull.',
  'lean-back': 'You leaned back at lockout on some reps — ribs down, glutes tight, press straight up.',
  'straight-leg-start': 'Legs were nearly straight at the set-up on some reps — bend the knees to set up before you pull.',
};

/** 3-point angle at vertex b, in degrees (0–180), from 2D x/y. */
export function angleAt(a: PoseLandmark, b: PoseLandmark, c: PoseLandmark): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.hypot(v1x, v1y);
  const mag2 = Math.hypot(v2x, v2y);
  if (mag1 === 0 || mag2 === 0) return 180;
  const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function isFiniteLandmark(lm: PoseLandmark | undefined): lm is PoseLandmark {
  return !!lm && Number.isFinite(lm.x) && Number.isFinite(lm.y);
}

/**
 * Mean of the left/right 3-point angles; null when neither side is
 * computable. A side counts only when all three of its landmarks are
 * finite AND trusted (visibility defined and >= the floor): without
 * this, a near-side-gated frame would still average in the occluded
 * far side's estimates. Undefined visibility counts as untrusted,
 * matching the gate — real MediaPipe output always sets it.
 */
function sideMeanAngle(
  landmarks: PoseLandmark[],
  aL: number,
  bL: number,
  cL: number,
  aR: number,
  bR: number,
  cR: number
): number | null {
  const angles: number[] = [];
  const lA = landmarks[aL];
  const lB = landmarks[bL];
  const lC = landmarks[cL];
  if (
    isFiniteLandmark(lA) &&
    isFiniteLandmark(lB) &&
    isFiniteLandmark(lC) &&
    lA.visibility !== undefined &&
    lA.visibility >= VISIBILITY_MIN &&
    lB.visibility !== undefined &&
    lB.visibility >= VISIBILITY_MIN &&
    lC.visibility !== undefined &&
    lC.visibility >= VISIBILITY_MIN
  ) {
    angles.push(angleAt(lA, lB, lC));
  }
  const rA = landmarks[aR];
  const rB = landmarks[bR];
  const rC = landmarks[cR];
  if (
    isFiniteLandmark(rA) &&
    isFiniteLandmark(rB) &&
    isFiniteLandmark(rC) &&
    rA.visibility !== undefined &&
    rA.visibility >= VISIBILITY_MIN &&
    rB.visibility !== undefined &&
    rB.visibility >= VISIBILITY_MIN &&
    rC.visibility !== undefined &&
    rC.visibility >= VISIBILITY_MIN
  ) {
    angles.push(angleAt(rA, rB, rC));
  }
  if (angles.length === 0) return null;
  return angles.reduce((s, v) => s + v, 0) / angles.length;
}

function distance(a: PoseLandmark, b: PoseLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function computeAngles(landmarks: PoseLandmark[]): ComputedAngles {
  const knee = sideMeanAngle(landmarks, LM.hipL, LM.kneeL, LM.ankleL, LM.hipR, LM.kneeR, LM.ankleR);
  const hip = sideMeanAngle(landmarks, LM.shoulderL, LM.hipL, LM.kneeL, LM.shoulderR, LM.hipR, LM.kneeR);
  const elbow = sideMeanAngle(landmarks, LM.shoulderL, LM.elbowL, LM.wristL, LM.shoulderR, LM.elbowR, LM.wristR);
  const shoulder = sideMeanAngle(landmarks, LM.elbowL, LM.shoulderL, LM.hipL, LM.elbowR, LM.shoulderR, LM.hipR);
  let torsoLean: number | null = null;
  const leans: number[] = [];
  for (const [s, h] of [
    [LM.shoulderL, LM.hipL],
    [LM.shoulderR, LM.hipR],
  ] as const) {
    const sh = landmarks[s];
    const hp = landmarks[h];
    if (
      isFiniteLandmark(sh) &&
      isFiniteLandmark(hp) &&
      sh.visibility !== undefined &&
      sh.visibility >= VISIBILITY_MIN &&
      hp.visibility !== undefined &&
      hp.visibility >= VISIBILITY_MIN
    ) {
      // Vector hip→shoulder vs straight up (0,-1); y grows downward.
      const vx = sh.x - hp.x;
      const vy = sh.y - hp.y;
      const mag = Math.hypot(vx, vy);
      if (mag > 0) {
        const cos = Math.max(-1, Math.min(1, -vy / mag));
        leans.push((Math.acos(cos) * 180) / Math.PI);
      }
    }
  }
  if (leans.length > 0) torsoLean = leans.reduce((s, v) => s + v, 0) / leans.length;
  return { knee, hip, elbow, shoulder, torsoLean };
}

/**
 * Gate a frame. Returns null when clear, else the reason it is unclear.
 *
 * SIDE-VIEW TRUST, CORRECTED: in a true side view the far side is
 * occluded by the body, and MediaPipe reports occluded joints below
 * the visibility floor — so requiring BOTH sides made correct side
 * views fail every frame (the user's exact symptom: full body, side
 * view, all four groups "unclear"). The gate now trusts whichever
 * side is complete: a frame is clear when at least one side has every
 * required joint trusted. Angles come from trusted sides only (see
 * sideMeanAngle), so this is not a weakening — the measured angle
 * comes from the visible side, and the far side is don't-care.
 *
 * Order: neither side complete → the better side's failure
 * (occlusion when a better-side landmark is not finite, else
 * low-visibility); some side complete → the side-view ratio gate
 * (skipped when it cannot be evaluated — a front view presents both
 * shoulders, so a missing far shoulder already implies a side view).
 * A frame is NEVER partially trusted: no complete side fails it.
 */
export function gateFrame(liftId: LiftId, landmarks: PoseLandmark[]): UnclearReason | null {
  const groups = requiredGroups(liftId);
  const leftComplete = groups.every((g) =>
    sideLandmarkTrusted(landmarks, SIDE_LANDMARKS[g].left)
  );
  const rightComplete = groups.every((g) =>
    sideLandmarkTrusted(landmarks, SIDE_LANDMARKS[g].right)
  );
  if (!leftComplete && !rightComplete) {
    const side = betterSide(liftId, landmarks);
    for (const group of groups) {
      if (!isFiniteLandmark(landmarks[SIDE_LANDMARKS[group][side]])) return 'occlusion';
    }
    return 'low-visibility';
  }
  // Side-view gate: shoulders far apart relative to torso length means
  // the camera sees the front, where depth/hinge angles are meaningless.
  // It needs both shoulders and both hips finite to evaluate; when it
  // cannot run, the frame stays clear — a front view presents both
  // shoulders, so a missing far shoulder already implies a side view.
  const sL = landmarks[LM.shoulderL];
  const sR = landmarks[LM.shoulderR];
  const hL = landmarks[LM.hipL];
  const hR = landmarks[LM.hipR];
  if (
    isFiniteLandmark(sL) &&
    isFiniteLandmark(sR) &&
    isFiniteLandmark(hL) &&
    isFiniteLandmark(hR)
  ) {
    const shoulderWidth = distance(sL, sR);
    const torsoLen = (distance(sL, hL) + distance(sR, hR)) / 2;
    if (torsoLen > 0 && shoulderWidth > SIDE_VIEW_MAX_RATIO * torsoLen) return 'camera-angle';
  }
  return null;
}

/**
 * Name the failing body parts behind an unclear frame. Returns null
 * when the frame is clear. The lists describe the BETTER side only:
 * blending both sides used to report all four groups whenever the
 * occluded far side failed, even with a perfect near side — so the
 * user could never tell what was actually wrong. Groups follow the
 * lift's required-landmark order. Pure: no thresholds change here —
 * this only DESCRIBES the gate result so the UI can say what is
 * missing instead of a generic "can't see you".
 */
export function unclearDetail(liftId: LiftId, landmarks: PoseLandmark[]): UnclearDetail | null {
  const reason = gateFrame(liftId, landmarks);
  if (reason === null) return null;
  if (reason === 'camera-angle') {
    return { reason, outOfFrame: [], lowVisibility: [], side: null };
  }
  const side = betterSide(liftId, landmarks);
  const outOfFrame: JointGroup[] = [];
  const lowVisibility: JointGroup[] = [];
  const push = (list: JointGroup[], group: JointGroup): void => {
    if (!list.includes(group)) list.push(group);
  };
  for (const group of requiredGroups(liftId)) {
    const lm = landmarks[SIDE_LANDMARKS[group][side]];
    if (!isFiniteLandmark(lm)) push(outOfFrame, group);
    else if (lm.visibility === undefined || lm.visibility < VISIBILITY_MIN)
      push(lowVisibility, group);
  }
  return { reason, outOfFrame, lowVisibility, side };
}

/**
 * DIAGNOSTIC VISIBILITY READOUT (temporary, for phone debugging).
 *
 * Pure mapping from one frame's landmarks + its counter result to the
 * numbers the debug readout displays. It reads ONLY — it never feeds
 * the counter, never changes the gate, and never counts anything.
 *
 * Mapping honesty: the gate has NO per-group aggregate — each joint
 * group is exactly one landmark per side, and the gate's trusted test
 * is `sideLandmarkTrusted` (finite + visibility defined and >= 0.5).
 * So the raw per-landmark visibility values below ARE the gate's
 * inputs, and the trusted flags reuse the gate's own predicate, not
 * a second implementation. A null value means the landmark is not
 * finite or carries no visibility (the gate treats both as untrusted).
 * noPerson is passed in by the section (it alone knows detection
 * found nobody); the counter result carries everything else.
 */
export interface DiagnosticGroupRow {
  group: JointGroup;
  /** Raw visibility of the side's landmark; null when not finite or no visibility. */
  left: number | null;
  right: number | null;
  leftTrusted: boolean;
  rightTrusted: boolean;
}

export type DiagnosticVerdict = 'no-person' | 'clear' | 'unclear';

export interface VisibilityDiagnostic {
  liftId: LiftId;
  groups: DiagnosticGroupRow[];
  leftTrustedCount: number;
  rightTrustedCount: number;
  /** Sides with every required group trusted; empty when neither side is complete. */
  trustedSides: BodySide[];
  /** The gate's better side (left wins ties) — the side unclear detail describes. */
  betterSide: BodySide;
  verdict: DiagnosticVerdict;
  unclearReason: UnclearReason | null;
  /** Rounded primary angle from the frame result, null on unclear frames. */
  primaryAngleDeg: number | null;
  repCount: number;
  phase: RepPhase;
}

export function buildVisibilityDiagnostic(
  liftId: LiftId,
  landmarks: PoseLandmark[],
  frameResult: FrameResult,
  noPerson: boolean
): VisibilityDiagnostic {
  const groups: DiagnosticGroupRow[] = requiredGroups(liftId).map((group) => {
    const lIdx = SIDE_LANDMARKS[group].left;
    const rIdx = SIDE_LANDMARKS[group].right;
    const lLm = landmarks[lIdx];
    const rLm = landmarks[rIdx];
    return {
      group,
      left:
        isFiniteLandmark(lLm) && lLm.visibility !== undefined ? lLm.visibility : null,
      right:
        isFiniteLandmark(rLm) && rLm.visibility !== undefined ? rLm.visibility : null,
      leftTrusted: sideLandmarkTrusted(landmarks, lIdx),
      rightTrusted: sideLandmarkTrusted(landmarks, rIdx),
    };
  });
  const leftTrustedCount = groups.filter((g) => g.leftTrusted).length;
  const rightTrustedCount = groups.filter((g) => g.rightTrusted).length;
  const trustedSides: BodySide[] = [];
  if (leftTrustedCount === groups.length) trustedSides.push('left');
  if (rightTrustedCount === groups.length) trustedSides.push('right');
  const primary = frameResult.angles
    ? frameResult.angles[LIFT_CONFIGS[liftId].primaryAngle]
    : null;
  return {
    liftId,
    groups,
    leftTrustedCount,
    rightTrustedCount,
    trustedSides,
    betterSide: betterSide(liftId, landmarks),
    verdict: noPerson ? 'no-person' : frameResult.status === 'clear' ? 'clear' : 'unclear',
    unclearReason: noPerson ? null : frameResult.unclearReason,
    primaryAngleDeg: primary !== null && primary !== undefined ? Math.round(primary) : null,
    repCount: frameResult.repCount,
    phase: frameResult.phase,
  };
}

function primaryValue(angles: ComputedAngles, primary: PrimaryAngle): number | null {
  return angles[primary];
}

/**
 * Rep-counting state machine for one set of one lift.
 *
 * Plain-words logic:
 *  - Start at the top. The primary angle must drop to the bottom
 *    threshold and STAY there 2 clear frames → bottom (a rep starts).
 *  - From the bottom, the angle must rise past bottom + hysteresis
 *    for 2 clear frames → ascending (ascent samples recorded).
 *  - From ascending, the angle must return to the top threshold and
 *    STAY there 2 clear frames → rep completes. It counts ONLY if no
 *    frame of the rep was unclear (taint rule) — otherwise it is
 *    silently discarded, never counted.
 *  - ANY unclear frame: no cue, no count, rep tainted. 5 unclear
 *    frames in a row: partial rep discarded, phase → 'awaiting-top'
 *    (must re-acquire the top before any new rep can count).
 *  - requestPainStop() ends the set immediately; later frames are
 *    ignored and the summary carries the refer-out message.
 */
export class RepCounter {
  readonly liftId: LiftId;
  readonly config: LiftConfig;
  phase: RepPhase = 'top';
  repCount = 0;
  reps: RepRecord[] = [];
  stopped = false;
  stopReason: 'completed' | 'pain-stop' | 'cancelled' = 'completed';

  private confirmCount = 0;
  private unclearStreak = 0;
  private repTainted = false;
  private repStartMs: number | null = null;
  private minPrimary: number | null = null;
  private repFlags = new Set<IssueCode>();
  private bottomKnee: number | null = null;
  private bottomHip: number | null = null;
  private setStartMs: number | null = null;
  private setEndMs: number | null = null;

  constructor(liftId: LiftId) {
    this.liftId = liftId;
    this.config = LIFT_CONFIGS[liftId];
  }

  /** Mark the set start (first frame timestamp is used if never called). */
  startSet(timestampMs: number): void {
    if (this.setStartMs === null) this.setStartMs = timestampMs;
  }

  /** Immediate stop for pain. Ends the set; never diagnoses anything. */
  requestPainStop(timestampMs?: number): SetSummary {
    this.stopped = true;
    this.stopReason = 'pain-stop';
    if (timestampMs !== undefined) this.setEndMs = timestampMs;
    return this.buildSummary();
  }

  /** End the set normally (or as cancelled) and get the summary. */
  endSet(reason: 'completed' | 'cancelled', timestampMs?: number): SetSummary {
    this.stopped = true;
    this.stopReason = reason;
    if (timestampMs !== undefined) this.setEndMs = timestampMs;
    return this.buildSummary();
  }

  processFrame(frame: FormFrame): FrameResult {
    if (this.stopped) {
      return {
        status: 'clear',
        unclearReason: null,
        unclearDetail: null,
        liveCue: null,
        liveCueCode: null,
        repCount: this.repCount,
        phase: this.phase,
        repCountedThisFrame: false,
        angles: null,
        stopped: true,
      };
    }
    if (this.setStartMs === null) this.setStartMs = frame.timestampMs;

    const unclearReason = gateFrame(this.liftId, frame.landmarks);
    if (unclearReason !== null) {
      this.unclearStreak += 1;
      // Taint any in-flight rep: it can never count after this.
      if (this.phase === 'bottom' || this.phase === 'ascending') this.repTainted = true;
      if (this.unclearStreak >= UNCLEAR_RESET_FRAMES) {
        // Give up on the partial rep; wait to re-acquire the top.
        this.phase = 'awaiting-top';
        this.resetRepTracking();
      }
      this.confirmCount = 0;
      return {
        status: 'unclear',
        unclearReason,
        unclearDetail: unclearDetail(this.liftId, frame.landmarks),
        liveCue: UNCLEAR_COPY,
        liveCueCode: 'unclear',
        repCount: this.repCount,
        phase: this.phase,
        repCountedThisFrame: false,
        angles: null,
        stopped: false,
      };
    }
    this.unclearStreak = 0;
    const angles = computeAngles(frame.landmarks);
    const primary = primaryValue(angles, this.config.primaryAngle);
    // Required landmarks passed the gate, so the primary angle exists
    // for every lift; guard anyway rather than trusting it blindly.
    if (primary === null) {
      return {
        status: 'unclear',
        unclearReason: 'low-visibility',
        unclearDetail: { reason: 'low-visibility', outOfFrame: [], lowVisibility: [], side: null },
        liveCue: UNCLEAR_COPY,
        liveCueCode: 'unclear',
        repCount: this.repCount,
        phase: this.phase,
        repCountedThisFrame: false,
        angles,
        stopped: false,
      };
    }

    // NOTE: flags and cues are evaluated AFTER the phase machine below.
    // The frame that confirms the bottom IS a bottom frame (lean, hinge
    // and set-up flags live there); evaluating before the transition
    // would miss it, because the phase was still 'top' at that point.
    let counted = false;

    if (this.phase === 'top') {
      if (primary <= this.config.bottomThreshold) {
        this.confirmCount += 1;
        if (this.confirmCount >= CONFIRM_FRAMES) {
          this.phase = 'bottom';
          this.confirmCount = 0;
          this.repStartMs = frame.timestampMs;
          this.minPrimary = primary;
          this.repTainted = false;
          this.repFlags = new Set();
          this.bottomKnee = angles.knee;
          this.bottomHip = angles.hip;
          this.recordBottomFlags(angles);
        }
      } else {
        this.confirmCount = 0;
      }
    } else if (this.phase === 'bottom') {
      if (primary < (this.minPrimary ?? primary)) this.minPrimary = primary;
      if (primary >= this.config.bottomThreshold + HYSTERESIS_DEG) {
        this.confirmCount += 1;
        if (this.confirmCount >= CONFIRM_FRAMES) {
          this.phase = 'ascending';
          this.confirmCount = 0;
        }
      } else {
        this.confirmCount = 0;
      }
    } else if (this.phase === 'ascending') {
      if (primary < (this.minPrimary ?? primary)) this.minPrimary = primary;
      if (primary >= this.config.topThreshold) {
        this.confirmCount += 1;
        if (this.confirmCount >= CONFIRM_FRAMES) {
          this.phase = 'top';
          this.confirmCount = 0;
          counted = this.completeRep(frame.timestampMs);
        }
      } else {
        this.confirmCount = 0;
      }
    } else {
      // awaiting-top: only re-acquiring the top re-arms counting.
      if (primary >= this.config.topThreshold) {
        this.confirmCount += 1;
        if (this.confirmCount >= CONFIRM_FRAMES) {
          this.phase = 'top';
          this.confirmCount = 0;
        }
      } else {
        this.confirmCount = 0;
      }
    }

    // Flags/cues see the post-transition phase. On a rep-completing
    // frame the phase is already back to 'top', so this is a no-op
    // there and cannot leak flags into the next rep.
    this.updateLiveFlags(angles, primary, frame.landmarks);
    const cue = this.liveCueFor(angles);
    const liveCue = cue.text;

    return {
      status: 'clear',
      unclearReason: null,
      unclearDetail: null,
      liveCue,
      liveCueCode: cue.code,
      repCount: this.repCount,
      phase: this.phase,
      repCountedThisFrame: counted,
      angles,
      stopped: false,
    };
  }

  /** Per-frame flag checks that only ever fire on CLEAR frames. */
  private updateLiveFlags(angles: ComputedAngles, primary: number, landmarks: PoseLandmark[]): void {
    if (this.phase !== 'bottom' && this.phase !== 'ascending') return;
    const { torsoLean, hip } = angles;
    if (this.liftId === 'squat' && torsoLean !== null && torsoLean > 45) {
      this.repFlags.add('torso-lean');
    }
    if (this.liftId === 'overhead-press' && torsoLean !== null && torsoLean > 20) {
      this.repFlags.add('lean-back');
    }
    if (this.liftId === 'barbell-row' && hip !== null && hip > 150) {
      this.repFlags.add('hinge-lost');
    }
    if (this.liftId === 'deadlift' && this.phase === 'ascending') {
      // Hips rising while knees stay near their bottom bend.
      if (
        this.bottomHip !== null &&
        this.bottomKnee !== null &&
        angles.hip !== null &&
        angles.knee !== null &&
        angles.hip >= this.bottomHip + 30 &&
        angles.knee <= this.bottomKnee + 15
      ) {
        this.repFlags.add('hips-first');
      }
    }
    if (this.liftId === 'bench' && this.phase === 'ascending') {
      // Near lockout, wrists should sit over the shoulders. Normalized
      // by torso length: in a side view shoulder width collapses, so
      // it cannot serve as the scale (see the angle table note).
      if (primary >= this.config.topThreshold - 20) {
        const sL = landmarks[LM.shoulderL];
        const sR = landmarks[LM.shoulderR];
        const hL = landmarks[LM.hipL];
        const hR = landmarks[LM.hipR];
        const wL = landmarks[LM.wristL];
        const wR = landmarks[LM.wristR];
        if (
          isFiniteLandmark(sL) &&
          isFiniteLandmark(sR) &&
          isFiniteLandmark(hL) &&
          isFiniteLandmark(hR) &&
          isFiniteLandmark(wL) &&
          isFiniteLandmark(wR)
        ) {
          const torsoLen = (distance(sL, hL) + distance(sR, hR)) / 2;
          if (torsoLen > 0) {
            const drift =
              Math.max(Math.abs(wL.x - sL.x), Math.abs(wR.x - sR.x)) / torsoLen;
            if (drift > 0.4) this.repFlags.add('wrist-drift');
          }
        }
      }
    }
  }

  /** Flags knowable the moment the bottom is confirmed. */
  private recordBottomFlags(angles: ComputedAngles): void {
    if (this.liftId === 'deadlift' && angles.knee !== null && angles.knee > 150) {
      this.repFlags.add('straight-leg-start');
    }
  }

  private liveCueFor(angles: ComputedAngles): { text: string | null; code: IssueCode | null } {
    if (this.phase !== 'bottom' && this.phase !== 'ascending')
      return { text: null, code: null };
    if (this.repFlags.has('torso-lean'))
      return { text: 'Chest up — your torso is tipping forward.', code: 'torso-lean' };
    if (this.repFlags.has('lean-back'))
      return { text: 'Ribs down — you are leaning back.', code: 'lean-back' };
    if (this.repFlags.has('hinge-lost'))
      return { text: 'Hold the hinge — stay bent over through the pull.', code: 'hinge-lost' };
    if (this.repFlags.has('hips-first'))
      return { text: 'Push the floor away — hips and chest rising together.', code: 'hips-first' };
    if (this.repFlags.has('wrist-drift'))
      return { text: 'Stack your wrists over your elbows.', code: 'wrist-drift' };
    void angles;
    return { text: null, code: null };
  }

  /** Complete a rep at the top. Returns true only if it was counted. */
  private completeRep(timestampMs: number): boolean {
    const depthAngle = this.minPrimary ?? this.config.topThreshold;
    const depthGood = depthAngle <= this.config.depthTarget;
    const durationSec =
      this.repStartMs !== null ? Math.max(0, (timestampMs - this.repStartMs) / 1000) : 0;
    if (this.repTainted) {
      // Uncertain frames touched this rep: it is discarded, never counted.
      this.resetRepTracking();
      return false;
    }
    const flags = new Set<IssueCode>(this.repFlags);
    if (!depthGood) flags.add('shallow');
    this.reps.push({
      index: this.reps.length + 1,
      depthAngleDeg: Math.round(depthAngle * 10) / 10,
      depthGood,
      durationSec: Math.round(durationSec * 100) / 100,
      flags: [...flags],
    });
    this.repCount = this.reps.length;
    this.resetRepTracking();
    return true;
  }

  private resetRepTracking(): void {
    this.confirmCount = 0;
    this.repTainted = false;
    this.repStartMs = null;
    this.minPrimary = null;
    this.repFlags = new Set();
    this.bottomKnee = null;
    this.bottomHip = null;
  }

  buildSummary(): SetSummary {
    const depthGoodCount = this.reps.filter((r) => r.depthGood).length;
    const durations = this.reps.map((r) => r.durationSec).sort((a, b) => a - b);
    const median =
      durations.length === 0
        ? null
        : durations.length % 2 === 1
          ? durations[Math.floor(durations.length / 2)]
          : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2;
    const mean =
      durations.length === 0
        ? null
        : Math.round((durations.reduce((s, v) => s + v, 0) / durations.length) * 100) / 100;
    const issueCounts = new Map<IssueCode, number>();
    for (const rep of this.reps) {
      for (const flag of rep.flags) issueCounts.set(flag, (issueCounts.get(flag) ?? 0) + 1);
    }
    const issues: IssueSummary[] = [...issueCounts.entries()]
      .map(([code, count]) => ({ code, count, message: ISSUE_MESSAGES[code] }))
      .sort((a, b) => b.count - a.count);
    const stoppedForPain = this.stopReason === 'pain-stop';
    return {
      liftId: this.liftId,
      endReason: this.stopReason,
      stoppedForPain,
      painMessage: stoppedForPain ? PAIN_REFER_OUT_MESSAGE : '',
      repCount: this.reps.length,
      reps: [...this.reps],
      depthGoodCount,
      depthConsistencyPct:
        this.reps.length === 0 ? 0 : Math.round((depthGoodCount / this.reps.length) * 100),
      medianTempoSec: median === null ? null : Math.round(median * 100) / 100,
      meanTempoSec: mean,
      issues,
      setDurationSec:
        this.setStartMs !== null && this.setEndMs !== null
          ? Math.round(((this.setEndMs - this.setStartMs) / 1000) * 10) / 10
          : null,
    };
  }
}

/** Convenience: run a whole set's frames through a fresh counter. */
export function runSet(liftId: LiftId, frames: FormFrame[]): { counter: RepCounter; summary: SetSummary } {
  const counter = new RepCounter(liftId);
  for (const frame of frames) counter.processFrame(frame);
  return { counter, summary: counter.endSet('completed', frames[frames.length - 1]?.timestampMs) };
}
