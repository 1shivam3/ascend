/**
 * Phase 4.4 — §31 MovementPhase.
 *
 * 'lockout' is implemented where it is meaningful: the deadlift
 * machine now ENDS a completed pull in the lockout phase (the
 * position the lifter is holding) instead of an undifferentiated
 * 'standing', and lockout's exits are standing's exits. The
 * squat machine's unreachable 'lockout'/'rep_completed' switch
 * arm is deleted, and 'rep_completed' is out of the union.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DeadliftRepStateMachine } from '@/features/form-coach/services/analysis/DeadliftRepStateMachine';

function frame(
  sm: DeadliftRepStateMachine,
  hip: number,
  knee: number,
  t: number,
) {
  return sm.update(hip, knee, 10, 0.5, 0.3, 0.95, t);
}

describe('§31 deadlift lockout phase', () => {
  it('a completed pull ends in lockout; the next hinge starts from lockout', () => {
    const sm = new DeadliftRepStateMachine();
    expect(sm.getCurrentPhase()).toBe('standing');

    frame(sm, 170, 165, 0); // standing tall (anchors lastLockout)
    frame(sm, 140, 120, 300); // hinge begins → descending
    expect(sm.getCurrentPhase()).toBe('descending');
    frame(sm, 100, 90, 600); // setup → bottom
    expect(sm.getCurrentPhase()).toBe('bottom');
    frame(sm, 125, 110, 900); // pull underway → ascending
    expect(sm.getCurrentPhase()).toBe('ascending');

    const rep = frame(sm, 165, 160, 1200); // full extension → lockout
    expect(rep).not.toBeNull();
    expect(rep?.lockoutAchieved).toBe(true);
    expect(sm.getCurrentPhase()).toBe('lockout');

    // Holding the top stays in lockout.
    frame(sm, 168, 162, 1500);
    expect(sm.getCurrentPhase()).toBe('lockout');

    // The next rep's hinge begins from lockout, exactly as from standing.
    frame(sm, 140, 120, 1800);
    expect(sm.getCurrentPhase()).toBe('descending');
  });

  it('a stalled pull does NOT enter lockout (it returns to bottom as a failed attempt)', () => {
    const sm = new DeadliftRepStateMachine();
    frame(sm, 170, 165, 0);
    frame(sm, 100, 90, 300); // straight into the hinge zone → bottom
    frame(sm, 125, 110, 600); // pull starts
    const rep = frame(sm, 102, 92, 900); // stalls back at the bottom
    expect(rep).not.toBeNull();
    expect(rep?.lockoutAchieved).toBe(false);
    expect(sm.getCurrentPhase()).toBe('bottom');
  });
});

describe('§31 union hygiene (source guards)', () => {
  it("'rep_completed' is gone from the union, the label map and the squat machine", () => {
    const types = readFileSync(
      'src/features/form-coach/models/form-feedback.types.ts',
      'utf8',
    );
    // (The types file's §31 note mentions the name in prose; the
    // union membership is what's checked here.)
    expect(types).not.toContain("| 'rep_completed'");
    const modal = readFileSync(
      'src/features/form-coach/components/FormCoachModal.tsx',
      'utf8',
    );
    expect(modal).not.toContain('phaseRepCompleted');
    const squat = readFileSync(
      'src/features/form-coach/services/analysis/RepStateMachine.ts',
      'utf8',
    );
    expect(squat).not.toContain("case 'lockout'");
    expect(squat).not.toContain('rep_completed');
  });
});
