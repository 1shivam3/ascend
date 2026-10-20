# Persona Review — Arjun, 45, returning after a disc injury

**Persona:** 45, cleared by his physio with two instructions — *"avoid spinal loading, go slow."* Cautious, experienced enough to know what a hinge pattern is, does not trust apps that push intensity. His one non-negotiable: the app must let him exclude/replace exercises that hurt, and it must remember.

**Method:** Read-only code analysis of `feat/overnight-build`, tracing his simulated week through `Onboarding.tsx`, `workout-engine.ts`, `workout-schedule.ts`, `WorkoutPage.tsx`, `ActiveWorkoutScreen.tsx`, `coach-engine.ts`, `training-decision-policy.ts`, `store.ts`, `ai-coach.ts`, and `ai-context.ts`. Every failure below is verified in code with file + line.

---

## 1. First impression (30 seconds in)

Clean, calm, premium. Splash → welcome → account/guest. It feels like a serious training app, not a toy, and the three-step setup (Goals → Experience → Details) is fast and unintimidating. For about thirty seconds Arjun thinks: *"Good. This looks like it's made by people who lift."*

Then he starts looking for the question every return-from-injury user looks for — **"Any injuries or limitations?"** — and it isn't there. Not in step 1, not in step 2, not in step 3. He finishes onboarding having told the app his goal, his experience, his name, gender, age, weight, height, and diet preference — everything except the one fact that determines whether this app is safe for him.

That absence colours everything after it.

## 2. What worked for him specifically

Credit where it's due — several things are genuinely aligned with a cautious returner:

- **The plan is offered, not imposed.** Onboarding ends on a plan-offer screen ("Want your training plan?… or skip and build your own") — `Onboarding.tsx` `plan_offer` screen, `handleAcceptPlans`/`handleDeclinePlans`. Nothing is silently auto-added. Arjun likes being asked.
- **First-exposure loads are bodyweight-scaled for beginners.** `scaleSplitTemplatesForAthlete` (`src/lib/workout-engine.ts:1625`, factor at `:1597-1615`) scales template loads to his bodyweight vs an 85 kg reference, with an extra 0.6× factor for beginners. If Arjun honestly picks "beginner," his first Romanian Deadlift is ~42 kg, not the template's raw 70 kg. The intent — "first exposures are safe rather than intimidating" — is exactly his physio's "go slow."
- **Mid-session escape hatches exist.** In `ActiveWorkoutScreen.tsx` he can skip a set that feels wrong (`handleSkipSet`, `:1100`), remove an exercise entirely mid-session (`handleRemoveExercise`, `:488`, with a confirmation dialog if sets are already logged, `:3283`), and add a different exercise from the library instead (`:1821`). Skipping does not break the session or fabricate completion — History records only what was performed or explicitly skipped (`:1644`). He is never trapped inside a workout.
- **The coach's tone is conservative *when it has data*.** `adjustNextTargets` (`src/lib/coach-engine.ts:347+`) caps any single adjustment at 7.5%, backs off 5% on a grinder with missed reps, and its safety rule is well written: if pain is flagged, it holds the load and says *"Train around it, not through it; if it lingers past a week, get it checked"* (`coach-engine.ts:385-390`). The decision policy underneath (`src/lib/training-decision-policy.ts:794-805`, rule SAFETY-01) locks progression *unconditionally* on a pain report and preempts every progression branch. The safety engineering is real.
- **The knowledge to help him exists in the codebase.** The substitution table (`workout-engine.ts:1150-1160`) maps Romanian Deadlift → Seated Leg Curl and Deadlift → Trap Bar Deadlift ("lower lumbar strain"); Barbell Row → Chest Supported Row is annotated *"Zero lower back fatigue."* The app *knows* what a back-safe swap looks like. (See §3 for why he never sees it.)

## 3. What confused or frustrated him (specific, cite screens/flows)

### Day 1 — Onboarding: there is no way to say "I have a bad back"

The onboarding flow is Goals → Experience → Personal Details (`Onboarding.tsx`, screens `goals`/`experience`/`details`). No screen asks about injuries, limitations, or exercises to avoid. This is not an oversight in copy — it's structural:

- The data model has the fields: `TrainingProfile.dislikedExercises` and `injuriesOrLimitations` (`src/lib/types.ts:484-485`).
- Onboarding hardcodes both to empty and never collects them: `dislikedExercises: [], injuriesOrLimitations: []` (`src/components/Onboarding.tsx:309-310`).
- **No screen in the entire app ever writes them.** A search of `src/components/` finds the fields only at that hardcoded `[]`. Profile, Settings, Edit Profile — nothing. The fields are write-never, read-once: `src/lib/ai-context.ts:36-40` dutifully forwards them to the AI coach prompt ("DISLIKED/EXCLUDED EXERCISES: …", "LIMITATIONS/INJURIES: …") — a prompt section that is permanently empty for every user who ever uses this app.

So Arjun's answer to "how do I tell it *no deadlifts, no barbell squats*?" is: **you can't.** Not at signup, not later, not anywhere.

### Day 1 — The plan he accepts contains exactly what his physio banned

Plan generation never consults exclusions even in principle: `grep` for `disliked|excluded|exclusion` in `src/lib/workout-engine.ts` returns **zero hits**. And every single goal template contains spinal loading:

- General Fitness (his most likely pick, and the default if he skips the goal step) — Lower A: **Squat 85 kg + Romanian Deadlift 70 kg** (`workout-engine.ts:1862-1865`); Lower B: **Deadlift 105 kg + Front Squat** (`:1889-1891`).
- The same pattern holds for *every* goal: `get_stronger` (RDL `:1685`, Deadlift `:1711`), `lose_fat` (`:1744`, `:1770`), `stamina` (RDL `:1805`), `build_muscle` (`:1923`, `:1949`). The alternative full-body path is no better — Deadlift 3×5 @ 110 kg and RDL @ 75 kg in `src/lib/workout-schedule.ts:185,199`.

Beginner scaling softens the *weight* (RDL → ~42 kg, Deadlift → ~63 kg for an 85 kg beginner) but not the *movement*: his physio didn't say "deadlift lighter," he said "avoid spinal loading." Worse, if Arjun picks "intermediate" — he has lifted before; it's the honest answer for him — the 0.6 beginner factor disappears and week 1 prescribes the full 70 kg RDL / 105 kg deadlift. Age, which onboarding *does* collect, plays no role in template scaling (`TemplateAthleteContext`, `workout-engine.ts:1585-1588`, contains only bodyweight + experience). Also note: he can't even choose a gentler schedule at setup — `daysPerWeek` defaults to 4 (`Onboarding.tsx:52`) and no onboarding screen ever calls `setDaysPerWeek`; everyone gets the 4-day upper/lower split.

And the plan-offer screen only shows plan *names* ("Upper A, Lower A, Upper B, Lower B"), not the exercises inside them. Arjun accepts blind. He discovers the deadlifts when he opens Lower A on training day.

### Days 2–4 — The RDL twinges his back, and the swap feature is dead code

Lower A, set 2 of Romanian Deadlifts: twinge. Arjun wants to swap it for a leg curl *right now*, the way any sane app allows. What he finds:

- **There is no swap in the live workout at all.** `ActiveWorkoutScreen.tsx` imports `getQuickSubstitutes` (`:43`) and never calls it — the only reference in the file is the import. His live options are skip, remove, or manually add something else and guess the sets/reps/weight himself.
- **The swap features that do exist are unreachable.** `WorkoutPage.tsx` has two substitution flows, both fully implemented and both impossible to open:
  - Quick substitute: `handleQuickSubstitute` (`:909`) is gated on `quickSubstituteIndex`, but `setQuickSubstituteIndex` is only ever called with `null` (`:922`). No button ever sets it.
  - AI substitution: `ExerciseSubstitutionModal` is rendered at `WorkoutPage.tsx:2746`, gated on `substitutionExerciseIndex !== null` — and `setSubstitutionExerciseIndex` is likewise only ever called with `null` (`:1008`, `:2748`). This modal is the single most Arjun-shaped UI in the app: *"Why do you need to replace it?"* with a **"Hurts / joint discomfort"** option (`src/components/ExerciseSubstitutionModal.tsx`, `REASON_OPTIONS`), backed by `fetchExerciseSubstitution` and the spinal-loading-aware logic in `src/lib/ai-coach.ts` (e.g. `:304`, `:392`). It is finished, it is correct, and **no user can ever open it.**

So Arjun does the only thing available: he deletes the RDL from the session and finishes on leg press and curls.

### The app forgets by tomorrow

Removing an exercise mid-session writes nothing back — not to the plan, not to an exclusion list (there is no writable one). Next Lower A, the plan serves him Romanian Deadlifts again, at target, as if nothing happened. His only durable fix is manual surgery in the plan editor (Train → Edit Plan: the `PlanModal` remove button, `WorkoutPage.tsx:153`, plus typing/picking replacements himself, `:158-181`) — unassisted, with zero guidance about which replacements are back-safe, on four separate plans, for squats, RDLs, deadlifts, and front squats. That's not a safety feature; that's homework assigned to the injured person.

### Day 6 — He tries to report the pain. There is no button for that either

Arjun looks for the "this hurt" signal — in the workout, after it, anywhere. **The word "pain" does not appear in a single component file in the app** (`grep -ri "pain" src/components/` → zero hits). There is no pain flag, no "how did your back feel?", no post-session body check-in.

This is the cruelest finding, because the engine behind it is excellent and entirely unreachable:

- `training-decision-policy.ts:794-805` — SAFETY-01 locks progression unconditionally if `athleteFlags.reportsPain` is set.
- `coach-engine.ts:378-390` — holds the target and counsels training around it.
- `coach-engine.ts:855-857` — the weekly review counts pain-flagged sessions: *"train around it, not through it."*
- `store.ts:879-886, 927-950` — reads the flags off saved workouts and feeds them to the policy.

But **nothing in the codebase ever writes `reportsPain: true`** (verified: zero write sites). The store even documents the deliberate decision *not* to infer pain from free-text notes (`store.ts:879-880`), so if Arjun types "back hurt today" into a note, the app intentionally ignores it. The safety system is a locked room and the app never issued anyone a key.

The only feedback channel he actually has is effort: an easy/good/hard rating per exercise (`ActiveWorkoutScreen.tsx:1283-1299`) and per-set RPE. If he rates the RDL "hard" with missed reps, the coach backs it off 5% (`coach-engine.ts:391-396`) — and prescribes it again next week, slightly lighter. Rate it "good" and it progresses +2.5% (`:409+`). Either way, the app will coach a disc patient up a Romanian Deadlift progression forever, politely, 2.5% at a time.

The AI daily-plan path is no safer: `generateDeterministicDailyPlan` (`src/lib/ai-coach.ts:262+`) prescribes Barbell Back Squat and Romanian Deadlift derived from PRs/bodyweight and never reads injuries or dislikes (zero references in the file) — while its own copy brags that leg press is *"Safe machine volume without axial spinal loading"* (`:304`). The knowledge exists as marketing text, not as logic.

## 4. Would he keep using it after week 1? Why/why not

**No — not as his training coach.** He might keep it as a dumb logbook for a week or two out of inertia, but the relationship is broken.

His reasoning, in his words: *"I told it nothing about my back because it never asked. It gave me deadlifts anyway. When one hurt, it gave me no way to say so, forgot I'd removed it, and put it back on the menu. An app that can't remember the one thing I need it to remember is not a coach — it's a spreadsheet with opinions about my spine."*

What would have kept him: the bones are good. The logging is honest, the coach's *tone* is conservative, the plan-offer consent screen shows the product respects his choices, and the safety policy (SAFETY-01) is exactly the behaviour he wants. He is not asking for much: one question at onboarding, one "this hurts" button, one memory. All three were clearly *designed for* — the types, the policy, the modal all exist — and none were finished. For a healthy 25-year-old that's a missing feature. For Arjun it's the whole product.

## 5. What would make him delete it (trust is the issue here)

Any one of these ends it, and his week contained all three:

1. **Prescribing the banned movement after he'd removed it once.** The second time Lower B opens with Deadlift at the top, he doesn't think "bug" — he thinks "this app does not listen to me." One ignored signal is a flaw; a repeated ignored signal about his *spine* is a verdict.
2. **Silence where a question should be.** An app that asks his diet preference but not about injuries has told him its priorities. He collected the data point that matters least to his safety and skipped the one that matters most.
3. **Progression pressure on a hinge lift.** If he ever sees a "+2.5% — you've got room!" push notification on Romanian Deadlifts (the exact output of `coach-engine.ts:409+` when he rates it "good"), he deletes the app mid-set. His physio's voice in his head is "go slow"; the app's voice must never be louder than that.

The unforgivable version: he tweaks his back properly on a prescribed deadlift in week 3, having done everything the app allowed him to do. At that point it's not churn, it's a one-star review that starts with "this app injured me."

## 6. What competitors do better for injury-aware training

- **Fitbod — persistent exercise exclusion.** Fitbod lets you exclude any exercise ("don't recommend again") and swap any exercise in a generated workout for a same-muscle-group alternative, and it *remembers both across every future generated workout*. That single loop — exclude once, never see it again — is Arjun's entire requirement, and it's Fitbod's baseline, not a premium tier. ASCEND has the exclusion *fields* and the substitution *table*; Fitbod has the button.
- **JuggernautAI — readiness check-ins that include the body.** Juggernaut's pre-session readiness questionnaire asks about soreness and pain per muscle group and autoregulates the day's loads *down* in response, and exercise substitution is a first-class part of the programming flow. The check-in is the key design idea ASCEND is missing: it doesn't wait for the user to find a flag — it asks, every session, before load is prescribed. ASCEND's policy engine would handle Juggernaut-style answers beautifully (SAFETY-01); it just never gets asked the question.
- **Even the manual loggers (Strong, Hevy) win on memory.** They don't pretend to coach, but a routine you edit stays edited, and swapping an exercise in a template is two taps. ASCEND's plan editor matches this — but ASCEND *also* presents itself as a coach with generated plans, so it gets judged by the coaching standard, where generation without memory is worse than no generation at all.

The gap is not intelligence. ASCEND's substitution data (`workout-engine.ts:1150+`), its AI substitution modal, and its safety policy are each arguably better-built than the competitors' equivalents. The gap is that competitors connected theirs to the user.

## 7. Rating out of 10

## 3 / 10 — for Arjun

Not because the app is bad — as a logger with a conservative RPE coach, for a healthy lifter, it's a 6–7. For *this* user it's a 3, because his evaluation has one axis and the app fails it at every step of his week:

| Arjun's need | Verdict |
|---|---|
| Declare his injury at onboarding | ❌ Never asked; fields hardcoded `[]` (`Onboarding.tsx:309-310`) |
| Keep deadlifts/squats out of his plan | ❌ Generation ignores exclusions entirely; every template has both |
| Swap a hurting exercise mid-workout | ❌ Both swap UIs are dead code (no reachable trigger); live screen has none |
| Have the swap/removal remembered | ❌ Session-only; plan re-prescribes it next week |
| Report pain so the coach backs off | ❌ No UI writes `reportsPain`; the excellent SAFETY-01 rule is unreachable |

**The one-line fix list that would flip this review:** ask about injuries/limitations in onboarding and write them to the fields that already exist; filter generated templates against them (`workout-engine.ts` — one filter); wire the two orphaned state setters to actual buttons so the substitution modal and quick-swap can open; and add one "this caused pain" toggle per exercise that writes the flag the policy engine is already waiting for. Four changes, mostly plumbing — and Arjun goes from deleting the app in week 1 to being exactly the loyal, cautious, long-term user it was secretly built for.
