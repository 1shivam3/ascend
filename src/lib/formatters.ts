/**
 * String and number formatting helpers
 */

export const plural = (n: number, one: string, many = one + 's'): string =>
  `${n} ${n === 1 ? one : many}`;

export const formatKg = (kg: number): string => `${Math.round(kg * 10) / 10} kg`;

/**
 * Formats a real elapsed duration honestly — including sub-minute sessions.
 * 10s stays "10s" (never rounded up to "1m" or shown as "0m").
 */
export const formatDuration = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
};

/**
 * Robust cross-platform ID generator with crypto.randomUUID fallback for non-secure / HTTP environments.
 */
export const safeRandomId = (prefix = 'id'): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback if randomUUID fails
    }
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Returns today's date formatted as YYYY-MM-DD in the local user's timezone.
 * Prevents UTC day-shift bugs caused by new Date().toISOString().split('T')[0].
 */
export const getLocalTodayStr = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Audit W4: the LOCAL date of an epoch timestamp (same local-parts
 * logic as getLocalTodayStr). A workout session is dated by when it
 * STARTED, not when the user tapped Finish — a 23:40 → 00:20 session
 * belongs to the start day for streaks, adherence, and weekly totals.
 */
export const getLocalDateOfTimestamp = (ms: number): string =>
  getLocalTodayStr(new Date(ms));

/**
 * Gauntlet DI-01: normalize any workout/entry date to the YYYY-MM-DD local
 * day. Producers must store YYYY-MM-DD (see WorkoutEntry.date), but the
 * Log Past flow built `new Date(`${date}T12:00:00`).toISOString()`, an
 * ISO timestamp that `===` day comparisons (streaks) and `<= todayStr`
 * checks (athlete model, weekly reviews) silently miss. YYYY-MM-DD input
 * passes through unchanged; an ISO timestamp converts by LOCAL parts
 * (not the UTC date part, which shifts for +13/+14 zones); an
 * unparseable string passes through unchanged rather than being
 * destroyed — callers with validation (e.g. body metrics) refuse it.
 */
export const normalizeDateToLocalDay = (dateStr: string): string => {
  if (!dateStr) return dateStr;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const ms = Date.parse(dateStr);
  if (Number.isNaN(ms)) return dateStr;
  return getLocalDateOfTimestamp(ms);
};

/**
 * Audit F12: strict entry-date validation for the store layer.
 * YYYY-MM-DD shape, a REAL calendar date (2026-02-30 fails the
 * round-trip check instead of rolling to Mar 2), and not in the
 * future. Local-date comparison: for YYYY-MM-DD strings,
 * lexicographic order equals chronological order.
 */
export const isValidEntryDate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return false;
  return s <= getLocalTodayStr();
};

/**
 * Gauntlet DI-07: explicit parsing for imported date strings — no
 * `new Date(raw)` (which read dates as UTC, shifting the day in
 * positive-offset timezones, and silently read ambiguous slash dates
 * as US format). Accepts: YYYY-MM-DD, ISO datetimes (local day taken),
 * YYYY/M/D, and D/M/YYYY vs M/D/YYYY slash dates disambiguated by
 * range (a component > 12 must be the day; when both are <= 12 the
 * US export order M/D/YYYY wins — the CSV sources, Strong/Hevy/
 * FitNotes, are US-format). Returns null for anything else, for
 * non-calendar dates, and for future dates.
 */
export function parseImportedDateString(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isValidEntryDate(s) ? s : null;
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) {
    const day = normalizeDateToLocalDay(s);
    return isValidEntryDate(day) ? day : null;
  }
  const ymd = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (ymd) {
    const candidate = `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
    return isValidEntryDate(candidate) ? candidate : null;
  }
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const first = Number(dmy[1]);
    const second = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    let day: number;
    let month: number;
    if (first > 12) {
      day = first;
      month = second;
    } else if (second > 12) {
      month = first;
      day = second;
    } else {
      month = first;
      day = second;
    }
    const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return isValidEntryDate(candidate) ? candidate : null;
  }
  return null;
}

/**
 * Gauntlet DI-07: normalize one imported row date with the F12
 * today-fallback — a valid stored day passes unchanged; anything
 * salvageable (slash formats, ISO datetimes, timestamps) becomes its
 * local day; anything else (malformed, future, missing) becomes
 * today. `changed` reports whether the value moved, so importers can
 * tell the user how many rows were fixed.
 */
export function normalizeImportedDate(raw: unknown): { date: string; changed: boolean } {
  const today = getLocalTodayStr();
  if (typeof raw === 'string') {
    const parsed = parseImportedDateString(raw);
    if (parsed) return { date: parsed, changed: parsed !== raw.trim() };
    return { date: today, changed: raw.trim() !== today };
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const day = getLocalDateOfTimestamp(raw);
    return isValidEntryDate(day) ? { date: day, changed: true } : { date: today, changed: true };
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const day = getLocalTodayStr(raw);
    return isValidEntryDate(day) ? { date: day, changed: true } : { date: today, changed: true };
  }
  return { date: today, changed: true };
}

/** Normalize the `date` of every row; returns the fix count too. */
export function normalizeRowDates<T extends { date?: unknown }>(
  rows: readonly T[],
): { rows: T[]; normalizedCount: number } {
  let normalizedCount = 0;
  const out = rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const { date, changed } = normalizeImportedDate((row as { date?: unknown }).date);
    if (changed) normalizedCount += 1;
    return { ...row, date };
  });
  return { rows: out, normalizedCount };
}

/** Keep the LAST row per date (import dedupe, gauntlet DI-07/DI-16). */
export function dedupeRowsByDate<T extends { date?: unknown }>(rows: readonly T[]): T[] {
  const byDate = new Map<string, T>();
  for (const row of rows) {
    if (row && typeof row === 'object' && typeof row.date === 'string') {
      byDate.set(row.date, row);
    }
  }
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof row.date !== 'string') {
      out.push(row);
      continue;
    }
    if (seen.has(row.date)) continue;
    seen.add(row.date);
    out.push(byDate.get(row.date) as T);
  }
  return out;
}

/**
 * Body-metric import pipeline (DI-07 + DI-16 + the F12a contract):
 * normalize dates, then dedupe by date ONLY among rows whose source
 * date expressed a real day — true source duplicates of one day
 * collapse (last wins), preparing for the (user_id, date) unique
 * constraint. Rows whose date was invalid and fell back to today are
 * NEVER collapsed into each other: the F12a fix guarantees every
 * restored record survives, and three unrelated bad dates in one
 * backup are not duplicates of anything.
 */
export function normalizeAndDedupeBodyMetricDates<T extends { date?: unknown }>(
  rows: readonly T[],
): { rows: T[]; normalizedCount: number } {
  let normalizedCount = 0;
  const out: T[] = [];
  const indexByExpressedDate = new Map<string, number>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      out.push(row);
      continue;
    }
    const raw = (row as { date?: unknown }).date;
    const expressed = typeof raw === 'string' ? parseImportedDateString(raw) : null;
    const { date, changed } = normalizeImportedDate(raw);
    if (changed) normalizedCount += 1;
    const normalizedRow = { ...row, date };
    if (expressed) {
      const existingIdx = indexByExpressedDate.get(date);
      if (existingIdx !== undefined) {
        out[existingIdx] = normalizedRow;
        continue;
      }
      indexByExpressedDate.set(date, out.length);
    }
    out.push(normalizedRow);
  }
  return { rows: out, normalizedCount };
}

/**
 * Monday-first week helpers. The app treats Monday as the start of the week
 * (Sunday as the end) everywhere: consistency strips, weekly recap, training
 * card, AI coach comparisons.
 */

/** Returns the Monday (local, midnight) of the week containing `d`. */
export function getMondayOfWeek(d: Date = new Date()): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay(); // 0=Sun .. 6=Sat
  const daysSinceMonday = (day + 6) % 7;
  copy.setDate(copy.getDate() - daysSinceMonday);
  return copy;
}

/** Returns { start, end } as YYYY-MM-DD strings for the Mon–Sun week containing `d`. */
export function getWeekRange(d: Date = new Date()): { start: string; end: string } {
  const monday = getMondayOfWeek(d);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: getLocalTodayStr(monday), end: getLocalTodayStr(sunday) };
}

/** Returns the 7 YYYY-MM-DD strings (Mon..Sun) for the week containing `d`. */
export function getWeekDateStrings(d: Date = new Date()): string[] {
  const monday = getMondayOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return getLocalTodayStr(day);
  });
}

/**
 * Parses a YYYY-MM-DD string into a local Date object pinned at noon
 * to avoid timezone shifts and daylight savings transitions.
 */
export const parseLocalDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m, d, 12, 0, 0);
    }
  }
  return new Date(dateStr);
};

/**
 * Formats a YYYY-MM-DD date string using local date formatting.
 */
export const formatLocalDate = (
  dateStr: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
): string => {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString(undefined, options);
};

/**
 * Single source of truth for cm → imperial height display.
 * 175 → `5' 9"`. Returns '—' for missing/invalid input.
 */
export const formatHeightImperial = (heightCm: number | undefined | null): string => {
  if (typeof heightCm !== 'number' || !isFinite(heightCm) || heightCm <= 0) return '—';
  const totalInches = Math.round(heightCm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}' ${inches}"`;
};

/** Round to 1 decimal — use for all displayed/converted measurements to kill float artifacts. */
export const round1 = (n: number): number => {
  if (typeof n !== 'number' || !isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
};

/** Round to 2 decimals. */
export const round2 = (n: number): number => {
  if (typeof n !== 'number' || !isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

/**
 * Sanitizes an athlete display name: strips HTML tags / stray markup so it
 * can never leak into derived strings (like the guest @athlete.local email),
 * collapses whitespace, and caps length. Emoji are preserved.
 */
export const sanitizeAthleteName = (raw: string, maxLength = 50): string => {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/[<>&"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
};

/** Email-safe slug from a display name (for the local guest email). */
export const athleteNameToEmailSlug = (name: string): string => {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^[.-]+|[.-]+$/g, '');
  return slug || 'athlete';
};

/** Time-of-day greeting. Late night (22–5) gets "Good night," never "Good morning,". */
export const getTimeGreeting = (date: Date = new Date()): string => {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good morning,';
  if (h >= 12 && h < 17) return 'Good afternoon,';
  if (h >= 17 && h < 22) return 'Good evening,';
  return 'Good night,';
};

/**
 * Format a water volume: "250 ml" under 1 L, "1.5 L" at/above.
 */
export function formatWaterMl(ml: number): string {
  if (ml < 1000) return `${Math.round(ml)} ml`;
  return `${round1(ml / 1000)} L`;
}
