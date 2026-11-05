import { describe, it, expect } from 'vitest';
import { SquatAnalyzer } from '@/features/form-coach/analyzers/SquatAnalyzer';
import { resolveAnalysisOutcome } from '@/features/form-coach/hooks/useFormCoach';
import { NormalizedLandmark, PoseLandmarkIndex } from '@/features/form-coach/models/pose.types';

/**
 * D6 — movement signature: the squat analyzer must not grade a hip hinge
 * as a squat. Frames are built by forward kinematics from joint
 * parameters (shin tilt s, thigh-back u, torso lean v, degrees) at
 * aspect 1.0, which yield, exactly:
 *   knee interior angle = 180 - (s + u)
 *   hip  interior angle = 180 - (u + v)
 *   torso inclination   = v
 * A squat flexes knee and hip together (small knee–hip differential);
 * a deadlift/RDL folds the hip deeply while the knee stays comparatively
 * straight (large differential). Sequences below are calibrated to
 * those published patterns.
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
  const off = (p: { x: number; y: number }) => ({ x: p.x + 0.015, y: p.y });
  put(PoseLandmarkIndex.RIGHT_SHOULDER, off(S), 0.3);
  put(PoseLandmarkIndex.RIGHT_HIP, off(H), 0.3);
  put(PoseLandmarkIndex.RIGHT_KNEE, off(K), 0.3);
  put(PoseLandmarkIndex.RIGHT_ANKLE, off(A), 0.3);
  put(PoseLandmarkIndex.RIGHT_HEEL, { x: A.x + 0.015, y: A.y + 0.01 }, 0.3);
  put(PoseLandmarkIndex.RIGHT_FOOT_INDEX, { x: A.x + 0.06, y: A.y + 0.01 }, 0.3);
  return lm;
}

type Pose = [number, number, number];
const STAND: Pose = [2, 4, 6];

/** Plays keyframed poses (linear interpolation) at 100 ms/frame. */
function play(analyzer: SquatAnalyzer, keys: { pose: Pose; frames: number }[], startT = 0): number {
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

function playSquatSet(analyzer: SquatAnalyzer, reps = 3): void {
  let t = 0;
  for (let rep = 0; rep < reps; rep++) {
    t = play(analyzer, [
      { pose: STAND, frames: rep === 0 ? 4 : 2 },
      { pose: [25, 80, 35], frames: 10 }, // descend to deep bottom: knee 75, hip 65
      { pose: [25, 80, 35], frames: 2 },
      { pose: STAND, frames: 10 },
    ], t);
  }
}

function playDeadliftSet(analyzer: SquatAnalyzer, bottom: Pose, reps = 3): void {
  let t = 0;
  for (let rep = 0; rep < reps; rep++) {
    t = play(analyzer, [
      { pose: bottom, frames: rep === 0 ? 4 : 3 },
      { pose: STAND, frames: 10 },
      { pose: STAND, frames: 3 },
      { pose: bottom, frames: 10 },
      { pose: bottom, frames: 2 },
    ], t);
  }
}

describe('movement signature (D6) — FK calibration', () => {
  it('produces the intended knee angle and torso inclination', () => {
    const a = new SquatAnalyzer();
    const deadliftBottom = a.processFrame(frame(14, 66, 58), 0, 1.0);
    expect(Math.abs((deadliftBottom.currentKneeAngleDeg ?? 0) - 100)).toBeLessThanOrEqual(3);
    expect(Math.abs((deadliftBottom.torsoInclinationDeg ?? 0) - 58)).toBeLessThanOrEqual(3);
    const squatBottom = a.processFrame(frame(25, 80, 35), 100, 1.0);
    expect(Math.abs((squatBottom.currentKneeAngleDeg ?? 0) - 75)).toBeLessThanOrEqual(3);
  });
});

describe('movement signature (D6) — hinge patterns are not squats', () => {
  it('deep-knee deadlift set: signature not_squat (this set internally counts "squat" reps — the pre-fix symptom)', () => {
    const a = new SquatAnalyzer();
    // Bottom: knee 100, hip 56, differential 44 — a deadlift whose setup
    // knee bend reaches the squat state machine's bottom zone.
    playDeadliftSet(a, [14, 66, 58]);
    const assessment = a.getMovementAssessment();
    expect(assessment.signature).toBe('not_squat');
    expect(assessment.hingeFrames).toBeGreaterThanOrEqual(10);
    expect(assessment.deepKneeFrames).toBeLessThan(assessment.hingeFrames);
    // What the owner saw before the fix: the same frames produce a
    // confident squat report. The hook now diverts on the signature
    // before this summary is ever shown or saved.
    const summary = a.finishSet();
    expect(summary.exerciseName).toBe('Barbell Back Squat');
    expect(summary.totalValidReps).toBeGreaterThan(0);
    expect(summary.observations.map((o) => o.title)).toContain('Torso Inclination');
  });

  it('conventional deadlift set (min knee ~117): signature not_squat', () => {
    const a = new SquatAnalyzer();
    // Bottom: knee 117, hip 67, differential 50.
    playDeadliftSet(a, [8, 55, 58]);
    const assessment = a.getMovementAssessment();
    expect(assessment.signature).toBe('not_squat');
    expect(assessment.deepKneeFrames).toBe(0);
  });

  it('Romanian deadlift set (knees stay ~150): signature not_squat even though no rep ever triggers', () => {
    const a = new SquatAnalyzer();
    let t = 0;
    for (let rep = 0; rep < 3; rep++) {
      t = play(a, [
        { pose: STAND, frames: rep === 0 ? 4 : 2 },
        { pose: [5, 25, 60], frames: 14 }, // lower: knee 150, hip 95, differential 55
        { pose: [5, 25, 60], frames: 4 },
        { pose: STAND, frames: 10 },
      ], t);
    }
    const assessment = a.getMovementAssessment();
    expect(assessment.signature).toBe('not_squat');
    expect(a.finishSet().totalValidReps).toBe(0);
  });
});

describe('movement signature (D6) — squats stay squats', () => {
  it('deep squat set: signature squat, valid reps at below-parallel depth', () => {
    const a = new SquatAnalyzer();
    playSquatSet(a);
    const assessment = a.getMovementAssessment();
    expect(assessment.signature).toBe('squat');
    expect(assessment.hingeFrames).toBe(0);
    const summary = a.finishSet();
    expect(summary.totalValidReps).toBe(3);
    expect(summary.reps.every((r) => r.estimatedDepth === 'below_parallel')).toBe(true);
  });

  it('good-morning squat set: NOT diverted — deep knee flexion dominates the hinge-like bottom frames', () => {
    const a = new SquatAnalyzer();
    let t = 0;
    for (let rep = 0; rep < 3; rep++) {
      t = play(a, [
        { pose: STAND, frames: rep === 0 ? 4 : 2 },
        { pose: [15, 45, 30], frames: 4 },
        { pose: [20, 58, 40], frames: 4 },  // knee 102, hip 82, diff 20 → deep evidence
        { pose: [22, 70, 55], frames: 3 },  // knee 88, hip 55, diff 33 → deep evidence
        { pose: [24, 78, 62], frames: 2 },  // bottom: knee 78, hip 40, diff 38 → hinge-like
        { pose: [22, 70, 55], frames: 3 },
        { pose: [20, 58, 40], frames: 4 },
        { pose: STAND, frames: 6 },
      ], t);
    }
    const assessment = a.getMovementAssessment();
    expect(assessment.signature).not.toBe('not_squat');
    expect(assessment.signature).toBe('squat');
    expect(assessment.hingeFrames).toBeGreaterThan(0); // the bottom really is hinge-like…
    expect(assessment.deepKneeFrames).toBeGreaterThan(assessment.hingeFrames); // …but the set is a squat
  });

  it('quarter-squat set: insufficient evidence — the shallow-squat report path is preserved', () => {
    const a = new SquatAnalyzer();
    let t = 0;
    for (let rep = 0; rep < 3; rep++) {
      t = play(a, [
        { pose: STAND, frames: rep === 0 ? 4 : 2 },
        { pose: [8, 32, 18], frames: 8 }, // bottom: knee 140, hip 130 — neither signature
        { pose: [8, 32, 18], frames: 2 },
        { pose: STAND, frames: 8 },
      ], t);
    }
    expect(a.getMovementAssessment().signature).toBe('insufficient_evidence');
  });

  it('mostly-squat set with one hinge rep mixed in: not diverted', () => {
    const a = new SquatAnalyzer();
    playSquatSet(a, 2);
    playDeadliftSet(a, [14, 66, 58], 1);
    const assessment = a.getMovementAssessment();
    expect(assessment.signature).toBe('squat');
  });

  it('standing-only stream: insufficient evidence', () => {
    const a = new SquatAnalyzer();
    play(a, [{ pose: STAND, frames: 40 }]);
    expect(a.getMovementAssessment().signature).toBe('insufficient_evidence');
  });

  it('reset clears the signature accounting', () => {
    const a = new SquatAnalyzer();
    playDeadliftSet(a, [14, 66, 58]);
    expect(a.getMovementAssessment().signature).toBe('not_squat');
    a.reset();
    expect(a.getMovementAssessment()).toEqual({
      signature: 'insufficient_evidence',
      assessedFrames: 0,
      hingeFrames: 0,
      deepKneeFrames: 0,
    });
  });
});

describe('resolveAnalysisOutcome (D6 routing)', () => {
  const tracked = { framesProcessed: 200, framesTracked: 190 };

  it('routes a positively-hinge set to not-squat', () => {
    expect(resolveAnalysisOutcome(tracked, 'not_squat')).toBe('not-squat');
  });

  it('keeps the report for squat and unjudged signatures', () => {
    expect(resolveAnalysisOutcome(tracked, 'squat')).toBe('report');
    expect(resolveAnalysisOutcome(tracked, 'insufficient_evidence')).toBe('report');
    expect(resolveAnalysisOutcome(tracked, undefined)).toBe('report');
  });

  it('tracking failure takes precedence over the movement signature', () => {
    expect(resolveAnalysisOutcome({ framesProcessed: 200, framesTracked: 0 }, 'not_squat')).toBe('no-tracking');
    expect(resolveAnalysisOutcome({ framesProcessed: 300, framesTracked: 3 }, 'not_squat')).toBe('no-tracking');
  });
});
