# STATE VERIFICATION — Phase 0 (state-machines program)

Date: 2026-11-13 · Tree: master `cc49c05c` (branch `state-machines/phase-0`)
Source document: `~/workspace/goals/ascend-webapp-to-android-app/files/implicit-state-machines-2026-11-13.md`
Method: every row re-checked against the code on this tree (grep/read). Rows marked
"inventory evidence" rest on the three independent deep reads done 2026-11-13 plus
parent spot-greps; rows marked "parent-verified" were re-grepped/read by the parent
during Phase 0 itself. Verdicts: **confirmed** / **partly** (claim true in structure,
recorded symptom already mitigated, or one sub-claim off) / **false**.

## Baseline (Phase 0, this branch, master cc49c05c content + Phase 0 test infra)

Run 2026-11-13 on `state-machines/phase-0` (after restoring node_modules, which
had been lost with the home-quota exhaustion — see the Phase 0 report):

- **Typecheck:** `tsc --noEmit` — clean (exit 0).
- **Lint:** 107 problems (2 errors, 105 warnings) — identical to the master
  baseline; both errors are the pre-existing ones in vendored
  `public/mediapipe/wasm/*.js`. (Lint exits 1 on the baseline itself because
  of those two vendored errors.)
- **Tests:** vitest **3,854 passed / 20 failed** (3,874 total). All 20 failures
  are the pre-existing Docker-only `tests/security-integration-gate.test.ts`.
  Delta vs the 2026-11-10 master baseline (3,843/20 of 3,863): +11 tests — the
  Phase 0 helper smoke tests (`tests/state-phase0-helpers.test.ts`, 11/11 pass).
- **Build:** `npm run build` — exit 0.

## A. The five recorded-bug links from the brief

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| B1 | Stale PRs after deleting a workout (§23) | **partly** | Whole-workout delete DOES recompute derived PRs: `deleteWorkout` → `reconcileDerivedPRs` (store.ts, "QA-hardening R1", PR #120), and Undo (`insertWorkoutAt`) re-derives. GAP: set-level edits via `updateWorkout` (store.ts:2303) do NOT reconcile — edit a set below the PR and the record stays. Manual PRs are user-owned by design. |
| B2 | "NEW PR" next to "PR held" in Coach's Take (§23) | **partly** | R2 (PR #120) unified the Take's internal detection, but `generateCoachTake` (coach-engine.ts:1026) still reads the write-never `isPR` flag (coach-engine.ts:1048, :1183) alongside `isNewE1rmRecord`, while the finish banner counts from a third source (the detection loop's `addPR` records, ActiveWorkoutScreen.tsx:2110-2207). Three PR sources still exist; the contradiction is mitigated, not eliminated. |
| B3 | "Sync failed" banner contradicts Settings "Sync Idle" (§1, §2) | **partly** | The error-vs-idle contradiction was fixed by QA-hardening R6: SettingsView.tsx:678-682 maps `syncStatus === 'error'` to the same classified copy as the banner ("an error is not 'idle'" comment). REMAINS TRUE: the label falls through to 'Sync Idle' for `offline` and `unconfigured` too (SettingsView.tsx:682), and engine `idle` only ever means merge-gate (sync.ts:1538 is its only assignment). |
| B4 | Today vs Consistency disagree on rest day (§16, §18) | **confirmed** (structural) | Today derives via `getTodaySessionState`/`resolvePlannedDay`; the weekly-review/consistency surfaces read `weeklySchedule` + the `'rest'` literal directly (weekly-review.ts:251, :642-644) — two independent derivations of the same day facts, free to disagree. A specific recorded instance cannot be replayed from code alone. |
| B5 | Today's button flips "View in Train" ↔ "View Completed Workout" (§16) | **partly** | The label flip was fixed in audit Phase 5: HomePage.tsx:1350-1354 — completed always labels 'View Completed Workout' regardless of coachEnabled (history in the comment at :1330-1342). RESIDUAL: the click handler still navigates to Train when `completedWorkoutForToday` — a second, inline derivation (HomePage.tsx:194) — is null while the label says 'View Completed Workout'. |

## B. Inventory entries §1–§37 + section D

| § | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | SyncStatus overloaded; `idle` = merge-gate only; ~15 unguarded mutation sites | confirmed | sync.ts:684 (union), :1538 (only `idle` assignment — parent-verified), mutation sites per inventory evidence |
| 2 | "Sync running" stored twice (promise + `isSyncing`); stale errorKind combos; auth failure leaves old retry timer | confirmed | sync.ts:1126-1145 fields; signOut clears `isSyncing` (:1668) not the promise; start clears errorMessage (:1968) not errorKind — inventory evidence |
| 3 | Logged-out latch, 3 writers, no owner, lazily resolved | confirmed | key writes at sync.ts:1680, :1846, store.ts:3809 — inventory evidence |
| 4 | Merge gate: signature = sorted row IDs only (comment claims counts+ids); pending memory-only; suppress doesn't clear an engaged gate | confirmed | sync.ts:563-577 (signature), :1511-1546 (gate checks pending before marker) — inventory evidence |
| 5 | Identity routing keys solely on profile-id string | confirmed | start-fresh-guard.ts:43-59 — inventory evidence |
| 6 | Start-fresh gate verification asymmetric | confirmed | start-fresh-guard.ts:102-117 (`sessionAfter === undefined` aborts; `engineUserAfter === undefined` accepted) — inventory evidence |
| 7 | Quarantine: schema codes treated per-row-permanent; null-stamp unreleasable; raw server message persisted; loose read validation | confirmed | sync.ts:744-777, :2857-2908 — parent knows this code from PRs #126/#128; null-stamp path at applyQuarantineFilter |
| 8 | Adoption baseline is one unscoped global string | confirmed | sync.ts:1088 `ascend_last_pushed_signature` (no user id in key) — parent-verified by key name |
| 9 | Pull-winner vs push-gate tie/missing-stamp rules asymmetric; loser overwritten with no record | confirmed | reconcile.ts `resolvePullWinner` vs `shouldPushRow` — inventory evidence |
| 10 | Deletion stored in 3 places; live+tombstoned representable; no server TTL; mid-push loser edit race | confirmed | store.ts:303-329; sync.ts propagateDeletions; race = open item from 2026-11-10 review, guarded for the different-date case only (PR #128) |
| 11 | Coach-blocks baseline: `localEditedAt` lingers after revert; legacy `shouldAdoptCoachBlocks` beside the wired decision; JSON key-order assumption | confirmed | sync.ts:415-505 — inventory evidence |
| 12 | Archive rotation not atomic (prev overwritten first, failure swallowed); restore paths disagree about prev; absent vs invalid indistinguishable | confirmed | history-fork.ts:42-44, :106-121; store.ts:3918-3941, :4028-4067 — inventory evidence + PR #126 defect-3 work |
| 13 | Tab leadership: flags + record dual representation; `stop()` leaves flags; fail-open without storage | confirmed, fail-open **intentional** | tab-leader.ts:48-50, :91-98; file header documents the race and the fail-open choice — do not "fix" fail-open (brief rule 7) |
| 14 | Deletion nonce: no transition guard (consumed→partial representable); `isNonceConsumed` fails open; missing status coerced to consumed | confirmed | deletion-token.ts:296 `consumeDeletionNonce(jti, payload, status = 'consumed', dbClient)` — parent-verified signature, no guard in body; isNonceConsumed swallow per inventory evidence |
| 15 | Draft: presence machine, one slot two autosave writers, type defined twice | confirmed | store.ts:355 slot; interface at types.ts:379 AND store.ts:172 — parent-verified (identical today); writers ActiveWorkoutScreen.tsx:743 + WorkoutPage.tsx:1495 |
| 16 | Today status derived cascade; rest = 'planned' × isRestDay; entry-exists = completed; sibling resolver's 'completed' unreachable from this caller | confirmed | workout-engine.ts:2172, :2196-2283; scheduled-days.ts:135-161 — parent-verified during PR #127 work |
| 17 | Set status: 3 encodings, 3 resolvers, 'pending' never persists | confirmed | types.ts:208, :254, :275, :295; finalizeWorkoutSet workout-engine.ts:77-117 — inventory evidence |
| 18 | Schedule: `'rest'` magic string in the plan-id field; consistency by imperative rewiring; dangling ids tolerated | confirmed | types.ts:590-596; weekly-review.ts:251 reads the literal directly — parent-verified |
| 19 | Block lifecycle: 3 "no" conventions; terminal labels lazy; pastBlocks silently capped at 8 | confirmed (with correction) | block-engine.ts:124-163; `'replaced'` IS assigned — store.ts:3147 (parent-verified) — but only when a successor is approved, so a finished block with no successor stays 'active' in storage indefinitely |
| 20 | Two divergent decision-status unions; 'applied' lives in a separate audit collection | confirmed | types.ts:808 vs training-decision-policy.ts:233; audit at types.ts:882 — inventory evidence |
| 21 | Rest timer: flags + authoritative ref; start open-coded 3×, two copies never set the ref the countdown reads | confirmed | ActiveWorkoutScreen.tsx:544-547, :1060, :1079-1080 — parent-verified: inline copies at :1585-1592 and :1883-1890 set flags + scheduleRestAlert but never assign `restTargetEndTimeRef.current` |
| 22 | Run player state+ref duplication; partial run counts as completed session; progress computable with no enrollment | confirmed | RunSessionScreen.tsx:78-121; run-program.ts:240-267 — inventory evidence |
| 23 | `WorkoutSet.isPR` never assigned true, read by 4 surfaces; baseline dual-encoded (flag + notes text) | confirmed | grep `isPR: true` in src/ = 0 hits — parent-verified; readers at WorkoutPage.tsx:912, ActiveWorkoutScreen.tsx:1765, coach-engine.ts:1048, :1183; PRsPage.tsx:474, :642 |
| 24 | Check-in: bare index over a conditionally-built list; "done" inferred from first-answer record | confirmed | coach-session.ts:48-62; CoachChatTab.tsx:217-228 — inventory evidence |
| 25 | Onboarding: 10-screen union, component-local, dead members 'experience'/'schedule'; completion leaks to a store boolean | confirmed | Onboarding.tsx:27-38 (union — parent-verified), :43 state, :145-157 deep-link remap, render chain covers 8 — inventory evidence |
| 26 | Entry gate keys on profile presence while `hasCompletedOnboarding` is a parallel boolean (~10 write sites) | confirmed | page.tsx:402-415; store.ts:341 — inventory evidence |
| 27 | "Guest" is a derivation (null user × guest_ profile id), never a value | confirmed | start-fresh-guard.ts:44; sync.ts:908 — inventory evidence |
| 28 | Coach action cards: 'stale' stored AND derived (can disagree); `undone` flag = hidden 6th state; actionBase tri-state | confirmed | coach-chat-store.ts:25, :61; coach-action-executor.ts:274-323 — parent knows this code from PR #102 |
| 29 | Meal scan: step union has no error state; 'select' conflates 4 situations via flags; offline path bypasses 'analyzing' | confirmed | ScanMealModal.tsx:86, :425-442, :484 — inventory evidence |
| 30 | Form Coach: two outcome vocabularies coexist ('not-squat' unmapped) | confirmed | useFormCoach.ts:49, :63, :86-139 — inventory evidence |
| 31 | Pose service: status × `isWorkerActive` side boolean; 'ready' conflates modes | confirmed | PoseLandmarkerService.ts:28, :42-47 — inventory evidence |
| 32 | MovementPhase: 'lockout'/'rep_completed' never assigned; failed-rep semantics differ across the 3 machines | confirmed | grep for assignments of both values in src/features = 0 hits — parent-verified; form-feedback.types.ts:5 |
| 33 | Rep verdict: dual encoding (isValid + status) with legacy fallback; 'unverified' reachable from 1 of 11 analyzers | confirmed | form-session.types.ts:25-31 — inventory evidence |
| 34 | Deletion UI: 'error' is a sink with no reset; form choice is a parallel mini-machine | confirmed | DeleteAccountView.tsx:26, :57-62, :477 — inventory evidence |
| 35 | Theme: 3 modes encoded as 2-value × boolean; stored value stale-by-design in system mode; 'custom' accent + bad hex silently renders vermilion | confirmed | store.ts:1745-1795; accent-themes.ts:340 — inventory evidence |
| 36 | Health Connect: partial grants unrepresentable (all-or-denied); notification request collapses 4 states to boolean | confirmed | health-connect.ts:222-231 (`every()` check); local-notifications.ts:310-329 — inventory evidence |
| 37 | Telemetry consent: tri-state smuggled through a nullable | confirmed | telemetry.ts:6 — inventory evidence |
| D1 | Readiness band thresholds written twice | confirmed | coach-engine.ts:817-818 (`bandFor`) vs :991-995 (inlined) — inventory evidence; 'primed' unreachable in no-history branch (score clamped ≤79) |
| D2 | NutritionPhase: 'surplus'/'maintenance' never produced | confirmed | block-engine.ts:72; only caller passes `'deficit' \| null` (store.ts:3080-3081) — inventory evidence |
| D3 | Recovery: 'fatigued' outranks 'recent' | confirmed | muscle-volume.ts:143-150 — inventory evidence |
| D4 | WeeklySuggestion / LoadIncrement / DataLocation: pure classifiers, no lifecycle | confirmed | coach-session.ts:228-262; training-decision-policy.ts:124-129; data-location.ts:26-33 — inventory evidence |

## C. Summary

- **False claims: none.** Every § entry describes code that exists as documented.
- **Partly: B1, B2, B3, B5** — prior programs (QA-hardening R1/R2/R6, audit Phase 5)
  already fixed the recorded symptoms; the structural causes remain and are what
  Phases 1–4 address. B4 is structural-only.
- **Intentional (document, don't fix):** §13 tab-leader fail-open (documented in
  the file header). Everything else is fair game per the brief.
- One correction to the source inventory: §19's `'replaced'` is assigned
  (store.ts:3147) — the smell is lazy terminal labeling, not a dead state.
