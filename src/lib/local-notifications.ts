/**
 * local-notifications.ts — native (Capacitor) local notification scheduler.
 *
 * Web push (VAPID) does not deliver inside the Android WebView when the app
 * is closed, so on native platforms reminders are scheduled on-device with
 * @capacitor/local-notifications. The planning rules mirror the server
 * dispatcher (src/lib/notifications.ts → evaluateDueReminders): same
 * preference model, same quiet-hours semantics, same notification copy.
 * That module is server-only (node `crypto`), so the small pieces needed
 * here are replicated rather than imported.
 *
 * On web every exported runtime function is a no-op — browser behavior
 * (web push) is completely untouched.
 */

import { Capacitor } from '@capacitor/core';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type DayOfWeek,
  type NotificationPreferences,
  type WeeklySchedule,
} from './types';

export type LocalReminderType = 'water' | 'meal' | 'workout' | 'weekly_report';
export type LocalMealType = 'breakfast' | 'lunch' | 'dinner';

export interface PlannedLocalNotification {
  /** Deterministic 31-bit id — re-planning the same inputs yields the same ids. */
  id: number;
  type: LocalReminderType;
  mealType?: LocalMealType;
  title: string;
  body: string;
  at: Date;
}

// ─── Copy (kept in sync with formatNotificationPayload in notifications.ts) ──

function payloadFor(
  type: LocalReminderType,
  mealType?: LocalMealType
): { title: string; body: string } {
  switch (type) {
    case 'water':
      return {
        title: 'Hydration Check-in',
        body: 'Time to drink a glass of water and hit your hydration target.',
      };
    case 'meal':
      return {
        title: 'Meal Nutrition Reminder',
        body: mealType
          ? `Time for ${mealType}. Log your meal to stay on track.`
          : 'Fuel your recovery. Log your meal to stay on track.',
      };
    case 'workout':
      return {
        title: "Today's Training Session",
        body: 'Your scheduled workout is ready. Tap to view your exercise split.',
      };
    case 'weekly_report':
      return {
        title: 'Weekly Performance Recap Ready',
        body: 'Review your training consistency and lift progress from this past week.',
      };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TIME_RE = /^\d{1,2}:\d{2}$/;

/** "HH:MM" → minutes since midnight, or null when malformed. */
function parseTimeToMinutes(value: string | undefined | null): number | null {
  if (!value || !TIME_RE.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m) || h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Same semantics as isWithinQuietHours in notifications.ts, evaluated for a
 * time-of-day instead of the current moment. Supports overnight ranges
 * (e.g. 22:00 → 07:00).
 */
function isTimeWithinQuietHours(
  hour: number,
  minute: number,
  quietHours: NotificationPreferences['quietHours']
): boolean {
  if (!quietHours || !quietHours.enabled) return false;
  const current = hour * 60 + minute;
  const start = parseTimeToMinutes(quietHours.start || '22:00') ?? 22 * 60;
  const end = parseTimeToMinutes(quietHours.end || '07:00') ?? 7 * 60;
  if (start <= end) return current >= start && current < end;
  return current >= start || current < end;
}

/** FNV-1a hash → stable positive 31-bit notification id. */
function notificationIdFor(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const id = (h >>> 0) % 2_000_000_000;
  return id === 0 ? 1 : id;
}

function dateKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Local datetime on `day` at `minuteOfDay` minutes past local midnight. */
function atMinuteOfDay(day: Date, minuteOfDay: number): Date {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  d.setMinutes(minuteOfDay);
  return d;
}

function addDays(day: Date, count: number): Date {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  d.setDate(d.getDate() + count);
  return d;
}

// Index = JS day-of-week (0 = Sunday … 6 = Saturday).
const JS_DAY_TO_NAME: DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const REPORT_DAY_TO_JS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Effective workout-reminder days (JS day numbers). Mirrors the store's
 * syncWorkoutReminderDays contract: hand-picked days (daysCustomized) win;
 * otherwise days derive from the weekly schedule (a day counts when it has
 * a workout plan assigned); if the schedule yields nothing, the stored
 * preference days are kept.
 */
export function resolveTrainingDays(
  prefs: NotificationPreferences,
  weeklySchedule?: WeeklySchedule | null
): number[] {
  const stored = prefs?.workoutReminders?.daysOfWeek;
  if (prefs?.workoutReminders?.daysCustomized) {
    return Array.isArray(stored) ? [...stored] : [];
  }
  if (weeklySchedule) {
    const derived: number[] = [];
    for (let jsDay = 0; jsDay < 7; jsDay++) {
      const id = weeklySchedule[JS_DAY_TO_NAME[jsDay]]?.workoutPlanId;
      if (id && id !== 'rest') derived.push(jsDay);
    }
    if (derived.length > 0) return derived;
  }
  return Array.isArray(stored) ? [...stored] : [];
}

// ─── Pure planner ────────────────────────────────────────────────────────────

/**
 * Plans every reminder occurrence for the next `horizonDays` days.
 *
 * Rules (mirroring the server dispatcher):
 * - Master toggle off → empty plan.
 * - Workout reminders fire on training days (see resolveTrainingDays).
 * - Meal reminders fire daily at the three configured meal times.
 * - Water reminders fire every `intervalHours` across the awake window.
 *   With quiet hours on, the awake window is their complement (so a
 *   night-shift worker is reminded during *their* day); otherwise the
 *   legacy 08:00–22:00 window applies.
 * - Weekly report fires on its configured day/time.
 * - Occurrences inside quiet hours are skipped entirely — the dispatcher
 *   never delivers during quiet hours, so scheduling them would be a lie.
 * - Only future occurrences (`at > now`) are returned, sorted by time.
 */
export function planLocalNotifications(
  prefs: NotificationPreferences | null | undefined,
  weeklySchedule: WeeklySchedule | null | undefined,
  now: Date,
  horizonDays = 14
): PlannedLocalNotification[] {
  if (!prefs || !prefs.enabled) return [];

  const planned: PlannedLocalNotification[] = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const push = (
    type: LocalReminderType,
    at: Date,
    slotKey: string,
    mealType?: LocalMealType
  ) => {
    if (at.getTime() <= now.getTime()) return;
    if (isTimeWithinQuietHours(at.getHours(), at.getMinutes(), prefs.quietHours)) return;
    const { title, body } = payloadFor(type, mealType);
    planned.push({
      id: notificationIdFor(`${type}|${mealType ?? ''}|${slotKey}`),
      type,
      ...(mealType ? { mealType } : {}),
      title,
      body,
      at,
    });
  };

  // Water — generated per "awake window start day". The window can run past
  // midnight (night shift), so base days start at -1: the tail of yesterday's
  // window lands in today's early hours and must not be missed.
  if (prefs.waterReminders?.enabled) {
    const intervalMin = Math.max(1, Math.min(3, prefs.waterReminders.intervalHours || 2)) * 60;
    let windowStartMin = 8 * 60;
    let windowDurationMin = 14 * 60; // 08:00 → 22:00
    if (prefs.quietHours?.enabled) {
      const quietStart = parseTimeToMinutes(prefs.quietHours.start || '22:00') ?? 22 * 60;
      const quietEnd = parseTimeToMinutes(prefs.quietHours.end || '07:00') ?? 7 * 60;
      windowStartMin = quietEnd;
      windowDurationMin = (quietStart - quietEnd + 1440) % 1440;
      if (windowDurationMin === 0) windowDurationMin = 1440;
    }
    for (let baseOffset = -1; baseOffset < horizonDays; baseOffset++) {
      const baseDay = addDays(today, baseOffset);
      for (let offset = 0; offset < windowDurationMin; offset += intervalMin) {
        const absMin = windowStartMin + offset;
        const dayShift = Math.floor(absMin / 1440);
        const at = atMinuteOfDay(addDays(baseDay, dayShift), absMin % 1440);
        push('water', at, `${dateKey(at)}|${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`);
      }
    }
  }

  const trainingDays = resolveTrainingDays(prefs, weeklySchedule);
  const workoutMinutes = prefs.workoutReminders?.enabled
    ? parseTimeToMinutes(prefs.workoutReminders.preferredTime)
    : null;
  const mealSlots: Array<{ name: LocalMealType; minutes: number | null }> = prefs.mealReminders?.enabled
    ? [
        { name: 'breakfast', minutes: parseTimeToMinutes(prefs.mealReminders.breakfastTime) },
        { name: 'lunch', minutes: parseTimeToMinutes(prefs.mealReminders.lunchTime) },
        { name: 'dinner', minutes: parseTimeToMinutes(prefs.mealReminders.dinnerTime) },
      ]
    : [];
  const reportDay = prefs.weeklyReport?.enabled
    ? REPORT_DAY_TO_JS[prefs.weeklyReport.reportDay] ?? 0
    : null;
  const reportMinutes = prefs.weeklyReport?.enabled
    ? parseTimeToMinutes(prefs.weeklyReport.reportTime || '10:00')
    : null;

  for (let offset = 0; offset < horizonDays; offset++) {
    const day = addDays(today, offset);
    const dow = day.getDay();
    const key = dateKey(day);

    for (const slot of mealSlots) {
      if (slot.minutes === null) continue;
      push('meal', atMinuteOfDay(day, slot.minutes), `${key}|${slot.name}`, slot.name);
    }

    if (workoutMinutes !== null && trainingDays.includes(dow)) {
      push('workout', atMinuteOfDay(day, workoutMinutes), `${key}|workout`);
    }

    if (reportDay !== null && reportMinutes !== null && dow === reportDay) {
      push('weekly_report', atMinuteOfDay(day, reportMinutes), `${key}|weekly_report`);
    }
  }

  planned.sort((a, b) => a.at.getTime() - b.at.getTime());
  return planned;
}

// ─── Native runtime (no-op on web) ───────────────────────────────────────────

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function loadPlugin() {
  const mod = await import('@capacitor/local-notifications');
  return mod.LocalNotifications;
}

export type LocalNotificationPermissionState =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported';

export async function checkLocalNotificationPermission(): Promise<LocalNotificationPermissionState> {
  if (!isNativeApp()) return 'unsupported';
  try {
    const plugin = await loadPlugin();
    const status = await plugin.checkPermissions();
    if (status.display === 'granted') return 'granted';
    if (status.display === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}

export async function requestLocalNotificationPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const plugin = await loadPlugin();
    const status = await plugin.requestPermissions();
    return status.display === 'granted';
  } catch {
    return false;
  }
}

/**
 * Reconciles the OS schedule with the current store state: cancels every
 * pending local notification and schedules the freshly planned set.
 * Returns how many notifications were scheduled (0 on web / on failure).
 */
export async function syncLocalNotifications(now: Date = new Date()): Promise<number> {
  if (!isNativeApp()) return 0;
  try {
    const { useStore } = await import('./store');
    const state = useStore.getState();
    const prefs = state.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES;
    const planned = planLocalNotifications(prefs, state.weeklySchedule, now);
    const plugin = await loadPlugin();
    const pending = await plugin.getPending();
    if (pending.notifications.length > 0) {
      await plugin.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }
    if (planned.length > 0) {
      await plugin.schedule({
        notifications: planned.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          schedule: { at: n.at, allowWhileIdle: true },
        })),
      });
    }
    return planned.length;
  } catch (err) {
    console.warn('Local notification sync failed:', err);
    return 0;
  }
}

const TEST_NOTIFICATION_ID = notificationIdFor('ascend|test-notification');

/** Fires a one-off local notification ~2 seconds from now (native only). */
export async function sendTestLocalNotification(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const plugin = await loadPlugin();
    await plugin.schedule({
      notifications: [
        {
          id: TEST_NOTIFICATION_ID,
          title: 'ASCEND',
          body: 'Test notification — your reminders are working.',
          schedule: { at: new Date(Date.now() + 2000), allowWhileIdle: true },
        },
      ],
    });
    return true;
  } catch (err) {
    console.warn('Test local notification failed:', err);
    return false;
  }
}

let initialized = false;

/**
 * App-start wiring (native only, idempotent): syncs the schedule now,
 * re-syncs (debounced) whenever reminder preferences or the weekly
 * schedule change, and rolls the 14-day horizon forward on every
 * foreground resume.
 */
export function initLocalNotifications(): void {
  if (initialized || !isNativeApp()) return;
  initialized = true;

  void syncLocalNotifications();

  void import('./store')
    .then(({ useStore }) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      useStore.subscribe((state, prev) => {
        if (
          state.notificationPreferences === prev.notificationPreferences &&
          state.weeklySchedule === prev.weeklySchedule
        ) {
          return;
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          void syncLocalNotifications();
        }, 800);
      });
    })
    .catch(() => {});

  void import('@capacitor/app')
    .then(({ App }) => {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void syncLocalNotifications();
      });
    })
    .catch(() => {});
}
