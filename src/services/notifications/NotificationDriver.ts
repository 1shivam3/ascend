export interface NotificationPayload {
  id: string;
  title: string;
  body: string;
  category: 'WORKOUT' | 'QUEST' | 'STREAK' | 'ACHIEVEMENT' | 'RECOVERY';
  data?: Record<string, any>;
}

export interface ScheduledNotificationItem {
  id: string;
  payload: NotificationPayload;
  triggerDate: Date;
  dispatched: boolean;
}

export interface NotificationDriver {
  scheduleNotification(payload: NotificationPayload, triggerDate: Date): Promise<string>;
  sendImmediateNotification(payload: NotificationPayload): Promise<string>;
  cancelNotification(notificationId: string): Promise<void>;
  cancelAllByCategory(category: string): Promise<void>;
  getScheduled(): Promise<ScheduledNotificationItem[]>;
}

/**
 * Robust in-memory driver for testing, local execution, and development.
 * Guarantees zero runtime crashes if Expo Push credentials are absent.
 */
export class LocalNotificationDriver implements NotificationDriver {
  private scheduled: ScheduledNotificationItem[] = [];
  private sent: NotificationPayload[] = [];

  async scheduleNotification(payload: NotificationPayload, triggerDate: Date): Promise<string> {
    const item: ScheduledNotificationItem = {
      id: payload.id || `notif-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      payload,
      triggerDate,
      dispatched: false,
    };
    this.scheduled.push(item);
    return item.id;
  }

  async sendImmediateNotification(payload: NotificationPayload): Promise<string> {
    this.sent.push(payload);
    return payload.id || `notif-${Date.now()}`;
  }

  async cancelNotification(notificationId: string): Promise<void> {
    this.scheduled = this.scheduled.filter(s => s.id !== notificationId);
  }

  async cancelAllByCategory(category: string): Promise<void> {
    this.scheduled = this.scheduled.filter(s => s.payload.category !== category);
  }

  async getScheduled(): Promise<ScheduledNotificationItem[]> {
    return [...this.scheduled];
  }

  getSent(): NotificationPayload[] {
    return [...this.sent];
  }

  clear(): void {
    this.scheduled = [];
    this.sent = [];
  }
}

export const defaultNotificationDriver = new LocalNotificationDriver();
