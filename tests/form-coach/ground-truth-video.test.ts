/**
 * Ground-truth regression (deep audit, 2026-11-05).
 *
 * The fixture is REAL pose-model output: MediaPipe PoseLandmarker
 * (tasks-vision 0.10.21, pose_landmarker_lite, CPU delegate, IMAGE mode)
 * run over the owner's own test video — side view, 3 deep squats, 478×850,
 * 16.2s — sampled every 200ms (77 of 81 sampled frames tracked).
 *
 * Two defects are pinned here:
 *  - D7: the pose graph never populates `presence` (every real landmark
 *    arrives with presence === 0). The reliability screen used to require
 *    presence ≥ 0.5, so EVERY real landmark was "unreliable", readiness
 *    permanently failed with "feet and ankles must be inside the camera
 *    view", and no real video could ever be analyzed. The test re-adds
 *    presence: 0 to the fixture exactly as the model emits it.
 *  - End-to-end truth: with the screen fixed, the analyzer must reproduce
 *    the known-correct result for this video — 3 valid reps, all
 *    below_parallel — and the D6 movement signature must call it a squat.
 */
import { describe, it, expect } from 'vitest';
import { SquatAnalyzer } from '../../src/features/form-coach/analyzers/SquatAnalyzer';
import { isLandmarkReliable } from '../../src/features/form-coach/services/analysis/LandmarkGeometry';
import fixture from './fixtures/ground-truth-squat-landmarks.json';
import { isValidRep } from '@/features/form-coach/models/form-session.types';

describe('isLandmarkReliable presence semantics (D7)', () => {
  const base = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };

  it('presence 0 (model never populates it) does not block a visible landmark', () => {
    expect(isLandmarkReliable({ ...base, presence: 0 })).toBe(true);
  });

  it('absent presence does not block', () => {
    expect(isLandmarkReliable({ ...base })).toBe(true);
  });

  it('a genuinely populated LOW presence still blocks', () => {
    expect(isLandmarkReliable({ ...base, presence: 0.2 })).toBe(false);
  });

  it('low visibility still blocks regardless of presence', () => {
    expect(isLandmarkReliable({ ...base, visibility: 0.3, presence: 0 })).toBe(false);
  });
});

describe('ground-truth squat video replay', () => {
  it('reproduces 3 valid below-parallel reps and a squat signature', () => {
    const analyzer = new SquatAnalyzer();
    let readyFrames = 0;
    let fedFrames = 0;
    fixture.frames.forEach((frame, k) => {
      if (!frame) {
        analyzer.processFrame(null, k * fixture.frameIntervalMs, fixture.aspectRatio);
        return;
      }
      fedFrames++;
      // Rebuild landmarks exactly as the pipeline receives them from the
      // model — including presence: 0 on every landmark.
      const landmarks = frame.map(([x, y, visibility]) => ({
        x,
        y,
        z: 0,
        visibility,
        presence: 0,
      }));
      const result = analyzer.processFrame(
        landmarks,
        k * fixture.frameIntervalMs,
        fixture.aspectRatio
      );
      if (result.readiness.isReady) readyFrames++;
    });

    expect(fedFrames).toBe(77);
    expect(readyFrames).toBeGreaterThan(60);

    const summary = analyzer.finishSet();
    expect(summary.totalValidReps).toBe(3);
    expect(summary.reps.map((r) => r.estimatedDepth)).toEqual([
      'below_parallel',
      'below_parallel',
      'below_parallel',
    ]);
    expect(summary.reps.every((r) => isValidRep(r))).toBe(true);

    expect(analyzer.getMovementAssessment().signature).toBe('squat');
    expect(analyzer.getMovementAssessment().hingeFrames).toBe(0);
  });
});
