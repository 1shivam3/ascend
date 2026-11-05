/**
 * Batch A+B synthetic stream builders.
 *
 * Forward-kinematic poses in square space (tests feed aspectRatio
 * 1.0): arms and legs are placed from a shoulder/hip anchor, a base
 * direction, and an EXACT joint angle — the elbow/knee angle the
 * analyzers compute from the returned landmarks equals the angle the
 * builder was asked for, by construction. Segment lengths: torso
 * 0.24, upper arm 0.144, forearm 0.208, thigh 0.192, shin 0.192
 * (roughly human proportions at this figure scale).
 *
 * A stream is a list of {lm, t} frames at 100ms steps, ready to feed
 * an analyzer's processFrame(landmarks, t, 1.0) or, via feedClassifier,
 * a MovementClassifier.
 */
import {
  NormalizedLandmark,
  PoseLandmarkIndex as I,
} from '@/features/form-coach/models/pose.types';
import { MovementClassifier } from '@/features/form-coach/services/analysis/MovementClassifier';

export interface StreamFrame {
  lm: NormalizedLandmark[];
  t: number;
}

export const UA = 0.144;
export const FA = 0.208;
export const THIGH = 0.192;
export const SHIN = 0.192;

export interface Pt {
  x: number;
  y: number;
}
const rad = (d: number) => (d * Math.PI) / 180;
export const dir = (deg: number): Pt => ({ x: Math.cos(rad(deg)), y: Math.sin(rad(deg)) });
export const rot = (v: Pt, deg: number): Pt => ({
  x: v.x * Math.cos(rad(deg)) - v.y * Math.sin(rad(deg)),
  y: v.x * Math.sin(rad(deg)) + v.y * Math.cos(rad(deg)),
});
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s });

/**
 * Arm from a shoulder anchor: upper arm along `baseDeg` (image
 * coords: 0 = +x, 90 = straight down, -90 = straight up), elbow bent
 * to exactly `elbowDeg`. `bendSign` chooses which way the forearm
 * folds; each builder picks the sign that puts the wrist where the
 * exercise puts it.
 */
export function armFromShoulder(
  S: Pt,
  baseDeg: number,
  elbowDeg: number,
  bendSign: 1 | -1
): { elbow: Pt; wrist: Pt } {
  const base = dir(baseDeg);
  const elbow = add(S, mul(base, UA));
  const wrist = add(elbow, mul(rot(base, bendSign * (180 - elbowDeg)), FA));
  return { elbow, wrist };
}

/** Leg from a hip anchor, same construction as the arm. */
export function legFromHip(
  H: Pt,
  thighDeg: number,
  kneeDeg: number,
  bendSign: 1 | -1
): { knee: Pt; ankle: Pt } {
  const thigh = dir(thighDeg);
  const knee = add(H, mul(thigh, THIGH));
  const ankle = add(knee, mul(rot(thigh, bendSign * (180 - kneeDeg)), SHIN));
  return { knee, ankle };
}

function blankLandmarks(vis: number): NormalizedLandmark[] {
  return Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: vis,
    presence: vis,
  }));
}

export interface SidePoseSpec {
  shoulder: Pt;
  hip: Pt;
  elbow: Pt;
  wrist: Pt;
  knee: Pt;
  ankle: Pt;
  /** Far-side leg, when it differs (lunge). Defaults to the near leg. */
  kneeOther?: Pt;
  ankleOther?: Pt;
  elbowOther?: Pt;
  wristOther?: Pt;
}

/** Side-view pose: near side at 0.95 visibility, far side mirrored at
 * 0.45 (below the analyzers' 0.5 gate, above the classifier's 0.3). */
export function sidePose(spec: SidePoseSpec): NormalizedLandmark[] {
  const lm = blankLandmarks(0.95);
  const put = (idx: number, p: Pt, vis = 0.95) => {
    // Presence stays high on both sides (the convention the existing
    // classifier tests use): presence below 0.5 would trip the
    // reliability screen's presence gate, which real model output
    // never does (it leaves presence at 0). Visibility is what
    // separates the camera side from the far side here.
    lm[idx] = { x: p.x, y: p.y, z: 0, visibility: vis, presence: 0.95 };
  };
  const off = (p: Pt): Pt => ({ x: p.x + 0.015, y: p.y });
  put(I.LEFT_SHOULDER, spec.shoulder);
  put(I.LEFT_HIP, spec.hip);
  put(I.LEFT_ELBOW, spec.elbow);
  put(I.LEFT_WRIST, spec.wrist);
  put(I.LEFT_KNEE, spec.knee);
  put(I.LEFT_ANKLE, spec.ankle);
  put(I.LEFT_HEEL, { x: spec.ankle.x - 0.02, y: spec.ankle.y + 0.01 });
  put(I.LEFT_FOOT_INDEX, { x: spec.ankle.x + 0.05, y: spec.ankle.y + 0.01 });
  put(I.NOSE, { x: spec.shoulder.x + 0.05, y: spec.shoulder.y - 0.07 });
  put(I.RIGHT_SHOULDER, off(spec.shoulder), 0.45);
  put(I.RIGHT_HIP, off(spec.hip), 0.45);
  put(I.RIGHT_ELBOW, off(spec.elbowOther ?? spec.elbow), 0.45);
  put(I.RIGHT_WRIST, off(spec.wristOther ?? spec.wrist), 0.45);
  put(I.RIGHT_KNEE, off(spec.kneeOther ?? spec.knee), 0.45);
  put(I.RIGHT_ANKLE, off(spec.ankleOther ?? spec.ankle), 0.45);
  put(I.RIGHT_HEEL, { x: (spec.ankleOther ?? spec.ankle).x + 0.015, y: (spec.ankleOther ?? spec.ankle).y + 0.01 }, 0.45);
  put(I.RIGHT_FOOT_INDEX, { x: (spec.ankleOther ?? spec.ankle).x + 0.06, y: (spec.ankleOther ?? spec.ankle).y + 0.01 }, 0.45);
  return lm;
}

export interface FrontPoseSpec {
  cx: number;
  shoulderY: number;
  hipY: number;
  /** Image-right arm joints; the left arm is mirrored around cx. */
  elbow: Pt;
  wrist: Pt;
  kneeY: number;
  ankleY: number;
  hipShiftX?: number;
}

/** Front-view pose: both sides at 0.95, shoulders 0.22 apart (the
 * front-view discrimination needs shoulderDistX > 0.18). */
export function frontPose(spec: FrontPoseSpec): NormalizedLandmark[] {
  const lm = blankLandmarks(0.95);
  const put = (idx: number, p: Pt) => {
    lm[idx] = { x: p.x, y: p.y, z: 0, visibility: 0.95, presence: 0.95 };
  };
  const shift = spec.hipShiftX ?? 0;
  const sR = { x: spec.cx + 0.11, y: spec.shoulderY };
  const sL = { x: spec.cx - 0.11, y: spec.shoulderY };
  const hR = { x: spec.cx + 0.09 + shift, y: spec.hipY };
  const hL = { x: spec.cx - 0.09 + shift, y: spec.hipY };
  const mirror = (p: Pt): Pt => ({ x: 2 * spec.cx - p.x, y: p.y });
  put(I.RIGHT_SHOULDER, sR);
  put(I.LEFT_SHOULDER, sL);
  put(I.RIGHT_HIP, hR);
  put(I.LEFT_HIP, hL);
  put(I.RIGHT_ELBOW, spec.elbow);
  put(I.RIGHT_WRIST, spec.wrist);
  put(I.LEFT_ELBOW, mirror(spec.elbow));
  put(I.LEFT_WRIST, mirror(spec.wrist));
  put(I.RIGHT_KNEE, { x: spec.cx + 0.10 + shift, y: spec.kneeY });
  put(I.LEFT_KNEE, { x: spec.cx - 0.10 + shift, y: spec.kneeY });
  put(I.RIGHT_ANKLE, { x: spec.cx + 0.10 + shift, y: spec.ankleY });
  put(I.LEFT_ANKLE, { x: spec.cx - 0.10 + shift, y: spec.ankleY });
  put(I.RIGHT_FOOT_INDEX, { x: spec.cx + 0.13 + shift, y: spec.ankleY + 0.01 });
  put(I.LEFT_FOOT_INDEX, { x: spec.cx - 0.13 + shift, y: spec.ankleY + 0.01 });
  put(I.NOSE, { x: spec.cx, y: spec.shoulderY - 0.08 });
  return lm;
}

/** Keyframe driver: each segment lerps its value to `to` over
 * `frames` frames. Returns the per-frame values, starting from
 * `start` (the first frame is the start value itself). */
export function seq(start: number, segments: { to: number; frames: number }[]): number[] {
  const out: number[] = [start];
  let cur = start;
  for (const seg of segments) {
    for (let i = 1; i <= seg.frames; i++) {
      out.push(cur + (seg.to - cur) * (i / seg.frames));
    }
    cur = seg.to;
  }
  return out;
}

/** One rep's value profile for a cycle parameter v (0 = flexed end,
 * 1 = completed end): hold, travel down, hold, travel back. */
export function repProfile(
  reps: number,
  opts: { holdTop?: number; down?: number; holdBottom?: number; up?: number } = {}
): number[] {
  const { holdTop = 3, down = 5, holdBottom = 2, up = 5 } = opts;
  const segments: { to: number; frames: number }[] = [];
  for (let r = 0; r < reps; r++) {
    segments.push(
      { to: 1, frames: holdTop },
      { to: 0, frames: down },
      { to: 0, frames: holdBottom },
      { to: 1, frames: up }
    );
  }
  return seq(1, segments);
}

export function toStream(poses: NormalizedLandmark[][], dtMs = 100): StreamFrame[] {
  return poses.map((lm, i) => ({ lm, t: i * dtMs }));
}

export function feedClassifier(frames: StreamFrame[]): MovementClassifier {
  const c = new MovementClassifier();
  for (const f of frames) c.processFrame(f.lm, 1.0);
  return c;
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

// ── Overhead press (side) ─────────────────────────────────────────
// Upright torso; the elbow cycles 92° → topElbow while the upper arm
// rotates from horizontal-forward to vertical. With `lockout: false`
// the press fails forward instead: the upper arm stays in front of
// the body (angled down at the bottom, near-horizontal at the top),
// so the elbows straighten but the wrists never pass overhead — the
// top gate must refuse these.
export function pressStream(
  reps = 3,
  opts: { topElbow?: number; bottomElbow?: number; lockout?: boolean } = {}
): StreamFrame[] {
  const topElbow = opts.topElbow ?? 168;
  const bottomElbow = opts.bottomElbow ?? 92;
  const lockout = opts.lockout ?? true;
  const S = { x: 0.42, y: 0.34 };
  const H = { x: 0.42, y: 0.58 };
  const leg = legFromHip(H, 92, 172, -1);
  const poses = repProfile(reps).map((v) => {
    const elbowDeg = lerp(bottomElbow, topElbow, v);
    const baseDeg = lockout ? lerp(0, -90, v) : lerp(35, -5, v);
    const arm = armFromShoulder(S, baseDeg, elbowDeg, -1);
    return sidePose({ shoulder: S, hip: H, ...arm, knee: leg.knee, ankle: leg.ankle });
  });
  return toStream(poses);
}

// ── Bent-over row (side) ──────────────────────────────────────────
// Held hinge: torso inclination ~78°, hip angle ~88°, hips parked.
// The elbows cycle 165° (hanging) → 68° (pulled to the ribs).
export function rowStream(
  reps = 3,
  opts: { bottomElbow?: number; topElbow?: number } = {}
): StreamFrame[] {
  const flexedElbow = opts.bottomElbow ?? 68; // pulled position
  const extendedElbow = opts.topElbow ?? 165; // hanging position
  const H = { x: 0.38, y: 0.54 };
  const S = { x: 0.615, y: 0.49 };
  const knee = { x: 0.426, y: 0.726 };
  const ankle = { x: 0.43, y: 0.918 };
  // v = 1 is the machine's "completed" end = arms extended (hanging).
  const poses = repProfile(reps).map((v) => {
    const elbowDeg = lerp(flexedElbow, extendedElbow, v);
    const baseDeg = lerp(118, 78, v);
    const arm = armFromShoulder(S, baseDeg, elbowDeg, 1);
    return sidePose({ shoulder: S, hip: H, ...arm, knee, ankle });
  });
  return toStream(poses);
}

// ── Bicep curl (side) ─────────────────────────────────────────────
// Upright; upper arm hangs vertical and still; elbow cycles
// 168° → 55°. `sway` drives the hips forward as the curl rises.
export function curlStream(
  reps = 3,
  opts: { sway?: boolean; topElbow?: number; bottomElbow?: number } = {}
): StreamFrame[] {
  const topElbow = opts.topElbow ?? 55;
  const bottomElbow = opts.bottomElbow ?? 168;
  const poses = repProfile(reps).map((v) => {
    const elbowDeg = lerp(bottomElbow, topElbow, 1 - v); // v=1 rest = extended
    const swayX = opts.sway ? 0.08 * (1 - v) : 0;
    const S = { x: 0.44 + swayX, y: 0.32 };
    const H = { x: 0.44 + swayX, y: 0.56 };
    const arm = armFromShoulder(S, 88, elbowDeg, -1);
    return sidePose({
      shoulder: S,
      hip: H,
      ...arm,
      knee: { x: 0.45, y: 0.752 },
      ankle: { x: 0.44, y: 0.944 },
    });
  });
  return toStream(poses);
}

// ── Lunge (side) ──────────────────────────────────────────────────
// Split stance throughout; the front knee cycles 158° → bottomKnee
// while the hips drop. Back knee stays comparatively straight.
export function lungeStream(
  reps = 3,
  opts: { bottomKnee?: number } = {}
): StreamFrame[] {
  const bottomKnee = opts.bottomKnee ?? 88;
  const poses = repProfile(reps).map((v) => {
    // v = 1: standing split (top). v = 0: bottom of the descent.
    const H = { x: 0.45, y: lerp(0.62, 0.54, v) };
    const S = { x: H.x + 0.015, y: H.y - 0.24 };
    const front = legFromHip(H, lerp(5, 55, v), lerp(bottomKnee, 158, v), 1);
    const back = legFromHip(H, lerp(118, 100, v), lerp(150, 168, v), 1);
    const arm = armFromShoulder(S, 85, 168, -1);
    return sidePose({
      shoulder: S,
      hip: H,
      ...arm,
      knee: front.knee,
      ankle: front.ankle,
      kneeOther: back.knee,
      ankleOther: back.ankle,
    });
  });
  return toStream(poses);
}

// ── Push-up (side) ────────────────────────────────────────────────
// Near-horizontal body line; the whole body lowers and rises with
// the elbow cycle (top ~172°, bottom ~96°). `sag` drops the hips
// off the line for the whole set.
export function pushUpStream(
  reps = 3,
  opts: { sag?: boolean } = {}
): StreamFrame[] {
  const sagY = opts.sag ? 0.085 : 0;
  const poses = repProfile(reps).map((v) => {
    const drop = (1 - v) * 0.1;
    const S = { x: 0.3, y: 0.4 + drop };
    const H = { x: 0.56, y: 0.43 + drop + sagY };
    const A = { x: 0.84, y: 0.47 + drop };
    const K = { x: 0.7, y: 0.45 + drop + sagY / 2 };
    const E = { x: lerp(0.185, 0.305, v), y: lerp(0.62, 0.59, v) + drop };
    const W = { x: 0.31, y: 0.78 };
    return sidePose({ shoulder: S, hip: H, elbow: E, wrist: W, knee: K, ankle: A });
  });
  return toStream(poses);
}

// ── Bench press (side) ────────────────────────────────────────────
// Supine: shoulders and hips parked on the bench, knees bent with
// feet down. Only the arm cycles: elbow ~95° at the bottom, ~172°
// at lockout, wrist travelling vertically. `drift` slides the wrist
// horizontally inside every rep (the bar-path proxy).
export function benchStream(
  reps = 3,
  opts: { drift?: boolean } = {}
): StreamFrame[] {
  const S = { x: 0.32, y: 0.42 };
  const H = { x: 0.58, y: 0.44 };
  const K = { x: 0.66, y: 0.6 };
  const A = { x: 0.66, y: 0.8 };
  const poses = repProfile(reps).map((v) => {
    // A clean press keeps the wrist near one vertical line (small
    // natural travel as the elbow tucks); `drift` adds a large
    // horizontal bulge mid-rep — the bar-path proxy excursion.
    const bulge = opts.drift ? 0.12 * Math.sin(Math.PI * (1 - v)) : 0;
    const E = { x: lerp(0.225, 0.32, v) + bulge * 0.5, y: lerp(0.4, 0.276, v) };
    const W = { x: lerp(0.24, 0.32, v) + bulge, y: lerp(0.199, 0.068, v) };
    return sidePose({ shoulder: S, hip: H, elbow: E, wrist: W, knee: K, ankle: A });
  });
  return toStream(poses);
}

// ── Plank (side) ──────────────────────────────────────────────────
// Forearm plank: horizontal, static, elbows flexed ~90° on the
// floor. `sag` drops the hips off the body line.
export function plankStream(
  frames = 25,
  opts: { sag?: boolean; dtMs?: number } = {}
): StreamFrame[] {
  const sagY = opts.sag ? 0.085 : 0;
  const S = { x: 0.3, y: 0.4 };
  const H = { x: 0.56, y: 0.43 + sagY };
  const A = { x: 0.84, y: 0.47 };
  const K = { x: 0.7, y: 0.45 + sagY / 2 };
  const E = { x: 0.3, y: 0.58 };
  const W = { x: 0.42, y: 0.6 };
  const poses = Array.from({ length: frames }, () =>
    sidePose({ shoulder: S, hip: H, elbow: E, wrist: W, knee: K, ankle: A })
  );
  return toStream(poses, opts.dtMs ?? 250);
}

// ── Lateral raise (front) ─────────────────────────────────────────
// Facing the camera; straight-ish elbows (168°); the arms arc from
// hanging (wrist ~1.45 torso lengths below shoulder height) to
// horizontal (wrist at shoulder height). `sway` drives the hips
// sideways as the arms rise.
export function raiseStream(
  reps = 3,
  opts: { sway?: boolean; peakBaseDeg?: number } = {}
): StreamFrame[] {
  const peakBase = opts.peakBaseDeg ?? -6;
  const poses = repProfile(reps).map((v) => {
    // v = 1: arms down (the machine's completed end). v = 0: peak.
    const baseDeg = lerp(peakBase, 84, v);
    const S = { x: 0.61, y: 0.3 };
    const arm = armFromShoulder(S, baseDeg, 168, 1);
    return frontPose({
      cx: 0.5,
      shoulderY: 0.3,
      hipY: 0.54,
      elbow: arm.elbow,
      wrist: arm.wrist,
      kneeY: 0.75,
      ankleY: 0.96,
      hipShiftX: opts.sway ? 0.15 * (1 - v) : 0,
    });
  });
  return toStream(poses);
}

// ── Overhead press (front) ────────────────────────────────────────
// Facing the camera; elbows flare out at the bottom (92°) and drive
// overhead at the top (168°).
export function pressFrontStream(reps = 3): StreamFrame[] {
  const poses = repProfile(reps).map((v) => {
    const elbowDeg = lerp(92, 168, v);
    const baseDeg = lerp(65, -75, v);
    const S = { x: 0.61, y: 0.3 };
    const arm = armFromShoulder(S, baseDeg, elbowDeg, -1);
    return frontPose({
      cx: 0.5,
      shoulderY: 0.3,
      hipY: 0.54,
      elbow: arm.elbow,
      wrist: arm.wrist,
      kneeY: 0.75,
      ankleY: 0.96,
    });
  });
  return toStream(poses);
}

// ── Squat variants (side), via the classifier test's FK frame ─────
// Reuses the (s, u, v) construction whose angle identities are
// knee = 180-(s+u), hip = 180-(u+v): a deep squat set whose WRIST
// placement carries the variant — goblet (hands together at the
// chest), front rack (hands high, elbows up), back (hands high,
// elbows dropped).
export type SquatGrip = 'goblet' | 'front' | 'back';

export function squatVariantStream(grip: SquatGrip, reps = 3): StreamFrame[] {
  const frame = (s: number, u: number, v: number, bent: boolean): NormalizedLandmark[] => {
    const lm = blankLandmarks(0.95);
    const A = { x: 0.55, y: 0.9 };
    const K = { x: A.x + 0.25 * Math.sin(rad(s)), y: A.y - 0.25 * Math.cos(rad(s)) };
    const H = { x: K.x - 0.25 * Math.sin(rad(u)), y: K.y - 0.25 * Math.cos(rad(u)) };
    const S = { x: H.x + 0.28 * Math.sin(rad(v)), y: H.y - 0.28 * Math.cos(rad(v)) };
    const put = (idx: number, p: Pt, vis = 0.95) => {
      lm[idx] = { x: p.x, y: p.y, z: 0, visibility: vis, presence: 0.95 };
    };
    put(I.LEFT_SHOULDER, S);
    put(I.LEFT_HIP, H);
    put(I.LEFT_KNEE, K);
    put(I.LEFT_ANKLE, A);
    put(I.LEFT_HEEL, { x: A.x - 0.02, y: A.y + 0.01 });
    put(I.LEFT_FOOT_INDEX, { x: A.x + 0.05, y: A.y + 0.01 });
    let wrist: Pt;
    let elbow: Pt;
    if (grip === 'goblet') {
      // Hands together at the sternum: inside the neutral hand band,
      // close to the torso line.
      wrist = { x: H.x + 0.1, y: S.y + 0.45 * (H.y - S.y) };
      elbow = { x: wrist.x - 0.02, y: wrist.y + 0.1 };
    } else if (grip === 'front') {
      wrist = { x: S.x + 0.06, y: S.y - 0.01 };
      elbow = { x: S.x + 0.1, y: S.y + 0.01 };
    } else {
      wrist = { x: S.x + 0.02, y: S.y + 0.01 };
      elbow = { x: S.x + 0.05, y: S.y + 0.09 };
    }
    void bent;
    put(I.LEFT_WRIST, wrist);
    put(I.LEFT_ELBOW, elbow);
    const off = (p: Pt): Pt => ({ x: p.x + 0.015, y: p.y });
    put(I.RIGHT_SHOULDER, off(S), 0.3);
    put(I.RIGHT_HIP, off(H), 0.3);
    put(I.RIGHT_KNEE, off(K), 0.3);
    put(I.RIGHT_ANKLE, off(A), 0.3);
    put(I.RIGHT_WRIST, off(wrist), 0.3);
    put(I.RIGHT_ELBOW, off(elbow), 0.3);
    return lm;
  };
  const poses: NormalizedLandmark[][] = [];
  const STAND: [number, number, number] = [2, 4, 6];
  const BOTTOM: [number, number, number] = [25, 80, 35];
  const playPose = (from: [number, number, number], to: [number, number, number], frames: number, bent: boolean) => {
    for (let i = 0; i < frames; i++) {
      const f = frames === 1 ? 1 : i / (frames - 1 || 1);
      poses.push(
        frame(
          from[0] + (to[0] - from[0]) * f,
          from[1] + (to[1] - from[1]) * f,
          from[2] + (to[2] - from[2]) * f,
          bent
        )
      );
    }
  };
  for (let rep = 0; rep < reps; rep++) {
    playPose(STAND, STAND, rep === 0 ? 4 : 2, false);
    playPose(STAND, BOTTOM, 10, true);
    playPose(BOTTOM, BOTTOM, 2, true);
    playPose(BOTTOM, STAND, 10, false);
  }
  return toStream(poses);
}

// ── Deadlift (side), same FK construction ─────────────────────────
// Hinge bottom (knee ~117°, hip ~67°) with the hands hanging below
// the hips, standing tall between reps — the hip EXTENDS back to
// standing every rep, which is exactly what a row never does.
export function deadliftStream(reps = 3): StreamFrame[] {
  const frame = (s: number, u: number, v: number): NormalizedLandmark[] => {
    const lm = blankLandmarks(0.95);
    const A = { x: 0.55, y: 0.9 };
    const K = { x: A.x + 0.25 * Math.sin(rad(s)), y: A.y - 0.25 * Math.cos(rad(s)) };
    const H = { x: K.x - 0.25 * Math.sin(rad(u)), y: K.y - 0.25 * Math.cos(rad(u)) };
    const S = { x: H.x + 0.28 * Math.sin(rad(v)), y: H.y - 0.28 * Math.cos(rad(v)) };
    const put = (idx: number, p: Pt, vis = 0.95) => {
      lm[idx] = { x: p.x, y: p.y, z: 0, visibility: vis, presence: 0.95 };
    };
    put(I.LEFT_SHOULDER, S);
    put(I.LEFT_HIP, H);
    put(I.LEFT_KNEE, K);
    put(I.LEFT_ANKLE, A);
    put(I.LEFT_HEEL, { x: A.x - 0.02, y: A.y + 0.01 });
    put(I.LEFT_FOOT_INDEX, { x: A.x + 0.05, y: A.y + 0.01 });
    put(I.LEFT_WRIST, { x: K.x + 0.04, y: H.y + 0.16 });
    put(I.LEFT_ELBOW, { x: (S.x + K.x) / 2 + 0.03, y: (S.y + H.y) / 2 + 0.06 });
    const off = (p: Pt): Pt => ({ x: p.x + 0.015, y: p.y });
    put(I.RIGHT_SHOULDER, off(S), 0.3);
    put(I.RIGHT_HIP, off(H), 0.3);
    put(I.RIGHT_KNEE, off(K), 0.3);
    put(I.RIGHT_ANKLE, off(A), 0.3);
    put(I.RIGHT_WRIST, { x: K.x + 0.055, y: H.y + 0.16 }, 0.3);
    put(I.RIGHT_ELBOW, off({ x: (S.x + K.x) / 2 + 0.03, y: (S.y + H.y) / 2 + 0.06 }), 0.3);
    return lm;
  };
  const poses: NormalizedLandmark[][] = [];
  const STAND: [number, number, number] = [2, 4, 6];
  const BOTTOM: [number, number, number] = [8, 55, 58];
  const playPose = (from: [number, number, number], to: [number, number, number], frames: number) => {
    for (let i = 0; i < frames; i++) {
      const f = frames === 1 ? 1 : i / (frames - 1 || 1);
      poses.push(
        frame(
          from[0] + (to[0] - from[0]) * f,
          from[1] + (to[1] - from[1]) * f,
          from[2] + (to[2] - from[2]) * f
        )
      );
    }
  };
  for (let rep = 0; rep < reps; rep++) {
    playPose(BOTTOM, BOTTOM, rep === 0 ? 4 : 3);
    playPose(BOTTOM, STAND, 10);
    playPose(STAND, STAND, 3);
    playPose(STAND, BOTTOM, 10);
    playPose(BOTTOM, BOTTOM, 2);
  }
  return toStream(poses);
}
