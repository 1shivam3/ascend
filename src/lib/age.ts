/**
 * Date-of-birth → age calculation (local device only).
 *
 * DOB is NEVER synced: the profiles table has no dob column and the sync
 * upsert/pull field lists are explicit, so a `dateOfBirth` key on the local
 * profile object never leaves the device. Every consumer keeps reading
 * `profile.age`; this helper is the single place that derives it.
 *
 * Rules:
 * - Strict YYYY-MM-DD with a real-calendar check (2026-02-30 rejected).
 * - Age uses LOCAL date parts (same convention as getLocalTodayStr), never
 *   UTC, so a birthday is never off by one near midnight.
 * - Feb 29 birthdays: the anniversary is constructed with
 *   `new Date(year, month - 1, day)`, which rolls Feb 29 -> Mar 1 in
 *   non-leap years. That rollover IS the rule, documented here.
 * - Returns null on any invalid input; callers treat null as "no usable DOB".
 */

const DOB_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDob(dob: string): { year: number; month: number; day: number } | null {
  const m = DOB_RE.exec((dob || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Real-calendar check: the constructed date must round-trip exactly.
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return { year, month, day };
}

export function isValidDob(dob: string): boolean {
  return parseDob(dob) !== null;
}

/** Local "today" as YYYY-MM-DD (no UTC shift). */
export function localTodayStr(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Age in whole years at `today` (default: now, local parts).
 * Returns null for invalid DOB or a DOB in the future.
 */
export function calculateAgeFromDob(dob: string, today = new Date()): number | null {
  const parsed = parseDob(dob);
  if (!parsed) return null;
  const todayY = today.getFullYear();
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();
  if (
    parsed.year > todayY ||
    (parsed.year === todayY && parsed.month > todayM) ||
    (parsed.year === todayY && parsed.month === todayM && parsed.day > todayD)
  ) {
    return null; // future DOB
  }
  let age = todayY - parsed.year;
  if (todayM < parsed.month || (todayM === parsed.month && todayD < parsed.day)) age -= 1;
  return age;
}

/** Picker bounds for the DOB input: ages 13–120 (mirrors the old age rules). */
export function dobPickerBounds(today = new Date()): { min: string; max: string } {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return { min: `${y - 120}-${m}-${d}`, max: `${y - 13}-${m}-${d}` };
}
