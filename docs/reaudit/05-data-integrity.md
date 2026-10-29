# Phase 5 — Data Integrity (Independent Re-Audit)

- **Commit audited:** `24a712a565d8713571fe57c314c3468ec3c0bc93` (master, Merge PR #61)
- **Scope:** persistence & sync model, reset/start-fresh purge path, body-metric
  uniqueness/date repair, import/restore date handling.
- **Method:** static code read of `src/lib/store.ts`, `src/lib/storage.ts`,
  `src/lib/supabase/{sync,reconcile}.ts`, `src/lib/formatters.ts`,
  `src/lib/history-fork.ts`, `src/lib/start-fresh-guard.ts`, migrations, plus a
  targeted vitest spot-run (12 files / 101 tests, all passed — see Phase 8 doc).
  No source files were modified. Live Supabase / two-device behaviour was NOT
  exercised (see NOT TESTED).

**Merge lineage sanity check** (`git log --oneline -15`): PR #58 `ad96d99`,
PR #59 `670e68d`, PR #60 `6f5c387`, PR #61 `24a712a` all present, in order, on
top of the gauntlet fix passes (`c4efbcb`, `84dafc7`, `5ebce33`). ✔

---

## 5.1 Persistence & sync model — mapped

**Local persistence (zustand persist).**
- Single main blob: persist `name: 'ascend_store'` (`src/lib/store.ts:4272`),
  written through the custom `mainStoreStorage` adapter (`store.ts:1025-1081`
  region; quota failures flip `mainStoreWriteFailed` instead of throwing, and
  follower-tab writes are suppressed via the tab-leader guard).
  `partializeAppState` (`store.ts:938ff`) defines exactly what is persisted.
- Side keys under the `ascend_` prefix (grep-verified inventory): main blob
  `ascend_store`; dedicated mirrors `ascend_progress_photos_v1`
  (`store.ts:637ff`, photos deliberately kept out of the blob),
  `ascend_avatar_v1` (`store.ts:653ff`); legacy discrete mirrors
  `ascend_profile / ascend_workouts / ascend_prs / ascend_meals /
  ascend_body_metrics / ascend_planned_workouts` (read only by boot disaster
  recovery, `store.ts:4337ff`); `ascend_emergency_snapshot` (2 s debounced
  snapshot, §5.2); archive slots `ascend_archived_history` /
  `ascend_archived_history_prev` (`src/lib/history-fork.ts:42-43`);
  `ascend_purge_at` (§5.2); `ascend_guest_id` (`storage.ts:64ff`);
  `ascend_logged_out`, `ascend_tab_leader`, `ascend_last_pushed_signature`,
  theme/supabase-config keys. Keys that survive a full reset are the explicit
  allowlist `PRESERVED_LOCAL_KEYS` (`src/lib/storage.ts:19-25`: supabase URL /
  anon key, theme, has_custom_theme, logged_out).

**Per-account namespacing — there is none at the key level, by design.**
All accounts on a device share the one `ascend_store` blob. Isolation is
logical, enforced at sync time (DI-03 guard, below), not by key namespacing.
This is a documented design, not a finding — but it makes the DI-03 guard the
*only* barrier against cross-account leakage, so it was checked carefully:

- Cross-account detection: `isCrossAccountSwitch(localProfileId, sessionUserId)`
  (`src/lib/start-fresh-guard.ts:57ff`) — true only for a non-guest id ≠ session
  user; `guest_`/`user_` ids route to the merge (guest-migration) branch.
- On a switch, sync **archives first, then replaces**: `archiveRetainedHistory()`
  then `Object.assign(updates, buildCrossAccountResetUpdates())`
  (`src/lib/supabase/sync.ts:1056-1076`). The reset builder
  (`sync.ts:23-46`) returns `buildFreshHistoryState()` minus the synced slices —
  i.e. coach blocks, weekly reviews, water/creatine logs, habits, goals, XP,
  streak, challenges all reset — plus `progressPhotos: []` and
  `healthConnectLastSyncedAt: null`. Device-level prefs (theme, language,
  density, notification prefs) are deliberately kept (documented in the
  builder comment). Progress-photos key and `ascend_custom_barcodes` are
  removed explicitly (`sync.ts:1069-1090`), with the archive holding the copy.
  Covering test: `tests/gauntlet-cross-account-reset.test.ts` (3 tests, passed).

**Sync push/pull & conflict policy (keep-newest / R1-DI-08).**
- Pull: six collections fetched scoped by `.eq('user_id', user.id)` / profile
  `.eq('id', user.id)` (`sync.ts:940-945`). Merge branch is tombstone-aware
  union (`src/lib/supabase/reconcile.ts:32ff mergeRemoteRecords`) recomputed
  against *fresh* state at apply time (`recomputePullSlices`, `reconcile.ts:139ff`;
  wired `sync.ts:1237ff`), with F28 signature-gated remote adoption and, when
  not adopting, per-row newest-wins: `resolvePullWinner` (`reconcile.ts:342ff` —
  strictly newer stamp wins, ties → remote, missing local stamp → remote).
- Push: every collection gated by `filterRowsForPush` / `shouldPushRow`
  (`reconcile.ts:365ff` — upsert only if absent remotely or strictly newer;
  rows carry their own `updatedAt`, never re-stamped `now`). Profile uses the
  same gate (`sync.ts:1494-1497`). Deletions propagate only for tombstoned ids
  (`tombstonedIdsToDelete`, `reconcile.ts:224ff`; `sync.ts:1708ff`), so a local
  reset (which clears tombstones) can never wipe the cloud copy.
- Profile mid-sync race (DI-09) is guarded by `shouldDropStaleProfileUpdate`
  (`reconcile.ts:262ff`, wired in sync.ts apply step).

**Logout → archive (never delete).**
`logout` (`store.ts:3505-3604`): sets `ascend_logged_out`, removes snapshot +
legacy profile mirror. The keep-data path archives before clearing: if
`hasRetainedHistory(...)` it calls `archiveRetainedHistory()` and only on
success clears the fresh slate (`store.ts:3570-3595`); a failed archive write
leaves live state intact. `logout({clearLocalData:true})` is the separate,
explicit destructive variant. ✔ matches the recorded decision.

## 5.2 Reset / start-fresh — purge path traced

Historical bug: a 2 s snapshot timer scheduled pre-reset fired after the purge
and resurrected purged data. All three layers of the fix are present:

1. **`clearTimeout` is the first statement of the snapshot subscribe callback**
   — `store.ts:4719` (`clearTimeout(syncTimer); syncTimer = null;`) executes
   before the follower guard and the data guard, so even the reset-to-defaults
   `set()` cancels a pending timer. Comment at `store.ts:4709-4718` documents
   exactly this root cause.
2. **Purge marker:** `export const PURGE_MARKER_KEY = 'ascend_purge_at'`
   (`store.ts:4703`). `clearAllData` (`store.ts:3419ff`) resets state, calls
   `purgeLocalAppData()` (`storage.ts:38-55` — removes every `ascend_` key not
   in `PRESERVED_LOCAL_KEYS`), re-claims tab leadership, then writes the marker
   *after* the purge so it survives it (`store.ts:3492-3501`). The snapshot
   timer additionally aborts at fire time if `marker >= syncTimerScheduledAt`
   (`store.ts:4740-4754`) and if it cannot prove current leadership
   (`store.ts:4729-4738`).
3. **Cross-tab convergence:** a `storage`-event listener (`store.ts:4814-4832`)
   initialises `lastSeenPurgeAt` from the current marker at boot (an old purge
   never wipes a fresh boot) and, on a newer marker, calls
   `clearAllData({ convergeOnly: true })` — in-memory reset only, no re-purge /
   re-claim / re-mark, so no loop. Covering tests:
   `tests/reset-purge-broadcast.test.ts`, `tests/data-purge.test.ts` (passed).

**Start fresh** (`startFreshFromRetainedHistory`, `store.ts:3646ff`):
archives first via `archiveRetainedHistory()` (`store.ts:3622ff`, full-backup
shape via `buildFullBackup`, previous archive rotated to the PREV slot —
DI-13) and **aborts with nothing cleared if the archive write fails**. It
deliberately does NOT call `purgeLocalAppData` (that would delete the archive
just written), removes only the legacy mirrors, then builds the documented
default profile (see Phase 8 item k). The Settings-level caller additionally
goes through the verified sign-out-first gate (`start-fresh-guard.ts`
`decideStartFreshGate`; `tests/start-fresh-guard.test.ts`). ✔

## 5.3 Body metrics

- **Local one-per-date invariant — enforced on every local write path:**
  `addBodyMetric` replaces same-date rows and tombstones the replaced ids
  (`store.ts:2231-2245`); `updateBodyMetrics` validates the date
  (`isValidEntryDate`, `store.ts:2280` — invalid/future → today), replaces
  same-date rows and tombstones them (`store.ts:2293-2325`); Health Connect
  merge is keyed by date and never overwrites manual entries
  (`src/lib/health-connect.ts:148-180`); boot rehydration dedupes by date
  (`store.ts:4437-4448`, but see DI-R2).
- **Server uniqueness:** migration `supabase/migrations/2026102903_body_metrics_unique_day.sql`
  dedupes keeping newest per `(user_id, date)` (lines 17-22) and adds
  `UNIQUE (user_id, date)` constraint `body_metrics_user_date_unique`
  (lines 24-32). (Applied by the user 2026-10-29 per project record; not
  re-verifiable from code.)
- **Date repair on import:** both import paths run
  `normalizeAndDedupeBodyMetricDates` (`src/lib/formatters.ts:210-240`):
  dates normalised via `normalizeImportedDate` (valid day unchanged;
  slash/ISO salvage → local day; malformed/future → today), then deduped by
  *expressed* date, last row wins; rows whose date was invalid and fell back
  to today are never collapsed into each other (F12a contract).
- **Duplicate-row creation paths found:** the *sync* path is not date-keyed —
  see DI-R1 / DI-R2 below.

## 5.4 Import / restore

- **Path A — `importAllData` (store, `store.ts:3778ff`):** shape gate
  (`isRecognizedBackupData`), archive-first undo (R4, gated on retained
  history, skipped for archive restores), date normalisation for prs /
  workouts / meals via `normalizeRowDates` and body metrics via
  `normalizeAndDedupeBodyMetricDates` (`store.ts:3805-3830`), validated
  profile rebuild, tombstone revival handling, and **R1 stamping: every
  imported row + the profile gets `updatedAt = now`** (`store.ts:3919-3930`
  and per-collection maps) so sync newest-wins cannot undo a restore.
  Normalised-row count is surfaced (`getLastImportNormalizedCount`).
- **Path B — `importFullBackupJSON` (storage, `storage.ts:407ff`):** 10 MB cap
  (R12, `storage.ts:425ff`), shape gate, prototype-pollution sanitiser,
  sensitive-key stripping, and the same date normalisation + body-metric
  dedupe written directly into the `ascend_store` blob
  (`storage.ts:494-506`). Used by Onboarding restore (`Onboarding.tsx:561-562`)
  and — problematically — *in addition to* Path A by Settings (DI-R4).
- **Date parser:** `parseImportedDateString` / `normalizeImportedDate`
  (`formatters.ts:106-163`): no bare `new Date(raw)`; YYYY-MM-DD, ISO
  datetimes (local day), and slash dates with >12 disambiguation (US order
  when ambiguous); future/non-calendar → today-fallback at row level. CSV
  workout import uses the same parser and *skips* future rows instead
  (`src/lib/workout-import.ts`; `tests/gauntlet-batch2-data.test.ts`).
- **Planned-workout future dates — scoped decision VERIFIED, not a bug:**
  `PlannedWorkout` has no entry `date` field at all (`src/lib/types.ts:535ff` —
  `id, name, exercises, createdAt, …`). Neither import path date-normalises
  plans: Path A only stamps `updatedAt` and passes all other plan fields
  through untouched (`store.ts:3983-3985`); Path B's normalisation loop covers
  only `workouts / meals / prs` + `bodyMetrics` (`storage.ts:494-506`). The
  future-date clamp therefore cannot touch plans or their scheduling data. ✔

---

## Findings

| ID | Sev | Finding | Evidence | Status |
|----|-----|---------|----------|--------|
| DI-R1 | P2 | **Cross-device same-date body metrics can duplicate and then fail to push.** Pull merge/recompute is keyed by `id` only (`reconcile.ts` `mergeRemoteRecords`, `recomputePullSlices`), never by date, and push upserts `onConflict: 'id'` (`sync.ts:1379,1393`). Two devices logging the same date before syncing (different ids) union into two local rows for one date; with the `2026102903` unique `(user_id, date)` constraint applied, the second row's upsert violates it and the body-metric push errors; without it, phantom duplicate weigh-ins persist. Every single-device path dedupes by date (§5.3) — only the sync path doesn't. | `src/lib/supabase/reconcile.ts:32ff,139ff`; `src/lib/supabase/sync.ts:1379,1393`; `supabase/migrations/2026102903_body_metrics_unique_day.sql:30-31` | OPEN (code-verified; live repro needs two devices/accounts — NOT TESTED live) |
| DI-R2 | P3 | **Baseline backfill can create a same-date duplicate.** Boot rehydration appends the `initial_bw_<profileId>` baseline entry dated at `profile.createdAt` checking only that the baseline *id* is absent — not that a user row already exists for that date; the by-date dedupe sits in the `else if` branch and does not run on the boot where the baseline is added. Self-heals locally on the next boot, but a sync in between hits DI-R1. | `src/lib/store.ts:4420-4448` | OPEN |
| DI-R3 | P3 | **`addBodyMetric` is an unvalidated bypass of the entry-date rule.** It stores the caller's entry (and date) verbatim — no `isValidEntryDate` / normalisation — unlike `updateBodyMetrics` (`store.ts:2280`). Currently latent: the only reference is a destructure in `Onboarding.tsx:116` and no production caller invokes it (grep-verified), but any future caller re-opens the future/malformed-date hole the other paths closed. | `src/lib/store.ts:2231-2245` vs `2268-2293` | OPEN (latent / unreachable today) |
| DI-R4 | P3 | **Settings restore runs BOTH import paths; the direct blob write discards Path A's guarantees.** `SettingsView.tsx:456-457` calls `importAllData(parsed)` (validated, archive-first, R1-stamped) and then unconditionally `importFullBackupJSON(content)`, which rewrites the `ascend_store` blob from the raw payload (`storage.ts:517`) — without R1 `updatedAt` stamps and without Path A's profile validation. In-memory state keeps Path A's version until reload; after reload the blob (Path B) version wins, so a restore's rows can lose their "newest intent" stamps and a subsequent sync newest-wins comparison can undo restored rows in favour of newer remote rows. Date normalisation itself is equivalent on both paths (§5.4), so this is a stamping/validation divergence, not a date bug. | `src/components/SettingsView.tsx:456-457`; `src/lib/storage.ts:407,517`; `src/lib/store.ts:3919-3930` | OPEN |
| DI-R5 | P3 | **No key-level per-account namespacing (documented design, single point of failure).** All accounts share `ascend_store`; isolation rests entirely on the DI-03 switch detection + archive-then-replace in sync (§5.1). It is present and tested, but any future sync-branch change that bypasses `isCrossAccountSwitch` leaks the previous account's unsynced slices with no second barrier. Recorded as a watch item, not a defect. | `src/lib/store.ts:4272`; `src/lib/supabase/sync.ts:23-46,950-1090` | ACCEPTED DESIGN / watch |

**Severity counts (Phase 5): P0: 0 · P1: 0 · P2: 1 · P3: 4**

## NOT TESTED (Phase 5)

| Item | Reason |
|------|--------|
| Two-device / two-account sync convergence, incl. DI-R1 live repro and the F28 two-device adoption check | Requires two live devices/sessions against a real Supabase project; not exercisable from code alone. Labelled, not guessed. |
| Whether migration `2026102903` (unique body_metrics day) is applied in the live DB | Dashboard-side state; project record says user-applied 2026-10-29, not re-verifiable from this tree. DI-R1's push-failure half is conditional on it. |
| Multi-tab purge convergence in real browsers (storage-event timing, leader election races) | Code + unit tests verified (`reset-purge-broadcast`, `data-purge` pass); real-browser tab races need a live browser session. |
| Emergency-snapshot disaster recovery end-to-end after a real purge | Boot code read (`store.ts:4337ff`, gated on `ascend_logged_out`); a live purge/reload cycle was out of scope for a read-only audit. |
