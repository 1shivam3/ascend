-- Gauntlet DI-02 — PREPARED, NOT APPLIED.
--
-- Problem: BodyMetricEntry carries bodyFatPct / chestIn / waistIn /
-- hipsIn and CSV export includes them, but public.body_metrics had no
-- such columns, so the sync push/pull dropped them: measurements
-- tracked on one device vanished on the next.
--
-- Apply: run this in the Supabase dashboard SQL editor (this is the
-- user-tap step — no agent in this run applies migrations).
-- The client code in this tree is ALREADY safe before this migration:
-- the push retries without the measurement columns on a missing-column
-- error (same pattern as planned_workouts extras), and the pull mapping
-- tolerates their absence. Applying this migration simply starts
-- syncing measurements on the next push after it lands.
--
-- Safe to re-run (IF NOT EXISTS on every column). No data is deleted,
-- no column is renamed, no RLS policy is touched (existing policies
-- already cover all columns of this table).

ALTER TABLE public.body_metrics
  ADD COLUMN IF NOT EXISTS body_fat_pct NUMERIC(4, 1),
  ADD COLUMN IF NOT EXISTS chest_in NUMERIC(5, 1),
  ADD COLUMN IF NOT EXISTS waist_in NUMERIC(5, 1),
  ADD COLUMN IF NOT EXISTS hips_in NUMERIC(5, 1);
