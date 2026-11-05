/**
 * ASCEND Form Coach — Overhead Press Analyzer (Batch A)
 *
 * Rep cycle from the elbow angle with a wrist-overhead top gate: a
 * press counts only when the elbows extend AND the wrists actually
 * pass overhead during the ascent — elbow extension alone could be a
 * front raise. Measurements are joint angles and wrist position from
 * 2D landmarks; nothing here claims bar path or load.
 */

import { CycleAnalyzerBase, FrameMeasurements, RepBag } from './CycleAnalyzerBase';
import { PoseLandmarkIndex } from '../models/pose.types';
import { FormObservation } from '../models/form-feedback.types';
import { FormRep } from '../models/form-session.types';
import { FeedbackRule } from '../services/analysis/FormFeedbackEngine';

export const OVERHEAD_PRESS_ANALYZER_VERSION = '1.0.0';

const LOCKOUT_ELBOW_MIN_DEG = 158;
const WRIST_OVERHEAD_MIN = 0.55;

export class OverheadPressAnalyzer extends CycleAnalyzerBase {
  readonly exerciseId = 'overhead-press';
  readonly exerciseName = 'Overhead Press';
  readonly supportedCameraViews: ('side' | 'front')[] = ['side', 'front'];
  readonly requiredLandmarks: PoseLandmarkIndex[] = [
    PoseLandmarkIndex.LEFT_SHOULDER,
    PoseLandmarkIndex.RIGHT_SHOULDER,
    PoseLandmarkIndex.LEFT_ELBOW,
    PoseLandmarkIndex.RIGHT_ELBOW,
    PoseLandmarkIndex.LEFT_WRIST,
    PoseLandmarkIndex.RIGHT_WRIST,
  ];
  protected readonly analyzerVersion = OVERHEAD_PRESS_ANALYZER_VERSION;
  protected readonly keyLandmarks: PoseLandmarkIndex[] = [
    PoseLandmarkIndex.LEFT_SHOULDER,
    PoseLandmarkIndex.RIGHT_SHOULDER,
    PoseLandmarkIndex.LEFT_ELBOW,
    PoseLandmarkIndex.RIGHT_ELBOW,
    PoseLandmarkIndex.LEFT_WRIST,
    PoseLandmarkIndex.RIGHT_WRIST,
  ];

  constructor() {
    super({
      flexedAtOrBelow: 110,
      completedAtOrAbove: LOCKOUT_ELBOW_MIN_DEG,
      ascentDelta: 6,
      minRepDurationMs: 600,
      requireTopGate: true,
      incompleteReason: 'Lockout not reached',
    });
  }

  protected buildRules(): FeedbackRule[] {
    return [
      {
        id: 'rule-press-lockout',
        exerciseId: 'overhead-press',
        title: 'Lockout Reached',
        message: 'Full lockout: arms extended with the weight overhead.',
        priority: 'low',
        cooldownMs: 3500,
        evaluate: (ctx) =>
          ctx.phase === 'ascending' &&
          ctx.currentElbowAngleDeg !== null &&
          ctx.currentElbowAngleDeg !== undefined &&
          ctx.currentElbowAngleDeg >= LOCKOUT_ELBOW_MIN_DEG &&
          ctx.wristHeightRatio !== null &&
          ctx.wristHeightRatio !== undefined &&
          ctx.wristHeightRatio >= WRIST_OVERHEAD_MIN,
        formatEvidence: (ctx) =>
          `Elbow angle ${Math.round(ctx.currentElbowAngleDeg ?? 0)}° with wrists overhead.`,
      },
      {
        id: 'rule-press-lean',
        exerciseId: 'overhead-press',
        title: 'Trunk Lean Observation',
        message:
          'Your trunk leaned well back during the press. A big backward lean usually means the weight is heavy for strict pressing — brace your glutes and ribs down.',
        priority: 'medium',
        cooldownMs: 5000,
        limitation: 'Side-view 2D estimate of trunk inclination only.',
        evaluate: (ctx) =>
          (ctx.phase === 'ascending' || ctx.phase === 'bottom') &&
          ctx.torsoInclinationDeg !== null &&
          ctx.torsoInclinationDeg > 35,
        formatEvidence: (ctx) =>
          `Trunk inclination reached ~${Math.round(ctx.torsoInclinationDeg ?? 0)}° from vertical.`,
      },
    ];
  }

  protected measureSignal(m: FrameMeasurements): { signal: number | null; topGate?: boolean } {
    return {
      signal: m.elbowAngleDeg,
      topGate: m.wristHeightRatio !== null && m.wristHeightRatio >= WRIST_OVERHEAD_MIN,
    };
  }

  protected decorateRep(rep: FormRep, bag: RepBag): void {
    if (bag.minElbow < Infinity) rep.minElbowAngleDeg = Math.round(bag.minElbow);
    rep.maxTorsoInclinationDeg = Math.round(bag.maxTorsoInclination);
  }

  protected aggregateObservations(reps: FormRep[]): FormObservation[] {
    const incomplete = reps.filter((r) => !r.lockoutAchieved);
    if (incomplete.length === 0) return [];
    return [
      {
        id: 'rule-press-incomplete-lockout',
        ruleId: 'rule-press-incomplete-lockout',
        title: 'Incomplete Lockouts',
        message:
          'Some presses ended before your arms fully extended with the weight overhead, so they were counted as incomplete attempts, not reps.',
        severity: 'info',
        count: incomplete.length,
        evidence: `Lockout not reached on ${incomplete.length} of ${reps.length} presses.`,
        repsTriggered: incomplete.map((r) => r.repNumber),
      },
    ];
  }
}
