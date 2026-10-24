/**
 * athlete-model.ts — the coach's learned model of THIS athlete.
 *
 * Pure, deterministic derivations from the user's own logged data:
 * check-in baselines, per-lift progression response, per-muscle recovery,
 * adherence patterns, and pain episodes. Every value carries its sample
 * size, a confidence tier, and a plain-English evidence sentence with the
 * real numbers — the coach may only claim what this module can show.
 *
 * Cold start is honest by construction: below a data threshold a value is
 * a labelled population default (tier 'prior'), never a fake
 * personalization. Keys use the evidence layer's canonical form
 * (trim + lowercase, `canonicalizeExerciseName`) — the same keying the
 * Policy v0 ledger uses, so learned parameters line up with decisions.
 *
 * No store access, no Date.now() — `todayStr` is injected so results are
 * reproducible and unit-testable.
 */

import type {
  DayOfWeek,
  PlannedWorkout,
  WeeklySchedule,
  WorkoutEntry,
} from './types';
import { isSetCompleted } from './types';
import type { ManualCheckin, ReadinessHistoryEntry } from './coach-engine';
import { calculateOneRepMax } from './strength-standards';
import { canonicalizeExerciseName } from './workout-outcome-evidence';
import {
  exerciseHadPain,
  getMovementFamily,
  type MovementFamily,
} from './workout-engine';
import { resolveExerciseMuscle, type MuscleGroup } from './exercise-library';
import { parseLocalDate } from './formatters';

/**
 * Muscle for recovery purposes — the library resolver WITHOUT its
 * display default: a name with no library/keyword signal returns null
 * and the lift is excluded, rather than silently polluting Chest.
 */
function resolveMuscle(name: string): MuscleGroup | null {
  return resolveExerciseMuscle(name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shapes
// ─────────────────────────────────────────────────────────────────────────────

/** prior = population default · emerging = some of your data · established = solidly yours */
export type AthleteModelTier = 'prior' | 'emerging' | 'established';

export interface ModelEstimate<T> {
  value: T;
  /** Sample size behind the estimate (sessions, check-ins, points…). */
  n: number;
  tier: AthleteModelTier;
  /** Plain-English sentence containing the actual numbers. */
  evidence: string;
}

export interface LiftResponse {
  /** Evidence-layer canonical key (trim + lowercase). */
  key: string;
  displayName: string;
  exposures: number;
  firstDate: string;
  lastDate: string;
  bestE1rmKg: number;
  /** Least-squares e1RM trend, kg/week. Null until ≥4 sessions over ≥14 days. */
  slopeKgPerWeek: ModelEstimate<number | null>;
  /** Median sessions between e1RM bests (>1% over the previous best). */
  sessionsBetweenProgress: ModelEstimate<number | null>;
  /** Median load jump (kg) between consecutive comparable sessions. */
  typicalIncrementKg: ModelEstimate<number | null>;
  sessionsSinceProgress: number;
  lastProgressDate: string | null;
}

export interface MuscleRecovery {
  muscle: MuscleGroup;
  /** Smallest rest gap (days) at which performance is back ≥97% of best. */
  recoveryDays: ModelEstimate<number>;
  /** True only when a rest bucket actually reached ≥97% — otherwise no recovery time is claimed. */
  measured: boolean;
  points: number;
  curve: { days: 1 | 2 | 3 | 4; meanRatio: number; n: number }[];
}

export interface AdherenceProfile {
  windowWeeks: number;
  plannedSessions: number;
  /** Planned sessions actually completed (trained on a scheduled day). */
  completedSessions: number;
  /** Sessions trained on days that were not scheduled — never inflates adherence. */
  unscheduledSessions: number;
  adherenceRate: ModelEstimate<number>;
  mostSkippedDay: DayOfWeek | null;
  mostTrainedDay: DayOfWeek | null;
}

/** A check-in baseline: the personal mean, plus its spread (SD) once n ≥ 2. */
export interface CheckinBaseline extends ModelEstimate<number> {
  spread: number;
}

export interface PainEpisode {
  date: string;
  /** Canonical key of the painful lift; '' when pain was reported for a whole session. */
  exerciseKey: string;
  exerciseName: string;
  family: MovementFamily;
}

export interface AthleteModelFact {
  kind: 'pain' | 'progress' | 'adherence' | 'recovery' | 'baseline' | 'learning';
  text: string;
  tier: AthleteModelTier;
}

export interface AthleteModel {
  version: 1;
  todayStr: string;
  workoutsAnalyzed: number;
  checkinBaselines: {
    sleep: CheckinBaseline;
    soreness: CheckinBaseline;
    energy: CheckinBaseline;
  };
  lifts: LiftResponse[];
  recovery: MuscleRecovery[];
  adherence: AdherenceProfile;
  pain: {
    episodes: PainEpisode[];
    episodesLast28dByFamily: Partial<Record<MovementFamily, number>>;
    /** Families with ≥2 attributed episodes in 28 days — excluded from new plans, progression held. */
    flaggedFamilies: MovementFamily[];
    /**
     * Canonical keys of exercises with a pain episode in the last 28
     * days (SIM-P1-03). flaggedFamilies needs a pattern (≥2 days), but a
     * single deliberate "Hurts" report must still keep that exact lift
     * out of the next coach block — the block engine swaps-or-drops
     * these keys even when their family is not flagged.
     */
    recentPainExerciseKeys: string[];
  };
  /** Share of scored days in the last 28 that were caution/rest. */
  lowReadinessShare: ModelEstimate<number>;
  /** Up to 5 highest-value facts, pre-rendered for display. */
  topFacts: AthleteModelFact[];
}

export interface AthleteModelInput {
  workouts: WorkoutEntry[];
  dailyCheckins: Record<string, ManualCheckin>;
  weeklySchedule: WeeklySchedule;
  plannedWorkouts: PlannedWorkout[];
  readinessHistory: ReadinessHistoryEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Small math helpers (local, deterministic)
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function dayDiff(fromStr: string, toStr: string): number {
  return Math.round(
    (parseLocalDate(toStr).getTime() - parseLocalDate(fromStr).getTime()) / DAY_MS
  );
}

function addDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function roundTo(x: number, step: number): number {
  return Math.round(x / step) * step;
}

function fmtDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function tierFor(n: number, emergingAt: number, establishedAt: number): AthleteModelTier {
  if (n >= establishedAt) return 'established';
  if (n >= emergingAt) return 'emerging';
  return 'prior';
}

const DAY_KEYS: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

function weekdayKeyOf(dateStr: string): DayOfWeek {
  return DAY_KEYS[(parseLocalDate(dateStr).getDay() + 6) % 7];
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-lift session series
// ─────────────────────────────────────────────────────────────────────────────

interface LiftSession {
  date: string;
  bestE1rmKg: number | null;
  /** Weight/reps of the set that produced bestE1rmKg (for increment math). */
  bestSetWeightKg: number | null;
  bestSetReps: number | null;
}

function weightKgOf(weight: number | undefined, unit: string | undefined): number | null {
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) return null;
  return unit === 'lbs' ? weight * 0.453592 : weight;
}

/** A workout counts as trained only if at least one set was actually completed. */
export function workoutHasCompletedSets(w: WorkoutEntry): boolean {
  return (w.exercises || []).some((ex) =>
    (ex?.sets || []).some((s) => s && !s.isWarmup && Number.isFinite(s.reps) && s.reps > 0 && isSetCompleted(s))
  );
}

/** Exact-canonical per-lift sessions (never the lifter-twin's fuzzy includes match). */
function buildLiftSessions(workouts: WorkoutEntry[]): Map<string, { displayName: string; sessions: LiftSession[] }> {
  const byLift = new Map<string, { displayName: string; sessions: Map<string, LiftSession> }>();
  const sorted = [...workouts]
    .filter((w) => w && Array.isArray(w.exercises) && w.exercises.length > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (const w of sorted) {
    for (const ex of w.exercises) {
      if (!ex || !ex.name || !Array.isArray(ex.sets)) continue;
      // A session exists only if a working set was actually completed —
      // skipped-only or warmup-only entries are not exposures.
      const qualifying = ex.sets.filter(
        (s) => s && !s.isWarmup && Number.isFinite(s.reps) && s.reps > 0 && isSetCompleted(s)
      );
      if (qualifying.length === 0) continue;
      const key = canonicalizeExerciseName(ex.name);
      if (!key) continue;
      let entry = byLift.get(key);
      if (!entry) {
        entry = { displayName: ex.name, sessions: new Map() };
        byLift.set(key, entry);
      }
      entry.displayName = ex.name; // most recent spelling wins for display
      let session = entry.sessions.get(w.date);
      if (!session) {
        session = { date: w.date, bestE1rmKg: null, bestSetWeightKg: null, bestSetReps: null };
        entry.sessions.set(w.date, session);
      }
      for (const s of qualifying) {
        const kg = weightKgOf(s.weight, s.unit);
        if (kg === null) continue;
        const e1rm = calculateOneRepMax(kg, s.reps);
        if (session.bestE1rmKg === null || e1rm > session.bestE1rmKg) {
          session.bestE1rmKg = e1rm;
          session.bestSetWeightKg = kg;
          session.bestSetReps = s.reps;
        }
      }
    }
  }

  const out = new Map<string, { displayName: string; sessions: LiftSession[] }>();
  for (const [key, entry] of byLift) {
    out.set(key, {
      displayName: entry.displayName,
      sessions: [...entry.sessions.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    });
  }
  return out;
}

function leastSquaresSlopePerDay(points: { x: number; y: number }[]): number {
  const n = points.length;
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let num = 0;
  let den = 0;
  for ( const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) * (p.x - mx);
  }
  return den === 0 ? 0 : num / den;
}

function buildLiftResponses(byLift: Map<string, { displayName: string; sessions: LiftSession[] }>): LiftResponse[] {
  const lifts: LiftResponse[] = [];
  for (const [key, { displayName, sessions }] of byLift) {
    if (sessions.length < 2) continue; // a response needs at least a before/after
    const weighted = sessions.filter((s) => s.bestE1rmKg !== null);
    const bestE1rmKg = weighted.length
      ? Math.max(...weighted.map((s) => s.bestE1rmKg as number))
      : 0;

    // ── e1RM slope ──────────────────────────────────────────────────────
    let slope: ModelEstimate<number | null>;
    if (weighted.length >= 4) {
      const first = weighted[0];
      const spanDays = dayDiff(first.date, weighted[weighted.length - 1].date);
      if (spanDays >= 14) {
        const pts = weighted.map((s) => ({
          x: dayDiff(first.date, s.date),
          y: s.bestE1rmKg as number,
        }));
        const perWeek = roundTo(leastSquaresSlopePerDay(pts) * 7, 0.1);
        const dir =
          perWeek >= 0.2
            ? `climbing ≈${perWeek} kg/week`
            : perWeek <= -0.2
              ? `sliding ≈${Math.abs(perWeek)} kg/week`
              : 'flat';
        slope = {
          value: perWeek,
          n: weighted.length,
          tier: tierFor(weighted.length, 4, 8),
          evidence: `${displayName} estimated 1RM is ${dir} across ${weighted.length} sessions since ${fmtDate(first.date)}.`,
        };
      } else {
        slope = {
          value: null,
          n: weighted.length,
          tier: 'emerging',
          evidence: `${displayName}: ${weighted.length} sessions logged, but over too few days to read a trend yet.`,
        };
      }
    } else {
      slope = {
        value: null,
        n: weighted.length,
        tier: weighted.length > 0 ? 'emerging' : 'prior',
        evidence: `${displayName}: only ${weighted.length} weighted session${weighted.length === 1 ? '' : 's'} so far — no trend claimed yet.`,
      };
    }

    // ── progress events / sessions between bests ────────────────────────
    let runningBest = -Infinity;
    let lastProgressIdx = -1;
    const gaps: number[] = [];
    let prevProgressIdx = -1;
    let progressCount = 0;
    weighted.forEach((s, i) => {
      const v = s.bestE1rmKg as number;
      if (v > runningBest * 1.01 && runningBest > -Infinity) {
        progressCount += 1;
        if (prevProgressIdx >= 0) gaps.push(i - prevProgressIdx);
        prevProgressIdx = i;
        lastProgressIdx = i;
      }
      if (v > runningBest) runningBest = v;
    });
    const between: ModelEstimate<number | null> =
      gaps.length >= 2
        ? {
            value: median(gaps),
            n: progressCount,
            tier: tierFor(progressCount, 2, 4),
            evidence: `${displayName}: a new estimated best ${median(gaps) === 1 ? 'about every session' : `about every ${median(gaps)} sessions`} (${progressCount} bests in ${weighted.length} sessions).`,
          }
        : {
            value: null,
            n: progressCount,
            tier: progressCount > 0 ? 'emerging' : 'prior',
            evidence:
              progressCount >= 2
                ? `${displayName}: only one new-best interval observed so far — your progress rhythm isn't claimed yet.`
                : `${displayName}: not enough new bests yet to time your progress rhythm.`,
          };
    const sessionsSinceProgress =
      lastProgressIdx >= 0 ? weighted.length - 1 - lastProgressIdx : weighted.length;
    const lastProgressDate =
      lastProgressIdx >= 0 ? weighted[lastProgressIdx].date : null;

    // ── typical load increment ──────────────────────────────────────────
    const deltas: number[] = [];
    for (let i = 1; i < weighted.length; i++) {
      const a = weighted[i - 1];
      const b = weighted[i];
      if (
        a.bestSetWeightKg !== null &&
        b.bestSetWeightKg !== null &&
        a.bestSetReps !== null &&
        b.bestSetReps !== null &&
        Math.abs(a.bestSetReps - b.bestSetReps) <= 1 &&
        b.bestSetWeightKg > a.bestSetWeightKg
      ) {
        deltas.push(b.bestSetWeightKg - a.bestSetWeightKg);
      }
    }
    const increment: ModelEstimate<number | null> =
      deltas.length >= 2
        ? {
            value: roundTo(median(deltas), 0.25),
            n: deltas.length,
            tier: tierFor(deltas.length, 2, 5),
            evidence: `When ${displayName} goes up, you typically add ≈${roundTo(median(deltas), 0.25)} kg (median of ${deltas.length} jumps).`,
          }
        : {
            value: null,
            n: deltas.length,
            tier: deltas.length > 0 ? 'emerging' : 'prior',
            evidence: `No clean load jumps recorded for ${displayName} yet — standard steps assumed.`,
          };

    lifts.push({
      key,
      displayName,
      exposures: sessions.length,
      firstDate: sessions[0].date,
      lastDate: sessions[sessions.length - 1].date,
      bestE1rmKg: roundTo(bestE1rmKg, 0.1),
      slopeKgPerWeek: slope,
      sessionsBetweenProgress: between,
      typicalIncrementKg: increment,
      sessionsSinceProgress,
      lastProgressDate,
    });
  }
  // Most recently trained first; cap keeps the persisted blob small.
  lifts.sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1));
  return lifts.slice(0, 40);
}

// ─────────────────────────────────────────────────────────────────────────────
// Check-in baselines
// ─────────────────────────────────────────────────────────────────────────────

function buildCheckinBaselines(
  dailyCheckins: Record<string, ManualCheckin>,
  todayStr: string
): AthleteModel['checkinBaselines'] {
  const windowStart = addDays(todayStr, -55);
  const sleeps: number[] = [];
  const sorenesses: number[] = [];
  const energies: number[] = [];
  for (const [date, c] of Object.entries(dailyCheckins || {})) {
    if (!c || date < windowStart || date > todayStr) continue;
    const clamp = (v: unknown) =>
      typeof v === 'number' && !Number.isNaN(v) ? Math.min(5, Math.max(1, v)) : null;
    const s = clamp(c.sleep);
    const so = clamp(c.soreness);
    const e = c.energy === undefined ? null : clamp(c.energy);
    if (s !== null) sleeps.push(s);
    if (so !== null) sorenesses.push(so);
    if (e !== null) energies.push(e);
  }
  const make = (label: string, xs: number[]): CheckinBaseline => {
    if (xs.length === 0) {
      return {
        value: 3,
        n: 0,
        tier: 'prior',
        spread: 0,
        evidence: `No ${label} check-ins in the last 8 weeks — the standard midpoint (3/5) stands in until you log how you feel.`,
      };
    }
    const m = roundTo(mean(xs), 0.1);
    const spread =
      xs.length >= 2
        ? roundTo(Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2))), 0.1)
        : 0;
    return {
      value: m,
      n: xs.length,
      tier: tierFor(xs.length, 5, 14),
      spread,
      evidence: `Your normal ${label} is ${m}/5, from ${xs.length} check-in${xs.length === 1 ? '' : 's'} in the last 8 weeks.`,
    };
  };
  return {
    sleep: make('sleep', sleeps),
    soreness: make('freshness', sorenesses),
    energy: make('energy', energies),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery profile (performance vs days since the muscle last trained)
// ─────────────────────────────────────────────────────────────────────────────

function buildRecovery(
  byLift: Map<string, { displayName: string; sessions: LiftSession[] }>
): MuscleRecovery[] {
  // Per-muscle: sorted unique training dates (weighted sessions only).
  const muscleDates = new Map<MuscleGroup, Set<string>>();
  const points = new Map<MuscleGroup, { bucket: 1 | 2 | 3 | 4; ratio: number }[]>();

  const liftsWithBest = [...byLift.values()]
    .map(({ displayName, sessions }) => {
      const weighted = sessions.filter((s) => s.bestE1rmKg !== null);
      if (!weighted.length) return null;
      const best = Math.max(...weighted.map((s) => s.bestE1rmKg as number));
      const muscle = resolveMuscle(displayName);
      if (!muscle) return null; // unknown lift — never guessed into a muscle
      return { displayName, weighted, best, muscle };
    })
    .filter(Boolean) as {
    displayName: string;
    weighted: LiftSession[];
    best: number;
    muscle: MuscleGroup;
  }[];

  for (const l of liftsWithBest) {
    let set = muscleDates.get(l.muscle);
    if (!set) {
      set = new Set();
      muscleDates.set(l.muscle, set);
    }
    for (const s of l.weighted) set.add(s.date);
  }

  for (const l of liftsWithBest) {
    const dates = [...(muscleDates.get(l.muscle) as Set<string>)].sort();
    for (const s of l.weighted) {
      const idx = dates.indexOf(s.date);
      let daysSince: number | null = null;
      if (idx > 0) daysSince = dayDiff(dates[idx - 1], s.date);
      else if (idx === 0 && dates.length > 0) {
        // Same muscle also trained by another lift today counts as ~0 days rest.
        const sameDayOthers = liftsWithBest.some(
          (o) => o !== l && o.muscle === l.muscle && o.weighted.some((x) => x.date === s.date)
        );
        daysSince = sameDayOthers ? 0 : null;
      }
      if (daysSince === null) continue;
      const bucket = (daysSince <= 1 ? 1 : daysSince === 2 ? 2 : daysSince === 3 ? 3 : 4) as 1 | 2 | 3 | 4;
      const arr = points.get(l.muscle) || [];
      arr.push({ bucket, ratio: (s.bestE1rmKg as number) / l.best });
      points.set(l.muscle, arr);
    }
  }

  const out: MuscleRecovery[] = [];
  for (const [muscle, pts] of points) {
    const curve = ([1, 2, 3, 4] as const).map((d) => {
      const inBucket = pts.filter((p) => p.bucket === d);
      return {
        days: d,
        meanRatio: inBucket.length ? roundTo(mean(inBucket.map((p) => p.ratio)), 0.01) : 0,
        n: inBucket.length,
      };
    });
    let recovery: ModelEstimate<number>;
    let measured = false;
    if (pts.length >= 8) {
      let found: number | null = null;
      for (const c of curve) {
        if (c.n >= 3 && c.meanRatio >= 0.97) {
          found = c.days;
          break;
        }
      }
      if (found !== null) {
        measured = true;
        recovery = {
          value: found,
          n: pts.length,
          tier: tierFor(pts.length, 8, 16),
          evidence: `Your ${muscle.toLowerCase()} performance is back to full strength about ${found === 4 ? '4+' : found} day${found === 1 ? '' : 's'} after training it (${pts.length} data points).`,
        };
      } else {
        // The curve never recovered inside the window — say exactly that
        // instead of presenting the fallback as a measurement.
        recovery = {
          value: 4,
          n: pts.length,
          tier: 'prior',
          evidence: `Your ${muscle.toLowerCase()} work isn't back to full strength even by day 4 in your recent sessions (${pts.length} data points) — no recovery time is claimed yet.`,
        };
      }
    } else {
      recovery = {
        value: 2,
        n: pts.length,
        tier: 'prior',
        evidence: `${muscle}: only ${pts.length} usable data point${pts.length === 1 ? '' : 's'} — the standard 2-day recovery stands in for now.`,
      };
    }
    out.push({ muscle, recoveryDays: recovery, measured, points: pts.length, curve });
  }
  out.sort((a, b) => b.points - a.points);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Adherence (last 8 complete Mon–Sun weeks; current schedule = the plan proxy)
// ─────────────────────────────────────────────────────────────────────────────

function buildAdherence(
  input: AthleteModelInput,
  todayStr: string
): AdherenceProfile {
  const planIds = new Set(
    (Array.isArray(input.plannedWorkouts) ? input.plannedWorkouts : []).map((p) => p.id)
  );
  const rawScheduledDays = DAY_KEYS.filter((d) => {
    const cfg = input.weeklySchedule?.[d];
    return !!cfg?.workoutPlanId && cfg.workoutPlanId !== 'rest';
  });
  const scheduledDays = rawScheduledDays.filter((d) => {
    const cfg = input.weeklySchedule?.[d];
    return !!cfg?.workoutPlanId && planIds.has(cfg.workoutPlanId as string);
  });

  const thisMonday = (() => {
    const d = parseLocalDate(todayStr);
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();

  // A date counts as trained only when a set was actually completed —
  // a workout shell full of skipped sets is not a completed session.
  const workoutDates = new Set(
    (input.workouts || []).filter((w) => w && workoutHasCompletedSets(w)).map((w) => w.date)
  );

  let planned = 0;
  let completed = 0;
  let unscheduled = 0;
  const perDay = new Map<DayOfWeek, { planned: number; done: number; trained: number }>();
  for (const d of DAY_KEYS) perDay.set(d, { planned: 0, done: 0, trained: 0 });

  for (let wk = 1; wk <= 8; wk++) {
    const monday = addDays(thisMonday, -7 * wk);
    for (let off = 0; off < 7; off++) {
      const date = addDays(monday, off);
      const day = DAY_KEYS[off];
      const rec = perDay.get(day) as { planned: number; done: number; trained: number };
      const trained = workoutDates.has(date);
      const scheduled = scheduledDays.includes(day);
      if (trained) {
        rec.trained += 1;
        // Only scheduled completions count toward adherence; training on
        // an unscheduled day is real work, but it is not plan adherence.
        if (scheduled) completed += 1;
        else unscheduled += 1;
      }
      if (scheduled) {
        planned += 1;
        rec.planned += 1;
        if (trained) rec.done += 1;
      }
    }
  }

  let mostSkippedDay: DayOfWeek | null = null;
  let worstRatio = Infinity;
  let mostTrainedDay: DayOfWeek | null = null;
  let mostTrained = -1;
  for (const d of DAY_KEYS) {
    const rec = perDay.get(d) as { planned: number; done: number; trained: number };
    if (rec.trained > mostTrained) {
      mostTrained = rec.trained;
      mostTrainedDay = d;
    }
    if (rec.planned >= 4) {
      const ratio = rec.done / rec.planned;
      // A day completed every time is not "the day most often missed".
      if (ratio < 1 && ratio < worstRatio) {
        worstRatio = ratio;
        mostSkippedDay = d;
      }
    }
  }

  const rate: ModelEstimate<number> =
    planned === 0
      ? {
          value: 0,
          n: 0,
          tier: 'prior',
          evidence:
            rawScheduledDays.length > 0
              ? 'Your schedule points at a plan that no longer exists, so adherence can\u2019t be measured until the schedule is fixed.'
              : 'No weekly schedule is set, so there is no plan to measure adherence against yet.',
        }
      : {
          value: roundTo(planned ? completed / planned : 0, 0.01),
          n: planned,
          tier: tierFor(planned, 8, 24),
          evidence:
            `You completed ${completed} of ${planned} planned sessions over the last 8 weeks, measured against your current weekly schedule.` +
            (unscheduled > 0
              ? ` Plus ${unscheduled} extra session${unscheduled === 1 ? '' : 's'} trained on unscheduled days.`
              : ''),
        };

  return {
    windowWeeks: 8,
    plannedSessions: planned,
    completedSessions: completed,
    unscheduledSessions: unscheduled,
    adherenceRate: rate,
    mostSkippedDay,
    mostTrainedDay: mostTrained > 0 ? mostTrainedDay : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pain episodes (attribution via the audited exerciseHadPain semantics)
// ─────────────────────────────────────────────────────────────────────────────

function buildPain(input: AthleteModelInput, todayStr: string): AthleteModel['pain'] {
  const windowStart = addDays(todayStr, -89);
  const recentStart = addDays(todayStr, -27);
  const episodes: PainEpisode[] = [];

  const sorted = [...(input.workouts || [])]
    .filter((w) => w && w.date >= windowStart && w.date <= todayStr)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  for (const w of sorted) {
    const candidates = new Map<string, string>(); // canonical key → display name
    let anyExerciseAttribution = false;
    for (const ex of w.exercises || []) {
      if (!ex) continue;
      if (ex.painfulExerciseName) {
        candidates.set(canonicalizeExerciseName(ex.painfulExerciseName), ex.painfulExerciseName);
        anyExerciseAttribution = true;
      } else if (ex.reportsPain || ex.athleteFlags?.reportsPain) {
        candidates.set(canonicalizeExerciseName(ex.name), ex.name);
        anyExerciseAttribution = true;
      }
    }
    for (const [, name] of candidates) {
      if (!exerciseHadPain(w, name)) continue;
      episodes.push({
        date: w.date,
        exerciseKey: canonicalizeExerciseName(name),
        exerciseName: name,
        family: getMovementFamily(name),
      });
    }
    if (!anyExerciseAttribution && (w.reportsPain || w.athleteFlags?.reportsPain)) {
      episodes.push({
        date: w.date,
        exerciseKey: '',
        exerciseName: w.name || 'Session',
        family: 'other',
      });
    }
  }

  // Recurrence is counted in DISTINCT DAYS per family: two sore lifts in
  // one session (or the same workout imported twice) is one bad day, not
  // a pattern — a pattern needs pain on separate days.
  const daysByFamily = new Map<MovementFamily, Set<string>>();
  for (const e of episodes) {
    if (e.date < recentStart || !e.exerciseKey) continue;
    let set = daysByFamily.get(e.family);
    if (!set) {
      set = new Set();
      daysByFamily.set(e.family, set);
    }
    set.add(e.date);
  }
  const byFamily: Partial<Record<MovementFamily, number>> = {};
  for (const [fam, days] of daysByFamily) byFamily[fam] = days.size;
  const flaggedFamilies = (Object.entries(byFamily) as [MovementFamily, number][])
    .filter(([fam, count]) => fam !== 'other' && count >= 2)
    .map(([fam]) => fam);

  // Single-report keys (SIM-P1-03): every exercise with an episode in
  // the last 28 days, whether or not its family reached the ≥2-day
  // pattern bar. Session-level reports (exerciseKey '') carry no lift.
  const recentPainExerciseKeys = [...new Set(
    episodes.filter((e) => e.date >= recentStart && e.exerciseKey).map((e) => e.exerciseKey)
  )];

  // Collapse exact duplicates (same day, same lift) — re-imports and sync
  // echoes must not double the record.
  const seenEp = new Set<string>();
  const deduped = episodes.filter((e) => {
    const k = `${e.date}|${e.exerciseKey}`;
    if (seenEp.has(k)) return false;
    seenEp.add(k);
    return true;
  });

  return {
    episodes: deduped.slice(0, 60),
    episodesLast28dByFamily: byFamily,
    flaggedFamilies,
    recentPainExerciseKeys,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Top facts (what the UI shows; priority: safety → progress → life patterns)
// ─────────────────────────────────────────────────────────────────────────────

function buildTopFacts(
  model: Omit<AthleteModel, 'topFacts'>
): AthleteModelFact[] {
  // Safety facts are collected first and ALWAYS lead — a "still learning"
  // banner must never outrank a recurring-pain warning.
  const painFacts: AthleteModelFact[] = [];
  const flaggedSorted = [...model.pain.flaggedFamilies].sort(
    (a, b) =>
      (model.pain.episodesLast28dByFamily[b] || 0) - (model.pain.episodesLast28dByFamily[a] || 0)
  );
  for (const fam of flaggedSorted.slice(0, 4)) {
    const example = model.pain.episodes.find((e) => e.family === fam && e.exerciseKey);
    const days = model.pain.episodesLast28dByFamily[fam] || 2;
    painFacts.push({
      kind: 'pain',
      tier: days >= 3 ? 'established' : 'emerging',
      text: `Pain has come up on ${days} separate days in the last month around ${fam.replace(/_/g, ' ')} movements${example ? ` (e.g. ${example.exerciseName})` : ''} — your coach will steer clear of that pattern, and it's worth getting checked if it persists.`,
    });
  }
  if (flaggedSorted.length > 4) {
    painFacts.push({
      kind: 'pain',
      tier: 'emerging',
      text: `${flaggedSorted.length - 4} more pain patterns are being tracked — if pain keeps recurring, get it checked.`,
    });
  }
  const facts: AthleteModelFact[] = [...painFacts];

  const progressing = model.lifts
    .filter((l) => l.slopeKgPerWeek.value !== null && (l.slopeKgPerWeek.value as number) >= 0.2)
    .sort((a, b) => (b.slopeKgPerWeek.value as number) - (a.slopeKgPerWeek.value as number))[0];
  if (progressing) {
    facts.push({ kind: 'progress', tier: progressing.slopeKgPerWeek.tier, text: progressing.slopeKgPerWeek.evidence });
  }

  if (model.adherence.adherenceRate.tier !== 'prior') {
    const skip = model.adherence.mostSkippedDay;
    facts.push({
      kind: 'adherence',
      tier: model.adherence.adherenceRate.tier,
      text:
        model.adherence.adherenceRate.evidence +
        (skip ? ` ${skip[0].toUpperCase() + skip.slice(1)}s are the day most often missed.` : ''),
    });
  }

  const rec = model.recovery.find((r) => r.measured && r.recoveryDays.tier !== 'prior');
  if (rec) {
    facts.push({ kind: 'recovery', tier: rec.recoveryDays.tier, text: rec.recoveryDays.evidence });
  }

  if (model.checkinBaselines.sleep.tier !== 'prior') {
    facts.push({
      kind: 'baseline',
      tier: model.checkinBaselines.sleep.tier,
      text: `${model.checkinBaselines.sleep.evidence} A below-average morning for you is information, not a bad day.`,
    });
  }

  const personalCount = facts.filter((f) => f.tier !== 'prior').length;
  if (personalCount < 2) {
    facts.splice(painFacts.length, 0, {
      kind: 'learning',
      tier: 'prior',
      text: 'Still learning you — trends need ~4 sessions on the same lift and baselines a handful of morning check-ins. Until then your coach uses standard defaults and says so.',
    });
  }
  return facts.slice(0, 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export function buildAthleteModel(input: AthleteModelInput, todayStr: string): AthleteModel {
  // Sanitize once at the boundary: the engine must be total over malformed
  // input (imports feed it raw payloads) and must never read the future —
  // a typo'd or imported future date would otherwise poison every trend.
  const workouts = (Array.isArray(input?.workouts) ? input.workouts : []).filter(
    (w) => w && typeof w.date === 'string' && w.date <= todayStr && Array.isArray(w.exercises)
  );
  const safeInput: AthleteModelInput = {
    workouts,
    dailyCheckins:
      input?.dailyCheckins && typeof input.dailyCheckins === 'object' ? input.dailyCheckins : {},
    weeklySchedule: input?.weeklySchedule,
    plannedWorkouts: Array.isArray(input?.plannedWorkouts) ? input.plannedWorkouts : [],
    readinessHistory: Array.isArray(input?.readinessHistory) ? input.readinessHistory : [],
  };
  const byLift = buildLiftSessions(workouts);
  const lifts = buildLiftResponses(byLift);
  const recovery = buildRecovery(byLift);
  const adherence = buildAdherence(safeInput, todayStr);
  const pain = buildPain(safeInput, todayStr);

  // One score per day — multiple workouts in a day append multiple history
  // entries, and the share is about DAYS, so the last entry of a day wins.
  const historyByDate = new Map<string, ReadinessHistoryEntry>();
  for (const e of safeInput.readinessHistory) {
    if (e && e.date >= addDays(todayStr, -27) && e.date <= todayStr) historyByDate.set(e.date, e);
  }
  const recentHistory = [...historyByDate.values()];
  const lowCount = recentHistory.filter((e) => e.band === 'caution' || e.band === 'rest').length;
  const lowReadinessShare: ModelEstimate<number> = {
    value: recentHistory.length ? roundTo(lowCount / recentHistory.length, 0.01) : 0,
    n: recentHistory.length,
    tier: tierFor(recentHistory.length, 4, 10),
    evidence: recentHistory.length
      ? `${lowCount} of your last ${recentHistory.length} scored days came out low-readiness (caution or rest).`
      : 'No readiness scores recorded in the last 4 weeks.',
  };

  const partial: Omit<AthleteModel, 'topFacts'> = {
    version: 1,
    todayStr,
    workoutsAnalyzed: workouts.length,
    checkinBaselines: buildCheckinBaselines(safeInput.dailyCheckins, todayStr),
    lifts,
    recovery,
    adherence,
    pain,
    lowReadinessShare,
  };
  return { ...partial, topFacts: buildTopFacts(partial) };
}
