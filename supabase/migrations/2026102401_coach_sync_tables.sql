-- ==============================================================================
-- ASCEND COACH CLOUD SYNC (Phase 2) — coach_blocks + weekly_reviews
-- ==============================================================================
-- Run this file ONCE in the Supabase dashboard SQL editor (project
-- gxghnmfdzmiubykooifs). It is idempotent: re-running it changes
-- nothing (IF NOT EXISTS / DROP POLICY IF EXISTS throughout).
--
-- SECTION 1 — the two tables coach sync needs. The app's sync engine
-- (src/lib/supabase/coach-sync.ts) reads/writes exactly these:
--   coach_blocks:   ONE row per user, id 'coach-blocks:<userId>',
--                   payload = the whole CoachBlocksState object
--                   (approved blocks, adopted plans, plateau choices).
--   weekly_reviews: ONE row per user per week,
--                   id 'weekly-review:<userId>:<weekMonday>',
--                   payload = that week's WeeklyReview object.
-- Until this section has run, coach sync soft-fails as "coach sync
-- pending setup": local coach state is kept, the rest of sync works,
-- and nothing is lost. Running this section activates coach sync.
--
-- SECTION 2 — QA4-006: the planned_workouts.extras column. The app
-- already carries description / goalTag / intensityMode in an `extras`
-- jsonb payload when syncing plans (see planFromRemoteRow); without
-- this column PostgREST rejects those rows and the fields stay
-- local-only. Same file so the user runs one script for both.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: coach sync tables
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coach_blocks (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weekly_reviews (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_blocks_user ON public.coach_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user ON public.weekly_reviews(user_id);

ALTER TABLE public.coach_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;

-- Each user may read/write ONLY their own rows (same pattern as the
-- other user-owned tables: profiles, workouts, planned_workouts, ...).
DO $$ BEGIN
  DROP POLICY IF EXISTS "Coach blocks owner access" ON public.coach_blocks;
  CREATE POLICY "Coach blocks owner access" ON public.coach_blocks
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Weekly reviews owner access" ON public.weekly_reviews;
  CREATE POLICY "Weekly reviews owner access" ON public.weekly_reviews
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- ------------------------------------------------------------------------------
-- SECTION 2: QA4-006 — planned_workouts.extras column
-- ------------------------------------------------------------------------------
-- NOTE: written as ADD COLUMN IF NOT EXISTS (rather than the bare
-- one-liner) so re-running this file never errors if the column is
-- already there; the effect is identical.

ALTER TABLE public.planned_workouts ADD COLUMN IF NOT EXISTS extras JSONB;
