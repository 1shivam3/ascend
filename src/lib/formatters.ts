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
