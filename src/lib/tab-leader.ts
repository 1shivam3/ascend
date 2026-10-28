/**
 * QA4-010 — cross-tab data-loss guard.
 *
 * Problem: the whole app state is one zustand-persist blob in
 * localStorage. With ASCEND open in two tabs, each tab holds its own
 * in-memory copy and every change rewrites the WHOLE blob — whichever
 * tab writes last silently destroys the other tab's edits (same for
 * sync pushes, which upload the writer's whole state). There was no
 * BroadcastChannel, storage listener, or Web Lock anywhere.
 *
 * Design (minimal, sound for the common cases):
 * - A single leader record in localStorage (`ascend_tab_leader`):
 *   `{ tabId, ts }`, heartbeated by the leader every HEARTBEAT_MS.
 *   A record older than STALE_MS is dead and claimable.
 * - The first tab to claim is the LEADER. A tab that starts (or ticks)
 *   and finds a fresh record owned by another tab is a FOLLOWER.
 * - Followers keep full in-memory use of the app, but their persist
 *   writes and sync pushes are SUPPRESSED (wired in store.ts /
 *   sync.ts), so they cannot clobber the leader. They show a
 *   non-blocking banner with "Use this tab instead".
 * - Takeover: a follower may claim leadership at any time (writes its
 *   own record + broadcasts). The old leader notices on its next
 *   heartbeat read (or instantly via BroadcastChannel) and steps
 *   down to follower — exactly one leader survives every tick.
 * - Leader exit: on pagehide/beforeunload the leader removes its own
 *   record and broadcasts 'bye', so a remaining follower takes over
 *   within one tick instead of waiting for staleness.
 * - BroadcastChannel (`ascend_tab_presence`) is an accelerator only
 *   (instant takeover/step-down/bye); the localStorage heartbeat is
 *   the source of truth and works where BC is unavailable.
 *
 * Known limits:
 * - Simultaneous-open race: two tabs claiming in the same tick both
 *   write; the last writer wins the record and the other steps down
 *   on its next heartbeat (≤ HEARTBEAT_MS later). Writes in that
 *   sub-second window can still interleave — the window is bounded
 *   and self-healing, not zero.
 * - Suppression covers the zustand blob, the emergency snapshot and
 *   sync pushes. A few features write their OWN localStorage keys
 *   (notification prefs, progress photos, avatar mirror); those are
 *   single-key last-writer-wins by design and out of scope here.
 * - If storage is unavailable (private mode), the guard fails OPEN:
 *   the tab behaves as a single leader tab rather than blocking all
 *   persistence.
 */

export const TAB_LEADER_KEY = 'ascend_tab_leader';
export const TAB_CHANNEL_NAME = 'ascend_tab_presence';
export const HEARTBEAT_MS = 2000;
export const STALE_MS = 6000;

export interface BroadcastChannelLike {
  postMessage: (msg: unknown) => void;
  close: () => void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export interface TabLeaderDeps {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  now: () => number;
  setInterval: (cb: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
  createChannel: (name: string) => BroadcastChannelLike | null;
  newId: () => string;
  addUnloadListener: (cb: () => void) => void;
}

interface LeaderRecord {
  tabId: string;
  ts: number;
}

type PresenceMessage =
  | { type: 'hello'; tabId: string }
  | { type: 'takeover'; tabId: string }
  | { type: 'bye'; tabId: string };

export class TabLeaderGuard {
  readonly tabId: string;
  private deps: TabLeaderDeps;
  private leader = false;
  private otherPresent = false;
  private timer: unknown = null;
  private channel: BroadcastChannelLike | null = null;
  private listeners = new Set<() => void>();
  private started = false;

  constructor(deps: TabLeaderDeps) {
    this.deps = deps;
    this.tabId = deps.newId();
  }

  isLeader(): boolean {
    return this.leader;
  }

  hasOtherTab(): boolean {
    return this.otherPresent;
  }

  /** True when this tab should suppress persist writes + sync pushes. */
  shouldSuppressWrites(): boolean {
    return this.started && !this.leader && this.otherPresent;
  }

  /**
   * Synchronous leadership proof, re-read from localStorage on every
   * call — unlike the in-memory `leader` flag, which lags a takeover
   * until the next heartbeat tick (≤2s, longer when the tab is
   * background-throttled) or BroadcastChannel message.
   *
   * Preview-fix B1b: a follower-tab reset purges the shared blob and
   * snapshot, but the OLD leader's in-memory state can win back if any
   * of its writers fires after the purge — its debounced emergency
   * snapshot (2s debounce, arbitrarily delayed by background
   * throttling) or a persist write in the takeover window. Writers
   * must therefore prove leadership against the CURRENT record at
   * write time, not at schedule time.
   *
   * True only when a fresh record owned by THIS tab exists. A missing
   * record (post-purge vacuum) or a stale record is NOT proof: after
   * a purge the record is gone, and a writer that proceeds on "no
   * record" would resurrect the purged data.
   */
  isProvenLeader(): boolean {
    const record = this.readRecord();
    if (!record || record.tabId !== this.tabId) return false;
    return this.isFresh(record);
  }

  /**
   * True when a fresh record owned by ANOTHER tab exists. Persist
   * writers use this as a second suppression signal: the in-memory
   * flag may still say "leader" in the window between another tab's
   * takeover (a synchronous localStorage write) and this tab's
   * step-down, but the record already proves the takeover happened.
   */
  isOtherLeaderActive(): boolean {
    const record = this.readRecord();
    if (!record || record.tabId === this.tabId) return false;
    return this.isFresh(record);
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    try {
      this.channel = this.deps.createChannel(TAB_CHANNEL_NAME);
    } catch {
      this.channel = null;
    }
    if (this.channel) {
      this.channel.onmessage = (event) => this.onMessage(event.data as PresenceMessage);
    }

    // Initial election.
    const record = this.readRecord();
    if (record && record.tabId !== this.tabId && this.isFresh(record)) {
      this.setState(false, true);
    } else {
      this.claim();
      this.setState(true, false);
    }

    this.broadcast({ type: 'hello', tabId: this.tabId });
    this.timer = this.deps.setInterval(() => this.tick(), HEARTBEAT_MS);
    this.deps.addUnloadListener(() => this.onUnload());
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.timer !== null) this.deps.clearInterval(this.timer);
    this.timer = null;
    if (this.channel) {
      try {
        this.channel.close();
      } catch {}
      this.channel = null;
    }
  }

  /** Follower action: become the leader; the old leader steps down. */
  takeOver(): void {
    this.claim();
    this.setState(true, this.otherPresent);
    this.broadcast({ type: 'takeover', tabId: this.tabId });
  }

  // ── internals ──────────────────────────────────────────────────────

  private setState(leader: boolean, otherPresent: boolean): void {
    if (this.leader === leader && this.otherPresent === otherPresent) return;
    this.leader = leader;
    this.otherPresent = otherPresent;
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch {}
    });
  }

  private isFresh(record: LeaderRecord): boolean {
    return this.deps.now() - record.ts < STALE_MS;
  }

  private readRecord(): LeaderRecord | null {
    try {
      const raw = this.deps.storage.getItem(TAB_LEADER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as LeaderRecord;
      if (typeof parsed?.tabId !== 'string' || typeof parsed?.ts !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private claim(): void {
    try {
      this.deps.storage.setItem(
        TAB_LEADER_KEY,
        JSON.stringify({ tabId: this.tabId, ts: this.deps.now() } satisfies LeaderRecord),
      );
    } catch {
      // Storage unavailable — fail open (see header).
    }
  }

  private tick(): void {
    const record = this.readRecord();
    if (this.leader) {
      if (!record) {
        // Our record vanished (cleared storage?) — re-claim.
        this.claim();
      } else if (record.tabId !== this.tabId) {
        if (this.isFresh(record)) {
          // Someone took over — step down.
          this.setState(false, true);
        } else {
          this.claim();
        }
      } else {
        this.claim(); // heartbeat refresh
      }
    } else {
      if (!record || !this.isFresh(record)) {
        // Leader died without a bye (crash/kill) — take over.
        this.claim();
        this.setState(true, false);
      } else if (record.tabId === this.tabId) {
        this.setState(true, this.otherPresent);
      } else {
        this.setState(false, true);
      }
    }
  }

  private onMessage(msg: PresenceMessage): void {
    if (!msg || typeof msg !== 'object' || msg.tabId === this.tabId) return;
    if (msg.type === 'hello') {
      // Another live tab exists. If we thought we were alone and we
      // are the leader, nothing changes (they will follow). A follower
      // just confirms presence.
      if (!this.leader) this.setState(false, true);
    } else if (msg.type === 'takeover') {
      if (this.leader) this.setState(false, true);
    } else if (msg.type === 'bye') {
      // The departing tab may have been the leader; the tick will
      // settle it, but a follower can claim right away if the record
      // is already gone/stale.
      const record = this.readRecord();
      if (!this.leader && (!record || record.tabId === msg.tabId || !this.isFresh(record))) {
        this.claim();
        this.setState(true, false);
      }
    }
  }

  private onUnload(): void {
    this.broadcast({ type: 'bye', tabId: this.tabId });
    if (this.leader) {
      try {
        const record = this.readRecord();
        if (record?.tabId === this.tabId) this.deps.storage.removeItem(TAB_LEADER_KEY);
      } catch {}
    }
  }

  private broadcast(msg: PresenceMessage): void {
    try {
      this.channel?.postMessage(msg);
    } catch {}
  }
}

// ── Browser singleton ────────────────────────────────────────────────

let singleton: TabLeaderGuard | null = null;

/**
 * The app-wide guard, created + started on first use in the browser.
 * Returns null outside the browser (SSR/tests) — callers must treat
 * null as "single tab, no suppression".
 */
export function getTabLeaderGuard(): TabLeaderGuard | null {
  if (typeof window === 'undefined') return null;
  if (singleton) return singleton;
  try {
    singleton = new TabLeaderGuard({
      storage: window.localStorage,
      now: () => Date.now(),
      setInterval: (cb, ms) => window.setInterval(cb, ms),
      clearInterval: (h) => window.clearInterval(h as number),
      createChannel: (name) => {
        try {
          return typeof BroadcastChannel !== 'undefined'
            ? (new BroadcastChannel(name) as unknown as BroadcastChannelLike)
            : null;
        } catch {
          return null;
        }
      },
      newId: () =>
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      addUnloadListener: (cb) => {
        window.addEventListener('pagehide', cb);
        window.addEventListener('beforeunload', cb);
      },
    });
    singleton.start();
    return singleton;
  } catch {
    return null;
  }
}

/** Test hook: replace the singleton (unit tests only). */
export function __setTabLeaderGuardForTests(guard: TabLeaderGuard | null): void {
  singleton = guard;
}
