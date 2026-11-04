import type { DayOfWeek, PlannedWorkout, WeeklySchedule } from './types';
import { getLocalTodayStr, normalizeDateToLocalDay } from './formatters';

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

/**
 * UI-1b-02 — cold-start eligibility: the first local date on which the
 * user demonstrably existed in the app — the earliest of (a) any
 * plan's creation date, (b) the first logged workout, and (c) the
 * first daily check-in.
 *
 * Missed-session scoring (adherence here, the weekly review, the
 * coach check-in) may only count days on or after this date. A day
 * that ended before the user's plan — or any of their data — began
 * cannot have been "missed": projecting the current schedule
 * backwards over pre-account weeks is how a minutes-old user was
 * told they had completed "0 of 32 planned sessions" and missed
 * named days in a week that ended before they signed up.
 *
 * Returns null when the user has no data at all — in that case
 * nothing is scorable either.
 *
 * Plan createdAt stamps are ISO timestamps and are read by LOCAL
 * parts (getLocalTodayStr on the parsed instant — the same
 * conversion the store uses for profile.createdAt), never by UTC
 * date slice, which would move the boundary a day early for users
 * east of UTC and excuse nothing while accusing a day that predates
 * the account locally.
 *
 * Plan dates are CLAMPED to the profile's creation day when a
 * profile stamp is supplied: nothing in a user's state can predate
 * their profile, yet built-in split templates carry a placeholder
 * createdAt ('2026-01-01') that lands verbatim in state when a new
 * user accepts the onboarding plan offer (verified live 2026-11-04:
 * a minutes-old guest profile held four templates stamped
 * 2026-01-01). Without the clamp the placeholder would poison this
 * anchor for exactly the new users the rule protects.
 */
export function earliestDataDate(input: {
  plannedWorkouts?: PlannedWorkout[] | null;
  workouts?: { date: string }[] | null;
  dailyCheckins?: Record<string, unknown> | null;
  profileCreatedAt?: string | null;
}): string | null {
  let best: string | null = null;
  const consider = (d: string | null | undefined) => {
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && (best === null || d < best)) best = d;
  };
  const profileMs = input.profileCreatedAt ? Date.parse(input.profileCreatedAt) : NaN;
  const profileDay = Number.isNaN(profileMs) ? null : getLocalTodayStr(new Date(profileMs));
  consider(profileDay);
  for (const p of input.plannedWorkouts ?? []) {
    if (!p?.createdAt) continue;
    const ms = Date.parse(p.createdAt);
    if (Number.isNaN(ms)) continue;
    const day = getLocalTodayStr(new Date(ms));
    // Clamp template fiction: a plan cannot predate its owner's profile.
    consider(profileDay && day < profileDay ? profileDay : day);
  }
  for (const w of input.workouts ?? []) {
    if (w?.date) consider(normalizeDateToLocalDay(w.date));
  }
  for (const key of Object.keys(input.dailyCheckins ?? {})) consider(key);
  return best;
}
