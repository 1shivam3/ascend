/**
 * ASCEND Form Coach — Push-Up Analyzer (Batch B)
 *
 * The body is the weight: reps are elbow cycles performed by a
 * near-horizontal body that travels with them (that travel is what
 * separates a push-up from a bench press — the classifier's call).
 * Checks: reps, depth (minimum elbow angle), and the body line —
 * the shoulder–hip–ankle deviation from straight, which is where
 * sagging hips and piked hips show up in side-view landmarks.
 */

import { CycleAnalyzerBase, FrameMeasurements, RepBag } from './CycleAnalyzerBase';
import { PoseLandmarkIndex } from '../models/pose.types';
import { FormObservation } from '../models/form-feedback.types';
import { FormRep } from '../models/form-session.types';
import { FeedbackRule } from '../services/analysis/FormFeedbackEngine';

export const PUSH_UP_ANALYZER_VERSION = '1.0.0';

const BODY_LINE_FLAG_MIN_DEG = 25;

export class PushUpAnalyzer extends CycleAnalyzerBase {
  readonly exerciseId = 'push-up';
  readonly exerciseName = 'Push-Up';
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
    PoseLandmarkIndex.LEFT_ANKLE,
    PoseLandmarkIndex.RIGHT_ANKLE,
  ];
  protected readonly analyzerVersion = PUSH_UP_ANALYZER_VERSION;
  protected readonly keyLandmarks: PoseLandmarkIndex[] = [...this.requiredLandmarks];

  constructor() {
    super({
      flexedAtOrBelow: 100,
      completedAtOrAbove: 150,
      ascentDelta: 6,
      minRepDurationMs: 500,
      requireTopGate: false,
      incompleteReason: 'Lockout not reached',
    });
  }

  protected buildRules(): FeedbackRule[] {
    return [
      {
        id: 'rule-pushup-body-line',
        exerciseId: 'push-up',
        title: 'Body Line Observation',
        message:
          'Your shoulder–hip–ankle line bent noticeably during the rep — hips sagging or piked break the straight plank line a push-up should keep.',
        priority: 'medium',
        cooldownMs: 5000,
        limitation: 'Side-view 2D estimate of the body line only.',
        evaluate: (ctx) =>
          (ctx.phase === 'bottom' || ctx.phase === 'ascending' || ctx.phase === 'descending') &&
          ctx.bodyLineDeviationDeg !== null &&
          ctx.bodyLineDeviationDeg !== undefined &&
          ctx.bodyLineDeviationDeg >= 28,
        formatEvidence: (ctx) =>
          `Body line deviated ~${Math.round(ctx.bodyLineDeviationDeg ?? 0)}° from straight.`,
      },
      {
        id: 'rule-pushup-lockout',
        exerciseId: 'push-up',
        title: 'Lockout Reached',
        message: 'Arms fully extended at the top — full rep.',
        priority: 'low',
        cooldownMs: 3500,
        evaluate: (ctx) =>
          ctx.phase === 'ascending' &&
          ctx.currentElbowAngleDeg !== null &&
          ctx.currentElbowAngleDeg !== undefined &&
          ctx.currentElbowAngleDeg >= 155,
        formatEvidence: (ctx) =>
          `Elbow angle ${Math.round(ctx.currentElbowAngleDeg ?? 0)}° at the top.`,
      },
    ];
  }

  protected measureSignal(m: FrameMeasurements): { signal: number | null } {
    return { signal: m.elbowAngleDeg };
  }

  protected decorateRep(rep: FormRep, bag: RepBag): void {
    if (bag.minElbow < Infinity) rep.minElbowAngleDeg = Math.round(bag.minElbow);
    rep.bodyLineDeviationDeg = Math.round(bag.maxBodyLineDeviation);
    rep.maxTorsoInclinationDeg = Math.round(bag.maxTorsoInclination);
  }

  protected aggregateObservations(reps: FormRep[]): FormObservation[] {
    const out: FormObservation[] = [];
    const bent = reps.filter((r) => (r.bodyLineDeviationDeg ?? 0) >= BODY_LINE_FLAG_MIN_DEG);
    if (bent.length > 0) {
      out.push({
        id: 'rule-pushup-line-aggregate',
        ruleId: 'rule-pushup-line-aggregate',
        title: 'Body Line Deviation',
        message:
          'On some reps your shoulder–hip–ankle line bent well away from straight — hips sagging toward the floor or piked up. Brace your midsection and move as one plank.',
        severity: 'warning',
        count: bent.length,
        evidence: `Body line deviated ≥ ${BODY_LINE_FLAG_MIN_DEG}° on ${bent.length} of ${reps.length} reps (side-view landmarks).`,
        repsTriggered: bent.map((r) => r.repNumber),
        limitation: 'The deviation is measured, but landmarks alone cannot say whether the hips sagged or piked on a given rep in every camera setup — check the flagged reps against the video.',
      });
    }
    const incomplete = reps.filter((r) => !r.lockoutAchieved);
    if (incomplete.length > 0) {
      out.push({
        id: 'rule-pushup-incomplete',
        ruleId: 'rule-pushup-incomplete',
        title: 'Incomplete Lockouts',
        message:
          'Some push-ups ended before your arms fully extended at the top, so they were counted as incomplete attempts, not reps.',
        severity: 'info',
        count: incomplete.length,
        evidence: `Lockout not reached on ${incomplete.length} of ${reps.length} push-ups.`,
        repsTriggered: incomplete.map((r) => r.repNumber),
      });
    }
    return out;
  }
}
