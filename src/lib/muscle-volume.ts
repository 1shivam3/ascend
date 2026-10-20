/**
 * Per-muscle volume + recovery — Progress tab.
 *
 * Volume: completed working sets per muscle group for the current
 * Mon–Sun week, with the previous week alongside. A "working set" is a
 * completed, non-warmup set; each exercise counts toward its PRIMARY
 * muscle only (via the existing getExerciseMuscle mapping, which also
 * honors user-declared muscles for custom exercises). Conditioning is
 * excluded — set volume is a resistance-training concept.
 *
 * Recovery: a transparent heuristic, not a measurement.
 *   - fatigued: 8+ working sets in the last 48 hours
 *   - recent:   last trained within the last 4 days
 *   - fresh:    5+ days since last trained
 *   - never:    no logged training for that muscle yet
 * The UI labels it as a guide alongside these exact rules.
 */
import {
  getExerciseMuscle,
  RESISTANCE_MUSCLE_GROUPS,
  type MuscleGroup,
} from './exercise-library';
import { isSetCompleted, type WorkoutEntry } from './types';
import { getLocalTodayStr, getMondayOfWeek } from './formatters';

export const FATIGUE_SETS_48H = 8;

export type MuscleGroupKey = (typeof RESISTANCE_MUSCLE_GROUPS)[number];

export interface MuscleVolumeRow {
  muscle: MuscleGroupKey;
  /** Working sets in the reference week (Mon–Sun). */
  sets: number;
  /** Working sets in the week before. */
  prevSets: number;
  delta: number;
}

export type RecoveryStatus = 'fresh' | 'recent' | 'fatigued' | 'never';

export interface MuscleRecoveryRow {
  muscle: MuscleGroupKey;
  lastTrainedDate: string | null;
  daysSince: number | null;
  setsLast48h: number;
  setsLast96h: number;
  status: RecoveryStatus;
}

function dateStrOf(d: Date): string {
  return getLocalTodayStr(d);
}

function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function daysBetweenStr(from: string, to: string): number {
  const a = parseDateStr(from).getTime();
  const b = parseDateStr(to).getTime();
  return Math.round((b - a) / 86400000);
}

/** Monday (YYYY-MM-DD) of the week containing `dateStr`. */
export function mondayOfWeekStr(dateStr: string): string {
  return dateStrOf(getMondayOfWeek(parseDateStr(dateStr)));
}

function emptyCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of RESISTANCE_MUSCLE_GROUPS) out[m] = 0;
  return out;
}

function isResistanceMuscle(m: MuscleGroup): m is MuscleGroupKey {
  return (RESISTANCE_MUSCLE_GROUPS as readonly string[]).includes(m);
}

/** Completed, non-warmup sets per resistance muscle in [from, to]. */
export function countWorkingSets(
  workouts: WorkoutEntry[],
  fromDate: string,
  toDate: string
): Record<string, number> {
  const counts = emptyCounts();
  for (const w of workouts || []) {
    const date = (w.date || '').split('T')[0];
    if (!date || date < fromDate || date > toDate) continue;
    for (const ex of w.exercises || []) {
      const muscle = getExerciseMuscle(ex.name);
      if (!isResistanceMuscle(muscle)) continue;
      const working = (ex.sets || []).filter((s) => isSetCompleted(s) && !s.isWarmup).length;
      counts[muscle] += working;
    }
  }
  return counts;
}

export interface MuscleVolumeResult {
  rows: MuscleVolumeRow[];
  weekStart: string;
  weekEnd: string;
  totalSets: number;
}

export function computeMuscleVolume(
  workouts: WorkoutEntry[],
  referenceDate: string = getLocalTodayStr()
): MuscleVolumeResult {
  const weekStart = mondayOfWeekStr(referenceDate);
  const end = parseDateStr(weekStart);
  end.setDate(end.getDate() + 6);
  const weekEnd = dateStrOf(end);
  const prevStartD = parseDateStr(weekStart);
  prevStartD.setDate(prevStartD.getDate() - 7);
  const prevStart = dateStrOf(prevStartD);
  const prevEndD = parseDateStr(weekStart);
  prevEndD.setDate(prevEndD.getDate() - 1);
  const prevEnd = dateStrOf(prevEndD);

  const current = countWorkingSets(workouts, weekStart, weekEnd);
  const previous = countWorkingSets(workouts, prevStart, prevEnd);

  const rows = RESISTANCE_MUSCLE_GROUPS.map((muscle) => ({
    muscle,
    sets: current[muscle] || 0,
    prevSets: previous[muscle] || 0,
    delta: (current[muscle] || 0) - (previous[muscle] || 0),
  }));
  return {
    rows,
    weekStart,
    weekEnd,
    totalSets: rows.reduce((a, r) => a + r.sets, 0),
  };
}

export function recoveryStatusFor(
  daysSince: number | null,
  setsLast48h: number
): RecoveryStatus {
  if (daysSince === null) return 'never';
  if (setsLast48h >= FATIGUE_SETS_48H) return 'fatigued';
  if (daysSince <= 4) return 'recent';
  return 'fresh';
}

export function computeMuscleRecovery(
  workouts: WorkoutEntry[],
  today: string = getLocalTodayStr()
): MuscleRecoveryRow[] {
  const lastDate: Record<string, string | null> = {};
  for (const m of RESISTANCE_MUSCLE_GROUPS) lastDate[m] = null;

  const d48 = parseDateStr(today);
  d48.setDate(d48.getDate() - 1); // today + yesterday = last 48h of calendar days
  const from48 = dateStrOf(d48);
  const d96 = parseDateStr(today);
  d96.setDate(d96.getDate() - 3); // today + previous 3 days = last 96h
  const from96 = dateStrOf(d96);

  const sets48 = countWorkingSets(workouts, from48, today);
  const sets96 = countWorkingSets(workouts, from96, today);

  for (const w of workouts || []) {
    const date = (w.date || '').split('T')[0];
    if (!date || date > today) continue;
    for (const ex of w.exercises || []) {
      const muscle = getExerciseMuscle(ex.name);
      if (!isResistanceMuscle(muscle)) continue;
      const working = (ex.sets || []).filter((s) => isSetCompleted(s) && !s.isWarmup).length;
      if (working === 0) continue;
      if (!lastDate[muscle] || date > (lastDate[muscle] as string)) lastDate[muscle] = date;
    }
  }

  return RESISTANCE_MUSCLE_GROUPS.map((muscle) => {
    const last = lastDate[muscle];
    const daysSince = last ? daysBetweenStr(last, today) : null;
    return {
      muscle,
      lastTrainedDate: last,
      daysSince,
      setsLast48h: sets48[muscle] || 0,
      setsLast96h: sets96[muscle] || 0,
      status: recoveryStatusFor(daysSince, sets48[muscle] || 0),
    };
  });
}
