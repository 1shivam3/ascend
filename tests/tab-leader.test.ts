import { describe, it, expect, beforeEach } from 'vitest';
import {
  TabLeaderGuard,
  TAB_LEADER_KEY,
  STALE_MS,
  type BroadcastChannelLike,
  type TabLeaderDeps,
} from '../src/lib/tab-leader';

/**
 * QA4-010 — cross-tab guard unit tests: leader election, staleness,
 * takeover, step-down, and the write-suppression predicate, all with
 * mocked storage / clock / timers / BroadcastChannel.
 */

class FakeStorage {
  private map = new Map<string, string>();
  getItem = (k: string) => (this.map.has(k) ? this.map.get(k)! : null);
  setItem = (k: string, v: string) => void this.map.set(k, v);
  removeItem = (k: string) => void this.map.delete(k);
}

class FakeBus {
  channels = new Set<FakeChannel>();
  deliver(from: FakeChannel, msg: unknown) {
    for (const ch of this.channels) {
      if (ch !== from) ch.onmessage?.({ data: msg });
    }
  }
}

class FakeChannel implements BroadcastChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(private bus: FakeBus) {
    bus.channels.add(this);
  }
  postMessage = (msg: unknown) => this.bus.deliver(this, msg);
  close = () => void this.bus.channels.delete(this);
}

interface Harness {
  guard: TabLeaderGuard;
  tick: () => void;
  advance: (ms: number) => void;
  unload: () => void;
}

function makeHarness(shared: { storage: FakeStorage; bus: FakeBus; now: { t: number } }): Harness {
  const timers: Array<() => void> = [];
  const unloadCbs: Array<() => void> = [];
  let idCounter = 0;
  const deps: TabLeaderDeps = {
    storage: shared.storage,
    now: () => shared.now.t,
    setInterval: (cb) => {
      timers.push(cb);
      return timers.length;
    },
    clearInterval: () => {},
    createChannel: () => new FakeChannel(shared.bus),
    newId: () => `tab-${++idCounter}-${Math.random().toString(36).slice(2, 7)}`,
    addUnloadListener: (cb) => void unloadCbs.push(cb),
  };
  const guard = new TabLeaderGuard(deps);
  return {
    guard,
    tick: () => timers.forEach((cb) => cb()),
    advance: (ms) => {
      shared.now.t += ms;
    },
    unload: () => unloadCbs.forEach((cb) => cb()),
  };
}

describe('TabLeaderGuard (QA4-010)', () => {
  let shared: { storage: FakeStorage; bus: FakeBus; now: { t: number } };

  beforeEach(() => {
    shared = { storage: new FakeStorage(), bus: new FakeBus(), now: { t: 1_000_000 } };
  });

  it('a single tab becomes leader and does not suppress writes', () => {
    const h = makeHarness(shared);
    h.guard.start();
    expect(h.guard.isLeader()).toBe(true);
    expect(h.guard.hasOtherTab()).toBe(false);
    expect(h.guard.shouldSuppressWrites()).toBe(false);
    expect(shared.storage.getItem(TAB_LEADER_KEY)).toContain(h.guard.tabId);
  });

  it('a second tab starts as follower: other tab present, writes suppressed', () => {
    const a = makeHarness(shared);
    a.guard.start();
    const b = makeHarness(shared);
    b.guard.start();

    expect(a.guard.isLeader()).toBe(true);
    expect(b.guard.isLeader()).toBe(false);
    expect(b.guard.hasOtherTab()).toBe(true);
    expect(b.guard.shouldSuppressWrites()).toBe(true);
    expect(a.guard.shouldSuppressWrites()).toBe(false);
  });

  it('leader heartbeat keeps the record fresh across ticks', () => {
    const a = makeHarness(shared);
    a.guard.start();
    const b = makeHarness(shared);
    b.guard.start();

    a.advance(STALE_MS - 1000);
    a.tick(); // leader heartbeats
    b.tick(); // follower sees fresh record, stays follower
    expect(b.guard.isLeader()).toBe(false);
    expect(a.guard.isLeader()).toBe(true);
  });

  it('a stale leader record is claimable: follower takes over after STALE_MS of silence', () => {
    const a = makeHarness(shared);
    a.guard.start();
    const b = makeHarness(shared);
    b.guard.start();

    // Leader dies silently (crash) — no more heartbeats from A.
    b.advance(STALE_MS + 1);
    b.tick();
    expect(b.guard.isLeader()).toBe(true);
    expect(b.guard.shouldSuppressWrites()).toBe(false);
  });

  it('takeover: follower claims leadership and the old leader steps down', () => {
    const a = makeHarness(shared);
    a.guard.start();
    const b = makeHarness(shared);
    b.guard.start();

    b.guard.takeOver();
    expect(b.guard.isLeader()).toBe(true);
    expect(b.guard.shouldSuppressWrites()).toBe(false);

    // BroadcastChannel delivers takeover instantly…
    expect(a.guard.isLeader()).toBe(false);
    expect(a.guard.hasOtherTab()).toBe(true);
    expect(a.guard.shouldSuppressWrites()).toBe(true);

    // …and even without BC, A's next heartbeat tick steps it down.
    a.tick();
    expect(a.guard.isLeader()).toBe(false);
    // B's leadership survives A's tick (A must not reclaim over a fresh record).
    b.tick();
    expect(b.guard.isLeader()).toBe(true);
  });

  it('leader unload releases the record so a follower can lead immediately', () => {
    const a = makeHarness(shared);
    a.guard.start();
    const b = makeHarness(shared);
    b.guard.start();

    a.unload(); // broadcasts bye; removes its record if still its own
    // B claims on the bye (overwriting the record with its own id, which
    // A then correctly does NOT delete) — B leads immediately, and the
    // surviving record is B's.
    expect(b.guard.isLeader()).toBe(true);
    expect(shared.storage.getItem(TAB_LEADER_KEY)).toContain(b.guard.tabId);
    b.tick();
    expect(b.guard.isLeader()).toBe(true);
  });

  it('subscribers are notified on leadership changes', () => {
    const a = makeHarness(shared);
    a.guard.start();
    const b = makeHarness(shared);
    b.guard.start();

    let calls = 0;
    const unsub = a.guard.subscribe(() => calls++);
    b.guard.takeOver();
    expect(calls).toBeGreaterThan(0);
    unsub();
  });

  it('a fresh record from an unknown tab makes a new tab a follower even mid-run', () => {
    // Simulate: record written by a tab we never saw start.
    shared.storage.setItem(
      TAB_LEADER_KEY,
      JSON.stringify({ tabId: 'someone-else', ts: shared.now.t }),
    );
    const h = makeHarness(shared);
    h.guard.start();
    expect(h.guard.isLeader()).toBe(false);
    expect(h.guard.shouldSuppressWrites()).toBe(true);
  });
});
