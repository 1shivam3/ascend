-- Gauntlet DI-16: one body_metrics row per user per day, enforced.
--
-- The client's updateBodyMetrics already replaces a same-date entry,
-- but imports and older writers could leave duplicate (user_id,
-- date) rows that then synced as phantom weigh-ins. This migration
-- dedupes (keeping the most recently updated row per user+date) and
-- adds the uniqueness the schema always implied.
--
-- Apply manually from the Supabase SQL Editor (no migration runner).
-- Run during a quiet window: the DELETE takes a brief write lock.
--
-- ROLLBACK: ALTER TABLE public.body_metrics DROP CONSTRAINT IF
-- EXISTS body_metrics_user_date_unique; (deleted duplicate rows are
-- NOT restorable — take a backup/export before applying if that
-- matters).

-- 1. Dedupe: keep the newest row per (user_id, date).
DELETE FROM public.body_metrics a
USING public.body_metrics b
WHERE a.user_id = b.user_id
  AND a.date = b.date
  AND (a.updated_at, a.created_at, a.id) < (b.updated_at, b.created_at, b.id);

-- 2. Enforce uniqueness going forward (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'body_metrics_user_date_unique'
  ) THEN
    ALTER TABLE public.body_metrics
      ADD CONSTRAINT body_metrics_user_date_unique UNIQUE (user_id, date);
  END IF;
END $$;
