import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Gauntlet R4 regression: a backup import used to replace every slice
 * the backup carries with no snapshot and no undo. importAllData now
 * archives the current state first (gated on retained history, skipped
 * for archive restores so the archive stays repeatable), so
 * Settings → Restore archived undoes an import.
 *
 * Vitest runs in a node environment (no window/localStorage), so the
 * test stubs both before dynamically importing the store module.
 */
describe('gauntlet R4: import archives first', () => {
  let memory: Map<string, string>;
  let useStore: any;
  const ARCHIVE_KEY = 'ascend_archived_history';

  beforeEach(async () => {
    vi.resetModules();
    memory = new Map<string, string>();
    const localStorageStub = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, String(v));
      },
      removeItem: (k: string) => {
        memory.delete(k);
      },
      clear: () => memory.clear(),
      get length() {
        return memory.size;
      },
      key: (i: number) => Array.from(memory.keys())[i] ?? null,
    };
    vi.stubGlobal('window', {
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal('document', {
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal('localStorage', localStorageStub);
    ({ useStore } = await import('../src/lib/store'));
    useStore.getState().clearAllData();
  });

  it('archives the pre-import workouts, and restore brings them back', () => {
    const store = useStore.getState();
    store.addWorkout({
      id: 'before-1',
      date: '2026-10-20',
      name: 'Before import',
      exercises: [],
    } as never);
    expect(useStore.getState().workouts.map((w: any) => w.id)).toEqual(['before-1']);

    const ok = useStore.getState().importAllData({
      workouts: [{ id: 'imported-1', date: '2026-10-21', name: 'Imported', exercises: [] }],
    });
    expect(ok).toBe(true);
    expect(useStore.getState().workouts.map((w: any) => w.id)).toEqual(['imported-1']);

    const archiveRaw = memory.get(ARCHIVE_KEY);
    expect(archiveRaw).toBeDefined();
    const archive = JSON.parse(archiveRaw!);
    expect((archive.workouts || []).map((w: any) => w.id)).toContain('before-1');

    // Restore undoes the import, and the archive survives for a repeat.
    expect(useStore.getState().restoreArchivedHistory()).toBe(true);
    expect(useStore.getState().workouts.map((w: any) => w.id)).toContain('before-1');
    expect(memory.get(ARCHIVE_KEY)).toBe(archiveRaw);
  });

  it('an import over an empty state does not clobber a previous archive', () => {
    const store = useStore.getState();
    store.addWorkout({
      id: 'old-1',
      date: '2026-10-20',
      name: 'Old',
      exercises: [],
    } as never);
    expect(useStore.getState().archiveRetainedHistory()).toBe(true);
    const firstArchive = memory.get(ARCHIVE_KEY);

    // Empty the live state WITHOUT purging localStorage (clearAllData is
    // a full purge and deliberately wipes archives — not the case here).
    useStore.setState({
      workouts: [],
      meals: [],
      bodyMetrics: [],
      plannedWorkouts: [],
      prs: [],
      prTargets: {},
      macroGoals: null,
    });
    expect(memory.get(ARCHIVE_KEY)).toBe(firstArchive);
    useStore.getState().importAllData({
      workouts: [{ id: 'imported-2', date: '2026-10-21', name: 'Imported', exercises: [] }],
    });
    expect(memory.get(ARCHIVE_KEY)).toBe(firstArchive);
  });
});
