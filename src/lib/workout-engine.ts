import {
  WorkoutEntry,
  WorkoutExercise,
  WorkoutSet,
  SetExecutionStatus,
  PlannedWorkout,
  PlannedExercise,
  AthleteGoal,
  ATHLETE_GOAL_CONFIGS,
  Unit,
  WeeklySchedule,
  PersonalRecord,
  TrainingDecision,
  PolicyDecisionApplicationAudit,
  ActiveWorkoutDraft,
  getSetExecutionStatus,
  isSetCompleted,
  isActiveSetCompleted,
  UserMode,
} from './types';
import { getEquipmentType, isMainCompoundLift, calculateOneRepMax, suggestLoad, isBodyweightExercise } from './strength-standards';
import { getTodayDayOfWeek, getWorkoutBodyParts } from './workout-schedule';
import { calculateSetEffortDrift } from './lifter-twin';
import { canonicalizeExerciseName } from './workout-outcome-evidence';

export {
  getSetExecutionStatus,
  isSetCompleted,
  isActiveSetCompleted,
};
export type { SetExecutionStatus } from './types';

/**
 * Finalizes a single set for persistence in a completed or interrupted workout record.
 *
 * Rules:
 * - If set is active-completed and reps > 0: status is 'completed', completed is true.
 * - Else if status was 'skipped': status is 'skipped', completed is false.
 * - Else: status is 'not_attempted', completed is false.
 * - Preserves all prescription fields (prescribedWeight, prescribedReps, prescribedRpe, prescribedUnit).
 */
export function finalizeWorkoutSet(set: WorkoutSet): WorkoutSet {
  const hasValidNumericWeight = typeof set.weight === 'number' && !isNaN(set.weight);
  let w: number | undefined = undefined;
  if (hasValidNumericWeight) {
    w = set.weight;
  } else if (typeof set.weight === 'string' && (set.weight as string).trim() !== '') {
    const parsed = parseFloat(set.weight as string);
    if (!isNaN(parsed)) {
      w = parsed;
    }
  }
  const r = parseInt(String(set.reps), 10) || 0;
  const isCompleted = isActiveSetCompleted(set) && r > 0;

  let finalStatus: SetExecutionStatus;
  if (isCompleted) {
    finalStatus = 'completed';
  } else if (set.status === 'skipped') {
    finalStatus = 'skipped';
  } else {
    finalStatus = 'not_attempted';
  }

  return {
    ...set,
    weight: w,
    reps: r,
    completed: isCompleted,
    status: finalStatus,
  };
}

/**
 * Checks whether a set contains meaningful data that should be preserved in workout history.
 * Meaningful data includes:
 * - Completed sets
 * - Explicitly skipped sets
 * - Prescribed sets (even if unattempted, preserving the athlete's target)
 * - Sets with positive reps
 *
 * Blank/empty placeholder rows (no prescription, not skipped, not completed, 0 reps)
 * are discarded to prevent phantom sets.
 */
export function shouldPreserveWorkoutSet(set: WorkoutSet): boolean {
  const hasPrescription = set.prescribedWeight !== undefined || set.prescribedReps !== undefined;
  return set.completed || set.status === 'skipped' || hasPrescription || (set.reps > 0);
}

export interface NextSessionTargetInput {
  weight?: number;
  reps: number;
  rpe?: number;
  unit?: Unit;
}

export interface NextSessionTarget {
  exerciseName: string;
  weight: number;
  reps: number;
  sets: number;
  unit: Unit;
  /** e.g. "Bench Press: 42.5kg × 8 next session" */
  summaryText: string;
  /** Why, including the RPE reasoning behind the directive. */
  rationale: string;
  directive: 'progress_load' | 'add_rep' | 'hold';
}

/**
 * THE single function that computes a next-session target for an exercise.
 * Both the Training Adaptation Summary and the Coach's Take read from this,
 * so the two surfaces can never contradict each other again.
 *
 * RPE-aware rules (conservative):
 * - avg RPE ≥ 9 → HOLD the load and consolidate (never add load after grinding).
 * - avg RPE ≤ 7 across all sets → PROGRESS the load (small overload step).
 * - otherwise (or no RPE logged) → ADD A REP at the same load (double progression).
 */
export function getNextSessionTarget(
  exerciseName: string,
  completedSets: NextSessionTargetInput[],
  userUnit: Unit = 'kg'
): NextSessionTarget | null {
  const done = (completedSets || []).filter((s) => s.reps > 0);
  if (done.length === 0) return null;

  const step = userUnit === 'lbs' ? 5 : 2.5;
  const maxW = Math.max(...done.map((s) => (typeof s.weight === 'number' && !isNaN(s.weight) ? s.weight : 0)));
  const topReps = Math.max(...done.map((s) => s.reps));
  const rpes = done.map((s) => s.rpe).filter((r): r is number => typeof r === 'number' && !isNaN(r));
  const avgRpe = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : undefined;
  const rpeStr = avgRpe !== undefined ? `avg RPE ${Math.round(avgRpe * 10) / 10}` : null;

  const base = {
    exerciseName,
    sets: done.length,
    unit: userUnit,
  };

  if (avgRpe !== undefined && avgRpe >= 9) {
    return {
      ...base,
      weight: maxW,
      reps: topReps,
      directive: 'hold',
      summaryText: `${exerciseName}: hold ${maxW}${userUnit} × ${topReps} next session`,
      rationale: `${rpeStr} — hard session. Hold the load and consolidate before progressing.`,
    };
  }

  if (avgRpe !== undefined && avgRpe <= 7) {
    const nextW = Math.round((maxW + step) * 10) / 10;
    return {
      ...base,
      weight: nextW,
      reps: topReps,
      directive: 'progress_load',
      summaryText: `${exerciseName}: ${nextW}${userUnit} × ${topReps} next session`,
      rationale: `${rpeStr} — moved with reserve. Small overload step (+${step}${userUnit}).`,
    };
  }

  return {
    ...base,
    weight: maxW,
    reps: topReps + 1,
    directive: 'add_rep',
    summaryText: `${exerciseName}: ${maxW}${userUnit} × ${topReps + 1} next session`,
    rationale: rpeStr
      ? `${rpeStr} — solid work. Add a rep before adding load.`
      : 'Solid work. Add a rep before adding load.',
  };
}

/**
 * Keeps only sets the athlete actually performed (completed) or explicitly
 * skipped, dropping unattempted planned sets. Every workout save path must
 * use this so History records what was done — never the full plan.
 * Skipped sets are preserved with their status so the record stays honest
 * about what was attempted.
 */
export function getExecutedExercises(exercises: WorkoutExercise[]): WorkoutExercise[] {
  return (exercises || [])
    .map((ex) => ({
      ...ex,
      sets: (ex.sets || []).filter((s) => isSetCompleted(s) || s.status === 'skipped'),
    }))
    .filter((ex) => ex.sets.length > 0);
}

/**
 * Pure finalization engine for an entire workout session.
 * Used by ActiveWorkoutScreen, WorkoutPage, and automated verification.
 *
 * Takes raw exercise entries, sanitizes exercise names, finalizes sets to their execution
 * status ('completed', 'skipped', 'not_attempted'), preserves prescriptions, and filters
 * out empty placeholder sets and empty exercise blocks.
 *
 * Returns:
 * - `validExercises`: array of finalized exercises with preserved sets.
 * - `hasCompletedSets`: boolean indicating whether at least one set was completed.
 * - `hasMeaningfulData`: boolean indicating whether validExercises contains any preserved sets.
 */
export function finalizeWorkoutExercises(exercises: WorkoutExercise[]): {
  validExercises: WorkoutExercise[];
  hasCompletedSets: boolean;
  hasMeaningfulData: boolean;
} {
  const validExercises = (exercises || [])
    .map((e, idx) => {
      const cleanName = e.name && e.name.trim().length > 0 ? e.name.trim() : `Exercise ${idx + 1}`;
      const finalizedSets = (e.sets || [])
        .map(finalizeWorkoutSet)
        .filter(shouldPreserveWorkoutSet);

      return {
        ...e,
        name: cleanName,
        sets: finalizedSets,
        notes: e.notes,
      };
    })
    .filter((e) => e.name.length > 0 && e.sets.length > 0);

  const hasCompletedSets = validExercises.some((e) => e.sets.some(isSetCompleted));
  const hasMeaningfulData = validExercises.length > 0;

  return {
    validExercises,
    hasCompletedSets,
    hasMeaningfulData,
  };
}

export interface CreateWorkoutExercisesFromPlanOptions {
  userUnit?: Unit;
  userPrs?: PersonalRecord[];
  applications?: PolicyDecisionApplicationAudit[];
}

export interface CreateWorkoutDraftFromPlanOptions extends CreateWorkoutExercisesFromPlanOptions {
  date?: string;
  sessionStartTime?: number;
}

/**
 * Canonical plan-to-workout mapper:
 * Accurately translates a PlannedWorkout template into live workout exercises.
 *
 * Rules:
 * - Preserves targetWeight, targetReps, targetSets, targetRpe, and targetUnit from the template.
 * - Handles bodyweight exercises (targetWeight === 0) cleanly without coercing to heavy barbell loads.
 * - Unconfigured non-bodyweight targets remain strictly unconfigured (prescribedWeight: undefined);
 *   never fabricates an assumed prescription or PR-derived fallback load.
 * - Attaches appliedDecisionId to exercises and sets ONLY when an authentic, unambiguous
 *   PolicyDecisionApplication audit exists for this specific plan and target exercise.
 * - If identity is ambiguous (e.g. duplicate exercise instances without stable IDs), fails closed.
 */
export function createWorkoutExercisesFromPlan(
  plan: PlannedWorkout,
  options?: CreateWorkoutExercisesFromPlanOptions
): WorkoutExercise[] {
  const userUnit = options?.userUnit || 'kg';
  const applications = options?.applications || [];

  return (plan.exercises || []).map((pe, idx) => {
    const isBW = isBodyweightExercise(pe.name);
    const hasConfiguredWeight = typeof pe.targetWeight === 'number';
    const hasConfiguredRpe = typeof pe.targetRpe === 'number';

    // Target load:
    // Configured weight -> exact number
    // Bodyweight unconfigured -> 0 kg/lbs external load
    // Non-bodyweight unconfigured -> undefined (absent numeric load; NEVER fabricated)
    const assignedWeight: number | undefined = hasConfiguredWeight
      ? (pe.targetWeight as number)
      : (isBW ? 0 : undefined);

    const targetUnit = pe.targetUnit ?? userUnit;

    const prescribedWeight: number | undefined = hasConfiguredWeight
      ? (pe.targetWeight as number)
      : (isBW ? 0 : undefined);

    const prescribedReps: number | undefined =
      typeof pe.targetReps === 'number' ? pe.targetReps : undefined;

    const prescribedRpe: number | undefined = hasConfiguredRpe
      ? (pe.targetRpe as number)
      : undefined;

    const prescribedUnit: Unit | undefined =
      (hasConfiguredWeight || isBW) ? targetUnit : undefined;

    // Lineage verification:
    // Match against authentic application audits for this specific plan and target exercise.
    const candidateAudits = applications.filter(
      (a) =>
        a.targetPlanId === plan.id &&
        a.status === 'applied' &&
        canonicalizeExerciseName(a.targetExerciseName) === canonicalizeExerciseName(pe.name)
    );

    const sameNameExercisesInPlan = (plan.exercises || []).filter(
      (e) => canonicalizeExerciseName(e.name) === canonicalizeExerciseName(pe.name)
    );
    const isNameDuplicateInPlan = sameNameExercisesInPlan.length > 1;

    let matchingAudit: PolicyDecisionApplicationAudit | undefined = undefined;

    for (const a of candidateAudits) {
      if (a.targetExerciseId) {
        // Audit specifically targeted a stable exercise ID
        if (pe.id && pe.id === a.targetExerciseId) {
          matchingAudit = a;
          break;
        }
        // If pe.id does not match or is missing, this audit was for a different exercise instance
      } else {
        // Fallback: audit has no targetExerciseId (index-based)
        if (a.targetExerciseIndex !== undefined) {
          if (a.targetExerciseIndex === idx) {
            matchingAudit = a;
            break;
          }
        } else {
          // Both targetExerciseId and targetExerciseIndex are missing from audit:
          // If the plan has duplicate exercises with this name, identity is ambiguous -> fail closed!
          if (!isNameDuplicateInPlan) {
            matchingAudit = a;
            break;
          }
        }
      }
    }

    // Only attach appliedDecisionId if:
    // 1. A valid matching audit was unambiguously resolved
    // 2. The exercise actually has a configured prescription (configured weight or bodyweight)
    const appliedDecisionId = (matchingAudit && (hasConfiguredWeight || isBW))
      ? matchingAudit.decisionId
      : undefined;

    return {
      name: pe.name,
      planExerciseId: pe.id,
      appliedDecisionId,
      sets: Array.from({ length: Math.max(1, pe.targetSets || 1) }, () => ({
        weight: assignedWeight,
        reps: pe.targetReps ?? 8,
        unit: targetUnit,
        rpe: hasConfiguredRpe ? (pe.targetRpe as number) : 8,
        completed: false,
        status: 'pending' as const,
        prescribedWeight,
        prescribedReps,
        prescribedRpe,
        prescribedUnit,
        appliedDecisionId,
      })),
    };
  });
}

/**
 * Creates an ActiveWorkoutDraft from a PlannedWorkout template.
 */
export function createWorkoutDraftFromPlan(
  plan: PlannedWorkout,
  options?: CreateWorkoutDraftFromPlanOptions
): ActiveWorkoutDraft {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const exercises = createWorkoutExercisesFromPlan(plan, options);

  return {
    date: options?.date || todayStr,
    name: plan.name,
    planId: plan.id,
    exercises,
    startedFromPlan: plan.name,
    startedFromPlanId: plan.id,
    sessionStartTime: options?.sessionStartTime || Date.now(),
    savedAt: new Date().toISOString(),
  };
}

/**
 * Finds the most recent performance of a given exercise across past workouts.
 */
export function getLastExercisePerformance(
  exerciseName: string,
  workouts: WorkoutEntry[],
  userUnit: Unit = 'kg'
): {
  date: string;
  sets: WorkoutSet[];
  summary: string;
  bestWeight: number;
  bestReps: number;
  bestE1RM: number;
} | null {
  if (!exerciseName || !workouts || workouts.length === 0) return null;

  const targetLower = exerciseName.trim().toLowerCase();

  // Search through workouts sorted newest first by date
  const sortedWorkouts = [...workouts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  for (const w of sortedWorkouts) {
    const match = w.exercises.find((e) => {
      const n = e.name.trim().toLowerCase();
      return n === targetLower || n.includes(targetLower) || targetLower.includes(n);
    });
    if (match && match.sets.length > 0) {
      const validSets = match.sets
        .filter((s) => s.reps > 0 && isSetCompleted(s))
        .map((s) => {
          let normalizedWeight = s.weight;
          if (typeof s.weight === 'number' && !isNaN(s.weight) && s.unit && s.unit !== userUnit) {
            if (userUnit === 'lbs' && s.unit === 'kg') {
              normalizedWeight = Math.round(s.weight * 2.20462 * 10) / 10;
            } else if (userUnit === 'kg' && s.unit === 'lbs') {
              normalizedWeight = Math.round(s.weight * 0.453592 * 10) / 10;
            }
          }
          return {
            ...s,
            weight: normalizedWeight,
            unit: userUnit,
          };
        });

      if (validSets.length === 0) continue;

      const isBW = isBodyweightExercise(exerciseName);
      const summary = validSets.map((s) => {
        if (typeof s.weight === 'number' && Number.isFinite(s.weight)) {
          if (isBW && s.weight === 0) {
            return `BW × ${s.reps}`;
          } else if (isBW && s.weight > 0) {
            return `+${s.weight}${userUnit} × ${s.reps}`;
          }
          return `${s.weight}${userUnit} × ${s.reps}`;
        }
        if (isBW) {
          return `BW × ${s.reps}`;
        }
        return `— × ${s.reps}`;
      }).join(', ');

      let bestWeight = 0;
      let bestReps = 0;
      let bestE1RM = 0;

      for (const s of validSets) {
        if (typeof s.weight === 'number' && Number.isFinite(s.weight)) {
          const wVal = s.weight;
          const e1rm = calculateOneRepMax(wVal, s.reps);
          if (e1rm > bestE1RM || (e1rm === bestE1RM && s.reps > bestReps)) {
            bestE1RM = e1rm;
            bestWeight = wVal;
            bestReps = s.reps;
          }
        } else {
          if (s.reps > bestReps) {
            bestReps = s.reps;
          }
        }
      }

      return {
        date: w.date,
        sets: validSets,
        summary,
        bestWeight,
        bestReps,
        bestE1RM: Math.round(bestE1RM * 10) / 10,
      };
    }
  }

  return null;
}

export interface ExercisePrescription {
  exerciseName: string;
  targetWeight: number;
  targetReps: number;
  targetRpe: number;
  targetSets: number;
  repRange: { min: number; max: number };
  progressionModel: 'double_progression' | 'rpe_autoregulated' | 'conditioning_interval' | 'linear_step';
  whyThisWeight: string;
  nextSessionRule: string;
  lastPerformance?: {
    date: string;
    weight: number;
    reps: number;
    rpe?: number;
    summary: string;
  } | null;
}

/**
 * Deterministic Prescription Engine ("Why this weight?").
 * Single source of truth for target load, rep ranges, progression model,
 * and auditable training rationale across Home, Train, and Active Workout.
 */
export function getExercisePrescription(
  exerciseName: string,
  workouts: WorkoutEntry[],
  prs: PersonalRecord[] = [],
  userUnit: Unit = 'kg',
  goal: AthleteGoal = 'build_muscle',
  trainingDecisions?: Record<string, TrainingDecision>
): ExercisePrescription {
  const goalConfig = ATHLETE_GOAL_CONFIGS[goal] || ATHLETE_GOAL_CONFIGS.build_muscle;
  const isStrength = goal === 'get_stronger';
  const isStamina = goal === 'stamina';
  const isHypertrophy = goal === 'build_muscle';
  const isFatLoss = goal === 'lose_fat';

  const defaultSets = isStrength ? 4 : isHypertrophy ? 4 : 3;
  const repRange = isStrength
    ? { min: 3, max: 6 }
    : isStamina
    ? { min: 12, max: 15 }
    : isFatLoss
    ? { min: 6, max: 10 }
    : { min: 8, max: 12 };

  const targetRpe = isStrength ? 8.5 : isHypertrophy ? 8.0 : isFatLoss ? 7.5 : 7.5;
  const defaultTargetReps = Math.round((repRange.min + repRange.max) / 2);

  const cleanName = exerciseName.trim();
  const lowerName = cleanName.toLowerCase();

  // Check if conditioning
  const isConditioning =
    lowerName.includes('cycle') ||
    lowerName.includes('bike') ||
    lowerName.includes('treadmill') ||
    lowerName.includes('rowing') ||
    lowerName.includes('jump rope') ||
    lowerName.includes('stair') ||
    lowerName.includes('conditioning');

  if (isConditioning) {
    return {
      exerciseName: cleanName,
      targetWeight: 0,
      targetReps: defaultTargetReps,
      targetRpe: 7.0,
      targetSets: 1,
      repRange: { min: 10, max: 30 },
      progressionModel: 'conditioning_interval',
      whyThisWeight: 'Conditioning work capacity prescription for cardiovascular base and stamina.',
      nextSessionRule: 'Progress duration by +2 minutes or increase work intervals as conditioning improves.',
    };
  }

  // 1. Check for committed (accepted or overridden) Decision Ledger entries
  const cleanTarget = cleanName.toLowerCase();
  const decisionKey = Object.keys(trainingDecisions || {}).find(
    (k) => k.trim().toLowerCase() === cleanTarget
  );
  const committedDecision = decisionKey ? trainingDecisions![decisionKey] : undefined;

  const past = getLastExercisePerformance(cleanName, workouts, userUnit);

  if (committedDecision && (committedDecision.status === 'accepted' || committedDecision.status === 'overridden')) {
    const isOverride = committedDecision.status === 'overridden';
    const prescribedW = isOverride && committedDecision.userOverrideWeight !== undefined
      ? committedDecision.userOverrideWeight
      : committedDecision.nextPrescription.weight;
    const prescribedReps = committedDecision.nextPrescription.reps;
    const prescribedSets = committedDecision.nextPrescription.sets;
    const prescribedRpe = committedDecision.nextPrescription.targetRpe;

    return {
      exerciseName: cleanName,
      targetWeight: prescribedW,
      targetReps: prescribedReps,
      targetRpe: prescribedRpe,
      targetSets: prescribedSets,
      repRange: { min: Math.max(1, prescribedReps - 2), max: prescribedReps + 2 },
      progressionModel: committedDecision.programIntent === 'strength' ? 'rpe_autoregulated' : 'double_progression',
      whyThisWeight: isOverride
        ? `Athlete override active: personalized to ${prescribedW}${userUnit} × ${prescribedReps} reps.`
        : `Accepted Lifter Twin adaptation: ${committedDecision.headline}. ${committedDecision.explanation}`,
      nextSessionRule: committedDecision.reasonType === 'exceeded_rpe'
        ? `Consolidate at ${prescribedW}${userUnit} until RPE stabilizes at ≤ 8.0.`
        : committedDecision.reasonType === 'missed_reps'
        ? `Hold ${prescribedW}${userUnit} and aim for full rep consistency across all sets.`
        : `Advance load next session if all sets land with reserve.`,
      lastPerformance: past ? {
        date: past.date,
        weight: past.bestWeight,
        reps: past.bestReps,
        rpe: past.sets[0]?.rpe,
        summary: past.summary,
      } : null,
    };
  }

  // 2. Closed-Loop Lifter Twin Adaptation from Past Workout Performance
  const matchedPr = prs.find((p) => p.exercise.trim().toLowerCase() === lowerName);

  if (past && past.sets.length > 0) {
    const lastWeight = past.bestWeight;
    const lastReps = past.bestReps;
    const effort = calculateSetEffortDrift(past.sets);
    const step = userUnit === 'lbs' ? 5 : 2.5;

    // A. Severe Effort Spike or Elevated RPE (Fatigue accumulation)
    if (effort.hasEffortSpike || effort.averageRpe >= 9.2) {
      const reduction = Math.max(step, Math.round((lastWeight * 0.035) / step) * step);
      const minBar = userUnit === 'lbs' ? 45 : 20;
      const safeW = Math.max(minBar, lastWeight - reduction);
      return {
        exerciseName: cleanName,
        targetWeight: safeW,
        targetReps: repRange.min,
        targetRpe: 8.0,
        targetSets: Math.min(3, defaultSets),
        repRange,
        progressionModel: isStrength ? 'rpe_autoregulated' : 'double_progression',
        whyThisWeight: `Previous effort spiked to RPE ${effort.averageRpe} (within-session drift +${effort.rpeDriftPerSet} RPE/set). Adjusted -${reduction}${userUnit} to restore velocity at target RPE 8.0.`,
        nextSessionRule: `Consolidate at ${safeW}${userUnit}. When effort stabilizes at ≤ RPE 8, return to progressive overload.`,
        lastPerformance: {
          date: past.date,
          weight: lastWeight,
          reps: lastReps,
          rpe: effort.averageRpe,
          summary: past.summary,
        },
      };
    }

    // B. Rep drop-off across working sets (>= 2 reps drop) -> Volume Consolidation
    if (effort.repDrop >= 2) {
      return {
        exerciseName: cleanName,
        targetWeight: lastWeight,
        targetReps: lastReps,
        targetRpe: 8.0,
        targetSets: defaultSets,
        repRange,
        progressionModel: 'double_progression',
        whyThisWeight: `Rep drop-off of ${effort.repDrop} reps detected across working sets. Volume consolidation: hold load at ${lastWeight}${userUnit} to build stamina across all sets before adding weight.`,
        nextSessionRule: `Hit ${repRange.max} reps across all sets before advancing weight.`,
        lastPerformance: {
          date: past.date,
          weight: lastWeight,
          reps: lastReps,
          rpe: effort.averageRpe,
          summary: past.summary,
        },
      };
    }

    // C. Hypertrophy: Double Progression Model
    if (isHypertrophy) {
      const allSetsHitTop = past.sets.every((s) => s.reps >= repRange.max);

      if (allSetsHitTop) {
        const nextW = lastWeight + step;
        return {
          exerciseName: cleanName,
          targetWeight: nextW,
          targetReps: repRange.min,
          targetRpe: 8.0,
          targetSets: defaultSets,
          repRange,
          progressionModel: 'double_progression',
          whyThisWeight: `Double progression: completed all sets at ${lastWeight}${userUnit} × ${repRange.max} reps with reserve. Overload step +${step}${userUnit} applied.`,
          nextSessionRule: `Build repetitions from ${repRange.min} back up to ${repRange.max} reps before adding further load.`,
          lastPerformance: {
            date: past.date,
            weight: lastWeight,
            reps: lastReps,
            rpe: effort.averageRpe,
            summary: past.summary,
          },
        };
      } else {
        const nextReps = Math.min(repRange.max, lastReps + 1);
        return {
          exerciseName: cleanName,
          targetWeight: lastWeight,
          targetReps: nextReps,
          targetRpe: 8.0,
          targetSets: defaultSets,
          repRange,
          progressionModel: 'double_progression',
          whyThisWeight: `Double progression: hold load at ${lastWeight}${userUnit} and aim for +1 rep (${lastReps} → ${nextReps} reps).`,
          nextSessionRule: `When all sets reach ${repRange.max} reps, advance weight to ${lastWeight + step}${userUnit}.`,
          lastPerformance: {
            date: past.date,
            weight: lastWeight,
            reps: lastReps,
            rpe: effort.averageRpe,
            summary: past.summary,
          },
        };
      }
    }

    // D. Strength: RPE Autoregulated
    if (isStrength) {
      if (effort.averageRpe <= 8.0 && lastReps >= repRange.min) {
        const nextW = lastWeight + step;
        return {
          exerciseName: cleanName,
          targetWeight: nextW,
          targetReps: repRange.min,
          targetRpe: 8.5,
          targetSets: defaultSets,
          repRange,
          progressionModel: 'rpe_autoregulated',
          whyThisWeight: `Previous session moved with fast bar speed (@${effort.averageRpe} ≤ target). Added +${step}${userUnit}.`,
          nextSessionRule: `If this session lands ≤ RPE 8, continue +${step}${userUnit} step next exposure.`,
          lastPerformance: {
            date: past.date,
            weight: lastWeight,
            reps: lastReps,
            rpe: effort.averageRpe,
            summary: past.summary,
          },
        };
      } else {
        return {
          exerciseName: cleanName,
          targetWeight: lastWeight,
          targetReps: lastReps,
          targetRpe: 8.0,
          targetSets: defaultSets,
          repRange,
          progressionModel: 'rpe_autoregulated',
          whyThisWeight: `Hold ${lastWeight}${userUnit} at target RPE 8 to consolidate strength adaptation.`,
          nextSessionRule: `Target RPE 8. If bar moves effortlessly, advance next week.`,
          lastPerformance: {
            date: past.date,
            weight: lastWeight,
            reps: lastReps,
            rpe: effort.averageRpe,
            summary: past.summary,
          },
        };
      }
    }

    // E. Default / Fat Loss / General Fitness / Stamina
    const allSetsClean = effort.averageRpe <= 8.0 && past.sets.every((s) => s.reps >= repRange.min);
    if (allSetsClean) {
      const nextW = lastWeight + step;
      return {
        exerciseName: cleanName,
        targetWeight: nextW,
        targetReps: defaultTargetReps,
        targetRpe: 7.5,
        targetSets: defaultSets,
        repRange,
        progressionModel: 'linear_step',
        whyThisWeight: `Clean execution across all sets (avg RPE ${effort.averageRpe} ≤ 8.0). Progressive overload step +${step}${userUnit} applied.`,
        nextSessionRule: `Keep form strict and maintain target rep range.`,
        lastPerformance: {
          date: past.date,
          weight: lastWeight,
          reps: lastReps,
          rpe: effort.averageRpe,
          summary: past.summary,
        },
      };
    }

    return {
      exerciseName: cleanName,
      targetWeight: lastWeight,
      targetReps: defaultTargetReps,
      targetRpe: 7.5,
      targetSets: defaultSets,
      repRange,
      progressionModel: 'linear_step',
      whyThisWeight: `Preserving training stimulus at ${lastWeight}${userUnit} based on your last logged session.`,
      nextSessionRule: `Keep form strict and maintain target rep range.`,
      lastPerformance: {
        date: past.date,
        weight: lastWeight,
        reps: lastReps,
        rpe: effort.averageRpe,
        summary: past.summary,
      },
    };
  }

  // No past workout: check PR / baseline calibration
  if (matchedPr && matchedPr.oneRepMax > 0) {
    const targetW = suggestLoad(matchedPr.oneRepMax, defaultTargetReps, Math.round(targetRpe), userUnit);
    const prW = userUnit === 'lbs' ? (matchedPr.weightLbs || Math.round(matchedPr.weightKg * 2.20462)) : matchedPr.weightKg;
    const e1rmDisplay = userUnit === 'lbs' ? Math.round(matchedPr.oneRepMax * 2.20462) : matchedPr.oneRepMax;

    return {
      exerciseName: cleanName,
      targetWeight: targetW,
      targetReps: defaultTargetReps,
      targetRpe,
      targetSets: defaultSets,
      repRange,
      progressionModel: isHypertrophy ? 'double_progression' : isStrength ? 'rpe_autoregulated' : 'linear_step',
      whyThisWeight: `Calibrated from your ${prW}${userUnit} × ${matchedPr.reps} baseline (${e1rmDisplay}${userUnit} e1RM) at target RPE ${targetRpe}.`,
      nextSessionRule: `Log this first workout to establish your working velocity. If all sets land ≤ RPE 8, progress next session.`,
    };
  }

  // Fallback: estimate from standard baseline
  const isBW = lowerName.includes('pull-up') || lowerName.includes('chin-up') || lowerName.includes('push-up') || lowerName.includes('dip');
  const fallbackW = isBW ? 0 : userUnit === 'lbs' ? 95 : 40;

  return {
    exerciseName: cleanName,
    targetWeight: fallbackW,
    targetReps: defaultTargetReps,
    targetRpe: 7.5,
    targetSets: defaultSets,
    repRange,
    progressionModel: isHypertrophy ? 'double_progression' : 'linear_step',
    whyThisWeight: `Estimated introductory target for ${cleanName}. Adjust freely with stepper buttons.`,
    nextSessionRule: `Complete sets to calibrate your personal baseline response.`,
  };
}

/**
 * Smart progression recommendation & plateau detector based on recent performance history.
 */
export interface ProgressionTarget {
  targetWeight: number;
  targetReps: number;
  targetSetsCount: number;
  targetSummary: string;
  rationale: string;
  isPlateau: boolean;
  plateauSessionsCount?: number;
  plateauSuggestion?: string;
}

export function getProgressionRecommendation(
  exerciseName: string,
  workouts: WorkoutEntry[],
  userUnit: 'kg' | 'lbs' = 'kg',
  goal: AthleteGoal = 'build_muscle'
): ProgressionTarget | null {
  if (!exerciseName || !workouts || workouts.length === 0) return null;

  const targetLower = exerciseName.trim().toLowerCase();
  const sessions: { date: string; sets: WorkoutSet[]; bestE1RM: number }[] = [];

  const sortedWorkouts = [...workouts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  for (const w of sortedWorkouts) {
    const match = w.exercises.find((e) => {
      const n = e.name.trim().toLowerCase();
      return n === targetLower || n.includes(targetLower) || targetLower.includes(n);
    });
    if (match && match.sets.length > 0) {
      const validSets = match.sets
        .filter((s) => s.reps > 0 && isSetCompleted(s))
        .map((s) => {
          let normalizedWeight = s.weight;
          if (typeof s.weight === 'number' && !isNaN(s.weight) && s.unit && s.unit !== userUnit) {
            if (userUnit === 'lbs' && s.unit === 'kg') {
              normalizedWeight = Math.round(s.weight * 2.20462 * 10) / 10;
            } else if (userUnit === 'kg' && s.unit === 'lbs') {
              normalizedWeight = Math.round(s.weight * 0.453592 * 10) / 10;
            }
          }
          return {
            ...s,
            weight: normalizedWeight,
            unit: userUnit,
          };
        });
      if (validSets.length > 0) {
        const bestE1RM = Math.max(...validSets.map((s) => calculateOneRepMax(typeof s.weight === 'number' ? s.weight : 0, s.reps)));
        sessions.push({ date: w.date, sets: validSets, bestE1RM });
        if (sessions.length >= 5) break;
      }
    }
  }

  if (sessions.length === 0) return null;

  const lastSession = sessions[0];
  // Filter out explicit warmups and unperformed sets
  const explicitWorkSets = lastSession.sets.filter((s) => !s.isWarmup && s.reps > 0 && s.completed !== false);
  const candidateSets = explicitWorkSets.length > 0 ? explicitWorkSets : lastSession.sets.filter((s) => s.reps > 0);

  const isBW = isBodyweightExercise(exerciseName);
  const setsWithMeasuredLoad = candidateSets.filter((s) => typeof s.weight === 'number' && Number.isFinite(s.weight));

  // If this is a non-bodyweight movement and no working sets have a measured load, progression cannot be safely determined.
  if (!isBW && setsWithMeasuredLoad.length === 0) {
    return null;
  }

  // Isolate true working sets from unflagged preparatory warmups (e.g. empty bar 20kg before 100kg work sets)
  const loadSets = isBW ? candidateSets : setsWithMeasuredLoad;
  const maxLoad = Math.max(...loadSets.map((s) => typeof s.weight === 'number' ? s.weight : 0));
  const thresholdLoad = maxLoad > 30 ? maxLoad * 0.70 : maxLoad;
  const trueWorkSets = loadSets.filter((s) => (typeof s.weight === 'number' ? s.weight : 0) >= thresholdLoad);
  const lastSets = trueWorkSets.length > 0 ? trueWorkSets : loadSets;

  // Working load: peak working set load
  const rawLastWeight = lastSets.reduce((prev, curr) => {
    const prevW = typeof prev.weight === 'number' && Number.isFinite(prev.weight) ? prev.weight : (isBW ? 0 : -1);
    const currW = typeof curr.weight === 'number' && Number.isFinite(curr.weight) ? curr.weight : (isBW ? 0 : -1);
    return currW >= prevW ? curr : prev;
  }, lastSets[0])?.weight;

  const lastWeight = typeof rawLastWeight === 'number' && Number.isFinite(rawLastWeight)
    ? rawLastWeight
    : (isBW ? 0 : null);

  if (lastWeight === null) {
    return null;
  }
  const lastReps = Math.round(lastSets.reduce((sum, s) => sum + s.reps, 0) / lastSets.length) || 8;
  const lastSetsCount = lastSets.length;

  const isStrength = goal === 'get_stronger';
  const isStamina = goal === 'stamina';
  const isFatLoss = goal === 'lose_fat';
  const isMuscle = goal === 'build_muscle';
  const isFitness = goal === 'general_fitness';

  const minTargetReps = isStrength ? 4 : isStamina ? 12 : isFatLoss ? 6 : 8;
  const step = userUnit === 'lbs' ? 5 : 2.5;
  const minBar = userUnit === 'lbs' ? 45 : 20;

  // 1. Two consecutive misses in a row -> Suggest a 10% deload
  if (sessions.length >= 2) {
    const s0 = sessions[0];
    const s1 = sessions[1];
    const s0TotalReps = s0.sets.reduce((sum, s) => sum + s.reps, 0);
    const s1TotalReps = s1.sets.reduce((sum, s) => sum + s.reps, 0);

    // Miss criteria: high strain failure (RPE >= 10) or reps dropping below goal baseline
    const missThreshold = isStrength ? 3 : isStamina ? 10 : 5;
    const s0Missed = s0.sets.some((s) => (s.rpe && s.rpe >= 10 && s.reps < minTargetReps) || s.reps < missThreshold);
    const s1Missed = s1.sets.some((s) => (s.rpe && s.rpe >= 10 && s.reps < minTargetReps) || s.reps < missThreshold) || s0TotalReps < s1TotalReps;

    if (s0Missed && s1Missed) {
      const deloadWeight = Math.max(minBar, Math.round((lastWeight * 0.90) / step) * step);
      const deloadReps = isStrength ? 5 : isStamina ? 12 : Math.min(10, lastReps + 2);
      const dropAmount = Math.round(lastWeight - deloadWeight);

      let deloadRationale = `Two consecutive misses detected. 10% deload recommended (-${dropAmount}${userUnit}) to dissipate systemic fatigue and reset adaptation.`;
      if (isFatLoss) {
        deloadRationale = `Two consecutive sessions hit high strain. In a fat-loss phase, systemic recovery is reduced; a 10% deload (-${dropAmount}${userUnit}) prevents burnout, protects lean tissue, and restores clean bar speed.`;
      } else if (isStrength) {
        deloadRationale = `Two consecutive misses detected under heavy load. A planned 10% deload (-${dropAmount}${userUnit}) dissipates accumulated neural fatigue so you can rebuild towards heavier targets with crisp velocity.`;
      } else if (isStamina) {
        deloadRationale = `Two consecutive sessions missed the high-rep endurance threshold. Reducing load by 10% (-${dropAmount}${userUnit}) lets you hit the 12–15 rep bracket with full range of motion.`;
      } else if (isFitness) {
        deloadRationale = `Two consecutive sessions approached muscular failure. A 10% deload (-${dropAmount}${userUnit}) protects joint longevity and resets clean movement quality.`;
      }

      return {
        targetWeight: deloadWeight,
        targetReps: deloadReps,
        targetSetsCount: lastSetsCount,
        targetSummary: `${deloadWeight}${userUnit} × ${deloadReps} reps (-10% deload)`,
        rationale: deloadRationale,
        isPlateau: true,
        plateauSessionsCount: 2,
        plateauSuggestion: `Deload to ${deloadWeight}${userUnit} for 1 session to flush fatigue, then step back up with clean form.`,
      };
    }
  }

  // 2. Check 4+ session plateau stall
  if (sessions.length >= 4) {
    const e1rms = sessions.map((s) => s.bestE1RM);
    const maxE1RM = Math.max(...e1rms);
    const minE1RM = Math.min(...e1rms);
    const variation = maxE1RM > 0 ? (maxE1RM - minE1RM) / maxE1RM : 0;

    if (variation < 0.02) {
      const deloadWeight = Math.max(minBar, Math.round((lastWeight * 0.90) / step) * step);
      const targetPlateauReps = isStrength ? 5 : isStamina ? 15 : Math.min(12, lastReps + 2);

      let plateauRationale = `Plateau detected: your performance has stalled at ~${Math.round(lastSession.bestE1RM)}${userUnit} across ${sessions.length} sessions.`;
      if (isStrength) {
        plateauRationale = `Strength plateau detected: estimated 1RM has plateaued at ~${Math.round(lastSession.bestE1RM)}${userUnit} across ${sessions.length} sessions. Deload to ${deloadWeight}${userUnit} or introduce a close variation to break through.`;
      } else if (isMuscle) {
        plateauRationale = `Hypertrophy stimulus plateaued at ~${Math.round(lastSession.bestE1RM)}${userUnit}. A brief 10% reset to ${deloadWeight}${userUnit} targeting ${targetPlateauReps} reps stimulates fresh motor unit recruitment.`;
      } else if (isFatLoss) {
        plateauRationale = `Performance has held steady at ~${Math.round(lastSession.bestE1RM)}${userUnit} across ${sessions.length} sessions. Holding strength in a deficit is excellent; a light deload to ${deloadWeight}${userUnit} keeps movement sharp.`;
      }

      return {
        targetWeight: deloadWeight,
        targetReps: targetPlateauReps,
        targetSetsCount: lastSetsCount,
        targetSummary: `${deloadWeight}${userUnit} × ${targetPlateauReps} reps`,
        rationale: plateauRationale,
        isPlateau: true,
        plateauSessionsCount: sessions.length,
        plateauSuggestion: isStrength
          ? `Deload 10% to ${deloadWeight}${userUnit} for 1 week, or switch to a paused/deficit variation to stimulate new neural drive.`
          : `Deload 10% to ${deloadWeight}${userUnit} for higher reps, or switch variation for 2 weeks to trigger new hypertrophy.`,
      };
    }
  }

  // 3. Smart Progression Rule:
  // If all reps were hit at RPE 8 or below (or hit target reps cleanly) -> Suggest +2.5 kg (or +5 lbs)
  const hasRPE = lastSets.some((s) => s.rpe !== undefined);
  const allRpeAtOrBelow8 = hasRPE ? lastSets.every((s) => (s.rpe ?? 8) <= 8) : false;
  const allSetsCompletedTargetReps = lastSets.every(
    (s) => s.reps >= minTargetReps && typeof s.weight === 'number' && s.weight >= lastWeight
  );

  if (allRpeAtOrBelow8 || (allSetsCompletedTargetReps && lastSets.length >= 2)) {
    const increment = userUnit === 'lbs' ? 5 : 2.5;
    const nextWeight = lastWeight + increment;

    // Reps target tailored to goal
    let targetReps = Math.max(minTargetReps, lastReps - 1);
    if (isStrength) {
      targetReps = Math.max(4, Math.min(5, lastReps));
    } else if (isStamina) {
      targetReps = Math.max(12, Math.min(15, lastReps));
    } else if (isMuscle) {
      targetReps = Math.max(8, Math.min(10, lastReps));
    } else if (isFatLoss) {
      targetReps = Math.max(5, Math.min(6, lastReps));
    }

    let rationale = allRpeAtOrBelow8
      ? `All reps hit at RPE ≤ 8 (solid reserve left in the tank). Overload recommendation: +${increment}${userUnit}!`
      : `Target reps hit across all sets. Progressive overload recommendation: +${increment}${userUnit}!`;

    if (isStrength) {
      rationale = `All sets completed with reserve (RPE ≤ 8.0). Progressive overload of +${increment}${userUnit} recommended, targeting ${targetReps} reps for maximal neural strength adaptation.`;
    } else if (isMuscle) {
      rationale = `Hypertrophy volume completed cleanly with reserve. Adding +${increment}${userUnit} targeting ${targetReps} reps to progressively overload mechanical tension.`;
    } else if (isFatLoss) {
      rationale = `Clean reps completed with reserve. Adding +${increment}${userUnit} maintains heavy mechanical tension to signal muscle retention in a caloric deficit.`;
    } else if (isStamina) {
      rationale = `All ${lastReps} reps completed with good endurance reserve. Progressive overload of +${increment}${userUnit} prescribed to drive stamina and work capacity.`;
    } else if (isFitness) {
      rationale = `Consistent form and clean effort across all sets. Adding +${increment}${userUnit} builds functional strength while maintaining balanced joint health.`;
    }

    return {
      targetWeight: nextWeight,
      targetReps,
      targetSetsCount: lastSetsCount,
      targetSummary: `${nextWeight}${userUnit} × ${targetReps} reps (+${increment}${userUnit})`,
      rationale,
      isPlateau: false,
    };
  }

  // 4. Default: Aim to add +1 rep on current weight
  const repList = lastSets.map((s) => s.reps);
  const nextTargetReps = [...repList];
  const minRepIndex = nextTargetReps.lastIndexOf(Math.min(...nextTargetReps));
  nextTargetReps[minRepIndex] = (nextTargetReps[minRepIndex] || minTargetReps) + 1;

  const repChangeDesc = repList.length > 1
    ? `${repList.join(', ')} → ${nextTargetReps.join(', ')}`
    : `${repList[0]} → ${nextTargetReps[0]}`;

  let repRationale = `Target +1 rep compared to last session (${repChangeDesc} reps).`;
  if (isStrength) {
    repRationale = `Weight was challenging on final set. Hold load steady at ${lastWeight}${userUnit} and aim for +1 rep (${repChangeDesc} reps) to consolidate technical bar speed before increasing weight.`;
  } else if (isMuscle) {
    repRationale = `Solid effort at ${lastWeight}${userUnit}. Accumulate volume by adding +1 rep (${repChangeDesc} reps) to maximize muscle fiber stimulation before increasing the load.`;
  } else if (isFatLoss) {
    repRationale = `Maintain ${lastWeight}${userUnit} today and focus on hitting +1 clean rep (${repChangeDesc} reps). Controlled volume progression preserves contractile tissue without generating excess systemic fatigue.`;
  } else if (isStamina) {
    repRationale = `Hold ${lastWeight}${userUnit} and aim for +1 extra rep (${repChangeDesc} reps) to build local muscular endurance and lactate tolerance.`;
  } else if (isFitness) {
    repRationale = `Keep load at ${lastWeight}${userUnit} and target +1 rep (${repChangeDesc} reps) with smooth control and full range of motion.`;
  }

  return {
    targetWeight: lastWeight,
    targetReps: nextTargetReps[0] || lastReps,
    targetSetsCount: lastSetsCount,
    targetSummary: `${lastWeight}${userUnit} × ${nextTargetReps.join(', ')}`,
    rationale: repRationale,
    isPlateau: false,
  };
}

/**
 * Instant 1-tap exercise substitutes based on movement pattern and gym availability.
 */
export interface ExerciseSubstitute {
  name: string;
  equipment: string;
  reason: string;
  rationale?: string;
}

const SUBSTITUTION_MAP: Record<string, ExerciseSubstitute[]> = {
  'bench press': [
    { name: 'Dumbbell Bench Press', equipment: 'dumbbell', reason: 'Better shoulder freedom & stabilizer engagement' },
    { name: 'Incline Barbell Bench', equipment: 'barbell', reason: 'Upper chest emphasis with barbell power' },
    { name: 'Chest Press Machine', equipment: 'machine', reason: 'Controlled path when spotter/barbell unavailable' },
  ],
  'dumbbell bench press': [
    { name: 'Barbell Bench Press', equipment: 'barbell', reason: 'Heavier overload potential' },
    { name: 'Incline Dumbbell Press', equipment: 'dumbbell', reason: 'Upper clavicular chest focus' },
    { name: 'Dips', equipment: 'bodyweight', reason: 'High tricep and lower chest mass builder' },
  ],
  'incline dumbbell press': [
    { name: 'Incline Barbell Bench', equipment: 'barbell', reason: 'Direct barbell compound substitute' },
    { name: 'Low-to-High Cable Fly', equipment: 'cable', reason: 'Continuous tension on upper chest' },
    { name: 'Landmine Press', equipment: 'barbell', reason: 'Very shoulder-friendly clavicular press' },
  ],
  'squat': [
    { name: 'Leg Press', equipment: 'machine', reason: 'Heavy quad loading without spinal compression' },
    { name: 'Hack Squat', equipment: 'machine', reason: 'Deep quad stretch with fixed lumbar support' },
    { name: 'Goblet Squat', equipment: 'dumbbell', reason: 'Great upright posture & hip mobility' },
  ],
  'leg press': [
    { name: 'Hack Squat', equipment: 'machine', reason: 'Same quad-dominant loading angle' },
    { name: 'Barbell Squat', equipment: 'barbell', reason: 'Full systemic core & leg builder' },
    { name: 'Bulgarian Split Squat', equipment: 'dumbbell', reason: 'Unilateral quad and glute focus' },
  ],
  'leg extension': [
    { name: 'Hack Squat', equipment: 'machine', reason: 'Heavy quad focus when extension machine is taken' },
    { name: 'Sissy Squat', equipment: 'bodyweight', reason: 'Intense rectus femoris isolation' },
    { name: 'Walking Lunges', equipment: 'dumbbell', reason: 'Quad pump and active stabilizer work' },
  ],
  'deadlift': [
    { name: 'Romanian Deadlift', equipment: 'barbell', reason: 'Pure hamstring & glute tension without floor reset' },
    { name: 'Trap Bar Deadlift', equipment: 'barbell', reason: 'More quad engagement, lower lumbar strain' },
    { name: 'Barbell Row', equipment: 'barbell', reason: 'Posterior chain loading with back thickness focus' },
  ],
  'romanian deadlift': [
    { name: 'Dumbbell Romanian Deadlift', equipment: 'dumbbell', reason: 'Easier grip setup & natural hip hinge' },
    { name: 'Seated Leg Curl', equipment: 'machine', reason: 'Isolated knee flexion hamstring work' },
    { name: 'Good Mornings', equipment: 'barbell', reason: 'Hamstring and lower back erector loading' },
  ],
  'overhead press': [
    { name: 'Dumbbell Shoulder Press', equipment: 'dumbbell', reason: 'Greater range of motion & wrist comfort' },
    { name: 'Arnold Press', equipment: 'dumbbell', reason: 'Rotational delt recruitment' },
    { name: 'Pike Push-ups', equipment: 'bodyweight', reason: 'Bodyweight overhead pressing movement' },
  ],
  'dumbbell shoulder press': [
    { name: 'Barbell Overhead Press', equipment: 'barbell', reason: 'Raw progressive overload strength builder' },
    { name: 'Machine Shoulder Press', equipment: 'machine', reason: 'Stable deltoid burnout' },
    { name: 'Lateral Raises', equipment: 'dumbbell', reason: 'Direct side deltoid hypertrophy' },
  ],
  'barbell row': [
    { name: 'Chest Supported Row', equipment: 'machine', reason: 'Zero lower back fatigue, pure upper back' },
    { name: 'One-Arm Dumbbell Row', equipment: 'dumbbell', reason: 'Huge stretch on lats with unilateral focus' },
    { name: 'Cable Seated Row', equipment: 'cable', reason: 'Constant cable tension through entire stroke' },
  ],
  'pull-ups': [
    { name: 'Lat Pulldown', equipment: 'cable', reason: 'Micro-adjustable weight for precise rep targets' },
    { name: 'Underhand Chin-ups', equipment: 'bodyweight', reason: 'Higher bicep leverage' },
    { name: 'Straight Arm Pulldown', equipment: 'cable', reason: 'Pure lat isolation without arm fatigue' },
  ],
  'lat pulldown': [
    { name: 'Pull-ups', equipment: 'bodyweight', reason: 'The gold standard vertical pulling movement' },
    { name: 'Underhand Cable Pulldown', equipment: 'cable', reason: 'Closer grip for lower lat sweep' },
    { name: 'One-Arm Cable Pulldown', equipment: 'cable', reason: 'Deep lateral flexion and full stretch' },
  ],
  'dumbbell curl': [
    { name: 'Incline Dumbbell Curl', equipment: 'dumbbell', reason: 'Maximum stretch on the long head of biceps' },
    { name: 'Barbell Bicep Curl', equipment: 'barbell', reason: 'Heavy bilateral bicep overload' },
    { name: 'Hammer Curl', equipment: 'dumbbell', reason: 'Brachialis and forearm thickness' },
  ],
  'tricep pushdown': [
    { name: 'Overhead Cable Tricep Extension', equipment: 'cable', reason: 'Target long head of triceps in stretched position' },
    { name: 'Skull Crushers', equipment: 'barbell', reason: 'Heavy mass builder for tricep belly' },
    { name: 'Dips', equipment: 'bodyweight', reason: 'Compound tricep press with bodyweight' },
  ],
};

export function getQuickSubstitutes(exerciseName: string): ExerciseSubstitute[] {
  if (!exerciseName) return [];
  const clean = exerciseName.trim().toLowerCase();

  // Direct match
  if (SUBSTITUTION_MAP[clean]) {
    return SUBSTITUTION_MAP[clean];
  }

  // Partial match
  for (const key of Object.keys(SUBSTITUTION_MAP)) {
    if (clean.includes(key) || key.includes(clean)) {
      return SUBSTITUTION_MAP[key];
    }
  }

  // Fallback by movement category
  const eq = getEquipmentType(exerciseName);
  if (eq === 'dumbbell') {
    return [
      { name: 'Barbell equivalent', equipment: 'barbell', reason: 'Heavier bilateral overload' },
      { name: 'Cable variation', equipment: 'cable', reason: 'Smooth resistance curve' },
    ];
  }
  return [
    { name: 'Dumbbell alternative', equipment: 'dumbbell', reason: 'Independent arm freedom' },
    { name: 'Machine alternative', equipment: 'machine', reason: 'High stability and controlled path' },
  ];
}

/**
 * "Make Today's Workout Shorter":
 * Compresses a workout routine into 30m, 45m, or 60m:
 * - 30 min: Keep only top 2-3 compound exercises, reduce sets to 2-3 heavy work sets.
 * - 45 min: Keep 4 exercises, reduce accessory volume by 1 set.
 * - 60 min: Standard full plan.
 */
export function compressWorkout(
  exercises: WorkoutExercise[],
  targetMinutes: 30 | 45 | 60
): WorkoutExercise[] {
  if (!exercises || exercises.length === 0) return exercises;

  // Score exercises: compound movements first, then accessories
  const scored = exercises.map((ex, idx) => {
    const isCompound = isMainCompoundLift(ex.name);
    const score = (isCompound ? 100 : 50) - idx;
    return { ex, score };
  });

  // Sort compounds first
  scored.sort((a, b) => b.score - a.score);

  if (targetMinutes === 30) {
    // Keep max 3 exercises, clamp sets to max 3
    const selected = scored.slice(0, 3).map((item) => item.ex);
    return selected.map((ex) => ({
      ...ex,
      sets: ex.sets.slice(0, Math.min(3, Math.max(2, ex.sets.length))),
    }));
  }

  if (targetMinutes === 45) {
    // Keep max 4-5 exercises, clamp sets to max 3
    const selected = scored.slice(0, 4).map((item) => item.ex);
    return selected.map((ex) => ({
      ...ex,
      sets: ex.sets.slice(0, Math.min(3, ex.sets.length)),
    }));
  }

  // 60 minutes: full plan
  return exercises;
}

/**
 * Voice quick logging parser:
 * e.g. "Bench 70 for 8 8 7" -> { exerciseName: "Bench Press", sets: [{ weight: 70, reps: 8 }, ...] }
 * e.g. "Squat 100 for 5 reps 3 sets" -> 3 sets of 100kg x 5 reps
 */
export function parseVoiceWorkout(
  speechText: string,
  availableExercises: string[] = []
): { exerciseName: string; sets: WorkoutSet[] } | null {
  if (!speechText || !speechText.trim()) return null;
  const raw = speechText.trim().toLowerCase();

  // 1. Identify exercise name
  let matchedExercise = '';
  let bestScore = 0;

  for (const ex of availableExercises) {
    const exLower = ex.toLowerCase();
    if (raw.includes(exLower)) {
      if (exLower.length > bestScore) {
        matchedExercise = ex;
        bestScore = exLower.length;
      }
    }
  }

  // Fallback common name aliases
  if (!matchedExercise) {
    if (raw.includes('bench')) matchedExercise = 'Bench Press';
    else if (raw.includes('squat')) matchedExercise = 'Squat';
    else if (raw.includes('deadlift')) matchedExercise = 'Deadlift';
    else if (raw.includes('ohp') || raw.includes('overhead')) matchedExercise = 'Overhead Press';
    else if (raw.includes('curl')) matchedExercise = 'Dumbbell Curl';
    else if (raw.includes('pullup') || raw.includes('pull up')) matchedExercise = 'Pull-ups';
    else if (raw.includes('row')) matchedExercise = 'Barbell Row';
    else if (raw.includes('press')) matchedExercise = 'Leg Press';
  }

  if (!matchedExercise) {
    // Extract first word or words before number as exercise name
    const wordsBeforeNum = raw.match(/^([a-zA-Z\s]+?)(?=\s+\d)/);
    matchedExercise = wordsBeforeNum ? wordsBeforeNum[1].trim() : 'Custom Exercise';
    // Capitalize words
    matchedExercise = matchedExercise
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // 2. Extract weight & reps
  // Pattern A: "Bench 70 for 8 8 7" or "70kg 8 8 8"
  const weightMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilos|lbs|pound)?/);
  const weight = weightMatch ? parseFloat(weightMatch[1]) : 0;

  // Find remaining numbers for reps
  const afterWeight = raw.replace(weightMatch ? weightMatch[0] : '', '');
  const repNumbers = afterWeight.match(/\b\d+\b/g);

  const sets: WorkoutSet[] = [];

  if (repNumbers && repNumbers.length > 0) {
    // Check if user said "X sets of Y"
    const setsOfMatch = raw.match(/(\d+)\s*(?:sets?)\s*(?:of)?\s*(\d+)/);
    if (setsOfMatch) {
      const setCount = parseInt(setsOfMatch[1], 10);
      const repCount = parseInt(setsOfMatch[2], 10);
      for (let i = 0; i < setCount; i++) {
        sets.push({ weight, reps: repCount, unit: 'kg' });
      }
    } else {
      for (const r of repNumbers) {
        const parsedReps = parseInt(r, 10);
        if (parsedReps > 0 && parsedReps <= 100) {
          sets.push({ weight, reps: parsedReps, unit: 'kg' });
        }
      }
    }
  }

  // Fallback: If no reps found, default to 3 sets of 8
  if (sets.length === 0) {
    sets.push({ weight, reps: 8, unit: 'kg' });
    sets.push({ weight, reps: 8, unit: 'kg' });
    sets.push({ weight, reps: 8, unit: 'kg' });
  }

  return {
    exerciseName: matchedExercise,
    sets,
  };
}

export type TodaySessionStatus = 'in_progress' | 'completed' | 'planned' | 'none';

export interface TodaySessionInfo {
  status: TodaySessionStatus;
  title: string;
  subtitle: string;
  exercises: string[];
  firstExerciseLoadHint?: string;
  primaryActionLabel: string;
  isDraft: boolean;
  isDone: boolean;
  totalSets?: number;
  volumeKg?: number;
  durationMin?: number;
  prCount?: number;
  isRestDay?: boolean;
  scheduledDay?: string;
  bodyParts?: string[];
  plannedWorkoutId?: string;
}

/**
 * Single source of truth for today's workout state across Home, Workouts, and Consistency.
 */
export function getTodaySessionState(
  todayStr: string,
  workouts: WorkoutEntry[],
  plannedWorkouts: { id: string; name: string; exercises: { name: string }[] }[],
  activeDraft: { exercises: { name: string }[]; startedFromPlan?: string | null; name?: string } | null,
  userUnit: 'kg' | 'lbs' = 'kg',
  weeklySchedule?: WeeklySchedule
): TodaySessionInfo {
  // 1. In-progress draft takes highest priority
  if (activeDraft && activeDraft.exercises && activeDraft.exercises.length > 0) {
    const validEx = activeDraft.exercises.filter((e) => e.name && e.name.trim());
    return {
      status: 'in_progress',
      title: activeDraft.startedFromPlan || activeDraft.name || 'Workout in Progress',
      subtitle: `${validEx.length} exercise${validEx.length === 1 ? '' : 's'} active • Tap to resume`,
      exercises: validEx.map((e) => e.name),
      primaryActionLabel: 'Resume Session',
      isDraft: true,
      isDone: false,
    };
  }

  // 2. Completed workout for today
  const todayWorkouts = workouts.filter((w) => w.date && w.date.startsWith(todayStr));
  if (todayWorkouts.length > 0) {
    const w = todayWorkouts[0];
    let vol = 0;
    let sets = 0;
    for (const tw of todayWorkouts) {
      for (const ex of tw.exercises) {
        for (const s of ex.sets) {
          if (typeof s.weight === 'number' && s.weight > 0 && s.reps > 0) {
            const wKg = s.unit === 'lbs' ? s.weight * 0.453592 : s.weight;
            vol += wKg * s.reps;
          }
          if (s.reps > 0) sets++;
        }
      }
    }

    const exList = w.exercises.map((e) => e.name);
    return {
      status: 'completed',
      title: w.name || 'Gym Session Completed',
      subtitle: exList.slice(0, 4).join(', ') || 'Workout logged',
      exercises: exList,
      primaryActionLabel: 'Log Additional Session',
      isDraft: false,
      isDone: true,
      totalSets: sets,
      volumeKg: Math.round(vol),
      durationMin: w.durationMinutes || 0,
    };
  }

  // 3. User has a weekly schedule or planned routine
  if (weeklySchedule) {
    const todayDay = getTodayDayOfWeek(todayStr);
    const dayConfig = weeklySchedule[todayDay];

    if (dayConfig) {
      if (dayConfig.workoutPlanId === 'rest') {
        const userCustomPlans = plannedWorkouts.filter((p) => !p.id.startsWith('builtin_'));
        const nextPlan = userCustomPlans[0] || plannedWorkouts[0] || null;

        // Brand-new athlete on Day 1 is never put on a rest day
        if (workouts.length === 0 && nextPlan) {
          const exNames = nextPlan.exercises.map((e) => e.name);
          const firstEx = nextPlan.exercises[0];
          let loadHint: string | undefined = undefined;
          if (firstEx) {
            const pastPerf = getLastExercisePerformance(firstEx.name, workouts);
            if (pastPerf && pastPerf.bestWeight > 0) {
              loadHint = `Last: ${pastPerf.bestWeight}${userUnit} × ${pastPerf.bestReps}`;
            }
          }
          const bodyParts = getWorkoutBodyParts(nextPlan.exercises);

          return {
            status: 'planned',
            title: nextPlan.name,
            subtitle: bodyParts.length > 0 ? bodyParts.join(' • ') : exNames.slice(0, 4).join(', '),
            exercises: exNames,
            firstExerciseLoadHint: loadHint,
            primaryActionLabel: `Start Day 1: ${nextPlan.name}`,
            isDraft: false,
            isDone: false,
            isRestDay: false,
            scheduledDay: todayDay,
            bodyParts,
            plannedWorkoutId: nextPlan.id,
          };
        }

        return {
          status: 'planned',
          title: dayConfig.customTitle || 'Rest & Recovery',
          subtitle: nextPlan ? `Scheduled Rest Day • Next up: ${nextPlan.name}` : 'Scheduled Rest Day • Hydrate, sleep, and hit your protein target',
          exercises: nextPlan ? nextPlan.exercises.map((e) => e.name) : [],
          firstExerciseLoadHint: nextPlan ? `Next: ${nextPlan.name}` : undefined,
          primaryActionLabel: nextPlan ? `Train Today Anyway (${nextPlan.name})` : 'Start Workout Anyway',
          isDraft: false,
          isDone: false,
          isRestDay: true,
          scheduledDay: todayDay,
          bodyParts: [],
          plannedWorkoutId: nextPlan?.id,
        };
      }

      let matchedPlan = plannedWorkouts.find(
        (p) => p.id === dayConfig.workoutPlanId || p.name.toLowerCase() === dayConfig.workoutPlanId?.toLowerCase()
      );

      // If schedule references a builtin template but the user has created custom plans, prioritize user's plan
      const userCustomPlans = plannedWorkouts.filter((p) => !p.id.startsWith('builtin_'));
      if ((!matchedPlan || dayConfig.workoutPlanId?.startsWith('builtin_')) && userCustomPlans.length > 0) {
        matchedPlan = userCustomPlans[0];
      }

      if (matchedPlan) {
        const exNames = matchedPlan.exercises.map((e) => e.name);
        const firstEx = matchedPlan.exercises[0];
        let loadHint: string | undefined = undefined;
        if (firstEx) {
          const pastPerf = getLastExercisePerformance(firstEx.name, workouts);
          if (pastPerf && pastPerf.bestWeight > 0) {
            loadHint = `Last: ${pastPerf.bestWeight}${userUnit} × ${pastPerf.bestReps}`;
          }
        }

        const bodyParts =
          dayConfig.bodyParts && dayConfig.bodyParts.length > 0
            ? dayConfig.bodyParts
            : getWorkoutBodyParts(matchedPlan.exercises);

        return {
          status: 'planned',
          title: matchedPlan.name,
          subtitle: bodyParts.length > 0 ? bodyParts.join(' • ') : exNames.slice(0, 4).join(', '),
          exercises: exNames,
          firstExerciseLoadHint: loadHint,
          primaryActionLabel: `Start: ${matchedPlan.name}`,
          isDraft: false,
          isDone: false,
          isRestDay: false,
          scheduledDay: todayDay,
          bodyParts,
          plannedWorkoutId: matchedPlan.id,
        };
      }
    }
  }

  // Fallback to first plan if schedule didn't match (prefer user-created plan)
  if (plannedWorkouts && plannedWorkouts.length > 0) {
    const userCustomPlans = plannedWorkouts.filter((p) => !p.id.startsWith('builtin_'));
    const plan = userCustomPlans[0] || plannedWorkouts[0];
    const exNames = plan.exercises.map((e) => e.name);
    const firstEx = plan.exercises[0];
    let loadHint: string | undefined = undefined;
    if (firstEx) {
      const pastPerf = getLastExercisePerformance(firstEx.name, workouts);
      if (pastPerf && pastPerf.bestWeight > 0) {
        loadHint = `Last: ${pastPerf.bestWeight}${userUnit} × ${pastPerf.bestReps}`;
      }
    }

    const bodyParts = getWorkoutBodyParts(plan.exercises);

    return {
      status: 'planned',
      title: plan.name,
      subtitle: bodyParts.length > 0 ? bodyParts.join(' • ') : exNames.slice(0, 4).join(', '),
      exercises: exNames,
      firstExerciseLoadHint: loadHint,
      primaryActionLabel: `Start: ${plan.name}`,
      isDraft: false,
      isDone: false,
      isRestDay: false,
      bodyParts,
      plannedWorkoutId: plan.id,
    };
  }

  // 4. No planned routine
  return {
    status: 'none',
    title: 'No Session Scheduled',
    subtitle: 'Start an empty workout or select a training routine',
    exercises: [],
    primaryActionLabel: 'Start Workout',
    isDraft: false,
    isDone: false,
  };
}

/**
 * Generates goal-adapted split templates (Upper A, Lower A, Upper B, Lower B)
 * calibrated to the athlete's specific training goal, rep brackets, and unit system.
 */
export interface TemplateAthleteContext {
  bodyweightKg?: number;
  experience?: UserMode;
}

/**
 * Reference athlete the built-in template loads were authored for
 * (an ~85 kg intermediate lifter). Template loads scale with bodyweight
 * relative to this reference; beginners additionally get a conservative
 * factor so first exposures are safe rather than intimidating.
 */
const TEMPLATE_REFERENCE_BW_KG = 85;
const BEGINNER_FIRST_EXPOSURE_FACTOR = 0.6;

function scaleTemplateWeightForAthlete(
  templateWeight: number | undefined,
  isLbs: boolean,
  ctx: TemplateAthleteContext
): number | undefined {
  if (templateWeight === undefined || templateWeight <= 0) return templateWeight;
  const bw = ctx.bodyweightKg;
  if (!bw || bw <= 0) return templateWeight;
  const experienceFactor = ctx.experience === 'beginner' ? BEGINNER_FIRST_EXPOSURE_FACTOR : 1;
  const scaled = templateWeight * (bw / TEMPLATE_REFERENCE_BW_KG) * experienceFactor;
  const increment = isLbs ? 5 : 2.5;
  const rounded = Math.max(increment, Math.round(scaled / increment) * increment);
  // Beginners never get more than the template default on first exposure.
  if (ctx.experience === 'beginner') return Math.min(rounded, templateWeight);
  return rounded;
}

/**
 * Scales built-in template loads to the athlete's bodyweight and experience.
 * Pure function — unit-testable. Without a bodyweight the templates are
 * returned unchanged (previous behavior).
 */
export function scaleSplitTemplatesForAthlete(
  plans: PlannedWorkout[],
  isLbs: boolean,
  ctx: TemplateAthleteContext
): PlannedWorkout[] {
  if (!ctx.bodyweightKg || ctx.bodyweightKg <= 0) return plans;
  return plans.map((plan) => ({
    ...plan,
    exercises: (plan.exercises || []).map((ex) => ({
      ...ex,
      targetWeight: scaleTemplateWeightForAthlete(ex.targetWeight, isLbs, ctx),
    })),
  }));
}

/**
 * Goal-adaptive built-in split templates, optionally scaled to the athlete.
 * Pass bodyweightKg + experience at onboarding/first-exposure so a 62 kg
 * beginner is never prescribed an 85 kg lifter's loads.
 */
export function getGoalAdaptiveSplitTemplates(
  goal: AthleteGoal = 'build_muscle',
  unit: Unit = 'kg',
  athlete?: TemplateAthleteContext
): PlannedWorkout[] {
  const plans = buildGoalAdaptiveSplitTemplates(goal, unit);
  if (!athlete) return plans;
  return scaleSplitTemplatesForAthlete(plans, unit === 'lbs', athlete);
}

function buildGoalAdaptiveSplitTemplates(
  goal: AthleteGoal = 'build_muscle',
  unit: Unit = 'kg'
): PlannedWorkout[] {
  const isLbs = unit === 'lbs';

  if (goal === 'get_stronger') {
    return [
      {
        id: 'builtin_upper_a',
        name: 'Upper A',
        createdAt: '2026-01-01',
        description: 'Heavy compound strength focus with strict mechanical tension (4–5 reps)',
        goalTag: 'Strength (4–5 reps)',
        exercises: [
          { name: 'Bench Press', targetSets: 4, targetReps: 5, targetWeight: isLbs ? 165 : 75, targetUnit: unit },
          { name: 'Barbell Row', targetSets: 4, targetReps: 5, targetWeight: isLbs ? 145 : 65, targetUnit: unit },
          { name: 'Overhead Press', targetSets: 3, targetReps: 5, targetWeight: isLbs ? 100 : 45, targetUnit: unit },
          { name: 'Lat Pulldown', targetSets: 3, targetReps: 6, targetWeight: isLbs ? 135 : 60, targetUnit: unit },
          { name: 'Dumbbell Curl', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 30 : 14, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_lower_a',
        name: 'Lower A',
        createdAt: '2026-01-01',
        description: 'Primary squat strength day with posterior chain compound loading',
        goalTag: 'Strength (4–5 reps)',
        exercises: [
          { name: 'Squat', targetSets: 4, targetReps: 5, targetWeight: isLbs ? 245 : 110, targetUnit: unit },
          { name: 'Romanian Deadlift', targetSets: 3, targetReps: 6, targetWeight: isLbs ? 200 : 90, targetUnit: unit },
          { name: 'Leg Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 400 : 180, targetUnit: unit },
          { name: 'Calf Raise', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 135 : 60, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_upper_b',
        name: 'Upper B',
        createdAt: '2026-01-01',
        description: 'Upper body power & shoulder stability with vertical pull progression',
        goalTag: 'Strength (4–5 reps)',
        exercises: [
          { name: 'Incline Bench', targetSets: 4, targetReps: 5, targetWeight: isLbs ? 145 : 65, targetUnit: unit },
          { name: 'Pull-ups', targetSets: 3, targetReps: 5, targetWeight: 0, targetUnit: unit },
          { name: 'Dumbbell Shoulder Press', targetSets: 3, targetReps: 6, targetWeight: isLbs ? 50 : 24, targetUnit: unit },
          { name: 'Lateral Raise', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 22 : 10, targetUnit: unit },
          { name: 'Tricep Extension', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 60 : 28, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_lower_b',
        name: 'Lower B',
        createdAt: '2026-01-01',
        description: 'Maximal deadlift neural drive and quad anterior chain reinforcement',
        goalTag: 'Strength (3–5 reps)',
        exercises: [
          { name: 'Deadlift', targetSets: 4, targetReps: 4, targetWeight: isLbs ? 285 : 130, targetUnit: unit },
          { name: 'Front Squat', targetSets: 3, targetReps: 5, targetWeight: isLbs ? 165 : 75, targetUnit: unit },
          { name: 'Bulgarian Split Squat', targetSets: 3, targetReps: 6, targetWeight: isLbs ? 40 : 18, targetUnit: unit },
          { name: 'Hamstring Curl', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 110 : 50, targetUnit: unit },
        ],
      },
    ];
  }

  if (goal === 'lose_fat') {
    return [
      {
        id: 'builtin_upper_a',
        name: 'Upper A',
        createdAt: '2026-01-01',
        description: 'Muscle-sparing compound mechanical tension with higher training density',
        goalTag: 'Fat Loss (6–8 reps)',
        exercises: [
          { name: 'Bench Press', targetSets: 4, targetReps: 6, targetWeight: isLbs ? 160 : 72.5, targetUnit: unit },
          { name: 'Barbell Row', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 135 : 60, targetUnit: unit },
          { name: 'Overhead Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 95 : 42.5, targetUnit: unit },
          { name: 'Lat Pulldown', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 120 : 55, targetUnit: unit },
          { name: 'Dumbbell Curl', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 30 : 14, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_lower_a',
        name: 'Lower A',
        createdAt: '2026-01-01',
        description: 'Calorie-burning quad and hip hinge loading with controlled rest intervals',
        goalTag: 'Fat Loss (6–8 reps)',
        exercises: [
          { name: 'Squat', targetSets: 4, targetReps: 6, targetWeight: isLbs ? 225 : 100, targetUnit: unit },
          { name: 'Romanian Deadlift', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 175 : 80, targetUnit: unit },
          { name: 'Leg Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 350 : 160, targetUnit: unit },
          { name: 'Calf Raise', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 110 : 50, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_upper_b',
        name: 'Upper B',
        createdAt: '2026-01-01',
        description: 'Upper torso muscle retention with steady metabolic work rate',
        goalTag: 'Fat Loss (6–8 reps)',
        exercises: [
          { name: 'Incline Bench', targetSets: 4, targetReps: 6, targetWeight: isLbs ? 140 : 62.5, targetUnit: unit },
          { name: 'Pull-ups', targetSets: 3, targetReps: 8, targetWeight: 0, targetUnit: unit },
          { name: 'Dumbbell Shoulder Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 50 : 22, targetUnit: unit },
          { name: 'Lateral Raise', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 20 : 10, targetUnit: unit },
          { name: 'Tricep Extension', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 55 : 25, targetUnit: unit },
        ],
      },
      {
        id: 'builtin_lower_b',
        name: 'Lower B',
        createdAt: '2026-01-01',
        description: 'Heavy deadlift tension signal paired with active knee flexion density',
        goalTag: 'Fat Loss (5–8 reps)',
        exercises: [
          { name: 'Deadlift', targetSets: 4, targetReps: 5, targetWeight: isLbs ? 265 : 120, targetUnit: unit },
          { name: 'Front Squat', targetSets: 3, targetReps: 6, targetWeight: isLbs ? 155 : 70, targetUnit: unit },
          { name: 'Bulgarian Split Squat', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 35 : 16, targetUnit: unit },
          { name: 'Hamstring Curl', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 100 : 45, targetUnit: unit },
        ],
      },
    ];
  }

  if (goal === 'stamina') {
    return [
      {
        id: 'builtin_upper_a',
        name: 'Conditioning & Upper Stamina',
        createdAt: '2026-01-01',
        description: 'Aerobic base conditioning paired with high-density upper muscular endurance',
        goalTag: 'Conditioning (Aerobic Base + 12–15 reps)',
        exercises: [
          { name: 'Bench Press', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 95 : 40, targetUnit: unit, notes: 'Continuous muscular endurance, 12–15 reps' },
          { name: 'Zone 2 Stationary Cycling', targetSets: 1, targetReps: 20, targetWeight: 0, targetUnit: unit, notes: '20 min steady cadence @ 120–135 bpm aerobic zone' },
          { name: 'Incline Dumbbell Press', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 35 : 16, targetUnit: unit, notes: 'Short 60s rest periods to train lactate clearing' },
          { name: 'Lat Pulldown', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 100 : 45, targetUnit: unit, notes: 'Continuous muscular tension throughout stroke' },
          { name: 'Dumbbell Lateral Raise', targetSets: 3, targetReps: 15, targetWeight: isLbs ? 18 : 8, targetUnit: unit, notes: 'Full range of motion, strict deltoid burn' },
          { name: 'Front Plank (Seconds)', targetSets: 3, targetReps: 45, targetWeight: 0, targetUnit: unit, notes: '3 × 45s isometric core bracing' },
        ],
      },
      {
        id: 'builtin_lower_a',
        name: 'Conditioning & Lower Stamina',
        createdAt: '2026-01-01',
        description: 'Incline aerobic work paired with posterior chain endurance and knee flexion density',
        goalTag: 'Conditioning (Incline Walk + 12–15 reps)',
        exercises: [
          { name: 'Incline Treadmill Walk', targetSets: 1, targetReps: 15, targetWeight: 0, targetUnit: unit, notes: '15 min @ 10–12% incline, 4.5–5.0 km/h walking speed' },
          { name: 'Goblet Squat', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 45 : 20, targetUnit: unit, notes: 'Deep upright hip mobility and quad pump' },
          { name: 'Romanian Deadlift (RDL)', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 115 : 50, targetUnit: unit, notes: 'Posterior chain stretch and muscular endurance' },
          { name: 'Dumbbell Walking Lunge', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 25 : 12, targetUnit: unit, notes: '12 steps per leg with short 60s rest' },
          { name: 'Hanging Knee Raise', targetSets: 3, targetReps: 15, targetWeight: 0, targetUnit: unit, notes: 'Controlled pelvic tuck without swinging' },
        ],
      },
      {
        id: 'builtin_upper_b',
        name: 'Work Capacity & Intervals',
        createdAt: '2026-01-01',
        description: 'High-intensity interval conditioning engine for cardiovascular peak power',
        goalTag: 'Intervals & Circuits',
        exercises: [
          { name: 'Rowing Machine Intervals', targetSets: 8, targetReps: 1, targetWeight: 0, targetUnit: unit, notes: '8 rounds: 1 min hard sprint / 1 min easy paddle' },
          { name: 'Push-ups', targetSets: 3, targetReps: 15, targetWeight: 0, targetUnit: unit, notes: 'Chest-to-floor functional upper push capacity' },
          { name: 'Kettlebell Swings', targetSets: 4, targetReps: 20, targetWeight: isLbs ? 35 : 16, targetUnit: unit, notes: 'Explosive hip hinge endurance' },
          { name: 'Jump Rope Intervals', targetSets: 5, targetReps: 2, targetWeight: 0, targetUnit: unit, notes: '5 rounds of 2 min active work / 1 min rest' },
        ],
      },
      {
        id: 'builtin_lower_b',
        name: 'Total Body Flush & Carries',
        createdAt: '2026-01-01',
        description: 'Low-impact aerobic flush paired with grip and full-body loaded carries',
        goalTag: 'Aerobic Flush & Carries',
        exercises: [
          { name: 'Zone 2 Stationary Cycling', targetSets: 1, targetReps: 15, targetWeight: 0, targetUnit: unit, notes: '15 min warm-up flush cadence' },
          { name: 'Dumbbell Bench Press', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 40 : 18, targetUnit: unit, notes: 'Moderate load, controlled eccentric' },
          { name: 'Single-Arm Dumbbell Row', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 45 : 20, targetUnit: unit, notes: 'Full lat stretch and upper back density' },
          { name: 'Bodyweight Squats', targetSets: 3, targetReps: 20, targetWeight: 0, targetUnit: unit, notes: 'Continuous tempo quad flushing' },
          { name: "Farmer's Walk", targetSets: 4, targetReps: 4, targetWeight: isLbs ? 50 : 24, targetUnit: unit, notes: '4 × 40m heavy carry for work capacity & grip' },
        ],
      },
    ];
  }

  if (goal === 'general_fitness') {
    return [
      {
        id: 'builtin_upper_a',
        name: 'Upper A',
        createdAt: '2026-01-01',
        description: 'Balanced athletic upper body routine for strength, mobility, and joint health',
        goalTag: 'Fitness (8–10 reps)',
        exercises: [
          { name: 'Bench Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 145 : 65, targetUnit: unit, notes: 'Compound upper push foundation' },
          { name: 'Barbell Row', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 120 : 55, targetUnit: unit, notes: 'Back posture and scapular control' },
          { name: 'Overhead Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 75 : 35, targetUnit: unit, notes: 'Vertical pressing and core stability' },
          { name: 'Lat Pulldown', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 110 : 50, targetUnit: unit, notes: 'Vertical pulling lat sweep' },
          { name: 'Dumbbell Curl', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 25 : 12, targetUnit: unit, notes: 'Elbow flexion and joint longevity' },
        ],
      },
      {
        id: 'builtin_lower_a',
        name: 'Lower A',
        createdAt: '2026-01-01',
        description: 'Functional lower body strength and hinge fundamentals',
        goalTag: 'Fitness (8–10 reps)',
        exercises: [
          { name: 'Squat', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 185 : 85, targetUnit: unit, notes: 'Lower body foundation' },
          { name: 'Romanian Deadlift', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 155 : 70, targetUnit: unit, notes: 'Hamstring & glute hinge' },
          { name: 'Leg Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 310 : 140, targetUnit: unit, notes: 'Quad overload with back support' },
          { name: 'Calf Raise', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 100 : 45, targetUnit: unit, notes: 'Ankle stability and calf strength' },
        ],
      },
      {
        id: 'builtin_upper_b',
        name: 'Upper B',
        createdAt: '2026-01-01',
        description: 'Balanced pressing, pulling, and deltoid stability',
        goalTag: 'Fitness (8–10 reps)',
        exercises: [
          { name: 'Incline Bench', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 120 : 55, targetUnit: unit, notes: 'Upper chest pressing angle' },
          { name: 'Pull-ups', targetSets: 3, targetReps: 8, targetWeight: 0, targetUnit: unit, notes: 'Bodyweight vertical pulling' },
          { name: 'Dumbbell Shoulder Press', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 40 : 18, targetUnit: unit, notes: 'Deltoid symmetry' },
          { name: 'Lateral Raise', targetSets: 3, targetReps: 12, targetWeight: isLbs ? 18 : 8, targetUnit: unit, notes: 'Side delt shoulder caps' },
          { name: 'Tricep Extension', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 50 : 22, targetUnit: unit, notes: 'Triceps lockout strength' },
        ],
      },
      {
        id: 'builtin_lower_b',
        name: 'Lower B',
        createdAt: '2026-01-01',
        description: 'Core posterior strength and unilateral stability',
        goalTag: 'Fitness (6–10 reps)',
        exercises: [
          { name: 'Deadlift', targetSets: 3, targetReps: 6, targetWeight: isLbs ? 230 : 105, targetUnit: unit, notes: 'Full body pull power' },
          { name: 'Front Squat', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 130 : 60, targetUnit: unit, notes: 'Quad and core integration' },
          { name: 'Bulgarian Split Squat', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 30 : 14, targetUnit: unit, notes: 'Unilateral leg balance' },
          { name: 'Hamstring Curl', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 90 : 40, targetUnit: unit, notes: 'Isolated knee flexion' },
        ],
      },
    ];
  }

  // Default: 'build_muscle' (Hypertrophy with Double Progression model)
  return [
    {
      id: 'builtin_upper_a',
      name: 'Upper A',
      createdAt: '2026-01-01',
      description: 'Hypertrophy volume targeting chest, upper back, and arms with double progression',
      goalTag: 'Hypertrophy (8–12 reps)',
      exercises: [
        { name: 'Bench Press', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 155 : 70, targetUnit: unit, notes: 'Double progression: 8–12 reps. Hit 12 reps on all sets before increasing load.' },
        { name: 'Barbell Row', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 135 : 60, targetUnit: unit, notes: 'Double progression: 8–12 reps. Strict form, no body heave.' },
        { name: 'Overhead Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 90 : 40, targetUnit: unit, notes: 'Double progression: 8–12 reps. Tight core and glutes.' },
        { name: 'Lat Pulldown', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 120 : 55, targetUnit: unit, notes: 'Double progression: 10–14 reps. Deep lat stretch at top.' },
        { name: 'Dumbbell Curl', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 30 : 14, targetUnit: unit, notes: 'Double progression: 10–14 reps. Supinate wrists at peak.' },
      ],
    },
    {
      id: 'builtin_lower_a',
      name: 'Lower A',
      createdAt: '2026-01-01',
      description: 'Quad and hamstring mass development with progressive double-progression volume',
      goalTag: 'Hypertrophy (8–12 reps)',
      exercises: [
        { name: 'Squat', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 210 : 95, targetUnit: unit, notes: 'Double progression: 8–12 reps. Hit depth before adding weight.' },
        { name: 'Romanian Deadlift', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 175 : 80, targetUnit: unit, notes: 'Double progression: 8–12 reps. Deep hamstring stretch.' },
        { name: 'Leg Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 350 : 160, targetUnit: unit, notes: 'Double progression: 10–15 reps. High quad mechanical tension.' },
        { name: 'Calf Raise', targetSets: 4, targetReps: 12, targetWeight: isLbs ? 110 : 50, targetUnit: unit, notes: 'Double progression: 12–16 reps. Pause at bottom stretch.' },
      ],
    },
    {
      id: 'builtin_upper_b',
      name: 'Upper B',
      createdAt: '2026-01-01',
      description: 'Incline chest and lateral deltoid emphasis with vertical pulling',
      goalTag: 'Hypertrophy (8–12 reps)',
      exercises: [
        { name: 'Incline Bench', targetSets: 4, targetReps: 8, targetWeight: isLbs ? 135 : 60, targetUnit: unit, notes: 'Double progression: 8–12 reps. Upper chest focus.' },
        { name: 'Pull-ups', targetSets: 3, targetReps: 8, targetWeight: 0, targetUnit: unit, notes: 'Double progression: aim for 3×10 clean bodyweight reps.' },
        { name: 'Dumbbell Shoulder Press', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 45 : 22, targetUnit: unit, notes: 'Double progression: 8–12 reps. Smooth vertical drive.' },
        { name: 'Lateral Raise', targetSets: 4, targetReps: 12, targetWeight: isLbs ? 20 : 10, targetUnit: unit, notes: 'Double progression: 12–15 reps. Slight forward lean.' },
        { name: 'Tricep Extension', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 55 : 25, targetUnit: unit, notes: 'Double progression: 10–14 reps. Lock out long head.' },
      ],
    },
    {
      id: 'builtin_lower_b',
      name: 'Lower B',
      createdAt: '2026-01-01',
      description: 'Posterior chain density with unilateral quad hypertrophy',
      goalTag: 'Hypertrophy (8–12 reps)',
      exercises: [
        { name: 'Deadlift', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 255 : 115, targetUnit: unit, notes: 'Double progression: 6–10 reps. Crisp bar speed.' },
        { name: 'Front Squat', targetSets: 3, targetReps: 8, targetWeight: isLbs ? 145 : 65, targetUnit: unit, notes: 'Double progression: 8–12 reps. Upright torso.' },
        { name: 'Bulgarian Split Squat', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 35 : 16, targetUnit: unit, notes: 'Double progression: 8–12 reps per leg.' },
        { name: 'Hamstring Curl', targetSets: 3, targetReps: 10, targetWeight: isLbs ? 100 : 45, targetUnit: unit, notes: 'Double progression: 10–14 reps. Control eccentric.' },
      ],
    },
  ];
}


/**
 * Apply an exercise-level difficulty rating to a workout exercise WITHOUT
 * overwriting per-set RPEs that were explicitly logged. Sets with no logged
 * RPE are backfilled with the rating; sets with a logged RPE keep it.
 * (Regression guard for the History "Avg RPE" corruption bug.)
 */
export function applyExerciseEffortRating(
  exercise: WorkoutExercise,
  rpe: number,
  label: 'easy' | 'good' | 'hard'
): WorkoutExercise {
  return {
    ...exercise,
    effortRating: { rpe, label },
    sets: exercise.sets.map((s) => (s.rpe === undefined ? { ...s, rpe } : s)),
  };
}
