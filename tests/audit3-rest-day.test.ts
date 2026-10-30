/**
 * Audit-3 FE-05: rest-day detection must come from the engine's
 * isRestDay boolean. The engine's own rest title is 'Rest & Recovery'
 * (or the user's custom title) — HomePage's old /^rest day/i title
 * regex could never match it, so genuine rest days rendered a fake
 * "0 min · N exercises" line. These tests pin the engine contract
 * the card now relies on.
 */
import { describe, it, expect } from 'vitest';
import { getTodaySessionState } from '../src/lib/workout-engine';
import type { WeeklySchedule, WorkoutEntry } from '../src/lib/types';

// 2026-10-26 is a Monday.
const MONDAY = '2026-10-26';

const plan = { id: 'p1', name: 'Upper Body', exercises: [{ name: 'Bench Press' }] };
const pastWorkout = {
  id: 'w0',
  date: '2026-10-24',
  exercises: [{ name: 'Squat', sets: [{ reps: 5, weight: 80, unit: 'kg', completed: true }] }],
} as unknown as WorkoutEntry;

function schedule(monday: object): WeeklySchedule {
  return {
    monday,
    tuesday: {},
    wednesday: {},
    thursday: {},
    friday: {},
    saturday: {},
    sunday: {},
  } as WeeklySchedule;
}

describe('audit-3 FE-05: getTodaySessionState rest-day contract', () => {
  it("a scheduled rest day reports isRestDay with the 'Rest & Recovery' title", () => {
    const state = getTodaySessionState(MONDAY, [pastWorkout], [plan], null, 'kg', schedule({ workoutPlanId: 'rest' }));
    expect(state.isRestDay).toBe(true);
    expect(state.title).toBe('Rest & Recovery');
    // The old HomePage regex would NOT have matched this title —
    // which is exactly why the boolean exists.
    expect(/^rest day/i.test(state.title)).toBe(false);
  });

  it('a custom-titled rest day still reports isRestDay', () => {
    const state = getTodaySessionState(
      MONDAY,
      [pastWorkout],
      [plan],
      null,
      'kg',
      schedule({ workoutPlanId: 'rest', customTitle: 'Active Recovery' })
    );
    expect(state.isRestDay).toBe(true);
    expect(state.title).toBe('Active Recovery');
  });

  it('a scheduled training day does not report isRestDay', () => {
    const state = getTodaySessionState(MONDAY, [pastWorkout], [plan], null, 'kg', schedule({ workoutPlanId: 'p1' }));
    expect(state.isRestDay).toBe(false);
    expect(state.title).toBe('Upper Body');
  });
});
