import { describe, it, expect } from 'vitest';
import { resolveWorkoutMode } from '@/lib/workout-mode';

describe('resolveWorkoutMode (UX redesign Stage 4)', () => {
  it('follows density when no override is pinned', () => {
    expect(resolveWorkoutMode('simple', null)).toBe('beginner');
    expect(resolveWorkoutMode('detailed', null)).toBe('advanced');
  });

  it('an explicit override wins over either density', () => {
    expect(resolveWorkoutMode('simple', 'advanced')).toBe('advanced');
    expect(resolveWorkoutMode('detailed', 'beginner')).toBe('beginner');
  });

  it('falls back to the density default on invalid input', () => {
    expect(resolveWorkoutMode('detailed', 'intermediate')).toBe('advanced');
    expect(resolveWorkoutMode(undefined, undefined)).toBe('beginner');
    expect(resolveWorkoutMode('bogus', null)).toBe('beginner');
  });
});
