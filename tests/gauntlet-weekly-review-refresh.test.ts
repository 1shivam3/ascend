import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/lib/store';
import { lastCompletedWeekMonday } from '../src/lib/weekly-review';
import { getLocalTodayStr } from '../src/lib/formatters';

/**
 * Gauntlet Cycle 2 (B-01): the weekly review is a live aggregation, not
 * a write-once snapshot.
 *
 * Part B failure: a Sunday 2026-10-25 session (1560 kg) counted in the
 * habit matrix, Last 4 Weeks, and muscle-volume trends, but the Train
 * weekly-review dialog for its own week (2026-10-19 → 2026-10-25)
 * showed "No sessions", 0/0, 0.0t. Root cause was NOT the date format:
 * DI-01 normalizes every workout date at the store boundary, and the
 * live surfaces prove the normalized date is visible. The cause was
 * the refreshWeeklyReview idempotency guard: once a review for a week
 * existed, it was never rebuilt, so a review generated on first Home
 * mount (before the user past-logged that week's session) kept showing
 * the empty snapshot forever. The fix rebuilds on every refresh while
 * preserving the user's own markers (seen, applied schedule moves).
 */
function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

describe('gauntlet Cycle 2 B-01: weekly review refreshes after late logging', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('rebuilds the review when a session is logged after the review was generated', () => {
    const monday = lastCompletedWeekMonday(getLocalTodayStr());
    const sunday = addDaysStr(monday, 6);
    const store = useStore.getState();

    // First generation: no workouts yet — the empty snapshot that used
    // to stick forever (first Home mount in the Part B run).
    store.refreshWeeklyReview();
    let review = useStore.getState().weeklyReviews.find((r) => r.weekMonday === monday);
    expect(review).toBeDefined();
    expect(review!.tonnageKg).toBe(0);

    // Past-log a session for that week's Sunday, Log Past style (ISO
    // timestamp in, normalized day stored by DI-01).
    useStore.getState().addWorkout({
      id: 'gauntlet-b01',
      date: new Date(`${sunday}T12:00:00`).toISOString(),
      name: 'Sunday session',
      exercises: [
        {
          name: 'Bench Press',
          sets: [{ reps: 8, weight: 100, unit: 'kg', completed: true }],
        },
      ],
    } as never);

    // Second refresh: the review must now include the session.
    useStore.getState().refreshWeeklyReview();
    const reviews = useStore.getState().weeklyReviews.filter((r) => r.weekMonday === monday);
    expect(reviews).toHaveLength(1); // still one entry per week, no duplicates
    review = reviews[0];
    expect(review.tonnageKg).toBe(800); // 100 kg x 8 reps
    expect(review.focus.headline).not.toMatch(/quiet week/i);
  });

  it('preserves the seen marker across a rebuild', () => {
    const monday = lastCompletedWeekMonday(getLocalTodayStr());
    const sunday = addDaysStr(monday, 6);
    useStore.getState().refreshWeeklyReview();
    useStore.getState().markWeeklyReviewSeen(monday);
    expect(
      useStore.getState().weeklyReviews.find((r) => r.weekMonday === monday)?.seen
    ).toBe(true);

    useStore.getState().addWorkout({
      id: 'gauntlet-b01-seen',
      date: new Date(`${sunday}T12:00:00`).toISOString(),
      name: 'Sunday session',
      exercises: [
        {
          name: 'Bench Press',
          sets: [{ reps: 5, weight: 60, unit: 'kg', completed: true }],
        },
      ],
    } as never);
    useStore.getState().refreshWeeklyReview();

    const review = useStore.getState().weeklyReviews.find((r) => r.weekMonday === monday);
    expect(review).toBeDefined();
    expect(review!.seen).toBe(true); // opening it once keeps it seen
    expect(review!.tonnageKg).toBe(300); // rebuilt with the new session
  });
});
