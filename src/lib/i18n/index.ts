/**
 * Lightweight i18n for ASCEND — no framework, just dictionaries.
 *
 * Design:
 * - `en.ts` is the complete key set (`StringKey`); `hi.ts` is a partial
 *   override. `translate()` resolves hi → en, so an untranslated string
 *   degrades to English, never to a raw key.
 * - PERF-2: the Hindi dictionary is lazy-loaded (see
 *   `hi-dictionary.ts`). Until it lands, Hindi lookups degrade to
 *   English; the root page holds its splash for a stored Hindi
 *   preference until the load settles (`useLanguageReady`), so a cold
 *   start in Hindi never paints English first. A failed load also
 *   settles — the UI proceeds in English rather than hanging — and the
 *   next explicit switch to Hindi retries.
 * - The active language lives in the zustand store
 *   (`uiPreferences.language`), persisted via partialize + backup, so
 *   switching applies instantly (components subscribe to the store) and
 *   survives reload.
 * - `{name}`-style params interpolate at lookup time.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { en, WEEKDAYS, type Language, type StringKey } from './en';
import {
  getHiDictionary,
  isHiDictionarySettled,
  loadHiDictionary,
  subscribeHiDictionary,
  type HiDictionary,
} from './hi-dictionary';
import { useStore } from '../store';

export type { Language, StringKey };
export { WEEKDAYS };
export {
  getHiDictionary,
  isHiDictionarySettled,
  loadHiDictionary,
  registerHiDictionary,
} from './hi-dictionary';

export interface Dictionaries {
  en: typeof en;
  hi: HiDictionary;
}

/**
 * Gate for the root page's splash: true when the active language can
 * paint its real copy — always true for English; for Hindi, true once
 * the dictionary has loaded or its load has failed (English fallback).
 * Triggers the load when Hindi becomes active.
 */
export function useLanguageReady(language: Language): boolean {
  const dict = useSyncExternalStore(subscribeHiDictionary, () => getHiDictionary(), () => null);
  const settled = useSyncExternalStore(
    subscribeHiDictionary,
    () => isHiDictionarySettled(),
    () => false
  );
  useEffect(() => {
    if (language === 'hi' && !dict && !settled) {
      void loadHiDictionary();
    }
  }, [language, dict, settled]);
  if (language !== 'hi') return true;
  return dict !== null || settled;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export function translate(
  language: Language,
  key: StringKey,
  params?: Record<string, string | number>,
  dicts?: Dictionaries
): string {
  // Default dictionaries resolve at call time so a Hindi lookup made
  // after the lazy dictionary lands sees it, and one made before
  // degrades to English instead of a raw key.
  const resolved: Dictionaries = dicts ?? { en, hi: getHiDictionary() ?? {} };
  const raw =
    (language === 'hi' ? resolved.hi[key] : undefined) ?? resolved.en[key] ?? (key as string);
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] !== undefined ? String(params[name]) : match
  );
}

/** Normalize anything (legacy saves, corrupt values) to a real language. */
export function resolveLanguage(value: unknown): Language {
  return value === 'hi' ? 'hi' : 'en';
}

/** Non-hook read for lib code (notifications, formatters, …). */
export function getCurrentLanguage(): Language {
  try {
    return resolveLanguage(useStore.getState().uiPreferences?.language);
  } catch {
    return 'en';
  }
}

/** Monday-first weekday names for the active language. */
export function weekdayNames(language: Language, form: 'short' | 'full' = 'short'): string[] {
  return WEEKDAYS[resolveLanguage(language)][form];
}

export interface Translation {
  t: (key: StringKey, params?: Record<string, string | number>) => string;
  language: Language;
  setLanguage: (language: Language) => void;
}

/** Component hook: re-renders the component the moment language changes. */
export function useTranslation(): Translation {
  const language = useStore((s) => resolveLanguage(s.uiPreferences?.language));
  const setUiPreferences = useStore((s) => s.setUiPreferences);
  // Re-render the moment the lazy Hindi dictionary lands (or its load
  // settles), so a switch to Hindi paints fully in Hindi on arrival.
  const loadedHi = useSyncExternalStore(subscribeHiDictionary, () => getHiDictionary(), () => null);
  useEffect(() => {
    if (language === 'hi' && !loadedHi && !isHiDictionarySettled()) {
      void loadHiDictionary();
    }
  }, [language, loadedHi]);
  // `t` needs no dictionary dependency: translate() resolves the
  // dictionary at call time, and the subscription above re-renders
  // this component when it lands — the callback can never go stale.
  const t = useCallback(
    (key: StringKey, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language]
  );
  const setLanguage = useCallback(
    (next: Language) => {
      // Preload-on-intent: start the fetch in the same tick as the tap,
      // before the store write re-renders the app in Hindi.
      if (next === 'hi') void loadHiDictionary();
      setUiPreferences({ language: next });
    },
    [setUiPreferences]
  );
  return { t, language, setLanguage };
}
