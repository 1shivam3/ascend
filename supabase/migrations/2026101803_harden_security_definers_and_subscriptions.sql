-- ==============================================================================
-- ASCEND STRENGTH & NUTRITION — SECURITY GATE MIGRATION:
-- PUSH SUBSCRIPTIONS ISOLATION & SECURITY DEFINER HARDENING
-- ==============================================================================
-- Migration: 2026101803_harden_security_definers_and_subscriptions
-- Purpose:
--   1. Eliminates cross-guest push subscription vulnerability by revoking direct
--      anon relational access and restricting RLS to authenticated user rows.
--      Guest subscription operations are routed strictly through authenticated
--      serverless API endpoints via service_role.
--   2. Hardens public.claim_notification_delivery with SET search_path = public, pg_temp,
--      strict input boundaries, and restricts EXECUTE strictly to service_role.
--   3. Hardens public.cleanup_expired_deletion_nonces with SET search_path = public, pg_temp,
--      and restricts EXECUTE strictly to service_role.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PUSH SUBSCRIPTIONS ISOLATION
-- ------------------------------------------------------------------------------
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Revoke direct relational access from untrusted public/anon roles
REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC;
REVOKE ALL ON TABLE public.push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;

-- Drop insecure cross-guest policy (which permitted user_id IS NULL access to anon)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow athletes and guests to manage push subscriptions" ON public.push_subscriptions;
  DROP POLICY IF EXISTS "Athletes can manage own push subscriptions" ON public.push_subscriptions;
  DROP POLICY IF EXISTS "Service role full access to push subscriptions" ON public.push_subscriptions;

  -- Authenticated athletes can only manage their own verified push subscriptions
  CREATE POLICY "Athletes can manage own push subscriptions" ON public.push_subscriptions
    FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

  -- Service role handles server-side dispatch and guest push subscription operations
  CREATE POLICY "Service role full access to push subscriptions" ON public.push_subscriptions
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
END $$;


-- ------------------------------------------------------------------------------
-- 2. HARDEN claim_notification_delivery (SECURITY DEFINER + search_path)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_notification_delivery(
  p_idempotency_key TEXT,
  p_endpoint TEXT,
  p_user_id UUID,
  p_notification_type TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claimed        BOOLEAN := FALSE;
  v_key            TEXT;
  v_endpoint       TEXT;
  v_notif_type     TEXT;
BEGIN
  -- Strict parameter validation
  v_key := TRIM(COALESCE(p_idempotency_key, ''));
  IF v_key = '' OR length(v_key) > 255 THEN
    RAISE EXCEPTION 'Invalid idempotency_key: must be non-empty and <= 255 characters';
  END IF;

  v_endpoint := TRIM(COALESCE(p_endpoint, ''));
  IF v_endpoint = '' OR length(v_endpoint) > 2048 THEN
    RAISE EXCEPTION 'Invalid subscription_endpoint: must be non-empty and <= 2048 characters';
  END IF;

  v_notif_type := TRIM(COALESCE(p_notification_type, ''));
  IF v_notif_type = '' OR length(v_notif_type) > 64 THEN
    RAISE EXCEPTION 'Invalid notification_type: must be non-empty and <= 64 characters';
  END IF;

  INSERT INTO public.notification_deliveries (
    idempotency_key,
    subscription_endpoint,
    user_id,
    notification_type,
    status,
    attempt_count,
    created_at,
    updated_at
  ) VALUES (
    v_key,
    v_endpoint,
    p_user_id,
    v_notif_type,
    'processing',
    1,
    now(),
    now()
  )
  ON CONFLICT (idempotency_key) DO UPDATE
  SET
    status = 'processing',
    attempt_count = public.notification_deliveries.attempt_count + 1,
    updated_at = now()
  WHERE public.notification_deliveries.status = 'failed'
     OR (
       public.notification_deliveries.status = 'processing'
       AND public.notification_deliveries.updated_at < now() - INTERVAL '5 minutes'
     );

  IF FOUND THEN
    v_claimed := TRUE;
  END IF;

  RETURN v_claimed;
END;
$$;

-- Restrict execution strictly to service_role (Least-Privilege)
REVOKE ALL ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, UUID, TEXT) TO service_role;


-- ------------------------------------------------------------------------------
-- 3. HARDEN cleanup_expired_deletion_nonces (SECURITY DEFINER + search_path)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_deletion_nonces()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.consumed_deletion_nonces
  WHERE expires_at < now() - INTERVAL '48 hours';
END;
$$;

-- Restrict execution strictly to service_role (Least-Privilege)
REVOKE ALL ON FUNCTION public.cleanup_expired_deletion_nonces() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_deletion_nonces() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_expired_deletion_nonces() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_deletion_nonces() TO service_role;
