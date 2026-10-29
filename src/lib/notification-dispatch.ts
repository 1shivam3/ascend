/**
 * Push-dispatch helpers, extracted from the dispatch route so the
 * delivery-claim and subscription-fetch logic is unit-testable
 * without a live Supabase client (gauntlet SEC-09 / SEC-10).
 */

import { redactSecrets } from './server-security';

export interface DeliveryClaimParams {
  idempotencyKey: string;
  endpoint: string;
  userId: string | null;
  notificationType: string;
}

/**
 * Atomically claims one delivery, or returns false when another
 * worker already claimed/sent it. Prefers the atomic PostgreSQL
 * function; the fallback path is guarded (SEC-10): the failed/stale
 * re-claim updates ONLY when the row still has the exact status and
 * updated_at observed above, and requires the update to affect a
 * row — the loser sees zero rows and does not send. The insert
 * branch relies on the UNIQUE constraint on idempotency_key: a
 * duplicate insert errors and returns false.
 */
export async function claimNotificationDelivery(
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
        const { data: updated, error } = await supabase
          .from('notification_deliveries')
          .update({
            status: 'processing',
            attempt_count: (existing.attempt_count || 1) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('idempotency_key', params.idempotencyKey)
          .eq('status', existing.status)
          .eq('updated_at', existing.updated_at)
          .select('idempotency_key');
        return !error && Array.isArray(updated) && updated.length > 0;
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

/**
 * Fetches all push subscriptions in stable pages (SEC-09). The old
 * route served only the first 500 rows (.limit(500)) and silently
 * dropped the rest. Pages of pageSize ordered by endpoint up to
 * maxTotal; beyond the cap the result says truncated: true instead
 * of silently dropping rows.
 */
export async function fetchAllSubscriptions(
  supabase: any,
  opts?: { pageSize?: number; maxTotal?: number },
): Promise<{ subscriptions: any[]; truncated: boolean }> {
  const pageSize = opts?.pageSize ?? 500;
  const maxTotal = opts?.maxTotal ?? 20000;
  const fields = 'endpoint, p256dh, auth, user_id, timezone';
  // Prefer true pagination (order + range). Some client doubles only
  // implement limit(); feature-detect step by step (range lives on
  // the ORDERED builder, not on the bare select) rather than assume.
  const probe = supabase.from('push_subscriptions').select(fields);
  const ordered =
    typeof probe?.order === 'function'
      ? probe.order('endpoint', { ascending: true })
      : null;
  if (!ordered || typeof ordered.range !== 'function') {
    const { data, error } = await probe.limit(maxTotal);
    if (error) throw error;
    const rows = data || [];
    return { subscriptions: rows, truncated: rows.length >= maxTotal };
  }
  const subscriptions: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from('push_subscriptions')
      .select(fields)
      .order('endpoint', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = page || [];
    subscriptions.push(...rows);
    if (rows.length < pageSize) return { subscriptions, truncated: false };
    if (subscriptions.length >= maxTotal) return { subscriptions, truncated: true };
  }
}

/** Marks a claimed delivery sent. Kept here with the claim logic. */
export async function markDeliverySuccess(supabase: any, idempotencyKey: string) {
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

/** Marks a claimed delivery failed (error text redacted). */
export async function markDeliveryFailed(supabase: any, idempotencyKey: string, error: string) {
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
