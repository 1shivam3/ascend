import { describe, it, expect } from 'vitest';
import {
  collectionSignature,
  syncedStateSignature,
  hasSyncedContentChanged,
  type SyncedStateSlice,
} from '../src/lib/supabase/sync';

/**
 * QA4-018 — the sync subscription only watched collection LENGTHS, so
 * same-length content edits (updateMeal, updatePR,
 * updatePlannedWorkout, same-day metric replacement) never scheduled
 * a push. These tests pin the content-signature detection.
 */

function slice(overrides: Partial<SyncedStateSlice> = {}): SyncedStateSlice {
  return {
    profile: { id: 'u1', name: 'Asha' },
    prs: [{ id: 'pr1', exercise: 'Squat', weightKg: 100 }],
    workouts: [{ id: 'w1', date: '2026-10-20', exercises: [] }],
    meals: [{ id: 'm1', date: '2026-10-20', name: 'Lunch', foods: [{ name: 'Rice', calories: 200 }] }],
    bodyMetrics: [{ id: 'bm1', date: '2026-10-20', weightKg: 70 }],
    plannedWorkouts: [{ id: 'p1', name: 'Push Day', exercises: [] }],
    ...overrides,
  };
}

describe('collectionSignature', () => {
  it('is stable for identical content', () => {
    const a = [{ id: 'x', v: 1 }, { id: 'y', v: 2 }];
    expect(collectionSignature(a)).toBe(collectionSignature(a.map((i) => ({ ...i }))));
  });

  it('changes when an entry is edited in place (same length, same ids)', () => {
    const before = [{ id: 'x', v: 1 }];
    const after = [{ id: 'x', v: 2 }];
    expect(collectionSignature(before)).not.toBe(collectionSignature(after));
  });

  it('changes when an id is swapped at the same length', () => {
    expect(collectionSignature([{ id: 'x', v: 1 }])).not.toBe(
      collectionSignature([{ id: 'z', v: 1 }]),
    );
  });

  it('handles null/undefined/empty', () => {
    expect(collectionSignature(null)).toBe(collectionSignature(undefined));
    expect(collectionSignature([])).not.toBe(collectionSignature(null));
  });
});

describe('hasSyncedContentChanged (QA4-018)', () => {
  it('same-length meal content edit schedules a push (updateMeal)', () => {
    const prev = slice();
    const next = slice({
      meals: [{ id: 'm1', date: '2026-10-20', name: 'Lunch', foods: [{ name: 'Rice', calories: 350 }] }],
    });
    expect(hasSyncedContentChanged(prev, next)).toBe(true);
  });

  it('same-length PR edit schedules a push (updatePR)', () => {
    const prev = slice();
    const next = slice({ prs: [{ id: 'pr1', exercise: 'Squat', weightKg: 105 }] });
    expect(hasSyncedContentChanged(prev, next)).toBe(true);
  });

  it('same-length planned-workout edit schedules a push (updatePlannedWorkout)', () => {
    const prev = slice();
    const next = slice({ plannedWorkouts: [{ id: 'p1', name: 'Push Day v2', exercises: [] }] });
    expect(hasSyncedContentChanged(prev, next)).toBe(true);
  });

  it('same-day body-metric replacement schedules a push', () => {
    const prev = slice();
    const next = slice({ bodyMetrics: [{ id: 'bm1', date: '2026-10-20', weightKg: 69.4 }] });
    expect(hasSyncedContentChanged(prev, next)).toBe(true);
  });

  it('profile content edit schedules a push', () => {
    const prev = slice();
    const next = slice({ profile: { id: 'u1', name: 'Asha', dietPreference: 'vegetarian' } });
    expect(hasSyncedContentChanged(prev, next)).toBe(true);
  });

  it('length changes still schedule a push', () => {
    const prev = slice();
    const next = slice({ workouts: [...prev.workouts, { id: 'w2', date: '2026-10-21', exercises: [] }] });
    expect(hasSyncedContentChanged(prev, next)).toBe(true);
  });

  it('no change → no push (identical references fast path)', () => {
    const s = slice();
    expect(hasSyncedContentChanged(s, s)).toBe(false);
  });

  it('new references with identical content → no push', () => {
    const prev = slice();
    const next = slice({
      meals: prev.meals.map((m) => ({ ...(m as object) })),
      workouts: prev.workouts.map((wItem) => ({ ...(wItem as object) })),
    });
    expect(hasSyncedContentChanged(prev, next)).toBe(false);
    expect(syncedStateSignature(prev)).toBe(syncedStateSignature(next));
  });
});
