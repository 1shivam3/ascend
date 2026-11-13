import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ARCHIVED_HISTORY_KEY,
  ARCHIVED_HISTORY_PREV_KEY,
  appendArchive,
  readArchiveResult,
  readArchiveGenerations,
} from '@/lib/history-fork';
import { macroGoalsFromArchive } from '@/lib/supabase/sync';
import { useStore } from '@/lib/store';

/**
 * Phase 1.8 (§12) — archive rotation.
 *
 * Before: a two-key rotation (read current → write PREV, silently
 * best-effort → write current) — a failed PREV write lost the older
 * generation without any signal, and the three readers disagreed:
 * restore and the summary read ONLY the current slot, while sync's
 * macro-goal restore fell back to PREV. Absent, corrupt, and foreign
 * were indistinguishable (all null).
 *
 * After: ONE key holds a versioned list {version: 2, archives:
 * [newest, previous]} — rotation is a single setItem. Readers share
 * one discriminated result and one fallback rule (current, then
 * previous). Legacy two-key data stays readable and migrates into
 * the list on the next archive write.
 */

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
  };
}
let storage: ReturnType<typeof memoryStorage>;

const backupA = { workouts: [{ id: 'a1' }], meals: [], archivedAt: '2026-11-01T00:00:00.000Z' };
const backupB = { workouts: [{ id: 'b1' }], meals: [], archivedAt: '2026-11-02T00:00:00.000Z' };
const backupC = { workouts: [{ id: 'c1' }], meals: [], archivedAt: '2026-11-03T00:00:00.000Z' };

beforeEach(() => {
  storage = memoryStorage();
  (globalThis as any).window = globalThis;
  (globalThis as any).localStorage = storage;
});
afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
});

describe('§12 the list write', () => {
  it('two appends land in ONE key as a versioned list, newest first', () => {
    expect(appendArchive(backupA)).toBe(true);
    expect(appendArchive(backupB)).toBe(true);
    const parsed = JSON.parse(storage.getItem(ARCHIVED_HISTORY_KEY)!);
    expect(parsed.version).toBe(2);
    expect(parsed.archives).toHaveLength(2);
    expect(parsed.archives[0]).toEqual(backupB);
    expect(parsed.archives[1]).toEqual(backupA);
    expect(storage.getItem(ARCHIVED_HISTORY_PREV_KEY)).toBeNull();
  });

  it('a third append keeps exactly two generations', () => {
    appendArchive(backupA);
    appendArchive(backupB);
    appendArchive(backupC);
    const parsed = JSON.parse(storage.getItem(ARCHIVED_HISTORY_KEY)!);
    expect(parsed.archives.map((a: any) => a.archivedAt)).toEqual([
      backupC.archivedAt,
      backupB.archivedAt,
    ]);
  });
});

describe('§12 legacy reads + migration', () => {
  it('legacy two-key data reads as current-then-previous', () => {
    storage.setItem(ARCHIVED_HISTORY_KEY, JSON.stringify(backupA));
    storage.setItem(ARCHIVED_HISTORY_PREV_KEY, JSON.stringify(backupB));
    expect(readArchiveGenerations()).toEqual([backupA, backupB]);
    const result = readArchiveResult();
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.slot).toBe('current');
      expect(result.format).toBe('legacy');
      expect(result.archive).toEqual(backupA);
    }
  });

  it('the next append migrates legacy generations into the list and drops the prev key', () => {
    storage.setItem(ARCHIVED_HISTORY_KEY, JSON.stringify(backupA));
    storage.setItem(ARCHIVED_HISTORY_PREV_KEY, JSON.stringify(backupB));
    expect(appendArchive(backupC)).toBe(true);
    const parsed = JSON.parse(storage.getItem(ARCHIVED_HISTORY_KEY)!);
    expect(parsed.archives.map((a: any) => a.archivedAt)).toEqual([
      backupC.archivedAt,
      backupA.archivedAt,
    ]);
    expect(storage.getItem(ARCHIVED_HISTORY_PREV_KEY)).toBeNull();
  });
});

describe('§12 the discriminated read + unified fallback', () => {
  it('absent storage reads absent; unparseable storage reads corrupt', () => {
    expect(readArchiveResult().kind).toBe('absent');
    storage.setItem(ARCHIVED_HISTORY_KEY, '{not json');
    expect(readArchiveResult().kind).toBe('corrupt');
    storage.setItem(ARCHIVED_HISTORY_KEY, JSON.stringify({ hello: 1 }));
    expect(readArchiveResult().kind).toBe('corrupt');
  });

  it('a corrupt current generation falls back to the previous one', () => {
    storage.setItem(
      ARCHIVED_HISTORY_KEY,
      JSON.stringify({ version: 2, archives: [{ hello: 1 }, backupA] }),
    );
    const result = readArchiveResult();
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.slot).toBe('previous');
      expect(result.archive).toEqual(backupA);
    }
  });

  it('macro-goal selection iterates generations: foreign current, mine in previous', () => {
    const foreign = {
      profile: { id: 'someone-else' },
      macroGoals: { calories: 3000, proteinG: 200, carbsG: 300, fatG: 100 },
    };
    const mine = {
      profile: { id: 'me' },
      macroGoals: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 70 },
    };
    storage.setItem(ARCHIVED_HISTORY_KEY, JSON.stringify({ version: 2, archives: [foreign, mine] }));
    let goals = null;
    for (const gen of readArchiveGenerations()) {
      goals = macroGoalsFromArchive(gen, 'me');
      if (goals) break;
    }
    expect(goals).toEqual(mine.macroGoals);
  });
});

describe('§12 store integration', () => {
  beforeEach(() => {
    useStore.setState({
      profile: null,
      hasCompletedOnboarding: false,
      workouts: [{ id: 'w1', date: '2026-10-20', exercises: [] }],
      meals: [],
      plannedWorkouts: [],
      prs: [],
      bodyMetrics: [],
    } as never);
  });

  it('restore uses the newest generation; with it corrupted, the previous one', () => {
    expect(useStore.getState().archiveRetainedHistory()).toBe(true);
    useStore.setState({ workouts: [{ id: 'w2', date: '2026-10-21', exercises: [] }] } as never);
    expect(useStore.getState().archiveRetainedHistory()).toBe(true);
    useStore.setState({ workouts: [] } as never);

    expect(useStore.getState().restoreArchivedHistory()).toBe(true);
    expect(useStore.getState().workouts.map((w) => w.id)).toEqual(['w2']);

    // Corrupt the newest generation inside the list: restore must
    // fall back to the first archive instead of failing outright.
    const parsed = JSON.parse(storage.getItem(ARCHIVED_HISTORY_KEY)!);
    parsed.archives[0] = { hello: 1 };
    storage.setItem(ARCHIVED_HISTORY_KEY, JSON.stringify(parsed));
    useStore.setState({ workouts: [] } as never);
    expect(useStore.getState().restoreArchivedHistory()).toBe(true);
    expect(useStore.getState().workouts.map((w) => w.id)).toEqual(['w1']);
  });
});
