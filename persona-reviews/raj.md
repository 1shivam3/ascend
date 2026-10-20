# Raj's Week with ASCEND — Persona Review

**Persona:** Raj, 52. Doctor said: "Do some resistance training twice a week." Not tech-savvy, gets overwhelmed by complex apps, wants the app to simply tell him what to do. Son helps with setup.

**Method:** Code review of branch `feat/overnight-build`, simulating his week against the real onboarding → plan generation → workout → progress code paths.

---

## 1. First impression (30 seconds in)

Raj opens the app and sees a splash screen, then a welcome screen, then — before he has answered a single question about his health — he's being asked to **create an account**. His son taps "Continue as Guest" for him (the only path that avoids this), and Raj lands on a goals screen with a big friendly question: "What are your goals?" One option reads **"General Fitness — Longevity & balanced training"** (`FitnessGoalsScreen.tsx:44-48`). That is exactly his doctor's language. His first impression is: *"This might actually be for me."*

That goodwill survives about ten more minutes. Then the app starts speaking a different language than his doctor did — and it never entirely comes back.

Credit where due: the onboarding screens themselves are well built for him. Three steps total, one question per screen, huge type (`text-4xl` headers), big tappable cards, single-tap selection on the experience screen (`ExperienceLevelScreen.tsx`), and a skip on the goals step that defaults to General Fitness (`Onboarding.tsx:552-556`). If the whole app were like these three screens, Raj would be fine. It isn't.

---

## 2. What worked for him specifically

- **Onboarding is genuinely simple.** Three steps (goals → experience → personal details), no days-per-week slider maze, no equipment picker, no "build your split" screen. The Personal Details form is five fields with big numbers (`PersonalDetailsScreen.tsx`). His son can finish it in two minutes.
- **A plan is offered, never forced.** The plan-offer screen asks "Want your training plan?" with a plain Yes / "No thanks, I'll build my own" (`Onboarding.tsx:577-612`). For Raj that's meaningless choice — building his own is not a thing he can do — but at least nothing is silently dumped on him.
- **Beginner mode in the workout is the best thing in the app for him.** Because he picked "Beginner," the workout screen shows **one set at a time** with giant +/− steppers for weight and reps, set pills (1-2-3) across the top, and one big red "Complete Set" button (`ActiveWorkoutScreen.tsx:2161` beginner branch; steppers at ~2420-2455). The rest timer auto-starts when he completes a set. He never has to understand the spreadsheet-style multi-set table that advanced users get.
- **The effort question is asked in plain words.** After each exercise he gets three big buttons: **Easy** ("Could do more"), **Target** ("Just right"), **Hard** ("Near limit") (`ActiveWorkoutScreen.tsx:2236-2283`). No quiz on sports science. This is the model the whole app should follow.
- **The coach's written language is mostly human.** The post-session take and weekly review in `coach-engine.ts` are written in plain English with an explicit tone rule in the file header: *"plain English, no unexplained jargon, no shame or guilt language"* (`coach-engine.ts:14`). His first session produces something like: *"Solid work on Bench Press — not every session needs fireworks, and consistent, repeatable quality is what builds the base… Next time on Bench Press, aim to add one clean rep to your top set before touching the weight."* That is a tone a 52-year-old can live with.
- **The weights are not reckless.** First-session loads are scaled down for beginners (0.6× factor, capped at the template default — `workout-engine.ts:1598-1623`). At a typical 75 kg bodyweight, Raj's Bench Press comes out around 32.5–35 kg for 3×8, his Squat around 45 kg. Still ambitious for a man who has never lifted (see below), but the app is not handing a 52-year-old novice a 100 kg squat, and adjustments are capped at ±5% per week (`coach-engine.ts:349ff`).

---

## 3. What confused or frustrated him

### REAL BUG #1 — The app never asks how many days he can train, and silently gives him four

Raj's doctor said **twice a week**. Nothing in onboarding asks about training days. `daysPerWeek` is hardcoded to `4` in component state and is never set by any screen:

- `Onboarding.tsx:52` — `const [daysPerWeek, setDaysPerWeek] = useState<number>(4);` (`setDaysPerWeek` is never called anywhere in the onboarding components — verified by search.)
- `Onboarding.tsx:283-302` — because 4 ≠ 2/3/5/6, he falls into the `else` branch and gets the **upper/lower 4-plan split**: Upper A, Lower A, Upper B, Lower B.
- `Onboarding.tsx:320` — `buildDefaultWeeklySchedule(generatedSplit, 4)` schedules four training days.

Consequences Raj actually sees:

- The plan-offer screen says *"I put together 4 workouts (Upper A, Lower A, Upper B, Lower B)"* — his doctor said 2. He doesn't know whether to trust the app or the doctor.
- On Day 7 his home screen reads **"This week: 2 / 4 workouts"** (`HomePage.tsx:560-566`, target from `weeklyStats` at :324-351). He did exactly what the doctor ordered and the app scores it as **50% — a half-finished week**. Every week. Forever, unless someone finds the schedule settings for him.

A 2-day full-body plan exists in the codebase (`generateSplitWeeklySchedule('full_body', …)` is used when `daysPerWeek <= 3`, `Onboarding.tsx:289-291`) — Raj just can never reach it. This is the single worst failure in his week: the one number that defines his entire prescription is never asked.

### REAL BUG #2 — He is prescribed 3 sets of 8 pull-ups. He cannot do one pull-up.

The general-fitness template's Upper B includes:

```ts
{ name: 'Pull-ups', targetSets: 3, targetReps: 8, targetWeight: 0, … }
```
(`workout-engine.ts`, general_fitness → Upper B, ~line 1885 in file order.)

The beginner load-scaling can't save him here: `scaleTemplateWeightForAthlete` returns weight `<= 0` unchanged (`workout-engine.ts:1606-1612`), and there is no rep scaling and no regression (no "do Lat Pulldown instead," no band-assisted option, no partial range). On Day 6, Raj stands under a bar, fails the first rep, and has three bad options: skip the exercise and feel like a failure, log fake reps, or ask a stranger. For a man whose entire motivation is "the doctor told me to," being handed an exercise that is physically impossible for most sedentary 52-year-olds is a trust-destroying moment. (The same template also gives him **Bulgarian Split Squats** and a **barbell Deadlift at ~55 kg for 3×6** on Lower B — balance-demanding and technique-demanding choices for a first-week novice.)

### The workout screen assumes a gym education he doesn't have

- **Exercise names are pure gym dialect.** "BENCH PRESS." is displayed in huge type (`ActiveWorkoutScreen.tsx:2087`), but nothing on the main screen shows him *what a bench press is* or how to do it. The one thing that would teach him — form cues — is buried behind a **⋯ overflow menu → "Form execution cues"** (`ActiveWorkoutScreen.tsx:1775-1784`), in a menu that also contains "Plate helper," "Voice dictation," "Change routine / split," and "Why this target weight?" Raj does not explore overflow menus. He will never find it. There is no video, no picture, no "watch how" anywhere in the flow.
- **Warm-ups are a "generator" he has to go hunting for, written in neuroscience.** Warm-up sets are **not** added automatically. They live behind the same ⋯ menu → "Warm-up Sets Generator," and the generated sets are labelled **"Blood Flow (~50%)"**, **"Potentiation (~75%)"**, **"Neural Primer (~88%)"**, **"CNS Activation (~91%)"** (`ActiveWorkoutScreen.tsx:1409-1438`). For a 52-year-old with 52-year-old shoulders, warming up is the most safety-relevant part of the session — and the app treats it as an optional power-user feature described in words he cannot parse. He will lift cold.
- **His barbell math is on him.** The plan says 35 kg. The bar is 20 kg. Which plates go on each side? There is a plate helper — again, inside the ⋯ menu (`ActiveWorkoutScreen.tsx:1762-1772`). In the advanced table view a tiny plate summary renders under the weight input; in his beginner view, nothing. He will stand in the gym doing arithmetic, or quietly use the wrong weight.

### RPE: ignorable, but it stares at him all session

Raj does not know what RPE means, and to the app's credit he never *has* to: it's pre-filled at 8 on every set (`ActiveWorkoutScreen.tsx:159`, draft defaults `rpe: 8`) and completing a set never requires touching it. But it is visually present everywhere — an **"@8"** badge and an **"Effort (RPE) • Tap to adjust"** pill under every set (`ActiveWorkoutScreen.tsx:2450-2466`). Tapping it opens a picker explaining RPE 6–9.5 in terms of **RIR** — "4+ RIR," "2 RIR," "Fast bar speed" (`ActiveWorkoutScreen.tsx:3468-3473`) — i.e., the explanation of the jargon is itself jargon. Meanwhile the genuinely friendly version of the same question (Easy / Target / Hard) already exists post-exercise. The "@8" follows him around like a number he's supposed to understand and doesn't, which is exactly the feeling that makes older users put an app down.

### The home screen is a dashboard, not an instruction

Raj opens the app on Day 3 wanting one thing: *what do I do today?* He gets (`HomePage.tsx`):

1. A hero card — good: "Today's workout: UPPER A · 45 min · 9 exercises · Start Workout." (Though "Upper A" means nothing to him, and "Adaptive Split" in the corner, :434, means less.)
2. A metrics strip: **Readiness score** (a bare number like 82, :478), **Streak** with a flame and a snowflake freeze count (:494-512), **Level** with an **XP progress bar** — "1,240 XP · 260 to Level 5" (:517-543).
3. "This week: 2 / 4 workouts" over a photo card.
4. **Fuel**: "Calories 0 of 2,400 · Protein 0 g of 156 g" (:580-625), plus **Scan meal / Barcode / Weight** buttons.

That's roughly a dozen numbers and three tracking systems (readiness, XP/levels, macros) competing with the one button he needs. He never asked to count protein. Nobody told him why his "Readiness" is 82 or what he's supposed to do about it. The calorie counter showing **0** every single day — because he will never log a meal — reads as another quiet failure notice. The 4-tab bottom bar (Today / Train / Progress / Fuel, `src/app/page.tsx:33-38`) is fine; the density *within* Today is the problem.

### Day 7: his "progress" is a one-rep-max chart

On Sunday Raj taps **Progress** to see if he's doing well. The top card is **"Strength Progress — Bench Press — Current 1RM"** with a chart (`ProgressPage.tsx:822-905`). The app has taken his cautious 3×8 beginner sets, run them through an estimated-1RM formula, and is presenting a 52-year-old health trainee with his **one-rep maximum** — a concept from powerlifting he has never heard of, for a lift he will never (and should never) attempt. There is no scary "STRENGTH SCORE 312" anymore (verified: that string no longer exists in the codebase), but "Current 1RM: 47.5 kg" is the same species of number: precise-looking, meaningless to him, and faintly alarming — *is the app expecting me to lift that?* What Raj actually wants to see — "You trained twice this week, like the doctor said. Well done." — is technically present in the Consistency tab, where it is expressed as 2 of 4.

He also gets a **"WORKOUT COMPLETE"** summary after each session leading with **"VOLUME 4,230 kg"** and a three-box **"TRAINING ADAPTATION SUMMARY"** (`ActiveWorkoutScreen.tsx:3352-3411`) — total tonnage is a number with no referent in his life, and three paragraphs of adaptation notes are three paragraphs he will not read.

### Smaller frictions that add up

- **Plan names.** "Upper A / Lower B" is filing-cabinet language. "Tuesday's workout: arms and chest" would tell him something; "Upper A" tells him the app was built by people who already lift.
- **Goal subtitles leak jargon on the very first screen**: "Hypertrophy & progressive overload," "Calorie deficit, keep lean mass," "Heavy compounds & raw power" (`FitnessGoalsScreen.tsx:21-43`). His option is the only clean one. Fine for him — but it signals who the app thinks its user is.
- **No health/safety intake at all.** Onboarding asks name, age, weight, height, gender — and never asks about injuries, joint problems, blood pressure, or "has your doctor cleared you for this?" The training profile hardcodes `injuriesOrLimitations: []` and `equipment: 'full_gym'` (`Onboarding.tsx:303-314`). A 52-year-old beginner is the highest-risk user in the building, and the app asks him fewer safety questions than it asks about his protein target.
- **The assumed gym.** Every exercise in his plan needs a barbell, a rack, a leg press, a pull-up bar. If Raj's "gym" is his building's society gym with two dumbbells and a treadmill, his plan is unusable on day one and there is no "I train at home" path in onboarding.

---

## 4. Would he keep using it after week 1? Why/why not

**Probably not — and the deciding factor is the 2-vs-4 mismatch, not any single screen.**

What keeps him in the fight for the first week: the workout itself, once started, is followable. Big numbers, one set at a time, a rest timer that starts itself, a plain "how hard was that?" at the end of each exercise. On Days 3 and 6 he can genuinely complete a session by doing what the big red button says. The coach's tone doesn't scold him. That core loop is closer to "someone telling him what to do" than most apps get.

What pushes him out: every time he opens the app *outside* a workout, it grades him against a program he never agreed to. He did his two doctor-ordered sessions and the app says 2/4. His streak breaks on a schedule built for four days. His Progress page talks about his one-rep max. By Day 7 the accumulated message is *"you are behind"* — delivered to a man who is, by his doctor's standard, perfectly on track. People like Raj don't rage-quit apps; they quietly stop opening them, and feel vaguely guilty, which makes them avoid the icon entirely.

Verdict: **he survives week 1 on his son's setup help and the beginner workout screen, and is gone by week 3** unless someone reconfigures his schedule to 2 days — a fix that requires navigating settings he will never find on his own.

---

## 5. What would make him delete it

1. **The pull-up moment.** Standing under the bar on Day 6, unable to do rep 1 of 24 prescribed reps, in public, at 52. One humiliation like that outweighs a week of good design. (Verified: `workout-engine.ts`, general_fitness Upper B — Pull-ups 3×8, unscalable.)
2. **Being told he's failing a target he never set.** If a notification or the home screen frames his perfect 2-day week as a missed target / broken streak one time too many, the app becomes the thing that makes him feel bad about exercising. Delete.
3. **An injury scare with no warm-up.** If he tweaks a cold shoulder on a 35 kg bench press he was never told to warm up for — because warm-ups are hidden in a menu behind the word "Potentiation" — the app is blamed, correctly, and deleted.
4. **His son isn't there.** Any flow that dead-ends him — a modal he can't dismiss, the account/restore screen, an accidental tap into the advanced set-table view with its wall of inputs and "@" badges — and there's no one to rescue the session. He deletes rather than feel stupid twice.
5. **The Fuel tab.** If he ever opens it and is confronted with daily calorie/protein targets he never agreed to track ("0 of 2,400"), the app has visibly become a diet app — not what his doctor prescribed, not what he signed up for.

---

## 6. What competitors do better for older/simpler users

- **SilverSneakers GO** (built specifically for 65+ Medicare users): workouts are presented as **follow-along videos with a human instructor on screen**, large type throughout, and programs framed around mobility, balance, and daily function rather than loads and percentages. Raj doesn't have to know what an exercise *is* — he watches a person do it and copies. ASCEND has no visual demonstration of any exercise anywhere in the workout flow; for a true beginner, "BENCH PRESS." in 40pt type is a label, not an instruction.
- **Simple trainer-led apps (e.g., FitOn, Nike Training Club's beginner plans):** the session is a **guided timeline** — "do this now, for this long, like this" — with the next step always visible and nothing else on screen. ASCEND's beginner mode gets halfway there (one set at a time) but keeps the escape hatches, menus, badges, and metrics of a power-user app on the same screen.
- **Strong / Hevy (mainstream logging apps):** paradoxically simpler *at the point of logging* — a checklist of sets you tick off, with the previous session's numbers pre-filled and **plate calculators and exercise instructions with images one tap from the exercise itself**, not in an overflow menu. They also let a user (or his son) build a 2-day routine in minutes and then just repeat it — no adaptive engine silently re-deriving a 4-day split.
- **The category's real lesson for Raj's segment:** every successful older-user product asks **"how many days can you do?" and "any aches, pains, or conditions?"** during setup, offers **chair/low-impact and dumbbell-only variants**, and measures success as **"you showed up twice this week"** — attendance, not tonnage, 1RM, or XP. ASCEND asks neither setup question and measures everything except attendance against the right target.

---

## 7. Rating out of 10

**4 / 10 — for Raj specifically.**

The bones are better than the score suggests: a genuinely simple 3-step onboarding, a beginner workout mode with big controls and a self-starting rest timer, plain-language effort questions, a coach that writes like a person, and sane (if still ambitious) starting loads with conservative weekly adjustments. A 30-year-old beginner would rate this app far higher.

But for Raj, the app fails at the exact points his use case is defined by: it never asks the one question his doctor answered (twice a week) and instead silently enrolls him in a 4-day program, then grades his compliant week as 50%; it prescribes an exercise he physically cannot perform with no alternative; it hides the two things a 52-year-old novice most needs — *how to do the movement* and *how to warm up* — inside an overflow menu, the warm-ups labelled in neuroscience jargon; and it surrounds his one useful button with readiness scores, XP levels, calorie targets, and a one-rep-max chart. Simplicity is survival for Raj, and ASCEND is simple in the workout and complicated everywhere around it.

**The three fixes that would move this to a 7 for him:** (1) ask days-per-week in onboarding and honor it everywhere, including the weekly target; (2) never prescribe an unscaled bodyweight-max exercise (pull-ups) to a beginner — default to the machine/regression version; (3) put a "Watch / How to" and automatic warm-up sets on the exercise screen itself, in plain words. Until then, ASCEND is a good app for the person Raj's son might be — not for Raj.
