/**
 * Batch B analyzers — synthetic-stream unit tests (see the Batch A
 * file header for what synthetic verification does and does not
 * establish; no real footage exists for these exercises yet).
 */
import { describe, it, expect } from 'vitest';
import { PushUpAnalyzer } from '@/features/form-coach/analyzers/PushUpAnalyzer';
import { LateralRaiseAnalyzer } from '@/features/form-coach/analyzers/LateralRaiseAnalyzer';
import { PlankAnalyzer } from '@/features/form-coach/analyzers/PlankAnalyzer';
import { BenchPressAnalyzer } from '@/features/form-coach/analyzers/BenchPressAnalyzer';
import { FormSessionSummary } from '@/features/form-coach/models/form-session.types';
import { ExerciseAnalyzer } from '@/features/form-coach/analyzers/ExerciseAnalyzer';
import {
  StreamFrame,
  pushUpStream,
  raiseStream,
  plankStream,
  benchStream,
} from './batch-builders';

function run(analyzer: ExerciseAnalyzer, frames: StreamFrame[]): FormSessionSummary {
  analyzer.reset();
  for (const f of frames) {
    analyzer.processFrame(f.lm, f.t, 1.0);
  }
  return analyzer.finishSet();
}

describe('push-up analyzer', () => {
  it('counts clean push-ups with depth and a straight body line', () => {
    const summary = run(new PushUpAnalyzer(), pushUpStream(3));
    expect(summary.exerciseId).toBe('push-up');
    expect(summary.exerciseName).toBe('Push-Up');
    expect(summary.totalDetectedReps).toBe(3);
    expect(summary.totalValidReps).toBe(3);
    for (const rep of summary.reps) {
      expect(rep.minElbowAngleDeg).toBeLessThanOrEqual(100);
      expect(rep.bodyLineDeviationDeg).toBeLessThan(10);
      expect(rep.lockoutAchieved).toBe(true);
    }
  });

  it('flags reps whose body line bends well away from straight', () => {
    const summary = run(new PushUpAnalyzer(), pushUpStream(3, { sag: true }));
    expect(summary.totalValidReps).toBe(3);
    const flagged = summary.observations.find((o) => o.title === 'Body Line Deviation');
    expect(flagged).toBeDefined();
    expect(flagged!.count).toBe(3);
    for (const rep of summary.reps) {
      expect(rep.bodyLineDeviationDeg).toBeGreaterThanOrEqual(25);
    }
  });
});

describe('lateral raise analyzer', () => {
  it('counts raises that reach shoulder height', () => {
    const summary = run(new LateralRaiseAnalyzer(), raiseStream(3));
    expect(summary.exerciseId).toBe('lateral-raise');
    expect(summary.exerciseName).toBe('Lateral Raise');
    expect(summary.totalDetectedReps).toBe(3);
    expect(summary.totalValidReps).toBe(3);
    for (const rep of summary.reps) {
      // Peak wrist within a tenth of a torso length of shoulder height.
      expect(rep.peakWristHeightRatio).toBeGreaterThanOrEqual(-0.15);
      expect(rep.swayDetected).toBeFalsy();
    }
  });

  it('does not count raises that stop well below shoulder height', () => {
    // Peak base direction capped at 35° — wrist peaks ~0.6 torso
    // lengths below the shoulder, outside the completion zone.
    const summary = run(new LateralRaiseAnalyzer(), raiseStream(3, { peakBaseDeg: 35 }));
    expect(summary.totalValidReps).toBe(0);
  });

  it('flags swing when the hips travel during the raise', () => {
    const summary = run(new LateralRaiseAnalyzer(), raiseStream(3, { sway: true }));
    expect(summary.totalValidReps).toBe(3);
    expect(summary.reps.every((r) => r.swayDetected === true)).toBe(true);
    expect(summary.observations.some((o) => o.title === 'Swing Detected')).toBe(true);
  });
});

describe('plank analyzer', () => {
  it('measures a hold: duration and aligned share, zero reps', () => {
    const summary = run(new PlankAnalyzer(), plankStream(25, { dtMs: 250 }));
    expect(summary.exerciseId).toBe('plank');
    expect(summary.exerciseName).toBe('Plank');
    expect(summary.totalDetectedReps).toBe(0);
    expect(summary.reps).toHaveLength(0);
    expect(summary.holdDurationSeconds).toBe(6);
    expect(summary.alignedHoldPercent).toBe(100);
    expect(summary.observations.some((o) => o.title === 'Hold Measured')).toBe(true);
  });

  it('reports a sagging hold as mostly unaligned', () => {
    const summary = run(new PlankAnalyzer(), plankStream(25, { sag: true, dtMs: 250 }));
    expect(summary.holdDurationSeconds).toBe(6);
    expect(summary.alignedHoldPercent).toBe(0);
    const hold = summary.observations.find((o) => o.title === 'Hold Measured');
    expect(hold).toBeDefined();
    expect(hold!.severity).toBe('warning');
  });

  it('a brief position check is not reported as a hold', () => {
    const summary = run(new PlankAnalyzer(), plankStream(8, { dtMs: 250 }));
    expect(summary.holdDurationSeconds).toBeLessThan(3);
    expect(summary.observations.some((o) => o.title === 'No Hold Measured')).toBe(true);
  });
});

describe('bench press analyzer', () => {
  it('counts clean presses and always states what it cannot check', () => {
    const summary = run(new BenchPressAnalyzer(), benchStream(3));
    expect(summary.exerciseId).toBe('bench-press');
    expect(summary.exerciseName).toBe('Bench Press');
    expect(summary.totalDetectedReps).toBe(3);
    expect(summary.totalValidReps).toBe(3);
    for (const rep of summary.reps) {
      expect(rep.minElbowAngleDeg).toBeLessThanOrEqual(100);
      expect(rep.lockoutAchieved).toBe(true);
      expect(rep.wristDriftRatio).toBeLessThan(0.35);
    }
    const limits = summary.observations.find((o) => o.title === 'What This Report Cannot Check');
    expect(limits).toBeDefined();
    expect(limits!.message).toContain('chest');
    expect(summary.observations.some((o) => o.title === 'Wrist Path Drift')).toBe(false);
  });

  it('flags large horizontal wrist drift across reps', () => {
    const summary = run(new BenchPressAnalyzer(), benchStream(3, { drift: true }));
    expect(summary.totalValidReps).toBe(3);
    const drift = summary.observations.find((o) => o.title === 'Wrist Path Drift');
    expect(drift).toBeDefined();
    expect(drift!.count).toBe(3);
    for (const rep of summary.reps) {
      expect(rep.wristDriftRatio).toBeGreaterThanOrEqual(0.35);
    }
  });
});
