import { describe, it, expect } from 'vitest';
import { MovementClassifier } from '@/features/form-coach/services/analysis/MovementClassifier';
import { resolveDetectionOutcome } from '@/features/form-coach/hooks/useFormCoach';
import { NormalizedLandmark, PoseLandmarkIndex } from '@/features/form-coach/models/pose.types';
import fixture from './fixtures/ground-truth-squat-landmarks.json';

/**
 * Auto-detect classifier — synthetic streams built by forward
 * kinematics from joint parameters (shin tilt s, thigh-back u, torso
 * lean v, degrees), yielding exactly:
 *   knee interior angle = 180 - (s + u)
 *   hip  interior angle = 180 - (u + v)
 *   torso inclination   = v
 * (the movement-signature.test.ts construction), extended with a wrist:
 * 'high' = at the shoulder (bar on the back), 'low' = hanging below
 * the hip (deadlift grip), 'hidden' = unreliable so the frame must
 * fall back to its angle class.
 */
type Hand = 'high' | 'low' | 'hidden';

function frame(s: number, u: number, v: number, hand: Hand = 'high'): NormalizedLandmark[] {
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
  // Wrist + elbow on the primary side.
  if (hand === 'high') {
    put(PoseLandmarkIndex.LEFT_WRIST, { x: S.x + 0.02, y: S.y + 0.01 });
    put(PoseLandmarkIndex.LEFT_ELBOW, { x: S.x + 0.05, y: S.y + 0.08 });
  } else if (hand === 'low') {
    put(PoseLandmarkIndex.LEFT_WRIST, { x: K.x + 0.04, y: H.y + 0.16 });
    put(PoseLandmarkIndex.LEFT_ELBOW, { x: (S.x + K.x) / 2 + 0.03, y: (S.y + H.y) / 2 + 0.06 });
  } else {
    put(PoseLandmarkIndex.LEFT_WRIST, { x: K.x + 0.04, y: H.y + 0.16 }, 0.2);
    put(PoseLandmarkIndex.LEFT_ELBOW, { x: (S.x + K.x) / 2, y: (S.y + H.y) / 2 }, 0.2);
  }
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

function play(
  c: MovementClassifier,
  keys: { pose: Pose; frames: number; hand?: Hand }[],
): void {
  let prev: Pose | null = null;
  let prevHand: Hand = 'high';
  for (const key of keys) {
    const from = prev ?? key.pose;
    const hand: Hand = key.hand ?? prevHand;
    for (let i = 0; i < key.frames; i++) {
      const f = key.frames === 1 ? 1 : i / (key.frames - 1 || 1);
      c.processFrame(
        frame(
          from[0] + (key.pose[0] - from[0]) * f,
          from[1] + (key.pose[1] - from[1]) * f,
          from[2] + (key.pose[2] - from[2]) * f,
          hand
        ),
        1.0
      );
    }
    prev = key.pose;
    prevHand = hand;
  }
}

function playSquatSet(c: MovementClassifier, reps = 3): void {
  for (let rep = 0; rep < reps; rep++) {
    play(c, [
      { pose: STAND, frames: rep === 0 ? 4 : 2, hand: 'high' },
      { pose: [25, 80, 35], frames: 10 },
      { pose: [25, 80, 35], frames: 2 },
      { pose: STAND, frames: 10 },
    ]);
  }
}

function playDeadliftSet(c: MovementClassifier, bottom: Pose, reps = 3): void {
  for (let rep = 0; rep < reps; rep++) {
    play(c, [
      { pose: bottom, frames: rep === 0 ? 4 : 3, hand: 'low' },
      { pose: STAND, frames: 10 },
      { pose: STAND, frames: 3 },
      { pose: bottom, frames: 10 },
      { pose: bottom, frames: 2 },
    ]);
  }
}

describe('movement classifier — supported lifts are detected', () => {
  it('clear squat pattern → squat', () => {
    const c = new MovementClassifier();
    playSquatSet(c);
    const result = c.classify();
    expect(result.exercise).toBe('squat');
    expect(result.evidence.squatFrames).toBeGreaterThanOrEqual(10);
    expect(result.evidence.assessedFrames).toBeGreaterThanOrEqual(20);
  });

  it('clear conventional deadlift pattern → deadlift', () => {
    const c = new MovementClassifier();
    // Bottom: knee 117, hip 67 — pure hinge angles, hands low.
    playDeadliftSet(c, [8, 55, 58]);
    const result = c.classify();
    expect(result.exercise).toBe('deadlift');
    expect(result.evidence.hingeFrames).toBeGreaterThanOrEqual(10);
  });

  it('deep-knee deadlift (squat geometry, deadlift grip) → deadlift — the WA0002 pattern', () => {
    const c = new MovementClassifier();
    // Bottom: knee 71, hip 63 — by angles alone this is a squat bottom
    // (differential 8). The hands hang at the bar, and that is what
    // makes it a deadlift.
    playDeadliftSet(c, [47, 62, 55]);
    const result = c.classify();
    expect(result.exercise).toBe('deadlift');
    expect(result.evidence.deadliftFrames).toBeGreaterThan(result.evidence.squatFrames);
  });

  it('deadlift with unmeasurable wrists still detects from hinge angles alone', () => {
    const c = new MovementClassifier();
    for (let rep = 0; rep < 3; rep++) {
      play(c, [
        { pose: [8, 55, 58], frames: rep === 0 ? 4 : 3, hand: 'hidden' },
        { pose: STAND, frames: 10 },
        { pose: STAND, frames: 3 },
        { pose: [8, 55, 58], frames: 10 },
        { pose: [8, 55, 58], frames: 2 },
      ]);
    }
    expect(c.classify().exercise).toBe('deadlift');
  });

  it('Romanian deadlift routes to deadlift (documented look-alike)', () => {
    const c = new MovementClassifier();
    for (let rep = 0; rep < 3; rep++) {
      play(c, [
        { pose: STAND, frames: rep === 0 ? 4 : 2, hand: 'low' },
        { pose: [5, 25, 60], frames: 14 }, // knee 150, hip 95 — hinge
        { pose: [5, 25, 60], frames: 4 },
        { pose: STAND, frames: 10 },
      ]);
    }
    expect(c.classify().exercise).toBe('deadlift');
  });

  it('real ground-truth squat fixture → squat', () => {
    const c = new MovementClassifier();
    for (const f of fixture.frames) {
      if (!f) {
        c.processFrame(null, fixture.aspectRatio);
        continue;
      }
      c.processFrame(
        f.map(([x, y, visibility]) => ({ x, y, z: 0, visibility, presence: 0 })),
        fixture.aspectRatio
      );
    }
    const result = c.classify();
    expect(result.exercise).toBe('squat');
    expect(result.evidence.framesTracked).toBe(77);
  });
});

describe('movement classifier — honest non-verdicts', () => {
  it('standing still → insufficient_evidence (measurable person, no movement evidence)', () => {
    const c = new MovementClassifier();
    play(c, [{ pose: STAND, frames: 40, hand: 'low' }]);
    const result = c.classify();
    expect(result.exercise).toBe('insufficient_evidence');
    expect(result.evidence.assessedFrames).toBeGreaterThanOrEqual(20);
    expect(result.evidence.deadliftFrames + result.evidence.squatFrames).toBe(0);
  });

  it('balanced mixed evidence → unknown (neither pattern dominates)', () => {
    const c = new MovementClassifier();
    // Alternate single bent frames: hinge+low (deadlift) and
    // deep+high (squat), 11 vs 9 — shares 0.55 / 0.45, both below
    // their dominance bars.
    for (let i = 0; i < 11; i++) {
      c.processFrame(frame(8, 55, 58, 'low'), 1.0);
      if (i < 9) c.processFrame(frame(25, 80, 35, 'high'), 1.0);
    }
    const result = c.classify();
    expect(result.exercise).toBe('unknown');
    expect(result.evidence.deadliftFrames).toBe(11);
    expect(result.evidence.squatFrames).toBe(9);
  });

  it('front-view stream → insufficient_evidence (profile-only measurement)', () => {
    const c = new MovementClassifier();
    const frontFrame = (): NormalizedLandmark[] => {
      const lm: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({
        x: 0.5, y: 0.5, z: 0, visibility: 0.95, presence: 0.95,
      }));
      const put = (idx: number, x: number, y: number) => {
        lm[idx] = { x, y, z: 0, visibility: 0.95, presence: 0.95 };
      };
      put(PoseLandmarkIndex.LEFT_SHOULDER, 0.35, 0.3);
      put(PoseLandmarkIndex.RIGHT_SHOULDER, 0.65, 0.3);
      put(PoseLandmarkIndex.LEFT_HIP, 0.42, 0.55);
      put(PoseLandmarkIndex.RIGHT_HIP, 0.58, 0.55);
      put(PoseLandmarkIndex.LEFT_KNEE, 0.42, 0.75);
      put(PoseLandmarkIndex.RIGHT_KNEE, 0.58, 0.75);
      put(PoseLandmarkIndex.LEFT_ANKLE, 0.42, 0.95);
      put(PoseLandmarkIndex.RIGHT_ANKLE, 0.58, 0.95);
      return lm;
    };
    for (let i = 0; i < 40; i++) c.processFrame(frontFrame(), 1.0);
    const result = c.classify();
    expect(result.exercise).toBe('insufficient_evidence');
    expect(result.evidence.assessedFrames).toBe(0);
    expect(result.evidence.framesTracked).toBe(40);
  });

  it('too few frames → insufficient_evidence', () => {
    const c = new MovementClassifier();
    play(c, [{ pose: [25, 80, 35], frames: 5, hand: 'high' }]);
    expect(c.classify().exercise).toBe('insufficient_evidence');
  });

  it('reset clears all evidence', () => {
    const c = new MovementClassifier();
    playSquatSet(c);
    expect(c.classify().exercise).toBe('squat');
    c.reset();
    expect(c.classify().exercise).toBe('insufficient_evidence');
    expect(c.getEvidence()).toEqual({
      framesProcessed: 0,
      framesTracked: 0,
      assessedFrames: 0,
      hingeFrames: 0,
      deepKneeFrames: 0,
      deadliftFrames: 0,
      squatFrames: 0,
    });
  });
});

describe('resolveDetectionOutcome — auto-detect routing', () => {
  const tracked = { framesProcessed: 200, framesTracked: 190 };

  it('auto: detected exercises route to their analyzer', () => {
    expect(
      resolveDetectionOutcome({ stats: tracked, mode: { type: 'auto' }, detection: 'deadlift' })
    ).toEqual({ kind: 'report', exerciseId: 'deadlift' });
    expect(
      resolveDetectionOutcome({ stats: tracked, mode: { type: 'auto' }, detection: 'squat' })
    ).toEqual({ kind: 'report', exerciseId: 'squat' });
  });

  it('auto: unknown and insufficient_evidence decline — no analyzer is forced', () => {
    expect(
      resolveDetectionOutcome({ stats: tracked, mode: { type: 'auto' }, detection: 'unknown' })
    ).toEqual({ kind: 'unsupported', reason: 'unknown' });
    expect(
      resolveDetectionOutcome({
        stats: tracked,
        mode: { type: 'auto' },
        detection: 'insufficient_evidence',
      })
    ).toEqual({ kind: 'unsupported', reason: 'insufficient_evidence' });
  });

  it('tracking failure takes precedence over any detection', () => {
    expect(
      resolveDetectionOutcome({
        stats: { framesProcessed: 200, framesTracked: 0 },
        mode: { type: 'auto' },
        detection: 'deadlift',
      })
    ).toEqual({ kind: 'no-tracking' });
    expect(
      resolveDetectionOutcome({
        stats: { framesProcessed: 300, framesTracked: 3 },
        mode: { type: 'preset', exerciseId: 'squat' },
        detection: 'squat',
      })
    ).toEqual({ kind: 'no-tracking' });
  });

  it('preset: agreement or no confident call reports as the preset', () => {
    expect(
      resolveDetectionOutcome({
        stats: tracked,
        mode: { type: 'preset', exerciseId: 'deadlift' },
        detection: 'deadlift',
      })
    ).toEqual({ kind: 'report', exerciseId: 'deadlift' });
    expect(
      resolveDetectionOutcome({
        stats: tracked,
        mode: { type: 'preset', exerciseId: 'deadlift' },
        detection: 'insufficient_evidence',
      })
    ).toEqual({ kind: 'report', exerciseId: 'deadlift' });
  });

  it('preset: a confident call for the OTHER lift is a mismatch, not a silent grade', () => {
    expect(
      resolveDetectionOutcome({
        stats: tracked,
        mode: { type: 'preset', exerciseId: 'squat' },
        detection: 'deadlift',
      })
    ).toEqual({ kind: 'mismatch', detectedExerciseId: 'deadlift' });
    expect(
      resolveDetectionOutcome({
        stats: tracked,
        mode: { type: 'preset', exerciseId: 'deadlift' },
        detection: 'squat',
      })
    ).toEqual({ kind: 'mismatch', detectedExerciseId: 'squat' });
  });

  it('forced (user correction) always reports as the chosen exercise', () => {
    expect(
      resolveDetectionOutcome({
        stats: tracked,
        mode: { type: 'forced', exerciseId: 'deadlift' },
        detection: 'squat',
      })
    ).toEqual({ kind: 'report', exerciseId: 'deadlift' });
  });
});
