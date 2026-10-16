import crypto from 'crypto';
import { NotificationPreferences } from './types';

export interface ZonedTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  dateString: string; // YYYY-MM-DD
  timeZone: string;
}

export interface DueReminder {
  type: 'water' | 'meal' | 'workout' | 'weekly_report';
  mealType?: 'breakfast' | 'lunch' | 'dinner';
  occurrenceId: string;
  scheduledTime: string;
}

/**
 * Resolves an IANA timezone into structured components using Intl.DateTimeFormat.
 * NEVER parses a localized date string back into a JavaScript Date.
 * Falls back safely to UTC if timezone is invalid or unparseable.
 */
/**
 * Computes the day of the week (0=Sun … 6=Sat) for a given year/month/day
 * using Zeller's congruence. This is locale-independent and avoids the
 * fragility of parsing Intl short weekday names which can vary by ICU data.
 */
function dayOfWeekFromYmd(year: number, month: number, day: number): number {
  // Zeller's congruence: month is 1-12, but Jan/Feb are treated as months 13/14 of the prior year
  let m = month;
  let y = year;
  if (m < 3) {
    m += 12;
    y -= 1;
  }
  const k = y % 100;
  const j = Math.floor(y / 100);
  const dow = (day + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) - 2 * j) % 7;
  // Zeller's returns 0=Saturday, 1=Sunday, ..., 6=Friday.
  // Convert to standard 0=Sunday, 1=Monday, ..., 6=Saturday.
  return (dow + 6) % 7;
}

export function getZonedTime(date: Date, timeZone?: string | null): ZonedTime {
  let resolvedTz = (timeZone || '').trim() || 'UTC';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: resolvedTz });
  } catch {
    resolvedTz = 'UTC';
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: resolvedTz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const mapping: Record<string, string> = {};
  for (const p of parts) {
    mapping[p.type] = p.value;
  }

  const year = parseInt(mapping.year, 10);
  const month = parseInt(mapping.month, 10);
  const day = parseInt(mapping.day, 10);
  let hour = parseInt(mapping.hour, 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(mapping.minute, 10);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  // Use a locale-independent calculation as the authoritative source.
  // The Intl short weekday name can vary by ICU data availability in some runtimes;
  // computing from the resolved year/month/day components is always correct for
  // the given timezone.
  const dayOfWeek = dayOfWeekFromYmd(year, month, day);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const dateString = `${year}-${mm}-${dd}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    dayOfWeek,
    dateString,
    timeZone: resolvedTz,
  };
}

/**
 * Checks if a given time is within quiet hours.
 * Supports overnight quiet hours (e.g., 22:00 to 07:00).
 */
export function isWithinQuietHours(
  nowOrZoned: Date | { hour: number; minute: number },
  quietHours: { enabled: boolean; start: string; end: string }
): boolean {
  if (!quietHours || !quietHours.enabled) return false;
  const currentMinutes =
    'hour' in nowOrZoned
      ? nowOrZoned.hour * 60 + nowOrZoned.minute
      : nowOrZoned.getHours() * 60 + nowOrZoned.getMinutes();

  const [startH, startM] = (quietHours.start || '22:00').split(':').map(Number);
  const [endH, endM] = (quietHours.end || '07:00').split(':').map(Number);

  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 0) * 60 + (endM || 0);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight quiet hours (e.g. 22:00 to 07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/**
 * Evaluates whether any configured reminders are due within the allowed delivery window.
 * Default window is 60 minutes.
 */
export function evaluateDueReminders(
  zoned: ZonedTime,
  prefs: NotificationPreferences,
  options?: { windowMinutes?: number }
): DueReminder[] {
  if (!prefs || !prefs.enabled) return [];
  if (isWithinQuietHours(zoned, prefs.quietHours)) return [];

  const windowMinutes = typeof options?.windowMinutes === 'number' ? options.windowMinutes : 60;
  const userMinutes = zoned.hour * 60 + zoned.minute;
  const due: DueReminder[] = [];

  // 1. Water Reminders (between 08:00 and 21:00)
  if (prefs.waterReminders && prefs.waterReminders.enabled) {
    const interval = Math.max(1, Math.min(3, prefs.waterReminders.intervalHours || 2));
    for (let h = 8; h <= 21; h++) {
      if ((h - 8) % interval === 0) {
        const schedMinutes = h * 60;
        const diff = userMinutes - schedMinutes;
        if (diff >= 0 && diff <= windowMinutes) {
          due.push({
            type: 'water',
            occurrenceId: `${zoned.dateString}_water_${h}`,
            scheduledTime: `${zoned.dateString}T${String(h).padStart(2, '0')}:00:00`,
          });
        }
      }
    }
  }

  // 2. Meal Reminders (respects configured minutes)
  if (prefs.mealReminders && prefs.mealReminders.enabled) {
    const mealSlots: Array<{ name: 'breakfast' | 'lunch' | 'dinner'; time: string }> = [
      { name: 'breakfast', time: prefs.mealReminders.breakfastTime },
      { name: 'lunch', time: prefs.mealReminders.lunchTime },
      { name: 'dinner', time: prefs.mealReminders.dinnerTime },
    ];

    for (const slot of mealSlots) {
      if (slot.time && /^\d{1,2}:\d{2}$/.test(slot.time)) {
        const [slotH, slotM] = slot.time.split(':').map(Number);
        const schedMinutes = slotH * 60 + (slotM || 0);
        const diff = userMinutes - schedMinutes;
        if (diff >= 0 && diff <= windowMinutes) {
          due.push({
            type: 'meal',
            mealType: slot.name,
            occurrenceId: `${zoned.dateString}_meal_${slot.name}`,
            scheduledTime: `${zoned.dateString}T${slot.time}:00`,
          });
        }
      }
    }
  }

  // 3. Workout Reminders (respects configured days and minutes)
  if (prefs.workoutReminders && prefs.workoutReminders.enabled) {
    if (
      Array.isArray(prefs.workoutReminders.daysOfWeek) &&
      prefs.workoutReminders.daysOfWeek.includes(zoned.dayOfWeek)
    ) {
      const timeStr = prefs.workoutReminders.preferredTime;
      if (timeStr && /^\d{1,2}:\d{2}$/.test(timeStr)) {
        const [prefH, prefM] = timeStr.split(':').map(Number);
        const schedMinutes = prefH * 60 + (prefM || 0);
        const diff = userMinutes - schedMinutes;
        if (diff >= 0 && diff <= windowMinutes) {
          due.push({
            type: 'workout',
            occurrenceId: `${zoned.dateString}_workout`,
            scheduledTime: `${zoned.dateString}T${timeStr}:00`,
          });
        }
      }
    }
  }

  // 4. Weekly Report (respects configured day and time)
  if (prefs.weeklyReport && prefs.weeklyReport.enabled) {
    const daysMap: Record<string, number> = { sunday: 0, monday: 1, saturday: 6 };
    const targetDay = daysMap[prefs.weeklyReport.reportDay] ?? 0;
    if (zoned.dayOfWeek === targetDay) {
      const timeStr = prefs.weeklyReport.reportTime || '10:00';
      if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
        const [reportH, reportM] = timeStr.split(':').map(Number);
        const schedMinutes = reportH * 60 + (reportM || 0);
        const diff = userMinutes - schedMinutes;
        if (diff >= 0 && diff <= windowMinutes) {
          due.push({
            type: 'weekly_report',
            occurrenceId: `${zoned.dateString}_weekly_report`,
            scheduledTime: `${zoned.dateString}T${timeStr}:00`,
          });
        }
      }
    }
  }

  return due;
}

/**
 * Deterministically hashes the push endpoint and occurrence ID into a collision-proof idempotency key.
 */
export function generateIdempotencyKey(endpoint: string, occurrenceId: string): string {
  try {
    const hash = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 24);
    return `${hash}_${occurrenceId}`;
  } catch {
    let h = 0;
    for (let i = 0; i < endpoint.length; i++) {
      h = (h << 5) - h + endpoint.charCodeAt(i);
      h |= 0;
    }
    return `${Math.abs(h).toString(36)}_${occurrenceId}`;
  }
}

export function formatNotificationPayload(
  type: 'water' | 'meal' | 'workout' | 'weekly_report',
  mealType?: 'breakfast' | 'lunch' | 'dinner'
) {
  switch (type) {
    case 'water':
      return {
        title: 'Hydration Check-in',
        body: 'Time to drink a glass of water and hit your hydration target.',
        tab: 'home',
        tag: 'ascend-water',
      };
    case 'meal':
      return {
        title: 'Meal Nutrition Reminder',
        body: mealType
          ? `Time for ${mealType}. Log your meal to stay on track.`
          : 'Fuel your recovery. Log your meal to stay on track.',
        tab: 'meals',
        tag: 'ascend-meal',
      };
    case 'workout':
      return {
        title: "Today's Training Session",
        body: 'Your scheduled workout is ready. Tap to view your exercise split.',
        tab: 'workout',
        tag: 'ascend-workout',
      };
    case 'weekly_report':
      return {
        title: 'Weekly Performance Recap Ready',
        body: 'Review your training consistency and lift progress from this past week.',
        tab: 'progress',
        tag: 'ascend-report',
      };
  }
}
