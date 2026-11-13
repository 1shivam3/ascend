import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeadliftAnalyzer } from '@/features/form-coach/analyzers/DeadliftAnalyzer';
import { SquatAnalyzer } from '@/features/form-coach/analyzers/SquatAnalyzer';
import { computeTempoSeconds } from '@/features/form-coach/services/analysis/tempo';
import { FormRep, isValidRep } from '@/features/form-coach/models/form-session.types';
import { NormalizedLandmark, PoseLandmarkIndex } from '@/features/form-coach/models/pose.types';

/**
 * Audit phase 2, Task 2.1 (P0-3) — truthful, self-consistent report.
 *
 * Statuses: a deadlift pull that stalls is a FAILED rep only when the
 * landmarks lockout is judged from (ankle/foot) were visible for most
 * of the attempt; when they were below the visibility threshold, the
 * pull is UNVERIFIED and the report must say "Could not verify
 * lockout (feet out of frame)" — never "Incomplete Lockouts".
 *
 * Tempo: the mean per-rep duration from the reps' own timestamps,
 * shown only when tempo × detected reps reconstructs a believable
 * share of the set duration (see services/analysis/tempo.ts).
 */

// ── Deadlift FK stream (same construction as average-rep-duration.test.ts):
// knee angle = 180 - (s + u), hip angle = 180 - (u + v), torso = v.
// `feetVis` drops the primary side's ankle/heel/foot-index landmarks
// below the reliability threshold, simulating feet out of frame.
function dlFrame(s: number, u: number, v: number, feetVis = 0.95): NormalizedLandmark[] {
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
  put(PoseLandmarkIndex.LEFT_ANKLE, A, feetVis);
  put(PoseLandmarkIndex.LEFT_HEEL, { x: A.x - 0.02, y: A.y + 0.01 }, feetVis);
  put(PoseLandmarkIndex.LEFT_FOOT_INDEX, { x: A.x + 0.05, y: A.y + 0.01 }, feetVis);
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
const DL_STAND: Pose = [2, 4, 6]; // knee 174, hip 170 — locked out
const DL_BOTTOM: Pose = [10, 60, 55]; // knee 110, hip 65
const DL_MID: Pose = [8, 40, 40]; // knee 132, hip 100 — pulled halfway

/** Plays keyframed poses at 100 ms/frame. When `clock` is given, the
 * mocked wall clock advances in step with the frame timestamps (the
 * production relationship: analysis runs in real time). */
function playDl(
  analyzer: DeadliftAnalyzer,
  keys: { pose: Pose; frames: number }[],
  opts: { feetVis?: number; clock?: { nowMs: number } } = {},
  startT = 0
): number {
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
          from[2] + (key.pose[2] - from[2]) * f,
          opts.feetVis ?? 0.95
        ),
        t,
        1.0
      );
      t += 100;
      if (opts.clock) opts.clock.nowMs += 100;
    }
    prev = key.pose;
  }
  return t;
}

function stallPulls(a: DeadliftAnalyzer, count: number, feetVis = 0.95): void {
  let t = 0;
  for (let pull = 0; pull < count; pull++) {
    t = playDl(
      a,
      [
        { pose: DL_BOTTOM, frames: pull === 0 ? 4 : 2 },
        { pose: DL_MID, frames: 8 },
        { pose: DL_BOTTOM, frames: 8 },
      ],
      { feetVis },
      t
    );
  }
}

describe('P0-3 rep statuses — deadlift lockout verification', () => {
  it('feet visible: stalled pulls are FAILED and reported as Incomplete Lockouts', () => {
    const a = new DeadliftAnalyzer();
    stallPulls(a, 2, 0.95);
    const summary = a.finishSet();
    expect(summary.totalDetectedReps).toBe(2);
    expect(summary.totalValidReps).toBe(0);
    expect(summary.totalUnverifiedReps).toBe(0);
    for (const rep of summary.reps) {
      expect(rep.status).toBe('failed');
      expect(rep.invalidReason).toBe('Lockout not reached');
    }
    const titles = summary.observations.map((o) => o.title);
    expect(titles).toContain('Incomplete Lockouts');
    expect(titles).not.toContain('Lockout Could Not Be Verified');
  });

  it('feet hidden: stalled pulls are UNVERIFIED, never Incomplete Lockouts', () => {
    const a = new DeadliftAnalyzer();
    stallPulls(a, 2, 0.2);
    const summary = a.finishSet();
    expect(summary.totalDetectedReps).toBe(2);
    expect(summary.totalValidReps).toBe(0);
    expect(summary.totalUnverifiedReps).toBe(2);
    for (const rep of summary.reps) {
      expect(rep.status).toBe('unverified');
      // §32: the old assertion here read rep.isValid === false —
      // the boolean collapsed unverified into false; the derived
      // reader keeps the distinction (unverified is NOT valid).
      expect(isValidRep(rep)).toBe(false);
      expect(rep.invalidReason).toBe('Lockout could not be verified (feet out of frame)');
    }
    const titles = summary.observations.map((o) => o.title);
    expect(titles).not.toContain('Incomplete Lockouts');
    const unverified = summary.observations.find((o) => o.title === 'Lockout Could Not Be Verified');
    expect(unverified).toBeDefined();
    expect(unverified!.message).toBe(
      'Could not verify lockout (feet out of frame) on 2 reps.'
    );
    expect(unverified!.count).toBe(2);
    expect(unverified!.repsTriggered).toEqual([1, 2]);
  });

  it('feet hidden: a pull that reaches standing hip angle still cannot be called valid or failed', () => {
    const a = new DeadliftAnalyzer();
    // The hips fully extend (the lifter may well have locked out),
    // but with the ankle invisible the knee angle does not exist, so
    // lockout is unverifiable either way.
    playDl(
      a,
      [
        { pose: DL_BOTTOM, frames: 4 },
        { pose: DL_STAND, frames: 10 },
        { pose: DL_BOTTOM, frames: 10 },
      ],
      { feetVis: 0.2 }
    );
    const summary = a.finishSet();
    expect(summary.totalDetectedReps).toBe(1);
    expect(summary.reps[0].status).toBe('unverified');
    expect(summary.totalUnverifiedReps).toBe(1);
    const unverified = summary.observations.find((o) => o.title === 'Lockout Could Not Be Verified');
    expect(unverified!.message).toBe(
      'Could not verify lockout (feet out of frame) on 1 rep.'
    );
  });

  it('feet visible: a locked-out pull is valid with status valid', () => {
    const a = new DeadliftAnalyzer();
    playDl(a, [
      { pose: DL_BOTTOM, frames: 4 },
      { pose: DL_STAND, frames: 10 },
      { pose: DL_STAND, frames: 3 },
      { pose: DL_BOTTOM, frames: 10 },
    ]);
    const summary = a.finishSet();
    expect(summary.totalValidReps).toBe(1);
    expect(summary.reps[0].status).toBe('valid');
    expect(summary.totalUnverifiedReps).toBe(0);
  });
});

describe('P0-3 tempo — computeTempoSeconds sanity check', () => {
  const rep = (start: number, end: number): FormRep =>
    ({
      repNumber: 1,
      startTime: start,
      endTime: end,
    }) as FormRep;

  it('returns the mean per-rep duration when the windows reconstruct the set', () => {
    // 4 reps of 5 s each inside a 24 s set (4 s of setup/rest).
    const reps = [rep(0, 5000), rep(6000, 11000), rep(12000, 17000), rep(18000, 23000)];
    expect(computeTempoSeconds(reps, 24)).toBe(5);
  });

  it('hides tempo when the windows account for less than half the set (the 0.7 s case)', () => {
    // The audit's recording: 7 detected pulls, 0.7 s windows, 27 s set.
    const reps = Array.from({ length: 7 }, (_, i) => rep(i * 1000, i * 1000 + 700));
    expect(computeTempoSeconds(reps, 27)).toBeNull();
  });

  it('hides tempo when the windows would exceed the set (overlapping timestamps)', () => {
    const reps = [rep(0, 20000), rep(5000, 25000)];
    expect(computeTempoSeconds(reps, 24)).toBeNull();
  });

  it('no reps or no duration → null', () => {
    expect(computeTempoSeconds([], 24)).toBeNull();
    expect(computeTempoSeconds([rep(0, 5000)], 0)).toBeNull();
  });
});

describe('P0-3 tempo — analyzer integration with an aligned clock', () => {
  let nowMs = 1_000_000;

  beforeEach(() => {
    nowMs = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deadlift: back-to-back pulls produce a tempo consistent with the set duration', () => {
    const a = new DeadliftAnalyzer();
    a.reset(); // session clock starts here
    const clock = { nowMs };
    const play = (keys: { pose: Pose; frames: number }[], t: number) =>
      playDl(a, keys, { clock }, t);
    let t = 0;
    for (let repIdx = 0; repIdx < 3; repIdx++) {
      t = play(
        [
          { pose: DL_BOTTOM, frames: repIdx === 0 ? 4 : 2 },
          { pose: DL_STAND, frames: 10 },
          { pose: DL_STAND, frames: 2 },
          { pose: DL_BOTTOM, frames: 8 },
        ],
        t
      );
    }
    void t;
    nowMs = clock.nowMs;
    const summary = a.finishSet();
    expect(summary.totalValidReps).toBe(3);
    expect(summary.tempoSeconds).not.toBeNull();
    const reconstructed = summary.tempoSeconds! * summary.totalDetectedReps;
    expect(reconstructed).toBeGreaterThanOrEqual(0.5 * summary.durationSeconds);
    expect(reconstructed).toBeLessThanOrEqual(1.1 * summary.durationSeconds);
  });

  it('deadlift: a set duration the rep windows cannot reconstruct hides the tempo', () => {
    const a = new DeadliftAnalyzer();
    a.reset();
    const clock = { nowMs };
    let t = 0;
    t = playDl(
      a,
      [
        { pose: DL_BOTTOM, frames: 4 },
        { pose: DL_STAND, frames: 10 },
        { pose: DL_STAND, frames: 2 },
        { pose: DL_BOTTOM, frames: 8 },
      ],
      { clock },
      t
    );
    void t;
    // The set somehow took over a minute longer than the movement
    // windows — the timestamps no longer describe the set.
    nowMs = clock.nowMs + 90_000;
    const summary = a.finishSet();
    expect(summary.totalValidReps).toBe(1);
    expect(summary.tempoSeconds).toBeNull();
  });
});

// ── Squat stream (same construction as average-rep-duration.test.ts).
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

describe('P0-3 tempo/status — squat integration', () => {
  let nowMs = 2_000_000;

  beforeEach(() => {
    nowMs = 2_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('squat reps carry status valid and a reconstructing tempo', () => {
    const analyzer = new SquatAnalyzer();
    analyzer.reset();
    const angles = [170, 170, 150, 130, 110, 90, 70, 55, 50, 50, 70, 90, 110, 130, 150, 160, 170];
    let t = 0;
    for (let r = 0; r < 2; r++) {
      for (const angle of angles) {
        analyzer.processFrame(landmarksForKneeAngle(angle), t);
        t += 100;
        nowMs += 100;
      }
    }
    const summary = analyzer.finishSet();
    expect(summary.totalValidReps).toBe(2);
    expect(summary.reps.every((rep) => rep.status === 'valid')).toBe(true);
    expect(summary.totalUnverifiedReps).toBe(0);
    expect(summary.tempoSeconds).not.toBeNull();
  });
});
