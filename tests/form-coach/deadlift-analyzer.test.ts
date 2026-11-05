import { describe, it, expect } from 'vitest';
import { DeadliftAnalyzer } from '@/features/form-coach/analyzers/DeadliftAnalyzer';
import { NormalizedLandmark, PoseLandmarkIndex } from '@/features/form-coach/models/pose.types';

/**
 * DeadliftAnalyzer — synthetic streams by forward kinematics (same
 * construction as movement-signature.test.ts):
 *   knee angle = 180 - (s + u), hip angle = 180 - (u + v), torso = v.
 * A conventional deadlift cycle: hinged setup (hip ~65°) → pull →
 * lockout (hip ~170°, knee ~174°) → lower back to setup.
 */
function frame(s: number, u: number, v: number): NormalizedLandmark[] {
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
const STAND: Pose = [2, 4, 6];
const BOTTOM: Pose = [10, 60, 55]; // knee 110, hip 65

/** Plays keyframed poses (linear interpolation) at 100 ms/frame. */
function play(analyzer: DeadliftAnalyzer, keys: { pose: Pose; frames: number }[], startT = 0): number {
  let t = startT;
  let prev: Pose | null = null;
  for (const key of keys) {
    const from = prev ?? key.pose;
    for (let i = 0; i < key.frames; i++) {
      const f = key.frames === 1 ? 1 : i / (key.frames - 1 || 1);
      analyzer.processFrame(
        frame(
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

function playFullSet(analyzer: DeadliftAnalyzer, reps = 3): void {
  let t = 0;
  for (let rep = 0; rep < reps; rep++) {
    t = play(analyzer, [
      { pose: BOTTOM, frames: rep === 0 ? 4 : 2 },
      { pose: STAND, frames: 10 },
      { pose: STAND, frames: 3 },
      { pose: BOTTOM, frames: 10 },
      { pose: BOTTOM, frames: 2 },
    ], t);
  }
}

describe('DeadliftAnalyzer — full sets', () => {
  it('counts 3 lockout reps with deadlift identity and hip measurements', () => {
    const a = new DeadliftAnalyzer();
    playFullSet(a);
    const summary = a.finishSet();
    expect(summary.exerciseId).toBe('deadlift');
    expect(summary.exerciseName).toBe('Conventional Deadlift');
    expect(summary.totalValidReps).toBe(3);
    expect(summary.totalDetectedReps).toBe(3);
    expect(summary.reps).toHaveLength(3);
    for (const rep of summary.reps) {
      expect(rep.isValid).toBe(true);
      expect(rep.lockoutAchieved).toBe(true);
      expect(rep.minHipAngleDeg).toBeGreaterThanOrEqual(58);
      expect(rep.minHipAngleDeg).toBeLessThanOrEqual(72);
      expect(rep.estimatedDepth).toBe('unknown'); // depth classes are a squat concept
      expect(rep.hipsRoseFirst).toBe(false);
    }
  });

  it('live frame results expose hip angles for the HUD', () => {
    const a = new DeadliftAnalyzer();
    const bottom = a.processFrame(frame(...BOTTOM), 0, 1.0);
    expect(bottom.currentHipAngleDeg).toBe(65);
    expect(bottom.minHipAngleDeg).toBe(65);
    const stats = a.getTrackingStats();
    expect(stats.framesProcessed).toBe(1);
    expect(stats.framesTracked).toBe(1);
  });
});

describe('DeadliftAnalyzer — incomplete pulls are not reps', () => {
  it('pulls that return to setup without lockout are separate incomplete attempts', () => {
    const a = new DeadliftAnalyzer();
    const MID: Pose = [8, 40, 40]; // knee 132, hip 100 — pulled halfway
    let t = 0;
    for (let pull = 0; pull < 2; pull++) {
      t = play(a, [
        { pose: BOTTOM, frames: pull === 0 ? 4 : 2 },
        { pose: MID, frames: 8 },
        { pose: BOTTOM, frames: 8 },
      ], t);
    }
    const summary = a.finishSet();
    expect(summary.totalValidReps).toBe(0);
    expect(summary.totalDetectedReps).toBe(2);
    expect(summary.reps).toHaveLength(2);
    for (const rep of summary.reps) {
      expect(rep.isValid).toBe(false);
      expect(rep.lockoutAchieved).toBe(false);
      expect(rep.invalidReason).toBe('Lockout not reached');
    }
    expect(summary.observations.map((o) => o.title)).toContain('Incomplete Lockouts');
  });
});

describe('DeadliftAnalyzer — hips-rise-first', () => {
  it('flags a pull where the hips shoot up while the shoulders stay level', () => {
    const a = new DeadliftAnalyzer();
    // Bottom → [10,25,72]: hip opens 65°→83° almost entirely by the
    // hips rising (hip point rises ~0.10 normalized) while the
    // shoulder point stays ~level (rises ~0.03) — the stiff-leg
    // pattern, from the FK geometry.
    let t = play(a, [
      { pose: BOTTOM, frames: 4 },
      { pose: [10, 25, 72], frames: 6 },
      { pose: STAND, frames: 10 },
      { pose: STAND, frames: 3 },
    ]);
    void t;
    const summary = a.finishSet();
    expect(summary.totalValidReps).toBe(1);
    expect(summary.reps[0].hipsRoseFirst).toBe(true);
    expect(summary.reps[0].observations).toContain('hips_rose_first');
    const obs = summary.observations.find((o) => o.title === 'Hips Rose Before Shoulders');
    expect(obs).toBeDefined();
    expect(obs?.repsTriggered).toEqual([1]);
  });

  it('does not flag a normal pull where the chest rises with the hips', () => {
    const a = new DeadliftAnalyzer();
    playFullSet(a, 1);
    const summary = a.finishSet();
    expect(summary.totalValidReps).toBe(1);
    expect(summary.reps[0].hipsRoseFirst).toBe(false);
    expect(summary.observations.map((o) => o.title)).not.toContain('Hips Rose Before Shoulders');
  });
});

describe('DeadliftAnalyzer — tracking accounting', () => {
  it('null frames count as processed but not tracked', () => {
    const a = new DeadliftAnalyzer();
    a.processFrame(null, 0, 1.0);
    a.processFrame(null, 100, 1.0);
    a.processFrame(frame(...BOTTOM), 200, 1.0);
    expect(a.getTrackingStats()).toEqual({ framesProcessed: 3, framesTracked: 1 });
  });

  it('reset clears reps and accounting', () => {
    const a = new DeadliftAnalyzer();
    playFullSet(a, 1);
    expect(a.finishSet().totalValidReps).toBe(1);
    a.reset();
    expect(a.getTrackingStats()).toEqual({ framesProcessed: 0, framesTracked: 0 });
    expect(a.finishSet().totalDetectedReps).toBe(0);
  });
});
