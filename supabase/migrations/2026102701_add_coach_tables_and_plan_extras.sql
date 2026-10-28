-- ==============================================================================
-- AUDIT F25 (2026-10-27): coach tables + planned_workouts.extras as a
-- standalone migration file.
--
-- PROBLEM: supabase/schema.sql already contains these objects (§16 coach
-- tables, §QA4-006 planned_workouts.extras), but supabase/migrations/
-- had NO file for them — schema.sql and the migrations folder disagreed,
-- so a fresh database built from migrations alone lacked the coach
-- tables and the extras column. This file closes that gap.
--
-- IDEMPOTENT AND NON-DESTRUCTIVE: every statement is IF NOT EXISTS /
-- DROP POLICY IF EXISTS guarded. It creates nothing that does not
-- already exist in schema.sql, and it changes no existing data.
--
-- NEVER AUTO-APPLIED BY THE AUDIT. Applying it is the user's dashboard
-- tap (Supabase SQL Editor), followed by the F-01 live-policy check
-- (own-row access on coach_blocks / weekly_reviews with a non-service
-- key). Until that tap, the coach tables exist only in schema.sql.
--
-- SCOPE NOTE (F-07): this file deliberately does NOT touch GRANTs on
-- the §1–8 core tables. Those tables are client-accessed, and the
-- correct least-privilege grant set depends on confirming which roles
-- actually query them live (anon vs authenticated vs service_role).
-- That needs a live-data check first; writing a blanket REVOKE from
-- code inspection alone could break sync. The coach tables below are
-- safe to scope because their access pattern is fully specified in
-- §16: own-row access for signed-in users (authenticated) + the
-- account-deletion purge (service_role).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. COACH TABLES (mirror of schema.sql §16, verbatim)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coach_blocks (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weekly_reviews (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_blocks_user_id ON public.coach_blocks (user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user_id ON public.weekly_reviews (user_id);

ALTER TABLE public.coach_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own coach blocks" ON public.coach_blocks;
  CREATE POLICY "Users can manage own coach blocks" ON public.coach_blocks
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own weekly reviews" ON public.weekly_reviews;
  CREATE POLICY "Users can manage own weekly reviews" ON public.weekly_reviews
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- Grants for the coach tables, mirroring the §10–15 pattern (revoke
-- from PUBLIC/anon first, then grant exactly the roles that use them):
-- authenticated for own-row client sync, service_role for the
-- account-deletion purge by user_id.
REVOKE ALL ON TABLE public.coach_blocks FROM PUBLIC;
REVOKE ALL ON TABLE public.coach_blocks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coach_blocks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coach_blocks TO service_role;

REVOKE ALL ON TABLE public.weekly_reviews FROM PUBLIC;
REVOKE ALL ON TABLE public.weekly_reviews FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weekly_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weekly_reviews TO service_role;

-- ------------------------------------------------------------------------------
-- 2. PLANNED_WORKOUTS.EXTRAS (mirror of schema.sql §QA4-006)
-- ------------------------------------------------------------------------------
-- The push path writes `extras` (plan builder metadata) and retries
-- without it on a missing-column error; without this column the retry
-- path is the permanent path and the fields stay local-only.
ALTER TABLE public.planned_workouts ADD COLUMN IF NOT EXISTS extras JSONB;
