import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { rateLimitResponse, redactSecrets } from '@/lib/server-security';
import { DEFAULT_NOTIFICATION_PREFERENCES, NotificationPreferences } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const key = serviceKey || anonKey;

  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const VALID_DAYS = [0, 1, 2, 3, 4, 5, 6];
const VALID_REPORT_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];
const TIME_REGEX = /^([01]?\d|2[0-3]):[0-5]\d$/;

/**
 * Validates and sanitizes a raw preferences payload against the NotificationPreferences
 * schema, falling back to defaults for any invalid or missing fields.
 */
function validatePreferences(raw: any): NotificationPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  const prefs: NotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES };

  if (typeof raw.enabled === 'boolean') prefs.enabled = raw.enabled;

  // Water reminders
  if (raw.waterReminders && typeof raw.waterReminders === 'object') {
    if (typeof raw.waterReminders.enabled === 'boolean') {
      prefs.waterReminders.enabled = raw.waterReminders.enabled;
    }
    const interval = Number(raw.waterReminders.intervalHours);
    if ([1, 2, 3].includes(interval)) {
      prefs.waterReminders.intervalHours = interval;
    }
  }

  // Meal reminders
  if (raw.mealReminders && typeof raw.mealReminders === 'object') {
    if (typeof raw.mealReminders.enabled === 'boolean') {
      prefs.mealReminders.enabled = raw.mealReminders.enabled;
    }
    for (const key of ['breakfastTime', 'lunchTime', 'dinnerTime']) {
      const val = raw.mealReminders[key];
      if (typeof val === 'string' && TIME_REGEX.test(val.trim())) {
        // @ts-expect-error key is a known key on mealReminders
        prefs.mealReminders[key] = val.trim();
      }
    }
  }

  // Workout reminders
  if (raw.workoutReminders && typeof raw.workoutReminders === 'object') {
    if (typeof raw.workoutReminders.enabled === 'boolean') {
      prefs.workoutReminders.enabled = raw.workoutReminders.enabled;
    }
    const time = raw.workoutReminders.preferredTime;
    if (typeof time === 'string' && TIME_REGEX.test(time.trim())) {
      prefs.workoutReminders.preferredTime = time.trim();
    }
    const days = raw.workoutReminders.daysOfWeek;
    if (Array.isArray(days)) {
      const validDays = days.filter((d: any) => VALID_DAYS.includes(Number(d)));
      if (validDays.length > 0 && validDays.length <= 7) {
        prefs.workoutReminders.daysOfWeek = validDays.map(Number);
      }
    }
    if (typeof raw.workoutReminders.daysCustomized === 'boolean') {
      prefs.workoutReminders.daysCustomized = raw.workoutReminders.daysCustomized;
    }
  }

  // Weekly report
  if (raw.weeklyReport && typeof raw.weeklyReport === 'object') {
    if (typeof raw.weeklyReport.enabled === 'boolean') {
      prefs.weeklyReport.enabled = raw.weeklyReport.enabled;
    }
    const day = raw.weeklyReport.reportDay;
    if (VALID_REPORT_DAYS.includes(day)) {
      prefs.weeklyReport.reportDay = day;
    }
    const time = raw.weeklyReport.reportTime;
    if (typeof time === 'string' && TIME_REGEX.test(time.trim())) {
      prefs.weeklyReport.reportTime = time.trim();
    }
  }

  // Quiet hours
  if (raw.quietHours && typeof raw.quietHours === 'object') {
    if (typeof raw.quietHours.enabled === 'boolean') {
      prefs.quietHours.enabled = raw.quietHours.enabled;
    }
    const start = raw.quietHours.start;
    const end = raw.quietHours.end;
    if (typeof start === 'string' && TIME_REGEX.test(start.trim())) {
      prefs.quietHours.start = start.trim();
    }
    if (typeof end === 'string' && TIME_REGEX.test(end.trim())) {
      prefs.quietHours.end = end.trim();
    }
  }

  if (typeof raw.lockScreenPrivacy === 'boolean') {
    prefs.lockScreenPrivacy = raw.lockScreenPrivacy;
  }

  return prefs;
}

export async function POST(req: Request) {
  const rateLimit = await checkRateLimit(req, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'push-prefs',
  });

  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit.resetMs);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseServerClient();

    // Validate and sanitize the preferences body before storage
    const preferences = validatePreferences(body);

    if (!supabase) {
      return NextResponse.json({
        success: true,
        offlineMode: true,
        preferences,
      });
    }

    let userId: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.substring(7).trim();
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
      }
    }

    if (userId) {
      const { error } = await supabase.from('notification_preferences').upsert(
        {
          user_id: userId,
          preferences,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
      if (error) {
        return NextResponse.json(
          { error: 'DATABASE_ERROR', message: redactSecrets(error.message) },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, preferences });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'PREFERENCES_ERROR', message: redactSecrets(err?.message || 'Failed') },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ preferences: DEFAULT_NOTIFICATION_PREFERENCES });
    }

    let userId: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.substring(7).trim();
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
      }
    }

    if (!userId) {
      return NextResponse.json({ preferences: DEFAULT_NOTIFICATION_PREFERENCES });
    }

    const { data, error } = await supabase
      .from('notification_preferences')
      .select('preferences')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return NextResponse.json({ preferences: DEFAULT_NOTIFICATION_PREFERENCES });
    }

    return NextResponse.json({ preferences: data.preferences });
  } catch {
    return NextResponse.json({ preferences: DEFAULT_NOTIFICATION_PREFERENCES });
  }
}
