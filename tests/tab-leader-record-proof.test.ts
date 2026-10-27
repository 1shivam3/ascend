import { describe, it, expect } from 'vitest';
import { TabLeaderGuard, STALE_MS } from '../src/lib/tab-leader';

/**
 * Preview-fix B1b: synchronous leadership proof from the localStorage
 * record. The in-memory leader flag lags a takeover until the next
 * heartbeat tick or BroadcastChannel message, but takeOver() writes
 * the record synchronously — so writers that fire late (a debounced
 * emergency snapshot stretched by background-tab throttling, or a
 * persist write in the takeover window) must check the record, not
 * the flag.
 */

function makeGuard(now: () => number, tabId = 'tab_self') {
  const backing = new Map<string, string>();
  return {
    guard: new TabLeaderGuard({
      storage: {
        getItem: (k: string) => backing.get(k) ?? null,
        setItem: (k: string, v: string) => {
          backing.set(k, v);
        },
        removeItem: (k: string) => {
          backing.delete(k);
        },
      },
      now,
      setInterval: () => 0,
      clearInterval: () => {},
      createChannel: () => null,
      newId: () => tabId,
      addUnloadListener: () => {},
    }),
    backing,
  };
}

describe('B1b: TabLeaderGuard record proof', () => {
  it('fresh own record proves leadership', () => {
    let t = 100_000;
    const { guard, backing } = makeGuard(() => t);
    backing.set('ascend_tab_leader', JSON.stringify({ tabId: 'tab_self', ts: t }));
    expect(guard.isProvenLeader()).toBe(true);
    expect(guard.isOtherLeaderActive()).toBe(false);
  });

  it('fresh other-owned record proves another leader is active', () => {
    let t = 100_000;
    const { guard, backing } = makeGuard(() => t);
    backing.set('ascend_tab_leader', JSON.stringify({ tabId: 'tab_other', ts: t }));
    expect(guard.isProvenLeader()).toBe(false);
    expect(guard.isOtherLeaderActive()).toBe(true);
  });

  it('stale records prove nothing either way', () => {
    let t = 100_000;
    const { guard, backing } = makeGuard(() => t);
    backing.set('ascend_tab_leader', JSON.stringify({ tabId: 'tab_self', ts: t - STALE_MS }));
    expect(guard.isProvenLeader()).toBe(false);
    expect(guard.isOtherLeaderActive()).toBe(false);
    backing.set('ascend_tab_leader', JSON.stringify({ tabId: 'tab_other', ts: t - STALE_MS }));
    expect(guard.isProvenLeader()).toBe(false);
    expect(guard.isOtherLeaderActive()).toBe(false);
  });

  it('missing or malformed record proves nothing', () => {
    let t = 100_000;
    const { guard, backing } = makeGuard(() => t);
    expect(guard.isProvenLeader()).toBe(false);
    expect(guard.isOtherLeaderActive()).toBe(false);
    backing.set('ascend_tab_leader', 'not-json{');
    expect(guard.isProvenLeader()).toBe(false);
    expect(guard.isOtherLeaderActive()).toBe(false);
  });

  it('boundary: one millisecond inside staleness is still fresh', () => {
    let t = 100_000;
    const { guard, backing } = makeGuard(() => t);
    backing.set(
      'ascend_tab_leader',
      JSON.stringify({ tabId: 'tab_self', ts: t - STALE_MS + 1 }),
    );
    expect(guard.isProvenLeader()).toBe(true);
  });
});
