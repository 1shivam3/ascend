import { describe, it, expect } from 'vitest';
import {
  planLocalNotifications,
  resolveTrainingDays,
} from '@/lib/local-notifications';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  type WeeklySchedule,
} from '@/lib/types';

// Monday 2026-01-05, 09:00 local.
const MON_0900 = new Date(2026, 0, 5, 9, 0);

const SCHEDULE_MWF: WeeklySchedule = {
  monday: { workoutPlanId: 'plan-upper' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'plan-lower' },
  thursday: {},
  friday: { workoutPlanId: 'plan-upper' },
  saturday: {},
  sunday: {},
};

function prefsWith(partial: Partial<NotificationPreferences>): NotificationPreferences {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...partial };
}

function allEnabled(): NotificationPreferences {
  return {
    enabled: true,
    waterReminders: { enabled: true, intervalHours: 2 },
    mealReminders: { enabled: true, breakfastTime: '08:00', lunchTime: '13:00', dinnerTime: '19:30' },
    workoutReminders: { enabled: true, preferredTime: '17:30', daysOfWeek: [1, 3, 5] },
    weeklyReport: { enabled: true, reportDay: 'sunday', reportTime: '10:00' },
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
    lockScreenPrivacy: false,
  };
}

describe('planLocalNotifications', () => {
  it('returns an empty plan when the master toggle is off', () => {
    const prefs = allEnabled();
    prefs.enabled = false;
    expect(planLocalNotifications(prefs, SCHEDULE_MWF, MON_0900)).toEqual([]);
    expect(planLocalNotifications(null, SCHEDULE_MWF, MON_0900)).toEqual([]);
    expect(planLocalNotifications(undefined, SCHEDULE_MWF, MON_0900)).toEqual([]);
  });

  it('returns an empty plan when every reminder type is off', () => {
    const prefs = prefsWith({ enabled: true });
    expect(planLocalNotifications(prefs, SCHEDULE_MWF, MON_0900)).toEqual([]);
  });

  it('schedules workouts only on training days from the weekly schedule', () => {
    const prefs = prefsWith({
      enabled: true,
      workoutReminders: { enabled: true, preferredTime: '17:30', daysOfWeek: [1, 3, 5] },
    });
    const plan = planLocalNotifications(prefs, SCHEDULE_MWF, MON_0900, 14);
    // Mon/Wed/Fri within Jan 5–18 2026: 5, 7, 9, 12, 14, 16 at 17:30.
    expect(plan).toHaveLength(6);
    for (const n of plan) {
      expect(n.type).toBe('workout');
      expect([1, 3, 5]).toContain(n.at.getDay());
      expect(n.at.getHours()).toBe(17);
      expect(n.at.getMinutes()).toBe(30);
      expect(n.title).toBe("Today's Training Session");
    }
  });

  it('only schedules future occurrences', () => {
    const prefs = prefsWith({
      enabled: true,
      workoutReminders: { enabled: true, preferredTime: '17:30', daysOfWeek: [1, 3, 5] },
    });
    const evening = new Date(2026, 0, 5, 18, 0); // Monday 18:00 — today's 17:30 passed
    const plan = planLocalNotifications(prefs, SCHEDULE_MWF, evening, 14);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.every((n) => n.at.getTime() > evening.getTime())).toBe(true);
    expect(plan[0].at.getDate()).toBe(7); // next is Wednesday Jan 7
  });

  it('skips occurrences that fall inside quiet hours', () => {
    const prefs = prefsWith({
      enabled: true,
      workoutReminders: { enabled: true, preferredTime: '17:30', daysOfWeek: [1, 3, 5] },
      mealReminders: { enabled: true, breakfastTime: '08:00', lunchTime: '13:00', dinnerTime: '19:30' },
      quietHours: { enabled: true, start: '19:00', end: '07:00' },
    });
    const plan = planLocalNotifications(prefs, SCHEDULE_MWF, MON_0900, 7);
    // Dinner at 19:30 sits inside quiet hours 19:00–07:00 → never scheduled.
    expect(plan.some((n) => n.type === 'meal' && n.mealType === 'dinner')).toBe(false);
    // Breakfast (08:00) and lunch (13:00) are outside quiet hours → scheduled.
    expect(plan.some((n) => n.type === 'meal' && n.mealType === 'breakfast')).toBe(true);
    // Workout at 17:30 is outside → still scheduled.
    expect(plan.some((n) => n.type === 'workout')).toBe(true);

    const quieter = prefsWith({
      enabled: true,
      workoutReminders: { enabled: true, preferredTime: '17:30', daysOfWeek: [1, 3, 5] },
      quietHours: { enabled: true, start: '17:00', end: '19:00' },
    });
    expect(planLocalNotifications(quieter, SCHEDULE_MWF, MON_0900, 7)).toEqual([]);
  });

  it('spaces water reminders by the configured interval inside the awake window', () => {
    // Quiet hours off → legacy 08:00–22:00 awake window.
    const prefs = prefsWith({
      enabled: true,
      waterReminders: { enabled: true, intervalHours: 2 },
      quietHours: { enabled: false, start: '22:00', end: '07:00' },
    });
    const plan = planLocalNotifications(prefs, SCHEDULE_MWF, MON_0900, 2);
    const water = plan.filter((n) => n.type === 'water');
    expect(water.length).toBeGreaterThan(0);
    for (const n of water) {
      expect([8, 10, 12, 14, 16, 18, 20]).toContain(n.at.getHours());
      expect(n.at.getMinutes()).toBe(0);
    }
    // Same-day consecutive slots are exactly the interval apart.
    const jan6 = water
      .filter((n) => n.at.getDate() === 6)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    expect(jan6.map((n) => n.at.getHours())).toEqual([8, 10, 12, 14, 16, 18, 20]);
  });

  it('follows the awake window (quiet-hours complement) for night-shift users', () => {
    const prefs = prefsWith({
      enabled: true,
      waterReminders: { enabled: true, intervalHours: 2 },
      quietHours: { enabled: true, start: '08:00', end: '16:00' },
    });
    const middayQuiet = new Date(2026, 0, 5, 12, 0); // inside quiet hours
    const plan = planLocalNotifications(prefs, SCHEDULE_MWF, middayQuiet, 2);
    const water = plan.filter((n) => n.type === 'water');
    expect(water.length).toBeGreaterThan(0);
    // Nothing during the day-sleep window 08:00–16:00.
    for (const n of water) {
      expect(n.at.getHours() >= 16 || n.at.getHours() < 8).toBe(true);
    }
    // Monday evening slots exist…
    expect(
      water.some((n) => n.at.getDate() === 5 && n.at.getHours() === 16)
    ).toBe(true);
    // …and the window wraps past midnight into Tuesday's early hours.
    expect(
      water.some((n) => n.at.getDate() === 6 && n.at.getHours() === 2)
    ).toBe(true);
  });

  it('schedules the weekly report only on its configured day', () => {
    const prefs = prefsWith({
      enabled: true,
      weeklyReport: { enabled: true, reportDay: 'sunday', reportTime: '10:00' },
    });
    const plan = planLocalNotifications(prefs, SCHEDULE_MWF, MON_0900, 14);
    const reports = plan.filter((n) => n.type === 'weekly_report');
    expect(reports.map((n) => n.at.getDate())).toEqual([11, 18]); // Sundays
    for (const n of reports) {
      expect(n.at.getDay()).toBe(0);
      expect(n.at.getHours()).toBe(10);
    }
  });

  it('produces deterministic, unique, positive 31-bit ids', () => {
    const prefs = allEnabled();
    const a = planLocalNotifications(prefs, SCHEDULE_MWF, MON_0900, 14);
    const b = planLocalNotifications(prefs, SCHEDULE_MWF, MON_0900, 14);
    expect(a.map((n) => n.id)).toEqual(b.map((n) => n.id));
    expect(a.map((n) => n.at.getTime())).toEqual(b.map((n) => n.at.getTime()));

    const ids = a.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
      expect(id).toBeLessThan(2 ** 31);
    }
    // Plan is sorted by fire time.
    const times = a.map((n) => n.at.getTime());
    expect(times).toEqual([...times].sort((x, y) => x - y));
  });

  it('plans meals every day at the configured times', () => {
    const prefs = prefsWith({
      enabled: true,
      mealReminders: { enabled: true, breakfastTime: '08:00', lunchTime: '13:00', dinnerTime: '19:30' },
    });
    const early = new Date(2026, 0, 5, 7, 0); // before breakfast
    const plan = planLocalNotifications(prefs, SCHEDULE_MWF, early, 3);
    expect(plan).toHaveLength(9);
    expect(plan.filter((n) => n.mealType === 'breakfast')).toHaveLength(3);
    expect(plan.find((n) => n.mealType === 'dinner')?.body).toContain('dinner');
  });
});

describe('resolveTrainingDays', () => {
  it('derives days from the weekly schedule when not customized', () => {
    const prefs = allEnabled();
    expect(resolveTrainingDays(prefs, SCHEDULE_MWF)).toEqual([1, 3, 5]);
  });

  it('lets hand-picked days win over the schedule', () => {
    const prefs = prefsWith({
      enabled: true,
      workoutReminders: {
        enabled: true,
        preferredTime: '17:30',
        daysOfWeek: [2],
        daysCustomized: true,
      },
    });
    expect(resolveTrainingDays(prefs, SCHEDULE_MWF)).toEqual([2]);

    const plan = planLocalNotifications(prefs, SCHEDULE_MWF, MON_0900, 14);
    const workouts = plan.filter((n) => n.type === 'workout');
    expect(workouts.map((n) => n.at.getDate())).toEqual([6, 13]); // Tuesdays
  });

  it('falls back to stored preference days when the schedule has no plans', () => {
    const empty: WeeklySchedule = {
      monday: {},
      tuesday: {},
      wednesday: {},
      thursday: {},
      friday: {},
      saturday: {},
      sunday: {},
    };
    const prefs = allEnabled();
    expect(resolveTrainingDays(prefs, empty)).toEqual([1, 3, 5]);
    expect(resolveTrainingDays(prefs, null)).toEqual([1, 3, 5]);
  });
});
