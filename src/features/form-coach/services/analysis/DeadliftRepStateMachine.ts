/**
 * ASCEND Form Coach — Deadlift Repetition Finite-State Machine
 *
 * Hip-driven counterpart to the (knee-driven) squat RepStateMachine.
 * A conventional deadlift rep cycle: setup (hinged, bar on the floor)
 * → pull (hips extend) → lockout (hips and knees fully extended) →
 * lowering back to setup. A rep COUNTS when it reaches lockout after
 * a genuine hinge; a pull that stalls and returns to setup is recorded
 * as an incomplete attempt (lockoutAchieved: false), never as a rep.
 *
 * Also measures the hips-rise-first pattern: during the early pull,
 * if the hips rise materially while the shoulders barely move, the
 * pull is turning into a stiff-leg lift — flagged on the rep from the
 * measured landmark travel, not inferred.
 */

import { MovementPhase } from '../../models/form-feedback.types';
import { FormRep } from '../../models/form-session.types';

export interface DeadliftRepStateMachineConfig {
  /** Hip angle at/above which the lifter counts as standing tall. */
  standingHipAngleDeg: number; // e.g. 152°
  /** Hip angle at/below which the lifter is in the hinged setup zone. */
  hingeZoneHipAngleDeg: number; // e.g. 118°
  /** Hip extension required at the top for a lockout. */
  lockoutHipAngleDeg: number; // e.g. 160°
  /** Knee extension required at the top for a lockout. */
  lockoutKneeAngleDeg: number; // e.g. 150°
  /** Hip rise above the rep minimum that marks the pull as underway. */
  pullRiseDeltaDeg: number; // e.g. 6°
  /** Hip extension from the bottom at which hips-rise-first is judged. */
  hipsRiseJudgeDeltaDeg: number; // e.g. 15°
  minRepDurationMs: number; // e.g. 700 ms
}

export const DEFAULT_DEADLIFT_CONFIG: DeadliftRepStateMachineConfig = {
  standingHipAngleDeg: 152,
  hingeZoneHipAngleDeg: 118,
  lockoutHipAngleDeg: 160,
  lockoutKneeAngleDeg: 150,
  pullRiseDeltaDeg: 6,
  hipsRiseJudgeDeltaDeg: 15,
  minRepDurationMs: 700,
};

/** Minimum vertical hip travel (normalized units) for a hips-rise
 * judgement — below this the pull has barely started. */
const HIPS_RISE_MIN_TRAVEL = 0.035;
/** Hips must account for at least this share of the combined
 * hip+shoulder rise before the pattern counts as hips-first. */
const HIPS_RISE_DOMINANCE = 0.5;

interface PullSnapshot {
  hipY: number;
  shoulderY: number;
}

export class DeadliftRepStateMachine {
  private phase: MovementPhase = 'standing';
  private attemptNumber = 0;
  private repStartTimeMs: number | null = null;
  private bottomTimeMs: number | null = null;
  private pullStartTimeMs: number | null = null;
  /**
   * Timestamp of the most recent frame at standing/lockout hip angle.
   * A rep's lowering begins when the lifter leaves that position, so
   * repStartTimeMs anchors here (same D5 convention as the squat FSM).
   */
  private lastLockoutTimeMs: number | null = null;

  private minHipAngle: number = 180;
  private minKneeAngle: number = 180;
  private maxTorsoInclination: number = 0;
  private trackingConfidenceAccum: number[] = [];
  /** Hip/shoulder positions at the rep's deepest point — the pull is
   * judged from here for the hips-rise-first pattern. */
  private pullSnapshot: PullSnapshot | null = null;
  private hipsRiseEvaluated = false;
  private hipsRoseFirst = false;

  constructor(private config: DeadliftRepStateMachineConfig = DEFAULT_DEADLIFT_CONFIG) {}

  reset() {
    this.phase = 'standing';
    this.attemptNumber = 0;
    this.repStartTimeMs = null;
    this.bottomTimeMs = null;
    this.pullStartTimeMs = null;
    this.lastLockoutTimeMs = null;
    this.minHipAngle = 180;
    this.minKneeAngle = 180;
    this.maxTorsoInclination = 0;
    this.trackingConfidenceAccum = [];
    this.pullSnapshot = null;
    this.hipsRiseEvaluated = false;
    this.hipsRoseFirst = false;
  }

  getCurrentPhase(): MovementPhase {
    return this.phase;
  }

  getCompletedRepCount(): number {
    return this.attemptNumber;
  }

  /** Running minimum hip angle of the current rep, or null before any
   * frame with a measurable angle in a rep has been processed. */
  getCurrentRepMinHipAngleDeg(): number | null {
    return this.minHipAngle < 180 ? this.minHipAngle : null;
  }

  private beginRep(timestampMs: number) {
    this.repStartTimeMs = this.lastLockoutTimeMs ?? timestampMs;
    this.bottomTimeMs = null;
    this.pullStartTimeMs = null;
    this.minHipAngle = 180;
    this.minKneeAngle = 180;
    this.maxTorsoInclination = 0;
    this.trackingConfidenceAccum = [];
    this.pullSnapshot = null;
    this.hipsRiseEvaluated = false;
    this.hipsRoseFirst = false;
  }

  private buildRep(
    timestampMs: number,
    lockoutAchieved: boolean,
    invalidReason?: string
  ): FormRep {
    const repStart = this.repStartTimeMs ?? timestampMs - 1500;
    const pullStart = this.pullStartTimeMs ?? repStart + 750;
    const bottomTime = this.bottomTimeMs ?? repStart;
    const totalDurationMs = timestampMs - repStart;
    const descentDurationMs = Math.max(0, pullStart - repStart);
    const ascentDurationMs = Math.max(0, timestampMs - pullStart);
    const bottomHoldMs = Math.max(0, pullStart - bottomTime);

    const avgConfidence =
      this.trackingConfidenceAccum.length > 0
        ? this.trackingConfidenceAccum.reduce((a, b) => a + b, 0) /
          this.trackingConfidenceAccum.length
        : 0;

    const isValid =
      lockoutAchieved && totalDurationMs >= this.config.minRepDurationMs;

    this.attemptNumber += 1;
    return {
      repNumber: this.attemptNumber,
      startTime: repStart,
      endTime: timestampMs,
      durationSeconds: Math.round((totalDurationMs / 1000) * 10) / 10,
      descentDurationSeconds: Math.max(0.2, Math.round((descentDurationMs / 1000) * 10) / 10),
      ascentDurationSeconds: Math.max(0.2, Math.round((ascentDurationMs / 1000) * 10) / 10),
      bottomHoldDurationSeconds: Math.round((bottomHoldMs / 1000) * 10) / 10,
      minKneeAngleDeg: Math.round(this.minKneeAngle),
      estimatedDepth: 'unknown',
      maxTorsoInclinationDeg: Math.round(this.maxTorsoInclination),
      trackingConfidence: Math.round(avgConfidence * 100) / 100,
      observations: this.hipsRoseFirst ? ['hips_rose_first'] : [],
      isValid,
      invalidReason: isValid
        ? undefined
        : (invalidReason ?? 'Lockout not reached'),
      // Provisional P0-3 verdict from the measured criteria; the
      // analyzer upgrades a no-lockout 'failed' to 'unverified' when
      // the ankle/foot landmarks were too invisible to judge lockout.
      status: isValid ? 'valid' : 'failed',
      minHipAngleDeg: Math.round(this.minHipAngle),
      lockoutAchieved,
      hipsRoseFirst: this.hipsRoseFirst,
    };
  }

  /**
   * Advances the state machine with one frame of measurements.
   * hipY/shoulderY are the primary side's normalized vertical positions
   * (image coordinates: smaller y = higher up). Returns a finished
   * FormRep when an attempt ends on this frame (lockout or a pull that
   * returned to setup), else null.
   */
  update(
    hipAngleDeg: number | null,
    kneeAngleDeg: number | null,
    torsoInclinationDeg: number | null,
    hipY: number | null,
    shoulderY: number | null,
    trackingConfidence: number,
    timestampMs: number
  ): FormRep | null {
    if (hipAngleDeg === null) {
      this.phase = 'tracking_lost';
      return null;
    }

    if (hipAngleDeg >= this.config.standingHipAngleDeg) {
      this.lastLockoutTimeMs = timestampMs;
    }

    switch (this.phase) {
      case 'tracking_lost': {
        // Resume where the body actually is: back into the hinge, or
        // standing (any in-flight attempt is abandoned, as in the
        // squat machine — a gap in tracking is not evidence).
        if (hipAngleDeg <= this.config.hingeZoneHipAngleDeg + 10) {
          if (this.repStartTimeMs === null) this.beginRep(timestampMs);
          this.phase = 'bottom';
          this.bottomTimeMs = timestampMs;
        } else if (hipAngleDeg >= this.config.standingHipAngleDeg - 5) {
          this.phase = 'standing';
          this.repStartTimeMs = null;
        }
        return null;
      }

      case 'standing': {
        if (hipAngleDeg <= this.config.hingeZoneHipAngleDeg) {
          // Stream (or set) starts already hinged — e.g. the lifter is
          // in setup when the video begins. That is the bottom.
          this.beginRep(timestampMs);
          this.trackRepExtremes(hipAngleDeg, kneeAngleDeg, torsoInclinationDeg, trackingConfidence);
          this.snapshotIfDeepest(hipAngleDeg, hipY, shoulderY);
          this.bottomTimeMs = timestampMs;
          this.phase = 'bottom';
        } else if (hipAngleDeg < this.config.standingHipAngleDeg - 5) {
          this.beginRep(timestampMs);
          this.trackRepExtremes(hipAngleDeg, kneeAngleDeg, torsoInclinationDeg, trackingConfidence);
          this.phase = 'descending';
        }
        return null;
      }

      case 'descending': {
        this.trackRepExtremes(hipAngleDeg, kneeAngleDeg, torsoInclinationDeg, trackingConfidence);
        this.snapshotIfDeepest(hipAngleDeg, hipY, shoulderY);
        if (hipAngleDeg <= this.config.hingeZoneHipAngleDeg) {
          this.bottomTimeMs = timestampMs;
          this.phase = 'bottom';
        } else if (hipAngleDeg >= this.config.lockoutHipAngleDeg) {
          // Shallow dip that never became a setup — not an attempt.
          this.phase = 'standing';
          this.repStartTimeMs = null;
        }
        return null;
      }

      case 'bottom': {
        this.trackRepExtremes(hipAngleDeg, kneeAngleDeg, torsoInclinationDeg, trackingConfidence);
        this.snapshotIfDeepest(hipAngleDeg, hipY, shoulderY);
        if (hipAngleDeg > this.minHipAngle + this.config.pullRiseDeltaDeg) {
          this.pullStartTimeMs = timestampMs;
          this.phase = 'ascending';
        }
        return null;
      }

      case 'ascending': {
        this.trackRepExtremes(hipAngleDeg, kneeAngleDeg, torsoInclinationDeg, trackingConfidence);

        // Hips-rise-first: judged once, early in the pull, from the
        // measured travel since the deepest point.
        if (
          !this.hipsRiseEvaluated &&
          this.pullSnapshot &&
          hipY !== null &&
          shoulderY !== null &&
          hipAngleDeg >= this.minHipAngle + this.config.hipsRiseJudgeDeltaDeg
        ) {
          this.hipsRiseEvaluated = true;
          const hipRise = this.pullSnapshot.hipY - hipY;
          const shoulderRise = this.pullSnapshot.shoulderY - shoulderY;
          if (
            hipRise >= HIPS_RISE_MIN_TRAVEL &&
            hipRise - shoulderRise >= HIPS_RISE_DOMINANCE * hipRise
          ) {
            this.hipsRoseFirst = true;
          }
        }

        if (
          hipAngleDeg >= this.config.lockoutHipAngleDeg &&
          kneeAngleDeg !== null &&
          kneeAngleDeg >= this.config.lockoutKneeAngleDeg
        ) {
          const rep = this.buildRep(timestampMs, true);
          this.phase = 'standing';
          this.repStartTimeMs = null;
          return rep;
        }
        if (hipAngleDeg <= this.minHipAngle + 3) {
          // The pull stalled and the bar returned to the floor without
          // a lockout — an incomplete attempt, counted separately.
          const rep = this.buildRep(timestampMs, false);
          this.bottomTimeMs = timestampMs;
          this.phase = 'bottom';
          // The next attempt starts from this setup.
          this.repStartTimeMs = timestampMs;
          this.pullStartTimeMs = null;
          this.minHipAngle = hipAngleDeg;
          this.minKneeAngle = kneeAngleDeg ?? 180;
          this.maxTorsoInclination = torsoInclinationDeg ?? 0;
          this.trackingConfidenceAccum = [];
          this.pullSnapshot =
            hipY !== null && shoulderY !== null ? { hipY, shoulderY } : null;
          this.hipsRiseEvaluated = false;
          this.hipsRoseFirst = false;
          return rep;
        }
        return null;
      }
    }
    return null;
  }

  private trackRepExtremes(
    hipAngleDeg: number,
    kneeAngleDeg: number | null,
    torsoInclinationDeg: number | null,
    trackingConfidence: number
  ) {
    if (hipAngleDeg < this.minHipAngle) this.minHipAngle = hipAngleDeg;
    if (kneeAngleDeg !== null && kneeAngleDeg < this.minKneeAngle) {
      this.minKneeAngle = kneeAngleDeg;
    }
    if (torsoInclinationDeg !== null && torsoInclinationDeg > this.maxTorsoInclination) {
      this.maxTorsoInclination = torsoInclinationDeg;
    }
    this.trackingConfidenceAccum.push(trackingConfidence);
  }

  private snapshotIfDeepest(hipAngleDeg: number, hipY: number | null, shoulderY: number | null) {
    if (hipAngleDeg <= this.minHipAngle && hipY !== null && shoulderY !== null) {
      this.pullSnapshot = { hipY, shoulderY };
    }
  }
}
