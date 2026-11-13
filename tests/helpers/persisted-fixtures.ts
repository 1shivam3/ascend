/**
 * Persisted-state fixtures for tests (state-machines program, Phase 0).
 *
 * Tests that touch localStorage persistence seed state from VERSIONED
 * fixture objects — plain `{ key: rawString }` maps in the exact shape an
 * old (or current) app version would have written — instead of hand-writing
 * storage entries inline. When a persisted shape changes, add a NEW fixture
 * file for the new shape and keep the old one: migration tests seed the old
 * fixture, run the reader/migration, and assert no data is lost.
 *
 * Fixtures live in `tests/fixtures/persisted/` as JSON files whose top level
 * maps a fixture name to its storage map, e.g.
 *   { "storeShape": "v3-2026-11", "entries": { "ascend_store": "{...}" } }
 *
 * This module installs an in-memory Storage implementation (the repo's
 * established MockStorage idiom, cf. tests/sync-push-quarantine.test.ts)
 * and seeds it. It never touches a real browser storage.
 */

export class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

export interface PersistedFixture {
  /** Human/version label, e.g. "store envelope v3, pre-state-machines". */
  shape: string;
  /** localStorage key → raw string value, exactly as persisted. */
  entries: Record<string, string>;
}

/** Install a fresh in-memory localStorage on globalThis and return it. */
export function installMemoryStorage(): MemoryStorage {
  const storage = new MemoryStorage();
  (globalThis as { localStorage?: Storage }).localStorage = storage;
  return storage;
}

/**
 * Seed the installed (or given) storage from a fixture. Values are written
 * verbatim — fixtures hold raw persisted strings, not objects, so a test
 * exercises the real parse path of whatever it is testing.
 */
export function seedPersistedState(
  fixture: PersistedFixture,
  storage: Storage = (globalThis as { localStorage: Storage }).localStorage,
): void {
  for (const [key, raw] of Object.entries(fixture.entries)) {
    storage.setItem(key, raw);
  }
}

/** Build a fixture inline (for one-off shapes) with an explicit version label. */
export function fixtureOf(shape: string, entries: Record<string, string>): PersistedFixture {
  return { shape, entries };
}

/**
 * Fixture for a zustand-persist store envelope (`{ state, version }`) under
 * an arbitrary key — the shape `ascend_store` and sibling stores persist.
 * `version` defaults to the envelope version the CURRENT app writes for the
 * main store (3); pass an older version to model an old-shape fixture.
 */
export function storeEnvelopeFixture(
  key: string,
  state: Record<string, unknown>,
  version = 3,
): PersistedFixture {
  return fixtureOf(`zustand envelope v${version} (${key})`, {
    [key]: JSON.stringify({ state, version }),
  });
}
