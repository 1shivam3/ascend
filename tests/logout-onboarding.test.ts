import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ARCHIVED_HISTORY_KEY,
  hasRetainedHistory,
  readArchivedHistory,
} from '../src/lib/history-fork';
import { useStore } from '@/lib/store';

// Logout-to-onboarding (user order): Settings "Log Out" (keep-data)
// must land on onboarding directly, not the saved-history fork. The
// retained history is ARCHIVED (never deleted) so it stays restorable
// via Settings → Restore archived, and the fork itself stays for
// genuine fresh-guest boots where retained history exists WITHOUT a
// preceding logout.

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

function liveRetainedInput() {
  const s = useStore.getState();
  return {
    workouts: s.workouts,
    meals: s.meals,
    plannedWorkouts: s.plannedWorkouts,
    prs: s.prs,
    bodyMetrics: s.bodyMetrics,
    prTargets: s.prTargets,
    macroGoals: s.macroGoals,
  };
}

describe('logout → onboarding (no fork), history archived', () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = storage;
    useStore.setState({
      profile: { name: 'Athlete' },
      hasCompletedOnboarding: true,
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

  it('keep-data logout archives history and clears live slices, so the boot branch renders onboarding', () => {
    useStore.getState().logout({ clearLocalData: false });
    const s = useStore.getState();

    // The page.tsx !profile branch renders the fork only when
    // hasRetainedHistory is true; after logout both inputs say
    // onboarding: no profile, nothing retained.
    expect(s.profile).toBeNull();
    expect(s.hasCompletedOnboarding).toBe(false);
    expect(hasRetainedHistory(liveRetainedInput())).toBe(false);
    expect(s.workouts).toEqual([]);
    expect(s.meals).toEqual([]);
    expect(s.plannedWorkouts).toEqual([]);
    expect(s.prs).toEqual([]);
    expect(s.bodyMetrics).toEqual([]);
    expect(s.prTargets).toEqual({});
    expect(s.macroGoals).toBeNull();

    // Archived, not deleted: the full history sits in the archive.
    const archived = readArchivedHistory();
    expect(archived).not.toBeNull();
    expect(archived!.counts).toEqual({ sessions: 1, meals: 1, plans: 1, targets: 2 });
    expect(archived!.archivedAt).toBeTruthy();
  });

  it('archived logout history is restorable via the existing restore path', () => {
    useStore.getState().logout({ clearLocalData: false });
    expect(useStore.getState().workouts).toEqual([]);

    expect(useStore.getState().restoreArchivedHistory()).toBe(true);
    const s = useStore.getState();
    expect(s.workouts).toHaveLength(1);
    expect((s.workouts[0] as { id: string }).id).toBe('w1');
    expect(s.meals).toHaveLength(1);
  });

  it('a failed archive write keeps live history (fork protection, not silent loss)', () => {
    const throwing = memoryStorage();
    const realSet = throwing.setItem.bind(throwing);
    throwing.setItem = (k: string, v: string) => {
      if (k === ARCHIVED_HISTORY_KEY) throw new Error('disk full');
      realSet(k, v);
    };
    (globalThis as any).localStorage = throwing;

    expect(useStore.getState().archiveRetainedHistory()).toBe(false);
    useStore.getState().logout({ clearLocalData: false });

    // Profile still signs out, but history stays live so the fork
    // still guards it instead of it vanishing.
    expect(useStore.getState().profile).toBeNull();
    expect(hasRetainedHistory(liveRetainedInput())).toBe(true);
    expect(useStore.getState().workouts).toHaveLength(1);
  });

  it('logout with nothing retained does not clobber a previous archive', () => {
    const sentinel = JSON.stringify({
      workouts: [{ id: 'old', date: '2026-01-01', exercises: [] }],
      meals: [],
      plannedWorkouts: [],
      prs: [],
      bodyMetrics: [],
      prTargets: {},
      macroGoals: null,
      archivedAt: '2026-01-02T00:00:00.000Z',
    });
    storage.setItem(ARCHIVED_HISTORY_KEY, sentinel);
    useStore.setState({
      workouts: [],
      meals: [],
      plannedWorkouts: [],
      prs: [],
      bodyMetrics: [],
      prTargets: {},
      macroGoals: null,
    } as never);

    useStore.getState().logout({ clearLocalData: false });

    expect(storage.getItem(ARCHIVED_HISTORY_KEY)).toBe(sentinel);
    expect(useStore.getState().profile).toBeNull();
  });

  it('the fork still triggers for retained history WITHOUT a preceding logout', () => {
    // Genuine fresh-guest boot: history retained, no logout happened.
    // The fork condition must still fire — logout is what clears it,
    // not a change to the fork itself.
    expect(hasRetainedHistory(liveRetainedInput())).toBe(true);
    const page = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8');
    expect(page).toContain('HistoryForkScreen');
    expect(page).toContain('hasRetainedHistory');
    expect(page).toContain('OnboardingScreen');
  });
});

describe('Log Out & Clear unchanged (full wipe)', () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = storage;
    useStore.setState({
      profile: { name: 'Athlete' },
      hasCompletedOnboarding: true,
      workouts: [{ id: 'w1', date: '2026-10-20', exercises: [] }],
      meals: [{ id: 'm1', date: '2026-10-20', name: 'Lunch', foods: [] }],
    } as never);
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  it('clear logout wipes state and removes the store blob without archiving', () => {
    const sentinel = JSON.stringify({ workouts: [], archivedAt: '2026-01-02T00:00:00.000Z' });
    storage.setItem(ARCHIVED_HISTORY_KEY, sentinel);
    storage.setItem('ascend_store', JSON.stringify({ state: {}, version: 0 }));

    useStore.getState().logout({ clearLocalData: true });

    const s = useStore.getState();
    expect(s.profile).toBeNull();
    expect(s.workouts).toEqual([]);
    expect(s.meals).toEqual([]);
    expect(storage.getItem('ascend_store')).toBeNull();
    // The clear path never writes an archive: a previous archive (if
    // any) is untouched by this store action itself.
    expect(storage.getItem(ARCHIVED_HISTORY_KEY)).toBe(sentinel);
  });
});
