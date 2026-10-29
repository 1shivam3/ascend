-- Gauntlet R8: drop the live-only legacy "owner access" policies on
-- the coach tables.
--
-- The restrictive per-user policies from
-- 20261023_coach_blocks_weekly_reviews.sql ("Users can manage own
-- coach blocks" / "Users can manage own weekly reviews", scoped to
-- auth.uid() = user_id) remain in force. The live database ALSO has
-- "owner access" policies on both tables that no repo SQL creates;
-- permissive policies are OR'd in Postgres RLS, so a broad "owner
-- access" policy silently widens every user's reach. Removing them
-- restores the reviewed posture (see supabase/PRIVILEGES.md).
--
-- Apply manually from the Supabase SQL Editor (no migration runner).
-- Safe no-op when the legacy policies are absent.
--
-- ROLLBACK: intentionally NOT provided as SQL — recreating a
-- permissive policy would reintroduce the defect. If a rollback is
-- ever truly needed, recreate it from the dashboard policy history
-- and document it in supabase/PRIVILEGES.md in the same change.

DROP POLICY IF EXISTS "owner access" ON public.coach_blocks;
DROP POLICY IF EXISTS "owner access" ON public.weekly_reviews;
