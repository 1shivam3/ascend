import { describe, it, expect, vi } from 'vitest';
import { ensureDeleteWillPersist } from '@/lib/delete-persist-guard';

/**
 * Follower-tab delete guard (history-delete resurrection fix).
 *
 * The guard's job: a workout deleted in a follower tab must reach
 * storage, or the delete must not happen at all. These tests drive
 * the helper with a fake guard, so no browser, tab, or store is
 * needed — the real guard API (shouldSuppressWrites / takeOver)
 * is mirrored exactly.
 */

class FakeGuard {
  private suppressed: boolean;
  takeOverCalls = 0;
  takeOverThrows = false;
  stuckAfterTakeover = false;

  constructor(suppressed: boolean) {
    this.suppressed = suppressed;
  }

  shouldSuppressWrites(): boolean {
    return this.suppressed;
  }

  takeOver(): void {
    this.takeOverCalls++;
    if (this.takeOverThrows) throw new Error('claim failed');
    this.suppressed = this.stuckAfterTakeover;
  }
}

describe('ensureDeleteWillPersist', () => {
  it('leader tab: no-op, returns true, touches nothing', async () => {
    const guard = new FakeGuard(false);
    const rehydrate = vi.fn();
    await expect(
      ensureDeleteWillPersist({ getGuard: () => guard, rehydrate }),
    ).resolves.toBe(true);
    expect(guard.takeOverCalls).toBe(0);
    expect(rehydrate).not.toHaveBeenCalled();
  });

  it('no guard (SSR / single tab): no-op, returns true', async () => {
    const rehydrate = vi.fn();
    await expect(
      ensureDeleteWillPersist({ getGuard: () => null, rehydrate }),
    ).resolves.toBe(true);
    expect(rehydrate).not.toHaveBeenCalled();
  });

  it('follower tab: takeover + rehydrate attempted before returning true', async () => {
    const guard = new FakeGuard(true);
    const rehydrate = vi.fn();
    await expect(
      ensureDeleteWillPersist({ getGuard: () => guard, rehydrate }),
    ).resolves.toBe(true);
    expect(guard.takeOverCalls).toBe(1);
    expect(rehydrate).toHaveBeenCalledTimes(1);
    expect(guard.shouldSuppressWrites()).toBe(false);
  });

  it('follower tab, rehydrate rejects: returns false (caller must not delete)', async () => {
    const guard = new FakeGuard(true);
    const rehydrate = vi.fn().mockRejectedValue(new Error('storage gone'));
    await expect(
      ensureDeleteWillPersist({ getGuard: () => guard, rehydrate }),
    ).resolves.toBe(false);
    expect(guard.takeOverCalls).toBe(1);
  });

  it('follower tab, takeover throws: returns false (caller must not delete)', async () => {
    const guard = new FakeGuard(true);
    guard.takeOverThrows = true;
    const rehydrate = vi.fn();
    await expect(
      ensureDeleteWillPersist({ getGuard: () => guard, rehydrate }),
    ).resolves.toBe(false);
    expect(rehydrate).not.toHaveBeenCalled();
  });

  it('follower tab, still suppressed after takeover: returns false, never a fake success', async () => {
    const guard = new FakeGuard(true);
    guard.stuckAfterTakeover = true;
    const rehydrate = vi.fn();
    await expect(
      ensureDeleteWillPersist({ getGuard: () => guard, rehydrate }),
    ).resolves.toBe(false);
  });
});
