import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/lib/store';

/**
 * Preview-fix B1a: an explicit empty pinned-foods list is a user
 * clear-all, not "never seeded". Two sites used to reseed it to the
 * 10 default staples (Roti through Eggs): the boot-time healing in
 * onRehydrateStorage and setProfile. A follower-tab clear-all
 * persisted correctly as [] and still came back after reload.
 */

const PROFILE = {
  id: 'test-user',
  name: 'Test',
  bodyweightKg: 75,
  heightCm: 175,
} as never;

describe('B1a: clear-all pinned foods survive', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('boot healing keeps an explicit empty list empty', async () => {
    useStore.getState().clearAllFavoriteFoods();
    expect(useStore.getState().favoriteFoods).toEqual([]);
    await useStore.persist.rehydrate();
    expect(useStore.getState().favoriteFoods).toEqual([]);
  });

  it('setProfile keeps an explicit empty list empty', () => {
    useStore.getState().clearAllFavoriteFoods();
    expect(useStore.getState().favoriteFoods).toEqual([]);
    useStore.getState().setProfile(PROFILE);
    expect(useStore.getState().favoriteFoods).toEqual([]);
  });

  it('setProfile still seeds defaults when the field is absent', () => {
    useStore.setState({ favoriteFoods: undefined as never });
    useStore.getState().setProfile(PROFILE);
    const names = (useStore.getState().favoriteFoods || []).map((f) => f.name);
    expect(names).toContain('Roti');
    expect(names).toContain('Eggs');
    expect(names).toHaveLength(10);
  });
});
