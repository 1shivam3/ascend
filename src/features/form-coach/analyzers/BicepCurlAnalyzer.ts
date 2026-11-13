/**
 * ASCEND Form Coach — Bicep Curl Analyzer (Batch A)
 *
 * Upright elbow-flexion cycles. The signal is the more-flexed elbow,
 * so alternating dumbbell curls count each arm's curl as it comes.
 * The swing check is a measurement, not a vibe: a rep is flagged
 * when the hips or shoulders travel measurably (in torso lengths)
 * during it — the momentum signature of a swung curl.
 */

import { CycleAnalyzerBase, FrameMeasurements, RepBag } from './CycleAnalyzerBase';
import { PoseLandmarkIndex } from '../models/pose.types';
import { FormObservation } from '../models/form-feedback.types';
import { FormRep , getRepStatus } from '../models/form-session.types';
import { FeedbackRule } from '../services/analysis/FormFeedbackEngine';

export const BICEP_CURL_ANALYZER_VERSION = '1.0.0';

/** Hip/shoulder travel (in torso lengths) that counts as swing. */
const SWAY_HIP_TRAVEL_RATIO = 0.22;
const SWAY_SHOULDER_TRAVEL_RATIO = 0.28;

export function swayFromBag(bag: RepBag): boolean {
  if (bag.torsoLen <= 0) return false;
  const hipTravel = bag.hipXMax > bag.hipXMin ? bag.hipXMax - bag.hipXMin : 0;
  const shoulderTravel =
    bag.shoulderXMax > bag.shoulderXMin ? bag.shoulderXMax - bag.shoulderXMin : 0;
  return (
    hipTravel >= SWAY_HIP_TRAVEL_RATIO * bag.torsoLen ||
    shoulderTravel >= SWAY_SHOULDER_TRAVEL_RATIO * bag.torsoLen
  );
}

export class BicepCurlAnalyzer extends CycleAnalyzerBase {
  readonly exerciseId = 'bicep-curl';
  readonly exerciseName = 'Bicep Curl';
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
  protected readonly analyzerVersion = BICEP_CURL_ANALYZER_VERSION;
  protected readonly keyLandmarks: PoseLandmarkIndex[] = [...this.requiredLandmarks];

  constructor() {
    super({
      flexedAtOrBelow: 95,
      completedAtOrAbove: 150,
      ascentDelta: 6,
      minRepDurationMs: 500,
      requireTopGate: false,
      incompleteReason: 'Full curl not reached',
    });
  }

  protected buildRules(): FeedbackRule[] {
    return [
      {
        id: 'rule-curl-full-extension',
        exerciseId: 'bicep-curl',
        title: 'Full Extension Reached',
        message: 'Arms fully extended at the bottom — full range on every rep.',
        priority: 'low',
        cooldownMs: 3500,
        evaluate: (ctx) =>
          ctx.phase === 'ascending' &&
          ctx.currentElbowAngleDeg !== null &&
          ctx.currentElbowAngleDeg !== undefined &&
          ctx.currentElbowAngleDeg >= 160,
        formatEvidence: (ctx) =>
          `Elbow angle ${Math.round(ctx.currentElbowAngleDeg ?? 0)}° at the bottom of the rep.`,
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
        id: 'rule-curl-swing',
        ruleId: 'rule-curl-swing',
        title: 'Swing Detected',
        message:
          'On some reps your hips or shoulders traveled noticeably while you curled — that is momentum doing part of the lift. Pin your upper arms, brace, and let the elbows do the work.',
        severity: 'warning',
        count: swung.length,
        evidence: `Hip/shoulder travel above the swing threshold on ${swung.length} of ${reps.length} curls (side-view landmark travel).`,
        repsTriggered: swung.map((r) => r.repNumber),
        limitation: 'Estimated from 2D landmarks — a cue to check against the video, not a force measurement.',
      });
    }
    const incomplete = reps.filter((r) => getRepStatus(r) === 'failed');
    if (incomplete.length > 0) {
      out.push({
        id: 'rule-curl-incomplete',
        ruleId: 'rule-curl-incomplete',
        title: 'Incomplete Curls',
        message:
          'Some curls stalled and dropped back before the arms re-extended, so they were counted as incomplete attempts, not reps.',
        severity: 'info',
        count: incomplete.length,
        evidence: `Full curl cycle not completed on ${incomplete.length} of ${reps.length} attempts.`,
        repsTriggered: incomplete.map((r) => r.repNumber),
      });
    }
    return out;
  }
}
