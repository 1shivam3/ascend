/**
 * Fake timers + mocked clock for tests (state-machines program, Phase 0).
 *
 * One entry point so timer/sync tests share a single idiom:
 *
 *   const clock = installFakeClock('2026-11-13T08:00:00+05:30');
 *   // ... code under test schedules timers / reads Date.now() ...
 *   clock.advance(30_000);            // moves timers AND the mocked Date
 *   clock.set('2026-11-13T09:00:00+05:30');
 *   clock.restore();
 *
 * Uses vitest fake timers with `toFake` including Date, so `Date.now()`,
 * `new Date()`, setTimeout/setInterval and performance-independent code all
 * see the same mocked clock. Always `restore()` in afterEach — a leaked
 * fake clock poisons the next test file's real timers.
 */
import { vi } from 'vitest';

export interface FakeClock {
  /** Current mocked time in epoch ms. */
  now(): number;
  /** Advance timers and the mocked Date by `ms`. */
  advance(ms: number): void;
  /** Jump the mocked Date (and system time) to an ISO string or epoch ms. */
  set(to: string | number): void;
  /** Restore real timers and the real clock. */
  restore(): void;
}

export function installFakeClock(startAt?: string | number): FakeClock {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  if (startAt !== undefined) {
    vi.setSystemTime(typeof startAt === 'string' ? new Date(startAt) : startAt);
  }
  return {
    now: () => Date.now(),
    advance: (ms: number) => {
      vi.advanceTimersByTime(ms);
    },
    set: (to: string | number) => {
      vi.setSystemTime(typeof to === 'string' ? new Date(to) : to);
    },
    restore: () => {
      vi.useRealTimers();
    },
  };
}
