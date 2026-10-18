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
