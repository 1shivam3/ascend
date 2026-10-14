/**
 * ASCEND Training Decision Policy v0 Engine
 *
 * A deterministic, rule-based decision engine for resistance training progression.
 * Consumes verified multi-session outcome evidence from ExerciseOutcomeEvidence and
 * evaluates adherence relative to planned targets.
 *
 * Invariants:
 * 1. Evidence-Grounded: Evaluates verified evidence; never guesses from raw unprescribed logs.
 * 2. Purely Advisory: Generates recommendations as 'pending'; never mutates plans autonomously.
 * 3. Observational, Not Causal: Describes observed deltas without asserting unverified internal states.
 * 4. Safety First: Missing evidence, pain, or discrepancies default to holding load or review.
 * 5. Deterministic & Idempotent: Evaluates consistently across identical inputs.
 */

import {
  Unit,
  PlannedExercise,
  PlannedWorkout,
  ValidateApplicationResult,
  PolicyDecisionApplicationAudit,
} from '@/lib/types';
import {
  ExerciseOutcomeEvidence,
  ExerciseExposureEvidence,
  MultiSessionEvidenceSummary,
  canonicalizeExerciseName,
  OutcomeDistribution,
} from '@/lib/workout-outcome-evidence';
import {
  getEquipmentType,
  isMainCompoundLift,
  isBodyweightExercise,
} from '@/lib/strength-standards';

/**
 * Mutually exclusive action categories for Policy v0 decisions.
 */
export type DecisionActionCategory =
  | 'insufficient_evidence'
  | 'hold_current_target'
  | 'candidate_rep_progression'
  | 'candidate_load_progression'
  | 'review_required';

/**
 * @deprecated Legacy confidence classification. Use evidenceSufficiencyTier or evidenceAudit.sufficiency instead.
 * Does not claim calibrated statistical probability; strictly reflects verified evidence sample size.
 */
export type DecisionConfidenceTier =
  | 'insufficient'
  | 'early_signal'
  | 'established';

/**
 * Progression models recognized by ASCEND.
 */
export type ProgressionModelType =
  | 'double_progression'
  | 'fixed_reps'
  | 'bodyweight_progression';

/**
 * Transparent sufficiency classification reflecting evidence sample size.
 */
export type EvidenceSufficiencyTier =
  | 'insufficient'
  | 'single_session'
  | 'multi_session';

/**
 * Detailed evidence sufficiency and data quality audit.
 */
export interface EvidenceSufficiencyAudit {
  tier: EvidenceSufficiencyTier;
  comparableExposuresCount: number;
  totalExposuresCount: number;
  isOrderVerified: boolean;
  hasRecordedEffort: boolean;
  notes: string[];
}

/**
 * Scoped RPE override allowing external load progression when effort was unrecorded.
 */
export interface RpeProgressionOverride {
  /** Target exercise name. If set, must match the evaluated exercise to prevent accidental global overrides */
  targetExercise?: string;
  /** Explicit athlete attestation that they had repetitions in reserve */
  athleteConfirmedReserve: boolean;
  reason?: string;
}

/**
 * Detailed classification for load increment resolution:
 * - 'valid': Valid, physically plausible increment explicitly configured or established.
 * - 'unconfigured': Equipment load step is unconfigured; no reliable equipment information provided.
 * - 'invalid_input': Step increment is malformed (non-finite, zero, or negative).
 * - 'requires_review': Increment is explicitly configured but requires manual coach review (unusually large or inconsistent).
 * - 'bodyweight_unweighted': Exercise is performed with bodyweight only (external load progression not applicable).
 */
/**
 * Provenance and authorization source for a proposed external load increment.
 * Distinguishes bare numeric validity from verified equipment compatibility and progression approval.
 */
export type IncrementApprovalSource =
  | 'trusted_equipment_profile'
  | 'athlete_confirmed'
  | 'coach_approved';

/**
 * Complete, explicit configuration for a progression load increment.
 */
export interface IncrementConfiguration {
  stepIncrement: number;
  approvalSource: IncrementApprovalSource;
  maxAllowableIncrement?: number;
}

/**
 * Resolution status of load increment validation.
 */
export type LoadIncrementStatus =
  | 'valid'
  | 'unconfigured'
  | 'invalid_input'
  | 'requires_review'
  | 'bodyweight_unweighted';

/**
 * Result of resolving a progression load increment for an exercise.
 */
export interface LoadIncrementResolution {
  increment: number | null;
  status: LoadIncrementStatus;
  approvalSource?: IncrementApprovalSource;
  reason?: string;
}

/**
 * Input descriptor for the active target prescription.
 */
export interface CurrentPrescriptionTarget {
  name?: string;
  targetWeight?: number;
  targetReps?: number;
  targetSets?: number;
  targetUnit?: Unit;
  targetRpe?: number;
  notes?: string;
}

/**
 * Complete, auditable decision record produced by Policy v0.
 */
export interface TrainingDecisionRecord {
  /** Deterministic identifier: e.g. "dec_{canonicalKey}_{datePart}[_w_{workoutId}]_v0" */
  id: string;

  /** Engine policy schema version */
  policyVersion: '0.1.0';

  /** Timestamp of decision evaluation */
  createdAt: string;

  /** Exercise name as submitted and canonical key */
  exerciseName: string;
  canonicalExerciseKey: string;

  /** Evaluated progression model */
  progressionModel: ProgressionModelType;

  /** The mutually exclusive action category */
  actionCategory: DecisionActionCategory;

  /** Exact rule identifier (e.g. 'LOAD-PROG-01', 'REP-PROG-01', 'HOLD-01', 'HOLD-ATHLETE-REQUEST', 'HOLD-RPE-UNRECORDED', 'REV-01', 'REV-INCREMENT', 'IE-01', 'SAFETY-01') */
  ruleId: string;

  /** Transparent evidence sufficiency classification based on verified comparable exposures */
  evidenceSufficiencyTier: EvidenceSufficiencyTier;

  /** Legacy confidence tier retained for backward compatibility. Does not claim calibrated probability. */
  confidenceTier: DecisionConfidenceTier;
  evidenceCount: number;

  /** Identity reliability: true only if anchored to a verified workout or session identifier */
  isIdentityReliable: boolean;
  identityLimitation?: string;

  /** Active prescription prior to decision */
  currentPrescription: {
    weight: number;
    reps: number;
    targetRpe?: number;
    sets: number;
    unit: Unit;
  };

  /** Proposed advisory prescription for the next session */
  proposedPrescription: {
    weight: number;
    reps: number;
    targetRpe?: number;
    sets: number;
    unit: Unit;
    deltaWeight: number;
    deltaReps: number;
  };

  /** Objective headline and non-causal explanation */
  headline: string;
  explanation: string;

  /** Concrete evidence audit data justifying the recommendation */
  evidenceAudit: {
    contributingWorkoutIds: string[];
    lastExposureDate: string | null;
    totalPrescribedSetsEvaluated: number;
    completedPrescribedSets: number;
    usableRepComparisons: number;
    repOutcomes: OutcomeDistribution;
    loadOutcomes: OutcomeDistribution;
    rpeOutcomes: OutcomeDistribution;
    averageLoadDeltaKg: number | null;
    averageRpeDelta: number | null;
    exclusions: string[];
    limitations: string[];
    sufficiency: EvidenceSufficiencyAudit;
  };

  /** User interaction state (always 'pending' when created) */
  status: 'pending' | 'accepted' | 'overridden' | 'dismissed';

  /** Timestamp when decision was accepted by athlete */
  acceptedAt?: string;

  /** Timestamp when decision was dismissed by athlete */
  dismissedAt?: string;

  /** Optional user override recorded when athlete customizes targets */
  userOverride?: {
    customWeight?: number;
    customReps?: number;
    overrideReason?: string;
    overriddenAt: string;
  };

  /** Post-hoc validation data linked after next session */
  observedOutcome?: {
    nextWorkoutId: string;
    actualWeight: number;
    actualReps: number;
    actualRpe?: number;
    completedSets: number;
    predictionErrorRpe?: number;
  };

  /** Timestamp when decision was explicitly applied to a future prescription */
  appliedAt?: string;

  /** ID of the planned workout template where decision was applied */
  appliedTargetPlanId?: string;

  /** Name of the planned workout template where decision was applied */
  appliedTargetPlanName?: string;

  /** Name of the target exercise in the plan where decision was applied */
  appliedTargetExerciseName?: string;

  /** Stable ID of the target exercise in the plan where decision was applied, if available */
  appliedTargetExerciseId?: string;

  /** Index of the target exercise in the plan where decision was applied */
  appliedTargetExerciseIndex?: number;
}

/**
 * Options configuring evaluation of Policy v0.
 */
export interface EvaluateDecisionOptions {
  userUnit?: Unit;
  repRange?: { min: number; max: number };
  stepIncrement?: number;
  /**
   * Provenance and authorization source for stepIncrement.
   * Required to distinguish a bare caller-provided number from an approved progression increment.
   */
  incrementApprovalSource?: IncrementApprovalSource;
  /**
   * Complete, bundled increment configuration specifying step, approval provenance, and optional max.
   */
  incrementConfig?: IncrementConfiguration;
  /**
   * Optional authoritative maximum step increment defined by athlete or equipment settings.
   */
  maxAllowableIncrement?: number;
  /**
   * Narrowly scoped RPE override. Requires explicit athlete confirmation of reserve.
   */
  rpeOverride?: RpeProgressionOverride;
  /**
   * Legacy flag for backwards compatibility. Ignored on main compound lifts for safety.
   */
  allowLoadProgressionWithoutRpe?: boolean;
  athleteFlags?: {
    reportsPain?: boolean;
    requestHold?: boolean;
    notes?: string;
  };
  referenceDate?: string;
  workoutId?: string;
  sessionId?: string;
  sessionIndex?: number;
  isBodyweight?: boolean;
}

/**
 * Identifies small-load isolation and accessory exercises (e.g. Lateral Raises, Curls, Extensions).
 * Provided as a domain classification helper; not used to enforce arbitrary percentage ceilings
 * on load increments.
 */
export function isSmallLoadIsolation(exerciseName: string): boolean {
  const name = exerciseName.toLowerCase();
  return (
    name.includes('lateral raise') ||
    name.includes('front raise') ||
    name.includes('rear delt') ||
    name.includes('face pull') ||
    name.includes('bicep curl') ||
    name.includes('hammer curl') ||
    name.includes('tricep kickback') ||
    name.includes('tricep pushdown') ||
    name.includes('tricep extension') ||
    name.includes('skull crusher') ||
    name.includes('wrist curl') ||
    name.includes('calf raise') ||
    name.includes('fly')
  );
}

/**
 * Resolves an explicit or equipment-specific load increment for an exercise.
 * Distinguishes numeric validity from validated equipment support and progression approval.
 *
 * Validation Contract & Four Tiers of Checks:
 * 1. Numerical Validity:
 *    - Validates that inputs (stepIncrement, maxAllowableIncrement) are strictly positive finite numbers (> 0, not NaN, not Infinity).
 *    - If invalid, returns status: 'invalid_input'.
 * 2. Equipment / Authoritative Constraints:
 *    - When an authoritative maximum increment constraint is established (maxAllowableIncrement):
 *      - If stepIncrement > maxAllowableIncrement, returns status: 'requires_review'.
 * 3. Progression Approval & Provenance:
 *    - A valid number does not automatically authorize a load increase.
 *    - If an increment is supplied without verified provenance (athlete-confirmed, coach-approved, or trusted equipment profile),
 *      returns status: 'requires_review' with reason indicating that explicit approval is required.
 * 4. Configuration Availability:
 *    - If no stepIncrement is provided:
 *      - Bodyweight unweighted returns status: 'bodyweight_unweighted'.
 *      - Weighted bodyweight, machines, cables, dumbbells, barbells return status: 'unconfigured'.
 *    - An increment is only 'valid' when it passes numerical validity, conforms to explicit constraints,
 *      and possesses verified progression approval from a trusted provenance source.
 */
export function resolveLoadIncrement(
  exerciseName: string,
  targetWeight: number,
  userUnit: Unit,
  options?: EvaluateDecisionOptions
): LoadIncrementResolution {
  const inc = options?.incrementConfig?.stepIncrement ?? options?.stepIncrement;
  const approvalSource =
    options?.incrementConfig?.approvalSource ?? options?.incrementApprovalSource;
  const maxInc =
    options?.incrementConfig?.maxAllowableIncrement ?? options?.maxAllowableIncrement;

  // 1. Authoritative maximum increment numerical validation (if provided)
  if (maxInc !== undefined) {
    if (typeof maxInc !== 'number' || !Number.isFinite(maxInc) || maxInc <= 0) {
      return {
        increment: null,
        status: 'invalid_input',
        reason: 'Configured maximum allowable increment must be a positive, finite number.',
      };
    }
  }

  // 2. Explicit caller-supplied increment (from trusted exercise/equipment config or options)
  if (inc !== undefined) {
    // A. Invalid increments: non-finite, zero, or negative
    if (typeof inc !== 'number' || !Number.isFinite(inc) || inc <= 0) {
      return {
        increment: null,
        status: 'invalid_input',
        reason: 'Specified load increment must be a positive, finite number.',
      };
    }

    // B. Authoritative maximum increment check (from equipment/gym settings)
    if (maxInc !== undefined && inc > maxInc) {
      return {
        increment: null,
        status: 'requires_review',
        approvalSource,
        reason: `Configured increment (+${inc} ${userUnit}) exceeds maximum allowable equipment step (${maxInc} ${userUnit}) for ${exerciseName}. Manual coach review required.`,
      };
    }

    // C. Progression approval verification:
    // A valid number must not automatically authorize a load increase.
    // Untrusted or unapproved caller-provided numbers require confirmation.
    if (!approvalSource) {
      return {
        increment: null,
        status: 'requires_review',
        reason: `Load increment (+${inc} ${userUnit}) lacks verified progression approval. Explicit athlete confirmation, coach approval, or a trusted equipment profile is required to authorize load progression on ${exerciseName}.`,
      };
    }

    // Valid: satisfies numeric validation, conforms to explicit constraints, and is explicitly approved.
    return {
      increment: inc,
      status: 'valid',
      approvalSource,
    };
  }

  // 2. Bodyweight exercises
  if (options?.isBodyweight || isBodyweightExercise(exerciseName)) {
    if (targetWeight === 0) {
      return {
        increment: null,
        status: 'bodyweight_unweighted',
        reason: `Bodyweight exercise performed without added load. Expand rep range or specify an explicit added weight increment (e.g. dip belt) to advance external load.`,
      };
    }
    // Weighted bodyweight without explicit increment: cannot assume athlete's available plates
    return {
      increment: null,
      status: 'unconfigured',
      reason: `Explicit equipment load increment is unconfigured for weighted bodyweight on ${exerciseName} (e.g. dip belt plate size). Specify a validated increment to evaluate load progression.`,
    };
  }

  const equipment = getEquipmentType(exerciseName);

  // 3. Machines and Cables (plate stack weights vary widely by manufacturer)
  if (equipment === 'machine' || equipment === 'cable') {
    return {
      increment: null,
      status: 'unconfigured',
      reason: `Machine/cable stack increments vary by manufacturer and pulley ratio for ${exerciseName}. Provide explicit machine step to evaluate load progression.`,
    };
  }

  // 4. Barbell compounds, Dumbbells, other barbells, and unknown equipment
  // The engine must NOT guess collar plate increments or dumbbell jumps without explicit configuration.
  return {
    increment: null,
    status: 'unconfigured',
    reason: `Equipment load increment is unconfigured for ${exerciseName}. Explicitly specify a validated equipment increment (stepIncrement) to evaluate load progression.`,
  };
}

/**
 * Result of checking whether a decision satisfies the Stage 2 persistence contract.
 */
export interface LedgerPersistenceCheck {
  canPersist: boolean;
  reason?: string;
}

/**
 * Persistence guard contract for Stage 2 Ledger Integration:
 * Verifies that a decision meets all integrity and collision-avoidance requirements
 * before being committed to persistent storage (e.g. Zustand store or local ledger).
 *
 * Rules:
 * 1. Reliably identified decisions must have stable, deterministic identities (isIdentityReliable: true).
 * 2. Distinct workout sessions must not overwrite one another (anchored to workoutId/sessionId).
 * 3. Decisions with unreliable identities (unanchored or missing IDs) must not silently be persisted
 *    under potentially colliding keys.
 * 4. Re-evaluating identical inputs for the same session and ruleset must remain idempotent.
 */
export function canPersistDecisionToLedger(
  decision: TrainingDecisionRecord
): LedgerPersistenceCheck {
  if (!decision.isIdentityReliable) {
    return {
      canPersist: false,
      reason:
        decision.identityLimitation ??
        'Decision lacks reliable identity (unanchored to a verified workout or session identifier). Silent persistence under an unanchored key is disallowed.',
    };
  }
  if (!decision.id || decision.id.includes('_unanchored')) {
    return {
      canPersist: false,
      reason: 'Decision ID contains unanchored tag; cannot be safely committed to the ledger.',
    };
  }
  return { canPersist: true };
}

/**
 * Evaluates training decision recommendations for an exercise according to Policy v0.
 *
 * @param exerciseName The target exercise name
 * @param currentPrescription Current planned prescription targets
 * @param evidence Multi-session outcome evidence aggregated for this exercise
 * @param options Additional evaluation parameters (rep bracket, unit, athlete flags, etc.)
 */
export function evaluateTrainingDecisionPolicyV0(
  exerciseName: string,
  currentPrescription?: CurrentPrescriptionTarget | PlannedExercise | null,
  evidence?: ExerciseOutcomeEvidence | MultiSessionEvidenceSummary | null,
  options?: EvaluateDecisionOptions
): TrainingDecisionRecord {
  const canonicalKey = canonicalizeExerciseName(exerciseName);
  const now = options?.referenceDate ?? new Date().toISOString();

  // Resolve exercise-specific evidence whether caller passes MultiSessionEvidenceSummary or ExerciseOutcomeEvidence
  let exerciseEvidence: ExerciseOutcomeEvidence | null = null;
  if (evidence) {
    if ('exercises' in evidence && evidence.exercises) {
      exerciseEvidence = evidence.exercises[canonicalKey] ?? null;
    } else if ('canonicalExerciseKey' in evidence || 'exposures' in evidence) {
      exerciseEvidence = evidence as ExerciseOutcomeEvidence;
    }
  }

  const exposures = exerciseEvidence?.exposures ?? [];
  const lastExp = exposures.length > 0 ? exposures[exposures.length - 1] : null;

  // Filter comparable prescribed exposures for the observation window
  const comparableExposures = exposures.filter(
    (exp) => exp.hasPrescriptionData && exp.totalPrescribedSets > 0
  );

  const latestComparableExp =
    comparableExposures.length > 0
      ? comparableExposures[comparableExposures.length - 1]
      : null;

  // Document limitations and data anomalies
  const limitations: string[] = [...(exerciseEvidence?.limitations ?? [])];
  const exclusions: string[] = [...(exerciseEvidence?.exclusions ?? [])];
  const sufficiencyNotes: string[] = [];

  // ── Chronological Ordering Verification ───────────────────────────────────
  let isOrderVerified = true;
  if (comparableExposures.length >= 2) {
    for (let i = 0; i < comparableExposures.length - 1; i++) {
      const dateA = comparableExposures[i].workoutDate;
      const dateB = comparableExposures[i + 1].workoutDate;
      if (!dateA || !dateB || isNaN(Date.parse(dateA)) || isNaN(Date.parse(dateB))) {
        isOrderVerified = false;
        break;
      }
      if (Date.parse(dateA) > Date.parse(dateB)) {
        isOrderVerified = false;
        break;
      }
    }
  } else if (comparableExposures.length === 1) {
    const d = comparableExposures[0].workoutDate;
    if (!d || isNaN(Date.parse(d))) {
      isOrderVerified = false;
    }
  } else {
    isOrderVerified = false;
  }

  if (!isOrderVerified && comparableExposures.length > 0) {
    limitations.push('Chronological ordering of exposures could not be established due to missing workout dates, invalid timestamps, or non-sequential records.');
    sufficiencyNotes.push('Chronology unverified');
  }

  // ── Reliable, Collision-Free Decision Identity ────────────────────────────
  const workoutId =
    options?.workoutId ??
    options?.sessionId ??
    latestComparableExp?.workoutId ??
    lastExp?.workoutId;

  const isIdentityReliable = Boolean(workoutId);
  const identityLimitation = !isIdentityReliable
    ? 'Unanchored decision identity: evaluation lacks a stable workout or session identifier. Stored decisions may collide if multiple evaluations occur on the same date.'
    : undefined;

  if (identityLimitation) {
    limitations.push(identityLimitation);
  }

  // ── Structured Safety Signal Limitation Audit ─────────────────────────────
  if (options?.athleteFlags?.reportsPain === true) {
    limitations.push('Structured athlete pain or discomfort was explicitly reported for this exercise. Target progression is locked under SAFETY-01.');
  } else {
    limitations.push('No structured athlete pain or discomfort signal was recorded. Absence of a pain report does not constitute medical clearance or guarantee physical readiness.');
  }

  if (options?.athleteFlags?.requestHold === true) {
    limitations.push('Athlete explicitly requested target hold. Progression is held without load or rep advancement.');
  }

  const sessionTag = workoutId ? `_w_${workoutId}` : '_unanchored';
  const sessionIndexTag =
    options?.sessionIndex !== undefined ? `_s${options.sessionIndex}` : '';

  let cleanDate = 'undated';
  if (options?.referenceDate) {
    if (!isNaN(Date.parse(options.referenceDate))) {
      cleanDate = options.referenceDate.split('T')[0];
    } else {
      limitations.push('Invalid referenceDate provided; decision identity is unanchored to calendar.');
    }
  } else if (now && !isNaN(Date.parse(now))) {
    cleanDate = now.split('T')[0];
  }

  const decisionId = `dec_${canonicalKey}_${cleanDate}${sessionTag}${sessionIndexTag}_v0`;

  // Determine active unit
  const userUnit: Unit =
    options?.userUnit ??
    currentPrescription?.targetUnit ??
    latestComparableExp?.workingSetObservations?.[0]?.prescribedUnit ??
    latestComparableExp?.workingSetObservations?.[0]?.actualUnit ??
    lastExp?.workingSetObservations?.[0]?.prescribedUnit ??
    lastExp?.workingSetObservations?.[0]?.actualUnit ??
    'kg';

  // Extract current prescription targets or fallback to latest comparable observed values
  const lastObservedWeight =
    latestComparableExp?.workingSetObservations?.[0]?.prescribedWeight ??
    latestComparableExp?.workingSetObservations?.[0]?.actualWeight ??
    lastExp?.workingSetObservations?.[0]?.prescribedWeight ??
    lastExp?.workingSetObservations?.[0]?.actualWeight ??
    0;

  const lastObservedReps =
    latestComparableExp?.workingSetObservations?.[0]?.prescribedReps ??
    latestComparableExp?.workingSetObservations?.[0]?.actualReps ??
    lastExp?.workingSetObservations?.[0]?.prescribedReps ??
    lastExp?.workingSetObservations?.[0]?.actualReps ??
    8;

  const targetWeight = currentPrescription?.targetWeight ?? lastObservedWeight;
  const targetReps = currentPrescription?.targetReps ?? lastObservedReps;
  const targetSets =
    currentPrescription?.targetSets ??
    latestComparableExp?.totalPrescribedSets ??
    lastExp?.totalPrescribedSets ??
    3;
  const targetRpe =
    currentPrescription?.targetRpe ??
    latestComparableExp?.workingSetObservations?.[0]?.prescribedRpe;

  // Determine rep bracket
  const repRange = options?.repRange ?? {
    min: Math.min(targetReps, 8),
    max: Math.max(targetReps, 12),
  };

  // Determine progression model
  const isBW = options?.isBodyweight ?? isBodyweightExercise(exerciseName);
  let progressionModel: ProgressionModelType = 'double_progression';
  if (isBW) {
    progressionModel = 'bodyweight_progression';
  } else if (repRange.min === repRange.max) {
    progressionModel = 'fixed_reps';
  }

  // ── Evidence Sufficiency Evaluation ───────────────────────────────────────
  const comparableCount = exerciseEvidence?.comparablePrescribedExposures ?? 0;
  let sufficiencyTier: EvidenceSufficiencyTier = 'insufficient';
  if (comparableCount >= 2) {
    sufficiencyTier = 'multi_session';
  } else if (comparableCount === 1) {
    sufficiencyTier = 'single_session';
  }

  const hasRecordedEffort = (latestComparableExp?.usableRpeComparisonsCount ?? 0) > 0;
  if (!hasRecordedEffort && comparableCount > 0) {
    sufficiencyNotes.push('RPE not recorded in latest comparable session');
  }

  // Transparent evidence-sufficiency tier assignment:
  // - 'insufficient': 0 comparable prescribed exposures
  // - 'early_signal': 1 comparable prescribed exposure (single session evidence)
  // - 'established': >= 2 comparable prescribed exposures (multi-session evidence)
  // Strictly avoids claiming 'high_confidence' or calibrated probabilities.
  let confidenceTier: DecisionConfidenceTier = 'insufficient';
  if (comparableCount < 1) {
    confidenceTier = 'insufficient';
  } else if (comparableCount === 1) {
    confidenceTier = 'early_signal';
  } else {
    confidenceTier = 'established';
  }

  // Structured evidence audit payload
  const emptyDist: OutcomeDistribution = { below_target: 0, met_target: 0, above_target: 0 };
  const evidenceAudit = {
    contributingWorkoutIds: exerciseEvidence?.contributingWorkoutIds ?? [],
    lastExposureDate: latestComparableExp?.workoutDate ?? lastExp?.workoutDate ?? null,
    totalPrescribedSetsEvaluated: exerciseEvidence?.totalPrescribedSets ?? 0,
    completedPrescribedSets: exerciseEvidence?.completedPrescribedSets ?? 0,
    usableRepComparisons: exerciseEvidence?.usableRepComparisonsCount ?? 0,
    repOutcomes: exerciseEvidence?.repOutcomesDistribution
      ? { ...exerciseEvidence.repOutcomesDistribution }
      : { ...emptyDist },
    loadOutcomes: exerciseEvidence?.loadOutcomesDistribution
      ? { ...exerciseEvidence.loadOutcomesDistribution }
      : { ...emptyDist },
    rpeOutcomes: exerciseEvidence?.rpeOutcomesDistribution
      ? { ...exerciseEvidence.rpeOutcomesDistribution }
      : { ...emptyDist },
    averageLoadDeltaKg: exerciseEvidence?.averageLoadDeltaKg ?? null,
    averageRpeDelta: exerciseEvidence?.averageRpeDelta ?? null,
    exclusions,
    limitations,
    sufficiency: {
      tier: sufficiencyTier,
      comparableExposuresCount: comparableCount,
      totalExposuresCount: exerciseEvidence?.totalExposures ?? 0,
      isOrderVerified,
      hasRecordedEffort,
      notes: sufficiencyNotes,
    },
  };

  const buildRecord = (params: {
    actionCategory: DecisionActionCategory;
    ruleId: string;
    headline: string;
    explanation: string;
    proposedWeight: number;
    proposedReps: number;
    deltaWeight: number;
    deltaReps: number;
    confidenceTierOverride?: DecisionConfidenceTier;
  }): TrainingDecisionRecord => {
    return {
      id: decisionId,
      policyVersion: '0.1.0',
      createdAt: now,
      exerciseName,
      canonicalExerciseKey: canonicalKey,
      progressionModel,
      actionCategory: params.actionCategory,
      ruleId: params.ruleId,
      evidenceSufficiencyTier: sufficiencyTier,
      confidenceTier: params.confidenceTierOverride ?? confidenceTier,
      evidenceCount: exerciseEvidence?.totalExposures ?? 0,
      isIdentityReliable,
      identityLimitation,
      currentPrescription: {
        weight: targetWeight,
        reps: targetReps,
        targetRpe,
        sets: targetSets,
        unit: userUnit,
      },
      proposedPrescription: {
        weight: params.proposedWeight,
        reps: params.proposedReps,
        targetRpe,
        sets: targetSets,
        unit: userUnit,
        deltaWeight: params.deltaWeight,
        deltaReps: params.deltaReps,
      },
      headline: params.headline,
      explanation: params.explanation,
      evidenceAudit,
      status: 'pending',
    };
  };

  // ── RULE 0: Safety & Athlete Flags ──────────────────────────────────────────
  // A reported pain or discomfort flag locks progression unconditionally under SAFETY-01.
  // An athlete hold request maintains targets under HOLD-ATHLETE-REQUEST.
  // If both signals are true, the pain safety rule takes precedence and the audit record preserves both reasons.
  // These rules preempt all progression branches, approved equipment increments, and RPE overrides.
  // Explanations are non-diagnostic and do not claim unverified physiological causes.
  if (options?.athleteFlags?.reportsPain === true) {
    return buildRecord({
      actionCategory: 'review_required',
      ruleId: 'SAFETY-01',
      headline: 'Athlete Discomfort Reported — Progression Locked',
      explanation:
        'Discomfort or pain was reported for this movement. Target progression is locked. Consult a qualified professional if discomfort persists.',
      proposedWeight: targetWeight,
      proposedReps: targetReps,
      deltaWeight: 0,
      deltaReps: 0,
    });
  }

  if (options?.athleteFlags?.requestHold === true) {
    return buildRecord({
      actionCategory: 'hold_current_target',
      ruleId: 'HOLD-ATHLETE-REQUEST',
      headline: 'Athlete Requested Target Hold — Targets Maintained',
      explanation:
        'Athlete requested target hold. Maintaining current load and repetitions without progression.',
      proposedWeight: targetWeight,
      proposedReps: targetReps,
      deltaWeight: 0,
      deltaReps: 0,
    });
  }

  // ── RULE 1: Insufficient Evidence ───────────────────────────────────────────
  // Evaluates whether comparable prescribed exposures exist to establish an evidentiary baseline.
  const isInterruptedSession =
    latestComparableExp !== null &&
    latestComparableExp.totalPrescribedSets > 0 &&
    latestComparableExp.completedPrescribedSets === 0;

  const isInsufficient =
    !exerciseEvidence ||
    exerciseEvidence.totalExposures === 0 ||
    exerciseEvidence.comparablePrescribedExposures < 1 ||
    exposures.length === 0 ||
    !latestComparableExp ||
    (exerciseEvidence.usableRepComparisonsCount === 0 && !isInterruptedSession);

  if (isInsufficient) {
    const isManualOnly =
      exerciseEvidence &&
      exerciseEvidence.manualExposures > 0 &&
      exerciseEvidence.comparablePrescribedExposures === 0;

    return buildRecord({
      actionCategory: 'insufficient_evidence',
      ruleId: 'IE-01',
      headline: 'Calibration Required',
      explanation: isManualOnly
        ? 'Manual workout history recorded without prescribed targets. Complete 1–2 prescribed sessions to calibrate progression.'
        : 'No completed prescribed sessions recorded for this exercise. Complete 1–2 sessions at current target to calibrate progression.',
      proposedWeight: targetWeight,
      proposedReps: targetReps,
      deltaWeight: 0,
      deltaReps: 0,
      confidenceTierOverride: 'insufficient',
    });
  }

  // ── RULE 2: Review Required (Discrepancies / Incomplete Sessions) ────────────
  // Evaluates the latest relevant comparable exposure for immediate interruptions,
  // and the last 2 consecutive comparable exposures for persistent under-target performance.
  const hasSkippedSets = latestComparableExp.skippedPrescribedSets > 0;
  const zeroSetsCompleted =
    latestComparableExp.completedPrescribedSets === 0 &&
    latestComparableExp.totalPrescribedSets > 0;
  const severeStrainMiss =
    latestComparableExp.repOutcomes.below_target > 0 &&
    latestComparableExp.rpeOutcomes.above_target > 0;

  // Persistent under-target rule: genuinely evaluates the last 2 consecutive comparable exposures.
  // Chronological order must be proven before labeling exposures consecutive in time.
  const lastTwoComparable = comparableExposures.slice(-2);
  const persistentMiss =
    isOrderVerified &&
    lastTwoComparable.length === 2 &&
    lastTwoComparable.every((exp) => exp.repOutcomes.below_target > 0);

  if (
    lastTwoComparable.length === 2 &&
    !isOrderVerified &&
    lastTwoComparable.every((exp) => exp.repOutcomes.below_target > 0)
  ) {
    limitations.push('Consecutive under-target evaluation deferred: chronological order of exposures could not be verified due to missing or invalid dates.');
  }

  if (hasSkippedSets || zeroSetsCompleted || severeStrainMiss || persistentMiss) {
    let reasonText = 'Recent session diverged from planned targets.';
    if (hasSkippedSets) {
      reasonText = 'One or more planned sets were skipped in your previous session.';
    } else if (zeroSetsCompleted) {
      reasonText = 'Previous session was interrupted with zero completed sets.';
    } else if (severeStrainMiss) {
      reasonText = 'Reps landed below target while effort exceeded planned RPE.';
    } else if (persistentMiss) {
      reasonText = 'Repetitions landed below target across your last two consecutive exposures.';
    }

    return buildRecord({
      actionCategory: 'review_required',
      ruleId: 'REV-01',
      headline: 'Session Review Recommended',
      explanation: `${reasonText} Review targets before your next session. Current targets held.`,
      proposedWeight: targetWeight,
      proposedReps: targetReps,
      deltaWeight: 0,
      deltaReps: 0,
    });
  }

  // ── RULE 3: Hold Current Target (Effort Ceiling / Single Set Deficit) ─────────
  const effortCeilingExceeded =
    latestComparableExp.rpeOutcomes.above_target > 0 ||
    (latestComparableExp.averageRpeDelta !== null && latestComparableExp.averageRpeDelta > 0.5);

  const repsBelowTarget = latestComparableExp.repOutcomes.below_target > 0;

  if (effortCeilingExceeded || repsBelowTarget) {
    const holdExplanation = repsBelowTarget
      ? 'Target reps not fully achieved across all sets. Holding load to build repeatable consistency.'
      : 'Target reps completed, but effort felt heavier than planned. Holding load to consolidate bar control.';

    return buildRecord({
      actionCategory: 'hold_current_target',
      ruleId: 'HOLD-01',
      headline: 'Consolidate Current Load',
      explanation: holdExplanation,
      proposedWeight: targetWeight,
      proposedReps: targetReps,
      deltaWeight: 0,
      deltaReps: 0,
    });
  }

  // ── RULE 4: Candidate Progression (Rep vs Load) ─────────────────────────────
  // Pre-condition: All prescribed working sets completed on the latest comparable exposure,
  // zero below_target on reps, and effort within reserve (if RPE was logged).
  const allSetsCompletedCleanly =
    latestComparableExp.completedPrescribedSets === latestComparableExp.totalPrescribedSets &&
    latestComparableExp.totalPrescribedSets > 0 &&
    latestComparableExp.repOutcomes.below_target === 0 &&
    (latestComparableExp.averageRpeDelta === null || latestComparableExp.averageRpeDelta <= 0);

  if (allSetsCompletedCleanly) {
    const atOrAboveRepCeiling = targetReps >= repRange.max;

    if (atOrAboveRepCeiling) {
      // 4A: Check RPE reserve verification
      // Rep completion alone does NOT prove effort reserve (RIR/RPE).
      // Advancing external load requires verified reserve unless an explicit,
      // narrowly scoped override with athlete confirmation is provided.
      const hasRecordedRpe = latestComparableExp.usableRpeComparisonsCount > 0;

      let isRpeOverrideValid = false;
      if (options?.rpeOverride) {
        const targetMatch =
          !options.rpeOverride.targetExercise ||
          canonicalizeExerciseName(options.rpeOverride.targetExercise) === canonicalKey;
        if (targetMatch && options.rpeOverride.athleteConfirmedReserve === true) {
          isRpeOverrideValid = true;
        }
      } else if (options?.allowLoadProgressionWithoutRpe === true) {
        // Legacy flag: allowed for non-compound exercises only.
        // For main compound lifts, unrestricted load progression without effort data is rejected.
        const isCompound = isMainCompoundLift(exerciseName);
        if (!isCompound) {
          isRpeOverrideValid = true;
        } else {
          limitations.push(
            `Unscoped RPE override ignored for main compound lift ${exerciseName}. Explicit athlete confirmation of reserve is required.`
          );
        }
      }

      if (!hasRecordedRpe && !isRpeOverrideValid) {
        return buildRecord({
          actionCategory: 'hold_current_target',
          ruleId: 'HOLD-RPE-UNRECORDED',
          headline: 'Rep Ceiling Met — Log Effort (RPE) to Advance Load',
          explanation: `Upper target ceiling of ${repRange.max} reps completed across all sets. Effort (RPE) was not recorded to verify reserve. Holding load to consolidate performance; log effort next session to confirm readiness for load progression.`,
          proposedWeight: targetWeight,
          proposedReps: targetReps,
          deltaWeight: 0,
          deltaReps: 0,
        });
      }

      // 4B: Resolve load increment
      const incrementRes = resolveLoadIncrement(exerciseName, targetWeight, userUnit, options);

      if (incrementRes.status !== 'valid' || incrementRes.increment === null) {
        return buildRecord({
          actionCategory: 'review_required',
          ruleId: 'REV-INCREMENT',
          headline: 'Load Progression Review — Increment Calibration Needed',
          explanation:
            incrementRes.reason ??
            `No validated equipment load increment configured for ${exerciseName}. Review increment before advancing load.`,
          proposedWeight: targetWeight,
          proposedReps: targetReps,
          deltaWeight: 0,
          deltaReps: 0,
        });
      }

      const nextWeight = targetWeight + incrementRes.increment;
      const nextReps = repRange.min;
      const deltaReps = repRange.min - targetReps;

      const loadExplanation =
        repRange.min === repRange.max
          ? `Target reps (${repRange.max}) completed with verified reserve. Candidate progression: advance load by +${incrementRes.increment} ${userUnit}.`
          : `Upper target ceiling of ${repRange.max} reps completed with verified reserve. Candidate progression: advance load by +${incrementRes.increment} ${userUnit} and reset reps to ${repRange.min}.`;

      return buildRecord({
        actionCategory: 'candidate_load_progression',
        ruleId: 'LOAD-PROG-01',
        headline: `Progressive Overload Prescribed (+${incrementRes.increment} ${userUnit})`,
        explanation: loadExplanation,
        proposedWeight: nextWeight,
        proposedReps: nextReps,
        deltaWeight: incrementRes.increment,
        deltaReps,
      });
    } else {
      // 4C: Candidate Rep Progression within rep bracket (safe to suggest from rep completion alone)
      const nextReps = targetReps + 1;

      return buildRecord({
        actionCategory: 'candidate_rep_progression',
        ruleId: 'REP-PROG-01',
        headline: `Target +1 Rep (${targetReps} → ${nextReps})`,
        explanation: `All working sets completed at target effort. Advance volume by targeting ${nextReps} reps at current load of ${targetWeight} ${userUnit}.`,
        proposedWeight: targetWeight,
        proposedReps: nextReps,
        deltaWeight: 0,
        deltaReps: 1,
      });
    }
  }

  // Fallback default: Hold current targets safely
  return buildRecord({
    actionCategory: 'hold_current_target',
    ruleId: 'HOLD-FALLBACK',
    headline: 'Maintain Target',
    explanation: 'Maintaining current target load and repetitions.',
    proposedWeight: targetWeight,
    proposedReps: targetReps,
    deltaWeight: 0,
    deltaReps: 0,
  });
}

/**
 * Validates whether an accepted Policy v0 decision can be safely and deterministically applied
 * to a selected future workout plan template.
 */
export function validatePolicyDecisionApplication(
  decision: TrainingDecisionRecord,
  plan: PlannedWorkout,
  exerciseIndex?: number,
  exerciseId?: string,
  existingApplications?: PolicyDecisionApplicationAudit[]
): ValidateApplicationResult {
  if (!decision) {
    return {
      valid: false,
      error: 'invalid_decision',
      message: 'Decision record is missing or invalid.',
    };
  }

  // 1. Status requirements: Only accepted decisions are eligible for application
  if (decision.status === 'pending') {
    return {
      valid: false,
      error: 'decision_not_accepted',
      message: 'Cannot apply a pending recommendation. The athlete must accept the recommendation before applying it to future prescriptions.',
    };
  }

  if (decision.status === 'overridden') {
    return {
      valid: false,
      error: 'decision_overridden',
      message: 'Cannot automatically apply system proposed targets for an overridden decision.',
    };
  }

  if (decision.status === 'dismissed') {
    return {
      valid: false,
      error: 'decision_dismissed',
      message: 'Dismissed decisions cannot be applied to future prescriptions.',
    };
  }

  if (decision.status !== 'accepted') {
    return {
      valid: false,
      error: 'invalid_status',
      message: `Decisions with status '${decision.status}' cannot be applied.`,
    };
  }

  // 2. Safety and review locks
  if (decision.ruleId === 'SAFETY-01') {
    return {
      valid: false,
      error: 'safety_locked',
      message: 'Cannot apply recommendations under active pain safety lock (SAFETY-01).',
    };
  }

  if (decision.ruleId === 'HOLD-ATHLETE-REQUEST') {
    return {
      valid: false,
      error: 'athlete_hold_requested',
      message: 'Cannot apply recommendations under active athlete hold request.',
    };
  }

  if (decision.ruleId === 'REV-INCREMENT') {
    return {
      valid: false,
      error: 'unresolved_increment',
      message: 'Cannot apply recommendation with unconfigured or unapproved load increment.',
    };
  }

  if (decision.ruleId === 'HOLD-RPE-UNRECORDED') {
    return {
      valid: false,
      error: 'rpe_unrecorded',
      message: 'Cannot apply progression recommendation when effort was unrecorded and no RPE override was authorized.',
    };
  }

  if (decision.actionCategory === 'review_required') {
    return {
      valid: false,
      error: 'review_required',
      message: 'Recommendations requiring review cannot be applied until explicitly resolved.',
    };
  }

  if (decision.actionCategory === 'insufficient_evidence') {
    return {
      valid: false,
      error: 'insufficient_evidence',
      message: 'Recommendations with insufficient evidence cannot be applied.',
    };
  }

  // 2b. External load increment provenance and rule validation
  if (decision.actionCategory === 'candidate_load_progression') {
    if (decision.ruleId !== 'LOAD-PROG-01') {
      return {
        valid: false,
        error: 'unresolved_increment',
        message: 'External load progression requires verified rule approval (LOAD-PROG-01).',
      };
    }
    if (
      decision.evidenceAudit?.limitations?.some(
        (l) =>
          l.toLowerCase().includes('unconfigured') ||
          l.toLowerCase().includes('unverified increment')
      )
    ) {
      return {
        valid: false,
        error: 'unresolved_increment',
        message: 'Cannot apply recommendation with unconfigured or unapproved load increment.',
      };
    }
  }

  // 2c. Single-target application guard (Plan-level check):
  // Check decision metadata and application audit ledger records.
  // Validate that any audit record matches this decision's canonical exercise.
  const canonicalDecisionKey = canonicalizeExerciseName(decision.exerciseName);
  const priorAudit = existingApplications?.find(
    (a) =>
      a.decisionId === decision.id &&
      a.status === 'applied' &&
      canonicalizeExerciseName(a.targetExerciseName) === canonicalDecisionKey
  );
  const isPreviouslyApplied = Boolean(
    decision.appliedAt ||
    decision.appliedTargetPlanId ||
    priorAudit
  );
  const priorPlanId = decision.appliedTargetPlanId ?? priorAudit?.targetPlanId;
  const priorPlanName = decision.appliedTargetPlanName ?? priorAudit?.targetPlanName ?? priorPlanId;

  if (isPreviouslyApplied && priorPlanId && plan && priorPlanId !== plan.id) {
    return {
      valid: false,
      error: 'already_applied_to_other_target',
      message: `This recommendation has already been applied to workout plan template '${priorPlanName}'. A decision cannot be applied to multiple distinct plan templates.`,
    };
  }

  // 3. Proposed prescription validity
  if (!decision.proposedPrescription) {
    return {
      valid: false,
      error: 'missing_proposed_prescription',
      message: 'Decision record contains no proposed prescription targets.',
    };
  }

  const { weight: propWeight, reps: propReps, deltaWeight, deltaReps } = decision.proposedPrescription;
  if (!Number.isFinite(propWeight) || propWeight < 0 || !Number.isFinite(propReps) || propReps <= 0) {
    return {
      valid: false,
      error: 'invalid_proposed_values',
      message: 'Proposed prescription values are non-finite or negative.',
    };
  }

  if (deltaWeight < 0 || (deltaWeight === 0 && deltaReps < 0)) {
    return {
      valid: false,
      error: 'invalid_progression_delta',
      message: 'Progression deltas cannot regress load or volume without explicit deload authorization.',
    };
  }

  // 4. Target plan validity
  if (!plan || !Array.isArray(plan.exercises) || plan.exercises.length === 0) {
    return {
      valid: false,
      error: 'empty_plan',
      message: 'Selected workout plan contains no exercises.',
    };
  }

  // 5. Target exercise resolution
  let resolvedIndex: number = -1;

  if (exerciseId) {
    resolvedIndex = plan.exercises.findIndex((e) => e.id === exerciseId);
    if (resolvedIndex === -1) {
      return {
        valid: false,
        error: 'exercise_not_found',
        message: `Exercise with ID '${exerciseId}' not found in the selected plan.`,
      };
    }
    const ex = plan.exercises[resolvedIndex];
    if (canonicalizeExerciseName(ex.name) !== canonicalDecisionKey) {
      return {
        valid: false,
        error: 'exercise_mismatch',
        message: `Selected exercise '${ex.name}' does not match decision exercise '${decision.exerciseName}'.`,
      };
    }
  } else if (exerciseIndex !== undefined) {
    if (exerciseIndex < 0 || exerciseIndex >= plan.exercises.length) {
      return {
        valid: false,
        error: 'invalid_exercise_index',
        message: `Exercise index ${exerciseIndex} is out of bounds for the selected plan.`,
      };
    }
    const ex = plan.exercises[exerciseIndex];
    if (canonicalizeExerciseName(ex.name) !== canonicalDecisionKey) {
      return {
        valid: false,
        error: 'exercise_mismatch',
        message: `Exercise at index ${exerciseIndex} ('${ex.name}') does not match decision exercise '${decision.exerciseName}'.`,
      };
    }
    resolvedIndex = exerciseIndex;
  } else {
    // Find all matching exercises in the plan by canonical name
    const matches: number[] = [];
    plan.exercises.forEach((e, idx) => {
      if (canonicalizeExerciseName(e.name) === canonicalDecisionKey) {
        matches.push(idx);
      }
    });

    if (matches.length === 0) {
      return {
        valid: false,
        error: 'exercise_not_found',
        message: `No exercise matching '${decision.exerciseName}' found in workout plan '${plan.name}'.`,
      };
    }

    if (matches.length > 1) {
      return {
        valid: false,
        error: 'ambiguous_target',
        message: `Multiple exercises matching '${decision.exerciseName}' found in workout plan '${plan.name}'. An explicit exercise index or ID must be specified.`,
      };
    }

    resolvedIndex = matches[0];
  }

  const targetEx = plan.exercises[resolvedIndex];

  // 5b. Single-target application guard (Exercise-level check within the same plan):
  // A policy decision may be applied to exactly one target, identified by:
  // - Decision ID
  // - Target plan/template ID
  // - Stable exercise ID when available
  // - Exercise index as a fallback when stable IDs are unavailable
  const priorExerciseId = decision.appliedTargetExerciseId ?? priorAudit?.targetExerciseId;
  const priorExerciseIndex = decision.appliedTargetExerciseIndex ?? priorAudit?.targetExerciseIndex;
  const priorExerciseName = decision.appliedTargetExerciseName ?? priorAudit?.targetExerciseName;

  if (isPreviouslyApplied && priorPlanId === plan.id) {
    // If stable exercise IDs exist on both prior application and target exercise, compare IDs:
    if (priorExerciseId !== undefined && targetEx.id !== undefined) {
      if (targetEx.id !== priorExerciseId) {
        return {
          valid: false,
          error: 'already_applied_to_other_target',
          message: `This recommendation has already been applied to exercise '${priorExerciseName || 'exercise'}' (ID: ${priorExerciseId}) in workout plan template '${plan.name}'. A decision cannot be applied to a different exercise target or instance in the same plan.`,
        };
      }
    } else if (
      priorExerciseIndex !== undefined &&
      priorExerciseIndex !== resolvedIndex &&
      !(priorExerciseId !== undefined && targetEx.id !== undefined && targetEx.id === priorExerciseId)
    ) {
      // Fallback: If stable exercise IDs are not both available, compare exercise index:
      return {
        valid: false,
        error: 'already_applied_to_other_target',
        message: `This recommendation has already been applied to exercise instance at index ${priorExerciseIndex} ('${priorExerciseName || 'exercise'}') in workout plan template '${plan.name}'. A decision cannot be applied to a second instance or different exercise target in the same plan.`,
      };
    }
  }

  // 6. Idempotency vs Coincidence:
  // Genuine idempotent re-application requires that THIS decision was actually recorded
  // as applied to THIS EXACT target (plan ID and exercise ID / index),
  // AND that the target plan prescription still matches the proposed prescription.
  const isRecordedAppliedToThisTarget =
    isPreviouslyApplied &&
    priorPlanId === plan.id &&
    (priorExerciseId !== undefined && targetEx.id !== undefined
      ? targetEx.id === priorExerciseId
      : priorExerciseIndex !== undefined
      ? priorExerciseIndex === resolvedIndex
      : Boolean(
          decision.appliedTargetExerciseName &&
          canonicalizeExerciseName(decision.appliedTargetExerciseName) === canonicalDecisionKey
        ));

  const isWeightMatchingProposed =
    targetEx.targetWeight !== undefined &&
    targetEx.targetWeight === propWeight;
  const isRepsMatchingProposed =
    targetEx.targetReps !== undefined &&
    targetEx.targetReps === propReps;
  const isUnitMatchingProposed =
    !targetEx.targetUnit ||
    !decision.proposedPrescription.unit ||
    targetEx.targetUnit === decision.proposedPrescription.unit;
  const isSetsMatchingProposed =
    decision.proposedPrescription.sets === undefined ||
    targetEx.targetSets === undefined ||
    targetEx.targetSets === decision.proposedPrescription.sets;
  const isRpeMatchingProposed =
    decision.proposedPrescription.targetRpe === undefined ||
    targetEx.targetRpe === undefined ||
    targetEx.targetRpe === decision.proposedPrescription.targetRpe;

  if (
    isRecordedAppliedToThisTarget &&
    isWeightMatchingProposed &&
    isRepsMatchingProposed &&
    isUnitMatchingProposed &&
    isSetsMatchingProposed &&
    isRpeMatchingProposed
  ) {
    return {
      valid: true,
      alreadyApplied: true,
      targetExerciseIndex: resolvedIndex,
      targetExercise: targetEx,
      message: `Decision targets (${propWeight} ${decision.proposedPrescription.unit} × ${propReps} reps) are already applied to this workout plan template.`,
    };
  }

  // 7. Unit Consistency Check
  if (
    targetEx.targetUnit &&
    decision.currentPrescription.unit &&
    targetEx.targetUnit !== decision.currentPrescription.unit
  ) {
    return {
      valid: false,
      error: 'unit_mismatch',
      message: `Workout plan unit (${targetEx.targetUnit}) does not match decision prescription unit (${decision.currentPrescription.unit}).`,
    };
  }

  // 8. Stale Target Protection across all prescription fields:
  // Reject application if target load, reps, sets, RPE, or unit have drifted from decision baseline.
  if (
    decision.currentPrescription.weight !== undefined &&
    targetEx.targetWeight !== undefined &&
    targetEx.targetWeight !== decision.currentPrescription.weight
  ) {
    return {
      valid: false,
      error: 'stale_prescription',
      message: `stale_prescription: target load drifted from baseline ${decision.currentPrescription.weight} ${decision.currentPrescription.unit} to ${targetEx.targetWeight} ${targetEx.targetUnit || 'kg'}. Cannot apply stale recommendation.`,
    };
  }

  if (
    decision.currentPrescription.reps !== undefined &&
    targetEx.targetReps !== undefined &&
    targetEx.targetReps !== decision.currentPrescription.reps
  ) {
    return {
      valid: false,
      error: 'stale_prescription',
      message: `stale_prescription: target reps drifted from baseline ${decision.currentPrescription.reps} reps to ${targetEx.targetReps} reps. Cannot apply stale recommendation.`,
    };
  }

  if (
    decision.currentPrescription.sets !== undefined &&
    targetEx.targetSets !== undefined &&
    targetEx.targetSets !== decision.currentPrescription.sets
  ) {
    return {
      valid: false,
      error: 'stale_prescription',
      message: `stale_prescription: target sets drifted from baseline ${decision.currentPrescription.sets} sets to ${targetEx.targetSets} sets. Cannot apply stale recommendation.`,
    };
  }

  if (
    decision.currentPrescription.targetRpe !== undefined &&
    targetEx.targetRpe !== undefined &&
    targetEx.targetRpe !== decision.currentPrescription.targetRpe
  ) {
    return {
      valid: false,
      error: 'stale_prescription',
      message: `stale_prescription: target RPE drifted from baseline RPE ${decision.currentPrescription.targetRpe} to RPE ${targetEx.targetRpe}. Cannot apply stale recommendation.`,
    };
  }

  if (
    decision.currentPrescription.unit !== undefined &&
    targetEx.targetUnit !== undefined &&
    targetEx.targetUnit !== decision.currentPrescription.unit
  ) {
    return {
      valid: false,
      error: 'stale_prescription',
      message: `stale_prescription: target unit drifted from baseline ${decision.currentPrescription.unit} to ${targetEx.targetUnit}. Cannot apply stale recommendation.`,
    };
  }

  return {
    valid: true,
    targetExerciseIndex: resolvedIndex,
    targetExercise: targetEx,
    message: 'Valid for application.',
  };
}
