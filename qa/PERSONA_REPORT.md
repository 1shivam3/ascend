# QA-Hardening Phase 4 — Ten-Persona Test Report

**Branch:** `qa/phase4-personas` (from master `fdf69d18`; Phases 0–3 merged as PRs #119–#122)
**Scope:** the brief's Phase 4 — ten personas driven end-to-end in Playwright (android-360x740, touch), production build served locally, seeded from `qa/fixtures/personas.ts`.
**Rules honored:** harness AI mocks only (no real AI endpoint was ever called; `QA_REAL_AI` never set); no production Supabase project or real account touched (account work stops at the boundary Phase 3 Check 6 established); no app code changed in this phase — defects are documented, not fixed, per the phase's mandate.
**Final verification:** the full persona suite was re-run in one pass at the end — **12/12 tests passed** (10 persona files; Aman and Screen-reader carry 2 tests each), with step outcomes identical to the per-persona commits. Persona wall-clock seconds below are from the solo runs; under shared-VM load the combined run was slower (e.g. Rohan 110 s vs 54 s solo) with identical outcomes — seconds are environment-inflated and should be read as relative, not as device timings.

## Final gate numbers (branch tip)

| Gate | Result | Baseline at `fdf69d18` |
|---|---|---|
| vitest | **3,788 passed / 20 failed** (3,808 total) | 3,788 / 20 |
| lint | **107 problems** (2 errors, both pre-existing in vendored `public/mediapipe/wasm/*.js`) | 107 |
| tsc | **clean** (exit 0) | clean |
| build | **exit 0** | exit 0 |
| Playwright personas | **12/12 tests pass** (findings are recorded as failed *steps* inside passing tests, by design of the ledger) | — |

The 20 vitest failures are the pre-existing Docker-only `security-integration-gate` suite — unchanged.

## Results by persona

Outcomes use the brief's scale: **yes** / **with difficulty** / **no**. "No" steps are either defects (F4-x) or honestly-marked NOT TESTABLE legs. Screenshots live in `qa/screenshots/personas/<name>/` (360×740; light + dark wherever the state survives `setTheme`'s reload — the exceptions are noted in the specs).

| Persona | Commit | Taps | Solo sec | Steps yes / difficulty / no | Verdict |
|---|---|---|---|---|---|
| Rohan — core logging | `36737ae` | 46 | 54 | 4 / 1 / 0 | Pass with friction |
| Priya — Hindi, nutrition-first | `f73ba41` | 46 | 53 | 6 / 0 / 1 (voice: not testable) | Pass |
| Arjun — beginner onboarding | `d21849d` | 56 | 48 | 4 / 2 / 0 | Pass with friction |
| Meera — Advanced view + PRs | `e1fd9cb` | 37 | 40 | 5 / 0 / 0 | Pass |
| Aman — minor (15) | `34f91e8` | 7 + 5 | 12 + 3 | 3 / 1 / 0 | Pass |
| Sana — offline | `dd5458e` | 54 | 82 | 6 / 0 / 3 defect + 1 not-tested | **Fail on cold-offline (F4-1, F4-2)** |
| Vikram — injuries | `08a8d66` | 19 | 31 | 3 / 0 / 4 defect + 1 not-tested | **Fail on declared limitations (F4-3, F4-4)** |
| Dev — adversarial | `6b4381a` | 124 | 55 | 9 / 0 / 0 | Pass — no corruption found |
| Ananya — account lifecycle | `74ea52b` | 14 | 19 | 6 / 0 / 1 not-tested | Pass within harness scope |
| Screen-reader — a11y tree | `5e42e4c` | 7 + 18 | 17 + 5 | 9 / 0 / 0 | Pass (Chromium tree only) |

### Rohan — intermediate lifter, core logging journey
Start suggested workout = **difficulty**: three taps and a plan-generator modal stand between Today's "Start Workout" and the first set; the modal is a plan *editor*, not a confirm screen (finding F4-7). Log every set **yes**; finish + summary **yes** (history 18 → 19 asserted in the store); typed meal **yes**; protein target (162 g) findable on Fuel **yes**.

### Priya — nutrition-first, Hindi UI
Hindi Today/nav **yes**; Quick-log Indian meal (दाल, रोटी, पनीर) **yes**; protein vs target in Hindi **yes**; start + fully log a workout through Hindi labels **yes**; finish **yes**. Voice set logging **no — NOT TESTABLE**: it needs a live microphone; only its parse endpoint is mocked. (The session drivers in `persona-run.ts` were made bilingual for this persona.)

### Arjun — beginner, truly fresh profile
Guest onboarding **yes**; details step **difficulty**: Continue silently does nothing until the bodyweight question is answered ("I'll add this later") — no hint is shown (F4-5). Plan offer declined **yes**; first workout start **difficulty** (same modal gate as Rohan); log every set **yes**; finish + saved to history (0 → 1) **yes**.

### Meera — Advanced view + Progress/PRs
Progress Personal Records **yes** (est. 1RM shown: Deadlift 163.3, Squat 119.6); View All lists all 5 PRs incl. Barbell Row **yes**; Advanced session start **yes**; log every set via row toggles + exercise-complete cards **yes**; finish **yes**, with the saved session asserted set-complete (every set completed) in the store.

### Aman — minor, 15, Lose Fat (PR #108 clamps)
Today/Fuel target is **1,806 kcal — maintenance** for the seeded stats — labelled "Estimate", **yes**; creatine hidden on Today and Fuel **yes**; a mocked coach action proposing **1,200 kcal cannot apply** (Fuel still 1,806 afterwards, no deficit delta in store) **yes**. Under-13 onboarding **difficulty**: the DOB year list simply stops at current-year − 13, so an under-13 date cannot be entered — the block is real but silent, with no 13+ explanation anywhere (F4-6).

### Sana — offline (see defects F4-1, F4-2)
Cold legs **no** (defects, screenshots in light + dark): first-ever open of Train while offline crashes into the error boundary; relaunch/reload while offline fails outright. Warm legs all **yes**: after one online visit per tab, the suggested workout was started, fully logged, and finished offline; a meal was logged offline (Quick log; its parse endpoint is mocked — see confidence statement); Coach's Take fell back to the on-device **Local Coach**; reconnect left all data intact (19 workouts, 7 meals, PRs unchanged). Cloud sync **NOT TESTED** (no backend in this harness).

### Vikram — knee + low-back limitations declared (see defects F4-3, F4-4)
Default suggested plan avoids the limited areas **yes**. Legs generation **no** (F4-3, light + dark): barbell Squat prescribed with no warning; started session opens on Squat **no** (F4-3 end-to-end). "Hurts" swap **no** (F4-4): consequence note renders but zero replacements are offered for Squat. Removing the exercise from the session **yes**; future generated plans then keep Squat out **yes** (in-session pain flags ARE honored — the gap is specifically the *declared* limitations). Coach context **NOT TESTABLE** end-to-end (server-side prompt; `src/lib/ai-context.ts` adds `LIMITATIONS/INJURIES: …` — code-verified).

### Dev — adversarial
9/9 **yes**, no defect found: hostile meal text (5,000 chars, emoji, RTL override, markup) logs safely and the store still parses; weight steppers floor at 0 under 30 rapid −5 taps and cap sanely under 40 rapid +5 taps (persisted weight finite, within [0, 1000]); rapid double-tap on Complete Set logs **exactly one** set; page killed mid-workout → draft recovered via the Train "Workout in progress" banner with completed sets intact, and the recovered session finishes and saves normally; deleting the Deadlift-PR workout recomputes the **derived** PR series (no record sourced from the deleted session; best derived 136 kg) — the fixture's manual-shaped PR persists, which is R1's stated rule for manual PRs (Phase 1 unit tests cover the derived-only scenario); Undo restores workout + PR; a second tab boots from the live shared store consistently.

### Ananya — account lifecycle (harness scope)
Upgrade sheet from the guest banner **yes**; empty-submit inline validation **yes**; invalid email/short-password inline rejection **yes**; valid-looking sign-up attempt fails with **generic copy only** — no "Supabase", no raw fetch/auth error text anywhere (the F-10 rule) — and guest data intact **yes**; wrong-password login likewise generic-only **yes**; dark-theme sheet **yes**. The real round-trip (sign-up → sign-out → sign-in, server-side guest-data merge, second device, account deletion) is **NOT TESTED**: no Supabase is configured in this harness build and tests never touch real accounts; Phase 3 Check 6 covered merge semantics with a stubbed provider.

### Screen-reader — accessibility tree (Chromium, NOT a real screen reader)
9/9 **yes**: on Today, Train, the plan-generator dialog, the live session, Fuel, Progress, and You, **every** interactive element (button, link, textbox, tab, switch, checkbox, combobox, slider, menuitem, radio, spinbutton) carries an accessible name. The dialog is named and focus lands inside it. The two Progress icon buttons suspected unnamed from DOM text scans **do** carry aria-labels in the tree. Keyboard: 18 Tab stops on Today, all named, nav reachable early. aria-live regions exist for announcements (their content was not verified). Method note: Playwright 1.65 removed `page.accessibility`; this persona uses `ariaSnapshot()` — the same Chromium accessibility tree a real screen reader consumes, but driven programmatically, on one viewport, without TalkBack/VoiceOver speech, timing, or gesture models.

## Defects found

Severity scale: Critical = data loss or safety harm with no workaround · High = a core promise broken on a realistic path · Medium = real harm with a workaround · Low = friction/cosmetic.

### F4-1 — HIGH — First-ever open of a tab while offline crashes (offline/perf)
- **Repro (Sana):** fresh profile → let the service worker install and activate (verified `active` + `controller` in-page) → go offline → tap "Start Workout" (opens Train). Result: the error boundary — "Something went wrong / An unexpected error occurred while loading this view." Train's lazily loaded chunk is neither precached nor runtime-cached yet. Proven for Train in light **and** dark, and for Fuel (the first Sana run's meal leg died the same way). Any lazily loaded surface is exposed until it has been visited online once; because chunk URLs are content-hashed, **every deploy returns users to the cold state** until their next online visit to each tab.
- **Mitigating behavior:** the error screen's copy is honest ("Your logged workouts, PRs, and personal records remain safely stored") and no data was lost in any reproduction.
- **Evidence:** `qa/screenshots/personas/sana/cold-train-error-light.png`, `cold-train-error-dark.png`; spec `qa/e2e/personas/sana.spec.ts`.

### F4-2 — HIGH — Relaunching the app while offline fails outright (offline/perf)
- **Repro (Sana):** with the service worker verified active and controlling, go offline and reload. Result: `net::ERR_INTERNET_DISCONNECTED` — the browser's offline error, not the app. The service worker's navigation handling does not serve the precached shell in this build (the SW template intends network-first for navigations; whatever fallback exists did not engage here). The real-world shape: a user whose app was killed in a basement gym cannot reopen it offline at all.
- **Harness caveat, stated plainly:** the local build's generated SW carries the dev cache name (`ascend-dev-cache`); the production build embeds the deploy SHA instead. The SW *code path* is the same template; whether production's precache timing differs could not be tested from here and is on the device checklist.
- **Evidence:** Sana spec, step "Relaunch the app while offline (reload)" — recorded error verbatim.

### F4-3 — HIGH — Plan generator ignores DECLARED injury limitations (safety)
- **Repro (Vikram):** profile declares Knee + Low back limitations (`trainingProfile.injuriesOrLimitations`). Open Train → Suggested Workout → select "Legs". Result: **barbell Squat** is prescribed as exercise 1 with **no warning, swap, or drop**; starting the session opens on Squat. Reproduced in light and dark.
- **Root cause (code-read):** the adaptation pipeline exists — `prepareGeneratedPlans` receives `limitations` on the split-schedule path (`SuggestedWorkoutModal.handleApplySplitSchedule`), and the hand-built plan editor warns on clashes (WorkoutPage, SIM-P1-02 banner) — but the modal's body-part generator path calls neither. Narrowing evidence: pain reported *in-session* IS honored (after Vikram's "Hurts" interaction, regenerated Legs plans exclude Squat), so the generator reads pain flags but not the declared limitations list.
- **Evidence:** `qa/screenshots/personas/vikram/generator-legs-light.png`, `generator-legs-dark.png`, `session-first-exercise-light.png`.

### F4-4 — MEDIUM — "Hurts" swap offers no replacement for Squat (safety)
- **Repro (Vikram):** in the F4-3 session → Workout Tools → Swap this exercise → "Hurts / joint discomfort". Before the chip, three replacements are offered (Leg Press, Hack Squat Machine, Goblet Squat); after it, the same-family/joint filter empties the list entirely. The consequence note renders ("…removes it from your future plans…") but **no swap can be completed in-panel**; the panel falls back to "use Add exercise". Removing the exercise from the session works and is the only clean escape.
- **Evidence:** `qa/screenshots/personas/vikram/swap-panel-light.png`.

### F4-5 — LOW — Onboarding Continue gate is silent (onboarding)
- **Repro (Arjun):** on the details step, fill name/gender/DOB and tap Continue without answering the bodyweight question: nothing happens and nothing says why. The "I'll add this later" answer is required; there is no hint, shake, or inline note.

### F4-6 — LOW — Under-13 block is silent (safety copy)
- **Repro (Aman):** the onboarding DOB year list ends at current-year − 13, so an under-13 user cannot enter their birth year — effective, but no copy anywhere states a 13+ rule; a young user just finds their year missing.

### F4-7 — LOW — Three taps + a plan editor gate the first set (logging friction)
- **Repro (Rohan, Arjun, Priya):** Today "Start Workout" → Train → "Suggested Workout" → a plan-*editor* modal → "Start Workout". For a first-week beginner (the brief's Rohan), being asked to confirm/edit a generated plan before touching a set is the single largest friction in the core loop. Recorded as difficulty, not failure — the path always worked.

### Known issues carried from Phase 3 (not re-litigated, scored where they land)
- **F3-1 (Medium)** — meal-scan item-name canonicalization is enforced server-side only; the client renders model names verbatim. (Nutrition.)
- **F3-4 (Medium)** — Form Coach summary modal + analyzer strings are hardcoded English (Hindi users get English there). (Visual/differentiation; also an owner scoping decision still pending.)
- **F3-2 (Low)** — "Graphite" theme pill ~3 px text overhang at XL/320, proven not visibly clipped. (Visual.)
- **F3-3 (Low)** — Today quick-action tiles wrap labels letter-by-letter at 320×568 / XL text. (Visual.)
- **F3-5 (Low)** — Hindi weekly-review sentence drops the `{scope}` value (deliberate test-pinned trade-off; real fix is localizing scope generation in `weekly-review.ts`; owner decision pending). (Visual/nutrition-adjacent.)
- **F3-6 (Low)** — residual unkeyed English strings on Train. (Visual.)

### Owner decisions still open (not defects; unchanged by this phase)
1. Legal pages naming the "Macro Lens Photo Estimator" — edit with a LEGAL_VERSION bump, or leave.
2. Sibling Hindi `tools.*` title mistranslations — fix, or leave parked with the Hindi backlog.
3. F3-5 — localize weekly-review scope/segment generation, or accept the pinned trade-off permanently.
4. F3-4 — is converting the Form Coach summary modal + analyzer strings to i18n keys in scope?
5. (From the phased engineering brief) Day-kind display scaling for minors (fast ×0.7) remains unclamped by design — clamp it too, or confirm it stays.

## Scores

Anchors (brief): 3 = broken or untrustworthy · 5 = works but with real friction · 7 = good, few rough edges · 9 = best-in-class. Caps applied mechanically: an open **High** caps its dimension at 7; an open **Critical** caps at 5; any open **data-loss** issue caps the overall at 6. There is **no open data-loss issue** (Dev + Sana proved local data survives abuse, kills, deletes-with-undo, and offline cycles), so the overall is not capped.

| Dimension | Weight | Score | Cap applied | Evidence (≥2) | What raises it by one point |
|---|---|---|---|---|---|
| Core logging speed & correctness | 25% | **8** | — | Full sessions completed in Simple view (Rohan, Arjun, Priya-Hindi) and Advanced view (Meera, saved session asserted set-complete); double-tap logs exactly one set (Dev) | Remove the plan-editor gate (F4-7): one confirm between Today's CTA and the first set |
| Data integrity & reliability | 15% | **8** | — | Dev 9/9: hostile inputs, kill-and-recover draft, R1 derived-PR recompute + Undo, two-tab consistency; Sana's offline writes all intact after reconnect | A verified two-device sync round trip (currently NOT TESTED) plus a backup-restore proof |
| Nutrition accuracy & trust | 10% | **7** | — | Quick log works in English and Hindi UIs (Rohan, Priya); protein-vs-target readable in both; minor targets maintenance-labelled (Aman); F3-1 (Medium) still open | Close F3-1 (client-side canonicalization) and verify scan-trust on a real device photo |
| Onboarding & first run | 10% | **6** | — | Guest onboarding completes end-to-end (Arjun, Aman under-13 leg); F4-5 silent Continue gate; plan-offer and first-run flow otherwise smooth | Add a hint to the Continue gate (F4-5) and a one-line 13+ note at the DOB field (F4-6) |
| Visual design & consistency | 10% | **7** | — | Phase 3: accent contrast AA in both themes, clipping fixed; Phase 4 screenshots consistent light/dark across 10 personas; F3-2/F3-3/F3-6 (Low) still open | Clear the three Low Phase-3 visual findings |
| Accessibility | 10% | **8** | — | Every interactive element named on 7 surfaces incl. dialog + live session (Screen-reader); dialog focus lands inside; 18/18 keyboard stops named; aria-live regions present | A real TalkBack/VoiceOver pass (announcement *content*, rest-timer announcements) confirming what the tree promises |
| Offline & performance | 10% | **6** | **≤7 (F4-1, F4-2 High)** | Warm offline journey flawless incl. Local Coach fallback (Sana); cold tab open crashes (F4-1) and offline relaunch fails (F4-2) with the SW verified active | Precache or runtime-cache the lazy tab chunks and serve navigations from cache offline — then re-run Sana cold |
| Safety, privacy & honesty | 5% | **5** | **≤7 (F4-3 High)** | Minors exemplary: maintenance-only targets, creatine hidden, deficit coach-action cannot apply, under-13 unenterable (Aman); auth errors generic-only, no provider leak (Ananya) — but declared injury limitations are ignored by the generator (F4-3) and the hurts-swap dead-ends (F4-4) | Route the modal generator through the same limitations pipeline as the split path (F4-3) and give the hurts-swap a non-empty fallback (F4-4) |
| Differentiation | 5% | **6** | — | Offline Local Coach fallback observed live (Sana); coach actions with confirm-cards + blocked state for minors (Aman); pain-flag learning loop works (Vikram future-plans leg); Form Coach summary surface still NOT TESTED (Phase 3) and English-only (F3-4) | A verified Form Coach summary on real footage + the F4-3 fix making the injury-aware coaching claim true on every path |

**Weighted overall: 7.2 / 10** (2.00 + 1.20 + 0.70 + 0.60 + 0.70 + 0.80 + 0.60 + 0.25 + 0.30 = 7.15).

## Release verdict

**Ship-with-notes (Beta-grade) — not "Ready for public launch" until F4-3 and F4-1/F4-2 are fixed.**

Everything a user does every day — log workouts in both views and both languages, log food, recover from mistakes and dead pages, train offline on a warm cache, stay safe as a minor — works, and data integrity under adversarial abuse is genuinely strong. But two of the app's headline promises fail on realistic paths: "works offline" fails the first time each tab is opened offline and on any offline relaunch, and "respects your injuries" fails on the main plan-generation path for exactly the users who declared limitations. Both are bounded, understood, and have workarounds (one online visit per tab; split-schedule generation or in-session removal) — which is why this is ship-with-notes rather than hold — but they should be the next fixes, in the order F4-3, F4-1, F4-2, F4-4.

## Confidence statement

**What was tested:** ten seeded personas driven end-to-end (12 Playwright tests, ~500 recorded taps) on a local production build at 360×740 with touch emulation, light + dark themes, English + Hindi, offline toggles, and store-level assertions after nearly every journey. All Phase 0–3 gates re-run at baseline.
**What was mocked:** every AI endpoint (coach chat, Coach's Take, meal parse/scan, voice parse) with the harness fixtures — AI *quality* is not assessed here, only that the app behaves correctly around the calls. The meal quick-log's parse call is intercepted, so Sana's offline meal proves local state handling, not real-world offline parsing (in production that call needs a network or an on-device path).
**What could not be tested (NOT TESTED, and the scores do not cover it):**
- Real auth provider round-trip (sign-up/sign-out/sign-in, server-side guest merge, second device, account deletion) — no backend is configured in the harness and real accounts are never touched from tests.
- Real cloud sync, including two-device/two-context conflict behavior (Sana's second-context leg from the brief is therefore also untested — only Dev's same-device two-tab consistency was).
- Form Coach summary modal's rendered DOM (landmarks cannot be injected — Phase 0 limitation, unchanged).
- A real screen reader (TalkBack/VoiceOver), real-device behavior: camera, microphone (Priya's voice leg), haptics, push notifications, rest-timer audibility, notch/safe-area, Health Connect.
- Production service-worker behavior on the real deployment (the F4-2 caveat above) and performance on real mid-range hardware (this VM's timings are load-inflated and not representative).
- The coach-context contents for injuries (server-side; code-verified only).

## Manual device checklist (only the owner's phone can verify these)

1. **Offline relaunch:** install the PWA, open it once online, kill it, enable airplane mode, reopen — does the app render? (F4-2 on the real deploy.)
2. **Cold offline tab:** after an app update, before opening Train online, go offline and open Train. (F4-1 on the real deploy.)
3. **Rest-timer sound** audibility with the phone locked/pocketed (outstanding since PR #70).
4. **Form Coach on real footage:** squat on the phone; the nine batch exercises (bench first) — synthetic-only so far; check the summary modal reads truthfully.
5. **Meal scan with the real camera** (photo + barcode) and a real thali; confirm computed confidence matches the food.
6. **Voice set logging** with the microphone, Hinglish phrases (Priya's untestable leg).
7. **TalkBack pass:** Today → start workout → complete a set (rest-timer announcement) → Fuel quick log; confirm announcements are spoken and focus order feels sane.
8. **Real account round trip:** create account as a guest with data → verify merge → sign out → sign in on a second device → confirm history arrives; then the account-deletion flow.
9. **Sync across two devices:** log on both while one is offline, reconnect, confirm nothing is lost or duplicated.
10. **Reminders/push** delivery on Android, and Health Connect steps/heart-rate appearing after a real day.
11. **Notch / gesture-bar safe areas** on the owner's device in a live session (Complete Set reachability one-handed).
