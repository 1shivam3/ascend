import { describe, it, expect } from 'vitest';
import { getMondayOfWeek, getWeekRange, getWeekDateStrings } from '@/lib/formatters';

describe('Monday-first week helpers', () => {
  it('returns Monday for a Sunday input', () => {
    // 2026-10-18 is a Sunday
    const monday = getMondayOfWeek(new Date(2026, 9, 18, 12));
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(12);
  });

  it('returns same day for a Monday input', () => {
    const monday = getMondayOfWeek(new Date(2026, 9, 19, 12));
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(19);
  });

  it('returns Monday for a Saturday input', () => {
    // 2026-10-17 is a Saturday
    const monday = getMondayOfWeek(new Date(2026, 9, 17, 12));
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(12);
  });

  it('getWeekRange spans Mon-Sun', () => {
    // Wednesday 2026-10-21
    const { start, end } = getWeekRange(new Date(2026, 9, 21, 12));
    expect(start).toBe('2026-10-19'); // Monday
    expect(end).toBe('2026-10-25');   // Sunday
  });

  it('getWeekRange handles month boundaries', () => {
    // Sunday 2026-11-01 -> week Mon 2026-10-26 to Sun 2026-11-01
    const { start, end } = getWeekRange(new Date(2026, 10, 1, 12));
    expect(start).toBe('2026-10-26');
    expect(end).toBe('2026-11-01');
  });

  it('getWeekDateStrings returns 7 Mon-Sun strings in order', () => {
    const strs = getWeekDateStrings(new Date(2026, 9, 21, 12));
    expect(strs).toHaveLength(7);
    expect(strs[0]).toBe('2026-10-19');
    expect(strs[6]).toBe('2026-10-25');
    // verify each is the next day
    for (let i = 1; i < 7; i++) {
      const prev = new Date(strs[i - 1] + 'T12:00:00');
      const curr = new Date(strs[i] + 'T12:00:00');
      expect(curr.getTime() - prev.getTime()).toBe(86400000);
    }
  });
});
