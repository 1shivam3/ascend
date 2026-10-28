/**
 * Second-round B1b: reset must hold with another tab open.
 *
 * Simulates browser tabs sharing one localStorage, using the REAL
 * store + guard modules with fresh module instances per tab
 * (vi.resetModules + dynamic import) and fake timers. BroadcastChannel
 * is stubbed out (it is documented accelerator-only; heartbeat is the
 * source of truth), so cross-tab effects here run through storage +
 * timers exactly as they do when BC messages are missed or delayed.
 *
 * Live evidence (preview 00a2c930, guest, two tabs): follower-tab
 * reset AND leader-tab reset, each with the other tab open, both
 * toasted "purged" yet showed the old data after reload.
 *
 * Root cause (V1): the resetting tab's OWN snapshot timer. The
 * rehydrate inside ensureDeleteWillPersist schedules a timer carrying
 * the OLD state; clearAllData's reset-to-defaults set() never
 * cancelled it, because clearTimeout lived inside the data guard
 * (defaults fail the guard). The timer then fired after the purge
 * and PASSED the fire-time leadership proof, because the resetting
 * tab legitimately holds leadership after re-claim. Fix: cancel on
 * every state change, before any guard.
 *
 * Hardening (V2, V3): a purge marker + storage-event convergence.
 * clearAllData writes ascend_purge_at after purging; other tabs reset
 * their memory to fresh on the storage event, and a snapshot timer
 * predating the marker aborts at fire time (covers the resetter
 * unloads → old leader claims → old timer fires order).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
}

const shared = new MemoryStorage();
const allPagehide: (() => void)[] = [];
const allStorage: ((e: any) => void)[] = [];

function installBrowserStubs() {
  (globalThis as any).localStorage = shared;
  (globalThis as any).window = {
    localStorage: shared,
    addEventListener: (type: string, cb: () => void) => {
      if (type === 'pagehide' || type === 'beforeunload') allPagehide.push(cb as () => void);
      if (type === 'storage') allStorage.push(cb as (e: any) => void);
    },
    removeEventListener: () => {},
    setInterval: (cb: (...a: any[]) => void, ms: number) => setInterval(cb, ms),
    clearInterval: (h: unknown) => clearInterval(h as any),
  };
  (globalThis as any).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).BroadcastChannel = undefined;
}

async function bootTab() {
  const pagehideBefore = allPagehide.length;
  const storageBefore = allStorage.length;
  vi.resetModules();
  const storeMod: any = await import('../src/lib/store');
  const leaderMod: any = await import('../src/lib/tab-leader');
  const guardMod: any = await import('../src/lib/delete-persist-guard');
  const guard = leaderMod.getTabLeaderGuard();
  await storeMod.useAppStore.persist.rehydrate();
  // Flush the onRehydrateStorage queueMicrotask recovery.
  await Promise.resolve();
  await Promise.resolve();
  return {
    storeMod,
    leaderMod,
    guardMod,
    guard,
    pagehideListeners: allPagehide.slice(pagehideBefore),
    storageListeners: allStorage.slice(storageBefore),
  };
}

const OLD_PR = { id: 'pr-squat', exercise: 'Squat', weight: 100, reps: 1, date: '2026-10-28' };
const OLD_MEAL = { id: 'meal-breakfast', name: 'Breakfast', foods: [], date: '2026-10-28' };

function seedOldData(tab: any) {
  tab.storeMod.useAppStore.setState({
    profile: { name: 'Athlete', weightKg: 75 } as any,
    prs: [OLD_PR],
    meals: [OLD_MEAL],
  });
}

describe('second-round B1b: reset holds with another tab open', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installBrowserStubs();
    shared.map.clear();
    allPagehide.length = 0;
    allStorage.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('V1: resetter stays alive; its own pre-reset snapshot timer must not resurrect', async () => {
    const L = await bootTab();
    expect(L.guard.isLeader()).toBe(true);
    seedOldData(L);
    // Snapshot timer pending (do NOT advance past 2s — backgrounded
    // tabs throttle exactly this way live).
    expect(shared.getItem('ascend_store')).toContain('Squat');

    const F = await bootTab();
    expect(F.guard.isLeader()).toBe(false);
    await F.storeMod.useAppStore.persist.rehydrate();
    expect(F.storeMod.useAppStore.getState().prs).toHaveLength(1);

    const ok = await F.guardMod.ensureDeleteWillPersist();
    expect(ok).toBe(true);
    F.storeMod.useAppStore.getState().clearAllData();
    expect(shared.getItem('ascend_store')).toBeNull();
    expect(shared.getItem('ascend_emergency_snapshot')).toBeNull();
    expect(shared.getItem('ascend_purge_at')).toBeTruthy();

    // Old leader's throttled snapshot timer + heartbeats fire.
    await vi.advanceTimersByTimeAsync(5000);
    expect(shared.getItem('ascend_emergency_snapshot')).toBeNull();
    expect(shared.getItem('ascend_store')).toBeNull();

    const R = await bootTab();
    await R.storeMod.useAppStore.persist.rehydrate();
    await Promise.resolve();
    await Promise.resolve();
    expect(R.storeMod.useAppStore.getState().prs).toHaveLength(0);
    expect(R.storeMod.useAppStore.getState().meals).toHaveLength(0);
  });

  it('V2: resetter unloads; old leader claims, then its pending timer fires — no snapshot', async () => {
    const L = await bootTab();
    seedOldData(L);
    const F = await bootTab();
    await F.storeMod.useAppStore.persist.rehydrate();
    const ok = await F.guardMod.ensureDeleteWillPersist();
    expect(ok).toBe(true);
    F.storeMod.useAppStore.getState().clearAllData();
    expect(shared.getItem('ascend_store')).toBeNull();
    expect(shared.getItem('ascend_emergency_snapshot')).toBeNull();

    // Faithful unload: stop the resetter's guard timers AND run its
    // pagehide listeners (leader record removed, as on a real reload).
    F.guard.stop();
    F.pagehideListeners.forEach((cb) => cb());
    expect(shared.getItem('ascend_tab_leader')).toBeNull();

    // Old leader's tick claims the vacuum, then its pending snapshot
    // timer fires as proven leader — the purge marker must abort it.
    await vi.advanceTimersByTimeAsync(5000);
    expect(shared.getItem('ascend_emergency_snapshot')).toBeNull();

    const R = await bootTab();
    await R.storeMod.useAppStore.persist.rehydrate();
    await Promise.resolve();
    await Promise.resolve();
    expect(R.storeMod.useAppStore.getState().prs).toHaveLength(0);
    expect(R.storeMod.useAppStore.getState().meals).toHaveLength(0);
  });

  it('V3: live old leader converges on the purge storage event', async () => {
    const L = await bootTab();
    seedOldData(L);
    const F = await bootTab();
    await F.storeMod.useAppStore.persist.rehydrate();
    const ok = await F.guardMod.ensureDeleteWillPersist();
    expect(ok).toBe(true);
    F.storeMod.useAppStore.getState().clearAllData();
    const marker = shared.getItem('ascend_purge_at');
    expect(marker).toBeTruthy();

    // Deliver the storage event to the old leader's listener only
    // (storage events never fire in the originating tab).
    L.storageListeners.forEach((cb) =>
      cb({ key: 'ascend_purge_at', newValue: marker, oldValue: null }),
    );
    expect(L.storeMod.useAppStore.getState().prs).toHaveLength(0);
    expect(L.storeMod.useAppStore.getState().meals).toHaveLength(0);
    // Converged tab cannot resurrect on later ticks/timers.
    await vi.advanceTimersByTimeAsync(5000);
    expect(shared.getItem('ascend_emergency_snapshot')).toBeNull();
    expect(shared.getItem('ascend_store')).toBeNull();

    const R = await bootTab();
    await R.storeMod.useAppStore.persist.rehydrate();
    await Promise.resolve();
    await Promise.resolve();
    expect(R.storeMod.useAppStore.getState().prs).toHaveLength(0);
    expect(R.storeMod.useAppStore.getState().meals).toHaveLength(0);
  });

  it('V4: single-tab reset still purges and marks', async () => {
    const L = await bootTab();
    seedOldData(L);
    L.storeMod.useAppStore.getState().clearAllData();
    expect(shared.getItem('ascend_store')).toBeNull();
    expect(shared.getItem('ascend_emergency_snapshot')).toBeNull();
    expect(shared.getItem('ascend_purge_at')).toBeTruthy();
    expect(L.storeMod.useAppStore.getState().prs).toHaveLength(0);
    expect(L.storeMod.useAppStore.getState().meals).toHaveLength(0);
    expect(L.storeMod.useAppStore.getState().profile).toBeNull();
  });
});
