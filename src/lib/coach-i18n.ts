/**
 * LIVE-P1-03 — localized coach sentences.
 *
 * Coach generators (coach-engine, weekly-review, nutrition-coach,
 * athlete-model) build English strings from user data. To render them in
 * Hindi WITHOUT translating user content and WITHOUT a runtime import
 * cycle, generators attach a `LocalizedSentence` { key, params } next to
 * the English text, and renderers call `renderLocalizedSentence`.
 *
 * Why the indirection: `i18n/index` imports the store, and the store
 * imports the coach libs — so a lib that imported `translate` at runtime
 * would cycle. This module imports only `i18n/en` (a pure dictionary)
 * and `exercise-library` (pure data), so it is cycle-free. Generators
 * import ONLY the `LocalizedSentence` type, which TypeScript erases.
 *
 * Param conventions (the renderer localizes these by NAME):
 * - `day`: a DayOfWeek id ('monday' …) → full weekday name in the UI language.
 * - `exercise`: a library exercise name → EXERCISE_NAME_HI in Hindi mode,
 *   unchanged otherwise (unknown / user-created names fall back to the original).
 * - `family`: a MovementFamily id → 'horizontal push' in English,
 *   transliterated Hindi in Hindi mode (technical terms stay recognizable).
 * - `fams`: comma-joined family ids → each localized as `family`, joined ', '.
 * - everything else passes through untouched (numbers, user plan names,
 *   food portion descriptions — food names are NEVER translated).
 */
import { WEEKDAYS, type Language, type StringKey } from './i18n/en';
import { getExerciseHindiName, type MovementFamily } from './exercise-library';
import type { DayOfWeek } from './types';

export interface LocalizedSentence {
  key: StringKey;
  params?: Record<string, string | number>;
}

export const DAY_ORDER: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const FAMILY_HI: Record<MovementFamily, string> = {
  hinge: 'हिंज',
  squat: 'स्क्वैट',
  horizontal_push: 'हॉरिज़ॉन्टल पुश',
  vertical_push: 'वर्टिकल पुश',
  horizontal_pull: 'हॉरिज़ॉन्टल पुल',
  vertical_pull: 'वर्टिकल पुल',
  carry: 'कैरी',
  core: 'कोर',
  other: 'अन्य',
};

function localizeDay(value: string, language: Language): string {
  const idx = DAY_ORDER.indexOf(value as DayOfWeek);
  return idx >= 0 ? WEEKDAYS[language].full[idx] : value;
}

function localizeFamily(value: string, language: Language): string {
  return language === 'hi'
    ? (FAMILY_HI[value as MovementFamily] ?? value.replace(/_/g, ' '))
    : value.replace(/_/g, ' ');
}

function localizeParam(name: string, value: string | number, language: Language): string | number {
  if (typeof value !== 'string') return value;
  if (name === 'day') return localizeDay(value, language);
  if (name === 'exercise') return language === 'hi' ? (getExerciseHindiName(value) ?? value) : value;
  if (name === 'family') return localizeFamily(value, language);
  if (name === 'fams')
    return value
      .split(', ')
      .map((f) => localizeFamily(f.trim(), language))
      .join(', ');
  return value;
}

/**
 * Render a LocalizedSentence in the active language, falling back to the
 * stored English text when no struct is present (old persisted reviews /
 * facts keep working, and English output is byte-identical to before).
 */
export function renderLocalizedSentence(
  t: (key: StringKey, params?: Record<string, string | number>) => string,
  language: Language,
  sentence: LocalizedSentence | null | undefined,
  fallback: string,
): string {
  if (!sentence) return fallback;
  const params: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(sentence.params ?? {})) {
    params[name] = localizeParam(name, value, language);
  }
  return t(sentence.key, params);
}

/** "Leg Day (Monday), Push Day (Tuesday), and Pull Day (Wednesday)" — join rules per language. */
export function formatCheckInList(sessions: { name: string; day: DayOfWeek }[], language: Language): string {
  const items = sessions.map((s) => `${s.name} (${localizeDay(s.day, language)})`);
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2)
    return language === 'hi' ? `${items[0]} और ${items[1]}` : `${items[0]} and ${items[1]}`;
  const head = items.slice(0, -1).join(', ');
  return language === 'hi' ? `${head} और ${items[items.length - 1]}` : `${head}, and ${items[items.length - 1]}`;
}

/**
 * DayOfWeek id for a YYYY-MM-DD date. Local noon is used so the calendar
 * date can never shift across a timezone boundary (same trick as the
 * rest of the codebase's local-date handling, without a new import).
 */
export function dayOfWeekId(dateStr: string): DayOfWeek {
  const d = new Date(`${dateStr}T12:00:00`);
  return DAY_ORDER[(d.getDay() + 6) % 7];
}
