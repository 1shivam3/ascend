import { describe, it, expect } from 'vitest';
import {
  evaluateTrainingDecisionPolicyV0,
  resolveLoadIncrement,
  isSmallLoadIsolation,
  canPersistDecisionToLedger,
  TrainingDecisionRecord,
} from '@/lib/training-decision-policy';
import { aggregateMultiSessionEvidence } from '@/lib/workout-outcome-evidence';
import { WorkoutEntry } from '@/lib/types';

describe('Training Decision Policy v0 Engine (training-decision-policy.ts)', () => {
  // ─── STEP 1 & BASELINE TESTS (TC-01 to TC-13) ─────────────────────────────

  describe('TC-01: Empty workout history', () => {
    it('returns insufficient_evidence with zero deltas when no workouts exist', () => {
      const decision = evaluateTrainingDecisionPolicyV0('Barbell Back Squat', {
        targetWeight: 100,
        targetReps: 8,
        targetSets: 3,
        targetUnit: 'kg',
      }, null);

      expect(decision.actionCategory).toBe('insufficient_evidence');
      expect(decision.ruleId).toBe('IE-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.deltaReps).toBe(0);
      expect(decision.proposedPrescription.weight).toBe(100);
      expect(decision.proposedPrescription.reps).toBe(8);
      expect(decision.confidenceTier).toBe('insufficient');
      expect(decision.status).toBe('pending');
      expect(decision.policyVersion).toBe('0.1.0');
    });
  });

  describe('TC-02: Wholly manual workout history', () => {
    it('returns insufficient_evidence when workouts have no prescribed targets', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-manual-1',
          date: '2026-10-01T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                { reps: 10, weight: 100, unit: 'kg', status: 'completed', completed: true },
              ],
            },
          ],
        },
        {
          id: 'w-manual-2',
          date: '2026-10-03T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                { reps: 10, weight: 100, unit: 'kg', status: 'completed', completed: true },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const evidence = summary.exercises['barbell back squat'];
      expect(evidence.manualExposures).toBe(2);
      expect(evidence.comparablePrescribedExposures).toBe(0);

      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 8, targetSets: 3, targetUnit: 'kg' },
        evidence
      );

      expect(decision.actionCategory).toBe('insufficient_evidence');
      expect(decision.ruleId).toBe('IE-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.deltaReps).toBe(0);
      expect(decision.confidenceTier).toBe('insufficient');
      expect(decision.explanation).toContain('Manual workout history');
    });
  });

  describe('TC-03: Rep target met with clean reserve (Double Progression Stage 1)', () => {
    it('recommends candidate_rep_progression (+1 rep) at current weight', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-rep-prog',
          date: '2026-10-05T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 8,
                  prescribedRpe: 8.0,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 8,
                  rpe: 7.5,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
                {
                  prescribedWeight: 100,
                  prescribedReps: 8,
                  prescribedRpe: 8.0,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 8,
                  rpe: 8.0,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 8, targetSets: 2, targetUnit: 'kg' },
        summary,
        { repRange: { min: 8, max: 12 } }
      );

      expect(decision.actionCategory).toBe('candidate_rep_progression');
      expect(decision.ruleId).toBe('REP-PROG-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.deltaReps).toBe(1);
      expect(decision.proposedPrescription.weight).toBe(100);
      expect(decision.proposedPrescription.reps).toBe(9);
      expect(decision.proposedPrescription.unit).toBe('kg');
    });
  });

  describe('TC-04: Rep bracket ceiling achieved with reserve (Double Progression Stage 2)', () => {
    it('recommends candidate_load_progression (+2.5 kg) for barbell compound with verified RPE', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-load-prog',
          date: '2026-10-06T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 12,
                  prescribedRpe: 8.0,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 12,
                  rpe: 8.0,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
                {
                  prescribedWeight: 100,
                  prescribedReps: 12,
                  prescribedRpe: 8.0,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 12,
                  rpe: 7.5,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 12, targetSets: 2, targetUnit: 'kg' },
        summary,
        { repRange: { min: 8, max: 12 }, stepIncrement: 2.5, incrementApprovalSource: 'athlete_confirmed' }
      );

      expect(decision.actionCategory).toBe('candidate_load_progression');
      expect(decision.ruleId).toBe('LOAD-PROG-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(2.5);
      expect(decision.proposedPrescription.weight).toBe(102.5);
      expect(decision.proposedPrescription.reps).toBe(8);
      expect(decision.proposedPrescription.deltaReps).toBe(-4);
      expect(decision.headline).toContain('+2.5 kg');
    });

    it('returns review_required when barbell compound meets rep ceiling but increment is unconfigured', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-load-prog-unconf',
          date: '2026-10-06T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 12,
                  prescribedRpe: 8.0,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 12,
                  rpe: 8.0,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      // No stepIncrement configured: must not guess 2.5 kg!
      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 12, targetSets: 1, targetUnit: 'kg' },
        summary,
        { repRange: { min: 8, max: 12 } }
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('REV-INCREMENT');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.explanation).toContain('Equipment load increment is unconfigured');
    });
  });

  describe('TC-05: Load progression with lbs units', () => {
    it('applies standard +5 lbs increment for barbell compound when athlete uses lbs', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-lbs-prog',
          date: '2026-10-06T10:00:00Z',
          exercises: [
            {
              name: 'Bench Press',
              sets: [
                {
                  prescribedWeight: 225,
                  prescribedReps: 12,
                  prescribedRpe: 8.0,
                  prescribedUnit: 'lbs',
                  weight: 225,
                  reps: 12,
                  rpe: 8.0,
                  unit: 'lbs',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Bench Press',
        { targetWeight: 225, targetReps: 12, targetSets: 1, targetUnit: 'lbs' },
        summary,
        { repRange: { min: 8, max: 12 }, userUnit: 'lbs', stepIncrement: 5, incrementApprovalSource: 'trusted_equipment_profile' }
      );

      expect(decision.actionCategory).toBe('candidate_load_progression');
      expect(decision.ruleId).toBe('LOAD-PROG-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(5);
      expect(decision.proposedPrescription.weight).toBe(230);
      expect(decision.proposedPrescription.unit).toBe('lbs');
      expect(decision.headline).toContain('+5 lbs');
    });
  });

  describe('TC-06: Target reps met, but effort exceeded target', () => {
    it('recommends hold_current_target to consolidate load when RPE exceeds target', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-rpe-high',
          date: '2026-10-07T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 10,
                  prescribedRpe: 8.0,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 10,
                  rpe: 9.5,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 10, targetSets: 1, targetUnit: 'kg' },
        summary,
        { repRange: { min: 8, max: 12 } }
      );

      expect(decision.actionCategory).toBe('hold_current_target');
      expect(decision.ruleId).toBe('HOLD-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.deltaReps).toBe(0);
      expect(decision.proposedPrescription.weight).toBe(100);
      expect(decision.proposedPrescription.reps).toBe(10);
      expect(decision.explanation).toContain('effort felt heavier than planned');
    });
  });

  describe('TC-07: Target reps missed on last set (single anomalous session)', () => {
    it('recommends hold_current_target without knee-jerk deload', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-single-miss',
          date: '2026-10-08T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 10,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 10,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
                {
                  prescribedWeight: 100,
                  prescribedReps: 10,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 8, // missed 2 reps
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 10, targetSets: 2, targetUnit: 'kg' },
        summary,
        { repRange: { min: 8, max: 12 } }
      );

      expect(decision.actionCategory).toBe('hold_current_target');
      expect(decision.ruleId).toBe('HOLD-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.deltaReps).toBe(0);
      expect(decision.proposedPrescription.weight).toBe(100);
      expect(decision.explanation).toContain('Target reps not fully achieved');
    });
  });

  describe('TC-08: Interrupted session with 0 completed sets', () => {
    it('recommends review_required when session was interrupted with 0 completed sets', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-zero-completed',
          date: '2026-10-09T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 8,
                  prescribedUnit: 'kg',
                  weight: 0,
                  reps: 0,
                  unit: 'kg',
                  status: 'not_attempted',
                  completed: false,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 8, targetSets: 1, targetUnit: 'kg' },
        summary
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('REV-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.deltaReps).toBe(0);
      expect(decision.explanation).toContain('interrupted with zero completed sets');
    });
  });

  describe('TC-09: Skipped set in planned workout', () => {
    it('recommends review_required when planned sets were explicitly skipped', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-skipped-set',
          date: '2026-10-10T10:00:00Z',
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
                {
                  prescribedWeight: 100,
                  prescribedReps: 8,
                  prescribedUnit: 'kg',
                  weight: 0,
                  reps: 0,
                  unit: 'kg',
                  status: 'skipped',
                  completed: false,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 8, targetSets: 2, targetUnit: 'kg' },
        summary
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('REV-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.deltaReps).toBe(0);
      expect(decision.explanation).toContain('sets were skipped');
    });
  });

  describe('TC-10: Persistent under-target performance', () => {
    it('recommends review_required when reps missed across 2 consecutive sessions', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-miss-1',
          date: '2026-10-01T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 8,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 6,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
        {
          id: 'w-miss-2',
          date: '2026-10-04T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 8,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 7,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 8, targetSets: 1, targetUnit: 'kg' },
        summary
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('REV-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.deltaReps).toBe(0);
      expect(decision.explanation).toContain('last two consecutive exposures');
    });
  });

  describe('TC-11: Missing RPE logging with rep progression', () => {
    it('evaluates rep progression (+1 rep at same weight) cleanly when RPE is omitted', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-no-rpe',
          date: '2026-10-05T10:00:00Z',
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
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 8, targetSets: 1, targetUnit: 'kg' },
        summary,
        { repRange: { min: 8, max: 12 } }
      );

      expect(decision.actionCategory).toBe('candidate_rep_progression');
      expect(decision.ruleId).toBe('REP-PROG-01');
      expect(decision.proposedPrescription.reps).toBe(9);
      expect(decision.proposedPrescription.deltaReps).toBe(1);
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
    });
  });

  describe('TC-12: Athlete discomfort flag', () => {
    it('halts progression and issues non-diagnostic SAFETY-01 review_required when pain flagged', () => {
      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 8, targetSets: 3, targetUnit: 'kg' },
        null,
        {
          athleteFlags: { reportsPain: true },
        }
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('SAFETY-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.deltaReps).toBe(0);
      expect(decision.headline).toBe('Athlete Discomfort Reported — Progression Locked');
      expect(decision.explanation).toContain('Discomfort or pain was reported for this movement');
      expect(decision.explanation).not.toContain('substitute');
      expect(decision.explanation).not.toContain('injury');
    });
  });

  describe('TC-13: Non-causal phrasing assertion', () => {
    it('ensures explanations never assert unverified internal states', () => {
      const forbiddenTerms = ['fatigue', 'overtrained', 'cns'];

      const testScenarios: TrainingDecisionRecord[] = [
        evaluateTrainingDecisionPolicyV0('Squat', null, null),
        evaluateTrainingDecisionPolicyV0('Squat', null, null, { athleteFlags: { reportsPain: true } }),
        evaluateTrainingDecisionPolicyV0('Squat', null, null, { athleteFlags: { requestHold: true } }),
      ];

      for (const dec of testScenarios) {
        const fullText = `${dec.headline} ${dec.explanation}`.toLowerCase();
        for (const term of forbiddenTerms) {
          expect(fullText).not.toContain(term);
        }
      }
    });
  });

  // ─── STEP 2: LOAD-INCREMENT HANDLING TESTS ────────────────────────────────

  describe('Step 2: Exercise and Equipment-Specific Load Increment Handling', () => {
    it('identifies unconfigured load increment for Barbell Compound lifts without explicit step', () => {
      const res = resolveLoadIncrement('Bench Press', 100, 'kg');
      expect(res.status).toBe('unconfigured');
      expect(res.increment).toBeNull();
      expect(res.reason).toContain('Equipment load increment is unconfigured');
    });

    it('resolves explicit configured +2.5 kg for Barbell Compound lifts', () => {
      const res = resolveLoadIncrement('Bench Press', 100, 'kg', {
        stepIncrement: 2.5,
        incrementApprovalSource: 'trusted_equipment_profile',
      });
      expect(res.status).toBe('valid');
      expect(res.increment).toBe(2.5);
    });

    it('resolves explicit configured +5 lbs for Barbell Compound lifts in lbs', () => {
      const res = resolveLoadIncrement('Squat', 225, 'lbs', {
        stepIncrement: 5,
        incrementApprovalSource: 'trusted_equipment_profile',
      });
      expect(res.status).toBe('valid');
      expect(res.increment).toBe(5);
    });

    it('rejects uncalibrated machine exercises without explicit increment', () => {
      const res = resolveLoadIncrement('Leg Press', 200, 'kg');
      expect(res.status).toBe('unconfigured');
      expect(res.increment).toBeNull();
      expect(res.reason).toContain('Machine/cable stack increments vary');
    });

    it('accepts explicit validated increment for machine exercises', () => {
      const res = resolveLoadIncrement('Leg Press', 200, 'kg', {
        stepIncrement: 10,
        incrementApprovalSource: 'trusted_equipment_profile',
      });
      expect(res.status).toBe('valid');
      expect(res.increment).toBe(10);
    });

    it('rejects uncalibrated dumbbell exercises without explicit increment', () => {
      expect(isSmallLoadIsolation('Dumbbell Lateral Raise')).toBe(true);
      const res = resolveLoadIncrement('Dumbbell Lateral Raise', 6, 'kg');
      expect(res.status).toBe('unconfigured');
      expect(res.increment).toBeNull();
      expect(res.reason).toContain('Equipment load increment is unconfigured');
    });

    it('accepts explicit approved increment without an authoritative maximum rather than applying arbitrary percentage thresholds', () => {
      const res = resolveLoadIncrement('Dumbbell Lateral Raise', 6, 'kg', {
        stepIncrement: 3.0,
        incrementApprovalSource: 'coach_approved',
      });
      expect(res.status).toBe('valid');
      expect(res.increment).toBe(3.0);
    });

    it('flags explicit increment when it exceeds an authoritative configured maximum (e.g. facility micro-plate limit)', () => {
      const res = resolveLoadIncrement('Dumbbell Lateral Raise', 6, 'kg', {
        stepIncrement: 3.0,
        incrementApprovalSource: 'coach_approved',
        maxAllowableIncrement: 1.0,
      });
      expect(res.status).toBe('requires_review');
      expect(res.increment).toBeNull();
      expect(res.reason).toContain('exceeds maximum allowable equipment step');
    });

    it('accepts explicit micro-increment on small-load isolation exercises', () => {
      const res = resolveLoadIncrement('Dumbbell Lateral Raise', 6, 'kg', {
        stepIncrement: 1.0,
        incrementApprovalSource: 'athlete_confirmed',
      });
      expect(res.status).toBe('valid');
      expect(res.increment).toBe(1.0);
    });

    it('identifies unweighted bodyweight exercises as bodyweight_unweighted', () => {
      const res = resolveLoadIncrement('Pull-ups', 0, 'kg');
      expect(res.status).toBe('bodyweight_unweighted');
      expect(res.increment).toBeNull();
      expect(res.reason).toContain('Bodyweight exercise performed without added load');
    });

    it('resolves valid plate increment for weighted bodyweight exercises', () => {
      const res = resolveLoadIncrement('Pull-ups', 20, 'kg', {
        stepIncrement: 2.5,
        incrementApprovalSource: 'trusted_equipment_profile',
      });
      expect(res.status).toBe('valid');
      expect(res.increment).toBe(2.5);
    });

    it('identifies unconfigured status for weighted bodyweight without explicit step', () => {
      const res = resolveLoadIncrement('Pull-ups', 20, 'kg');
      expect(res.status).toBe('unconfigured');
      expect(res.increment).toBeNull();
      expect(res.reason).toContain('Explicit equipment load increment is unconfigured');
    });

    it('returns review_required when load progression is eligible but increment is unavailable', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-machine-1',
          date: '2026-10-06T10:00:00Z',
          exercises: [
            {
              name: 'Leg Press',
              sets: [
                {
                  prescribedWeight: 150,
                  prescribedReps: 12,
                  prescribedRpe: 8.0,
                  prescribedUnit: 'kg',
                  weight: 150,
                  reps: 12,
                  rpe: 8.0,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      // No stepIncrement supplied for machine exercise
      const decision = evaluateTrainingDecisionPolicyV0(
        'Leg Press',
        { targetWeight: 150, targetReps: 12, targetSets: 1, targetUnit: 'kg' },
        summary,
        { repRange: { min: 8, max: 12 } }
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('REV-INCREMENT');
      expect(decision.headline).toContain('Increment Calibration Needed');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
    });
  });

  // ─── STEP 3: OBSERVATION WINDOW & CHRONOLOGY TESTS ────────────────────────

  describe('Step 3: Evidence Observation Window & Chronology', () => {
    it('does not allow an old skipped session to block progression when latest session was clean', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-old-skipped',
          date: '2026-09-20T10:00:00Z',
          exercises: [
            {
              name: 'Bench Press',
              sets: [
                {
                  prescribedWeight: 80,
                  prescribedReps: 8,
                  prescribedUnit: 'kg',
                  weight: 0,
                  reps: 0,
                  unit: 'kg',
                  status: 'skipped',
                  completed: false,
                },
              ],
            },
          ],
        },
        {
          id: 'w-recent-clean',
          date: '2026-10-01T10:00:00Z',
          exercises: [
            {
              name: 'Bench Press',
              sets: [
                {
                  prescribedWeight: 80,
                  prescribedReps: 8,
                  prescribedRpe: 8.0,
                  prescribedUnit: 'kg',
                  weight: 80,
                  reps: 8,
                  rpe: 7.5,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Bench Press',
        { targetWeight: 80, targetReps: 8, targetSets: 1, targetUnit: 'kg' },
        summary,
        { repRange: { min: 8, max: 12 } }
      );

      // Latest session was clean! Old skipped session must NOT block progression
      expect(decision.actionCategory).toBe('candidate_rep_progression');
      expect(decision.ruleId).toBe('REP-PROG-01');
      expect(decision.proposedPrescription.reps).toBe(9);
    });

    it('clears persistent miss streak when a clean session is completed', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-miss-1',
          date: '2026-10-01T10:00:00Z',
          exercises: [
            {
              name: 'Squat',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 8,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 5,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
        {
          id: 'w-recovery-clean',
          date: '2026-10-05T10:00:00Z',
          exercises: [
            {
              name: 'Squat',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 8,
                  prescribedRpe: 8.0,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 8,
                  rpe: 8.0,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Squat',
        { targetWeight: 100, targetReps: 8, targetSets: 1, targetUnit: 'kg' },
        summary,
        { repRange: { min: 8, max: 12 } }
      );

      // Not persistent miss! Clean session cleared streak
      expect(decision.actionCategory).toBe('candidate_rep_progression');
    });

    it('never shares evidence between distinct exercise variations', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-incline',
          date: '2026-10-01T10:00:00Z',
          exercises: [
            {
              name: 'Incline Bench Press',
              sets: [
                {
                  prescribedWeight: 70,
                  prescribedReps: 8,
                  prescribedUnit: 'kg',
                  weight: 70,
                  reps: 8,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      // Evaluate flat "Bench Press" against history that only has "Incline Bench Press"
      const decision = evaluateTrainingDecisionPolicyV0(
        'Bench Press',
        { targetWeight: 100, targetReps: 8 },
        summary
      );

      expect(decision.canonicalExerciseKey).toBe('bench press');
      expect(decision.actionCategory).toBe('insufficient_evidence');
    });

    it('documents missing workout dates as an evidence limitation and adjusts confidence', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-no-date',
          date: '', // missing date
          exercises: [
            {
              name: 'Deadlift',
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
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Deadlift',
        { targetWeight: 140, targetReps: 5 },
        summary
      );

      expect(decision.evidenceAudit.limitations.some((l) => l.includes('missing workout dates'))).toBe(true);
      expect(decision.confidenceTier).toBe('early_signal');
      expect(decision.evidenceSufficiencyTier).toBe('single_session');
    });
  });

  // ─── STEP 4: FORMALIZED MISSING-RPE BEHAVIOR TESTS ────────────────────────

  describe('Step 4: Formalized Missing-RPE Behavior', () => {
    it('holds load at rep ceiling when RPE is unrecorded, requiring effort verification', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-ceiling-no-rpe',
          date: '2026-10-05T10:00:00Z',
          exercises: [
            {
              name: 'Bench Press',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 12,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 12,
                  // RPE omitted
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Bench Press',
        { targetWeight: 100, targetReps: 12, targetSets: 1, targetUnit: 'kg' },
        summary,
        { repRange: { min: 8, max: 12 } }
      );

      // Rep completion ALONE does NOT prove reserve!
      expect(decision.actionCategory).toBe('hold_current_target');
      expect(decision.ruleId).toBe('HOLD-RPE-UNRECORDED');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.headline).toContain('Log Effort (RPE) to Advance Load');
      expect(decision.explanation).toContain('Effort (RPE) was not recorded to verify reserve');
    });

    it('authorizes load progression at rep ceiling when explicit RPE override is confirmed by athlete', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-ceiling-no-rpe',
          date: '2026-10-05T10:00:00Z',
          exercises: [
            {
              name: 'Bench Press',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 12,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 12,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Bench Press',
        { targetWeight: 100, targetReps: 12, targetSets: 1, targetUnit: 'kg' },
        summary,
        {
          repRange: { min: 8, max: 12 },
          stepIncrement: 2.5,
          incrementApprovalSource: 'athlete_confirmed',
          rpeOverride: { targetExercise: 'Bench Press', athleteConfirmedReserve: true },
        }
      );

      expect(decision.actionCategory).toBe('candidate_load_progression');
      expect(decision.ruleId).toBe('LOAD-PROG-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(2.5);
    });
  });

  // ─── STEP 5: TIGHTENED SAFETY BEHAVIOR TESTS ──────────────────────────────

  describe('Step 5: Tightened Safety Behavior with Conflicting/Missing Inputs', () => {
    it('operates safely when currentPrescription is null and pain flag is set', () => {
      const decision = evaluateTrainingDecisionPolicyV0(
        'Squat',
        null,
        null,
        { athleteFlags: { reportsPain: true } }
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('SAFETY-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.deltaReps).toBe(0);
      expect(decision.explanation).toContain('Discomfort or pain was reported');
    });

    it('prioritizes safety unconditionally over any progression flags', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-perfect',
          date: '2026-10-05T10:00:00Z',
          exercises: [
            {
              name: 'Deadlift',
              sets: [
                {
                  prescribedWeight: 140,
                  prescribedReps: 12,
                  prescribedRpe: 8,
                  prescribedUnit: 'kg',
                  weight: 140,
                  reps: 12,
                  rpe: 6,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Deadlift',
        { targetWeight: 140, targetReps: 12, targetSets: 1, targetUnit: 'kg' },
        summary,
        {
          athleteFlags: { reportsPain: true },
          allowLoadProgressionWithoutRpe: true,
        }
      );

      // Pain flag MUST preempt progression
      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('SAFETY-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
    });
  });

  // ─── STEP 6: RELIABLE DECISION IDENTITY TESTS ─────────────────────────────

  describe('Step 6: Collision-Free, Idempotent Decision Identity', () => {
    it('generates distinct IDs for different workouts occurring on the same date', () => {
      const d1 = evaluateTrainingDecisionPolicyV0('Bench Press', { targetWeight: 100, targetReps: 8 }, null, {
        referenceDate: '2026-10-15T09:00:00Z',
        workoutId: 'w-morning',
      });

      const d2 = evaluateTrainingDecisionPolicyV0('Bench Press', { targetWeight: 100, targetReps: 8 }, null, {
        referenceDate: '2026-10-15T18:00:00Z',
        workoutId: 'w-evening',
      });

      expect(d1.id).toBe('dec_bench press_2026-10-15_w_w-morning_v0');
      expect(d2.id).toBe('dec_bench press_2026-10-15_w_w-evening_v0');
      expect(d1.id).not.toBe(d2.id);
    });

    it('is strictly idempotent: identical inputs produce identical decision IDs and records', () => {
      const opts = { referenceDate: '2026-10-15T12:00:00Z', workoutId: 'w-fixed-1' };
      const d1 = evaluateTrainingDecisionPolicyV0('Squat', { targetWeight: 120, targetReps: 5 }, null, opts);
      const d2 = evaluateTrainingDecisionPolicyV0('Squat', { targetWeight: 120, targetReps: 5 }, null, opts);

      expect(d1.id).toBe(d2.id);
      expect(d1.ruleId).toBe(d2.ruleId);
      expect(d1.actionCategory).toBe(d2.actionCategory);
    });

    it('flags isIdentityReliable as false when no stable workout or session identifier is available', () => {
      const decision = evaluateTrainingDecisionPolicyV0('Bench Press', { targetWeight: 100, targetReps: 8 }, null);
      expect(decision.isIdentityReliable).toBe(false);
      expect(decision.id).toContain('_unanchored');
      expect(decision.identityLimitation).toContain('Unanchored decision identity');
      expect(decision.evidenceAudit.limitations.some((l) => l.includes('Unanchored decision identity'))).toBe(true);
    });

    it('handles invalid reference dates safely without crashing and records calendar limitation', () => {
      const decision = evaluateTrainingDecisionPolicyV0(
        'Bench Press',
        { targetWeight: 100, targetReps: 8 },
        null,
        { referenceDate: 'invalid-date-format' }
      );
      expect(decision.id).toContain('undated');
      expect(decision.evidenceAudit.limitations.some((l) => l.includes('Invalid referenceDate'))).toBe(true);
    });
  });

  // ─── TASK 3C-4C: SCOPED RPE OVERRIDE & SAFETY BOUNDARIES ──────────────────

  describe('Task 3C-4C: Scoped RPE Override & Safety Boundaries', () => {
    it('accepts scoped RPE override with explicit athleteConfirmedReserve for target exercise', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-ceiling-no-rpe',
          date: '2026-10-05T10:00:00Z',
          exercises: [
            {
              name: 'Bench Press',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 12,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 12,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Bench Press',
        { targetWeight: 100, targetReps: 12, targetSets: 1, targetUnit: 'kg' },
        summary,
        {
          repRange: { min: 8, max: 12 },
          stepIncrement: 2.5,
          incrementApprovalSource: 'athlete_confirmed',
          rpeOverride: {
            targetExercise: 'Bench Press',
            athleteConfirmedReserve: true,
            reason: 'Clean fast reps with 2 RIR',
          },
        }
      );

      expect(decision.actionCategory).toBe('candidate_load_progression');
      expect(decision.ruleId).toBe('LOAD-PROG-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(2.5);
    });

    it('ignores scoped RPE override if targetExercise does not match evaluated exercise', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-ceiling-no-rpe',
          date: '2026-10-05T10:00:00Z',
          exercises: [
            {
              name: 'Bench Press',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 12,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 12,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Bench Press',
        { targetWeight: 100, targetReps: 12, targetSets: 1, targetUnit: 'kg' },
        summary,
        {
          repRange: { min: 8, max: 12 },
          rpeOverride: {
            targetExercise: 'Incline Dumbbell Press', // Mismatched!
            athleteConfirmedReserve: true,
          },
        }
      );

      // Mismatched exercise override is ignored! Holds load
      expect(decision.actionCategory).toBe('hold_current_target');
      expect(decision.ruleId).toBe('HOLD-RPE-UNRECORDED');
    });

    it('rejects legacy unscoped allowLoadProgressionWithoutRpe on main compound lifts for safety', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-compound-ceiling',
          date: '2026-10-05T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                {
                  prescribedWeight: 120,
                  prescribedReps: 12,
                  prescribedUnit: 'kg',
                  weight: 120,
                  reps: 12,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 120, targetReps: 12, targetSets: 1, targetUnit: 'kg' },
        summary,
        {
          repRange: { min: 8, max: 12 },
          allowLoadProgressionWithoutRpe: true, // Legacy flag on main compound!
        }
      );

      // Main compound lifts require explicit confirmation, not blind global flag
      expect(decision.actionCategory).toBe('hold_current_target');
      expect(decision.ruleId).toBe('HOLD-RPE-UNRECORDED');
      expect(decision.evidenceAudit.limitations.some((l) => l.includes('Unscoped RPE override ignored'))).toBe(true);
    });

    it('allows legacy allowLoadProgressionWithoutRpe on non-compound exercises', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-accessory-ceiling',
          date: '2026-10-05T10:00:00Z',
          exercises: [
            {
              name: 'Dumbbell Curl',
              sets: [
                {
                  prescribedWeight: 14,
                  prescribedReps: 12,
                  prescribedUnit: 'kg',
                  weight: 14,
                  reps: 12,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Dumbbell Curl',
        { targetWeight: 14, targetReps: 12, targetSets: 1, targetUnit: 'kg' },
        summary,
        {
          repRange: { min: 8, max: 12 },
          allowLoadProgressionWithoutRpe: true,
          stepIncrement: 2,
          incrementApprovalSource: 'athlete_confirmed',
        }
      );

      expect(decision.actionCategory).toBe('candidate_load_progression');
      expect(decision.ruleId).toBe('LOAD-PROG-01');
    });

    it('unconditionally enforces pain safety over any RPE override', () => {
      const decision = evaluateTrainingDecisionPolicyV0(
        'Bench Press',
        { targetWeight: 100, targetReps: 12 },
        null,
        {
          athleteFlags: { reportsPain: true },
          rpeOverride: { targetExercise: 'Bench Press', athleteConfirmedReserve: true },
          allowLoadProgressionWithoutRpe: true,
        }
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('SAFETY-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
    });
  });

  // ─── TASK 3C-4C: CHRONOLOGY & UNPROVEN ORDERING TESTS ──────────────────────

  describe('Task 3C-4C: Chronology & Unproven Consecutive Miss Handling', () => {
    it('defers persistent miss evaluation and holds load when dates cannot prove chronological order', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-missing-date-1',
          date: '', // missing date!
          exercises: [
            {
              name: 'Squat',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 8,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 6,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
        {
          id: 'w-valid-date-2',
          date: '2026-10-05T10:00:00Z',
          exercises: [
            {
              name: 'Squat',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 8,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 6,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Squat',
        { targetWeight: 100, targetReps: 8, targetSets: 1, targetUnit: 'kg' },
        summary
      );

      // Because order cannot be proven, the engine does NOT label them consecutive in time!
      // It falls back to holding load for single-session variance and notes the limitation.
      expect(decision.actionCategory).toBe('hold_current_target');
      expect(decision.ruleId).toBe('HOLD-01');
      expect(decision.evidenceAudit.sufficiency.isOrderVerified).toBe(false);
      expect(
        decision.evidenceAudit.limitations.some((l) =>
          l.includes('Consecutive under-target evaluation deferred')
        )
      ).toBe(true);
    });

    it('populates transparent evidence sufficiency audit metrics', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-single',
          date: '2026-10-01T10:00:00Z',
          exercises: [
            {
              name: 'Overhead Press',
              sets: [
                {
                  prescribedWeight: 50,
                  prescribedReps: 8,
                  prescribedRpe: 8,
                  prescribedUnit: 'kg',
                  weight: 50,
                  reps: 8,
                  rpe: 8,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Overhead Press',
        { targetWeight: 50, targetReps: 8 },
        summary
      );

      expect(decision.evidenceAudit.sufficiency).toBeDefined();
      expect(decision.evidenceAudit.sufficiency.tier).toBe('single_session');
      expect(decision.evidenceAudit.sufficiency.comparableExposuresCount).toBe(1);
      expect(decision.evidenceAudit.sufficiency.isOrderVerified).toBe(true);
      expect(decision.evidenceAudit.sufficiency.hasRecordedEffort).toBe(true);
      expect(decision.confidenceTier).toBe('early_signal');
      expect(decision.evidenceSufficiencyTier).toBe('single_session');
    });
  });

  // ─── TASK 3C-4D: EVIDENCE SUFFICIENCY & STAGE 2 PERSISTENCE CONTRACT ──────

  describe('Task 3C-4D: Evidence Sufficiency Classification & Stage 2 Persistence Contract', () => {
    it('assigns established tier and multi_session sufficiency without claiming high confidence', () => {
      // 5 clean exposures
      const workouts: WorkoutEntry[] = Array.from({ length: 5 }, (_, i) => ({
        id: `w-clean-${i + 1}`,
        date: `2026-10-0${i + 1}T10:00:00Z`,
        exercises: [
          {
            name: 'Bench Press',
            sets: [
              {
                prescribedWeight: 100,
                prescribedReps: 10,
                prescribedRpe: 8,
                prescribedUnit: 'kg',
                weight: 100,
                reps: 10,
                rpe: 8,
                unit: 'kg',
                status: 'completed',
                completed: true,
              },
            ],
          },
        ],
      }));

      const summary = aggregateMultiSessionEvidence(workouts);
      const decision = evaluateTrainingDecisionPolicyV0(
        'Bench Press',
        { targetWeight: 100, targetReps: 10 },
        summary
      );

      // Must be 'established' and 'multi_session', never 'high_confidence'
      expect(decision.confidenceTier).toBe('established');
      expect(decision.evidenceSufficiencyTier).toBe('multi_session');
      expect(decision.evidenceAudit.sufficiency.comparableExposuresCount).toBe(5);
      expect(decision.evidenceAudit.sufficiency.isOrderVerified).toBe(true);
      expect(decision.evidenceAudit.sufficiency.hasRecordedEffort).toBe(true);
    });

    it('rejects uncalibrated dumbbell exercises resulting in review_required rather than guessing', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-db-1',
          date: '2026-10-01T10:00:00Z',
          exercises: [
            {
              name: 'Incline Dumbbell Press',
              sets: [
                {
                  prescribedWeight: 30,
                  prescribedReps: 12,
                  prescribedRpe: 8,
                  prescribedUnit: 'kg',
                  weight: 30,
                  reps: 12,
                  rpe: 8,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];

      const summary = aggregateMultiSessionEvidence(workouts);
      // Calling without explicit stepIncrement must NOT guess dumbbell increment
      const decision = evaluateTrainingDecisionPolicyV0(
        'Incline Dumbbell Press',
        { targetWeight: 30, targetReps: 12 },
        summary,
        { repRange: { min: 8, max: 12 } }
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('REV-INCREMENT');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.explanation).toContain('Equipment load increment is unconfigured');
    });

    it('rejects non-finite, zero, or negative step increments', () => {
      const resZero = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: 0 });
      expect(resZero.status).toBe('invalid_input');
      expect(resZero.reason).toContain('positive, finite number');

      const resNegative = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: -2.5 });
      expect(resNegative.status).toBe('invalid_input');

      const resNaN = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: NaN });
      expect(resNaN.status).toBe('invalid_input');
    });

    it('enforces Stage 2 persistence contract: approves reliably anchored decisions', () => {
      const decision = evaluateTrainingDecisionPolicyV0(
        'Squat',
        { targetWeight: 140, targetReps: 5 },
        null,
        { workoutId: 'w-anchored-101', referenceDate: '2026-10-15T10:00:00Z' }
      );

      const check = canPersistDecisionToLedger(decision);
      expect(check.canPersist).toBe(true);
      expect(decision.isIdentityReliable).toBe(true);
      expect(decision.id).toContain('_w_w-anchored-101');
      expect(decision.id).not.toContain('_unanchored');
    });

    it('enforces Stage 2 persistence contract: blocks unanchored decisions from silent ledger persistence', () => {
      const decision = evaluateTrainingDecisionPolicyV0(
        'Squat',
        { targetWeight: 140, targetReps: 5 },
        null
        // No workoutId or sessionId provided!
      );

      const check = canPersistDecisionToLedger(decision);
      expect(check.canPersist).toBe(false);
      expect(decision.isIdentityReliable).toBe(false);
      expect(check.reason).toContain('Unanchored decision identity');
      expect(decision.id).toContain('_unanchored');
    });

    it('enforces Stage 2 persistence contract: distinct sessions on same date produce unique IDs that both qualify', () => {
      const d1 = evaluateTrainingDecisionPolicyV0('Deadlift', { targetWeight: 180, targetReps: 3 }, null, {
        workoutId: 'w-morning',
        referenceDate: '2026-10-15T08:00:00Z',
      });
      const d2 = evaluateTrainingDecisionPolicyV0('Deadlift', { targetWeight: 180, targetReps: 3 }, null, {
        workoutId: 'w-evening',
        referenceDate: '2026-10-15T18:00:00Z',
      });

      expect(d1.id).not.toBe(d2.id);
      expect(d1.id).toContain('_w_w-morning');
      expect(d2.id).toContain('_w_w-evening');
      expect(canPersistDecisionToLedger(d1).canPersist).toBe(true);
      expect(canPersistDecisionToLedger(d2).canPersist).toBe(true);
    });
  });

  // ─── TASK 3C-4E: STRICT EXPLICIT EQUIPMENT INCREMENT VERIFICATION ──────────────

  describe('Task 3C-4E: Strict Explicit Equipment Increment Verification', () => {
    const createCeilingWorkout = (exercise: string, weight: number, reps: number, unit: 'kg' | 'lbs' = 'kg'): WorkoutEntry[] => [
      {
        id: 'w-ceiling-1',
        date: '2026-10-10T10:00:00Z',
        exercises: [
          {
            name: exercise,
            sets: [
              {
                prescribedWeight: weight,
                prescribedReps: reps,
                prescribedRpe: 8,
                prescribedUnit: unit,
                weight,
                reps,
                rpe: 8,
                unit,
                status: 'completed',
                completed: true,
              },
            ],
          },
        ],
      },
    ];

    it('holds load at rep ceiling (review_required, deltaWeight: 0) for Barbell Compound when stepIncrement is unconfigured', () => {
      const workouts = createCeilingWorkout('Barbell Back Squat', 100, 10, 'kg');
      const summary = aggregateMultiSessionEvidence(workouts);

      // Caller does NOT pass stepIncrement
      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 10, targetUnit: 'kg' },
        summary,
        { repRange: { min: 8, max: 10 } }
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('REV-INCREMENT');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.weight).toBe(100);
      expect(decision.proposedPrescription.reps).toBe(10);
      expect(decision.explanation).toContain('Equipment load increment is unconfigured for Barbell Back Squat');
      expect(decision.explanation).toContain('Explicitly specify a validated equipment increment (stepIncrement)');
    });

    it('progresses load (candidate_load_progression, DP-LOAD-01) for Barbell Compound when explicit stepIncrement is provided', () => {
      const workouts = createCeilingWorkout('Barbell Back Squat', 100, 10, 'kg');
      const summary = aggregateMultiSessionEvidence(workouts);

      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 10, targetUnit: 'kg' },
        summary,
        {
          repRange: { min: 8, max: 10 },
          stepIncrement: 2.5,
          incrementApprovalSource: 'trusted_equipment_profile',
        }
      );

      expect(decision.actionCategory).toBe('candidate_load_progression');
      expect(decision.ruleId).toBe('LOAD-PROG-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(2.5);
      expect(decision.proposedPrescription.weight).toBe(102.5);
      expect(decision.proposedPrescription.reps).toBe(8); // Reset to rep range floor
      expect(decision.explanation).toContain('advance load by +2.5 kg');
    });

    it('progresses load in lbs with exact +5 lbs increment when explicit stepIncrement is provided', () => {
      const workouts = createCeilingWorkout('Bench Press', 225, 5, 'lbs');
      const summary = aggregateMultiSessionEvidence(workouts);

      const decision = evaluateTrainingDecisionPolicyV0(
        'Bench Press',
        { targetWeight: 225, targetReps: 5, targetUnit: 'lbs' },
        summary,
        {
          repRange: { min: 3, max: 5 },
          stepIncrement: 5,
          incrementApprovalSource: 'trusted_equipment_profile',
        }
      );

      expect(decision.actionCategory).toBe('candidate_load_progression');
      expect(decision.ruleId).toBe('LOAD-PROG-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(5);
      expect(decision.proposedPrescription.weight).toBe(230);
      expect(decision.proposedPrescription.unit).toBe('lbs');
      expect(decision.proposedPrescription.reps).toBe(3);
      expect(decision.explanation).toContain('+5 lbs');
    });

    it('correctly maps all five load increment statuses without ambiguous classification', () => {
      // 1. unconfigured
      const resUnconfBarbell = resolveLoadIncrement('Deadlift', 150, 'kg');
      expect(resUnconfBarbell.status).toBe('unconfigured');
      expect(resUnconfBarbell.increment).toBeNull();

      const resUnconfDb = resolveLoadIncrement('Dumbbell Row', 30, 'kg');
      expect(resUnconfDb.status).toBe('unconfigured');

      const resUnconfMachine = resolveLoadIncrement('Leg Press', 200, 'kg');
      expect(resUnconfMachine.status).toBe('unconfigured');

      const resUnconfWeightedBw = resolveLoadIncrement('Weighted Pull-up', 15, 'kg', { isBodyweight: true });
      expect(resUnconfWeightedBw.status).toBe('unconfigured');

      // 2. invalid_input
      const resZero = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: 0 });
      expect(resZero.status).toBe('invalid_input');

      const resNeg = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: -1 });
      expect(resNeg.status).toBe('invalid_input');

      const resInfinity = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: Infinity });
      expect(resInfinity.status).toBe('invalid_input');

      // 3. requires_review (via maxAllowableIncrement)
      const resOverLimit = resolveLoadIncrement('Squat', 140, 'kg', {
        stepIncrement: 10,
        maxAllowableIncrement: 5,
        incrementApprovalSource: 'coach_approved',
      });
      expect(resOverLimit.status).toBe('requires_review');
      expect(resOverLimit.reason).toContain('exceeds maximum allowable equipment step');

      // 3b. requires_review (via maxAllowableIncrement on isolation or compound)
      const resIsoOverLimit = resolveLoadIncrement('Lateral Raise', 8, 'kg', {
        stepIncrement: 2.5,
        maxAllowableIncrement: 1.0,
        incrementApprovalSource: 'coach_approved',
      });
      expect(resIsoOverLimit.status).toBe('requires_review');
      expect(resIsoOverLimit.reason).toContain('exceeds maximum allowable equipment step');

      const resCompoundOverLimit = resolveLoadIncrement('Overhead Press', 20, 'kg', {
        stepIncrement: 20,
        maxAllowableIncrement: 5,
        incrementApprovalSource: 'coach_approved',
      });
      expect(resCompoundOverLimit.status).toBe('requires_review');
      expect(resCompoundOverLimit.reason).toContain('exceeds maximum allowable equipment step');

      // 4. valid (satisfies numeric validity and explicit constraints with approval)
      const resLargeWithoutMax = resolveLoadIncrement('Overhead Press', 20, 'kg', {
        stepIncrement: 20,
        incrementApprovalSource: 'coach_approved',
      });
      expect(resLargeWithoutMax.status).toBe('valid');
      expect(resLargeWithoutMax.increment).toBe(20);

      const resValidKg = resolveLoadIncrement('Bench Press', 100, 'kg', {
        stepIncrement: 2.5,
        maxAllowableIncrement: 5,
        incrementApprovalSource: 'trusted_equipment_profile',
      });
      expect(resValidKg.status).toBe('valid');
      expect(resValidKg.increment).toBe(2.5);

      const resValidMicro = resolveLoadIncrement('Lateral Raise', 8, 'kg', {
        stepIncrement: 0.5,
        incrementApprovalSource: 'athlete_confirmed',
      });
      expect(resValidMicro.status).toBe('valid');
      expect(resValidMicro.increment).toBe(0.5);

      // 5. bodyweight_unweighted
      const resBwUnweighted = resolveLoadIncrement('Pull-up', 0, 'kg');
      expect(resBwUnweighted.status).toBe('bodyweight_unweighted');
      expect(resBwUnweighted.increment).toBeNull();
    });

    it('enforces authoritative maxAllowableIncrement by routing to review_required when stepIncrement exceeds limit', () => {
      const workouts = createCeilingWorkout('Bench Press', 100, 5, 'kg');
      const summary = aggregateMultiSessionEvidence(workouts);

      const decision = evaluateTrainingDecisionPolicyV0(
        'Bench Press',
        { targetWeight: 100, targetReps: 5, targetUnit: 'kg' },
        summary,
        {
          repRange: { min: 3, max: 5 },
          stepIncrement: 5, // Athlete requests +5 kg
          maxAllowableIncrement: 2.5, // But facility only permits micro-plates or max 2.5 kg jump
        }
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('REV-INCREMENT');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.explanation).toContain('exceeds maximum allowable equipment step (2.5 kg)');
    });

    it('preserves double progression Stage 1 (rep progression) without requiring stepIncrement', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-mid-bracket',
          date: '2026-10-10T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 8,
                  prescribedRpe: 8,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 8,
                  rpe: 8,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];
      const summary = aggregateMultiSessionEvidence(workouts);

      // In the middle of rep range (8 of 8-10): rep progression does NOT need equipment stepIncrement
      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 8, targetUnit: 'kg' },
        summary,
        { repRange: { min: 8, max: 10 } }
      );

      expect(decision.actionCategory).toBe('candidate_rep_progression');
      expect(decision.ruleId).toBe('REP-PROG-01');
      expect(decision.proposedPrescription.deltaReps).toBe(1);
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.reps).toBe(9);
      expect(decision.proposedPrescription.weight).toBe(100);
    });

    it('preserves pain safety unconditionally even when valid stepIncrement is configured', () => {
      const workouts = createCeilingWorkout('Barbell Back Squat', 100, 10, 'kg');
      const summary = aggregateMultiSessionEvidence(workouts);

      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 10, targetUnit: 'kg' },
        summary,
        {
          repRange: { min: 8, max: 10 },
          stepIncrement: 2.5,
          athleteFlags: { reportsPain: true },
        }
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('SAFETY-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.deltaReps).toBe(0);
      expect(decision.explanation).toContain('Discomfort or pain was reported for this movement');
    });

    it('satisfies Stage 2 persistence contract regardless of increment status', () => {
      const dUnconf = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 10 },
        null,
        { workoutId: 'w-persistent-101', referenceDate: '2026-10-15T10:00:00Z' }
      );
      const checkUnconf = canPersistDecisionToLedger(dUnconf);
      expect(checkUnconf.canPersist).toBe(true);
      expect(dUnconf.isIdentityReliable).toBe(true);

      const dValid = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 10 },
        null,
        {
          workoutId: 'w-persistent-102',
          referenceDate: '2026-10-15T10:00:00Z',
          stepIncrement: 2.5,
          incrementApprovalSource: 'trusted_equipment_profile',
        }
      );
      const checkValid = canPersistDecisionToLedger(dValid);
      expect(checkValid.canPersist).toBe(true);
      expect(dValid.isIdentityReliable).toBe(true);
    });
  });

  // ─── TASK 3C-4F: DETERMINISTIC LOAD-INCREMENT VALIDATION CONTRACT ─────────────

  describe('Task 3C-4F: Deterministic Load-Increment Validation Contract', () => {
    it('accepts explicit increment under a valid configuration without arbitrary percentage ceilings', () => {
      const resCompound = resolveLoadIncrement('Bench Press', 100, 'kg', {
        stepIncrement: 2.5,
        incrementApprovalSource: 'trusted_equipment_profile',
      });
      expect(resCompound.status).toBe('valid');
      expect(resCompound.increment).toBe(2.5);

      const resAccessory = resolveLoadIncrement('Dumbbell Lateral Raise', 6, 'kg', {
        stepIncrement: 1.0,
        incrementApprovalSource: 'athlete_confirmed',
      });
      expect(resAccessory.status).toBe('valid');
      expect(resAccessory.increment).toBe(1.0);
    });

    it('rejects explicit increment when it exceeds an authoritative configured maximum (maxAllowableIncrement)', () => {
      const res = resolveLoadIncrement('Barbell Back Squat', 140, 'kg', {
        stepIncrement: 5,
        maxAllowableIncrement: 2.5,
        incrementApprovalSource: 'coach_approved',
      });
      expect(res.status).toBe('requires_review');
      expect(res.increment).toBeNull();
      expect(res.reason).toContain('exceeds maximum allowable equipment step (2.5 kg)');
    });

    it('identifies unconfigured increments conservatively when no equipment information is available', () => {
      const resSquat = resolveLoadIncrement('Squat', 100, 'kg');
      expect(resSquat.status).toBe('unconfigured');
      expect(resSquat.increment).toBeNull();
      expect(resSquat.reason).toContain('unconfigured');

      const resCurl = resolveLoadIncrement('Bicep Curl', 15, 'kg');
      expect(resCurl.status).toBe('unconfigured');
      expect(resCurl.increment).toBeNull();
    });

    it('rejects zero, negative, NaN, and infinite values for stepIncrement as invalid_input', () => {
      const resZero = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: 0 });
      expect(resZero.status).toBe('invalid_input');

      const resNegative = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: -2.5 });
      expect(resNegative.status).toBe('invalid_input');

      const resNaN = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: NaN });
      expect(resNaN.status).toBe('invalid_input');

      const resPosInf = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: Infinity });
      expect(resPosInf.status).toBe('invalid_input');

      const resNegInf = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: -Infinity });
      expect(resNegInf.status).toBe('invalid_input');
    });

    it('rejects invalid maxAllowableIncrement values (zero, negative, NaN, Infinity) as invalid_input', () => {
      const resZero = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: 2.5, maxAllowableIncrement: 0 });
      expect(resZero.status).toBe('invalid_input');
      expect(resZero.reason).toContain('Configured maximum allowable increment must be a positive, finite number');

      const resNeg = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: 2.5, maxAllowableIncrement: -5 });
      expect(resNeg.status).toBe('invalid_input');

      const resNaN = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: 2.5, maxAllowableIncrement: NaN });
      expect(resNaN.status).toBe('invalid_input');

      const resInf = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: 2.5, maxAllowableIncrement: Infinity });
      expect(resInf.status).toBe('invalid_input');
    });

    it('accepts large explicit increments without a configured maximum, rather than inventing an ad-hoc percentage ceiling', () => {
      // Large increment (e.g. 50% or 100% of working load) configured by coach/athlete without max constraint
      const resLargeIso = resolveLoadIncrement('Dumbbell Lateral Raise', 6, 'kg', {
        stepIncrement: 3.0,
        incrementApprovalSource: 'coach_approved',
      });
      expect(resLargeIso.status).toBe('valid');
      expect(resLargeIso.increment).toBe(3.0);

      const resLargeCompound = resolveLoadIncrement('Overhead Press', 20, 'kg', {
        stepIncrement: 20,
        incrementApprovalSource: 'coach_approved',
      });
      expect(resLargeCompound.status).toBe('valid');
      expect(resLargeCompound.increment).toBe(20);

      // Contrast: when an authoritative maximum IS supplied, it is reliably enforced
      const resWithMax = resolveLoadIncrement('Overhead Press', 20, 'kg', {
        stepIncrement: 20,
        maxAllowableIncrement: 5,
        incrementApprovalSource: 'coach_approved',
      });
      expect(resWithMax.status).toBe('requires_review');
      expect(resWithMax.reason).toContain('exceeds maximum allowable equipment step (5 kg)');
    });

    it('enforces equipment-specific constraints for unweighted and weighted bodyweight, machines, and cables', () => {
      // Unweighted bodyweight: external load progression not applicable
      const resUnweighted = resolveLoadIncrement('Pull-ups', 0, 'kg');
      expect(resUnweighted.status).toBe('bodyweight_unweighted');
      expect(resUnweighted.increment).toBeNull();
      expect(resUnweighted.reason).toContain('Bodyweight exercise performed without added load');

      // Weighted bodyweight without plate configuration: unconfigured
      const resWeightedNoConfig = resolveLoadIncrement('Pull-ups', 15, 'kg');
      expect(resWeightedNoConfig.status).toBe('unconfigured');

      // Weighted bodyweight with explicit plate configuration: valid
      const resWeightedConfig = resolveLoadIncrement('Pull-ups', 15, 'kg', {
        stepIncrement: 2.5,
        incrementApprovalSource: 'trusted_equipment_profile',
      });
      expect(resWeightedConfig.status).toBe('valid');
      expect(resWeightedConfig.increment).toBe(2.5);

      // Machine and cable without stack increment: unconfigured
      const resCable = resolveLoadIncrement('Cable Tricep Pushdown', 25, 'kg');
      expect(resCable.status).toBe('unconfigured');
      expect(resCable.reason).toContain('Machine/cable stack increments vary by manufacturer');
    });

    it('correctly validates kg and lbs units without cross-unit bleed', () => {
      const resKg = resolveLoadIncrement('Barbell Back Squat', 100, 'kg', {
        stepIncrement: 2.5,
        maxAllowableIncrement: 5,
        incrementApprovalSource: 'trusted_equipment_profile',
      });
      expect(resKg.status).toBe('valid');
      expect(resKg.increment).toBe(2.5);

      const resLbs = resolveLoadIncrement('Barbell Back Squat', 225, 'lbs', {
        stepIncrement: 5,
        maxAllowableIncrement: 10,
        incrementApprovalSource: 'trusted_equipment_profile',
      });
      expect(resLbs.status).toBe('valid');
      expect(resLbs.increment).toBe(5);

      // Rejection message preserves correct unit symbol
      const resLbsReject = resolveLoadIncrement('Barbell Back Squat', 225, 'lbs', {
        stepIncrement: 15,
        maxAllowableIncrement: 10,
        incrementApprovalSource: 'trusted_equipment_profile',
      });
      expect(resLbsReject.status).toBe('requires_review');
      expect(resLbsReject.reason).toContain('exceeds maximum allowable equipment step (10 lbs)');
    });

    it('ensures athlete pain/discomfort flags strictly preempt progression regardless of valid increment configuration', () => {
      const workouts: WorkoutEntry[] = [
        {
          id: 'w-ceil-pain',
          date: '2026-10-10T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 10,
                  prescribedRpe: 8,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 10,
                  rpe: 8,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];
      const summary = aggregateMultiSessionEvidence(workouts);

      // Even with a perfectly valid stepIncrement and rep ceiling achieved, pain flag locks progression
      const decision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 10, targetUnit: 'kg' },
        summary,
        {
          repRange: { min: 8, max: 10 },
          stepIncrement: 2.5,
          incrementApprovalSource: 'trusted_equipment_profile',
          athleteFlags: { reportsPain: true },
        }
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('SAFETY-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.deltaReps).toBe(0);
      expect(decision.explanation).toContain('Discomfort or pain was reported');
    });
  });

  // ─── TASK 3C-4G: EXPLICIT LOAD INCREMENT APPROVAL & PROVENANCE CONTRACT ──────────

  describe('Task 3C-4G: Explicit Load Increment Approval & Provenance Contract', () => {
    const createCeilingWorkout = (exercise: string, weight: number, reps: number, unit: 'kg' | 'lbs' = 'kg'): WorkoutEntry[] => [
      {
        id: 'w-ceiling-test',
        date: '2026-10-10T10:00:00Z',
        exercises: [
          {
            name: exercise,
            sets: [
              {
                prescribedWeight: weight,
                prescribedReps: reps,
                prescribedRpe: 8,
                prescribedUnit: unit,
                weight,
                reps,
                rpe: 8,
                unit,
                status: 'completed',
                completed: true,
              },
            ],
          },
        ],
      },
    ];

    it('1. rejects finite positive increment when unapproved, holding load in review_required', () => {
      // Numerical value is valid (2.5), but no approvalSource is provided
      const res = resolveLoadIncrement('Bench Press', 100, 'kg', { stepIncrement: 2.5 });
      expect(res.status).toBe('requires_review');
      expect(res.increment).toBeNull();
      expect(res.reason).toContain('lacks verified progression approval');

      const workouts = createCeilingWorkout('Bench Press', 100, 10, 'kg');
      const summary = aggregateMultiSessionEvidence(workouts);

      const decision = evaluateTrainingDecisionPolicyV0(
        'Bench Press',
        { targetWeight: 100, targetReps: 10, targetUnit: 'kg' },
        summary,
        {
          repRange: { min: 8, max: 10 },
          stepIncrement: 2.5,
          // No incrementApprovalSource!
        }
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('REV-INCREMENT');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.weight).toBe(100);
      expect(decision.explanation).toContain('lacks verified progression approval');
    });

    it('2. rejects large increment on a light isolation exercise without approval', () => {
      // 3 kg jump on 6 kg Lateral Raise (50%) without approval
      const res = resolveLoadIncrement('Dumbbell Lateral Raise', 6, 'kg', { stepIncrement: 3.0 });
      expect(res.status).toBe('requires_review');
      expect(res.increment).toBeNull();
      expect(res.reason).toContain('lacks verified progression approval');

      const workouts = createCeilingWorkout('Dumbbell Lateral Raise', 6, 15, 'kg');
      const summary = aggregateMultiSessionEvidence(workouts);

      const decision = evaluateTrainingDecisionPolicyV0(
        'Dumbbell Lateral Raise',
        { targetWeight: 6, targetReps: 15, targetUnit: 'kg' },
        summary,
        {
          repRange: { min: 12, max: 15 },
          stepIncrement: 3.0,
          // No approval
        }
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('REV-INCREMENT');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.weight).toBe(6);
    });

    it('3. rejects large increment on a compound exercise without approval', () => {
      // 20 kg jump on 20 kg Overhead Press (100%) without approval
      const res = resolveLoadIncrement('Overhead Press', 20, 'kg', { stepIncrement: 20 });
      expect(res.status).toBe('requires_review');
      expect(res.increment).toBeNull();
      expect(res.reason).toContain('lacks verified progression approval');

      const workouts = createCeilingWorkout('Overhead Press', 20, 8, 'kg');
      const summary = aggregateMultiSessionEvidence(workouts);

      const decision = evaluateTrainingDecisionPolicyV0(
        'Overhead Press',
        { targetWeight: 20, targetReps: 8, targetUnit: 'kg' },
        summary,
        {
          repRange: { min: 6, max: 8 },
          stepIncrement: 20,
          // No approval
        }
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('REV-INCREMENT');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.proposedPrescription.weight).toBe(20);
    });

    it('4. authorizes progression for an explicitly approved increment with no configured maximum', () => {
      // Light isolation with coach approval
      const resIso = resolveLoadIncrement('Dumbbell Lateral Raise', 6, 'kg', {
        stepIncrement: 3.0,
        incrementApprovalSource: 'coach_approved',
      });
      expect(resIso.status).toBe('valid');
      expect(resIso.increment).toBe(3.0);
      expect(resIso.approvalSource).toBe('coach_approved');

      // Compound with athlete confirmation
      const resCompound = resolveLoadIncrement('Overhead Press', 20, 'kg', {
        stepIncrement: 20,
        incrementApprovalSource: 'athlete_confirmed',
      });
      expect(resCompound.status).toBe('valid');
      expect(resCompound.increment).toBe(20);
      expect(resCompound.approvalSource).toBe('athlete_confirmed');

      // Bundled configuration via incrementConfig
      const resBundled = resolveLoadIncrement('Bench Press', 100, 'kg', {
        incrementConfig: {
          stepIncrement: 2.5,
          approvalSource: 'trusted_equipment_profile',
        },
      });
      expect(resBundled.status).toBe('valid');
      expect(resBundled.increment).toBe(2.5);
      expect(resBundled.approvalSource).toBe('trusted_equipment_profile');

      // Full decision evaluation with coach approval
      const workouts = createCeilingWorkout('Dumbbell Lateral Raise', 6, 15, 'kg');
      const summary = aggregateMultiSessionEvidence(workouts);

      const decision = evaluateTrainingDecisionPolicyV0(
        'Dumbbell Lateral Raise',
        { targetWeight: 6, targetReps: 15, targetUnit: 'kg' },
        summary,
        {
          repRange: { min: 12, max: 15 },
          stepIncrement: 3.0,
          incrementApprovalSource: 'coach_approved',
        }
      );

      expect(decision.actionCategory).toBe('candidate_load_progression');
      expect(decision.ruleId).toBe('LOAD-PROG-01');
      expect(decision.proposedPrescription.deltaWeight).toBe(3.0);
      expect(decision.proposedPrescription.weight).toBe(9);
      expect(decision.proposedPrescription.reps).toBe(12);
    });

    it('5. enforces authoritative configured maximum even when increment has approval', () => {
      const res = resolveLoadIncrement('Bench Press', 100, 'kg', {
        stepIncrement: 5,
        maxAllowableIncrement: 2.5,
        incrementApprovalSource: 'coach_approved',
      });
      expect(res.status).toBe('requires_review');
      expect(res.increment).toBeNull();
      expect(res.reason).toContain('exceeds maximum allowable equipment step (2.5 kg)');

      const workouts = createCeilingWorkout('Bench Press', 100, 10, 'kg');
      const summary = aggregateMultiSessionEvidence(workouts);

      const decision = evaluateTrainingDecisionPolicyV0(
        'Bench Press',
        { targetWeight: 100, targetReps: 10, targetUnit: 'kg' },
        summary,
        {
          repRange: { min: 8, max: 10 },
          stepIncrement: 5,
          maxAllowableIncrement: 2.5,
          incrementApprovalSource: 'coach_approved',
        }
      );

      expect(decision.actionCategory).toBe('review_required');
      expect(decision.ruleId).toBe('REV-INCREMENT');
      expect(decision.proposedPrescription.deltaWeight).toBe(0);
      expect(decision.explanation).toContain('exceeds maximum allowable equipment step (2.5 kg)');
    });

    it('6. rejects invalid numeric values regardless of approval status', () => {
      const resZero = resolveLoadIncrement('Bench Press', 100, 'kg', {
        stepIncrement: 0,
        incrementApprovalSource: 'coach_approved',
      });
      expect(resZero.status).toBe('invalid_input');

      const resNeg = resolveLoadIncrement('Bench Press', 100, 'kg', {
        stepIncrement: -2.5,
        incrementApprovalSource: 'coach_approved',
      });
      expect(resNeg.status).toBe('invalid_input');

      const resNaN = resolveLoadIncrement('Bench Press', 100, 'kg', {
        stepIncrement: NaN,
        incrementApprovalSource: 'coach_approved',
      });
      expect(resNaN.status).toBe('invalid_input');

      const resInf = resolveLoadIncrement('Bench Press', 100, 'kg', {
        stepIncrement: Infinity,
        incrementApprovalSource: 'coach_approved',
      });
      expect(resInf.status).toBe('invalid_input');
    });

    it('7. preserves pain preemption and missing-RPE behavior unchanged with approved increment', () => {
      const workoutsWithReserve = createCeilingWorkout('Barbell Back Squat', 100, 10, 'kg');
      const summaryWithReserve = aggregateMultiSessionEvidence(workoutsWithReserve);

      // Pain preemption
      const painDecision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 10, targetUnit: 'kg' },
        summaryWithReserve,
        {
          repRange: { min: 8, max: 10 },
          stepIncrement: 2.5,
          incrementApprovalSource: 'coach_approved',
          athleteFlags: { reportsPain: true },
        }
      );

      expect(painDecision.actionCategory).toBe('review_required');
      expect(painDecision.ruleId).toBe('SAFETY-01');
      expect(painDecision.proposedPrescription.deltaWeight).toBe(0);
      expect(painDecision.explanation).toContain('Discomfort or pain was reported');

      // Missing-RPE behavior: ceiling achieved but RPE unrecorded
      const workoutsNoRpe: WorkoutEntry[] = [
        {
          id: 'w-ceil-no-rpe',
          date: '2026-10-10T10:00:00Z',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: [
                {
                  prescribedWeight: 100,
                  prescribedReps: 10,
                  prescribedUnit: 'kg',
                  weight: 100,
                  reps: 10,
                  unit: 'kg',
                  status: 'completed',
                  completed: true,
                },
              ],
            },
          ],
        },
      ];
      const summaryNoRpe = aggregateMultiSessionEvidence(workoutsNoRpe);

      const rpeDecision = evaluateTrainingDecisionPolicyV0(
        'Barbell Back Squat',
        { targetWeight: 100, targetReps: 10, targetUnit: 'kg' },
        summaryNoRpe,
        {
          repRange: { min: 8, max: 10 },
          stepIncrement: 2.5,
          incrementApprovalSource: 'coach_approved',
        }
      );

      expect(rpeDecision.actionCategory).toBe('hold_current_target');
      expect(rpeDecision.ruleId).toBe('HOLD-RPE-UNRECORDED');
      expect(rpeDecision.proposedPrescription.deltaWeight).toBe(0);
      expect(rpeDecision.explanation).toContain('Effort (RPE) was not recorded');
    });
  });
});
