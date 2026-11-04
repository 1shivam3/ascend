# ASCEND Final Certification — Round 1b-2: Functional Test Results

**Build under test:** master `62e25543fe57755a07860ac745ca51b3a2353cc2` (BUILD_ID `y8oQPLBPS4oYLZKgQHz5p`)
**Date:** 2026-11-04
**Round:** 1b-2 — functional journey testing (brief §6). Unlike Round 1b, actions were *completed* (onboarding finished, sets logged, workouts saved, meals added) because the environment below is local and disposable.

## ⚠ Environment substitution — read first

Production (`ascendtonext.vercel.app`) is unreachable from this sandbox's Chromium (egress proxy), so — exactly as the round brief prescribes — testing ran against a **local production build of the exact audited commit**:

- Scratch clone `~/workspace/ascend-func-test` checked out at `62e25543`, `npm run build`, served via `npm run start` on `http://127.0.0.1:3107`.
- **Build identity rests on git HEAD + BUILD_ID**, not on the service-worker cache name: `scripts/generate-sw.js` derives the production cache name (`ascend-62e2554-cache`) from `VERCEL_GIT_COMMIT_SHA`, which is absent locally, so the local build's SW is named `ascend-dev-cache`. Code, routes, and data behavior are the audited commit's; SW *naming/config provenance* is the one known local-vs-production difference, and it matters for J10 (see there).
- Driven by headless Chromium (chrome-headless-shell 152.0.7977.30 + puppeteer-core), viewport 412×915.
- **All testing in fresh GUEST profiles** (`profA` = main continuity profile, `profB`/`profC` = clean-state profiles). No real account, no sign-in, no production writes — all data is synthetic and never left this machine.
- Store evidence is read from the zustand persist key `ascend_store` (state under `.state`) plus sibling keys (`ascend_guest_id`, `ascend_theme`, …). The sandbox clock is UTC; in-app dates read 2026-11-04.

## Verdict summary

| Journey | Verdict |
|---|---|
| J1 Onboarding | **PARTIAL** (happy path PASS; 2 × P3) |
| J2 Workout lifecycle | **PASS** (1 × P2, 1 × P3 sub-findings) |
| J3 Draft discard | **PASS** (1 × P3) |
| J4 Progress & PR logic | **PASS** |
| J5 Nutrition | **PARTIAL** (2 × P3 + missing day navigation) |
| J6 Settings & personalization | **PASS** |
| J7 Data management | **PASS** |
| J8 Coach interactions | **PARTIAL** (topic-lock NOT TESTED — unreachable locally) |
| J9 Share card | **PARTIAL** (1 × P3 — PR count/highlight mismatch) |
| J10 Error & empty states | **PARTIAL** (empty states PASS; offline shell FAIL in local build) |

**Totals: 5 PASS · 5 PARTIAL · 0 FAIL.** Findings: F1–F9 (one P2, eight P3). Nothing at P1: no essential workflow broke and no verified data was wrong or lost in the store.

---

## J1 — Onboarding · PARTIAL

**Steps:** fresh profile → splash ("TAP TO CONTINUE") → "Continue as Guest" → goals (Build Muscle + Get Stronger) → details (name "Test Athlete", Female, DOB 15/6/2000 via `#details-dob-day/month/year`, injury left "No injuries") → plan offer → summary → "Start training".

**Observed (happy path PASS):** Plan offer showed 4 plans (Upper A / Lower A / Upper B / Lower B) matching the goals, plus an honest food-target card (2,526 kcal, Protein 126 g, defaults disclosed). Summary listed **both** goals; LEVEL / DAYS / DIET carried explicit "DEFAULT" badges. Store verified after finish: `profile {name "Test Athlete", gender "female", DOB 2000-06-15, age 26, goals [build_muscle, get_stronger]}`, `hasCompletedOnboarding=true`, `plannedWorkouts=4` matching the offer, Home showed "Today's Workout: Upper A · 51 min · 5 exercises", targets 2,526 / 126 g matching the offer card. Reload → lands in app, onboarding not repeated. Back-navigation goals → welcome → forward **preserved goal selections** (`aria-pressed` state intact).

**Findings:**

- **F1 (P3) — Back from plan offer to details loses typed name (and, structurally, a non-default gender).** `PersonalDetailsScreen` remounts with `initialName={athleteName}`; `Onboarding.handleFinishCalibration` calls `setDob` (the O3 fix) but never `setAthleteName(details.name)`, and `athleteName` is `''` for guests — so stepping back from the offer wipes the name field. Gender has the same structural flaw: `Onboarding` holds no gender state feeding `initialGender`, so a non-default choice resets on the back step. Forward-path storage is correct (Female persisted) — this only bites on back-navigation.
- **F2 (P3) — The custom "name required" error is unreachable for an empty name.** `#details-name` carries the native `required` attribute, so browser validation pre-empts the React submit handler and the `errNameRequired` banner never renders (verified: two Continue clicks with an empty name → stayed on details, zero error text/alert nodes in the DOM). DOB errors, by contrast, DO surface via React. The user gets the browser's native bubble instead of the app's designed error.

## J2 — Workout lifecycle · PASS

**Steps:** start Upper A from Train → log set 1 at 20 kg × 6 vs target 17.5 × 8 → set RPE → rest timer → pause/save → browser relaunch → resume → complete all sets → Finish → History → reload.

**Observed:** Draft persisted across a full browser relaunch ("Workout in progress" banner + Resume; toast "Workout Restored"). The draft records prescribed (17.5×8) and logged (20×6) values separately; editing pending-set values live-syncs to the draft and pre-fills later sets. Rest timer appeared after a completed set and counted down (2:57 → 2:54 over ~3 s) with −30 s / Pause / +30 s / Next Set / End Workout controls; session timer counts up independently. RPE sheet ("How hard was that set?", @6–@10 descriptive cards) stored `rpe: 8` on Bench set 3. Resume after reload restored the exact state (SET 3 OF 3, values intact). Completion of all 15 sets → Finish (no confirm dialog) → summary: **VOLUME 1,500 kg — exactly the hand-computed 390+360+300+375+75 — SETS 15, LIFTS 5, DURATION 4m 55s = store `durationSeconds` 295**; `store.workouts[0]` matched the UI exactly; draft cleared to `null`. History (Train → History) listed the session ("Wed, Nov 4, 2026 · 5 exercises • 15 sets") and persisted after reload.

**Findings:**

- **F3 (P2) — No in-app edit path for a completed set.** Full button inventory of `ActiveWorkoutScreen` shows set chips only for *pending* sets; a tap intended for a logged set lands on the next pending set. The History detail view likewise exposes no edit/delete affordances for a logged session's sets. A mis-logged set is therefore uncorrectable in-app (short of deleting data wholesale). Mitigant: pending-set values pre-fill from the previous set and live-sync to the draft, which reduces — but does not eliminate — mis-logs. Root cause: `ActiveWorkoutScreen` renders completed sets read-only; no edit affordance is wired to the completed-set row in either surface.
- **F4 (P3, cosmetic) — CURRENT SPLIT counter denominator changes while a draft is in progress:** "0 of 4" → "0 of 5" (draft counted as an extra slot) → "1 of 5" after completion.

## J3 — Draft discard · PASS

**Steps:** start Lower A → complete 1 set → pause → resume banner → Discard → reload.

**Observed:** after Discard, `activeWorkoutDraft = null` immediately; `workouts` still exactly 1 (the J2 session); reload → no banner, no phantom draft, no History entry for Lower A.

**Finding:**

- **F5 (P3) — One click on the banner's "Discard" destroys the draft with NO confirmation** (verified twice: draft gone immediately, no modal). Contrast J5's meal delete, which has a proper confirm + undo offer (J5 below). A single mis-tap loses an in-progress session irrecoverably.

## J4 — Progress & PR logic · PASS

**Observed:** Progress overview was fully consistent with J2's session: Muscle Volume "15 sets this week" (Chest 3, Back 6 = Row 3 + Lat 3, Shoulders 3, Arms 3, Legs 0, Core 0 — sums to 15), all "vs 0" last week; Recovery states correct (trained muscles Today/Recent; Legs/Core "Not trained yet"); Personal Records showed Bench Press est. 27 kg and Overhead Press est. 13.3 kg — the exact Epley values from the workout summary. Squat/Deadlift honestly showed "No data yet — log one to start the trend". The PR page ("View All") is thorough and honest: Big-3 scoreboard marked "Partial total — DOTS needs all three lifts (missing: Squat, Deadlift)" with the disclaimer "Totals are estimated from your best rep performances, not tested maxes"; per-lift cards show Best set, estimated 1RM, next milestone, "View History (1 PR)". Strength Trend is honestly gated: "Not enough workout history yet. Complete a few sessions to see your trend."

**PR-flag test (the brief's key question):** in a second Upper A, Bench **25 kg × 5** (above the previous best 22.5 × 6) was logged, the partial session finished via the "SESSION SAVED." sheet (VOLUME 125 kg = 25×5 ✓, SETS 1/15, adaptation summary "Bench Press: 25 kg × 6 next session"), then **Save & Finish**. Result: `workouts = 2` (second record contains only the completed exercise/sets — pending sets correctly dropped), a **new PR record was created**: Bench Press 25 kg × 5, `oneRepMax 29.2` (Epley 25 × (1 + 5/30) = 29.17 → 29.2 ✓), notes "All-Time 1RM PR", and the completion summary announced **"1 New Personal Record detected & synced to your PRs!"** with a Coach's Take and the next-session target. A heavier-than-ever set IS flagged — in the summary, in the PR store, and on the PR page.

*Method note:* the PR rows on the Progress overview are not plain buttons; a text-click on "Bench Press" did not drill down (driver limitation, not an app failure) — the drill-down was instead verified via the PR page's "View All".

## J5 — Nutrition · PARTIAL

**Setup:** Fuel → Meals. Daily targets matched onboarding exactly (2,526 kcal, Protein 126 g, Carbs 348 g, Fat 70 g). "WHAT YOU ATE TODAY (0)" empty state renders correctly.

**Search + add (verified):** Add Manually → type "Paneer" → match list shows per-100 g values (Paneer 265 kcal/100 g, plus Paneer Paratha 310, Butter Masala 240, Palak Paneer 165, Bhurji 215, Tikka 195). Selecting Paneer put `265 kcal · P 18.3 g · C 4.5 g · F 20.8 g` on the food card. Quick-add favorites (Roti, Dal, Paneer, Curd, Soya, Chana, Sattu, Rice, Whey, Eggs) add at their saved quantities in one tap.

**Save (with the required meal name):** naming the meal ("Lunch") and saving persisted exactly: `meals[0] = {name "Lunch", date "2026-11-04", foods: [Paneer 100 g → 265 kcal, 18.3 P, 4.5 C, 20.8 F]}`; DAILY INTAKE read 265 kcal, protein displayed 18 g (18.3 rounded down in the header display).

**Edit quantity (verified arithmetic):** Edit ("Edit: Lunch") → qty 100 → 200 g → builder MEAL TOTAL updated live to **530 kcal / 36.6 g P** (exact doubles) → save → intake 530 kcal / 37 g displayed; store record updated in place (same id; 530 kcal, 36.6 P, 9.0 C, 41.6 F — all exact).

**Delete (verified):** "Delete meal Lunch" → confirmation dialog ("Delete Meal? Are you sure you want to delete 'Lunch'? You can undo right after deleting." — Cancel / Delete Meal) → confirm → `meals = []`, intake back to 0, undo offered.

**Hydration (verified):** +250 ml → WATER 250 ml with confirmation toast; after a full reload, water = 250 ml, kcal = 265, meal count = 1 — meal + hydration both persist.

**Findings:**

- **F6 (P3) — Save Meal is silently blocked without a meal name.** `handleSaveMeal` (`src/components/MealsPage.tsx`, line 967) requires `mealName.trim()` non-empty (a deliberate design change — the old time-based default "Late Meal" produced indistinguishable duplicates) and blocks zero-nutrition items the same way, in both cases only via a transient `toast.error`. With a valid food and a computed MEAL TOTAL on screen, tapping Save Meal otherwise does nothing visible in the sheet: no inline error, no disabled-state explanation, sheet stays open, nothing persists (reproduced on both the quick-add and search paths before the requirement was discovered from code). The name field is not marked required in the sheet. Users will read this as "Save is broken."
- **F7 (P3) — The meal builder's always-present blank FOOD row invites quantity entry onto the wrong block.** Selecting a search result (or a quick-add favorite) populates a *second* food block while the blank FOOD 1 template remains; the first Qty input in DOM order belongs to the blank block. Setting qty 200 there produced a MEAL TOTAL of **795 kcal / 54.3 g P** for what the user sees as one 200 g paneer (expected 530 / 36.6) — the sheet had silently priced two blocks (265 + 530). No wrong data was saved in this run (saving was then blocked by F6), but the displayed total for an apparently single item is wrong, and a user who names the meal in this state would save the doubled entry.
- **Date navigation — the brief's sub-step does not exist in the UI.** Meals has no previous/next-day control (header offers "Today" and day-type chips — Normal day / Festival day / etc.). Entries *are* date-stamped in the store (`date: "2026-11-04"`), so the data model separates days; there is simply no way in this UI to view yesterday. Recorded as observed actual, not a defect verdict.

## J6 — Settings & personalization · PASS

All changes made in You → App Settings, each verified after a full reload:

- **Accent theme Vermilion → Cobalt:** computed `--accent` changed `228 68 39` (= brand Vermilion #E44427) → `37 99 235` (Cobalt blue) immediately on tap; after reload the value and the pressed state were still Cobalt. Applies + persists.
- **Information density Simple → Detailed:** after reload, Detailed remained the pressed state. Persists. (Copy is honest: "Nothing is lost — switching only changes how much you see.")
- **Customize Today reorder:** 11 reorderable sections (Nutrition, Coach, Quote, Habit & workout matrix, Quick actions, Hydration, Readiness, Level, Steps today, Monthly challenge, Your weekly review). "Move down" on Nutrition → order became Coach, Nutrition, … — and was unchanged after reload. Persists.
- **Units KG → LBS / INCHES:** Profile then displayed HEIGHT **5′ 9″** (175 cm ✓) and WEIGHT **154.3 lbs** (70 kg × 2.2046 = 154.3 ✓). The preference genuinely converts displayed numbers, and it propagates — the J9 share card also rendered in lbs (below).

## J7 — Data management · PASS

- **Export JSON Backup** (Settings → Backup & Legal) downloaded `ascend_backup_2026-11-04.json`: `{version "2.0.0", exportedAt, source "ASCEND Strength Tracker", profile {id "guest_…", name "Test Athlete", gender "female", bodyweightKg 70, bodyweightLbs 154.3, heightCm 175, age 26}, …}` — a real, structured backup artifact.
- **Export CSV** downloaded `ascend_export_2026-11-04.csv` with a documented header ("One file, three sections…") and a WORKOUTS section with defined columns.
- **Data Vault & Backup modal** (Profile → Data & Storage): "100% Offline Local Storage", Download Backup (.JSON), Restore Backup (upload .JSON), CSV import for Strong / Hevy / FitNotes histories, and an accurate inventory line: **"6 PRs • 2 Workouts • 1 Body Weight logs"** (matches the store exactly — cross-referenced in J9).
- **Reset:** Settings → "Delete WebApp Data & Reset" — its copy honestly distinguishes permanent deletion from "Start fresh" (which archives). It opens a safeguard modal ("Safeguard Your Progress Before Deleting" — Download Backup & Delete Data / Delete Without Backup / Cancel). Choosing **Delete Without Backup** produced the splash screen with an explicit receipt: **"App Reset — All local records were purged from this device."** Store verified wiped: `hasCompletedOnboarding=false`, `workouts=0`, `prs=0`, `profile.name=null`; remaining localStorage keys are only system keys (`ascend_purge_at`, `ascend_store`, `ascend_theme`, `ascend-progress-ranges`, `ascend_has_custom_theme`, `ascend_tab_leader`). The app returns to a clean guest state. (Import/restore of the exported backup was **not** exercised — see NOT TESTED.)

## J8 — Coach interactions · PARTIAL

**Check-in thread (works, with a resume caveat):** Train → Coach → Check-in presents a real one-question-at-a-time thread ("How did you sleep last night? (1 = terrible, 5 = great)" → chip answer becomes a bubble → "How fresh do your muscles feel?" → "Where are you still sore? Pick all that apply." with area chips + Done), plus a "Same as usual — go" shortcut and an optional note field. Answers persist to the store: `dailyCheckins {"2026-11-04": {sleep 2, soreness 2, energy 3, soreAreas [], painAreas [], notes {}}}`. The coach surface is honest about its limits ("The coach adjusts from your log and check-in. It never diagnoses pain — sharp pain always stops the session.") and contextual (it knew yesterday's Upper A was missed: "Yesterday didn't happen — and that's fine"; protein guidance in Indian units: "1 katori dal (8–12 g), paneer 100 g (18 g), soya 100 g dry (52 g). A typical thali gives 40–50 g…").

*Caveats:* (1) An **unfinished check-in does not resume mid-thread** — leaving and returning re-presents the thread from the first question (answers already given are in the store, but the UI restarts the conversation). (2) The coach surface exposes **no numeric readiness score** in the views captured — adaptation is expressed textually ("Steady week — the coach suggests one change: keep the plan, and focus on sleep and protein"), so a before/after *numeric* readiness comparison could not be performed. A completed check-in's effect on today's session loads was not isolated in this round.

**Ask Coach (failure mode = the finding, and it is graceful):** Coach → "Ask the coach" (COACH CHAT: "Ask your coach — every answer is based on your own logged training, not generic advice"). On-topic question sent: *"How should I progress my bench press from here?"* — within ~5 s the thread showed the question and the reply **"Could not reach your coach. Try again."** One console error: HTTP 503 from the local AI route (expected locally — no API keys/network). **No spinner-forever, no crash, no fake answer; the question is retained in the thread.** The same graceful degradation appears for the post-workout Coach's Take: the J4 summary rendered a "Local Coach" take when the cloud route returned 503. *Off-topic / topic-lock behavior: NOT TESTED — locally the request fails at the network layer before any topic-lock logic can engage (see NOT TESTED).*

## J9 — Share card · PARTIAL

**Steps:** You → Weekly Training Card → sheet ("WhatsApp & Instagram Ready", Share WhatsApp / Save Image) → **Save Image** triggered a real download: `ASCEND_Weekly_Recap_2026-11-04.png` (1,172,269 bytes). The card renders its values into the image (not DOM text), so values were verified by inspecting the downloaded PNG against the store.

**Verified exact:** "WEEKLY TRAINING RECAP — NOV 2 – NOV 8" (correct Mon–Sun week for Wed 2026-11-04), athlete "TEST ATHLETE", **SESSIONS 2** ✓, **SETS 16** ✓ (15 + 1), **TOTAL VOLUME LIFTED 3,583 LBS** — the week's 1,625 kg × 2.2046 = 3,582.5 → 3,583 ✓, and rendered in lbs because of the J6 unit change ✓. Footer branding present.

**Finding:**

- **F8 (P3) — The card's PR figures do not match the PR store.** The card claims **"3 NEW PRS"** and its highlights (Bench Press 49.6 lbs × 6, Barbell Row 33.1 lbs × 8, Overhead Press 22 lbs × 10) are the *baseline* sets from session 1. The store holds **6 PR records** for the week (5 session-1 baselines + the session-2 all-time Bench PR) — corroborated independently by the Data Vault inventory ("6 PRs") — and the Bench highlight shows the superseded 22.5 kg × 6 rather than the newer, heavier 25 kg × 5 PR. A plausible internal rule exists (highlights = best-volume set per scoreboard lift; "new PRs" counted over scoreboard lifts only), but it is not documented anywhere in the UI, and a user comparing the card against their PR page will see two different numbers. The card's headline stats (sessions/sets/volume/dates) are all exact; only the PR count/highlight selection diverges.

## J10 — Error & empty states · PARTIAL

**Fresh profile (profC) — empty states PASS:** onboarding completed with a single goal and explicit DOB (the summary again badged LEVEL / TRAINING DAYS / DIET as "DEFAULT" honestly). With zero logged data:

- **History:** "RECENT WORKOUTS — Your journey starts here. Completed training sessions, logged sets, and volume metrics will appear here." Sensible, no fake data, no crash.
- **Progress (from profA day-1, zero sessions):** Squat/Deadlift "No data yet — log one to start the trend"; muscle volumes all 0; scoreboard partial-total handled honestly (see J4).
- **Nutrition (zero meals):** "No meals logged yet today" with guidance toward the add paths; intake 0 against targets.

**Offline (local build) — FAIL, with a provenance caveat:** with the service worker registered, active, and controlling (verified via `navigator.serviceWorker`), the network was then emulated offline (CDP `Network.emulateNetworkConditions`, offline=true) and the page reloaded. In **three independent runs** the reload produced a **browser error page, not the app shell** (empty document; `localStorage` inaccessible — "Access is denied for this document", the signature of Chrome's error page). Local data itself was never at risk (it lives in localStorage and was intact on return online in profA runs), but the shell did not load offline.

- **F9 (P3, local-build caveat) — Offline reload does not serve the app shell in the local build.** Production's SW is generated with a different cache identity (`ascend-<sha>-cache`, from `VERCEL_GIT_COMMIT_SHA`) and its precache/navigation handling **may differ — production offline behavior is NOT TESTED** (production unreachable from this sandbox). Given the app's "100% Offline Local Storage" claim (Data Vault copy), offline *shell* loading deserves one verification pass against the production deployment or a SHA-stamped local build before the release gate relies on it.

**Incidental observations:** (a) Mid-onboarding progress does **not** survive a full browser relaunch — an incomplete onboarding restarts at the splash (observed twice on profC); a *completed* onboarding persists (J1/J2 evidence). (b) On a partially-driven profile (profB, contaminated by aborted driver runs), finishing onboarding bounced back to the details step with a visible "Please enter a valid date of birth." error rather than saving an invalid DOB — the error surfaced correctly, but step-level validation had let the flow reach the final step first. Low confidence as a product finding (contaminated profile); recorded for completeness.

---

## Findings register

| ID | Severity | Finding | Root cause (code) |
|---|---|---|---|
| F1 | P3 | Onboarding back-nav (offer → details) loses typed name; non-default gender resets the same way | `PersonalDetailsScreen` remounts with `initialName={athleteName}`; `Onboarding.handleFinishCalibration` calls `setDob` but never `setAthleteName`; no gender state feeds `initialGender`; `athleteName` is `''` for guests |
| F2 | P3 | Custom name-required error unreachable for empty name | Native `required` on `#details-name` pre-empts the React submit handler, so the `errNameRequired` banner never renders |
| F3 | **P2** | No edit path for a completed set (in-session or in History) — a mis-logged set is uncorrectable in-app | `ActiveWorkoutScreen` renders completed sets read-only; set chips exist only for pending sets; History detail exposes no set-level edit/delete |
| F4 | P3 | CURRENT SPLIT denominator changes 4 → 5 while a draft is in progress | Split counter counts the in-progress draft as an additional slot |
| F5 | P3 | Resume-banner Discard deletes the draft in one click, no confirmation | Banner Discard handler clears `activeWorkoutDraft` immediately; no confirm step (contrast the meal-delete confirm + undo) |
| F6 | P3 | Save Meal silently blocked without a meal name (and for zero-nutrition items) — toast only, requirement not discoverable in the sheet | `handleSaveMeal` (`src/components/MealsPage.tsx`:967) early-returns with `toast.error` for empty `mealName` / zero-data items; the name input is not marked required and the sheet shows no inline state |
| F7 | P3 | Meal builder's blank template row takes the quantity; displayed total can price two blocks for one visible item (795 kcal shown for a single 200 g paneer) | Selecting a food populates a second block while the empty FOOD 1 template remains first in DOM/input order |
| F8 | P3 | Share card "NEW PRS" (3) and highlights (baseline sets) diverge from the PR store (6 records; newer Bench PR exists) | Card aggregates a subset (apparently scoreboard lifts / best-volume sets) under an undocumented rule; Data Vault's count (6) uses the store |
| F9 | P3* | Offline reload yields a browser error page instead of the app shell (*local build only; production NOT TESTED) | Local SW (`ascend-dev-cache`) does not serve navigations offline in this build; production SW config unverified |

## NOT TESTED (with reasons)

- **Ask Coach topic-lock / off-topic handling** — unreachable locally: the AI route fails at the network layer (HTTP 503, no keys) before any topic logic can engage. The on-topic failure *mode* was the testable finding and is graceful (J8).
- **Backup restore / import** (J7) — export artifacts were produced and verified; re-importing them was not exercised in this round.
- **Production offline / production SW behavior** (J10) — production unreachable from this sandbox; the local build's SW differs in cache identity by construction.
- **Per-lift Progress chart drill-down** (J4) — overview values verified; PR rows are not plain buttons and the text-click did not navigate (driver limitation). The PR page itself was verified via "View All".
- **Form Coach runtime** — out of scope for this round (covered in Round 1b / PR #93–#94 records; phone GPU path still awaits a real-device check).
- **Sign-in / cloud account flows** — excluded by the round's guest-only boundary.

## Surprises vs the brief's expectations

1. **The arithmetic is exact everywhere it was checked** — workout volume to the kilogram, Epley estimates to the rounding, meal macros to the decimal, unit conversions to the digit, share-card volume across a unit change. The store and the UI never disagreed on a number in J2/J4/J5/J6/J9 headline stats.
2. **Honesty surfaces are real, not cosmetic** — DEFAULT badges on the onboarding summary, "estimated from your best rep performances, not tested maxes", partial-total DOTS handling, gated trend charts, "It never diagnoses pain", and a Coach's Take that degrades to a labeled *Local Coach* when the AI route fails.
3. **The two genuine friction points are both in correction/discoverability, not in the happy paths:** a logged set can never be edited (F3, the round's only P2), and Save Meal's name requirement is enforced invisibly (F6) — each is a place where a real user will conclude the app is broken while the app believes it is protecting them.
4. **The share card is the one place two subsystems disagree** (F8): the card's PR count (3) vs the Data Vault's (6) vs the PR store's (6 records) — worth one product decision on what "new PRs" means before the card is used for marketing screenshots.
