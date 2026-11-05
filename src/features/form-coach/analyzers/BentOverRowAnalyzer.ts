/**
 * ASCEND Form Coach — Bent-Over Row Analyzer (Batch A)
 *
 * The row is a HELD hinge: the hips stay parked while the elbows
 * cycle the pull. The rep signal is the pulling arm's elbow angle
 * (the more-flexed of the two, so a single-arm dumbbell row grades
 * its working side). What separates a row from a deadlift — hip
 * travel — is the classifier's call, made before this analyzer runs;
 * this analyzer grades the pull itself: reps, peak pull (minimum
 * elbow angle), and trunk angle across the set.
 */

import { CycleAnalyzerBase, FrameMeasurements, RepBag } from './CycleAnalyzerBase';
import { PoseLandmarkIndex } from '../models/pose.types';
import { FormObservation } from '../models/form-feedback.types';
import { FormRep } from '../models/form-session.types';
import { FeedbackRule } from '../services/analysis/FormFeedbackEngine';

export const BENT_OVER_ROW_ANALYZER_VERSION = '1.0.0';

export class BentOverRowAnalyzer extends CycleAnalyzerBase {
  readonly exerciseId = 'bent-over-row';
  readonly exerciseName = 'Bent-Over Row';
  readonly supportedCameraViews: ('side' | 'front')[] = ['side'];
  readonly requiredLandmarks: PoseLandmarkIndex[] = [
    PoseLandmarkIndex.LEFT_SHOULDER,
    PoseLandmarkIndex.RIGHT_SHOULDER,
    PoseLandmarkIndex.LEFT_HIP,
    PoseLandmarkIndex.RIGHT_HIP,
    PoseLandmarkIndex.LEFT_ELBOW,
    PoseLandmarkIndex.RIGHT_ELBOW,
    PoseLandmarkIndex.LEFT_WRIST,
    PoseLandmarkIndex.RIGHT_WRIST,
  ];
  protected readonly analyzerVersion = BENT_OVER_ROW_ANALYZER_VERSION;
  protected readonly keyLandmarks: PoseLandmarkIndex[] = [
    PoseLandmarkIndex.LEFT_SHOULDER,
    PoseLandmarkIndex.RIGHT_SHOULDER,
    PoseLandmarkIndex.LEFT_HIP,
    PoseLandmarkIndex.RIGHT_HIP,
    PoseLandmarkIndex.LEFT_ELBOW,
    PoseLandmarkIndex.RIGHT_ELBOW,
    PoseLandmarkIndex.LEFT_WRIST,
    PoseLandmarkIndex.RIGHT_WRIST,
  ];

  constructor() {
    super({
      flexedAtOrBelow: 95,
      completedAtOrAbove: 150,
      ascentDelta: 6,
      minRepDurationMs: 500,
      requireTopGate: false,
      incompleteReason: 'Full pull not reached',
    });
  }

  protected buildRules(): FeedbackRule[] {
    return [
      {
        id: 'rule-row-camera-view-front',
        exerciseId: 'bent-over-row',
        title: 'Camera Angle Guidance',
        message: 'Move camera to side view: the held hinge and pull are best analyzed from perpendicular profile.',
        priority: 'high',
        cooldownMs: 6000,
        limitation: 'Front view causes perspective compression for hip and elbow angles.',
        evaluate: (ctx) => !ctx.sideViewDetected && ctx.trackingConfidence >= 0.5,
        formatEvidence: () => 'Both shoulders and hips are equidistant with no profile displacement.',
      },
      {
        id: 'rule-row-trunk-angle',
        exerciseId: 'bent-over-row',
        title: 'Trunk Angle Observation',
        message:
          'Your trunk measured near-horizontal during the row. A very flat trunk is a harder, more lower-back-demanding position — check that it is the row variation you intend.',
        priority: 'medium',
        cooldownMs: 5000,
        limitation: 'Side-view 2D estimate of trunk inclination only; it cannot assess spinal curvature or load.',
        evaluate: (ctx) =>
          (ctx.phase === 'ascending' || ctx.phase === 'bottom' || ctx.phase === 'descending') &&
          ctx.torsoInclinationDeg !== null &&
          ctx.torsoInclinationDeg > 80,
        formatEvidence: (ctx) =>
          `Trunk inclination reached ~${Math.round(ctx.torsoInclinationDeg ?? 0)}° from vertical.`,
      },
    ];
  }

  protected measureSignal(m: FrameMeasurements): { signal: number | null } {
    const elbows = [m.elbowAngleDeg, m.elbowOtherAngleDeg].filter(
      (v): v is number => v !== null
    );
    return { signal: elbows.length > 0 ? Math.min(...elbows) : null };
  }

  protected decorateRep(rep: FormRep, bag: RepBag): void {
    if (bag.minElbow < Infinity) rep.minElbowAngleDeg = Math.round(bag.minElbow);
    rep.maxTorsoInclinationDeg = Math.round(bag.maxTorsoInclination);
  }

  protected aggregateObservations(reps: FormRep[]): FormObservation[] {
    const incomplete = reps.filter((r) => !r.isValid);
    if (incomplete.length === 0) return [];
    return [
      {
        id: 'rule-row-incomplete-pulls',
        ruleId: 'rule-row-incomplete-pulls',
        title: 'Incomplete Pulls',
        message:
          'Some rows stalled and returned before the arms re-extended, so they were counted as incomplete attempts, not reps.',
        severity: 'info',
        count: incomplete.length,
        evidence: `Full pull not reached on ${incomplete.length} of ${reps.length} rows.`,
        repsTriggered: incomplete.map((r) => r.repNumber),
      },
    ];
  }
}
