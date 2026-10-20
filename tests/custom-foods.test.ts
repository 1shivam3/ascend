import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, partializeAppState } from '../src/lib/store';
import { searchFoods } from '../src/lib/food-search';
import type { CustomFood } from '../src/lib/types';

class MockStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
}
const mockStorage = new MockStorage();

const DAL: Omit<CustomFood, 'id' | 'createdAt'> = {
  name: 'Dal Tadka',
  calories: 240,
  proteinG: 11,
  carbsG: 27,
  fatG: 9,
  defaultQuantity: 1,
  unit: 'katori',
  baseFoodKey: 'dal tadka',
  oilLevel: 'tbsp',
};

describe('custom foods ("my version")', () => {
  beforeEach(() => {
    Object.defineProperty(global, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
    mockStorage.clear();
    useStore.getState().clearAllData();
  });

  it('addCustomFood stores the food and returns it with id + createdAt', () => {
    const created = useStore.getState().addCustomFood(DAL);
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    expect(useStore.getState().customFoods).toHaveLength(1);
    expect(useStore.getState().customFoods[0].calories).toBe(240);
  });

  it('saving the same name again replaces the older version (no duplicates)', () => {
    useStore.getState().addCustomFood(DAL);
    useStore.getState().addCustomFood({ ...DAL, calories: 260 });
    const foods = useStore.getState().customFoods;
    expect(foods).toHaveLength(1);
    expect(foods[0].calories).toBe(260);
  });

  it('customFoods survive the persist partialize round-trip', () => {
    useStore.getState().addCustomFood(DAL);
    const persisted = partializeAppState(useStore.getState() as any) as any;
    expect(Array.isArray(persisted.customFoods)).toBe(true);
    expect(persisted.customFoods[0].name).toBe('Dal Tadka');
    expect(persisted.customFoods[0].unit).toBe('katori');
  });

  it('update + delete work by id', () => {
    const created = useStore.getState().addCustomFood(DAL);
    useStore.getState().updateCustomFood(created.id, { calories: 200 });
    expect(useStore.getState().customFoods[0].calories).toBe(200);
    useStore.getState().deleteCustomFood(created.id);
    expect(useStore.getState().customFoods).toHaveLength(0);
  });

  it('clearAllData wipes custom foods (privacy reset)', () => {
    useStore.getState().addCustomFood(DAL);
    useStore.getState().clearAllData();
    expect(useStore.getState().customFoods).toEqual([]);
  });
});

describe('search priority', () => {
  const customs: CustomFood[] = [
    { ...DAL, id: 'c1', createdAt: new Date().toISOString() },
  ];

  it('custom versions come first and suppress the generic DB twin', () => {
    const results = searchFoods('dal tadka', customs);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].kind).toBe('custom');
    expect(results[0].customFood?.id).toBe('c1');
    // The generic "Dal Tadka" DB suggestion must not also appear
    expect(results.filter((r) => r.name === 'Dal Tadka')).toHaveLength(1);
  });

  it('falls back to DB suggestions when no custom food matches', () => {
    const results = searchFoods('paneer', customs);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.kind === 'db')).toBe(true);
  });

  it('empty query returns nothing', () => {
    expect(searchFoods('', customs)).toEqual([]);
    expect(searchFoods('   ', customs)).toEqual([]);
  });
});
