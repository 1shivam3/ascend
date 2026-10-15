import { describe, it, expect } from 'vitest';
import {
  isWithinQuietHours,
  formatNotificationPayload,
  getZonedTime,
  evaluateDueReminders,
  generateIdempotencyKey,
} from '@/lib/notifications';
import { DEFAULT_NOTIFICATION_PREFERENCES, NotificationPreferences } from '@/lib/types';

describe('Notification Preferences & Quiet Hours', () => {
  it('has secure and privacy-respecting defaults', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.enabled).toBe(false);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.waterReminders.enabled).toBe(false);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.mealReminders.enabled).toBe(false);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.workoutReminders.enabled).toBe(false);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.weeklyReport.enabled).toBe(false);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.quietHours.enabled).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.lockScreenPrivacy).toBe(true);
  });

  it('correctly detects overnight quiet hours (22:00 - 07:00)', () => {
    const quietHours = { enabled: true, start: '22:00', end: '07:00' };

    // 23:30 is during quiet hours
    const lateNight = new Date(2026, 9, 14, 23, 30);
    expect(isWithinQuietHours(lateNight, quietHours)).toBe(true);

    // 03:15 is during quiet hours
    const earlyMorning = new Date(2026, 9, 14, 3, 15);
    expect(isWithinQuietHours(earlyMorning, quietHours)).toBe(true);

    // 06:59 is during quiet hours
    const justBeforeEnd = new Date(2026, 9, 14, 6, 59);
    expect(isWithinQuietHours(justBeforeEnd, quietHours)).toBe(true);

    // 07:00 is outside quiet hours
    const exactlyEnd = new Date(2026, 9, 14, 7, 0);
    expect(isWithinQuietHours(exactlyEnd, quietHours)).toBe(false);

    // 14:00 is outside quiet hours
    const afternoon = new Date(2026, 9, 14, 14, 0);
    expect(isWithinQuietHours(afternoon, quietHours)).toBe(false);
  });

  it('correctly detects daytime quiet hours (13:00 - 15:00)', () => {
    const quietHours = { enabled: true, start: '13:00', end: '15:00' };

    const duringNap = new Date(2026, 9, 14, 14, 10);
    expect(isWithinQuietHours(duringNap, quietHours)).toBe(true);

    const afterNap = new Date(2026, 9, 14, 15, 30);
    expect(isWithinQuietHours(afterNap, quietHours)).toBe(false);
  });

  it('ignores quiet hours calculation if disabled', () => {
    const disabledQuiet = { enabled: false, start: '22:00', end: '07:00' };
    const midnight = new Date(2026, 9, 14, 0, 30);
    expect(isWithinQuietHours(midnight, disabledQuiet)).toBe(false);
  });
});

describe('Lock Screen Privacy & Notification Payloads', () => {
  it('formats water hydration reminders with home routing', () => {
    const payload = formatNotificationPayload('water');
    expect(payload.title).toBe('Hydration Check-in');
    expect(payload.tab).toBe('home');
    expect(payload.tag).toBe('ascend-water');
  });

  it('formats meal nutrition reminders with meals routing', () => {
    const payload = formatNotificationPayload('meal', 'lunch');
    expect(payload.title).toBe('Meal Nutrition Reminder');
    expect(payload.body).toContain('lunch');
    expect(payload.tab).toBe('meals');
    expect(payload.tag).toBe('ascend-meal');
  });

  it('formats workout training reminders with workout routing', () => {
    const payload = formatNotificationPayload('workout');
    expect(payload.title).toBe("Today's Training Session");
    expect(payload.tab).toBe('workout');
    expect(payload.tag).toBe('ascend-workout');
  });

  it('formats weekly reports with progress routing and no sensitive metrics', () => {
    const payload = formatNotificationPayload('weekly_report');
    expect(payload.title).toBe('Weekly Performance Recap Ready');
    expect(payload.tab).toBe('progress');
    expect(payload.tag).toBe('ascend-report');

    // Strict lock-screen privacy check: never expose bodyweight or calorie numbers
    const sensitiveRegex = /\b(\d+\s*kg|\d+\s*lbs|\d+\s*calories|\d+\s*kcal)\b/i;
    expect(sensitiveRegex.test(payload.body)).toBe(false);
    expect(sensitiveRegex.test(payload.title)).toBe(false);
  });
});

describe('Notification Preferences Round-Trip', () => {
  it('serializes and deserializes custom preferences faithfully', () => {
    const customPrefs: NotificationPreferences = {
      enabled: true,
      waterReminders: {
        enabled: true,
        intervalHours: 3,
      },
      mealReminders: {
        enabled: true,
        breakfastTime: '07:30',
        lunchTime: '12:45',
        dinnerTime: '20:00',
      },
      workoutReminders: {
        enabled: true,
        preferredTime: '18:00',
        daysOfWeek: [1, 3, 5],
      },
      weeklyReport: {
        enabled: true,
        reportDay: 'monday',
        reportTime: '09:00',
      },
      quietHours: {
        enabled: true,
        start: '23:00',
        end: '06:30',
      },
      lockScreenPrivacy: true,
    };

    const json = JSON.stringify(customPrefs);
    const parsed = JSON.parse(json) as NotificationPreferences;

    expect(parsed.waterReminders.intervalHours).toBe(3);
    expect(parsed.workoutReminders.daysOfWeek).toEqual([1, 3, 5]);
    expect(parsed.weeklyReport.reportDay).toBe('monday');
    expect(parsed.quietHours.start).toBe('23:00');
  });
});

describe('Zoned Time & IANA Timezone Resolution', () => {
  it('correctly resolves Asia/Kolkata timezone (+05:30)', () => {
    // 2026-10-15 07:00:00 UTC -> 12:30:00 IST
    const utcDate = new Date('2026-10-15T07:00:00.000Z');
    const zoned = getZonedTime(utcDate, 'Asia/Kolkata');

    expect(zoned.year).toBe(2026);
    expect(zoned.month).toBe(10);
    expect(zoned.day).toBe(15);
    expect(zoned.hour).toBe(12);
    expect(zoned.minute).toBe(30);
    expect(zoned.dateString).toBe('2026-10-15');
    expect(zoned.timeZone).toBe('Asia/Kolkata');
  });

  it('correctly resolves UTC timezone (+00:00)', () => {
    const utcDate = new Date('2026-10-15T15:45:00.000Z');
    const zoned = getZonedTime(utcDate, 'UTC');

    expect(zoned.hour).toBe(15);
    expect(zoned.minute).toBe(45);
    expect(zoned.dateString).toBe('2026-10-15');
  });

  it('correctly resolves America/New_York daylight-saving timezone (-04:00 in October)', () => {
    // 2026-10-15 16:30:00 UTC -> 12:30:00 EDT
    const utcDate = new Date('2026-10-15T16:30:00.000Z');
    const zoned = getZonedTime(utcDate, 'America/New_York');

    expect(zoned.hour).toBe(12);
    expect(zoned.minute).toBe(30);
    expect(zoned.dateString).toBe('2026-10-15');
  });

  it('falls back safely to UTC for invalid or empty timezones without crashing', () => {
    const date = new Date('2026-10-15T14:00:00.000Z');
    const zonedInvalid = getZonedTime(date, 'Invalid/Fake_Zone');
    expect(zonedInvalid.timeZone).toBe('UTC');
    expect(zonedInvalid.hour).toBe(14);

    const zonedEmpty = getZonedTime(date, null);
    expect(zonedEmpty.timeZone).toBe('UTC');
    expect(zonedEmpty.hour).toBe(14);
  });
});

describe('Schedule Evaluation & Configured Minutes', () => {
  const basePrefs: NotificationPreferences = {
    enabled: true,
    waterReminders: { enabled: true, intervalHours: 2 },
    mealReminders: {
      enabled: true,
      breakfastTime: '08:15',
      lunchTime: '13:30',
      dinnerTime: '19:45',
    },
    workoutReminders: {
      enabled: true,
      preferredTime: '17:30',
      daysOfWeek: [4], // Thursday
    },
    weeklyReport: {
      enabled: true,
      reportDay: 'monday',
      reportTime: '09:15',
    },
    quietHours: { enabled: true, start: '22:00', end: '07:00' },
    lockScreenPrivacy: true,
  };

  it('respects exact configured meal minutes and delivery window', () => {
    // Thursday 2026-10-15 at 13:35 (5 minutes after lunch 13:30) -> Due
    const at1335 = {
      year: 2026,
      month: 10,
      day: 15,
      hour: 13,
      minute: 35,
      dayOfWeek: 4,
      dateString: '2026-10-15',
      timeZone: 'Asia/Kolkata',
    };
    const due1 = evaluateDueReminders(at1335, basePrefs, { windowMinutes: 60 });
    const lunchDue = due1.find((r) => r.type === 'meal' && r.mealType === 'lunch');
    expect(lunchDue).toBeDefined();
    expect(lunchDue?.occurrenceId).toBe('2026-10-15_meal_lunch');

    // Thursday at 13:25 (before lunch 13:30) -> NOT due
    const at1325 = { ...at1335, minute: 25 };
    const due2 = evaluateDueReminders(at1325, basePrefs, { windowMinutes: 60 });
    expect(due2.find((r) => r.type === 'meal' && r.mealType === 'lunch')).toBeUndefined();

    // Thursday at 14:40 (70 minutes after lunch 13:30, beyond 60 min window) -> NOT due
    const at1440 = { ...at1335, hour: 14, minute: 40 };
    const due3 = evaluateDueReminders(at1440, basePrefs, { windowMinutes: 60 });
    expect(due3.find((r) => r.type === 'meal' && r.mealType === 'lunch')).toBeUndefined();
  });

  it('respects configured workout time and days of week', () => {
    // Thursday (day 4) at 17:35 -> Due
    const thursday1735 = {
      year: 2026,
      month: 10,
      day: 15,
      hour: 17,
      minute: 35,
      dayOfWeek: 4,
      dateString: '2026-10-15',
      timeZone: 'UTC',
    };
    const dueThu = evaluateDueReminders(thursday1735, basePrefs);
    expect(dueThu.find((r) => r.type === 'workout')).toBeDefined();

    // Friday (day 5) at 17:35 -> NOT due (not in daysOfWeek [4])
    const friday1735 = { ...thursday1735, day: 16, dayOfWeek: 5 };
    const dueFri = evaluateDueReminders(friday1735, basePrefs);
    expect(dueFri.find((r) => r.type === 'workout')).toBeUndefined();
  });

  it('respects weekly report day and configured report time', () => {
    // Monday (day 1) at 09:20 -> Due
    const monday0920 = {
      year: 2026,
      month: 10,
      day: 19,
      hour: 9,
      minute: 20,
      dayOfWeek: 1,
      dateString: '2026-10-19',
      timeZone: 'UTC',
    };
    const dueMon = evaluateDueReminders(monday0920, basePrefs);
    expect(dueMon.find((r) => r.type === 'weekly_report')).toBeDefined();

    // Sunday (day 0) at 09:20 -> NOT due
    const sunday0920 = { ...monday0920, day: 18, dayOfWeek: 0 };
    const dueSun = evaluateDueReminders(sunday0920, basePrefs);
    expect(dueSun.find((r) => r.type === 'weekly_report')).toBeUndefined();
  });

  it('suppresses all reminders during quiet hours', () => {
    // 23:15 is inside quiet hours (22:00 - 07:00)
    const lateNight = {
      year: 2026,
      month: 10,
      day: 15,
      hour: 23,
      minute: 15,
      dayOfWeek: 4,
      dateString: '2026-10-15',
      timeZone: 'UTC',
    };
    const due = evaluateDueReminders(lateNight, basePrefs);
    expect(due).toEqual([]);
  });

  it('suppresses all reminders when master toggle enabled is false', () => {
    const disabledPrefs = { ...basePrefs, enabled: false };
    const time = {
      year: 2026,
      month: 10,
      day: 15,
      hour: 13,
      minute: 35,
      dayOfWeek: 4,
      dateString: '2026-10-15',
      timeZone: 'UTC',
    };
    expect(evaluateDueReminders(time, disabledPrefs)).toEqual([]);
  });
});

describe('Idempotency Key Generation', () => {
  it('generates consistent and collision-proof idempotency keys', () => {
    const endpointA = 'https://fcm.googleapis.com/fcm/send/token-athlete-alpha';
    const endpointB = 'https://fcm.googleapis.com/fcm/send/token-athlete-beta';
    const occurrence = '2026-10-15_meal_lunch';

    const keyA1 = generateIdempotencyKey(endpointA, occurrence);
    const keyA2 = generateIdempotencyKey(endpointA, occurrence);
    const keyB = generateIdempotencyKey(endpointB, occurrence);

    expect(keyA1).toBe(keyA2);
    expect(keyA1).not.toBe(keyB);
    expect(keyA1).toContain('2026-10-15_meal_lunch');
  });
});
