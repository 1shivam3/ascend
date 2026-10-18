-- ==============================================================================
-- ASCEND STRENGTH & NUTRITION — SECURITY ADVISOR REMEDIATION:
-- USER FEEDBACK TABLE PRIVILEGES & INGESTION ISOLATION
-- ==============================================================================
-- Migration: 2026101804_harden_user_feedback_policy
-- Purpose:
--   1. Revokes direct relational table access on public.user_feedback from PUBLIC,
--      anon, and authenticated roles so untrusted clients cannot bypass
--      API route validation and rate limiting via PostgREST.
--   2. Drops the overly permissive public INSERT policy ("Allow public feedback submissions").
--   3. Grants full management privileges exclusively to service_role, preserving
--      server-side ingestion via /api/feedback with IP rate limiting and email dispatch.
-- ==============================================================================

-- 1. Ensure RLS is enabled
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

-- 2. Revoke direct relational access from untrusted client roles
REVOKE ALL ON TABLE public.user_feedback FROM PUBLIC;
REVOKE ALL ON TABLE public.user_feedback FROM anon;
REVOKE ALL ON TABLE public.user_feedback FROM authenticated;
GRANT ALL ON TABLE public.user_feedback TO service_role;

-- 3. Replace permissive public INSERT policy with least-privilege service_role policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow public feedback submissions" ON public.user_feedback;
  DROP POLICY IF EXISTS "Service role full access to user_feedback" ON public.user_feedback;

  CREATE POLICY "Service role full access to user_feedback" ON public.user_feedback
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
END $$;
