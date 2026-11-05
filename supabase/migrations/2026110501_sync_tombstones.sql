-- ==============================================================================
-- SYNC CONVERGENCE (2026-11-05): server-stamped deletion tombstones.
--
-- PROBLEM (Phase 2 audit, S1/S2): deletions never converged across
-- devices. A delete lived only as a bare id in the deleting device's
-- local tombstone list; the push hard-deleted the server row and then
-- pruned the local tombstone, so a second device never learned of the
-- deletion — it kept its local copy and re-uploaded it on its next
-- push, resurrecting the record everywhere. And because deletes were
-- not ordered against edits, an OLD delete on one device could
-- hard-delete a NEWER edit made on another.
--
-- FIX: every deletion is also recorded here, stamped with WHEN it
-- happened. Sync pulls these rows before merging: a tombstone beats
-- any copy of the record whose updated_at is older than deleted_at;
-- a strictly newer edit resurrects the record and clears the
-- tombstone. The deleting device prunes its local tombstone only
-- after this table confirms the deletion is recorded.
--
-- WHY A TABLE, NOT deleted_at COLUMNS ON THE FIVE SYNCED TABLES: one
-- migration and one code path covers every collection, including
-- records whose rows are already gone; the cost is one extra small
-- table and one extra read per sync.
--
-- IDEMPOTENT AND NON-DESTRUCTIVE: every statement is IF NOT EXISTS /
-- DROP POLICY IF EXISTS guarded. It creates one new table and changes
-- no existing data.
--
-- NEVER AUTO-APPLIED. Applying it is the user's dashboard tap
-- (Supabase SQL Editor), followed by a live-policy check (own-row
-- access on sync_tombstones with a non-service key). Until that tap,
-- the client detects the missing table and falls back to the
-- pre-convergence behaviour — sync keeps working exactly as before.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TOMBSTONES TABLE (mirror of schema.sql §17)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_tombstones (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, collection, record_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_tombstones_user_id ON public.sync_tombstones (user_id);

ALTER TABLE public.sync_tombstones ENABLE ROW LEVEL SECURITY;

-- Sync Tombstones Policy
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own sync tombstones" ON public.sync_tombstones;
  CREATE POLICY "Users can manage own sync tombstones" ON public.sync_tombstones
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
END $$;

-- ------------------------------------------------------------------------------
-- 2. GRANTS (mirrors the coach-tables pattern: authenticated = own-row
-- client sync, service_role = account-deletion purge; the ON DELETE
-- CASCADE above also removes a deleted account's tombstones).
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.sync_tombstones FROM PUBLIC;
REVOKE ALL ON TABLE public.sync_tombstones FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sync_tombstones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sync_tombstones TO service_role;
