/**
 * U2 (bug program Phase 5): bodyweight staleness measure.
 *
 * The Progress body card now labels the headline weight with the
 * age of the newest real log ("Last logged N days ago") and prompts
 * for a fresh weigh-in at 14+ days. The age comes from
 * daysSinceDate — whole local days between two YYYY-MM-DD strings.
 */
import { describe, expect, it } from 'vitest';
import { daysSinceDate } from '../src/lib/formatters';

describe('U2: daysSinceDate', () => {
  it('same day is 0, yesterday is 1', () => {
    expect(daysSinceDate('2026-11-19', '2026-11-19')).toBe(0);
    expect(daysSinceDate('2026-11-18', '2026-11-19')).toBe(1);
  });

  it('the gym-video case: a 6 Nov log read on 19 Nov is 13 days old (just under the prompt threshold)', () => {
    expect(daysSinceDate('2026-11-06', '2026-11-19')).toBe(13);
    expect(daysSinceDate('2026-11-05', '2026-11-19')).toBe(14);
  });

  it('spans month and year boundaries by calendar days', () => {
    expect(daysSinceDate('2026-10-30', '2026-11-02')).toBe(3);
    expect(daysSinceDate('2025-12-31', '2026-01-02')).toBe(2);
  });

  it('a future-dated log clamps to 0, never negative', () => {
    expect(daysSinceDate('2026-11-25', '2026-11-19')).toBe(0);
  });

  it('unparseable input returns null', () => {
    expect(daysSinceDate('not-a-date', '2026-11-19')).toBeNull();
    expect(daysSinceDate('2026-11-19', '')).toBeNull();
  });
});
