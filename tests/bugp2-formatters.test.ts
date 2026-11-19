import { describe, it, expect } from 'vitest';
import { displayDatesInText, formatGrams, formatKcal, formatCalories } from '@/lib/formatters';

/**
 * Bug program Phase 2 — N4: the formatting module is the one home
 * for display formats, and AI prose never shows a raw ISO date.
 */
describe('N4: displayDatesInText', () => {
  it('rewrites an ISO date inside a sentence to the day-first display format', () => {
    const out = displayDatesInText('Your last deload was 2026-11-06, keep going.', 'en-GB');
    expect(out).not.toContain('2026-11-06');
    expect(out).toContain('6 Nov 2026');
  });

  it('rewrites every ISO date in the text', () => {
    const out = displayDatesInText('From 2026-11-02 to 2026-11-06 inclusive.', 'en-GB');
    expect(out).not.toContain('2026-11');
    expect(out).toContain('2 Nov 2026');
    expect(out).toContain('6 Nov 2026');
  });

  it('leaves invalid date shapes untouched', () => {
    expect(displayDatesInText('Code 2026-13-40 here', 'en-GB')).toContain('2026-13-40');
    expect(displayDatesInText('Code 2026-02-30 here', 'en-GB')).toContain('2026-02-30');
  });

  it('leaves date-free text and empty text unchanged', () => {
    expect(displayDatesInText('No dates at all.', 'en-GB')).toBe('No dates at all.');
    expect(displayDatesInText('', 'en-GB')).toBe('');
  });
});

describe('N4: formatKcal / formatGrams complete the module', () => {
  it('formatKcal is the formatCalories rule', () => {
    expect(formatKcal(2592, 'en-IN')).toBe(formatCalories(2592, 'en-IN'));
    expect(formatKcal(2592, 'en-IN')).toBe('2,592 kcal');
  });

  it('formatGrams groups and suffixes compactly', () => {
    expect(formatGrams(150, 'en-IN')).toBe('150g');
    expect(formatGrams(1250, 'en-IN')).toBe('1,250g');
    expect(formatGrams(150.6, 'en-IN')).toBe('151g');
  });
});
