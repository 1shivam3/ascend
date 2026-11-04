# ASCEND Final Certification — Round 1c-1: Database Integrity

- **Build audited:** master `62e25543`
- **Date:** 2026-11-04
- **Scope & method:** schema and integrity review from the repo SQL (`supabase/schema.sql`, 19 files in `supabase/migrations/`, `reconcile_existing_database.sql`), the local persistence layer (`src/lib/store.ts`, `src/lib/storage.ts`, `src/lib/update-sanitize.ts`), and the sync engine (`src/lib/supabase/sync.ts`, `reconcile.ts`). Plus **one read-only live metadata check** via the Supabase connector (service_role OpenAPI view): table and column names on the production project — no row data read, nothing written, **no migration applied or proposed for application**.
- **Headline result:** **No P0/P1 integrity defects found.** The design is local-first with a disciplined sync layer (tombstones, per-row newest-wins, push gates). Residual items are two P3 observations and design notes (§6).

---

## 1. Cloud schema inventory (repo SQL)

16 tables. Unless noted, every table's `user_id`/`id` is a FK to `auth.users(id) ON DELETE CASCADE`, so deleting an auth user cascades to all of their rows (the delete-account route additionally purges table-by-table and reports per-table results honestly, including a by-validated-email purge of `user_feedback`, which has no `user_id` column).

| Table | Primary key | Notable columns / types | Constraints & indexes |
|---|---|---|---|
| `profiles` | `id` UUID (= auth user id) | `name`, `gender`, `bodyweight_kg` NUMERIC(6,2), `bodyweight_lbs` NUMERIC(6,2), `height_cm` NUMERIC(5,1), `unit`, `goals` TEXT[], `diet_preference`, `avatar_url` (migration 2026102902) | Indexes via PK; RLS own-row |
| `personal_records` | `id` TEXT (client-minted) | `exercise`, `weight_kg`/`weight_lbs` NUMERIC(6,2) NOT NULL, `reps` INT NOT NULL, `one_rep_max` NUMERIC(6,2), `date` DATE | Indexes (user_id, exercise), (user_id, date DESC) |
| `workouts` | `id` TEXT | `date` DATE, `duration_minutes`, `exercises` JSONB NOT NULL DEFAULT '[]' | Index (user_id, date DESC) |
| `meals` | `id` TEXT | `name`, `date` DATE, `foods` JSONB NOT NULL DEFAULT '[]' | Index (user_id, date DESC) |
| `body_metrics` | `id` TEXT | `date` DATE, `weight_kg` NUMERIC(6,2) NOT NULL, `height_cm`; live DB additionally carries measurement columns (`body_fat_pct`, `waist_in`, `chest_in`, `hips_in`) from migration 2026102801 | Index (user_id, date DESC); **UNIQUE(user_id, date)** added by migration 2026102903 (dedupe-then-constrain; live application NOT VERIFIED — §5) |
| `daily_habits` | `id` TEXT, formatted `{user_id}_{date}` (the composite id enforces one row per user per day by construction) | `water_ml` INT, `creatine_taken`, `creatine_grams` NUMERIC(4,1), `gym_attended` | Index (user_id, date) |
| `planned_workouts` | `id` TEXT | `name`, `exercises` JSONB, `extras` JSONB (column-less plan fields: description, goalTag, intensityMode, coachBlockId) | Index (user_id) |
| `custom_barcodes` | `id` TEXT (digits-only barcode) | `data` JSONB NOT NULL | — |
| `coach_blocks` | `id` TEXT | `payload` JSONB NOT NULL | Index (user_id); §16 table — see §5 |
| `weekly_reviews` | `id` TEXT | `payload` JSONB NOT NULL | Index (user_id); §16 table — see §5 |
| `push_subscriptions` | `endpoint` TEXT | `p256dh`, `auth`, `user_agent`, `timezone`, `delete_token_hash` (migration 2026101806) | Indexes (user_id), (updated_at DESC) |
| `notification_preferences` | `user_id` UUID | `preferences` JSONB NOT NULL | PK is the user id (one row per user) |
| `notification_deliveries` | `id` UUID | `idempotency_key` TEXT **UNIQUE**, `subscription_endpoint` FK → `push_subscriptions(endpoint)` ON DELETE CASCADE, `status` CHECK IN (pending, processing, sent, failed), `attempt_count` | Indexes on key, status, user, created_at |
| `user_feedback` | `id` UUID | `category` CHECK IN (bug, feature, review, general), `rating` CHECK 1–5, `message`, `user_email`, `diagnostics` JSONB, `status` CHECK lifecycle | No user FK (guests submit) — purged on account deletion by validated email |
| `api_rate_limits` | PK (`key`, `window_ms`) | `count`, `reset_at` | RLS on, no client policies — service-role/RPC only |
| `consumed_deletion_nonces` | `jti` TEXT | `user_id` (nullable), `email` (nullable — anonymized on completed deletion), `status` (consumed/partial), `expires_at` | Indexes on expiry and email |

**Functions:** `ascend_check_rate_limit` (atomic fixed-window claim), `claim_notification_delivery` (atomic idempotent delivery claim), `cleanup_expired_deletion_nonces` — all SECURITY DEFINER with pinned `search_path` (hardened in migration 2026101803); EXECUTE on administrative definer functions is revoked from `anon`/`authenticated` (`schema.sql:403`).

**RLS:** enabled on all 16 tables; policies are owner-scoped (`auth.uid() = user_id`, WITH CHECK) for every user-data table, owner-SELECT for deliveries, and service-role-only for infrastructure tables, with least-privilege grants enforced by migration 2026101805. Full policy analysis in `security-audit.md` §7.

**Design note (Info):** set-level detail for workouts/meals lives in JSONB blobs (`exercises`, `foods`), so the database cannot enforce set-level constraints (reps > 0, weight ranges). Integrity for those rests entirely on the client-side sanitizers in §3 — acceptable for a local-first design, recorded so the reliance is explicit. Similarly, `personal_records` stores both `weight_kg` and `weight_lbs` with no DB CHECK tying them together (DB-03, §6).

## 2. Local data model

- **Engine:** one zustand store persisted as a single blob under localStorage key `ascend_store` (`src/lib/store.ts`), `createJSONStorage` over a custom adapter. Persist **versioning is in place**: `version: PERSIST_VERSION` with `migrate: migratePersistedState` (`src/lib/store.ts:4621`) — the migration deep-merges nested slices that carry default-on features so an old blob never silently loses them, and prior bumps are documented in-code (v2 → density default change; v3 → Simple-for-everyone).
- **`partialize`** (`partializeAppState`, `src/lib/store.ts:962`) defines exactly what persists; progress photos are excluded from the blob and live under their own key (`ascend_progress_photos_v1`).
- **Write-failure resilience:** the storage adapter mirrors writes to `ascend_emergency_snapshot`; on rehydration, if the profile is missing or workouts/PRs are empty, the app attempts recovery from (1) the emergency snapshot, then (2) legacy discrete keys (`ascend_profile`, `ascend_prs`, `ascend_workouts`, `ascend_meals`) — explicitly suppressed when `ascend_logged_out` is set, so recovery can never resurrect a logged-out session.
- **Validation on read/write:** hand-rolled throughout (no zod in the dependency tree). Writes are validated at the store boundary (§3); imports go through a dedicated validated path (§5); rehydration sanitizes the active-workout draft's set weights (string→number coercion, NaN dropped).
- **Corrupt data:** a blob that fails `JSON.parse` falls back to defaults in the legacy loaders (`src/lib/storage.ts` `load()`), and the store-level disaster-recovery path above covers a parseable-but-gutted blob. Import of a corrupt backup file is rejected with a recorded, user-readable reason (`getLastImportError`) — never a partial silent merge.

## 3. Integrity rules in code

- **IDs:** `generateId()` (`src/lib/storage.ts`) uses `crypto.randomUUID()`, falling back to `crypto.getRandomValues` — collision-resistant client-minted TEXT ids throughout.
- **Duplicate prevention / double-submit:** `addWorkout` is idempotent by id — re-adding an existing id is a no-op (`src/lib/store.ts:1730`), which is what makes the finish-workout path safe against double-taps and retries; the same guard pattern is applied to plan restore. Cloud-side, `notification_deliveries.idempotency_key` is UNIQUE with an atomic claim RPC, and the dispatcher checks the claim before sending.
- **Cascade behavior (local):** deleting a plan (`deletePlannedWorkout`, `src/lib/store.ts:2428`) rewires every weekly-schedule day that referenced it to a fallback plan (or an explicit Rest Day when none remain) and records a **deletion tombstone** (`deletedPlanIds`) so sync can never resurrect it. Historical workouts are *not* cascaded — they are the user's record and survive plan deletion by design.
- **Value guards:**
  - *Update paths* are clamped at the store boundary (`src/lib/update-sanitize.ts`): PR weight/oneRepMax 0–500 kg (`MAX_PR_WEIGHT_KG`), reps 1–1000, food calories 0–10,000 and macros 0–2,000 g, plan targets sets 1–50 / reps 1–1000 / RPE 1–10; non-finite numbers fall back to the existing value; invalid or future dates keep the existing date.
  - *Create path* (`addWorkout`) normalizes the date and coerces set weights (string→number, NaN→undefined) and stamps `updatedAt` — but does not range-clamp numeric weights (DB-01, §6).
  - *Server paths* clamp AI output independently (parse-meal/parse-voice/scan-meal — see security doc §4.3), so model hallucinations cannot write out-of-range values into the log via those flows.
- **Unit precision:** canonical storage is kilograms (float locally; NUMERIC(6,2) in Postgres). Display conversion kg→lbs happens at render; Round 1b-2's functional testing verified the arithmetic end-to-end — volume exact to the kg, Epley e1RM to the rounding, meal macros to the decimal, and the share card correctly rendering the week's 1,625 kg as 3,583 lbs under a lbs unit setting. One residual: PR rows persist both kg and lbs columns, kept in sync by client code only (DB-03, §6).
- **Dates & timezones:** day keys are **local** `YYYY-MM-DD` strings built by `getLocalTodayStr`; the codebase explicitly bans the `new Date().toISOString().split('T')[0]` pattern for day keys (UTC day-shift) in `src/lib/formatters.ts:38`, and `addWorkout` re-normalizes any incoming ISO timestamp to its local day (`normalizeDateToLocalDay`) so rows cannot silently drop out of day-matched features. Week boundaries are Monday-first everywhere via `getMondayOfWeek` (`src/lib/formatters.ts:246`, local midnight) — traced through `getWeekRange`/`getWeekDateStrings`, which feed consistency strips, the weekly recap, and coach comparisons. One exception found: DB-02 (§6).

## 4. Sync (local ↔ cloud)

- **Triggers:** a store subscription schedules a **debounced push** on any relevant change (`src/lib/supabase/sync.ts:1024`); an `online` event listener (`sync.ts:539`) re-runs sync on reconnect; pull runs on sign-in and app start. There is no separate outbox table — the local store *is* the queue: because every change is persisted locally first and pushes are whole-collection reconciliations, a failed or offline push loses nothing; the next change, reconnect, or launch re-pushes the current state. (Consequence, recorded honestly: a change made offline on a device that is never reopened online never reaches the cloud — inherent to the local-first design, not a defect.)
- **Conflict policy — per-row newest-wins, both directions** (`src/lib/supabase/reconcile.ts`):
  - *Push gate* (`shouldPushRow`/`filterRowsForPush`): a row is upserted only if absent remotely or its local `updatedAt` parses and is **strictly newer** than the remote stamp. Missing/unparseable stamps fail toward protecting the remote copy — a corrupt local stamp can never clobber cloud data.
  - *Pull* (`resolvePullWinner`/`recomputePullSlices`): strictly-newer wins; ties go to remote (so two devices converge instead of flip-flopping); slices are recomputed against *fresh* local state at apply time, so edits/deletes made mid-round-trip are not overwritten by the stale capture.
  - *Deletions* propagate via tombstone lists per collection; server-side deletion happens only for ids that are gone locally **and** explicitly tombstoned (`tombstonedIdsToDelete`) — a local reset/clear without tombstones can never wipe the cloud copy. Tombstones are pruned once the server confirms the row is gone.
  - *Profile* is last-write-wins with a stale-update guard (`shouldDropStaleProfileUpdate`): a profile edit made during a sync round-trip is never clobbered by the captured older remote row.
  - *Body metrics* get a dedicated post-merge dedupe by date (newest `updatedAt` wins, losers tombstoned), restoring the one-row-per-day invariant after cross-device unions — matching the DB UNIQUE(user_id, date) constraint.
  - **Documented residuals (in-code, accepted by the owner in an earlier round):** "newest" is judged by device clocks (skew can pick the wrong winner; server-side stamping would need a migration); deletions are not stamp-gated, so a newer remote edit can lose to an older local delete; there is no conflict UI — the losing side's content is not preserved.
- **Guest → account:** guest data merges into the account on first sign-in (union branch); a *different* account's sign-in triggers replace semantics. Guest identity is a stable per-device id (`ascend_guest_id`, minted once), so a guest who logs out and returns keeps attribution instead of orphaning data.
- **§16 dependency:** coach blocks / weekly reviews sync through the same engine; see §5 for the migration status.

## 5. Migrations: repo state vs live state

- **Repo:** `schema.sql` (consolidated) + 19 migration files, all idempotent/non-destructive by their headers; none is auto-applied by code — application is the owner's Supabase-dashboard action by design.
- **Live state, verified read-only this round** (OpenAPI metadata, service_role view):
  - All **16 tables exist live**, including `coach_blocks` and `weekly_reviews`.
  - Column-level spot checks confirm these migrations are reflected live: 2026101806 (`push_subscriptions.delete_token_hash`), 2026102701 — the **§16 migration** — (`planned_workouts.extras` present; coach tables present), 2026102902 (`profiles.avatar_url`), 2026102801 (body-metric measurement columns).
  - **Status of the §16 item (F-11):** the migration file is present in the repo and its objects verifiably exist on the live project. What remains **inert/unverified is the F-11 live round-trip test** (coach-blocks sync exercised against the real DB with a non-service key) and confirmation of the live RLS policies — both require a signed-in non-service-key probe, which is out of bounds for this round (see NOT TESTED). No action was taken on the database.
  - An extra live RPC, `/rpc/rls_auto_enable`, exists on the project but not in the repo SQL (a Supabase-side helper) — recorded for completeness; it is not referenced by application code.
- **NOT VERIFIED live:** the `body_metrics` UNIQUE(user_id, date) constraint (2026102903), grant states, function definitions, and policy definitions inside the live DB — OpenAPI metadata exposes tables/columns only.

## 6. Backup & restore

- **Export:** `buildFullBackup` (`src/lib/storage.ts`) produces a versioned (`version: '2.0.0'`) JSON from a single canonical field list (~55 state fields, shared by every exporter — Data Vault modal, storage helper, emergency snapshot — after an earlier divergence bug where the modal's export silently dropped fields). Credential-shaped keys are stripped on export.
- **Restore paths:** Settings restore routes store fields through the store's validated `importAllData` (`src/lib/store.ts:3838`) and side data (custom barcodes, progress photos) through `restoreBackupSideData`; onboarding uses `importFullBackupJSON` (`src/lib/storage.ts:483`) with the same sanitizer/gates. Import behavior: shape gate (≥1 recognized field), recursive prototype-pollution sanitization, 10 MB cap, every restored date normalized (future/malformed → today fallback, with the normalized count reported to the user), body metrics deduped by date, profile fields type/range-validated field-by-field, and **archive-first**: the pre-import state is archived so an import is undoable (skipped only when there is no retained history worth protecting, or for archive restores themselves).
- **Version compatibility:** the backup `version` string is informational on import — acceptance is by recognized-field presence, and per-field validation makes older/newer payloads degrade gracefully rather than fail wholesale.
- **Restore was NOT exercised live** in Round 1b-2 (exports were produced and verified; re-import was not run) — status: **code-reviewed only, NOT TESTED end-to-end**. Recorded here so the final certification does not overstate it.

## 7. Findings summary

| ID | Severity | Finding | Status |
|---|---|---|---|
| — | **P0 / P1** | **None** | — |
| DB-01 | P3 | Create path asymmetry: `addWorkout` coerces set weights but does not range-clamp them, while every update path clamps to 0–500 kg (`update-sanitize.ts`). A negative or >500 kg numeric weight from a buggy caller would pass the store boundary (downstream PR math filters `reps > 0` sets but keys off weight for top-set selection). UI inputs constrain values in practice; the gap is defense-in-depth only | Open — clamp at create for symmetry |
| DB-02 | P3 | One violation of the codebase's own date rule: `DEFAULT_CREATINE_SUPPLY.lastUpdated` is initialized with `new Date().toISOString().split('T')[0]` (`src/lib/store.ts:627`) — a UTC day key. For UTC+ timezones (e.g. IST) it records the previous day during early-morning hours. Impact limited to the initial creatine-supply stamp default | Open — use `getLocalTodayStr` |
| DB-03 | Info | Dual weight storage (`weight_kg` + `weight_lbs` on `personal_records`/`profiles`) with no DB CHECK tying the pair; consistency is client-maintained (sanitizers clamp both independently). Worst case is a display-level inconsistency, not corruption | Recorded |
| Info | Info | JSONB set/food detail is not DB-constrainable; integrity rests on client sanitizers (§1, §3) | Recorded |
| Info | Info | Sync residuals documented and previously accepted: device-clock skew in newest-wins, deletions not stamp-gated, no conflict UI | Recorded |

## 8. NOT TESTED (with reasons)

| Item | Reason |
|---|---|
| Backup restore / import exercised end-to-end | Not run in Round 1b-2 (exports verified only); code-reviewed in this round — a live restore test on a disposable profile remains an open certification item |
| Live `body_metrics` UNIQUE(user_id, date) constraint, live grants, live policy/function definitions | OpenAPI metadata exposes tables/columns only; SQL-level inspection of the production DB is out of bounds for this round |
| F-11 live coach-blocks sync round-trip | Needs a signed-in non-service-key session against production; the connector's service_role key bypasses the very RLS the test would validate |
| Concurrent multi-device sync against the live DB | Requires two live accounts/devices — out of bounds (no test-account creation) |
| Migration application or rollback | Owner's dashboard action by charter; nothing was applied in this round |
