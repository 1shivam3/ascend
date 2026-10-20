# Persona Review R2: Kavya, 24 — College Sprinter (100m/200m)

*Round 2. Codebase: `~/workspace/ascend`, branch `feat/overnight-build`, read-only code trace. Every claim verified in code with file citations; round-1 findings re-checked against current code — two were fixed, and this review says so.*

---

## First impression

Same as round 1, because onboarding hasn't changed: five goal cards — Build Muscle, Lose Fat, **Get Stronger ("Heavy compound lifts & raw power")**, Improve Fitness / Stamina, General Fitness (`src/components/onboarding/FitnessGoalsScreen.tsx`, GOAL_OPTIONS built from `ATHLETE_GOAL_CONFIGS`). The type system still can't say her sport: `AthleteGoal = 'build_muscle' | 'get_stronger' | 'lose_fat' | 'stamina' | 'general_fitness'` (`src/lib/types.ts:7`), and `UserProfile` (`src/lib/types.ts`, interface at ~line 131) still has **no sport field** — name, gender, bodyweight, height, age, unit, goals, diet. There is nowhere in the app to store "I sprint," so nothing downstream can ever know.

She taps Get Stronger again. The generated split is still a powerlifting split: `buildGoalAdaptiveSplitTemplates`, `get_stronger` branch (`src/lib/workout-engine.ts:1786+`) — Upper A = Bench Press 4×5, Barbell Row 4×5, Overhead Press, Lat Pulldown, **Dumbbell Curl 3×8**. A sprinter's first generated program still ends in curls.

## What worked

- **Posterior-chain strength tracking is genuinely good.** Squat, Front Squat, RDL, Conventional/Sumo Deadlift, Barbell Hip Thrust are all in the library (`src/lib/exercise-library.ts:39-78`) with honest ratio-based standards (`src/lib/strength-standards.ts`). Her weight-room work — the part of sprint training ASCEND can see — is coached well.
- **RPE-aware progression for lifts** (`getNextSessionTarget`, `src/lib/workout-engine.ts:120-175`): hold at avg RPE ≥ 9, +2.5 kg at ≤ 7, +1 rep otherwise. Sound for barbell work.
- **Round-1 BUG 1 is FIXED.** A custom "Power Clean" no longer files under Chest: `getExerciseMuscle` now has an explicit Olympic/explosive rule — `clean|snatch|jerk|thruster|kettlebell → 'Legs'` (`src/lib/exercise-library.ts:279-281`). Credit where due.
- **Round-1 BUG 2 is MITIGATED.** `getLiftLevel` (`src/lib/strength-standards.ts:396+`) now flags unknown exercises ranked against a proxy standard: `isStandardUnavailable = usesProxyStandard && !isKnownExercise`, excludes them from the overall level (`getOverallLevel` filters them out), and `PRsPage.tsx:328-330` renders an "Estimated level —" note. The silent confident wrongness is now labeled — on the PR page, at least (see KAVYA-4).
- **XP is per-workout, not per-kilo** (`xpForWorkout`, `src/lib/xp-system.ts:60-66`): any workout with ≥1 completed set earns 100 XP, so her non-barbell days aren't scored as zero-effort by the game layer.
- **Custom-exercise escape hatch** exists (`ExerciseSelectorModal.tsx:48`, `handleAddCustom`) — she *can* type "Power Clean" and "Box Jump." What happens next is the problem (below).

## Friction & bugs

### The library is still a ghost town for power/speed (FEATURE GAP, verified)
104 exercises in `EXERCISE_LIBRARY`. Olympic lifts: **zero** — the only Olympic-adjacent movement is Barbell Push Press (`exercise-library.ts:82`). Plyometrics: **zero** — no box jump, depth jump, broad jump, bounds. Sprint drills, sled push/pull, med-ball throws, hurdle mobility: **zero**. The entire "Conditioning" block (lines 127-214) is five cardio machines (Zone 2 Cycling, Incline Treadmill Walk, Rowing Intervals, Jump Rope, Stair Climber) plus Kettlebell Swings and Farmer's Walk. Her sport's movement vocabulary does not exist in this app.

### KAVYA-1 (blocker, REAL BUG — round-1 BUG 4, still present): readiness is tonnage-blind to sprint load
`calculateReadiness` (`src/lib/coach-engine.ts:488+`) computes its acute:chronic workload ratio from `calculateWorkoutTonnage` (`src/lib/ai-coach.ts:22-44`): tonnage = Σ(reps × weight), with bodyweight estimated **only** for exercises matching `/pull-up|chin-up|dip|push-up/i`. Her Tuesday max-velocity session — 6×60m all-out, logged as a custom exercise at 0 kg — contributes **~0 tonnage**. The app reads her most CNS-taxing day as a rest day, shows green readiness Wednesday, and clears her for a top-set squat day — potentially the day before a meet. (Partial nuance: the consecutive-days component of readiness does count any logged workout date, so the day isn't invisible — its *load* is.) A readiness score that is wrong in exactly the direction that injures sprinters is worse than no score.

### KAVYA-2 (major, REAL BUG — new): plyometrics still default to Chest
The round-1 fix covered Olympic lifts only. `getExerciseMuscle('Box Jump')` (`exercise-library.ts:261-282`): no direct/partial match, no keyword hit (there is no jump/box/sled keyword at all), falls through to `return 'Chest'`. Same for "Depth Jump," "Broad Jump," "Sled Push." Her plyometric volume is silently booked as chest volume in every muscle-balance and volume view — the exact silent-misclassification failure round 1 flagged, fixed for cleans, still live for the movements she does *more* of.

### KAVYA-3 (major, REAL BUG — round-1 BUG 3, still present): progression engine prescribes load/rep creep on explosive work
`getNextSessionTarget` (`workout-engine.ts:120-175`) has three directives for *every* exercise, no type guard: hold, +2.5 kg, +1 rep. For her custom "Box Jump" logged at bodyweight with avg RPE ≤ 7, the engine prescribes **2.5 kg × reps next session**; at moderate RPE it prescribes **+1 rep**. Explosive work progresses by intent, velocity, and ground-contact quality — never by load creep, and "add a rep" on plyos is how landings get sloppy. The engine cannot distinguish a box jump from a bicep curl because the data model can't either (below).

### FEATURE GAP (blocker for her use case): sprint performance is unrepresentable in the data model
`WorkoutSet` (`src/lib/types.ts`, ~lines 163-184) has `reps`, `weight?`, `rpe?` — no time, no distance, no velocity. `PersonalRecord` is `weightKg / reps / oneRepMax` only. Her 100m PB — the single most important number in her sport — has no field anywhere. The model's strain shows in the library itself: planks are smuggled in as "Front Plank (**Seconds**)" with seconds stored as reps (`exercise-library.ts:120`). Voice logging is no help: the parser grammar is weight×reps (`parseVoiceWorkout`, `workout-engine.ts:1402`; alias dictionary in `src/lib/voice-logger.ts` has no sprint/run entries), so "6 sprints of 60 in 7.4" parses to junk or nothing.

### Paper cuts (verified)
- **No season/periodization anywhere**: grep for season/competition/periodiz in `coach-engine.ts` + `types.ts` = zero hits. In-season vs off-season is the most basic axis of athletic programming; the nutrition engine puts `get_stronger` on a +150 kcal surplus (`ATHLETE_GOAL_CONFIGS.get_stronger`, `types.ts`) with no idea she's in competition season.
- **"Meet" means powerlifting**: `MeetAttemptPlannerModal.tsx:77` — "Powerlifting Meet Attempt Planner" (Squat/Bench/Deadlift attempts + total). Her meets have starting blocks.
- **Substitution nonsense for her lifts**: `getQuickSubstitutes('Power Clean')` (`workout-engine.ts:1197-1228`) — no map entry, equipment fallback returns generic "Dumbbell alternative / Machine alternative." A machine power clean is not a thing.
- **KAVYA-4 (minor, REAL BUG — mitigation gap):** the proxy-standard "estimated" label renders only in `PRsPage.tsx:328-330`. `ProfileView.tsx:103` calls `getLiftLevel` and never reads `isStandardUnavailable`/`standardNote` (grep: no other component references them), so on her Profile the estimated level for a custom lift still appears unlabeled.

### Her simulated week
Mon: squat day — app is good. Tue: max-velocity sprints — logged as custom exercise, 0 tonnage, filed nowhere meaningful. Wed: readiness green (KAVYA-1), heavy lower day prescribed. Thu: power cleans (now correctly "Legs" — progress!) + box jumps (booked as Chest — KAVYA-2), next-session target tells her to add 2.5 kg to the jumps (KAVYA-3). Sat: college meet — she PBs 12.04s and opens the app to record it. There is no field for it. That is the moment the app loses her.

## Keep-or-delete verdict

**Delete as her training app by end of week 1; survives at most as a squat log.** Round 2 fixed the two *labeling* bugs (muscle mapping for Olympic lifts, proxy-standard disclosure) — real responsiveness, worth +0.5. But the three structural failures are untouched: the library has none of her movements, the set model cannot express time/distance, and readiness still cannot see sprint load (KAVYA-1). She already has a stopwatch and a notes app; ASCEND's pitch is coaching, and its coaching is blind to her sport's actual work. Two systems = she drops the one that doesn't understand her.

**What would make her delete it:** the green-readiness morning after a max-velocity day (KAVYA-1), or the un-loggable 100m PB. Either one, once.

## Competitor gap

- **Volt Athletics**: onboarding asks sport, position, season phase, equipment; periodizes in-season vs off-season; Olympic/plyo/speed movements are native. ASCEND has no sport field, no season concept, no periodization.
- **TrainHeroic**: coach-delivered team programming; Olympic lifts and plyos are first-class library citizens with demos. ASCEND's library: 0 and 0.
- **TrueCoach / Bridge Athletic**: conditioning prescribed and tracked in time and distance. ASCEND's `WorkoutSet` cannot express either — this is a schema gap, not a content gap, so no content update can close it.

Common thread: athletic products key everything off **sport → season → movement category → appropriate unit**. ASCEND keys off the lift. Bolting "sprinter" on requires a parallel track: sport field on the profile, a time/distance-capable set model, a plyo/Oly library, and readiness that counts non-tonnage load.

## Rating: 3.5 / 10

(Up from round 1's 3 — the team fixed the muscle-mapping bug and labeled proxy standards. Still: 0 of 5 goals express performance, 0 Olympic/plyo/sprint movements in 104 exercises, sprint work unrepresentable in the schema, and the readiness engine remains blind to her hardest training.)
