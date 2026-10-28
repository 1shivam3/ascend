/**
 * Pure date logic for the custom DOB picker (DobPicker.tsx).
 *
 * Why this exists: the native `<input type="date">` popup is browser UI,
 * not DOM, so keyboard users and browser automation could not drive it.
 * The picker renders three plain `<select>` dropdowns instead, and its
 * value contract stays the existing YYYY-MM-DD string ('' = no date
 * yet), so every downstream consumer (isValidDob, dobPreviewAge, age
 * chip, Continue gating, error messages) works untouched.
 *
 * Rules (mirror src/lib/age.ts, which stays the validation authority):
 * - Day options follow the real calendar: 28/29/30/31 via the
 *   Date-rollover rule, so Feb 29 appears only in leap years.
 * - Day-31 → short-month resolution is CLAMP: picking day 31 then
 *   switching to February moves the day to 28 (29 in a leap year),
 *   never to an invalid date and never to a cleared selection.
 * - Year options come from the dobPickerBounds() min/max strings
 *   (ages 13–120), never hardcoded years. A fully-selected date
 *   outside 13–120 is still emittable — the existing validation
 *   (errDobUnder13 / errDobRange / Continue gating) rejects it, by
 *   design; this module does not invent new error copy.
 */

import { parseDob } from './age';

export interface DobParts {
  day: number | null;
  month: number | null;
  year: number | null;
}

export const EMPTY_DOB_PARTS: DobParts = { day: null, month: null, year: null };

/** Days in a month (month 1–12). Date(year, month, 0) is the last day of the target month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Day options for the current month+year; 1–31 until both are chosen. */
export function dayOptions(month: number | null, year: number | null): number[] {
  const max = month !== null && year !== null ? daysInMonth(year, month) : 31;
  return Array.from({ length: max }, (_, i) => i + 1);
}

/** Month options: 1–12 (rendered zero-padded numerics — no month-name i18n keys exist). */
export function monthOptions(): number[] {
  return Array.from({ length: 12 }, (_, i) => i + 1);
}

/**
 * Year options from the picker bounds, most-recent-first (the
 * max-bound year, i.e. the youngest allowed age, comes first).
 * Returns [] when either bound is unparseable — placeholders only.
 */
export function dobYearOptions(min: string, max: string): number[] {
  const minYear = parseDob(min)?.year;
  const maxYear = parseDob(max)?.year;
  if (minYear === undefined || maxYear === undefined || maxYear < minYear) return [];
  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y -= 1) years.push(y);
  return years;
}

/** Parse a YYYY-MM-DD value into parts; anything else is "nothing selected". */
export function parseDobParts(value: string): DobParts {
  const parsed = parseDob(value);
  if (!parsed) return { ...EMPTY_DOB_PARTS };
  return { day: parsed.day, month: parsed.month, year: parsed.year };
}

/** Parts back to the YYYY-MM-DD contract; '' unless all three are set. */
export function dobPartsToValue(parts: DobParts): string {
  if (parts.day === null || parts.month === null || parts.year === null) return '';
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/**
 * CLAMP resolution for day-31 → short-month: a day past the end of the
 * newly selected month/year moves to that month's last day (Feb 28, or
 * 29 in a leap year). Partial selections (any part null) pass through
 * unchanged — clamping only applies to a complete month+year.
 */
export function resolveDayForMonth(
  day: number | null,
  month: number | null,
  year: number | null,
): number | null {
  if (day === null || month === null || year === null) return day;
  const max = daysInMonth(year, month);
  return day > max ? max : day;
}
