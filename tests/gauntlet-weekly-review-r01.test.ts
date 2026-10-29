import { describe, expect, it } from 'vitest';
import {
  buildWeeklyReview,
  type WeeklyReviewInput,
} from '@/lib/weekly-review';
import { getInitialCoachBlocksState } from '@/lib/block-engine';
import type { WeeklySchedule, WorkoutEntry } from '@/lib/types';

/**
 * Gauntlet Cycle 3 (R-01 SESSIONS DONE resolution): the weekly-review
 * dialog's "Sessions done" cell is an ADHERENCE fraction, not an
 * attendance count, by contract.
 *
 * Traced, not assumed — consumers of `sessionsCompleted` /
 * `sessionsPlanned`:
 *   1. `buildWeeklyReview` internals: the adherence focus branch
 *      ("You completed X of Y planned sessions") and its i18n params.
 *   2. `CoachWeeklyReviewModal`: the ONLY display consumer, rendering
 *      `{sessionsCompleted} / {sessionsPlanned}` under "Sessions done".
 *   3. Tests pinning the contract (`tests/weekly-review.test.ts`):
 *      a Sunday extra trained on a 3-day schedule counts as 1 of 3,
 *      and an all-rest week is 0/0.
 *   NOT consumers: the Home card (headline + seen only), CoachChatTab
 *   (length check only), WorkoutPage (seen + headline), coach-engine's
 *   `generateCoachWeeklyReview` (a separate type that counts sessions
 *   by attendance), athlete-model adherence (its own computation),
 *   streaks/trends (separate), cloud sync (weeklyReviews are local
 *   persistence only).
 *
 * Consequence, pinned here: for a planless week with one real logged
 * session, SESSIONS DONE reads 0/0 — and that is CORRECT (0 scheduled
 * sessions, 0 of them trained). The session is affirmed by the
 * headline, the tonnage, and the muscle breakdown, not denied. The
 * original R-01 criterion ("sessions > 0") was over-broad: it
 * conflated attendance (did I train?) with adherence (did I do the
 * plan?). Swapping the cell's numerator to trained days would corrupt
 * the adherence meaning — see the mixed-case test below, where it
 * would read 1/3 while the adherence headline correctly says 0 of 3
 * planned — so no display change is made; the decision options live
 * in the final report's Cycle 2 re-verification addendum.
 */

const ALL_REST: WeeklySchedule = {
  monday: { workoutPlanId: 'rest' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'rest' },
  thursday: { workoutPlanId: 'rest' },
  friday: { workoutPlanId: 'rest' },
  saturday: { workoutPlanId: 'rest' },
  sunday: { workoutPlanId: 'rest' },
};

const THREE_DAY: WeeklySchedule = {
  monday: { workoutPlanId: 'p1' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'p1' },
  thursday: { workoutPlanId: 'rest' },
  friday: { workoutPlanId: 'p1' },
  saturday: { workoutPlanId: 'rest' },
  sunday: { workoutPlanId: 'rest' },
};

function sundaySession(): WorkoutEntry {
  return {
    id: 'gauntlet-r01',
    name: 'Sunday session',
    date: '2026-10-25',
    duration: 60,
    exercises: [
      {
        name: 'Bench Press',
        sets: [
          { reps: 10, weight: 60, unit: 'kg', status: 'completed' as const, isCompleted: true },
          { reps: 8, weight: 60, unit: 'kg', status: 'completed' as const, isCompleted: true },
          { reps: 8, weight: 60, unit: 'kg', status: 'completed' as const, isCompleted: true },
        ],
      },
    ],
  } as unknown as WorkoutEntry;
}

function input(over: Partial<WeeklyReviewInput>): WeeklyReviewInput {
  return {
    anyDateInWeek: '2026-10-25',
    workouts: [],
    plannedWorkouts: [],
    weeklySchedule: ALL_REST,
    athleteModel: null,
    coachBlocks: getInitialCoachBlocksState(),
    prs: [],
    dailyCheckins: {},
    policyRecords: [],
    stalls: [],
    unit: 'kg',
    bodyweightKg: 80,
    todayStr: '2026-10-28',
    ...over,
  };
}

describe('gauntlet Cycle 3 R-01: SESSIONS DONE is schedule-scoped by contract', () => {
  it('planless week + 1 logged Sunday session: 0/0 is correct, session affirmed elsewhere', () => {
    const review = buildWeeklyReview(
      input({ workouts: [sundaySession()], weeklySchedule: ALL_REST })
    );
    expect(review.weekMonday).toBe('2026-10-19');
    expect(review.weekSunday).toBe('2026-10-25');
    // Adherence fraction: 0 scheduled, 0 of them trained.
    expect(review.sessionsPlanned).toBe(0);
    expect(review.sessionsCompleted).toBe(0);
    expect(review.missedDays).toEqual([]);
    // Attendance signals: the session is NOT denied.
    expect(review.tonnageKg).toBe(1560); // 60 kg x (10 + 8 + 8) reps
    expect(review.focus.kind).toBe('consistency');
    expect(review.focus.headline).toBe('Consistency is the win this week');
    expect(review.focus.headline).not.toMatch(/quiet week/i);
    expect(review.focus.detail).toMatch(/showed up for 1 session/);
    expect(review.volumeHighlights.length).toBeGreaterThan(0);
  });

  it('scheduled week + ONLY unscheduled Sunday training: adherence stays 0/3, tonnage still counts', () => {
    const review = buildWeeklyReview(
      input({ workouts: [sundaySession()], weeklySchedule: THREE_DAY })
    );
    expect(review.sessionsPlanned).toBe(3);
    // Sunday was never scheduled, so no planned session was done —
    // even though a session was trained and its tonnage counts.
    expect(review.sessionsCompleted).toBe(0);
    expect(review.missedDays).toEqual(['monday', 'wednesday', 'friday']);
    expect(review.tonnageKg).toBe(1560);
    // The adherence narrative agrees with the cell: 0 of 3 planned.
    expect(review.focus.kind).toBe('adherence');
    expect(review.focus.detail).toMatch(/completed 0 of 3 planned sessions/);
    // A trained-days numerator here would read 1/3 and contradict
    // that sentence — that is why the cell must stay schedule-scoped.
  });
});
