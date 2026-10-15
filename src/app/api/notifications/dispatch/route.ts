import { NextResponse } from 'next/server';
import crypto from 'crypto';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { redactSecrets } from '@/lib/server-security';
import { NotificationPreferences } from '@/lib/types';
import {
  getZonedTime,
  evaluateDueReminders,
  generateIdempotencyKey,
  formatNotificationPayload,
} from '@/lib/notifications';

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

function timingSafeTokenCompare(givenToken: string, expectedSecret: string): boolean {
  if (!givenToken || !expectedSecret) return false;
  const bufA = Buffer.from(givenToken);
  const bufB = Buffer.from(expectedSecret);
  if (bufA.length !== bufB.length) {
    // Perform dummy comparison to mitigate timing side channels
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

async function claimNotificationDelivery(
  supabase: any,
  params: {
    idempotencyKey: string;
    endpoint: string;
    userId: string | null;
    notificationType: string;
  }
): Promise<boolean> {
  // 1. Try atomic PostgreSQL function
  try {
    const { data, error } = await supabase.rpc('claim_notification_delivery', {
      p_idempotency_key: params.idempotencyKey,
      p_endpoint: params.endpoint,
      p_user_id: params.userId,
      p_notification_type: params.notificationType,
    });
    if (!error && typeof data === 'boolean') {
      return data;
    }
  } catch {}

  // 2. Direct database query fallback
  try {
    const { data: existing } = await supabase
      .from('notification_deliveries')
      .select('status, updated_at, attempt_count')
      .eq('idempotency_key', params.idempotencyKey)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'sent') {
        return false;
      }
      const isStale =
        existing.status === 'processing' &&
        new Date().getTime() - new Date(existing.updated_at).getTime() > 5 * 60 * 1000;
      if (existing.status === 'failed' || isStale) {
        const { error } = await supabase
          .from('notification_deliveries')
          .update({
            status: 'processing',
            attempt_count: (existing.attempt_count || 1) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('idempotency_key', params.idempotencyKey);
        return !error;
      }
      return false; // currently processing by another worker
    }

    const { error } = await supabase.from('notification_deliveries').insert({
      idempotency_key: params.idempotencyKey,
      subscription_endpoint: params.endpoint,
      user_id: params.userId,
      notification_type: params.notificationType,
      status: 'processing',
      attempt_count: 1,
      updated_at: new Date().toISOString(),
    });

    return !error;
  } catch {
    return false;
  }
}

async function markDeliverySuccess(supabase: any, idempotencyKey: string) {
  try {
    await supabase
      .from('notification_deliveries')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('idempotency_key', idempotencyKey);
  } catch {}
}

async function markDeliveryFailed(supabase: any, idempotencyKey: string, error: string) {
  try {
    await supabase
      .from('notification_deliveries')
      .update({
        status: 'failed',
        last_error: redactSecrets(error),
        updated_at: new Date().toISOString(),
      })
      .eq('idempotency_key', idempotencyKey);
  } catch {}
}

export async function POST(req: Request) {
  // 1. Cron Authentication (Fail Closed)
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CONFIGURATION_ERROR', message: 'Cron authentication secret is not configured' },
      { status: 500 }
    );
  }

  const authHeader =
    req.headers.get('authorization') || req.headers.get('upstash-forward-authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Valid Bearer token required' },
      { status: 401 }
    );
  }

  const token = authHeader.substring(7).trim();
  if (!timingSafeTokenCompare(token, cronSecret)) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Invalid bearer token' },
      { status: 401 }
    );
  }

  // 2. Validate VAPID Configuration
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const vapidSubject = process.env.VAPID_SUBJECT?.trim();

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return NextResponse.json(
      { error: 'CONFIGURATION_ERROR', message: 'Web Push VAPID keys are not configured' },
      { status: 500 }
    );
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  } catch (vapidErr: any) {
    return NextResponse.json(
      {
        error: 'CONFIGURATION_ERROR',
        message: redactSecrets(vapidErr?.message || 'Invalid VAPID credentials'),
      },
      { status: 500 }
    );
  }

  // 3. Supabase Admin Client
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'CONFIGURATION_ERROR', message: 'Supabase admin client is not configured' },
      { status: 500 }
    );
  }

  try {
    // 4. Fetch subscriptions in bounded batch
    const BATCH_SIZE = 500;
    const { data: subscriptions, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id, timezone')
      .limit(BATCH_SIZE);

    if (subErr) {
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: redactSecrets(subErr.message) },
        { status: 500 }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        stats: {
          examined: 0,
          due: 0,
          sent: 0,
          failed: 0,
          expired: 0,
          skipped: 0,
        },
        message: 'No active push subscriptions found',
      });
    }

    // 5. Batch-fetch preferences for active registered users (avoid N+1 queries)
    const userIds = Array.from(
      new Set(subscriptions.map((s) => s.user_id).filter((id): id is string => Boolean(id)))
    );
    const prefMap = new Map<string, NotificationPreferences>();

    if (userIds.length > 0) {
      const { data: prefRows, error: prefErr } = await supabase
        .from('notification_preferences')
        .select('user_id, preferences')
        .in('user_id', userIds);

      if (!prefErr && prefRows) {
        for (const row of prefRows) {
          if (row.user_id && row.preferences) {
            prefMap.set(row.user_id, row.preferences as NotificationPreferences);
          }
        }
      }
    }

    // 6. Evaluate and dispatch due reminders
    let examined = 0;
    let due = 0;
    let sent = 0;
    let failed = 0;
    let expired = 0;
    let skipped = 0;
    const now = new Date();

    for (const sub of subscriptions) {
      examined++;

      // Validate subscription shape
      if (!sub.endpoint || !sub.p256dh || !sub.auth) {
        skipped++;
        continue;
      }

      // Guest subscriptions without persisted user preferences are never notified with fabricated defaults
      if (!sub.user_id) {
        skipped++;
        continue;
      }

      const prefs = prefMap.get(sub.user_id);
      if (!prefs || !prefs.enabled) {
        skipped++;
        continue;
      }

      // Resolve user's timezone safely
      const zoned = getZonedTime(now, sub.timezone);

      // Evaluate due reminders
      const dueReminders = evaluateDueReminders(zoned, prefs, { windowMinutes: 60 });
      if (dueReminders.length === 0) {
        skipped++;
        continue;
      }

      for (const reminder of dueReminders) {
        due++;
        const idempotencyKey = generateIdempotencyKey(sub.endpoint, reminder.occurrenceId);

        // Atomic delivery claim
        const claimed = await claimNotificationDelivery(supabase, {
          idempotencyKey,
          endpoint: sub.endpoint,
          userId: sub.user_id,
          notificationType: reminder.type,
        });

        if (!claimed) {
          // Already sent or claimed by another worker
          skipped++;
          continue;
        }

        // Web Push payload construction
        const pushSub = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        const payload = formatNotificationPayload(reminder.type, reminder.mealType);
        const targetUrl = payload.tab === 'home' ? '/' : `/?tab=${payload.tab}`;
        const pushData = JSON.stringify({
          title: payload.title,
          body: payload.body,
          tag: payload.tag,
          tab: payload.tab,
          url: targetUrl,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          data: {
            url: targetUrl,
            tab: payload.tab,
            timestamp: Date.now(),
          },
        });

        try {
          await webpush.sendNotification(pushSub, pushData, {
            vapidDetails: {
              subject: vapidSubject,
              publicKey: vapidPublicKey,
              privateKey: vapidPrivateKey,
            },
          });

          await markDeliverySuccess(supabase, idempotencyKey);
          sent++;
        } catch (sendErr: any) {
          const statusCode = sendErr?.statusCode;
          const safeMsg = redactSecrets(sendErr?.message || 'Send failure');

          if (statusCode === 404 || statusCode === 410) {
            // Subscription expired or unregistered: delete from database
            expired++;
            await markDeliveryFailed(supabase, idempotencyKey, 'Subscription expired (HTTP 410/404)');
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          } else {
            // Transient or provider failure
            failed++;
            await markDeliveryFailed(supabase, idempotencyKey, safeMsg);
          }
        }
      }
    }

    // 7. Return sanitized response with aggregate counters (no sensitive data)
    return NextResponse.json({
      success: true,
      stats: {
        examined,
        due,
        sent,
        failed,
        expired,
        skipped,
      },
      message: `Examined ${examined} subscriptions: ${sent} sent, ${skipped} skipped, ${failed} failed, ${expired} expired`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'DISPATCH_ERROR', message: redactSecrets(err?.message || 'Internal failure') },
      { status: 500 }
    );
  }
}
