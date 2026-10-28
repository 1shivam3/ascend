import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/lib/store';
import { getLocalTodayStr, isValidEntryDate } from '../src/lib/formatters';

/**
 * Audit F12 regression: the store must never accept a future or
 * malformed body-metric entry date, even though the modal caps its
 * date input at today — defense in depth for any other caller.
 * Invalid dates fall back to today; valid past dates pass unchanged.
 */

describe('F12: store-side entry-date validation', () => {
  describe('isValidEntryDate', () => {
    it('accepts a valid past date and today', () => {
      expect(isValidEntryDate('2026-10-01')).toBe(true);
      expect(isValidEntryDate(getLocalTodayStr())).toBe(true);
    });

    it('rejects future dates', () => {
      expect(isValidEntryDate('2999-01-01')).toBe(false);
    });

    it('rejects malformed and impossible dates', () => {
      expect(isValidEntryDate('not-a-date')).toBe(false);
      expect(isValidEntryDate('2026/10/01')).toBe(false);
      expect(isValidEntryDate('2026-13-01')).toBe(false);
      expect(isValidEntryDate('2026-02-30')).toBe(false);
      expect(isValidEntryDate('')).toBe(false);
    });
  });

  describe('updateBodyMetrics', () => {
    beforeEach(() => {
      useStore.getState().clearAllData();
      useStore.setState({
        profile: { bodyweightKg: 80, bodyweightLbs: 176.4, heightCm: 175 } as never,
      });
    });

    it('falls back to today for a future date', () => {
      useStore.getState().updateBodyMetrics(80, 175, undefined, undefined, undefined, undefined, '2999-01-01');
      const entries = useStore.getState().bodyMetrics;
      expect(entries).toHaveLength(1);
      expect(entries[0].date).toBe(getLocalTodayStr());
    });

    it('falls back to today for a malformed date', () => {
      useStore.getState().updateBodyMetrics(80, 175, undefined, undefined, undefined, undefined, '2026-02-30');
      expect(useStore.getState().bodyMetrics[0].date).toBe(getLocalTodayStr());
    });

    it('keeps a valid past date unchanged', () => {
      useStore.getState().updateBodyMetrics(80, 175, undefined, undefined, undefined, undefined, '2026-10-01');
      expect(useStore.getState().bodyMetrics[0].date).toBe('2026-10-01');
    });
  });
});
