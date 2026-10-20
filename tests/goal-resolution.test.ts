import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/lib/store';
import { DEFAULT_GOALS, resolvePrimaryGoal } from '../src/lib/types';
import { calculateRecommendedMacroGoals } from '../src/lib/macros';

describe('Goal single source of truth (bug: deselection did not stick)', () => {
  beforeEach(() => {
    // Reset goal state directly for isolation (setGoals([]) intentionally
    // falls back to DEFAULT_GOALS, so bypass it here).
    useStore.setState({ goals: [], profile: null });
  });

  it('DEFAULT_GOALS is a single conservative default, not a phantom pair', () => {
    expect(DEFAULT_GOALS).toEqual(['build_muscle']);
  });

  it('resolvePrimaryGoal falls back to build_muscle when empty', () => {
    expect(resolvePrimaryGoal([])).toBe('build_muscle');
    expect(resolvePrimaryGoal(null)).toBe('build_muscle');
    expect(resolvePrimaryGoal(undefined)).toBe('build_muscle');
  });

  it('resolvePrimaryGoal prefers lose_fat over muscle/strength goals (never sabotage a deficit)', () => {
    expect(resolvePrimaryGoal(['get_stronger', 'lose_fat'])).toBe('lose_fat');
    expect(resolvePrimaryGoal(['build_muscle', 'lose_fat'])).toBe('lose_fat');
    expect(resolvePrimaryGoal(['lose_fat'])).toBe('lose_fat');
  });

  it('resolvePrimaryGoal prefers build_muscle over get_stronger', () => {
    expect(resolvePrimaryGoal(['get_stronger', 'build_muscle'])).toBe('build_muscle');
  });

  it('resolvePrimaryGoal keeps unambiguous single goals intact', () => {
    expect(resolvePrimaryGoal(['get_stronger'])).toBe('get_stronger');
    expect(resolvePrimaryGoal(['stamina'])).toBe('stamina');
    expect(resolvePrimaryGoal(['general_fitness'])).toBe('general_fitness');
  });

  it('store setGoals falls back to DEFAULT_GOALS on empty input', () => {
    useStore.getState().setGoals([]);
    expect(useStore.getState().goals).toEqual(['build_muscle']);
  });

  it('store setGoals persists a deselection exactly (no phantom goals reappear)', () => {
    useStore.getState().setGoals(['get_stronger', 'lose_fat']);
    // User deselects get_stronger -> only lose_fat must remain
    useStore.getState().setGoals(['lose_fat']);
    expect(useStore.getState().goals).toEqual(['lose_fat']);
  });

  it('store toggleGoal deselects down to one goal and protects the last one', () => {
    useStore.getState().setGoals(['get_stronger', 'lose_fat']);
    useStore.getState().toggleGoal('get_stronger');
    expect(useStore.getState().goals).toEqual(['lose_fat']);
    useStore.getState().toggleGoal('lose_fat');
    expect(useStore.getState().goals).toEqual(['lose_fat']);
  });

  it('store toggleGoal on empty state starts from DEFAULT_GOALS, not a phantom pair', () => {
    useStore.getState().toggleGoal('lose_fat');
    expect(useStore.getState().goals).toEqual(['build_muscle', 'lose_fat']);
  });

  it('macro engine reports maintenance + delta so the UI can explain a deficit', () => {
    // Priya's case from the bug report: 68 kg woman, lose_fat.
    // Must produce a real deficit, not maintenance (~1,981 kcal).
    // Round 2 (persona fix): the deficit is PROPORTIONAL — 20% of
    // maintenance, capped at 450 kcal. A flat -450 was a 27% cut for a
    // small sedentary woman (landing her exactly on the 1200 floor in
    // persona-calorie-maintenance) yet only 15% for a large athlete.
    const m = calculateRecommendedMacroGoals(68, 'lose_fat', 'female', 165, 27);
    expect(m.maintenanceCalories).toBeDefined();
    expect(m.calorieDelta).toBeDefined();
    expect(m.calories).toBeLessThan(m.maintenanceCalories!);
    expect(Math.abs(m.calorieDelta! + m.maintenanceCalories! * 0.2)).toBeLessThanOrEqual(3);
    expect(m.calories).toBeGreaterThanOrEqual(1400); // safety floor holds
    expect(m.proteinG).toBe(Math.round(68 * 2.2)); // elevated protein preserved
    expect(m.calories).toBe(m.maintenanceCalories! + m.calorieDelta!);
  });

  it('macro engine reports a surplus delta for build_muscle', () => {
    const m = calculateRecommendedMacroGoals(75, 'build_muscle', 'male', 178, 25);
    expect(m.calorieDelta!).toBeGreaterThan(0);
    expect(m.calories).toBe(m.maintenanceCalories! + m.calorieDelta!);
  });
});
