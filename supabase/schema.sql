-- ==============================================================================
-- ASCEND STRENGTH & NUTRITION TRACKER - SUPABASE DATABASE SCHEMA
-- ==============================================================================
-- Paste this entire SQL into your Supabase Dashboard -> SQL Editor and tap RUN.
-- This sets up all tables, indexes, and Row Level Security (RLS).

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. User Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'male',
  bodyweight_kg NUMERIC(6, 2),
  bodyweight_lbs NUMERIC(6, 2),
  height_cm NUMERIC(5, 1),
  unit TEXT NOT NULL DEFAULT 'kg',
  goals TEXT[] DEFAULT ARRAY['build_muscle']::TEXT[],
  diet_preference TEXT DEFAULT 'non_vegetarian',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Personal Records (PRs) Table
CREATE TABLE IF NOT EXISTS public.personal_records (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise TEXT NOT NULL,
  weight_kg NUMERIC(6, 2) NOT NULL,
  weight_lbs NUMERIC(6, 2) NOT NULL,
  reps INTEGER NOT NULL,
  one_rep_max NUMERIC(6, 2) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Workouts Table
CREATE TABLE IF NOT EXISTS public.workouts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  date DATE NOT NULL,
  duration_minutes INTEGER,
  notes TEXT,
  exercises JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Meals Table
CREATE TABLE IF NOT EXISTS public.meals (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  foods JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Body Metrics (Weigh-ins & Measurements) Table
CREATE TABLE IF NOT EXISTS public.body_metrics (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  weight_kg NUMERIC(6, 2) NOT NULL,
  height_cm NUMERIC(5, 1),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Daily Habits (Water, Creatine, Gym attendance) Table
CREATE TABLE IF NOT EXISTS public.daily_habits (
  id TEXT PRIMARY KEY, -- formatted as {user_id}_{date}
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  water_ml INTEGER DEFAULT 0,
  creatine_taken BOOLEAN DEFAULT false,
  creatine_grams NUMERIC(4, 1) DEFAULT 0,
  gym_attended BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Planned Workouts (Workout Routines & Templates) Table
CREATE TABLE IF NOT EXISTS public.planned_workouts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  exercises JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Custom Barcodes Table
CREATE TABLE IF NOT EXISTS public.custom_barcodes (
  id TEXT PRIMARY KEY, -- clean numeric barcode string
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- INDEXES FOR HIGH-SPEED TIME-SERIES QUERIES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_prs_user_exercise ON public.personal_records(user_id, exercise);
CREATE INDEX IF NOT EXISTS idx_prs_user_date ON public.personal_records(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON public.workouts(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON public.meals(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_body_metrics_user_date ON public.body_metrics(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_habits_user_date ON public.daily_habits(user_id, date);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_user ON public.planned_workouts(user_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
-- Athletes can ONLY read, insert, update, and delete their own data.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planned_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_barcodes ENABLE ROW LEVEL SECURITY;

-- Profiles Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;
  CREATE POLICY "Users can manage own profile" ON public.profiles
    FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
END $$;

-- Personal Records Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own PRs" ON public.personal_records;
  CREATE POLICY "Users can manage own PRs" ON public.personal_records
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- Workouts Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own workouts" ON public.workouts;
  CREATE POLICY "Users can manage own workouts" ON public.workouts
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- Meals Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own meals" ON public.meals;
  CREATE POLICY "Users can manage own meals" ON public.meals
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- Body Metrics Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own body metrics" ON public.body_metrics;
  CREATE POLICY "Users can manage own body metrics" ON public.body_metrics
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- Daily Habits Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own daily habits" ON public.daily_habits;
  CREATE POLICY "Users can manage own daily habits" ON public.daily_habits
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- Planned Workouts Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own planned workouts" ON public.planned_workouts;
  CREATE POLICY "Users can manage own planned workouts" ON public.planned_workouts
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- Custom Barcodes Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own custom barcodes" ON public.custom_barcodes;
  CREATE POLICY "Users can manage own custom barcodes" ON public.custom_barcodes
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- 10. Private User Feedback & Bug Reports Table
CREATE TABLE IF NOT EXISTS public.user_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL CHECK (category IN ('bug', 'feature', 'review', 'general')),
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  title TEXT,
  message TEXT NOT NULL,
  user_name TEXT,
  user_email TEXT,
  diagnostics JSONB DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'in_progress', 'resolved', 'closed')),
  email_delivered BOOLEAN DEFAULT false,
  email_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_feedback FROM PUBLIC;
REVOKE ALL ON TABLE public.user_feedback FROM anon;
REVOKE ALL ON TABLE public.user_feedback FROM authenticated;
REVOKE ALL ON TABLE public.user_feedback FROM service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.user_feedback TO service_role;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow public feedback submissions" ON public.user_feedback;
  DROP POLICY IF EXISTS "Service role full access to user_feedback" ON public.user_feedback;

  CREATE POLICY "Service role full access to user_feedback" ON public.user_feedback
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
END $$;


-- 11. Push Subscriptions Table (Web Push Infrastructure)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated ON public.push_subscriptions(updated_at DESC);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC;
REVOKE ALL ON TABLE public.push_subscriptions FROM anon;
REVOKE ALL ON TABLE public.push_subscriptions FROM authenticated;
REVOKE ALL ON TABLE public.push_subscriptions FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO service_role;

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

-- 12. Notification Preferences Table (Reminder Center Settings)
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Athletes can manage own notification preferences" ON public.notification_preferences;
  CREATE POLICY "Athletes can manage own notification preferences" ON public.notification_preferences
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
END $$;


-- 13. Notification Deliveries Ledger (Durable Idempotency & Web Push Delivery State)
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

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_key ON public.notification_deliveries(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON public.notification_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user ON public.notification_deliveries(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created_at ON public.notification_deliveries(created_at DESC);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notification_deliveries FROM PUBLIC;
REVOKE ALL ON TABLE public.notification_deliveries FROM anon;
REVOKE ALL ON TABLE public.notification_deliveries FROM authenticated;
REVOKE ALL ON TABLE public.notification_deliveries FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_deliveries TO service_role;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Athletes can view own notification deliveries" ON public.notification_deliveries;
  CREATE POLICY "Athletes can view own notification deliveries" ON public.notification_deliveries
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
END $$;

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

REVOKE ALL ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_delivery(TEXT, TEXT, UUID, TEXT) TO service_role;


-- ==============================================================================
-- SECURITY HARDENING & LINTER RESOLUTIONS
-- ==============================================================================
-- Revoke execution of any administrative SECURITY DEFINER functions from anon/authenticated
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rls_auto_enable' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ==============================================================================
-- API RATE LIMITING (Distributed, cross-serverless-instance)
-- ==============================================================================
-- Table: public.api_rate_limits
--   Stores a single row per (key, window_start) so multiple serverless
--   invocations share the same counter instead of relying on in-process memory.
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key        TEXT NOT NULL,
  window_ms  BIGINT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  reset_at   TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (key, window_ms)
);

-- Indexes for efficient lookup and cleanup
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_key ON public.api_rate_limits (key);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset ON public.api_rate_limits (reset_at);

-- Security: Enable RLS and restrict direct table access
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.api_rate_limits FROM anon;
REVOKE ALL ON TABLE public.api_rate_limits FROM authenticated;
REVOKE ALL ON TABLE public.api_rate_limits FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_rate_limits TO service_role;

-- Stored Procedure: ascend_check_rate_limit
-- Atomically increments the rate limit counter for a given key within a sliding
-- window. Returns a JSON object with: allowed, count, reset_ms.
-- Uses INSERT ... ON CONFLICT to ensure atomicity within a single transaction.
-- Hardened with SET search_path = public, pg_temp and strict input validation.
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

-- Restrict execution strictly to service_role (Least-Privilege)
REVOKE ALL ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ascend_check_rate_limit(TEXT, BIGINT, INTEGER) TO service_role;

-- 15. Consumed Deletion Nonces Table (Durable Account Deletion Ledger)
-- Prevents replay attacks across multiple serverless function instances and restarts.
-- Supports tracking partial deletion recovery states.
CREATE TABLE IF NOT EXISTS public.consumed_deletion_nonces (
  jti         TEXT PRIMARY KEY,
  user_id     UUID,
  email       TEXT, -- Nullable to allow anonymizing personal identifiers upon complete deletion
  status      TEXT NOT NULL DEFAULT 'consumed', -- 'consumed' | 'partial'
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Index by expiry for cleanup
CREATE INDEX IF NOT EXISTS idx_consumed_deletion_nonces_exp
  ON public.consumed_deletion_nonces (expires_at);

-- Index by email for lookup during recovery requests
CREATE INDEX IF NOT EXISTS idx_consumed_deletion_nonces_email
  ON public.consumed_deletion_nonces (email);

-- Enable RLS: only service role can access this table
ALTER TABLE public.consumed_deletion_nonces ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.consumed_deletion_nonces FROM PUBLIC;
REVOKE ALL ON TABLE public.consumed_deletion_nonces FROM anon;
REVOKE ALL ON TABLE public.consumed_deletion_nonces FROM authenticated;
REVOKE ALL ON TABLE public.consumed_deletion_nonces FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.consumed_deletion_nonces TO service_role;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access to consumed_deletion_nonces" ON public.consumed_deletion_nonces;
  CREATE POLICY "Service role full access to consumed_deletion_nonces"
    ON public.consumed_deletion_nonces
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
END $$;

-- Retention policy: Purge nonces 48 hours after expiration (audit window buffer)
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

REVOKE ALL ON FUNCTION public.cleanup_expired_deletion_nonces() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_deletion_nonces() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_expired_deletion_nonces() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_deletion_nonces() TO service_role;
