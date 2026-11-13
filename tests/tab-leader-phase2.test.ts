import { describe, it, expect } from 'vitest';
import {
  TabLeaderGuard,
  TAB_LEADER_KEY,
  type BroadcastChannelLike,
  type TabLeaderDeps,
} from '../src/lib/tab-leader';

/**
 * Phase 2.4 (§13) — tab leadership is intentional fail-open
 * (documented in tab-leader.ts), but stop() must reset the leader
 * flags: a stopped guard that still reports isLeader() === true
 * (or a follower that still reports another tab present) leaves
 * stale state for any reader and for a later re-start.
 */

class FakeStorage {
  private map = new Map<string, string>();
  getItem = (k: string) => (this.map.has(k) ? this.map.get(k)! : null);
  setItem = (k: string, v: string) => void this.map.set(k, v);
  removeItem = (k: string) => void this.map.delete(k);
}

class FakeChannel implements BroadcastChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  peers: FakeChannel[] = [];
  postMessage = (msg: unknown) => {
    for (const p of this.peers) {
      if (p !== this) p.onmessage?.({ data: msg });
    }
  };
  close = () => {};
}

function makeWorld() {
  const storage = new FakeStorage();
  const now = { t: 1_000_000 };
  const channels: FakeChannel[] = [];
  let idCounter = 0;
  const unloadCbs: Array<() => void> = [];
  const makeGuard = () => {
    const channel = new FakeChannel();
    channel.peers = channels;
    channels.push(channel);
    const deps: TabLeaderDeps = {
      storage,
      now: () => now.t,
      setInterval: () => 1,
      clearInterval: () => {},
      createChannel: () => channel,
      newId: () => `tab-${++idCounter}`,
      addUnloadListener: (cb) => {
        unloadCbs.push(cb);
      },
    };
    return new TabLeaderGuard(deps);
  };
  const fireUnload = () => unloadCbs.forEach((cb) => cb());
  return { storage, now, makeGuard, fireUnload };
}

describe('§13 stop() resets the leader flags', () => {
  it('a stopped LEADER reports no leadership, no other tab, no suppression', () => {
    const { makeGuard } = makeWorld();
    const guard = makeGuard();
    guard.start();
    expect(guard.isLeader()).toBe(true);

    guard.stop();
    expect(guard.isLeader()).toBe(false);
    expect(guard.hasOtherTab()).toBe(false);
    expect(guard.shouldSuppressWrites()).toBe(false);
  });

  it('a stopped FOLLOWER clears otherPresent (and suppression with it)', () => {
    const { makeGuard } = makeWorld();
    const leader = makeGuard();
    leader.start();
    const follower = makeGuard();
    follower.start();
    expect(follower.isLeader()).toBe(false);
    expect(follower.hasOtherTab()).toBe(true);
    expect(follower.shouldSuppressWrites()).toBe(true);

    follower.stop();
    expect(follower.isLeader()).toBe(false);
    expect(follower.hasOtherTab()).toBe(false);
    expect(follower.shouldSuppressWrites()).toBe(false);
  });

  it('stop() notifies subscribers of the reset', () => {
    const { makeGuard } = makeWorld();
    const guard = makeGuard();
    guard.start();
    let calls = 0;
    guard.subscribe(() => {
      calls += 1;
    });
    guard.stop();
    expect(calls).toBeGreaterThan(0);
  });

  it('a stopped guard can start again and re-elects cleanly', () => {
    const { makeGuard } = makeWorld();
    const guard = makeGuard();
    guard.start();
    guard.stop();
    guard.start();
    expect(guard.isLeader()).toBe(true);
    expect(guard.shouldSuppressWrites()).toBe(false);
  });

  it('stop() then unload still removes the leader record (regression: the flag reset must not orphan it)', () => {
    const { storage, makeGuard, fireUnload } = makeWorld();
    const guard = makeGuard();
    guard.start();
    expect(guard.isLeader()).toBe(true);
    // stop() resets the in-memory flags (2.4) — the unload cleanup
    // keys off the stored record instead, so the record still goes.
    guard.stop();
    fireUnload();
    expect(storage.getItem(TAB_LEADER_KEY)).toBeNull();
  });
});
