import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ARCHIVED_HISTORY_KEY,
  hasRetainedHistory,
  readArchivedHistory,
  retainedHistoryCounts,
} from '../src/lib/history-fork';
import { useStore } from '@/lib/store';

/**
 * Gauntlet Cycle 2 (B-07 + TRIAGE-PA-01): the mid-onboarding fork
 * hijack and the archive clobber, both traced to one predicate.
 *
 * Part B observed, after logout → onboarding → Start fresh following
 * 3 logged sessions: the saved-history prompt showed "0 sessions •
 * 0 meals • 0 plans • 1 target" and Settings → Restore archived read
 * "Archived 2026-10-28: 0 sessions, 0 meals, 0 plans".
 *
 * Root cause, proven by code trace (not by the click sequence, which
 * was not recorded): (1) logout archives BEFORE clearing, so the
 * 3-session archive was good; (2) onboarding sets macroGoals BEFORE
 * the profile exists (Onboarding.tsx computes recommended goals while
 * the profile is staged in pendingProfile); (3) the fork gate in
 * page.tsx fires on any render with profile null + retained history,
 * and forkResolved starts false per mount — so the targets-only
 * mid-onboarding state rendered the fork in place of onboarding,
 * showing exactly 0/0/0/1; (4) Start fresh on that fork archived the
 * targets-only live state into the single-slot archive, overwriting
 * the good 3-session archive — hence the 0/0/0 Restore label.
 * TRIAGE-PA-01 (Part A: "Continue with saved history" lost the
 * profile) is the same hijack: unmounting onboarding destroyed the
 * staged profile.
 *
 * The fix narrows hasRetainedHistory to history records. Targets are
 * still counted for display; they no longer trigger the fork or the
 * archival guards — which also matches onboarding's own design (it
 * deliberately preserves existing targets on re-onboarding).
 */

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

describe('gauntlet Cycle 2 B-07: targets-only state is not retained history', () => {
  it('the mid-onboarding shape (profile null, macroGoals set, nothing else) does not trigger', () => {
    // Exactly the live state Onboarding.tsx creates before setProfile:
    // fresh slate + recommended macro goals, no sessions/meals/plans.
    expect(
      hasRetainedHistory({
        workouts: [],
        meals: [],
        plannedWorkouts: [],
        prs: [],
        bodyMetrics: [],
        prTargets: {},
        macroGoals: { calories: 2448, proteinG: 126 },
      })
    ).toBe(false);
  });

  it('counts still report targets for display when the fork fires for real history', () => {
    expect(
      retainedHistoryCounts({
        workouts: [{}, {}],
        meals: [],
        plannedWorkouts: [],
        prs: [],
        bodyMetrics: [],
        prTargets: { Squat: 100 },
        macroGoals: { calories: 2000 },
      })
    ).toEqual({ sessions: 2, meals: 0, plans: 0, targets: 2 });
  });

  it('history slices still trigger exactly as before', () => {
    expect(hasRetainedHistory({ workouts: [{ id: 'w1' }] })).toBe(true);
    expect(hasRetainedHistory({ prs: [{ id: 'p1' }] })).toBe(true);
    expect(hasRetainedHistory({ bodyMetrics: [{ id: 'b1' }] })).toBe(true);
  });
});

describe('gauntlet Cycle 2 B-07: targets-only logout must not clobber a good archive', () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = storage;
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  it('a targets-only logout leaves a previous sessions archive intact', () => {
    // The good archive from an earlier logout (3 sessions).
    const sentinel = JSON.stringify({
      workouts: [
        { id: 's1', date: '2026-10-20', exercises: [] },
        { id: 's2', date: '2026-10-21', exercises: [] },
        { id: 's3', date: '2026-10-22', exercises: [] },
      ],
      meals: [],
      plannedWorkouts: [],
      prs: [],
      bodyMetrics: [],
      prTargets: {},
      macroGoals: null,
      archivedAt: '2026-10-28T00:00:00.000Z',
    });
    storage.setItem(ARCHIVED_HISTORY_KEY, sentinel);

    // Live state of a fresh profile that only ever got targets
    // (e.g. onboarding computed goals, no sessions logged yet).
    useStore.setState({
      profile: { id: 'guest_1', name: 'Athlete' },
      hasCompletedOnboarding: true,
      workouts: [],
      meals: [],
      plannedWorkouts: [],
      prs: [],
      bodyMetrics: [],
      prTargets: {},
      macroGoals: { calories: 2448, proteinG: 126 },
    } as never);

    useStore.getState().logout({ clearLocalData: false });

    expect(useStore.getState().profile).toBeNull();
    // Pre-fix, the guard saw targets=1, archived the sessions-empty
    // live state, and this sentinel was destroyed.
    expect(storage.getItem(ARCHIVED_HISTORY_KEY)).toBe(sentinel);
    expect(readArchivedHistory()!.counts.sessions).toBe(3);
  });

  it('a logout WITH sessions still archives (no regression in the guard)', () => {
    useStore.setState({
      profile: { id: 'guest_1', name: 'Athlete' },
      hasCompletedOnboarding: true,
      workouts: [{ id: 'w1', date: '2026-10-20', exercises: [] }],
      meals: [],
      plannedWorkouts: [],
      prs: [],
      bodyMetrics: [],
      prTargets: {},
      macroGoals: { calories: 2448, proteinG: 126 },
    } as never);

    useStore.getState().logout({ clearLocalData: false });

    const archived = readArchivedHistory();
    expect(archived).not.toBeNull();
    expect(archived!.counts.sessions).toBe(1);
    expect(useStore.getState().workouts).toEqual([]);
  });
});
