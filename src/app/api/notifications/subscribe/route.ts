import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { rateLimitResponse, redactSecrets } from '@/lib/server-security';

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

export async function POST(req: Request) {
  const rateLimit = checkRateLimit(req, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'push-sub',
  });

  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit.resetMs);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { subscription, userAgent, timezone } = body;

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { error: 'INVALID_SUBSCRIPTION', message: 'Missing subscription endpoint' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      // Offline-first: return success
      return NextResponse.json({
        success: true,
        offlineMode: true,
        message: 'Push subscription registered in local mode',
      });
    }

    // Optional user authentication via Bearer token
    let userId: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.substring(7).trim();
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
      }
    }

    const endpoint = subscription.endpoint;
    const p256dh = subscription.keys?.p256dh || '';
    const auth = subscription.keys?.auth || '';

    // Upsert into push_subscriptions table
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        endpoint,
        p256dh,
        auth,
        user_id: userId,
        user_agent: userAgent || null,
        timezone: timezone || 'UTC',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );

    if (error) {
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: redactSecrets(error.message) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      endpoint,
      registeredAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'SUBSCRIPTION_ERROR', message: redactSecrets(err?.message || 'Failed') },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ error: 'MISSING_ENDPOINT' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
      if (error) {
        return NextResponse.json(
          { error: 'DATABASE_ERROR', message: redactSecrets(error.message) },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, message: 'Unsubscribed from push' });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'DELETE_ERROR', message: redactSecrets(err?.message || 'Failed') },
      { status: 500 }
    );
  }
}
