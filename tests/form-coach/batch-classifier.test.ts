/**
 * Batch A+B classifier + routing tests.
 *
 * Every stream is a synthetic forward-kinematic landmark sequence
 * (batch-builders) whose joint angles are exact by construction.
 * The discrimination pairs the batch was specced against are first-
 * class cases here: row vs deadlift (hip travel), bench vs push-up
 * (body travel), press vs lateral raise (wrists overhead), curl vs
 * row (torso upright vs hinged), lunge vs squat (split vs symmetric
 * knees). Ambiguous streams must end unknown/insufficient — the
 * classifier never forces a verdict.
 */
import { describe, it, expect } from 'vitest';
import { MovementClassifier } from '@/features/form-coach/services/analysis/MovementClassifier';
import { SquatAnalyzer } from '@/features/form-coach/analyzers/SquatAnalyzer';
import { resolveDetectionOutcome } from '@/features/form-coach/hooks/useFormCoach';
import { NormalizedLandmark } from '@/features/form-coach/models/pose.types';
import {
  StreamFrame,
  feedClassifier,
  sidePose,
  armFromShoulder,
  legFromHip,
  pressStream,
  pressFrontStream,
  rowStream,
  deadliftStream,
  curlStream,
  lungeStream,
  pushUpStream,
  benchStream,
  plankStream,
  raiseStream,
  squatVariantStream,
} from './batch-builders';

function classify(frames: StreamFrame[]) {
  return feedClassifier(frames).classify();
}

describe('batch classifier — each new exercise is detected', () => {
  it('overhead press (side view) → overhead-press', () => {
    const r = classify(pressStream(3));
    expect(r.exercise).toBe('overhead-press');
    expect(r.evidence.overheadFrames).toBeGreaterThanOrEqual(6);
  });

  it('overhead press (front view) → overhead-press', () => {
    const r = classify(pressFrontStream(3));
    expect(r.exercise).toBe('overhead-press');
  });

  it('bent-over row → bent-over-row', () => {
    const r = classify(rowStream(3));
    expect(r.exercise).toBe('bent-over-row');
    expect(r.evidence.hipExtensionFrames).toBe(0);
    expect(r.evidence.elbowFlexFrames).toBeGreaterThanOrEqual(6);
  });

  it('bicep curl → bicep-curl', () => {
    const r = classify(curlStream(3));
    expect(r.exercise).toBe('bicep-curl');
    expect(r.evidence.overheadFrames).toBeLessThanOrEqual(2);
  });

  it('lunge → lunge', () => {
    const r = classify(lungeStream(3));
    expect(r.exercise).toBe('lunge');
    expect(r.evidence.splitStanceFrames).toBeGreaterThanOrEqual(8);
    expect(r.evidence.asymFlexFrames).toBeGreaterThanOrEqual(6);
  });

  it('push-up → push-up', () => {
    const r = classify(pushUpStream(3));
    expect(r.exercise).toBe('push-up');
  });

  it('bench press → bench-press', () => {
    const r = classify(benchStream(3));
    expect(r.exercise).toBe('bench-press');
  });

  it('forearm plank (flexed elbows, static) → plank, not bench press', () => {
    const r = classify(plankStream(30));
    expect(r.exercise).toBe('plank');
  });

  it('lateral raise (front view) → lateral-raise', () => {
    const r = classify(raiseStream(3));
    expect(r.exercise).toBe('lateral-raise');
    expect(r.evidence.overheadFrames).toBe(0);
    expect(r.evidence.shoulderBandFrames).toBeGreaterThanOrEqual(6);
  });
});

describe('batch classifier — discrimination pairs', () => {
  it('row vs deadlift: the deadlift stands the hip back up, the row never does', () => {
    const row = classify(rowStream(3));
    const deadlift = classify(deadliftStream(3));
    expect(row.exercise).toBe('bent-over-row');
    expect(deadlift.exercise).toBe('deadlift');
    expect(deadlift.evidence.hipExtensionFrames).toBeGreaterThan(0);
    expect(row.evidence.hipExtensionFrames).toBe(0);
  });

  it('bench vs push-up: only the push-up body travels', () => {
    expect(classify(pushUpStream(3)).exercise).toBe('push-up');
    expect(classify(benchStream(3)).exercise).toBe('bench-press');
  });

  it('press vs lateral raise: overhead wrists + elbow cycles vs shoulder-height arcs', () => {
    expect(classify(pressStream(3)).exercise).toBe('overhead-press');
    expect(classify(raiseStream(3)).exercise).toBe('lateral-raise');
  });

  it('curl vs row: upright torso with elbow cycles vs held hinge with elbow cycles', () => {
    expect(classify(curlStream(3)).exercise).toBe('bicep-curl');
    expect(classify(rowStream(3)).exercise).toBe('bent-over-row');
  });

  it('lunge vs squat: split-stance single-knee descent vs symmetric squat', () => {
    expect(classify(lungeStream(3)).exercise).toBe('lunge');
    const squat = classify(squatVariantStream('back', 3));
    expect(squat.exercise).toBe('squat');
    expect(squat.evidence.splitStanceFrames).toBe(0);
  });
});

describe('batch classifier — squat variants', () => {
  it('goblet grip (hands together at the chest) → squat + goblet variant', () => {
    const r = classify(squatVariantStream('goblet', 3));
    expect(r.exercise).toBe('squat');
    expect(r.squatVariant).toBe('goblet');
    expect(r.evidence.gobletFrames).toBeGreaterThanOrEqual(5);
  });

  it('front rack (hands high, elbows up) → squat + front variant', () => {
    const r = classify(squatVariantStream('front', 3));
    expect(r.exercise).toBe('squat');
    expect(r.squatVariant).toBe('front');
    expect(r.evidence.frontRackFrames).toBeGreaterThanOrEqual(5);
  });

  it('back-squat grip (hands high, elbows dropped) → squat, no variant stamp', () => {
    const r = classify(squatVariantStream('back', 3));
    expect(r.exercise).toBe('squat');
    expect(r.squatVariant).toBeNull();
  });
});

describe('batch classifier — ambiguous streams are never forced', () => {
  it('shallow lunge (split stance, knees bent but not deep) → lunge family; depth is the analyzer’s call', () => {
    // The stance identifies the exercise family even when no descent
    // reaches the depth zone — routing it to the hinge pile would
    // grade a lunge as a deadlift. The lunge analyzer itself reports
    // zero depth-valid reps for this stream (see batch-a tests).
    const r = classify(lungeStream(3, { bottomKnee: 128 }));
    expect(r.exercise).toBe('lunge');
  });

  it('horizontal stream with shallow elbow movement and no travel → unknown', () => {
    // Supine-ish horizontal body, elbows wobbling 130°–172°: too
    // much elbow range for a plank, no flexed-elbow cycles for a
    // press, no body travel for a push-up.
    const poses: NormalizedLandmark[][] = [];
    for (let i = 0; i < 36; i++) {
      const v = 0.5 + 0.5 * Math.sin((i / 35) * Math.PI * 4);
      const S = { x: 0.3, y: 0.4 };
      const H = { x: 0.56, y: 0.43 };
      const E = { x: 0.22 + 0.085 * v, y: 0.62 - 0.03 * v };
      const W = { x: 0.31, y: 0.78 };
      poses.push(
        sidePose({
          shoulder: S,
          hip: H,
          elbow: E,
          wrist: W,
          knee: { x: 0.7, y: 0.45 },
          ankle: { x: 0.84, y: 0.47 },
        })
      );
    }
    const frames: StreamFrame[] = poses.map((lm, i) => ({ lm, t: i * 100 }));
    expect(classify(frames).exercise).toBe('unknown');
  });

  it('a leg exercise with occluded bottoms (flexing knees, noisy elbows) is NOT read as an arm exercise', () => {
    // The WA0011 lesson, synthetic: tracked top halves of a leg
    // movement — knees clearly flex on a share of frames, hips keep
    // extending to standing, and the elbows (half-occluded behind a
    // bar) wander through flexion/extension. The curl gates alone
    // would trip on the arm noise; the leg-flexion guard refuses.
    const poses: NormalizedLandmark[][] = [];
    for (let i = 0; i < 44; i++) {
      const inDip = i >= 20 && i < 32;
      const kneeDeg = inDip ? 125 : 172;
      const elbowDeg = Math.floor(i / 4) % 2 === 0 ? 100 : 165;
      const S = { x: 0.44, y: 0.32 };
      const H = { x: 0.44, y: 0.56 };
      const leg = legFromHip(H, 90, kneeDeg, -1);
      const arm = armFromShoulder(S, 80, elbowDeg, -1);
      poses.push(sidePose({ shoulder: S, hip: H, ...arm, knee: leg.knee, ankle: leg.ankle }));
    }
    const frames: StreamFrame[] = poses.map((lm, i) => ({ lm, t: i * 100 }));
    const r = classify(frames);
    expect(r.exercise).toBe('insufficient_evidence');
    expect(r.evidence.flexedFrames).toBeGreaterThan(4);
    expect(r.evidence.elbowFlexFrames).toBeGreaterThanOrEqual(6);
  });

  it('a standing-still stream → insufficient_evidence', () => {
    const still = sidePose({
      shoulder: { x: 0.44, y: 0.32 },
      hip: { x: 0.44, y: 0.56 },
      elbow: { x: 0.45, y: 0.46 },
      wrist: { x: 0.45, y: 0.6 },
      knee: { x: 0.45, y: 0.75 },
      ankle: { x: 0.45, y: 0.94 },
    });
    const frames: StreamFrame[] = Array.from({ length: 30 }, (_, i) => ({ lm: still, t: i * 100 }));
    expect(classify(frames).exercise).toBe('insufficient_evidence');
  });
});

describe('batch routing — resolveDetectionOutcome with the new exercises', () => {
  const stats = { framesProcessed: 120, framesTracked: 118 };

  it('auto mode routes a detected bench press to the bench analyzer', () => {
    expect(
      resolveDetectionOutcome({ stats, mode: { type: 'auto' }, detection: 'bench-press' })
    ).toEqual({ kind: 'report', exerciseId: 'bench-press' });
  });

  it('auto mode routes a detected plank to the plank analyzer', () => {
    expect(
      resolveDetectionOutcome({ stats, mode: { type: 'auto' }, detection: 'plank' })
    ).toEqual({ kind: 'report', exerciseId: 'plank' });
  });

  it('preset push-up with a confidently detected bench press is a mismatch choice', () => {
    expect(
      resolveDetectionOutcome({
        stats,
        mode: { type: 'preset', exerciseId: 'push-up' },
        detection: 'bench-press',
      })
    ).toEqual({ kind: 'mismatch', detectedExerciseId: 'bench-press' });
  });

  it('preset lunge with a detected squat is a mismatch (split squats are not squats)', () => {
    expect(
      resolveDetectionOutcome({
        stats,
        mode: { type: 'preset', exerciseId: 'lunge' },
        detection: 'squat',
      })
    ).toEqual({ kind: 'mismatch', detectedExerciseId: 'squat' });
  });

  it('preset squat with a detected squat (any grip variant) reports as squat — no mismatch', () => {
    expect(
      resolveDetectionOutcome({
        stats,
        mode: { type: 'preset', exerciseId: 'squat' },
        detection: 'squat',
      })
    ).toEqual({ kind: 'report', exerciseId: 'squat' });
  });

  it('forced mode (correction re-run) reports the forced exercise regardless of detection', () => {
    expect(
      resolveDetectionOutcome({
        stats,
        mode: { type: 'forced', exerciseId: 'lateral-raise' },
        detection: 'overhead-press',
      })
    ).toEqual({ kind: 'report', exerciseId: 'lateral-raise' });
  });

  it('auto mode with an unknown detection stays unsupported', () => {
    expect(
      resolveDetectionOutcome({ stats, mode: { type: 'auto' }, detection: 'unknown' })
    ).toEqual({ kind: 'unsupported', reason: 'unknown' });
  });
});

describe('squat variant stamping on the analyzer', () => {
  it('a goblet-classified stream graded by the squat analyzer stamps “Goblet Squat”', () => {
    const frames = squatVariantStream('goblet', 3);
    expect(feedClassifier(frames).classify().squatVariant).toBe('goblet');
    const analyzer = new SquatAnalyzer();
    analyzer.reset();
    analyzer.setVariantStamp('goblet');
    for (const f of frames) analyzer.processFrame(f.lm, f.t, 1.0);
    const summary = analyzer.finishSet();
    expect(summary.exerciseId).toBe('squat');
    expect(summary.exerciseName).toBe('Goblet Squat');
    expect(summary.totalValidReps).toBeGreaterThanOrEqual(2);
  });

  it('the same stream without a stamp keeps the back-squat identity', () => {
    const frames = squatVariantStream('goblet', 3);
    const analyzer = new SquatAnalyzer();
    analyzer.reset();
    for (const f of frames) analyzer.processFrame(f.lm, f.t, 1.0);
    const summary = analyzer.finishSet();
    expect(summary.exerciseName).toBe('Barbell Back Squat');
  });

  it('reset clears the variant stamp', () => {
    const analyzer = new SquatAnalyzer();
    analyzer.setVariantStamp('front');
    analyzer.reset();
    for (const f of squatVariantStream('back', 1)) analyzer.processFrame(f.lm, f.t, 1.0);
    expect(analyzer.finishSet().exerciseName).toBe('Barbell Back Squat');
  });
});

describe('classifier instance hygiene', () => {
  it('a fresh classifier carries no batch evidence', () => {
    const c = new MovementClassifier();
    const ev = c.getEvidence();
    expect(ev.horizontalFrames).toBe(0);
    expect(ev.splitStanceFrames).toBe(0);
    expect(ev.overheadFrames).toBe(0);
    expect(ev.gobletFrames).toBe(0);
  });
});
