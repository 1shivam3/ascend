import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TODAY_LAYOUT,
  resolveTodayLayout,
  sanitizeTodayLayout,
} from '../src/lib/today-layout';

describe('today layout', () => {
  it('simple hides supporting sections by default; detailed shows all', () => {
    const simple = resolveTodayLayout(DEFAULT_TODAY_LAYOUT, 'simple');
    expect(simple.map((s) => s.id)).toEqual([
      'nutrition-strip', 'coach', 'habit-matrix', 'quick-actions', 'hydration',
      'readiness', 'level', 'steps', 'challenge', 'weekly-review-detail',
    ]);
    expect(simple.filter((s) => s.shown).map((s) => s.id)).toEqual([
      'nutrition-strip', 'coach', 'habit-matrix', 'quick-actions', 'hydration',
    ]);
    const detailed = resolveTodayLayout(DEFAULT_TODAY_LAYOUT, 'detailed');
    expect(detailed.every((s) => s.shown)).toBe(true);
  });
  it('explicit choices survive density switches', () => {
    const layout = {
      visible: { readiness: true, coach: false },
      order: ['coach', 'nutrition-strip'],
    };
    const simple = resolveTodayLayout(layout, 'simple');
    expect(simple.find((s) => s.id === 'readiness')!.shown).toBe(true);
    expect(simple.find((s) => s.id === 'coach')!.shown).toBe(false);
    const detailed = resolveTodayLayout(layout, 'detailed');
    expect(detailed.find((s) => s.id === 'readiness')!.shown).toBe(true);
    expect(detailed.find((s) => s.id === 'coach')!.shown).toBe(false);
  });
  it('sanitize drops unknown ids, appends missing known sections, heals junk', () => {
    expect(sanitizeTodayLayout(null)).toEqual(DEFAULT_TODAY_LAYOUT);
    expect(sanitizeTodayLayout('junk')).toEqual(DEFAULT_TODAY_LAYOUT);
    expect(sanitizeTodayLayout({ visible: { nope: true }, order: ['coach', 'nope'] })).toEqual({
      visible: {},
      order: [
        'coach', 'nutrition-strip', 'habit-matrix', 'quick-actions', 'hydration',
        'readiness', 'level', 'steps', 'challenge', 'weekly-review-detail',
      ],
    });
  });
});
