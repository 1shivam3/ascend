/**
 * coach-engine.ts — The Real Coach Engine: pure decision logic for ASCEND.
 *
 * Six systems, all deterministic and fully testable:
 *  1. Stall detection (per-exercise e1RM trend → variation / rep_scheme / deload / technique)
 *  2. Auto-regulation (RPE + performance vs prescription → next-session adjustments)
 *  3. Readiness score (acute:chronic load, RPE trend, rest, manual check-in)
 *  4. Coach's voice (post-workout takes + weekly reviews that sound like a coach)
 *  5. Accountability (missed sessions, patterns, gentle check-ins)
 *  6. Dynamic nutrition (weight-trend regression, calorie adjustments, plateau answers)
 *
 * Reuses: calculateOneRepMax / normalizeExerciseName (strength-standards),
 * getExerciseHistorySessions / getStimulusPreservingSwaps (lifter-twin),
 * calculateWorkoutTonnage (ai-coach), getWeekDateStrings / plural / formatKg (formatters).
 *
 * Tone rules: plain English, no unexplained jargon, no shame or guilt language.
 */

import {
  AthleteGoal,
  BodyMetricEntry,
  DayOfWeek,
  Gender,
  MacroGoals,
  Unit,
  WorkoutEntry,
  WorkoutExercise,
  WorkoutSet,
  isSetCompleted,
} from './types';
import { calculateOneRepMax, normalizeExerciseName, MAX_PR_WEIGHT_KG } from './strength-standards';
import {
  getExerciseHistorySessions,
  getStimulusPreservingSwaps,
} from './lifter-twin';
import { calculateWorkoutTonnage } from './ai-coach';
import { SAFE_MIN_CALORIES } from './macros';
import { getWeekDateStrings, plural, formatKg, getLocalTodayStr, parseLocalDate } from './formatters';
import { EXERCISE_LIBRARY } from './exercise-library';
import { DAY_ORDER, type LocalizedSentence } from './coach-i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86400000;

/** Whole-day difference between two YYYY-MM-DD strings (b - a). */
function daysBetween(a: string, b: string): number {
  const da = a.split('T')[0];
  const db = b.split('T')[0];
  return Math.round((new Date(db).getTime() - new Date(da).getTime()) / DAY_MS);
}

function toKg(set: WorkoutSet): number {
  const w = typeof set.weight === 'number' && Number.isFinite(set.weight) ? set.weight : 0;
  return set.unit === 'lbs' ? w * 0.453592 : w;
}

/**
 * Average effort rating for an exercise: per-set RPEs first, falling back to
 * the post-exercise effort rating (which never overwrites per-set RPEs).
 */
function avgExerciseRpe(ex: WorkoutExercise): number | undefined {
  const sets = (ex.sets || []).filter((s) => isSetCompleted(s) && s.reps > 0);
  const rpes = sets
    .map((s) => s.rpe)
    .filter((r): r is number => typeof r === 'number' && Number.isFinite(r) && r > 0);
  if (rpes.length > 0) return rpes.reduce((a, b) => a + b, 0) / rpes.length;
  const fb = ex.effortRating?.rpe;
  return typeof fb === 'number' && fb > 0 ? fb : undefined;
}

/** Best estimated 1RM (kg) across completed sets of one exercise in one session. */
function sessionBestE1rmKg(ex: WorkoutExercise): number {
  let best = 0;
  for (const s of ex.sets || []) {
    if (!isSetCompleted(s) || s.reps <= 0) continue;
    const e1rm = calculateOneRepMax(toKg(s), s.reps);
    if (e1rm > best) best = e1rm;
  }
  return best;
}

function findExercise(workout: WorkoutEntry, name: string): WorkoutExercise | undefined {
  const target = normalizeExerciseName(name).toLowerCase();
  return (workout.exercises || []).find(
    (e) => normalizeExerciseName(e.name).toLowerCase() === target
  );
}

/** Least-squares slope of y on x (x in days). */
function linearSlope(xs: number[], ys: number[]): { slope: number; rSquared: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, rSquared: 0 };
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) * (xs[i] - meanX);
    ssTot += (ys[i] - meanY) * (ys[i] - meanY);
  }
  const slope = den === 0 ? 0 : num / den;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = meanY + slope * (xs[i] - meanX);
    ssRes += (ys[i] - pred) * (ys[i] - pred);
  }
  const rSquared = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, rSquared };
}

function roundToStep(value: number, unit: Unit): number {
  const step = unit === 'lbs' ? 5 : 2.5;
  return Math.round(value / step) * step;
}

/** Muscle group lookup from the exercise library (normalized name → muscle). */
const MUSCLE_BY_EXERCISE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const item of EXERCISE_LIBRARY) {
    map[normalizeExerciseName(item.name).toLowerCase()] = item.muscle;
  }
  return map;
})();

function exerciseMuscle(name: string): string | undefined {
  return MUSCLE_BY_EXERCISE[normalizeExerciseName(name).toLowerCase()];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. STALL DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export type StallSuggestion = 'variation' | 'rep_scheme' | 'deload' | 'technique';

export interface StallFlag {
  exercise: string;
  sessionsStalled: number;
  sessionsAnalyzed: number;
  /** Best e1RM (kg) in the latest session. */
  lastE1rmKg: number;
  /** Best e1RM (kg) seen in the analyzed window. */
  peakE1rmKg: number;
  suggestion: StallSuggestion;
  /** Concrete variation target when suggestion is 'variation'. */
  variationName?: string;
  variationSets?: number;
  variationReps?: number;
  /** Plain-English diagnosis naming the likely cause. */
  explanation: string;
}

const MIN_SESSIONS_FOR_STALL = 4;
const STALL_WINDOW = 6;
/** Less than 2% e1RM growth across the window counts as "no meaningful progress". */
const MEANINGFUL_PROGRESS_PCT = 2;

function stallSuggestionFor(
  e1rms: number[],
  rpes: (number | undefined)[],
  medianReps: number,
  repCv: number
): StallSuggestion {
  const known = rpes.filter((r): r is number => r !== undefined);
  const latest = known.length > 0 ? known[known.length - 1] : undefined;
  const earliest = known.length > 0 ? known[0] : undefined;
  const rpeRising = latest !== undefined && earliest !== undefined && latest - earliest >= 1;

  // Same weight, climbing effort = fatigue, not a weak muscle. Back off.
  if (latest !== undefined && latest >= 9 && rpeRising) return 'deload';
  // High reps, low effort = the stimulus is too light. Change the rep scheme.
  if (medianReps >= 10 && latest !== undefined && latest <= 7) return 'rep_scheme';
  // Wildly inconsistent reps at the same weight = execution breaking down.
  if (repCv > 0.4) return 'technique';
  // The classic plateau: stimulus is stale. Rotate the movement.
  return 'variation';
}

/**
 * Detects stalled exercises: no meaningful e1RM progress across the last
 * 4–6 sessions. Returns one flag per stalled exercise with a plain-English
 * diagnosis and a concrete fix.
 */
export function detectStalls(
  workouts: WorkoutEntry[],
  options?: { minSessions?: number }
): StallFlag[] {
  if (!workouts || workouts.length === 0) return [];
  const minSessions = options?.minSessions ?? MIN_SESSIONS_FOR_STALL;

  // Group sessions by normalized exercise name.
  const names = new Map<string, string>(); // normalized -> display name
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      const norm = normalizeExerciseName(ex.name).toLowerCase();
      if (!names.has(norm)) names.set(norm, ex.name);
    }
  }

  const flags: StallFlag[] = [];

  for (const [norm, display] of names) {
    const sessions = getExerciseHistorySessions(display, workouts, 'kg').slice(-STALL_WINDOW);
    if (sessions.length < minSessions) continue;

    const e1rms = sessions.map((s) => s.bestE1RM).filter((v) => v > 0);
    if (e1rms.length < minSessions) continue;

    const first = e1rms[0];
    const peak = Math.max(...e1rms);
    const last = e1rms[e1rms.length - 1];
    const growthPct = first > 0 ? ((peak - first) / first) * 100 : 0;
    if (growthPct >= MEANINGFUL_PROGRESS_PCT) continue; // still progressing

    // Sessions since the last meaningful new peak (>1% above the running best).
    // A flat line at the old peak counts as stalled — that's the classic plateau.
    let runningPeak = 0;
    let lastProgressIdx = -1;
    for (let i = 0; i < e1rms.length; i++) {
      if (e1rms[i] > runningPeak * 1.01) {
        runningPeak = e1rms[i];
        lastProgressIdx = i;
      }
    }
    const stalled = e1rms.length - 1 - lastProgressIdx;
    if (stalled < 3) continue;

    const rpes = sessions.map((s) => {
      const rp = s.sets
        .map((x) => x.rpe)
        .filter((r): r is number => typeof r === 'number' && r > 0);
      return rp.length > 0 ? rp.reduce((a, b) => a + b, 0) / rp.length : undefined;
    });

    const allReps = sessions.flatMap((s) => s.sets.map((x) => x.reps)).filter((r) => r > 0);
    const sortedReps = [...allReps].sort((a, b) => a - b);
    const medianReps = sortedReps.length > 0 ? sortedReps[Math.floor(sortedReps.length / 2)] : 0;
    const meanReps = allReps.length > 0 ? allReps.reduce((a, b) => a + b, 0) / allReps.length : 0;
    const repSd =
      allReps.length > 1
        ? Math.sqrt(allReps.reduce((a, b) => a + (b - meanReps) * (b - meanReps), 0) / allReps.length)
        : 0;
    const repCv = meanReps > 0 ? repSd / meanReps : 0;

    const suggestion = stallSuggestionFor(e1rms, rpes, medianReps, repCv);

    let variationName: string | undefined;
    let variationSets: number | undefined;
    let variationReps: number | undefined;
    if (suggestion === 'variation') {
      const swap = getStimulusPreservingSwaps(display)[0];
      if (swap) {
        variationName = swap.target;
        variationSets = swap.targetSets;
        variationReps = swap.targetReps;
      }
    }

    const e1rmStr = formatKg(last);
    const known = rpes.filter((r): r is number => r !== undefined);
    const latestRpe = known.length > 0 ? known[known.length - 1] : undefined;
    const rpeNote =
      latestRpe !== undefined
        ? ` while the effort keeps climbing (latest sessions feel like RPE ${Math.round(latestRpe)})`
        : '';

    let explanation: string;
    switch (suggestion) {
      case 'deload':
        explanation =
          `Your ${display} has been stuck around ${e1rmStr} estimated max for ${stalled} sessions${rpeNote}. ` +
          `Same weight, rising effort is the classic sign of accumulated fatigue, not a weak muscle. ` +
          `Take a deload week: cut your ${display} volume roughly in half for one week, then come back to this weight fresh.`;
        break;
      case 'rep_scheme':
        explanation =
          `Your ${display} has been stuck around ${e1rmStr} estimated max for ${stalled} sessions` +
          (latestRpe !== undefined
            ? `, and those high-rep sets are feeling easier (RPE ${Math.round(latestRpe)}). `
            : `. `) +
          `The weight is too light to force adaptation anymore. Switch to heavier sets of 4–6 reps for 3 weeks, ` +
          `then retest — strength built there will carry straight back to your normal rep range.`;
        break;
      case 'technique':
        explanation =
          `Your ${display} has been stuck around ${e1rmStr} estimated max for ${stalled} sessions, ` +
          `and your reps are all over the place at the same weight. That inconsistency usually means the lift is ` +
          `breaking down technically before the muscle is truly challenged. Drop the weight about 10% for two weeks, ` +
          `film one top set, and build back up with clean, repeatable reps.`;
        break;
      case 'variation':
      default:
        explanation =
          `Your ${display} has been stuck around ${e1rmStr} estimated max for ${stalled} sessions. ` +
          `Your body has adapted to this exact movement, so the same stimulus no longer forces progress. ` +
          (variationName
            ? `Swap it for ${variationName} (${variationSets} × ${variationReps}) for 3–4 weeks — a novel stimulus ` +
              `for the same muscles — then come back to ${display} and the numbers should move again.`
            : `Rotate to a different movement for the same muscles for 3–4 weeks, then come back to ${display} fresh.`);
        break;
    }

    flags.push({
      exercise: display,
      sessionsStalled: stalled,
      sessionsAnalyzed: sessions.length,
      lastE1rmKg: Math.round(last * 10) / 10,
      peakE1rmKg: Math.round(peak * 10) / 10,
      suggestion,
      variationName,
      variationSets,
      variationReps,
      explanation,
    });
  }

  return flags;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. AUTO-REGULATION
// ─────────────────────────────────────────────────────────────────────────────

export interface PlannedTarget {
  exercise: string;
  weight: number;
  reps: number;
  sets?: number;
  unit: Unit;
}

export interface TargetAdjustment {
  exercise: string;
  oldTarget: { weight: number; reps: number; unit: Unit };
  newTarget: { weight: number; reps: number; unit: Unit };
  action: 'back_off' | 'push' | 'hold';
  /** Plain-English reason, coach voice. */
  reason: string;
  /** LIVE-P1-03: same reason as a localizable key + params (rendered via coach-i18n). */
  reasonI18n?: LocalizedSentence;
}

const MAX_SINGLE_ADJUST_PCT = 7.5;

/**
 * Adjusts the next session's targets from how the last session actually went:
 * RPE (effort rating) plus reps achieved vs prescribed. Conservative — never
 * an absurd jump, never increases into pain.
 */
export function adjustNextTargets(
  lastWorkout: WorkoutEntry,
  plannedTargets: PlannedTarget[]
): TargetAdjustment[] {
  if (!lastWorkout || !plannedTargets || plannedTargets.length === 0) return [];

  const adjustments: TargetAdjustment[] = [];

  for (const target of plannedTargets) {
    const ex = findExercise(lastWorkout, target.exercise);
    if (!ex) continue;

    const done = (ex.sets || []).filter((s) => isSetCompleted(s) && s.reps > 0);
    if (done.length === 0) continue;

    const avgRpe = avgExerciseRpe(ex);

    // Reps achieved vs prescribed.
    let prescribedTotal = 0;
    let achievedTotal = 0;
    let prescribedKnown = false;
    for (const s of done) {
      const prescribed = typeof s.prescribedReps === 'number' && s.prescribedReps > 0 ? s.prescribedReps : target.reps;
      if (typeof s.prescribedReps === 'number' && s.prescribedReps > 0) prescribedKnown = true;
      prescribedTotal += prescribed;
      achievedTotal += Math.min(s.reps, prescribed);
    }
    const missedReps = prescribedTotal > 0 && achievedTotal < prescribedTotal * 0.95;

    // Pain includes pain-swap records: the entry was renamed to the
    // substitute, so the flag for THIS exercise may live on another
    // entry's painfulExerciseName.
    const inPain =
      ex.reportsPain === true ||
      lastWorkout.reportsPain === true ||
      (lastWorkout.exercises || []).some(
        (e) =>
          e.painfulExerciseName &&
          e.painfulExerciseName.trim().toLowerCase() === target.exercise.trim().toLowerCase()
      );

    const oldWeightKg = target.unit === 'lbs' ? target.weight * 0.453592 : target.weight;
    let pct = 0;
    let action: TargetAdjustment['action'] = 'hold';
    let reason: string;
    // LIVE-P1-03: every branch sets reasonI18n next to reason, so the
    // UI can render the same call in Hindi (exercise names via EXERCISE_NAME_HI).
    let reasonI18n: LocalizedSentence | undefined;

    if (inPain) {
      reason =
        `Holding ${target.exercise} where it is — you flagged pain in the last session. ` +
        `Train around it, not through it; if it lingers past a week, get it checked rather than pushing the load.`;
      reasonI18n = { key: 'coachDigest.adjPain', params: { exercise: target.exercise } };
    } else if (avgRpe !== undefined && avgRpe >= 9 && missedReps) {
      pct = -5;
      action = 'back_off';
      reason =
        `Last session was a grinder (RPE ${fmtRpe(avgRpe)}) and reps were missed, so I'm pulling ` +
        `${target.exercise} back 5% next session. This isn't lost progress — it's how you bank the strength ` +
        `you just built instead of burying yourself under it.`;
      reasonI18n = { key: 'coachDigest.adjBackOff5', params: { exercise: target.exercise, rpe: fmtRpe(avgRpe) } };
    } else if (avgRpe !== undefined && avgRpe >= 9) {
      pct = -2.5;
      action = 'back_off';
      reason =
        `You hit every rep but rated it RPE ${fmtRpe(avgRpe)} — that's maximal effort with no margin. ` +
        `Easing ${target.exercise} back 2.5% next session keeps the stimulus while letting fatigue clear.`;
      reasonI18n = { key: 'coachDigest.adjBackOff25', params: { exercise: target.exercise, rpe: fmtRpe(avgRpe) } };
    } else if (avgRpe !== undefined && avgRpe <= 6 && !missedReps) {
      pct = 5;
      action = 'push';
      reason =
        `${target.exercise} moved easy at RPE ${fmtRpe(avgRpe)} with every rep crisp. ` +
        `You've got room, so we're adding 5% — aggressive enough to matter, small enough to keep your form honest.`;
      reasonI18n = { key: 'coachDigest.adjPush5', params: { exercise: target.exercise, rpe: fmtRpe(avgRpe) } };
    } else if (avgRpe !== undefined && avgRpe <= 7 && !missedReps) {
      pct = 2.5;
      action = 'push';
      reason =
        `${target.exercise} felt controlled at RPE ${fmtRpe(avgRpe)} and no reps were missed. ` +
        `A 2.5% bump keeps the progression ticking without outrunning your recovery.`;
      reasonI18n = { key: 'coachDigest.adjPush25', params: { exercise: target.exercise, rpe: fmtRpe(avgRpe) } };
    } else {
      const rpeNote = avgRpe !== undefined ? ` (RPE ${fmtRpe(avgRpe)})` : '';
      const missedNote = missedReps ? ' Some reps were missed,' : '';
      reason =
        `Holding ${target.exercise} steady${rpeNote}.${missedNote} The load is in the right zone — ` +
        `right now the win is repeating it cleanly, not chasing a bigger number.`;
      reasonI18n = {
        key: missedReps ? 'coachDigest.adjHoldMissed' : 'coachDigest.adjHold',
        params: { exercise: target.exercise, rpeNote },
      };
    }

    // Never an absurd jump; never cross sanity bounds.
    const clampedPct = Math.max(-MAX_SINGLE_ADJUST_PCT, Math.min(MAX_SINGLE_ADJUST_PCT, pct));
    let newWeightKg = oldWeightKg * (1 + clampedPct / 100);
    const step = target.unit === 'lbs' ? 5 : 2.5;
    newWeightKg = Math.max(step, Math.min(MAX_PR_WEIGHT_KG, newWeightKg));
    const newWeight = roundToStep(
      target.unit === 'lbs' ? newWeightKg * 2.20462 : newWeightKg,
      target.unit
    );
    const oldRounded = roundToStep(target.weight, target.unit);

    if (newWeight === oldRounded && action !== 'hold') {
      // Rounding erased the change — be honest, it's a hold.
      action = 'hold';
      reason =
        `The math says ${target.exercise} should move ${clampedPct > 0 ? 'up' : 'down'} slightly, ` +
        `but it's smaller than the smallest plate jump, so we're holding this week and letting the reps do the talking.`;
      reasonI18n = {
        key: clampedPct > 0 ? 'coachDigest.adjRoundingHoldUp' : 'coachDigest.adjRoundingHoldDown',
        params: { exercise: target.exercise },
      };
    }

    adjustments.push({
      exercise: target.exercise,
      oldTarget: { weight: oldRounded, reps: target.reps, unit: target.unit },
      newTarget: { weight: action === 'hold' ? oldRounded : newWeight, reps: target.reps, unit: target.unit },
      action,
      reason,
      reasonI18n,
    });

    // `prescribedKnown` is informational only — target.reps already covers
    // sessions where the plan didn't stamp prescribed reps per set.
    void prescribedKnown;
  }

  return adjustments;
}

function fmtRpe(rpe: number): string {
  return `${Math.round(rpe * 10) / 10}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. READINESS SCORE
// ─────────────────────────────────────────────────────────────────────────────

export interface ManualCheckin {
  /** 1 (terrible) – 5 (great) */
  sleep: number;
  /** 1 (wrecked) – 5 (fresh) */
  soreness: number;
  /** 1 (drained) – 5 (buzzing). Optional. */
  energy?: number;
}

export interface ReadinessResult {
  score: number; // 1–100
  band: 'primed' | 'ready' | 'caution' | 'rest';
  /** Plain-English factors behind the score. */
  factors: string[];
}

/**
 * Optional device signals (Health Connect). Every field is optional
 * and the engine behaves identically when this is absent — these only
 * refine the score when the user has connected a device. Sleep is
 * applied ONLY when there is no manual check-in (the user's own
 * report wins, and the two must never double-count).
 */
export interface HealthReadinessSignals {
  /** Last night's sleep in minutes (sessions ending this morning). */
  sleepMinutesLastNight?: number;
  /** Yesterday's full-day step count. */
  stepsYesterday?: number;
}

const READINESS_START = 100;

/**
 * Manual check-in weights — points per step away from neutral (3), applied
 * PER INPUT (never averaged: averaging diluted a single bad signal 2–3× and
 * left a 3–4 "dead zone" where selections changed nothing — the check-in
 * must visibly move the score or users rightly conclude it is decorative).
 *
 *   sleep:    (v − 3) × 4  →  −8 … +8   (full 1→5 swing: 16 points)
 *   soreness: (v − 3) × 4  →  −8 … +8   (full swing: 16 points;
 *             v is freshness — 1 = wrecked, 5 = fresh, per ManualCheckin)
 *   energy:   (v − 3) × 3  →  −6 … +6   (full swing: 12 points)
 *
 * Combined range −22 … +22: a terrible night can pull a strong score down
 * a full band, but the check-in can neither erase nor manufacture the
 * training-load signals (ACWR −20, RPE drift −15, streak −15), which stay
 * the backbone of the score.
 */
const CHECKIN_STEP_POINTS = { sleep: 4, soreness: 4, energy: 3 } as const;

/**
 * Score delta + factor line for a manual check-in. Inputs the user never
 * set stay neutral: energy is optional (absent = 0 contribution), and the
 * sheet defaults unset sleep/soreness to 3 when it saves, so a partial
 * check-in never invents a penalty or a bonus.
 */
function manualCheckinAdjustment(checkin: ManualCheckin): { delta: number; factor: string | null } {
  const clamp15 = (v: number) => {
    const n = Math.round(v);
    return Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : 3;
  };
  const sleep = clamp15(checkin.sleep);
  const soreness = clamp15(checkin.soreness);
  const energy = typeof checkin.energy === 'number' ? clamp15(checkin.energy) : undefined;

  let delta = (sleep - 3) * CHECKIN_STEP_POINTS.sleep + (soreness - 3) * CHECKIN_STEP_POINTS.soreness;
  if (energy !== undefined) delta += (energy - 3) * CHECKIN_STEP_POINTS.energy;

  if (delta < 0) {
    const complaints: string[] = [];
    if (sleep < 3) complaints.push('sleep was rough');
    if (soreness < 3) complaints.push("you're still sore");
    if (energy !== undefined && energy < 3) complaints.push('energy is low');
    return {
      delta,
      factor:
        `Your check-in says ${complaints.length > 0 ? complaints.join(' and ') : 'recovery is off'}. ` +
        `Bad recovery days are for technique work and easy volume — save the heavy stuff for when you feel human again.`,
    };
  }
  if (delta > 0) {
    const strengths: string[] = [];
    if (sleep > 3) strengths.push('you slept well');
    if (soreness > 3) strengths.push('your body feels fresh');
    if (energy !== undefined && energy > 3) strengths.push('energy is high');
    return {
      delta,
      factor:
        `Your check-in helps today: ${strengths.length > 0 ? strengths.join(' and ') : 'you feel better than usual'}. ` +
        `A good day to execute the session as planned — the score already reflects it.`,
    };
  }
  return { delta: 0, factor: null };
}

/**
 * Readiness 1–100 from acute:chronic training load, RPE trend, consecutive
 * training days without rest, optional manual check-in, and rapid weight loss.
 * Conservative by design: thin data or conflicting signals push toward caution.
 */
export function calculateReadiness(
  workouts: WorkoutEntry[],
  bodyMetrics: BodyMetricEntry[],
  manualCheckin?: ManualCheckin,
  healthSignals?: HealthReadinessSignals
): ReadinessResult {
  const factors: string[] = [];
  const today = getLocalTodayStr();
  const sorted = [...(workouts || [])].sort((a, b) => (a.date < b.date ? -1 : 1));

  // Health Connect signals (optional): device sleep + yesterday's
  // steps. Sleep counts only without a manual check-in (never
  // double-count), and steps use YESTERDAY's full day so a
  // half-finished today can't look sedentary.
  const applyHealthSignals = (startScore: number): number => {
    if (!healthSignals) return startScore;
    let score = startScore;
    const sleepMin = healthSignals.sleepMinutesLastNight;
    if (!manualCheckin && typeof sleepMin === 'number' && sleepMin > 0) {
      const hours = sleepMin / 60;
      const hoursLabel = `${Math.floor(hours)}h ${Math.round(sleepMin % 60)}m`;
      if (sleepMin < 360) {
        score -= 10;
        factors.push(
          `Your device logged only about ${hoursLabel} of sleep last night. ` +
          `Short sleep blunts strength and focus — keep today technical and skip the max attempts.`
        );
      } else if (sleepMin < 420) {
        score -= 5;
        factors.push(
          `Sleep came in light last night (about ${hoursLabel} from your device). ` +
          `Train as planned, but leave a rep in reserve on the top sets.`
        );
      } else if (sleepMin >= 450) {
        score = Math.min(100, score + 2);
      }
    }
    const steps = healthSignals.stepsYesterday;
    if (typeof steps === 'number' && steps > 0 && steps < 2000) {
      score -= 5;
      factors.push(
        `Yesterday was a very low-movement day (${steps.toLocaleString()} steps). ` +
        `Blood flow is recovery — an easy warm-up and some walking between sets will help more than usual today.`
      );
    }
    return score;
  };
  const bandFor = (s: number): ReadinessResult['band'] =>
    s >= 80 ? 'primed' : s >= 60 ? 'ready' : s >= 40 ? 'caution' : 'rest';

  if (sorted.length === 0) {
    // No training history: a flat baseline, but the manual check-in and any
    // Health Connect signals still apply — the sheet must never be
    // decorative. Conservative cap: with zero load data the score can rise
    // toward 'ready', never to 'primed'. applyHealthSignals skips device
    // sleep when a manual check-in exists, so the two never double-count.
    factors.push('No recent training logged, so there is no fatigue to recover from. Start at a comfortable effort and let the first week set your baseline.');
    let score = 70;
    if (manualCheckin) {
      const adj = manualCheckinAdjustment(manualCheckin);
      score += adj.delta;
      if (adj.factor) factors.push(adj.factor);
    }
    score = applyHealthSignals(score);
    score = Math.max(1, Math.min(79, Math.round(score)));
    return { score, band: bandFor(score), factors: factors.slice(0, 5) };
  }

  const latest = [...(bodyMetrics || [])].sort((a, b) => (a.date < b.date ? -1 : 1)).pop();
  const bodyweightKg = latest && latest.weightKg > 0 ? latest.weightKg : 75;
  const tonnageOf = (w: WorkoutEntry) => calculateWorkoutTonnage(w, bodyweightKg);

  let score = READINESS_START;

  // (a) Acute:chronic workload ratio — last 7 days vs last 28 days.
  const last7 = sorted.filter((w) => daysBetween(w.date, today) >= 0 && daysBetween(w.date, today) < 7);
  const last28 = sorted.filter((w) => daysBetween(w.date, today) >= 0 && daysBetween(w.date, today) < 28);
  const acute = last7.reduce((t, w) => t + tonnageOf(w), 0) / 7;
  const chronic = last28.reduce((t, w) => t + tonnageOf(w), 0) / 28;

  if (chronic > 0) {
    const ratio = acute / chronic;
    if (ratio > 1.5) {
      score -= 20;
      factors.push(
        `Your training load this week is about ${Math.round(ratio * 100)}% of your recent average — that's a sharp spike. ` +
        `Big jumps like this are where injuries sneak in, so treat today as a technique day or pull the volume back.`
      );
    } else if (ratio > 1.3) {
      score -= 10;
      factors.push(
        `Training load is running a little hot this week (about ${Math.round(ratio * 100)}% of your recent average). ` +
        `Fine to train, but keep one rep in reserve on your top sets.`
      );
    } else if (ratio < 0.5 && last28.length >= 4) {
      score -= 10;
      factors.push(
        `You've done much less than usual lately. Ease back in at moderate loads rather than jumping straight to old numbers — ` +
        `strength comes back fast, but connective tissue needs a week to catch up.`
      );
    }
  } else if (last7.length > 0) {
    // No 28-day history but training this week: thin data → caution, not confidence.
    score -= 10;
    factors.push(
      `There's not enough training history yet to judge your workload properly. ` +
      `Train at a moderate effort today and log it — the score gets smarter fast.`
    );
  }

  // (b) RPE trend — rising effort at similar loads means fatigue.
  const sessionRpes: number[] = [];
  for (const w of sorted.slice(-6)) {
    const rpes = (w.exercises || [])
      .map(avgExerciseRpe)
      .filter((r): r is number => r !== undefined);
    if (rpes.length > 0) sessionRpes.push(rpes.reduce((a, b) => a + b, 0) / rpes.length);
  }
  if (sessionRpes.length >= 4) {
    const recent = sessionRpes.slice(-3);
    const prior = sessionRpes.slice(0, -3);
    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
    const avgPrior = prior.reduce((a, b) => a + b, 0) / prior.length;
    const drift = avgRecent - avgPrior;
    if (drift >= 1) {
      score -= 15;
      factors.push(
        `Your average effort rating has climbed from ${fmtRpe(avgPrior)} to ${fmtRpe(avgRecent)} over recent sessions. ` +
        `Same weights feeling harder is your body asking for a lighter day — listen to it.`
      );
    } else if (drift >= 0.5) {
      score -= 8;
      factors.push(
        `Effort ratings are creeping up lately (${fmtRpe(avgPrior)} → ${fmtRpe(avgRecent)}). ` +
        `Nothing alarming, but don't chase personal bests today.`
      );
    }
  }

  // (c) Days since last rest day.
  const trainedDates = new Set(sorted.map((w) => w.date.split('T')[0]));
  let streak = 0;
  const cursor = parseLocalDate(today);
  // If today isn't trained yet, the streak counts up to yesterday.
  if (!trainedDates.has(today)) cursor.setDate(cursor.getDate() - 1);
  for (;;) {
    const ds = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (trainedDates.has(ds)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
    if (streak > 60) break;
  }
  if (streak >= 7) {
    score -= 15;
    factors.push(
      `You've trained ${streak} days in a row without a full rest day. ` +
      `Muscles recover between sessions, but joints, tendons and your nervous system need a real day off — take one.`
    );
  } else if (streak >= 5) {
    score -= 8;
    factors.push(
      `${streak} straight training days. You're not in the red yet, but schedule a rest day within the next two days.`
    );
  }

  // (d) Manual check-in — per-input adjustment on top of the load factors
  // (weights documented at CHECKIN_STEP_POINTS / manualCheckinAdjustment).
  // A saved check-in is authoritative for the inputs it covers: nothing
  // later in this function re-derives or overwrites its contribution.
  if (manualCheckin) {
    const adj = manualCheckinAdjustment(manualCheckin);
    score += adj.delta;
    if (adj.factor) factors.push(adj.factor);
  }

  // (e) Health Connect signals — optional, device-measured.
  score = applyHealthSignals(score);

  // Rapid weight loss can mask under-recovery.
  const trend = analyzeWeightTrend(bodyMetrics);
  if (trend.direction === 'losing' && trend.slopeKgPerWeek < -1 && trend.dataPoints >= 5) {
    score -= 10;
    factors.push(
      `Bodyweight is dropping faster than about 1 kg per week. That pace usually drags recovery down with it — ` +
      `expect heavy sessions to feel heavier until the rate of loss eases.`
    );
  }

  score = Math.max(1, Math.min(100, Math.round(score)));

  let band: ReadinessResult['band'];
  if (score >= 80) band = 'primed';
  else if (score >= 60) band = 'ready';
  else if (score >= 40) band = 'caution';
  else band = 'rest';

  if (factors.length === 0) {
    factors.push(
      band === 'primed'
        ? 'Load, effort trend and recovery all look steady. Good day to push for a top set.'
        : 'No red flags in your recent training. Train as planned at your normal effort.'
    );
  }

  return { score, band, factors: factors.slice(0, 5) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. COACH'S VOICE
// ─────────────────────────────────────────────────────────────────────────────

interface SessionInsight {
  exercise: string;
  avgRpe?: number;
  bestE1rm: number;
  prevBestE1rm: number;
  isPr: boolean;
  isNewE1rmRecord: boolean;
}

/**
 * 2–3 sentence deterministic post-workout analysis in a real coach's voice:
 * celebrates specific PRs, diagnoses stalls, flags effort anomalies, and always
 * ends with what to do next. Never a robotic recap of what you just did.
 */
export function generateCoachTake(workout: WorkoutEntry, history: WorkoutEntry[], bodyweightKg = 75): string {
  if (!workout || !(workout.exercises || []).length) {
    return 'Session logged — even a quiet entry keeps the streak honest, and today\'s data makes next week\'s plan smarter.';
  }

  const prior = (history || []).filter((w) => w.id !== workout.id);
  // Bodyweight comes from the athlete's profile; 75 kg is only the last-resort
  // fallback so tonnage math never divides by zero.
  const safeBodyweightKg = bodyweightKg && bodyweightKg > 0 ? bodyweightKg : 75;
  const tonnage = calculateWorkoutTonnage(workout, safeBodyweightKg);
  const priorTonnages = prior.slice(-4).map((w) => calculateWorkoutTonnage(w, safeBodyweightKg)).filter((t) => t > 0);
  const avgPriorTonnage =
    priorTonnages.length > 0 ? priorTonnages.reduce((a, b) => a + b, 0) / priorTonnages.length : 0;

  // Per-exercise insight vs history.
  const insights: SessionInsight[] = [];
  for (const ex of workout.exercises) {
    const done = ex.sets.filter((s) => isSetCompleted(s) && s.reps > 0);
    if (done.length === 0) continue;
    const best = sessionBestE1rmKg(ex);
    const prevSessions = getExerciseHistorySessions(ex.name, prior, 'kg');
    const prevBest = prevSessions.length > 0 ? Math.max(...prevSessions.map((s) => s.bestE1RM)) : 0;
    const isPr = done.some((s) => s.isPR === true);
    insights.push({
      exercise: ex.name,
      avgRpe: avgExerciseRpe(ex),
      bestE1rm: best,
      prevBestE1rm: prevBest,
      isPr,
      isNewE1rmRecord: prevBest > 0 && best > prevBest * 1.01,
    });
  }

  const prs = insights.filter((i) => i.isPr || i.isNewE1rmRecord);
  const anomalies = insights.filter(
    (i) => i.avgRpe !== undefined && i.avgRpe >= 9.5 && i.prevBestE1rm > 0 && i.bestE1rm < i.prevBestE1rm * 0.85
  );
  const volumeLandmark =
    avgPriorTonnage > 0 && tonnage >= avgPriorTonnage * 1.2 && priorTonnages.length >= 2;
  const stalls = detectStalls([...prior, workout]).slice(0, 1);

  const sentences: string[] = [];

  // Sentence 1 — the headline: what actually mattered today.
  if (anomalies.length > 0) {
    const a = anomalies[0];
    sentences.push(
      `Heads up on ${a.exercise} — it moved like a max-effort lift (RPE ${fmtRpe(a.avgRpe!)}) at weights ` +
      `well below your best, which usually means the bar isn't the problem; sleep, stress, or yesterday's fatigue is.`
    );
  } else if (prs.length > 0) {
    const p = prs[0];
    const detail = p.isPr
      ? `a genuine PR on ${p.exercise}`
      : `a new estimated max on ${p.exercise} (${formatKg(p.bestE1rm)})`;
    const extra = prs.length > 1 ? `, plus ${prs.length - 1} more personal best${prs.length > 2 ? 's' : ''} elsewhere` : '';
    const compoundingNote =
      prior.length === 0
        ? `first session logged — this is the baseline everything gets measured against from here`
        : `that's not luck, that's ${plural(prior.length + 1, 'week')} of showing up compounding, so take the win`;
    sentences.push(
      `Big session — ${detail}${extra}, and ${compoundingNote}.`
    );
  } else if (volumeLandmark) {
    sentences.push(
      `Quietly a monster session: ${Math.round(tonnage).toLocaleString()} kg of total volume, ` +
      `about ${Math.round((tonnage / avgPriorTonnage - 1) * 100)}% more than your recent average — ` +
      `that's the kind of workload that moves the needle, just don't try to repeat it twice this week.`
    );
  } else {
    const primary = insights[0];
    const rpeNote =
      primary?.avgRpe !== undefined ? ` at a controlled RPE ${fmtRpe(primary.avgRpe)}` : '';
    sentences.push(
      `Solid work on ${primary ? primary.exercise : 'your session'}${rpeNote} — ` +
      `not every session needs fireworks, and consistent, repeatable quality is what builds the base.`
    );
  }

  // Sentence 2 — diagnosis or the "why".
  if (stalls.length > 0 && anomalies.length === 0) {
    const s = stalls[0];
    const fix =
      s.suggestion === 'variation' && s.variationName
        ? `rotating in ${s.variationName} for a few weeks to give it a novel stimulus`
        : s.suggestion === 'deload'
          ? `a lighter week, not a harder one — cut the volume in half and let the fatigue drain`
          : s.suggestion === 'rep_scheme'
            ? `heavier sets of 4–6 for a few weeks, then coming back to this rep range`
            : `dropping 10% and rebuilding with clean, repeatable reps`;
    sentences.push(
      `One thing to watch — your ${s.exercise} has been stuck around ${formatKg(s.lastE1rmKg)} estimated max ` +
      `for ${s.sessionsStalled} sessions, and the fix is ${fix}.`
    );
  } else if (anomalies.length > 0) {
    sentences.push(
      `Don't chase the numbers on days like this — cap the session at technique work and easy volume, ` +
      `eat well tonight, and judge tomorrow by how you feel, not by today's bar speed.`
    );
  } else if (prs.length === 0 && !volumeLandmark && insights.length > 0) {
    sentences.push(
      `Nothing stalling, nothing alarming — this is the productive middle where most progress actually happens.`
    );
  }

  // Sentence 3 — always end with the next action.
  const primary = insights[0];
  if (primary && anomalies.length === 0) {
    const rpe = primary.avgRpe;
    const nextAction =
      rpe !== undefined && rpe >= 9
        ? `Next time on ${primary.exercise}, hold this weight and consolidate — you earned the load, now own it.`
        : rpe !== undefined && rpe <= 7
          ? `Next time on ${primary.exercise}, you've got room to add a small jump — it moved too well to repeat.`
          : `Next time on ${primary.exercise}, aim to add one clean rep to your top set before touching the weight.`;
    sentences.push(nextAction);
  }

  return sentences.slice(0, 3).join(' ');
}

export interface CoachWeeklyReview {
  whatWorked: string;
  whatDidnt: string;
  nextWeek: string;
}

/**
 * Weekly review in three short sections: what worked, what didn't,
 * what changes next week. Deterministic, coach voice, no fluff.
 */
export function generateCoachWeeklyReview(
  weekWorkouts: WorkoutEntry[],
  lastWeek: WorkoutEntry[],
  bodyMetrics: BodyMetricEntry[]
): CoachWeeklyReview {
  const thisW = weekWorkouts || [];
  const lastW = lastWeek || [];
  const tonnage = (ws: WorkoutEntry[]) => ws.reduce((t, w) => t + calculateWorkoutTonnage(w, 75), 0);
  const thisTon = tonnage(thisW);
  const lastTon = tonnage(lastW);

  // — What worked —
  const workedBits: string[] = [];
  if (thisW.length > 0) {
    workedBits.push(
      `you trained ${thisW.length} ${plural(thisW.length, 'time')} this week`
    );
  }
  if (lastTon > 0 && thisTon >= lastTon * 1.05) {
    workedBits.push(
      `total volume climbed ${Math.round((thisTon / lastTon - 1) * 100)}% vs last week — progressive overload is happening`
    );
  } else if (thisTon > 0 && lastTon === 0 && lastW.length === 0) {
    workedBits.push(`you got back under the bar after a quiet week — the hardest session is always the first one back`);
  }
  const prCount = thisW.reduce(
    (n, w) => n + (w.exercises || []).reduce((m, e) => m + (e.sets || []).filter((s) => s.isPR).length, 0),
    0
  );
  if (prCount > 0) workedBits.push(`${prCount} ${plural(prCount, 'PR')} on the board`);
  const whatWorked =
    workedBits.length > 0
      ? `What worked: ${workedBits.join('; ')}.`
      : `What worked: the week is a blank slate — which is useful data in itself.`;

  // — What didn't —
  const didntBits: string[] = [];
  if (thisW.length === 0) {
    didntBits.push(`no sessions got logged`);
  } else {
    if (lastTon > 0 && thisTon < lastTon * 0.8) {
      const dropPct = Math.round((1 - thisTon / lastTon) * 100);
      if (lastW.length > 0 && thisW.length >= lastW.length) {
        // Same number of sessions, less tonnage: that's a taper or
        // deload — how fitness gets banked before a peak — NOT
        // detraining. Calling it detraining taught runners and
        // lifters mid-taper that they were losing fitness.
        didntBits.push(
          `volume ran ${dropPct}% lighter across the same ${thisW.length} ${plural(thisW.length, 'session')} — a taper/deload pattern, not lost fitness`
        );
      } else {
        didntBits.push(
          `volume dropped ${dropPct}% vs last week — one easy week is recovery, two is detraining`
        );
      }
    }
    const missed = detectPatterns([...lastW, ...thisW]);
    if (missed.length > 0) didntBits.push(missed[0].description.charAt(0).toLowerCase() + missed[0].description.slice(1).replace(/\.$/, ''));
    const stalls = detectStalls([...lastW, ...thisW]);
    if (stalls.length > 0) {
      didntBits.push(
        `${stalls[0].exercise} stalled for ${stalls[0].sessionsStalled} sessions — it needs a change, not more of the same`
      );
    }
  }
  const painFlags = thisW.filter((w) => w.reportsPain).length;
  if (painFlags > 0) {
    didntBits.push(`pain was flagged in ${painFlags} ${plural(painFlags, 'session')} — train around it, not through it`);
  }
  const whatDidnt =
    didntBits.length > 0
      ? `What didn't: ${didntBits.join('; ')}.`
      : `What didn't: honestly, not much — the week held together.`;

  // — Next week —
  const nextBits: string[] = [];
  const readiness = calculateReadiness(thisW, bodyMetrics);
  if (readiness.band === 'rest' || readiness.band === 'caution') {
    nextBits.push(
      readiness.band === 'rest'
        ? `your fatigue signals say schedule a proper deload week — cut volume in half and let the body cash in its adaptation`
        : `fatigue is creeping up, so keep one rep in reserve on top sets and don't chase maxes`
    );
  }
  const stalls2 = detectStalls([...lastW, ...thisW]);
  if (stalls2.length > 0 && stalls2[0].suggestion === 'variation' && stalls2[0].variationName) {
    nextBits.push(`swap ${stalls2[0].exercise} for ${stalls2[0].variationName} (${stalls2[0].variationSets} × ${stalls2[0].variationReps}) to break the plateau`);
  } else if (stalls2.length > 0 && stalls2[0].suggestion === 'deload') {
    nextBits.push(`give ${stalls2[0].exercise} a light week — the stall looks like fatigue, not weakness`);
  }
  const trend = analyzeWeightTrend(bodyMetrics);
  if (trend.direction !== 'insufficient_data' && trend.dataPoints >= 4) {
    nextBits.push(
      `bodyweight is trending ${trend.direction === 'flat' ? 'flat' : trend.direction} ` +
      `(${trend.slopeKgPerWeek >= 0 ? '+' : ''}${trend.slopeKgPerWeek.toFixed(2)} kg/week) — ` +
      `${trend.direction === 'flat' ? 'hold nutrition steady and let training do the talking' : 'keep doing what you\'re doing'}`
    );
  }
  if (nextBits.length === 0) {
    nextBits.push(
      thisW.length > 0
        ? `run it back: same structure, aim to add one rep to a top set somewhere — small, boring, effective`
        : `pick three days, put them in the calendar now, and protect them like appointments`
    );
  }
  const nextWeek = `Next week: ${nextBits.join('; ')}.`;

  return { whatWorked, whatDidnt, nextWeek };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ACCOUNTABILITY
// ─────────────────────────────────────────────────────────────────────────────

export interface PlannedSession {
  /** 0 = Monday … 6 = Sunday */
  weekday: number;
  name: string;
  /** The plan behind this scheduled session, when known — lets the
   *  check-in offer a real "do it today" action instead of advice. */
  planId?: string;
}

export interface MissedSession {
  date: string; // YYYY-MM-DD
  name: string;
  planId?: string;
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Lists planned sessions in the week range that have no logged workout.
 * A session counts as done if any workout is logged on its exact date.
 * Only past days are flagged — a check-in must never nag about a session
 * that hasn't happened yet (e.g. telling Monday's user that Thursday "didn't
 * get logged").
 */
export function detectMissedSessions(
  plannedSchedule: PlannedSession[],
  loggedWorkouts: WorkoutEntry[],
  weekRange: { start: string; end: string }
): MissedSession[] {
  if (!plannedSchedule || plannedSchedule.length === 0) return [];
  const loggedDates = new Set((loggedWorkouts || []).map((w) => w.date.split('T')[0]));
  const missed: MissedSession[] = [];

  const cursor = parseLocalDate(weekRange.start);
  const end = parseLocalDate(weekRange.end);
  const todayStr = getLocalTodayStr();
  for (let guard = 0; guard < 14 && cursor <= end; guard++) {
    const ds = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (ds > todayStr) break; // never flag future sessions as missed
    const weekday = (cursor.getDay() + 6) % 7; // Monday = 0
    const planned = plannedSchedule.filter((p) => p.weekday === weekday);
    for (const p of planned) {
      if (!loggedDates.has(ds)) missed.push({ date: ds, name: p.name, planId: p.planId });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return missed;
}

export interface TrainingPattern {
  kind: 'skipped_muscle' | 'lost_training_day' | 'weekend_dropoff' | 'volume_collapse';
  description: string;
}

/**
 * Finds honest patterns across up to 8 weeks of training: skipped muscle
 * groups, training days that quietly disappeared, volume collapses.
 */
export function detectPatterns(workouts: WorkoutEntry[]): TrainingPattern[] {
  if (!workouts || workouts.length === 0) return [];
  const patterns: TrainingPattern[] = [];
  const sorted = [...workouts].sort((a, b) => (a.date < b.date ? -1 : 1));
  const latestDate = sorted[sorted.length - 1].date.split('T')[0];
  const latestMonday = getWeekDateStrings(parseLocalDate(latestDate))[0];

  // Build per-week buckets for the last 8 calendar weeks.
  const weeks: { start: string; dates: Set<string>; workouts: WorkoutEntry[] }[] = [];
  for (let i = 7; i >= 0; i--) {
    const anchor = parseLocalDate(latestMonday);
    anchor.setDate(anchor.getDate() - i * 7);
    const dates = getWeekDateStrings(anchor);
    weeks.push({ start: dates[0], dates: new Set(dates), workouts: [] });
  }
  for (const w of sorted) {
    const d = w.date.split('T')[0];
    const bucket = weeks.find((wk) => wk.dates.has(d));
    if (bucket) bucket.workouts.push(w);
  }
  const last4 = weeks.slice(-4);
  const first5 = weeks.slice(0, 5);
  const recent3 = weeks.slice(-3);

  // Skipped muscle groups: zero leg work 3+ of the last 4 weeks.
  const legWeeks = last4.filter((wk) =>
    wk.workouts.some((w) =>
      (w.exercises || []).some((e) => exerciseMuscle(e.name) === 'Legs')
    )
  );
  const weeksWithAnyTraining = last4.filter((wk) => wk.workouts.length > 0).length;
  if (weeksWithAnyTraining >= 3 && last4.length - legWeeks.length >= 3) {
    patterns.push({
      kind: 'skipped_muscle',
      description: `You've skipped legs ${last4.length - legWeeks.length} of the last 4 weeks.`,
    });
  }

  // Lost training days: a weekday trained in ≥3 of the first 5 weeks but zero times in the last 3.
  for (let wd = 0; wd < 7; wd++) {
    const trainedEarly = first5.filter((wk) =>
      wk.workouts.some((w) => (parseLocalDate(w.date.split('T')[0]).getDay() + 6) % 7 === wd)
    ).length;
    const trainedRecent = recent3.some((wk) =>
      wk.workouts.some((w) => (parseLocalDate(w.date.split('T')[0]).getDay() + 6) % 7 === wd)
    );
    if (trainedEarly >= 3 && !trainedRecent && recent3.some((wk) => wk.workouts.length > 0)) {
      patterns.push({
        kind: 'lost_training_day',
        description: `${WEEKDAY_NAMES[wd]}s used to be a training day — nothing logged on the last 3.`,
      });
    }
  }

  // Volume collapse: last 2 weeks each under 50% of the prior 4-week
  // average — AND attendance collapsed too. If the user kept showing up
  // the same number of days, light tonnage is a taper/deload, not a
  // collapse, and flagging it teaches them tapering is failure.
  const tonnage = (wk: (typeof weeks)[number]) =>
    wk.workouts.reduce((t, w) => t + calculateWorkoutTonnage(w, 75), 0);
  const baseline = weeks.slice(2, 6).map(tonnage);
  const baselineAvg = baseline.length > 0 ? baseline.reduce((a, b) => a + b, 0) / baseline.length : 0;
  if (baselineAvg > 0) {
    const w7 = tonnage(weeks[6]);
    const w8 = tonnage(weeks[7]);
    const baselineSessions =
      weeks.slice(2, 6).reduce((n, wk) => n + wk.workouts.length, 0) /
      Math.max(1, weeks.slice(2, 6).length);
    const recentSessions = (weeks[6].workouts.length + weeks[7].workouts.length) / 2;
    const attendanceHeld = baselineSessions > 0 && recentSessions >= baselineSessions * 0.75;
    if (!attendanceHeld && w7 < baselineAvg * 0.5 && w8 < baselineAvg * 0.5) {
      patterns.push({
        kind: 'volume_collapse',
        description: `Training volume has been under half your normal level for 2 straight weeks.`,
      });
    }
  }

  return patterns;
}

/**
 * Gentle check-in for missed sessions. Warm, never guilt-tripping —
 * life happens, and the goal is the next session, not the missed one.
 */
export function generateCheckIn(missed: MissedSession[]): string {
  if (!missed || missed.length === 0) {
    return `All planned sessions are accounted for — nice. Consistency like this is the whole game; ` +
      `keep protecting those training days.`;
  }
  const names = missed.map((m) => `${m.name} (${WEEKDAY_NAMES[(parseLocalDate(m.date).getDay() + 6) % 7]})`);
  const list =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  const reschedule =
    missed.length === 1
      ? `Tap "Do it today" to start it now — one moved session beats one skipped session every time.`
      : `No need to cram them all back in — tap "Do it today" to start the latest one now, and let the rest go.`;

  return (
    `Quick check-in: ${list} ${missed.length === 1 ? "didn't" : "didn't"} get logged this week. ` +
    `That happens — work, family, life. A missed session changes nothing about your progress; ` +
    `quitting the week over it would. ${reschedule}`
  );
}

/**
 * LIVE-P1-03 — structured twin of generateCheckIn. The English `message`
 * is byte-identical to generateCheckIn's output; `key` + `sessions` let
 * the UI render the same sentence in Hindi (weekday names localized,
 * plan names untouched — they are user content).
 */
export interface CheckInDetails {
  message: string;
  key: 'coachDigest.checkinNone' | 'coachDigest.checkinOne' | 'coachDigest.checkinMany';
  sessions: { name: string; day: DayOfWeek }[];
}

export function generateCheckInDetails(missed: MissedSession[]): CheckInDetails {
  const message = generateCheckIn(missed);
  const sessions = (missed || []).map((m) => ({
    name: m.name,
    day: DAY_ORDER[(parseLocalDate(m.date).getDay() + 6) % 7],
  }));
  const key =
    !missed || missed.length === 0
      ? 'coachDigest.checkinNone'
      : missed.length === 1
        ? 'coachDigest.checkinOne'
        : 'coachDigest.checkinMany';
  return { message, key, sessions };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. DYNAMIC NUTRITION
// ─────────────────────────────────────────────────────────────────────────────

export interface WeightTrend {
  slopeKgPerWeek: number;
  rSquared: number;
  dataPoints: number;
  spanDays: number;
  direction: 'losing' | 'gaining' | 'flat' | 'insufficient_data';
  startWeightKg: number;
  currentWeightKg: number;
}

const MIN_TREND_POINTS = 4;
const MIN_TREND_SPAN_DAYS = 7;
/**
 * A calorie *change* needs a real trend, not two dots on a chart.
 * The coach may only suggest adjusting calories on ≥5 weigh-ins
 * spanning ≥10 days.
 */
export const MIN_SUGGESTION_POINTS = 5;
export const MIN_SUGGESTION_SPAN_DAYS = 10;
/** Under ±0.25 kg/week is noise, not a trend. */
const FLAT_THRESHOLD_KG_WEEK = 0.25;

/**
 * 2-week+ bodyweight trend via least-squares regression — the line through
 * the noise, not the noise itself.
 */
export function analyzeWeightTrend(bodyMetrics: BodyMetricEntry[]): WeightTrend {
  const empty: WeightTrend = {
    slopeKgPerWeek: 0,
    rSquared: 0,
    dataPoints: 0,
    spanDays: 0,
    direction: 'insufficient_data',
    startWeightKg: 0,
    currentWeightKg: 0,
  };
  const points = (bodyMetrics || [])
    .filter((m) => m && typeof m.weightKg === 'number' && m.weightKg > 30 && m.weightKg < 300 && m.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (points.length < MIN_TREND_POINTS) return { ...empty, dataPoints: points.length };

  const first = points[0].date.split('T')[0];
  const xs = points.map((p) => daysBetween(first, p.date.split('T')[0]));
  const ys = points.map((p) => p.weightKg);
  const spanDays = xs[xs.length - 1] - xs[0];
  if (spanDays < MIN_TREND_SPAN_DAYS) {
    return { ...empty, dataPoints: points.length, spanDays, startWeightKg: ys[0], currentWeightKg: ys[ys.length - 1] };
  }

  const { slope, rSquared } = linearSlope(xs, ys);
  const slopeKgPerWeek = slope * 7;
  const direction =
    slopeKgPerWeek > FLAT_THRESHOLD_KG_WEEK
      ? 'gaining'
      : slopeKgPerWeek < -FLAT_THRESHOLD_KG_WEEK
        ? 'losing'
        : 'flat';

  return {
    slopeKgPerWeek: Math.round(slopeKgPerWeek * 100) / 100,
    rSquared: Math.round(rSquared * 100) / 100,
    dataPoints: points.length,
    spanDays,
    direction,
    startWeightKg: ys[0],
    currentWeightKg: ys[ys.length - 1],
  };
}

export interface CalorieSuggestion {
  action: 'decrease' | 'increase' | 'hold';
  deltaKcal: number;
  newCalories: number;
  /** True when already at (or below) the safe floor — no cut applied. */
  atSafeMinimum: boolean;
  reason: string;
  /** LIVE-P1-03: same reason as a localizable key + params (rendered via coach-i18n). */
  reasonI18n?: LocalizedSentence;
}

// SAFE_MIN_CALORIES is imported from macros.ts — the single source of
// truth shared with the initial prescription, the manual target editor,
// and the AI coach prompt (five divergent floors let every guard be
// bypassed by walking to a different door).

/**
 * Suggests a calorie adjustment from the weight trend vs the goal.
 * Small steps (100–150 kcal), never below safe minimums.
 */
export function suggestCalorieAdjustment(
  trend: WeightTrend,
  goal: AthleteGoal,
  currentTargets: MacroGoals,
  gender: Gender = 'male'
): CalorieSuggestion {
  const safeMin = SAFE_MIN_CALORIES[gender] ?? SAFE_MIN_CALORIES.male;
  const current = Math.max(0, Math.round(currentTargets?.calories ?? 0));
  const rate = Math.abs(trend.slopeKgPerWeek);

  const hold = (reason: string, reasonI18n?: LocalizedSentence): CalorieSuggestion => ({
    action: 'hold',
    deltaKcal: 0,
    newCalories: current,
    atSafeMinimum: false,
    reason,
    reasonI18n,
  });

  const apply = (delta: number, reason: string, reasonI18n?: LocalizedSentence): CalorieSuggestion => {
    const target = current + delta;
    if (delta < 0 && target < safeMin) {
      return {
        action: 'hold',
        deltaKcal: 0,
        newCalories: current,
        atSafeMinimum: true,
        reason:
          `I'd normally trim about ${Math.abs(delta)} kcal, but you're already at ${current.toLocaleString()} kcal — ` +
          `below the safe floor of ${safeMin.toLocaleString()}. Cutting further risks muscle, hormones and sanity. ` +
          `Instead: tighten tracking accuracy for two weeks, or add a couple of brisk walks. If the scale still won't budge, that's a conversation, not a bigger deficit.`,
        // LIVE-P1-03: the floor branch builds its own struct — callers
        // can't know in advance that the floor will trigger.
        reasonI18n: {
          key: 'coachDigest.calFloorHold',
          params: {
            delta: String(Math.abs(delta)),
            current: current.toLocaleString(),
            floor: safeMin.toLocaleString(),
          },
        },
      };
    }
    return {
      action: delta < 0 ? 'decrease' : 'increase',
      deltaKcal: delta,
      newCalories: Math.max(safeMin, target),
      atSafeMinimum: false,
      reason,
      reasonI18n,
    };
  };

  // Two weigh-ins are not a trend. Suggestions need enough signal to act on.
  if (
    trend.direction === 'insufficient_data' ||
    trend.dataPoints < MIN_SUGGESTION_POINTS ||
    trend.spanDays < MIN_SUGGESTION_SPAN_DAYS ||
    current <= 0
  ) {
    return hold(
      `Not enough weigh-ins yet to read a trend — log your weight a few mornings a week for two weeks, ` +
      `same conditions, and I'll tell you exactly what the scale is saying.`,
      { key: 'coachDigest.calHoldNoData' }
    );
  }

  const rateStr = `${rate.toFixed(2)} kg/week`;

  switch (goal) {
    case 'lose_fat': {
      if (trend.direction === 'losing' && rate <= 1) {
        return hold(
          `You're losing at ${rateStr} — that's right in the sweet spot (up to about 1 kg/week keeps muscle and sanity intact). ` +
          `Change nothing; the plan is working.`,
          { key: 'coachDigest.calLoseSweetSpot', params: { rate: rateStr } }
        );
      }
      if (trend.direction === 'losing' && rate > 1) {
        return apply(
          100,
          `You're losing at ${rateStr}, which is faster than the sustainable zone. Aggressive cuts stall sooner and cost more muscle. ` +
          `Adding back 100 kcal slows the loss to a pace you can actually hold.`,
          { key: 'coachDigest.calLoseTooFast', params: { rate: rateStr } }
        );
      }
      return apply(
        -125,
        `Two weeks in and the scale is ${trend.direction === 'flat' ? 'flat' : `climbing (+${rateStr})`} ` +
        `while the goal is fat loss. Smallest effective change: trim 125 kcal — roughly one snack — and reassess in two weeks. ` +
        `Big cuts backfire; this one won't.`,
        trend.direction === 'flat'
          ? { key: 'coachDigest.calLoseFlatFlat' }
          : { key: 'coachDigest.calLoseFlatClimbing', params: { rate: rateStr } }
      );
    }
    case 'build_muscle':
    case 'get_stronger': {
      if (trend.direction === 'gaining') {
        if (rate >= 0.1 && rate <= 0.35) {
          return hold(
            `Gaining at ${rateStr} — textbook lean-gain pace. Most of that is muscle and the water that comes with it. Hold course.`,
            { key: 'coachDigest.calGainSweetSpot', params: { rate: rateStr } }
          );
        }
        if (rate > 0.5) {
          return apply(
            -100,
            `You're gaining at ${rateStr}, which is faster than muscle can realistically be built — the excess is mostly fat. ` +
            `Trimming 100 kcal keeps you growing while keeping the gain lean.`,
            { key: 'coachDigest.calGainTooFast', params: { rate: rateStr } }
          );
        }
        return hold(`Weight is drifting up gently — right where a lean bulk should be. Hold steady.`, {
          key: 'coachDigest.calGainDrift',
        });
      }
      // Flat or drifting down while trying to grow: not enough fuel.
      return apply(
        100,
        `The scale is ${trend.direction} but the goal is growth — you can't build a bigger house without more bricks. ` +
        `Adding 100 kcal gives training something to build with. Reassess in two weeks.`,
        trend.direction === 'losing'
          ? { key: 'coachDigest.calGrowFuelLosing' }
          : { key: 'coachDigest.calGrowFuelFlat' }
      );
    }
    case 'stamina':
    case 'general_fitness':
    default: {
      if (trend.direction === 'flat') {
        return hold(`Weight is stable and the goal is maintenance — the nutrition side is doing its job. Nothing to change.`, {
          key: 'coachDigest.calMaintFlat',
        });
      }
      if (trend.direction === 'gaining') {
        return apply(-100, `Weight is creeping up (${rateStr}) while the goal is maintenance. A gentle 100 kcal trim steadies it without any real sacrifice.`, {
          key: 'coachDigest.calMaintGain',
          params: { rate: rateStr },
        });
      }
      return apply(100, `Weight is drifting down (${rateStr}) while the goal is maintenance. Adding 100 kcal holds you level.`, {
        key: 'coachDigest.calMaintLose',
        params: { rate: rateStr },
      });
    }
  }
}

export interface WeightLogStats {
  /** Number of valid weigh-ins on record. */
  count: number;
  /** YYYY-MM-DD of the most recent valid weigh-in ('' when none). */
  latestDate: string;
  /** Valid weigh-in dates (YYYY-MM-DD), ascending. */
  dates: string[];
}

/** Valid weigh-ins only — same acceptance filter as analyzeWeightTrend. */
export function getWeightLogStats(bodyMetrics: BodyMetricEntry[]): WeightLogStats {
  const dates = (bodyMetrics || [])
    .filter((m) => m && typeof m.weightKg === 'number' && m.weightKg > 30 && m.weightKg < 300 && m.date)
    .map((m) => m.date.split('T')[0])
    .sort();
  return { count: dates.length, latestDate: dates[dates.length - 1] || '', dates };
}

/**
 * Record of the user's last decision on a calorie suggestion (apply or
 * dismiss). Persisted in the store's coach slice; drives suppression so
 * the coach never instantly re-offers the same change.
 */
export interface CalorieAdjustmentRecord {
  /** YYYY-MM-DD the user applied (or dismissed) the suggestion. */
  appliedAt: string;
  /** Calorie target in effect after the decision (kcal/day). */
  appliedTargetKcal: number;
  /** Valid weigh-ins on record when the decision was made. */
  basedOnWeightLogCount: number;
  /** Most recent weigh-in date (YYYY-MM-DD) the decision was based on. */
  basedOnLatestWeightDate: string;
  /** True when the user dismissed the suggestion instead of applying it. */
  dismissed?: boolean;
}

/** Days of quiet after an apply/dismiss before a new suggestion may appear. */
export const CALORIE_REASSESS_DAYS = 14;
/** Fresh weigh-ins (after the ones the decision was based on) that reopen suggestions early. */
export const CALORIE_REOPEN_NEW_LOGS = 3;

/**
 * True while a calorie suggestion should stay hidden after the user acted
 * on the previous one. Suppression lifts when EITHER ≥3 new weigh-ins land
 * after the ones the decision was based on OR 14 days have passed ("reassess
 * in two weeks" — the coach honors its own advice).
 */
export function isCalorieSuggestionSuppressed(
  record: CalorieAdjustmentRecord | undefined,
  bodyMetrics: BodyMetricEntry[],
  todayStr: string
): boolean {
  if (!record) return false;
  const stats = getWeightLogStats(bodyMetrics);
  const freshLogs = stats.dates.filter((d) => d > record.basedOnLatestWeightDate).length;
  if (freshLogs >= CALORIE_REOPEN_NEW_LOGS) return false;
  if (daysBetween(record.appliedAt, todayStr) >= CALORIE_REASSESS_DAYS) return false;
  return true;
}

export interface PlateauAnswer {
  verdict: 'noise' | 'true_plateau' | 'adherence_gap' | 'insufficient_data';
  explanation: string;
  actionSteps: string[];
}

/**
 * Data-backed answer to "why am I not losing weight?" — distinguishes daily
 * noise from a true plateau from an adherence gap. No shame, just the data.
 */
export function answerPlateau(
  trend: WeightTrend,
  adherence: number,
  goal: AthleteGoal
): PlateauAnswer {
  const adh = Math.max(0, Math.min(1, adherence));

  if (trend.direction === 'insufficient_data') {
    return {
      verdict: 'insufficient_data',
      explanation:
        `There aren't enough weigh-ins to answer that honestly yet — anything I'd say would be a guess. ` +
        `Weigh yourself 3–4 mornings a week, same conditions, for two weeks, and the data will speak clearly.`,
      actionSteps: [
        'Weigh in first thing in the morning, after the bathroom, before food — 3–4x per week.',
        'Log it even on the "bad" days; missing data is what makes plateaus invisible.',
      ],
    };
  }

  if (trend.direction === 'losing') {
    return {
      verdict: 'noise',
      explanation:
        `Good news: you're not plateaued. The trend line is falling at ${Math.abs(trend.slopeKgPerWeek).toFixed(2)} kg/week — ` +
        `the flat days are just water and daily noise on top of real progress. Trust the line, not the day.`,
      actionSteps: ['Keep doing exactly what you\'re doing.', 'Judge progress every 2 weeks, never on a single weigh-in.'],
    };
  }

  if (adh < 0.7) {
    const pct = Math.round(adh * 100);
    return {
      verdict: 'adherence_gap',
      explanation:
        `The plan isn't the problem — the data says it's being followed about ${pct}% of the time, ` +
        `and fat loss needs roughly 80%+ consistency to show on the scale. This is genuinely good news: ` +
        `it means you don't need a new diet, just a steadier two weeks on this one. No guilt — ${goal === 'lose_fat' ? 'cutting is hard' : 'consistency is hard'}, and the fix is smaller than it feels.`,
      actionSteps: [
        'Pick the ONE meal or habit that slips most often and fix just that for two weeks.',
        'Pre-log tomorrow\'s food tonight — decisions made tired are the ones that drift.',
        'Keep weighing in; the trend after two steady weeks will tell us if the target itself needs adjusting.',
      ],
    };
  }

  // A genuine plateau outranks noise: 3+ weeks flat (or climbing) at good
  // adherence is adaptation, not fluctuation.
  if (trend.spanDays >= 21 && adh >= 0.7) {
    const dirWord = trend.direction === 'flat' ? 'flat for 3+ weeks' : `climbing (+${trend.slopeKgPerWeek.toFixed(2)} kg/week)`;
    return {
      verdict: 'true_plateau',
      explanation:
        `This looks like a real plateau: weight has been ${dirWord} with ${Math.round(adh * 100)}% adherence, ` +
        `so it's not noise and it's not inconsistency — your body has adapted to the current intake. ` +
        `That's normal physiology, not failure; metabolism adapts to every deficit eventually.`,
      actionSteps: [
        'Trim 100–150 kcal (or add 2–3 short walks per week) — one change, not five.',
        'Hold the change for a full 2 weeks before judging it.',
        'Protect protein and training intensity; the cut comes from the margins, not the muscle.',
      ],
    };
  }

  if (trend.rSquared < 0.3 && trend.direction === 'flat') {
    return {
      verdict: 'noise',
      explanation:
        `The scale is bouncing around but there's no real direction to it — classic water-weight noise ` +
        `(glycogen, sodium, sleep, training soreness all swing daily weight by a kilo or more). ` +
        `Your adherence is solid at ${Math.round(adh * 100)}%, so the most likely story is that fat is coming off ` +
        `underneath the noise. Give it one more full week before changing anything.`,
      actionSteps: [
        'Compare 7-day averages, not day-to-day numbers.',
        'Keep sodium and meal timing roughly consistent to shrink the noise.',
        'If the average is still flat after 3 full weeks, then we adjust the target — not before.',
      ],
    };
  }

  return {
    verdict: 'noise',
    explanation:
      `Too early to call it a plateau — the trend needs a full 3 weeks of flat readings at good adherence before that word means anything. ` +
      `Right now this reads as normal fluctuation. Stay the course and let the data accumulate.`,
    actionSteps: [
      'Keep adherence where it is for 2 more weeks.',
      'Weigh in consistently so the trend line stays honest.',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTED STATE SHAPE (for the store coordinator — do NOT edit store.ts here)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReadinessHistoryEntry {
  date: string; // YYYY-MM-DD
  score: number;
  band: ReadinessResult['band'];
}

export interface StallFlagRecord {
  suggestion: StallSuggestion;
  flaggedDate: string; // YYYY-MM-DD
  acknowledged?: boolean;
}

/**
 * Describes the persisted shape the store needs for the coach engine.
 * The coordinator wires these fields into the AppState/store.
 */
export interface CoachPersistedState {
  /** Rolling log of daily readiness scores (cap ~90 entries). */
  readinessHistory: ReadinessHistoryEntry[];
  /** Check-in IDs the user has dismissed (so we don't nag twice). */
  dismissedCheckIns: string[];
  /** Active stall flags keyed by normalized exercise name. */
  stallFlags: Record<string, StallFlagRecord>;
  /** Last time a deload was suggested (to avoid repeating it weekly). */
  lastDeloadSuggestion?: { date: string; exercise?: string };
  /** Date of the last generated weekly review (YYYY-MM-DD). */
  lastWeeklyReviewDate?: string;
  /** Last calorie-suggestion decision (apply/dismiss) — drives suppression. */
  lastCalorieAdjustment?: CalorieAdjustmentRecord;
}

export function getInitialCoachState(): CoachPersistedState {
  return {
    readinessHistory: [],
    dismissedCheckIns: [],
    stallFlags: {},
    lastDeloadSuggestion: undefined,
    lastWeeklyReviewDate: undefined,
    lastCalorieAdjustment: undefined,
  };
}
