import {
  NotificationDriver,
  NotificationPayload,
  defaultNotificationDriver,
} from './NotificationDriver';
import { AchievementConfig } from '../../config/achievements.config';
import { WorkoutSession } from '../../types/domain.types';

export interface NotificationSettings {
  pushNotificationsEnabled: boolean;
  quietHoursStartHour?: number; // default 22 (10 PM)
  quietHoursEndHour?: number;   // default 7 (7 AM)
}

export class NotificationEngine {
  private static driver: NotificationDriver = defaultNotificationDriver;

  // Track last sent timestamp per user:category
  private static lastSentMap = new Map<string, number>();
  private static readonly FREQUENCY_CAP_MS = 24 * 60 * 60 * 1000; // 24 hours

  static setDriver(customDriver: NotificationDriver): void {
    this.driver = customDriver;
  }

  static getDriver(): NotificationDriver {
    return this.driver;
  }

  static resetRateLimits(): void {
    this.lastSentMap.clear();
  }

  /**
   * Evaluates whether a notification is permitted under anti-spam constraints:
   * 1. Master toggle enabled
   * 2. Frequency capping (max 1 per category per 24 hours)
   * 3. Quiet hours check
   */
  private static isPermitted(
    userId: string,
    category: NotificationPayload['category'],
    scheduledTime: Date,
    settings: NotificationSettings,
    isImmediate: boolean = false
  ): boolean {
    // 1. Master toggle
    if (!settings.pushNotificationsEnabled) {
      return false;
    }

    // 2. Frequency capping (Achievements are exempt from 24h cap if earned legitimately)
    if (category !== 'ACHIEVEMENT') {
      const key = `${userId}:${category}`;
      const lastSent = this.lastSentMap.get(key) || 0;
      const now = Date.now();
      if (now - lastSent < this.FREQUENCY_CAP_MS) {
        return false;
      }
    }

    // 3. Quiet hours check (22:00 - 07:00)
    const hour = scheduledTime.getHours();
    const quietStart = settings.quietHoursStartHour ?? 22;
    const quietEnd = settings.quietHoursEndHour ?? 7;

    const isQuietHour = hour >= quietStart || hour < quietEnd;
    if (isQuietHour && !isImmediate) {
      return false;
    }

    return true;
  }

  private static recordSent(userId: string, category: NotificationPayload['category']): void {
    const key = `${userId}:${category}`;
    this.lastSentMap.set(key, Date.now());
  }

  /**
   * Schedules a scheduled session reminder.
   */
  static async scheduleWorkoutReminder(
    userId: string,
    targetTime: Date,
    sessionTitle: string = 'Command Training Protocol',
    settings: NotificationSettings = { pushNotificationsEnabled: true }
  ): Promise<string | null> {
    if (!this.isPermitted(userId, 'WORKOUT', targetTime, settings)) {
      return null;
    }

    const payload: NotificationPayload = {
      id: `workout-reminder-${userId}`,
      title: '⚔️ SQUAD PROTOCOL DEPLOYMENT',
      body: `Your scheduled session '${sessionTitle}' is primed. Deploy now to maintain streak momentum.`,
      category: 'WORKOUT',
      data: { sessionTitle },
    };

    const id = await this.driver.scheduleNotification(payload, targetTime);
    this.recordSent(userId, 'WORKOUT');
    return id;
  }

  /**
   * Schedules a daily quest reminder if active directives are pending.
   */
  static async scheduleQuestReminder(
    userId: string,
    pendingQuestsCount: number,
    targetTime: Date,
    settings: NotificationSettings = { pushNotificationsEnabled: true }
  ): Promise<string | null> {
    if (pendingQuestsCount <= 0) return null;
    if (!this.isPermitted(userId, 'QUEST', targetTime, settings)) {
      return null;
    }

    const payload: NotificationPayload = {
      id: `quest-reminder-${userId}`,
      title: '📜 DAILY DIRECTIVES EXPIRING',
      body: `You have ${pendingQuestsCount} tactical directives pending before the midnight protocol reset.`,
      category: 'QUEST',
      data: { pendingQuestsCount },
    };

    const id = await this.driver.scheduleNotification(payload, targetTime);
    this.recordSent(userId, 'QUEST');
    return id;
  }

  /**
   * Alerts the athlete before midnight if streak is at risk.
   */
  static async scheduleStreakWarning(
    userId: string,
    currentStreak: number,
    targetTime: Date,
    settings: NotificationSettings = { pushNotificationsEnabled: true }
  ): Promise<string | null> {
    if (currentStreak <= 0) return null;
    if (!this.isPermitted(userId, 'STREAK', targetTime, settings)) {
      return null;
    }

    const payload: NotificationPayload = {
      id: `streak-warning-${userId}`,
      title: '🔥 STREAK AT RISK',
      body: `Your ${currentStreak}-day streak will expire at midnight. Log a training session to preserve your momentum.`,
      category: 'STREAK',
      data: { currentStreak },
    };

    const id = await this.driver.scheduleNotification(payload, targetTime);
    this.recordSent(userId, 'STREAK');
    return id;
  }

  /**
   * Dispatches immediate notification upon achievement unlock.
   */
  static async notifyAchievementUnlocked(
    userId: string,
    achievement: AchievementConfig,
    settings: NotificationSettings = { pushNotificationsEnabled: true }
  ): Promise<string | null> {
    if (!settings.pushNotificationsEnabled) return null;

    const payload: NotificationPayload = {
      id: `ach-unlocked-${userId}-${achievement.id}`,
      title: `🏆 FEAT CONQUERED: ${achievement.title.toUpperCase()}`,
      body: `${achievement.description} (+${achievement.xpReward} XP minted)`,
      category: 'ACHIEVEMENT',
      data: { achievementId: achievement.id, xpReward: achievement.xpReward },
    };

    const id = await this.driver.sendImmediateNotification(payload);
    this.recordSent(userId, 'ACHIEVEMENT');
    return id;
  }

  /**
   * Schedules a recovery reminder 24-48h post heavy workout.
   */
  static async scheduleRecoveryReminder(
    userId: string,
    workout: WorkoutSession,
    settings: NotificationSettings = { pushNotificationsEnabled: true }
  ): Promise<string | null> {
    // Check if session was high tonnage (> 3,000 kg) or had failure sets
    const hasFailureSets = workout.exercises?.some(e => e.sets?.some(s => s.setType === 'FAILURE'));
    const isHeavy = workout.totalVolumeKg >= 3000 || hasFailureSets;

    if (!isHeavy) return null;

    const triggerDate = new Date();
    triggerDate.setDate(triggerDate.getDate() + 1); // 24h later
    triggerDate.setHours(10, 0, 0, 0); // 10:00 AM next day

    if (!this.isPermitted(userId, 'RECOVERY', triggerDate, settings)) {
      return null;
    }

    const payload: NotificationPayload = {
      id: `recovery-reminder-${userId}`,
      title: '🛡️ NEURAL & MUSCULAR RECOVERY',
      body: `Following your high-yield session, prioritize hydration, protein synthesis, and adequate sleep to maximize supercompensation.`,
      category: 'RECOVERY',
      data: { workoutId: workout.id },
    };

    const id = await this.driver.scheduleNotification(payload, triggerDate);
    this.recordSent(userId, 'RECOVERY');
    return id;
  }
}
