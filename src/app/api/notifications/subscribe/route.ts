import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { rateLimitResponse, readJsonBodyWithLimit, RequestBodyTooLargeError, requestBodyTooLargeResponse, redactSecrets } from '@/lib/server-security';
import {
  generateSubscriptionDeleteToken,
  hashSubscriptionDeleteToken,
  isValidPushEndpoint,
  verifySubscriptionDeleteToken,
} from '@/lib/push-subscription-security';

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

// P2-2: subscription writes must never run under the anon fallback.
// Anonymous subscriptions need the service role to bypass RLS, and a
// half-applied write reported as success is worse than a 503. The
// no-client-at-all offline path below is untouched — this fires only
// when a URL + anon key exist but the service key is missing.
function isServiceKeyConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

function serviceKeyMissingResponse() {
  return NextResponse.json(
    { error: 'CONFIGURATION_ERROR', message: 'Push subscription service is not configured on the server.' },
    { status: 503 }
  );
}

async function resolveUserId(supabase: any, req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7).trim();
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) return user.id;
  }
  return null;
}

// The delete_token_hash column is added by
// supabase/migrations/2026101806_add_push_subscription_delete_token.sql,
// which may not have run yet when this code deploys (PRs merge before SQL).
// Treat the column as opportunistic: detect its absence and fall back to
// pre-migration behaviour instead of breaking subscribe entirely.
function isMissingColumnError(err: any): boolean {
  if (!err) return false;
  if (err.code === 'PGRST204' || err.code === '42703') return true;
  const text = [err.message, err.details, err.hint].filter(Boolean).join(' ');
  return text.includes('delete_token_hash');
}

async function findSubscription(supabase: any, endpoint: string) {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, user_id, delete_token_hash')
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (!error) return data ?? null;
  if (!isMissingColumnError(error)) throw error;
  // Pre-migration: retry without the column; token is treated as absent.
  const retry = await supabase
    .from('push_subscriptions')
    .select('endpoint, user_id')
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (retry.error) throw retry.error;
  return retry.data ? { ...retry.data, delete_token_hash: null } : null;
}

export async function POST(req: Request) {
  const rateLimit = await checkRateLimit(req, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'push-sub',
  });

  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit.resetMs);
  }

  try {
    // B2 (audit, F-04 extension): capped body read — a PushSubscription
    // is a few KB, so 64 KB is generous; malformed bodies still fall
    // back to {} exactly as the old req.json().catch() did.
    let body: any = {};
    try {
      body = await readJsonBodyWithLimit(req, 64 * 1024);
    } catch (err) {
      if (err instanceof RequestBodyTooLargeError) return requestBodyTooLargeResponse();
      body = {};
    }
    const { subscription, userAgent, timezone } = body;

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { error: 'INVALID_SUBSCRIPTION', message: 'Missing subscription endpoint' },
        { status: 400 }
      );
    }

    // Reject anything a real web-push service would never issue (QA4-009):
    // previously ANY string (e.g. "not-a-url") was stored with a 200.
    if (!isValidPushEndpoint(subscription.endpoint)) {
      return NextResponse.json(
        { error: 'INVALID_ENDPOINT', message: 'Subscription endpoint is not a recognized web-push service URL' },
        { status: 400 }
      );
    }

    const endpoint = subscription.endpoint;
    const p256dh = subscription.keys?.p256dh;
    const auth = subscription.keys?.auth;
    if (typeof p256dh !== 'string' || !p256dh || typeof auth !== 'string' || !auth) {
      return NextResponse.json(
        { error: 'INVALID_SUBSCRIPTION', message: 'Missing subscription encryption keys' },
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

    if (!isServiceKeyConfigured()) return serviceKeyMissingResponse();

    // Optional user authentication via Bearer token
    const userId = await resolveUserId(supabase, req);

    // Ownership guard (QA4A-003): an upsert keyed on endpoint must never let
    // an anonymous or different user overwrite — or null out — the user_id
    // of a subscription that already belongs to a signed-in user.
    let existing: any = null;
    try {
      existing = await findSubscription(supabase, endpoint);
    } catch {
      // Gauntlet SEC-08: fail CLOSED on lookup error. The old code set
      // existing = null and let the upsert below re-own a victim's
      // endpoint row (user_id from the caller), bypassing the 403
      // ownership guard that only fires when existing.user_id is known.
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Could not look up subscription' },
        { status: 500 }
      );
    }

    if (existing?.user_id && existing.user_id !== userId) {
      return NextResponse.json(
        { error: 'ENDPOINT_OWNED', message: 'This subscription belongs to another account' },
        { status: 403 }
      );
    }

    // Per-subscription delete token: issued when the row is first created
    // (or has none yet, e.g. legacy rows), and rotated when the owning
    // signed-in user re-subscribes. Only its SHA-256 hash is stored; the
    // client persists the raw token and presents it on DELETE. An anonymous
    // re-register of a guest row never rotates the token, so knowing an
    // endpoint alone is not enough to take over its deletion rights.
    let deleteToken: string | undefined;
    let deleteTokenHash: string | null = existing?.delete_token_hash ?? null;
    if (!deleteTokenHash || (userId && existing?.user_id === userId)) {
      deleteToken = generateSubscriptionDeleteToken();
      deleteTokenHash = hashSubscriptionDeleteToken(deleteToken);
    }

    // Upsert into push_subscriptions table. user_id is only ever set from a
    // verified session or preserved from the existing row — never nulled by
    // an unauthenticated request.
    const record: Record<string, unknown> = {
      endpoint,
      p256dh,
      auth,
      user_id: userId ?? existing?.user_id ?? null,
      user_agent: userAgent || null,
      timezone: timezone || 'UTC',
      delete_token_hash: deleteTokenHash,
      updated_at: new Date().toISOString(),
    };
    let { error } = await supabase
      .from('push_subscriptions')
      .upsert(record, { onConflict: 'endpoint' });

    if (error && isMissingColumnError(error)) {
      // Pre-migration: store the subscription exactly as before this PR
      // (without the token column) and don't hand out a token that
      // cannot be verified later.
      const { delete_token_hash: _omit, ...withoutToken } = record;
      ({ error } = await supabase
        .from('push_subscriptions')
        .upsert(withoutToken, { onConflict: 'endpoint' }));
      if (!error) deleteToken = undefined;
    }

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
      ...(deleteToken ? { deleteToken } : {}),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'SUBSCRIPTION_ERROR', message: redactSecrets(err?.message || 'Failed') },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  // Rate limiting (QA4-009): DELETE previously had none at all.
  const rateLimit = await checkRateLimit(req, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'push-sub-delete',
  });

  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit.resetMs);
  }

  try {
    // B2 (audit, F-04 extension): capped body read, same as the POST path.
    let body: any = {};
    try {
      body = await readJsonBodyWithLimit(req, 64 * 1024);
    } catch (err) {
      if (err instanceof RequestBodyTooLargeError) return requestBodyTooLargeResponse();
      body = {};
    }
    const { endpoint, deleteToken } = body;

    if (!endpoint) {
      return NextResponse.json({ error: 'MISSING_ENDPOINT' }, { status: 400 });
    }

    if (!isValidPushEndpoint(endpoint)) {
      return NextResponse.json({ error: 'INVALID_ENDPOINT' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      // No server-side store configured: nothing to delete.
      return NextResponse.json({ success: true, offlineMode: true, message: 'Unsubscribed from push' });
    }

    if (!isServiceKeyConfigured()) return serviceKeyMissingResponse();

    let existing: any = null;
    try {
      existing = await findSubscription(supabase, endpoint);
    } catch {
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Could not look up subscription' },
        { status: 500 }
      );
    }

    if (!existing) {
      // Idempotent: the subscription is already gone.
      return NextResponse.json({ success: true, message: 'Unsubscribed from push' });
    }

    // Proof of ownership (QA4-009): the caller must either present the
    // per-subscription delete token issued at subscribe time, or be
    // signed in as the user the subscription belongs to. Legacy rows with
    // no token and no owner cannot be deleted through this route by
    // strangers — the browser-side unsubscribe still works, and stale
    // rows are reaped by the dispatcher when the push service returns 410.
    const userId = await resolveUserId(supabase, req);
    const tokenOk = verifySubscriptionDeleteToken(deleteToken, existing.delete_token_hash);
    const ownerOk = Boolean(userId && existing.user_id && userId === existing.user_id);

    if (!tokenOk && !ownerOk) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Proof of subscription ownership is required to unsubscribe' },
        { status: 401 }
      );
    }

    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) {
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: redactSecrets(error.message) },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: 'Unsubscribed from push' });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'DELETE_ERROR', message: redactSecrets(err?.message || 'Failed') },
      { status: 500 }
    );
  }
}
