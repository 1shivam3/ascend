/**
 * Homepage matrix data — pure aggregation over the existing store
 * slices (workouts, meals, waterLogs, creatineLogs). No new data model:
 * the done-rules are exactly WeeklyHabitMatrix's (water and protein
 * count at >= 85% of target, creatine needs the day's log taken, a
 * workout day needs a logged workout).
 *
 * All dates are local YYYY-MM-DD strings; weeks start Monday.
 */

import type { WorkoutEntry, MealEntry, CreatineLog } from './types';

export type MatrixHabitId = 'workout' | 'water' | 'creatine' | 'protein';

export interface HabitStatus {
  id: MatrixHabitId;
  done: boolean;
  /** Human-readable value, e.g. water ml logged or protein grams. */
  value: number;
  target: number | null;
}

export interface DayMacros {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface DaySummary {
  dateStr: string;
  workouts: WorkoutEntry[];
  meals: MealEntry[];
  macros: DayMacros;
  habits: HabitStatus[];
  /** True when nothing at all was logged that day. */
  empty: boolean;
}

export interface MatrixInputs {
  workouts: WorkoutEntry[];
  meals: MealEntry[];
  waterLogs: Record<string, number>;
  creatineLogs: Record<string, CreatineLog>;
  waterTargetMl: number;
  proteinTargetG: number;
  showCreatine: boolean;
}

function dayOf(entryDate: string | undefined): string {
  return (entryDate ?? '').split('T')[0];
}

function sumMealMacros(meals: MealEntry[]): DayMacros {
  const out: DayMacros = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const m of meals) {
    for (const f of m.foods ?? []) {
      out.calories += f.calories || 0;
      out.proteinG += f.proteinG || 0;
      out.carbsG += f.carbsG || 0;
      out.fatG += f.fatG || 0;
    }
  }
  return out;
}

/**
 * Everything that happened on one day: workouts, meals + their macro
 * totals, and the four habit statuses. Empty days return empty lists,
 * zero macros, and all habits undone — never an error, never a nudge.
 */
export function getDaySummary(dateStr: string, inputs: MatrixInputs): DaySummary {
  const workouts = (inputs.workouts ?? []).filter((w) => dayOf(w.date) === dateStr);
  const meals = (inputs.meals ?? []).filter((m) => dayOf(m.date) === dateStr);
  const waterMl = inputs.waterLogs?.[dateStr] || 0;
  const proteinG = meals.reduce(
    (acc, m) => acc + (m.foods ?? []).reduce((a, f) => a + (f.proteinG || 0), 0),
    0,
  );
  const habits: HabitStatus[] = [
    { id: 'workout', done: workouts.length > 0, value: workouts.length, target: null },
    { id: 'water', done: waterMl >= inputs.waterTargetMl * 0.85, value: waterMl, target: inputs.waterTargetMl },
    ...(inputs.showCreatine
      ? [{
          id: 'creatine' as MatrixHabitId,
          done: !!inputs.creatineLogs?.[dateStr]?.taken,
          value: inputs.creatineLogs?.[dateStr]?.taken ? 1 : 0,
          target: null,
        }]
      : []),
    { id: 'protein', done: proteinG >= inputs.proteinTargetG * 0.85, value: proteinG, target: inputs.proteinTargetG },
  ];
  const empty =
    workouts.length === 0 && meals.length === 0 && !habits.some((h) => h.done);
  return { dateStr, workouts, meals, macros: sumMealMacros(meals), habits, empty };
}

/** Monday (local, midnight) of the week containing `date`. */
export function mondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** The 7 local dates (Mon–Sun) of the week starting `weekStart`. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/**
 * A Mon-first calendar grid for `year`/`month` (month 0-based): an
 * array of weeks, each 7 entries, with null for cells outside the
 * month. Local dates at midnight.
 */
export function monthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  first.setHours(0, 0, 0, 0);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }).map((_, i) => {
      const d = new Date(year, month, i + 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Local YYYY-MM-DD for a Date (same rule as habits.toLocalDateString). */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
