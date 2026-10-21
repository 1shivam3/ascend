import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useStore,
  mainStoreStorage,
  getMainStoreWriteFailed,
  getStorageWriteFailed,
} from '@/lib/store';

// QA4A-004: when the origin quota fills up, writes of the main
// `ascend_store` persist blob start throwing QuotaExceededError. They
// used to fail silently — data stopped surviving reloads with no user
// surface anywhere. The fix mirrors the emergency-snapshot pattern
// (getSnapshotWriteFailed): the persist storage adapter catches the
// failure, flips a health flag, and the Data Vault surfaces it.
//
// Mock storage with a switchable quota failure (same MockStorage
// pattern as progress-photos-storage.test.ts).
class MockStorage implements Storage {
  private store = new Map<string, string>();
  failSets = false;
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] || null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.failSets) {
      const err = new Error('Storage quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.store.set(key, String(value));
  }
}

const mockStorage = new MockStorage();

describe('Main store persist writes survive quota failure honestly (QA4A-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.clear();
    mockStorage.failSets = false;
    Object.defineProperty(global, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
    // Reset the health flag via one successful write through the adapter.
    mainStoreStorage.setItem('ascend_store', '{}');
    expect(getMainStoreWriteFailed()).toBe(false);
  });

  it('adapter: a QuotaExceededError never escapes setItem and flips the health flag', () => {
    mockStorage.failSets = true;
    expect(() => mainStoreStorage.setItem('ascend_store', '{"state":{}}')).not.toThrow();
    expect(getMainStoreWriteFailed()).toBe(true);
    // The combined flag the Data Vault reads must reflect it too.
    expect(getStorageWriteFailed()).toBe(true);
  });

  it('adapter: a later successful write clears the flag (recovery is honest too)', () => {
    mockStorage.failSets = true;
    mainStoreStorage.setItem('ascend_store', '{"state":{}}');
    expect(getMainStoreWriteFailed()).toBe(true);
    mockStorage.failSets = false;
    mainStoreStorage.setItem('ascend_store', '{"state":{}}');
    expect(getMainStoreWriteFailed()).toBe(false);
    expect(getStorageWriteFailed()).toBe(false);
    expect(mockStorage.getItem('ascend_store')).toBe('{"state":{}}');
  });

  it('adapter: getItem/removeItem failures are contained', () => {
    const broken = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {},
      removeItem() {
        throw new Error('blocked');
      },
    };
    Object.defineProperty(global, 'localStorage', {
      value: broken,
      writable: true,
      configurable: true,
    });
    expect(mainStoreStorage.getItem('ascend_store')).toBeNull();
    expect(() => mainStoreStorage.removeItem('ascend_store')).not.toThrow();
  });

  it('store: a state change under quota does not throw, still applies in memory, and surfaces via the flag', () => {
    mockStorage.failSets = true;
    expect(() =>
      useStore.getState().setUiPreferences({ gamificationEnabled: false })
    ).not.toThrow();
    // The update itself worked — only persistence failed.
    expect(useStore.getState().uiPreferences.gamificationEnabled).toBe(false);
    expect(getMainStoreWriteFailed()).toBe(true);
    expect(getStorageWriteFailed()).toBe(true);
    // Nothing was written under the main key beyond the beforeEach seed.
    expect(JSON.parse(mockStorage.getItem('ascend_store')!)).toEqual({});
  });

  it('store: with storage healthy, a state change persists the blob and keeps the flag clear', () => {
    useStore.getState().setUiPreferences({ gamificationEnabled: true });
    expect(getMainStoreWriteFailed()).toBe(false);
    const raw = mockStorage.getItem('ascend_store');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.uiPreferences.gamificationEnabled).toBe(true);
  });
});
