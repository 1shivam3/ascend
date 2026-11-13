# STATE MACHINES — ASCEND

The catalogue of the app's state machines after the 2026-11 state-machines
program (Phases 0–5, PRs #129–#133 + the Phase 5 PR). Every machine that was
"implicit" — a union field plus an orthogonal boolean, a value stored twice,
a state encoded by presence/absence — is now either **one discriminated
union with a pure transition function**, a **single derivation** from one
source of truth, or **documented here as intentional**.

How to read an entry: **Owner** = the file that defines the union/transitions.
**Invariant** = what can never be true, enforced by construction or pinned by
`tests/state-invariants-phase5.test.ts`. Verification evidence for every §
lives in `qa/STATE_VERIFICATION.md`.

**Adding a state?** See CONTRIBUTING.md → "Adding a state to a machine".

---

## Sync & data safety (Phase 1–2)

### §1/§2 Sync engine state
- **Owner:** `src/lib/supabase/sync-state.ts` (engine wiring: `supabase/sync.ts`)
- **States:** `not-initialized | unconfigured | signed-out | idle{waitingForMergeChoice} | syncing{startedAt, attempt, wentOffline} | synced{at} | offline | error{errorKind, message, attempt, nextRetryAt}`
- **Transitions:** one pure reducer (`syncStateReducer`); the engine dispatches
  events only. Sign-out/delete reset through one shared path with a generation
  counter — an in-flight sync from a dead generation cannot write `synced`.
- **Invariant:** never `synced` while signed out (a `sync-succeeded` outside
  `syncing` is dropped by the reducer). The UI reads ONE selector
  (`selectSyncLabel`) — banner, Today caption and Settings cannot disagree
  (recorded bug B3).

### §3 Logged-out latch
- **Owner:** `src/lib/logged-out-latch.ts` — `markLoggedOut` / `clearLoggedOutLatch` / `isLoggedOutLatchSet`.
- Only the exact string `'true'` counts; a stale latch is cleared at the moment
  a live session is observed. The persisted key string exists in no other file
  (source-guard test).

### §4 Merge-choice gate
- **Owner:** `src/lib/supabase/sync.ts` (gate + signature).
- The data signature hashes row **content** (canonical serialization), not just
  ids. The pending choice is persisted (`ascend_merge_choice_pending`) so a
  reload resumes the gate; a suppress marker is recorded only with a fresh
  sign-in intent (≤ 1 h) and releases an engaged gate.
- **False sub-claim (Phase 1):** the inventory's ">500 ms wall-clock heuristic"
  does not exist in this tree; sign-in intent was already structural.

### §5/§6/§27 Identity
- **Owner:** `src/lib/identity.ts` — `classifyIdentity(...)` returns
  `guest-local | guest-anon | account | account-cross{profileId} | account-offline-stale`.
- Cross-account is decided by provenance (`createdByUid`, `importedFromBackup`),
  never by the profile-id string alone; an imported profile is treated as
  cross-account unless proven same. Push **refuses** over a cross-account
  profile. "Guest" is this derivation, never a stored value.

### §7 Sync quarantine
- **Owner:** `src/lib/supabase/sync.ts` (push outcome application).
- Per-row quarantine entries persist an **error class**, never the raw server
  message. Schema errors (`42703` / `PGRST204`) are transient — the whole cycle
  fails and retries after the migration lands; they are never quarantined
  per-row. Stamps come from the payload row; a stamp-less row stays quarantined
  until an edit stamps it.

### §8 Adoption baseline
- **Owner:** `src/lib/supabase/sync.ts`. The last-pushed signature key is
  user-scoped (`ascend_last_pushed_signature:<userId>`); the legacy unscoped
  value is discarded on first contact (costs one full reconciliation, never
  data).

### §9 Conflict rules
- **Owner:** `src/lib/supabase/reconcile.ts`. One rule for edit-vs-edit:
  `shouldPushRow(local, remote) = remote === undefined || resolvePullWinner(local, remote) === 'local'`
  — the pull winner and the push gate can no longer disagree. Delete-vs-edit
  was already unified. Losers are recorded (`ascend_sync_conflicts_v1`, newest
  50) instead of vanishing. Clock-skew assumption documented in the file.
- Deliberate exception: profile-newer checks still require both stamps.

### §10 Tombstones
- **Owner:** `src/lib/store.ts` — `applyDeletionToState` / `applyRestoreToState`
  are the only transitions for the five tombstone lists + stamp map.
- **Invariant:** a record is never live and tombstoned at once
  (`findLiveTombstoneOverlaps` must return `[]`). Restores re-stamp via
  `stampEditedRow` — an Undo of an already-synced deletion is no longer
  silently undone by the next sync. Server TTL: migration
  `2026111301_sync_tombstone_ttl.sql` (90-day prune) — **proposed, applied by
  the owner from the dashboard, not by code**.

### §11 Coach-blocks sync baseline
- **Owner:** `src/lib/supabase/sync.ts`. The baseline signature is canonical
  (sorted-key serialization); `localEditedAt` clears when an edit reverts to
  the baseline, via the pure `nextCoachBlocksSyncMeta`.

### §12 History archive
- **Owner:** `src/lib/history-fork.ts`. One key holds
  `{version: 2, archives: [newest, previous]}` (max 2 generations);
  `appendArchive()` is the only writer, so rotation is a single atomic write
  and a failed write aborts before live state is cleared. All readers share
  one fallback: the newest **readable** generation wins; legacy bare backups
  in either old key are read as generations and migrate on the next append.

### §13 Tab leadership — INTENTIONAL
- **Owner:** `src/lib/tab-leader.ts`. **Fail-open without storage is by
  design** (documented in the file header since before the program): the
  stored record + timestamp is the truth; in-memory flags may lag one
  heartbeat. `stop()` resets the flags; unload cleanup proves leadership from
  the record (`isProvenLeader`), never from the flags.

### §14 Deletion nonce
- **Owner:** `src/lib/deletion-token.ts` + the `consumed_deletion_nonces` ledger.
- **Transitions:** `unseen → partial → consumed`; `consumed` is terminal. The
  memory record never downgrades; the ledger 'partial' write is
  `ON CONFLICT DO NOTHING`. `isNonceConsumed` **fails closed** on a DB read
  error when a client is supplied; a missing/garbage status coerces to
  consumed (fail-safe). Known limitation, documented in code: without a
  dbClient, replay protection is per-instance memory.

## Training domain (Phase 3)

### §15 Workout draft
- **Owner:** `src/lib/types.ts` (the one `ActiveWorkoutDraft` definition) +
  store autosave. One slot; `isStaleDraft` (12 h) drives a "Resume or discard?"
  prompt on resume. Drafts persist as given — a just-started draft carries
  `sessionStartTime`, the elapsed timer's only source across remounts (a
  Phase 3 gate regression proved the hard way that zero-exercise drafts must
  NOT be auto-cleared).

### §16/§18 Today + schedule
- **Owner:** `src/lib/scheduled-days.ts` (`resolvePlannedDay`, `dayPlanRef`) +
  `getTodaySessionState` in `src/lib/workout-engine.ts`.
- A schedule day is `{kind:'rest'} | {kind:'plan', planId} | unassigned` —
  'rest' is a kind, never a magic string in the plan-id field. The persist
  migration converts old shapes and repairs dangling plan refs.
- **Invariant:** Today returns exactly one status; precedence is draft
  (`in_progress`) → completed (requires ≥ 1 completed set — a zero-set log
  completes nothing) → schedule (`rest` is a real status). Today and
  Consistency read the same resolver (recorded bugs B4, B5).

### §17 Set status
- **Owner:** `src/lib/types.ts` — `resolveSetStatus` is the one precedence
  implementation (stored status wins; the `completed` boolean is a legacy
  encoding normalized by `normalizePersistedWorkoutSet` at the persist and
  import seams; `'pending'` exists only in the live draft, never persisted).
  One deliberate context difference, named in code: history infers completion
  from reps, the active draft does not.

### §19 Coach blocks
- **Owner:** `src/lib/block-engine.ts` + store settle pass.
- Blocks settle on load (`settleCoachBlocks`): a finished block is archived
  with its terminal label immediately, not lazily when a successor is
  approved. Past blocks cap at 8 **with a count kept**
  (`compactedBlockCount`) — the cap is no longer silent. Proposal dismissals
  are recorded (cap 3), one convention everywhere: status `'dismissed'`.

### §20 Training decisions
- **Owner:** `src/lib/training-decision-policy.ts`. `DecisionStatus` =
  `pending | accepted | overridden | dismissed`; **`'applied'` is derived**
  (`decisionEffectiveStatus` joins the audit list) — deliberately not stored,
  because the apply-validator's already-applied check pins the stored value
  to exactly `'accepted'`. One selector serves every reader, so stored and
  shown status cannot disagree.

### §21 Rest timer
- **Owner:** `src/lib/rest-timer.ts` (pure reducer) + `src/lib/use-rest-timer.ts`.
- **States:** `idle | running | paused | finished`; `endsAt` is authoritative
  and non-null **iff** running. One `start` path (the only alert-scheduling
  path) — the two inline copies that never set the end ref are gone
  (the "timer claims running, no countdown" bug).

### §22 Run player + Couch-to-5K
- **Owner:** `src/lib/run-player.ts` (reducer) + `src/lib/run-program.ts`.
- A run counts toward a session only at ≥ 80% of its intervals
  (`RUN_COMPLETION_THRESHOLD`), from structured counts on the entry
  (`runIntervalsCompleted/Total`, stamped with `runEnrollmentId`); legacy
  entries without counts count as complete (documented). No enrollment →
  progress is never "complete". Deleting a run entry that would un-complete
  a session warns first.

### §23 Personal records
- **Owner:** `src/lib/pr-reevaluation.ts`. One source of truth: derived PRs
  are a **replay** of workout history (`replayExerciseOutcomes`), reconciled
  on delete, set edit and Undo; manual records are user-owned and never
  touched by the reconciler. Read-time PR marks (`computeSessionPRMarks`)
  derive from the same replay, so Coach's Take, the finish banner and the
  history badge cannot disagree (recorded bugs B1, B2). Baselines are the
  `isBaseline` flag, written at mint time and backfilled by migration — the
  notes-text encoding is gone. `WorkoutSet.isPR` no longer exists.
- **Invariant:** applying the reconcile plan then replanning yields an empty
  plan (stored PRs ≡ recomputation + manual).

### §24 Check-in flow
- **Owner:** `src/lib/coach-session.ts`. Steps are keyed by question **id**,
  not index (a soreness answer rebuilds the list mid-flow); "done today" is
  `ManualCheckin.completedAt` present, not "a record exists" (every answer
  saves immediately).

## App flows, UI, AI (Phase 4)

### §25/§26 Onboarding + entry gate
- **Owner:** `src/components/onboarding/Onboarding.tsx` + `selectHasCompletedOnboarding` in `src/lib/store.ts`.
- The screen union has exactly the 8 real screens; the dead `'experience'` /
  `'schedule'` members are gone from the type, and legacy deep links still
  remap to `'details'` at parse time.
- **Completion is derived, not stored:** `hasCompletedOnboarding` was a
  boolean written at ~10 sites in the same actions that set/nulled the
  profile; the derivation `profile !== null` is exactly equivalent (the
  profile is staged locally through the flow and committed only at
  completion, which is also what the entry gate keys on). The stored key is
  deleted by the persist migration.
- **Progress persistence, scoped:** only the furthest *pre-input* screen id
  is stored (`ascend_onboarding_screen`); screens past goals resume at
  goals. No answers are ever persisted. Cleared on completion and logout.

### §28 Coach action cards
- **Owner:** `src/lib/coach-action-executor.ts` — `deriveActionState` is the
  ONE derivation for render and the settle pass.
- **States:** `pending | applied | dismissed | stale | superseded | undone`
  ('undone' is a state; the side boolean is gone). The message type is a
  discriminated union — `actionState` without `action` is a compile error.
  `actionBase` is an explicit tagged capture (`{status:'captured', goals}`);
  `readActionBase` normalizes legacy raw captures. Legacy threads
  (applied + `undone:true`) derive/settle to `'undone'` — no storage rewrite.

### §29 Meal scan
- **Owner:** `src/lib/meal-scan-flow.ts`. Flow: `select | cameraLive |
  cameraDenied | capturing | analyzing | review{source} | error{reason}`,
  where `source: 'cloud' | 'offline' | 'refined'` and the review **shows**
  its source. Camera permission is its own small machine
  (`unknown | requesting | granted | denied | unsupported`). The offline
  estimate enters review through the same transitions (synchronously — no
  fake analyzing pass). Busy flags that gate no transition (file
  compression, refining spinner) deliberately stay local to the component.

### §30 Detection outcome (Form Coach)
- **Owner:** `src/features/form-coach/hooks/useFormCoach.ts`. One vocabulary:
  `resolveDetectionOutcome`. The legacy resolver (and its unmapped
  `'not-squat'` outcome) is deleted — grep proved zero production callers.

### §31 MovementPhase
- **Owner:** `src/features/form-coach/...` rep state machines. `'lockout'`
  is **implemented** for the deadlift: a completed pull ends in lockout and
  holds until the next hinge; a stalled pull never enters it. `'rep_completed'`
  is **deleted** (zero assignments anywhere; the squat switch arm was
  unreachable). The squat keeps `'standing'` as its top position — its
  lockout is a threshold for returning to standing, not a phase.

### §32 Rep verdict
- **Owner:** `src/features/form-coach/models/form-session.types.ts`.
- **One field:** `FormRep.status: 'valid' | 'failed' | 'unverified'`,
  required. The parallel `isValid` boolean is deleted; validity derives via
  `isValidRep`. All three rep machines stamp the verdict through the shared
  `repVerdict` rule; a closed attempt **always** emits a record (the squat
  machine used to silently drop failed reps — its live counter now counts
  closed attempts exactly like deadlift/cycle). `'unverified'` is stamped by
  analyzers only, from the shared visibility helper (§33). Saved reports
  migrate at the one read seam (`normalizeFormRep` in `readFormSessions`).

### §33 Pose service + visibility
- **Owner:** `src/features/form-coach/services/PoseLandmarkerService.ts`.
- **States:** `uninitialized | loading | ready{mode:'worker'|'main', delegate:'gpu'|'cpu'} | error{message}` — mode and delegate are in the state,
  not side booleans (the worker reports its delegate in INIT_SUCCESS). Legacy
  accessors are projections of the state. The sustained-visibility rule
  (shared by all 11 analyzers) lives in `.../analysis/visibility.ts` — it
  was previously two identical private copies.

### §34 Account deletion UI
- **Owner:** `src/lib/deletion-flow.ts`. One reducer holds the flow status
  **and** the session check (`checking | signed-out | signed-in{...}`) that
  used to be a parallel mini-machine. `'error'` has an explicit reset
  transition and is unreachable from terminal states; `partial` retry
  round-trips through `deleting` and returns to `partial` on failure.
  Form visibility derives from the state (`deletionFormMode`), never a
  compound condition.

### §35 Theme + accent
- **Owner:** `src/lib/store.ts` + `src/lib/accent-themes.ts`.
- Persisted: `themeMode: 'light' | 'dark' | 'system'` only. The resolved
  `theme` is runtime-only; following the system never overwrites the stored
  mode (invariant pinned by test). The persist migration derives the mode
  from the legacy (theme, hasCustomTheme) pair; the boot script
  (`public/theme-init.js`) reads the mode first, legacy keys as fallback.
- Accent: one write rule (`resolveAccentWrite`) shared by the sanitizer and
  the setter — `'custom'` with an invalid hex is never stored; it falls
  back to vermilion visibly.

### §36 Permissions
- **Owner:** `src/lib/health-connect.ts` + `src/lib/local-notifications.ts`.
- Health Connect grants are per-type; the derived state is
  `'all' | 'partial' | 'none' | 'unknown'` from `healthGrantsFromAuthorized`.
  A module cache is invalidated on app resume and after every request.
  Partial access names the missing types in Settings. Sync still requires
  `'all'` (sleep + steps + weight are all read) — a documented product
  choice, not a representation limit. Notification requests return the full
  result: `granted | denied | dismissed | unsupported-web | bridge-error`.

### §37 Telemetry consent
- **Owner:** `src/lib/telemetry.ts`. `TelemetryConsent` =
  `'unasked' | 'accepted' | 'declined'` — the nullable smuggle is gone.
  No on-disk migration: the stored key only ever holds accepted/declined,
  and absence **is** 'unasked'. Every consumer gates on `'accepted'`, so the
  pre-hydration value can never enable telemetry by accident.

## Derived classifiers (Phase 5)

### §D1 Readiness band
- **Owner:** `readinessBandForScore` in `src/lib/coach-engine.ts`. The
  80/60/40 thresholds exist exactly once (a source-guard test fails if a
  second copy appears). `'primed'` is **intentionally unreachable without
  training history**: the no-history branch clamps its score to ≤ 79 —
  with zero load data the coach may say 'ready', never 'primed'. Flagged
  pain caps the history branch at 79 the same way.

### §D2 Nutrition phase
- **Owner:** `deriveNutritionPhase` in `src/lib/nutrition-phase.ts` — the
  one derivation, used by the block engine's input AND Fuel's calorie
  clamps, so a block's phase and the user's target direction cannot
  disagree. Adults: lose_fat → deficit; build_muscle / get_stronger →
  surplus; stamina / general_fitness → maintenance. Safety overrides beat
  the goal: minors (the (0, 18) enforcement band) and unknown-age profiles
  are maintenance-only for every goal. The deficit's calorie floor
  (`getSafeMinCalories`) stays in `macros.ts` — the phase says direction,
  never magnitude.

### §D3 Muscle recovery precedence
- **Owner:** `recoveryStatusFor` in `src/lib/muscle-volume.ts`.
  **Precedence is deliberate: 'fatigued' outranks 'recent'** — a muscle
  trained yesterday with 8+ working sets in 48 h is both, and the fatigue
  warning is the signal that matters. Pinned by test.

### §D4 Pure classifiers — no lifecycle, by design
`WeeklySuggestion` (coach-session.ts), `LoadIncrement`
(training-decision-policy.ts) and `DataLocation` (data-location.ts) are
pure functions of their inputs with no persisted state and no transitions.
They are classifiers, not machines; nothing to fix. Recorded here so the
inventory's last open category has a disposition.

## Cross-cutting patterns — dispositions (§5.5)

The inventory's recurring shape was **"union field + orthogonal boolean"**
and **"state stored twice"**. Every instance found has a disposition:

| Pattern | Disposition |
|---|---|
| Sync status + `isSyncing` boolean | Fixed §1/§2 — running derives from the state |
| Deletion nonce status + memory map | Fixed §14 — one transition table, fail-closed reads |
| Draft presence + duplicate type definition | Fixed §15 — one definition, presence is the state |
| `hasCompletedOnboarding` boolean + profile presence | Fixed §26 — derived from profile |
| Coach card state + `undone` flag | Fixed §28 — 'undone' is a state |
| Meal-scan step + 4 situation flags | Fixed §29 — flags are projections of the flow state |
| Pose status + `isWorkerActive` boolean | Fixed §33 — mode/delegate inside the state |
| Theme value + `hasCustomTheme` boolean | Fixed §35 — one persisted `themeMode` |
| FormRep `status` + `isValid` boolean | Fixed §32 — one field, validity derived |
| Decision status + separate 'applied' record | **Stays, documented §20** — 'applied' is a derived join, because the apply-validator pins the stored status to exactly 'accepted' |
| Tab-leader flags + stored record | **Stays, documented §13** — the record is the truth; flags are a cache that may lag one heartbeat |
| Archive two-key rotation | Fixed §12 — one key, generation list, atomic append |
| PR baseline: flag + notes text | Fixed §23 — the flag is the encoding |
| Set status: status + `completed` boolean + reps inference | Fixed §17 — one precedence implementation, legacy encodings normalized at the seams |

## Invariants under CI

`tests/state-invariants-phase5.test.ts` pins: (1) rest timer — `endsAt`
non-null ⟺ running, over an exhaustive action walk; (2) sync — never
`synced` while signed out; (3) tombstones — never live + tombstoned;
(4) Today — exactly one status, never rest + in-progress; (5) PRs — stored
derived records ≡ replay recomputation + manual records.
