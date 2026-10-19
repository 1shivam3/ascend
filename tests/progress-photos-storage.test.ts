import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore, partializeAppState, PROGRESS_PHOTOS_KEY } from '@/lib/store';
import { getPurgeableLocalKeys } from '@/lib/storage';
import type { ProgressPhoto } from '@/lib/types';

// Mock storage for tests (same pattern as offline-sync-resilience.test.ts)
class MockStorage implements Storage {
  private store = new Map<string, string>();
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
    this.store.set(key, String(value));
  }
}

const mockStorage = new MockStorage();
const PHOTO_KEY = PROGRESS_PHOTOS_KEY;

function makePhoto(id: string): ProgressPhoto {
  return {
    id,
    dataUrl: `data:image/jpeg;base64,PHOTO_${id}_` + 'x'.repeat(200),
    date: '2026-10-19',
  };
}

describe('Progress photos live outside the persisted zustand blob (startup perf)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.clear();
    Object.defineProperty(global, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
    useStore.setState({ progressPhotos: [] });
  });

  it('addProgressPhoto writes through to the dedicated key and updates state', () => {
    useStore.getState().addProgressPhoto(makePhoto('p1'));
    expect(useStore.getState().progressPhotos).toHaveLength(1);
    const raw = mockStorage.getItem(PHOTO_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('p1');
  });

  it('partializeAppState excludes photos from the synchronous persist blob', () => {
    const state = useStore.getState();
    useStore.setState({ ...state, progressPhotos: [makePhoto('p_perf')] });
    const partial = partializeAppState(useStore.getState());
    expect('progressPhotos' in partial).toBe(false);
    // Sanity: the blob still carries the fields it should.
    expect('profile' in partial).toBe(true);
    expect('workouts' in partial).toBe(true);
    useStore.setState({ progressPhotos: [] });
  });

  it('the photo key is covered by the data-reset purge guarantee', () => {
    const purgeable = getPurgeableLocalKeys(['ascend_store', PROGRESS_PHOTOS_KEY, 'ascend_theme']);
    expect(purgeable).toContain(PROGRESS_PHOTOS_KEY);
    // Theme preference survives reset; photos must not.
    expect(purgeable).not.toContain('ascend_theme');
  });

  it('caps stored photos at 24 in both state and the dedicated key', () => {
    for (let i = 0; i < 26; i++) {
      useStore.getState().addProgressPhoto(makePhoto(`p${i}`));
    }
    expect(useStore.getState().progressPhotos).toHaveLength(24);
    const parsed = JSON.parse(mockStorage.getItem(PHOTO_KEY)!);
    expect(parsed).toHaveLength(24);
    // Newest first
    expect(parsed[0].id).toBe('p25');
  });

  it('removeProgressPhoto updates state and the dedicated key', () => {
    useStore.getState().addProgressPhoto(makePhoto('p1'));
    useStore.getState().addProgressPhoto(makePhoto('p2'));
    useStore.getState().removeProgressPhoto('p1');
    expect(useStore.getState().progressPhotos.map((p) => p.id)).toEqual(['p2']);
    const parsed = JSON.parse(mockStorage.getItem(PHOTO_KEY)!);
    expect(parsed.map((p: ProgressPhoto) => p.id)).toEqual(['p2']);
  });

  it('clearAllData empties in-memory photos (disk purge is handled by purgeLocalAppData)', () => {
    useStore.getState().addProgressPhoto(makePhoto('p1'));
    useStore.getState().clearAllData();
    expect(useStore.getState().progressPhotos).toEqual([]);
    // purgeLocalAppData removes the key in real browsers (it early-returns in
    // node without window); the key-level guarantee is tested above.
    expect(getPurgeableLocalKeys([PROGRESS_PHOTOS_KEY])).toContain(PROGRESS_PHOTOS_KEY);
  });
});
