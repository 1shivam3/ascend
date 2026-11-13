/**
 * Phase 5 — the five cross-machine INVARIANTS, as CI tests.
 *
 * Each invariant was the structural cause of a recorded bug or
 * a Phase 0 finding; the machines now make the illegal states
 * unrepresentable or unreachable, and these tests fail if that
 * ever regresses:
 *   1. a timer is never running and finished at once
 *      (rest timer §21 — one status discriminant, endsAt ⟺ running);
 *   2. sync is never 'synced' while signed out (§1/§2 — a late
 *      success event cannot land after session loss);
 *   3. a record is never live and tombstoned at once (§10);
 *   4. a day is never both rest and in progress (§16/§18 — the
 *      Today resolver returns exactly one status, draft wins);
 *   5. stored PRs always equal the recomputation from history
 *      plus manual records (§23 — reconcile converges and is
 *      idempotent, and never touches manual records).
 */
import { describe, it, expect } from 'vitest';
import {
  REST_TIMER_INITIAL,
  restTimerReducer,
  type RestTimerAction,
  type RestTimerState,
} from '@/lib/rest-timer';
import {
  initialSyncState,
  syncStateReducer,
  type SyncEvent,
  type SyncState,
} from '@/lib/supabase/sync-state';
import {
  applyDeletionToState,
  applyRestoreToState,
  findLiveTombstoneOverlaps,
  type TombstoneListsState,
} from '@/lib/store';
import { getTodaySessionState } from '@/lib/workout-engine';
import { planDerivedPRsAfterHistoryChange } from '@/lib/pr-reevaluation';
import type {
  DayOfWeek,
  PersonalRecord,
  WeeklySchedule,
  WorkoutEntry,
  WorkoutSet,
} from '@/lib/types';

// ── 1. Rest timer ────────────────────────────────────────────

describe('invariant 1 — never running and finished at once', () => {
  const actions: RestTimerAction[] = [
    { type: 'start', now: 1_000, seconds: 90 },
    { type: 'tick', now: 31_000 },
    { type: 'tick', now: 200_000 }, // past the end
    { type: 'pause', now: 40_000 },
    { type: 'resume', now: 50_000 },
    { type: 'adjust', deltaSeconds: 30 },
    { type: 'adjust', deltaSeconds: -600 },
    { type: 'skip' },
    { type: 'reset', seconds: 60 },
  ];

  function assertSound(s: RestTimerState) {
    expect(['idle', 'running', 'paused', 'finished']).toContain(s.status);
    // The documented biconditional on the state type itself.
    expect(s.endsAt !== null).toBe(s.status === 'running');
    expect(s.secondsLeft).toBeGreaterThanOrEqual(0);
  }

  it('holds over an exhaustive action-sequence walk (depth 3)', () => {
    let frontier: RestTimerState[] = [REST_TIMER_INITIAL];
    assertSound(REST_TIMER_INITIAL);
    for (let depth = 0; depth < 3; depth++) {
      const next: RestTimerState[] = [];
      for (const state of frontier) {
        for (const action of actions) {
          const s = restTimerReducer(state, action);
          assertSound(s);
          next.push(s);
        }
      }
      frontier = next;
    }
  });
});

// ── 2. Sync ──────────────────────────────────────────────────

describe('invariant 2 — never synced while signed out', () => {
  const reduce = (events: SyncEvent[]): SyncState =>
    events.reduce(syncStateReducer, initialSyncState);

  it('a success event arriving after session loss is dropped', () => {
    const s = reduce([
      { type: 'init', hasClient: true, online: true },
      { type: 'sync-started', now: 1_000, attempt: 1 },
      { type: 'session-lost' },
      { type: 'sync-succeeded', at: '2026-11-13T00:00:00.000Z' },
    ]);
    expect(s.kind).toBe('signed-out');
  });

  it('a success event in the signed-out state is a no-op', () => {
    const signedOut = reduce([
      { type: 'init', hasClient: true, online: true },
      { type: 'session-lost' },
    ]);
    expect(signedOut.kind).toBe('signed-out');
    expect(
      syncStateReducer(signedOut, { type: 'sync-succeeded', at: '2026-11-13T00:00:00.000Z' }),
    ).toBe(signedOut);
  });
});

// ── 3. Tombstones ────────────────────────────────────────────

describe('invariant 3 — never live and tombstoned at once', () => {
  interface Full extends TombstoneListsState {
    workouts: { id: string }[];
    meals: { id: string }[];
    bodyMetrics: { id: string }[];
    plannedWorkouts: { id: string }[];
    prs: { id: string }[];
  }
  const base = (): Full => ({
    workouts: [{ id: 'w1' }, { id: 'w2' }],
    meals: [{ id: 'm1' }],
    bodyMetrics: [],
    plannedWorkouts: [{ id: 'p1' }],
    prs: [{ id: 'pr1' }],
  });

  // Compose the transitions the way every store call site does:
  // the live list changes hands alongside the tombstone partial.
  const del = (s: Full, liveKey: keyof Full, collection: 'workouts' | 'meals' | 'planned_workouts' | 'personal_records', ids: string[]): Full => {
    const partial = applyDeletionToState(s, collection, ids);
    return {
      ...s,
      [liveKey]: (s[liveKey] as { id: string }[]).filter((r) => !ids.includes(r.id)),
      ...partial,
    } as Full;
  };
  const restore = (s: Full, liveKey: keyof Full, collection: 'workouts' | 'meals' | 'planned_workouts' | 'personal_records', rows: { id: string }[]): Full => {
    const partial = applyRestoreToState(s, collection, rows.map((r) => r.id));
    return { ...s, [liveKey]: [...(s[liveKey] as { id: string }[]), ...rows], ...partial } as Full;
  };

  it('holds through delete / restore / re-delete sequences', () => {
    let s = base();
    expect(findLiveTombstoneOverlaps(s)).toEqual([]);
    s = del(s, 'workouts', 'workouts', ['w1']);
    expect(findLiveTombstoneOverlaps(s)).toEqual([]);
    s = del(s, 'meals', 'meals', ['m1']);
    s = del(s, 'plannedWorkouts', 'planned_workouts', ['p1']);
    expect(findLiveTombstoneOverlaps(s)).toEqual([]);
    s = restore(s, 'workouts', 'workouts', [{ id: 'w1' }]);
    expect(findLiveTombstoneOverlaps(s)).toEqual([]);
    s = del(s, 'workouts', 'workouts', ['w1', 'w2']);
    s = restore(s, 'meals', 'meals', [{ id: 'm1' }]);
    s = del(s, 'prs', 'personal_records', ['pr1']);
    expect(findLiveTombstoneOverlaps(s)).toEqual([]);
  });
});

// ── 4. Today ─────────────────────────────────────────────────

describe('invariant 4 — a day is never both rest and in progress', () => {
  const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const restWeek = Object.fromEntries(DAYS.map((d) => [d, { kind: 'rest' }])) as WeeklySchedule;
  const TODAY = '2026-11-09';
  const doneSet: WorkoutSet = { reps: 5, weight: 100, unit: 'kg', status: 'completed' };
  const doneWorkout: WorkoutEntry = {
    id: 'w-done',
    date: TODAY,
    name: 'Squat Day',
    exercises: [{ name: 'Squat', sets: [doneSet] }],
  };

  it('rest day, nothing else → the single status is rest', () => {
    const info = getTodaySessionState(TODAY, [], [], null, 'kg', restWeek);
    expect(info.status).toBe('rest');
  });

  it('rest day + active draft → in_progress wins (one status, never both)', () => {
    const info = getTodaySessionState(
      TODAY,
      [],
      [],
      { exercises: [{ name: 'Squat' }] },
      'kg',
      restWeek,
    );
    expect(info.status).toBe('in_progress');
  });

  it('rest day + a completed workout → completed wins', () => {
    const info = getTodaySessionState(TODAY, [doneWorkout], [], null, 'kg', restWeek);
    expect(info.status).toBe('completed');
  });
});

// ── 5. PRs ───────────────────────────────────────────────────

describe('invariant 5 — PRs equal the recomputation + manual records', () => {
  const mkSet = (over: Partial<WorkoutSet> = {}): WorkoutSet => ({
    reps: 5,
    weight: 100,
    unit: 'kg',
    status: 'completed',
    ...over,
  });
  const mkWorkout = (id: string, date: string, weight: number): WorkoutEntry => ({
    id,
    date,
    name: 'Upper A',
    exercises: [{ name: 'Bench Press', sets: [mkSet({ weight })] }],
  });
  const W1 = mkWorkout('wk1', '2026-10-26', 100);
  const W2 = mkWorkout('wk2', '2026-11-02', 110);
  const MANUAL: PersonalRecord = {
    id: 'pr-manual', exercise: 'Bench Press', weightKg: 120, weightLbs: 264.6,
    reps: 3, oneRepMax: 132, date: '2026-11-03', notes: 'Tested at the gym meet',
  };
  const STALE: PersonalRecord = {
    id: 'pr-stale', exercise: 'Bench Press', weightKg: 110, weightLbs: 242.5,
    reps: 5, oneRepMax: 128.3, date: '2026-11-02', notes: 'All-Time 1RM PR', prType: '1rm',
  };

  const applyPlan = (prs: PersonalRecord[], workouts: WorkoutEntry[]): PersonalRecord[] => {
    const plan = planDerivedPRsAfterHistoryChange({
      exerciseNames: ['Bench Press'],
      prs,
      allWorkouts: workouts,
      bodyweightKg: 75,
      userUnit: 'kg',
    });
    expect(plan.deleteIds).not.toContain(MANUAL.id);
    return [...prs.filter((p) => !plan.deleteIds.includes(p.id)), ...plan.create];
  };

  it('reconcile converges: after applying the plan, replanning is empty', () => {
    // From a stale record + manual: history says W2 never happened.
    const once = applyPlan([MANUAL, STALE], [W1]);
    const plan2 = planDerivedPRsAfterHistoryChange({
      exerciseNames: ['Bench Press'],
      prs: once,
      allWorkouts: [W1],
      bodyweightKg: 75,
      userUnit: 'kg',
    });
    expect(plan2.create).toEqual([]);
    expect(plan2.deleteIds).toEqual([]);
    // The surviving derived record is the W1 baseline; manual intact.
    expect(once.map((p) => p.id).sort()).toContain(MANUAL.id);
    expect(once.filter((p) => p.id !== MANUAL.id)).toHaveLength(1);
    expect(once.find((p) => p.id !== MANUAL.id)?.weightKg).toBe(100);
  });

  it('full history derives baseline + top, and stays converged', () => {
    const once = applyPlan([MANUAL], [W1, W2]);
    expect(once.filter((p) => p.id !== MANUAL.id)).toHaveLength(2);
    const plan2 = planDerivedPRsAfterHistoryChange({
      exerciseNames: ['Bench Press'],
      prs: once,
      allWorkouts: [W1, W2],
      bodyweightKg: 75,
      userUnit: 'kg',
    });
    expect(plan2.create).toEqual([]);
    expect(plan2.deleteIds).toEqual([]);
  });
});
