-- ==============================================================================
-- ASCEND STRENGTH & NUTRITION - PRIVATE USER FEEDBACK & TELEMETRY MIGRATION
-- ==============================================================================
-- Additive, non-destructive migration creating the private user_feedback table.
-- RLS Policy:
-- - Allows INSERT from both anonymous and authenticated athletes.
-- - Strictly DENIES all public SELECT, UPDATE, and DELETE operations.
-- - Only service_role / project administrators can read or review submissions.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- Index for administrative query performance by date and category
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON public.user_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feedback_category ON public.user_feedback(category);

-- Enable Row Level Security
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

-- 1. Allow any user (authenticated or guest/anon) to submit private feedback
DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow public feedback submissions" ON public.user_feedback;
  CREATE POLICY "Allow public feedback submissions" ON public.user_feedback
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);
END $$;

-- 2. Explicitly ensure NO public SELECT policy exists (default deny)
-- Anon and authenticated users CANNOT read or list any feedback rows.
