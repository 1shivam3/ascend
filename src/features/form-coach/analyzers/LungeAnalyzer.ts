/**
 * ASCEND Form Coach — Lunge / Split Squat Analyzer (Batch A)
 *
 * Upright single-leg pattern: the cycle signal is the MORE-flexed
 * knee — in a split stance that is the working leg's descent, whether
 * the set alternates sides or stays on one. Checks: reps, front-knee
 * depth (the rep's minimum knee angle), and torso lean. Which leg was
 * front is not always knowable from a side view (the far leg is
 * partly occluded), so the report counts descents and says so.
 */

import { CycleAnalyzerBase, FrameMeasurements, RepBag } from './CycleAnalyzerBase';
import { PoseLandmarkIndex } from '../models/pose.types';
import { FormObservation } from '../models/form-feedback.types';
import { FormRep } from '../models/form-session.types';
import { FeedbackRule } from '../services/analysis/FormFeedbackEngine';

export const LUNGE_ANALYZER_VERSION = '1.0.0';

export class LungeAnalyzer extends CycleAnalyzerBase {
  readonly exerciseId = 'lunge';
  readonly exerciseName = 'Lunge';
  readonly supportedCameraViews: ('side' | 'front')[] = ['side'];
  readonly requiredLandmarks: PoseLandmarkIndex[] = [
    PoseLandmarkIndex.LEFT_HIP,
    PoseLandmarkIndex.RIGHT_HIP,
    PoseLandmarkIndex.LEFT_KNEE,
    PoseLandmarkIndex.RIGHT_KNEE,
    PoseLandmarkIndex.LEFT_ANKLE,
    PoseLandmarkIndex.RIGHT_ANKLE,
    PoseLandmarkIndex.LEFT_HEEL,
    PoseLandmarkIndex.RIGHT_HEEL,
  ];
  protected readonly analyzerVersion = LUNGE_ANALYZER_VERSION;
  protected readonly keyLandmarks: PoseLandmarkIndex[] = [...this.requiredLandmarks];

  constructor() {
    super({
      flexedAtOrBelow: 115,
      completedAtOrAbove: 150,
      ascentDelta: 6,
      minRepDurationMs: 600,
      requireTopGate: false,
      incompleteReason: 'Full depth not reached',
    });
  }

  protected buildRules(): FeedbackRule[] {
    return [
      {
        id: 'rule-lunge-camera-view-front',
        exerciseId: 'lunge',
        title: 'Camera Angle Guidance',
        message: 'Move camera to side view: lunge depth is best analyzed from perpendicular profile.',
        priority: 'high',
        cooldownMs: 6000,
        limitation: 'Front view causes perspective compression for knee flexion.',
        evaluate: (ctx) => !ctx.sideViewDetected && ctx.trackingConfidence >= 0.5,
        formatEvidence: () => 'Both shoulders and hips are equidistant with no profile displacement.',
      },
      {
        id: 'rule-lunge-torso-lean',
        exerciseId: 'lunge',
        title: 'Torso Lean Observation',
        message:
          'Your torso leaned well forward during the lunge. Some lean is normal; a big lean usually means the step was long or the load pulled you forward — check your step length.',
        priority: 'medium',
        cooldownMs: 5000,
        limitation: 'Side-view 2D estimate of trunk inclination only.',
        evaluate: (ctx) =>
          (ctx.phase === 'bottom' || ctx.phase === 'ascending') &&
          ctx.torsoInclinationDeg !== null &&
          ctx.torsoInclinationDeg > 42,
        formatEvidence: (ctx) =>
          `Torso inclination reached ~${Math.round(ctx.torsoInclinationDeg ?? 0)}° from vertical.`,
      },
    ];
  }

  protected measureSignal(m: FrameMeasurements): { signal: number | null } {
    return { signal: m.minKneeAngleDeg };
  }

  protected hudFields(
    m: FrameMeasurements,
    minSignal: number | null
  ): Partial<
    Pick<
      import('./ExerciseAnalyzer').AnalyzerFrameResult,
      'currentKneeAngleDeg' | 'minKneeAngleDeg'
    >
  > {
    return {
      currentKneeAngleDeg: m.minKneeAngleDeg !== null ? Math.round(m.minKneeAngleDeg) : null,
      minKneeAngleDeg: minSignal !== null ? Math.round(minSignal) : null,
    };
  }

  protected decorateRep(rep: FormRep, bag: RepBag): void {
    if (bag.minKnee < Infinity) rep.minKneeAngleDeg = Math.round(bag.minKnee);
    rep.maxTorsoInclinationDeg = Math.round(bag.maxTorsoInclination);
  }

  protected aggregateObservations(reps: FormRep[]): FormObservation[] {
    const incomplete = reps.filter((r) => !r.isValid);
    if (incomplete.length === 0) return [];
    return [
      {
        id: 'rule-lunge-incomplete',
        ruleId: 'rule-lunge-incomplete',
        title: 'Incomplete Descents',
        message:
          'Some descents stalled and dropped back before you stood fully up, so they were counted as incomplete attempts, not reps.',
        severity: 'info',
        count: incomplete.length,
        evidence: `Full descent cycle not completed on ${incomplete.length} of ${reps.length} attempts.`,
        repsTriggered: incomplete.map((r) => r.repNumber),
      },
    ];
  }
}
