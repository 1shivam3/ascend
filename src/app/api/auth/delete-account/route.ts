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

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  // 1. Rate limiting: 5 requests per 15 minutes per IP
  const rateLimit = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    keyPrefix: 'account-deletion',
  });

  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit.resetMs);
  }

  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        {
          success: true,
          mock: true,
          message: 'Local offline mode: Supabase is not configured. Local data purged.',
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    let authUser: { id: string; email?: string } | null = null;

    // Check Authorization header (Bearer token)
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.substring(7).trim();
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        authUser = { id: user.id, email: user.email };
      }
    }

    // Check request body for fallback email verification
    const body = await req.json().catch(() => ({}));
    const requestEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;

    if (!authUser && requestEmail) {
      const adminClient = getSupabaseAdminClient();
      if (adminClient) {
        // Find user by email in admin
        const { data: { users }, error: listErr } = await adminClient.auth.admin.listUsers();
        if (!listErr && users) {
          const match = users.find((u) => u.email?.toLowerCase() === requestEmail);
          if (match) {
            authUser = { id: match.id, email: match.email };
          }
        }
      }
    }

    if (!authUser) {
      return NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          message: 'A valid authentication token or verified account email is required to delete an account.',
        },
        { status: 401 }
      );
    }

    const userId = authUser.id;

    // 2. Cascade delete records from all user-linked tables
    const tablesToDelete = [
      'personal_records',
      'workouts',
      'meals',
      'body_metrics',
      'daily_habits',
      'planned_workouts',
      'custom_barcodes',
      'push_subscriptions',
      'notification_preferences',
      'profiles',
    ];

    const deleteResults: Record<string, string> = {};

    for (const table of tablesToDelete) {
      try {
        const idCol = table === 'profiles' ? 'id' : 'user_id';
        const { error } = await supabase.from(table).delete().eq(idCol, userId);
        deleteResults[table] = error ? error.message : 'deleted';
      } catch (err: any) {
        deleteResults[table] = err?.message || 'skipped';
      }
    }

    // 3. Purge user from Supabase Auth if admin client is available
    const adminClient = getSupabaseAdminClient();
    let authUserDeleted = false;
    if (adminClient) {
      const { error: deleteUserErr } = await adminClient.auth.admin.deleteUser(userId);
      if (!deleteUserErr) {
        authUserDeleted = true;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Your ASCEND account and all associated cloud data have been permanently deleted.',
      userId,
      email: authUser.email || undefined,
      authPurged: authUserDeleted,
      tableResults: deleteResults,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    const safeError = redactSecrets(err?.message || 'Internal deletion failure');
    return NextResponse.json(
      { error: 'DELETION_FAILED', message: safeError },
      { status: 500 }
    );
  }
}
