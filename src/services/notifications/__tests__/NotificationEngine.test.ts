import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationEngine } from '../NotificationEngine';
import { LocalNotificationDriver } from '../NotificationDriver';
import { ACHIEVEMENTS_CONFIG } from '../../../config/achievements.config';
import { WorkoutSession } from '../../../types/domain.types';

describe('Notification Architecture & Anti-Spam Guardrails', () => {
  const userId = 'user-notif-1';
  let localDriver: LocalNotificationDriver;

  beforeEach(() => {
    localDriver = new LocalNotificationDriver();
    NotificationEngine.setDriver(localDriver);
    NotificationEngine.resetRateLimits();
  });

  it('schedules a valid workout reminder during daytime active hours', async () => {
    const daytime = new Date();
    daytime.setHours(17, 30, 0, 0); // 5:30 PM

    const id = await NotificationEngine.scheduleWorkoutReminder(
      userId,
      daytime,
      'Heavy Upper Overload'
    );

    expect(id).not.toBeNull();
    const scheduled = await localDriver.getScheduled();
    expect(scheduled.length).toBe(1);
    expect(scheduled[0].payload.title).toContain('SQUAD PROTOCOL DEPLOYMENT');
    expect(scheduled[0].payload.category).toBe('WORKOUT');
  });

  it('suppresses non-urgent reminders during quiet hours (10:00 PM - 7:00 AM)', async () => {
    const lateNight = new Date();
    lateNight.setHours(23, 30, 0, 0); // 11:30 PM (Quiet hours)

    const id = await NotificationEngine.scheduleWorkoutReminder(
      userId,
      lateNight,
      'Midnight Session'
    );

    expect(id).toBeNull();
    const scheduled = await localDriver.getScheduled();
    expect(scheduled.length).toBe(0);
  });

  it('enforces frequency capping: rejects duplicate category alerts within 24 hours', async () => {
    const day1 = new Date();
    day1.setHours(14, 0, 0, 0);

    const firstCall = await NotificationEngine.scheduleWorkoutReminder(userId, day1, 'Session 1');
    expect(firstCall).not.toBeNull();

    // Second call within 24 hours should be blocked by anti-spam frequency capping
    const secondCall = await NotificationEngine.scheduleWorkoutReminder(userId, day1, 'Session 2');
    expect(secondCall).toBeNull();

    const scheduled = await localDriver.getScheduled();
    expect(scheduled.length).toBe(1);
  });

  it('strictly respects master user toggle pushNotificationsEnabled = false', async () => {
    const daytime = new Date();
    daytime.setHours(12, 0, 0, 0);

    const id = await NotificationEngine.scheduleWorkoutReminder(
      userId,
      daytime,
      'Disabled Reminder',
      { pushNotificationsEnabled: false }
    );

    expect(id).toBeNull();
    const scheduled = await localDriver.getScheduled();
    expect(scheduled.length).toBe(0);
  });

  it('schedules streak warning alerts before midnight', async () => {
    const eveningTime = new Date();
    eveningTime.setHours(20, 0, 0, 0); // 8:00 PM

    const id = await NotificationEngine.scheduleStreakWarning(userId, 14, eveningTime);
    expect(id).not.toBeNull();

    const scheduled = await localDriver.getScheduled();
    const streakItem = scheduled.find(s => s.payload.category === 'STREAK');
    expect(streakItem).toBeDefined();
    expect(streakItem?.payload.body).toContain('14-day streak');
  });

  it('schedules recovery reminders after high-yield or failure sessions', async () => {
    const heavySession: WorkoutSession = {
      id: 'w-heavy-1',
      userId,
      title: 'Heavy Deadlift & Squat',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationSeconds: 3600,
      totalVolumeKg: 8500, // > 3,000 kg threshold
      totalReps: 40,
      totalSets: 10,
      status: 'COMPLETED',
      xpEarned: 350,
      exercises: [],
    };

    const id = await NotificationEngine.scheduleRecoveryReminder(userId, heavySession);
    expect(id).not.toBeNull();

    const scheduled = await localDriver.getScheduled();
    const recItem = scheduled.find(s => s.payload.category === 'RECOVERY');
    expect(recItem).toBeDefined();
    expect(recItem?.payload.title).toContain('NEURAL & MUSCULAR RECOVERY');
  });

  it('dispatches immediate celebratory notifications for achievement unlocks', async () => {
    const achievement = ACHIEVEMENTS_CONFIG.find(a => a.code === 'UNSTOPPABLE')!;

    const id = await NotificationEngine.notifyAchievementUnlocked(userId, achievement);
    expect(id).not.toBeNull();

    const sent = localDriver.getSent();
    expect(sent.length).toBe(1);
    expect(sent[0].title).toContain('UNSTOPPABLE');
    expect(sent[0].body).toContain('350 XP');
  });
});
