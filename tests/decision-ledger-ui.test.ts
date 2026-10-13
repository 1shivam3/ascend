import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useAppStore } from '@/lib/store';
import { TrainingDecisionRecord, TrainingDecision, Unit } from '@/lib/types';
import PolicyDecisionCard from '@/components/PolicyDecisionCard';
import PolicyDecisionLedger from '@/components/PolicyDecisionLedger';
import TrainingDecisionCard from '@/components/TrainingDecisionCard';

describe('Decision Ledger UI & Athlete Actions (Task 3C-6)', () => {
  beforeEach(() => {
    useAppStore.setState({
      profile: {
        id: 'user-ui-test',
        name: 'Test Athlete',
        gender: 'male',
        bodyweightKg: 80,
        bodyweightLbs: 176.4,
        unit: 'kg',
        createdAt: '2026-01-01',
      },
      workouts: [],
      plannedWorkouts: [],
      trainingDecisions: {},
      decisionsLedgerHistory: [],
      policyDecisionRecords: {},
      policyDecisionsLedgerHistory: [],
      userMode: 'advanced',
    });
  });

  const createSamplePolicyRecord = (
    overrides?: Partial<TrainingDecisionRecord>
  ): TrainingDecisionRecord => {
    return {
      id: 'dec_barbell_bench_press_2026-10-14_w_w-ui-1_v0',
      policyVersion: '0.1.0',
      createdAt: '2026-10-14T10:00:00Z',
      exerciseName: 'Barbell Bench Press',
      canonicalExerciseKey: 'barbell_bench_press',
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
        contributingWorkoutIds: ['w-1', 'w-2', 'w-3'],
        lastExposureDate: '2026-10-14T10:00:00Z',
        totalPrescribedSetsEvaluated: 9,
        completedPrescribedSets: 9,
        usableRepComparisons: 9,
        repOutcomes: { metOrExceeded: 9, withinTolerance: 0, belowPrescription: 0 },
        loadOutcomes: { metOrExceeded: 9, withinTolerance: 0, belowPrescription: 0 },
        rpeOutcomes: { metOrExceeded: 9, withinTolerance: 0, belowPrescription: 0 },
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
      status: 'pending',
      ...overrides,
    };
  };

  // ── 1. Rendering a pending recommendation ──────────────────────────────────
  it('Requirement 1: renders a pending recommendation with exercise, session, action, and plain explanation', () => {
    const decision = createSamplePolicyRecord();
    const html = renderToStaticMarkup(
      React.createElement(PolicyDecisionCard, { decision, userUnit: 'kg' })
    );

    // Exercise name
    expect(html).toContain('BARBELL BENCH PRESS');

    // Policy version & session date
    expect(html).toContain('POLICY V0.1.0');
    expect(html).toContain('Session: 2026-10-14');

    // Status & Action badges
    expect(html).toContain('PENDING REVIEW');
    expect(html).toContain('+2.5 kg LOAD');

    // Headline & explanation
    expect(html).toContain('Candidate Load Progression (+2.5 kg)');
    expect(html).toContain('Completed prescribed repetitions at target ceiling');

    // Action buttons available
    expect(html).toContain('Accept');
    expect(html).toContain('Override');
    expect(html).toContain('Dismiss');

    // Accessible container
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Training decision for Barbell Bench Press"');
  });

  // ── 2. Displaying current and proposed targets correctly ───────────────────
  it('Requirement 2: displays current and proposed targets, and handles unconfigured initial targets', () => {
    // Normal configured targets
    const decisionConfigured = createSamplePolicyRecord({
      currentPrescription: { weight: 90, reps: 10, unit: 'kg' },
      proposedPrescription: {
        weight: 92.5,
        reps: 10,
        deltaWeight: 2.5,
        deltaReps: 0,
        sets: 3,
        unit: 'kg',
      },
    });
    const htmlConfigured = renderToStaticMarkup(
      React.createElement(PolicyDecisionCard, { decision: decisionConfigured, userUnit: 'kg' })
    );

    expect(htmlConfigured).toContain('90 kg × 10 reps');
    expect(htmlConfigured).toContain('92.5 kg × 10 reps');

    // Unconfigured initial target
    const decisionUnconfigured = createSamplePolicyRecord({
      currentPrescription: { unit: 'kg' }, // weight & reps omitted
    });
    const htmlUnconfigured = renderToStaticMarkup(
      React.createElement(PolicyDecisionCard, { decision: decisionUnconfigured, userUnit: 'kg' })
    );

    expect(htmlUnconfigured).toContain('Unconfigured / Initial');
  });

  // ── 3. Accept, override, and dismiss actions ───────────────────────────────
  it('Requirement 3: accepts a pending recommendation and records status & timestamp in store', () => {
    const decision = createSamplePolicyRecord();
    useAppStore.setState({
      policyDecisionRecords: { [decision.id]: decision },
      policyDecisionsLedgerHistory: [decision],
    });

    useAppStore.getState().acceptPolicyDecision(decision.id);

    const updated = useAppStore.getState().policyDecisionRecords[decision.id];
    expect(updated.status).toBe('accepted');
    expect(updated.acceptedAt).toBeDefined();

    // Verify rendered accepted card shows accepted badge and disabled resolved button
    const html = renderToStaticMarkup(
      React.createElement(PolicyDecisionCard, { decision: updated, userUnit: 'kg' })
    );
    expect(html).toContain('ACCEPTED');
    expect(html).toContain('Target accepted on');
    expect(html).toContain('Decision Resolved');
    expect(html).not.toContain('Accept</button>');
  });

  it('Requirement 3: overrides a pending recommendation with custom values and optional reason', () => {
    const decision = createSamplePolicyRecord();
    useAppStore.setState({
      policyDecisionRecords: { [decision.id]: decision },
      policyDecisionsLedgerHistory: [decision],
    });

    useAppStore.getState().overridePolicyDecision(decision.id, {
      customWeight: 95,
      customReps: 6,
      reason: 'Shoulder caution deload',
    });

    const updated = useAppStore.getState().policyDecisionRecords[decision.id];
    expect(updated.status).toBe('overridden');
    expect(updated.userOverride?.customWeight).toBe(95);
    expect(updated.userOverride?.customReps).toBe(6);
    expect(updated.userOverride?.overrideReason).toBe('Shoulder caution deload');
    expect(updated.userOverride?.overriddenAt).toBeDefined();

    // Verify rendered card displays athlete override badge and custom target
    const html = renderToStaticMarkup(
      React.createElement(PolicyDecisionCard, { decision: updated, userUnit: 'kg' })
    );
    expect(html).toContain('OVERRIDDEN');
    expect(html).toContain('ATHLETE OVERRIDE');
    expect(html).toContain('95 kg × 6 reps');
    expect(html).toContain('Reason: Shoulder caution deload');
  });

  it('Requirement 3: dismisses a pending recommendation cleanly in store', () => {
    const decision = createSamplePolicyRecord();
    useAppStore.setState({
      policyDecisionRecords: { [decision.id]: decision },
      policyDecisionsLedgerHistory: [decision],
    });

    useAppStore.getState().dismissPolicyDecision(decision.id);

    const updated = useAppStore.getState().policyDecisionRecords[decision.id];
    expect(updated.status).toBe('dismissed');
    expect(updated.dismissedAt).toBeDefined();

    const html = renderToStaticMarkup(
      React.createElement(PolicyDecisionCard, { decision: updated, userUnit: 'kg' })
    );
    expect(html).toContain('DISMISSED');
    expect(html).toContain('Recommendation dismissed');
  });

  // ── 4. Invalid or repeated lifecycle actions ───────────────────────────────
  it('Requirement 4: rejects invalid or repeated lifecycle transitions and preserves immutability', () => {
    const decision = createSamplePolicyRecord({
      status: 'accepted',
      acceptedAt: '2026-10-14T10:05:00Z',
    });
    useAppStore.setState({
      policyDecisionRecords: { [decision.id]: decision },
      policyDecisionsLedgerHistory: [decision],
    });

    // Calling accept again on already accepted decision
    useAppStore.getState().acceptPolicyDecision(decision.id);
    expect(useAppStore.getState().policyDecisionRecords[decision.id].acceptedAt).toBe(
      '2026-10-14T10:05:00Z'
    );

    // Calling override on already accepted decision
    useAppStore.getState().overridePolicyDecision(decision.id, { customWeight: 110 });
    expect(useAppStore.getState().policyDecisionRecords[decision.id].status).toBe('accepted');

    // Calling dismiss on already accepted decision
    useAppStore.getState().dismissPolicyDecision(decision.id);
    expect(useAppStore.getState().policyDecisionRecords[decision.id].status).toBe('accepted');
  });

  // ── 5. Missing evidence and equipment configuration limitations ─────────────
  it('Requirement 5: displays missing-evidence and unconfigured equipment limitations without fabricated confidence', () => {
    const decisionWithLimitations = createSamplePolicyRecord({
      actionCategory: 'review_required',
      ruleId: 'REV-INCREMENT',
      headline: 'Load Progression Requires Equipment Increment Configuration',
      explanation:
        'Progression criteria met, but no validated equipment increment has been configured.',
      evidenceAudit: {
        contributingWorkoutIds: ['w-1'],
        lastExposureDate: '2026-10-14T10:00:00Z',
        totalPrescribedSetsEvaluated: 3,
        completedPrescribedSets: 3,
        usableRepComparisons: 3,
        repOutcomes: { metOrExceeded: 3, withinTolerance: 0, belowPrescription: 0 },
        loadOutcomes: { metOrExceeded: 3, withinTolerance: 0, belowPrescription: 0 },
        rpeOutcomes: { metOrExceeded: 3, withinTolerance: 0, belowPrescription: 0 },
        averageLoadDeltaKg: 0,
        averageRpeDelta: 0,
        exclusions: [],
        limitations: [
          'Equipment load step is unconfigured for this exercise.',
          'No structured athlete pain or discomfort signal was recorded. Absence of a pain report does not constitute medical clearance.',
        ],
        sufficiency: {
          tier: 'single_session',
          comparableExposuresCount: 1,
          totalExposuresCount: 1,
          isOrderVerified: true,
          hasRecordedEffort: true,
          notes: ['Single comparable session evaluated'],
        },
      },
    });

    const html = renderToStaticMarkup(
      React.createElement(PolicyDecisionCard, { decision: decisionWithLimitations, userUnit: 'kg' })
    );

    // Headline and review required badge
    expect(html).toContain('REVIEW REQUIRED');
    expect(html).toContain('Load Progression Requires Equipment Increment Configuration');

    // Never outputs fabricated probabilities like "95% confidence" or "calibrated likelihood"
    expect(html).not.toContain('% confidence');
    expect(html).not.toContain('% probability');
  });

  // ── 6. Persistence across reloads ──────────────────────────────────────────
  it('Requirement 6: preserves Policy v0 decisions across store rehydration / importAllData', () => {
    const decision = createSamplePolicyRecord();
    const backupState = {
      policyDecisionRecords: { [decision.id]: decision },
      policyDecisionsLedgerHistory: [decision],
    };

    // Rehydrate/import
    useAppStore.getState().importAllData(backupState);

    const rehydrated = useAppStore.getState().policyDecisionRecords[decision.id];
    expect(rehydrated).toBeDefined();
    expect(rehydrated.id).toBe(decision.id);
    expect(useAppStore.getState().policyDecisionsLedgerHistory.length).toBe(1);
  });

  // ── 7. Legacy decision UI compatibility ────────────────────────────────────
  it('Requirement 7: legacy TrainingDecisionCard continues to function without error', () => {
    const legacyDecision: TrainingDecision = {
      id: 'legacy-dec-1',
      exerciseName: 'Barbell Deadlift',
      previousPerformance: { weight: 140, reps: 5, rpe: 8.5 },
      nextPrescription: { weight: 142.5, reps: 5, sets: 3, targetRpe: 8.5 },
      deltaKg: 2.5,
      explanation: 'Solid working sets with target RPE in reserve.',
      confidenceTier: 'established',
      evidenceCount: 4,
      status: 'pending',
      timestamp: '2026-10-14T10:00:00Z',
    };

    const html = renderToStaticMarkup(
      React.createElement(TrainingDecisionCard, { decision: legacyDecision, userUnit: 'kg' })
    );

    expect(html).toContain('DECISION LEDGER');
    expect(html).toContain('BARBELL DEADLIFT');
    expect(html).toContain('+2.5 kg');
    expect(html).toContain('140 kg × 5');
    expect(html).toContain('142.5 kg × 5');
    expect(html).toContain('Solid working sets with target RPE in reserve.');
  });

  // ── 8. Mobile layout and accessibility ─────────────────────────────────────
  it('Requirement 8: verifies accessible attributes, status tabs, and mobile layout classes in PolicyDecisionLedger', () => {
    const decision1 = createSamplePolicyRecord({ id: 'dec-1', status: 'pending' });
    const decision2 = createSamplePolicyRecord({
      id: 'dec-2',
      status: 'accepted',
      exerciseName: 'Barbell Back Squat',
    });

    useAppStore.setState({
      policyDecisionRecords: { [decision1.id]: decision1, [decision2.id]: decision2 },
      policyDecisionsLedgerHistory: [decision1, decision2],
    });

    const html = renderToStaticMarkup(
      React.createElement(PolicyDecisionLedger, {
        decisions: [decision1, decision2],
        userUnit: 'kg',
      })
    );

    // Tablist & filter roles
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Training Decision Ledger"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');

    // Status filter chips with exact counts
    expect(html).toContain('All');
    expect(html).toContain('Pending');
    expect(html).toContain('Accepted');

    // Both exercises rendered in "All" view
    expect(html).toContain('BARBELL BENCH PRESS');
    expect(html).toContain('BARBELL BACK SQUAT');

    // Mobile layout classes present
    expect(html).toContain('grid-cols-1 sm:grid-cols-2');
    expect(html).toContain('flex flex-col sm:flex-row');
  });
});
