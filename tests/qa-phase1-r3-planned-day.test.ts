import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolvePlannedDay } from '../src/lib/scheduled-days';
import { getTodaySessionState } from '../src/lib/workout-engine';
import { resolveTrainingDays } from '../src/lib/local-notifications';
import { syncWorkoutReminderDays } from '../src/lib/store';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  type PlannedWorkout,
  type WeeklySchedule,
  type WorkoutEntry,
} from '../src/lib/types';

// QA-hardening R3 — one planned-day resolver.
//
// "What is this day?" had four answers: Today walked the schedule
// itself, Train's week strip used a helper that called an
// UNSCHEDULED day "rest" and substituted another plan when the
// scheduled one was deleted, the habit-matrix day detail knew
// nothing about plans, and both reminder derivations counted days
// whose plan no longer exists. resolvePlannedDay (lib/scheduled-days)
// is now the single definition; these tests pin its semantics and
// each adoption.

const PLAN_A: PlannedWorkout = {
  id: 'plan-a',
  name: 'Upper A',
  exercises: [{ name: 'Bench Press' } as PlannedWorkout['exercises'][number]],
  createdAt: '2026-10-01T00:00:00.000Z',
};

// Mon: plan-a (exists) · Wed: plan-gone (deleted) · Fri: rest override.
const SCHEDULE: WeeklySchedule = {
  monday: { workoutPlanId: 'plan-a' },
  tuesday: {},
  wednesday: { workoutPlanId: 'plan-gone' },
  thursday: {},
  friday: { workoutPlanId: 'rest', customTitle: 'Rest & Recovery' },
  saturday: {},
  sunday: {},
};

const mkWorkout = (id: string, date: string): WorkoutEntry => ({
  id,
  date,
  name: 'Session',
  exercises: [{ name: 'Bench Press', sets: [{ reps: 5, weight: 100, unit: 'kg', completed: true, status: 'completed' }] }],
});

// 2026-11-02 = Monday, 11-03 Tuesday, 11-04 Wednesday, 11-06 Friday.
describe('QA R3 — resolvePlannedDay semantics', () => {
  it('schedule: a day with an existing plan resolves planned', () => {
    const r = resolvePlannedDay('2026-11-02', { weeklySchedule: SCHEDULE, plannedWorkouts: [PLAN_A], workouts: [] });
    expect(r.kind).toBe('planned');
    if (r.kind === 'planned') expect(r.plan?.id).toBe('plan-a');
    expect(r.day).toBe('monday');
  });

  it('no schedule / unassigned day resolves none', () => {
    expect(resolvePlannedDay('2026-11-02', { weeklySchedule: null, plannedWorkouts: [PLAN_A], workouts: [] }).kind).toBe('none');
    expect(resolvePlannedDay('2026-11-03', { weeklySchedule: SCHEDULE, plannedWorkouts: [PLAN_A], workouts: [] }).kind).toBe('none');
  });

  it('rest override: a rest-configured day resolves rest', () => {
    const r = resolvePlannedDay('2026-11-06', { weeklySchedule: SCHEDULE, plannedWorkouts: [PLAN_A], workouts: [] });
    expect(r.kind).toBe('rest');
  });

  it('completed workout wins over the rest override and the plan', () => {
    const w = mkWorkout('w1', '2026-11-06');
    const r = resolvePlannedDay('2026-11-06', { weeklySchedule: SCHEDULE, plannedWorkouts: [PLAN_A], workouts: [w] });
    expect(r.kind).toBe('completed');
    const r2 = resolvePlannedDay('2026-11-02', { weeklySchedule: SCHEDULE, plannedWorkouts: [PLAN_A], workouts: [mkWorkout('w2', '2026-11-02')] });
    expect(r2.kind).toBe('completed');
  });

  it('a schedule pointing at a deleted plan resolves none (FND-02 rule)', () => {
    expect(resolvePlannedDay('2026-11-04', { weeklySchedule: SCHEDULE, plannedWorkouts: [PLAN_A], workouts: [] }).kind).toBe('none');
  });

  it('plans unknown (null): the schedule is taken on trust, plan is null', () => {
    const r = resolvePlannedDay('2026-11-04', { weeklySchedule: SCHEDULE, plannedWorkouts: null, workouts: [] });
    expect(r.kind).toBe('planned');
    if (r.kind === 'planned') expect(r.plan).toBeNull();
  });
});

describe('QA R3 — reminders derive through the resolver', () => {
  const prefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    workoutReminders: { enabled: true, preferredTime: '07:00', daysOfWeek: [] },
  };

  it('resolveTrainingDays excludes the deleted-plan day when plans are known', () => {
    // JS days: Mon=1, Wed=3, Fri=5. Only Monday survives: Wed's plan
    // is gone, Fri is rest. Before the fix Wed was included.
    expect(resolveTrainingDays(prefs, SCHEDULE, [PLAN_A])).toEqual([1]);
  });

  it('resolveTrainingDays without plan knowledge keeps legacy trust behaviour', () => {
    expect(resolveTrainingDays(prefs, SCHEDULE)).toEqual([1, 3]);
  });

  it('syncWorkoutReminderDays excludes the deleted-plan day when plans are known', () => {
    const next = syncWorkoutReminderDays(SCHEDULE, prefs, [PLAN_A]);
    expect(next.workoutReminders.daysOfWeek).toEqual([1]);
  });
});

describe('QA R3 — Today reads the resolver (getTodaySessionState parity)', () => {
  const old = mkWorkout('old', '2026-10-30');

  it('rest day: isRestDay with the scheduled day named', () => {
    const info = getTodaySessionState('2026-11-06', [old], [PLAN_A], null, 'kg', SCHEDULE);
    expect(info.isRestDay).toBe(true);
    expect(info.scheduledDay).toBe('friday');
  });

  it('planned day: the scheduled plan is offered', () => {
    const info = getTodaySessionState('2026-11-02', [old], [PLAN_A], null, 'kg', SCHEDULE);
    expect(info.status).toBe('planned');
    expect(info.plannedWorkoutId).toBe('plan-a');
    expect(info.isRestDay).toBe(false);
  });

  it('completed day: status completed regardless of schedule', () => {
    const info = getTodaySessionState('2026-11-06', [mkWorkout('t', '2026-11-06')], [PLAN_A], null, 'kg', SCHEDULE);
    expect(info.status).toBe('completed');
  });

  it('deleted-plan day: falls back to an available plan, never claims rest', () => {
    const info = getTodaySessionState('2026-11-04', [old], [PLAN_A], null, 'kg', SCHEDULE);
    expect(info.isRestDay).toBeFalsy();
    expect(info.plannedWorkoutId).toBe('plan-a');
  });

  it('wiring: Train week strip and habit matrix read the resolver', () => {
    expect(readFileSync('src/components/WorkoutPage.tsx', 'utf8')).toContain('resolvePlannedDay');
    expect(readFileSync('src/components/HomeMatrix.tsx', 'utf8')).toContain('resolvePlannedDay');
  });
});
