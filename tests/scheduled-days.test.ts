import { describe, it, expect } from 'vitest';
import { getScheduledPlanEntries } from '../src/lib/scheduled-days';
import { buildAthleteModel, type AthleteModelInput } from '../src/lib/athlete-model';
import { detectMissedSessions } from '../src/lib/coach-engine';
import type {
  PlannedWorkout,
  WeeklySchedule,
  WorkoutEntry,
  WorkoutExercise,
  WorkoutSet,
  Unit,
} from '../src/lib/types';

// FND-02: one pinned scheduled-day definition, shared by adherence,
// the coach check-in, and the week stats. These tests pin the
// denominator so it cannot drift between passes again.

const TODAY = '2026-10-22'; // a Thursday; current week's Monday is 2026-10-19

const emptySchedule: WeeklySchedule = {
  monday: { workoutPlanId: 'rest' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'rest' },
  thursday: { workoutPlanId: 'rest' },
  friday: { workoutPlanId: 'rest' },
  saturday: { workoutPlanId: 'rest' },
  sunday: { workoutPlanId: 'rest' },
};

const plan = (id: string): PlannedWorkout => ({
  id,
  name: `Plan ${id}`,
  exercises: [],
  createdAt: '2026-01-01',
});

const scheduleWith = (days: Partial<WeeklySchedule>): WeeklySchedule => ({
  ...emptySchedule,
  ...days,
});

const wset = (weight: number, reps: number, unit: Unit = 'kg'): WorkoutSet => ({
  reps,
  weight,
  unit,
  completed: true,
  status: 'completed',
});
const wex = (name: string, sets: WorkoutSet[]): WorkoutExercise => ({ name, sets });
const wentry = (date: string, exercises: WorkoutExercise[]): WorkoutEntry => ({
  id: `w-${date}-${Math.random().toString(36).slice(2, 8)}`,
  date,
  exercises,
});
const benchDay = (date: string) => wentry(date, [wex('Barbell Bench Press', [wset(80, 5)])]);

const baseInput = (over: Partial<AthleteModelInput> = {}): AthleteModelInput => ({
  workouts: [],
  dailyCheckins: {},
  weeklySchedule: emptySchedule,
  plannedWorkouts: [],
  readinessHistory: [],
  ...over,
});

describe('getScheduledPlanEntries — the pinned definition', () => {
  it('counts a day only when its plan exists', () => {
    const entries = getScheduledPlanEntries(
      scheduleWith({
        monday: { workoutPlanId: 'p1', customTitle: 'Upper' },
        tuesday: { workoutPlanId: 'gone' },
        wednesday: { workoutPlanId: 'rest' },
        thursday: {},
        friday: { workoutPlanId: 'p2' },
      }),
      [plan('p1'), plan('p2')]
    );
    expect(entries.map((e) => e.day)).toEqual(['monday', 'friday']);
    expect(entries[0]).toEqual({
      day: 'monday',
      weekday: 0,
      planId: 'p1',
      customTitle: 'Upper',
    });
  });

  it('returns Mon–Sun order and [] for an empty schedule', () => {
    const entries = getScheduledPlanEntries(
      scheduleWith({
        sunday: { workoutPlanId: 'p1' },
        monday: { workoutPlanId: 'p1' },
      }),
      [plan('p1')]
    );
    expect(entries.map((e) => e.day)).toEqual(['monday', 'sunday']);
    expect(getScheduledPlanEntries(undefined, undefined)).toEqual([]);
    expect(getScheduledPlanEntries(emptySchedule, [])).toEqual([]);
  });
});

describe('adherence denominator — pinned, stable across passes', () => {
  // Mon–Thu scheduled; Friday points at a deleted plan. Old code
  // counted 5 days here (40 over 8 weeks); the pinned definition
  // counts 4 (32) — matching what adherence itself always measured.
  const schedule = scheduleWith({
    monday: { workoutPlanId: 'p1' },
    tuesday: { workoutPlanId: 'p2' },
    wednesday: { workoutPlanId: 'p3' },
    thursday: { workoutPlanId: 'p4' },
    friday: { workoutPlanId: 'deleted-plan' },
  });
  const plans = [plan('p1'), plan('p2'), plan('p3'), plan('p4')];

  it('denominator is 32, not 40, and identical across two consecutive builds', () => {
    const input = baseInput({ weeklySchedule: schedule, plannedWorkouts: plans });
    const first = buildAthleteModel(input, TODAY);
    const second = buildAthleteModel(input, TODAY);
    expect(first.adherence.plannedSessions).toBe(32);
    expect(second.adherence.plannedSessions).toBe(32);
    expect(first.adherence.adherenceRate.evidence).toContain('over the last 8 complete weeks');
  });

  it('a current-week workout does not enter the 8-complete-week counts', () => {
    // 2026-10-21 is in the current week (excluded by design); a
    // scheduled Monday session in the last complete week counts.
    const m = buildAthleteModel(
      baseInput({
        workouts: [benchDay('2026-10-21'), benchDay('2026-10-12')],
        weeklySchedule: schedule,
        plannedWorkouts: plans,
      }),
      TODAY
    );
    expect(m.adherence.plannedSessions).toBe(32);
    expect(m.adherence.completedSessions).toBe(1);
    expect(m.adherence.unscheduledSessions).toBe(0);
  });

  it('an unscheduled-day workout counts as unscheduled, never completed', () => {
    // Sunday is not scheduled in this split.
    const m = buildAthleteModel(
      baseInput({
        workouts: [benchDay('2026-10-11')],
        weeklySchedule: schedule,
        plannedWorkouts: plans,
      }),
      TODAY
    );
    expect(m.adherence.completedSessions).toBe(0);
    expect(m.adherence.unscheduledSessions).toBe(1);
  });
});

describe('check-in planned list — helper-derived, dangling plans excluded', () => {
  it('a workout on a planned day drops the missed count by exactly one', () => {
    const d = new Date();
    const wd = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - wd - 7);
    const monday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const at = (offset: number) => {
      const dd = new Date(monday + 'T00:00:00');
      dd.setDate(dd.getDate() + offset);
      return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
    };
    const schedule = scheduleWith({
      monday: { workoutPlanId: 'p1', customTitle: 'Upper A' },
      tuesday: { workoutPlanId: 'deleted-plan', customTitle: 'Ghost' },
      wednesday: { workoutPlanId: 'p2', customTitle: 'Lower A' },
      friday: { workoutPlanId: 'p3', customTitle: 'Upper B' },
    });
    const planned = getScheduledPlanEntries(schedule, [plan('p1'), plan('p2'), plan('p3')]).map(
      (e) => ({ weekday: e.weekday, name: e.customTitle || 'Workout', planId: e.planId })
    );
    expect(planned.map((p) => p.name)).toEqual(['Upper A', 'Lower A', 'Upper B']);
    const week = { start: monday, end: at(6) };
    expect(detectMissedSessions(planned, [], week)).toHaveLength(3);
    expect(detectMissedSessions(planned, [benchDay(at(0))], week)).toHaveLength(2);
  });
});
