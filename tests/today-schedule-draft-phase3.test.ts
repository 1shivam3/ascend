/**
 * Phase 3.3 (§16, §18, §15): Today, the schedule, and the draft each
 * get ONE state representation.
 *
 * §16 — getTodaySessionState encoded a rest day as status 'planned'
 * + a side flag, and called ANY entry dated today "completed" —
 * including the zero-set save the finish flow can produce. Now:
 * rest is its own status, completed requires ≥1 completed set, and
 * the resolver hands back the completed workout itself (Home no
 * longer re-derives it — the B5 label/handler split).
 *
 * §18 — the schedule stored a rest day as the magic string 'rest'
 * inside the plan-id field, read by a dozen sites. Now the config
 * carries `kind`, every read goes through dayPlanRef (which still
 * resolves the legacy shape), and the persist migration converts
 * stored schedules and repairs dangling plan references.
 *
 * §15 — the draft type was defined twice; two autosave effects
 * wrote one slot with no ownership rule. Now: one definition, an
 * explicit ownership predicate for autosaves, an empty draft is a
 * clear, and staleness (>12h) is a named, testable fact the resume
 * surface prompts on.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, migratePersistedState, shouldAutosaveDraft, isStaleDraft } from '../src/lib/store';
import { dayPlanRef, resolvePlannedDay } from '../src/lib/scheduled-days';
import { getTodaySessionState } from '../src/lib/workout-engine';
import { getTodayDayOfWeek } from '../src/lib/workout-schedule';
import type { WorkoutEntry, WorkoutSet } from '../src/lib/types';

const TODAY = '2026-11-13'; // a Friday
const todayKey = getTodayDayOfWeek(TODAY);

const mkSet = (over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  reps: 5, weight: 100, unit: 'kg', status: 'completed', ...over,
});
const mkWorkout = (id: string, date: string, sets: WorkoutSet[]): WorkoutEntry => ({
  id, date, name: 'Upper A',
  exercises: [{ name: 'Bench Press', sets }],
});
const PLAN = { id: 'p1', name: 'Upper A', exercises: [{ name: 'Bench Press' }] };

const scheduleWith = (cfg: any) => ({
  monday: {}, tuesday: {}, wednesday: {}, thursday: {}, friday: {}, saturday: {}, sunday: {},
  [todayKey]: cfg,
}) as any;

describe('§18 dayPlanRef — the one schedule read', () => {
  it('resolves the new kind shape', () => {
    expect(dayPlanRef({ kind: 'rest' })).toEqual({ kind: 'rest' });
    expect(dayPlanRef({ kind: 'plan', workoutPlanId: 'p1' })).toEqual({ kind: 'plan', planId: 'p1' });
    expect(dayPlanRef({})).toEqual({ kind: 'none' });
    expect(dayPlanRef(undefined)).toEqual({ kind: 'none' });
  });

  it('still resolves the legacy magic-string shape (old payloads, un-migrated rows)', () => {
    expect(dayPlanRef({ workoutPlanId: 'rest' })).toEqual({ kind: 'rest' });
    expect(dayPlanRef({ workoutPlanId: 'p1' })).toEqual({ kind: 'plan', planId: 'p1' });
  });

  it('the kind field wins when both are present', () => {
    expect(dayPlanRef({ kind: 'rest', workoutPlanId: 'p1' })).toEqual({ kind: 'rest' });
  });
});

describe('§16/§18 resolvePlannedDay + getTodaySessionState', () => {
  it('a zero-completed-set entry does NOT make the day completed', () => {
    const empty = mkWorkout('w0', TODAY, [mkSet({ status: 'not_attempted' }), mkSet({ status: 'skipped' })]);
    const res = resolvePlannedDay(TODAY, {
      weeklySchedule: scheduleWith({ kind: 'plan', workoutPlanId: 'p1' }),
      plannedWorkouts: [PLAN],
      workouts: [empty],
    });
    expect(res.kind).toBe('planned');

    const done = mkWorkout('w1', TODAY, [mkSet({})]);
    const res2 = resolvePlannedDay(TODAY, {
      weeklySchedule: scheduleWith({ kind: 'plan', workoutPlanId: 'p1' }),
      plannedWorkouts: [PLAN],
      workouts: [done],
    });
    expect(res2.kind).toBe('completed');
  });

  it('rest day resolves to its own status, not planned+flag', () => {
    // A past workout exists: the brand-new-athlete Day-1 override
    // (never rest on day one) must not fire for an established user.
    const history = [mkWorkout('w-old', '2026-11-10', [mkSet({})])];
    const info = getTodaySessionState(TODAY, history, [PLAN], null, 'kg',
      scheduleWith({ kind: 'rest', customTitle: 'Rest & Recovery' }));
    expect(info.status).toBe('rest');
    expect(info.isRestDay).toBe(true);
  });

  it('legacy rest encoding still resolves as rest through the same path', () => {
    const history = [mkWorkout('w-old', '2026-11-10', [mkSet({})])];
    const info = getTodaySessionState(TODAY, history, [PLAN], null, 'kg',
      scheduleWith({ workoutPlanId: 'rest' }));
    expect(info.status).toBe('rest');
  });

  it('a zero-set save today is not "completed" — the plan shows, flagged as an empty log', () => {
    const empty = mkWorkout('w0', TODAY, [mkSet({ status: 'not_attempted' })]);
    const info = getTodaySessionState(TODAY, [empty], [PLAN], null, 'kg',
      scheduleWith({ kind: 'plan', workoutPlanId: 'p1' }));
    expect(info.status).toBe('planned');
    expect(info.emptyLogToday).toBe(true);
    expect(info.completedWorkout).toBeUndefined();
  });

  it('a real completion returns the workout itself (one derivation for label + handler)', () => {
    const done = mkWorkout('w1', TODAY, [mkSet({})]);
    const info = getTodaySessionState(TODAY, [done], [PLAN], null, 'kg',
      scheduleWith({ kind: 'rest' }));
    expect(info.status).toBe('completed');
    expect(info.completedWorkout?.id).toBe('w1');
    expect(info.emptyLogToday).toBeFalsy();
  });

  it('an in-progress draft still wins over everything', () => {
    const done = mkWorkout('w1', TODAY, [mkSet({})]);
    const info = getTodaySessionState(TODAY, [done], [PLAN],
      { exercises: [{ name: 'Bench Press' }], date: TODAY, savedAt: new Date().toISOString() } as any,
      'kg', scheduleWith({ kind: 'rest' }));
    expect(info.status).toBe('in_progress');
  });
});

describe('§18 persist migration — schedule conversion + dangling repair', () => {
  it('converts legacy encodings and clears plan refs that no longer resolve', () => {
    const out = migratePersistedState(
      {
        plannedWorkouts: [{ id: 'p1', name: 'Upper A' }],
        weeklySchedule: {
          monday: { workoutPlanId: 'rest', customTitle: 'Rest & Recovery' },
          tuesday: { workoutPlanId: 'p1' },
          wednesday: { workoutPlanId: 'deleted-plan' },
          thursday: { workoutPlanId: 'Upper A' }, // name-matched (resolver rule)
          friday: {},
          saturday: { kind: 'rest' },
          sunday: {},
        },
      },
      3,
    ) as any;
    expect(out.weeklySchedule.monday).toEqual({ kind: 'rest', customTitle: 'Rest & Recovery' });
    expect(out.weeklySchedule.tuesday).toEqual({ kind: 'plan', workoutPlanId: 'p1' });
    expect(out.weeklySchedule.wednesday.workoutPlanId).toBeUndefined();
    expect(out.weeklySchedule.wednesday.kind).toBeUndefined();
    expect(out.weeklySchedule.thursday).toEqual({ kind: 'plan', workoutPlanId: 'Upper A' });
    expect(out.weeklySchedule.saturday).toEqual({ kind: 'rest' });
    expect(out.weeklySchedule.friday).toEqual({});
  });
});

describe('§15 draft — one slot, explicit ownership', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('saving an empty-exercises draft clears the slot (explicit cleanup)', () => {
    const store = useStore.getState();
    store.saveWorkoutDraft({
      date: TODAY, exercises: [{ name: 'Bench Press', sets: [mkSet({})] }],
      sessionStartTime: 1000, savedAt: new Date().toISOString(),
    } as any);
    expect(useStore.getState().activeWorkoutDraft).not.toBeNull();
    store.saveWorkoutDraft({
      date: TODAY, exercises: [], sessionStartTime: 1000, savedAt: new Date().toISOString(),
    } as any);
    expect(useStore.getState().activeWorkoutDraft).toBeNull();
  });

  it('shouldAutosaveDraft: empty slot, own session, or a strictly newer session', () => {
    const slot = { sessionStartTime: 1000, savedAt: new Date(5000).toISOString() } as any;
    expect(shouldAutosaveDraft(null, 1000)).toBe(true);
    expect(shouldAutosaveDraft(slot, 1000)).toBe(true); // own session
    expect(shouldAutosaveDraft(slot, 6000)).toBe(true); // began after the slot was saved
    expect(shouldAutosaveDraft(slot, 500)).toBe(false); // stale other session — must not overwrite
  });

  it('isStaleDraft: the 12h resume-prompt threshold', () => {
    const now = Date.parse('2026-11-13T12:00:00.000Z');
    const draft = (savedAt: string) => ({ savedAt }) as any;
    expect(isStaleDraft(draft(new Date(now - 13 * 3600_000).toISOString()), now)).toBe(true);
    expect(isStaleDraft(draft(new Date(now - 1 * 3600_000).toISOString()), now)).toBe(false);
    expect(isStaleDraft(null, now)).toBe(false);
  });
});
