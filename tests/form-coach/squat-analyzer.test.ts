import { describe, it, expect, beforeEach } from 'vitest';
import { SquatAnalyzer } from '@/features/form-coach/analyzers/SquatAnalyzer';
import { NormalizedLandmark, PoseLandmarkIndex } from '@/features/form-coach/models/pose.types';

function createMockLandmarks(
  kneePosition: 'standing' | 'descending' | 'bottom' | 'ascending',
  options: {
    feetVisible?: boolean;
    side?: 'left' | 'right' | 'front';
  } = {}
): NormalizedLandmark[] {
  const landmarks: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.9,
    presence: 0.9,
  }));

  const feetVisible = options.feetVisible ?? true;
  const side = options.side ?? 'left';

  // Feet visibility
  if (!feetVisible) {
    landmarks[PoseLandmarkIndex.LEFT_FOOT_INDEX].visibility = 0.1;
    landmarks[PoseLandmarkIndex.LEFT_ANKLE].visibility = 0.1;
  } else {
    landmarks[PoseLandmarkIndex.LEFT_FOOT_INDEX] = { x: 0.5, y: 0.9, z: 0, visibility: 0.95, presence: 0.95 };
    landmarks[PoseLandmarkIndex.LEFT_ANKLE] = { x: 0.5, y: 0.85, z: 0, visibility: 0.95, presence: 0.95 };
  }

  if (kneePosition === 'descending') {
    // ~135° knee angle (transitioning into descent)
    landmarks[PoseLandmarkIndex.LEFT_HIP] = { x: 0.44, y: 0.52, z: 0, visibility: 0.95, presence: 0.95 };
    landmarks[PoseLandmarkIndex.LEFT_KNEE] = { x: 0.53, y: 0.65, z: 0, visibility: 0.95, presence: 0.95 };
    landmarks[PoseLandmarkIndex.LEFT_ANKLE] = { x: 0.5, y: 0.85, z: 0, visibility: 0.95, presence: 0.95 };
  } else if (kneePosition === 'bottom') {
    // 85-90° knee angle (deep bottom)
    landmarks[PoseLandmarkIndex.LEFT_HIP] = { x: 0.35, y: 0.65, z: 0, visibility: 0.95, presence: 0.95 };
    landmarks[PoseLandmarkIndex.LEFT_KNEE] = { x: 0.55, y: 0.65, z: 0, visibility: 0.95, presence: 0.95 };
    landmarks[PoseLandmarkIndex.LEFT_ANKLE] = { x: 0.5, y: 0.85, z: 0, visibility: 0.95, presence: 0.95 };
  } else if (kneePosition === 'ascending') {
    // 120° knee angle (mid-ascent)
    landmarks[PoseLandmarkIndex.LEFT_HIP] = { x: 0.42, y: 0.55, z: 0, visibility: 0.95, presence: 0.95 };
    landmarks[PoseLandmarkIndex.LEFT_KNEE] = { x: 0.52, y: 0.65, z: 0, visibility: 0.95, presence: 0.95 };
    landmarks[PoseLandmarkIndex.LEFT_ANKLE] = { x: 0.5, y: 0.85, z: 0, visibility: 0.95, presence: 0.95 };
  } else {
    // Standing upright (180°)
    landmarks[PoseLandmarkIndex.LEFT_HIP] = { x: 0.5, y: 0.45, z: 0, visibility: 0.95, presence: 0.95 };
    landmarks[PoseLandmarkIndex.LEFT_KNEE] = { x: 0.5, y: 0.65, z: 0, visibility: 0.95, presence: 0.95 };
    landmarks[PoseLandmarkIndex.LEFT_ANKLE] = { x: 0.5, y: 0.85, z: 0, visibility: 0.95, presence: 0.95 };
  }

  landmarks[PoseLandmarkIndex.LEFT_SHOULDER] = { x: 0.5, y: 0.2, z: 0, visibility: 0.95, presence: 0.95 };
  landmarks[PoseLandmarkIndex.RIGHT_SHOULDER] = { x: side === 'front' ? 0.75 : 0.52, y: 0.2, z: 0, visibility: side === 'left' ? 0.3 : 0.95, presence: 0.95 };
  landmarks[PoseLandmarkIndex.RIGHT_HIP] = { x: side === 'front' ? 0.72 : 0.52, y: 0.45, z: 0, visibility: side === 'left' ? 0.3 : 0.95, presence: 0.95 };

  return landmarks;
}

/**
 * Builds a 33-landmark pose whose LEFT knee angle is (to within rounding)
 * `kneeAngleDeg`, filmed from the given view. Knee at (0.55, 0.65), ankle
 * straight below it; the hip is placed on the circle around the knee so
 * the hip–knee–ankle interior angle equals the request (aspect 1.0).
 * - view 'left': right-side shoulder/hip are low-visibility (profile).
 * - view 'front': shoulders are wide apart and both sides fully visible.
 */
function landmarksForKneeAngle(
  kneeAngleDeg: number,
  options: { view?: 'left' | 'front'; footVisibility?: number } = {}
): NormalizedLandmark[] {
  const view = options.view ?? 'left';
  const footVis = options.footVisibility ?? 0.95;
  const lm: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.95,
    presence: 0.95,
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
  lm[PoseLandmarkIndex.LEFT_FOOT_INDEX] = { x: 0.6, y: 0.88, z: 0, visibility: footVis, presence: footVis };
  lm[PoseLandmarkIndex.LEFT_SHOULDER] = { ...shoulder, z: 0, visibility: 0.95, presence: 0.95 };

  if (view === 'front') {
    lm[PoseLandmarkIndex.RIGHT_SHOULDER] = { x: shoulder.x + 0.3, y: shoulder.y, z: 0, visibility: 0.95, presence: 0.95 };
    lm[PoseLandmarkIndex.RIGHT_HIP] = { x: hip.x + 0.18, y: hip.y, z: 0, visibility: 0.95, presence: 0.95 };
    lm[PoseLandmarkIndex.RIGHT_KNEE] = { x: knee.x + 0.12, y: knee.y, z: 0, visibility: 0.95, presence: 0.95 };
    lm[PoseLandmarkIndex.RIGHT_ANKLE] = { x: ankle.x + 0.12, y: ankle.y, z: 0, visibility: 0.95, presence: 0.95 };
    lm[PoseLandmarkIndex.RIGHT_FOOT_INDEX] = { x: 0.72, y: 0.88, z: 0, visibility: 0.95, presence: 0.95 };
  } else {
    lm[PoseLandmarkIndex.RIGHT_SHOULDER] = { x: shoulder.x + 0.02, y: shoulder.y, z: 0, visibility: 0.3, presence: 0.95 };
    lm[PoseLandmarkIndex.RIGHT_HIP] = { x: hip.x + 0.02, y: hip.y, z: 0, visibility: 0.3, presence: 0.95 };
  }
  return lm;
}

/** Feeds one full squat rep at 100 ms/frame and returns the end timestamp. */
function feedRep(
  analyzer: SquatAnalyzer,
  startT: number,
  options: { view?: 'left' | 'front'; footVisibilityAt?: (frameInRep: number) => number } = {}
): number {
  const angles = [170, 170, 150, 130, 110, 90, 70, 55, 50, 50, 70, 90, 110, 130, 150, 160, 170];
  let t = startT;
  angles.forEach((angle, i) => {
    analyzer.processFrame(
      landmarksForKneeAngle(angle, {
        view: options.view ?? 'left',
        footVisibility: options.footVisibilityAt?.(i) ?? 0.95,
      }),
      t
    );
    t += 100;
  });
  return t;
}

describe('SquatAnalyzer — correctness fixes (D1/D2/D3)', () => {
  let analyzer: SquatAnalyzer;

  beforeEach(() => {
    analyzer = new SquatAnalyzer({ minRepDurationMs: 400 });
  });

  it('D1: side-filmed reps followed by a front-facing walk-off still summarize as side view, with no front-view guidance', () => {
    let t = 1000;
    t = feedRep(analyzer, t);
    t = feedRep(analyzer, t);
    // Post-set: he turns to face the camera and walks toward it (~1.5 s of
    // front-view standing, then a couple of lost frames). None of these
    // frames belong to a rep, so none may relabel the session.
    for (let i = 0; i < 15; i++) {
      analyzer.processFrame(landmarksForKneeAngle(170, { view: 'front' }), t);
      t += 100;
    }
    analyzer.processFrame(null, t);

    const summary = analyzer.finishSet();
    expect(summary.totalValidReps).toBe(2);
    expect(summary.cameraView).toBe('left');
    expect(summary.observations.map((o) => o.ruleId)).not.toContain('rule-camera-view-front');
  });

  it('D1: a genuinely front-filmed rep raises the camera guidance and summarizes as front', () => {
    let t = 1000;
    t = feedRep(analyzer, t, { view: 'front' });

    const summary = analyzer.finishSet();
    expect(summary.totalValidReps).toBe(1);
    expect(summary.cameraView).toBe('front');
    expect(summary.observations.map((o) => o.ruleId)).toContain('rule-camera-view-front');
  });

  it('D2: a brief foot-visibility dip during a rep does not raise the feet alert', () => {
    let t = 1000;
    // Foot index dips below threshold for just 2 frames mid-rep.
    t = feedRep(analyzer, t, {
      footVisibilityAt: (i) => (i === 5 || i === 6 ? 0.1 : 0.95),
    });

    const summary = analyzer.finishSet();
    expect(summary.totalValidReps).toBe(1);
    expect(summary.observations.map((o) => o.ruleId)).not.toContain('rule-feet-out-of-frame');
  });

  it('D2: feet out of frame for the whole set does raise the feet alert', () => {
    let t = 1000;
    t = feedRep(analyzer, t, { footVisibilityAt: () => 0.1 });

    const summary = analyzer.finishSet();
    expect(summary.observations.map((o) => o.ruleId)).toContain('rule-feet-out-of-frame');
  });

  it('D3: the good-depth evidence cites the measured rep minimum, not the threshold', () => {
    let t = 1000;
    t = feedRep(analyzer, t);

    const summary = analyzer.finishSet();
    const depthObs = summary.observations.find((o) => o.ruleId === 'rule-depth-good');
    expect(depthObs).toBeDefined();
    // The rep bottomed at ~50°; the old evidence froze at the first
    // threshold crossing (~90–95°) and presented it as the measurement.
    expect(depthObs?.evidence).toContain('50°');
    expect(depthObs?.evidence).not.toContain('95°');
    expect(depthObs?.evidence).toContain('target ≤ 90°');
  });

  it('D4: tracking stats distinguish never-tracked from tracked frames', () => {
    analyzer.processFrame(null, 1000);
    analyzer.processFrame(null, 1100);
    expect(analyzer.getTrackingStats()).toEqual({ framesProcessed: 2, framesTracked: 0 });

    analyzer.processFrame(landmarksForKneeAngle(170), 1200);
    expect(analyzer.getTrackingStats()).toEqual({ framesProcessed: 3, framesTracked: 1 });
  });
});

describe('SquatAnalyzer', () => {
  let analyzer: SquatAnalyzer;

  beforeEach(() => {
    analyzer = new SquatAnalyzer({
      minRepDurationMs: 400,
    });
  });

  it('reports readiness as false when feet are outside the camera frame', () => {
    const landmarks = createMockLandmarks('standing', { feetVisible: false });
    const result = analyzer.processFrame(landmarks, 1000);

    expect(result.readiness.isReady).toBe(false);
    expect(result.readiness.reason).toContain('feet and ankles');
  });

  it('reports readiness as true when user is positioned in side profile with feet visible', () => {
    const landmarks = createMockLandmarks('standing', { feetVisible: true, side: 'left' });
    const result = analyzer.processFrame(landmarks, 1000);

    expect(result.readiness.isReady).toBe(true);
    expect(result.detectedSide).toBe('left');
  });

  it('reports the rep running minimum knee angle, not the current frame angle', () => {
    let t = 1000;
    analyzer.processFrame(createMockLandmarks('standing'), t);

    t += 250;
    analyzer.processFrame(createMockLandmarks('descending'), t);

    t += 250;
    const bottom = analyzer.processFrame(createMockLandmarks('bottom'), t);
    expect(bottom.minKneeAngleDeg).not.toBeNull();
    expect(bottom.minKneeAngleDeg).toBe(bottom.currentKneeAngleDeg);

    // On ascent the current angle rises, but the reported minimum must stay
    // at the bottom value — depth cues and the telemetry tile read this.
    t += 250;
    const rising = analyzer.processFrame(createMockLandmarks('ascending'), t);
    expect(rising.currentKneeAngleDeg).toBeGreaterThan(bottom.currentKneeAngleDeg!);
    expect(rising.minKneeAngleDeg).toBe(bottom.minKneeAngleDeg);
  });

  it('completes a set and compiles structured summary without 0-100 score', () => {
    let t = 1000;
    // 1. Standing
    analyzer.processFrame(createMockLandmarks('standing'), t);

    // 2. Descending
    t += 250;
    analyzer.processFrame(createMockLandmarks('descending'), t);

    // 3. Bottom
    t += 250;
    analyzer.processFrame(createMockLandmarks('bottom'), t);

    // 4. Ascending
    t += 250;
    analyzer.processFrame(createMockLandmarks('ascending'), t);

    // 5. Lockout
    t += 250;
    analyzer.processFrame(createMockLandmarks('standing'), t);

    const summary = analyzer.finishSet('workout-123', 0);

    expect(summary.workoutId).toBe('workout-123');
    expect(summary.exerciseId).toBe('squat');
    expect(summary.totalDetectedReps).toBeGreaterThanOrEqual(1);
    expect(summary.totalValidReps).toBeGreaterThanOrEqual(1);
    expect(summary.reps.length).toBeGreaterThanOrEqual(1);
    // Explicit policy check: No arbitrary 0-100 form score field
    expect((summary as any).formScore).toBeUndefined();
  });
});
