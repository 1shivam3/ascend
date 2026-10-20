# Persona Review R2: Deepa, 40 — Gym owner / coach, power user (NEW persona)

**Branch:** `feat/overnight-build` | **Method:** read-only code trace, simulated week (share programs to clients → receive/import → manage a multi-plan library → export everything → try to turn coaching off). She runs a small gym, coaches ~15 clients in person, wants ASCEND as her program-delivery + records tool.

---

## First impression

Promising for exactly her use case — this is the first persona for whom ASCEND has a feature competitors charge for: a client taps a WhatsApp link or scans a QR code and imports the full routine with no account (`ShareProgramModal`, `program-sharing.ts`, hash listener in `src/app/page.tsx:95-115`). The share sheet looks professional, the import modal is one tap. Then she starts using it at coach scale — multiple plans, repeated sharing, a client who trains in lbs, her own data audit on Friday — and the cracks are all in the places a coach touches daily.

## What worked

- **The share/import loop itself works.** `encodeProgramForSharing` (`src/lib/program-sharing.ts:46-70`) packs name, coach name, notes, and per-exercise sets/reps/weight/unit/notes into a URL-safe base64 hash (`/#plan=v1_…`); `page.tsx:95-115` listens for the hash (including `hashchange`), decodes, and opens `ImportProgramModal` with Import-only and Import-and-Start paths. Decode is defensively bounded (`program-sharing.ts:86-113`: 50k char cap, ≤50 exercises, sets ≤30, reps ≤200, weight ≤1000, prototype-pollution checks). QR generation and the WhatsApp message formatter are real and polished.
- **Per-plan sharing from the Train tab is correct.** `WorkoutPage.tsx` keeps a `sharingPlan` state set from the specific plan's Share action (list and detail views, `:1747,2531`), so sharing Plan B sends Plan B.
- **Multi-plan management basics exist:** create/edit/duplicate/delete plan cards, deletion tombstones (`deletedPlanIds` in `store.ts` + `supabase/reconcile.ts`) so deleted plans no longer resurrect on sync, weekly schedule assignment per day.
- **Customization toggles exist and partly work.** `SettingsView.tsx` Customization section: weekly target (Auto/Off/2–6), Gamification toggle, Coach toggle, Habit-matrix toggle, backed by `uiPreferences` (`store.ts:110-127`). Home surfaces honor them (`HomePage.tsx:511,545,602-623,765,821` gate check-in, nutrition suggestion, readiness, XP, challenges on the respective flags).
- **The full-store JSON export is genuinely broad.** Settings → Export calls `exportFullBackupJSON` (`src/lib/storage.ts:231+`), which dumps the whole persisted store (profile, PRs, workouts, meals, body metrics, plans, water/creatine logs, schedule, decisions, XP…) plus custom barcodes, with credential keys stripped. As a backup, that one is respectable.

## Friction & bugs

### DEEPA-1 (trust-breaker) — Profile-screen Share always sends the FIRST plan, whichever client it's for
`ProfileView.tsx:447-451` mounts `<ShareProgramModal plan={plannedWorkouts[0] || null} …>`. There is no plan picker. A coach with 15 client plans who shares from Profile sends plan #1 — plausibly another client's program, with another client's loads — to whoever she meant to send plan #9 to. The modal happily renders it (name + exercises are visible if she reads carefully), but the affordance invites exactly the wrong-recipient error a coach cannot afford. The Train-tab path (DEEPA "what worked") proves the correct pattern exists in the same codebase.

### DEEPA-2 (major) — Sharing silently strips RPE targets and plan metadata
`PlannedExercise` carries `targetRpe` (`src/lib/types.ts:388`), but `encodeProgramForSharing`'s payload (`program-sharing.ts:55-64`) serializes only `n/s/r/w/u/nt` per exercise — **no RPE** — and the plan-level payload omits `description` and `goalTag`. `decodeProgramFromHash` consequently cannot restore them. Everything Deepa programs by effort ("top set @8, back-offs @7") arrives at the client as bare sets×reps×weight. Additionally, `ShareProgramModal.tsx:36` calls `encodeProgramForSharing(plan, coachName)` — the third `notes` parameter is never passed from the UI, so the payload's program-notes field is dead in practice; the only notes that survive are per-exercise notes already on the plan. WhatsApp text also truncates the exercise list at 8 (`formatWhatsAppShareText`, `program-sharing.ts:163`, "+N more") — the link carries the rest, but a client reading only the message sees an incomplete program.

### DEEPA-3 (major) — Two different "full backups," same filename; the DataVault one silently omits half her data
- Settings export (`exportFullBackupJSON`) = full persisted store (above).
- `DataVaultModal.tsx:generateBackupPayload` (`:52-68`) exports only 11 fields: profile, prs, workouts, meals, bodyMetrics, prTargets, macroGoals, plannedWorkouts, favoriteFoods, theme. **Missing:** weeklySchedule, trainingProfile, uiPreferences, goals/userMode, notificationPreferences, water/creatine logs, custom barcodes, decision history, progress photos.
- Both download as `ascend_backup_<date>.json`. Restore runs through `importAllData` (`store.ts:2028+`), which faithfully restores whatever fields exist — so restoring a DataVault backup silently resets her schedule, settings and logs to defaults while the toast says "Data restored successfully." **Progress photos are excluded from both exporters** (photos live outside the persist blob by design, `store.ts:373-450` `partializeAppState`/ `PROGRESS_PHOTOS_KEY`, and neither export path reads that key) — a coach's client check-in photos cannot be backed up at all.
- And there is **no non-JSON export**: no CSV of workouts/PRs, nothing a client, spreadsheet, or another app can read. "Can she get ALL her data out?" — as a restorable blob, mostly (via Settings only); as usable data, no.

### DEEPA-4 (major) — "Coach: Off" turns off only the Home cards; coaching still interrupts every workout
`uiPreferences.coachEnabled` is consulted **only in `HomePage.tsx`** (grep-verified). `PostWorkoutTakeModal` — the Coach's Take — is rendered unconditionally after a completed workout in both `HomePage.tsx:1121` and `WorkoutPage.tsx:2497`, and `WorkoutCoachDrawer` (`WorkoutPage.tsx:2485`) is likewise ungated. Deepa, who *is* the coach and explicitly flipped Coach off in Settings, still gets an AI coach's take modal after every session and an in-workout coach drawer. The Settings copy promises "Coach — check-in cards, calorie suggestions and the readiness score on Home" (narrowly accurate), but the reasonable reading of the toggle — coaching off — is not what the app does. Gamification-off is similarly cosmetic-deep: XP is still awarded internally on every PR (`store.ts:addPR` → `awardXpEvents`) regardless of the toggle; only Home display is hidden.

### DEEPA-5 (minor) — kg↔lbs round-trip loses precision in small, compounding ways
Constants are consistent (`0.453592` / `2.20462` — their product is 0.999998, negligible), but storage rounds both sides independently to 0.1 (`PRsPage.tsx:857-865`, `workout-import.ts:174`): 100 lbs → 45.3592 kg → stored 45.4 kg → re-derived 100.1 lbs. A client whose numbers Deepa edits across unit views drifts by 0.1 lb/0.05 kg per round-trip — invisible once, a visible "my PR changed" over a season. Worse spots: `PlateCalculatorModal.tsx:44-47` rounds unit toggles to whole numbers (`Math.round`), discarding 2.5/5 increments entirely; `BodyMetricsModal` derives circumference units from the *weight* unit toggle (kg ⇒ cm, lbs ⇒ in — labels at `:282-330`), so a metric coach measuring with an inch tape must mentally convert or flip her weight unit. Meet planner adds its own version: attempts always round to 2.5 steps even in lbs (see Rohan review, ROHAN-1).

### DEEPA-6 (minor) — Import has no duplicate or version protection for coached programs
Every shared-link import mints a new plan (`ImportProgramModal.tsx:createPlanObject` — fresh UUID, `addPlannedWorkout` appends). A client who taps Deepa's link twice, or receives v2 of the same program, accumulates indistinguishable duplicates with no "updated" semantics, no sender-side versioning beyond the payload's internal `v:1`, and no way for Deepa to revoke or supersede a link (the program is fully embedded in the URL — anyone holding it holds the program forever). For a gym owner distributing paid programming, link = permanent, forwardable copy. That may be acceptable — but it's a property she should choose, and the app never surfaces it.

### Feature gaps (not bugs)
- No coach/client roles, no multi-athlete switching: Deepa manages *her own* plans and shares copies; she cannot see a client's logged adherence, adjust their plan in place, or maintain per-client plan folders/tags/search. At 15+ plans the flat list is the management system.
- No CSV/PDF export (above), no bulk share, no program templates library separate from personal plans.

## Keep-or-delete verdict

**Keep — she's the persona closest to keeping it — conditional on DEEPA-1 and DEEPA-3.**
Why: the share-by-link/QR loop is a real, differentiated, working distribution channel for an in-person coach, plan management with tombstoned deletes is finally trustworthy, and the Settings export is a genuine backup. But a coach's reputation is her accuracy: a share button that sends the wrong client's program (DEEPA-1) and a backup button that silently drops her schedule/settings/photos (DEEPA-3) are the two failures she will personally experience within the simulated week. Fix those and she becomes the app's best advocate; leave them and the first wrong-client send deletes it.

## Competitor gap

TrainHeroic / TrueCoach / Hevy Coach: per-client accounts, adherence visibility, in-place program updates, CSV/PDF exports. Hevy's free tier already does routine sharing with muscle-assigned customs. ASCEND's edge: zero-account, offline, WhatsApp-native sharing — genuinely better suited to her market (Indian gym, WhatsApp-first clients) than any Western coach platform, if the trust bugs are fixed.

## Rating: **6/10** (new persona baseline — highest ceiling of the three, held down by coach-scale trust bugs)
