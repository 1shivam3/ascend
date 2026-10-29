# Supabase Roles, Privileges & RLS Policy Inventory

Why this file exists (final-release gauntlet, SEC-21): the project's
Row Level Security posture must be reviewable in reviewable SQL, not
only in the live database. The multi-user data table is
`public.user_state` (single JSON document per user). Its enabling
migration (`rls_policy.sql`) is applied out-of-band from the
Supabase SQL Editor and is NOT tracked in this repository — which is
how an undocumented policy can end up live with no review trail.
(Most recently: gauntlet R8 found live-only `owner access` policies
on `public.coach_blocks` and `public.weekly_reviews` that duplicate
the restrictive per-user policies in
`supabase/migrations/20261023_coach_blocks_weekly_reviews.sql`.)

This document is the standing inventory. Keep it current: whenever a
migration adds, drops, or changes a policy or a grant, update the
matching section here in the same change.

## Roles

| Role | How the app uses it | Notes |
| --- | --- | --- |
| `anon` | Unauthenticated Supabase Auth / PostgREST traffic only (sign-in, sign-up). | No direct table privileges should be granted; RLS must deny by default. |
| `authenticated` | Signed-in users, via the anon key + user JWT. All per-user data access goes through RLS. | Policies must scope every row to `auth.uid() = user_id` (or the table's owner column). |
| `service_role` | Server-only: cron dispatch, account deletion, coach/multi-account admin. Used only through `SUPABASE_SERVICE_ROLE_KEY` on the server. | **Bypasses RLS entirely.** Never expose the key to the client; never ship it in the bundle or the APK. |
| `postgres` | Dashboard / SQL Editor administration only. | The only path that runs DDL in this project (there is no automated migration runner). |

## Application tables (owner column / RLS posture)

- `public.user_state` (`user_id`) — single-document sync store.
  Policies: users can select/insert/update/delete only their own row
  (`auth.uid() = user_id`). Enabled by `rls_policy.sql` (applied
  out-of-band; see the out-of-band note below).
- `public.coach_blocks` (`user_id`) — coach block proposals.
  Policies (tracked SQL): "Users can manage own coach blocks"
  (SELECT/INSERT/UPDATE/DELETE, `auth.uid() = user_id`).
- `public.weekly_reviews` (`user_id`) — weekly coach reviews.
  Policies (tracked SQL): "Users can manage own weekly reviews"
  (SELECT/INSERT/UPDATE/DELETE, `auth.uid() = user_id`).
- `public.push_subscriptions` (`user_id` nullable for guest subs) —
  written via API routes using the service role. Anonymous upserts
  are keyed by endpoint + a per-subscription delete token.
- `public.notification_preferences` (`user_id`) — per-user reminder
  preferences; API routes use the service role.
- `public.notification_deliveries` (`user_id` nullable) —
  idempotency ledger for push dispatch; `idempotency_key` is UNIQUE.
  Service role only.
- `public.account_deletion_requests` (`user_id`) — partial-recovery
  ledger for account deletion. Service role only.
- `public.body_metrics` (`user_id`, `date`) — one row per user per
  day; UNIQUE(`user_id`, `date`) enforced by
  `supabase/migrations/20261029_body_metrics_unique_day.sql`
  (gauntlet DI-16).

## Migration application order

Migrations live in `supabase/migrations/` and are applied MANUALLY
from the Supabase SQL Editor (no migration runner is wired up).
Apply in filename order. As of the gauntlet fix pass the pending/new
ones are:

1. `20261023_coach_blocks_weekly_reviews.sql` — coach sync tables.
2. `20261029_body_metrics_unique_day.sql` — DI-16 dedupe + unique.
3. `20261029_drop_legacy_coach_owner_access.sql` — R8 policy cleanup.
   Safe no-op when the legacy policies are absent.
4. `20261029_profiles_avatar_url.sql` — R11 avatar column.

## Out-of-band SQL (must not stay tribal knowledge)

- `rls_policy.sql` (repo root) — RLS enablement + policies for
  `public.user_state`. Applied manually in the SQL Editor. If you
  change it, re-apply in the dashboard and note the date here.
- `supabase/rls_fix.sql`, `supabase/fix-*`, `supabase/drop_*` —
  one-off repair scripts from earlier incidents. Treat as historical
  records, not migrations; do not re-run without reading them first.

## Review checklist (run before any release)

1. Every table above has RLS ENABLED (Dashboard → Authentication →
   Policies, or `pg_policies`).
2. No permissive policy on an application table grants access beyond
   `auth.uid() = user_id` rows. Any `USING (true)` policy on user
   data is a release blocker (that was R8).
3. `service_role` key appears only in server environment variables,
   never in client code, `.env.local` committed files, or the APK.
4. New tables/policies/grants are added to this inventory in the
   same change that creates them.
