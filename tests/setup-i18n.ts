/**
 * i18n boot guarantee for tests (PERF-2).
 *
 * Production no longer statically imports the Hindi dictionary: the
 * root page holds its splash for a stored Hindi preference until
 * `loadHiDictionary()` settles, so a Hindi lookup in the running app
 * always resolves against the real dictionary (or the documented
 * English fallback after a failed load). Vitest has no chunk to fetch,
 * so this setup seeds the registry synchronously from the real
 * dictionary — reproducing that guarantee for every test that resolves
 * Hindi copy, without touching any test's assertions.
 *
 * Imports ONLY the pure registry module and the dictionary data —
 * never the i18n index or the store — so test files that mock the
 * store or the Supabase client keep their pristine module graph.
 */
import { hi } from '../src/lib/i18n/hi';
import { registerHiDictionary } from '../src/lib/i18n/hi-dictionary';

registerHiDictionary(hi);
