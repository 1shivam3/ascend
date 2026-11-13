/**
 * ASCEND Form Coach — Cycle Repetition Finite-State Machine
 *
 * Shared rep machine for the batch analyzers (overhead press,
 * bent-over row, bicep curl, lunge, push-up, lateral raise, bench
 * press). Each of those movements is one scalar signal cycling
 * between a flexed zone and a completed zone:
 *
 *   rest (signal ≥ completed) → descending → bottom (signal ≤ flexed)
 *   → ascending → completed (signal ≥ completed again) = one rep.
 *
 * The signal is the joint angle that drives the movement (elbow for
 * the arm lifts, front knee for the lunge) — or, for the lateral
 * raise, the wrist-height ratio negated so "flexed" still means the
 * working end of the cycle. Validity mirrors the deadlift machine's
 * discipline: a cycle counts only when it genuinely reached the
 * flexed zone AND returned to completion (plus an optional per-frame
 * top gate — the overhead press requires the wrist to actually pass
 * overhead during the ascent, not just the elbow to straighten). A
 * cycle that stalls and falls back into the flexed zone is emitted
 * as an incomplete attempt with the analyzer's reason, never as a
 * rep; a shallow dip that never reaches the flexed zone is not an
 * attempt at all. Domain measurements (lockout, sway, drift…) are
 * attached by the owning analyzer, which tracks them per rep and
 * decorates the emitted FormRep.
 */

import { MovementPhase } from '../../models/form-feedback.types';
import { FormRep, repVerdict } from '../../models/form-session.types';

export interface CycleRepStateMachineConfig {
  /** Signal at/below which the movement is in its flexed (working) zone. */
  flexedAtOrBelow: number;
  /** Signal at/above which a cycle counts as completed (lockout/rest). */
  completedAtOrAbove: number;
  /** Signal rise from the rep minimum that marks the ascent as underway. */
  ascentDelta: number;
  minRepDurationMs: number;
  /** When true, a cycle is valid only if the top gate fired during
   * its ascent (e.g. wrist overhead for the press). */
  requireTopGate: boolean;
  /** Reason stamped on attempts that never completed. */
  incompleteReason: string;
}

export const DEFAULT_CYCLE_CONFIG: CycleRepStateMachineConfig = {
  flexedAtOrBelow: 100,
  completedAtOrAbove: 155,
  ascentDelta: 6,
  minRepDurationMs: 600,
  requireTopGate: false,
  incompleteReason: 'Full range not reached',
};

export class CycleRepStateMachine {
  private phase: MovementPhase = 'standing';
  private attemptNumber = 0;
  private repStartTimeMs: number | null = null;
  private bottomTimeMs: number | null = null;
  private ascentStartTimeMs: number | null = null;
  /** Most recent frame inside the completed zone — a rep's start
   * anchors here, the same convention as the squat/deadlift machines. */
  private lastCompletedTimeMs: number | null = null;

  private minSignal: number = Infinity;
  private trackingConfidenceAccum: number[] = [];
  private topGateSeen = false;

  constructor(private config: CycleRepStateMachineConfig = DEFAULT_CYCLE_CONFIG) {}

  reset(): void {
    this.phase = 'standing';
    this.attemptNumber = 0;
    this.repStartTimeMs = null;
    this.bottomTimeMs = null;
    this.ascentStartTimeMs = null;
    this.lastCompletedTimeMs = null;
    this.minSignal = Infinity;
    this.trackingConfidenceAccum = [];
    this.topGateSeen = false;
  }

  getCurrentPhase(): MovementPhase {
    return this.phase;
  }

  getCompletedRepCount(): number {
    return this.attemptNumber;
  }

  /** Running minimum signal of the current cycle, or null before any
   * measurable frame in a cycle has been processed. */
  getCurrentRepMinSignal(): number | null {
    return this.minSignal < Infinity ? this.minSignal : null;
  }

  /** True while a cycle is between leaving rest and completing. */
  isCycleInProgress(): boolean {
    return this.repStartTimeMs !== null;
  }

  private beginCycle(timestampMs: number): void {
    this.repStartTimeMs = this.lastCompletedTimeMs ?? timestampMs;
    this.bottomTimeMs = null;
    this.ascentStartTimeMs = null;
    this.minSignal = Infinity;
    this.trackingConfidenceAccum = [];
    this.topGateSeen = false;
  }

  private buildRep(timestampMs: number, completed: boolean): FormRep {
    const repStart = this.repStartTimeMs ?? timestampMs - 1200;
    const ascentStart = this.ascentStartTimeMs ?? repStart + 600;
    const bottomTime = this.bottomTimeMs ?? repStart;
    const totalDurationMs = timestampMs - repStart;
    const descentDurationMs = Math.max(0, ascentStart - repStart);
    const ascentDurationMs = Math.max(0, timestampMs - ascentStart);
    const bottomHoldMs = Math.max(0, ascentStart - bottomTime);

    const avgConfidence =
      this.trackingConfidenceAccum.length > 0
        ? this.trackingConfidenceAccum.reduce((a, b) => a + b, 0) /
          this.trackingConfidenceAccum.length
        : 0;

    const gateOk = !this.config.requireTopGate || this.topGateSeen;
    const isValid = completed && gateOk && totalDurationMs >= this.config.minRepDurationMs;

    this.attemptNumber += 1;
    return {
      repNumber: this.attemptNumber,
      startTime: repStart,
      endTime: timestampMs,
      durationSeconds: Math.round((totalDurationMs / 1000) * 10) / 10,
      descentDurationSeconds: Math.max(0.2, Math.round((descentDurationMs / 1000) * 10) / 10),
      ascentDurationSeconds: Math.max(0.2, Math.round((ascentDurationMs / 1000) * 10) / 10),
      bottomHoldDurationSeconds: Math.round((bottomHoldMs / 1000) * 10) / 10,
      // The scalar fields are filled by the owning analyzer from its
      // own per-rep tracking (it knows what the signal means); the
      // machine stamps the neutral placeholders.
      minKneeAngleDeg: 0,
      estimatedDepth: 'unknown',
      maxTorsoInclinationDeg: 0,
      trackingConfidence: Math.round(avgConfidence * 100) / 100,
      observations: [],
      // §32: the shared verdict rule. A cycle record exists only
      // when the driving signal was measurable through the cycle
      // (a signal gap abandons the cycle with no record), so an
      // invalid cycle rep is a measured failure, never
      // 'unverified' from the machine.
      ...repVerdict(isValid, this.config.incompleteReason),
      // "Lockout" for a cycle lift = the cycle genuinely completed
      // (with its top gate, when one is required), independent of the
      // duration validity check. Press/bench read this field; the
      // other cycle lifts simply carry it.
      lockoutAchieved: completed && gateOk,
    };
  }

  /**
   * Advances the machine with one frame. `signal` is the cycle's
   * driving measurement (null when unmeasurable — the phase reports
   * tracking_lost and any in-flight cycle is abandoned, as in the
   * squat/deadlift machines: a gap in tracking is not evidence).
   * `topGate` marks frames satisfying the analyzer's completion gate.
   * Returns a finished FormRep when a cycle ends on this frame.
   */
  update(
    signal: number | null,
    topGate: boolean,
    trackingConfidence: number,
    timestampMs: number
  ): FormRep | null {
    if (signal === null) {
      this.phase = 'tracking_lost';
      return null;
    }

    if (signal >= this.config.completedAtOrAbove) {
      this.lastCompletedTimeMs = timestampMs;
    }

    switch (this.phase) {
      case 'tracking_lost': {
        if (signal <= this.config.flexedAtOrBelow + 10) {
          if (this.repStartTimeMs === null) this.beginCycle(timestampMs);
          this.trackSignal(signal, trackingConfidence);
          this.bottomTimeMs = timestampMs;
          this.phase = 'bottom';
        } else if (signal >= this.config.completedAtOrAbove - 5) {
          this.phase = 'standing';
          this.repStartTimeMs = null;
        }
        return null;
      }

      case 'standing': {
        if (signal <= this.config.flexedAtOrBelow) {
          // Stream starts already in the flexed zone (e.g. a press set
          // resting at the shoulders): that is the bottom.
          this.beginCycle(timestampMs);
          this.trackSignal(signal, trackingConfidence);
          this.bottomTimeMs = timestampMs;
          this.phase = 'bottom';
        } else if (signal < this.config.completedAtOrAbove - 5) {
          this.beginCycle(timestampMs);
          this.trackSignal(signal, trackingConfidence);
          this.phase = 'descending';
        }
        return null;
      }

      case 'descending': {
        this.trackSignal(signal, trackingConfidence);
        if (signal <= this.config.flexedAtOrBelow) {
          this.bottomTimeMs = timestampMs;
          this.phase = 'bottom';
        } else if (signal >= this.config.completedAtOrAbove) {
          // Shallow dip that never reached the working zone — not an attempt.
          this.phase = 'standing';
          this.repStartTimeMs = null;
        }
        return null;
      }

      case 'bottom': {
        this.trackSignal(signal, trackingConfidence);
        if (signal > this.minSignal + this.config.ascentDelta) {
          this.ascentStartTimeMs = timestampMs;
          this.phase = 'ascending';
        }
        return null;
      }

      case 'ascending': {
        this.trackSignal(signal, trackingConfidence);
        if (topGate) this.topGateSeen = true;
        if (signal >= this.config.completedAtOrAbove) {
          const rep = this.buildRep(timestampMs, true);
          this.phase = 'standing';
          this.repStartTimeMs = null;
          return rep;
        }
        if (signal <= this.minSignal + this.config.ascentDelta / 2) {
          // The cycle stalled and returned to the flexed zone without
          // completing — an incomplete attempt, counted separately.
          // The stall band is half the ascent delta, in the signal's
          // own units: a fixed +3 would be a hair-trigger for the
          // lateral raise, whose whole signal range is ~1.5.
          const rep = this.buildRep(timestampMs, false);
          this.bottomTimeMs = timestampMs;
          this.phase = 'bottom';
          // The next cycle starts from this bottom.
          this.repStartTimeMs = timestampMs;
          this.ascentStartTimeMs = null;
          this.minSignal = signal;
          this.trackingConfidenceAccum = [];
          this.topGateSeen = false;
          return rep;
        }
        return null;
      }
    }
    return null;
  }

  private trackSignal(signal: number, trackingConfidence: number): void {
    if (signal < this.minSignal) this.minSignal = signal;
    this.trackingConfidenceAccum.push(trackingConfidence);
  }
}
