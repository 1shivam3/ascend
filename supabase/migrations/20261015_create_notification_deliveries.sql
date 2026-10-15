-- ==============================================================================
-- ASCEND STRENGTH & NUTRITION - NOTIFICATION DELIVERIES LEDGER MIGRATION
-- ==============================================================================
-- Durable idempotency ledger for Web Push notification dispatch.
-- Ensures atomic claiming, retry state, and duplicate prevention.

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key TEXT NOT NULL UNIQUE,
  subscription_endpoint TEXT NOT NULL REFERENCES public.push_subscriptions(endpoint) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookup, idempotency checks, and cleanup
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_key ON public.notification_deliveries(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON public.notification_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user ON public.notification_deliveries(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created_at ON public.notification_deliveries(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- Athletes can view their own deliveries; service role manages deliveries
DO $$ BEGIN
  DROP POLICY IF EXISTS "Athletes can view own notification deliveries" ON public.notification_deliveries;
  CREATE POLICY "Athletes can view own notification deliveries" ON public.notification_deliveries
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
END $$;

-- Atomic delivery claiming function
-- Atomically inserts or transitions a delivery to 'processing'
-- Returns TRUE if claimed, FALSE if already sent or actively processing
CREATE OR REPLACE FUNCTION public.claim_notification_delivery(
  p_idempotency_key TEXT,
  p_endpoint TEXT,
  p_user_id UUID,
  p_notification_type TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_claimed BOOLEAN := FALSE;
BEGIN
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
    p_idempotency_key,
    p_endpoint,
    p_user_id,
    p_notification_type,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
