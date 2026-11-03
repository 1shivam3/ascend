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
