import type { DayOfWeek, PlannedWorkout, WeeklySchedule } from './types';

/**
 * FND-02 — the ONE definition of "a scheduled training day", pinned here
 * so it cannot drift between passes.
 *
 * A day counts iff ALL three hold:
 *   1. the day's config sets a workoutPlanId,
 *   2. that id is not 'rest',
 *   3. the plan still exists in plannedWorkouts (a schedule pointing at
 *      a deleted plan is not a plan — adherence already treated it that
 *      way, while the coach check-in and the week stats did not, which
 *      is how "0 of 4" became "0 of 5" and 32 became 40 between screens).
 *
 * Order is always Mon–Sun. No history is read or written here — counts
 * only, so recomputing is cheap and idempotent.
 */
export const SCHEDULED_DAY_KEYS: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export interface ScheduledDayEntry {
  day: DayOfWeek;
  /** 0 = Monday … 6 = Sunday, matching detectMissedSessions' weekday. */
  weekday: number;
  planId: string;
  customTitle?: string;
}

export function getScheduledPlanEntries(
  weeklySchedule: WeeklySchedule | null | undefined,
  plannedWorkouts: PlannedWorkout[] | null | undefined
): ScheduledDayEntry[] {
  const planIds = new Set((plannedWorkouts || []).map((p) => p.id));
  const entries: ScheduledDayEntry[] = [];
  SCHEDULED_DAY_KEYS.forEach((day, weekday) => {
    const cfg = weeklySchedule?.[day];
    const planId = cfg?.workoutPlanId;
    if (cfg && planId && planId !== 'rest' && planIds.has(planId)) {
      entries.push({ day, weekday, planId, customTitle: cfg.customTitle });
    }
  });
  return entries;
}
