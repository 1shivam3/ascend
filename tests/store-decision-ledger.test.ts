import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/lib/store';
import {
  WorkoutEntry,
  WorkoutSet,
  PlannedWorkout,
} from '@/lib/types';
import {
  evaluateTrainingDecisionPolicyV0,
  canPersistDecisionToLedger,
} from '@/lib/training-decision-policy';

describe('Store & Policy v0 Decision Ledger Integration (Task 3C-5)', () => {
  beforeEach(() => {
    // Reset store state cleanly before each test
    useAppStore.getState().clearAllData();
    useAppStore.setState({
      profile: {
        id: 'test_athlete_1',
        name: 'Test Athlete',
        gender: 'male',
        bodyweightKg: 80,
        bodyweightLbs: 176,
        unit: 'kg',
        createdAt: '2026-10-14T00:00:00.000Z',
      },
      workouts: [],
      plannedWorkouts: [],
      policyDecisionRecords: {},
      policyDecisionsLedgerHistory: [],
      trainingDecisions: {},
      decisionsLedgerHistory: [],
    });
  });

  // ── Criterion 1: Completed prescribed workout produces an eligible decision ──
  it('Criterion 1: Completed prescribed workout produces an eligible decision in the ledger', () => {
    const workout: WorkoutEntry = {
      id: 'w-c1-prescribed',
      date: '2026-10-14T10:00:00Z',
      exercises: [
        {
          name: 'Barbell Back Squat',
          sets: [
            {
              prescribedWeight: 100,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              prescribedRpe: 8,
              weight: 100,
              reps: 8,
              unit: 'kg',
              rpe: 8,
              status: 'completed',
              completed: true,
            },
            {
              prescribedWeight: 100,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              prescribedRpe: 8,
              weight: 100,
              reps: 8,
              unit: 'kg',
              rpe: 8,
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(workout);

    const state = useAppStore.getState();
    const records = Object.values(state.policyDecisionRecords);
    expect(records.length).toBe(1);

    const decision = records[0];
    expect(decision.exerciseName).toBe('Barbell Back Squat');
    expect(decision.status).toBe('pending');
    expect(decision.isIdentityReliable).toBe(true);
    expect(decision.id).toContain('barbell back squat');
    expect(decision.id).toContain('w-c1-prescribed');
    expect(decision.evidenceAudit.totalPrescribedSetsEvaluated).toBe(2);
    expect(decision.evidenceAudit.completedPrescribedSets).toBe(2);
    expect(decision.currentPrescription.weight).toBe(100);
    expect(decision.currentPrescription.reps).toBe(8);

    // Ledger history contains the decision record
    expect(state.policyDecisionsLedgerHistory.length).toBe(1);
    expect(state.policyDecisionsLedgerHistory[0].id).toBe(decision.id);
  });

  // ── Criterion 2: Manual workout produces no fabricated progression decision ──
  it('Criterion 2: Manual workout without prescribed targets produces no fabricated decision', () => {
    const manualWorkout: WorkoutEntry = {
      id: 'w-c2-manual',
      date: '2026-10-14T10:00:00Z',
      exercises: [
        {
          name: 'Dumbbell Incline Press',
          sets: [
            {
              weight: 30,
              reps: 10,
              unit: 'kg',
              status: 'completed',
              completed: true,
              // No prescribedWeight, prescribedReps, or prescribedRpe
            },
            {
              weight: 30,
              reps: 10,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(manualWorkout);

    const state = useAppStore.getState();
    expect(state.workouts.length).toBe(1);
    // Policy v0 ledger must NOT fabricate decisions from unprescribed/manual sets
    expect(Object.keys(state.policyDecisionRecords).length).toBe(0);
    expect(state.policyDecisionsLedgerHistory.length).toBe(0);
  });

  // ── Criterion 3: Interrupted prescribed workout produces review-required ────
  it('Criterion 3: Interrupted prescribed workout with skipped sets produces review-required', () => {
    const interruptedWorkout: WorkoutEntry = {
      id: 'w-c3-interrupted',
      date: '2026-10-14T10:00:00Z',
      exercises: [
        {
          name: 'Barbell Bench Press',
          sets: [
            {
              prescribedWeight: 80,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              weight: 80,
              reps: 8,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
            {
              prescribedWeight: 80,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              weight: 80,
              reps: 0,
              unit: 'kg',
              status: 'skipped',
              completed: false,
            },
            {
              prescribedWeight: 80,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              weight: 80,
              reps: 0,
              unit: 'kg',
              status: 'skipped',
              completed: false,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(interruptedWorkout);

    const state = useAppStore.getState();
    const records = Object.values(state.policyDecisionRecords);
    expect(records.length).toBe(1);

    const decision = records[0];
    expect(decision.actionCategory).toBe('review_required');
    expect(decision.ruleId).toBe('REV-01');
    expect(decision.proposedPrescription.deltaWeight).toBe(0);
    expect(decision.proposedPrescription.deltaReps).toBe(0);
    expect(decision.explanation).toContain('skipped');
  });

  // ── Criterion 4: Unconfigured equipment increments do not authorize load progression ──
  it('Criterion 4: Unconfigured equipment increments conservatively yield review-required instead of load advance', () => {
    const ceilWorkout: WorkoutEntry = {
      id: 'w-c4-ceil',
      date: '2026-10-14T10:00:00Z',
      exercises: [
        {
          name: 'Barbell Back Squat',
          sets: [
            {
              prescribedWeight: 140,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              prescribedRpe: 8,
              weight: 140,
              reps: 8,
              unit: 'kg',
              rpe: 8,
              status: 'completed',
              completed: true,
            },
            {
              prescribedWeight: 140,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              prescribedRpe: 8,
              weight: 140,
              reps: 8,
              unit: 'kg',
              rpe: 8,
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(ceilWorkout);

    const state = useAppStore.getState();
    const records = Object.values(state.policyDecisionRecords);
    expect(records.length).toBe(1);

    const decision = records[0];
    // Rep ceiling met with verified reserve, but store does not fabricate equipment approval:
    expect(decision.actionCategory).toBe('review_required');
    expect(decision.ruleId).toBe('REV-INCREMENT');
    expect(decision.proposedPrescription.deltaWeight).toBe(0);
    expect(decision.explanation).toContain('equipment');
  });

  // ── Criterion 5: Pain blocks progression (Task 3C-5 & 3C-5A) ─────────────
  it('Criterion 5A: Genuine structured pain flag on exercise or workout locks progression with SAFETY-01', () => {
    // Structured pain flag on exercise
    const painWorkout: WorkoutEntry = {
      id: 'w-c5-structured-pain',
      date: '2026-10-14T10:00:00Z',
      exercises: [
        {
          name: 'Barbell Deadlift',
          reportsPain: true, // explicit structured signal
          sets: [
            {
              prescribedWeight: 150,
              prescribedReps: 5,
              prescribedUnit: 'kg',
              weight: 150,
              reps: 5,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(painWorkout);

    const state = useAppStore.getState();
    const records = Object.values(state.policyDecisionRecords);
    expect(records.length).toBe(1);

    const decision = records[0];
    expect(decision.actionCategory).toBe('review_required');
    expect(decision.ruleId).toBe('SAFETY-01');
    expect(decision.proposedPrescription.deltaWeight).toBe(0);
    expect(decision.proposedPrescription.deltaReps).toBe(0);
    expect(decision.explanation).toContain('Discomfort or pain was reported');
    expect(decision.evidenceAudit.limitations.some((l) => l.includes('SAFETY-01'))).toBe(true);
  });

  it('Criterion 5B: "No pain today" in free-text notes does NOT trigger a false positive safety lock', () => {
    const negatedPainWorkout: WorkoutEntry = {
      id: 'w-c5-negated-pain',
      date: '2026-10-14T10:00:00Z',
      notes: 'No pain today, felt great and completely recovered!',
      exercises: [
        {
          name: 'Barbell Bench Press',
          notes: 'Smooth reps with no shoulder pain or impingement',
          // Note: reportsPain is NOT set (undefined / false)
          sets: [
            {
              prescribedWeight: 80,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              weight: 80,
              reps: 8,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(negatedPainWorkout);

    const state = useAppStore.getState();
    const records = Object.values(state.policyDecisionRecords);
    expect(records.length).toBe(1);

    const decision = records[0];
    // Must NOT trigger SAFETY-01 due to keyword "pain" or "impingement"
    expect(decision.ruleId).not.toBe('SAFETY-01');
    expect(decision.actionCategory).not.toBe('review_required' as any || decision.ruleId === 'SAFETY-01');
    expect(decision.explanation).not.toContain('Discomfort or pain was reported');
  });

  it('Criterion 5C: Notes mentioning a past injury do NOT automatically create a current pain report', () => {
    const historicalInjuryWorkout: WorkoutEntry = {
      id: 'w-c5-historical-injury',
      date: '2026-10-14T10:00:00Z',
      notes: 'Old 2022 quad injury felt completely stable and healed',
      exercises: [
        {
          name: 'Barbell Back Squat',
          notes: 'Old knee injury showed zero issues',
          sets: [
            {
              prescribedWeight: 100,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              weight: 100,
              reps: 8,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(historicalInjuryWorkout);

    const state = useAppStore.getState();
    const records = Object.values(state.policyDecisionRecords);
    expect(records.length).toBe(1);

    const decision = records[0];
    expect(decision.ruleId).not.toBe('SAFETY-01');
    expect(decision.explanation).not.toContain('Discomfort or pain was reported');
  });

  it('Criterion 5D: Ordinary notes without safety data do not trigger safety rules', () => {
    const ordinaryWorkout: WorkoutEntry = {
      id: 'w-c5-ordinary-notes',
      date: '2026-10-14T10:00:00Z',
      notes: 'Felt great. Focused on a controlled 3s eccentric cadence.',
      exercises: [
        {
          name: 'Overhead Press',
          notes: 'Paused slightly at chin level before lockout',
          sets: [
            {
              prescribedWeight: 50,
              prescribedReps: 6,
              prescribedUnit: 'kg',
              weight: 50,
              reps: 6,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(ordinaryWorkout);

    const state = useAppStore.getState();
    const records = Object.values(state.policyDecisionRecords);
    expect(records.length).toBe(1);

    const decision = records[0];
    expect(decision.ruleId).not.toBe('SAFETY-01');
  });

  it('Criterion 5E: Missing structured safety data does not crash evaluation and documents non-clearance limitation', () => {
    const missingSafetyWorkout: WorkoutEntry = {
      id: 'w-c5-missing-safety',
      date: '2026-10-14T10:00:00Z',
      exercises: [
        {
          name: 'Barbell Back Squat',
          sets: [
            {
              prescribedWeight: 100,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              weight: 100,
              reps: 8,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    expect(() => {
      useAppStore.getState().addWorkout(missingSafetyWorkout);
    }).not.toThrow();

    const state = useAppStore.getState();
    const records = Object.values(state.policyDecisionRecords);
    expect(records.length).toBe(1);

    const decision = records[0];
    expect(decision.ruleId).not.toBe('SAFETY-01');
    // Audit must transparently document that absence of a pain report does not imply medical clearance
    expect(
      decision.evidenceAudit.limitations.some((l) =>
        l.includes('Absence of a pain report does not constitute medical clearance')
      )
    ).toBe(true);
  });

  it('Criterion 5F: A genuine structured safety flag cannot be bypassed by equipment approval or missing-RPE overrides', () => {
    // Even when athlete completed all sets at ceiling with approved equipment increment and reserve override:
    const painDecision = evaluateTrainingDecisionPolicyV0(
      'Barbell Back Squat',
      { targetWeight: 100, targetReps: 10, targetSets: 3, targetUnit: 'kg' },
      null,
      {
        repRange: { min: 8, max: 10 },
        stepIncrement: 2.5,
        incrementApprovalSource: 'coach_approved',
        rpeOverride: { athleteConfirmedReserve: true },
        athleteFlags: { reportsPain: true }, // Structured pain flag
      }
    );

    expect(painDecision.actionCategory).toBe('review_required');
    expect(painDecision.ruleId).toBe('SAFETY-01');
    expect(painDecision.proposedPrescription.deltaWeight).toBe(0);
    expect(painDecision.proposedPrescription.deltaReps).toBe(0);
    expect(painDecision.explanation).toContain('Discomfort or pain was reported');
  });

  it('Criterion 5G: A structured workout-level hold request reaches policy evaluation and holds targets', () => {
    const holdWorkout: WorkoutEntry = {
      id: 'w-c5-workout-hold',
      date: '2026-10-14T10:00:00Z',
      athleteFlags: { requestHold: true }, // Workout-level structured hold request
      exercises: [
        {
          name: 'Barbell Bench Press',
          sets: [
            {
              prescribedWeight: 80,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              weight: 80,
              reps: 8,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(holdWorkout);

    const state = useAppStore.getState();
    const records = Object.values(state.policyDecisionRecords);
    expect(records.length).toBe(1);

    const decision = records[0];
    expect(decision.ruleId).toBe('HOLD-ATHLETE-REQUEST');
    expect(decision.actionCategory).toBe('hold_current_target');
    expect(decision.proposedPrescription.deltaWeight).toBe(0);
    expect(decision.proposedPrescription.deltaReps).toBe(0);
    expect(decision.headline).toBe('Athlete Requested Target Hold — Targets Maintained');
    expect(decision.explanation).toContain('Athlete requested target hold');
    expect(decision.evidenceAudit.limitations.some((l) => l.includes('Athlete explicitly requested target hold'))).toBe(true);
  });

  it('Criterion 5H: An exercise-level hold request reaches only the targeted exercise evaluation', () => {
    const multiExWorkout: WorkoutEntry = {
      id: 'w-c5-exercise-hold-isolation',
      date: '2026-10-14T10:00:00Z',
      exercises: [
        {
          name: 'Barbell Back Squat',
          requestHold: true, // Exercise-level hold request on Squat only
          sets: [
            {
              prescribedWeight: 100,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              weight: 100,
              reps: 8,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
        {
          name: 'Barbell Bench Press',
          // No hold request on Bench Press
          sets: [
            {
              prescribedWeight: 80,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              weight: 80,
              reps: 8,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(multiExWorkout);

    const state = useAppStore.getState();
    const records = Object.values(state.policyDecisionRecords);
    expect(records.length).toBe(2);

    const squatDecision = records.find((d) => d.exerciseName === 'Barbell Back Squat')!;
    const benchDecision = records.find((d) => d.exerciseName === 'Barbell Back Squat' ? false : d.exerciseName === 'Barbell Bench Press')!;

    expect(squatDecision).toBeDefined();
    expect(benchDecision).toBeDefined();

    // Squat must receive HOLD-ATHLETE-REQUEST
    expect(squatDecision.ruleId).toBe('HOLD-ATHLETE-REQUEST');
    expect(squatDecision.actionCategory).toBe('hold_current_target');

    // Bench must NOT receive HOLD-ATHLETE-REQUEST
    expect(benchDecision.ruleId).not.toBe('HOLD-ATHLETE-REQUEST');
  });

  it('Criterion 5I: A hold request without pain does not produce a pain-specific explanation', () => {
    const holdOnlyWorkout: WorkoutEntry = {
      id: 'w-c5-hold-no-pain',
      date: '2026-10-14T10:00:00Z',
      requestHold: true,
      exercises: [
        {
          name: 'Overhead Press',
          sets: [
            {
              prescribedWeight: 50,
              prescribedReps: 6,
              prescribedUnit: 'kg',
              weight: 50,
              reps: 6,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(holdOnlyWorkout);

    const state = useAppStore.getState();
    const records = Object.values(state.policyDecisionRecords);
    const decision = records.find((d) => d.exerciseName === 'Overhead Press')!;

    expect(decision.ruleId).toBe('HOLD-ATHLETE-REQUEST');
    const fullText = `${decision.headline} ${decision.explanation}`.toLowerCase();
    expect(fullText).not.toContain('pain');
    expect(fullText).not.toContain('discomfort');
    expect(fullText).not.toContain('injury');
    expect(fullText).not.toContain('medical');
  });

  it('Criterion 5J: Both flags together (reportsPain + requestHold) preserve pain safety precedence and audit reasons', () => {
    const dualFlagWorkout: WorkoutEntry = {
      id: 'w-c5-dual-flags',
      date: '2026-10-14T10:00:00Z',
      athleteFlags: {
        reportsPain: true,
        requestHold: true,
      },
      exercises: [
        {
          name: 'Barbell Deadlift',
          sets: [
            {
              prescribedWeight: 140,
              prescribedReps: 5,
              prescribedUnit: 'kg',
              weight: 140,
              reps: 5,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(dualFlagWorkout);

    const state = useAppStore.getState();
    const records = Object.values(state.policyDecisionRecords);
    const decision = records.find((d) => d.exerciseName === 'Barbell Deadlift')!;

    // SAFETY-01 must take precedence over hold request
    expect(decision.ruleId).toBe('SAFETY-01');
    expect(decision.actionCategory).toBe('review_required');
    expect(decision.proposedPrescription.deltaWeight).toBe(0);
    expect(decision.proposedPrescription.deltaReps).toBe(0);
    expect(decision.headline).toContain('Athlete Discomfort Reported');

    // Both reasons must be preserved in limitations audit
    expect(decision.evidenceAudit.limitations.some((l) => l.includes('SAFETY-01'))).toBe(true);
    expect(decision.evidenceAudit.limitations.some((l) => l.includes('Athlete explicitly requested target hold'))).toBe(true);
  });

  it('Criterion 5K: A genuine structured hold request cannot be bypassed by equipment approval or missing-RPE overrides', () => {
    const holdDecision = evaluateTrainingDecisionPolicyV0(
      'Barbell Back Squat',
      { targetWeight: 120, targetReps: 10, targetSets: 3, targetUnit: 'kg' },
      null,
      {
        repRange: { min: 8, max: 10 },
        stepIncrement: 2.5,
        incrementApprovalSource: 'coach_approved',
        rpeOverride: { athleteConfirmedReserve: true },
        athleteFlags: { requestHold: true },
      }
    );

    expect(holdDecision.ruleId).toBe('HOLD-ATHLETE-REQUEST');
    expect(holdDecision.actionCategory).toBe('hold_current_target');
    expect(holdDecision.proposedPrescription.deltaWeight).toBe(0);
    expect(holdDecision.proposedPrescription.deltaReps).toBe(0);
    expect(holdDecision.proposedPrescription.weight).toBe(120);
    expect(holdDecision.proposedPrescription.reps).toBe(10);
  });

  // ── Criterion 6: Re-saving same workout does not duplicate decisions ────────
  it('Criterion 6: Re-saving same workout ID is idempotent and does not duplicate decisions or ledger history', () => {
    const workout: WorkoutEntry = {
      id: 'w-c6-idempotent',
      date: '2026-10-14T10:00:00Z',
      exercises: [
        {
          name: 'Overhead Press',
          sets: [
            {
              prescribedWeight: 50,
              prescribedReps: 6,
              prescribedUnit: 'kg',
              weight: 50,
              reps: 6,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(workout);

    const stateBefore = useAppStore.getState();
    expect(stateBefore.workouts.length).toBe(1);
    expect(stateBefore.policyDecisionsLedgerHistory.length).toBe(1);
    expect(Object.keys(stateBefore.policyDecisionRecords).length).toBe(1);

    // Save identical workout a second time
    useAppStore.getState().addWorkout(workout);

    const stateAfter = useAppStore.getState();
    expect(stateAfter.workouts.length).toBe(1);
    expect(stateAfter.policyDecisionsLedgerHistory.length).toBe(1);
    expect(Object.keys(stateAfter.policyDecisionRecords).length).toBe(1);
  });

  // ── Criterion 7: Distinct sessions on same date produce distinct decision IDs ──
  it('Criterion 7: Distinct workout sessions on the same date produce distinct decision IDs', () => {
    const morningWorkout: WorkoutEntry = {
      id: 'w-c7-am',
      date: '2026-10-14T08:00:00Z',
      exercises: [
        {
          name: 'Barbell Bench Press',
          sets: [
            {
              prescribedWeight: 80,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              weight: 80,
              reps: 8,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    const eveningWorkout: WorkoutEntry = {
      id: 'w-c7-pm',
      date: '2026-10-14T18:00:00Z',
      exercises: [
        {
          name: 'Barbell Bench Press',
          sets: [
            {
              prescribedWeight: 80,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              weight: 80,
              reps: 8,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(morningWorkout);
    useAppStore.getState().addWorkout(eveningWorkout);

    const state = useAppStore.getState();
    expect(state.workouts.length).toBe(2);
    expect(state.policyDecisionsLedgerHistory.length).toBe(2);

    const ids = state.policyDecisionsLedgerHistory.map((d) => d.id);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids.some((id) => id.includes('w-c7-am'))).toBe(true);
    expect(ids.some((id) => id.includes('w-c7-pm'))).toBe(true);

    expect(Object.keys(state.policyDecisionRecords).length).toBe(2);
  });

  // ── Criterion 8: Unanchored decision is blocked from persistence ────────────
  it('Criterion 8: Unanchored decision is blocked from ledger persistence by canPersistDecisionToLedger', () => {
    // Generate an unanchored decision directly (no workoutId)
    const unanchored = evaluateTrainingDecisionPolicyV0(
      'Barbell Back Squat',
      { targetWeight: 100, targetReps: 8, targetSets: 3, targetUnit: 'kg' },
      null,
      { referenceDate: '2026-10-14' } // no workoutId
    );

    expect(unanchored.isIdentityReliable).toBe(false);
    expect(unanchored.id).toContain('_unanchored');

    const check = canPersistDecisionToLedger(unanchored);
    expect(check.canPersist).toBe(false);
    expect(check.reason).toBeDefined();

    // Verify store doesn't persist unanchored decisions if workout lacks an ID
    const unanchoredWorkout = {
      date: '2026-10-14T10:00:00Z',
      exercises: [
        {
          name: 'Barbell Back Squat',
          sets: [
            {
              prescribedWeight: 100,
              prescribedReps: 8,
              weight: 100,
              reps: 8,
              unit: 'kg' as const,
              status: 'completed' as const,
            },
          ],
        },
      ],
    } as unknown as WorkoutEntry; // missing required id

    useAppStore.getState().addWorkout(unanchoredWorkout);
    const state = useAppStore.getState();
    expect(Object.keys(state.policyDecisionRecords).length).toBe(0);
    expect(state.policyDecisionsLedgerHistory.length).toBe(0);
  });

  // ── Criterion 9: Accept, override, dismiss update only the intended decision ──
  it('Criterion 9: Accept, override, and dismiss update only the intended decision record', () => {
    const multiExerciseWorkout: WorkoutEntry = {
      id: 'w-c9-multi',
      date: '2026-10-14T10:00:00Z',
      exercises: [
        {
          name: 'Barbell Back Squat',
          sets: [
            {
              prescribedWeight: 100,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              weight: 100,
              reps: 8,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
        {
          name: 'Barbell Bench Press',
          sets: [
            {
              prescribedWeight: 80,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              weight: 80,
              reps: 8,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
        {
          name: 'Barbell Overhead Press',
          sets: [
            {
              prescribedWeight: 50,
              prescribedReps: 6,
              prescribedUnit: 'kg',
              weight: 50,
              reps: 6,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(multiExerciseWorkout);

    const state = useAppStore.getState();
    const records = Object.values(state.policyDecisionRecords);
    expect(records.length).toBe(3);

    const squatRec = records.find((d) => d.canonicalExerciseKey === 'barbell back squat')!;
    const benchRec = records.find((d) => d.canonicalExerciseKey === 'barbell bench press')!;
    const ohpRec = records.find((d) => d.canonicalExerciseKey === 'barbell overhead press')!;

    expect(squatRec.status).toBe('pending');
    expect(benchRec.status).toBe('pending');
    expect(ohpRec.status).toBe('pending');

    // 1. Accept only Squat
    useAppStore.getState().acceptPolicyDecision(squatRec.id);
    let updated = useAppStore.getState();
    expect(updated.policyDecisionRecords[squatRec.id].status).toBe('accepted');
    expect(updated.policyDecisionRecords[squatRec.id].acceptedAt).toBeDefined();
    // Others remain pending
    expect(updated.policyDecisionRecords[benchRec.id].status).toBe('pending');
    expect(updated.policyDecisionRecords[ohpRec.id].status).toBe('pending');

    // 2. Override only Bench Press
    useAppStore.getState().overridePolicyDecision(benchRec.id, {
      customWeight: 82.5,
      customReps: 7,
      reason: 'Felt strong, added 2.5kg manually',
    });
    updated = useAppStore.getState();
    expect(updated.policyDecisionRecords[benchRec.id].status).toBe('overridden');
    expect(updated.policyDecisionRecords[benchRec.id].userOverride).toEqual({
      customWeight: 82.5,
      customReps: 7,
      overrideReason: 'Felt strong, added 2.5kg manually',
      overriddenAt: expect.any(String),
    });
    expect(updated.policyDecisionRecords[squatRec.id].status).toBe('accepted');
    expect(updated.policyDecisionRecords[ohpRec.id].status).toBe('pending');

    // 3. Dismiss only Overhead Press
    useAppStore.getState().dismissPolicyDecision(ohpRec.id);
    updated = useAppStore.getState();
    expect(updated.policyDecisionRecords[ohpRec.id].status).toBe('dismissed');
    expect(updated.policyDecisionRecords[ohpRec.id].dismissedAt).toBeDefined();

    // Check that ledger history mirrored each update cleanly
    const squatHist = updated.policyDecisionsLedgerHistory.find((d) => d.id === squatRec.id)!;
    const benchHist = updated.policyDecisionsLedgerHistory.find((d) => d.id === benchRec.id)!;
    const ohpHist = updated.policyDecisionsLedgerHistory.find((d) => d.id === ohpRec.id)!;
    expect(squatHist.status).toBe('accepted');
    expect(benchHist.status).toBe('overridden');
    expect(ohpHist.status).toBe('dismissed');
  });

  // ── Criterion 10: Invalid/repeated lifecycle transitions handled consistently ──
  it('Criterion 10: Invalid or repeated lifecycle transitions are handled consistently and idempotently', () => {
    const workout: WorkoutEntry = {
      id: 'w-c10-transitions',
      date: '2026-10-14T10:00:00Z',
      exercises: [
        {
          name: 'Barbell Back Squat',
          sets: [
            {
              prescribedWeight: 100,
              prescribedReps: 8,
              prescribedUnit: 'kg',
              weight: 100,
              reps: 8,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(workout);

    const decisionId = Object.keys(useAppStore.getState().policyDecisionRecords)[0];

    // Accept decision
    useAppStore.getState().acceptPolicyDecision(decisionId);
    const firstAcceptedAt = useAppStore.getState().policyDecisionRecords[decisionId].acceptedAt;
    expect(firstAcceptedAt).toBeDefined();

    // Repeat accept call on already accepted decision
    useAppStore.getState().acceptPolicyDecision(decisionId);
    const secondAcceptedAt = useAppStore.getState().policyDecisionRecords[decisionId].acceptedAt;
    // Timestamp must not be overwritten; history must not duplicate
    expect(secondAcceptedAt).toBe(firstAcceptedAt);
    expect(useAppStore.getState().policyDecisionsLedgerHistory.length).toBe(1);

    // Attempt invalid transition: dismiss already accepted decision
    useAppStore.getState().dismissPolicyDecision(decisionId);
    expect(useAppStore.getState().policyDecisionRecords[decisionId].status).toBe('accepted');

    // Attempt invalid transition: override already accepted decision
    useAppStore.getState().overridePolicyDecision(decisionId, { customWeight: 110 });
    expect(useAppStore.getState().policyDecisionRecords[decisionId].status).toBe('accepted');

    // Attempt transition on non-existent decision ID
    expect(() => {
      useAppStore.getState().acceptPolicyDecision('dec_non_existent_id');
      useAppStore.getState().dismissPolicyDecision('dec_non_existent_id');
      useAppStore.getState().overridePolicyDecision('dec_non_existent_id');
    }).not.toThrow();
  });

  // ── Criterion 11: Rehydration and persistence work cleanly ──────────────────
  it('Criterion 11: Rehydration, import, and clearing work cleanly for Policy v0 ledger', () => {
    // 1. Clear policy decisions utility
    useAppStore.setState({
      policyDecisionRecords: {
        dec1: { id: 'dec1' } as any,
      },
      policyDecisionsLedgerHistory: [{ id: 'dec1' } as any],
    });

    useAppStore.getState().clearPolicyDecisions();
    expect(useAppStore.getState().policyDecisionRecords).toEqual({});
    expect(useAppStore.getState().policyDecisionsLedgerHistory).toEqual([]);

    // 2. importAllData imports policyDecisionRecords and history
    const mockImport = {
      profile: { id: 'u1', name: 'Imported Athlete', unit: 'kg' },
      policyDecisionRecords: {
        'dec-imp-1': { id: 'dec-imp-1', exerciseName: 'Deadlift', status: 'accepted' },
      },
      policyDecisionsLedgerHistory: [
        { id: 'dec-imp-1', exerciseName: 'Deadlift', status: 'accepted' },
      ],
    };

    const success = useAppStore.getState().importAllData(mockImport);
    expect(success).toBe(true);
    expect(useAppStore.getState().policyDecisionRecords['dec-imp-1']).toBeDefined();
    expect(useAppStore.getState().policyDecisionsLedgerHistory.length).toBe(1);

    // 3. Fallback resilience: importing empty data doesn't wipe state with undefined
    useAppStore.getState().importAllData({});
    expect(useAppStore.getState().policyDecisionRecords['dec-imp-1']).toBeDefined();
    expect(useAppStore.getState().policyDecisionsLedgerHistory.length).toBe(1);

    // 4. clearAllData resets policy collections
    useAppStore.getState().clearAllData();
    expect(useAppStore.getState().policyDecisionRecords).toEqual({});
    expect(useAppStore.getState().policyDecisionsLedgerHistory).toEqual([]);
  });

  // ── Criterion 12: Legacy trainingDecisions consumers continue to function without regression ──
  it('Criterion 12: Legacy trainingDecisions consumers continue to function without regression', () => {
    const workout: WorkoutEntry = {
      id: 'w-c12-legacy',
      date: '2026-10-14T10:00:00Z',
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            {
              weight: 80,
              reps: 8,
              unit: 'kg',
              rpe: 8,
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(workout);

    const state = useAppStore.getState();
    // Legacy decision generated by generateTrainingDecision
    const legacyDecision = state.trainingDecisions['Bench Press'];
    expect(legacyDecision).toBeDefined();
    expect(legacyDecision.exerciseName).toBe('Bench Press');
    expect(legacyDecision.programIntent).toBeDefined();
    expect(legacyDecision.reasonType).toBeDefined();

    // Legacy actions work as expected
    useAppStore.getState().acceptTrainingDecision('Bench Press');
    expect(useAppStore.getState().trainingDecisions['Bench Press'].status).toBe('accepted');

    useAppStore.getState().overrideTrainingDecision('Bench Press', 85);
    expect(useAppStore.getState().trainingDecisions['Bench Press'].status).toBe('overridden');
    expect(useAppStore.getState().trainingDecisions['Bench Press'].userOverrideWeight).toBe(85);
  });

  // ── Criterion 13: Partial/missing prescriptions do not manufacture target data ──
  it('Criterion 13: Partial or missing prescription fields do not manufacture target data', () => {
    // Prescribed reps provided (8), but prescribedWeight is omitted/undefined
    const partialWorkout: WorkoutEntry = {
      id: 'w-c13-partial',
      date: '2026-10-14T10:00:00Z',
      exercises: [
        {
          name: 'Barbell Row',
          sets: [
            {
              prescribedReps: 8,
              // prescribedWeight omitted
              weight: 70,
              reps: 8,
              unit: 'kg',
              status: 'completed',
              completed: true,
            },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(partialWorkout);

    const state = useAppStore.getState();
    const records = Object.values(state.policyDecisionRecords);
    expect(records.length).toBe(1);

    const decision = records[0];
    // Must evaluate observed values without manufacturing unprescribed load targets
    expect(decision.currentPrescription.reps).toBe(8);
    expect(decision.proposedPrescription.deltaWeight).toBe(0);
    expect(decision.evidenceAudit.exclusions).toBeDefined();
  });

  // ── Supporting: Planned Workout link provides prescription targets ───────────
  it('correctly links planned workout exercises to establish prescription targets', () => {
    const plannedWorkout: PlannedWorkout = {
      id: 'plan_push_a',
      name: 'Push Day A',
      createdAt: '2026-10-10',
      exercises: [
        {
          name: 'Incline Dumbbell Press',
          targetSets: 3,
          targetReps: 10,
          targetWeight: 32,
          targetUnit: 'kg',
        },
      ],
    };

    useAppStore.setState({
      plannedWorkouts: [plannedWorkout],
    });

    const completedFromPlan: WorkoutEntry = {
      id: 'w-from-plan-1',
      name: 'Push Day A', // matches plan
      date: '2026-10-14T10:00:00Z',
      exercises: [
        {
          name: 'Incline Dumbbell Press',
          sets: [
            { weight: 32, reps: 10, unit: 'kg', status: 'completed', completed: true },
            { weight: 32, reps: 10, unit: 'kg', status: 'completed', completed: true },
            { weight: 32, reps: 10, unit: 'kg', status: 'completed', completed: true },
          ],
        },
      ],
    };

    useAppStore.getState().addWorkout(completedFromPlan);

    const state = useAppStore.getState();
    const records = Object.values(state.policyDecisionRecords);
    expect(records.length).toBe(1);

    const decision = records[0];
    expect(decision.exerciseName).toBe('Incline Dumbbell Press');
    expect(decision.currentPrescription.weight).toBe(32);
    expect(decision.currentPrescription.reps).toBe(10);
    expect(decision.currentPrescription.sets).toBe(3);
  });
});
