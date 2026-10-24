/**
 * per-muscle-readiness.ts — readiness per muscle group, not just globally.
 *
 * The global engine (coach-engine.calculateReadiness) answers "how ready
 * am I today, overall?" — but a lifter can be fresh for legs and wrecked
 * for chest after yesterday's bench session. This module answers the
 * per-muscle version from the same honest conventions as athlete-model:
 * pure and deterministic, `todayStr` injected (no Date.now()), every
 * value carrying its sample size, a tier, and an evidence sentence with
 * the real numbers. Cold start is labelled, never faked: with no personal
 * data a muscle falls back to the global score (or the standard 70
 * baseline when no global score is supplied) at tier 'prior'.
 *
 * Scoring formula (plain words — the code below is this list, in order):
 *   1. Start at the global readiness score when one is supplied
 *      (it already contains the global check-in), otherwise at 70.
 *   2. Recovery: if the muscle was last trained hard fewer days ago
 *      than its recoveryDays (measured curve from athlete-model, else
 *      the standard 2-day default), subtract 14 points per missing day,
 *      plus 6 more when it was trained today (same-day retraining).
 *      If it has had at least its recoveryDays, add 5.
 *      Never trained: no change — there is no fatigue to recover from.
 *   3. Volume spike: last-7-days tonnage vs the average week over the
 *      PRIOR three weeks (days 7–27, deliberately excluding the last 7
 *      days — a single session must not be its own baseline, or every
 *      lone session would read as a 4x "spike"). Primary muscle counts
 *      full, secondary counts half, same weighting as block-engine's
 *      weekly sets. Over 1.5x the usual week: -15. Over 1.3x: -8.
 *      (Same thresholds as the global engine's acute:chronic rule.)
 *      No prior-week data means no spike is claimed.
 *   4. Soreness: a per-muscle freshness rating (1 = still sore,
 *      5 = fresh, same scale as the global check-in) moves ONLY that
 *      muscle, by 6 points per step away from the global soreness
 *      rating — so a sore chest does not drag down legs. When no
 *      global score was supplied, the global soreness rating first
 *      acts as the prior (4 points per step from neutral 3), then the
 *      per-muscle deviation applies on top. When a global score IS
 *      supplied and no per-muscle rating exists, soreness adds
 *      nothing — the global score already contains it, and counting
 *      it twice would double-penalize one check-in.
 *   5. Clamp to 1–100. Bands use the global engine's vocabulary and
 *      thresholds: >=80 primed, >=60 ready, >=40 caution, <40 rest.
 *
 * Honesty rules: low readiness is a fatigue/load signal, never an
 * injury or diagnosis — no string in this module claims one. Pain
 * episodes are NOT read here; the athlete-model pain-episode exclusion
 * rules in block-engine stay untouched and authoritative.
 */

import type { MuscleRecovery, AthleteModelTier } from './athlete-model';
import type { ManualCheckin, ReadinessResult } from './coach-engine';
import { MUSCLE_GROUPS, resolveExerciseMuscle, type MuscleGroup } from './exercise-library';
import { getExerciseSecondaryMuscles } from './exercise-library';
import { isSetCompleted, type WorkoutEntry } from './types';
import { parseLocalDate } from './formatters';

export type PerMuscleBand = ReadinessResult['band'];

/** Same thresholds as the global readiness engine. */
export function perMuscleBandFor(score: number): PerMuscleBand {
  if (score >= 80) return 'primed';
  if (score >= 60) return 'ready';
  if (score >= 40) return 'caution';
  return 'rest';
}

export interface PerMuscleReadiness {
  muscle: MuscleGroup;
  score: number; // 1–100
  band: PerMuscleBand;
  /** Short factor lines behind the score (load/fatigue signals only). */
  factors: string[];
  /** Plain-English sentence containing the actual numbers. */
  evidence: string;
  tier: AthleteModelTier;
  /** Distinct dates the muscle was trained as a primary (≤ todayStr). */
  sessions: number;
  /** Days since the muscle was last trained as a primary, null if never. */
  daysSinceTrained: number | null;
  /** Last primary session's tonnage (kg), 0 when never / bodyweight-only. */
  lastSessionTonnageKg: number;
  /** Recovery days used: measured curve when present, else the standard 2. */
  recoveryDays: number;
  /** True only when the athlete-model curve actually measured recovery. */
  recoveryMeasured: boolean;
  /** Per-muscle freshness rating when provided (1 = sore, 5 = fresh). */
  perMuscleSoreness: number | null;
  /** Tonnage in the last 7 days (primary full, secondary half). */
  tonnageLast7dKg: number;
  /** Average weekly tonnage over the prior 3 weeks (days 7–27, same
   *  weighting); 0 when there is no prior-week data to compare against. */
  tonnageWeeklyAvgKg: number;
}

export interface PerMuscleReadinessInput {
  workouts: WorkoutEntry[];
  /** Recovery curves from the athlete model (may be empty at cold start). */
  recovery?: MuscleRecovery[];
  /** Today's check-in; may carry sorenessByMuscle. */
  checkin?: ManualCheckin;
  /** Global readiness score used as the prior/fallback when supplied. */
  globalReadiness?: ReadinessResult;
  todayStr: string;
}

const DAY_MS = 86_400_000;
const DEFAULT_RECOVERY_DAYS = 2;
const COLD_START_BASE = 70;

function dayDiff(fromStr: string, toStr: string): number {
  return Math.round(
    (parseLocalDate(toStr).getTime() - parseLocalDate(fromStr).getTime()) / DAY_MS
  );
}

function clampSoreness(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.max(1, Math.min(5, Math.round(v)));
}

function tierForSessions(n: number): AthleteModelTier {
  if (n >= 10) return 'established';
  if (n >= 3) return 'emerging';
  return 'prior';
}

function fmtKg(kg: number): string {
  return `${Math.round(kg).toLocaleString()} kg`;
}

interface MuscleStats {
  primaryDates: Set<string>;
  lastDate: string | null;
  lastTonnageKg: number;
  tonnage7d: number;
  /** Tonnage on days 7–27 ago — the spike baseline, never the acute week. */
  tonnagePrior21d: number;
}

function emptyStats(): MuscleStats {
  return {
    primaryDates: new Set(),
    lastDate: null,
    lastTonnageKg: 0,
    tonnage7d: 0,
    tonnagePrior21d: 0,
  };
}

function setTonnageKg(ex: WorkoutEntry['exercises'][number]): number {
  let total = 0;
  for (const s of ex.sets || []) {
    if (!s || s.isWarmup || !isSetCompleted(s) || !(s.reps > 0)) continue;
    const w = typeof s.weight === 'number' && Number.isFinite(s.weight) && s.weight > 0 ? s.weight : 0;
    total += (s.unit === 'lbs' ? w * 0.453592 : w) * s.reps;
  }
  return total;
}

/**
 * Per-muscle readiness for every MuscleGroup (including Conditioning,
 * which uses the same default recovery when it has no measured curve).
 * Deterministic: same inputs → identical output, in MUSCLE_GROUPS order.
 */
export function computePerMuscleReadiness(
  input: PerMuscleReadinessInput
): PerMuscleReadiness[] {
  const todayStr = input.todayStr;
  const recoveryByMuscle = new Map<MuscleGroup, MuscleRecovery>();
  for (const row of input.recovery ?? []) {
    if (row && row.muscle) recoveryByMuscle.set(row.muscle, row);
  }

  const stats = new Map<MuscleGroup, MuscleStats>();
  const getStats = (m: MuscleGroup): MuscleStats => {
    let s = stats.get(m);
    if (!s) {
      s = emptyStats();
      stats.set(m, s);
    }
    return s;
  };

  const workouts = (Array.isArray(input.workouts) ? input.workouts : []).filter(
    (w) => w && typeof w.date === 'string' && w.date <= todayStr && Array.isArray(w.exercises)
  );

  for (const w of workouts) {
    const age = dayDiff(w.date, todayStr); // 0 = today, >= 0 by the filter
    const in7d = age < 7;
    const inPrior21d = age >= 7 && age < 28;
    // Per-session tonnage per primary muscle, so a session's tonnage is
    // attributed once even when several lifts hit the same muscle.
    const tonnageByPrimary = new Map<MuscleGroup, number>();
    const secondaryTonnage = new Map<MuscleGroup, number>();
    for (const ex of w.exercises) {
      if (!ex || !ex.name) continue;
      const primary = resolveExerciseMuscle(ex.name);
      if (!primary) continue; // unknown lift — never guessed into a muscle
      const tonnage = setTonnageKg(ex);
      tonnageByPrimary.set(primary, (tonnageByPrimary.get(primary) ?? 0) + tonnage);
      for (const sec of getExerciseSecondaryMuscles(ex.name)) {
        if (sec === primary) continue;
        secondaryTonnage.set(sec, (secondaryTonnage.get(sec) ?? 0) + tonnage * 0.5);
      }
    }
    for (const [muscle, tonnage] of tonnageByPrimary) {
      const s = getStats(muscle);
      s.primaryDates.add(w.date);
      if (s.lastDate === null || w.date >= s.lastDate) {
        s.lastDate = w.date;
        s.lastTonnageKg = tonnage;
      }
      if (in7d) s.tonnage7d += tonnage;
      if (inPrior21d) s.tonnagePrior21d += tonnage;
    }
    for (const [muscle, tonnage] of secondaryTonnage) {
      const s = getStats(muscle);
      if (in7d) s.tonnage7d += tonnage;
      if (inPrior21d) s.tonnagePrior21d += tonnage;
    }
  }

  const globalScore = input.globalReadiness?.score;
  const base = typeof globalScore === 'number' && Number.isFinite(globalScore) ? Math.round(globalScore) : COLD_START_BASE;
  const globalSoreness = input.checkin ? clampSoreness(input.checkin.soreness) : null;
  const perMuscle = input.checkin?.sorenessByMuscle ?? {};

  return MUSCLE_GROUPS.map((muscle) => {
    const s = stats.get(muscle) ?? emptyStats();
    const recovery = recoveryByMuscle.get(muscle);
    const recoveryDays = recovery ? recovery.recoveryDays.value : DEFAULT_RECOVERY_DAYS;
    const recoveryMeasured = recovery ? recovery.measured : false;
    const sessions = s.primaryDates.size;
    const daysSinceTrained = s.lastDate === null ? null : dayDiff(s.lastDate, todayStr);
    const weeklyAvg = s.tonnagePrior21d / 3;
    const perSoreness = clampSoreness(perMuscle[muscle]);

    let score = base;
    const factors: string[] = [];

    // 2. Recovery vs the muscle's own curve.
    if (daysSinceTrained === null) {
      // Never trained as a primary: no fatigue recorded for this muscle.
    } else if (daysSinceTrained >= recoveryDays) {
      score += 5;
    } else {
      const missing = recoveryDays - daysSinceTrained;
      score -= missing * 14;
      if (daysSinceTrained === 0) score -= 6;
      factors.push(
        `Last trained ${daysSinceTrained === 0 ? 'today' : `${daysSinceTrained} day${daysSinceTrained === 1 ? '' : 's'} ago`}, ` +
        `but this muscle usually needs about ${recoveryDays} days before it is back at its best — ` +
        `that short gap is a fatigue signal, not a verdict on the muscle.`
      );
    }

    // 3. Volume spike vs the muscle's own usual week.
    if (weeklyAvg > 0) {
      const ratio = s.tonnage7d / weeklyAvg;
      if (ratio > 1.5) {
        score -= 15;
        factors.push(
          `This muscle's load this week (${fmtKg(s.tonnage7d)}) is about ${Math.round(ratio * 100)}% of its usual week (${fmtKg(weeklyAvg)}) — a sharp spike.`
        );
      } else if (ratio > 1.3) {
        score -= 8;
        factors.push(
          `This muscle's load is running a little hot this week (${fmtKg(s.tonnage7d)} vs a usual ${fmtKg(weeklyAvg)}).`
        );
      }
    }

    // 4. Soreness: per-muscle rating moves only this muscle.
    if (perSoreness !== null && globalSoreness !== null) {
      if (input.globalReadiness) {
        // Base already contains the global rating: only the deviation.
        const delta = (perSoreness - globalSoreness) * 6;
        score += delta;
        if (delta !== 0) {
          factors.push(
            `You rated this muscle ${perSoreness}/5 fresh, against ${globalSoreness}/5 overall — ` +
            `that ${delta < 0 ? 'soreness' : 'freshness'} is specific to this muscle.`
          );
        }
      } else {
        const priorDelta = (globalSoreness - 3) * 4;
        const deviationDelta = (perSoreness - globalSoreness) * 6;
        score += priorDelta + deviationDelta;
        if (priorDelta + deviationDelta !== 0) {
          factors.push(
            `You rated this muscle ${perSoreness}/5 fresh (overall soreness ${globalSoreness}/5).`
          );
        }
      }
    } else if (perSoreness !== null && globalSoreness === null) {
      // No global rating at all: the per-muscle rating stands on its own.
      const delta = (perSoreness - 3) * 6;
      score += delta;
      if (delta !== 0) factors.push(`You rated this muscle ${perSoreness}/5 fresh.`);
    } else if (perSoreness === null && !input.globalReadiness && globalSoreness !== null) {
      // No global score and no per-muscle rating: the global rating is
      // the prior for this muscle (weaker weight — it is not muscle-specific).
      const delta = (globalSoreness - 3) * 4;
      score += delta;
      if (delta !== 0) {
        factors.push(
          `No per-muscle rating given, so your overall soreness (${globalSoreness}/5) stands in for this muscle.`
        );
      }
    }

    score = Math.max(1, Math.min(100, Math.round(score)));
    const band = perMuscleBandFor(score);
    const tier = tierForSessions(sessions);

    if (factors.length === 0) {
      factors.push(
        daysSinceTrained === null
          ? 'No logged training for this muscle yet — nothing here suggests fatigue.'
          : 'No fatigue flags for this muscle: its last session is far enough back and its recent load is in line with usual.'
      );
    }

    const tierLabel =
      tier === 'prior'
        ? 'the standard 2-day recovery default stands in (labelled, not personal)'
        : recoveryMeasured
          ? `measured from your own sessions (${sessions} session${sessions === 1 ? '' : 's'})`
          : `from ${sessions} session${sessions === 1 ? '' : 's'} of your data, with the standard default filling the gaps`;
    const evidence =
      `${muscle}: scored ${score} (${band}) — ` +
      (daysSinceTrained === null
        ? 'never trained as a primary muscle yet'
        : `last trained ${daysSinceTrained === 0 ? 'today' : `${daysSinceTrained} day${daysSinceTrained === 1 ? '' : 's'} ago`}`) +
      `, recovery about ${recoveryDays} day${recoveryDays === 1 ? '' : 's'} (${tierLabel})` +
      `, ${fmtKg(s.tonnage7d)} in the last 7 days vs a usual ${fmtKg(weeklyAvg)} per week` +
      (perSoreness !== null ? `, per-muscle freshness ${perSoreness}/5` : '') +
      '.';

    return {
      muscle,
      score,
      band,
      factors,
      evidence,
      tier,
      sessions,
      daysSinceTrained,
      lastSessionTonnageKg: Math.round(s.lastTonnageKg),
      recoveryDays,
      recoveryMeasured,
      perMuscleSoreness: perSoreness,
      tonnageLast7dKg: Math.round(s.tonnage7d),
      tonnageWeeklyAvgKg: Math.round(weeklyAvg),
    };
  });
}

/** Muscles whose band is caution or rest — the ones a plan should work around. */
export function lowReadinessMuscles(
  readiness: PerMuscleReadiness[]
): PerMuscleReadiness[] {
  return (readiness ?? []).filter((r) => r.band === 'caution' || r.band === 'rest');
}
