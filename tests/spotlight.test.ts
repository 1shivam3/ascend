import { describe, it, expect } from 'vitest';
import { resolveSpotlightChart, goalDefaultChart, SPOTLIGHT_CHARTS } from '@/lib/spotlight';

describe('spotlight resolution (UX redesign Stage 5)', () => {
  it('maps each goal to its spotlight chart', () => {
    expect(goalDefaultChart('get_stronger')).toBe('e1rm');
    expect(goalDefaultChart('build_muscle')).toBe('volume');
    expect(goalDefaultChart('lose_fat')).toBe('weight');
    expect(goalDefaultChart('general_fitness')).toBe('consistency');
    expect(goalDefaultChart('stamina')).toBe('consistency');
    expect(goalDefaultChart(undefined)).toBe('consistency');
  });

  it('a pinned chart wins over the goal default', () => {
    expect(resolveSpotlightChart('get_stronger', 'weight')).toBe('weight');
    expect(resolveSpotlightChart('lose_fat', 'big3')).toBe('big3');
    expect(resolveSpotlightChart('build_muscle', 'e1rm')).toBe('e1rm');
  });

  it('null or invalid pins fall back to the goal default', () => {
    expect(resolveSpotlightChart('lose_fat', null)).toBe('weight');
    expect(resolveSpotlightChart('lose_fat', 'bogus')).toBe('weight');
    expect(resolveSpotlightChart('get_stronger', undefined)).toBe('e1rm');
  });

  it('exposes all five pinnable charts', () => {
    expect(SPOTLIGHT_CHARTS).toEqual(['e1rm', 'volume', 'weight', 'consistency', 'big3']);
  });
});
