/**
 * PR re-evaluation after a completed-set edit (Certification F3).
 *
 * PRs are STORED records (state.prs), minted once at workout-finish
 * time by ActiveWorkoutScreen's detection: per exercise, at most one
 * record — an all-time 1RM PR when the session's top set beats the
 * best recorded e1RM, else a rep PR when a set beats every previous
 * rep count at (about) the same load. Nothing ever revisited those
 * records, so correcting a mis-logged set in History left a stale PR
 * standing on a performance the athlete says never happened — and a
 * set mis-logged LOW never earned the PR it deserved.
 *
 * This module is the pure planner for fixing that. It re-runs the
 * finish detection (same filters, same caps, same rounding) for one
 * exercise of one edited session and decides, conservatively:
 *
 * - WHICH existing record the session itself minted (the
 *   "attributable" record): it must match the exercise, the workout's
 *   date, an auto-generated note, and the exact weight/reps/e1RM the
 *   PRE-edit sets would have produced. A manually added or imported
 *   record never matches all four, so user-owned PRs are never
 *   touched.
 * - WHAT the corrected sets earn against every OTHER record: if they
 *   still earn a PR, the attributable record is updated in place; if
 *   they no longer earn one, the attributable record is deleted (it
 *   described a set that, as corrected, was never performed); if the
 *   session minted nothing but the corrected sets now beat every
 *   record, a new record is created — dated on the workout, not
 *   today, because that is when the performance happened.
 *
 * The caller applies the plan through the ordinary store actions
 * (addPR / updatePR / deletePR), so sanitization, tombstones, XP and
 * sync stamping all follow the established paths.
 */
import { calculateOneRepMax, getEffectiveExerciseLoad, isBodyweightExercise } from './strength-standards';
import { MAX_WORKOUT_WEIGHT_KG } from './workout-engine';
import { DEFAULT_BODYWEIGHT_KG } from './defaults';
import { isSetCompleted } from './types';
import type { PersonalRecord, Unit, WorkoutEntry, WorkoutSet } from './types';

export interface SessionTopSet {
  weightKg: number;
  reps: number;
  e1RMKg: number;
}

export interface SessionRepPR {
  weightKg: number;
  weightLbs: number;
  reps: number;
  prevReps: number;
  e1RMKg: number;
}

export interface SessionBest {
  topSet: SessionTopSet | null;
  bestRepPR: SessionRepPR | null;
}

export interface SessionPROutcome {
  kind: '1rm' | 'reps';
  weightKg: number;
  weightLbs: number;
  reps: number;
  oneRepMax: number;
  prevReps?: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The session's best performances for one exercise — the raw material
 * of finish-time detection, ungated. Mirrors ActiveWorkoutScreen:
 * completed non-warmup sets only, lbs→kg conversion, the 500 kg
 * sanity cap, bodyweight exercises evaluated at bodyweight + added
 * load, dampened-Epley e1RM. `historyWorkouts` feeds the rep-PR scan
 * and must EXCLUDE the session being evaluated (at finish time the
 * session was not yet in history either).
 */
export function computeSessionBest(
  exerciseName: string,
  sets: WorkoutSet[],
  historyWorkouts: WorkoutEntry[],
  bodyweightKg: number,
): SessionBest {
  const isBW = isBodyweightExercise(exerciseName);
  const userBW = bodyweightKg || DEFAULT_BODYWEIGHT_KG;
  let topSet: SessionTopSet | null = null;
  let bestRepPR: SessionRepPR | null = null;

  for (const s of sets || []) {
    if (s.isWarmup || !isSetCompleted(s)) continue;
    const sWeight = parseFloat(String(s.weight)) || 0;
    const sReps = parseInt(String(s.reps), 10) || 0;
    if (!(sReps > 0 && (sWeight > 0 || isBW))) continue;
    const wKg = s.unit === 'lbs' ? sWeight * 0.453592 : sWeight;
    // SIM-P1-06: an above-cap load never feeds PR detection.
    if (!isBW && wKg > MAX_WORKOUT_WEIGHT_KG) continue;
    const e1rm = calculateOneRepMax(getEffectiveExerciseLoad(exerciseName, wKg, userBW), sReps);

    if (!topSet || e1rm > topSet.e1RMKg) {
      topSet = { weightKg: round1(wKg), reps: sReps, e1RMKg: round1(e1rm) };
    }

    let maxPrevRepsAtWeight = 0;
    for (const pastWk of historyWorkouts || []) {
      for (const pastEx of pastWk.exercises || []) {
        if (pastEx.name.toLowerCase() !== exerciseName.toLowerCase()) continue;
        for (const pastSet of pastEx.sets || []) {
          if (pastSet.isWarmup || !isSetCompleted(pastSet)) continue;
          const pw = parseFloat(String(pastSet.weight)) || 0;
          const pr = parseInt(String(pastSet.reps), 10) || 0;
          const pwKg = pastSet.unit === 'lbs' ? pw * 0.453592 : pw;
          if (Math.abs(pwKg - wKg) < 1.0 && pr > maxPrevRepsAtWeight) {
            maxPrevRepsAtWeight = pr;
          }
        }
      }
    }

    if (maxPrevRepsAtWeight > 0 && sReps > maxPrevRepsAtWeight) {
      if (!bestRepPR || sReps - maxPrevRepsAtWeight > bestRepPR.reps - bestRepPR.prevReps) {
        bestRepPR = {
          weightKg: round1(wKg),
          weightLbs: round1(wKg * 2.20462),
          reps: sReps,
          prevReps: maxPrevRepsAtWeight,
          e1RMKg: round1(e1rm),
        };
      }
    }
  }

  return { topSet, bestRepPR };
}

/**
 * Applies the finish-time gate to a raw session best: a 1RM PR when
 * the top set's e1RM beats the best previously recorded e1RM,
 * otherwise a rep PR when one was found, otherwise nothing.
 */
export function gateSessionOutcome(best: SessionBest, priorBest1RMKg: number): SessionPROutcome | null {
  if (best.topSet && best.topSet.e1RMKg > priorBest1RMKg && best.topSet.e1RMKg > 0) {
    return {
      kind: '1rm',
      weightKg: best.topSet.weightKg,
      weightLbs: round1(best.topSet.weightKg * 2.20462),
      reps: best.topSet.reps,
      oneRepMax: best.topSet.e1RMKg,
    };
  }
  if (best.bestRepPR) {
    return {
      kind: 'reps',
      weightKg: best.bestRepPR.weightKg,
      weightLbs: best.bestRepPR.weightLbs,
      reps: best.bestRepPR.reps,
      oneRepMax: best.bestRepPR.e1RMKg,
      prevReps: best.bestRepPR.prevReps,
    };
  }
  return null;
}

const BASELINE_NOTE = 'Baseline established from first session';
const ALL_TIME_NOTE = 'All-Time 1RM PR';

function outcomeNote(outcome: SessionPROutcome, isFirstExposure: boolean, userUnit: Unit): string {
  if (outcome.kind === '1rm') {
    return isFirstExposure ? BASELINE_NOTE : ALL_TIME_NOTE;
  }
  const shown = userUnit === 'lbs' ? outcome.weightLbs : outcome.weightKg;
  return `Rep PR: +${outcome.reps - (outcome.prevReps || 0)} reps at ${shown} ${userUnit}`;
}

function outcomeMatchesRecord(outcome: SessionPROutcome, pr: PersonalRecord): boolean {
  const kindMatches =
    outcome.kind === '1rm'
      ? pr.prType === '1rm' && (pr.notes === ALL_TIME_NOTE || pr.notes === BASELINE_NOTE)
      : pr.prType === 'reps' && typeof pr.notes === 'string' && pr.notes.startsWith('Rep PR:');
  return (
    kindMatches &&
    Math.abs((pr.weightKg || 0) - outcome.weightKg) <= 0.051 &&
    pr.reps === outcome.reps &&
    Math.abs((pr.oneRepMax || 0) - outcome.oneRepMax) <= 0.051
  );
}

/**
 * Finds the record the session itself minted, by re-deriving the
 * outcome the PRE-edit sets produced and matching it exactly
 * (exercise + workout date + auto note + values). Returns undefined
 * when nothing matches — the conservative case: no record is touched.
 */
export function findAttributablePR(
  prs: PersonalRecord[],
  exerciseName: string,
  workoutDate: string,
  oldBest: SessionBest,
): PersonalRecord | undefined {
  // Finish mints the 1RM outcome when it gates, else the rep outcome —
  // but the gate compared against records as they stood THEN. For
  // attribution we only need the values the session performed, so try
  // both performed outcomes (1RM first, as finish prioritizes it).
  const candidates: SessionPROutcome[] = [];
  if (oldBest.topSet) {
    candidates.push({
      kind: '1rm',
      weightKg: oldBest.topSet.weightKg,
      weightLbs: round1(oldBest.topSet.weightKg * 2.20462),
      reps: oldBest.topSet.reps,
      oneRepMax: oldBest.topSet.e1RMKg,
    });
  }
  if (oldBest.bestRepPR) {
    candidates.push({
      kind: 'reps',
      weightKg: oldBest.bestRepPR.weightKg,
      weightLbs: oldBest.bestRepPR.weightLbs,
      reps: oldBest.bestRepPR.reps,
      oneRepMax: oldBest.bestRepPR.e1RMKg,
      prevReps: oldBest.bestRepPR.prevReps,
    });
  }
  for (const candidate of candidates) {
    const match = (prs || []).find(
      (pr) =>
        pr.exercise.trim().toLowerCase() === exerciseName.trim().toLowerCase() &&
        pr.date === workoutDate &&
        outcomeMatchesRecord(candidate, pr),
    );
    if (match) return match;
  }
  return undefined;
}

export interface PRChangePlan {
  create?: Omit<PersonalRecord, 'id'>;
  update?: { id: string; fields: Partial<PersonalRecord> };
  deleteId?: string;
}

/**
 * Plans the PR-record changes for one exercise of one edited workout.
 * `oldSets` / `newSets` are the exercise's sets (aggregated across
 * duplicate blocks of the same exercise in the session) before and
 * after the edit. Pure: reads nothing, mutates nothing.
 */
export function planPRChangesAfterSetEdit(args: {
  exerciseName: string;
  workoutDate: string;
  editedWorkoutId: string;
  oldSets: WorkoutSet[];
  newSets: WorkoutSet[];
  prs: PersonalRecord[];
  allWorkouts: WorkoutEntry[];
  bodyweightKg: number;
  userUnit: Unit;
}): PRChangePlan {
  const { exerciseName, workoutDate, editedWorkoutId, oldSets, newSets, prs, allWorkouts, bodyweightKg, userUnit } = args;
  const history = (allWorkouts || []).filter((w) => w.id !== editedWorkoutId);

  const oldBest = computeSessionBest(exerciseName, oldSets, history, bodyweightKg);
  const attributable = findAttributablePR(prs, exerciseName, workoutDate, oldBest);

  const otherRecords = (prs || []).filter(
    (pr) => pr.exercise.trim().toLowerCase() === exerciseName.trim().toLowerCase() && pr.id !== attributable?.id,
  );
  const priorBest1RMKg = otherRecords.length > 0 ? Math.max(...otherRecords.map((p) => p.oneRepMax || 0)) : 0;

  const newBest = computeSessionBest(exerciseName, newSets, history, bodyweightKg);
  const newOutcome = gateSessionOutcome(newBest, priorBest1RMKg);
  const isFirstExposure = otherRecords.length === 0;

  if (attributable && newOutcome) {
    if (outcomeMatchesRecord(newOutcome, attributable)) return {};
    return {
      update: {
        id: attributable.id,
        fields: {
          weightKg: newOutcome.weightKg,
          weightLbs: newOutcome.weightLbs,
          reps: newOutcome.reps,
          oneRepMax: newOutcome.oneRepMax,
          prType: newOutcome.kind,
          notes: outcomeNote(newOutcome, isFirstExposure, userUnit),
        },
      },
    };
  }
  if (attributable && !newOutcome) {
    return { deleteId: attributable.id };
  }
  if (!attributable && newOutcome) {
    return {
      create: {
        exercise: exerciseName,
        weightKg: newOutcome.weightKg,
        weightLbs: newOutcome.weightLbs,
        reps: newOutcome.reps,
        oneRepMax: newOutcome.oneRepMax,
        date: workoutDate,
        notes: outcomeNote(newOutcome, isFirstExposure, userUnit),
        prType: newOutcome.kind,
      },
    };
  }
  return {};
}
