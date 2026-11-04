/**
 * Lazy Hindi dictionary registry (PERF-2).
 *
 * The Hindi dictionary (~65 KB gzip) used to be statically imported by
 * the i18n module, so it rode in the initial bundle of every session —
 * the second-largest script on first load — including the sessions
 * that run entirely in English. It now loads on demand the first time
 * Hindi is the active language and is cached for the rest of the
 * session.
 *
 * This module is deliberately dependency-free (no store, no React) so
 * the test setup can seed the registry without dragging the app module
 * graph — and its Supabase client — into test files that mock it.
 */
import type { StringKey } from './en';

export type HiDictionary = Partial<Record<StringKey, string>>;

let hiDict: HiDictionary | null = null;
// Settled = loaded, or failed and degrading to English. Lookups never
// block on the dictionary; "settled" only gates the cold-start splash.
let hiSettled = false;
let hiLoadPromise: Promise<HiDictionary | null> | null = null;
const hiListeners = new Set<() => void>();

function notifyHiListeners(): void {
  hiListeners.forEach((fn) => fn());
}

export function subscribeHiDictionary(onStoreChange: () => void): () => void {
  hiListeners.add(onStoreChange);
  return () => {
    hiListeners.delete(onStoreChange);
  };
}

/** The loaded Hindi dictionary, or null while it has not arrived. */
export function getHiDictionary(): HiDictionary | null {
  return hiDict;
}

/**
 * True once the Hindi-dictionary question is settled for now — either
 * the dictionary is in memory, or loading it failed and Hindi lookups
 * degrade to English until a later successful retry.
 */
export function isHiDictionarySettled(): boolean {
  return hiSettled;
}

/**
 * Synchronously seed the Hindi dictionary. Exists for the test setup,
 * which reproduces the production boot guarantee (dictionary present
 * before a Hindi preference resolves copy) without a chunk fetch; app
 * code uses `loadHiDictionary()`.
 */
export function registerHiDictionary(dict: HiDictionary): void {
  hiDict = dict;
  hiSettled = true;
  notifyHiListeners();
}

type HiImporter = () => Promise<{ hi: HiDictionary }>;

const defaultHiImporter: HiImporter = () => import('./hi');

/**
 * Load the Hindi dictionary once; concurrent calls share the in-flight
 * promise and later calls return the cached dictionary. Never rejects:
 * a failure resolves null, marks the load settled-with-fallback, and
 * clears the promise so the next call retries. The optional importer
 * is a test seam for the failure path.
 */
export function loadHiDictionary(
  importer: HiImporter = defaultHiImporter
): Promise<HiDictionary | null> {
  if (hiDict) return Promise.resolve(hiDict);
  if (hiLoadPromise) return hiLoadPromise;
  hiLoadPromise = importer()
    .then((mod) => {
      hiDict = mod.hi;
      hiSettled = true;
      hiLoadPromise = null;
      notifyHiListeners();
      return hiDict;
    })
    .catch(() => {
      hiSettled = true;
      hiLoadPromise = null;
      notifyHiListeners();
      return null;
    });
  return hiLoadPromise;
}
