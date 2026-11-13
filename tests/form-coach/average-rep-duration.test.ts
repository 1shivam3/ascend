import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeadliftAnalyzer } from '@/features/form-coach/analyzers/DeadliftAnalyzer';
import { SquatAnalyzer } from '@/features/form-coach/analyzers/SquatAnalyzer';
import { BicepCurlAnalyzer } from '@/features/form-coach/analyzers/BicepCurlAnalyzer';
import { NormalizedLandmark, PoseLandmarkIndex } from '@/features/form-coach/models/pose.types';
import { isValidRep } from '@/features/form-coach/models/form-session.types';
import { curlStream } from './batch-builders';

/**
 * Phone-polish regression (2026-11-06): the report header's tempo
 * figure used to average the rep state machines' per-rep WINDOW
 * durations over valid reps only. A window spans just the machine's
 * rep anchor → lockout, excluding setup/rest and every incomplete
 * attempt — so the owner's real deadlift set (27 s, 7 pulls, 1 valid
 * rep) reported "Avg / repetition 0.7s": the single valid rep's
 * window, which happened to be the machine's 700 ms minimum.
 *
 * The truthful figure is set time per valid rep:
 * averageRepDurationSeconds = durationSeconds / totalValidReps.
 * These tests pin that for all three finishSet implementations
 * (deadlift, squat, and the shared cycle base), driving the session
 * clock (Date.now, stamped at reset) independently of the frame
 * timestamps the state machines consume.
 */

let nowMs = 1_000_000;

beforeEach(() => {
  nowMs = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Deadlift FK stream (same construction as deadlift-analyzer.test.ts):
// knee angle = 180 - (s + u), hip angle = 180 - (u + v), torso = v.
function dlFrame(s: number, u: number, v: number): NormalizedLandmark[] {
  const lm: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5, y: 0.5, z: 0, visibility: 0.95, presence: 0.95,
  }));
  const rad = (d: number) => (d * Math.PI) / 180;
  const A = { x: 0.55, y: 0.9 };
  const K = { x: A.x + 0.25 * Math.sin(rad(s)), y: A.y - 0.25 * Math.cos(rad(s)) };
  const H = { x: K.x - 0.25 * Math.sin(rad(u)), y: K.y - 0.25 * Math.cos(rad(u)) };
  const S = { x: H.x + 0.28 * Math.sin(rad(v)), y: H.y - 0.28 * Math.cos(rad(v)) };
  const put = (idx: number, p: { x: number; y: number }, vis = 0.95) => {
    lm[idx] = { x: p.x, y: p.y, z: 0, visibility: vis, presence: 0.95 };
  };
  put(PoseLandmarkIndex.LEFT_SHOULDER, S);
  put(PoseLandmarkIndex.LEFT_HIP, H);
  put(PoseLandmarkIndex.LEFT_KNEE, K);
  put(PoseLandmarkIndex.LEFT_ANKLE, A);
  put(PoseLandmarkIndex.LEFT_HEEL, { x: A.x - 0.02, y: A.y + 0.01 });
  put(PoseLandmarkIndex.LEFT_FOOT_INDEX, { x: A.x + 0.05, y: A.y + 0.01 });
  put(PoseLandmarkIndex.LEFT_WRIST, { x: K.x + 0.04, y: H.y + 0.16 });
  const off = (p: { x: number; y: number }) => ({ x: p.x + 0.015, y: p.y });
  put(PoseLandmarkIndex.RIGHT_SHOULDER, off(S), 0.3);
  put(PoseLandmarkIndex.RIGHT_HIP, off(H), 0.3);
  put(PoseLandmarkIndex.RIGHT_KNEE, off(K), 0.3);
  put(PoseLandmarkIndex.RIGHT_ANKLE, off(A), 0.3);
  put(PoseLandmarkIndex.RIGHT_HEEL, { x: A.x + 0.015, y: A.y + 0.01 }, 0.3);
  put(PoseLandmarkIndex.RIGHT_FOOT_INDEX, { x: A.x + 0.06, y: A.y + 0.01 }, 0.3);
  put(PoseLandmarkIndex.RIGHT_WRIST, off(S), 0.3);
  return lm;
}

type Pose = [number, number, number];
const DL_STAND: Pose = [2, 4, 6];
const DL_BOTTOM: Pose = [10, 60, 55]; // knee 110, hip 65
const DL_MID: Pose = [8, 40, 40]; // knee 132, hip 100 — pulled halfway

function playDl(analyzer: DeadliftAnalyzer, keys: { pose: Pose; frames: number }[], startT = 0): number {
  let t = startT;
  let prev: Pose | null = null;
  for (const key of keys) {
    const from = prev ?? key.pose;
    for (let i = 0; i < key.frames; i++) {
      const f = key.frames === 1 ? 1 : i / (key.frames - 1 || 1);
      analyzer.processFrame(
        dlFrame(
          from[0] + (key.pose[0] - from[0]) * f,
          from[1] + (key.pose[1] - from[1]) * f,
          from[2] + (key.pose[2] - from[2]) * f
        ),
        t,
        1.0
      );
      t += 100;
    }
    prev = key.pose;
  }
  return t;
}

describe('averageRepDurationSeconds — set time per valid rep', () => {
  it('deadlift: the recorded scenario — 27s set, 7 pulls, 1 valid rep → 27s/rep, not the rep window', () => {
    const a = new DeadliftAnalyzer();
    a.reset(); // production stamps the session clock at analysis start
    let t = 0;
    // Six pulls that stall and return to setup (incomplete attempts).
    for (let pull = 0; pull < 6; pull++) {
      t = playDl(a, [
        { pose: DL_BOTTOM, frames: pull === 0 ? 4 : 2 },
        { pose: DL_MID, frames: 8 },
        { pose: DL_BOTTOM, frames: 8 },
      ], t);
    }
    // One full pull to lockout, then lower back to setup.
    t = playDl(a, [
      { pose: DL_BOTTOM, frames: 2 },
      { pose: DL_STAND, frames: 10 },
      { pose: DL_STAND, frames: 3 },
      { pose: DL_BOTTOM, frames: 10 },
    ], t);
    void t;

    nowMs += 27_000; // the set took 27 s of wall time
    const summary = a.finishSet();
    expect(summary.durationSeconds).toBe(27);
    expect(summary.totalDetectedReps).toBe(7);
    expect(summary.totalValidReps).toBe(1);
    // The old computation would have reported the single valid rep's
    // machine window (a few seconds at most) — pin the truthful figure.
    const validRep = summary.reps.find((r) => isValidRep(r));
    expect(validRep).toBeDefined();
    expect(validRep!.durationSeconds).toBeLessThan(27);
    expect(summary.averageRepDurationSeconds).toBe(27);
  });

  it('deadlift: no valid reps → 0, never NaN', () => {
    const a = new DeadliftAnalyzer();
    a.reset();
    let t = 0;
    for (let pull = 0; pull < 2; pull++) {
      t = playDl(a, [
        { pose: DL_BOTTOM, frames: pull === 0 ? 4 : 2 },
        { pose: DL_MID, frames: 8 },
        { pose: DL_BOTTOM, frames: 8 },
      ], t);
    }
    void t;
    nowMs += 12_000;
    const summary = a.finishSet();
    expect(summary.totalValidReps).toBe(0);
    expect(summary.averageRepDurationSeconds).toBe(0);
  });

  it('squat: 20s set with 2 valid reps → 10s/rep', () => {
    const analyzer = new SquatAnalyzer({ minRepDurationMs: 400 });
    analyzer.reset();
    let t = 0;
    t = feedSquatRep(analyzer, t);
    t = feedSquatRep(analyzer, t);
    void t;
    nowMs += 20_000;
    const summary = analyzer.finishSet();
    expect(summary.totalValidReps).toBe(2);
    expect(summary.durationSeconds).toBe(20);
    expect(summary.averageRepDurationSeconds).toBe(10);
  });

  it('cycle base (bicep curl): 30s set with 3 valid reps → 10s/rep', () => {
    const analyzer = new BicepCurlAnalyzer();
    analyzer.reset();
    for (const f of curlStream(3)) {
      analyzer.processFrame(f.lm, f.t, 1.0);
    }
    nowMs += 30_000;
    const summary = analyzer.finishSet();
    expect(summary.totalValidReps).toBe(3);
    expect(summary.durationSeconds).toBe(30);
    expect(summary.averageRepDurationSeconds).toBe(10);
  });
});

// ── Squat stream (same construction as squat-analyzer.test.ts): a pose
// whose LEFT knee angle equals the request, side view.
function landmarksForKneeAngle(kneeAngleDeg: number): NormalizedLandmark[] {
  const lm: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5, y: 0.5, z: 0, visibility: 0.95, presence: 0.95,
  }));
  const knee = { x: 0.55, y: 0.65 };
  const ankle = { x: 0.55, y: 0.87 };
  const rad = (kneeAngleDeg * Math.PI) / 180;
  const hip = { x: knee.x + 0.22 * Math.sin(rad), y: knee.y + 0.22 * Math.cos(rad) };
  const shoulder = { x: hip.x, y: hip.y - 0.24 };
  lm[PoseLandmarkIndex.LEFT_HIP] = { ...hip, z: 0, visibility: 0.95, presence: 0.95 };
  lm[PoseLandmarkIndex.LEFT_KNEE] = { ...knee, z: 0, visibility: 0.95, presence: 0.95 };
  lm[PoseLandmarkIndex.LEFT_ANKLE] = { ...ankle, z: 0, visibility: 0.95, presence: 0.95 };
  lm[PoseLandmarkIndex.LEFT_HEEL] = { x: 0.53, y: 0.88, z: 0, visibility: 0.95, presence: 0.95 };
  lm[PoseLandmarkIndex.LEFT_FOOT_INDEX] = { x: 0.6, y: 0.88, z: 0, visibility: 0.95, presence: 0.95 };
  lm[PoseLandmarkIndex.LEFT_SHOULDER] = { ...shoulder, z: 0, visibility: 0.95, presence: 0.95 };
  lm[PoseLandmarkIndex.RIGHT_SHOULDER] = { x: shoulder.x + 0.02, y: shoulder.y, z: 0, visibility: 0.3, presence: 0.95 };
  lm[PoseLandmarkIndex.RIGHT_HIP] = { x: hip.x + 0.02, y: hip.y, z: 0, visibility: 0.3, presence: 0.95 };
  return lm;
}

function feedSquatRep(analyzer: SquatAnalyzer, startT: number): number {
  const angles = [170, 170, 150, 130, 110, 90, 70, 55, 50, 50, 70, 90, 110, 130, 150, 160, 170];
  let t = startT;
  for (const angle of angles) {
    analyzer.processFrame(landmarksForKneeAngle(angle), t);
    t += 100;
  }
  return t;
}
