import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ARCHIVED_HISTORY_KEY,
  hasRetainedHistory,
  readArchivedHistory,
  retainedHistoryCounts,
} from '../src/lib/history-fork';
import { useStore } from '@/lib/store';

// FND-06: a fresh profile must never silently inherit retained history.
// Start fresh archives (never deletes); the archive stays restorable.

describe('retained-history detection (pure)', () => {
  it('empty state has no retained history', () => {
    expect(hasRetainedHistory({})).toBe(false);
    expect(hasRetainedHistory({ workouts: [], meals: [], plannedWorkouts: [], prTargets: {} })).toBe(false);
  });

  it('any of sessions, meals, plans, PRs, metrics or targets counts', () => {
    expect(hasRetainedHistory({ meals: [{ id: 'm1' }] })).toBe(true);
    expect(hasRetainedHistory({ plannedWorkouts: [{ id: 'p1' }] })).toBe(true);
    expect(hasRetainedHistory({ prTargets: { Squat: 100 } })).toBe(true);
    expect(hasRetainedHistory({ macroGoals: { calories: 2000 } })).toBe(true);
    expect(hasRetainedHistory({ bodyMetrics: [{ id: 'b1' }] })).toBe(true);
  });

  it('counts are exact, and a name is never required to identify history', () => {
    const counts = retainedHistoryCounts({
      workouts: [{}, {}],
      meals: [{}],
      plannedWorkouts: [{}, {}, {}],
      prTargets: { Squat: 100, Bench: 80 },
      macroGoals: { calories: 2000 },
    });
    expect(counts).toEqual({ sessions: 2, meals: 1, plans: 3, targets: 3 });
  });
});

// ── Store actions (localStorage stubbed: vitest runs in node) ──────────────
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
  };
}

describe('startFreshFromRetainedHistory / restoreArchivedHistory', () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = storage;
    // Simulate the post-logout state: flag set, history retained.
    storage.setItem('ascend_logged_out', 'true');
    storage.setItem('ascend_emergency_snapshot', JSON.stringify({ workouts: [{ id: 'w1' }] }));
    useStore.setState({
      profile: null,
      hasCompletedOnboarding: false,
      workouts: [{ id: 'w1', date: '2026-10-20', exercises: [] }],
      meals: [{ id: 'm1', date: '2026-10-20', name: 'Lunch', foods: [] }],
      plannedWorkouts: [{ id: 'p1', name: 'Plan', exercises: [], createdAt: '2026-01-01' }],
      prTargets: { Squat: 100 },
      macroGoals: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 70 },
      prs: [],
      bodyMetrics: [],
    } as never);
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  it('Start fresh archives the history, then shows zero sessions/plans/targets', () => {
    const ok = useStore.getState().startFreshFromRetainedHistory();
    expect(ok).toBe(true);
    const after = useStore.getState();
    expect(after.workouts).toEqual([]);
    expect(after.meals).toEqual([]);
    expect(after.plannedWorkouts).toEqual([]);
    expect(after.prTargets).toEqual({});
    expect(after.macroGoals).toBeNull();
    expect(after.weeklySchedule.monday.workoutPlanId).toBe('rest');

    // Nothing deleted: the archive holds the original history.
    const raw = storage.getItem(ARCHIVED_HISTORY_KEY);
    expect(raw).not.toBeNull();
    const archived = JSON.parse(raw!);
    expect(archived.workouts).toHaveLength(1);
    expect(archived.plannedWorkouts).toHaveLength(1);
    expect(archived.archivedAt).toBeTruthy();

    // The logged-out flag survives (disaster recovery stays gated),
    // and the stale emergency snapshot is gone.
    expect(storage.getItem('ascend_logged_out')).toBe('true');
    expect(storage.getItem('ascend_emergency_snapshot')).toBeNull();

    // The fork no longer triggers for the cleared state.
    expect(
      hasRetainedHistory({
        workouts: after.workouts,
        meals: after.meals,
        plannedWorkouts: after.plannedWorkouts,
        prTargets: after.prTargets,
        macroGoals: after.macroGoals,
      })
    ).toBe(false);
  });

  it('a failed archive write clears nothing', () => {
    const failing = memoryStorage();
    failing.setItem = () => {
      throw new Error('quota');
    };
    (globalThis as any).localStorage = failing;
    const ok = useStore.getState().startFreshFromRetainedHistory();
    expect(ok).toBe(false);
    expect(useStore.getState().workouts).toHaveLength(1);
  });

  it('restore brings the archived history back and keeps onboarding complete', () => {
    useStore.getState().startFreshFromRetainedHistory();
    expect(useStore.getState().workouts).toEqual([]);
    // Simulate the fresh profile the user set up after Start fresh.
    useStore.setState({ profile: { id: 'new', name: 'New' }, hasCompletedOnboarding: true } as never);
    const ok = useStore.getState().restoreArchivedHistory();
    expect(ok).toBe(true);
    const after = useStore.getState();
    expect(after.workouts).toHaveLength(1);
    expect(after.plannedWorkouts).toHaveLength(1);
    expect(after.profile?.name).toBe('New');
    expect(after.hasCompletedOnboarding).toBe(true);
    // The archive is kept, so a restore is repeatable.
    expect(storage.getItem(ARCHIVED_HISTORY_KEY)).not.toBeNull();
  });

  it('readArchivedHistory rejects non-ASCEND payloads', () => {
    storage.setItem(ARCHIVED_HISTORY_KEY, JSON.stringify({ hello: 1 }));
    expect(readArchivedHistory()).toBeNull();
  });
});
