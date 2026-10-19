'use client';

/**
 * Client-side reminder scheduler.
 *
 * The server push pipeline (VAPID + QStash) handles notifications when the app
 * is closed. This scheduler covers the common case: the app is open (or was
 * recently opened) and a reminder time arrives. It needs no server, no VAPID
 * keys, and no cron — just notification permission.
 *
 * Runs a lightweight check every 30s. Fired reminders are recorded in
 * localStorage (per reminder key + date) so they never double-fire.
 */

import { NotificationPreferences } from './types';

const FIRED_KEY = 'ascend_fired_reminders_v1';
const CHECK_INTERVAL_MS = 30_000;

function getFired(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}');
  } catch {
    return {};
  }
}

function markFired(key: string) {
  try {
    const fired = getFired();
    fired[key] = new Date().toISOString();
    // Prune entries older than 7 days
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const k of Object.keys(fired)) {
      if (new Date(fired[k]).getTime() < cutoff) delete fired[k];
    }
    localStorage.setItem(FIRED_KEY, JSON.stringify(fired));
  } catch {}
}

function alreadyFired(key: string, dateStr: string): boolean {
  const fired = getFired();
  return fired[`${key}:${dateStr}`] !== undefined;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function inQuietHours(prefs: NotificationPreferences, nowMinutes: number): boolean {
  if (!prefs.quietHours?.enabled) return false;
  const start = timeToMinutes(prefs.quietHours.start);
  const end = timeToMinutes(prefs.quietHours.end);
  if (start <= end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end; // overnight
}

async function showLocalNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: '/icon.svg',
        badge: '/icon.svg',
        tag: `ascend-reminder-${Date.now()}`,
      } as NotificationOptions);
    } else {
      new Notification(title, { body });
    }
  } catch {}
}

function getPrefs(): NotificationPreferences | null {
  try {
    const raw = localStorage.getItem('ascend_store');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // zustand persist wraps state: { state: {...}, version }
    const state = parsed.state || parsed;
    return state.notificationPreferences || null;
  } catch {
    return null;
  }
}

function checkAndFire() {
  const prefs = getPrefs();
  if (!prefs?.enabled) return;

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const dayOfWeek = now.getDay();

  if (inQuietHours(prefs, nowMinutes)) return;

  const fire = (key: string, title: string, body: string) => {
    const fullKey = `${key}:${dateStr}`;
    if (alreadyFired(key, dateStr)) return;
    markFired(fullKey);
    showLocalNotification(title, body);
  };

  // Meal reminders — fire within a 5-minute window of the set time
  if (prefs.mealReminders?.enabled) {
    const meals: [string, string, string][] = [
      ['breakfast', prefs.mealReminders.breakfastTime, 'Time for breakfast! Log your meal to stay on track.'],
      ['lunch', prefs.mealReminders.lunchTime, 'Lunch time! Don\'t forget to log your meal.'],
      ['dinner', prefs.mealReminders.dinnerTime, 'Dinner time! Log your meal to close out the day.'],
    ];
    for (const [key, time, body] of meals) {
      if (!time) continue;
      const target = timeToMinutes(time);
      if (Math.abs(nowMinutes - target) <= 2) {
        fire(`meal-${key}`, 'ASCEND Reminder', body);
      }
    }
  }

  // Workout reminders — fire within 5 min of preferred time on selected days
  if (prefs.workoutReminders?.enabled) {
    const days = prefs.workoutReminders.daysOfWeek || [];
    if (days.includes(dayOfWeek) && prefs.workoutReminders.preferredTime) {
      const target = timeToMinutes(prefs.workoutReminders.preferredTime);
      if (Math.abs(nowMinutes - target) <= 2) {
        fire('workout', 'ASCEND Reminder', 'Your scheduled workout is ready. Time to train!');
      }
    }
  }

  // Water reminders — interval-based; track last fired time
  if (prefs.waterReminders?.enabled) {
    const intervalMin = (prefs.waterReminders.intervalHours || 2) * 60;
    const fired = getFired();
    const lastWater = fired['water-last'];
    const lastTime = lastWater ? new Date(lastWater).getTime() : 0;
    if (Date.now() - lastTime >= intervalMin * 60 * 1000) {
      // Only during daytime hours (8am-10pm) to avoid night spam
      if (now.getHours() >= 8 && now.getHours() < 22) {
        try {
          const f = getFired();
          f['water-last'] = new Date().toISOString();
          localStorage.setItem(FIRED_KEY, JSON.stringify(f));
        } catch {}
        showLocalNotification('ASCEND Reminder', 'Time to hydrate! Log a glass of water.');
      }
    }
  }

  // Weekly report
  if (prefs.weeklyReport?.enabled) {
    const dayMap: Record<string, number> = { sunday: 0, monday: 1, saturday: 6 };
    const reportDay = dayMap[prefs.weeklyReport.reportDay] ?? 1;
    if (dayOfWeek === reportDay && prefs.weeklyReport.reportTime) {
      const target = timeToMinutes(prefs.weeklyReport.reportTime);
      if (Math.abs(nowMinutes - target) <= 2) {
        fire('weekly-report', 'ASCEND Weekly Report', 'Your weekly training recap is ready. Check your progress!');
      }
    }
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

/** Start the client-side reminder scheduler. Safe to call multiple times. */
export function startLocalReminderScheduler() {
  if (typeof window === 'undefined') return;
  if (intervalId) return;
  // Check shortly after start, then every 30s
  setTimeout(checkAndFire, 5000);
  intervalId = setInterval(checkAndFire, CHECK_INTERVAL_MS);
}

/** Show a test notification immediately. Used by the "Send test" button. */
export async function sendTestNotification(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;
  }
  await showLocalNotification(
    'ASCEND Test',
    'Notifications are working! You\'ll get reminders at your scheduled times.'
  );
  return true;
}
