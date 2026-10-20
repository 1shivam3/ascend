# Persona Review R2: Rahul, 33 — Marathon Runner (NEW persona)

*Codebase: `~/workspace/ascend`, branch `feat/overnight-build`, read-only code trace. He lifts 2×/week to stay injury-free and runs 4×/week (~55 km) training for a marathon. Question: can ASCEND be his one training app, or does it only see the lifting third of his life?*

---

## First impression

Onboarding asks "What are your fitness goals?" — five cards (`src/components/onboarding/FitnessGoalsScreen.tsx`, from `ATHLETE_GOAL_CONFIGS` in `src/lib/types.ts`): Build Muscle, Lose Fat, Get Stronger, **Improve Fitness / Stamina — "Work capacity, stamina & cardiovascular fitness"**, General Fitness. `AthleteGoal` (`types.ts:7`) has no run, endurance, cardio-performance, or race value. "Stamina" is the least-wrong lie: its config (`types.ts`, stamina entry) promises "Zone 2, intervals, circuits" — gym conditioning, not run training. He picks Stamina.

Then the schedule screen asks how many days a week he trains. He trains 6. That answer is where the app first actively misfires (RAHUL-1).

## What worked

Fairness first — the *counting* layer is more generous than the data model:

- **If a run is logged as a `WorkoutEntry`, it counts almost everywhere it should.** Home's weekly consistency counts unique dates with any logged workout (`HomePage.tsx:367-391`, `weeklyStats`). The habit matrix's workout cell counts any workout that day (`getWeeklyHabitsConsistency`, `src/lib/habits.ts:449`). A streak day is active with ≥1 completed set (`dayIsActive`, `src/lib/streak-freeze.ts:44-57`), and a logged run earns the same 100 XP as a lifting session (`xpForWorkout`, `src/lib/xp-system.ts:60-66`).
- **Missed-session detection only nags about scheduled plan days** (`detectMissedSessions`, `src/lib/coach-engine.ts:926-955`) — run days sitting on 'rest' schedule slots are never flagged. The nagging problem (RAHUL-1) comes from onboarding's schedule generation, not from this function.
- **The 2 lifting days themselves are well served**: full-body templates, RPE progression, injury-sparing load calibration — everything a runner needs from his strength work is competently handled.
- **Meal logging + macro targets** work for fueling in principle; protein targets and meal reminders don't care that his sport is running.

## Friction & bugs

### RAHUL-1 (major, REAL BUG): "6 training days" is interpreted as 6 lifting days — and then he's nagged for "missing" them
`daysPerWeek` in onboarding means *lifting* days, but nothing says so. Rahul answers honestly: 6. `Onboarding.tsx:297-306`: 6 days → `generateSplitWeeklySchedule('push_pull_legs')` — a 6-day lifting split; `buildDefaultWeeklySchedule(generatedSplit, daysPerWeek)` (called at `Onboarding.tsx:346`) writes all 6 as scheduled lifting days. Now `detectMissedSessions` (via `useCoachDigest`, `src/lib/use-coach-digest.ts:74`) flags every run day as a missed lifting session, and `generateCheckIn` (`coach-engine.ts:1037+`) delivers a weekly "Quick check-in: Upper A (Tuesday) didn't get logged…" for sessions he never intended to do. His alternatives are both bad: answer 2 and get a correct lifting schedule in which his runs are invisible to the plan, or answer 6 and be guilt-tripped 4× a week for running. The schedule model itself can't express his week: `DayScheduleConfig.workoutPlanId` is `string | 'rest'` (`src/lib/types.ts:419-424`) — a day is a lifting plan or rest. **There is no cardio/run day type.**

### FEATURE GAP (blocker for his use case): a 15 km run cannot be logged
- **No running exercise exists.** The library's Conditioning block (`src/lib/exercise-library.ts:127-214`) is Zone 2 Stationary Cycling, Incline Treadmill Walk, Rowing Machine Intervals, Jump Rope Intervals, Stair Climber — all machines. No run, jog, tempo, intervals-on-road, or long-run entry in 104 exercises.
- **No fields for it anyway.** `WorkoutSet` (`types.ts`) = reps / weight / rpe. `WorkoutEntry` adds only whole-session `durationMinutes`. There is no distance, pace, or per-exercise duration field anywhere in the data model (grep for distance/steps across `src/lib` + `src/components`: no data-model hits).
- **The workaround corrupts his data.** He can add custom "Running" (`ExerciseSelectorModal.tsx:48`) and fake it: 1 set, reps = 90 (minutes?) or 15 (km?). Either way the number lands in a *reps* column — feeding rep-based PR detection, volume stats, and the progression engine, which will duly prescribe "+1 rep" or "+2.5 kg" for his long run (`getNextSessionTarget`, `src/lib/workout-engine.ts:120-175` — same three directives for every exercise). Voice logging can't help: its grammar is weight×reps (`src/lib/voice-logger.ts`; `parseVoiceWorkout`, `workout-engine.ts:1402`) — "15 km easy in 1:22" has no parse.
- So his actual answer to "what screen do I log my run on?" is: **none**. The run — 70% of his training — either lives in another app or is shoehorned into a reps field that poisons his lifting stats.

### RAHUL-2 (major, REAL BUG): the coach reads his marathon taper as detraining
`generateCoachWeeklyReview` (`coach-engine.ts:803+`) counts sessions generously ("you trained N times") but judges volume **only** by tonnage (`calculateWorkoutTonnage`, `src/lib/ai-coach.ts:22-44`; runs at 0 kg = 0). In his taper weeks his lifting tonnage deliberately drops; past the −20% threshold the review says: *"volume dropped X% vs last week — one easy week is recovery, two is detraining"* (`coach-engine.ts:845-850`) — while he is running the highest-mileage weeks of his life. `detectPatterns`' volume_collapse check (`coach-engine.ts:1014-1030`) has the same tonnage-only basis. The coach's verdict on the best-executed weeks of his marathon block is "you're detraining."

### RAHUL-3 (major, REAL BUG): readiness contradicts itself about his runs
Same root, two directions at once. (a) **Load-invisible**: the acute:chronic ratio in `calculateReadiness` (`coach-engine.ts:488-560`) is tonnage-based, so 55 km of running adds zero measured load — a runner who *adds* lifting on tired legs gets no fatigue signal from his actual sport. (b) **Rest-penalized**: the consecutive-days component (same function, section c) counts any logged workout date, so his normal 6-day week (2 lift + 4 run, all logged) triggers the ≥5-day penalty (−8, "schedule a rest day within the next two days") and a 7-day stretch triggers −15 with "take a real day off" — advice calibrated for lifting streaks, applied to a sport where 6-day weeks with easy runs *are* the program. The app simultaneously can't see his load and punishes his consistency.

### Nutrition gaps (FEATURE GAP)
- `stamina` nutrition = maintenance calories (`ATHLETE_GOAL_CONFIGS.stamina.nutritionEmphasis`, `types.ts`). A marathoner's long-run day can burn 1,500+ kcal more than a rest day; the app serves one flat target.
- TDEE tops out at `very_active` = 1.725 (`ACTIVITY_MULTIPLIERS`, `src/lib/macros.ts:1167-1172`), described at onboarding as "Heavy manual work or training twice a day" (`ScheduleScreen.tsx:31`). There is no endurance-athlete tier and no per-day fueling (no carb periodization, no long-run-day target). Under-fueling is *the* amateur marathoner failure mode, and the app is structurally incapable of warning him.
- No step count, distance, or wearable run data model exists anywhere in the app to build any of this on.

### His simulated week
Mon: easy 10 km — nowhere to log it (or fake reps). Tue: lifting — app shines. Wed: tempo 12 km — invisible. Thu: lifting — app shines. Fri: rest. Sat: long run 28 km — the biggest session of his week; ASCEND records nothing, or a "Running × 90 reps" set that then gets a "+1 rep" progression target. Sun: recovery run. Week's verdict from the app (if he answered 6 days at onboarding): four missed-session check-ins (RAHUL-1); readiness dinged for training too many days in a row (RAHUL-3); weekly review volume judged on two lifting sessions only (RAHUL-2). **Is his 2+4 week called a failure? Not in those words — but every evaluative surface either ignores the runs or converts them into demerits. Functionally, yes.**

## Keep-or-delete verdict

**Delete within the first week.** Not because the lifting half is bad — it's good — but because his sport is unloggable (no exercise, no fields), his honest onboarding answer manufactures fake missed sessions (RAHUL-1), and the coach's two flagship judgments (readiness, weekly review) are tonnage-blind in ways that specifically misread endurance training (RAHUL-2, RAHUL-3). He already lives in Strava/Garmin for runs; ASCEND asks him to dual-wield apps while actively misgrading the weeks he gets right. Dual-system users churn.

**What would make him delete it:** the first taper week being labeled detraining, or the fourth "missed session" check-in for a day he ran 15 km.

## Competitor gap

- **Strava / Garmin Connect / Nike Run Club**: a run is a first-class object — distance, pace, splits, HR, elevation — auto-imported from a watch. ASCEND cannot represent a run *at all*; the gap is the data model, not polish.
- **TrainingPeaks**: plans mix sport types on one calendar; a day is run/bike/swim/lift, and load (TSS) is computed per sport. ASCEND's schedule day is `planId | 'rest'` (`types.ts:419`) and its only load unit is kilograms.
- Even **Strong/Hevy** (pure lifting apps) don't pretend to coach his whole week. ASCEND's coach *does* claim the whole week — readiness, weekly review, missed sessions — while seeing a third of it. The overclaim is the gap.

## Rating: 3 / 10

For a pure lifter this is a 7-8. For Rahul: his primary sport has no goal, no exercise, no fields, and no load model; the schedule can't hold his week; and the coach misreads his best weeks. The 3 points are for the genuinely good lifting + nutrition-logging core he'd use 2 days a week — not enough to keep a second app for.
