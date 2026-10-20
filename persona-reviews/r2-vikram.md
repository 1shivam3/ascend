# R2 — Vikram, 35 — Busy professional, trains 3 days/week

**Branch:** `feat/overnight-build` · **Method:** read-only code trace, full simulated week (Mon/Wed/Fri, ~06:00, 45 min max). Round-1 claims re-verified against current code — several are now FIXED and are credited as such.

## First impression

Night-and-day better than round 1. Onboarding now runs Goals → Experience → **Schedule** → Details → Plan Offer. The Schedule screen (`src/components/onboarding/ScheduleScreen.tsx`, `DAY_OPTIONS = [2,3,4,5,6]`) asks the question that killed him in round 1 — "How many days can you train each week?" — and selecting 3 shows "Full-body sessions, Monday / Wednesday / Friday style." That is literally his life, named back to him. The plan-offer screen (fixed in commit `903e3c2`, `src/components/Onboarding.tsx` plan_offer branch) now previews each plan with exercise names and an estimated duration instead of asking for blind acceptance, and declining adds nothing.

## What worked

- **3-day path — round-1 killer FIXED.** `Onboarding.tsx` schedule screen `onContinue` now actually calls `setDaysPerWeek(days); setEquipmentChoice(equipment); setActivityChoice(activity)` (~L603–613). In `handleFinishCalibration`, `daysPerWeek <= 3` routes to `generateSplitWeeklySchedule('full_body')` (Mon/Wed/Fri A/B/C in `src/lib/workout-schedule.ts`), and — new since round 1 — **every** split path now passes through `scaleSplitTemplatesForAthlete(...)` + `adaptSplitForEquipment(...)` in `workout-engine.ts`. The round-1 secondary bug (3-day path skipping bodyweight calibration and getting raw 92.5 kg squat / 110 kg deadlift templates) is gone: loads scale by `bodyweightKg / 85`, beginners get an extra 0.6× first-exposure factor, and pull-ups are regressed for beginners.
- **Quick Log — now actually reachable.** Round 1's dead Home wiring is fixed: Home hero has "Already trained? Quick log a past session" (`src/components/HomePage.tsx`, `setIsLogPastModalOpen(true)`). `LogPastWorkoutModal.handleQuickLogPlan` logs a whole plan in ~3 taps (open → pick plan → Log as Complete), with Today/Yesterday chips plus a date picker for the work-trip Friday. This remains the best flow in the app for him.
- **Missed sessions — no guilt, by design.** `coach-engine.ts` header tone rules forbid shame language; `generateCheckIn` copy is "That happens — work, family, life." The forgiving streak (`src/lib/streak-freeze.ts`) silently consumes one freeze per week for a missed day — no modal, no fanfare. `detectMissedSessions` also no longer flags future sessions (`if (ds > todayStr) break`).
- **Coach digest is wired now.** Round 1's "dead coach engine" complaint is resolved for the check-in/nutrition path: `src/lib/use-coach-digest.ts` is consumed by HomePage and renders the missed-session card and calorie suggestions (with apply/dismiss + suppression window).

## Friction & bugs

### VIKRAM-1 (major) — Workout-reminder days are never synced to his actual schedule; default is the old 4-day split
`src/lib/types.ts` `DEFAULT_NOTIFICATION_PREFERENCES`: `workoutReminders.daysOfWeek: [1,2,4,5]` (Mon/Tue/Thu/Fri), `preferredTime: '17:30'`. Nothing in onboarding or the store ever writes the user's real training days into notification prefs — `store.ts` initialises prefs only from `localStorage['ascend_notification_prefs']` or the default, and the only writer of `daysOfWeek` is the manual day-chip row in `ReminderCenterModal.handleToggleDay`. Vikram enables reminders once, trusts them, and gets: **nudges on Tue/Thu (work days, no training), no nudge Wed/Fri (actual training days), and a 17:30 nudge for a 06:00 trainer.** For a man whose week *is* the product, reminders actively lying is worse than no reminders.

### VIKRAM-2 (major, trust) — Quick Log fabricates RPE 8 on every set
`LogPastWorkoutModal.tsx` `handleQuickLogPlan`: every generated set is `{ ..., rpe: 8, completed: true }`, and `durationMinutes: parseInt(durationMinutes) || 45`. The rest of the app is scrupulous about never fabricating RPE (it's the input the progression engine autoregulates on). A quick-logged Friday injects a full session of invented RPE-8 data into `workout-engine`/`coach-engine` RPE-trend maths — next week's loads are then "evidence-based" on data he never reported. Quick Log should record sets with **no RPE** (unknown), exactly as honest logging elsewhere does.

### VIKRAM-3 (major) — Session-length promise (~40 min) vs enforced reality (55–70 min)
The promise is a heuristic everywhere: HomePage `durationMinutes = Math.max(35, Math.min(65, exerciseCount * 8))` and the plan-offer preview `estMin = exercises.length * 8`. A 5-exercise Full Body day = "~40 min". The reality the app itself enforces: 18 sets, with auto rest timers from `ActiveWorkoutScreen.tsx` (`defaultRestDuration` — 180 s for compounds ≤6 reps, ~90 s compounds, 60 s accessories). Rest alone is ~35–45 min; the session lands at 55–70 min. He plans around 40, overruns into his work morning, and blames the app. Mitigation exists but is buried: the "Short on time" Constraint Adapter (`ConstraintAdapterModal`, opened from inside an already-started workout at `ActiveWorkoutScreen.tsx:1810`, backed by `workout-engine.compressWorkout` 30/45/60) — he must start the full session first, then discover it. There is no pre-session duration choice, and onboarding never asks: `setTrainingProfile({ preferredDurationMin: 45 })` is **hardcoded** in `Onboarding.tsx` for every user. His 45 happens to match; the app never learned it.

### VIKRAM-4 (minor) — Missed-session "reschedule" is copy, not a function
`generateCheckIn` (coach-engine.ts) asks "Want to shift it to another day this week?" — but the Home check-in card (`HomePage.tsx` coach check-in block) offers exactly one action: dismiss/snooze (X). There is no button that moves the session; actually moving it means Train tab → `WeeklyScheduleModal` manual editing. Also, `detectMissedSessions` matches by exact calendar date only: train Wednesday's plan on Thursday (the classic busy-week shift) and Wednesday is still flagged missed while Thursday's training doesn't clear it — he gets nagged for a session he did, one day late.

### Minor / verified non-issues
- Work-day nagging outside reminders: none found. Rest-day Home copy is neutral ("Recovery is training too"), check-ins are dismissible and snooze for the week, calorie suggestions suppress after apply/dismiss.
- Two-tap start and per-set celebration overlay from round 1 were not re-litigated here (out of this trace's scope); in-session adaptation (Constraint Adapter) partially offsets the time problem.

## Keep-or-delete verdict

**KEEP — conditionally.** Round 1's delete trigger (wrong plan, rest-day on a training day) is genuinely fixed, and Quick Log + no-guilt coaching fit his life. The conditions: fix reminder-day sync (VIKRAM-1) before he ever enables notifications, and stop promising 40 minutes (VIKRAM-3). If he hits both in week 1 — a Tuesday-evening "time to train!" buzz and a 65-minute "40-minute" session — the old verdict returns.

## Competitor gap

Fitbod asks days/week **and session length** at onboarding and trims before you start; Strong/Hevy get him logging in one tap with supersets. ASCEND now matches Fitbod on days, still not on duration-up-front or supersets (no superset concept in code). Its edge over all of them for Vikram: honest Quick Log + a coach that doesn't guilt him.

## Rating: 6.5/10
