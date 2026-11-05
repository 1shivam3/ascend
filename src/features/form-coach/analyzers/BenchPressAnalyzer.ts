/**
 * ASCEND Form Coach — Bench Press Analyzer (Batch B, best-effort)
 *
 * The user ordered bench press knowing its limits, and the limits
 * are structural: from a side view of a supine lifter, the camera
 * sees elbows and wrists — not the bar, not the chest. So this
 * analyzer grades ONLY what those landmarks honestly support:
 *   - reps (elbow flexion/extension cycles over a still body),
 *   - lockout (elbow near extension at the top of the cycle),
 *   - descent depth PROXY (the rep's minimum elbow angle),
 *   - wrist-path drift (horizontal wrist travel in image space).
 * It cannot verify the bar touched the chest, and it cannot measure
 * the bar path relative to the torso — every report says so, in the
 * standing limits observation below. That stillness of the body is
 * also what separates bench from push-ups in the classifier.
 */

import { CycleAnalyzerBase, FrameMeasurements, RepBag } from './CycleAnalyzerBase';
import { PoseLandmarkIndex } from '../models/pose.types';
import { FormObservation } from '../models/form-feedback.types';
import { FormRep } from '../models/form-session.types';
import { FeedbackRule } from '../services/analysis/FormFeedbackEngine';

export const BENCH_PRESS_ANALYZER_VERSION = '1.0.0';

const LOCKOUT_ELBOW_MIN_DEG = 155;
const DRIFT_FLAG_MIN_RATIO = 0.35;

export class BenchPressAnalyzer extends CycleAnalyzerBase {
  readonly exerciseId = 'bench-press';
  readonly exerciseName = 'Bench Press';
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
  protected readonly analyzerVersion = BENCH_PRESS_ANALYZER_VERSION;
  protected readonly keyLandmarks: PoseLandmarkIndex[] = [...this.requiredLandmarks];

  constructor() {
    super({
      flexedAtOrBelow: 100,
      completedAtOrAbove: LOCKOUT_ELBOW_MIN_DEG,
      ascentDelta: 6,
      minRepDurationMs: 600,
      requireTopGate: false,
      incompleteReason: 'Lockout not reached',
    });
  }

  protected buildRules(): FeedbackRule[] {
    return [
      {
        id: 'rule-bench-camera-view-front',
        exerciseId: 'bench-press',
        title: 'Camera Angle Guidance',
        message: 'Move camera to side view, level with the bench: bench press is analyzed from perpendicular profile.',
        priority: 'high',
        cooldownMs: 6000,
        limitation: 'Front view causes perspective compression for elbow angles.',
        evaluate: (ctx) => !ctx.sideViewDetected && ctx.trackingConfidence >= 0.5,
        formatEvidence: () => 'Both shoulders and hips are equidistant with no profile displacement.',
      },
      {
        id: 'rule-bench-lockout',
        exerciseId: 'bench-press',
        title: 'Lockout Reached',
        message: 'Full lockout: elbows extended at the top.',
        priority: 'low',
        cooldownMs: 3500,
        evaluate: (ctx) =>
          ctx.phase === 'ascending' &&
          ctx.currentElbowAngleDeg !== null &&
          ctx.currentElbowAngleDeg !== undefined &&
          ctx.currentElbowAngleDeg >= LOCKOUT_ELBOW_MIN_DEG,
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
    rep.maxTorsoInclinationDeg = Math.round(bag.maxTorsoInclination);
    if (bag.torsoLen > 0 && bag.wristXMax > bag.wristXMin) {
      rep.wristDriftRatio = Math.round(((bag.wristXMax - bag.wristXMin) / bag.torsoLen) * 100) / 100;
    }
  }

  protected aggregateObservations(reps: FormRep[]): FormObservation[] {
    const out: FormObservation[] = [];
    if (reps.length > 0) {
      // The hard limits ride along with every bench report — the
      // numbers in it are elbow/wrist proxies and are labeled as such.
      out.push({
        id: 'rule-bench-limits',
        ruleId: 'rule-bench-limits',
        title: 'What This Report Cannot Check',
        message:
          'Bench press is graded from elbow and wrist landmarks only. Form Coach cannot verify the bar touched your chest, and the wrist drift below is the wrist’s path across the camera image — not the bar path relative to your torso.',
        severity: 'info',
        count: 1,
        evidence: 'Measurements in this report are elbow angles and wrist positions from a side view.',
        repsTriggered: [],
        limitation: 'No bar, chest, or load measurement exists in pose landmarks.',
      });
    }
    const drifted = reps.filter((r) => (r.wristDriftRatio ?? 0) >= DRIFT_FLAG_MIN_RATIO);
    if (drifted.length > 0) {
      out.push({
        id: 'rule-bench-drift',
        ruleId: 'rule-bench-drift',
        title: 'Wrist Path Drift',
        message:
          'On some reps your wrist traveled noticeably sideways across the image during the press — a drifting press path. Aim to press in one consistent groove.',
        severity: 'warning',
        count: drifted.length,
        evidence: `Horizontal wrist travel ≥ ${DRIFT_FLAG_MIN_RATIO} torso lengths on ${drifted.length} of ${reps.length} reps (image space).`,
        repsTriggered: drifted.map((r) => r.repNumber),
        limitation: 'Image-space proxy from wrist landmarks only — not the bar path relative to the torso.',
      });
    }
    const incomplete = reps.filter((r) => !r.lockoutAchieved);
    if (incomplete.length > 0) {
      out.push({
        id: 'rule-bench-incomplete-lockout',
        ruleId: 'rule-bench-incomplete-lockout',
        title: 'Incomplete Lockouts',
        message:
          'Some presses ended before your elbows fully extended at the top, so they were counted as incomplete attempts, not reps.',
        severity: 'info',
        count: incomplete.length,
        evidence: `Lockout not reached on ${incomplete.length} of ${reps.length} presses.`,
        repsTriggered: incomplete.map((r) => r.repNumber),
      });
    }
    return out;
  }
}
