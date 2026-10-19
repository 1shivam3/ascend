import { describe, it, expect } from 'vitest';
import {
  getDefaultFreezeState,
  refreshWeeklyFreeze,
  tryUseFreeze,
  shouldFreezeSaveStreak,
  getMondayOfWeek,
} from '../src/lib/streak-freeze';

describe('Streak Freeze', () => {
  it('grants a fresh freeze on a new week', () => {
    const state = getDefaultFreezeState();
    const refreshed = refreshWeeklyFreeze(state);
    expect(refreshed.freezeWeekStart).toBe(getMondayOfWeek());
    expect(refreshed.freezeUsed).toBe(false);
  });

  it('does not re-grant within the same week', () => {
    const state = {
      freezeWeekStart: getMondayOfWeek(),
      freezeUsed: true,
      freezeAppliedDate: '2026-10-20',
    };
    const refreshed = refreshWeeklyFreeze(state);
    expect(refreshed.freezeUsed).toBe(true);
  });

  it('tryUseFreeze consumes the freeze', () => {
    const state = getDefaultFreezeState();
    const { saved, newState } = tryUseFreeze(state, '2026-10-20');
    expect(saved).toBe(true);
    expect(newState.freezeUsed).toBe(true);
    expect(newState.freezeAppliedDate).toBe('2026-10-20');
  });

  it('tryUseFreeze fails if already used', () => {
    const state = {
      freezeWeekStart: getMondayOfWeek(),
      freezeUsed: true,
      freezeAppliedDate: '2026-10-19',
    };
    const { saved } = tryUseFreeze(state, '2026-10-20');
    expect(saved).toBe(false);
  });

  it('shouldFreezeSaveStreak only for single missed days', () => {
    const state = getDefaultFreezeState();
    expect(shouldFreezeSaveStreak(state, 1)).toBe(true);
    expect(shouldFreezeSaveStreak(state, 2)).toBe(false);
    expect(shouldFreezeSaveStreak(state, 0)).toBe(false);
  });
});
