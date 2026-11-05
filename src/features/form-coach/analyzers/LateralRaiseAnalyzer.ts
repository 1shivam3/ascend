/**
 * ASCEND Form Coach — Lateral Raise Analyzer (Batch B)
 *
 * Straight-arm arcs: the cycle signal is the wrist height (in torso
 * lengths relative to shoulder height), negated into the shared
 * cycle machine — a rep counts when the wrist rises to around
 * shoulder height and returns to the hip. Peak height per rep is
 * stamped as a ratio (0 = exactly shoulder height). Best filmed
 * facing the camera: from the side the arc is mostly depth, which
 * 2D landmarks cannot see. A front raise projects almost identically
 * and is graded as this pattern — the report never claims otherwise.
 */

import { CycleAnalyzerBase, FrameMeasurements, RepBag } from './CycleAnalyzerBase';
import { PoseLandmarkIndex } from '../models/pose.types';
import { FormObservation } from '../models/form-feedback.types';
import { FormRep } from '../models/form-session.types';
import { FeedbackRule } from '../services/analysis/FormFeedbackEngine';
import { swayFromBag } from './BicepCurlAnalyzer';

export const LATERAL_RAISE_ANALYZER_VERSION = '1.0.0';

export class LateralRaiseAnalyzer extends CycleAnalyzerBase {
  readonly exerciseId = 'lateral-raise';
  readonly exerciseName = 'Lateral Raise';
  readonly supportedCameraViews: ('side' | 'front')[] = ['side', 'front'];
  readonly requiredLandmarks: PoseLandmarkIndex[] = [
    PoseLandmarkIndex.LEFT_SHOULDER,
    PoseLandmarkIndex.RIGHT_SHOULDER,
    PoseLandmarkIndex.LEFT_ELBOW,
    PoseLandmarkIndex.RIGHT_ELBOW,
    PoseLandmarkIndex.LEFT_WRIST,
    PoseLandmarkIndex.RIGHT_WRIST,
    PoseLandmarkIndex.LEFT_HIP,
    PoseLandmarkIndex.RIGHT_HIP,
  ];
  protected readonly analyzerVersion = LATERAL_RAISE_ANALYZER_VERSION;
  protected readonly keyLandmarks: PoseLandmarkIndex[] = [...this.requiredLandmarks];

  constructor() {
    super({
      // Signal is −(wrist height ratio): the "flexed" (working) end
      // is the wrist UP at shoulder height (h ≥ −0.15), the completed
      // end is the wrist back down at the hip (h ≤ −0.8).
      flexedAtOrBelow: 0.15,
      completedAtOrAbove: 0.8,
      ascentDelta: 0.08,
      minRepDurationMs: 500,
      requireTopGate: false,
      incompleteReason: 'Shoulder height not reached',
    });
  }

  protected buildRules(): FeedbackRule[] {
    return [
      {
        id: 'rule-raise-height',
        exerciseId: 'lateral-raise',
        title: 'Shoulder Height Reached',
        message: 'Wrists reached shoulder height — full raise.',
        priority: 'low',
        cooldownMs: 3500,
        evaluate: (ctx) =>
          (ctx.phase === 'descending' || ctx.phase === 'bottom') &&
          ctx.wristHeightRatio !== null &&
          ctx.wristHeightRatio !== undefined &&
          ctx.wristHeightRatio >= -0.1,
        formatEvidence: () => 'Wrist measured at shoulder height.',
      },
    ];
  }

  protected measureSignal(m: FrameMeasurements): { signal: number | null } {
    return { signal: m.wristHeightRatio !== null ? -m.wristHeightRatio : null };
  }

  protected decorateRep(rep: FormRep, bag: RepBag): void {
    if (bag.maxWristHeightRatio > -Infinity) {
      rep.peakWristHeightRatio = Math.round(bag.maxWristHeightRatio * 100) / 100;
    }
    rep.maxTorsoInclinationDeg = Math.round(bag.maxTorsoInclination);
    if (swayFromBag(bag)) {
      rep.swayDetected = true;
      rep.observations.push('swing_detected');
    }
  }

  protected aggregateObservations(reps: FormRep[]): FormObservation[] {
    const out: FormObservation[] = [];
    const swung = reps.filter((r) => r.swayDetected);
    if (swung.length > 0) {
      out.push({
        id: 'rule-raise-swing',
        ruleId: 'rule-raise-swing',
        title: 'Swing Detected',
        message:
          'On some reps your hips or shoulders traveled noticeably while you raised — that is momentum lifting the weight. Stand tall, brace, and lift with the shoulders.',
        severity: 'warning',
        count: swung.length,
        evidence: `Hip/shoulder travel above the swing threshold on ${swung.length} of ${reps.length} raises (landmark travel).`,
        repsTriggered: swung.map((r) => r.repNumber),
        limitation: 'Estimated from 2D landmarks — a cue to check against the video, not a force measurement.',
      });
    }
    const incomplete = reps.filter((r) => !r.isValid);
    if (incomplete.length > 0) {
      out.push({
        id: 'rule-raise-incomplete',
        ruleId: 'rule-raise-incomplete',
        title: 'Incomplete Raises',
        message:
          'Some raises stalled and dropped back before the wrists returned to your hips, so they were counted as incomplete attempts, not reps.',
        severity: 'info',
        count: incomplete.length,
        evidence: `Full raise cycle not completed on ${incomplete.length} of ${reps.length} attempts.`,
        repsTriggered: incomplete.map((r) => r.repNumber),
      });
    }
    return out;
  }
}
