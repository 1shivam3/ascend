import { describe, it, expect, beforeEach } from 'vitest';
import {
  useStore,
  partializeAppState,
  persistAvatarMirror,
  loadAvatarMirror,
  resolveAvatar,
  AVATAR_MIRROR_KEY,
} from '../src/lib/store';

const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';

// In-memory localStorage shim (vitest runs in node — same pattern as
// progress-photos-storage.test.ts).
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

describe('Profile avatar survival (bug #3)', () => {
  beforeEach(() => {
    Object.defineProperty(global, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
    mockStorage.clear();
    useStore.getState().clearAllData();
  });

  it('setProfile persists the avatar in the store and the mirror key', () => {
    const profile = {
      id: 'user_1',
      name: 'Shivam',
      gender: 'male' as const,
      bodyweightKg: 75,
      bodyweightLbs: 165,
      unit: 'kg' as const,
      goals: ['build_muscle'],
      dietPreference: 'non_vegetarian' as const,
      createdAt: '2026-10-19',
      avatar: DATA_URL,
    } as any;

    useStore.getState().setProfile(profile);

    expect(useStore.getState().profile?.avatar).toBe(DATA_URL);
    expect(loadAvatarMirror()).toBe(DATA_URL);
    const persisted = partializeAppState(useStore.getState()) as any;
    expect(persisted.profile?.avatar).toBe(DATA_URL);
  });

  it('removing the avatar clears the mirror too', () => {
    const base = {
      id: 'user_1',
      name: 'Shivam',
      gender: 'male' as const,
      bodyweightKg: 75,
      bodyweightLbs: 165,
      unit: 'kg' as const,
      goals: ['build_muscle'],
      dietPreference: 'non_vegetarian' as const,
      createdAt: '2026-10-19',
    } as any;
    useStore.getState().setProfile({ ...base, avatar: DATA_URL });
    expect(loadAvatarMirror()).toBe(DATA_URL);
    useStore.getState().setProfile({ ...base, avatar: undefined });
    expect(loadAvatarMirror()).toBeUndefined();
    expect(resolveAvatar(useStore.getState().profile?.avatar)).toBeUndefined();
  });

  it('resolveAvatar restores from the mirror when a profile rebuild dropped it', () => {
    // Simulates the cloud→local profile rebuild arriving without the
    // device-local avatar: the mirror must bring it back.
    persistAvatarMirror(DATA_URL);
    expect(resolveAvatar(undefined)).toBe(DATA_URL);
    expect(resolveAvatar(DATA_URL)).toBe(DATA_URL);
    // With no mirror present, a missing profile avatar stays missing.
    persistAvatarMirror(undefined);
    expect(resolveAvatar(undefined)).toBeUndefined();
  });
});
