# ASCEND 10-Persona Week Simulation — Report

**Branch:** `feat/overnight-build` | **Date:** 2026-10-20 | **Method:** read-only code analysis through each persona's simulated week. Every bug cited with file + line.

## Ratings Summary

| Persona | Who | Rating |
|---|---|---|
| Aarav, 22 | Never lifted, intimidated beginner | 5/10 |
| Rohan, 30 | Advanced powerlifter, ex-Strong | 6.5/10 |
| Priya, 27 | Fat loss, busy, ex-MyFitnessPal | 6.5/10 |
| Vikram, 35 | Time-poor pro, 3 days/week | 5/10 |
| Neha, 28 | Home-only, dumbbells + bands | 3/10 |
| Arjun, 45 | Returning after back injury | 3/10 |
| Kavya, 24 | College sprinter | 3/10 |
| Raj, 52 | Longevity, doctor said 2×/week | 4/10 |
| Simran, 31 | Postpartum, easing back in | 4/10 |
| Aditya, 26 | Bodybuilder, 6-day PPL | 4/10 |

**Average: 4.4/10.** Nobody rates it above 6.5. Nobody would switch from their current tool.

---

## Top 10 Issues (by frequency × severity)

### 1. Onboarding never asks days/week — dead `setDaysPerWeek` (5 personas: Vikram, Aditya, Raj, Simran, Aarav)
`Onboarding.tsx:52` declares the state; **nothing ever calls the setter**. Every user gets a 4-day Upper/Lower split. Vikram (3 days) is told "rest day" on his Wednesday session. Raj's doctor said twice a week; the app grades him "2/4 workouts" — a permanent 50%. The 3/5/6-day engine branches exist but are unreachable. **This is the #1 fix.**

### 2. Equipment hardcoded to `full_gym` — home training impossible (4 personas: Neha, Aarav, Simran, Raj)
`Onboarding.tsx:307` hardcodes `equipment: 'full_gym'`. The `home_dumbbells` type value exists but appears nowhere else in `src/`. Both plan generators take no equipment parameter. Neha's week-1 plan is 61–67% impossible at home. Bands don't exist as a category. No equipment setting exists anywhere post-onboarding either.

### 3. Injury-safety system fully built, completely unreachable (Arjun — severity: safety)
Fields exist (`injuriesOrLimitations`, `dislikedExercises`), SAFETY-01 policy locks progression on pain flags, the AI substitution modal has a "Hurts / joint discomfort" option — but **no screen writes the fields, no button opens the modal, nothing ever writes `reportsPain`** (zero write sites). Both swap entry points in WorkoutPage are only ever called with `null`. Every template prescribes barbell squat + RDL + deadlift. Mid-workout removal is session-only; the plan re-prescribes the RDL next week.

### 4. Unscaled bodyweight-max prescriptions for beginners (Raj, Simran, Aarav)
Pull-ups 3×8 in first-week templates with no regression path (`workout-engine.ts`). Beginner 0.6× scaling only touches weights, not reps or exercise selection. A 52-year-old novice and a postpartum mom are both told to do 24 pull-ups.

### 5. Dead coaching engines (Priya, Simran)
`analyzeWeightTrend` + `suggestCalorieAdjustment` (the "why am I not losing weight?" answer) exist in `coach-engine.ts` but `useCoachDigest` — their only consumer — is imported by **zero components**. Simran's warm missed-session check-in copy exists and is genuinely good — also dead. The store imports only `detectStalls`/`calculateReadiness`.

### 6. Custom exercises misclassified → "Chest"; ranked against wrong standards (Aditya, Kavya)
`getExerciseMuscle` falls through to `return 'Chest'` (`exercise-library.ts:282`). `getLiftLevel` falls back to Barbell Row standards for unknown lifts (`strength-standards.ts:386-393`). Kavya's power cleans become chest volume ranked against rows. Silent data corruption.

### 7. Silent 0-kcal quick-log (Priya — severity: trust)
"2 rotis and 1 slice pizza" → pizza logs at **0 kcal**, meal not rejected (junk check requires *all* items unrecognized), saved immediately with no review, pacing badge congratulates "Deficit Preserved." The manual builder warns; the quick-logger doesn't.

### 8. CSV import hardcodes kg; drops RPE history (Rohan)
`workout-import.ts:93` writes every set as kg. Strong's RPE column is never parsed — starving the auto-regulation engine. No unit selector, no warning.

### 9. Form guidance buried; no videos (Aarav, Raj)
Form cues live behind a ⋯ overflow menu. Zero exercise videos anywhere. Warm-ups hidden behind "Potentiation (~75%)" / "Neural Primer (~88%)" labels. A 52-year-old will lift cold.

### 10. Readiness explainer computed and discarded; coach hardcodes bodyweight (Aarav)
`calculateReadiness` returns plain-English `factors` — nothing renders them. `generateCoachTake` hardcodes `bodyweightKg = 75`.

---

## More verified bugs (fixed or queued)

- `detectMissedSessions` scans future days — can nag about Thursday on Monday morning (`coach-engine.ts:921-942`)
- Progress-photo pose label never set; 24-photo cap silently evicts oldest; quota failures swallowed while toast says "saved"
- "Quit" in discard-workout modal; "WORKOUT COMPLETE." banner after 2-set sessions
- 3/5/6-day plan paths skip beginner bodyweight calibration (hardcoded heavy loads)
- `WeeklyScheduleModal` hardcodes kg for lbs users
- RIR `intensityMode` toggle is dead state (`ActiveWorkoutScreen.tsx:384-395`)
- Maintenance = Mifflin-St Jeor × 1.4 hardcoded, no activity question (overestimates desk workers ~150-250 kcal)
- Onboarding never shows or explains the calorie target (deficit math buried in `text-3xs` microcopy)
- Plan-offer screen shows names only — blind acceptance, no exercise/minute preview
- Measurements: chest/waist/hips only — no arms, thighs, calves
- No volume-per-muscle tracking anywhere; coach speaks e1RM/PR/DOTS, no hypertrophy landmarks
- Sprint/athletic work unrepresentable: no time/distance fields, no athletic goal, 0 Olympic/plyo/sprint exercises
- Readiness is tonnage-blind — a max-velocity sprint day reads as rest

---

## Competitor Gaps Summary

| Competitor | What they do better |
|---|---|
| **Strong** | Faster logging, RPE first-class and preserved through export, bidirectional CSV, stays out of the way |
| **MyFitnessPal** | Weekly nutrition summary, reachable protein defaults, 14M+ foods, no mandatory fields |
| **MacroFactor** | Auto-adjusts calories from weight trend — ASCEND has this engine written and ships none of it |
| **Nike Training Club** | Video-guided workouts, equipment filters, trainer-led home programs |
| **Freeletics / FitOn** | Equipment asked at onboarding; bodyweight-first journeys; home-first design |
| **Fitbod** | Asks days/week + session length at onboarding; persistent exercise exclusion; one-tap set checklist |
| **RP Hypertrophy** | Per-muscle volume landmarks (MEV/MAV/MRV), pump/soreness feedback driving next week's volume |
| **Hevy** | Volume by muscle group, supersets, custom exercises with muscle assignment, routine duplication |
| **TrainHeroic / Volt** | Sport-native programming, season periodization, Olympic/plyo libraries with video |
| **Mommastrong / Every Mother** | Postpartum stage-based rehab content (dead bug, glute bridge, pelvic floor) — ASCEND has zero |
| **JuggernautAI** | Pre-session readiness check-in including pain/soreness per muscle group |

**Strategic note (from Rohan's review):** the coach layer is the genuinely differentiated thing. Positioning as "the coach on top of your data" beats "a replacement logger."

---

## Retention Verdict

**What keeps people:** honest logging (no fabricated PRs/RPE), the Indian food DB + natural-language meal parsing (best-in-class for the diet), silent streak freezes with no guilt, consent-based plan offers, the warm-up ramp generator, the coach's tone (plain English, no shame), Quick Log.

**What loses them:** the app never asks the two questions that define a user's week (days available, equipment), then grades them against a plan they didn't choose. Everything downstream — wrong schedules, impossible exercises, irrelevant coaching — follows from those two unasked questions. Special populations (injured, postpartum, older, athletes, home-only) hit walls that are structural, not cosmetic: the data models can't represent their reality (no injury input, no sport field, no time/distance, no rehab movements).

**The pattern across all 10 reviews:** working engines, unwired UI. The 3-day schedule logic exists. The equipment type exists. The check-in copy exists. The weight-trend engine exists. The substitution modal exists. The safety policy exists. **None of them are connected to the user.** The fix list is dominated by wiring, not invention.

---

## Fixes applied on this branch (2026-10-20, all committed, tsc clean, 804 tests passing)

**Bugs fixed (verified in code by the personas):**
1. Onboarding now asks training days/week (2–6) and equipment (full gym / home dumbbells / bodyweight only) on a new ScheduleScreen — dead `setDaysPerWeek` and hardcoded `full_gym` eliminated.
2. `adaptSplitForEquipment()`: generated plans swap gym-only exercises for home-doable ones (substitution table + movement fallback, honest 0.35× per-hand dumbbell loads). All plan paths (2/3/4/5/6-day) now also get bodyweight+experience first-exposure calibration (was 4-day only).
3. Beginners get pull-ups regressed (Lat Pulldown / DB Row / Inverted Row) instead of unscalable 3×8.
4. Plan-offer screen previews plan contents (exercises + est. minutes), not blind names.
5. CSV import reads Strong's Weight Unit column + kg/lbs header hints + profile-unit fallback (was hardcoded kg); preserves per-set RPE; PR calibration converts lbs→kg.
6. Quick-log warns when foods are unmatched at 0 kcal ("Some Foods Unmatched") — can no longer silently flatter the deficit badge.
7. `detectMissedSessions` flags past days only — check-in can never nag about a future session.
8. `useCoachDigest` wired to Home: missed-session check-in card (dismissible) + weight-trend nutrition suggestion with one-tap Apply; readiness plain-English factors render under the metric.
9. In-workout **Swap this exercise** (⋯ menu) with reason chips: "Hurts" swaps flag `reportsPain` (feeds SAFETY-01) and persist to `dislikedExercises`, which all plan generators now honor — the exercise is never re-prescribed. Dead swap states/handlers/modals removed from WorkoutPage.
10. Schedule presets use the profile unit (was hardcoded kg).
11. Photo pose picker (Front/Side/Back) with stored labels; silent 24-photo eviction now disclosed.
12. Custom-exercise standards honesty: proxy-standard ranks flagged `isStandardUnavailable` with a plain-English note, excluded from overall level; PRsPage renders the flag. `getExerciseMuscle` covers cleans/snatches/thrusters as Legs, not Chest.
13. Activity-aware maintenance calories: onboarding asks daily activity (1.2–1.725 multipliers) instead of hardcoded 1.4× — a sedentary 65 kg woman's maintenance drops ~270 kcal to an honest number.
14. "Start Workout" from Home opens the session immediately (fresh untouched drafts auto-open; no Resume gauntlet); banner renamed "Workout in progress"; Quick Log linked from the Home hero.
15. Copy: discard modal no longer says "quit"; finish modal honest for partial sessions ("SESSION SAVED." < 80%); dead RIR intensity-mode state removed; `generateCoachTake` takes the athlete's bodyweight (75 kg last resort).
16. `getExerciseEquipment` consults the exercise library first (Bulgarian Split Squat = dumbbell, Back Hyperextension = bodyweight).

**Still open (noted, not fixed in this pass):** no exercise demo videos anywhere; form cues still behind ⋯ menu; no Olympic/plyo/sprint library, no athletic goal, no time/distance data model (Kavya); no per-muscle volume tracking, no arm/thigh measurements, no superset/drop-set logging (Aditya); no rehab movement tier (dead bug, glute bridge…) (Simran); guest server-push impossible without schema change; no walking exercise counted toward streaks (Simran); calorie target never explained on onboarding screens.

---

## Individual Reviews

Full per-persona reviews (7 sections each) in `persona-reviews/`:
- `aarav.md` — 5/10
- `rohan.md` — 6.5/10
- `priya.md` — 6.5/10
- `vikram.md` — 5/10
- `neha.md` — 3/10
- `arjun.md` — 3/10
- `kavya.md` — 3/10
- `raj.md` — 4/10
- `simran.md` — 4/10
- `aditya.md` — 4/10

---

# ROUND 2 — Expanded 18-Persona Simulation + Fix Loop (2026-10-20)

**Branch:** `feat/overnight-build` (PR #13, unmerged) · **Method:** same code-analysis method as Round 1, all 10 original personas re-run against the Round-1 fixes plus 8 new personas. Every claimed bug was verified in code before fixing. **Result: 904 tests passing** (baseline 828; +76 net), `npx tsc --noEmit` clean, production build green. The only failing file remains `tests/security-integration-gate.test.ts` (20 tests) — pre-existing Docker/Supabase infra failures, unchanged from baseline.

## Round-2 Ratings

| Persona | Who | R1 | R2 |
|---|---|---|---|
| Aarav, 22 | Total beginner | 5 | **6** |
| Rohan, 30 | Powerlifter, ex-Strong | 6.5 | **6.5** |
| Priya, 27 | Fat loss, ex-MyFitnessPal | 6.5 | **6** |
| Vikram, 35 | Busy pro, 3 days/wk | 5 | **6.5** |
| Neha, 28 | Home-only dumbbells | 3 | **5** |
| Arjun, 45 | Back injury | 3 | **3** |
| Kavya, 24 | College athlete | 3 | **3.5** |
| Raj, 52 | Longevity | 4 | **5** |
| Simran, 31 | Postpartum | 4 | **4** |
| Aditya, 26 | Bodybuilder | 4 | **5** |
| Kabir, 38 | Night-shift worker | — | **4** |
| Meera, 29 | Type-2 diabetic | — | **3** |
| Aryan, 16 | School student | — | **5** |
| Sunita, 45 | Hindi-first, low English | — | **2** |
| Rahul, 33 | Marathon runner | — | **3** |
| Deepa, 40 | Gym owner / coach | — | **6** |
| Imran, 26 | Budget phone, storage-tight | — | **4** |
| Lakshmi, 60 | Senior, low vision | — | **3** |

**Average ≈ 4.5/10** (Round 1: 4.4). The honest read: Round-1 fixes verified as holding (onboarding schedule/equipment questions, equipment adaptation, pull-up regression, plan-offer preview, coach digest on Home, calorie gating, CSV units, quiet-hours wrap). Scores moved most where the fix was structural (Neha +2, Vikram +1.5). They did **not** move where the gap is content/features (Arjun — no rehab content; Rahul — no run programming; Sunita — no Hindi UI). Round 2's own bug harvest was dominated by a different disease than Round 1: not missing features, but **finished code that was never wired, settings that did nothing, and numbers that lied politely** (dead coach functions, a creatine reminder setting no engine reads, an "@8" displayed for sets never rated, backups that silently dropped the user's schedule and photos).

## Fixes applied — Round 2 (7 commits, all on this branch, none pushed beyond PR #13)

### `8b9971f` — Nutrition safety: one floor, no reckless deficits (Meera/Priya/Aryan)
- One exported calorie floor (`SAFE_MIN_CALORIES` in `macros.ts`: ♂1500 / ♀1200 / other 1400); coach engine, digest and the AI-coach prompt all read it instead of three divergent copies.
- Fat-loss targets can no longer exceed maintenance or sit below the floor; legacy sub-floor targets are flagged in Meals ("Target Below Safe Minimum") and can't be re-saved. Meals with zero nutrition data are blocked instead of logged as phantom 0-kcal meals (also in Quick Log + barcode custom entries + AI parse route).
- Minors get maintenance, never a deficit; BMR age clamp aligned (13+). Home calorie Apply now scales macros proportionally (protein preserved) instead of rewriting ratios. Sugar data flows from OpenFoodFacts through the barcode route into meal totals.

### `a245c41` — Proportional fat-loss deficit
- Deficit is now 20% of maintenance, capped at 450 kcal. A flat −450 was a 27% cut for a small sedentary woman (landing exactly on the floor) and 15% for a large athlete.

### `281a3f3` — One safe pipeline for every generated plan (Arjun/Neha/Simran/Aryan/Kavya/Rahul)
- Every plan-generation path (onboarding, weekly schedule, suggested split) now runs the same scale→adapt pipeline: equipment adaptation, exclusion matching by normalized exercise key, injury-family bans. Onboarding collects injury/limitation chips and preserves prior exclusions/limitations on re-onboarding.
- Movement-family-aware substitutions in the swap modal ("hurts" excludes the whole family — swapping a deadlift for an RDL is no longer offered as a fix); pain swaps create a persisted safety record so the original lift is held; progression never advances a lift after pain, never load-progresses explosive lifts or zero-weight sets, and no longer fabricates RPE 8 into decision inputs.
- Beginners/home users/minors get pull-up regressions; home muscle fallbacks cover every muscle group; machine cardio adapts by name (rowing/bike/treadmill → Jumping Jacks/Burpees) instead of falling through to a chest default; plans dedupe within a day and cap sets for beginners; day-count limiting is exact (a 2-day user gets 2 distinct days).

### `b672df8` — Honest standards & data integrity (Rohan/Deepa/Aditya)
- Strength standards: proxies must match the exercise's own muscle (Pec Deck was being graded against Leg Press); exercises with no same-muscle standard are flagged "no published standard," excluded from the tier, and the exclusion is disclosed in Profile. Custom exercises carry a user-picked muscle (selector picker + persisted registry) instead of uncorrectable keyword guesses; plyo/Olympic/glute/cardio classification fixed ("Box Jump" was Chest, "Running" was Chest, "Nordic Curl" was Arms).
- Sharing round-trips RPE, plan description and goal tag; receiver notes work; duplicate imports are detected by content and refused/reused. The Profile backup export was replaced by the unified builder (schedule, prefs, training profile, hydration/creatine logs, barcodes, **progress photos**) with credential stripping; restore returns all of it.
- CSV import is deterministic (re-importing the same file is a no-op), AM/PM sessions on one day stay separate, Workout Name + Duration columns are honored; store-level PR dedup; DOTS/big-three totals ignore dumbbell/goblet variants. Meet planner converts canonical-kg PRs into the user's unit (was 2.2× wrong for lbs users); plate calculator keeps 0.1 precision across unit toggles; the plan editor exposes target RPE.
- The Customization toggles became real: Gamification OFF stops XP accrual centrally; Coach OFF gates the post-workout Coach's Take surfaces. `adjustNextTargets` — fully built, fully tested, **zero callers** — is now wired through the coach digest onto Home as "Next session — coach's calls," with a pain check that understands pain-swap records.

### `615eed0` — Storage honesty & performance (Imran)
- Progress-photo saves report quota failure truthfully ("kept for this session only") instead of always claiming success. Emergency snapshot: one write on a 2 s debounce (was 5 keys every 500 ms — full history serialized ~3× per state change); legacy mirror keys are read-only migration sources; failures flip an exported health flag instead of an empty `catch`.
- Tabs code-split via `next/dynamic` (First Load JS for `/`: 310 kB; the barcode scanner loads on tap). Service-worker navigation races a 3 s timeout to the cached shell — a hanging slow-4G connection no longer means a blank screen forever.

### `1f5ecae` — Time & reminders (Kabir/Vikram/Aryan)
- Workout-reminder days auto-sync from the weekly schedule until hand-picked (`daysCustomized`, preserved by the preferences API). Water reminders run in the **awake window** (quiet-hours complement, wrapping midnight — night-shift workers got nothing after midnight before), anchored at wake time. Weekly report can be scheduled on any weekday (type, API validator, evaluator, picker).
- `useToday` hook ends frozen "today" at mount (Home, Train, habit matrix, past-workout log, hydration). Quick Log no longer fabricates RPE 8 per set or a 45-minute duration. Session-length estimates use sets × (work + rest by movement type) instead of exercises × 8. The missed-session check-in gained a working **"Do it today"** button that starts the missed plan (planId now flows end-to-end; copy matches the action).
- Creatine is adults-only everywhere: disabled at onboarding for minors, hidden from Meals/habit-matrix/daily-objectives for minors, and the dead creatine "Reminder Time" setting (saved, never read by any engine) replaced with an honest note. The AI coach's below-target water/protein advice only fires late in the day, like its fatigue warning already did.

### `7da9bea` — Accessibility & comprehension (Lakshmi/Aarav/Sunita/Kabir/Raj/Kavya/Rahul)
- **Pinch zoom restored**: `maximumScale`/`userScalable` removed and the iOS gesture-blocking script deleted. Light-theme muted text darkened to 4.7:1 (was 3.45:1), accent-as-text to 4.66:1; `text-3xs` defined in the Tailwind config (100+ usages silently fell back). In-workout tap targets raised toward 40 px; 9 px micro-labels enlarged; unrated sets no longer display a fake "@8".
- RPE picker leads with plain English ("How hard was that set?", "2 reps left" not "2 RIR"); Form cues and Warm-up are visible header buttons, not menu items 4 and 6; all fallback form cues rewritten without jargon. Onboarding/suggestion copy de-jargoned; the PR card explains 1RM in one line; Home's notification summary honors the Settings weekly-target override.
- Readiness check-in wired: sleep/soreness/energy dots on the Home readiness card persist per day and feed `calculateReadiness` (the parameter existed for months; no caller ever passed it).
- Load math honesty: bodyweight credit extends beyond 4 named lifts at realistic mass fractions; pure-cardio sessions earn a duration-based load (runners stopped reading as untrained); weekly review and pattern detection no longer call a **taper** "detraining" when attendance held. Hinglish meal parsing: "aur" splitting, Hindi number words, chawal/anda/doodh/sabzi entries, katori + glass units.

### `7a3162b` — Onboarding explains the target; sugar visibility (Sunita/Meera residuals)
- The plan-offer screen shows a "Your daily food target" card: maintenance, target, the delta in plain words, macro split, safe-floor promise, medical disclaimer. Targets are no longer set silently. Meals shows today's sugar from packaged foods when label data exists — labelled partial, never a fake zero.

## Remaining known gaps (feature requests — collected, deliberately NOT built)

- **Content/features:** exercise demo videos; per-muscle volume surface; native running GPS + run/sport programming (schedule day types are plan-or-rest only); postpartum/rehab content library (incl. missing Glute Bridge / Dead Bug / Bird Dog entries); teen mode; multi-profile on one device; Hindi UI (Sunita's blocker — she rated 2/10 largely on language; the Hinglish meal parser is a first step, not a UI); day-start offset for night-shift "today"; CSV **export**; %1RM programming; supersets; coach/client roles; weekly nutrition view; health-condition intake at onboarding (Meera); text-scaling setting; session-duration question at onboarding; bands as a first-class equipment category.
- **Minor residuals:** plan check-in copy is warm but adherence still grades against the full schedule; no pause mode for injury/illness weeks; single-point strength chart cosmetics from Round 1; white-on-vermilion button contrast is 4.07:1 (passes for large/bold text and icons; brand color retained deliberately); Capacitor remote-shell service-worker behavior and the rest-timer 180 s cap claim remain unverified on a physical device.
- **Unverifiable here:** camera barcode/meal-scan E2E on a real phone; push delivery to the user's device (chain verified server-side in Round 1 era).

## Individual Round-2 reviews

Full per-persona reviews in `persona-reviews/r2-<name>.md` for all 18 personas.
