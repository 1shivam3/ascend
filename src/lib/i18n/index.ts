/**
 * Lightweight i18n for ASCEND — no framework, just dictionaries.
 *
 * Design:
 * - `en.ts` is the complete key set (`StringKey`); `hi.ts` is a partial
 *   override. `translate()` resolves hi → en, so an untranslated string
 *   degrades to English, never to a raw key.
 * - The active language lives in the zustand store
 *   (`uiPreferences.language`), persisted via partialize + backup, so
 *   switching applies instantly (components subscribe to the store) and
 *   survives reload.
 * - `{name}`-style params interpolate at lookup time.
 */
import { useCallback } from 'react';
import { en, WEEKDAYS, type Language, type StringKey } from './en';
import { hi } from './hi';
import { useStore } from '../store';

export type { Language, StringKey };
export { WEEKDAYS };

export interface Dictionaries {
  en: typeof en;
  hi: Partial<Record<StringKey, string>>;
}

const DEFAULT_DICTS: Dictionaries = { en, hi };

export function translate(
  language: Language,
  key: StringKey,
  params?: Record<string, string | number>,
  dicts: Dictionaries = DEFAULT_DICTS
): string {
  const raw =
    (language === 'hi' ? dicts.hi[key] : undefined) ?? dicts.en[key] ?? (key as string);
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
  const t = useCallback(
    (key: StringKey, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language]
  );
  const setLanguage = useCallback(
    (next: Language) => setUiPreferences({ language: next }),
    [setUiPreferences]
  );
  return { t, language, setLanguage };
}
