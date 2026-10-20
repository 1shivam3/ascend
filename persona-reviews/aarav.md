# Aarav's Review — 22, never lifted, intimidated by gyms

**Persona:** Aarav, 22. Joined a budget gym, friend said ASCEND "tells you what to do." Knows nothing about sets, reps, RPE, or protein. Read-only code analysis on branch `feat/overnight-build`.

---

## 1. First impression (30 seconds in)

The splash screen is a dark gym photo with "ASCEND — Train. Fuel. Progress. Repeat." (`src/components/onboarding/SplashScreen.tsx`). It auto-advances. The welcome screen is clean: "Build a stronger you, one day at a time" + **Get Started** / "I already have an account" / a tiny underlined *Continue as Guest* (`src/components/onboarding/WelcomeScreen.tsx`).

**Problem #1:** I tap "Get Started" (obviously — who taps a whisper-sized "Continue as Guest"?) and land on a full account-creation form (name, email, password). There is **no guest escape on that screen** — zero matches for "guest"/"skip" in `src/components/onboarding/CreateAccountScreen.tsx`. So within 30 seconds the app is asking for my email before showing me a single rep. A friend told me this app "tells you what to do" — instead it wants my email. If the guest link weren't hiding on the previous screen, I'd have deleted it here.

**Problem #2 (goals screen, 60 seconds in):** The goal options read like a powerlifting forum: *"Hypertrophy & progressive overload"*, *"Calorie deficit, keep lean mass"*, *"Heavy compounds & raw power"* (`src/components/onboarding/FitnessGoalsScreen.tsx:24,30,36`). I know what "build muscle" and "lose fat" mean — the titles are fine — but the subtitles might as well be in another language. I have no idea what hypertrophy or progressive overload is, and nobody explains. I tap "Build Muscle" because it sounds like what I want, but I feel slightly stupid doing it.

**Problem #3:** Nobody asks how many days I can train, or what equipment my budget gym has. Equipment is **hardcoded** to `'full_gym'` (`src/components/Onboarding.tsx:307`) and `daysPerWeek` is initialized to 4 and **never shown in the UI** — `setDaysPerWeek` is referenced exactly once in the whole codebase, the declaration at `src/components/Onboarding.tsx:52`. The app silently commits me to a 4-day upper/lower split. I work a job; I realistically have 3 days. That was my one chance to set expectations and the app didn't ask.

**Problem #4 (plan offer screen):** The plan offer shows me only workout names — "Upper A", "Lower A", ... — with zero preview of what's inside, no estimated minutes per session, no exercise list (`src/components/Onboarding.tsx`, `plan_offer` screen ~lines 552–618). I'm asked to accept a program I can't see. I tap "Yes, add my plan" because that's the big orange button.

So: my first impression is that the app is beautiful but built for people who already go to the gym.

## 2. What worked for him specifically

- **Beginner mode's one-set-at-a-time view is genuinely excellent.** Big +/− steppers for weight and reps, set pills (Set 1 of 4), "Today's Target: 32.5 kg × 8 reps" in plain language, target RPE deliberately hidden for beginners (`src/components/ActiveWorkoutScreen.tsx:2161` onwards, `targetDisplay` at :843, RPE hidden unless `userMode === 'advanced'` at :2135). I never have to type "3 sets of 8-10 @ RPE 7" — the app decomposes it for me.
- **The post-exercise effort prompt speaks human:** "How hard was that exercise today?" → Easy / Target / Hard (`:2227-2275`). This is the only place RPE is translated into something I understand.
- **"Why this target weight?"** on first exposure says *"Estimated introductory target for Bench Press. Adjust freely with stepper buttons."* (`src/lib/workout-engine.ts`, first-exposure branch). Plain, honest, tells me what to do.
- **The rest timer auto-starts when I complete a set** and the full-screen "Set Complete!" view counts down in giant digits with a Pause button (`src/components/ActiveWorkoutScreen.tsx`, `handleCompleteActiveSet` → `startTimer`, transition view at :3530). I never had to figure out what a "90-second rest" means — it just runs.
- **Meal logging actually works for my life.** There's a natural-language input ("Describe foods and quantities to log meal", `src/components/MealsPage.tsx:2107`) backed by an AI parser that explicitly knows Indian food — the API prompt calibrates "1 Roti / Chapati (~40g): ~120 kcal" and "1 bowl Dal (~200g): ~230 kcal" (`src/app/api/ai/parse-meal/route.ts:55-56`). I typed "2 rotis and dal" in my head and it would just work. No macro knowledge needed. This is the single best beginner feature in the app.
- Weight labels include "(per dumbbell)" and plate math under barbells (`:2290-2301`, :2645). Small, but I genuinely wouldn't have known if 14 kg meant one dumbbell or both.
- The XP streak / level gamification gives me a reason to open it day 2 even though I don't understand the numbers.

## 3. What confused or frustrated him (specific, cite screens/flows)

### Day 1 — the workout itself is scary and unexplained

- **Day-1 targets are intimidating for someone who's never lifted.** The beginner first-exposure scaling is `(bodyweight/85) × 0.6` (`src/lib/workout-engine.ts:1597-1616`). For me at 65 kg picking Build Muscle: **4×8 Bench Press at 32.5 kg, 4×8 Barbell Back Squat at 42.5 kg, 3×8 Deadlift at 52.5 kg** (`buildGoalAdaptiveSplitTemplates`, `src/lib/workout-engine.ts:1899+`). A barbell squat at 42.5 kg on my first day ever, with no instruction on how to squat? I'd skip the legs. Also the **Overhead Press target comes out to 17.5 kg — below a standard 20 kg Olympic bar**, an un-loadable number the app confidently displays. And the scaling **only applies on the 4-day path**; the 3/5/6-day paths in `handleFinishCalibration` (`src/components/Onboarding.tsx:283-292`) call `generateSplitWeeklySchedule` with no bodyweight/experience context at all — so if I later reduce my days in settings, my next plan generation skips the beginner calibration entirely.
- **"Pull-ups: 3 × 8, bodyweight" is on my first Upper B workout** (`src/lib/workout-engine.ts` build_muscle template). I cannot do *one* pull-up. There's no regression (assisted pull-up, lat-pulldown swap), no "can't do this?" fallback. The exercise-substitution modal exists but is only reachable from the plan preview screen in `WorkoutPage.tsx:2746` — **not from inside the active workout**, where I'm actually stuck. I would stare at the pull-up bar and give up.
- **There are no exercise demo videos anywhere.** I grepped: zero references to video, YouTube, or demo in `ActiveWorkoutScreen.tsx`, `ExerciseLibraryModal.tsx`, or `exercise-library.ts`. What IS a Romanian Deadlift? What does "Barbell Bent-Over Row" look like? The form cues exist but are **buried in the "⋯" overflow menu** ("Workout Tools & Options" → "Form execution cues", `src/components/ActiveWorkoutScreen.tsx:1730-1783`). I would never find them. And when I do, the cues read: *"Retract scapulae and pin shoulder blades back and down into the bench"* and *"resist the eccentric on the return"* (`src/lib/exercise-library.ts`, `getExerciseFormCues`). **Scapulae. Eccentric. Lats.** More of the same forum language. Only the 7 conditioning exercises (cycling, jump rope, etc.) have human-written `howTo` steps; **every single strength exercise has `howTo` unset** in the library and falls back to this jargon (`src/lib/exercise-library.ts` — check any chest/back/legs entry vs. the conditioning block at lines 134-231).
- **The RPE picker is bilingual in a bad way.** The per-set effort picker header says "Rate of Perceived Exertion" and every option is annotated with RIR: "4+ RIR", "2-3 RIR", "Fast bar speed" (`src/components/ActiveWorkoutScreen.tsx:3468-3475`). I don't know what RIR is either. The friendly Easy/Target/Hard prompt exists only at the *end* of the exercise — meanwhile the stepper card always shows `@8` "Effort (RPE) • Tap to adjust" next to every set. Two competing languages for the same concept.

### Days 5-6 — meals and the home screen

- The home screen's metrics strip shows **Readiness 70, Streak 0, Level 1, 0 XP** (`src/components/HomePage.tsx:457-517`). For a new user, Readiness is a meaningless number: `calculateReadiness` returns a plain-English explanation in its `factors` array ("No recent training logged, so there is no fatigue to recover from. Start at a comfortable effort…", `src/lib/coach-engine.ts:496-503`) — **but nothing renders `factors` anywhere.** Zero grep hits in `src/components/`. The one plain-language explainer the coach generates is computed and thrown away. I'm left with "70 / Ready" and no way to learn what it means.
- Fuel shows "Protein 0g of 117g" (`macros.ts:1197` → 1.8g/kg for my 65 kg). Fine — but the app never tells me *why* protein matters or what it even is. The word "macros" appears everywhere in MealsPage with no explainer ("Macro Lens", macro goals). I'm logging roti fine, but the protein target is just a guilt number.

### Day 7 — progress

- The Progress page's strength view headlines **"Estimated 1RM"** with a chart (`src/components/ProgressPage.tsx:1016`). I don't know what a 1RM is, there's no explainer, and with 3 sessions logged the chart is a flat 3-dot line. "Last 5 Sessions" is fine. But nothing here answers my real question: *"Am I doing okay?"*
- The Coach's Take after workouts (`generateCoachTake`, `src/lib/coach-engine.ts:672`) is written for insiders: *"at a controlled RPE 8"*, *"aim to add one clean rep to your top set"*, *"your estimated max"*, *"that's the kind of workload that moves the needle."* For my first session it did manage "first session logged — this is the baseline everything gets measured against from here" — decent — but the generic fallback immediately throws RPE numbers and "top set" jargon at me. (Also: `const bodyweightKg = 75;` is **hardcoded** in `generateCoachTake` at line 678, so my push-up tonnage was computed as if I weigh 75 kg — a small but telling sign the "AI coach" isn't really calibrated to *me*.)

## 4. Would he keep using it after week 1? Why/why not

**Honestly: no — I'd stop after workout 2 or 3, though I'd feel bad about it.**

The beginner-mode set-tracking UI is excellent once a workout starts. The meal logging is excellent. But everything *around* the workout assumes I already belong in a gym: jargon-dense goals, a 4-day commitment I never agreed to, day-1 barbell targets I'd be embarrassed to fail at in front of people, a pull-up prescription I physically can't do with no alternative offered, and form guidance hidden behind a "⋯" menu written in Latin. Nike Training Club shows me a human doing the movement and counts down with them; ASCEND shows me "4 × 8 @ 32.5 kg" and a menu I can't find.

The emotional arc: download with hope → account wall → jargon goals → accept a plan I can't preview → walk into the gym, stare at the bench press, realize I don't know how to do a Romanian Deadlift, find no video, do half the sets, skip pull-ups, feel like I failed. That's the week. I'd keep the app installed for the meal logger, then delete it when a friend shows me something simpler.

## 5. What would make him delete it

1. **First gym session humiliation:** being prescribed 4×8 squats at 42.5 kg and 3×8 pull-ups with no form demo and no "can't do this? do that instead" path. This is the #1 deletion trigger.
2. **The account wall on "Get Started"** — if I'd hit this before the friend's endorsement, I'd already be gone.
3. **Cognitive overload:** Readiness 70, XP, streak freezes, macros, e1RM, RPE, RIR — none explained, all on day one. It feels like joining a club where everyone speaks a language I don't.
4. **The app never asked what I can actually do.** Three days, home dumbbells, can't do a pull-up — no question was asked, so every prescription feels slightly wrong for me.

## 6. What competitors do better for beginners

- **Nike Training Club:** every workout is *guided* — a trainer on video doing the movement with you, form cues spoken in plain English ("push through your heels"), countdowns, no numbers to interpret. ASCEND's biggest gap isn't data — it's that **there's no way to see what an exercise looks like**. Even a thumbnail + 10-second clip per exercise in the library would close 60% of this review's complaints.
- **Fitbod:** asks about available equipment, adapts sets to it, and — critically — has an "I can't do this" flow with exercise swaps right in the workout. ASCEND's substitution modal exists but isn't reachable from the active workout where it's needed.
- **Strong (the simple logger):** ruthlessly simple — exercises, sets, reps, go. ASCEND's beginner mode actually matches this well; the problem is everything *before* the first set: onboarding jargon, unseen plan acceptance, unasked availability.
- **RPE/RIR handling:** competitors for beginners hide RPE entirely (NTC doesn't mention it). ASCEND's hybrid — beginner mode hides target RPE in the card but shows `@8 Effort (RPE)` chips and an RIR-annotated picker — is the worst of both worlds.

## 7. Rating out of 10

**5/10.**

The execution engine (beginner-mode one-set flow, auto rest timer, AI meal parsing with Indian food knowledge, honest effort prompts) is an 8/10. The onboarding-to-first-workout journey for a true beginner is a 3/10. Average lands at 5 because the failures are all in the first 48 hours — exactly where a beginner churns. I don't need smarter coaching; I need the app to ask what I can do, show me how to do it, and never show me a word like "hypertrophy" without a translation.
