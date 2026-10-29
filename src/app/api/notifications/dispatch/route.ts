import { NextResponse } from 'next/server';
import crypto from 'crypto';
import webpush from 'web-push';
import { Receiver } from '@upstash/qstash';
import { createClient } from '@supabase/supabase-js';
import { redactSecrets } from '@/lib/server-security';
import { NotificationPreferences } from '@/lib/types';
import {
  getZonedTime,
  evaluateDueReminders,
  generateIdempotencyKey,
  formatNotificationPayload,
} from '@/lib/notifications';
import {
  claimNotificationDelivery,
  fetchAllSubscriptions,
  markDeliverySuccess,
  markDeliveryFailed,
} from '@/lib/notification-dispatch';

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

export async function POST(req: Request) {
  // 1. Cron / QStash Authentication (Fail Closed)
  const cronSecret = process.env.CRON_SECRET?.trim();
  const qstashCurrentKey = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim();
  const qstashNextKey = process.env.QSTASH_NEXT_SIGNING_KEY?.trim();

  if (!cronSecret && !qstashCurrentKey) {
    return NextResponse.json(
      {
        error: 'CONFIGURATION_ERROR',
        message: 'Cron authentication secret or QStash signing key is not configured',
      },
      { status: 500 }
    );
  }

  let isAuthorized = false;

  // Method A: Native Upstash QStash cryptographic signature
  const upstashSignature = req.headers.get('upstash-signature');
  if (upstashSignature && (qstashCurrentKey || qstashNextKey)) {
    try {
      const receiver = new Receiver({
        currentSigningKey: qstashCurrentKey,
        nextSigningKey: qstashNextKey,
      });
      const clonedReq = req.clone();
      const rawBody = await clonedReq.text();
      const isValid = await receiver.verify({
        signature: upstashSignature,
        body: rawBody,
      });
      if (isValid) {
        isAuthorized = true;
      }
    } catch {
      // Signature verification failed
    }
  }

  // Method B: Bearer token (Authorization or Upstash-Forward-Authorization)
  if (!isAuthorized && cronSecret) {
    const authHeader =
      req.headers.get('authorization') || req.headers.get('upstash-forward-authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.substring(7).trim();
      if (timingSafeTokenCompare(token, cronSecret)) {
        isAuthorized = true;
      }
    }
  }

  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Valid QStash signature or Bearer token required' },
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
    // 4. Fetch subscriptions, paginated (gauntlet SEC-09 helper —
    // see notification-dispatch.ts for the cap/truncation contract).
    // No per-IP rate limit here on purpose: this endpoint is
    // secret-authenticated (QStash signature or cron Bearer <redacted>
    // a per-IP limiter keyed on QStash's rotating egress IPs could
    // break legitimate cron runs.
    let subscriptions: any[];
    let truncated = false;
    try {
      const fetched = await fetchAllSubscriptions(supabase);
      subscriptions = fetched.subscriptions;
      truncated = fetched.truncated;
    } catch (pageErr: any) {
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: redactSecrets(pageErr?.message || 'Failed') },
        { status: 500 }
      );
    }

    if (subscriptions.length === 0) {
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
      ...(truncated ? { truncated: true } : {}),
      message: `Examined ${examined} subscriptions: ${sent} sent, ${skipped} skipped, ${failed} failed, ${expired} expired${truncated ? ' (subscription list truncated at safety cap)' : ''}`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'DISPATCH_ERROR', message: redactSecrets(err?.message || 'Internal failure') },
      { status: 500 }
    );
  }
}
