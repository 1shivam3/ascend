/**
 * Final-cert SEC F-05 (P3): (1) the service worker's default fetch
 * branch cached ANY GET 200 — including cross-origin responses — and
 * replayed them offline; it is now same-origin only. The SW source is
 * public/sw.template.js (public/sw.js is generated from it by
 * scripts/generate-sw.js at build time). (2) Cache Storage was never
 * purged on logout / local-data wipe; purgeAppCaches (storage.ts) now
 * deletes the app's `ascend-…` caches, wired into purgeLocalAppData
 * and the store logout().
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAppCacheNames, purgeAppCaches } from '../src/lib/storage';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('final-cert SEC F-05: SW default branch is same-origin only', () => {
  it('the template guards the default branch with an origin check before any cache.put fallback', () => {
    const src = read('public/sw.template.js');
    const guardIdx = src.indexOf('url.origin !== self.location.origin');
    expect(guardIdx).toBeGreaterThan(-1);
    // The guard sits in the default branch, before its cache fallback.
    const defaultIdx = src.indexOf('Default: Network with cache fallback');
    expect(defaultIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(defaultIdx);
    const fallbackIdx = src.indexOf('caches.match(request)', guardIdx);
    expect(fallbackIdx).toBeGreaterThan(guardIdx);
    // Cross-origin requests are passed straight to fetch.
    expect(src).toContain('event.respondWith(fetch(request));');
  });
});

describe('final-cert SEC F-05: purgeAppCaches', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getAppCacheNames keeps only ascend- caches', () => {
    expect(getAppCacheNames(['ascend-dev-cache', 'ascend-abc1234-cache', 'other-app', 'workbox-precache'])).toEqual([
      'ascend-dev-cache',
      'ascend-abc1234-cache',
    ]);
    expect(getAppCacheNames([])).toEqual([]);
  });

  it('purgeAppCaches deletes exactly the app caches via the Cache Storage API', async () => {
    const deleted: string[] = [];
    vi.stubGlobal('window', {});
    vi.stubGlobal('caches', {
      keys: async () => ['ascend-dev-cache', 'someone-elses-cache'],
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });
    const result = await purgeAppCaches();
    expect(result).toEqual(['ascend-dev-cache']);
    expect(deleted).toEqual(['ascend-dev-cache']);
  });

  it('purgeAppCaches is a guarded no-op without the caches API', async () => {
    vi.stubGlobal('window', {});
    // No `caches` global in the node test environment.
    await expect(purgeAppCaches()).resolves.toEqual([]);
  });

  it('the purge/logout wiring exists', () => {
    const storage = read('src/lib/storage.ts');
    expect(storage).toContain('void purgeAppCaches();');
    const store = read('src/lib/store.ts');
    expect(store).toContain('void purgeAppCaches();');
  });
});
