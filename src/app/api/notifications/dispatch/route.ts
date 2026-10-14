import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { redactSecrets } from '@/lib/server-security';
import { NotificationPreferences, DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isWithinQuietHours(now: Date, quietHours: { enabled: boolean; start: string; end: string }): boolean {
  if (!quietHours.enabled) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = quietHours.start.split(':').map(Number);
  const [endH, endM] = quietHours.end.split(':').map(Number);

  const startMinutes = startH * 60 + (startM || 0);
  const endMinutes = endH * 60 + (endM || 0);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight quiet hours (e.g. 22:00 to 07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
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

export async function POST(req: Request) {
  // Check authorization token
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Allow test dispatch with dev flag in development
    const isDev = process.env.NODE_ENV !== 'production';
    if (!isDev) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
  }

  try {
    const supabase = getSupabaseAdminClient();
    const results: Array<{
      userId?: string;
      endpoint?: string;
      notificationType: string;
      title: string;
      sent: boolean;
      reason?: string;
    }> = [];

    if (!supabase) {
      return NextResponse.json({
        success: true,
        offlineMode: true,
        dispatchedCount: 0,
        message: 'No cloud database configured. Local client notifications active.',
      });
    }

    // Fetch active push subscriptions
    const { data: subscriptions, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id, timezone');

    if (subErr || !subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        dispatchedCount: 0,
        message: 'No active push subscriptions found',
      });
    }

    for (const sub of subscriptions) {
      // Determine user timezone time
      let userNow = new Date();
      if (sub.timezone) {
        try {
          const str = new Date().toLocaleString('en-US', { timeZone: sub.timezone });
          userNow = new Date(str);
        } catch {}
      }

      // Fetch user preferences
      let prefs: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES;
      if (sub.user_id) {
        const { data: prefData } = await supabase
          .from('notification_preferences')
          .select('preferences')
          .eq('user_id', sub.user_id)
          .single();
        if (prefData?.preferences) {
          prefs = prefData.preferences;
        }
      }

      if (!prefs.enabled) {
        results.push({
          userId: sub.user_id,
          endpoint: sub.endpoint,
          notificationType: 'none',
          title: '',
          sent: false,
          reason: 'User disabled notifications',
        });
        continue;
      }

      // Check quiet hours
      if (isWithinQuietHours(userNow, prefs.quietHours)) {
        results.push({
          userId: sub.user_id,
          endpoint: sub.endpoint,
          notificationType: 'suppressed',
          title: '',
          sent: false,
          reason: 'Quiet hours active',
        });
        continue;
      }

      const currentHour = userNow.getHours();
      const currentDay = userNow.getDay(); // 0=Sun, 1=Mon, etc.

      // 1. Water Reminder Check
      if (prefs.waterReminders.enabled) {
        const interval = prefs.waterReminders.intervalHours || 2;
        if (currentHour >= 8 && currentHour <= 21 && currentHour % interval === 0) {
          const payload = formatNotificationPayload('water');
          results.push({
            userId: sub.user_id,
            endpoint: sub.endpoint,
            notificationType: 'water',
            title: payload.title,
            sent: true,
          });
        }
      }

      // 2. Meal Reminder Check
      if (prefs.mealReminders.enabled) {
        const mealSlots: Array<{ name: 'breakfast' | 'lunch' | 'dinner'; time: string }> = [
          { name: 'breakfast', time: prefs.mealReminders.breakfastTime },
          { name: 'lunch', time: prefs.mealReminders.lunchTime },
          { name: 'dinner', time: prefs.mealReminders.dinnerTime },
        ];

        for (const slot of mealSlots) {
          if (slot.time) {
            const [slotH] = slot.time.split(':').map(Number);
            if (currentHour === slotH) {
              const payload = formatNotificationPayload('meal', slot.name);
              results.push({
                userId: sub.user_id,
                endpoint: sub.endpoint,
                notificationType: 'meal',
                title: payload.title,
                sent: true,
              });
            }
          }
        }
      }

      // 3. Workout Reminder Check
      if (prefs.workoutReminders.enabled) {
        if (prefs.workoutReminders.daysOfWeek.includes(currentDay)) {
          const [prefH] = prefs.workoutReminders.preferredTime.split(':').map(Number);
          if (currentHour === prefH) {
            const payload = formatNotificationPayload('workout');
            results.push({
              userId: sub.user_id,
              endpoint: sub.endpoint,
              notificationType: 'workout',
              title: payload.title,
              sent: true,
            });
          }
        }
      }

      // 4. Weekly Report Check
      if (prefs.weeklyReport.enabled) {
        const daysMap: Record<string, number> = { sunday: 0, monday: 1, saturday: 6 };
        const targetDay = daysMap[prefs.weeklyReport.reportDay] ?? 0;
        if (currentDay === targetDay && currentHour === 10) {
          const payload = formatNotificationPayload('weekly_report');
          results.push({
            userId: sub.user_id,
            endpoint: sub.endpoint,
            notificationType: 'weekly_report',
            title: payload.title,
            sent: true,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      dispatchedCount: results.filter((r) => r.sent).length,
      evaluatedSubscriptions: subscriptions.length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'DISPATCH_ERROR', message: redactSecrets(err?.message || 'Failed') },
      { status: 500 }
    );
  }
}
