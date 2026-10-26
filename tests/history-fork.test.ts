import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ARCHIVED_HISTORY_KEY,
  hasRetainedHistory,
  readArchivedHistory,
  retainedHistoryCounts,
} from '../src/lib/history-fork';
import { HOWTO_SEEN_KEY } from '../src/lib/howto-guide';
import { calculateRecommendedMacroGoals } from '../src/lib/macros';
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

  it('Start fresh archives the history, then opens a default profile (no onboarding redo)', () => {
    // Simulate a previous guide dismissal in this browser profile.
    storage.setItem(HOWTO_SEEN_KEY, '1');
    const ok = useStore.getState().startFreshFromRetainedHistory();
    expect(ok).toBe(true);
    const after = useStore.getState();
    expect(after.workouts).toEqual([]);
    expect(after.meals).toEqual([]);
    expect(after.plannedWorkouts).toEqual([]);
    expect(after.prTargets).toEqual({});
    expect(after.weeklySchedule.monday.workoutPlanId).toBe('rest');

    // NEW (user decision, 2026-10-26): Start fresh creates the same
    // default profile untouched onboarding produces — no DOB, no
    // plans — and marks onboarding complete, so the app opens on
    // Today instead of the onboarding start screen.
    expect(after.hasCompletedOnboarding).toBe(true);
    expect(after.profile).toBeTruthy();
    expect(after.profile!.id.startsWith('guest_')).toBe(true);
    expect(after.profile!.name).toBe('Athlete');
    expect(after.profile!.gender).toBe('male');
    expect(after.profile!.bodyweightKg).toBe(70);
    expect(after.profile!.bodyweightLbs).toBe(154.3);
    expect(after.profile!.heightCm).toBe(175);
    expect(after.profile!.unit).toBe('kg');
    expect(after.profile!.dietPreference).toBe('non_vegetarian');
    expect(after.profile!.goals).toEqual(['build_muscle']);
    expect(after.profile!.userMode).toBe('beginner');
    expect(after.profile!.dateOfBirth).toBeUndefined();
    expect(after.profile!.age).toBeUndefined();
    expect(after.userMode).toBe('beginner');
    expect(after.trainingProfile.goal).toBe('build_muscle');
    expect(after.trainingProfile.experience).toBe('beginner');
    expect(after.trainingProfile.daysPerWeek).toBe(4);
    expect(after.trainingProfile.equipment).toBe('full_gym');
    expect(after.trainingProfile.preferredDurationMin).toBe(45);
    expect(after.trainingProfile.coachingStyle).toBe('balanced');
    expect(after.trainingProfile.injuriesOrLimitations).toEqual([]);
    expect(after.macroGoals).toEqual(
      calculateRecommendedMacroGoals(70, 'build_muscle', 'male', 175, undefined, 'light')
    );
    // setProfile's baseline bodyweight backfill.
    expect(after.bodyMetrics).toHaveLength(1);
    expect(after.bodyMetrics[0].weightKg).toBe(70);
    expect(after.bodyMetrics[0].heightCm).toBe(175);
    // The guide once-flag is cleared so the new user sees the guide
    // once on first Today arrival.
    expect(storage.getItem(HOWTO_SEEN_KEY)).toBeNull();

    // Nothing deleted: the archive holds the original history.
    const raw = storage.getItem(ARCHIVED_HISTORY_KEY);
    expect(raw).not.toBeNull();
    const archived = JSON.parse(raw!);
    expect(archived.workouts).toHaveLength(1);
    expect(archived.plannedWorkouts).toHaveLength(1);
    expect(archived.archivedAt).toBeTruthy();

    // The stale emergency snapshot is gone. The logged-out flag is
    // CLEARED (changed behavior): setProfile clears it exactly as a
    // normal onboarding completion does, and disaster recovery has
    // nothing to resurrect here — the snapshot and legacy keys are
    // deleted above.
    expect(storage.getItem('ascend_logged_out')).toBeNull();
    expect(storage.getItem('ascend_emergency_snapshot')).toBeNull();

    // The fork gate in page.tsx requires NO profile, so a present
    // profile skips the fork — even though the computed macroGoals
    // now count as a target in hasRetainedHistory (same as after any
    // normal onboarding, which also sets macroGoals).
    expect(after.profile).not.toBeNull();
    expect(after.hasCompletedOnboarding).toBe(true);
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
    // No default profile is created on failure — the fork stays.
    expect(useStore.getState().profile).toBeNull();
    expect(useStore.getState().hasCompletedOnboarding).toBe(false);
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
