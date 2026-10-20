# R2 — Kabir, 38 — Night-shift worker (NEW)

**Branch:** `feat/overnight-build` · **Profile:** sleeps ~08:00–16:00, awake ~16:00–08:00, trains ~02:00 (after shift) or just before shift. **Method:** read-only trace of every date/time boundary in the app.

## First impression

The app is built on a single unexamined assumption: **a day is a calendar day, and you are awake in the middle of it.** Kabir's lived day runs 16:00 → 08:00 and straddles midnight. Almost every system in ASCEND — streaks, habit matrix, weekly counts, readiness, water reminders, "morning" prompts — keys off local midnight, and none of them offer a "my day starts at…" setting (grep for any day-rollover/shift setting: none exists). He can bend the notification *times* further than expected (see What worked), but he cannot bend the calendar.

## What worked

- **Quiet hours CAN cover 08:00–16:00 — verified, not a bug.** `src/lib/notifications.ts` `isWithinQuietHours`: if `start <= end` it checks the plain interval; if `start > end` it wraps midnight. Setting start `08:00`, end `16:00` therefore suppresses everything across his whole sleep block, and the default (22:00–07:00) also proves the wrap path works. `ReminderCenterModal.tsx` exposes both bounds as free `<input type="time">` controls — no preset lock-in. Defaults are wrong for him (22:00–07:00 in `DEFAULT_NOTIFICATION_PREFERENCES`, `src/lib/types.ts`) but fully correctable in under a minute.
- **Meal and workout reminder times CAN be set to night hours — verified.** `ReminderCenterModal` uses free time inputs for breakfast/lunch/dinner and workout `preferredTime`; the server validator (`src/app/api/notifications/preferences/route.ts`, `TIME_REGEX = /^([01]?\d|2[0-3]):[0-5]\d$/`) accepts 00:00–23:59, and `evaluateDueReminders` in `notifications.ts` compares raw minutes — a workout reminder at `01:30` on his training days fires correctly. His "dinner" at 04:00 and "breakfast" at 16:30 work functionally (the labels are day-worker words, the mechanics are not).
- **The greeting is NOT broken at 3 AM — verified non-bug.** `src/lib/formatters.ts` `getTimeGreeting`: 05–12 morning, 12–17 afternoon, 17–22 evening, **22–05 "Good night,"**. Round-1-era "Good morning at midnight" behaviour is fixed; at 02:00 before training he is greeted correctly for the clock. (His 16:00 wake-up gets "Good afternoon" — accurate, if alienating. See KABIR-6.)

## Friction & bugs

### KABIR-1 (blocker for this persona) — Water reminders are hardcoded to 08:00–21:00; his awake night is a hydration dead zone
`src/lib/notifications.ts` `evaluateDueReminders`, water branch: `for (let h = 8; h <= 21; h++) { if ((h - 8) % interval === 0) ... }`. The window and its anchor are constants, not preferences — `waterReminders` exposes only `enabled` + `intervalHours` (1–3) in `types.ts`/`ReminderCenterModal`. Kabir is awake 16:00–08:00: he can receive water pushes only in the 16:00–21:00 sliver, and **never during his shift or his 02:00 training window** — exactly when a night worker under artificial light actually forgets to drink. There is no setting that moves this window. Combined with quiet hours (his own correct 08:00–16:00 setting also mutes the 08:00 slot), his effective water-reminder coverage is ~5 of 16 waking hours.

### KABIR-2 (major) — "Today" is local midnight everywhere; a 02:00 session belongs to a day he experiences as yesterday
`getLocalTodayStr` (`src/lib/formatters.ts`, duplicated in `store.ts` and as `toLocalDateString` in `habits.ts`) is `getFullYear/getMonth/getDate` — pure calendar date. `ActiveWorkoutScreen.tsx` stamps finished workouts `date: getLocalTodayStr()` (draft + save paths). Consequences, all traced:
- Train Mon 23:30 and Tue 01:30 (one wake period, one sleep between them is *after*): counted as **two consecutive training days** by the streak (`streak-freeze.ts` `calculateStreak` walks calendar dates), the habit matrix (two lit GYM cells), weekly counts, and readiness consecutive-days logic (`coach-engine.ts` `calculateReadiness` §c) — which may then tell him he's overtraining and needs a rest day.
- Train Tue 01:30 and Tue 23:00 (two sessions, one wake period apart… no — same calendar day): the second session is invisible to day-based systems; `detectMissedSessions` uses a `Set` of logged dates, streak/matrix see one day.
- A Sunday 23:30 / Monday 01:30 pair splits across the Mon–Sun week boundary (`getMondayOfWeek`, freeze refill in `refreshFreezeWeek`) — two halves of one shift-week land in different "weeks" for recap, consistency %, and freeze accounting.
There is no compensating mechanism: no day-start offset, no "log for shift date" except manually back-dating via Log Past Workout (which, credit due, does let him pick the date — the *only* escape hatch, and it fabricates RPE 8; see Vikram review VIKRAM-2).

### KABIR-3 (major) — Home screen freezes "today" at mount; crossing midnight mid-shift leaves the app on yesterday
`src/components/HomePage.tsx`: `const today = useMemo(() => new Date(), [])` and `todayStr`/`greeting`/`sessionInfo` all derive from it. Open the app at 23:50 on a break, train at 02:00 without force-closing (normal phone behaviour): Home still shows yesterday's plan, yesterday's greeting, yesterday's streak/water state until the component remounts. Same frozen-`useMemo([])` pattern in `WeeklyHabitMatrix.tsx`, `WorkoutPage.tsx`, `LogPastWorkoutModal.tsx`, `HydrationModal.tsx`. Every user can hit this; the night-shift user hits it **every single shift**, at the exact moment he opens the app to train.

### KABIR-4 (major) — Readiness knows nothing about his sleep; the sleep check-in that exists is dead code
`coach-engine.ts` `calculateReadiness(workouts, bodyMetrics, manualCheckin?)` supports a manual sleep/soreness/energy check-in (§d) — but **no caller passes it**: HomePage, `use-coach-digest.ts`, and `store.processCoachingAfterWorkout` all call it with two arguments, and no UI anywhere collects sleep. His readiness is therefore purely tonnage/RPE/calendar-day streaks — for a man whose recovery variable *is* sleep timing, the one input that matters was built and never wired. Readiness copy compounds it: rest-day hero subtitle "Recovery is training too — sleep well, eat well, come back stronger tomorrow" (`HomePage.tsx`) and "Scheduled Rest Day • Hydrate, sleep, and hit your protein target" (`workout-engine.ts` `getTodaySessionState`) assume sleep happens at night, "tomorrow" starts in the morning. At 02:00 pre-workout, "come back stronger tomorrow" is meaningless.

### KABIR-5 (minor) — Daytime-assumption prompts in the habit/AI layer
- `habits.ts` `getNextBestAction`: first priority is `LOG_WEIGHT` only when `nowHour < 12` — "Log Morning Weight / Track bodyweight under consistent morning conditions." For Kabir, 02:00–11:59 is *pre-sleep*, and his actual morning (16:00 wake, fasted) never triggers it. (Caveat: no component caller for `getNextBestAction` was found in this trace — treat as latent/dead until wired; UNVERIFIED as user-facing today.)
- `ai-coach.ts` `generateDailyInsight`: hydration fatigue warning requires `new Date().getHours() >= 16` ("Less than 800 ml logged late in the day") — 16:00 is his wake-up; his "late in the day" (05:00–07:00) can never trigger it.
- `store.ts` `DEFAULT_CREATINE_CONFIG.reminderTime: '08:00'` — the moment he falls asleep — and the creatine reminder time is never consumed by `notifications.ts` at all (no creatine type in `DueReminder`), so the setting is decorative for everyone.

### KABIR-6 (minor, feature-shaped) — Defaults all point at a day worker, and weekly report is day-locked
Default workout reminder days `[1,2,4,5]` @ 17:30, meal defaults 08:00/13:00/19:30, water window above, weekly report restricted to saturday/sunday/monday in both `ReminderCenterModal` and the server validator + `notifications.ts` `daysMap` — a worker whose "weekend" is Wed/Thu cannot even pick his rest-day for the recap. Nothing labels any of this as adjustable-for-shift-work; he has to discover each knob himself.

### Note on delivery (all personas, sharpest for Kabir)
There is **no client-side fallback scheduler in this branch** — reminders exist only via server push (`/api/notifications/dispatch` → `evaluateDueReminders`), and dispatch **skips guest subscriptions and any user without persisted server prefs** (`if (!sub.user_id) skipped++`). A guest-mode night worker gets zero reminders regardless of settings.

## Keep-or-delete verdict

**DELETE within the week — not because it's hostile, but because it's confidently wrong about what day it is.** He'd forgive the greeting and the labels. He won't forgive a streak that credits him twice for one shift, a readiness score blind to his sleep, water reminders that can never fire on shift, and a Home screen still showing yesterday at 02:00. The fixable core (quiet hours, free reminder times) shows the app *could* serve him — with a day-start offset setting. Without it, every competitor that merely gets the date right wins.

## Competitor gap

Whoop, MacroFactor, Apple Health/Fitness and even MyFitnessPal all implement a **day-rollover / "day starts at"** concept (commonly 03:00–04:00 defaults or user-set) precisely because midnight splits sleep and shift workers. Fitbod/Strong are also midnight-bound but ask less of the calendar — they don't grade readiness, streaks and habit matrices on it. ASCEND's coach ambitions make its midnight assumption costlier than its rivals'.

## Rating: 4/10
