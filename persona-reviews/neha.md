# Neha's Review — Home-Only Trainer, Dumbbells + Bands + Mat

**Persona:** Neha, 28. Trains ONLY at home. Adjustable dumbbells, resistance bands, yoga mat. No gym access, no pull-up bar, no bench. Has tried gym-apps before and always been burned by barbell/machine assumptions.

**Repo audited:** `~/workspace/ascend`, branch `feat/overnight-build` (read-only audit, no code changed).

---

## 1. First impression (30 seconds in)

Thirty seconds in, I already knew this app was not built for me. Onboarding is: name → goals → experience level → personal details → "Want your training plan?" — at no point does it ask **where I train or what equipment I own**. There's no equipment screen at all. The screens are literally hardcoded in `src/components/Onboarding.tsx` as `splash | welcome | create_account | login | goals | experience | details | plan_offer` — no equipment step exists. The app decides on my behalf and never tells me what it decided.

What it decided, quietly, in `Onboarding.tsx` line ~302:

```ts
setTrainingProfile({
  ...
  equipment: 'full_gym',   // <-- hardcoded. Never asked. Never shown to me.
  ...
});
```

So before I've even finished onboarding, I'm locked to a `full_gym` profile. There's no "I train at home" option, no dumbbells checkbox, nothing. The single best moment of onboarding — the `plan_offer` screen that asks *before* adding plans instead of silently installing them — is wasted on me because the plans it offers are all gym plans.

## 2. What worked for her specifically

Not nothing. A few things show the team has at least *thought* about equipment reality:

- **The plan offer is consent-based.** The `plan_offer` screen ("Yes, add my plan / No thanks, I'll build my own") is the one place Neha isn't railroaded. She can decline the gym plan. Good — but declining leaves her with an empty app and a mountain of manual work.
- **The Exercise Library modal has a real equipment filter.** `src/components/ExerciseLibraryModal.tsx` lines 93–142, 200–210: equipment tabs for Dumbbell / Bodyweight / Barbell / Cable / Machine, plus `onSelectExercise` so filtered exercises can be added to a workout. This is the one genuinely usable home-training tool in the app.
- **The quick-substitution table sometimes lands.** `getQuickSubstitutes` in `src/lib/workout-engine.ts` does offer `Goblet Squat` for `Squat` and `Dumbbell Bench Press` for `Bench Press` — dumbbell paths exist at the swap level.
- **The constraint-adapter's equipment path handles load conversion honestly.** In `src/lib/lifter-twin.ts` lines 762–820, swapping barbell → dumbbell uses a ~35%-per-hand exploratory calibration weight instead of copying a 100 kg barbell load onto dumbbells. Whoever wrote that line understands home reality — it just isn't connected to anything that matters for her.
- **She can add custom exercises** by typing anything into the exercise selector (`ExerciseSelectorModal.tsx`, `handleAddCustom`). Her resistance-band moves could at least be logged by name — the app just knows nothing about them.

## 3. What confused or frustrated her (specific, cite screens/flows)

**Day 1 — Onboarding generates an impossible plan.** With the default 4 days/week, Onboarding calls `getGoalAdaptiveSplitTemplates(primaryGoal, unit, athlete)` (`src/lib/workout-engine.ts:1645`) — a function whose signature has **no equipment parameter at all**. Same for `generateSplitWeeklySchedule(splitType, userUnit)` in `src/lib/workout-schedule.ts:160`. The `equipment` field in `AITrainingProfile` (`src/lib/types.ts:482`) accepts `'home_dumbbells' | 'bodyweight_only'` — but the string `home_dumbbells` appears **nowhere else in the entire `src/` tree**. It's a dead type value. The only place `trainingProfile.equipment` is ever read is `src/lib/ai-context.ts:33`, where it's injected into an AI prompt string. No generator, filter, or template consults it. The constraint Neha cares about most is stored and then ignored.

What the default `build_muscle` template gives her — 18 exercises across Upper A / Lower A / Upper B / Lower B:

- **Flatly impossible at home (11):** Bench Press, Barbell Row, Overhead Press, Lat Pulldown, Squat, Romanian Deadlift (barbell), Leg Press, Incline Bench, Deadlift, Front Squat, Hamstring Curl — all barbell, machine, or cable.
- **Effectively impossible (1):** Pull-ups — she owns no pull-up bar, and the app never asks.
- **Usable (6, maybe):** Dumbbell Curl, Dumbbell Shoulder Press, Lateral Raise, Bulgarian Split Squat, plus ambiguous Calf Raise / Tricep Extension.

**~61–67% of her week-one plan is unusable on day one.** And the prescribed weights (Squat 95 kg, Deadlift 115 kg, Bench Press 70 kg) are gym numbers — she's training at home with adjustable dumbbells.

**Days 2–5 — fixing it is a grind.** Three swap paths exist and all are bad for her:

1. **Quick substitute is gym-mixed.** The `SUBSTITUTION_MAP` (`src/lib/workout-engine.ts:1110+`) suggests 2–3 swaps per exercise, but for **Deadlift all three substitutes are barbell** (`Romanian Deadlift`, `Trap Bar Deadlift`, `Barbell Row` — lines 1151–1153). Bench Press suggests Incline *Barbell* Bench and a *machine* Chest Press. And `WorkoutPage.tsx:687` has a `quickSubEquipmentFilter` state variable that is **declared and never wired to any UI** — a dead filter someone started and abandoned.
2. **AI substitution is one-at-a-time with a network call.** `ExerciseSubstitutionModal.tsx` offers "Equipment unavailable / busy" as the first reason, which is nice — but Neha would need to run this flow **11 times** to fix one week of plans, one modal round-trip per exercise.
3. **Rebuilding manually means fighting the exercise picker.** `ExerciseSelectorModal.tsx` filters by muscle only — the underlying `searchExercises()` function *supports* an equipment parameter (`src/lib/exercise-library.ts`), but the modal never passes it. So she scrolls a mixed list where 56 of 104 library exercises are gym-only, identified only by small grey text under each name.

**Her resistance bands don't exist.** The `EquipmentType` union in `src/lib/exercise-library.ts` is `'Barbell' | 'Dumbbell' | 'Cable' | 'Machine' | 'Bodyweight' | 'Smith Machine' | 'Cardio'` — there is **no Band/Resistance Band category**, and zero band exercises in the library. One of her three pieces of equipment is invisible to the app. Conditioning is similarly gym-centric: 4 of the 5 Cardio entries are gym machines (stationary bike, treadmill, rowing machine, stepmill); only Jump Rope is home-usable.

**She can never fix the root cause.** There is no equipment setting anywhere post-onboarding — grep across `EditProfileModal.tsx`, `ProfileView.tsx`, and `SettingsView.tsx` returns zero equipment matches. She can't declare "I train at home" *ever*, only fight individual exercises forever.

**Day 7 — the "coach" coaches a gym version of her.** Since her training profile says `full_gym` and nothing ever corrects it, the AI coach, suggested workouts, and progression targets all keep assuming barbells and machines. Every session is her manually deleting exercises the app thinks she has.

## 4. Would she keep using it after week 1? Why/why not

**No.** She tried the genre before — gym-apps that assume barbells and machines — and this is exactly that, wearing a smarter engine. The core issue isn't a missing feature; it's that the app's mental model of a "training profile" has equipment as a hardcoded afterthought while her entire training life *is* an equipment constraint. After a week of manually swapping 11 of 18 exercises, she'd conclude the app doesn't know who she is and stop opening it. The consent-based plan offer buys goodwill, but declining the plan just gives her an empty shell she has to hand-build with a muscle-only picker.

## 5. What would make her delete it

- The first generated plan with a barbell squat and a leg press on it — she deletes apps at this exact screen. This is where 90% of home trainers churn.
- Being told to do Pull-ups when she has nowhere to do them, with no "I don't have a bar" option.
- Discovering her resistance bands — a whole modality she owns — have zero exercises and aren't even a category.
- The moment she realizes there is **no setting anywhere** to say "I train at home," and that she will be swapping exercises one by one, forever.

## 6. What competitors do better for home training

- **Freeletics** asks about available equipment during onboarding and has bodyweight-first journeys; "no equipment" is a first-class training mode, not a dead enum value.
- **Nike Training Club** (free) lets you filter every program and workout by equipment — "no equipment / dumbbells / bands" — and has trainer-led home programs shot in living rooms, not gyms. It also has actual video form guidance, which ASCEND lacks entirely.
- **FitOn** is built home-first: equipment filters on every workout, plus live and on-demand classes designed for small spaces.
- Even **Fitbod** — a strength app, same genre — asks "what equipment do you have access to?" during setup and generates plans constrained to it.

The common thread: competitors treat equipment as a **plan-generation constraint set at onboarding and editable in settings**. ASCEND has the type field (`types.ts:482`), the library tags (`exercise-library.ts`), and the search filter (`searchExercises`) — all the plumbing exists. It's just never connected: no onboarding question, no settings UI, no generator that reads the field. This is a wiring gap, not an architecture gap, which makes it more frustrating than a genuine limitation.

## 7. Rating out of 10

**3/10.** One point for the consent-based plan offer, one for the equipment-filtered Exercise Library modal, one for the honest barbell→dumbbell load calibration in the constraint adapter. Everything else — onboarding, plan generation, substitutions, settings, the band-blind exercise library — assumes a gym. For a home-only trainer, ASCEND is a gym app with a home-user workaround, not a home-training app.

---

## Appendix: verified code citations

| Claim | File:line |
|---|---|
| Onboarding has no equipment screen | `src/components/Onboarding.tsx` — screen type union (splash/welcome/create_account/login/goals/experience/details/plan_offer) |
| Equipment hardcoded to full_gym | `src/components/Onboarding.tsx` ~line 302 (`equipment: 'full_gym'` in `setTrainingProfile`) |
| `home_dumbbells` is a dead type value (only occurrence) | `src/lib/types.ts:482` |
| `trainingProfile.equipment` only read for AI prompt, never for plan filtering | `src/lib/ai-context.ts:33` |
| Plan generators take no equipment parameter | `src/lib/workout-engine.ts:1645` (`getGoalAdaptiveSplitTemplates`), `src/lib/workout-schedule.ts:160` (`generateSplitWeeklySchedule`) |
| Default build_muscle template is 61–67% gym-only | `src/lib/workout-engine.ts` from `// Default: 'build_muscle'` (~line 1899) |
| Deadlift substitutes are all barbell | `src/lib/workout-engine.ts:1151–1153` (`SUBSTITUTION_MAP['deadlift']`) |
| Dead equipment filter state in quick-sub | `src/components/WorkoutPage.tsx:687` (`quickSubEquipmentFilter` declared, never rendered) |
| No Band equipment category; zero band exercises | `src/lib/exercise-library.ts` — `EquipmentType` union + 104-exercise inventory (Barbell 22, Dumbbell 24, Machine 16, Cable 16, Bodyweight 17, Smith 4, Cardio 5) |
| 4 of 5 Cardio exercises are gym machines | `src/lib/exercise-library.ts` conditioning section (bike, treadmill, rower, stepmill) |
| Exercise selector has no equipment filter despite `searchExercises` supporting one | `src/components/ExerciseSelectorModal.tsx` (muscle-only UI) vs `src/lib/exercise-library.ts` (`searchExercises(query, muscle, equipment)`) |
| Equipment constraint path exists but barbell→dumbbell swaps buried in generic swap tables | `src/lib/lifter-twin.ts:762–820` (`adaptWorkoutForConstraints`, `equipment` type); squat swaps still lead with machines at ~line 614+ |
| No equipment setting in Profile/EditProfile/Settings | grep over `src/components/EditProfileModal.tsx`, `ProfileView.tsx`, `SettingsView.tsx` → zero equipment matches |
| One genuinely usable home tool: equipment-filtered library modal | `src/components/ExerciseLibraryModal.tsx:93–142`, tabs at ~line 200–210, `onSelectExercise` wired in `WorkoutPage.tsx:2791` |
