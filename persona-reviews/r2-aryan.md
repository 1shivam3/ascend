# R2 — Aryan, 16 — School student, shared family phone (NEW)

**Branch:** `feat/overnight-build` · **Profile:** 16, school + homework, trains after school, ~55 kg, phone is the family phone (parents/sibling also use it). **Method:** read-only trace of age handling, calibration, gamification, guest/account behaviour, telemetry and Play-policy surface.

## First impression

He gets in — legitimately. Onboarding's age field accepts 13–120, and the app treats him, from that moment on, **exactly like a 35-year-old**. Nothing in the experience acknowledges he's 16: not the loads conversation, not the calorie targets, not the supplement tracking, not the consent banner that pops up asking *him* (not a parent) about analytics. The XP/level system will hook him fast — which is precisely why the absence of any teen calibration around it matters.

## What worked

- **The under-13 guard is real and well-implemented — verified.** `src/components/onboarding/PersonalDetailsScreen.tsx` `handleSubmit`: `if (!isNaN(parsedAge) && parsedAge < 13)` sets the explicit error "ASCEND is designed for athletes aged 13 and older… no information has been saved" and returns **before** `onContinue` — nothing is stored (commit `5926dd3`). Input also carries `min={13}`. `EditProfileModal.tsx` enforces the same 13–120 range post-onboarding, so he can't edit himself younger later either.
- **No social layer at all — the single best thing for a minor.** Grep across `src/` finds no friends, followers, leaderboards, public profiles, or social sharing of his body data. Pressure mechanics are self-directed only, and deliberately softened (below).
- **Gamification is engineered to be non-punishing, and it shows in the code.** `xp-system.ts` header: "XP never decays and is never lost." `challenges.ts` header: opt-in only, "No reminders, no nudges, no 'your friends are doing it'," dismiss hides for the month. `streak-freeze.ts`: one missed day per week is silently forgiven. He can also switch gamification off entirely in Settings (`uiPreferences.gamificationEnabled`). This is materially kinder than Duolingo-style mechanics for a teenager.
- **Beginner loads ARE bodyweight-calibrated — if he answers honestly.** `workout-engine.ts` `scaleTemplateWeightForAthlete`: loads scale by `bodyweightKg / 85` and beginners get a 0.6× first-exposure factor, capped at the template weight. A 55 kg beginner Aryan gets bench ≈ 70 × (55/85) × 0.6 ≈ 27.5 kg, not 70 kg. Plus pull-up regression (`regressPullUpsForBeginner`) if he's a beginner with gym access → Lat Pulldown.

## Friction & bugs

### ARYAN-1 (major, safety-adjacent feature gap) — Ages 13–17 receive zero age-based adjustment anywhere
Grep of `age` across the engines is conclusive: age is consumed **only** by `macros.ts` BMR. There is no age branch in `workout-engine.ts` (scaling is bodyweight + self-declared experience only), none in `strength-standards.ts` (adult bodyweight-ratio breakpoints, gender-keyed only), none in `coach-engine.ts`, XP, streaks or challenges. Concrete consequences:
- **Adult calorie deficit for a growing body.** If he picks "Lose Fat," `calculateRecommendedMacroGoals` applies the adult −450 kcal deficit (floor 1400 kcal) with no age check, no warning, no parent/coach note. A 16-year-old in a growth phase gets the same diet maths as a sedentary adult.
- **The pull-up regression is gated on experience, not age.** `adaptSplitForEquipment` applies `regressPullUpsForBeginner` only when `experience === 'beginner'`. A 16-year-old who ticks "Intermediate" (school-sport confidence is not gym experience) keeps **Pull-ups 3×8** in Full Body C (`workout-schedule.ts`) and loses the 0.6× load factor in the same tap: at 55 kg "intermediate," first-week prescriptions are bench ≈ 45 kg ×6, squat ≈ 60 kg, deadlift ≈ 70 kg — scaled, but adult-framed, with no form-first or supervision prompt anywhere in the flow.

### ARYAN-2 (minor, real bug) — A 13-year-old is silently costed as a 25-year-old in the calorie engine
`PersonalDetailsScreen` admits age 13, but `macros.ts` `calculateMaintenanceCalories` clamps: `ageYears >= 14 && ageYears <= 90 ? ageYears : 25`. A 13-year-old's BMR is therefore computed with age 25 — about −60 kcal BMR (≈ −85 kcal at target after the activity multiplier) vs his real age, with no indication. Small in magnitude, but it's a silent lie at the exact age the app just made a legal promise about, and the fix is one character (`>= 13`).

### ARYAN-3 (major, family-phone feature gap) — One device = one person; his data is whoever-opens-the-app data
- There is **no multi-profile, PIN, or profile switcher** anywhere. The store persists a single profile in `localStorage['ascend_store']`; if a profile exists, the app skips onboarding entirely — a parent or younger sibling opening ASCEND lands directly in Aryan's account: his bodyweight history, progress photos, meals, PRs.
- Guest identity is per-device by design: `storage.ts` `getOrCreateGuestId` mints one stable guest ID per device, explicitly preserved across logout "so a guest who logs out and onboards again keeps the SAME identity." On a shared phone, two siblings guest-onboarding produce **one merged athlete**.
- The normal logout preserves everything: `ProfileView.tsx` calls `logout({ clearLocalData: false })`; `store.ts` `logout` with that flag only clears the in-memory profile flag — workouts/meals/photos stay on device and resurrect for the next person who onboards or logs in. Only the buried "Delete WebApp Data & Reset" (`purgeLocalAppData`) actually separates people, by destroying his data.
Net effect: on his actual phone, ASCEND cannot tell Aryan from his family. His streak, weight log and photos are effectively household-shared.

### ARYAN-4 (minor/moderate) — Supplement tracking is on by default for a 16-year-old, with no age gate
`store.ts` `DEFAULT_CREATINE_CONFIG = { dailyTargetG: 5, reminderTime: '08:00', enabled: true }`. Creatine is a scored daily objective (`habits.ts` `getDailyObjectives` — "Creatine Daily Dose"), with its own modal, supply tracker and streak copy ("Keep muscles saturated"). No code path checks `profile.age` before enabling any of it. Whatever one's view of creatine for older teens, an app that just built an under-13 legal guard should not default a supplement regimen onto 13-year-olds unexamined.

### ARYAN-5 (minor, Play-policy exposure) — Consent and eligibility rest entirely on a self-declared number
- Age is a free-typed self-declaration with no date-of-birth and no verification; the under-13 guard stops only honest children. (Standard for the category — noted, not counted as a defect unique to ASCEND.)
- `terms/page.tsx` states under-18s may use ASCEND "only with the active involvement and consent of a parent or legal guardian" — but **no onboarding step implements that**: no parent-consent checkbox, notice, or email. The terms promise a gate the product doesn't have.
- `TelemetryConsentBanner.tsx` asks the device user to Accept/Decline analytics (GA/Clarity/Sentry via `telemetry.ts`) with no age awareness; consent is stored per-device in `localStorage['ascend_telemetry_consent']`, so on the family phone Aryan's tap binds his sibling too — and a 13-year-old's "Accept" is the only consent the system ever collects. Mitigations are real: providers are env-gated in production (`telemetry.ts` IDs fall back only in non-production), and `trackSafeEvent` strips weight/reps/food/email/name keys. `PLAY_STORE_COMPLIANCE.md` correctly instructs **not** selecting under-13 target audiences (would trigger Families policy the app doesn't meet) and documents 13+ (16+ EEA) positioning; the residual exposure is the EEA 16 line — a 14-year-old in the EEA passes onboarding with no jurisdiction check.

## Keep-or-delete verdict

**KEEP, with supervision the app itself doesn't provide.** He'd enjoy it — XP, levels and forgiving streaks are catnip at 16, the beginner calibration is genuinely safe, and there's no social surface to hurt him. But every safeguard that matters for a minor (deficit calories, supplement defaults, intermediate-load bravado, family seeing his data) currently depends on a parent standing outside the app. As shipped, it's an adult app that a 16-year-old is allowed into, not an app that knows he's 16. If his parents knew the phone-sharing behaviour (ARYAN-3), *they'd* delete it before he would.

## Competitor gap

Fitbod and Strong are also 13+ adult tools — ASCEND is not behind the market here, which is the problem with the market. The differentiation available: Nike Training Club and Apple Fitness+ gate intensity behind experience in-flow, and family-sharing platforms (Apple Family Sharing, Google Family Link) at least model the shared-device reality. Any competitor that adds a genuine teen mode (no deficit goals, no supplement objectives, PIN-separated profiles) takes this persona outright.

## Rating: 5/10
