/**
 * Round-2 persona regression tests — time, reminders, age gates.
 *
 * KABIR-1 (water window follows the awake hours), KABIR-6 (weekly
 * report on any weekday), VIKRAM-1 (reminder days sync from the
 * schedule), VIKRAM-3 (session-length estimator), VIKRAM-4 (missed
 * sessions carry their plan), ARYAN-4 (no creatine objective for minors).
 */
import { describe, it, expect } from 'vitest';
import { evaluateDueReminders, type ZonedTime } from '../src/lib/notifications';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  type WeeklySchedule,
} from '../src/lib/types';
import { syncWorkoutReminderDays } from '../src/lib/store';
import { estimateSessionMinutes } from '../src/lib/workout-engine';
import { detectMissedSessions, generateCheckIn } from '../src/lib/coach-engine';
import { getDailyObjectives } from '../src/lib/habits';

const zoned = (hour: number, minute: number, dayOfWeek = 4): ZonedTime => ({
  year: 2026,
  month: 10,
  day: 15,
  hour,
  minute,
  dayOfWeek,
  dateString: '2026-10-15',
  timeZone: 'Asia/Kolkata',
});

const prefs = (over: Partial<NotificationPreferences>): NotificationPreferences => ({
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  enabled: true,
  ...over,
});

describe('water reminders follow the awake window (KABIR-1)', () => {
  const kabirPrefs = prefs({
    waterReminders: { enabled: true, intervalHours: 2 },
    // Night shift: sleeps 08:00–16:00.
    quietHours: { enabled: true, start: '08:00', end: '16:00' },
  });

  it('reminds after midnight while he is awake at work (old code: never)', () => {
    // Slots anchor at wake time 16:00 every 2h: 16,18,20,22,00,02,...
    const due = evaluateDueReminders(zoned(0, 30), kabirPrefs, { windowMinutes: 60 });
    expect(due.some((d) => d.type === 'water')).toBe(true);
    const due2 = evaluateDueReminders(zoned(2, 30), kabirPrefs, { windowMinutes: 60 });
    expect(due2.some((d) => d.type === 'water')).toBe(true);
  });

  it('stays silent during his daytime sleep', () => {
    const due = evaluateDueReminders(zoned(10, 0), kabirPrefs, { windowMinutes: 60 });
    expect(due).toHaveLength(0);
  });

  it('anchors slots at wake time (16:00), so 17:05 is not a slot but 18:05 is', () => {
    expect(
      evaluateDueReminders(zoned(17, 5), kabirPrefs, { windowMinutes: 60 }).some(
        (d) => d.type === 'water'
      )
    ).toBe(false);
    expect(
      evaluateDueReminders(zoned(18, 5), kabirPrefs, { windowMinutes: 60 }).some(
        (d) => d.type === 'water'
      )
    ).toBe(true);
  });

  it('legacy behaviour holds when quiet hours are disabled (08:00 anchor)', () => {
    const legacy = prefs({
      waterReminders: { enabled: true, intervalHours: 2 },
      quietHours: { enabled: false, start: '22:00', end: '07:00' },
    });
    expect(
      evaluateDueReminders(zoned(8, 15), legacy, { windowMinutes: 60 }).some(
        (d) => d.type === 'water'
      )
    ).toBe(true);
    expect(
      evaluateDueReminders(zoned(3, 15), legacy, { windowMinutes: 60 }).some(
        (d) => d.type === 'water'
      )
    ).toBe(false);
  });
});

describe('weekly report can land on any weekday (KABIR-6)', () => {
  it('fires on a Wednesday when configured', () => {
    const p = prefs({
      weeklyReport: { enabled: true, reportDay: 'wednesday', reportTime: '10:00' },
      quietHours: { enabled: false, start: '22:00', end: '07:00' },
    });
    const due = evaluateDueReminders(zoned(10, 10, 3), p, { windowMinutes: 60 });
    expect(due.some((d) => d.type === 'weekly_report')).toBe(true);
    const thursday = evaluateDueReminders(zoned(10, 10, 4), p, { windowMinutes: 60 });
    expect(thursday.some((d) => d.type === 'weekly_report')).toBe(false);
  });
});

describe('reminder days sync from the schedule (VIKRAM-1)', () => {
  const schedule: WeeklySchedule = {
    monday: { workoutPlanId: 'p1' },
    tuesday: { workoutPlanId: 'rest' },
    wednesday: { workoutPlanId: 'p2' },
    thursday: { workoutPlanId: 'rest' },
    friday: { workoutPlanId: 'p1' },
    saturday: { workoutPlanId: 'rest' },
    sunday: { workoutPlanId: 'rest' },
  } as WeeklySchedule;

  it('derives Mon/Wed/Fri from training days', () => {
    const next = syncWorkoutReminderDays(schedule, prefs({}));
    expect(next.workoutReminders.daysOfWeek).toEqual([1, 3, 5]);
  });

  it('never overrides hand-picked days', () => {
    const custom = prefs({
      workoutReminders: { enabled: true, preferredTime: '07:00', daysOfWeek: [2], daysCustomized: true },
    });
    expect(syncWorkoutReminderDays(schedule, custom)).toBe(custom);
  });

  it('keeps existing days when the schedule has no training days', () => {
    const restWeek = Object.fromEntries(
      Object.keys(schedule).map((d) => [d, { workoutPlanId: 'rest' }])
    ) as unknown as WeeklySchedule;
    const before = prefs({});
    expect(syncWorkoutReminderDays(restWeek, before).workoutReminders.daysOfWeek).toEqual(
      before.workoutReminders.daysOfWeek
    );
  });
});

describe('session length estimator (VIKRAM-3)', () => {
  it('a heavy leg day is longer than exercises×8 claimed', () => {
    const legDay = {
      exercises: [
        { name: 'Back Squat', targetSets: 5, targetReps: 5 },
        { name: 'Romanian Deadlift', targetSets: 4, targetReps: 8 },
        { name: 'Leg Press', targetSets: 3, targetReps: 10 },
        { name: 'Walking Lunge', targetSets: 3, targetReps: 12 },
      ],
    } as any;
    // Old formula claimed 4 exercises × 8 = 32 min; the set/rest math
    // lands near 55 for this session.
    expect(estimateSessionMinutes(legDay)).toBeGreaterThan(50);
  });
  it('a short core session is shorter than a full accessory day', () => {
    const core = {
      exercises: [
        { name: 'Plank', targetSets: 3, targetReps: 1 },
        { name: 'Dead Bug', targetSets: 3, targetReps: 10 },
      ],
    } as any;
    const accessories = {
      exercises: Array.from({ length: 6 }, (_, i) => ({
        name: `Curl Variant ${i}`,
        targetSets: 3,
        targetReps: 12,
      })),
    } as any;
    expect(estimateSessionMinutes(core)).toBeLessThan(estimateSessionMinutes(accessories));
  });
  it('empty plans fall back to 45', () => {
    expect(estimateSessionMinutes(null)).toBe(45);
    expect(estimateSessionMinutes({ exercises: [] })).toBe(45);
  });
});

describe('missed sessions carry their plan (VIKRAM-4)', () => {
  it('detectMissedSessions passes planId through and the copy offers the action', () => {
    // Week of Mon 2026-10-12 .. Sun 2026-10-18; "today" is later in the
    // week in real time, so Monday's session counts as missed.
    const missed = detectMissedSessions(
      [{ weekday: 0, name: 'Upper A', planId: 'plan_upper' }],
      [],
      { start: '2026-10-12', end: '2026-10-18' }
    );
    expect(missed.length).toBeGreaterThan(0);
    expect(missed[0].planId).toBe('plan_upper');
    expect(generateCheckIn(missed)).toContain('Do it today');
  });
});

describe('creatine objective is adults-only (ARYAN-4)', () => {
  const base = {
    dateStr: '2026-10-15',
    dayType: 'training' as const,
    workouts: [],
    waterMl: 2500,
    waterTargetMl: 2500,
    proteinG: 150,
    proteinTargetG: 140,
  };
  it('a 16-year-old is never scored on creatine', () => {
    const summary = getDailyObjectives({ ...base, ageYears: 16 });
    expect(summary.objectives.some((o) => o.id === 'creatine')).toBe(false);
  });
  it('an adult with tracking enabled is scored', () => {
    const summary = getDailyObjectives({ ...base, ageYears: 25, creatineEnabled: true });
    expect(summary.objectives.some((o) => o.id === 'creatine')).toBe(true);
  });
  it('disabled tracking removes the objective for adults too', () => {
    const summary = getDailyObjectives({ ...base, ageYears: 25, creatineEnabled: false });
    expect(summary.objectives.some((o) => o.id === 'creatine')).toBe(false);
  });
});
