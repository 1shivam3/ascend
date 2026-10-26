import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TODAY_LAYOUT,
  SIMPLE_DEFAULT_ORDER,
  DETAILED_DEFAULT_ORDER,
  resolveTodayLayout,
  sanitizeTodayLayout,
} from '../src/lib/today-layout';

describe('today layout', () => {
  it('simple default is the minimal list in owner order, quote last', () => {
    const simple = resolveTodayLayout(DEFAULT_TODAY_LAYOUT, 'simple');
    expect(simple.map((s) => s.id)).toEqual([...SIMPLE_DEFAULT_ORDER]);
    expect(simple.filter((s) => s.shown).map((s) => s.id)).toEqual([
      'nutrition-strip', 'quick-actions', 'hydration', 'habit-matrix', 'quote',
    ]);
  });
  it('detailed default shows all, quote right after coach (its old position)', () => {
    const detailed = resolveTodayLayout(DEFAULT_TODAY_LAYOUT, 'detailed');
    expect(detailed.map((s) => s.id)).toEqual([...DETAILED_DEFAULT_ORDER]);
    expect(detailed.every((s) => s.shown)).toBe(true);
  });
  it('a legacy pre-quote order is pristine: simple substitutes its default order', () => {
    const legacy = {
      visible: {},
      order: [
        'nutrition-strip', 'coach', 'habit-matrix', 'quick-actions', 'hydration',
        'readiness', 'level', 'steps', 'challenge', 'weekly-review-detail',
      ],
    };
    const simple = resolveTodayLayout(legacy, 'simple');
    expect(simple.map((s) => s.id)).toEqual([...SIMPLE_DEFAULT_ORDER]);
    expect(simple.filter((s) => s.shown).map((s) => s.id)).toEqual([
      'nutrition-strip', 'quick-actions', 'hydration', 'habit-matrix', 'quote',
    ]);
    const detailed = resolveTodayLayout(legacy, 'detailed');
    expect(detailed.map((s) => s.id)).toEqual([...DETAILED_DEFAULT_ORDER]);
  });
  it('a materialized density order is stable (move writes resolved order back)', () => {
    const materialized = { visible: {}, order: [...SIMPLE_DEFAULT_ORDER] };
    const resolved = resolveTodayLayout(materialized, 'simple');
    expect(resolved.map((s) => s.id)).toEqual([...SIMPLE_DEFAULT_ORDER]);
    expect(resolved.filter((s) => s.shown).map((s) => s.id)).toEqual([
      'nutrition-strip', 'quick-actions', 'hydration', 'habit-matrix', 'quote',
    ]);
  });
  it('explicit choices survive density switches, including hiding quote', () => {
    const layout = {
      visible: { readiness: true, coach: false, quote: false },
      order: ['coach', 'nutrition-strip'],
    };
    const simple = resolveTodayLayout(layout, 'simple');
    expect(simple.map((s) => s.id).slice(0, 2)).toEqual(['coach', 'nutrition-strip']);
    expect(simple.find((s) => s.id === 'readiness')!.shown).toBe(true);
    expect(simple.find((s) => s.id === 'coach')!.shown).toBe(false);
    expect(simple.find((s) => s.id === 'quote')!.shown).toBe(false);
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
        'readiness', 'level', 'steps', 'challenge', 'weekly-review-detail', 'quote',
      ],
    });
  });
});
