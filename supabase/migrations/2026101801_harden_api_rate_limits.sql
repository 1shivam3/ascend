-- ==============================================================================
-- ASCEND STRENGTH & NUTRITION - RATE LIMITER RPC & TABLE HARDENING MIGRATION
-- ==============================================================================
-- Migration: 2026101801_harden_api_rate_limits
-- Purpose:
--   1. Restricts direct table access on public.api_rate_limits to service_role only.
--   2. Hardens public.ascend_check_rate_limit against search_path injection with
--      SET search_path = public, pg_temp.
--   3. Adds strict validation on p_key, p_window_ms, and p_max_requests to prevent
--      table bloat, negative windows, or zero-limit lockout attacks.
--   4. REVOKES function execution from PUBLIC, anon, and authenticated so untrusted
--      clients cannot call the RPC via Supabase PostgREST (/rest/v1/rpc/...).
--   5. GRANTS execution strictly to service_role for backend serverless callers.
--
-- Safety:
--   - Does NOT delete or reset any existing rate-limit counters.
--   - Idempotent and safe to execute multiple times.
-- ==============================================================================

-- 1. Enable Row Level Security and revoke direct relational access
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.api_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.api_rate_limits FROM anon;
REVOKE ALL ON TABLE public.api_rate_limits FROM authenticated;
GRANT ALL ON TABLE public.api_rate_limits TO service_role;

-- 2. Replace function with hardened validation and trusted search_path
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now_ms     BIGINT := EXTRACT(EPOCH FROM clock_timestamp()) * 1000;
  v_window_ms  BIGINT;
  v_max_req    INTEGER;
  v_key        TEXT;
  v_count      INTEGER;
  v_reset_ms   BIGINT;
  v_allowed    BOOLEAN;
BEGIN
  -- Strict input validation
  v_key := TRIM(COALESCE(p_key, ''));
  IF v_key = '' OR length(v_key) > 255 THEN
    RAISE EXCEPTION 'Invalid rate limit key: must be non-empty and <= 255 characters';
  END IF;

  IF p_window_ms IS NULL OR p_window_ms < 100 OR p_window_ms > 86400000 THEN
    RAISE EXCEPTION 'Invalid window_ms: must be between 100ms and 86400000ms (24h)';
  END IF;
  v_window_ms := p_window_ms;

  IF p_max_requests IS NULL OR p_max_requests < 1 OR p_max_requests > 100000 THEN
    RAISE EXCEPTION 'Invalid max_requests: must be between 1 and 100000';
  END IF;
  v_max_req := p_max_requests;

  v_reset_ms := v_now_ms + v_window_ms;

  -- Insert or update the rate limit row atomically
  INSERT INTO public.api_rate_limits (key, window_ms, count, reset_at)
  VALUES (v_key, v_window_ms, 1, to_timestamp(v_reset_ms / 1000.0))
  ON CONFLICT (key, window_ms) DO UPDATE
    SET count = CASE
                  WHEN api_rate_limits.reset_at < clock_timestamp() THEN 1  -- window expired, reset counter
                  ELSE api_rate_limits.count + 1
                END,
        reset_at = CASE
                     WHEN api_rate_limits.reset_at < clock_timestamp()
                     THEN to_timestamp((EXTRACT(EPOCH FROM clock_timestamp()) * 1000 + v_window_ms) / 1000.0)
                     ELSE api_rate_limits.reset_at
                   END
  RETURNING api_rate_limits.count, (EXTRACT(EPOCH FROM api_rate_limits.reset_at) * 1000)::BIGINT
  INTO v_count, v_reset_ms;

  v_allowed := v_count <= v_max_req;

  RETURN QUERY SELECT v_allowed, v_count, GREATEST(0::BIGINT, v_reset_ms - v_now_ms);
END;
$$;

-- 3. Restrict execution strictly to service_role (Least-Privilege)
REVOKE ALL ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) TO service_role;

-- ==============================================================================
-- VERIFICATION QUERY (Run after applying)
-- ==============================================================================
-- Confirm that anon and authenticated have ZERO execution privileges:
--
-- SELECT routine_name, grantee, privilege_type 
-- FROM information_schema.routine_privileges 
-- WHERE routine_name = 'ascend_check_rate_limit';
