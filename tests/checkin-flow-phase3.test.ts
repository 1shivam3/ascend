/**
 * Phase 3.6 (§24): the check-in flow is keyed by question id, not by
 * a bare index into a conditionally-built list, and "done today" is
 * the record's completedAt — not the existence of a first-answer
 * record (every answer saves immediately, so a record exists after
 * question one).
 */
import { describe, it, expect } from 'vitest';
import {
  checkinSteps,
  nextCheckinStep,
  stampCheckinCompletion,
  hasCompletedCheckin,
  type CheckinStep,
} from '../src/lib/coach-session';
import type { ManualCheckin } from '../src/lib/coach-engine';

const NOW = '2026-11-13T04:00:00.000Z';

describe('nextCheckinStep (id-keyed progress)', () => {
  it('walks the canonical order, inserting areas only when soreness is low', () => {
    expect(nextCheckinStep([], 3)).toBe('sleep');
    expect(nextCheckinStep(['sleep'], 3)).toBe('freshness');
    expect(nextCheckinStep(['sleep', 'freshness'], 2)).toBe('areas');
    expect(nextCheckinStep(['sleep', 'freshness'], 4)).toBe('energy');
    expect(nextCheckinStep(checkinSteps(4), 4)).toBeUndefined();
  });

  it('a mid-flow soreness change does not remap answered questions or lose answers', () => {
    // Answered under soreness 5 (no areas question): sleep, freshness,
    // energy. Soreness then drops to 2 (e.g. corrected in the
    // readiness sheet): areas becomes due, and the already-answered
    // energy answer must stay answered — an index into the rebuilt
    // list would point at the wrong question and drop it.
    const answered: CheckinStep[] = ['sleep', 'freshness', 'energy'];
    expect(nextCheckinStep(answered, 2)).toBe('areas');
    expect(nextCheckinStep([...answered, 'areas'], 2)).toBe('minutes');
  });

  it('raising soreness after areas was answered keeps the flow coherent', () => {
    const answered: CheckinStep[] = ['sleep', 'freshness', 'areas'];
    // areas leaves the list at soreness 5; the next due question is
    // energy either way — progress is a set of ids, not a position.
    expect(nextCheckinStep(answered, 5)).toBe('energy');
    expect(nextCheckinStep(answered, 2)).toBe('energy');
  });
});

describe('stampCheckinCompletion / hasCompletedCheckin', () => {
  const base: ManualCheckin = { sleep: 4, soreness: 4, energy: 3 };

  it('no record or no completedAt = not done, however many answers exist', () => {
    expect(hasCompletedCheckin(undefined)).toBe(false);
    expect(hasCompletedCheckin(null)).toBe(false);
    expect(hasCompletedCheckin(base)).toBe(false);
  });

  it('a partial flow does not stamp', () => {
    const out = stampCheckinCompletion(base, ['sleep', 'freshness'], 4, NOW);
    expect(out.completedAt).toBeUndefined();
  });

  it('the final answer stamps completedAt', () => {
    const out = stampCheckinCompletion(base, checkinSteps(4), 4, NOW);
    expect(out.completedAt).toBe(NOW);
    expect(hasCompletedCheckin(out)).toBe(true);
  });

  it('areas is required for completion only when it was asked', () => {
    const withoutAreas = stampCheckinCompletion(
      base,
      ['sleep', 'freshness', 'energy', 'minutes', 'location', 'pain'],
      2, // soreness 2 asks areas — flow is NOT complete without it
      NOW,
    );
    expect(withoutAreas.completedAt).toBeUndefined();
    const withAreas = stampCheckinCompletion(
      base,
      ['sleep', 'freshness', 'areas', 'energy', 'minutes', 'location', 'pain'],
      2,
      NOW,
    );
    expect(withAreas.completedAt).toBe(NOW);
  });

  it('an existing stamp is preserved (first completion wins) and survives later saves', () => {
    const stamped: ManualCheckin = { ...base, completedAt: NOW };
    const later = stampCheckinCompletion(stamped, ['sleep'], 4, '2026-11-13T09:00:00.000Z');
    expect(later.completedAt).toBe(NOW);
  });
});
