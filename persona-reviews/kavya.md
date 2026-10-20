# Persona Review: Kavya, 24 — College Sprinter (100m/200m)

*Reviewer persona: Kavya lifts for power, speed, and explosiveness. She doesn't care about bicep peaks. She's testing whether ASCEND understands athletic training or is a bodybuilding app in a costume.*
*Codebase: `~/workspace/ascend`, branch `feat/overnight-build`. All findings verified in code with file:line citations.*

---

## 1. First impression (30 seconds in)

I open the app, hit onboarding, and the goals screen shows me five cards: Build Muscle, Lose Fat, **Get Stronger ("Heavy compounds & raw power")**, Improve Fitness / Stamina, General Fitness (`src/components/onboarding/FitnessGoalsScreen.tsx:15-50`, subtitle at line 34).

None of them say "athletic performance." None say "get faster." None say "explosive power."

"Get Stronger — Heavy compounds & raw power" is the bait. *Raw power* is sprinter vocabulary. I tap it expecting power cleans, box jumps, velocity-based work. What the engine actually generates for `get_stronger` is an upper/lower **powerlifting split**: Bench Press 4×5, Barbell Row 4×5, Overhead Press, Lat Pulldown, Dumbbell Curl (`src/lib/workout-engine.ts` `buildGoalAdaptiveSplitTemplates`, `get_stronger` branch ~line 1662). Dumbbell curls. On a sprinter's program. Day one, the app has already told me what it is.

The type system confirms it: `AthleteGoal = 'build_muscle' | 'get_stronger' | 'lose_fat' | 'stamina' | 'general_fitness'` (`src/lib/types.ts:7`). Athletic performance is not expressible anywhere in the app. And the profile object — `UserProfile` (`src/lib/types.ts:131-146`) — has name, gender, bodyweight, age… and **no sport field at all**. There is literally nowhere to store "I sprint." The AI coach (`src/lib/ai-coach.ts`) therefore *cannot* know I'm a sprinter, no matter how smart its prompts are.

---

## 2. What worked for her specifically

Credit where it's due — the engineering underneath is genuinely good, and a few things transfer to sprint training:

- **The squat/deadlift/hip-thrust standards are real.** `MALE_STANDARDS` (`src/lib/strength-standards.ts:48-58`) has honest ratio-based strength levels for Squat, Deadlift, Front Squat, Romanian Deadlift, and Barbell Hip Thrust is in the library (`src/lib/exercise-library.ts`). Posterior-chain strength *is* sprint performance, and ASCEND tracks it well. A sprinter who just wants her squat and RDL numbers coached would get value here.
- **Readiness score concept is right for athletes.** Acute:chronic workload ratio + RPE trend + rest-day streaks + manual check-in (`src/lib/coach-engine.ts:488`, `calculateReadiness`). Sprint coaches live and die by readiness. The *idea* is exactly what she needs — the implementation betrays it (see §3).
- **RPE-aware progression with anti-grind guards** (`src/lib/workout-engine.ts:120-175`, `getNextSessionTarget`): avg RPE ≥ 9 → hold; ≤ 7 → small step up. Conservative, honest, and it fixed the old contradictory-target bugs. For her lift days this is sound.
- **Custom exercise escape hatch exists.** `ExerciseSelectorModal.tsx:48` lets her add "Power Clean" as a custom exercise. The app doesn't *stop* her from building a speed day — it just doesn't understand what she built.
- **XP is per-workout, not tonnage-based** (`src/lib/xp-system.ts:60`, `xpForWorkout`: 100 XP for ≥1 completed set). Her sprint day still earns its points instead of scoring ~0 for "no weight moved." Small thing, but it shows someone thought about non-lifting work at least once.
- **"Velocity" language exists in coaching copy** (e.g. `ATHLETE_GOAL_CONFIGS.get_stronger.trainingEmphasis` mentions "velocity maintenance", `src/lib/types.ts:64`). It's VBT theater — no velocity is ever measured — but the vocabulary at least gestures at her world.

---

## 3. What confused or frustrated her (specific, cite screens/flows)

### Day 1 — Onboarding: "Which lie do I pick?"
She stares at five goals, none of which is hers. Her realistic options:
- **Get Stronger** (misleading "raw power" subtitle) → gets a bench/row/curl split. Upper-body hypertrophy volume that adds non-functional mass a sprinter actively avoids.
- **Improve Fitness / Stamina** ("Work capacity & cardio fitness", `FitnessGoalsScreen.tsx:40`) → gets Zone 2 cycling, incline treadmill walks, and 12–15 rep lifts (`workout-engine.ts` stamina templates, e.g. "15 min @ 10–12% incline, 4.5–5.0 km/h"). A sprinter who picks this thinking "speed" gets prescribed the exact opposite of alactic power training — slow aerobic sludge with lactate-clearing notes.
- She picks Get Stronger. The nutrition engine then puts her on a **+150 kcal "slight surplus"** (`ATHLETE_GOAL_CONFIGS.get_stronger.nutritionEmphasis`, `types.ts:64-65`) — with zero awareness that she's in competition season, where surplus weight is the enemy. No season/periodization concept exists anywhere in the codebase (grep for "season", "competition", "meet", "periodiz" in `coach-engine.ts`: zero hits).

### Days 2–5 — Building a speed day: the library is a ghost town
She searches the exercise library for her bread and butter:
- **Power clean / hang clean / snatch / jerk** — 0 results. 108 exercises (`src/lib/exercise-library.ts`), and the only Olympic-adjacent movement in the entire file is **Barbell Push Press** (line 82).
- **Box jumps / depth jumps / broad jumps / bounds** — 0 results.
- **Sled push / prowler / farmer's... ** — Farmer's Walk exists (line 207); no sled. No sprint drills, no agility ladder, no hurdle mobility, no med-ball throws.
- Closest "power" items: Kettlebell Swings (line 194) and a block of cardio machines (lines 129–181: bike, treadmill, rower, stair climber).

So she does what the app allows: adds **"Power Clean" as a custom exercise**. That's where it gets actively bad instead of merely empty. Three verified bugs:

**BUG 1 — Her power clean is filed under Chest.** `getExerciseMuscle('Power Clean')` (`src/lib/exercise-library.ts:261-282`): no direct match, no partial match, no keyword match ("clean" matches none of the keyword lists) → falls through to `return 'Chest'` (line 282). Consequences: her weekly volume-per-muscle stats, muscle-balance charts, and "what did I train" summaries all silently misreport. She thinks she's tracking posterior-chain power volume; the app thinks she's doing chest.

**BUG 2 — Her power clean is ranked against barbell-row standards.** `getLiftLevel` (`src/lib/strength-standards.ts:386-393`): unknown exercise + `getExerciseEquipment` defaulting to `'barbell'` (line 226) → `standards = MALE_STANDARDS['Barbell Row']`. The app then shows her a "strength level" and rank title for her clean that's computed against someone else's row norms. Silent, confident, wrong.

**BUG 3 — The progression engine prescribes "add a rep" on plyometrics.** `getNextSessionTarget` (`src/lib/workout-engine.ts:120-175`) has exactly three directives: hold, +2.5 kg, +1 rep. For power work this is wrong coaching (explosive work should stay submaximal; you progress speed intent and bar velocity, not load creep). For plyometrics it's *dangerous* coaching: "add a rep" on box jumps is how you get sloppy landings. Sprint coaches progress plyos by ground-contact quality and total foot contacts — neither exists in the app. And box jumps at bodyweight get `weight: 0` → the "+2.5kg" suggestion is meaningless anyway.

**BUG 4 — The readiness score is blind to her hardest training.** `calculateReadiness` computes acute:chronic ratio from `calculateWorkoutTonnage` (`coach-engine.ts:509`). Tonnage = Σ(reps × weight) (`ai-coach.ts` `calculateWorkoutTonnage`), with bodyweight estimated **only** for exercises matching `/pull-up|chin-up|dip|push-up/i` (~line 22). Her Tuesday max-velocity session — 6×60m all-out — logged as a custom exercise at 0 kg contributes **~0 tonnage**. The app reads her most CNS-taxing day of the week as a rest day. Wednesday morning readiness shows green/ready and the coach happily prescribes a top-set squat day — possibly the day before her track meet. For a lifter, tonnage-based readiness is fine. For a sprinter, it's a coaching failure with injury-adjacent consequences.

More paper cuts:
- **She cannot log a 100m PB.** `WorkoutSet` (`types.ts:163-184`) has only `reps`, `weight?`, `rpe?` — no distance, no time, no velocity. `PersonalRecord` (`types.ts:148-159`) is `weightKg / reps / oneRepMax`. Her sport's single most important number — 100m time — has no field anywhere. Meanwhile "Chest Dips" gets a full PR ceremony.
- **The "Meet Attempt Planner" is a powerlifting meet planner** (`src/components/MeetAttemptPlannerModal.tsx:77`: "Powerlifting Meet Attempt Planner" — Squat/Bench/Deadlift attempts + projected total + DOTS). When a sprinter hears "meet," she hears starting blocks. The app hears a platform and a singlet.
- **Voice logging can't parse her work either**: `parseVoiceWorkout` (`workout-engine.ts:1277+`) extracts numbers as weight/reps — "6 sprints of 60 meters in 7.4" becomes junk sets.
- **Substitution engine gives nonsense for her lifts**: `getQuickSubstitutes('Power Clean')` → equipment fallback → generic "Dumbbell alternative / Machine alternative" (`workout-engine.ts:1217-1228`). A machine power clean is not a thing.
- The core identity module is literally named **`lifter-twin.ts`** (`LifterTwinProfile`, `LifterExerciseProfile`). Not athlete-twin. Lifter. The costume metaphor writes itself.

### Day 7 — The verdict screen
By Sunday she's used ASCEND as a (good) squat/RDL log and a (broken) everything-else. The app's mental model of her week: she did some chest (her cleans), some cardio (her tempo), and had suspiciously easy Tuesdays (her sprint days).

---

## 4. Would she keep using it after week 1? Why/why not

**Not as her training app. Maybe as a weight-room notebook — and that's a failure.**

The honest version: Kavya already has a notes app and a stopwatch. ASCEND's pitch is *coaching* — plans that adapt, readiness that protects, progression that's smart. For a sprinter, all three misfire:

1. **Plans**: the only generated programs are hypertrophy/strength/fat-loss/cardio splits. There is no power/speed template and no template system that could express one (every template is sets×reps×weight).
2. **Readiness**: blind to sprint load (Bug 4). A readiness score that's wrong in exactly the direction that gets athletes hurt is worse than no score.
3. **Progression**: load-or-rep creep is anti-coaching for power work (Bug 3).

What she'd actually do: keep logging squats because the strength standards and RPE progression are nice, keep her real program (from her college S&C coach) in her head, and maintain two systems — which means within a month she drops the one that doesn't understand her sport. The switching cost of "just log lifts here" isn't worth it when the app keeps confidently mislabeling her training.

The one thing that might retain her: if ASCEND ever shipped a sport profile + a real speed/power template library. She'd check back for that. She won't wait around for it.

---

## 5. What would make her delete it

1. **The readiness betrayal.** Green "ready" badge the morning after a max-velocity day, followed by a heavy squat prescription the day before her college meet. One bad taper week blamed (rightly or wrongly) on the app = instant delete. This is the highest-severity item in the review.
2. **The 100m PB that doesn't exist.** She runs a lifetime best 12.04s, opens the app to immortalize it, and discovers the PR system only speaks kilograms. The app celebrates her "Dumbbell Lateral Raise 8kg × 12" PR while her actual sport is unrepresentable. That moment kills the emotional relationship.
3. **Silent data corruption discovered late.** Finding out weeks later that her power cleans were counted as chest volume and ranked against row standards — she'd never trust a single chart in the app again. Silent wrongness is worse than an honest "not supported."
4. **The "raw power" bait.** She tapped Get Stronger because the subtitle spoke her language, then got dumbbell curls. She'll read that as the app not respecting her intelligence — or her sport.

---

## 6. What competitors do better for athletes

*(High-level, from public product knowledge — not code-verified.)*

- **TrainHeroic**: the program is delivered by an actual (often sport) coach, and the platform is built around *teams and training blocks*, not generic splits. Exercise library includes Olympic lifts and plyometrics with video demos as first-class citizens. Leaderboards are by team/sport, not by bench 1RM. The gap: ASCEND has no coach-delivered programming, no team context, no sport-specific movement library.
- **Volt Athletics**: the onboarding asks for your **sport, position, season phase, and available equipment**, then periodizes — off-season vs. pre-season vs. in-season are different programs, with different volume/intensity. Movement categories include Olympic, plyometric, and speed work natively. The gap: ASCEND has no sport field (`UserProfile`, `types.ts:131-146`), no season concept, no periodization, and its templates are static rep-scheme variants of the same split.
- **TrueCoach / BridgeAthletic**: conditioning and speed work are prescribed in **time and distance** (intervals, tempo runs), and compliance is tracked against those units. The gap: ASCEND's `WorkoutSet` (`types.ts:163-184`) can only express reps×weight — sprint/interval work is literally unrepresentable in the data model, so no competitor-style speed programming can ever be built on it without a schema change.
- Common thread: every serious athletic-training product treats **the sport as the primary key** — sport → season phase → movement categories → appropriate units. ASCEND's primary key is the *lift*. Everything downstream (standards, PRs, readiness, tonnage, titles like TITAN/IMMORTAL) is computed in lift-space. You can't bolt "sprinter" onto that; it needs a parallel track (pun intended).

---

## 7. Rating out of 10

**3 / 10 — for Kavya specifically.**

It's probably a 7–8/10 bodybuilding/powerlifting app: the RPE progression, readiness math, strength standards, and honest set-tracking are genuinely well built. But the question was whether it understands *athletic training*, and the answer is no:

- 0 of 5 goals express performance (−2)
- 0 Olympic lifts, 0 plyometrics, 0 sprint drills in 108 exercises (−2)
- Sprint work is unrepresentable in the data model (no time/distance fields) (−1)
- Readiness is tonnage-blind to sprint load — actively mis-coaches (−1)
- Two silent misclassifications (Chest cleans, row-standard ranks) (−1)

The remaining 3 points are for the solid lifting engine underneath and the custom-exercise escape hatch. If the team wants athletes, the fix isn't a new goal card — it's a sport field on the profile, a time/distance-capable set model, a plyo/Oly movement library, and readiness that counts CNS load. Until then: bodybuilding app, costume confirmed.
