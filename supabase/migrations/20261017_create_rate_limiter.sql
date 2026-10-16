-- ==============================================================================
-- ASCEND STRENGTH & NUTRITION - API RATE LIMITER MIGRATION
-- ==============================================================================
-- Distributed sliding-window rate limiter using a Supabase-backed table.
-- Ensures consistent rate enforcement across all serverless function instances.
-- Safely degrades to in-memory when Supabase is unavailable.

-- 1. Table: public.api_rate_limits
--   Stores one counter row per (key, window_ms) so multiple instances share
--   the same counter instead of relying on per-process memory.
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key        TEXT NOT NULL,
  window_ms  BIGINT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  reset_at   TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (key, window_ms)
);

-- Indexes for efficient lookup and cleanup of expired windows
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_key ON public.api_rate_limits (key);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset ON public.api_rate_limits (reset_at);

-- 2. Stored Procedure: public.ascend_check_rate_limit
--   Atomically claims a slot via INSERT ... ON CONFLICT DO UPDATE.
--   Returns allowed, count, and reset_ms so the caller can compute remaining.
--   SECURITY DEFINER ensures consistent cross-instance enforcement.
CREATE OR REPLACE FUNCTION public.ascend_check_rate_limit(
  p_key           TEXT,
  p_window_ms     BIGINT,
  p_max_requests  INTEGER
)
RETURNS TABLE (
  allowed   BOOLEAN,
  count     INTEGER,
  reset_ms  BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now_ms     BIGINT := EXTRACT(EPOCH FROM now()) * 1000;
  v_window_ms  BIGINT := p_window_ms;
  v_count      INTEGER;
  v_reset_ms   BIGINT := v_now_ms + v_window_ms;
  v_allowed    BOOLEAN;
BEGIN
  -- Insert or update the rate limit row atomically
  INSERT INTO public.api_rate_limits (key, window_ms, count, reset_at)
  VALUES (p_key, v_window_ms, 1, to_timestamp(v_reset_ms / 1000))
  ON CONFLICT (key, window_ms) DO UPDATE
    SET count = CASE
                  WHEN api_rate_limits.reset_at < now() THEN 1  -- window expired, reset
                  ELSE api_rate_limits.count + 1
                END,
        reset_at = CASE
                     WHEN api_rate_limits.reset_at < now()
                     THEN to_timestamp(v_reset_ms / 1000)
                     ELSE api_rate_limits.reset_at
                   END
  RETURNING api_rate_limits.count INTO v_count;

  v_allowed := v_count <= p_max_requests;

  IF v_allowed THEN
    v_reset_ms := EXTRACT(EPOCH FROM (
      (SELECT reset_at FROM public.api_rate_limits WHERE key = p_key AND window_ms = v_window_ms)
    )) * 1000;
  ELSE
    v_reset_ms := EXTRACT(EPOCH FROM (
      (SELECT reset_at FROM public.api_rate_limits WHERE key = p_key AND window_ms = v_window_ms)
    )) * 1000;
  END IF;

  RETURN QUERY SELECT v_allowed, v_count, GREATEST(0, v_reset_ms - v_now_ms);
END;
$$;

-- 3. Role grants: least-privileged roles required by actual callers.
--   The function is SECURITY DEFINER, so it runs as the function owner
--   (typically the postgres service-role user). Grantees can execute it
--   without elevating their own privileges.
--   Granting to anon and authenticated allows serverless instances using
--   anon keys to enforce rates consistently. service_role is included for
--   admin/debugging paths.
REVOKE ALL ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) TO anon, authenticated, service_role;