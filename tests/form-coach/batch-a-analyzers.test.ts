/**
 * Batch A analyzers — synthetic-stream unit tests.
 *
 * Streams are forward-kinematic landmark sequences (batch-builders)
 * whose joint angles are exact by construction. These verify the
 * analyzers end-to-end on geometry: clean reps counted, partial reps
 * not counted, and each exercise's headline fault flagging. They do
 * NOT verify anything about real footage — no real clips of these
 * exercises exist yet (see the batch PR description).
 */
import { describe, it, expect } from 'vitest';
import { OverheadPressAnalyzer } from '@/features/form-coach/analyzers/OverheadPressAnalyzer';
import { BentOverRowAnalyzer } from '@/features/form-coach/analyzers/BentOverRowAnalyzer';
import { BicepCurlAnalyzer } from '@/features/form-coach/analyzers/BicepCurlAnalyzer';
import { LungeAnalyzer } from '@/features/form-coach/analyzers/LungeAnalyzer';
import { FormSessionSummary } from '@/features/form-coach/models/form-session.types';
import { ExerciseAnalyzer } from '@/features/form-coach/analyzers/ExerciseAnalyzer';
import {
  StreamFrame,
  pressStream,
  pressFrontStream,
  rowStream,
  curlStream,
  lungeStream,
} from './batch-builders';

function run(analyzer: ExerciseAnalyzer, frames: StreamFrame[]): FormSessionSummary {
  analyzer.reset();
  for (const f of frames) {
    analyzer.processFrame(f.lm, f.t, 1.0);
  }
  return analyzer.finishSet();
}

describe('overhead press analyzer', () => {
  it('counts clean presses with lockout, stamped with elbow minimums', () => {
    const summary = run(new OverheadPressAnalyzer(), pressStream(3));
    expect(summary.exerciseId).toBe('overhead-press');
    expect(summary.exerciseName).toBe('Overhead Press');
    expect(summary.totalDetectedReps).toBe(3);
    expect(summary.totalValidReps).toBe(3);
    for (const rep of summary.reps) {
      expect(rep.isValid).toBe(true);
      expect(rep.lockoutAchieved).toBe(true);
      expect(rep.minElbowAngleDeg).toBeLessThanOrEqual(100);
    }
  });

  it('counts clean presses from the front view too', () => {
    const summary = run(new OverheadPressAnalyzer(), pressFrontStream(3));
    expect(summary.totalValidReps).toBe(3);
  });

  it('does not count presses whose wrists never pass overhead, even with straight elbows', () => {
    const summary = run(new OverheadPressAnalyzer(), pressStream(3, { lockout: false }));
    expect(summary.totalValidReps).toBe(0);
    expect(summary.reps.every((r) => r.lockoutAchieved === false)).toBe(true);
    expect(summary.reps.every((r) => r.invalidReason === 'Lockout not reached')).toBe(true);
    expect(summary.observations.some((o) => o.title === 'Incomplete Lockouts')).toBe(true);
  });

  it('does not count shallow presses that never reach the flexed zone', () => {
    // Elbow only dips to 125° — above the 110° flexed threshold.
    const summary = run(new OverheadPressAnalyzer(), pressStream(3, { bottomElbow: 125 }));
    expect(summary.totalDetectedReps).toBe(0);
  });
});

describe('bent-over row analyzer', () => {
  it('counts full pulls in a held hinge', () => {
    const summary = run(new BentOverRowAnalyzer(), rowStream(3));
    expect(summary.exerciseId).toBe('bent-over-row');
    expect(summary.exerciseName).toBe('Bent-Over Row');
    expect(summary.totalDetectedReps).toBe(3);
    expect(summary.totalValidReps).toBe(3);
    for (const rep of summary.reps) {
      expect(rep.minElbowAngleDeg).toBeLessThanOrEqual(75);
      // The trunk stays hinged: inclination rides high all set.
      expect(rep.maxTorsoInclinationDeg).toBeGreaterThanOrEqual(70);
    }
  });

  it('does not count half pulls that never flex the elbow to the pull zone', () => {
    const summary = run(new BentOverRowAnalyzer(), rowStream(3, { bottomElbow: 120 }));
    expect(summary.totalDetectedReps).toBe(0);
  });

  it('flags pulls that stall and fall back as incomplete attempts, not reps', () => {
    // Pull to 80° then fall back without re-extending past 150°:
    // build a stream whose top end is 130° — the cycle can start
    // (flexed reached) but never completes.
    const summary = run(new BentOverRowAnalyzer(), rowStream(3, { topElbow: 130 }));
    expect(summary.totalValidReps).toBe(0);
    expect(summary.observations.some((o) => o.title === 'Incomplete Pulls')).toBe(true);
  });
});

describe('bicep curl analyzer', () => {
  it('counts clean curls with full range', () => {
    const summary = run(new BicepCurlAnalyzer(), curlStream(3));
    expect(summary.exerciseId).toBe('bicep-curl');
    expect(summary.exerciseName).toBe('Bicep Curl');
    expect(summary.totalDetectedReps).toBe(3);
    expect(summary.totalValidReps).toBe(3);
    for (const rep of summary.reps) {
      expect(rep.minElbowAngleDeg).toBeLessThanOrEqual(62);
      expect(rep.swayDetected).toBeFalsy();
    }
    expect(summary.observations.some((o) => o.title === 'Swing Detected')).toBe(false);
  });

  it('flags swing when the hips travel during the curl', () => {
    const summary = run(new BicepCurlAnalyzer(), curlStream(3, { sway: true }));
    expect(summary.totalValidReps).toBe(3);
    expect(summary.reps.every((r) => r.swayDetected === true)).toBe(true);
    const swing = summary.observations.find((o) => o.title === 'Swing Detected');
    expect(swing).toBeDefined();
    expect(swing!.count).toBe(3);
  });

  it('does not count curls that never reach the flexed zone', () => {
    const summary = run(new BicepCurlAnalyzer(), curlStream(3, { topElbow: 120 }));
    expect(summary.totalDetectedReps).toBe(0);
  });
});

describe('lunge analyzer', () => {
  it('counts descents with front-knee depth', () => {
    const summary = run(new LungeAnalyzer(), lungeStream(3));
    expect(summary.exerciseId).toBe('lunge');
    expect(summary.exerciseName).toBe('Lunge');
    expect(summary.totalDetectedReps).toBe(3);
    expect(summary.totalValidReps).toBe(3);
    for (const rep of summary.reps) {
      expect(rep.minKneeAngleDeg).toBeLessThanOrEqual(95);
      expect(rep.isValid).toBe(true);
    }
  });

  it('does not count shallow descents that never reach the depth zone', () => {
    const summary = run(new LungeAnalyzer(), lungeStream(3, { bottomKnee: 128 }));
    expect(summary.totalDetectedReps).toBe(0);
  });
});
