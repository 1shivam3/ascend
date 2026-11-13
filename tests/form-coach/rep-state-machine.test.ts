import { describe, it, expect, beforeEach } from 'vitest';
import { RepStateMachine, DEFAULT_SQUAT_CONFIG } from '@/features/form-coach/services/analysis/RepStateMachine';

describe('RepStateMachine', () => {
  let sm: RepStateMachine;

  beforeEach(() => {
    sm = new RepStateMachine({
      ...DEFAULT_SQUAT_CONFIG,
      minRepDurationMs: 500, // Speed up for unit tests
    });
  });

  it('starts in standing phase with 0 completed reps', () => {
    expect(sm.getCurrentPhase()).toBe('standing');
    expect(sm.getCompletedRepCount()).toBe(0);
  });

  it('progresses through a complete valid squat repetition', () => {
    let t = 1000;

    // 1. Standing posture (165° knee angle)
    let rep = sm.update(165, 5, 0.95, t);
    expect(sm.getCurrentPhase()).toBe('standing');
    expect(rep).toBeNull();

    // 2. Begins descending (drops to 135°)
    t += 200;
    rep = sm.update(135, 15, 0.95, t);
    expect(sm.getCurrentPhase()).toBe('descending');
    expect(rep).toBeNull();

    // 3. Reaches bottom position (85° knee angle)
    t += 400;
    rep = sm.update(85, 30, 0.95, t);
    expect(sm.getCurrentPhase()).toBe('bottom');
    expect(rep).toBeNull();

    // 4. Starts ascending (angle begins rising to 105°)
    t += 300;
    rep = sm.update(105, 25, 0.95, t);
    expect(sm.getCurrentPhase()).toBe('ascending');
    expect(rep).toBeNull();

    // 5. Returns to lockout (158°)
    t += 400;
    rep = sm.update(158, 8, 0.95, t);

    // Rep completed!
    expect(rep).not.toBeNull();
    expect(rep?.repNumber).toBe(1);
    expect(rep?.status).toBe('valid'); // §32
    expect(rep?.minKneeAngleDeg).toBe(85);
    expect(rep?.estimatedDepth).toBe('below_parallel'); // 85 deg < 90 target
    expect(sm.getCompletedRepCount()).toBe(1);
    expect(sm.getCurrentPhase()).toBe('standing');
  });

  it('exposes the running rep minimum knee angle', () => {
    // No measurable frame processed yet
    expect(sm.getCurrentRepMinKneeAngleDeg()).toBeNull();

    sm.update(165, 5, 0.95, 1000); // standing
    sm.update(135, 15, 0.95, 1200); // descent begins — minimum resets to 135
    expect(sm.getCurrentRepMinKneeAngleDeg()).toBe(135);

    sm.update(85, 30, 0.95, 1600); // bottom
    expect(sm.getCurrentRepMinKneeAngleDeg()).toBe(85);

    sm.update(105, 25, 0.95, 1900); // ascending — minimum stays at the bottom value
    expect(sm.getCurrentRepMinKneeAngleDeg()).toBe(85);
  });

  it('rejects incomplete / shallow rep attempts without incrementing rep count', () => {
    let t = 1000;

    // Standing
    sm.update(165, 5, 0.95, t);

    // Slight dip (135° - triggers descending phase)
    t += 200;
    sm.update(135, 10, 0.95, t);
    expect(sm.getCurrentPhase()).toBe('descending');

    // Aborts and stands back up without reaching bottom threshold (105°)
    t += 200;
    const rep = sm.update(165, 5, 0.95, t);

    // Incomplete rep: no rep emitted, returns to standing, count is 0
    expect(rep).toBeNull();
    expect(sm.getCompletedRepCount()).toBe(0);
    expect(sm.getCurrentPhase()).toBe('standing');
  });

  it('handles temporary tracking loss and recovers cleanly', () => {
    let t = 1000;
    sm.update(165, 5, 0.95, t);

    // Landmark disappears (kneeAngle becomes null)
    t += 100;
    const rep = sm.update(null, null, 0, t);
    expect(sm.getCurrentPhase()).toBe('tracking_lost');
    expect(rep).toBeNull();

    // Posture re-acquired at standing
    t += 300;
    sm.update(162, 6, 0.9, t);
    expect(sm.getCurrentPhase()).toBe('standing');
  });

  it('D5: times the descent from leaving lockout, and phases sum to the rep duration', () => {
    // Standing locked out for ~1 s (170°), then a SLOW ~1.3 s descent to
    // 46°, a brief bottom, then a ~0.5 s ascent. The old accounting timed
    // the descent only between the 142° trigger and the 105° bottom
    // threshold and reported ~0.3–0.4 s for a descent like this.
    let t = 0;
    for (let i = 0; i < 10; i++) {
      sm.update(170, 5, 0.95, t);
      t += 100;
    }
    // Descent: 160 still counts as locked out; the trigger crosses at 140.
    const descentAngles = [160, 150, 140, 130, 120, 110, 100, 90, 80, 70, 60, 50, 46];
    for (const a of descentAngles) {
      sm.update(a, 20, 0.95, t);
      t += 100;
    }
    // Bottom dwell, then ascent.
    sm.update(48, 34, 0.95, t);
    t += 100;
    let rep = null;
    for (const a of [60, 80, 100, 120, 140, 158]) {
      rep = sm.update(a, 15, 0.95, t) ?? rep;
      t += 100;
    }

    expect(rep).not.toBeNull();
    expect(rep?.status).toBe('valid'); // §32
    // Descent ≈ from the last locked-out frame to the inflection (~1.4 s),
    // not the ~0.3 s trigger-to-threshold slice.
    expect(rep?.descentDurationSeconds).toBeGreaterThanOrEqual(1.2);
    // Descent + ascent accounts for the whole rep (bottom hold is exposed
    // separately, inside the descent).
    const phasesSum = (rep?.descentDurationSeconds ?? 0) + (rep?.ascentDurationSeconds ?? 0);
    expect(Math.abs(phasesSum - (rep?.durationSeconds ?? 0))).toBeLessThanOrEqual(0.2);
    expect(rep?.bottomHoldDurationSeconds).toBeGreaterThanOrEqual(0);
  });
});
