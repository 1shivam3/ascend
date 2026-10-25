# ASCEND UX Redesign — Synthetic Personas, Round 2 (Phase 11)

> **Status:** Structured simulation, not real research. No interviews were conducted, no survey results exist, and no numbers below are measurements. Every rating is a qualitative simulated judgment (1–5) grounded in static inspection of the implemented code on `feat/ux-redesign` @ `4c87b22`. Ratings explain *why*, and are never presented as usability rates, conversion, retention, or seconds saved.
> **Scope:** The SAME 12 personas and SAME 36 tasks as Round 1 (`docs/ux-redesign/synthetic-personas-round-1.md`), re-simulated against the implemented redesign (Stages 1–10, `docs/ux-redesign/implementation-summary.md`). Form-check does not exist on this branch and is not simulated. The conversational coach chat UI, coach cloud sync, and MediaPipe CSP changes live only on unmerged branches and are not simulated either. No browser was operated and no screenshots were taken in this phase (no tooling exists in the repo) — every visual claim is a code-level observation, and anything needing eyes is recorded as owed to Phase 12, never claimed as verified.
> **Method note:** Each task below reuses Round 1's ten items (objective; starting screen/state; expected sequence; confusing labels/choices; memory burden; unnecessary navigation/scrolling; error/abandonment point; suggested correction; implementation evidence; confidence + unresolved assumptions) and the same six 1–5 dimensions (5 = exemplary, 4 = good with minor friction, 3 = workable but flawed, 2 = seriously impaired, 1 = blocked). A task verdict is one of: **Fixed** (the Round 1 friction is gone in code), **Partial** (materially improved, a named residue remains), **Unchanged** (no implementation touched it), **Still failing** (the task objective remains impossible or dishonest). Check baseline for this phase is implementation Stage 10's: vitest 1,788 passed / 20 failed (20 = known Supabase/Docker gate only), tsc clean, build passes, lint exit 0 with 15 pre-existing warnings. Phase 11 re-ran no checks — this is a simulation phase, not a verification phase.

## How to read this document

Each persona restates its Round 1 profile briefly, then re-runs its three tasks against the implemented code, with a verdict per task and a Round 1 → Round 2 rating table. The before/after comparison, ranked remaining issues, verdict against the brief's bar, and the Phase 12 handoff follow at the end. Two implementation realities shape every persona and are not re-litigated per task: (1) **two density defaults** — fresh stores default Simple, pre-redesign blobs migrate to Detailed (persist version 1 → 2, `migratePersistedState`); (2) **black-on-vermilion primary buttons in light mode** — a contrast-audit correction (white 4.07:1, graphite 4.34:1, black 5.15:1), not a design whim. New personalization keys are local-only by construction (no `uiPreferences` field travels in any sync payload); UI copy must not promise cross-device sync for them.

---

## Persona 1 — Aarav, the New Gym Member

- **Profile (unchanged from Round 1):** 24, student, gym two weeks, beginner, phone-only, low density, near-zero customization tolerance. Needs: what to do today, what a set means, whether he did it right.

### Task 1.1 — Finish onboarding and find the first workout — **Fixed**
1. **Objective:** Create a usable profile and reach a first workout without getting lost.
2. **Starting screen/state:** Fresh install, no profile → Splash → Welcome.
3. **Expected sequence:** Welcome → labeled "Continue as Guest" (or Create account) → Goals → Experience → Schedule → Details → Plan offer (Skip = Accept visually) → **Summary screen** → Today → pinned workout card → Start.
4. **Confusing labels/choices:** Guest path is now a first-class labeled button with a caption ("No account needed — your data stays on this device"), not a discreet link. Plan-offer Decline is now a full button (`w-full py-4 px-6 rounded-2xl font-bold text-base`), geometrically equal to Accept, not a ghost link. Password rule is a persistent hint under the field (`auth.passwordLength`), not only a placeholder and a post-submit error.
5. **Memory burden:** The summary screen restates stored choices only — goal (canonical label), level, training days, diet, injuries (or "No injuries") — before tabs. The 9-step length remains by design (each step feeds a real engine input), but recall is no longer required.
6. **Unnecessary navigation/scrolling:** One added screen (summary) that *removes* uncertainty; the summary's Edit button routes to You → Settings (Training Preferences) after tabs, by design — no back button, which is a deliberate trade (edits happen after tabs, not mid-flow).
7. **Error/abandonment point:** The Round 1 bounce points (hidden guest path, unexplained plan offer, password rule discovered on failed submit) are all addressed in code. Residual: a 10-step first run is still long, and the summary's honesty depends on stored values being correct (direct `?screen=summary` without a profile degrades to honest defaults rather than crashing).
8. **Suggested correction (remaining):** None for this task's Round 1 items. Live check still owed: whether the guest button reads as the primary path for a true first-timer (tap-through, Phase 12).
9. **Implementation evidence:** `src/components/onboarding/SummaryScreen.tsx` (new); `Onboarding.tsx` (all three completion paths route through `'summary'`; `?screen=` allowlist includes it); `WelcomeScreen.tsx:103,105` (`onboarding.continueAsGuest`, `onboarding.guestNote`); plan-offer Decline geometry pinned by Stage 7 tests; `CreateAccountScreen.tsx` persistent hint reusing `auth.passwordLength`.
10. **Confidence + assumptions:** High (code-verified). Unresolved: first-timer comprehension of the summary screen needs a live read.

### Task 1.2 — Log a first workout without knowing the modes — **Fixed**
1. **Objective:** Complete a simple session and understand what was recorded.
2. **Starting screen/state:** Today → pinned workout card → Start (or Train → Plans → Start).
3. **Expected sequence:** Start → perform surface (Beginner, because a new account defaults to Simple and mode follows density) → steppers → Finish → summary.
4. **Confusing labels/choices:** The mode is no longer a hidden tools-menu secret: density drives it (`resolveWorkoutMode` in `src/lib/workout-mode.ts`: override wins, else Detailed → Advanced, anything else → Beginner), and the tools-drawer control is now a labeled Auto/Simple/Advanced `SegmentedControl` writing `workoutModeOverride`, with a caption showing the effective mode plus " · Auto" when following density. "Set type" and RPE/RIR remain unexplained on first use — the one residue.
5. **Memory burden:** Previous performance is shown in-workout (last-time line in Simple; last-3-sessions expander in Detailed), so last session's weight is visible, not remembered.
6. **Unnecessary navigation/scrolling:** Plan-card Start lands directly on the perform surface (verified pre-existing behavior, not a new hop — the decision doc's "logger → perform" description referred to the pre-fill mechanism, not a visible compose screen). The logger/perform distinction now reads as Build vs Train wording ("Build workout plan" on creation surfaces).
7. **Error/abandonment point:** A wrong weight can be edited in-table; the finish summary shows what was recorded. Residual risk is jargon (set type, RPE) on first use, not navigation.
8. **Suggested correction (remaining):** One-line explanations for set type and RPE/RIR on first use (copy-only follow-up; no logic change).
9. **Implementation evidence:** `src/lib/workout-mode.ts` (pure, tested 3/3); `ActiveWorkoutScreen.tsx:162` (derived `workoutMode`, legacy `userMode` no longer drives display); tools-drawer `SegmentedControl`; `ActiveWorkoutScreen.tsx:2463-2466` (Detailed history expander, `workout.previousSessions`).
10. **Confidence + assumptions:** High on mode derivation; medium on first-use jargon comprehension (needs a live read).

### Task 1.3 — Log a meal by searching — **Partial**
1. **Objective:** Record lunch without scanning or knowing food-database terms.
2. **Starting screen/state:** Fuel → Today → Add Manually → food search autocomplete.
3. **Expected sequence:** Search "dal" → pick entry → adjust portion → save → "What you ate today" updates.
4. **Confusing labels/choices:** Per-item chips now exist in both today and history rows: exact = subtle emerald `meals.exactChip`; approximate = amber `common.estimatedShort` ("est.") with an `aria-label` carrying full provenance (`meals.estimatedFrom`, the matched entry); unmatched = amber `meals.notInDbShort`. The banner-only ambiguity from Round 1 is fixed at list level. Residues: portion-memory values are still not labeled ("your usual: 1 katori" was suggested, not built), and the "est." badge still needs a live comprehension read for a true beginner.
5. **Memory burden:** Unchanged (portion memory still silent), but lower stakes: the chip tells him whether the number is exact or estimated before he trusts it.
6. **Unnecessary navigation/scrolling:** Unchanged (Fuel's three segments; form behind "Add Manually" while Scan is visually dominant). Scan/manual/barcode already land on the same meal list via the shared modals — no divergent forms.
7. **Error/abandonment point:** A wrong-entry pick is now visible as amber before saving; a genuinely unmatched food still reaches custom fields with the long `meals.notInDb` string in the edit form. The abandonment risk moves from "trusted a wrong number" to "didn't understand est." — a smaller risk, still live-checkable.
8. **Suggested correction (remaining):** Label portion-memory values; plain-words est. explanation on first use ("We guessed this food — check the numbers").
9. **Implementation evidence:** `MealsPage.tsx:2209-2213,2404-2408` (chips in both rows); shared `ScanMealModal`/`BarcodeScannerModal` rendered by both HomePage and MealsPage.
10. **Confidence + assumptions:** High on chips; medium on beginner comprehension of "est." (live read owed).

### Persona 1 ratings (Round 1 → Round 2)
| Dimension | R1 | R2 | Why |
|---|---|---|---|
| Task clarity | 2 | 4 | Guest labeled, summary exists, Skip = Accept, password hint, mode follows density. Residue: 10-step onboarding length, unexplained set-type/RPE jargon. |
| Information hierarchy | 2 | 4 | Action-first fold, pinned workout card, Simple default for new accounts, ONE Coach section. |
| Interaction effort | 3 | 4 | Mode no longer hunted; Start is direct. Residue: portion-memory silence. |
| Visual comprehension | 3 | 4 | 11px label floor (341 usages), tokens, D2 success separation. |
| Accessibility | 3 | 4 | Global `:focus-visible` rule, 44px primary targets, success with icon + label. |
| Perceived polish | 3 | 4 | First-run path feels designed now. Residue: first-week empty-section copy quality needs live eyes. |

### Persona 1 keep / simplify / access less often (updated)
- **Keep:** Guest-first access, Beginner-by-density, quick-add habits, forgiving streaks, summary screen.
- **Simplify:** Still: one-line set-type/RPE explanations on first use; portion-memory labels.
- **Access less often:** Charts, standards, plate calculator, meet planner, policy ledger, macro breakdowns (unchanged).
- **Abandonment reasons (revisited):** "Feels like an app for lifters" is substantially reduced; "cannot find the first workout" is fixed; jargon without explanation is the remaining risk, now confined to in-workout labels.

---

## Persona 2 — Meera, the General Fitness User

- **Profile (unchanged):** 31, office job, home + gym mix, mornings, 3×/week, low–medium density, low customization tolerance. Needs: what to do today, weekly on-track signal, simple nutrition totals.

### Task 2.1 — Morning check: what is today's priority, then start — **Partial**
1. **Objective:** Open the app, know what to do, start in under a minute.
2. **Starting screen/state:** Returning user, last tab restored (may be Fuel or Progress — **last-tab restore is unchanged**, `src/lib/navigation.tsx:95,112`).
3. **Expected sequence:** Open → (possibly wrong tab) → Today → pinned workout card (order 1, above the fold) → Start; or, if a draft exists, the Resume bar from ANY tab (`page.tsx:349,394`, full-width button above the nav) → workout tab.
4. **Confusing labels/choices:** The fold is now designed (header + workout card + nutrition strip), and the Resume affordance is persistent — but cold-open landing is still last-tab, so "open the app" still does not reliably mean "see today" unless a draft exists. The decision to keep last-tab restore (deliberate, not an oversight) is the residue.
5. **Memory burden:** Lower: the card is pinned first, the Resume bar carries draft state visibly, and the sync caption near the bell states Syncing/Synced/Failed/Local only in text.
6. **Unnecessary navigation/scrolling:** Scroll past the coach cluster is gone (ONE Coach section; supporting sections user-ordered). Tab correction on cold open remains when the last tab was not Today.
7. **Error/abandonment point:** Opens to the wrong tab, sees a wall — much less likely now (fold is one action + one strip), but still possible. The "trains without logging" failure mode is reduced, not eliminated.
8. **Suggested correction (remaining):** Decide explicitly (user decision, not silent): Today-first landing on training days vs keeping last-tab restore, with the Resume bar as the safety net either way. Do not change restore behavior inside a redesign follow-up without that call.
9. **Implementation evidence:** `HomePage.tsx:557,683` (header 0, workout card order 1 pinned); `page.tsx:348-349,394,477-490` (isYouTab, showResumeBar, spacer, 5-item nav); `HomePage.tsx:598-600` (sync caption); `src/lib/navigation.tsx` (restore unchanged).
10. **Confidence + assumptions:** High on fold/resume; medium on whether last-tab restore delights or annoys (still a hypothesis — the Round 1 note stands).

### Task 2.2 — Rest day: is the app still useful? — **Partial**
1. **Objective:** Check in on a rest day without feeling behind.
2. **Starting screen/state:** Today, routine is a rest day.
3. **Expected sequence:** Today → workout card slot names the rest day → habit matrix (user-ordered) → optional weekly review.
4. **Confusing labels/choices:** The card no longer pretends: when the routine name matches rest day, the subtitle shows `home.restDayLine` ("Recovery is training too — sleep well, eat well, come back stronger tomorrow.") instead of duration/exercises. This is a genuine designed treatment at the card slot — but it is a line inside the workout card, not a distinct rest-day layout (no separate recovery-note + habit-forward arrangement). Streak language risk is unchanged (forgiving freezes by rule; copy tone not re-audited here).
5. **Memory burden:** None significant.
6. **Unnecessary navigation/scrolling:** Full stack no longer renders unconditionally — hidden sections consume no gap, and user order puts habits where she wants them. The rest-day layout is still the normal layout with a rest-day card, not a rest-day-specific arrangement.
7. **Error/abandonment point:** "Rest day feels like an empty failure state" is substantially reduced (named + warm copy); "habit loop breaks because rest days aren't worth opening" is not fully closed (no distinct rest-day state to open *for*).
8. **Suggested correction (remaining):** A distinct rest-day arrangement (recovery note + habit matrix + weekly summary forward) as a visual-phase follow-up, or an explicit decision to keep the card-line treatment. Do not overbuild: the line may be enough — confirm by tap-through, not by adding sections.
9. **Implementation evidence:** `HomePage.tsx:703-704` (rest-day subtitle branch); `en.ts:2732` / `hi.ts:2729` (`home.restDayLine`, both locales); hidden-section `hidden` (no gap) behavior.
10. **Confidence + assumptions:** Medium-high (code-verified line); medium on whether the line suffices emotionally (needs a live read).

### Task 2.3 — Change the weekly target from Auto to 3 days — **Partial**
1. **Objective:** Set a realistic weekly training target.
2. **Starting screen/state:** You → Settings → Training Preferences (4 IA sections, chips retargeted) → Weekly target.
3. **Expected sequence:** You tab → Settings segment → Training Preferences → weekly target → pick 3 → back.
4. **Confusing labels/choices:** The Round 1 "Auto is unexplained" complaint is answered: `settings.weeklyTargetHint` reads "How many workouts per week Home counts toward. Auto follows your schedule; Off just counts — no target, no pressure." (both locales). The target-vs-schedule overlap remains conceptually (two controls, nearby), but both now live in one Training Preferences section with the hint. The Round 1 suggestion to surface the control in Profile/You as well was NOT built — it remains Settings-only.
5. **Memory burden:** Lower: 4 sections with chips + `scroll-mt-28` jump links beat the old long page; the You tab gives a labeled entry from every tab.
6. **Unnecessary navigation/scrolling:** Still a Settings trip for a training decision (no Today/Train shortcut). Shorter trip, same destination class.
7. **Error/abandonment point:** "Gives up and leaves Auto on" is less likely (hint + findable section); "expectations don't match her life" is fixed when she reaches the control.
8. **Suggested correction (remaining):** A Today/Train shortcut to the same canonical control (not a copy) — or an explicit decision that Settings-only is acceptable now that You is labeled and persistent.
9. **Implementation evidence:** `SettingsView.tsx:694` (Training Preferences); `en.ts:1071` / `hi.ts:1068` (hint, both locales); `SettingsView.tsx:702-727` (target control, Auto/Off/2–6).
10. **Confidence + assumptions:** High on hint + location; medium on whether Settings-only is acceptable (needs a tap-through).

### Persona 2 ratings (Round 1 → Round 2)
| Dimension | R1 | R2 | Why |
|---|---|---|---|
| Task clarity | 3 | 4 | Fold designed, Resume bar, Auto explained. Residue: last-tab landing, Settings-only target control. |
| Information hierarchy | 2 | 4 | Action-first fold, ONE Coach section, rest day named, 4-section Settings. |
| Interaction effort | 3 | 3 | Shorter trips, but cold-open tab correction and the Settings-only target control remain. |
| Visual comprehension | 4 | 4 | Already calm; tokens + label floor maintain it. |
| Accessibility | 3 | 4 | Focus rule, 44px targets, text-only sync caption. |
| Perceived polish | 3 | 4 | Rest-day line, welcome-back, sync honesty. Residue: landing behavior is a deliberate open question. |

### Persona 2 keep / simplify / access less often (updated)
- **Keep:** Workout card, nutrition strip, habit matrix, forgiving streaks, quick-adds, rest-day line.
- **Simplify:** Still: landing decision (Today-first vs last-tab), target-control shortcut.
- **Access less often:** Standards, meet planner, plate calculator, policy ledger, macro tab, PR deep-dives (unchanged).
- **Abandonment reasons (revisited):** "Wall of numbers" fixed by the fold; "rest days feel like failure" substantially reduced; "configuration takes longer than training" improved but not closed for training decisions that live in Settings.

---

## Persona 3 — Rohan, the Bodybuilding Lifter

- **Profile (unchanged):** 27, 4 years, push/pull/legs, 5–6×/week, advanced, phone in gym one-handed, high density in workout only. Needs: current exercise + set + previous performance + volume, at a glance.

### Task 3.1 — Start a push session and log it in Advanced mode — **Partial**
1. **Objective:** Execute a 6-exercise session with minimal taps per set.
2. **Starting screen/state:** Train → Plans → Start plan → perform surface (Advanced, because he is an existing user → Detailed default, and mode follows density).
3. **Expected sequence:** Start → perform surface directly (no editor interstitial — verified pre-existing) → per-exercise table → steppers → complete → auto-advance → Finish → summary.
4. **Confusing labels/choices:** Mode is now labeled (Auto/Simple/Advanced segmented control + caption) instead of a hidden tools-menu toggle — but it still lives in the tools drawer, not in-table. Set-type and RPE/RIR labels remain unexplained in-table.
5. **Memory burden:** Mode no longer needs remembering (caption shows effective mode); previous performance is in-workout.
6. **Unnecessary navigation/scrolling:** Plan → perform is direct. The full table on 390px still needs a live check (code-level fluidity only).
7. **Error/abandonment point:** The Round 1 core risks split: wrong-set edits are mitigated by 44px targets and larger set pills; **rest-timer occlusion is NOT fixed** — the floating button + popover controls are unchanged (docked placement explicitly deferred to the visual phase without browser verification). This remains the most likely mid-session failure for this persona.
8. **Suggested correction (remaining):** Dock the rest timer to a non-covering zone (bottom bar above nav, collapsible) with live verification that it covers nothing; surface the mode as an in-table indicator, not only a drawer control.
9. **Implementation evidence:** `ActiveWorkoutScreen.tsx:162` (derived mode); tools-drawer `SegmentedControl` (Auto/Simple/Advanced); Stage 9 target pass (set pills, rest controls to 44px); rest-timer UI unchanged (`ActiveWorkoutScreen.tsx:3156,4042` — floating button + popover, numeric countdown authoritative).
10. **Confidence + assumptions:** High on mode/targets; high that timer occlusion is unaddressed (deferred, recorded); medium on 390px table behavior (live check owed).

### Task 3.2 — Find last week's performance for incline dumbbell press — **Partial**
1. **Objective:** Compare today's working weight against history before the first set.
2. **Starting screen/state:** Inside the active workout, on that exercise (Detailed).
3. **Expected sequence:** Exercise → Context & Target card → "Previous sessions" expander (last 3 sessions, newest-first, sets with reps > 0, `{weight}{unit} × {reps}` or `BW × {reps}`, date shown) → lift.
4. **Confusing labels/choices:** Scope is now explicit (last 3 sessions, dated) — the Round 1 "last session? best set? per-exercise history?" ambiguity is largely answered for the in-workout path. Residue: best-set highlighting was suggested, not built (the expander lists sessions; no best-set emphasis is recorded).
5. **Memory burden:** Gone for the in-workout path (no session reconstruction); full history remains session-sorted in the archive path.
6. **Unnecessary navigation/scrolling:** No workout exit needed for the comparison. The expander is supplementary (Detailed only) and does not gate the primary logging action.
7. **Error/abandonment point:** Guessing the weight is now unlikely in Detailed; in Simple only the last-time line shows (appropriate to the mode — every Detailed element is reachable from Simple via the density control, per the spec's hard rule).
8. **Suggested correction (remaining):** Highlight the best set within the expander; keep the archive path as-is.
9. **Implementation evidence:** `ActiveWorkoutScreen.tsx:962` (`previousSessions` memo, same matching as `getLastExercisePerformance`); `:2463-2466` (`CollapsibleDetails`, `workout.previousSessions`, Detailed-only, below Context & Target).
10. **Confidence + assumptions:** High on the expander; medium on whether 3 sessions suffice (vs best-set emphasis) — a judgment call, not a defect.

### Task 3.3 — Calculate plates for a 140 kg barbell load — **Unchanged**
1. **Objective:** Load the bar correctly without mental math.
2. **Starting screen/state:** Train → workout tools menu → Plate calculator.
3. **Expected sequence:** Open calculator → enter target → read breakdown → back to workout.
4. **Confusing labels/choices:** Unchanged: the tool still lives in a tools menu whose contents are not visible from the workout's primary hierarchy. The Round 1 suggestion (contextual action on barbell exercises, one tap, sheet, return to same set) was NOT built — no stage claimed it.
5. **Memory burden:** Unchanged (bar weight / available plates defaults unverified live).
6. **Unnecessary navigation/scrolling:** Unchanged (leave-workout trip; draft auto-save covers it, but the trip remains avoidable).
7. **Error/abandonment point:** Same as Round 1: cannot find the calculator mid-session → mental math. Mitigating factor: the tools drawer is now more discoverable generally (labeled mode control lives there), but the calculator itself gained no new entry point.
8. **Suggested correction (remaining):** Contextual plate-calculator action on barbell exercises inside the workout (sheet, return to same set). Small, self-contained follow-up.
9. **Implementation evidence:** No plate-calculator change in the implementation summary (Stages 1–10); `PlateCalculatorModal` remains a tools-menu entry. Absence verified by the summary's stage contents, not by a fresh grep of every tools-menu line — flag as medium confidence on exact menu membership.
10. **Confidence + assumptions:** Medium-high (no stage touched it); the live discoverability question stands.

### Persona 3 ratings (Round 1 → Round 2)
| Dimension | R1 | R2 | Why |
|---|---|---|---|
| Task clarity | 3 | 4 | Direct Start confirmed, mode labeled, history expander scoped. Residue: tools-menu tool access. |
| Information hierarchy | 3 | 4 | Table + in-workout history + labeled mode; drawer still holds tools. |
| Interaction effort | 2 | 3 | 44px targets help; floating rest timer still risks occlusion; calculator still a trip. |
| Visual comprehension | 4 | 4 | Tables read well; density is a feature here. Tokens maintain it. |
| Accessibility | 3 | 4 | 44px steppers/pills; 390px table behavior still needs live eyes. |
| Perceived polish | 3 | 3 | Powerful and better-labeled, but the timer placement question keeps it from feeling fast-finished. |

### Persona 3 keep / simplify / access less often (updated)
- **Keep:** Advanced table, previous performance + new expander, plan pre-fill, plate calculator, volume, history detail, draft auto-save.
- **Simplify:** Still: rest-timer docking, contextual plate calculator, in-table mode indicator.
- **Access less often:** Coach notes, challenges, quotes, macro tab, standards (unchanged).
- **Abandonment reasons (revisited):** "Logging slower than paper" improved (targets, direct Start); "rest timer hides controls" remains the live risk; "wrong-set edits" reduced.

---

## Persona 4 — Vikram, the Strength-Focused Lifter

- **Profile (unchanged):** 34, barbell 6 years, top sets + e1RM + PRs, high density for trends, medium-high customization tolerance. Needs: last top set, e1RM trend, PRs, volume trend — each labeled measured or estimated.

### Task 4.1 — Compare today's top set with last session before lifting — **Fixed**
1. **Objective:** Know the number to beat, with its provenance.
2. **Starting screen/state:** Active workout, on the lift (Advanced via Detailed).
3. **Expected sequence:** Exercise → previous performance + last-3-sessions expander (dated) → lift → log → summary.
4. **Confusing labels/choices:** The estimated/measured distinction is now encoded, not just present in data: estimated = dashed path + "est." badge (`common.estimatedShort`, both locales) + legend; measured = solid. Previous-performance scope is dated per session in the expander. The Round 1 "is this e1RM measured or estimated?" failure mode is closed at the display layer.
5. **Memory burden:** Gone for the comparison (dated sessions in-workout).
6. **Unnecessary navigation/scrolling:** None in-workout.
7. **Error/abandonment point:** Misloading from a mistaken estimate is now unlikely — the badge + dash + legend triple-mark estimates. Residual: the formula note on tap ("est. badge + formula note") was suggested, not built; the badge says *that* it is estimated, not *how*.
8. **Suggested correction (remaining):** Formula note on tap for e1RM values (copy + one modal/sheet line, no calculation change).
9. **Implementation evidence:** Stage 5 spotlight/analytics/body frames (dashed estimated, solid measured, legend + min-max rows); `common.estimatedShort` ("est." / "अनु."); `ActiveWorkoutScreen.tsx:2463-2466` (expander).
10. **Confidence + assumptions:** High on encoding; medium on whether users want the formula (hypothesis, low cost either way).

### Task 4.2 — Inspect the e1RM trend for squat over 12 weeks — **Fixed**
1. **Objective:** Answer "am I getting stronger?" with a readable trend.
2. **Starting screen/state:** Progress → Strength → spotlight (goal default `get_stronger` → e1RM) → chart → range/filter.
3. **Expected sequence:** Progress → spotlight e1RM (question title, lift name + est. badge, "Current 1RM" caption, dashed path, legend + window rows, click → analytics preserved) → set range → read trend.
4. **Confusing labels/choices:** Sub-tab display labels reconciled (overview header now shows the active segment name; all five `?sub=` values land on distinctly labeled screens; URL params unchanged). Chart axes carry units (`userUnit`, lbs/kg with unit labels in deltas); x-axis dates use real `formatProgressDate` windows; ranges are shown + persisted per chart (`ascend-progress-ranges`, local-only, SSR-guarded, invalid → fallback).
5. **Memory burden:** Filters persist (strength/body ranges + big3 lift after the Stage 10 fix + spotlight pin). The Round 1 "filter resets silently" failure mode is closed for these three.
6. **Unnecessary navigation/scrolling:** Progress is still a separate tab from Train (by design — it is a destination, not a modal); trend review from the workout still requires a tab switch, but the spotlight pin makes the trend one tap from Progress open.
7. **Error/abandonment point:** Misreading an axis is now unlikely (labeled axes + units + windows + legend). Residual: the volume section title is descriptive ("Muscle volume" + "sets this week"), not a question like the spotlight titles — a consistency nit, not a trust defect.
8. **Suggested correction (remaining):** Rephrase the volume title as a question for consistency, or explicitly accept the descriptive title. Trivial either way; confirm in Phase 12.
9. **Implementation evidence:** `ProgressPage.tsx:802-864` (spotlight zone, pin select outside clickable cards, goal-change clears pin + toast); `:185,810-854` (persisted ranges incl. big3 fix); Stage 10 chart re-verification (axes/units/dates/legends/empty states against real data paths).
10. **Confidence + assumptions:** High on persistence + labeling; low risk on the volume-title nit.

### Task 4.3 — Verify a new PR after a session — **Fixed**
1. **Objective:** Confirm the PR is genuine and see it in Records.
2. **Starting screen/state:** Post-workout summary → PR display → Progress → Records.
3. **Expected sequence:** Finish → summary PRs → Records view → confirm lift + value + date.
4. **Confusing labels/choices:** PR derivation is now verified single-source (store `prs` via `savePRs`/`getPRs`; e1RM from one function `calculateOneRepMax`; history from one function `getExerciseHistorySessions`; no inline second formula in ProgressPage). The Round 1 "summary claims a PR Records does not show" fragility is closed at the derivation layer. Dual entry (sub-tab + TabId) remains as navigation, but both read the same source.
5. **Memory burden:** Unchanged (must remember to check Records) — but the check now cannot disagree with the summary.
6. **Unnecessary navigation/scrolling:** Unchanged (summary → tab → sub-tab → row). Records rows linking back to the setting session was suggested, not built.
7. **Error/abandonment point:** Trust collapse from disagreeing PRs is closed; the remaining risk is navigational, not numerical.
8. **Suggested correction (remaining):** Link each Records row back to its setting session (navigation-only follow-up).
9. **Implementation evidence:** Stage 10 PR-derivation single-source check (pinned by Stage 10 tests); `src/lib/strength-standards.ts` (`calculateOneRepMax`); `src/lib/lifter-twin.ts` (`getExerciseHistorySessions`).
10. **Confidence + assumptions:** High on single-source; medium on whether row→session links matter (nice-to-have, not trust-critical).

### Persona 4 ratings (Round 1 → Round 2)
| Dimension | R1 | R2 | Why |
|---|---|---|---|
| Task clarity | 3 | 4 | Estimated/measured encoding, reconciled labels, persisted filters. Residue: formula note, record→session links. |
| Information hierarchy | 3 | 4 | Spotlight + pin + persisted ranges organize trends; Progress still a separate tab by design. |
| Interaction effort | 3 | 4 | Pin is a select (not an expander); ranges persist; no more re-application per visit. |
| Visual comprehension | 2 | 4 | Chart frame standard (question titles, axes + units, legend, est. encoding) fixes the weakest visual area. Volume-title nit remains. |
| Accessibility | 3 | 4 | Measured/estimated never color alone; volume rows + heatmap carry text; chart text alternatives improved. |
| Perceived polish | 3 | 3 | Numbers now feel trustworthy; desktop review still a narrow column + rail (wide grids not built) keeps polish from rising. |

### Persona 4 keep / simplify / access less often (updated)
- **Keep:** Previous performance + expander, e1RM + est. encoding, PRs + Records (single-source), volume, standards, history detail, persisted filters.
- **Simplify:** Still: formula note on tap, record→session links, volume title phrasing.
- **Access less often:** Challenges, quotes, social/share features, macro tab (unchanged).
- **Abandonment reasons (revisited):** "A number he cannot trust" fixed at the display layer; "a chart he cannot read" fixed by the frame standard; "desktop review feeling like a stretched phone" improved (rail) but not closed (no wide grids).

---

## Persona 5 — Arjun, the Powerlifter

- **Profile (unchanged):** 29, competitive powerlifter, SBD, 4–5×/week, expert, sweaty hands one thumb, zero tolerance for lag or extra taps, maximum density in workout. Needs: bar weight, set × reps × RPE, rest time, next set — instantly.

### Task 5.1 — Log a 5×5 squat session between sets — **Partial**
1. **Objective:** Five work sets logged with no more than ~3 taps per set.
2. **Starting screen/state:** Active workout, Advanced mode (Detailed default), squat first exercise.
3. **Expected sequence:** Set values → complete → rest timer (numeric countdown, authoritative) → next set → repeat → next exercise.
4. **Confusing labels/choices:** Set types and RPE/RIR still compete with weight/reps for attention and taps (unchanged layout logic — Stage 4 was styling-only by design). Mode is now labeled (drawer segmented control + caption), which helps orientation but does not reduce per-set taps.
5. **Memory burden:** Set count and rest duration are carried by the screen (countdown + auto-advance where supported); draft auto-save covers interruption (unchanged, still true).
6. **Unnecessary navigation/scrolling:** Any modal/confirmation/tools trip mid-session is still a failure — and the rest timer is still a floating button + popover, not a docked zone. Keyboard popping over the next set's fields still needs a live gym-condition check (no browser verification exists).
7. **Error/abandonment point:** Rest timer covering the next set's controls remains possible (floating placement unchanged, docking deferred). Mis-tap completing the wrong set is mitigated by 44px targets (set pills, rest controls, header buttons) but not eliminated. "Same as last set" one-tap fill was suggested, not built.
8. **Suggested correction (remaining):** Dock the rest timer (non-covering zone, collapsible) with live verification; add one-tap "same as last set"; verify keyboard behavior on a real phone. These three are the persona's remaining P1 items — they decide whether this persona's core job feels fast.
9. **Implementation evidence:** Stage 4 styling-only scope (logging, calculations, RPE/RIR, rest-timer logic, draft recovery untouched); Stage 9 target pass (44px set pills/rest controls); rest-timer UI unchanged (floating button + popover); no rest-timer bar element exists (verified — the spec's linearize premise did not apply; numeric countdown already authoritative).
10. **Confidence + assumptions:** High that timer docking is unaddressed; medium on keyboard behavior (live check owed); medium on whether 44px targets suffice for sweaty-hand use (tap-through owed).

### Task 5.2 — Plan third attempts for a mock meet — **Unchanged**
1. **Objective:** Get attempt selections from current strength data.
2. **Starting screen/state:** Train → tools menu → Meet attempt planner.
3. **Expected sequence:** Open planner → review suggestions → adjust → apply or note.
4. **Confusing labels/choices:** Unchanged: planner still lives in a tools menu, disconnected from the SBD sessions that feed it; provenance (which max? which date?) still unstated in the Round 1 sense. The Round 1 suggestion (contextual entry from Records/SBD history, "Plan attempts from these maxes") was NOT built.
5. **Memory burden:** Unchanged (planner should pull maxes — still unverified live).
6. **Unnecessary navigation/scrolling:** Unchanged (tools-menu hunt + return trip).
7. **Error/abandonment point:** Same as Round 1: unfound planner, or suggestions without provenance → spreadsheet instead. Mitigating factor: tools drawer is marginally more discoverable (it now holds the labeled mode control), but the planner gained no entry point.
8. **Suggested correction (remaining):** Contextual planner entry from Records/SBD history with provenance lines; keep the tools-menu entry as a shortcut.
9. **Implementation evidence:** No meet-planner change in Stages 1–10 (absence from the implementation record).
10. **Confidence + assumptions:** Medium-high (no stage touched it); planner inputs/provenance still not fully traced — same as Round 1.

### Task 5.3 — Check records and strength standards for deadlift — **Partial**
1. **Objective:** See best deadlift + where it sits against standards.
2. **Starting screen/state:** Progress → Records (or TabId `prs`).
3. **Expected sequence:** Records → deadlift → value + date + standards context.
4. **Confusing labels/choices:** Sub-tab display labels reconciled (distinctly labeled screens, `?sub=` unchanged); PRs single-source (see P4.3). Standards presentation (which standard? which bodyweight class?) is still unclear — no stage addressed standards context. Dual Records entry remains as navigation over one source (acceptable, not a defect).
5. **Memory burden:** Bodyweight context for standards relevance still must be remembered (not shown with the standard).
6. **Unnecessary navigation/scrolling:** Tab + sub-tab + row (unchanged); standards may still live on a different sub-tab than records.
7. **Error/abandonment point:** Standards shown without bodyweight context can still mislead → ignores standards entirely. The records half of this task is now trustworthy; the standards half is not improved.
8. **Suggested correction (remaining):** Show standards with the bodyweight and date they were computed from; link each record to its session.
9. **Implementation evidence:** Stage 5 header reconciliation + Stage 10 single-source check (records half); no standards-context change in Stages 1–10.
10. **Confidence + assumptions:** Medium on standards context (not fully traced in either round).

### Persona 5 ratings (Round 1 → Round 2)
| Dimension | R1 | R2 | Why |
|---|---|---|---|
| Task clarity | 3 | 4 | Labeled mode, trustworthy records, reconciled labels. Residue: planner/standards context. |
| Information hierarchy | 3 | 4 | Set row still the hierarchy; surrounding navigation now labeled and persistent (Resume bar, You). |
| Interaction effort | 2 | 3 | 44px targets help; floating timer, no same-as-last-set, tools-menu trips remain. |
| Visual comprehension | 3 | 4 | Dense tables + tokens + est. encoding; timer/modal layers still clutter the critical moment. |
| Accessibility | 2 | 3 | Targets up; sweaty-hand one-thumb use still fights the floating timer and drawer mode. Live check owed. |
| Perceived polish | 3 | 3 | Capable, better-labeled, but not yet fast-feeling — the timer decision is the difference. |

### Persona 5 keep / simplify / access less often (updated)
- **Keep:** Advanced table, steppers, rest timer (still needs docking), set types, RPE/RIR, attempt planner, records, standards, draft recovery.
- **Simplify:** Still: rest-timer placement, same-as-last-set, planner entry from Records, set-row targets (done: 44px).
- **Access less often:** Coach notes, challenges, nutrition detail, social features (unchanged).
- **Abandonment reasons (revisited):** "Too slow between sets" improved but not closed; "timer hides controls" remains the live risk; "planner unfound" unchanged; "mis-tap corrupts a session" reduced by targets.

---

## Persona 6 — Priya, the Fat-Loss User

- **Profile (unchanged):** 28, desk job, tracks meals most days, weighs 3×/week, walks daily, intermediate tracker / beginner lifter, low–medium density. Needs: calories + protein vs target, weight trend (not single readings), habit consistency. Tone constraint: no judgmental messaging.

### Task 6.1 — Scan lunch, review, save, and understand what is estimated — **Fixed**
1. **Objective:** Log a thali photo accurately, knowing which numbers are exact and which are estimated.
2. **Starting screen/state:** Fuel → Scan Meal (or Today quick action) → camera → LLM loading → review → save.
3. **Expected sequence:** Scan → review list → edit items/portions → save → "What you ate today" updates.
4. **Confusing labels/choices:** The honesty boundary is now per-item, not banner-only: exact = emerald chip, estimated = amber "est." with full provenance in the `aria-label` (matched entry), unmatched = amber not-in-DB chip; the edit form still names the entry and keeps the long "Not found in offline database — enter custom macros below" string. Scan/manual/barcode all land on the same meal list (shared modals). The UI does not claim offline scan (scan is cloud-LLM today — correctly unclaimed).
5. **Memory burden:** Review-before-save still required (correct — it is the honesty step); the photo's contents no longer need holding in mind while editing, because each row carries its own chip.
6. **Unnecessary navigation/scrolling:** Three stages (scan → review → save) are necessary and unchanged; in-review correction no longer requires restarting the scan (edit form is the same form as manual entry).
7. **Error/abandonment point:** "Saves an estimated total as if exact" is now unlikely (chips precede the save); "abandons on an unmatched item" is mitigated (custom fields immediately available in the same form). Residual: "est." comprehension for a first-time user still needs a live read.
8. **Suggested correction (remaining):** Plain-words est. explanation on first use. Nothing structural.
9. **Implementation evidence:** `MealsPage.tsx:2209-2213,2404-2408` (both rows); shared `ScanMealModal`/`BarcodeScannerModal`; voice meal path correctly NOT invented (voice is workout-only — the decision doc's voice-landing assumption is corrected in the record).
10. **Confidence + assumptions:** High on chips; medium on first-use "est." comprehension (live read owed).

### Task 6.2 — Backfill yesterday's missed weight entry — **Still failing**
1. **Objective:** Record yesterday's weight so the trend stays truthful.
2. **Starting screen/state:** Progress (or Today log-weight action) → BodyMetricsModal → date input + weight → Save.
3. **Expected sequence:** Open modal → set date to yesterday → enter weight → save → trend updates.
4. **Confusing labels/choices:** **The control still lies.** The modal renders a date input (`BodyMetricsModal.tsx:515-516`, state `dateInput` at `:174`) and the save handler validates weight/height/body-fat/chest/waist/hips — but `updateBodyMetrics` is called with `(weightKg, heightCm, bodyFatPct, chestIn, waistIn, hipsIn)` and **no date argument** (`:294-302`), so the store still stamps today. The redesign touched the modal's chrome only (touch targets) and deliberately did not change copy implying backdating works. A user who backdates believes she succeeded; the trend silently records two readings "today".
5. **Memory burden:** She remembers yesterday's reading (she wrote it down) — and the app still discards the date she enters.
6. **Unnecessary navigation/scrolling:** None, until she discovers the date was ignored — then the recovery path is still unclear (edit? delete + re-add? neither fixes the date).
7. **Error/abandonment point:** Discovers the trend is wrong → distrusts the weight trend entirely. This remains a data-truth failure, not a cosmetic one, and it is the single most trust-damaging defect in the fat-loss flow. It cannot be closed by this program without the user's explicit approval of the behavior fix (D1) — it is listed as P0 below for that decision, not as an implementation oversight.
8. **Suggested correction (remaining):** Fix the plumbing (pass the date through `updateBodyMetrics`) as an explicitly approved behavior fix, or remove the date control until the fix lands. The redesign must not ship the lying control in a prettier modal — and it does not claim to have fixed it.
9. **Implementation evidence:** `BodyMetricsModal.tsx:174,294-302,515-516` (verified in this phase: date state + input present, date absent from the save call); implementation summary "Defects NOT fixed" (D1).
10. **Confidence + assumptions:** High (code-read, confirmed twice — baseline and this phase).

### Task 6.3 — Correct a meal entry mistake (wrong portion saved) — **Partial**
1. **Objective:** Fix yesterday's dinner portion without deleting the day.
2. **Starting screen/state:** Fuel → Meals history → entry → edit.
3. **Expected sequence:** Find entry → edit portion → save → totals recalculate → confirm in history.
4. **Confusing labels/choices:** The edit form names the matched entry (provenance) and the row chips state exact/estimated — but whether editing recalculates from the food's macros vs the saved snapshot, and whether portion memory learns from the correction (and says so), is still unstated. No stage built inline-correction feedback or portion-memory transparency.
5. **Memory burden:** Must still remember which entry was wrong and the right portion.
6. **Unnecessary navigation/scrolling:** History still lives on a separate Fuel segment from Today; correction still requires segment-switching. The segments themselves are unchanged (three segments, by design).
7. **Error/abandonment point:** Edits without visible total recalculation → keeps two sources of truth in her head. Less likely to be *wrong* now (chips + same form), but the feedback gap remains.
8. **Suggested correction (remaining):** Edit inline from history with immediate total recalculation shown; state whether the correction updated her usual portion.
9. **Implementation evidence:** Stage 5 chips + same-form (partial); no inline-correction or portion-memory-transparency change in Stages 1–10.
10. **Confidence + assumptions:** Medium — edit-path details were not fully traced in either round; verify live in Phase 12.

### Persona 6 ratings (Round 1 → Round 2)
| Dimension | R1 | R2 | Why |
|---|---|---|---|
| Task clarity | 3 | 3 | Chips clarify logging, but one of three tasks still fails on truth (D1) — clarity cannot rise while the date control lies. |
| Information hierarchy | 3 | 4 | Totals vs targets clear; per-item chips + weight spotlight organize the fat-loss view. |
| Interaction effort | 3 | 3 | Scan + quick-add fast; correction still segment-switches without recalculation feedback. |
| Visual comprehension | 4 | 4 | Nutrition strip + targets read well; chips add honesty without clutter. |
| Accessibility | 3 | 4 | Success separated from muted (feedback distinguishable); copy tone unchanged (no judgment added). |
| Perceived polish | 2 | 2 | D1 alone holds this down: a truth defect feels unpolished regardless of visuals. This is intentional — the score must not rise until D1 is fixed. |

### Persona 6 keep / simplify / access less often (updated)
- **Keep:** Scan + review, per-item chips, pinned foods, targets, weight trend, habit quick-adds, forgiving tone, estimated labels.
- **Simplify:** Still: inline correction with recalculation feedback, portion-memory transparency, date fix (behavior, flagged P0).
- **Access less often:** Macro deep-dives, standards, plate calculator, coach prescription detail (unchanged).
- **Abandonment reasons (revisited):** "A total she cannot trust" substantially reduced by chips; "a trend corrupted by a lying date control" UNCHANGED and still the top abandonment risk for this persona; "judgmental copy" not introduced; "unmatched foods with no graceful fallback" improved.

---

## Persona 7 — Karan, the Time-Constrained Lifter

- **Profile (unchanged):** 36, parent, lunch-break lifter, 3×/week, fixed plan, intermediate, phone rushed one-handed, often poor gym Wi-Fi. Needs: Start button, current set, finish button. Nothing else mid-session.

### Task 7.1 — Start today's workout in under a minute from app open — **Partial**
1. **Objective:** From cold open to first set with no detours.
2. **Starting screen/state:** App closed, last tab = History (from yesterday's review). Last-tab restore unchanged.
3. **Expected sequence:** Open → (History, wrong tab) → Today → pinned workout card → Start → first set; or, if a draft exists, Resume bar from any tab → workout tab → first set.
4. **Confusing labels/choices:** Last-tab restore still optimizes for review, not for today's training — the most time-sensitive task still pays for yesterday's browsing when no draft exists. The Resume bar fixes the *draft* case (one tap from any tab); the *fresh-day* case still needs a tab correction + card tap.
5. **Memory burden:** Which tab holds today's workout is now less ambiguous (Today is the labeled home destination; the card is pinned first there), but the user must still remember to go to Today.
6. **Unnecessary navigation/scrolling:** Tab correction remains for the fresh-day case; scroll past non-workout sections is gone (fold + user order).
7. **Error/abandonment point:** "Spends the first minute navigating instead of warming up" is reduced (fold + Resume bar) but not eliminated (fresh-day wrong-tab landing). The failure mode now depends on draft state, which is itself an improvement in predictability.
8. **Suggested correction (remaining):** Same landing decision as P2.1: Today-first on training days vs last-tab restore, decided explicitly by the user. A "Start today" action reachable from every tab (not only when a draft exists) would also close this without changing restore behavior — a smaller, presentation-only option worth considering in Phase 12.
9. **Implementation evidence:** `page.tsx:349,394` (Resume bar only when a draft exists); `src/lib/navigation.tsx` (restore unchanged); `HomePage.tsx:683` (workout card order 1).
10. **Confidence + assumptions:** High on mechanics; medium on whether the fresh-day correction still costs a minute (depends on thumb reach + tab position — live check).

### Task 7.2 — Log sets fast with no confirmations mid-session — **Unchanged**
1. **Objective:** Complete sets with steppers only; no dialogs between sets.
2. **Starting screen/state:** Active workout, Advanced mode (Detailed default) or Beginner (Simple).
3. **Expected sequence:** Set values → complete → next set (auto-advance where supported) → finish.
4. **Confusing labels/choices:** Unchanged and already good: discard requires confirmation (correct), Finish vs Discard proximity risk unchanged, set-complete transition timing unchanged (Stage 4 styling-only; Stage 8 kept the 4 keyframes + press feedback, removed pulse/ping/shimmer — no new mid-session dialogs introduced).
5. **Memory burden:** Minimal — the screen holds state; draft auto-save covers interruption (unchanged).
6. **Unnecessary navigation/scrolling:** None added; tools-menu trips remain possible but are not required between sets.
7. **Error/abandonment point:** A confirmation dialog between sets still does not exist (good); keyboard covering the next set still needs a live check (unchanged risk).
8. **Suggested correction (remaining):** Live keyboard-behavior check on a real phone (Phase 12). No code change proposed by this simulation.
9. **Implementation evidence:** Stage 4 scope (logic untouched) + Stage 8 animation removals (no new dialogs); set-complete transition state unchanged.
10. **Confidence + assumptions:** High on no-new-dialogs; medium on keyboard behavior (live check owed).

### Task 7.3 — Finish and leave in two taps — **Partial**
1. **Objective:** End the session, glance at the summary, exit.
2. **Starting screen/state:** Last exercise done, active workout open.
3. **Expected sequence:** Finish → summary → (post-workout modals: "Vs your block", plan-vs-actual, debrief) → back to Today/Train.
4. **Confusing labels/choices:** Post-workout modal stack is UNCHANGED (finish-flow summary-first explicitly deferred to the visual phase — a flow change, out of Stage 4's styling-only scope). What did improve: saved-state feedback is now distinguishable (D2 success green + icon + label, not sage-muted), so "unsure whether the workout saved" is reduced. Finish persists before modals (pre-existing behavior, unchanged).
5. **Memory burden:** None.
6. **Unnecessary navigation/scrolling:** Modal stack after Finish unchanged (summary → take → review → debrief) for a user who wants one glance.
7. **Error/abandonment point:** Tapping through modals blindly (missing genuine feedback) or force-closing unsure of save — the save-uncertainty half is improved (success encoding); the blind-tapping half is unchanged.
8. **Suggested correction (remaining):** Summary first, always; coaching modals as one optional "Coach's take" expansion, not a forced stack. This is a flow change for the visual phase, not a styling tweak — it needs its own verification (finish persistence ordering must be re-confirmed when the stack changes).
9. **Implementation evidence:** Stage 4 deferral note (finish-flow summary-first deferred); D2 success tokens (light `#157347` on `#E6F4EA`, dark `#4ADE80`); finish-persists-before-modals (pre-existing, unchanged).
10. **Confidence + assumptions:** High on stack unchanged; medium on modal order details (same as Round 1).

### Persona 7 ratings (Round 1 → Round 2)
| Dimension | R1 | R2 | Why |
|---|---|---|---|
| Task clarity | 3 | 4 | Pinned card, Resume bar, distinguishable saved-state. Residue: fresh-day landing. |
| Information hierarchy | 2 | 3 | Fold fixed; landing + post-finish stack still compete with the time-critical path. |
| Interaction effort | 3 | 4 | Set logging efficient and dialog-free; trips to/from the session shorter (fold + Resume). |
| Visual comprehension | 3 | 4 | Clearer feedback encoding; fold reads as one action. |
| Accessibility | 3 | 4 | 44px targets, focus rule, text-only sync caption. |
| Perceived polish | 3 | 3 | Feels capable and faster to start, but the post-finish stack still taxes the exit — speed is polish for this user. |

### Persona 7 keep / simplify / access less often (updated)
- **Keep:** Plan-synced workout card, Resume bar, draft auto-save, steppers, finish summary, forgiving streaks.
- **Simplify:** Still: landing decision, post-finish modal stack, "Start today" from any tab (draft-independent option).
- **Access less often:** Everything not on the start→set→finish path (unchanged).
- **Abandonment reasons (revisited):** "A minute lost to navigation" reduced (not closed, fresh-day case); "a dialog between sets" still absent (good); "uncertainty whether the workout saved" improved via D2.

---

## Persona 8 — Sana, the Detail-Oriented Athlete

- **Profile (unchanged):** 30, 5×/week, weekly analytics review, occasional export, advanced, phone + longer review sessions, high density if organized/labeled/filterable. Needs: volume trends, muscle-volume balance, e1RM, PRs, body metrics, history — each with provenance.

### Task 8.1 — Review weekly volume and muscle balance — **Partial**
1. **Objective:** See whether pushing volume is balanced across muscle groups.
2. **Starting screen/state:** Progress → spotlight (goal default `build_muscle` → volume) → MuscleVolumeSection.
3. **Expected sequence:** Progress → spotlight volume → muscle-volume breakdown (rows with muscle names + set counts + prev-week numbers as text) → interpret.
4. **Confusing labels/choices:** Sub-tab placement is now reconciled (distinctly labeled screens); volume rows carry text (not color alone). Residues: volume derivation/inclusion rules ("working sets × reps × weight? warm-ups included?") are still unstated in UI, and the volume title is descriptive, not a question like the spotlight titles. The spotlight pin lets her choose a different chart, but the volume section's own title question is unasked.
5. **Memory burden:** Filters persist (ranges + pin + big3), so week-over-week comparisons no longer require re-application.
6. **Unnecessary navigation/scrolling:** Sub-tab hopping for one review question is reduced (spotlight + pin centralize the hero chart), but muscle volume vs PRs vs e1RM still live in different views — appropriate for a Detailed user, not a defect.
7. **Error/abandonment point:** "Cannot tell what a volume number includes → distrusts the chart" is NOT closed (inclusion rules unstated). This is the task's remaining trust gap.
8. **Suggested correction (remaining):** Chart subtitle stating inclusion rules ("Volume = working sets × reps × weight"); rephrase the volume title as a question for consistency.
9. **Implementation evidence:** Stage 5 spotlight (`resolveSpotlightChart`, `goalDefaultChart`); Stage 9 MuscleVolumeSection text check (names + counts + prev-week numbers); Stage 10 chart re-verification (volume-title nuance recorded, not a failure).
10. **Confidence + assumptions:** High on persistence + text rows; high that inclusion rules are unstated (no stage added them); medium on whether users need the rule (detail users do — that is the persona's definition).

### Task 8.2 — Filter Progress charts to the last 12 weeks for one lift — **Fixed**
1. **Objective:** Isolate a trend window for a single lift.
2. **Starting screen/state:** Progress → Strength → chart → range/filter controls.
3. **Expected sequence:** Select lift → set 12-week range → read trend → (optionally) compare with PRs.
4. **Confusing labels/choices:** Range/filter affordances are now standardized per chart (persisted ranges, `FilterBar` component exists, `SegmentedControl` for lift picking in big3) with labeled axes + units + windows. The Round 1 "labels and persistence not standardized" complaint is answered.
5. **Memory burden:** Filters persist per chart (strength/body ranges + big3 lift, after the Stage 10 fix for the big3 reset bug). No re-application per visit.
6. **Unnecessary navigation/scrolling:** Leaving the chart to check the PR behind a spike still requires navigation — PR markers on trend charts linking to sessions were suggested, not built. Acceptable residue for a Detailed user (PRs are one tab away, single-source).
7. **Error/abandonment point:** "Filter resets silently → reads the wrong window → wrong conclusion" is closed for strength/body/big3/pin. The Stage 10 big3-reset gap was found and fixed by the filter-persistence check itself — evidence the gate works.
8. **Suggested correction (remaining):** PR markers on trend charts linking to sessions (nice-to-have, not trust-critical).
9. **Implementation evidence:** `ProgressPage.tsx:185,810-854` (persisted ranges incl. big3); `FilterBar` + `SegmentedControl` components; Stage 10 filter-persistence check + big3 fix (TDZ caught and moved before commit).
10. **Confidence + assumptions:** High on persistence; medium on PR-marker value (judgment call).

### Task 8.3 — Back up data via DataVault before switching phones — **Partial**
1. **Objective:** Export everything, safely, and confirm it worked.
2. **Starting screen/state:** You → Settings → Data & Privacy (S4, verbatim regroup) → DataVault backup (export).
3. **Expected sequence:** DataVault → export → confirm file → (later) import on the new phone.
4. **Confusing labels/choices:** Findability improved (You tab + 4 sections + chips). Coverage honesty did NOT improve: S4 is verbatim, so DataVault still does not state exactly what is included/excluded (tables + local-only items) before export, and the 6-table sync reality (coach/challenges/habits/photos/preferences partly local-only) still means an export believed to cover everything may not. The sync caption ("Local only" vs "Synced") helps general honesty but does not state DataVault coverage.
5. **Memory burden:** Lower (You tab + section chips beat the old long-page hunt).
6. **Unnecessary navigation/scrolling:** Shorter trip (same destination class: Settings).
7. **Error/abandonment point:** "Exports believing it covers everything, then discovers local-only data was excluded → data loss on switch" is UNCHANGED. This is the task's remaining trust gap, and it is a copy/statement gap, not an export-mechanics gap.
8. **Suggested correction (remaining):** DataVault screen states exactly what is included/excluded (tables + local-only items) before export; keep purge/delete as separate, clearly confirmed flows. Copy-only follow-up — no export logic change.
9. **Implementation evidence:** Stage 6 S4 verbatim regroup (no DataVault copy change in Stages 1–10); baseline §6 D10 (6-table sync) still standing; sync caption (`HomePage.tsx:598-600`) does not cover DataVault scope.
10. **Confidence + assumptions:** High on S4 verbatim; medium on DataVault coverage copy details (not fully traced in either round — verify the actual DataVault screen copy live in Phase 12).

### Persona 8 ratings (Round 1 → Round 2)
| Dimension | R1 | R2 | Why |
|---|---|---|---|
| Task clarity | 3 | 4 | Spotlight + pin + persisted filters + reconciled labels. Residue: volume inclusion rules, DataVault coverage copy. |
| Information hierarchy | 3 | 4 | Detailed mode organizes detail; spotlight centralizes the hero chart. |
| Interaction effort | 3 | 4 | Filters persist; You tab + section chips shorten every hunt. |
| Visual comprehension | 2 | 4 | Chart frame standard (titles, axes + units, legends, est. encoding, text rows) fixes the weakest visual system. Volume-title nit remains. |
| Accessibility | 3 | 4 | Charts carry text (not color alone); heatmap cells have text summaries; focus rule added. |
| Perceived polish | 3 | 3 | Powerful engine, much better presentation — but the two honesty gaps (volume rules, DataVault scope) keep polish from rising. |

### Persona 8 keep / simplify / access less often (updated)
- **Keep:** Volume, muscle volume, e1RM + est. encoding, PRs (single-source), standards, history detail, DataVault, persisted filters, spotlight + pin.
- **Simplify:** Still: chart inclusion rules, DataVault coverage copy, PR markers on trends.
- **Access less often:** Challenges, quotes, quick-adds, social features (unchanged).
- **Abandonment reasons (revisited):** "A chart she cannot trust" substantially reduced (frames + encoding + persistence); "filters that reset" fixed; "a backup that silently excludes data" UNCHANGED — now the persona's top remaining risk.

---

## Persona 9 — Dev, the Returning User

- **Profile (unchanged):** 26, trained regularly then stopped two months, wants to resume the old plan at reduced loads, intermediate (returning), tentative, low density at first. Needs: what he last did, what plan he was on, a sane next workout. Tone constraint: no guilt.

### Task 9.1 — Understand what he last completed — **Fixed**
1. **Objective:** See his last session and how long ago it was, without judgment.
2. **Starting screen/state:** Today (returning, last tab restored) or Train → History.
3. **Expected sequence:** Open → welcome-back line under the greeting ("Welcome back — last session [date], plan [name]. Start light?") → history detail if wanted → start.
4. **Confusing labels/choices:** The "last workout" vs "today's workout" distinction is now explicit: the welcome-back line names the last session + plan + date, while the workout card shows today's plan day. The Round 1 "stale plan presented as today's truth" risk is reduced (the line dates the past; the card shows the present). "Start light?" is a suggestion in copy, not new programming logic (presentation of existing plan + history only, as Round 1 required).
5. **Memory burden:** Gone for the basic question (the line reconstructs it); plan reconstruction from history rows is no longer required for the first step.
6. **Unnecessary navigation/scrolling:** Today → Train → History → detail modal is no longer required for "what did I last do" — Today answers it. History remains the archive.
7. **Error/abandonment point:** "Sees a stale plan or an empty coach section and feels the app forgot him" is substantially reduced (welcome-back + ONE Coach section + named plan). New-user state (no workouts ever) is distinguished from returning state (line only when last workout was ≥2 days ago, not today/yesterday).
8. **Suggested correction (remaining):** None for this task's Round 1 items. Live check owed: whether "Start light?" reads as suggestion vs prescription (tone check, Phase 12).
9. **Implementation evidence:** `HomePage.tsx:612-625,677-678` (welcome-back memo + line, date via locale month-short + day, plan name via `WorkoutEntry.name`); new-user vs returning branch (no workouts ever → new-user state, not this line).
10. **Confidence + assumptions:** High on the line; medium on tone reception (live read owed).

### Task 9.2 — Adjust the schedule to fewer days before resuming — **Partial**
1. **Objective:** Change training days from 5 to 3 without breaking the plan.
2. **Starting screen/state:** You → Settings → Training Preferences → Weekly schedule editor (`WeeklyScheduleModal`).
3. **Expected sequence:** Schedule editor → unpick days → save → plan adjusts (plan-sync response still unstated in UI).
4. **Confusing labels/choices:** Schedule (days picker) vs weekly target (Auto/Off/2–6) still overlap conceptually, but both now live in one Training Preferences section with the weekly-target hint explaining Auto. The Round 1 suggestion (schedule editing reachable from Train, one canonical editor, "Next sessions now Mon/Wed/Fri" after a change) was NOT built — the editor remains Settings-only, and post-change plan effects are still not shown.
5. **Memory burden:** Lower (You tab + section chips beat the old hunt), but "schedule lives in Settings, not on Train" is still the fact to remember.
6. **Unnecessary navigation/scrolling:** Still a Settings trip for a training decision.
7. **Error/abandonment point:** "Changes days, plan does not visibly adjust (or adjusts opaquely) → confusion about what to do next" is UNCHANGED. The editor works; the feedback does not.
8. **Suggested correction (remaining):** Schedule editing reachable from Train (plan context) as well as Settings, one canonical editor; after a change, show what changed in the plan. Navigation + copy follow-up, not plan-logic change.
9. **Implementation evidence:** `SettingsView.tsx:1156` (`WeeklyScheduleModal` in Settings); no Train-side schedule editor in Stages 1–10; plan-sync response display not built.
10. **Confidence + assumptions:** High on Settings-only; medium on plan-sync response behavior (needs implementation verification beyond this simulation's scope — do not change plan logic).

### Task 9.3 — Resume without streak punishment — **Partial**
1. **Objective:** Train again without the app shaming a two-month gap.
2. **Starting screen/state:** Today → habit matrix / streak display (streak folded into the habit-matrix header, pre-existing from PR #41).
3. **Expected sequence:** Open → welcome-back line → train → matrix updates.
4. **Confusing labels/choices:** No guilt copy was introduced by the redesign (welcome-back line is warm; "Start light?" is suggestive, not shaming). The Round 1 "freeze rule must be communicated" item is still not explicitly surfaced in the streak display itself — the forgiving rule exists (freeze auto-applies, standing rule) but the display does not state it in the streak context.
5. **Memory burden:** None.
6. **Unnecessary navigation/scrolling:** None.
7. **Error/abandonment point:** A zeroed streak or guilt-toned copy ("You missed 60 days!") remains the highest-abandonment-risk moment in principle — but no such copy was found in the redesign, and the welcome-back line actively counters it. The residual risk is absence of reassurance (freeze rule unstated), not presence of guilt.
8. **Suggested correction (remaining):** Streak display states the freeze rule in one line ("Freezes auto-applied — gaps don't erase progress"). Copy-only follow-up.
9. **Implementation evidence:** Welcome-back line (see 9.1); streak-in-matrix-header (PR #41, pre-existing); no guilt copy introduced in Stages 1–10 (no stage touched streak copy).
10. **Confidence + assumptions:** High on no-new-guilt-copy; medium on current streak-display copy tone (strings not re-audited line-by-line here — verify live in Phase 12).

### Persona 9 ratings (Round 1 → Round 2)
| Dimension | R1 | R2 | Why |
|---|---|---|---|
| Task clarity | 3 | 4 | Welcome-back line answers "what did I last do" on Today. Residue: schedule-from-Train, plan-change feedback. |
| Information hierarchy | 2 | 4 | Returning-user state designed (line + named plan + ONE Coach section); cold-start Today no longer shows absence without guidance. |
| Interaction effort | 3 | 3 | Schedule editing still a Settings trip; plan-change feedback still absent. |
| Visual comprehension | 3 | 4 | Same calm system + tokens; tone and empty states now carry the returning case. |
| Accessibility | 3 | 4 | Focus rule, targets, text-only sync caption (shared gains). |
| Perceived polish | 2 | 3 | Returning no longer feels forgotten — but schedule-from-Train and freeze-rule surfacing keep it from feeling finished. |

### Persona 9 keep / simplify / access less often (updated)
- **Keep:** History detail, plan-sync, forgiving streaks, draft recovery, schedule editor, welcome-back line.
- **Simplify:** Still: schedule editing from Train, plan-change feedback, freeze-rule line in the streak display.
- **Access less often:** Standards, macro tab, challenges, policy ledger (unchanged).
- **Abandonment reasons (revisited):** "Guilt copy" not introduced and actively countered; "stale plan as today's truth" reduced by the dated welcome-back line; "empty coach section where guidance should be" fixed by ONE Coach section.

---

## Persona 10 — Nikhil, the Interrupted User

- **Profile (unchanged):** 33, patchy gym Wi-Fi, switches apps mid-workout, closes tabs accidentally, intermediate, low customization tolerance. Needs: draft status, sync status, offline state, error recovery — in plain words. Wants the system to handle it.

### Task 10.1 — Survive a refresh mid-workout — **Partial**
1. **Objective:** Refresh the page during a session and resume exactly where he left off.
2. **Starting screen/state:** Active workout, 3 exercises done → refresh.
3. **Expected sequence:** Reload → splash → Resume bar (draft exists, any tab) → workout tab → continue (draft restore toasts on resume, pre-existing verified behavior).
4. **Confusing labels/choices:** Draft state is now visible (Resume bar from any tab, not only when already on the workout tab — fixing the prior trap where a user on Home with a draft had no nav). What is still missing: an explicit "Draft restored — nothing lost" statement with timestamp + contents preview before resuming. The restore toast exists, but the pre-resume affordance does not preview contents or timestamp.
5. **Memory burden:** Trust in restore is higher (persistent affordance + toast), but a doubting user still cannot preview the draft before committing to resume.
6. **Unnecessary navigation/scrolling:** Re-finding the workout is gone (Resume bar); the chrome stays visible with the affordance from any non-workout tab (fullscreen only on the workout tab itself, as before).
7. **Error/abandonment point:** Restore failing or restoring stale values → re-entry → duplicates or quit. The mechanism is unchanged (draft auto-save to localStorage, pre-existing); the affordance is better. The "silently merge a stale draft over newer work" risk was flagged in Round 1 and is not addressed by an affordance — it needs a merge rule, which is out of redesign scope (do not change sync/draft logic here).
8. **Suggested correction (remaining):** Resume affordance shows draft timestamp ("Draft from 12:40 — 3 exercises done") before resuming; never silently merge stale over newer (rule statement for a future data-scope fix, not this program).
9. **Implementation evidence:** `page.tsx:349,394,477-490` (showResumeBar, spacer, nav); draft-restore toast (pre-existing, verified in Stage 4 notes); no draft-preview UI in Stages 1–10.
10. **Confidence + assumptions:** High on the affordance; medium on restore coverage (which states restore: logger draft? active draft? both? — same open question as Round 1, needs implementation verification beyond simulation).

### Task 10.2 — Train offline, then sync on reconnect without duplicates — **Partial**
1. **Objective:** Log a full session offline; have it appear in history and cloud after reconnect, once.
2. **Starting screen/state:** Offline → active workout → Finish → reconnect.
3. **Expected sequence:** Offline banner → log → finish (local save) → reconnect → sync engine reconciles → sync caption shows "Synced".
4. **Confusing labels/choices:** Sync status is now visible from the Today header (near the bell): Syncing / Synced / Sync failed / Local only — text only, never color alone. This closes the Round 1 "checking sync status requires Settings (§1)" complaint. What remains: per-workout sync state in History ("Synced" / "Pending") was suggested, not built; and sync-scope copy (which 6 tables sync, what stays local) is honest by omission (caption describes cloud sync of workouts/meals/etc., never promises local-only keys) but not explicit.
5. **Memory burden:** Lower: the header caption carries "what was logged offline until sync confirms" visibly, instead of requiring a Settings check.
6. **Unnecessary navigation/scrolling:** Status check is now zero-navigation (header caption). History sync states would still require opening History (unchanged).
7. **Error/abandonment point:** A sync conflict duplicating a workout, or a silent failure losing it, is a sync-engine behavior — unchanged by the redesign (correctly out of scope). The visibility improvement reduces "silent failure" (Failed state is now header-visible) but cannot change reconcile behavior.
8. **Suggested correction (remaining):** Per-workout sync state in History; explicit sync-scope statement (6 tables + local-only list) in one place the user can find (Today header caption overflow or Data & Privacy). Copy-only follow-ups.
9. **Implementation evidence:** `HomePage.tsx:598-600` (sync caption via `useSupabaseSync()`); sync engine + 6-table scope unchanged (baseline §5/§6 D10 still standing); no per-workout sync state in Stages 1–10.
10. **Confidence + assumptions:** High on header visibility; medium on duplicate-guard behavior (reconcile idempotency — verify in implementation beyond simulation, do not change logic).

### Task 10.3 — Survive an app update mid-week (stale shell) — **Still failing**
1. **Objective:** Open the app after a deploy and get the new version, not last week's UI.
2. **Starting screen/state:** Returning browser, new deployment live.
3. **Expected sequence:** Open → fresh shell → normal use.
4. **Confusing labels/choices:** There is still no version indicator, so a stale shell is still indistinguishable from the current app. `sw.js` is untouched by the redesign (verified: zero `sw.js`/`ui-mockups` files in the `2c6512d7..4c87b22` diff) — the `ascend-v2.0.0-cache` static cache name + 3s cache-fallback navigation race are exactly as in the baseline.
5. **Memory burden:** None (the failure is invisible — that is the problem).
6. **Unnecessary navigation/scrolling:** Workarounds (incognito, cache-clear) are still not user tasks at all.
7. **Error/abandonment point:** Reports a fixed bug, gets told "update", cannot tell whether he updated → distrusts reliability. This already happened in production use (form-check saga) and the redesign does not change it. Like D1, this needs the user's explicit approval of the behavior fix (D6: versioned cache name + update prompt, e.g. "New version available — refresh") — listed as P0 below for that decision, not as an implementation oversight.
8. **Suggested correction (remaining):** Fix the SW cache strategy as an approved behavior fix, or at minimum surface a build/version indicator in Settings for support. Do not "redesign around" a stale shell.
9. **Implementation evidence:** Diff file list (`2c6512d7..4c87b22`) contains no `sw.js`; baseline §3/§6 D6 unchanged; implementation summary "Defects NOT fixed" (D6).
10. **Confidence + assumptions:** High (already observed in production use; code-unchanged in this program).

### Persona 10 ratings (Round 1 → Round 2)
| Dimension | R1 | R2 | Why |
|---|---|---|---|
| Task clarity | 3 | 4 | Resume bar + header sync caption make state visible. Residue: draft preview, per-workout sync states, scope statement. |
| Information hierarchy | 2 | 3 | Sync status promoted to header; draft state still implicit (no timestamp/preview); stale-shell invisibility unchanged. |
| Interaction effort | 3 | 4 | Status checks now zero-navigation; recovery affordance persistent. |
| Visual comprehension | 3 | 4 | Text-only sync states; success encoding; banner vocabulary unchanged but now visible. |
| Accessibility | 3 | 4 | Sync states never color/icon alone (text caption); focus rule; targets. |
| Perceived polish | 2 | 2 | Invisible failures (stale shell) still feel unpolished no matter how clean the UI looks. Intentional — the score must not rise until D6 is fixed. |

### Persona 10 keep / simplify / access less often (updated)
- **Keep:** Draft auto-save, Resume bar, offline mode, tombstone reconcile, tab-leader coordination, header sync caption, DataVault.
- **Simplify:** Still: draft timestamp/preview, per-workout sync states, sync-scope statement, SW update behavior (flagged P0 fix).
- **Access less often:** Everything else during an interruption (unchanged).
- **Abandonment reasons (revisited):** "Lost sets" mitigated (Resume bar); "duplicated workouts" unchanged engine behavior; "a 'fixed' bug that reappears (stale shell)" UNCHANGED and still the top abandonment risk for this persona; "backup that doesn't cover what he assumed" unchanged (see P8.3).

---

## Persona 11 — Ananya, the Minimalist

- **Profile (unchanged):** 24, trains 3×/week, dislikes dashboards, hides everything she can, intermediate, phone quick glances, deletes noisy apps. Density: minimal. Customization tolerance: medium for hiding things (that's the point), zero for complex editors.

### Task 11.1 — Hide secondary Today cards — **Fixed**
1. **Objective:** Reduce Today to workout + nutrition + habits.
2. **Starting screen/state:** Today (full section list) → Customize control (from Today itself, or from Settings).
3. **Expected sequence:** Customize Today sheet → uncheck readiness, level, athlete model, review, steps, challenge, quote-adjacent sections → Today shrinks → confirm (no toast needed; the layout change is the feedback).
4. **Confusing labels/choices:** Checkboxes are named exactly as section titles (no toggle-to-card mapping puzzle from Round 1); the workout card row is locked with a disabled checkbox + "Always shown" note; up/down buttons move sections (disabled at ends / for locked rows). The Round 1 "no such controls exist" state is fully replaced.
5. **Memory burden:** None for the mapping (titles match); order is visible in the sheet itself.
6. **Unnecessary navigation/scrolling:** None required — the sheet is reachable from Today (in-place customization, as Round 1 requested), and the same sheet is reused from Settings (no second sheet, no divergent controls).
7. **Error/abandonment point:** "Cannot hide the noise → deletes the app" is closed for Today scope. Residues: (a) ordering is up/down, not drag — tedious for multi-slot moves (accepted limitation from the debate: reordering expected rare/set-once; revisit only if live testing shows repeated reordering); (b) scope is Today only — per-screen customization beyond Today was flagged as future, not silently omitted; (c) hidden sections are simply absent (findable again via the same sheet, not deleted).
8. **Suggested correction (remaining):** None structural. Revisit drag ordering only on live evidence of repeated reordering.
9. **Implementation evidence:** `src/components/CustomizeSheet.tsx` (Sheet-based, locked workout row, up/down, footer Restore); `HomePage.tsx:1315` + `SettingsView.tsx:1190` (same sheet, same handlers on the sanitized raw layout, same restore toast); `src/lib/today-layout.ts` (`TODAY_SECTION_IDS`, `DENSITY_DEFAULT_VISIBLE`, `sanitizeTodayLayout`, `resolveTodayLayout`).
10. **Confidence + assumptions:** High (exactly as specified, both entry points verified). Unresolved: up/down tedium for multi-slot moves needs a live feel check.

### Task 11.2 — Restore the default layout after over-hiding — **Fixed**
1. **Objective:** Undo customization in one tap.
2. **Starting screen/state:** Today, over-hidden.
3. **Expected sequence:** Customize → Restore → toast confirming layout restored → back.
4. **Confusing labels/choices:** Resets are scoped, one tap each: layout restore (sheet footer, `customize.restoreLayout` + `customize.layoutRestored` toast) touches layout only; theme reset (`settings.resetTheme` + `settings.themeResetMsg`) touches theme keys only; density is a separate control. The Round 1 "combined reset that also resets her theme" nasty surprise is designed out and pinned by test (theme reset never touches density/layout/mode).
5. **Memory burden:** None — restore is exact (`DEFAULT_TODAY_LAYOUT`), not approximate.
6. **Unnecessary navigation/scrolling:** None (restore lives in the same sheet as the toggles).
7. **Error/abandonment point:** "Restore also resets theme/density → re-hides everything and stops customizing" is closed by scoping + toast confirmation.
8. **Suggested correction (remaining):** None.
9. **Implementation evidence:** `CustomizeSheet.tsx` (footer Restore); `HomePage.tsx` restore handler (writes `DEFAULT_TODAY_LAYOUT` + toast); Stage 6 theme-reset scoping test (theme keys only).
10. **Confidence + assumptions:** High (code + tests).

### Task 11.3 — Find Settings without studying the app — **Fixed**
1. **Objective:** Reach Settings from anywhere, first try.
2. **Starting screen/state:** Any tab, new-ish user.
3. **Expected sequence:** See the labeled "You" tab in the bottom nav (every tab) → You → Settings segment (or Profile segment) → done.
4. **Confusing labels/choices:** The entry is now labeled ("You" / "आप", `nav.you`) and persistent (5-item nav, labels always visible, 12px; desktop rail with the same five destinations). The unlabeled-avatar-as-Profile-entry problem is gone as the *only* path — avatar still opens You → Profile, and the Today header gear still opens You → Settings, but neither is the sole discovery route anymore. The segmented bar (Profile | Settings) makes the grouping explicit.
5. **Memory burden:** None — the destination is visible on every screen.
6. **Unnecessary navigation/scrolling:** No tab-switch to Today just to reach the gear.
7. **Error/abandonment point:** "Concludes the app has no settings → never personalizes → churns on noise" is closed: settings are labeled, persistent, and the Customize sheet is reachable from Today directly.
8. **Suggested correction (remaining):** None. (Dissent retained from the debate: a permanent tab for meta-content wastes a slot and may accumulate junk — the fence is that You holds Profile | Settings only; Phase 12 should confirm no scope creep into the tab.)
9. **Implementation evidence:** `page.tsx:65` (You tab, `nav.you`, target `profile`); `:348,415-418` (isYouTab, segmented bar); `:490` (5-item nav, labels always visible); desktop rail (232px, same five destinations, CSS/layout only).
10. **Confidence + assumptions:** High (code-verified). Unresolved: whether the 5th tab accumulates junk over time — a governance question, not a current defect.

### Persona 11 ratings (Round 1 → Round 2)
| Dimension | R1 | R2 | Why |
|---|---|---|---|
| Task clarity | 2 | 4 | The core minimalist tasks went from impossible/undiscoverable to built-as-specified. Residue: up/down tedium for big moves. |
| Information hierarchy | 2 | 4 | Hierarchy is now user-controlled (hide + order + restore) instead of fixed at "everything". |
| Interaction effort | 2 | 4 | In-place sheet from Today; scoped one-tap restore. Residue: up/down for multi-slot moves. |
| Visual comprehension | 4 | 4 | Already calm; quantity (not style) was the failure, and quantity is now controllable. |
| Accessibility | 3 | 4 | Fewer elements via hiding helps focus order; focus rule + targets; sheet is Sheet-based with trap + Escape. |
| Perceived polish | 2 | 4 | An app that can be quieted feels finished to this user. Residue: density switch still a Settings trip (see below). |

### Persona 11 keep / simplify / access less often (updated)
- **Keep:** Workout card (locked), nutrition strip, habit matrix, forgiving streaks, Customize sheet, scoped restores, You tab.
- **Simplify:** Still: density toggle discoverability for existing users (see P1-8 below) — the sheet quiets Today, but reaching Simple mode itself requires Settings.
- **Access less often:** By definition, everything she hides — findable again via the same sheet, not deleted.
- **Abandonment reasons (revisited):** "Cannot hide noise" FIXED; "restore surprises" FIXED by scoping; "settings undiscoverable" FIXED by the You tab. The remaining churn risk for this persona is density discovery, not layout control.

---

## Persona 12 — Rahul, the Accessibility-Conscious User

- **Profile (unchanged):** 40, trains 4×/week, xlarge text scale, sometimes keyboard, sensitive to motion, intermediate, medium density (clarity over compactness, no tiny labels). Needs: same as general users, reachable without precise taps or color-only cues.

### Task 12.1 — Use the app at xlarge text scale on a 390px phone — **Partial**
1. **Objective:** Read and tap everything with xlarge text, no clipped or overlapping UI.
2. **Starting screen/state:** Settings → textScale xlarge → Today + active workout.
3. **Expected sequence:** Set xlarge → navigate Today → start workout → log sets.
4. **Confusing labels/choices:** The 10px label floor is gone: `text-3xs` removed, all 341 usages across `src/` mechanically replaced with `text-2xs` (11/14px); new type tokens (`pageTitle` 22/28, `prominent` 28/32, `compactMetric` 20/24, `chartLabel` 11/14, display 32/36 mobile, 40/44 desktop). Almost all type is rem-based, so the whole UI scales with the root (normal 16px, large 112.5%, xlarge 125%).
5. **Memory burden:** None.
6. **Unnecessary navigation/scrolling:** Code-level pass: at 390px + xlarge, content width ≈ 340px; fixed `w-56` (224px → 280px scaled) fits; bottom-nav labels have no truncation/overflow-hidden, so they wrap rather than clip; all ProgressPage SVGs use fluid `viewBox` + `w-full` (no fixed-320px overflow at 320px viewports). Overflow-induced horizontal scroll is not expected from code — but this is a code-level pass, NOT a visual verification.
7. **Error/abandonment point:** A clipped set value, overlapping rest timer, or broken table at xlarge would block training — none is expected from code, but none is visually confirmed either. The honest statement: breakage is no longer hypothesized from token inspection (the tokens that caused it are gone), but the true 390px + xlarge visual check is still owed to Phase 12 and this task cannot be marked Fixed without it.
8. **Suggested correction (remaining):** Phase 12 visual pass at 390px + xlarge across Today, active workout, and modals (screenshots of the running app, never mockups). If clipping appears, fix layout, not the scale.
9. **Implementation evidence:** Stage 1 label-floor migration (341 usages, verified: zero `text-3xs` remains in `src/`); `src/lib/text-scale.ts` (125% root at xlarge); Stage 9 code-level 390px + xlarge analysis (fluid charts, rem scaling, wrapping nav labels, fitting fixed widths).
10. **Confidence + assumptions:** High on token fixes; medium on layout survival (code-level only — the visual check is the outstanding evidence, and this simulation does not fake it).

### Task 12.2 — Navigate by keyboard, including modal stacks — **Partial**
1. **Objective:** Complete a workout-logging flow without a pointer, including opening and closing modals.
2. **Starting screen/state:** Train → Plans → logger → exercise selector modal → active workout.
3. **Expected sequence:** Tab through controls → open selector → choose → Escape/back → continue → finish.
4. **Confusing labels/choices:** Icon-only buttons gained a consistent focus style (global `:focus-visible`: 2px accent outline, offset 2px, for buttons/links/`[role=button]`/`[role=switch]`; inputs/selects/textarea excluded because they carry their own ring). What was NOT recorded as done: accessible names for every icon button (the Round 1 suggestion) — focus visibility improved, but naming completeness was not audited in Stages 1–10.
5. **Memory burden:** Focus position across modal open/close is carried by the system (stack-aware trap semantics preserved by non-disturbance — `use-modal-a11y` untouched, `tests/modal-a11y.test.ts` passes; Sheet uses the same hook: Escape + focus trap + backdrop-tap dismiss + Android-back at priority 100 + instant close).
6. **Unnecessary navigation/scrolling:** Focus traps cycling through hidden background content, or modals dropping focus to page top on close, are not expected (trap preserved) — but the logger→selector→active chain was not live-tested by keyboard in this program (no browser tooling).
7. **Error/abandonment point:** Focus lost inside a modal stack, or Escape closing the wrong layer (workout instead of selector), would cause data-loss fear. The trap semantics that prevent this are preserved and tested, but not live-tested by keyboard — the task is Partial, not Fixed, on that evidence gap alone.
8. **Suggested correction (remaining):** Phase 12 keyboard tap-through of the logger→selector→active chain + Escape-layering check + icon-button accessible-name audit. No code change proposed until that audit names a gap.
9. **Implementation evidence:** `globals.css:149-152` (focus-visible rule); `use-modal-a11y` untouched (Stage 9/10); `Sheet` (same hook, instant close, no exit animation); `tests/modal-a11y.test.ts` passes.
10. **Confidence + assumptions:** High on trap preservation; medium on naming completeness and live keyboard behavior (both owed to Phase 12).

### Task 12.3 — Train with reduced motion and non-color status cues — **Fixed**
1. **Objective:** Log sets with motion off and understand success/failure without color.
2. **Starting screen/state:** Reduced-motion preference on → active workout → complete sets, view summaries.
3. **Expected sequence:** Complete set → feedback (no bounce/flash) → summary states (completed vs missed vs PR).
4. **Confusing labels/choices:** Success is now separated from muted sage in tokens (D2: light `#157347` on `#E6F4EA`, dark `#4ADE80` on `rgba(74,222,128,0.15)`, always with check icon + label) — success is distinguishable from inactive content by color AND by icon + label, never color alone. Status vocabulary elsewhere follows the same rule (sync caption text-only; meal chips text + color; heatmap cells text summaries). Motion: ALL `animate-pulse` (17 sites) + `animate-ping` (3 halos) + dead `animate-bounce-subtle` removed; only the 4 keyframes at spec durations remain (fadeIn 0.25s, tabEnter 0.22s, slideUp 0.25s, scaleIn 0.2s, all ease-out) + 150ms press feedback + linear rest-timer requirement (no bar element exists — numeric countdown authoritative); `animate-spin` kept only on in-flight operation indicators (not over content). The global `prefers-reduced-motion` rule (animation + transition duration 0.01ms, iteration 1, scroll auto) is comprehensive and was already present — it IS the control, preserved and extended by the removals, with no in-app motion toggle added (per spec).
5. **Memory burden:** None — state no longer needs inferring from position/context when color fails.
6. **Unnecessary navigation/scrolling:** None.
7. **Error/abandonment point:** "Cannot tell a completed set from a skipped one, or a PR from a normal set" is closed at the token + cue layer (icon + label + distinct green). Residual: data-bar width transitions (`duration-500`/`duration-700`, 15+ sites) were KEPT as single-run value displays under the spec's rest-timer rationale — a deliberate reading, flagged for Phase 11/12 to confirm or convert. Under reduced-motion, the global rule collapses them to ~0ms, so the reduced-motion case itself is covered; the open question is whether non-reduced-motion users experience them as data or decoration.
8. **Suggested correction (remaining):** Phase 12 confirms or converts the data-bar transitions (convert to scaleX or accept as data displays). No change proposed for the reduced-motion path itself.
9. **Implementation evidence:** Stage 1 D2 tokens + accent-on migration (0 remaining `bg-accent … text-white` sites); Stage 8 removals (verified: zero `animate-pulse`/`animate-ping` in `src/`); `tailwind.config.js:113-116` (4 keyframes, spec durations); `globals.css:407-411` (reduced-motion rule); Stage 9 heatmap `aria-label` summaries (`heat.cellSummary`).
10. **Confidence + assumptions:** High on tokens + removals + reduced-motion rule; medium on the data-bar-transition judgment (confirm/convert in Phase 12).

### Persona 12 ratings (Round 1 → Round 2)
| Dimension | R1 | R2 | Why |
|---|---|---|---|
| Task clarity | 3 | 4 | Labels at 11px floor, success with icon + label, text-only statuses. Residue: icon-button naming audit. |
| Information hierarchy | 3 | 4 | Hierarchy survives scaling better than before; density organization + spotlight help. |
| Interaction effort | 2 | 3 | Trap preserved + focus rule + 44px primaries; keyboard chain not live-tested, icon names unaudited, sub-44 chips remain. |
| Visual comprehension | 2 | 3 | Success==muted fixed and labels fixed — but xlarge/390px layout is code-level only, so visual cannot rise further without eyes. |
| Accessibility | 2 | 4 | The largest single-dimension gain in the panel: token separation, focus rule, text alternatives, reduced-motion coverage, 44px primaries. Residue: sub-44 chips, visual checks. |
| Perceived polish | 3 | 4 | Focus-visible + motion discipline + status cues make the app feel considered. Residue: data-bar transition judgment. |

### Persona 12 keep / simplify / access less often (updated)
- **Keep:** Focus-visible rings, text-scale preference, reduced-motion rule, ExerciseDemo freeze, modal-stack trap, success icon + label, heatmap text summaries.
- **Simplify:** Still: icon-button accessible names, sub-44 chips/pills (section chips ~30px, filter pills, heatmap tabs — WCAG 2.2 AA minimum is 24×24, so these pass minimum but miss the spec's enhanced 44px target; confirm by tap-through whether they miss in practice).
- **Access less often:** Decorative animation (now removed), dense tables at small scales (unchanged risk, needs the 390px visual).
- **Abandonment reasons (revisited):** "A clipped control at xlarge" — tokens fixed, visual owed; "focus lost in a modal" — trap preserved, live test owed; "success he cannot distinguish from inactive" FIXED.

---

## Before/after comparison

### Per-persona averages (mean of the six dimensions; simulated scores, not measurements)

| Persona | Round 1 | Round 2 | Δ | What moved it |
|---|---|---|---|---|
| P1 Aarav, new gym member | 2.67 | 4.00 | +1.33 | Guest labeled, summary screen, Skip = Accept, password hint, density-driven Beginner mode |
| P2 Meera, general fitness | 3.00 | 3.83 | +0.83 | Action-first fold, ONE Coach section, rest-day line, Auto explained, You tab |
| P3 Rohan, bodybuilding | 3.00 | 3.67 | +0.67 | Labeled mode, history expander, 44px targets; timer docking still owed |
| P4 Vikram, strength | 2.83 | 3.83 | +1.00 | Est./measured encoding, reconciled labels, persisted filters, single-source PRs |
| P5 Arjun, powerlifter | 2.67 | 3.50 | +0.83 | Targets, labeled mode, trustworthy records; floating timer + tools-menu tools still owed |
| P6 Priya, fat-loss | 3.00 | 3.33 | +0.33 | Per-item honesty chips; D1 date lie still caps clarity and polish |
| P7 Karan, time-constrained | 2.83 | 3.67 | +0.83 | Pinned card, Resume bar, distinguishable save; landing + finish stack still owed |
| P8 Sana, detail-oriented | 2.83 | 3.83 | +1.00 | Chart frames, persisted filters, spotlight + pin; volume rules + DataVault copy still owed |
| P9 Dev, returning | 2.67 | 3.67 | +1.00 | Welcome-back line, ONE Coach section; schedule-from-Train + freeze line still owed |
| P10 Nikhil, interrupted | 2.67 | 3.50 | +0.83 | Resume bar, header sync caption; D6 stale shell still caps polish |
| P11 Ananya, minimalist | 2.50 | 4.00 | +1.50 | Customize sheet (both entries), scoped restores, You tab — three impossible/undiscoverable tasks built as specified |
| P12 Rahul, accessibility | 2.50 | 3.67 | +1.17 | 11px floor, D2 success separation, focus rule, 44px primaries, motion discipline; visual checks still owed |
| **Overall** | **2.76** | **3.71** | **+0.95** | |

### Per-dimension averages (simulated)

| Dimension | Round 1 | Round 2 | Δ | Reading |
|---|---|---|---|---|
| Task clarity | 2.83 | 3.92 | +1.08 | Largest gain alongside visual/a11y: labeled paths, summary, chips, encoding, You tab. Held back by D1 (P6) and landing/tool-menu residues. |
| Information hierarchy | 2.50 | 3.83 | +1.33 | Largest gain: action-first fold, ONE Coach section, spotlight + pin, 4-section Settings, density organization. |
| Interaction effort | 2.67 | 3.50 | +0.83 | Targets, Resume bar, persisted filters, in-place sheet. Held back by timer docking, tools-menu trips, Settings-only controls. |
| Visual comprehension | 3.08 | 3.92 | +0.83 | Tokens, label floor, chart frames, est. encoding. Held back by unconfirmed xlarge/390px visuals (P12). |
| Accessibility | 2.83 | 3.92 | +1.08 | Token separation, focus rule, text alternatives, motion discipline, 44px primaries. Held back by sub-44 chips + unconfirmed visuals. |
| Perceived polish | 2.67 | 3.17 | +0.50 | Smallest gain — honestly so: polish is capped by the two still-failing trust tasks (D1, D6) and the deferred finish/timer items. This dimension must not rise until those close. |

### Task verdict counts (36 tasks)

- **Fixed:** 12 (1.1, 1.2, 4.1, 4.2, 4.3, 6.1, 8.2, 9.1, 11.1, 11.2, 11.3, 12.3 — 12.3's data-bar caveat is a Phase 12 confirm, not a task failure)
- **Partial:** 19
- **Unchanged:** 3 (3.3 plate calculator, 5.2 meet planner — no stage touched them; 7.2 no-confirmations-between-sets, which was already good and gained no new dialogs)
- **Still failing:** 2 (6.2 D1 date lie, 10.3 D6 stale shell)

Note on the count: 12 + 19 + 3 + 2 = 36. The two "still failing" tasks are the only tasks whose objective remains impossible or dishonest; both require the user's explicit approval of a behavior fix outside redesign scope, and neither is an implementation oversight. The two "unchanged" tasks are small, self-contained follow-ups (contextual tool entries), not redesign failures.

### Round 1 synthesis points — revisited

1. **"Today has no designed fold"** — Closed at the IA layer (pinned card, action-first fold, ONE Coach section, user order, rest-day line, welcome-back line). Residual: landing behavior (last-tab restore) is a deliberate open decision.
2. **"The workout is capable but its access paths and mid-session details fight the user"** — Half closed (direct Start confirmed, labeled mode, history expander, 44px targets). Open: rest-timer docking, same-as-last-set, keyboard behavior live.
3. **"Settings/Profile/auth are three surfaces for overlapping concerns"** — Closed as presentation (You tab + 4 IA sections + canonical Account & Security + read-only methods block). Auth logic untouched, correctly. Residue: in-Settings sign-in forms need a user decision (new auth surface, not silently built).
4. **"Honesty boundaries are trust boundaries"** — Largely closed at display (per-item chips, est. encoding, single-source PRs, sync caption honesty, local-only keys never promised as synced). NOT closed: D1 (date lie) and DataVault coverage copy — the two remaining honesty gaps, both ranked below.
5. **"Greenfield controls are the highest-risk, highest-value build"** — Built with the Round 1 constraints honored: essential-action protection (workout card locked, primary actions never behind expanders — Stage 10 audit pass), scoped resets (layout/theme/density separate), contrast safeguards (zero failing rows ship; near-background customs rejected at input, never silently recolored). The risk that remains is discoverability of the density control itself (Settings-only) and up/down ordering tedium — both minor, both recorded.
6. **"Accessibility is a baseline deficit, not a polish item"** — Substantially closed at token level (success separation, 11px floor, 44px primaries, focus rule, text alternatives, motion discipline). NOT closable by simulation alone: 390px + xlarge visuals, Barlow mixed-script coherence, keyboard live chain, icon-button naming audit.
7. **"No persona asks for a new capability"** — Still true. Every Round 2 improvement is placement, hierarchy, labeling, or feedback. No capability was added or removed in Stages 1–10 (zero capability removals proposed; the two behavior fixes D1/D6 remain explicitly unapproved scope, not smuggled changes).

---

## Remaining issues, ranked

### P0 — Still-failing tasks (need the user's explicit approval; the redesign cannot close them alone)

- **P0-1 — D1 BodyMetrics date lie (P6 task 6.2).** Evidence: `BodyMetricsModal.tsx:174` (date state), `:515-516` (date input rendered), `:294-302` (`updateBodyMetrics` called without any date argument; store stamps today). The redesign touched chrome only and did not change copy implying backdating works. Fix options: (a) pass the date through `updateBodyMetrics` (behavior fix, needs approval + scope), or (b) remove the date control until the fix lands. Until one lands, the fat-loss weight trend can be silently corrupted by any backdate attempt, and P6's polish score must stay at 2. Simulation cannot close this.
- **P0-2 — D6 stale shell (P10 task 10.3).** Evidence: zero `sw.js` files in the `2c6512d7..4c87b22` diff; `ascend-v2.0.0-cache` + 3s cache-fallback race unchanged. Fix options: versioned cache name + update prompt ("New version available — refresh"), or at minimum a build/version indicator in Settings for support. Until one lands, users can report already-fixed bugs from a stale shell (already observed in production use), and P10's polish score must stay at 2. Simulation cannot close this.

### P1 — Real gaps for Phase 12 or a follow-up (in rough priority order)

- **P1-1 — Rest-timer docked placement not built (P3, P5).** Floating button + popover unchanged; docking deferred for lack of browser verification. This is the top mid-session risk left in the product. Needs live verification that a docked zone covers nothing.
- **P1-2 — Finish-flow summary-first not built (P7).** Post-finish modal stack unchanged (summary → take → review → debrief). Flow change, not styling — needs its own verification that finish persistence ordering survives the restack.
- **P1-3 — Desktop wide grids not built (P4, P12).** Desktop is the left rail + centered `max-w-md` column (verified: no `max-w-3xl` in page/Home/Progress/Meals). This matches the decision's reversible fallback, but it was never built rather than fallen back to. Verdict: acceptable as a layout (rail + centered column is a real desktop layout, and the decision's fallback explicitly allows it) — but it is NOT the decided wide layout, and Phase 12 must explicitly accept it or schedule the wide-grid build. Do not claim the decision as implemented.
- **P1-4 — Modal-to-Sheet migration not done (P12, all).** Only CustomizeSheet + its two hosts use Sheet; ~36 existing modals keep proven chrome with stack semantics preserved (`use-modal-a11y` untouched, tests pass). Correct sequencing (migrate one by one with visual verification), but the chrome inconsistency remains visible. Needs a migration sequence in Phase 12, not a big-bang rewrite.
- **P1-5 — DataVault coverage copy unchanged (P8, P10).** S4 verbatim regroup; no statement of what is included/excluded before export; 6-table sync reality unchanged. Copy-only follow-up: state tables + local-only items before export.
- **P1-6 — Schedule editing from Train not built (P9).** `WeeklyScheduleModal` remains Settings-only; post-change plan effects still not shown. Navigation + copy follow-up (one canonical editor, shown from Train as well as Settings; "Next sessions now Mon/Wed/Fri" after a change).
- **P1-7 — Plate calculator + meet planner still tools-menu-only (P3, P5).** No contextual entries built. Small, self-contained follow-ups (barbell-exercise sheet action; Records/SBD-context planner entry with provenance lines).
- **P1-8 — Density toggle lives in Settings only (P11, P1).** Verified: `densitySimple` referenced only in SettingsView. An existing user (Detailed default) reaching Simple mode requires a Settings trip; a new user never needs to find it (Simple default). Consider a Today density shortcut — or explicitly accept Settings-only now that You is labeled and persistent. Do not add a second density control without deciding which is canonical.
- **P1-9 — Sub-44 secondary chips/pills remain (P12, P5).** Section chips (~30px), filter pills, heatmap tabs. WCAG 2.2 AA minimum is 24×24 (they pass minimum); they miss the spec's enhanced 44px target. Confirm by tap-through whether they miss in practice before resizing (resizing all chips changes density everywhere).
- **P1-10 — ~94 new Hindi keys need native review (P6, P12).** Listed by stage in the implementation summary (home/customize 17, workout 5, progress/meals 21, settings 36, onboarding 12, plus `common.estimatedShort`, `nav.you`, `heat.cellSummary`, `settings.customAccentTooClose`). Machine translation was not used (keys were written per locale in the implementation); native-speaker review is still owed before Hindi-mode quality can be claimed.
- **P1-11 — Last-tab restore unchanged (P2, P7).** Mitigated by the Resume bar (draft case) + action-first fold, not fixed for the fresh-day case. Needs the user's explicit landing decision (Today-first on training days vs keep restore) or a draft-independent "Start today" action from every tab.
- **P1-12 — Confirm-or-convert items (P8, P12).** Volume title descriptive vs question phrasing; data-bar width transitions kept as data (`duration-500`/`duration-700`, 15+ sites) under the spec's rest-timer rationale; preset subtles opaque tints vs custom rgba washes (both audit-passing, not harmonized); translucent `bg-accent/85` variants as a contrast-audit limitation. Each needs a Phase 12 decision, not a silent default.

### P2 — Minor / confirm-live items

- **P2-1 — Barlow mixed-script visual coherence (P12).** Code-level pass (fallback chain Barlow Condensed → Noto Sans Devanagari → Inter, all variables on `<body>`); condensed-Latin + regular-Devanagari side-by-side coherence needs eyes. Inter-only fallback reserved and reversible without layout change.
- **P2-2 — 390px + xlarge visual (P12).** Code-level pass only (fluid charts, rem scaling, wrapping nav labels, fitting fixed widths). True visual check owed.
- **P2-3 — Steps conditional render (P2).** Stable slot only once synced data exists; no layout-shift reservation beyond its order position. Confirm no visible jump when steps appear.
- **P2-4 — Coach weekly-review summary realized as notes content (P2).** No separate summary component exists. Confirm the notes content reads as a summary in the ONE Coach section.
- **P2-5 — Readiness/level stacked cards (P2, P8).** Split from a 2-col grid into full-width stacked cards (inventory consequence: each needs its own visibility checkbox + order slot). Confirm visually that stacking does not waste the fold.
- **P2-6 — In-Settings sign-in forms not built (P2, P9).** Apple/OTP/email have no in-app surface (engine-only; LoginScreen offers email/password + Google; AuthModal offers Google only). Building them is a new auth surface — needs the user's decision, not a silent build or a faked surface.
- **P2-7 — Voice meal path does not exist (P6).** Voice is workout-only (`VoiceWorkoutLoggerModal`); the decision doc's voice-landing assumption is corrected in the record, not invented. If a voice meal path is ever wanted, it is a new capability requiring its own brief.
- **P2-8 — New personalization keys local-only (all).** By construction (no `uiPreferences` field in any sync payload). If a later program audits the sync serializer field by field and clears them, UI copy may then promise cross-device sync — not before. No copy in the redesign promises it (verified intent; re-check copy strings live in Phase 12).

---

## Verdict: does the redesign meet the brief's bar?

**Premium, editorial, refined — substantially yes, with stated caveats.** The token system (accent mechanism, 11px label floor, type scale, spacing tokens, surfaces-not-boxes), the action-first fold, ONE Coach section, and the chart frame standard are real, implemented, and test-pinned. The two visual caveats that prevent an unqualified yes are desktop wide grids (fallback delivered, wide layout not built) and modal chrome (Sheet exists for new surfaces; ~36 modals unmigrated). Neither is hidden; both are P1 items above.

**Simple vs Detailed — yes, as specified.** One density key, same data/logic/features, every Detailed element reachable from Simple, primary actions never behind expanders (Stage 10 audit pass, both modes), workout mode follows density with a persistent override, migration asymmetry implemented (new → Simple, existing → Detailed via persist v2 + `migrate()`). The one discoverability caveat is the density control's Settings-only location (P1-8).

**Personalization — yes, for the three specified controls.** Accent (6 presets + custom with deterministic auto-correction, corrected-shade note before Apply, near-background customs rejected at input, never silently accepted) + density + dashboard cards (Customize sheet, both entries, up/down order, locked workout card, scoped restores). Semantic colors are fixed tokens, never accent-derived. Local-only sync caveat is binding and honored in copy intent.

**Accessibility aim (WCAG 2.2 AA) — met at code level; NOT claimable yet as a whole.** The auditable parts pass: contrast audit zero failing rows (6 presets × 2 modes × every use + 5 custom cases + input gate), 44px primary targets, global focus-visible rule, text alternatives for charts/heatmap/sync states, reduced-motion as the control, modal-stack semantics preserved. An AA claim requires the live checks (390px + xlarge visuals, Barlow mixed-script, keyboard chain, icon-button naming audit, tap-throughs on sub-44 chips) — all listed in the Phase 12 handoff, none faked here.

**Overall verdict:** The redesign earns its improvement (simulated +0.95 overall, +1.33 hierarchy, +1.08 clarity and accessibility) and is **ready to proceed to Phase 12 and then to a PR for the user's review** — as a branch, never merged by this program — with the two P0s disclosed as separate approval decisions and the P1 list attached. It does **not** earn "complete" on the two trust tasks (D1, D6) or the deferred visual items, and the PR description must say so plainly rather than implying the redesign fixed them. No capability was added or removed; no data logic, calculation, auth logic, schema, or sync behavior was changed; no new dependencies were introduced; no research, statistics, or seconds-saved were invented.

---

## Phase 12 handoff: what MUST still be verified live vs what simulation can close

### Simulation can close nothing further without code changes
Re-running these personas again on the same code would reproduce these scores. The remaining value of simulation is only as a regression check *after* P1 fixes land (re-run the affected tasks: P3.1/P5.1 after timer docking, P7.3 after finish-flow change, P4/P12 after wide grids, P8.3 after DataVault copy, P9.2 after Train-side schedule editing, P12.1/P12.2 after the visual/keyboard pass).

### Must be verified live (parent-run browser phase — never faked, never from mockups)
- **Tap-throughs of the highest-risk flows on a real phone:** full workout (Beginner + Advanced), finish + post-finish stack, rest-timer occlusion in a real set, keyboard covering the next set's fields, logger→selector→active keyboard chain + Escape layering, Customize sheet (hide/order/restore), density switch (existing user → Simple), accent pick + custom accent (incl. a near-background rejection), spotlight pin + goal change (pin clears + toast), onboarding end-to-end (guest path, summary screen, Skip = Accept feel), scan → review → save with chips.
- **Screenshots of the running app (never mockups):** Today fold (Simple + Detailed), You tab + Settings sections, Progress spotlight + pin, Fuel list with chips, onboarding summary, desktop rail at 1024px and 1440px.
- **390px + xlarge layout:** Today, active workout, modals — look for clipping, overlap, horizontal scroll.
- **Barlow mixed-script coherence:** display headings in Hindi mode (condensed Latin + regular Devanagari side by side); fall back to Inter-only if inconsistent (reversible, no layout change).
- **Low-end-phone motion feel:** the 4 keyframes + press feedback + data-bar transitions; confirm the data-bar judgment (data vs decoration).
- **Live sign-in observation:** Google consent-screen app name (still unproven); AuthModal Google-only vs LoginScreen email/Google surfaces; guest path on a real device.
- **Copy reads:** "est." badge comprehension for a first-time user; set-type/RPE first-use clarity; streak-display tone (freeze rule line, if added); DataVault coverage copy (after the P1-5 fix); volume inclusion rules (after the P1-12 fix).
- **Hindi-mode read by a native speaker:** the ~94 new keys (P1-10) — not a browser task, but a human review that gates any Hindi-quality claim.

### Decisions still owed by the user (not by Phase 12)
- P0-1 D1 date plumbing fix (or remove the date control until fixed).
- P0-2 D6 SW cache strategy (versioned cache + update prompt, or a Settings version indicator).
- D5 removing `public/ui-mockups.html` from serving.
- Supabase custom domain ($25/mo Pro — only full OAuth-hop fix).
- In-Settings Apple/OTP/email sign-in forms (new auth surface).
- Landing decision: Today-first on training days vs keep last-tab restore (P1-11).
- Desktop wide grids: build them or explicitly accept rail + centered column (P1-3).
- Any product-capability removal — none proposed; if Phase 12 finds one needed, it returns for approval first.

### Carried forward (unchanged by this phase)
- The #42 rebuild (when unparked) must ADOPT this design system rather than bring its own visuals; carried into it: the D11 `analyzeUpload` timestamp-reset caveat, the temporary debug readout's removal before any merge, and the unreviewed CSP change.
- The 552/617 food names needing Hindi-speaker curation (machine translation forbidden) and the 6-table sync reality remain standing program facts, untouched by this redesign.
- The MASTER.md superseded header note (decision phase, reversible doc note) remains flagged for the user's awareness since it changes the repo's stated source of truth.
