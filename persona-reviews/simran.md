# Simran's Week — Persona Review

**Persona:** Simran, 31, 7 months postpartum, cleared for exercise. Wants core rehab, walking, light strength. Sleep-deprived, 20-minute windows, zero tolerance for pressure or guilt.
**Reviewed:** `feat/overnight-build` branch, read-only code analysis (2026-10-20). All claims verified against source; file + line cited.

---

## 1. First impression (30 seconds in)

Onboarding is 3 steps: goals, experience, personal details. Simran picks **General Fitness** → **Beginner** → enters her name/age/weight/height/gender.

Two things land immediately:

- **Nothing in the app acknowledges she is returning, not starting.** The beginner card reads "Just getting started / Learning form & building consistency" (`src/components/onboarding/ExperienceLevelScreen.tsx:26`). She isn't "just getting started" — she had a body that could train before, and she grew a human 7 months ago. There is no "returning after time off," no "postpartum," no "easing back in" option anywhere in onboarding, goals, or the training profile. `injuriesOrLimitations: []` is hardcoded empty in `src/components/Onboarding.tsx:310` with no UI anywhere in the app to ever set it.
- **Onboarding never asks her three most important constraints:** how many days she can train (silent default: 4 — `src/components/Onboarding.tsx:52`, and `setDaysPerWeek` is never called anywhere in the file), how long a session can be (silent default: `preferredDurationMin: 45`, hardcoded at line 306), or what equipment she has (silent default: `equipment: 'full_gym'`, hardcoded at line 307). She's a sleep-deprived mom with a 7-month-old and 20-minute windows at home. The app silently assigns her **4 days/week, 45 minutes, full gym**.

The plan offer screen at the end ("Yes, add my plan / No thanks, I'll build my own") is genuinely respectful — plans are never auto-added. That's the best onboarding moment in the product.

## 2. What worked for her specifically

- **The missed-session messaging itself is warm and guilt-free.** This is the product's genuine strength. The tone rule at `src/lib/coach-engine.ts:16` — "no shame or guilt language" — shows in the copy:
  > "Quick check-in: Upper A (Monday) didn't get logged this week. That happens — work, family, life. A missed session changes nothing about your progress; quitting the week over it would. Want to shift it to another day this week? One moved session beats one skipped session every time."
  > — `generateCheckIn`, `src/lib/coach-engine.ts:1048-1051`
- **The streak system is deliberately anti-shame.** `src/lib/streak-freeze.ts` documents the philosophy explicitly: "Binary resets and streak shaming are the mechanics that make people quit." One missed day auto-consumes a freeze **silently** — "A freeze NEVER triggers a modal or fanfare. It saves silently — rewarding forgiveness with a popup would punish the miss by drawing attention to it." A day counts as active from ≥1 completed set OR 3 logged meals, so her chaotic days aren't zeroes.
- **Partial workouts are logged honestly, not shamed.** The finish modal shows an honest SETS count (e.g. 2/15) and set-completion percentage — no fabricated "WORKOUT COMPLETE" deception beyond the modal title. She can bail on a session when the baby wakes, and it saves what she did.
- **Fresh-start readiness:** with no history, readiness defaults to 70 / "Ready" with the copy "Start at a comfortable effort and let the first week set your baseline" (`src/lib/coach-engine.ts:497-503`). Beginner first-exposure loads are scaled to bodyweight × 0.6 — a 62 kg beginner is genuinely never prescribed an 85 kg lifter's loads (`src/lib/workout-engine.ts:1597-1616`).

## 3. What confused or frustrated her (specific, cite screens/flows)

### Day 1 — the prescribed plan is too aggressive for "easing back in"

As a Beginner on General Fitness at 4 days/week she gets the `general_fitness` upper/lower template (`src/lib/workout-engine.ts:1840+`):

- **Upper A: 5 exercises × 3 sets = 15 working sets**, including **Pull-ups 3×8** (`workout-engine.ts:1877`). There is no regression path — an app that puts 3 sets of 8 pull-ups in a postpartum beginner's very first generated plan has no concept of scaling difficulty, only scaling weight (bodyweight exercises have `targetWeight: 0`, so the 0.6 beginner factor doesn't touch them).
- **Lower A: Barbell Squat 3×8, Romanian Deadlift 3×8, Leg Press 3×10** with beginner-scaled loads of roughly 40/33/67 kg for a ~65–68 kg woman. Scaled, yes — but this is still 4 heavy compound lifts under a bar for someone whose explicit need is core rehab and gentle glutes.
- **Estimated duration floor is 35–40 min** (`src/components/HomePage.tsx:322`: `Math.max(35, Math.min(65, exerciseCount * 8 || 45))`). Her home hero will read something like "40 min · 5 exercises." She has 20. Nothing in the app lets her set a session length, so this mismatch is unfixable — the duration is hardcoded 45 min in her profile with no editing surface (neither EditProfileModal nor ProfileView expose days/duration/equipment).

### Days 2–4 — the miss, and what the app actually does with it

Here's the twist: the warm `generateCheckIn` message quoted above **is dead code on this branch**. `useCoachDigest` — the only hook that computes the check-in — is imported by **zero components** (verified by repo-wide grep). So when the baby is sick and she misses her session, Simran never sees the warm message. What she actually sees:

- A streak number on Home that stops growing (mitigated by the silent freeze).
- The "This week" card: **"1 / 4 workouts"** with last-7-day dots, where her missed days are grey dots. Not cruel, but it's a running visual deficit score — 4 is a target she never chose, and nothing tells her the 4 is changeable (it *is* changeable, via WeeklyScheduleModal, but nothing surfaces that).
- **Streak counts training only as workout-or-meals; her walks don't count.** A day counts as active only with ≥1 completed set or 3+ logged meals (`src/lib/streak-freeze.ts:35-48`). Her 30-minute stroller walk — her most consistent, most realistic exercise — counts for nothing in the streak unless she hand-logs it as a workout, and the exercise library has no "walk" exercise at all (only "Incline Treadmill Walk," a gym machine). For a postpartum mom whose main modality is walking, the streak system is blind to her actual exercise.

Additionally, if the check-in ever ships, note a real bug in it: `detectMissedSessions` (`src/lib/coach-engine.ts:921-942`) iterates the **entire Mon–Sun week range** with no filtering to past days — so a Wednesday session flagged later in the week could tell her on Monday morning that Thursday's session "didn't get logged." The function's docstring says it lists "planned sessions in the week range that have no logged workout" — past and future alike. Verify-before-ship issue.

### Day 5 — "something gentle, core and glutes": she can't build it

Simran goes to build her own gentle plan (the plan builder exists — "Create Workout Plan" in WorkoutPage). The exercise library defeats her:

- **Core (11 entries, `src/lib/exercise-library.ts:100-111`):** Hanging Leg Raise, Hanging Knee Raise, Captain's Chair Knee/Leg Raise, Kneeling Cable Crunch, Cable Woodchopper, Ab Wheel Rollout, Front Plank, Side Plank, Russian Twist, Decline Bench Crunch, Ab Crunch Machine. Of the eleven, only planks/side planks are plausibly safe for early postpartum return. **Crunches, Russian twists, hanging leg raises, ab wheel rollouts are exactly the intra-abdominal-pressure movements postpartum physiotherapy guidance says to manage or avoid with diastasis.** There is no Dead Bug, no Bird Dog, no Heel Slide, no Pelvic Tilt, no Glute Bridge, no pelvic-floor breathing — verified by search across the library. Zero entries match "bridge," "bird," "clamshell," "pelvic," "postpartum," "diastasis."
- **Glutes:** the closest option is **Barbell Hip Thrust, default 90 kg** (`exercise-library.ts:66`) — she'll find a 90 kg barbell hip thrust when she searches "glute." There is no bodyweight glute bridge.
- **Upper body return-friendliness:** no wall push-ups, no incline push-ups — just "Push-ups" (default 15 reps) and "Chest Dips."
- No walking entry, so she can't even log her walk as a named exercise.

The library is a barbell-gym catalog with a bodyweight corner. There is no return-to-training tier at all.

### Day 7 — the guilt audit

Things that would make her feel bad, ranked:

1. **Copy like** `generateCoachTake`'s fallback — "Session logged — even a quiet entry keeps the streak honest" (`src/lib/coach-engine.ts:674`) — and the plateau coach's "Log it even on the 'bad' days; missing data is what makes plateaus invisible" (`src/lib/coach-engine.ts:1274`). Neither is aggressive, but "keeps the streak honest" frames logging as a moral duty to the streak. Minor, but for a zero-guilt persona it's a ding.
2. The discard-workout modal: "Are you sure you want to **quit**? Unsaved sets from this workout session will be lost." (`src/components/ActiveWorkoutScreen.tsx:3308`). When the baby is crying, "quit" is the wrong verb; "Leave" or "End now, save progress" would cost nothing.
3. The finish modal is titled **"WORKOUT COMPLETE."** even when she did 2 of 15 sets. The stats inside are honest, but the banner isn't.
4. Push reminders: the workout reminder body is "Your scheduled workout is ready. Tap to view your exercise split." (`src/lib/notifications.ts:280-283`) — neutral, good. But reminders are day-of-week based on a schedule she never set (4 days defaulted), so she'll get training-day nudges on days she never chose to train. There is no "gentle" mode, no quiet-week handling, no "snooze, baby is sick" affordance.

## 4. Would she keep using it after week 1? Why/why not

**She would not.** The accountability layer is genuinely the warmest of any fitness app reviewed — if she ever saw it — but everything *upstream* of it fails her: onboarding never learns who she is (returning, postpartum, 20-minute windows, home, no barbell), the generated plan is a 4-day barbell program with pull-ups and 40-minute sessions, the exercise library has nothing rehab-safe, and her actual primary exercise (walking) is invisible to the streak. She would open the app on Day 1, see a 40-minute Upper A with pull-ups and a 40 kg squat, feel the app wasn't built for her, and never generate a second week's data. The warm check-in never renders, so the app's best quality never reaches her.

## 5. What would make her delete it (pressure/guilt is the killer here)

- A "3 / 4 workouts" week card with grey dots staring at her during the week the baby was sick, with no way to tell the app "I chose 2, not 4."
- Training-day push notifications on a schedule she never set (4 silent defaults).
- The word "quit" on the discard modal, on a day she already feels bad.
- "WORKOUT COMPLETE." after a 2-set session — unearned praise reads as the app not even noticing how little she did; honesty beats ceremony.
- Any future check-in bug where the app nags her about Thursday's session on Monday morning (the `detectMissedSessions` future-day issue).
- Being prescribed crunches and Russian twists while recovering from birth — if she follows the app and aggravates diastasis or her pelvic floor, that's not just deletion, that's a real safety failure. The disclaimer page has a generic medical disclaimer, but **nothing** in the app flow — no onboarding question, no "cleared for exercise?" gate, no physio referral — connects the two. (Note: `DISCLAIMER.md`-style safety language exists at `src/app/disclaimer/page.tsx:66`, but onboarding never links or references it.)

## 6. What competitors do better for postpartum/returning users

- **Mommastrong** (Ashley Nowe): entire product built around this persona — 15-minute "Daily Hustle" workouts, explicit "start where you are" programming, anti-perfectionist voice ("movement over perfection"). It assumes 15 minutes and a living room, not 45 and a gym. ASCEND assumes the opposite and offers no way to say otherwise.
- **Every Mother** (Leah Keller): clinical, stage-based postpartum program — pelvic floor and diastasis recti rehab *before* general strength, with exercises ASCEND's library literally doesn't contain (dead bugs, bridges, transverse-abdominis activation). This is the content gap, not just a tone gap.
- **What both do that ASCEND doesn't:** a return-path entry point (not "Beginner"), session lengths matching caregiving reality, rehab movements in the library, and walking counted as real exercise. ASCEND's answer to "ease back in" is "you're a beginner now" — which is the wrong label for a woman who already knows how to train and needs *less*, not *basics*.

## 7. Rating out of 10

**4/10.**

The 4 is earned honestly: the anti-guilt streak design (silent freeze, no fanfare), the genuinely warm missed-session copy in the engine, honest partial-workout logging, plans-never-auto-added, and a default readiness of 70/"start at a comfortable effort." This is a team that *thinks* about not shaming people.

The rest is missing: her best moment (the warm check-in) is dead code in the UI; the plan she gets is a 4-day barbell program with 8 pull-ups in it; the library contains movements a postpartum physio would veto and none of the rehab ones she'd need; onboarding silently hardcodes everything she most needed to set (4 days, 45 min, full gym, zero limitations). ASCEND wants to not guilt her — and then builds every system around someone who isn't her.

**Fix list, highest leverage first:**
1. Surface the existing check-in in the UI (the copy is already written and good); fix `detectMissedSessions` to only flag past days before shipping it.
2. Add "Returning / easing back in" to onboarding + a 15–20 minute session-length choice; stop silently defaulting 4×/week, 45 min, full gym.
3. Add a return-to-training movement tier to the exercise library (dead bug, bird dog, glute bridge, heel slide, pelvic tilt, wall push-up, side-lying clamshell) — or pull these movements from templates so beginners aren't prescribed crunches/ab wheel.
4. Count walking (name it, log it) toward active days; a postpartum app that can't see a stroller walk is blind.
5. Change "quit" → "leave"; make the finish modal title honest for partial sessions ("Session saved" not "WORKOUT COMPLETE.").
