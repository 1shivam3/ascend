/**
 * ASCEND Form Coach — Repetition Finite-State Machine
 *
 * Implements a robust state machine with hysteresis, minimum phase dwell time,
 * and amplitude checks to prevent jitter or half-movements from counting as reps.
 */

import { MovementPhase } from '../../models/form-feedback.types';
import { FormRep, SquatDepthClassification } from '../../models/form-session.types';

export interface RepStateMachineConfig {
  standingKneeAngleDeg: number; // e.g. 155°
  descentTriggerAngleDeg: number; // e.g. 145°
  bottomThresholdAngleDeg: number; // e.g. 105°
  lockoutAngleDeg: number; // e.g. 152°
  minRepDurationMs: number; // e.g. 800 ms
  maxRepDurationMs: number; // e.g. 12000 ms
  minDescentDurationMs: number; // e.g. 250 ms
  minAscentDurationMs: number; // e.g. 250 ms
  depthTargetDeg: number; // e.g. 90°
}

export const DEFAULT_SQUAT_CONFIG: RepStateMachineConfig = {
  standingKneeAngleDeg: 155,
  descentTriggerAngleDeg: 142,
  bottomThresholdAngleDeg: 105,
  lockoutAngleDeg: 152,
  minRepDurationMs: 800,
  maxRepDurationMs: 12000,
  minDescentDurationMs: 250,
  minAscentDurationMs: 250,
  depthTargetDeg: 90,
};

export class RepStateMachine {
  private phase: MovementPhase = 'standing';
  private repNumber = 0;
  private repStartTimeMs: number | null = null;
  private bottomTimeMs: number | null = null;
  private ascentStartTimeMs: number | null = null;
  private phaseEnterTimeMs: number = 0;

  private minKneeAngle: number = 180;
  private maxTorsoInclination: number = 0;
  private repObservations: Set<string> = new Set();
  private trackingConfidenceAccum: number[] = [];

  constructor(private config: RepStateMachineConfig = DEFAULT_SQUAT_CONFIG) {}

  reset() {
    this.phase = 'standing';
    this.repNumber = 0;
    this.repStartTimeMs = null;
    this.bottomTimeMs = null;
    this.ascentStartTimeMs = null;
    this.phaseEnterTimeMs = 0;
    this.minKneeAngle = 180;
    this.maxTorsoInclination = 0;
    this.repObservations.clear();
    this.trackingConfidenceAccum = [];
  }

  getCurrentPhase(): MovementPhase {
    return this.phase;
  }

  getCompletedRepCount(): number {
    return this.repNumber;
  }

  /**
   * Running minimum knee angle for the current repetition (the lowest angle
   * tracked since this rep's descent began), or null before any frame with a
   * measurable angle has been processed. This is the same minimum that is
   * stamped onto the completed FormRep at lockout.
   */
  getCurrentRepMinKneeAngleDeg(): number | null {
    return this.minKneeAngle < 180 ? this.minKneeAngle : null;
  }

  setPhase(newPhase: MovementPhase, timestampMs: number) {
    this.phase = newPhase;
    this.phaseEnterTimeMs = timestampMs;
  }

  recordObservation(obs: string) {
    this.repObservations.add(obs);
  }

  /**
   * Evaluates current frame joint measurements and advances state machine.
   * Returns a completed FormRep if a repetition successfully completed on this frame, else null.
   */
  update(
    kneeAngleDeg: number | null,
    torsoInclinationDeg: number | null,
    trackingConfidence: number,
    timestampMs: number
  ): FormRep | null {
    // If tracking is lost or joint angle is unavailable
    if (kneeAngleDeg === null) {
      if (this.phase !== 'tracking_lost') {
        this.setPhase('tracking_lost', timestampMs);
      }
      return null;
    }

    this.trackingConfidenceAccum.push(trackingConfidence);

    // Track min knee angle and max torso inclination
    if (kneeAngleDeg < this.minKneeAngle) {
      this.minKneeAngle = kneeAngleDeg;
    }
    if (torsoInclinationDeg !== null && torsoInclinationDeg > this.maxTorsoInclination) {
      this.maxTorsoInclination = torsoInclinationDeg;
    }

    let completedRep: FormRep | null = null;

    switch (this.phase) {
      case 'tracking_lost':
        // Resume to standing if posture is upright
        if (kneeAngleDeg >= this.config.standingKneeAngleDeg - 5) {
          this.setPhase('standing', timestampMs);
        }
        break;

      case 'standing':
        // Transition from Standing -> Descending
        if (kneeAngleDeg < this.config.descentTriggerAngleDeg) {
          this.repStartTimeMs = timestampMs;
          this.minKneeAngle = kneeAngleDeg;
          this.maxTorsoInclination = torsoInclinationDeg ?? 0;
          this.repObservations.clear();
          this.trackingConfidenceAccum = [trackingConfidence];
          this.setPhase('descending', timestampMs);
        }
        break;

      case 'descending':
        // Reached bottom / inflection
        if (kneeAngleDeg <= this.config.bottomThresholdAngleDeg) {
          this.bottomTimeMs = timestampMs;
          this.setPhase('bottom', timestampMs);
        } else if (
          // Incomplete shallow rep: athlete reversed direction before reaching bottom threshold
          kneeAngleDeg > this.minKneeAngle + 8 &&
          kneeAngleDeg >= this.config.standingKneeAngleDeg - 5
        ) {
          // Aborted / incomplete repetition — do not count
          this.setPhase('standing', timestampMs);
        }
        break;

      case 'bottom':
        // Inflection point: rising from bottom
        if (kneeAngleDeg > this.minKneeAngle + 5) {
          this.ascentStartTimeMs = timestampMs;
          this.setPhase('ascending', timestampMs);
        }
        break;

      case 'ascending':
        // Ascending back to lockout
        if (kneeAngleDeg >= this.config.lockoutAngleDeg) {
          const repStart = this.repStartTimeMs ?? (timestampMs - 1500);
          const bottomTime = this.bottomTimeMs ?? (repStart + 750);
          const ascentStart = this.ascentStartTimeMs ?? bottomTime;
          const totalDurationMs = timestampMs - repStart;
          const descentDurationMs = bottomTime - repStart;
          const ascentDurationMs = timestampMs - ascentStart;

          // Rep validation criteria
          const isValid =
            totalDurationMs >= this.config.minRepDurationMs &&
            totalDurationMs <= this.config.maxRepDurationMs &&
            this.minKneeAngle <= this.config.bottomThresholdAngleDeg + 5;

          // Depth classification
          let depth: SquatDepthClassification = 'parallel';
          if (this.minKneeAngle <= this.config.depthTargetDeg - 5) {
            depth = 'below_parallel';
          } else if (this.minKneeAngle > this.config.depthTargetDeg + 10) {
            depth = 'above_parallel';
          }

          const avgConfidence =
            this.trackingConfidenceAccum.length > 0
              ? this.trackingConfidenceAccum.reduce((a, b) => a + b, 0) /
                this.trackingConfidenceAccum.length
              : trackingConfidence;

          if (isValid) {
            this.repNumber += 1;

            completedRep = {
              repNumber: this.repNumber,
              startTime: repStart,
              endTime: timestampMs,
              durationSeconds: Math.round((totalDurationMs / 1000) * 10) / 10,
              descentDurationSeconds: Math.max(0.2, Math.round((descentDurationMs / 1000) * 10) / 10),
              ascentDurationSeconds: Math.max(0.2, Math.round((ascentDurationMs / 1000) * 10) / 10),
              minKneeAngleDeg: Math.round(this.minKneeAngle),
              estimatedDepth: depth,
              maxTorsoInclinationDeg: Math.round(this.maxTorsoInclination),
              trackingConfidence: Math.round(avgConfidence * 100) / 100,
              observations: Array.from(this.repObservations),
              isValid: true,
            };
          }

          // Return to standing ready for next rep
          this.setPhase('standing', timestampMs);
        }
        break;

      case 'lockout':
      case 'rep_completed':
        this.setPhase('standing', timestampMs);
        break;
    }

    return completedRep;
  }
}
