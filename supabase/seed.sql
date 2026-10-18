-- ==============================================================================
-- ASCEND STRENGTH & NUTRITION — LOCAL DEVELOPMENT SEED SCRIPT
-- ==============================================================================
-- Purpose:
--   Executed automatically during local development database reset
--   (`supabase db reset`).
--
-- Safety:
--   - Contains zero real credentials or secrets.
--   - Does NOT add fake production user accounts.
--   - Safe and idempotent for all local development resets.
-- ==============================================================================

DO $$ BEGIN
  RAISE NOTICE 'ASCEND local database seed completed: database initialized for local testing.';
END $$;
