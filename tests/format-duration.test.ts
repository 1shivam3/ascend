import { describe, it, expect } from 'vitest';
import { formatDuration } from '../src/lib/formatters';

describe('formatDuration (bug: fabricated session durations)', () => {
  it('shows sub-minute sessions honestly instead of rounding to 1m', () => {
    expect(formatDuration(10)).toBe('10s');
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(59)).toBe('59s');
  });

  it('formats minute-plus sessions with leftover seconds', () => {
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(150)).toBe('2m 30s');
    expect(formatDuration(3600)).toBe('60m');
  });

  it('clamps invalid input instead of producing garbage', () => {
    expect(formatDuration(-5)).toBe('0s');
    expect(formatDuration(NaN)).toBe('0s');
  });
});
