import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useAppStore } from '@/lib/store';
import {
  WorkoutEntry,
  PlannedWorkout,
  TrainingDecisionRecord,
  validatePolicyDecisionApplication,
} from '@/lib/types';
import { evaluateTrainingDecisionPolicyV0 } from '@/lib/training-decision-policy';
import { aggregateMultiSessionEvidence } from '@/lib/workout-outcome-evidence';
import PolicyDecisionCard from '@/components/PolicyDecisionCard';

describe('Apply Accepted Policy Decisions to Future Prescriptions (Task 3C-7)', () => {
  beforeEach(() => {
    useAppStore.getState().clearAllData();
    useAppStore.setState({
      profile: {
        id: 'test_athlete_3c7',
        name: 'Test Athlete',
        gender: 'male',
        bodyweightKg: 82,
        bodyweightLbs: 180.7,
        unit: 'kg',
        createdAt: '2026-01-01',
      },
      workouts: [],
      plannedWorkouts: [],
      policyDecisionRecords: {},
      policyDecisionsLedgerHistory: [],
      policyDecisionApplications: [],
      trainingDecisions: {},
      decisionsLedgerHistory: [],
      activeWorkoutDraft: null,
      userMode: 'advanced',
    });
  });

  const createSampleAcceptedDecision = (
    overrides?: Partial<TrainingDecisionRecord>
  ): TrainingDecisionRecord => {
    return {
      id: 'dec_barbell_back_squat_2026-10-14_w-sq-3_v0',
      policyVersion: '0.1.0',
      createdAt: '2026-10-14T10:00:00Z',
      acceptedAt: '2026-10-14T10:05:00Z',
      exerciseName: 'Barbell Back Squat',
      canonicalExerciseKey: 'barbell_back_squat',
      progressionModel: 'double_progression',
      actionCategory: 'candidate_load_progression',
      ruleId: 'LOAD-PROG-01',
      evidenceSufficiencyTier: 'multi_session',
      confidenceTier: 'established',
      evidenceCount: 3,
      isIdentityReliable: true,
      currentPrescription: {
        weight: 100,
        reps: 8,
        targetRpe: 8,
        sets: 3,
        unit: 'kg',
      },
      proposedPrescription: {
        weight: 102.5,
        reps: 8,
        targetRpe: 8,
        sets: 3,
        unit: 'kg',
        deltaWeight: 2.5,
        deltaReps: 0,
      },
      headline: 'Candidate Load Progression (+2.5 kg)',
      explanation:
        'Completed prescribed repetitions at target ceiling across 3 comparable sessions with verified reserve. External load advancement supported.',
      evidenceAudit: {
        contributingWorkoutIds: ['w-sq-1', 'w-sq-2', 'w-sq-3'],
        lastExposureDate: '2026-10-14T10:00:00Z',
        totalPrescribedSetsEvaluated: 9,
        completedPrescribedSets: 9,
        usableRepComparisons: 9,
        repOutcomes: { below_target: 0, met_target: 9, above_target: 0 },
        loadOutcomes: { below_target: 0, met_target: 9, above_target: 0 },
        rpeOutcomes: { below_target: 0, met_target: 9, above_target: 0 },
        averageLoadDeltaKg: 0,
        averageRpeDelta: 0,
        exclusions: [],
        limitations: [],
        sufficiency: {
          tier: 'multi_session',
          comparableExposuresCount: 3,
          totalExposuresCount: 3,
          isOrderVerified: true,
          hasRecordedEffort: true,
          notes: ['Verified chronological order'],
        },
      },
      status: 'accepted',
      ...overrides,
    };
  };

  const createSamplePlannedWorkout = (
    overrides?: Partial<PlannedWorkout>
  ): PlannedWorkout => {
    return {
      id: 'plan_leg_day_heavy',
      name: 'Leg Day Heavy',
      createdAt: '2026-10-01T00:00:00Z',
      exercises: [
        {
          id: 'pe_sq_1',
          name: 'Barbell Back Squat',
          targetSets: 3,
          targetReps: 8,
          targetWeight: 100,
          targetUnit: 'kg',
          targetRpe: 8,
          notes: 'Primary compound',
        },
        {
          id: 'pe_rdl_1',
          name: 'Romanian Deadlift',
          targetSets: 3,
          targetReps: 10,
          targetWeight: 80,
          targetUnit: 'kg',
          targetRpe: 8,
          notes: 'Hamstring focus',
        },
      ],
      ...overrides,
    };
  };

  // ── Criterion 1: Deliberate application required ─────────────────────────────
  it('Criterion 1: Accepting a decision marks status accepted but leaves PlannedWorkouts unchanged', () => {
    const plan = createSamplePlannedWorkout();
    useAppStore.setState({ plannedWorkouts: [plan] });

    const pendingDecision = createSampleAcceptedDecision({
      status: 'pending',
      acceptedAt: undefined,
    });
    useAppStore.setState({
      policyDecisionRecords: { [pendingDecision.id]: pendingDecision },
    });

    // Accept via store
    useAppStore.getState().acceptPolicyDecision(pendingDecision.id);

    const updatedDecision =
      useAppStore.getState().policyDecisionRecords[pendingDecision.id];
    expect(updatedDecision.status).toBe('accepted');
    expect(updatedDecision.acceptedAt).toBeDefined();

    // Verify planned workout was NOT modified
    const currentPlans = useAppStore.getState().plannedWorkouts;
    expect(currentPlans[0].exercises[0].targetWeight).toBe(100);
    expect(currentPlans[0].exercises[0].targetReps).toBe(8);
  });

  // ── Criterion 2: Successful single-plan application ──────────────────────────
  it('Criterion 2: Deliberately applying updates only target exercise in the selected plan', () => {
    const plan = createSamplePlannedWorkout();
    const decision = createSampleAcceptedDecision();

    useAppStore.setState({
      plannedWorkouts: [plan],
      policyDecisionRecords: { [decision.id]: decision },
    });

    const result = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: plan.id,
    });

    expect(result.success).toBe(true);
    expect(result.auditRecord).toBeDefined();

    const updatedPlan = useAppStore.getState().plannedWorkouts[0];
    // Squat targets updated
    expect(updatedPlan.exercises[0].targetWeight).toBe(102.5);
    expect(updatedPlan.exercises[0].targetReps).toBe(8);
    expect(updatedPlan.exercises[0].targetRpe).toBe(8);
    expect(updatedPlan.exercises[0].targetSets).toBe(3); // Sets preserved
    expect(updatedPlan.exercises[0].notes).toBe('Primary compound'); // Notes preserved

    // Romanian Deadlift completely untouched
    expect(updatedPlan.exercises[1].name).toBe('Romanian Deadlift');
    expect(updatedPlan.exercises[1].targetWeight).toBe(80);
    expect(updatedPlan.exercises[1].targetReps).toBe(10);
    expect(updatedPlan.exercises[1].targetSets).toBe(3);

    // Plan metadata preserved
    expect(updatedPlan.id).toBe(plan.id);
    expect(updatedPlan.name).toBe(plan.name);
    expect(updatedPlan.createdAt).toBe(plan.createdAt);
  });

  // ── Criterion 3: Historical immutability ─────────────────────────────────────
  it('Criterion 3: Applying a decision does NOT modify completed workouts in workouts[]', () => {
    const plan = createSamplePlannedWorkout();
    const decision = createSampleAcceptedDecision();
    const completedWorkout: WorkoutEntry = {
      id: 'w-completed-1',
      date: '2026-10-14T10:00:00Z',
      exercises: [
        {
          name: 'Barbell Back Squat',
          sets: [
            { weight: 100, reps: 8, unit: 'kg', rpe: 8, completed: true, prescribedWeight: 100, prescribedReps: 8, prescribedUnit: 'kg' },
          ],
        },
      ],
    };

    useAppStore.setState({
      plannedWorkouts: [plan],
      workouts: [completedWorkout],
      policyDecisionRecords: { [decision.id]: decision },
    });

    useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: plan.id,
    });

    const currentWorkouts = useAppStore.getState().workouts;
    expect(currentWorkouts[0].exercises[0].sets[0].weight).toBe(100);
    expect(currentWorkouts[0].exercises[0].sets[0].prescribedWeight).toBe(100);
  });

  // ── Criterion 4: Active draft isolation ─────────────────────────────────────
  it('Criterion 4: Applying a decision does NOT modify activeWorkoutDraft in progress', () => {
    const plan = createSamplePlannedWorkout();
    const decision = createSampleAcceptedDecision();
    const activeDraft = {
      id: 'active-draft-99',
      date: '2026-10-14T12:00:00Z',
      savedAt: '2026-10-14T12:00:00Z',
      exercises: [
        {
          name: 'Barbell Back Squat',
          sets: [
            { weight: 100, reps: 8, unit: 'kg' as const, completed: false, prescribedWeight: 100, prescribedReps: 8, prescribedUnit: 'kg' as const },
          ],
        },
      ],
    };

    useAppStore.setState({
      plannedWorkouts: [plan],
      activeWorkoutDraft: activeDraft,
      policyDecisionRecords: { [decision.id]: decision },
    });

    useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: plan.id,
    });

    const currentDraft = useAppStore.getState().activeWorkoutDraft;
    expect(currentDraft?.exercises[0].sets[0].prescribedWeight).toBe(100);
  });

  // ── Criterion 5: Ineligible status rejection ────────────────────────────────
  it('Criterion 5: Rejects applying pending, overridden, or dismissed decisions', () => {
    const plan = createSamplePlannedWorkout();

    const pendingDec = createSampleAcceptedDecision({ id: 'dec-pen', status: 'pending' });
    const overriddenDec = createSampleAcceptedDecision({ id: 'dec-ovr', status: 'overridden' });
    const dismissedDec = createSampleAcceptedDecision({ id: 'dec-dis', status: 'dismissed' });

    useAppStore.setState({
      plannedWorkouts: [plan],
      policyDecisionRecords: {
        [pendingDec.id]: pendingDec,
        [overriddenDec.id]: overriddenDec,
        [dismissedDec.id]: dismissedDec,
      },
    });

    const resPen = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: pendingDec.id,
      targetPlanId: plan.id,
    });
    expect(resPen.success).toBe(false);
    expect(resPen.error).toBe('decision_not_accepted');

    const resOvr = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: overriddenDec.id,
      targetPlanId: plan.id,
    });
    expect(resOvr.success).toBe(false);
    expect(resOvr.error).toBe('decision_overridden');

    const resDis = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: dismissedDec.id,
      targetPlanId: plan.id,
    });
    expect(resDis.success).toBe(false);
    expect(resDis.error).toBe('decision_dismissed');
  });

  // ── Criterion 6: Safety decision rejection ──────────────────────────────────
  it('Criterion 6: Rejects applying SAFETY-01 pain stops and athlete hold requests', () => {
    const plan = createSamplePlannedWorkout();
    const safetyDec = createSampleAcceptedDecision({
      id: 'dec-safety',
      ruleId: 'SAFETY-01',
      actionCategory: 'review_required',
      status: 'accepted',
    });
    const holdDec = createSampleAcceptedDecision({
      id: 'dec-hold',
      ruleId: 'HOLD-01',
      actionCategory: 'review_required',
      status: 'accepted',
    });

    useAppStore.setState({
      plannedWorkouts: [plan],
      policyDecisionRecords: {
        [safetyDec.id]: safetyDec,
        [holdDec.id]: holdDec,
      },
    });

    const resSafety = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: safetyDec.id,
      targetPlanId: plan.id,
    });
    expect(resSafety.success).toBe(false);
    expect(resSafety.error).toBe('safety_locked');

    const resHold = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: holdDec.id,
      targetPlanId: plan.id,
    });
    expect(resHold.success).toBe(false);
    expect(resHold.error).toBe('review_required');
  });

  // ── Criterion 7: Insufficient evidence rejection ────────────────────────────
  it('Criterion 7: Rejects applying insufficient_evidence decisions', () => {
    const plan = createSamplePlannedWorkout();
    const insuffDec = createSampleAcceptedDecision({
      id: 'dec-insuff',
      actionCategory: 'insufficient_evidence',
      ruleId: 'EVID-01',
      status: 'accepted',
    });

    useAppStore.setState({
      plannedWorkouts: [plan],
      policyDecisionRecords: { [insuffDec.id]: insuffDec },
    });

    const res = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: insuffDec.id,
      targetPlanId: plan.id,
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('insufficient_evidence');
  });

  // ── Criterion 8: Multiple matching exercises disambiguation ─────────────────
  it('Criterion 8: Disambiguates multiple matching exercises and requires index/ID', () => {
    const planWithDuplicates: PlannedWorkout = {
      id: 'plan_two_squats',
      name: 'Two Squats Workout',
      createdAt: '2026-10-01T00:00:00Z',
      exercises: [
        {
          id: 'pe_sq_light',
          name: 'Barbell Back Squat',
          targetSets: 3,
          targetReps: 8,
          targetWeight: 100,
          targetUnit: 'kg',
        },
        {
          id: 'pe_sq_heavy',
          name: 'Barbell Back Squat',
          targetSets: 3,
          targetReps: 8,
          targetWeight: 100,
          targetUnit: 'kg',
        },
      ],
    };
    const decision = createSampleAcceptedDecision();

    useAppStore.setState({
      plannedWorkouts: [planWithDuplicates],
      policyDecisionRecords: { [decision.id]: decision },
    });

    // Without targetExerciseIndex, fails due to multiple matches
    const resAmbiguous = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: planWithDuplicates.id,
    });
    expect(resAmbiguous.success).toBe(false);
    expect(resAmbiguous.error).toBe('ambiguous_target');

    // With explicit targetExerciseIndex: 1, updates only the second instance
    const resSpecific = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: planWithDuplicates.id,
      targetExerciseIndex: 1,
    });
    expect(resSpecific.success).toBe(true);

    const updatedPlan = useAppStore.getState().plannedWorkouts[0];
    expect(updatedPlan.exercises[0].targetWeight).toBe(100); // First instance unchanged
    expect(updatedPlan.exercises[1].targetWeight).toBe(102.5); // Second instance updated
  });

  // ── Criterion 9: Multiple plans isolation ───────────────────────────────────
  it('Criterion 9: Applying to Plan A does NOT modify Plan B with the same exercise', () => {
    const planA = createSamplePlannedWorkout({ id: 'plan_A', name: 'Plan A' });
    const planB = createSamplePlannedWorkout({ id: 'plan_B', name: 'Plan B' });
    const decision = createSampleAcceptedDecision();

    useAppStore.setState({
      plannedWorkouts: [planA, planB],
      policyDecisionRecords: { [decision.id]: decision },
    });

    useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: planA.id,
    });

    const [updatedA, updatedB] = useAppStore.getState().plannedWorkouts;
    expect(updatedA.exercises[0].targetWeight).toBe(102.5);
    expect(updatedB.exercises[0].targetWeight).toBe(100); // Plan B remains 100kg
  });

  // ── Criterion 10: Idempotent re-application ─────────────────────────────────
  it('Criterion 10: Applying a second time returns alreadyApplied: true without duplicate audit records', () => {
    const plan = createSamplePlannedWorkout();
    const decision = createSampleAcceptedDecision();

    useAppStore.setState({
      plannedWorkouts: [plan],
      policyDecisionRecords: { [decision.id]: decision },
    });

    // First application
    const res1 = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: plan.id,
    });
    expect(res1.success).toBe(true);
    expect(res1.alreadyApplied).toBeFalsy();

    const auditCountAfterFirst = useAppStore.getState().policyDecisionApplications.length;
    expect(auditCountAfterFirst).toBe(1);

    // Second application (identical)
    const res2 = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: plan.id,
    });
    expect(res2.success).toBe(true);
    expect(res2.alreadyApplied).toBe(true);

    // Audit length has not increased
    const auditCountAfterSecond = useAppStore.getState().policyDecisionApplications.length;
    expect(auditCountAfterSecond).toBe(1);
  });

  // ── Criterion 11: Audit trail recording ─────────────────────────────────────
  it('Criterion 11: Creates an immutable PolicyDecisionApplicationAudit record with provenance fields', () => {
    const plan = createSamplePlannedWorkout();
    const decision = createSampleAcceptedDecision();

    useAppStore.setState({
      plannedWorkouts: [plan],
      policyDecisionRecords: { [decision.id]: decision },
    });

    const res = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: plan.id,
    });

    expect(res.success).toBe(true);
    const audit = res.auditRecord!;
    expect(audit).toBeDefined();
    expect(audit.decisionId).toBe(decision.id);
    expect(audit.targetPlanId).toBe(plan.id);
    expect(audit.targetPlanName).toBe(plan.name);
    expect(audit.targetExerciseName).toBe('Barbell Back Squat');
    expect(audit.previousPrescription.weight).toBe(100);
    expect(audit.previousPrescription.reps).toBe(8);
    expect(audit.appliedPrescription.weight).toBe(102.5);
    expect(audit.appliedPrescription.reps).toBe(8);
    expect(audit.actionSource).toBe('athlete_confirmed');
    expect(audit.status).toBe('applied');

    // Also recorded in decision metadata
    const updatedDecision = useAppStore.getState().policyDecisionRecords[decision.id];
    expect(updatedDecision.appliedAt).toBeDefined();
    expect(updatedDecision.appliedTargetPlanId).toBe(plan.id);
    expect(updatedDecision.appliedTargetExerciseName).toBe('Barbell Back Squat');
  });

  // ── Criterion 12: Application audit history persistence & rehydration ──────
  it('Criterion 12: Preserves policy decision application audits across importAllData', () => {
    const audit: any = {
      id: 'audit-test-1',
      decisionId: 'dec-1',
      policyVersion: '0.1.0',
      targetPlanId: 'plan-1',
      targetPlanName: 'Leg Day',
      targetExerciseName: 'Barbell Back Squat',
      targetExerciseIndex: 0,
      previousPrescription: { weight: 100, reps: 8, sets: 3, unit: 'kg' },
      appliedPrescription: { weight: 102.5, reps: 8, sets: 3, unit: 'kg' },
      appliedAt: '2026-10-14T10:00:00Z',
      actionSource: 'athlete_confirmed',
      status: 'applied',
    };

    useAppStore.getState().importAllData({
      policyDecisionApplications: [audit],
    });

    const applications = useAppStore.getState().policyDecisionApplications;
    expect(applications.length).toBe(1);
    expect(applications[0].id).toBe('audit-test-1');
  });

  // ── Criterion 13: Stale prescription detection ──────────────────────────────
  it('Criterion 13: Rejects application if plan target has drifted from decision baseline (load, reps, sets, RPE)', () => {
    const decision = createSampleAcceptedDecision(); // Baseline: 100 kg, 8 reps, 3 sets, RPE 8

    // 1. Load drifted
    const driftedLoadPlan = createSamplePlannedWorkout({
      exercises: [
        {
          name: 'Barbell Back Squat',
          targetSets: 3,
          targetReps: 8,
          targetWeight: 105,
          targetUnit: 'kg',
          targetRpe: 8,
        },
      ],
    });
    useAppStore.setState({
      plannedWorkouts: [driftedLoadPlan],
      policyDecisionRecords: { [decision.id]: decision },
    });
    const resLoad = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: driftedLoadPlan.id,
    });
    expect(resLoad.success).toBe(false);
    expect(resLoad.error).toBe('stale_prescription');
    expect(resLoad.message).toContain('stale_prescription: target load drifted from baseline 100 kg to 105 kg');

    // 2. Reps drifted
    const driftedRepsPlan = createSamplePlannedWorkout({
      exercises: [
        {
          name: 'Barbell Back Squat',
          targetSets: 3,
          targetReps: 10,
          targetWeight: 100,
          targetUnit: 'kg',
          targetRpe: 8,
        },
      ],
    });
    useAppStore.setState({ plannedWorkouts: [driftedRepsPlan] });
    const resReps = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: driftedRepsPlan.id,
    });
    expect(resReps.success).toBe(false);
    expect(resReps.error).toBe('stale_prescription');
    expect(resReps.message).toContain('stale_prescription: target reps drifted from baseline 8 reps to 10 reps');

    // 3. Sets drifted
    const driftedSetsPlan = createSamplePlannedWorkout({
      exercises: [
        {
          name: 'Barbell Back Squat',
          targetSets: 4,
          targetReps: 8,
          targetWeight: 100,
          targetUnit: 'kg',
          targetRpe: 8,
        },
      ],
    });
    useAppStore.setState({ plannedWorkouts: [driftedSetsPlan] });
    const resSets = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: driftedSetsPlan.id,
    });
    expect(resSets.success).toBe(false);
    expect(resSets.error).toBe('stale_prescription');
    expect(resSets.message).toContain('stale_prescription: target sets drifted from baseline 3 sets to 4 sets');

    // 4. Target RPE drifted
    const driftedRpePlan = createSamplePlannedWorkout({
      exercises: [
        {
          name: 'Barbell Back Squat',
          targetSets: 3,
          targetReps: 8,
          targetWeight: 100,
          targetUnit: 'kg',
          targetRpe: 9,
        },
      ],
    });
    useAppStore.setState({ plannedWorkouts: [driftedRpePlan] });
    const resRpe = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: driftedRpePlan.id,
    });
    expect(resRpe.success).toBe(false);
    expect(resRpe.error).toBe('stale_prescription');
    expect(resRpe.message).toContain('stale_prescription: target RPE drifted from baseline RPE 8 to RPE 9');
  });

  // ── Hardening: Single-target application guard ──────────────────────────────
  it('Hardening: Rejects applying decision to a second distinct plan if already applied to another target', () => {
    const planA = createSamplePlannedWorkout({ id: 'plan_A', name: 'Plan A' });
    const planB = createSamplePlannedWorkout({ id: 'plan_B', name: 'Plan B' });
    const decision = createSampleAcceptedDecision();

    useAppStore.setState({
      plannedWorkouts: [planA, planB],
      policyDecisionRecords: { [decision.id]: decision },
    });

    // Apply to Plan A first
    const resA = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: planA.id,
    });
    expect(resA.success).toBe(true);

    // Try applying the exact same decision to Plan B
    const resB = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: planB.id,
    });
    expect(resB.success).toBe(false);
    expect(resB.error).toBe('already_applied_to_other_target');
    expect(resB.message).toContain("already been applied to workout plan template 'Plan A'");

    // Verify Plan B remains completely unmodified
    const currentB = useAppStore.getState().plannedWorkouts.find((p) => p.id === 'plan_B')!;
    expect(currentB.exercises[0].targetWeight).toBe(100);
  });

  // ── Hardening: Idempotency vs. Coincidence discrimination ───────────────────
  it('Hardening: Disentangles idempotency from coincidentally matching targets on unlinked plans', () => {
    // Plan has 100 kg x 8 reps
    const plan = createSamplePlannedWorkout({
      exercises: [
        {
          name: 'Barbell Back Squat',
          targetSets: 3,
          targetReps: 8,
          targetWeight: 100,
          targetUnit: 'kg',
          targetRpe: 8,
        },
      ],
    });

    // A hold recommendation proposes 100 kg x 8 reps (deltas = 0)
    const holdDecision = createSampleAcceptedDecision({
      id: 'dec_hold_test',
      actionCategory: 'hold_current_target',
      ruleId: 'HOLD-01',
      proposedPrescription: {
        weight: 100,
        reps: 8,
        targetRpe: 8,
        sets: 3,
        unit: 'kg',
        deltaWeight: 0,
        deltaReps: 0,
      },
    });

    useAppStore.setState({
      plannedWorkouts: [plan],
      policyDecisionRecords: { [holdDecision.id]: holdDecision },
    });

    // Validate BEFORE application: because decision was NOT yet applied to this plan,
    // it must NOT short-circuit as alreadyApplied: true simply because numbers match coincidentally.
    const validationBefore = validatePolicyDecisionApplication(
      holdDecision,
      plan,
      0,
      undefined,
      useAppStore.getState().policyDecisionApplications
    );
    expect(validationBefore.valid).toBe(true);
    expect(validationBefore.alreadyApplied).toBeFalsy();

    // Now deliberately apply it
    const res1 = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: holdDecision.id,
      targetPlanId: plan.id,
    });
    expect(res1.success).toBe(true);
    expect(res1.alreadyApplied).toBeFalsy();
    expect(useAppStore.getState().policyDecisionApplications.length).toBe(1);

    // Re-applying to the SAME plan now correctly returns alreadyApplied: true
    const res2 = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: holdDecision.id,
      targetPlanId: plan.id,
    });
    expect(res2.success).toBe(true);
    expect(res2.alreadyApplied).toBe(true);
    expect(useAppStore.getState().policyDecisionApplications.length).toBe(1); // No duplicate audit
  });

  // ── Hardening: Equipment increment provenance & hold requests ───────────────
  it('Hardening: Rejects applying decisions with unconfigured load increment or athlete hold requests', () => {
    const plan = createSamplePlannedWorkout();

    const unconfiguredIncrementDec = createSampleAcceptedDecision({
      id: 'dec_unconf_inc',
      actionCategory: 'candidate_load_progression',
      ruleId: 'REV-INCREMENT',
    });

    const holdRequestDec = createSampleAcceptedDecision({
      id: 'dec_athlete_hold',
      actionCategory: 'review_required',
      ruleId: 'HOLD-ATHLETE-REQUEST',
    });

    const rpeUnrecordedDec = createSampleAcceptedDecision({
      id: 'dec_rpe_unrec',
      actionCategory: 'review_required',
      ruleId: 'HOLD-RPE-UNRECORDED',
    });

    useAppStore.setState({
      plannedWorkouts: [plan],
      policyDecisionRecords: {
        [unconfiguredIncrementDec.id]: unconfiguredIncrementDec,
        [holdRequestDec.id]: holdRequestDec,
        [rpeUnrecordedDec.id]: rpeUnrecordedDec,
      },
    });

    const resInc = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: unconfiguredIncrementDec.id,
      targetPlanId: plan.id,
    });
    expect(resInc.success).toBe(false);
    expect(resInc.error).toBe('unresolved_increment');

    const resHold = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: holdRequestDec.id,
      targetPlanId: plan.id,
    });
    expect(resHold.success).toBe(false);
    expect(resHold.error).toBe('athlete_hold_requested');

    const resRpe = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: rpeUnrecordedDec.id,
      targetPlanId: plan.id,
    });
    expect(resRpe.success).toBe(false);
    expect(resRpe.error).toBe('rpe_unrecorded');
  });

  // ── Criterion 14: Unit consistency ──────────────────────────────────────────
  it('Criterion 14: Rejects application on unit mismatch between decision and plan', () => {
    // Decision is in kg, plan is in lbs
    const lbsPlan = createSamplePlannedWorkout({
      exercises: [
        {
          name: 'Barbell Back Squat',
          targetSets: 3,
          targetReps: 8,
          targetWeight: 225,
          targetUnit: 'lbs',
        },
      ],
    });
    const decision = createSampleAcceptedDecision(); // Unit is kg

    useAppStore.setState({
      plannedWorkouts: [lbsPlan],
      policyDecisionRecords: { [decision.id]: decision },
    });

    const res = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: lbsPlan.id,
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe('unit_mismatch');
  });

  // ── Criterion 15: Lifecycle through workout start ───────────────────────────
  it('Criterion 15: Starting a workout from an applied plan populates logger with applied targets', () => {
    const plan = createSamplePlannedWorkout();
    const decision = createSampleAcceptedDecision();

    useAppStore.setState({
      plannedWorkouts: [plan],
      policyDecisionRecords: { [decision.id]: decision },
    });

    // Apply target
    useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision.id,
      targetPlanId: plan.id,
    });

    // Simulate starting workout from the updated plan
    const updatedPlan = useAppStore.getState().plannedWorkouts[0];
    const initialExercises = updatedPlan.exercises.map((pe) => ({
      name: pe.name,
      sets: Array.from({ length: pe.targetSets }, () => ({
        reps: pe.targetReps,
        weight: pe.targetWeight ?? 0,
        unit: pe.targetUnit ?? ('kg' as const),
        completed: false,
        prescribedWeight: pe.targetWeight,
        prescribedReps: pe.targetReps,
        prescribedUnit: pe.targetUnit ?? ('kg' as const),
        prescribedRpe: pe.targetRpe,
      })),
    }));

    expect(initialExercises[0].sets[0].weight).toBe(102.5);
    expect(initialExercises[0].sets[0].prescribedWeight).toBe(102.5);
    expect(initialExercises[0].sets[0].reps).toBe(8);
  });

  // ── Criterion 16: UI integration in PolicyDecisionCard ──────────────────────
  it('Criterion 16: PolicyDecisionCard displays Apply button when accepted, and APPLIED badge when applied', () => {
    const plan = createSamplePlannedWorkout();
    const decision = createSampleAcceptedDecision();

    useAppStore.setState({
      plannedWorkouts: [plan],
      policyDecisionRecords: { [decision.id]: decision },
    });

    // Accepted but not yet applied
    const htmlAccepted = renderToStaticMarkup(
      React.createElement(PolicyDecisionCard, { decision, userUnit: 'kg' })
    );
    expect(htmlAccepted).toContain('Apply to Future Plan Template');
    expect(htmlAccepted).not.toContain('APPLIED');

    // Applied decision
    const appliedDecision: TrainingDecisionRecord = {
      ...decision,
      appliedAt: '2026-10-14T10:10:00Z',
      appliedTargetPlanId: plan.id,
      appliedTargetPlanName: plan.name,
      appliedTargetExerciseName: 'Barbell Back Squat',
    };
    const htmlApplied = renderToStaticMarkup(
      React.createElement(PolicyDecisionCard, { decision: appliedDecision, userUnit: 'kg' })
    );
    expect(htmlApplied).toContain('APPLIED');
    expect(htmlApplied).toContain('Applied to Plan');
    expect(htmlApplied).toContain('Applied to plan template &#x27;Leg Day Heavy&#x27;');
  });

  // ── Full End-to-End Progression Lifecycle ───────────────────────────────────
  it('Full E2E: Double progression ceiling -> generate decision -> accept -> deliberate apply -> start workout -> log workout', () => {
    // 1. Initial Planned Workout
    const initialPlan: PlannedWorkout = {
      id: 'plan_push_e2e',
      name: 'Push Strength',
      createdAt: '2026-09-01T00:00:00Z',
      exercises: [
        {
          id: 'pe_bench_1',
          name: 'Barbell Bench Press',
          targetSets: 3,
          targetReps: 8,
          targetWeight: 100,
          targetUnit: 'kg',
          targetRpe: 8,
        },
      ],
    };
    useAppStore.setState({ plannedWorkouts: [initialPlan] });

    // 2. Log 3 completed sessions at progression ceiling (100 kg x 8 reps @ RPE 8)
    const sessionDates = ['2026-10-01', '2026-10-05', '2026-10-09'];
    sessionDates.forEach((dateStr, idx) => {
      const workoutEntry: WorkoutEntry = {
        id: `w_bench_${idx + 1}`,
        date: `${dateStr}T10:00:00Z`,
        exercises: [
          {
            name: 'Barbell Bench Press',
            sets: [
              { weight: 100, reps: 8, unit: 'kg', rpe: 8, completed: true, prescribedWeight: 100, prescribedReps: 8, prescribedUnit: 'kg', prescribedRpe: 8 },
              { weight: 100, reps: 8, unit: 'kg', rpe: 8, completed: true, prescribedWeight: 100, prescribedReps: 8, prescribedUnit: 'kg', prescribedRpe: 8 },
              { weight: 100, reps: 8, unit: 'kg', rpe: 8, completed: true, prescribedWeight: 100, prescribedReps: 8, prescribedUnit: 'kg', prescribedRpe: 8 },
            ],
          },
        ],
      };
      useAppStore.getState().addWorkout(workoutEntry);
    });

    expect(useAppStore.getState().workouts.length).toBe(3);

    // 3. Generate Policy v0 decision
    const decision = evaluateTrainingDecisionPolicyV0(
      'Barbell Bench Press',
      {
        name: 'Barbell Bench Press',
        targetWeight: 100,
        targetReps: 8,
        targetRpe: 8,
        targetSets: 3,
        targetUnit: 'kg',
      },
      aggregateMultiSessionEvidence(useAppStore.getState().workouts),
      {
        workoutId: 'w_bench_3',
        repRange: { min: 6, max: 8 },
        stepIncrement: 2.5,
        incrementApprovalSource: 'coach_approved',
      }
    );

    expect(decision).toBeDefined();
    expect(decision.actionCategory).toBe('candidate_load_progression');
    expect(decision.proposedPrescription.weight).toBe(102.5);
    expect(decision.status).toBe('pending');

    useAppStore.setState({
      policyDecisionRecords: { [decision.id]: decision },
      policyDecisionsLedgerHistory: [decision],
    });

    // 4. Accept the decision
    useAppStore.getState().acceptPolicyDecision(decision!.id);
    const acceptedDec = useAppStore.getState().policyDecisionRecords[decision!.id];
    expect(acceptedDec.status).toBe('accepted');

    // Planned workout is STILL at 100 kg (deliberate application required)
    expect(useAppStore.getState().plannedWorkouts[0].exercises[0].targetWeight).toBe(100);

    // 5. Deliberately apply to the future workout plan
    const applyResult = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: decision!.id,
      targetPlanId: initialPlan.id,
      actionSource: 'athlete_confirmed',
    });
    expect(applyResult.error).toBeUndefined();
    expect(applyResult.success).toBe(true);

    // Now planned workout has 102.5 kg
    const updatedPlan = useAppStore.getState().plannedWorkouts[0];
    expect(updatedPlan.exercises[0].targetWeight).toBe(102.5);

    // Audit record exists
    expect(useAppStore.getState().policyDecisionApplications.length).toBe(1);

    // 6. Start new workout from updated plan
    const newSessionExercises = updatedPlan.exercises.map((pe) => ({
      name: pe.name,
      sets: Array.from({ length: pe.targetSets }, () => ({
        reps: pe.targetReps,
        weight: pe.targetWeight ?? 0,
        unit: pe.targetUnit ?? ('kg' as const),
        completed: true,
        prescribedWeight: pe.targetWeight,
        prescribedReps: pe.targetReps,
        prescribedUnit: pe.targetUnit ?? ('kg' as const),
        prescribedRpe: pe.targetRpe,
      })),
    }));

    const session4: WorkoutEntry = {
      id: 'w_bench_4',
      date: '2026-10-14T10:00:00Z',
      exercises: newSessionExercises,
    };
    useAppStore.getState().addWorkout(session4);

    expect(useAppStore.getState().workouts.length).toBe(4);
    expect(useAppStore.getState().workouts[3].exercises[0].sets[0].weight).toBe(102.5);

    // 7. Historical workouts remain untouched
    for (let i = 0; i < 3; i++) {
      expect(useAppStore.getState().workouts[i].exercises[0].sets[0].weight).toBe(100);
      expect(useAppStore.getState().workouts[i].exercises[0].sets[0].prescribedWeight).toBe(100);
    }
  });

  // ── Single-Target Integrity Suite (Task 3C-7 Final Hardening) ───────────────
  describe('Single-Target Application Integrity & Invariants', () => {
    it('enforces exact application-target identity: idempotency, rejection of second instance in same plan, and different plan', () => {
      // Plan with 3 exercises: 2 instances of Barbell Back Squat and 1 Romanian Deadlift
      const multiTargetPlan: PlannedWorkout = {
        id: 'plan_multi_squat',
        name: 'Multi Squat Day',
        createdAt: '2026-10-01T00:00:00Z',
        exercises: [
          {
            id: 'ex_sq_heavy',
            name: 'Barbell Back Squat',
            targetSets: 3,
            targetReps: 8,
            targetWeight: 100,
            targetUnit: 'kg',
            targetRpe: 8,
            notes: 'Heavy primary',
          },
          {
            id: 'ex_rdl',
            name: 'Romanian Deadlift',
            targetSets: 3,
            targetReps: 10,
            targetWeight: 80,
            targetUnit: 'kg',
            targetRpe: 8,
          },
          {
            id: 'ex_sq_volume',
            name: 'Barbell Back Squat',
            targetSets: 3,
            targetReps: 8,
            targetWeight: 100,
            targetUnit: 'kg',
            targetRpe: 8,
            notes: 'Back-off volume',
          },
        ],
      };

      const planB: PlannedWorkout = {
        id: 'plan_b_other',
        name: 'Other Plan B',
        createdAt: '2026-10-01T00:00:00Z',
        exercises: [
          {
            id: 'ex_b_sq',
            name: 'Barbell Back Squat',
            targetSets: 3,
            targetReps: 8,
            targetWeight: 100,
            targetUnit: 'kg',
            targetRpe: 8,
          },
        ],
      };

      const decision = createSampleAcceptedDecision();

      useAppStore.setState({
        plannedWorkouts: [multiTargetPlan, planB],
        policyDecisionRecords: { [decision.id]: decision },
      });

      // 1. Initial deliberate application to Target 1 (Index 0 / 'ex_sq_heavy')
      const applyResult = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
        decisionId: decision.id,
        targetPlanId: multiTargetPlan.id,
        targetExerciseIndex: 0,
        targetExerciseId: 'ex_sq_heavy',
        actionSource: 'athlete_confirmed',
      });

      expect(applyResult.success).toBe(true);
      expect(applyResult.alreadyApplied).toBeFalsy();
      expect(useAppStore.getState().policyDecisionApplications.length).toBe(1);

      const planAfterApp1 = useAppStore.getState().plannedWorkouts.find((p) => p.id === multiTargetPlan.id)!;
      expect(planAfterApp1.exercises[0].targetWeight).toBe(102.5);
      expect(planAfterApp1.exercises[1].targetWeight).toBe(80);
      expect(planAfterApp1.exercises[2].targetWeight).toBe(100); // Second instance untouched

      const decisionAfterApp1 = useAppStore.getState().policyDecisionRecords[decision.id];
      expect(decisionAfterApp1.appliedAt).toBeDefined();
      expect(decisionAfterApp1.appliedTargetPlanId).toBe(multiTargetPlan.id);
      expect(decisionAfterApp1.appliedTargetExerciseId).toBe('ex_sq_heavy');
      expect(decisionAfterApp1.appliedTargetExerciseIndex).toBe(0);

      // 2. Applying the same decision twice to the exact same target is IDEMPOTENT and creates NO duplicate audit
      const idempotentResult = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
        decisionId: decision.id,
        targetPlanId: multiTargetPlan.id,
        targetExerciseIndex: 0,
        targetExerciseId: 'ex_sq_heavy',
        actionSource: 'athlete_confirmed',
      });

      expect(idempotentResult.success).toBe(true);
      expect(idempotentResult.alreadyApplied).toBe(true);
      expect(useAppStore.getState().policyDecisionApplications.length).toBe(1); // No new audit entry

      // 3. Applying the same decision to a different plan is REJECTED
      const diffPlanResult = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
        decisionId: decision.id,
        targetPlanId: planB.id,
        targetExerciseIndex: 0,
        targetExerciseId: 'ex_b_sq',
        actionSource: 'athlete_confirmed',
      });

      expect(diffPlanResult.success).toBe(false);
      expect(diffPlanResult.error).toBe('already_applied_to_other_target');
      expect(diffPlanResult.message).toContain("already been applied to workout plan template 'Multi Squat Day'");
      expect(useAppStore.getState().policyDecisionApplications.length).toBe(1);
      const planBAfter = useAppStore.getState().plannedWorkouts.find((p) => p.id === planB.id)!;
      expect(planBAfter.exercises[0].targetWeight).toBe(100); // Plan B remains unchanged

      // 4. Applying the same decision to a different exercise in the same plan is REJECTED
      const diffExerciseResult = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
        decisionId: decision.id,
        targetPlanId: multiTargetPlan.id,
        targetExerciseIndex: 1,
        targetExerciseId: 'ex_rdl',
        actionSource: 'athlete_confirmed',
      });

      expect(diffExerciseResult.success).toBe(false);
      expect(diffExerciseResult.error).toBe('exercise_mismatch');
      expect(useAppStore.getState().policyDecisionApplications.length).toBe(1);

      // 5. Applying the same decision to a second instance of the same exercise in the same plan is REJECTED,
      // even when explicitly selected in the UI
      const secondInstanceResult = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
        decisionId: decision.id,
        targetPlanId: multiTargetPlan.id,
        targetExerciseIndex: 2,
        targetExerciseId: 'ex_sq_volume',
        actionSource: 'athlete_confirmed',
      });

      expect(secondInstanceResult.success).toBe(false);
      expect(secondInstanceResult.error).toBe('already_applied_to_other_target');
      expect(secondInstanceResult.message).toContain("already been applied to exercise 'Barbell Back Squat' (ID: ex_sq_heavy)");
      expect(useAppStore.getState().policyDecisionApplications.length).toBe(1);

      // Verify second instance remains completely unchanged
      const planAfterFailedSecondInstance = useAppStore.getState().plannedWorkouts.find((p) => p.id === multiTargetPlan.id)!;
      expect(planAfterFailedSecondInstance.exercises[2].targetWeight).toBe(100);

      // 6. Rejected attempts leave all plans, decision metadata, and audit entries unchanged
      const currentDecision = useAppStore.getState().policyDecisionRecords[decision.id];
      expect(currentDecision.appliedTargetPlanId).toBe(multiTargetPlan.id);
      expect(currentDecision.appliedTargetExerciseId).toBe('ex_sq_heavy');
      expect(currentDecision.appliedTargetExerciseIndex).toBe(0);
      expect(useAppStore.getState().policyDecisionApplications.length).toBe(1);
    });

    it('enforces single-target integrity using exercise index as fallback when stable IDs are unavailable', () => {
      const planWithoutIds: PlannedWorkout = {
        id: 'plan_no_ids',
        name: 'Plan Without IDs',
        createdAt: '2026-10-01T00:00:00Z',
        exercises: [
          {
            name: 'Barbell Back Squat',
            targetSets: 3,
            targetReps: 8,
            targetWeight: 100,
            targetUnit: 'kg',
            targetRpe: 8,
          },
          {
            name: 'Barbell Back Squat',
            targetSets: 3,
            targetReps: 8,
            targetWeight: 100,
            targetUnit: 'kg',
            targetRpe: 8,
          },
        ],
      };

      const decision = createSampleAcceptedDecision();

      useAppStore.setState({
        plannedWorkouts: [planWithoutIds],
        policyDecisionRecords: { [decision.id]: decision },
      });

      // Apply to index 0
      const res0 = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
        decisionId: decision.id,
        targetPlanId: planWithoutIds.id,
        targetExerciseIndex: 0,
      });
      expect(res0.success).toBe(true);
      expect(useAppStore.getState().policyDecisionApplications.length).toBe(1);

      // Attempt applying to index 1 (second instance without stable ID)
      const res1 = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
        decisionId: decision.id,
        targetPlanId: planWithoutIds.id,
        targetExerciseIndex: 1,
      });

      expect(res1.success).toBe(false);
      expect(res1.error).toBe('already_applied_to_other_target');
      expect(res1.message).toContain('already been applied to exercise instance at index 0');
      expect(useAppStore.getState().policyDecisionApplications.length).toBe(1);

      // Verify index 1 remains untouched
      const planCheck = useAppStore.getState().plannedWorkouts.find((p) => p.id === planWithoutIds.id)!;
      expect(planCheck.exercises[0].targetWeight).toBe(102.5);
      expect(planCheck.exercises[1].targetWeight).toBe(100);
    });

    it('proves that a matching proposed prescription on an unrelated target does NOT count as proof that the decision was applied there', () => {
      // Case A: Decision was applied to Plan A (102.5kg). Unrelated Plan B coincidentally has 102.5kg.
      const planA = createSamplePlannedWorkout({ id: 'plan_A', name: 'Plan A' });
      const planBWithMatchingNumbers: PlannedWorkout = {
        id: 'plan_B_coincidental',
        name: 'Coincidental Plan B',
        createdAt: '2026-10-01T00:00:00Z',
        exercises: [
          {
            id: 'ex_b',
            name: 'Barbell Back Squat',
            targetSets: 3,
            targetReps: 8,
            targetWeight: 102.5, // Matches proposed targets coincidentally
            targetUnit: 'kg',
            targetRpe: 8,
          },
        ],
      };

      const decisionA = createSampleAcceptedDecision();

      useAppStore.setState({
        plannedWorkouts: [planA, planBWithMatchingNumbers],
        policyDecisionRecords: { [decisionA.id]: decisionA },
      });

      // Apply to Plan A
      useAppStore.getState().applyPolicyDecisionToFuturePrescription({
        decisionId: decisionA.id,
        targetPlanId: planA.id,
      });

      // Evaluating against Plan B does NOT return alreadyApplied: true
      const validationDiffPlan = validatePolicyDecisionApplication(
        useAppStore.getState().policyDecisionRecords[decisionA.id],
        planBWithMatchingNumbers,
        0,
        'ex_b',
        useAppStore.getState().policyDecisionApplications
      );
      expect(validationDiffPlan.valid).toBe(false);
      expect(validationDiffPlan.alreadyApplied).toBeFalsy();
      expect(validationDiffPlan.error).toBe('already_applied_to_other_target');

      // Case B: Decision was NEVER applied anywhere. Plan C has 102.5kg (differs from baseline 100kg).
      const unappliedDecision = createSampleAcceptedDecision({ id: 'dec_unapplied_brand_new' });
      const validationUnapplied = validatePolicyDecisionApplication(
        unappliedDecision,
        planBWithMatchingNumbers,
        0,
        'ex_b',
        useAppStore.getState().policyDecisionApplications
      );
      expect(validationUnapplied.valid).toBe(false);
      expect(validationUnapplied.alreadyApplied).toBeFalsy();
      expect(validationUnapplied.error).toBe('stale_prescription');
      expect(validationUnapplied.message).toContain('stale_prescription: target load drifted from baseline 100 kg to 102.5 kg');
    });
  });

  // ── Persistence, Rehydration, Import, and Reset Suite (Task 3C-7) ───────────
  describe('Persistence, Recovery, and Import Coverage for policyDecisionApplications', () => {
    it('initializes policyDecisionApplications to empty array on rehydration when missing in legacy stored state', () => {
      // Clear store and simulate legacy state without policyDecisionApplications property
      useAppStore.setState({
        policyDecisionApplications: undefined as any,
      });
      expect(useAppStore.getState().policyDecisionApplications).toBeUndefined();

      // Trigger store rehydration logic directly
      const state = useAppStore.getState();
      if (!Array.isArray(state.policyDecisionApplications)) {
        useAppStore.setState({ policyDecisionApplications: [] });
      }

      expect(useAppStore.getState().policyDecisionApplications).toEqual([]);
    });

    it('clears policyDecisionApplications on clearPolicyDecisions, clearAllData, and logout({ clearLocalData: true })', () => {
      const sampleAudit: any = {
        id: 'audit_test_reset',
        decisionId: 'dec_reset',
        policyVersion: '0.1.0',
        targetPlanId: 'p_reset',
        targetPlanName: 'Plan Reset',
        targetExerciseName: 'Barbell Back Squat',
        targetExerciseIndex: 0,
        previousPrescription: { weight: 100, reps: 8, sets: 3, unit: 'kg' },
        appliedPrescription: { weight: 102.5, reps: 8, sets: 3, unit: 'kg' },
        appliedAt: '2026-10-14T10:00:00Z',
        actionSource: 'athlete_confirmed',
        status: 'applied',
      };

      // 1. clearPolicyDecisions
      useAppStore.setState({ policyDecisionApplications: [sampleAudit] });
      expect(useAppStore.getState().policyDecisionApplications.length).toBe(1);
      useAppStore.getState().clearPolicyDecisions();
      expect(useAppStore.getState().policyDecisionApplications).toEqual([]);

      // 2. clearAllData
      useAppStore.setState({ policyDecisionApplications: [sampleAudit] });
      useAppStore.getState().clearAllData();
      expect(useAppStore.getState().policyDecisionApplications).toEqual([]);

      // 3. logout({ clearLocalData: true })
      useAppStore.setState({ policyDecisionApplications: [sampleAudit] });
      useAppStore.getState().logout({ clearLocalData: true });
      expect(useAppStore.getState().policyDecisionApplications).toEqual([]);
    });

    it('safely filters out untrustworthy or malformed audit records during importAllData while preserving valid ones', () => {
      const validAudit = {
        id: 'audit_valid_1',
        decisionId: 'dec_valid_1',
        policyVersion: '0.1.0' as const,
        targetPlanId: 'plan_1',
        targetPlanName: 'Plan 1',
        targetExerciseName: 'Barbell Back Squat',
        targetExerciseIndex: 0,
        previousPrescription: { weight: 100, reps: 8, sets: 3, unit: 'kg' as const },
        appliedPrescription: { weight: 102.5, reps: 8, sets: 3, unit: 'kg' as const },
        appliedAt: '2026-10-14T10:00:00Z',
        actionSource: 'athlete_confirmed' as const,
        status: 'applied' as const,
      };

      const malformedAudits = [
        null,
        undefined,
        {},
        { id: '', decisionId: 'dec_1' }, // Missing ID
        { id: 'aud_bad_1', decisionId: '' }, // Missing decisionId
        { id: 'aud_bad_2', decisionId: 'dec_2', targetPlanId: '' }, // Missing targetPlanId
        { id: 'aud_bad_3', decisionId: 'dec_3', targetPlanId: 'p3', targetExerciseName: '' }, // Missing exercise name
        { id: 'aud_bad_4', decisionId: 'dec_4', targetPlanId: 'p4', targetExerciseName: 'Squat', targetExerciseIndex: -1 }, // Negative index
        { id: 'aud_bad_5', decisionId: 'dec_5', targetPlanId: 'p5', targetExerciseName: 'Squat', targetExerciseIndex: 0, status: 'pending' }, // Non-applied status
        { id: 'aud_bad_6', decisionId: 'dec_6', targetPlanId: 'p6', targetExerciseName: 'Squat', targetExerciseIndex: 0, status: 'applied', appliedAt: 'invalid-date' }, // Invalid date
        { id: 'aud_bad_7', decisionId: 'dec_7', targetPlanId: 'p7', targetExerciseName: 'Squat', targetExerciseIndex: 0, status: 'applied', appliedAt: '2026-10-14T10:00:00Z', appliedPrescription: { weight: NaN, reps: 8 } }, // Non-finite weight
      ];

      useAppStore.setState({ policyDecisionApplications: [] });

      const ok = useAppStore.getState().importAllData({
        policyDecisionApplications: [validAudit, ...malformedAudits],
      });

      expect(ok).toBe(true);
      const apps = useAppStore.getState().policyDecisionApplications;
      expect(apps.length).toBe(1);
      expect(apps[0].id).toBe('audit_valid_1');
      expect(apps[0].appliedPrescription.weight).toBe(102.5);

      // Verify importing empty payload retains existing applications without wipe
      useAppStore.getState().importAllData({});
      expect(useAppStore.getState().policyDecisionApplications.length).toBe(1);
    });

    it('rejects mismatched audit records during importAllData and validation so they cannot establish application', () => {
      // 1. Mismatched audit during importAllData:
      // Decision in import is Barbell Back Squat, but audit record claims Bench Press
      const squatDecision = createSampleAcceptedDecision({ id: 'dec_squat_mismatch' });
      const mismatchedAudit = {
        id: 'audit_mismatched_1',
        decisionId: 'dec_squat_mismatch',
        policyVersion: '0.1.0' as const,
        targetPlanId: 'plan_1',
        targetPlanName: 'Plan 1',
        targetExerciseName: 'Barbell Bench Press', // Mismatched with Squat!
        targetExerciseIndex: 0,
        previousPrescription: { weight: 100, reps: 8, sets: 3, unit: 'kg' as const },
        appliedPrescription: { weight: 102.5, reps: 8, sets: 3, unit: 'kg' as const },
        appliedAt: '2026-10-14T10:00:00Z',
        actionSource: 'athlete_confirmed' as const,
        status: 'applied' as const,
      };

      useAppStore.setState({ policyDecisionApplications: [] });
      useAppStore.getState().importAllData({
        policyDecisionRecords: { [squatDecision.id]: squatDecision },
        policyDecisionApplications: [mismatchedAudit],
      });

      // Mismatched audit is safely filtered out and dropped
      expect(useAppStore.getState().policyDecisionApplications.length).toBe(0);

      // 2. Mismatched audit during validatePolicyDecisionApplication:
      // Even if a corrupt/mismatched audit record exists in existingApplications,
      // validatePolicyDecisionApplication ignores it because targetExerciseName doesn't match canonical exercise
      const plan = createSamplePlannedWorkout({
        exercises: [
          {
            name: 'Barbell Back Squat',
            targetSets: 3,
            targetReps: 8,
            targetWeight: 100,
            targetUnit: 'kg',
            targetRpe: 8,
          },
        ],
      });

      const validation = validatePolicyDecisionApplication(
        squatDecision,
        plan,
        0,
        undefined,
        [mismatchedAudit]
      );

      // Does not treat the mismatched audit as a prior application
      expect(validation.valid).toBe(true);
      expect(validation.alreadyApplied).toBeFalsy();
    });
  });
});
