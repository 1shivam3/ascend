import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { rateLimitResponse, redactSecrets } from '@/lib/server-security';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/types';

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
    keyPrefix: 'push-prefs',
  });

  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit.resetMs);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseServerClient();

    if (!supabase) {
      return NextResponse.json({
        success: true,
        offlineMode: true,
        preferences: body,
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
          preferences: body,
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

    return NextResponse.json({ success: true, preferences: body });
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
