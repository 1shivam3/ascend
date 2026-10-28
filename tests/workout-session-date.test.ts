import { describe, it, expect } from 'vitest';
import { getLocalDateOfTimestamp, getLocalTodayStr } from '@/lib/formatters';

/**
 * Audit W4 regression: a session is dated by its START, not its
 * finish. Dates are built with the local Date constructor so the test
 * is timezone-relative (it passes wherever the runner lives) while
 * still proving the midnight-crossing behavior: the start and finish
 * timestamps land on different local days, and the helper returns the
 * START day.
 */

describe('W4: session date is the start day', () => {
  it('returns the local date of the start timestamp', () => {
    const start = new Date(2026, 9, 27, 23, 40).getTime(); // Oct 27, 23:40 local
    expect(getLocalDateOfTimestamp(start)).toBe('2026-10-27');
  });

  it('a 23:40 -> 00:20 session dates to the start day, not the finish day', () => {
    const start = new Date(2026, 9, 27, 23, 40).getTime();
    const finish = new Date(2026, 9, 28, 0, 20).getTime();
    // The old code (getLocalTodayStr at finish time) would have
    // produced the finish day; the fix produces the start day.
    expect(getLocalDateOfTimestamp(finish)).toBe('2026-10-28');
    expect(getLocalDateOfTimestamp(start)).toBe('2026-10-27');
    expect(getLocalDateOfTimestamp(start)).not.toBe(getLocalDateOfTimestamp(finish));
  });

  it('agrees with getLocalTodayStr for the same instant', () => {
    const now = new Date(2026, 4, 15, 12, 0);
    expect(getLocalDateOfTimestamp(now.getTime())).toBe(getLocalTodayStr(now));
  });
});
