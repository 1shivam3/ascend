-- ==============================================================================
-- SYNC TOMBSTONE TTL PRUNING (Phase 1.6, §10) — PROPOSED, NOT APPLIED.
--
-- PROBLEM: sync_tombstones rows are only ever deleted when a device
-- that holds a matching local tombstone confirms them, or when a
-- newer edit resurrects the record. A tombstone for a record no
-- device holds anymore (all devices pruned locally, account deleted,
-- guest data abandoned) lives forever. The table grows without bound,
-- and every sync pays a full read of it.
--
-- WHY A TTL IS SAFE: convergence needs a tombstone only until every
-- device that might still hold the record has synced once. 90 days is
-- far beyond any realistic offline window for this app; a device
-- offline longer than that re-runs the adoption/full-merge path on
-- its next sign-in anyway. The client is already tolerant of missing
-- tombstones (it treats the table as best-effort ordering evidence —
-- see resolveDeleteVsEdit / filterOutServerDeleted), so pruning can
-- never resurrect anything by itself: a stale local copy re-uploaded
-- after its tombstone was pruned is indistinguishable from a
-- legitimate offline edit, which is the accepted failure mode past
-- any finite TTL.
--
-- WHAT THIS DOES: a prune function + a weekly pg_cron schedule
-- (guarded: if pg_cron is unavailable, only the function is created
-- and pruning can be invoked manually or from an Edge Function cron).
--
-- NEVER AUTO-APPLIED. Applying it is the user's dashboard tap
-- (Supabase SQL Editor), same as 2026110501.
-- ==============================================================================

create or replace function public.prune_sync_tombstones(retention interval default interval '90 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.sync_tombstones
  where deleted_at < now() - retention;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- Weekly pruning, only when pg_cron is installed on the project.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'prune-sync-tombstones-weekly',
      '17 3 * * 0',
      $cron$select public.prune_sync_tombstones();$cron$
    );
  end if;
end;
$$;
