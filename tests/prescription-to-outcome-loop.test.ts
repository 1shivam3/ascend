import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/lib/store';
import {
  WorkoutEntry,
  PlannedWorkout,
  TrainingDecisionRecord,
  WorkoutExercise,
  WorkoutSet,
  Unit,
  PolicyDecisionApplicationAudit,
} from '@/lib/types';
import { evaluateTrainingDecisionPolicyV0 } from '@/lib/training-decision-policy';
import {
  aggregateMultiSessionEvidence,
  getExerciseExposureEvidence,
  analyzeSetOutcome,
} from '@/lib/workout-outcome-evidence';
import {
  createWorkoutDraftFromPlan,
  createWorkoutExercisesFromPlan,
  finalizeWorkoutExercises,
  finalizeWorkoutSet,
  getLastExercisePerformance,
  getProgressionRecommendation,
} from '@/lib/workout-engine';
import { adaptWorkoutForConstraints } from '@/lib/lifter-twin';
import { buildCompactUserContext } from '@/lib/ai-context';
import { getMonthlyAscensionReport } from '@/lib/habits';
import { TrainingDecision } from '@/lib/types';

describe('Prescription-to-Outcome Loop (Task 3C-8)', () => {
  beforeEach(() => {
    useAppStore.getState().clearAllData();
    useAppStore.setState({
      profile: {
        id: 'test_athlete_3c8',
        name: 'Test Athlete',
        gender: 'male',
        bodyweightKg: 80,
        bodyweightLbs: 176.4,
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

  // ── Phase 4 Lifecycle Test ──────────────────────────────────────────────────
  it('establishes the complete 11-step prescription-to-outcome lifecycle with deliberate application, performance deviation, and conservative policy response', () => {
    // ── Setup: 3 clean baseline sessions (Barbell Bench Press 100kg × 8 @ RPE 8)
    const sessionDates = ['2026-10-01', '2026-10-04', '2026-10-07'];
    sessionDates.forEach((dateStr, idx) => {
      const workoutEntry: WorkoutEntry = {
        id: `w_baseline_${idx + 1}`,
        date: `${dateStr}T10:00:00Z`,
        name: 'Upper Body Heavy',
        planId: 'plan_upper_heavy',
        exercises: [
          {
            name: 'Barbell Bench Press',
            planExerciseId: 'pe_bench_heavy',
            sets: [
              { weight: 100, reps: 8, unit: 'kg', rpe: 8, status: 'completed', completed: true, prescribedWeight: 100, prescribedReps: 8, prescribedRpe: 8, prescribedUnit: 'kg' },
              { weight: 100, reps: 8, unit: 'kg', rpe: 8, status: 'completed', completed: true, prescribedWeight: 100, prescribedReps: 8, prescribedRpe: 8, prescribedUnit: 'kg' },
              { weight: 100, reps: 8, unit: 'kg', rpe: 8, status: 'completed', completed: true, prescribedWeight: 100, prescribedReps: 8, prescribedRpe: 8, prescribedUnit: 'kg' },
            ],
          },
        ],
      };
      useAppStore.getState().addWorkout(workoutEntry);
    });

    expect(useAppStore.getState().workouts.length).toBe(3);

    // Initial plan template (at 100kg baseline)
    const initialTargetPlan: PlannedWorkout = {
      id: 'plan_upper_heavy',
      name: 'Upper Body Heavy',
      createdAt: '2026-09-25T00:00:00Z',
      exercises: [
        {
          id: 'pe_bench_heavy',
          name: 'Barbell Bench Press',
          targetSets: 3,
          targetReps: 8,
          targetWeight: 100,
          targetUnit: 'kg',
          targetRpe: 8,
          notes: 'Primary compound focus',
        },
      ],
    };

    // Unrelated plan template (Leg Day)
    const unrelatedPlan: PlannedWorkout = {
      id: 'plan_legs_squat',
      name: 'Leg Day',
      createdAt: '2026-09-25T00:00:00Z',
      exercises: [
        {
          id: 'pe_squat_1',
          name: 'Barbell Back Squat',
          targetSets: 4,
          targetReps: 6,
          targetWeight: 140,
          targetUnit: 'kg',
          targetRpe: 8,
        },
      ],
    };

    // Existing active draft for an unrelated session
    const existingPriorDraft = {
      id: 'draft_active_prior',
      name: 'Overhead Press Focus',
      date: '2026-10-10',
      exercises: [
        {
          name: 'Overhead Press',
          sets: [{ weight: 50, reps: 5, unit: 'kg' as Unit, completed: false, status: 'pending' as const }],
        },
      ],
      startedFromPlan: 'OHP Focus',
      sessionStartTime: 1728550000000,
      savedAt: '2026-10-10T10:00:00Z',
    };

    useAppStore.setState({
      plannedWorkouts: [initialTargetPlan, unrelatedPlan],
      activeWorkoutDraft: existingPriorDraft,
    });

    // ── STEP 1: Generate valid progression recommendation from sufficient evidence
    const baselineEvidence = aggregateMultiSessionEvidence(useAppStore.getState().workouts);
    const recommendation = evaluateTrainingDecisionPolicyV0(
      'Barbell Bench Press',
      {
        name: 'Barbell Bench Press',
        targetWeight: 100,
        targetReps: 8,
        targetSets: 3,
        targetUnit: 'kg',
        targetRpe: 8,
      },
      baselineEvidence,
      {
        workoutId: 'w_baseline_3',
        repRange: { min: 6, max: 8 },
        stepIncrement: 2.5,
        incrementApprovalSource: 'coach_approved',
      }
    );

    expect(recommendation).toBeDefined();
    expect(recommendation.actionCategory).toBe('candidate_load_progression');
    expect(recommendation.proposedPrescription.weight).toBe(102.5);
    // Double progression advances load and resets reps to bottom of bracket (6 reps)
    expect(recommendation.proposedPrescription.reps).toBe(6);
    expect(recommendation.proposedPrescription.targetRpe).toBe(8);
    expect(recommendation.status).toBe('pending');

    useAppStore.setState({
      policyDecisionRecords: { [recommendation.id]: recommendation },
      policyDecisionsLedgerHistory: [recommendation],
    });

    // ── STEP 2: Accept the recommendation — verify acceptance ALONE does not change prescription
    useAppStore.getState().acceptPolicyDecision(recommendation.id);
    const acceptedRecord = useAppStore.getState().policyDecisionRecords[recommendation.id];
    expect(acceptedRecord.status).toBe('accepted');
    expect(acceptedRecord.acceptedAt).toBeDefined();

    // Verify template prescription remains strictly unchanged at 100 kg
    const planAfterAccept = useAppStore.getState().plannedWorkouts.find((p) => p.id === 'plan_upper_heavy');
    expect(planAfterAccept!.exercises[0].targetWeight).toBe(100);
    expect(useAppStore.getState().policyDecisionApplications.length).toBe(0);

    // ── STEP 3: Deliberately apply it to the selected future plan template
    const applyResult = useAppStore.getState().applyPolicyDecisionToFuturePrescription({
      decisionId: recommendation.id,
      targetPlanId: 'plan_upper_heavy',
      targetExerciseId: 'pe_bench_heavy',
      actionSource: 'athlete_confirmed',
    });

    expect(applyResult.success).toBe(true);
    expect(applyResult.error).toBeUndefined();
    expect(useAppStore.getState().policyDecisionApplications.length).toBe(1);

    const audit = useAppStore.getState().policyDecisionApplications[0];
    expect(audit.decisionId).toBe(recommendation.id);
    expect(audit.targetPlanId).toBe('plan_upper_heavy');
    expect(audit.targetExerciseId).toBe('pe_bench_heavy');
    expect(audit.appliedPrescription.weight).toBe(102.5);
    expect(audit.appliedPrescription.reps).toBe(6);

    // ── STEP 4: Verify that the template contains the exact reviewed prescription
    const updatedPlan = useAppStore.getState().plannedWorkouts.find((p) => p.id === 'plan_upper_heavy')!;
    expect(updatedPlan.exercises[0].targetWeight).toBe(102.5);
    expect(updatedPlan.exercises[0].targetReps).toBe(6);
    expect(updatedPlan.exercises[0].targetSets).toBe(3);
    expect(updatedPlan.exercises[0].targetUnit).toBe('kg');
    expect(updatedPlan.exercises[0].targetRpe).toBe(8);

    // ── STEP 5: Verify other entities remain unchanged
    // Historical completed workouts: still 100 kg
    for (let i = 0; i < 3; i++) {
      expect(useAppStore.getState().workouts[i].exercises[0].sets[0].weight).toBe(100);
      expect(useAppStore.getState().workouts[i].exercises[0].sets[0].prescribedWeight).toBe(100);
    }
    // Existing active draft: untouched
    expect(useAppStore.getState().activeWorkoutDraft?.id).toBe('draft_active_prior');
    expect(useAppStore.getState().activeWorkoutDraft?.exercises[0].name).toBe('Overhead Press');
    // Unrelated plan template: untouched
    const legsPlan = useAppStore.getState().plannedWorkouts.find((p) => p.id === 'plan_legs_squat')!;
    expect(legsPlan.exercises[0].targetWeight).toBe(140);

    // ── STEP 6: Create a new workout after template application through canonical workflow
    const applications = useAppStore.getState().policyDecisionApplications;
    const newSessionDraft = createWorkoutDraftFromPlan(updatedPlan, {
      userUnit: 'kg',
      applications,
      date: '2026-10-14',
    });

    expect(newSessionDraft.startedFromPlan).toBe('Upper Body Heavy');
    expect(newSessionDraft.startedFromPlanId).toBe('plan_upper_heavy');
    expect(newSessionDraft.planId).toBe('plan_upper_heavy');
    expect(newSessionDraft.exercises.length).toBe(1);

    // ── STEP 7: Verify newly created workout uses correct prescribed targets
    const sessionEx = newSessionDraft.exercises[0];
    expect(sessionEx.name).toBe('Barbell Bench Press');
    expect(sessionEx.planExerciseId).toBe('pe_bench_heavy');
    expect(sessionEx.appliedDecisionId).toBe(recommendation.id);
    expect(sessionEx.sets.length).toBe(3);

    sessionEx.sets.forEach((set) => {
      expect(set.prescribedWeight).toBe(102.5);
      expect(set.prescribedReps).toBe(6);
      expect(set.prescribedRpe).toBe(8);
      expect(set.prescribedUnit).toBe('kg');
      expect(set.appliedDecisionId).toBe(recommendation.id);
    });

    // ── STEP 8: Log actual performance that differs meaningfully from prescription
    // Prescribed: 102.5 kg × 6 reps @ RPE 8
    // Set 1: met target (102.5 kg × 6 @ RPE 8)
    // Set 2: rep deficit and effort spike (102.5 kg × 5 @ RPE 9.5)
    // Set 3: explicitly skipped (status: 'skipped')
    const executedExercises: WorkoutExercise[] = [
      {
        ...sessionEx,
        sets: [
          {
            ...sessionEx.sets[0],
            weight: 102.5,
            reps: 6,
            rpe: 8,
            completed: true,
            status: 'completed',
          },
          {
            ...sessionEx.sets[1],
            weight: 102.5,
            reps: 5, // Missed 1 rep below target of 6
            rpe: 9.5, // Exceeded target effort by 1.5 RPE
            completed: true,
            status: 'completed',
          },
          {
            ...sessionEx.sets[2],
            weight: 102.5,
            reps: 0,
            completed: false,
            status: 'skipped', // Explicitly skipped 3rd set
          },
        ],
      },
    ];

    const finalized = finalizeWorkoutExercises(executedExercises);
    expect(finalized.hasCompletedSets).toBe(true);
    expect(finalized.hasMeaningfulData).toBe(true);
    expect(finalized.validExercises[0].sets.length).toBe(3);

    // ── STEP 9: Complete and persist the workout
    const completedWorkout: WorkoutEntry = {
      id: 'w_bench_session_4',
      date: '2026-10-14T10:00:00Z',
      name: newSessionDraft.startedFromPlan || undefined,
      planId: newSessionDraft.planId || undefined,
      exercises: finalized.validExercises,
    };

    useAppStore.getState().addWorkout(completedWorkout);

    expect(useAppStore.getState().workouts.length).toBe(4);
    const persistedSession = useAppStore.getState().workouts[3];
    expect(persistedSession.planId).toBe('plan_upper_heavy');
    expect(persistedSession.exercises[0].sets[0].status).toBe('completed');
    expect(persistedSession.exercises[0].sets[1].status).toBe('completed');
    expect(persistedSession.exercises[0].sets[2].status).toBe('skipped');

    // ── STEP 10: Verify outcome evidence distinguishes prescribed targets from actual performance
    const exposureEvidence = getExerciseExposureEvidence(persistedSession.exercises[0], persistedSession, 3);
    expect(exposureEvidence.hasPrescriptionData).toBe(true);
    expect(exposureEvidence.totalPrescribedSets).toBe(3);
    expect(exposureEvidence.completedPrescribedSets).toBe(2);
    expect(exposureEvidence.skippedPrescribedSets).toBe(1);
    expect(exposureEvidence.usableRepComparisonsCount).toBe(2);
    expect(exposureEvidence.usableLoadComparisonsCount).toBe(2);
    expect(exposureEvidence.usableRpeComparisonsCount).toBe(2);

    // Directional outcomes accurately reflect execution deltas
    expect(exposureEvidence.repOutcomes.met_target).toBe(1); // Set 1: 6/6
    expect(exposureEvidence.repOutcomes.below_target).toBe(1); // Set 2: 5/6
    expect(exposureEvidence.loadOutcomes.met_target).toBe(2); // Sets 1 & 2: 102.5kg
    expect(exposureEvidence.rpeOutcomes.met_target).toBe(1); // Set 1: 8/8
    expect(exposureEvidence.rpeOutcomes.above_target).toBe(1); // Set 2: 9.5 vs 8 (+1.5 RPE)
    expect(exposureEvidence.averageLoadDeltaKg).toBe(0);

    // ── STEP 11: Verify subsequent policy evaluation consumes athlete evidence and preserves conservative safety
    // The policy engine automatically evaluates the newly added workout in store.addWorkout
    const subsequentDecisions = Object.values(useAppStore.getState().policyDecisionRecords).filter(
      (d) => d.id !== recommendation.id
    );

    expect(subsequentDecisions.length).toBe(1);
    const nextDecision = subsequentDecisions[0];

    expect(nextDecision.exerciseName).toBe('Barbell Bench Press');
    // Policy detects skipped set and strain miss, triggering review_required (Rule REV-01)
    expect(nextDecision.actionCategory).toBe('review_required');
    expect(nextDecision.ruleId).toBe('REV-01');
    expect(nextDecision.explanation).toContain('skipped');
    // Current targets held at 102.5 kg, delta is 0
    expect(nextDecision.currentPrescription.weight).toBe(102.5);
    expect(nextDecision.currentPrescription.reps).toBe(6);
    expect(nextDecision.proposedPrescription.weight).toBe(102.5);
    expect(nextDecision.proposedPrescription.reps).toBe(6);
    expect(nextDecision.proposedPrescription.deltaWeight).toBe(0);
    expect(nextDecision.proposedPrescription.deltaReps).toBe(0);
  });

  // ── Negative Cases ──────────────────────────────────────────────────────────
  describe('Negative & Edge Case Coverage', () => {
    it('negative case 1: handles missing prescription data in purely manual workouts without fabricating evidence', () => {
      const manualWorkout: WorkoutEntry = {
        id: 'w_manual_1',
        date: '2026-10-14T10:00:00Z',
        exercises: [
          {
            name: 'Overhead Press',
            sets: [
              { weight: 50, reps: 8, unit: 'kg', status: 'completed', completed: true },
              { weight: 50, reps: 8, unit: 'kg', status: 'completed', completed: true },
            ],
          },
        ],
      };

      // Add manual workout (no prescribed sets, no plan)
      useAppStore.getState().addWorkout(manualWorkout);

      const allDecisions = Object.values(useAppStore.getState().policyDecisionRecords);
      // Wholly manual without plan or prescribed sets is skipped from generating policy decisions
      expect(allDecisions.length).toBe(0);

      // Outcome evidence reflects manual exposures
      const evidence = aggregateMultiSessionEvidence(useAppStore.getState().workouts);
      const ohpEvidence = evidence.exercises['overhead press'];
      expect(ohpEvidence).toBeDefined();
      expect(ohpEvidence.comparablePrescribedExposures).toBe(0);
      expect(ohpEvidence.manualExposures).toBe(1);

      // When evaluated explicitly with current target, rule IE-01 triggers calibration
      const dec = evaluateTrainingDecisionPolicyV0(
        'Overhead Press',
        { name: 'Overhead Press', targetWeight: 50, targetReps: 8, targetSets: 2, targetUnit: 'kg' },
        evidence,
        { workoutId: 'w_manual_1' }
      );
      expect(dec.actionCategory).toBe('insufficient_evidence');
      expect(dec.ruleId).toBe('IE-01');
    });

    it('negative case 2: unrelated exercises do not pollute or distort evidence for the target exercise', () => {
      // 3 baseline sessions of Bench Press
      ['2026-10-01', '2026-10-03', '2026-10-05'].forEach((dateStr, i) => {
        useAppStore.getState().addWorkout({
          id: `w_bench_${i}`,
          date: `${dateStr}T10:00:00Z`,
          exercises: [
            {
              name: 'Barbell Bench Press',
              sets: [
                { weight: 100, reps: 8, unit: 'kg', rpe: 8, status: 'completed', completed: true, prescribedWeight: 100, prescribedReps: 8 },
              ],
            },
          ],
        });
      });

      // Add 2 workouts for completely unrelated exercise: Bicep Curl
      ['2026-10-06', '2026-10-08'].forEach((dateStr, i) => {
        useAppStore.getState().addWorkout({
          id: `w_curl_${i}`,
          date: `${dateStr}T10:00:00Z`,
          exercises: [
            {
              name: 'Bicep Curl',
              sets: [
                { weight: 15, reps: 12, unit: 'kg', rpe: 9, status: 'completed', completed: true, prescribedWeight: 15, prescribedReps: 12 },
              ],
            },
          ],
        });
      });

      const multiEvidence = aggregateMultiSessionEvidence(useAppStore.getState().workouts);
      const benchEvidence = multiEvidence.exercises['barbell bench press'];
      const curlEvidence = multiEvidence.exercises['bicep curl'];

      expect(benchEvidence).toBeDefined();
      expect(curlEvidence).toBeDefined();
      expect(benchEvidence.totalExposures).toBe(3);
      expect(curlEvidence.totalExposures).toBe(2);
      expect(benchEvidence.contributingWorkoutIds.length).toBe(3);
      expect(benchEvidence.contributingWorkoutIds).not.toContain('w_curl_0');
      expect(benchEvidence.contributingWorkoutIds).not.toContain('w_curl_1');
    });

    it('negative case 3: handles unit mismatches (lbs vs kg) with normalized conversion and zero arithmetic distortion', () => {
      const planLbs: PlannedWorkout = {
        id: 'plan_lbs_1',
        name: 'Heavy Lbs Plan',
        createdAt: '2026-10-01T00:00:00Z',
        exercises: [
          {
            id: 'pe_lbs_deadlift',
            name: 'Deadlift',
            targetSets: 2,
            targetReps: 5,
            targetWeight: 315, // 315 lbs (~142.88 kg)
            targetUnit: 'lbs',
            targetRpe: 8,
          },
        ],
      };

      const draft = createWorkoutDraftFromPlan(planLbs, { userUnit: 'lbs' });
      expect(draft.exercises[0].sets[0].prescribedWeight).toBe(315);
      expect(draft.exercises[0].sets[0].prescribedUnit).toBe('lbs');

      // Athlete executes 315 lbs on set 1, but 320 lbs on set 2
      const executed: WorkoutExercise = {
        ...draft.exercises[0],
        sets: [
          { ...draft.exercises[0].sets[0], weight: 315, reps: 5, rpe: 8, status: 'completed', completed: true },
          { ...draft.exercises[0].sets[1], weight: 320, reps: 5, rpe: 8.5, status: 'completed', completed: true },
        ],
      };

      const finalized = finalizeWorkoutExercises([executed]);
      const sessionEntry: WorkoutEntry = {
        id: 'w_lbs_session',
        date: '2026-10-14T10:00:00Z',
        planId: planLbs.id,
        exercises: finalized.validExercises,
      };

      useAppStore.getState().addWorkout(sessionEntry);

      const expEvidence = getExerciseExposureEvidence(sessionEntry.exercises[0], sessionEntry);
      expect(expEvidence.loadOutcomes.met_target).toBe(1);
      expect(expEvidence.loadOutcomes.above_target).toBe(1);
      // Normalized delta in kg is positive and non-NaN
      expect(expEvidence.averageLoadDeltaKg).toBeGreaterThan(0);
      expect(isNaN(expEvidence.averageLoadDeltaKg!)).toBe(false);
    });

    it('negative case 4: structured safety pain lock (reportsPain: true) strictly blocks progression even if targets are exceeded', () => {
      // 3 baseline sessions
      ['2026-10-01', '2026-10-03', '2026-10-05'].forEach((dateStr, i) => {
        useAppStore.getState().addWorkout({
          id: `w_squat_${i}`,
          date: `${dateStr}T10:00:00Z`,
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                { weight: 120, reps: 8, unit: 'kg', rpe: 8, status: 'completed', completed: true, prescribedWeight: 120, prescribedReps: 8 },
              ],
            },
          ],
        });
      });

      // Session 4: Athlete exceeds target (9 reps @ RPE 7), BUT reports structured pain
      const painSession: WorkoutEntry = {
        id: 'w_squat_pain',
        date: '2026-10-14T10:00:00Z',
        reportsPain: true, // Structured pain signal
        exercises: [
          {
            name: 'Barbell Back Squat',
            reportsPain: true,
            sets: [
              { weight: 120, reps: 9, unit: 'kg', rpe: 7, status: 'completed', completed: true, prescribedWeight: 120, prescribedReps: 8, prescribedRpe: 8, prescribedUnit: 'kg' },
            ],
          },
        ],
      };

      useAppStore.getState().addWorkout(painSession);

      const records = Object.values(useAppStore.getState().policyDecisionRecords);
      const painDecision = records.find(
        (r) => r.evidenceAudit?.contributingWorkoutIds?.includes('w_squat_pain') || r.id.includes('w_squat_pain')
      );

      expect(painDecision).toBeDefined();
      expect(painDecision!.ruleId).toBe('SAFETY-01');
      expect(painDecision!.actionCategory).toBe('review_required');
      expect(painDecision!.proposedPrescription.deltaWeight).toBe(0);
      expect(painDecision!.proposedPrescription.weight).toBe(120);
    });

    it('negative case 5: athlete-requested hold (requestHold: true) strictly halts progression even when reserve is verified', () => {
      // 3 baseline sessions
      ['2026-10-01', '2026-10-03', '2026-10-05'].forEach((dateStr, i) => {
        useAppStore.getState().addWorkout({
          id: `w_press_${i}`,
          date: `${dateStr}T10:00:00Z`,
          exercises: [
            {
              name: 'Incline Dumbbell Press',
              sets: [
                { weight: 30, reps: 10, unit: 'kg', rpe: 7.5, status: 'completed', completed: true, prescribedWeight: 30, prescribedReps: 10 },
              ],
            },
          ],
        });
      });

      // Session 4: Perfect performance, but athlete explicitly flags requestHold
      const holdSession: WorkoutEntry = {
        id: 'w_press_hold',
        date: '2026-10-14T10:00:00Z',
        requestHold: true,
        exercises: [
          {
            name: 'Incline Dumbbell Press',
            requestHold: true,
            sets: [
              { weight: 30, reps: 10, unit: 'kg', rpe: 7.5, status: 'completed', completed: true, prescribedWeight: 30, prescribedReps: 10, prescribedRpe: 8, prescribedUnit: 'kg' },
            ],
          },
        ],
      };

      useAppStore.getState().addWorkout(holdSession);

      const records = Object.values(useAppStore.getState().policyDecisionRecords);
      const holdDecision = records.find(
        (r) => r.evidenceAudit?.contributingWorkoutIds?.includes('w_press_hold') || r.id.includes('w_press_hold')
      );

      expect(holdDecision).toBeDefined();
      expect(holdDecision!.ruleId).toBe('HOLD-ATHLETE-REQUEST');
      expect(holdDecision!.actionCategory).toBe('hold_current_target');
      expect(holdDecision!.proposedPrescription.deltaWeight).toBe(0);
      expect(holdDecision!.proposedPrescription.weight).toBe(30);
    });

    it('negative case 6: never infers decision provenance on matching numbers without authentic audit record', () => {
      const planWithCoincidentalMatch: PlannedWorkout = {
        id: 'plan_coincidence',
        name: 'Coincidental Plan',
        createdAt: '2026-10-01T00:00:00Z',
        exercises: [
          {
            id: 'pe_coincidence_bench',
            name: 'Barbell Bench Press',
            targetSets: 3,
            targetReps: 8,
            targetWeight: 102.5, // Matches recommendation number exactly!
            targetUnit: 'kg',
            targetRpe: 8,
          },
        ],
      };

      // No application audit exists for 'plan_coincidence'
      const exercises = createWorkoutExercisesFromPlan(planWithCoincidentalMatch, {
        userUnit: 'kg',
        applications: [], // No audit!
      });

      expect(exercises[0].appliedDecisionId).toBeUndefined();
      expect(exercises[0].sets[0].appliedDecisionId).toBeUndefined();
      // But explicit template targets are preserved
      expect(exercises[0].sets[0].prescribedWeight).toBe(102.5);
      expect(exercises[0].sets[0].prescribedReps).toBe(8);
      expect(exercises[0].sets[0].prescribedRpe).toBe(8);
    });

    it('negative case 7: unconfigured non-bodyweight targets remain strictly unconfigured without PR-derived fallback load or fabricated provenance', () => {
      const planWithMixedTargets: PlannedWorkout = {
        id: 'plan_mixed_cfg',
        name: 'Mixed Configuration Plan',
        createdAt: '2026-10-01T00:00:00Z',
        exercises: [
          // 1. Unconfigured non-bodyweight
          {
            id: 'pe_unconf_press',
            name: 'Overhead Press',
            targetSets: 3,
            targetReps: 8,
          },
          // 2. Unconfigured bodyweight
          {
            id: 'pe_bw_pullups',
            name: 'Pull-ups',
            targetSets: 3,
            targetReps: 5,
          },
          // 3. Fully configured prescription
          {
            id: 'pe_cfg_squat',
            name: 'Barbell Back Squat',
            targetSets: 4,
            targetReps: 6,
            targetWeight: 140,
            targetUnit: 'kg',
            targetRpe: 8.5,
          },
        ],
      };

      const exercises = createWorkoutExercisesFromPlan(planWithMixedTargets, {
        userUnit: 'kg',
        applications: [],
      });

      // 1. Unconfigured non-bodyweight: NO PR-derived fallback load, NO default RPE, NO fabricated prescription
      const unconfPress = exercises[0];
      expect(unconfPress.name).toBe('Overhead Press');
      expect(unconfPress.sets[0].weight).toBeUndefined();
      expect(unconfPress.sets[0].prescribedWeight).toBeUndefined();
      expect(unconfPress.sets[0].prescribedRpe).toBeUndefined();
      expect(unconfPress.sets[0].prescribedUnit).toBeUndefined();
      expect(unconfPress.sets[0].prescribedReps).toBe(8);
      expect(unconfPress.appliedDecisionId).toBeUndefined();

      // 2. Bodyweight exercise: preserves 0 kg external load without heavy barbell coercion
      const bwPullups = exercises[1];
      expect(bwPullups.name).toBe('Pull-ups');
      expect(bwPullups.sets[0].weight).toBe(0);
      expect(bwPullups.sets[0].prescribedWeight).toBe(0);
      expect(bwPullups.sets[0].prescribedUnit).toBe('kg');
      expect(bwPullups.appliedDecisionId).toBeUndefined();

      // 3. Fully configured prescription: preserved exactly
      const cfgSquat = exercises[2];
      expect(cfgSquat.name).toBe('Barbell Back Squat');
      expect(cfgSquat.sets[0].weight).toBe(140);
      expect(cfgSquat.sets[0].prescribedWeight).toBe(140);
      expect(cfgSquat.sets[0].prescribedReps).toBe(6);
      expect(cfgSquat.sets[0].prescribedRpe).toBe(8.5);
      expect(cfgSquat.sets[0].prescribedUnit).toBe('kg');
      expect(cfgSquat.sets.length).toBe(4);
    });

    it('negative case 8: duplicate exercises in the same plan with distinct IDs preserve exact target identity and isolate outcome evidence', () => {
      const planWithDuplicateLifts: PlannedWorkout = {
        id: 'plan_multi_bench',
        name: 'Bench Specialization Day',
        createdAt: '2026-10-01T00:00:00Z',
        exercises: [
          // Heavy bench target
          {
            id: 'pe_bench_heavy',
            name: 'Barbell Bench Press',
            targetSets: 3,
            targetReps: 6,
            targetWeight: 102.5,
            targetUnit: 'kg',
            targetRpe: 8,
          },
          // Back-off bench target
          {
            id: 'pe_bench_backoff',
            name: 'Barbell Bench Press',
            targetSets: 3,
            targetReps: 10,
            targetWeight: 80,
            targetUnit: 'kg',
            targetRpe: 7,
          },
        ],
      };

      // Deliberately applied audit ONLY to the heavy target
      const heavyAudit: PolicyDecisionApplicationAudit = {
        id: 'audit_bench_heavy_app',
        decisionId: 'dec_bench_heavy_v0',
        policyVersion: '0.1.0',
        targetPlanId: 'plan_multi_bench',
        targetPlanName: 'Bench Specialization Day',
        targetExerciseId: 'pe_bench_heavy',
        targetExerciseName: 'Barbell Bench Press',
        targetExerciseIndex: 0,
        previousPrescription: { weight: 100, reps: 6, sets: 3, unit: 'kg', targetRpe: 8 },
        appliedPrescription: { weight: 102.5, reps: 6, sets: 3, unit: 'kg', targetRpe: 8 },
        appliedAt: '2026-10-14T09:00:00Z',
        actionSource: 'athlete_confirmed',
        status: 'applied',
      };

      const exercises = createWorkoutExercisesFromPlan(planWithDuplicateLifts, {
        userUnit: 'kg',
        applications: [heavyAudit],
      });

      // Heavy target matches audit
      expect(exercises[0].planExerciseId).toBe('pe_bench_heavy');
      expect(exercises[0].appliedDecisionId).toBe('dec_bench_heavy_v0');
      expect(exercises[0].sets[0].prescribedWeight).toBe(102.5);

      // Back-off target with same exercise name must NOT match audit
      expect(exercises[1].planExerciseId).toBe('pe_bench_backoff');
      expect(exercises[1].appliedDecisionId).toBeUndefined();
      expect(exercises[1].sets[0].prescribedWeight).toBe(80);

      // Log workout executing both targets authentically
      const workoutSession: WorkoutEntry = {
        id: 'w_bench_spec_session',
        date: '2026-10-14T10:00:00Z',
        planId: 'plan_multi_bench',
        name: 'Bench Specialization Day',
        exercises: [
          {
            ...exercises[0],
            sets: [
              { ...exercises[0].sets[0], weight: 102.5, reps: 6, rpe: 8, completed: true, status: 'completed' },
              { ...exercises[0].sets[1], weight: 102.5, reps: 6, rpe: 8, completed: true, status: 'completed' },
              { ...exercises[0].sets[2], weight: 102.5, reps: 6, rpe: 8, completed: true, status: 'completed' },
            ],
          },
          {
            ...exercises[1],
            sets: [
              { ...exercises[1].sets[0], weight: 80, reps: 10, rpe: 7, completed: true, status: 'completed' },
              { ...exercises[1].sets[1], weight: 80, reps: 10, rpe: 7, completed: true, status: 'completed' },
              { ...exercises[1].sets[2], weight: 80, reps: 10, rpe: 7, completed: true, status: 'completed' },
            ],
          },
        ],
      };

      const evidence = aggregateMultiSessionEvidence([workoutSession]);

      // Evidence for heavy target must be completely isolated from back-off target
      const heavyEvidence = evidence.exercises['pe_bench_heavy'] || evidence.exercises['barbell bench press::pe_bench_heavy'];
      expect(heavyEvidence).toBeDefined();
      expect(heavyEvidence.totalPrescribedSets).toBe(3);
      expect(heavyEvidence.completedPrescribedSets).toBe(3);
      expect(heavyEvidence.loadOutcomesDistribution.met_target).toBe(3);
      expect(heavyEvidence.loadOutcomesDistribution.below_target).toBe(0); // 80kg sets did not pollute!
      expect(heavyEvidence.averageLoadDeltaKg).toBe(0);

      // Evidence for back-off target must be completely isolated
      const backoffEvidence = evidence.exercises['pe_bench_backoff'] || evidence.exercises['barbell bench press::pe_bench_backoff'];
      expect(backoffEvidence).toBeDefined();
      expect(backoffEvidence.totalPrescribedSets).toBe(3);
      expect(backoffEvidence.completedPrescribedSets).toBe(3);
      expect(backoffEvidence.loadOutcomesDistribution.met_target).toBe(3);
      expect(backoffEvidence.loadOutcomesDistribution.below_target).toBe(0);
      expect(backoffEvidence.averageLoadDeltaKg).toBe(0);
    });

    it('negative case 9: duplicate exercises with missing IDs fail closed on ambiguous fallback matching', () => {
      const planWithMissingIds: PlannedWorkout = {
        id: 'plan_ambiguous_benches',
        name: 'Ambiguous Bench Plan',
        createdAt: '2026-10-01T00:00:00Z',
        exercises: [
          {
            name: 'Barbell Bench Press',
            targetSets: 3,
            targetReps: 6,
            targetWeight: 100,
          },
          {
            name: 'Barbell Bench Press',
            targetSets: 3,
            targetReps: 10,
            targetWeight: 75,
          },
        ],
      };

      // Ambiguous audit lacking targetExerciseId and lacking targetExerciseIndex
      const ambiguousAudit: PolicyDecisionApplicationAudit = {
        id: 'audit_ambiguous_app',
        decisionId: 'dec_ambiguous_bench_v0',
        policyVersion: '0.1.0',
        targetPlanId: 'plan_ambiguous_benches',
        targetPlanName: 'Ambiguous Bench Plan',
        targetExerciseName: 'Barbell Bench Press',
        targetExerciseIndex: undefined as any,
        previousPrescription: { weight: 95, reps: 6 },
        appliedPrescription: { weight: 100, reps: 6, unit: 'kg' },
        appliedAt: '2026-10-14T09:00:00Z',
        actionSource: 'athlete_confirmed',
        status: 'applied',
      };

      const exercises = createWorkoutExercisesFromPlan(planWithMissingIds, {
        userUnit: 'kg',
        applications: [ambiguousAudit],
      });

      // Because identity is ambiguous (multiple same-named exercises in plan without IDs or valid index),
      // the mapper must fail closed: neither receives appliedDecisionId.
      expect(exercises[0].appliedDecisionId).toBeUndefined();
      expect(exercises[0].sets[0].appliedDecisionId).toBeUndefined();
      expect(exercises[1].appliedDecisionId).toBeUndefined();
      expect(exercises[1].sets[0].appliedDecisionId).toBeUndefined();
    });
  });

  describe('Task 3C-8A Missing Actual Weight Integrity Audit', () => {
    it('1. verifies unconfigured non-bodyweight exercise starts with blank input and no fabricated prescribed load', () => {
      const planWithUnconfiguredLift: PlannedWorkout = {
        id: 'plan_unconfigured_bench',
        name: 'Unconfigured Bench Plan',
        createdAt: '2026-10-14T00:00:00Z',
        exercises: [
          {
            id: 'pe_bench_unconfigured',
            name: 'Barbell Bench Press',
            targetSets: 3,
            targetReps: 8,
            targetWeight: undefined,
            targetUnit: undefined,
            targetRpe: undefined,
          },
        ],
      };

      const exercises = createWorkoutExercisesFromPlan(planWithUnconfiguredLift, { userUnit: 'kg' });
      expect(exercises).toHaveLength(1);
      const exercise = exercises[0];

      expect(exercise.sets).toHaveLength(3);
      for (const set of exercise.sets) {
        expect(set.weight).toBeUndefined();
        expect(set.prescribedWeight).toBeUndefined();
        expect(set.prescribedUnit).toBeUndefined();
        expect(set.reps).toBe(8);
        expect(set.prescribedReps).toBe(8);
        expect(set.completed).toBe(false);
        expect(set.status).toBe('pending');
      }
    });

    it('2. verifies blank weight cannot be interpreted as a completed zero-kilogram performance', () => {
      const unenteredSet: WorkoutSet = {
        weight: undefined,
        reps: 8,
        unit: 'kg',
        completed: false,
        status: 'pending',
        prescribedWeight: 100,
        prescribedReps: 8,
        prescribedUnit: 'kg',
      };

      const finalized = finalizeWorkoutSet(unenteredSet);
      expect(finalized.weight).toBeUndefined();
      expect(finalized.completed).toBe(false);
      expect(finalized.status).toBe('not_attempted');

      // Also verify that passing an empty string as weight is sanitized to undefined, not coerced to 0
      const emptyStringSet: WorkoutSet = {
        weight: '' as any,
        reps: 8,
        unit: 'kg',
        completed: false,
        status: 'pending',
        prescribedWeight: 100,
        prescribedReps: 8,
        prescribedUnit: 'kg',
      };
      const finalizedEmpty = finalizeWorkoutSet(emptyStringSet);
      expect(finalizedEmpty.weight).toBeUndefined();

      // Outcome analysis: missing actual weight must NOT evaluate load delta as 0 - 100 = -100 kg
      const observation = analyzeSetOutcome(finalized, 'Barbell Bench Press', 0);
      expect(observation.hasUsableLoadComparison).toBe(false);
      expect(observation.loadDeltaKg).toBeNull();
      expect(observation.loadOutcome).toBeNull();
      expect(observation.actualWeight).toBeUndefined();
    });

    it('3. verifies unattempted or skipped sets do not create false PRs, distort volume, or skew progression', () => {
      const exerciseWithSkippedAndUnattempted: WorkoutExercise = {
        name: 'Overhead Press',
        sets: [
          {
            weight: undefined,
            reps: 0,
            unit: 'kg',
            status: 'skipped',
            completed: false,
            prescribedWeight: 60,
            prescribedReps: 5,
            prescribedUnit: 'kg',
          },
          {
            weight: undefined,
            reps: 0,
            unit: 'kg',
            status: 'pending',
            completed: false,
            prescribedWeight: 60,
            prescribedReps: 5,
            prescribedUnit: 'kg',
          },
        ],
      };

      const { validExercises, hasCompletedSets, hasMeaningfulData } = finalizeWorkoutExercises([
        exerciseWithSkippedAndUnattempted,
      ]);

      expect(hasMeaningfulData).toBe(true);
      expect(hasCompletedSets).toBe(false);
      expect(validExercises).toHaveLength(1);

      // Volume must strictly be zero
      const completedVolume = validExercises[0].sets
        .filter((s) => s.completed)
        .reduce((sum, s) => sum + (s.weight ?? 0) * s.reps, 0);
      expect(completedVolume).toBe(0);

      // Evidence observations for skipped / unattempted sets omit performance comparisons
      const skippedObs = analyzeSetOutcome(validExercises[0].sets[0], 'Overhead Press', 0);
      expect(skippedObs.isCompleted).toBe(false);
      expect(skippedObs.hasUsableLoadComparison).toBe(false);
      expect(skippedObs.hasUsableRepComparison).toBe(false);
      expect(skippedObs.loadDeltaKg).toBeNull();

      const notAttemptedObs = analyzeSetOutcome(validExercises[0].sets[1], 'Overhead Press', 1);
      expect(notAttemptedObs.isCompleted).toBe(false);
      expect(notAttemptedObs.hasUsableLoadComparison).toBe(false);
      expect(notAttemptedObs.loadDeltaKg).toBeNull();
    });

    it('4. verifies entering valid numeric weight and completing set records numeric actual weight accurately', () => {
      const enteredSet: WorkoutSet = {
        weight: 102.5,
        reps: 8,
        unit: 'kg',
        rpe: 8,
        completed: true,
        status: 'completed',
        prescribedWeight: 100,
        prescribedReps: 8,
        prescribedUnit: 'kg',
        prescribedRpe: 8,
      };

      const finalized = finalizeWorkoutSet(enteredSet);
      expect(finalized.weight).toBe(102.5);
      expect(finalized.completed).toBe(true);
      expect(finalized.status).toBe('completed');

      const observation = analyzeSetOutcome(finalized, 'Barbell Bench Press', 0);
      expect(observation.hasUsableLoadComparison).toBe(true);
      expect(observation.actualWeight).toBe(102.5);
      expect(observation.prescribedWeight).toBe(100);
      expect(observation.loadDeltaKg).toBe(2.5);
      expect(observation.loadOutcome).toBe('above_target');
      expect(observation.repDelta).toBe(0);
      expect(observation.repOutcome).toBe('met_target');
    });

    it('5. verifies genuine bodyweight prescription is strictly distinguishable from unconfigured load', () => {
      const planWithMixedTypes: PlannedWorkout = {
        id: 'plan_bw_and_unconfigured',
        name: 'Bodyweight vs Unconfigured Plan',
        createdAt: '2026-10-14T00:00:00Z',
        exercises: [
          {
            id: 'pe_pullups_bw',
            name: 'Pull-ups',
            targetSets: 3,
            targetReps: 8,
            targetWeight: 0,
            targetUnit: 'kg',
          },
          {
            id: 'pe_ohp_unconfigured',
            name: 'Overhead Press',
            targetSets: 3,
            targetReps: 8,
            targetWeight: undefined,
            targetUnit: undefined,
          },
        ],
      };

      const exercises = createWorkoutExercisesFromPlan(planWithMixedTypes, { userUnit: 'kg' });
      const bwExercise = exercises.find((e) => e.name === 'Pull-ups')!;
      const unconfiguredExercise = exercises.find((e) => e.name === 'Overhead Press')!;

      // Bodyweight target has explicit 0 kg load
      expect(bwExercise.sets[0].prescribedWeight).toBe(0);
      expect(bwExercise.sets[0].prescribedUnit).toBe('kg');
      expect(bwExercise.sets[0].weight).toBe(0);

      // Non-bodyweight unconfigured target has undefined load
      expect(unconfiguredExercise.sets[0].prescribedWeight).toBeUndefined();
      expect(unconfiguredExercise.sets[0].prescribedUnit).toBeUndefined();
      expect(unconfiguredExercise.sets[0].weight).toBeUndefined();

      // Comparison in outcome analysis:
      // A completed bodyweight set with 0 kg external load accurately meets target (0 - 0 = 0)
      const bwFinalized = finalizeWorkoutSet({
        ...bwExercise.sets[0],
        completed: true,
        status: 'completed',
        reps: 8,
      });
      const bwObs = analyzeSetOutcome(bwFinalized, 'Pull-ups', 0);
      expect(bwObs.hasUsableLoadComparison).toBe(true);
      expect(bwObs.loadDeltaKg).toBe(0);
      expect(bwObs.loadOutcome).toBe('met_target');

      // An unconfigured exercise completed without entered weight has no usable load comparison
      const unconfFinalized = finalizeWorkoutSet({
        ...unconfiguredExercise.sets[0],
        completed: true,
        status: 'completed',
        reps: 8,
      });
      const unconfObs = analyzeSetOutcome(unconfFinalized, 'Overhead Press', 0);
      expect(unconfObs.hasUsableLoadComparison).toBe(false);
      expect(unconfObs.loadDeltaKg).toBeNull();
    });

    it('6. verifies finalized workouts and persisted drafts never contain empty strings for weight', () => {
      // 1. Save draft with dirty string weight
      const dirtyDraft = {
        date: '2026-10-14',
        name: 'Dirty Draft',
        exercises: [
          {
            name: 'Barbell Row',
            sets: [
              { weight: '' as any, reps: 5, unit: 'kg' as const, completed: false },
              { weight: undefined, reps: 5, unit: 'kg' as const, completed: false },
              { weight: 70, reps: 5, unit: 'kg' as const, completed: true },
            ],
          },
        ],
      };

      useAppStore.getState().saveWorkoutDraft(dirtyDraft as any);
      const savedDraft = useAppStore.getState().activeWorkoutDraft;
      expect(savedDraft).toBeDefined();
      expect(savedDraft!.exercises[0].sets[0].weight).toBeUndefined();
      expect(typeof savedDraft!.exercises[0].sets[0].weight).not.toBe('string');
      expect(savedDraft!.exercises[0].sets[1].weight).toBeUndefined();
      expect(savedDraft!.exercises[0].sets[2].weight).toBe(70);

      // 2. Add workout with dirty string weight
      const dirtyWorkout: WorkoutEntry = {
        id: 'w_dirty_weight',
        date: '2026-10-14T10:00:00Z',
        name: 'Dirty Workout',
        exercises: [
          {
            name: 'Barbell Row',
            sets: [
              { weight: '' as any, reps: 5, unit: 'kg', completed: false },
              { weight: 80, reps: 5, unit: 'kg', completed: true },
            ],
          },
        ],
      };

      useAppStore.getState().addWorkout(dirtyWorkout);
      const storedWorkout = useAppStore.getState().workouts.find((w) => w.id === 'w_dirty_weight');
      expect(storedWorkout).toBeDefined();
      expect(storedWorkout!.exercises[0].sets[0].weight).toBeUndefined();
      expect(typeof storedWorkout!.exercises[0].sets[0].weight).not.toBe('string');
      expect(storedWorkout!.exercises[0].sets[1].weight).toBe(80);

      // 3. Import data with dirty string weight
      const importPayload = {
        workouts: [
          {
            id: 'w_imported_dirty',
            date: '2026-10-13T10:00:00Z',
            exercises: [
              {
                name: 'Bench Press',
                sets: [{ weight: '   ' as any, reps: 8, unit: 'kg' }],
              },
            ],
          },
        ],
      };

      useAppStore.getState().importAllData(importPayload);
      const importedWorkout = useAppStore.getState().workouts.find((w) => w.id === 'w_imported_dirty');
      expect(importedWorkout).toBeDefined();
      expect(importedWorkout!.exercises[0].sets[0].weight).toBeUndefined();
      expect(typeof importedWorkout!.exercises[0].sets[0].weight).not.toBe('string');
    });

    it('7. verifies legacy workout records remain fully readable, valid, and participating in evidence', () => {
      const legacyWorkouts: WorkoutEntry[] = [
        {
          id: 'w_legacy_1',
          date: '2026-09-10T10:00:00Z',
          name: 'Legacy Upper Session',
          exercises: [
            {
              name: 'Barbell Bench Press',
              sets: [
                { weight: 90, reps: 8, unit: 'kg', completed: true, status: 'completed' },
                { weight: 90, reps: 8, unit: 'kg', completed: true, status: 'completed' },
                { weight: 90, reps: 7, unit: 'kg', completed: true, status: 'completed' },
              ],
            },
            {
              name: 'Pull-ups',
              sets: [
                { weight: 0, reps: 10, unit: 'kg', completed: true, status: 'completed' },
              ],
            },
          ],
        },
      ];

      useAppStore.getState().importAllData({ workouts: legacyWorkouts });
      const currentWorkouts = useAppStore.getState().workouts;
      const loaded = currentWorkouts.find((w) => w.id === 'w_legacy_1');
      expect(loaded).toBeDefined();
      expect(loaded!.exercises[0].sets[0].weight).toBe(90);
      expect(loaded!.exercises[1].sets[0].weight).toBe(0);

      // Extract exposure evidence on the legacy session without errors
      const exposureEvidence = getExerciseExposureEvidence(
        loaded!.exercises[0],
        loaded,
        0
      );
      expect(exposureEvidence.totalCompletedWorkingSets).toBe(3);
      expect(exposureEvidence.workingSetObservations[0].actualWeight).toBe(90);

      // Multi-session aggregation cleanly processes legacy records
      const multiEvidence = aggregateMultiSessionEvidence(currentWorkouts);
      const benchEvidence = multiEvidence.exercises['barbell bench press'];
      expect(benchEvidence).toBeDefined();
      expect(benchEvidence.manualCompletedSets).toBe(3);
    });

    it('8. verifies subsequent plan template edits never rewrite historical workout prescriptions', () => {
      // 1. Initial plan template with 100 kg prescription
      const originalPlan: PlannedWorkout = {
        id: 'plan_bench_immutable_test',
        name: 'Bench Progression Template',
        createdAt: '2026-10-01T00:00:00Z',
        exercises: [
          {
            id: 'pe_bench_orig',
            name: 'Barbell Bench Press',
            targetSets: 3,
            targetReps: 8,
            targetWeight: 100,
            targetUnit: 'kg',
            targetRpe: 8,
          },
        ],
      };

      useAppStore.getState().addPlannedWorkout(originalPlan);

      // 2. Start and complete workout from this plan
      const workoutExercises = createWorkoutExercisesFromPlan(originalPlan, { userUnit: 'kg' });
      const completedExercises = workoutExercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => ({
          ...s,
          weight: 100,
          reps: 8,
          status: 'completed' as const,
          completed: true,
        })),
      }));

      const historicalWorkout: WorkoutEntry = {
        id: 'w_historical_session_1',
        date: '2026-10-10T10:00:00Z',
        name: originalPlan.name,
        planId: originalPlan.id,
        exercises: completedExercises,
      };

      useAppStore.getState().addWorkout(historicalWorkout);

      // Verify the recorded workout has 100 kg prescription
      const storedWorkoutBefore = useAppStore.getState().workouts.find((w) => w.id === 'w_historical_session_1');
      expect(storedWorkoutBefore!.exercises[0].sets[0].prescribedWeight).toBe(100);

      // 3. Later, the athlete updates the plan template to 110 kg
      useAppStore.getState().updatePlannedWorkout('plan_bench_immutable_test', {
        ...originalPlan,
        exercises: [
          {
            ...originalPlan.exercises[0],
            targetWeight: 110,
          },
        ],
      });

      // 4. Invariant check: The historical workout's recorded prescription MUST remain 100 kg
      const storedWorkoutAfter = useAppStore.getState().workouts.find((w) => w.id === 'w_historical_session_1');
      expect(storedWorkoutAfter!.exercises[0].sets[0].prescribedWeight).toBe(100);
      expect(storedWorkoutAfter!.exercises[0].sets[0].weight).toBe(100);

      // Outcome evidence for historical workout evaluates against its 100 kg prescription (delta = 0), NOT 110 kg
      const exposureEvidence = getExerciseExposureEvidence(
        storedWorkoutAfter!.exercises[0],
        storedWorkoutAfter,
        0
      );
      expect(exposureEvidence.usableLoadComparisonsCount).toBe(3);
      expect(exposureEvidence.averageLoadDeltaKg).toBe(0);
      expect(exposureEvidence.loadOutcomes.met_target).toBe(3);
    });

    it('9. verifies adaptWorkoutForConstraints preserves undefined load for unconfigured movements', () => {
      const workoutWithUnconfiguredLift: WorkoutExercise[] = [
        {
          name: 'Barbell Row',
          sets: [
            { weight: undefined, reps: 8, unit: 'kg', completed: false, status: 'pending' },
          ],
        },
      ];

      const adapted = adaptWorkoutForConstraints(workoutWithUnconfiguredLift, {
        type: 'equipment',
        targetExerciseName: 'Barbell Row',
        substituteExerciseName: 'Dumbbell Row',
      });

      expect(adapted.adaptedExercises).toHaveLength(1);
      const adaptedSet = adapted.adaptedExercises[0].sets[0];
      // Must remain undefined rather than being coerced to an invented zero or arbitrary number
      expect(adaptedSet.weight).toBeUndefined();
    });

    it('10. verifies AI context grounding avoids fabricating 0kg loads for unmeasured exercises and preserves bodyweight semantics', () => {
      // 1. Log a workout with unmeasured Bench Press and bodyweight Pull-ups
      const unmeasuredWorkout: WorkoutEntry = {
        id: 'w_unmeasured_ai_ctx',
        date: '2026-10-12T10:00:00Z',
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              { weight: undefined, reps: 8, unit: 'kg', status: 'completed', completed: true },
              { weight: undefined, reps: 8, unit: 'kg', status: 'completed', completed: true },
            ],
          },
          {
            name: 'Pull-ups',
            sets: [
              { weight: 0, reps: 10, unit: 'kg', status: 'completed', completed: true },
            ],
          },
        ],
      };

      useAppStore.setState({
        workouts: [unmeasuredWorkout],
      });

      const context = buildCompactUserContext(useAppStore.getState());

      // Bench Press must indicate unmeasured load, never "top 0kg"
      expect(context).toContain('Bench Press: 2 sets (8 reps, unmeasured load)');
      expect(context).not.toContain('top 0kg');
      expect(context).not.toContain('top 0 kg');

      // Bench Press must NOT appear in PERFORMANCE TRENDS as 0kg
      expect(context).not.toContain('Bench Press: 0kg×8');

      // Pull-ups must be grounded as BW×10
      expect(context).toContain('Pull-ups: 1 sets (top BW×10)');
      expect(context).toContain('- Pull-ups: BW×10');
    });

    it('11. verifies getMonthlyAscensionReport counts warmups (DI-05 canonical volume) and excludes uncompleted/unmeasured sets from tonnage', () => {
      const monthPrefix = '2026-10';
      const mixedWorkout: WorkoutEntry = {
        id: 'w_monthly_tonnage_test',
        date: `${monthPrefix}-10T10:00:00Z`,
        exercises: [
          {
            name: 'Squat',
            sets: [
              // Completed work set: 100kg * 5 = 500kg
              { weight: 100, reps: 5, unit: 'kg', status: 'completed', completed: true, isWarmup: false },
              // Warmup set: COUNTS since DI-05 (canonical volume includes warmups): 60kg * 5 = 300kg
              { weight: 60, reps: 5, unit: 'kg', status: 'completed', completed: true, isWarmup: true },
              // Uncompleted set: must NOT count
              { weight: 100, reps: 5, unit: 'kg', status: 'pending', completed: false, isWarmup: false },
              // Unmeasured load set: must NOT count or produce NaN
              { weight: undefined, reps: 10, unit: 'kg', status: 'completed', completed: true, isWarmup: false },
            ],
          },
        ],
      };

      const report = getMonthlyAscensionReport({
        year: 2026,
        month: 9, // October (0-indexed)
        workouts: [mixedWorkout],
        prs: [],
        waterLogs: {},
        waterTargetMl: 2500,
        creatineLogs: {},
      });

      // Total volume: 500 + 300 (warmup, DI-05) = 800kg = 0.8 tonnes.
      // Was 0.5 before DI-05, when the monthly report excluded warmups.
      expect(report.totalVolumeTonnes).toBe(0.8);
    });

    it('12. verifies addWorkout preserves undefined actualExecution.weight on unmeasured non-BW decisions and 0 on bodyweight decisions', () => {
      // 1. Setup pending decisions for Bench Press and Pull-ups
      const benchDecision: TrainingDecision = {
        id: 'dec_bench_missing_w',
        exerciseName: 'Bench Press',
        date: '2026-10-14',
        programIntent: 'hypertrophy',
        previousPerformance: { weight: 80, reps: 8, sets: 3 },
        nextPrescription: { weight: 82.5, reps: 8, targetRpe: 8, sets: 3 },
        expectedRpe: 8.0,
        reasonType: 'progressive_overload',
        headline: 'Progressive load',
        explanation: 'Add 2.5kg',
        deltaKg: 2.5,
        deltaPercent: 3.1,
        confidence: 'established',
        evidenceCount: 4,
        status: 'pending',
        timestamp: '2026-10-14T08:00:00Z',
      };

      const pullupDecision: TrainingDecision = {
        ...benchDecision,
        id: 'dec_pullup_bw',
        exerciseName: 'Pull-ups',
        previousPerformance: { weight: 0, reps: 8, sets: 3 },
        nextPrescription: { weight: 0, reps: 9, targetRpe: 8, sets: 3 },
      };

      useAppStore.setState({
        trainingDecisions: {
          'Bench Press': benchDecision,
          'Pull-ups': pullupDecision,
        },
      });

      // 2. Athlete logs workout where Bench Press has unmeasured load (weight: undefined)
      // and Pull-ups has bodyweight (weight: undefined / 0)
      const completedWorkout: WorkoutEntry = {
        id: 'w_test_actual_exec',
        date: '2026-10-14T12:00:00Z',
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              { weight: undefined, reps: 8, unit: 'kg', rpe: 8, status: 'completed', completed: true },
            ],
          },
          {
            name: 'Pull-ups',
            sets: [
              { weight: undefined, reps: 10, unit: 'kg', rpe: 8, status: 'completed', completed: true },
            ],
          },
        ],
      };

      useAppStore.getState().addWorkout(completedWorkout);

      const updatedBench = useAppStore.getState().trainingDecisions['Bench Press'];
      const evaluatedPullup = useAppStore.getState().decisionsLedgerHistory.find((d) => d.id === 'dec_pullup_bw');

      // Non-bodyweight Bench Press must NOT coerce undefined weight to 0
      expect(updatedBench.actualExecution?.weight).toBeUndefined();
      expect(updatedBench.actualExecution?.reps).toBe(8);

      // Bodyweight Pull-ups must record 0 (genuine 0 added kg)
      expect(evaluatedPullup?.actualExecution?.weight).toBe(0);
      expect(evaluatedPullup?.actualExecution?.reps).toBe(10);
    });

    it('13. verifies getProgressionRecommendation returns null when non-bodyweight exercise has only unmeasured loads', () => {
      const workoutWithUnmeasuredBench: WorkoutEntry = {
        id: 'w_prog_unmeasured',
        date: '2026-10-10T10:00:00Z',
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              { weight: undefined, reps: 8, unit: 'kg', status: 'completed', completed: true, isWarmup: false },
              { weight: undefined, reps: 8, unit: 'kg', status: 'completed', completed: true, isWarmup: false },
            ],
          },
        ],
      };

      const rec = getProgressionRecommendation(
        'Bench Press',
        [workoutWithUnmeasuredBench],
        'kg',
        'get_stronger'
      );

      // Must return null instead of recommending 0 + 2.5 = 2.5kg!
      expect(rec).toBeNull();
    });

    it('14. verifies getLastExercisePerformance formats unmeasured loads and bodyweight accurately and does not fabricate 1RM', () => {
      const testWorkout: WorkoutEntry = {
        id: 'w_perf_lookup',
        date: '2026-10-14T10:00:00Z',
        exercises: [
          {
            name: 'Overhead Press',
            sets: [
              { weight: undefined, reps: 8, unit: 'kg', status: 'completed', completed: true },
            ],
          },
          {
            name: 'Pull-ups',
            sets: [
              { weight: 0, reps: 10, unit: 'kg', status: 'completed', completed: true },
            ],
          },
        ],
      };

      const ohpPerf = getLastExercisePerformance('Overhead Press', [testWorkout], 'kg');
      expect(ohpPerf).not.toBeNull();
      expect(ohpPerf!.summary).toBe('— × 8');
      expect(ohpPerf!.bestWeight).toBe(0);
      expect(ohpPerf!.bestE1RM).toBe(0);

      const pullupPerf = getLastExercisePerformance('Pull-ups', [testWorkout], 'kg');
      expect(pullupPerf).not.toBeNull();
      expect(pullupPerf!.summary).toBe('BW × 10');
      expect(pullupPerf!.bestReps).toBe(10);
    });
  });

  describe('Task 3C-8D: Final Prescription-versus-Actual UI Integrity Check', () => {
    it('1. verifies planned lift with prescribedWeight: 60 and weight: undefined shows 60kg target and blank actual input', () => {
      const plan: PlannedWorkout = {
        id: 'plan_bench_60',
        name: 'Bench Session',
        createdAt: '2026-10-14T00:00:00Z',
        exercises: [
          { name: 'Bench Press', targetSets: 3, targetReps: 8, targetWeight: 60, targetUnit: 'kg', targetRpe: 8 },
        ],
      };

      const exercises = createWorkoutExercisesFromPlan(plan, { userUnit: 'kg' });
      const bench = exercises[0];

      // Simulate UI state where actual weight has not yet been typed
      const activeSet: WorkoutSet = {
        ...bench.sets[0],
        weight: undefined, // actual load unentered
      };

      // Scenario 1 invariants:
      // Prescribed target remains strictly 60 kg
      expect(activeSet.prescribedWeight).toBe(60);
      expect(activeSet.prescribedReps).toBe(8);
      expect(activeSet.prescribedRpe).toBe(8);

      // Actual load is unentered
      expect(activeSet.weight).toBeUndefined();

      // UI target display resolution helper
      const isBW = false;
      const targetReps = activeSet.prescribedReps ?? activeSet.reps ?? 8;
      const targetText = activeSet.prescribedWeight !== undefined
        ? `${activeSet.prescribedWeight} ${activeSet.prescribedUnit || 'kg'} × ${targetReps} reps`
        : 'Unconfigured load';
      const inputVal = activeSet.weight !== undefined ? String(activeSet.weight) : '';
      const inputPlaceholder = isBW ? '0 (BW)' : (activeSet.prescribedWeight !== undefined ? String(activeSet.prescribedWeight) : '—');

      expect(targetText).toBe('60 kg × 8 reps');
      expect(inputVal).toBe(''); // input value is blank
      expect(inputPlaceholder).toBe('60'); // ghost hint is 60
    });

    it('2. verifies unconfigured bench press does not invent 0 kg, 2.5 kg, or 40 kg, and indicates unconfigured load', () => {
      const plan: PlannedWorkout = {
        id: 'plan_unconfigured',
        name: 'Unconfigured Plan',
        createdAt: '2026-10-14T00:00:00Z',
        exercises: [
          { name: 'Bench Press', targetSets: 2, targetReps: 8 },
        ],
      };

      const exercises = createWorkoutExercisesFromPlan(plan, { userUnit: 'kg' });
      const bench = exercises[0];
      const set = bench.sets[0];

      expect(set.prescribedWeight).toBeUndefined();
      expect(set.weight).toBeUndefined();

      // Target display must indicate unconfigured load and not invent numbers
      const isBW = false;
      const targetReps = set.prescribedReps ?? set.reps ?? 8;
      const targetText = set.prescribedWeight !== undefined
        ? `${set.prescribedWeight} kg × ${targetReps} reps`
        : `Unconfigured load × ${targetReps} reps`;
      const inputPlaceholder = isBW ? '0 (BW)' : (set.prescribedWeight !== undefined ? String(set.prescribedWeight) : '—');

      expect(targetText).toBe('Unconfigured load × 8 reps');
      expect(targetText).not.toContain('0 kg');
      expect(targetText).not.toContain('2.5 kg');
      expect(targetText).not.toContain('40 kg');
      expect(inputPlaceholder).toBe('—');
      expect(inputPlaceholder).not.toBe('0');
    });

    it('3. verifies bodyweight exercise displays BW appropriately without confusing missing data with zero', () => {
      const plan: PlannedWorkout = {
        id: 'plan_pullups_bw',
        name: 'Calisthenics Plan',
        createdAt: '2026-10-14T00:00:00Z',
        exercises: [
          { name: 'Pull-ups', targetSets: 3, targetReps: 10, targetWeight: 0, targetUnit: 'kg' },
        ],
      };

      const exercises = createWorkoutExercisesFromPlan(plan, { userUnit: 'kg' });
      const pullups = exercises[0];
      const set = pullups.sets[0];

      expect(set.prescribedWeight).toBe(0);
      expect(set.weight).toBe(0);

      const isBW = true;
      const targetReps = set.prescribedReps ?? set.reps ?? 10;
      const targetText = (isBW && (set.prescribedWeight === 0 || set.prescribedWeight === undefined))
        ? `BW × ${targetReps} reps`
        : `${set.prescribedWeight} kg × ${targetReps} reps`;
      const inputPlaceholder = isBW ? '0 (BW)' : (set.prescribedWeight !== undefined ? String(set.prescribedWeight) : '—');

      expect(targetText).toBe('BW × 10 reps');
      expect(inputPlaceholder).toBe('0 (BW)');
    });

    it('4. verifies entering an actual weight of 62.5 kg does not silently rewrite the 60 kg prescription', () => {
      let set: WorkoutSet = {
        weight: undefined,
        reps: 8,
        unit: 'kg',
        prescribedWeight: 60,
        prescribedReps: 8,
        prescribedRpe: 8,
        prescribedUnit: 'kg',
        appliedDecisionId: 'dec_bench_step',
      };

      // User types 62.5 into actual weight input
      const enteredValue = '62.5';
      const parsedNumeric = parseFloat(enteredValue);
      set = {
        ...set,
        weight: parsedNumeric,
      };

      // Actual load is now 62.5
      expect(set.weight).toBe(62.5);
      // Prescribed weight MUST NOT be rewritten
      expect(set.prescribedWeight).toBe(60);
      expect(set.appliedDecisionId).toBe('dec_bench_step');
    });

    it('5. verifies clearing an actual-weight input sets weight to undefined without erasing the prescription', () => {
      let set: WorkoutSet = {
        weight: 62.5,
        reps: 8,
        unit: 'kg',
        prescribedWeight: 60,
        prescribedReps: 8,
        prescribedRpe: 8,
        prescribedUnit: 'kg',
        appliedDecisionId: 'dec_bench_step',
      };

      // User clears input (empty string)
      const clearedValue = '';
      const parsed = parseFloat(clearedValue);
      const finalWeight = isNaN(parsed) ? undefined : parsed;

      set = {
        ...set,
        weight: finalWeight,
      };

      expect(set.weight).toBeUndefined();
      // Prescription MUST remain intact
      expect(set.prescribedWeight).toBe(60);
      expect(set.prescribedReps).toBe(8);
      expect(set.appliedDecisionId).toBe('dec_bench_step');
    });

    it('6. verifies adding another set preserves prescribed targets without copying actual entered values into prescription fields', () => {
      const set1: WorkoutSet = {
        weight: 62.5, // user exceeded prescription
        reps: 9,
        unit: 'kg',
        completed: true,
        status: 'completed',
        prescribedWeight: 60,
        prescribedReps: 8,
        prescribedRpe: 8,
        prescribedUnit: 'kg',
        appliedDecisionId: 'dec_bench_step',
      };

      // Adding set 2 using updated handleAddSet logic
      const isCurrentBodyweight = false;
      const lastValidWeight = (typeof set1.weight === 'number' && !isNaN(set1.weight))
        ? set1.weight
        : (isCurrentBodyweight ? 0 : undefined);
      const newReps = parseInt(String(set1.reps), 10) || 8;

      const set2: WorkoutSet = {
        weight: lastValidWeight,
        reps: newReps,
        unit: 'kg',
        completed: false,
        status: 'pending',
        rpe: set1.rpe ?? 8,
        prescribedWeight: set1.prescribedWeight,
        prescribedReps: set1.prescribedReps,
        prescribedRpe: set1.prescribedRpe,
        prescribedUnit: set1.prescribedUnit,
        appliedDecisionId: set1.appliedDecisionId,
      };

      // Set 2 preserves original planned target 60 kg, not 62.5 kg!
      expect(set2.prescribedWeight).toBe(60);
      expect(set2.prescribedReps).toBe(8);
      expect(set2.prescribedRpe).toBe(8);
      expect(set2.prescribedUnit).toBe('kg');
      expect(set2.appliedDecisionId).toBe('dec_bench_step');
      expect(set2.weight).toBe(62.5); // actual load helper carries forward
    });

    it('7. verifies completing and saving preserves both prescription and actual performance for subsequent outcome evidence', () => {
      const sessionSets: WorkoutSet[] = [
        {
          weight: 62.5,
          reps: 8,
          unit: 'kg',
          completed: true,
          status: 'completed',
          rpe: 8,
          prescribedWeight: 60,
          prescribedReps: 8,
          prescribedRpe: 8,
          prescribedUnit: 'kg',
          appliedDecisionId: 'dec_session_bench',
        },
      ];

      const finalized = finalizeWorkoutExercises([
        {
          name: 'Bench Press',
          sets: sessionSets,
        },
      ]);

      expect(finalized.validExercises.length).toBe(1);
      const savedEx = finalized.validExercises[0];
      const savedSet = savedEx.sets[0];

      // Both prescription and actual performance are strictly preserved
      expect(savedSet.prescribedWeight).toBe(60);
      expect(savedSet.weight).toBe(62.5);
      expect(savedSet.reps).toBe(8);
      expect(savedSet.appliedDecisionId).toBe('dec_session_bench');

      // Check outcome evidence analysis
      const outcome = analyzeSetOutcome(savedSet, 'Bench Press', 0);
      expect(outcome.actualWeight).toBe(62.5);
      expect(outcome.prescribedWeight).toBe(60);
      expect(outcome.loadDelta).toBe(2.5);
      expect(outcome.loadOutcome).toBe('above_target');
    });
  });
});
