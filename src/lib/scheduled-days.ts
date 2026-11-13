import type { DayOfWeek, DayScheduleConfig, PlannedWorkout, WeeklySchedule, WorkoutEntry } from './types';
import { isSetCompleted, dayPlanRef } from './types';
import { getLocalTodayStr, normalizeDateToLocalDay } from './formatters';
import { getTodayDayOfWeek } from './workout-schedule';

// §18 (Phase 3.3): dayPlanRef — the one schedule read — lives in
// types.ts beside DayScheduleConfig (this module and
// workout-schedule import each other; the leaf cannot sit in
// either). Re-exported here so schedule consumers have one import.
export { dayPlanRef, type DayPlanRef } from './types';

/** §16: a day is completed by a workout only when the workout
 *  actually performed something — ≥1 completed set. A zero-set
 *  save stays in history but completes nothing. */
export function workoutHasCompletedSet(w: WorkoutEntry | null | undefined): boolean {
  if (!w) return false;
  return (w.exercises || []).some((e) => (e.sets || []).some((s) => isSetCompleted(s)));
}

/**
 * FND-02 — the ONE definition of "a scheduled training day", pinned here
 * so it cannot drift between passes.
 *
 * A day counts iff ALL three hold:
 *   1. the day's config resolves to a plan (dayPlanRef),
 *   2. it is not a rest day,
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
    const ref = dayPlanRef(cfg);
    if (cfg && ref.kind === 'plan' && planIds.has(ref.planId)) {
      entries.push({ day, weekday, planId: ref.planId, customTitle: cfg.customTitle });
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

// ─── The one planned-day resolver (QA-hardening R3) ─────────────────────────
//
// "What is this day?" had four different answers: Today used
// getTodaySessionState's own schedule walk, Train's week strip used
// getScheduledWorkoutForDay (which calls an UNSCHEDULED day "rest"
// and silently substitutes another plan when the scheduled one was
// deleted), the habit matrix's day detail knew nothing about plans
// at all, and the reminder derivations counted a day whose plan no
// longer exists. resolvePlannedDay is now the single definition:
//
//   completed  a workout with ≥1 completed set is logged on the date
//              (wins over everything; §16 — a zero-set entry does not)
//   rest       the day's config is a rest day (dayPlanRef)
//   planned    the config names a plan that still exists (matched by
//              id, or by name as Today's matcher has always done)
//   none       no schedule, day unassigned, or the plan is gone
//
// plannedWorkouts may be null when a caller genuinely cannot know
// the plan list (legacy reminder call sites): a non-rest planId then
// resolves 'planned' with plan: null — existence unverifiable, the
// schedule taken on trust. Callers that know the list always pass it.
export type PlannedDayResolution<P extends { id: string; name: string }> =
  | { kind: 'completed'; day: DayOfWeek; workout: WorkoutEntry }
  | { kind: 'rest'; day: DayOfWeek; customTitle?: string }
  | { kind: 'planned'; day: DayOfWeek; plan: P | null; customTitle?: string }
  | { kind: 'none'; day: DayOfWeek };

export function resolvePlannedDay<P extends { id: string; name: string }>(
  dateStr: string,
  input: {
    weeklySchedule?: WeeklySchedule | null;
    plannedWorkouts?: readonly P[] | null;
    workouts?: WorkoutEntry[] | null;
  },
): PlannedDayResolution<P> {
  const day = getTodayDayOfWeek(dateStr);
  // §16 (Phase 3.3): 'completed' requires a workout that performed
  // ≥1 completed set — an entry's mere existence (a zero-set save)
  // no longer completes the day, here or anywhere this resolver is
  // the definition (habit matrix, reminders, adherence).
  const done = (input.workouts || []).find(
    (w) => w.date && normalizeDateToLocalDay(w.date) === dateStr && workoutHasCompletedSet(w),
  );
  if (done) return { kind: 'completed', day, workout: done };

  const cfg = input.weeklySchedule?.[day];
  const ref = dayPlanRef(cfg);
  if (ref.kind === 'rest') {
    return { kind: 'rest', day, customTitle: cfg?.customTitle };
  }
  if (ref.kind === 'plan') {
    if (!input.plannedWorkouts) {
      return { kind: 'planned', day, plan: null, customTitle: cfg?.customTitle };
    }
    const plan = input.plannedWorkouts.find(
      (p) =>
        p.id === ref.planId ||
        p.name.toLowerCase() === ref.planId.toLowerCase(),
    );
    if (plan) return { kind: 'planned', day, plan, customTitle: cfg?.customTitle };
  }
  return { kind: 'none', day };
}
