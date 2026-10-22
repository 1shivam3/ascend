import { describe, expect, it } from 'vitest';
import {
  evaluateTrainingDecisionPolicyV0,
  type EvaluateDecisionOptions,
} from '@/lib/training-decision-policy';
import type { WorkoutEntry } from '@/lib/types';
import type { MultiSessionEvidenceSummary } from '@/lib/workout-outcome-evidence';
import { aggregateMultiSessionEvidence } from '@/lib/workout-outcome-evidence';

/**
 * PR-B §4.5: Policy v0 block-context discipline. The fixtures mirror the
 * store's production wiring: prescribed sets on the plan, RPE recorded,
 * all sets at the rep ceiling — the exact shape under which unmanaged
 * evaluation used to dead-end at REV-INCREMENT.
 */

function workout(date: string, weight: number, reps: number, rpe?: number): WorkoutEntry {
  return {
    id: `w-${date}`,
    name: 'Upper A',
    date,
    duration: 60,
    exercises: [
      {
        name: 'Bench Press',
        sets: [0, 1, 2].map(() => ({
          reps,
          weight,
          unit: 'kg' as const,
          rpe,
          prescribedReps: reps,
          prescribedWeight: weight,
          prescribedUnit: 'kg' as const,
          prescribedRpe: 8,
          isCompleted: true,
        })),
      },
    ],
  } as WorkoutEntry;
}

function evidence(workouts: WorkoutEntry[]): MultiSessionEvidenceSummary {
  return aggregateMultiSessionEvidence(workouts);
}

const TARGET = {
  name: 'Bench Press',
  targetWeight: 80,
  targetReps: 6,
  targetSets: 3,
  targetUnit: 'kg' as const,
  targetRpe: 8,
};

const MANAGED: EvaluateDecisionOptions = {
  workoutId: 'w-current',
  referenceDate: '2026-10-20',
  userUnit: 'kg',
  repRange: { min: 4, max: 6 },
  incrementConfig: { stepIncrement: 2.5, approvalSource: 'coach_approved' },
};

describe('Policy v0 — managed wiring fix (production bug)', () => {
  it('a managed lift at the rep ceiling with recorded RPE finally gets LOAD-PROG-01', () => {
    // Three clean sessions at the ceiling, RPE at target.
    const history = [
      workout('2026-10-06', 80, 6, 8),
      workout('2026-10-13', 80, 6, 8),
      workout('2026-10-20', 80, 6, 8),
    ];
    const decision = evaluateTrainingDecisionPolicyV0('Bench Press', TARGET, evidence(history), {
      ...MANAGED,
      blockContext: { weekType: 'build' },
    });
    expect(decision.ruleId).toBe('LOAD-PROG-01');
    expect(decision.proposedPrescription.deltaWeight).toBe(2.5);
  });

  it('the SAME history unmanaged (degenerate range, no increment) dead-ends — the old bug', () => {
    const history = [
      workout('2026-10-06', 80, 6, 8),
      workout('2026-10-13', 80, 6, 8),
      workout('2026-10-20', 80, 6, 8),
    ];
    const decision = evaluateTrainingDecisionPolicyV0('Bench Press', TARGET, evidence(history), {
      workoutId: 'w-current',
      referenceDate: '2026-10-20',
      userUnit: 'kg',
      repRange: { min: 6, max: 6 },
    });
    expect(decision.ruleId).not.toBe('LOAD-PROG-01');
  });

  it('below the ceiling, a managed lift progresses reps first (REP-PROG)', () => {
    const history = [
      workout('2026-10-13', 80, 5, 8),
      workout('2026-10-20', 80, 5, 8),
    ];
    const target = { ...TARGET, targetReps: 5 };
    const decision = evaluateTrainingDecisionPolicyV0('Bench Press', target, evidence(history), {
      ...MANAGED,
      blockContext: { weekType: 'build' },
    });
    expect(decision.ruleId).toBe('REP-PROG-01');
    expect(decision.proposedPrescription.deltaReps).toBe(1);
  });
});

describe('Policy v0 — block week discipline (Rule 0.5)', () => {
  const cleanHistory = [
    workout('2026-10-06', 80, 6, 8),
    workout('2026-10-13', 80, 6, 8),
    workout('2026-10-20', 80, 6, 8),
  ];

  it('test week holds progression even with perfect evidence', () => {
    const decision = evaluateTrainingDecisionPolicyV0('Bench Press', TARGET, evidence(cleanHistory), {
      ...MANAGED,
      blockContext: { weekType: 'test' },
    });
    expect(decision.ruleId).toBe('HOLD-BLOCK-TEST');
    expect(decision.proposedPrescription.deltaWeight).toBe(0);
  });

  it('deload week holds progression when the lift is arriving fine', () => {
    const decision = evaluateTrainingDecisionPolicyV0('Bench Press', TARGET, evidence(cleanHistory), {
      ...MANAGED,
      blockContext: { weekType: 'deload' },
    });
    expect(decision.ruleId).toBe('HOLD-BLOCK-DELOAD');
  });

  it('deload week + above-target effort proposes the 10% cut as review_required', () => {
    const hotHistory = [
      workout('2026-10-13', 80, 6, 9.5),
      workout('2026-10-20', 80, 6, 9.5),
    ];
    const decision = evaluateTrainingDecisionPolicyV0('Bench Press', TARGET, evidence(hotHistory), {
      ...MANAGED,
      blockContext: { weekType: 'deload' },
    });
    expect(decision.ruleId).toBe('BLOCK-DELOAD-01');
    expect(decision.actionCategory).toBe('review_required');
    expect(decision.proposedPrescription.deltaWeight).toBeCloseTo(-8);
  });

  it('pain (Rule 0) still beats block discipline — safety first', () => {
    const decision = evaluateTrainingDecisionPolicyV0('Bench Press', TARGET, evidence(cleanHistory), {
      ...MANAGED,
      blockContext: { weekType: 'test' },
      athleteFlags: { reportsPain: true },
    });
    expect(decision.ruleId).toBe('SAFETY-01');
  });

  it('without blockContext the policy is untouched (no block rules can fire)', () => {
    const decision = evaluateTrainingDecisionPolicyV0('Bench Press', TARGET, evidence(cleanHistory), MANAGED);
    expect(decision.ruleId).toBe('LOAD-PROG-01');
  });
});
