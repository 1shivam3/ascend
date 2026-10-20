# Persona Review: Rohan, 30 — Advanced Powerlifter (S/B/D 180/130/220 kg)

**Reviewer persona:** Rohan. 4 years on Strong, tracks everything, thinks in RPE/RIR and % of training max, runs 5/3/1-style programming. Zero patience for apps that dumb things down.
**Branch reviewed:** `feat/overnight-build` (read-only analysis, 2026-10-20)
**Simulated bodyweight for calibrations:** ~100 kg (his lifts put him around this; ratios below use it)

---

## 1. First impression (30 seconds in)

Onboarding is fast — splash, welcome, goals, experience, details, done. No bloated fitness-app circus. But within a minute the problem is obvious: **the app never asks what he lifts.** Rohan's first week is calibrated on bodyweight and vibes, not on a 220 kg deadlift.

- `src/components/Onboarding.tsx` → `PersonalDetailsScreen` collects name, gender, unit, age, weight, heightCm. **No field for current 1RMs, training maxes, or best lifts.** Nothing in the whole flow (`Onboarding.tsx` line ~55–59 state, `handleFinishCalibration`) reads lift numbers.
- Days per week is hardcoded to 4 (`Onboarding.tsx`: `const [daysPerWeek, setDaysPerWeek] = useState<number>(4);` — `setDaysPerWeek` is never called anywhere in the flow; the personal-details screen has no training-day picker). Rohan trains 5–6 days; he gets a 4-day upper/lower plan.
- The "Advanced" experience option says *"it sets your starting volume"* (`ExperienceLevelScreen.tsx`), but mechanically it does almost nothing: the only place experience matters is `scaleTemplateWeightForAthlete` in `src/lib/workout-engine.ts`, where beginners get a 0.6× first-exposure factor and **intermediate = advanced = 1.0×**. His tap on "Advanced" changes exactly zero things about his plan versus "Intermediate."

The plan offer is honest at least — it asks before adding templates (doesn't auto-add, which is the correct call for a guy who has his own program). He'd decline it.

---

## 2. What worked for him specifically

Genuinely good stuff found in the code — not fluff:

- **Warm-up set generator** (`ActiveWorkoutScreen.tsx` lines ~1363–1445). Takes the first working set's weight and auto-builds a real ramp: empty-bar prep, blood flow @45–50%, groove velocity @65%, ramp @82%, and a neural primer single @91% for heavy low-rep work. That's how a powerlifter actually warms up. This is better than Strong (which has nothing like it).
- **PR-calibrated prescriptions once he has data.** If he enters his PRs first, `getExercisePrescription` (`workout-engine.ts`) routes through `suggestLoad(e1RM, reps, RPE)`: e.g. bench 130 e1RM → 5 reps @8.5 prescribes ~107.5 kg (`suggestLoad` in `strength-standards.ts`). That's a legitimate working weight, not a baby number. The engine then progresses from his *actual logged history*, never from templates.
- **RPE genuinely drives the progression engine** — not decoration. `getNextSessionTarget` (`workout-engine.ts`): avg RPE ≥ 9 → hold, ≤ 7 → +2.5 kg, else double-progression +1 rep. `coach-engine.ts` → `adjustNextTargets`: RPE ≥ 9 + missed reps → −5%; ≤ 6 → +5%; with honest handling when the change is smaller than a plate jump ("it's smaller than the smallest plate jump, so we're holding"). That's an app respecting bar physics.
- **Stall detection with a real diagnosis.** `detectStalls` (`coach-engine.ts`, ~line 240) doesn't just say "plateau" — it branches: climbing RPE at the same weight → deload (fatigue, not weakness); high reps at low RPE → switch rep scheme; wild rep variance (CV > 0.4) → technique work at −10%; stale stimulus → exercise variation via `getStimulusPreservingSwaps`. A 4-year lifter can tell when an algorithm is parroting versus reasoning; this one reasons.
- **Meet attempt planner with DOTS** (`MeetAttemptPlannerModal.tsx`). Opener @90%, second @95%, third configurable, projected total → DOTS score via IPF coefficients (`dots.ts`). A powerlifter-specific feature Strong doesn't have natively. Nice touch.
- **Plate calculator** (`plate-calculator.ts`, used per-set in the active workout) and the RPE picker showing RIR equivalents on every chip (`ActiveWorkoutScreen.tsx` ~3468: "@9 → 1 RIR, Could do 1 more"). Good bridge for an RIR-first lifter.
- **Readiness score** (`calculateReadiness`, `coach-engine.ts`): acute:chronic workload ratio, RPE drift detection, consecutive-days penalty, manual check-in. Conservative by design ("thin data pushes toward caution"). Sane.

---

## 3. What confused or frustrated him (specific, cite screens/flows)

### 🔴 BUG 1 — CSV import silently corrupts lbs users' history
`src/lib/workout-import.ts`, line 93: every imported set is written with `unit: 'kg'` — hardcoded. The parser never reads the user's profile unit, and `DataVaultModal.tsx` (`handleCSVFileChange`, line ~168–180) calls `parseWorkoutCSV(text)` with no unit argument and applies the result directly. Rohan uses kg, so *his* import survives — but Strong exports in lbs stay in lbs numbers, and they'd land in ASCEND as kilograms. A 405-lb deadlift becomes a 405-kg deadlift in his history. Silent. No warning, no unit selector on the import screen. **For a persona review through Rohan's eyes: he got lucky; the feature is a data-corruption trap for half its users.**

### 🔴 BUG 2 — Strong's per-set RPEs are dropped on import
Strong exports an `RPE` column. `parseWorkoutCSV` finds `repsIdx` via `h.includes('rep')` (which matches "Reps") and never reads the RPE column at all. All of Rohan's 4 years of effort ratings — the single most valuable signal for the auto-regulation engine above — are thrown away on import. The engine then computes "next session" targets from history *without* the RPE data it was designed to use (`avgRpe` → undefined → falls back to rep-based rules). He'd import 400 sessions and the coach would act like the effort column never existed.

### 🟡 BUG 3 — RIR mode is dead state
`ActiveWorkoutScreen.tsx` line 384: `const [intensityMode, setIntensityMode] = useState<'rpe' | 'rir'>` plus `toggleIntensityMode` (line 395) persisted to localStorage. **Neither is referenced anywhere else in the codebase** (verified by grep across `src/`). There is no RIR/RPE toggle in the UI. The picker shows RIR equivalents per chip (good enough in practice), but the stored preference implies a feature that doesn't exist. Sloppy — Rohan notices dead switches.

### 🟡 The "Advanced" selection is cosmetic (see §1)
The experience screen promises volume calibration; the only mechanical effect is the beginner 0.6× guard. Rohan's plan is identical whether he taps Intermediate or Advanced.

### 🟡 Day-1 plan numbers are insulting if he accepts the offer
`getGoalAdaptiveSplitTemplates('get_stronger')` → templates authored for an ~85 kg intermediate, scaled by bodyweight (`workout-engine.ts`). At 100 kg: Bench 87.5 kg (his 1RM: 130), Squat 130 kg (his: 180), Deadlift 152.5 kg (his: 220). The scaling code is careful and honest (rounds to 2.5 kg steps), but the template base numbers are intermediate numbers. He'd decline the offer and build his own — which the app allows — but the onboarding's headline promise ("calibrated to you") fails its first contact with a strong lifter.

### 🟡 No percentage-of-1RM programming anywhere
Grep across the codebase: no training-max concept, no `%1RM` prescriptions, no way to write "5/3/1: 65%×5, 75%×5, 85%×5+". `PlannedExercise` is `{ targetWeight, targetReps, targetRpe, targetSets }` — absolute numbers only. Rohan thinks in percentages of a training max; the app's programming language can't express his program. The MeetAttemptPlanner does % math for one day, but the training engine doesn't.

### 🟡 Rest timer caps at 180 s for heavy compounds
`ActiveWorkoutScreen.tsx` lines 651–662: main lifts ≤6 reps → 180 s; ≤8 reps → 120 s. There is a "+30 seconds" button (line 2791), but the default can't be changed per exercise or per athlete. On heavy squat/deadlift top sets Rohan rests 4–6 minutes. He'll be tapping "+30s" six times. Annoying on day 2, infuriating by day 5.

### 🟡 Weight clamps are silent
Import clamps weights at 1000 kg and PR entries cap at 500 kg (`MAX_PR_WEIGHT_KG`, `strength-standards.ts` line ~7). The 500 kg PR cap is reasonable (exceeds all raw records) — but his 220 kg deadlift is fine. The import-side clamp (`Math.min(1000, ...)`) silently truncates instead of warning. Minor.

---

## 4. Would he keep using it after week 1? Why/why not

**He would not switch. But he'd keep it installed for one reason: the coach.**

The honest breakdown:

- **Logging:** worse than Strong. Strong's logger is boring, fast, and stays out of the way. ASCEND's active workout screen is competent (rest timer auto-starts, plate calc per set, warm-up generator, voice logging) but can't express his actual programming (% of TM), and the RPE picker is a modal of chips where Strong is a quick-tap number. For a guy who logs 30+ sets/session, friction compounds.
- **Programming:** the engine's double-progression / RPE-autoregulated models are *sound for intermediates* but too simple for him. `getNextSessionTarget` only knows three moves (hold / +2.5 kg / +1 rep). There's no periodization, no accumulation/intensification blocks, no deload weeks in the plan structure, no % waves. He outgrew that progression model two years ago.
- **The coach layer is the only thing Strong can't do.** Stall diagnosis with cause-specific fixes, the readiness score, the post-workout take that references *his* RPE drift — Strong is a spreadsheet; ASCEND is a spreadsheet with a junior coach attached. That's genuinely differentiated.

Verdict: he keeps Strong as the system of record and his programming brain. He might run ASCEND in parallel for the coaching voice and the meet planner. A dual-app setup is not a switch.

---

## 5. What would make him delete it or go back to Strong

1. **Fix the import unit bug, or he'll never trust it.** Silent data corruption is the one unforgivable sin in a logging app. A lbs user imports history, sees garbage e1RMs, deletes the app. (He uses kg, but "it happened to work for me" isn't trust.)
2. **The day he realizes RPE history didn't import.** He imports 4 years of Strong data, the coach gives him rep-based generic advice because `avgRpe` is undefined everywhere — and he'd conclude the "AI coach" is dumb, when actually it was starved of his best data.
3. **Any attempt to dumb down his training.** If a future update starts nagging him with beginner tips because his readiness dipped, or the plan generator overrides his custom program — gone. The `userMode === 'advanced'` gating on decision cards (`WorkoutPage.tsx` line ~2300) is a good instinct; keep it.
4. **No CSV export.** Import exists; export is JSON backup only (`SettingsView.tsx` → `exportFullBackupJSON`). Strong lets him take his data anywhere. A data-hotel with no checkout is a dealbreaker for a 4-year logger — he will not put 400 sessions into an app that can't hand them back as CSV.

---

## 6. What Strong/Hevy do better for advanced lifters

- **Strong: the logger gets out of the way.** Faster set logging, RPE as a first-class per-set field (which it then *keeps* — including through its own export), timers that don't need babysitting, and rock-solid offline behavior. It's a tool, not a conversation.
- **Strong/Hevy: %1RM-based programming exists in the ecosystem** (Hevy routines with % notes, Strong's community templates); neither forces a fixed progression model on you. ASCEND's engine has opinions (+2.5 kg / +1 rep / hold); for an advanced lifter, the app's opinions are weaker than his own.
- **Hevy: social + exercise library depth.** 400+ exercises with videos. ASCEND's library is small (dozens, `exercise-library.ts`), though custom exercises are supported in the selector modal (`ExerciseSelectorModal.tsx` → "Add custom").
- **Strong: data portability is bidirectional.** CSV out, CSV in. ASCEND imports CSV but only exports JSON.
- **What ASCEND does better than both:** the warm-up ramp generator, the meet attempt planner with DOTS, per-exercise stall *diagnosis* (not just detection), and the readiness score. Strong has no coaching layer at all. If ASCEND leaned into "the coach that sits on top of your Strong data" instead of "a replacement logger," it would have a clearer pitch to Rohan.

---

## 7. Rating: **6.5 / 10**

Broken down the way he'd score it:

| Dimension | Score | Note |
|---|---|---|
| In-workout logging UX | 6 | Competent, but slower than Strong; rest timer default too short; can't express %1RM programs |
| Progression engine soundness | 7 | RPE-driven, conservative, plate-honest. Sound for intermediates; too simple for advanced periodization |
| Coach / stall detection / readiness | 8.5 | The best part. Real diagnoses, good voice, conservative where it should be |
| Onboarding for an advanced lifter | 4 | Never asks his numbers; "Advanced" is cosmetic; 4-day plan hardcoded |
| Strong CSV import | 5 | Works for kg users; silently corrupts lbs; drops all RPE history |
| Progress analytics | 6.5 | Per-exercise e1RM charts + PRs are solid; no volume-by-muscle landmarks, no mesocycle view |
| Data portability | 5 | CSV in, JSON-only out |
| Powerlifter-specific features | 8 | Meet planner + DOTS + plate calc + warm-up ramp |

**The one-line verdict he'd give:** "The coach is smarter than Strong's nothing, but the app can't hold my program and it threw away four years of my RPEs on import. Fix the import, add %1RM programming, and let me export my data — then we'll talk."

---

### Verified bug/UX-failure index (file + line, all confirmed in code)

1. CSV import hardcodes `unit: 'kg'` — `src/lib/workout-import.ts:93`; unit never read from profile or file (`DataVaultModal.tsx:168–180`). Silent corruption for lbs users.
2. Strong's RPE column dropped on import — `parseWorkoutCSV` (`src/lib/workout-import.ts`) never parses an RPE column; starves `avgRpe`-dependent logic (`workout-engine.ts`, `coach-engine.ts`).
3. Dead RIR intensity-mode state — `src/components/ActiveWorkoutScreen.tsx:384` (state) and `:395` (toggle); zero references elsewhere in `src/`.
4. "Advanced" experience has no mechanical effect vs Intermediate — `src/lib/workout-engine.ts` `scaleTemplateWeightForAthlete` (only `beginner` gets the 0.6× factor).
5. No %1RM / training-max programming model — `PlannedExercise` type (`src/lib/types.ts`) carries only absolute `targetWeight/targetReps/targetRpe/targetSets`; no percentage concept exists in the codebase.
6. Rest timer maxes at 180 s for heavy compounds — `src/components/ActiveWorkoutScreen.tsx:651–662`; only a +30 s button (`:2791`), no per-exercise/per-athlete default.
7. Onboarding never asks for lift numbers or days/week — `src/components/Onboarding.tsx` (state ~line 55–59; `daysPerWeek` default 4 never set by UI), `PersonalDetailsScreen.tsx` (name/gender/unit/age/weight/height only).
8. No CSV export — only `exportFullBackupJSON` (`src/components/SettingsView.tsx:115–133`).
