-- Gauntlet R11: the profile avatar now syncs across devices.
--
-- profiles gains an avatar_url column holding the (already
-- downscaled) avatar data URL, so a second device shows the same
-- avatar instead of a blank. The client falls back to the
-- device-local mirror when this column is missing (older
-- deployments) — see the pull mapping in supabase/sync.ts.
--
-- Apply manually from the Supabase SQL Editor (no migration runner).
--
-- ROLLBACK: ALTER TABLE public.profiles DROP COLUMN IF EXISTS
-- avatar_url; (safe: older code never selects the column).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
