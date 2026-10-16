-- ==============================================================================
-- ASCEND STRENGTH & NUTRITION - DELETION NONCES & RECOVERY MIGRATION
-- ==============================================================================
-- Durable single-use nonce ledger for account deletion tokens.
-- Ensures replay rejection across multiple serverless instances and restarts.
-- Supports partial deletion recovery tracking so failed cleanups can be resumed.

CREATE TABLE IF NOT EXISTS public.consumed_deletion_nonces (
  jti         TEXT PRIMARY KEY,
  user_id     UUID,
  email       TEXT, -- Nullable to allow anonymizing/scrubbing personal identifiers upon complete deletion
  status      TEXT NOT NULL DEFAULT 'consumed', -- 'consumed' | 'partial'
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Ensure email column is nullable if table already existed with NOT NULL
ALTER TABLE public.consumed_deletion_nonces ALTER COLUMN email DROP NOT NULL;

-- Index by expiry for automated cleanup jobs
CREATE INDEX IF NOT EXISTS idx_consumed_deletion_nonces_exp 
  ON public.consumed_deletion_nonces (expires_at);

-- Index by email for lookup during recovery requests
CREATE INDEX IF NOT EXISTS idx_consumed_deletion_nonces_email 
  ON public.consumed_deletion_nonces (email);

-- Enable RLS: only service role can access this table
ALTER TABLE public.consumed_deletion_nonces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to consumed_deletion_nonces"
  ON public.consumed_deletion_nonces;

CREATE POLICY "Service role full access to consumed_deletion_nonces"
  ON public.consumed_deletion_nonces
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Retention policy: Purge nonces 48 hours after expiration (audit window buffer)
CREATE OR REPLACE FUNCTION public.cleanup_expired_deletion_nonces()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.consumed_deletion_nonces
  WHERE expires_at < now() - INTERVAL '48 hours';
END;
$$;
