# ASCEND — Final Certification: Application Inventory

Round 1a. Everything below was extracted from the code at master `62e25543` — file lists, handler signatures, and greps actually run — not from prior audit documents. Where a capability named in the certification brief (§4.3) does not exist in code, it is listed **ABSENT** in §5.

## 1. Routes (`src/app`)

The application is a single-page app: one root page composes all five tab screens client-side. The only other pages are legal/account routes.

| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | The entire app shell: splash → onboarding gate → 5-tab interface (Home / Train / Progress / Fuel / Profile), bottom tab bar, modal stack, sync + tab-guard banners |
| `/delete-account` | `src/app/delete-account/page.tsx` | Account-deletion landing (token flow target) |
| `/disclaimer` | `src/app/disclaimer/page.tsx` | Health disclaimer page |
| `/privacy` | `src/app/privacy/page.tsx` | Privacy policy (content from `src/lib/legal.ts`) |
| `/terms` | `src/app/terms/page.tsx` | Terms of use (content from `src/lib/legal.ts`) |
| — | `src/app/layout.tsx` | Root layout: fonts (Inter, Barlow Condensed, Noto Sans Devanagari), theme bootstrap (`/theme-init.js`, beforeInteractive), Toast + Navigation providers, telemetry, service-worker registration, metadata/viewport (themeColor `#171916`, manifest `/manifest.json`) |
| — | `src/app/loading.tsx`, `error.tsx`, `not-found.tsx` | App-level loading / error / 404 states |

There are no route groups and no per-tab URLs; tab state lives in `src/lib/navigation.tsx`.

## 2. API routes (`src/app/api`) — 13 route files, all `runtime` Node handlers

| Endpoint | Methods | Purpose (from the handler) |
|---|---|---|
| `/api/ai/coach` | POST | Coach command endpoint (`executeMultiProviderText`); handles `WORKOUT_COMMAND` among typed commands; deterministic pre-provider safety stop; per-user + fleet AI caps |
| `/api/coach` | POST | **Alias** — re-exports `POST` from `/api/ai/coach/route.ts` verbatim (`src/app/api/coach/route.ts` is 2 lines) |
| `/api/ai/coach-chat` | POST | Conversational coach chat; safety stop before any provider call (pain/injury/eating-disorder refer-out), prompt-injection screening, multi-provider text execution |
| `/api/ai/scan-meal` | POST | Meal-photo vision scan (`executeMultiProviderVision`, Gemini-first cascade); returns items + totals toward today's goals |
| `/api/ai/parse-meal` | POST | Free-text meal → structured items (multi-provider text); model output clamped to sane ranges |
| `/api/ai/parse-voice` | POST | Voice-transcript → structured workout/meal parse (multi-provider text); clamped output; provider errors redacted |
| `/api/barcode` | GET | Barcode → nutrition: local verified catalog first, then Open Food Facts (`world.openfoodfacts.org/api/v2/product/<code>.json`) |
| `/api/auth/delete-account` | GET, POST | Token-based account deletion: `request_verification`/`request-token` issues a single-use 15-minute cryptographic token (`src/lib/deletion-token.ts`); POST confirms deletion |
| `/api/csp-report` | POST | CSP violation report sink (SEC-17) |
| `/api/feedback` | POST | User feedback → Supabase `user_feedback` (service-role insert; documented anon exception P2-2) |
| `/api/notifications/subscribe` | POST, DELETE | Web-push subscription register/remove; writes never run under the anon fallback (P2-2) |
| `/api/notifications/preferences` | GET, POST | Notification preferences read/write with payload validation/sanitization |
| `/api/notifications/dispatch` | POST | QStash-signed push dispatch (Upstash `Receiver` signature verification; `web-push` send) |

## 3. Screen-level components

**Tab screens** (composed by `page.tsx`): `HomePage.tsx` (Today), `WorkoutPage.tsx` (Train — Plans | Coach | History sub-tabs), `ProgressPage.tsx`, `MealsPage.tsx` (Fuel), `ProfileView.tsx` (Profile).

**Full-screen flows:** `Onboarding.tsx` + `src/components/onboarding/` (SplashScreen, WelcomeScreen, CreateAccountScreen, LoginScreen, SocialAuthButtons, PersonalDetailsScreen, FitnessGoalsScreen, SummaryScreen, ForgotPasswordModal, StepProgressBar), `ActiveWorkoutScreen.tsx`, `RunSessionScreen.tsx` (guided run), `HistoryForkScreen.tsx` (retained-history choice), `WorkoutDetailsView.tsx`, `PRsPage.tsx`, `SettingsView.tsx`, `DeleteAccountView.tsx`.

**Coach surfaces:** `CoachChatTab.tsx`, `CoachChatSection.tsx`, `CoachNotesSection.tsx`, `CoachWeeklyReviewCard.tsx`, `AthleteModelCard.tsx`, `PolicyDecisionCard.tsx`, `TrainingDecisionCard.tsx`.

**Modals — 29** (`src/components/*Modal.tsx`): Auth, BarcodeScanner, BlockDebrief, BodyMetrics, CoachBlock, CoachWeeklyReview, Confirmation, ConstraintAdapter, Creatine, DataVault, EditProfile, ExerciseLibrary, ExerciseSelector, Feedback, GoalSelector, Hydration, ImportProgram, LogPastWorkout, MeetAttemptPlanner, PlateCalculator, PostWorkoutTake, ReminderCenter, ReportAI, ScanMeal, ShareProgram, SuggestedWorkout, VoiceWorkoutLogger, WeeklyRecap, WeeklySchedule.
**Sheets — 5** (`*Sheet.tsx`): Challenges, Customize, FormCues, Level, Readiness — plus the shared wrapper `src/components/ui/Sheet.tsx` (used by 2 files; see design-consistency audit).
**Shared UI kit** (`src/components/ui/`, 15 files): Badge, Button, Card, CircularProgress, CollapsibleDetails, EmptyState, LanguagePicker, PermissionHelp, RankBadge, Section, SegmentedControl, Sheet, TabGuardBanner, ThemeToggle, Toast.
**Form Coach** (`src/features/form-coach/`): components FormCoachModal, FormSessionSummaryModal, PoseOverlay (+ ExerciseSelector in the original branch, deleted in the fix pass); services PoseLandmarkerService + pose.worker, SquatAnalyzer behind the ExerciseAnalyzer interface, RepStateMachine, LandmarkGeometry/Smoothing, FormFeedbackEngine; FormSessionRepository (localStorage `ascend_form_coach_sessions`).

## 4. Feature matrix

Dependencies shorthand — **Store**: main Zustand store persisted as localStorage key `ascend_store` (`src/lib/store.ts`, ~4,300 lines). Supabase tables actually referenced from code (`.from(...)` grep): `profiles`, `workouts`, `planned_workouts`, `personal_records`, `meals`, `body_metrics`, `coach_blocks`, `user_feedback`, `push_subscriptions`, `notification_preferences`, `notification_deliveries`, `consumed_deletion_nonces`.

| Feature | Where it lives | Entry point | Main user task | Dependencies | Test coverage (files under `tests/`) | Known-defect pointers |
|---|---|---|---|---|---|
| Onboarding (multi-step: splash, welcome, account, details, goals, summary) | `Onboarding.tsx`, `components/onboarding/*`, `lib/onboarding.ts`, `lib/age.ts` | First launch / guest continue | Create profile + goals, or continue as guest | Store; Supabase auth (optional) | `gauntlet-fork-onboarding-plans`, `dob-preview-age`, `auth-login-flow`, `google-auth-name` | None found in code (no TODO/FIXME anywhere in `src`) |
| Authentication (email, Google, guest; session persistence) | `AuthModal.tsx`, `lib/supabase/*`, `lib/ai-client-auth.ts` | Onboarding + Profile | Sign in/out, keep data synced | Supabase project; Store | `auth-login-flow`, `account-deletion`, `gauntlet-cross-account-reset` | — |
| Home / Today (Simple default; Detailed opt-in; customizable cards) | `HomePage.tsx`, `HomeMatrix.tsx`, `lib/today-layout.ts`, `lib/home-matrix.ts`, `CustomizeSheet.tsx` | Home tab | See today: workout, nutrition, protein, hydration, habits | Store | `today-layout`, `today-bottom-clearance`, `gauntlet-home-matrix`, `boot-home` | — |
| Train hub — plans list, plan CRUD, templates | `WorkoutPage.tsx`, `lib/workout-engine.ts`, `lib/plan-validation.ts` | Train tab → Plans | Manage workout plans | Store; Supabase `planned_workouts` | `workout-engine`, `workout-data-model`, `template-scaling` | — |
| Coach-built blocks (intake → proposal → approval → adoption; plateau proposals) | `lib/block-engine.ts`, `lib/block-intake.ts`, `CoachBlockModal.tsx` | Train → Coach / plan cards | Get a periodized block built from demonstrated capacity | Store; Supabase `coach_blocks` | `block-engine`, `bmb-f01-f02-block-integrity`, `bmb-f03-f06-f12-intake`, `bmb-f04-limitation-honesty`, `bmb-f11-coach-blocks-sync`, `coach-blocks-store` | F-11 live Supabase round-trip never tested against the real DB (inert until the §16 migration is applied) |
| Training-decision policy (progression, stall, deload, safety stops) | `lib/training-decision-policy.ts`, `lib/coach-engine.ts`, `lib/coach-session.ts` | Automatic, per session | Decide next loads/reps; stop on pain; propose deloads | Store | `training-decision-policy`, `coach-engine`, `coach-session`, `coach-simulation` (37), `apply-policy-decision`, `store-decision-ledger` | — |
| Active workout (set logging, set edit, RPE + derived RIR, rest timer + chime, exercise swap/add/remove, draft resume) | `ActiveWorkoutScreen.tsx`, `lib/rest-chime.ts`, `lib/workout-elapsed.ts` | Plan card → Start; Resume banner | Log a session fast; survive interruption/reload | Store (draft in `ascend_store`) | `workout-active-flow`, `rest-timer-sound`, `final-cert-j23-elapsed`, `chip-row-wrap` | Rest-chime audibility on a physical phone NOT VERIFIED |
| Running — Couch-to-5K-style 8-week program, guided run session | `lib/run-program.ts`, `RunSessionScreen.tsx` | Train (enrolled users only) / New Plan flow | Follow run/walk intervals with beep cues | Store | `run-program`, `run-distance-edit`, `audit3-rest-day` | Run-session interval beeps share the per-call AudioContext pattern fixed for the rest timer in PR #70 — flagged in the 2026-11-03 Train ledger as noted-not-fixed |
| Form Coach (video-upload squat analysis, on-device MediaPipe PoseLandmarker) | `src/features/form-coach/*`, `public/mediapipe/*` (model + WASM, ~15.5 MB lazy) | Train → Training Tools; Home quick action; squat workouts | Analyze a squat video: reps, depth, tempo, torso lean | localStorage `ascend_form_coach_sessions`; `@mediapipe/tasks-vision` 0.10.21 | `tests/form-coach/` — 10 files, 60 tests | **Phone runtime NOT VERIFIED**; undefined Tailwind classes `*-accent-primary` / `bg-surface-base` found in its two components (see design-consistency audit F-02) |
| Coach bridge (form results → coach) | `lib/coach-chat.ts` (FORM CHECKS section), `lib/weekly-review.ts`, `form-session-storage` leaf module | Automatic when sessions exist | Let the coach cite measured form data | Form-session storage (read-only) | `tests/form-coach/coach-bridge.test.ts` + coach-chat suites | Informational only by design — never alters blocks/loads |
| Form cues (per-exercise demo + steps) | `ExerciseDemo.tsx`, `FormCuesSheet.tsx`, `lib/exercise-media.ts` | Workout exercise rows | Learn technique | `lib/exercise-library.ts` howTo data | `exercise-media`, `exercise-foundation` | Media is hand-drawn SMIL stick figures (deliberate license decision, `docs/exercise-media.md`) |
| Exercise library (100+ exercises, EN/HI how-to steps) | `lib/exercise-library.ts`, `ExerciseLibraryModal.tsx`, `ExerciseSelectorModal.tsx` | Train / workout add-exercise | Find and add exercises | Store | `exercise-foundation`, `audit3-exercise-matching` | — |
| Workout history + plan-vs-actual | `WorkoutPage.tsx` (History), `PlanVsActualReview.tsx`, `lib/workout-adherence.ts` | Train → History | Review past sessions honestly | Store; Supabase `workouts` | `workout-adherence`, `workout-adherence-presentation`, `gauntlet-workout-date`, `workout-session-date` | — |
| Progress & records (PRs, charts, strength standards, muscle volume, heatmap) | `ProgressPage.tsx`, `PRsPage.tsx`, `ProgressChart.tsx`, `WorkoutHeatmap.tsx`, `MuscleVolumeSection.tsx`, `lib/strength-standards.ts`, `lib/muscle-volume.ts` | Progress tab | Read progress; compare to standards | Store; Supabase `personal_records` | `strength-standards`, `final-cert-d2-d3-canonical-volume`, `final-cert-ux-f04-chart-a11y` | — |
| Nutrition — meal log, Indian food DB, macros, thali-style favorites | `MealsPage.tsx`, `lib/indian-foods.ts`, `lib/food-search.ts`, `lib/macros.ts`, `lib/food-hindi.ts` | Fuel tab | Log meals; hit protein/macro goals | Store; Supabase `meals` | `food-db`, `food-atwater-sweep`, `custom-foods`, `final-cert-j31-macro-float`, `effective-goals` | — |
| Meal scan (photo AI), text parse, barcode | `ScanMealModal.tsx`, `BarcodeScannerModal.tsx`, `/api/ai/scan-meal`, `/api/ai/parse-meal`, `/api/barcode`, `lib/ai-scan-meal.ts` | Fuel tab | Log a meal from photo/text/barcode | AI provider cascade (Groq → Cloudflare* → Gemini); fleet cap 500/day; `zxing` | `scan-meal-route`, `scan-meal-edit-regression`, `barcode-route`, `barcode-scanner-engine`, `ai-provider`, `ai-quota` | *Cloudflare stage is PR #53 — **open, not in production**. Offline on-device scan is PR #22 — **open, not in production** (production scan is cloud-only) |
| Voice workout/meal logging | `VoiceWorkoutLoggerModal.tsx`, `/api/ai/parse-voice`, `lib/voice-logger.ts`, `@capacitor-community/speech-recognition` | Train/Fuel quick actions | Log by speaking | AI route; native speech plugin (Capacitor) | `gauntlet-parse-voice-redact` | — |
| Hydration, habits, creatine | `HydrationModal.tsx`, `CreatineModal.tsx`, `WeeklyHabitMatrix.tsx`, `lib/habits.ts` | Home / Fuel | Track water, habits, creatine | Store | `habits`-adjacent: `dots`, `gauntlet-di05-volume` | — |
| Body metrics | `BodyMetricsModal.tsx`, `lib/day-activity.ts` | Progress / Profile | Log weight & measurements | Store; Supabase `body_metrics` | `body-metrics-date`, `gauntlet-body-metric-sync` | — |
| Conversational coach (chat with full athlete context) | `CoachChatTab.tsx`, `CoachChatSection.tsx`, `lib/coach-chat.ts`, `/api/ai/coach-chat`, `lib/coach-chat-store.ts` | Train → Coach | Ask the coach; get evidence-cited answers | AI providers; Store; per-device chat store | `coach-chat`, `coach-chat-tab`, `audit3-coach-chat`, `audit3-coach-chat-store` | 14 `coachChat.*` Hindi strings shipped unreviewed (machine translation) |
| Weekly review + block debrief | `lib/weekly-review.ts`, `CoachWeeklyReviewCard/Modal.tsx`, `BlockDebriefModal.tsx` | Train → Plans review row; Coach | Weekly truth-telling + revisions | Store | `weekly-review`, `gauntlet-weekly-review-*` (4 files) | — |
| Challenges, XP & levels | `ChallengesSheet.tsx`, `FriendChallengesSection.tsx`, `LevelSheet.tsx`, `lib/challenges.ts`, `lib/friend-challenges.ts`, `lib/xp-system.ts` | Home / Profile | Light gamification; friend challenges | Store | `challenges`, `friend-challenges`, `xp-system`, `streak-freeze`, `streak-refresh-wiring` | — |
| Program sharing (link/QR/WhatsApp) + program import | `ShareProgramModal.tsx`, `ImportProgramModal.tsx`, `lib/program-sharing.ts`, `lib/workout-import.ts` | Plan card share icon | Share/import a plan | Store | `gauntlet-import-archive`, `program-sharing` (via gauntlet files) | — |
| Calculators (plates, %1RM loads, meet attempts) | `PlateCalculatorModal.tsx`, `MeetAttemptPlannerModal.tsx`, `lib/plate-calculator.ts`, `lib/percent-1rm.ts` | Training Tools / plan detail | Plan loads precisely | Store | `percent-1rm` (via `final-cert-d1-core-lifts`), `plate-calculator` (gauntlet) | — |
| Settings & personalization (themes, custom accent, text scale, language EN/HI, Simple/Detailed, dashboard layout) | `SettingsView.tsx`, `ThemePicker.tsx`, `lib/accent-themes.ts`, `lib/text-scale.ts`, `lib/i18n/*` | Profile tab | Make the app yours | Store; localStorage prefs | `accent-themes`, `custom-accent-light`, `theme-persistence`, `ux-redesign-prefs`, `i18n` | Hindi quality review outstanding (owner-deprioritized 2026-11-02) |
| Data vault (backup, export CSV, import, reset, delete account) | `DataVaultModal.tsx`, `DeleteAccountView.tsx`, `lib/csv-export.ts`, `lib/storage.ts`, `/api/auth/delete-account` | Profile / Settings | Own your data; leave cleanly | Store; Supabase (deletion) | `csv-export`, `data-purge`, `reset-purge-broadcast`, `account-deletion`, `start-fresh-guard` | — |
| Notifications (web push, local reminders, reminder center) | `ReminderCenterModal.tsx`, `lib/notifications.ts`, `lib/local-notifications.ts`, `lib/push-notifications.ts`, `/api/notifications/*` | Settings; automatic | Rest-end + habit reminders | Supabase notification tables; QStash; Capacitor local notifications | `notifications` (via gauntlet batch files), `rest-timer-sound` | — |
| Health Connect sync | `lib/health-connect.ts`, `lib/health-sync.ts`, `@capgo/capacitor-health` | Settings (native only) | Sync steps/weight from Android Health Connect | Capacitor native bridge | `health-sync` (via gauntlet files) | **Invisible on web/PWA** — renders only inside the native shell; untestable in this environment |
| Telemetry (GA4, Sentry, Vercel Analytics — consent-gated) | `TelemetryProvider.tsx`, `TelemetryConsentBanner.tsx`, `lib/telemetry.ts` | Automatic after consent | Product analytics + crash reports | External processors | `telemetry` (via `system-states`, gauntlet) | Play Data Safety must declare all three (noted for the Play track) |
| PWA / offline / multi-tab safety | `ServiceWorkerRegister.tsx`, `scripts/generate-sw.js`, `public/sw.template.js`, `lib/tab-leader.ts`, `ui/TabGuardBanner.tsx` | Automatic | Offline use; no cross-tab overwrite | Service worker cache `ascend-<sha>-cache` | `generate-sw`, `tab-leader`, `tab-leader-record-proof`, `final-cert-sec-f05-sw-purge` | — |
| Legal (privacy, terms, disclaimer, delete-account) | `src/app/{privacy,terms,disclaimer,delete-account}`, `lib/legal.ts` (`LEGAL_VERSION` 2.9, support email constant) | Footer / direct URL | Compliance surface | — | `legal` (via security/gauntlet files) | Support email is the owner's personal Gmail (temporary, by his decision) |

## 5. Brief §4.3 capability checklist — present / absent, from code

**Present:** onboarding · authentication (email + Google + guest) · profile · Home/Today · workout hub · training plans · plan generation (block engine) · exercise library · active workout · set logging · set editing · RPE (input + policy use) · RIR (derived, shown in the RPE control's title — `WorkoutPage.tsx:2935`; also a policy concept in `training-decision-policy.ts:1017`) · rest timer · workout completion + summary · workout history · personal records · strength analysis · body metrics · progress charts · nutrition · meal logging · food information · macronutrients · hydration · habits · coaching (engine + chat + weekly review) · user preferences · theme personalization (7 accent themes + custom picker) · dashboard customization · Simple/Detailed mode · data management · backup · import/export (CSV + program import) · offline functionality · synchronization (Supabase, owner-scoped) · service-worker updates · sharing (program share via link/QR/WhatsApp; weekly recap image in `WeeklyRecapModal.tsx`) · Health Connect (code-complete, native-shell only).

**Absent / partial, stated plainly:**
- **Marketing landing page** — ABSENT. `/` is the app itself (splash → onboarding → tabs); there is no public landing route.
- **Social feed / social network features** — ABSENT. Social surface is limited to program sharing and friend challenges; there is no feed, follow graph, or public profile.
- **Offline on-device meal scan** — NOT IN PRODUCTION. Built on branch `feat/offline-scan` (open PR #22); production meal scan is cloud-AI only.
- **Cloudflare vision provider** — NOT IN PRODUCTION. Open PR #53; dormant pending the owner's Cloudflare account/token.
- **Live-camera form check** — ABSENT by design. The shipped Form Coach is video-**upload** analysis; the earlier live-camera prototype exists only on the unmerged `feat/coach-real-gaps` branch.
- **Per-muscle readiness** — NOT IN PRODUCTION. Exists only on `feat/coach-real-gaps`; production readiness is the global score (which does price pain/soreness/fatigue).
- **RIR as a direct input** — PARTIAL. Users input RPE; RIR is derived and displayed, not a separate field.

## 6. Defect-pointer sweep

- `grep -rn "TODO|FIXME"` across `src/**/*.{ts,tsx}`: **0 matches.** There are no in-code TODO/FIXME markers; known issues live in PR descriptions, audit docs, and the trackers cited in the matrix above.
- Cross-reference: design-layer defects found this round (dead token layer, undefined Form Coach classes, palette-class bypass) are catalogued in `design-consistency-audit.md`; functional/security/data findings belong to later rounds of this program.
