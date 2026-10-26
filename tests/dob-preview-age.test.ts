import { describe, expect, it } from 'vitest';
import { dobPreviewAge } from '@/lib/age';

/**
 * DOB age-chip derivation (onboarding details-lite step, 2026-10-26 restyle).
 * The chip renders only when the date passes the exact submit rules, so it
 * can never disagree with validation: valid calendar date, not in the
 * future, age 13–120. Fixed "today" of 2026-10-26 (local parts) throughout.
 */
const TODAY = new Date(2026, 9, 26);

describe('dobPreviewAge (onboarding DOB age chip)', () => {
  it('returns the computed age for a valid date', () => {
    expect(dobPreviewAge('2000-06-15', TODAY)).toBe(26);
    expect(dobPreviewAge('2001-10-26', TODAY)).toBe(25);
    expect(dobPreviewAge('2001-10-27', TODAY)).toBe(24);
  });

  it('rolls Feb 29 birthdays to Mar 1 in non-leap years', () => {
    expect(dobPreviewAge('2000-02-29', new Date(2026, 1, 28))).toBe(25);
    expect(dobPreviewAge('2000-02-29', new Date(2026, 2, 1))).toBe(26);
  });

  it('returns null for future, under-13, and over-120 dates', () => {
    expect(dobPreviewAge('2026-10-27', TODAY)).toBeNull(); // future
    expect(dobPreviewAge('2013-10-27', TODAY)).toBeNull(); // 12
    expect(dobPreviewAge('2013-10-26', TODAY)).toBe(13); // boundary: valid
    expect(dobPreviewAge('1905-10-26', TODAY)).toBeNull(); // 121
    expect(dobPreviewAge('1906-10-26', TODAY)).toBe(120); // boundary: valid
  });

  it('returns null for invalid calendar dates and garbage', () => {
    expect(dobPreviewAge('2026-02-30', TODAY)).toBeNull();
    expect(dobPreviewAge('not-a-date', TODAY)).toBeNull();
    expect(dobPreviewAge('', TODAY)).toBeNull();
  });
});
