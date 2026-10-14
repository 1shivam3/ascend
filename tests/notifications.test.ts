import { describe, it, expect } from 'vitest';
import { isWithinQuietHours, formatNotificationPayload } from '@/lib/notifications';
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
