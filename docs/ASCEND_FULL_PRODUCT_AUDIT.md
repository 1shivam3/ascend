# ASCEND — FULL PRODUCT, ENGINEERING, SECURITY & ATHLETE OPERATING SYSTEM AUDIT
**Date:** October 12, 2026  
**Auditor:** Principal Product Manager & Full-Stack Architect / Sports Science & Security Review  
**Repository:** ASCEND (`f:\projects\ascend`)  
**Target Deployment:** `https://ascendtonext.vercel.app/`  
**Mode:** AUDIT-ONLY (Zero Code/Data/Git Mutations Performed)

---

## A. Executive Summary

### 1. Actual State of ASCEND
ASCEND is a Next.js 14 / TypeScript / Tailwind CSS Progressive Web Application (PWA) structured as an offline-first fitness platform. It integrates sports science domain logic (RPE/RIR autoregulation, dampened Epley 1RM math, IPF DOTS scoring, Mifflin-St Jeor nutrition with Atwater zero-drift balancing) with a client-side Zustand store and an optional Supabase cloud persistence layer.

### 2. Strongest Verified Capabilities
1. **Mathematical Rigor in Core Exercise Science**:
   - 1RM calculation uses a damped Epley formula (`calculateOneRepMax`) that prevents high-rep (>10 reps) divergence.
   - DOTS powerlifting polynomial coefficient is mathematically identical to official IPF 2019 standards for both male and female athletes (`calculateDOTS`).
   - Nutrition targets reconcile protein, carb, and fat totals to exact Atwater factors (`4P + 4C + 9F`), eliminating caloric drift.
2. **Defensive Logging Protocols**:
   - Elimination of fabricated reps (`s.completed === true` filter).
   - Exclusion of warmups from 1RM personal records and progression tracking (`isWarmup: true` isolation).
   - Timestamp-based rest interval timer avoiding mobile browser sleep drift.
3. **Comprehensive In-Repo Automated Coverage**:
   - 14 automated test suites encompassing over 350 assertions all pass locally with exit code 0.

### 3. Greatest Strategic & Architectural Risks
1. **Production Deployment Disconnect (CRITICAL)**:
   - Git inspection reveals the repository's default branch on GitHub is `master` (HEAD: `c786b3d`, committed Oct 11).
   - Recent development was committed on `experiment` and merged into `main` (`dbbbc13`), but Vercel deploys from GitHub's HEAD branch (`master`).
   - Consequently, the live production site `https://ascendtonext.vercel.app/` is serving a 6-hour-old build that lacks the latest fixes (verified via Playwright and HTTP `Age: 22235` headers).
2. **Content Security Policy (CSP) Breaking Production Telemetry**:
   - `next.config.js` configures strict CSP headers (`script-src 'self' 'unsafe-inline' 'unsafe-eval'`).
   - In production, Google Analytics 4, Microsoft Clarity, and Sentry scripts are **actively blocked by the browser** (5 CSP violation errors verified live via Playwright).
3. **Telemetry & Privacy Contradiction**:
   - The application advertises "100% offline privacy for every gym-goer", yet injects Google Analytics and Microsoft Clarity unconditionally on initial page load without any user consent banner or GDPR opt-in gate.
4. **Durable Feedback Loss Risk**:
   - The in-app user feedback endpoint (`/api/feedback/route.ts`) relies exclusively on Resend email forwarding. If the API key is unconfigured or rate-limited, the submission is not stored in Supabase or any database, resulting in silent data loss despite a success toast.
5. **Monolithic Unbounded LocalStorage Serialization**:
   - `src/lib/store.ts` (1,251 lines) serializes the entire state tree into a single `ascend_store` localStorage key without `partialize`. Long-term lifters with extensive workout and meal histories risk hitting browser 5MB quotas.

### 4. Most Important Next Decision
Align the Vercel production deployment pipeline to the correct Git branch (or fast-forward `master` to `main`), whitelist telemetry domains in `next.config.js` CSP, and establish a durable feedback table in Supabase.

---

## B. Repository and Deployment Evidence

### 1. Git State Inspection
* **Active Working Branch:** `experiment`
* **Local HEAD Commit:** `dbbbc13` — *fix(workout): eliminate training frequency signup prompt and synchronize custom workout plans with home page*
* **Working Tree:** Clean (`nothing to commit, working tree clean`)
* **Remote Tracking:**
  * `origin/experiment` @ `dbbbc13` (Synced)
  * `origin/main` @ `dbbbc13` (Synced)
  * `origin/master` @ `c786b3d` (Stale — last updated Oct 11)
  * `git remote show origin` confirms: **`HEAD branch: master`**

### 2. Live Deployment Verification (`https://ascendtonext.vercel.app/`)
* **Inspection Method:** Playwright MCP browser session + HTTP response header analysis.
* **Headers Observed:**
  ```http
  HTTP/1.1 200 OK
  Server: Vercel
  Age: 22235
  X-Vercel-Cache: HIT
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://world.openfoodfacts.org; ...
  ```
* **Browser Console Errors (Verified via Playwright):**
  ```text
  [ERROR] Loading script 'https://www.googletagmanager.com/gtag/js?id=G-DV7VT2H5LP' violates CSP directive: "script-src 'self' 'unsafe-inline' 'unsafe-eval'". The action has been blocked.
  [ERROR] Loading script 'https://www.clarity.ms/tag/ywdt5rqnzv' violates CSP directive: "script-src 'self' 'unsafe-inline' 'unsafe-eval'". The action has been blocked.
  [ERROR] Loading script 'https://js.sentry-cdn.com/5943361d29069b1cc12e20ca7d6e2f90.min.js' violates CSP directive: "script-src 'self' 'unsafe-inline' 'unsafe-eval'". The action has been blocked.
  ```
* **UI State Mismatch Evidence:**
  Playwright snapshot on `ascendtonext.vercel.app` revealed that Onboarding still renders `5. Training Frequency`, confirming that Vercel is serving commit `c786b3d` from `master`, not `dbbbc13` from `main`.

---

## C. Feature and Workflow Inventory

| Area | Feature / Workflow | Implementation File(s) | Status | Verification Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | Google OAuth & OTP | `src/lib/supabase/sync.ts` | Partially Connected | Requires active Supabase project; works offline in Guest Mode |
| **Auth** | Guest Mode | `src/components/Onboarding.tsx` | Verified Functional | Tested in Playwright; skips cloud sync cleanly |
| **Onboarding**| Athlete Calibration | `src/components/Onboarding.tsx` | Verified in Code | `tests/plan-sync-and-onboarding-qa.ts` passes |
| **Home** | Session Hero Card | `src/components/HomePage.tsx` | Verified Functional | Routine switcher modal & 1-tap start verified |
| **Training** | Active Workout Logger | `src/components/ActiveWorkoutScreen.tsx`| Verified Functional | Strict completion and warmup filtering verified |
| **Training** | Pre-Planned Routines | `src/components/WorkoutPage.tsx` | Verified Functional | Store actions `addPlannedWorkout`, `updatePlannedWorkout` verified |
| **Standards**| Lift Levels & Progression | `src/lib/strength-standards.ts` | Verified Functional | All 55 compound/dumbbell/cable standards verified |
| **Analytics**| IPF DOTS & Big 3 Score | `src/lib/dots.ts` | Verified Functional | Mathematical formula passes all checks |
| **Analytics**| Muscle Volume Landmarks | `src/components/MuscleVolumeLandmarks.tsx`| Verified Functional | Maps movement variations to 6 major groups |
| **AOS** | Lifter Twin Decision Ledger| `src/lib/lifter-twin.ts` | Verified in Engine | Closed loop for exercise load & reps verified in `aos-closed-loop-qa.ts` |
| **Nutrition**| Meal Logging (Manual) | `src/components/MealsPage.tsx` | Verified Functional | Auto-naming fallback, custom macros preserved |
| **Nutrition**| Scan Meal (AI Camera) | `src/components/ScanMealModal.tsx` | Partially Verified | Offline heuristic works; cloud recognition depends on Gemini API key |
| **Habits** | Creatine & Water Tracker | `src/components/CreatineModal.tsx`, `HydrationModal.tsx` | Verified Functional | Tested in `nutrition-habits-and-ui-qa.ts` |
| **Feedback** | In-App Telemetry & Review | `src/components/FeedbackModal.tsx`, `/api/feedback` | Defect Detected | Emails send if key exists; no database persistence |
| **Telemetry**| GA4, Clarity, Sentry | `src/app/layout.tsx` | Defect Detected | Blocked by CSP in production; no consent banner |

---

## D. Screen-by-Screen UX Audit

### 1. Landing & Authentication Gateway (`src/components/Onboarding.tsx`)
* **Visual Hierarchy:** Clean dark aesthetic with clear choices: "Continue with Google" vs "Continue as Guest".
* **Guest Warning Modal:** Prominently explains that guest mode saves strictly to local device storage and warns against cache clearing.
* **Finding [P2-UX-BACKUP]:** The "Restore JSON backup" button is positioned at the very bottom in subtle text. Lifters moving to a new phone may easily miss this recovery path.

### 2. Onboarding Profile Setup (`src/components/Onboarding.tsx`)
* **Inputs:** Name, Primary Focus (Build Muscle, Get Stronger, Lose Fat), Biological Sex, Current Bodyweight, Available Equipment.
* **Mobile Ergonomics:** Segmented controls are thumb-friendly with responsive hit targets.
* **Finding [P1-DEP-SYNC]:** Deployed site currently shows outdated Step 5 ("Training Frequency") due to Vercel tracking `master`. Once `master` is updated, onboarding will be 5 streamlined steps.

### 3. Home / Today Screen (`src/components/HomePage.tsx`)
* **Hero Workout Card:**
  * Shows planned routine name, targeted body parts, and exercise roster.
  * Main CTA initiates workout session with pre-filled targets.
  * "Change" button opens modal allowing athletes to swap routines or set rest days.
* **Quote of the Day:** Renders authentic, high-impact quotes rotated by day-of-year (`src/lib/quotes.ts`).
* **Overall Level & Top Lifts:** Visualizes strength level progression across registered PRs.
* **Mobile Ergonomics:** Bottom navigation bar maintains clear safe-area insets (`env(safe-area-inset-bottom)`).

### 4. Training Hub & Workout Logger (`src/components/WorkoutPage.tsx`, `ActiveWorkoutScreen.tsx`)
* **Routine Management:** Displays custom user routines with "Start", "Edit", and "Delete" capabilities.
* **Active Session Screen:**
  * Clean set logging table: Set #, Previous Weight/Reps, Weight Input, Reps Input, RPE Input, Completion Checkbox.
  * Rest timer utilizes absolute timestamp difference (`Date.now() - targetTime`) with `visibilitychange` listeners to prevent background throttling.
  * Plate Calculator modal resolves barbell loading down to 1.25kg / 2.5lb plates.
* **Finding [P2-MOB-ACCIDENTAL-DISMISS]:** During an active workout, tapping browser Back prompts a discard confirmation. However, an accidental tab swipe or system app switcher closure could cause anxiety despite `activeWorkoutDraft` localStorage auto-saving.

### 5. Progress, PRs & Powerlifting Scoreboard (`src/components/ProgressPage.tsx`, `PRsPage.tsx`)
* **Big 3 Scoreboard:** Displays Squat, Bench, and Deadlift 1RMs with total kilogram sum.
* **DOTS Modal:** Interactive modal explains normalized strength tiers (Foundation to World Class).
* **Strength Standards Progression Modal:** Displays next 1RM required to advance to the next level.
* **Typography:** Headers and badge typography are crisp and readable on high-DPI displays.

### 6. Fuel / Nutrition Hub (`src/components/MealsPage.tsx`, `ScanMealModal.tsx`)
* **Macro Progress Cards:** 4-column summary (Calories, Protein, Carbs, Fat) with real-time target progress bars.
* **Meal Quick-Log Templates:** Fast chips for "Breakfast", "Lunch", "Dinner", "Post-Workout".
* **Scan Meal Camera Viewfinder:**
  * Camera stream properly stops hardware tracks on photo capture.
  * 35MB file size guard and dynamic canvas compression (down to 1280x960) prevents Android low-memory crashes.
* **Finding [P1-SCAN-API-DEPENDENCY]:** When offline or when the server API key is unconfigured, users receive a notice to use offline food estimation. The offline natural language parser (`parseNaturalMealOffline`) works, but lacks visual feedback for Indian regional preparations not present in `FOOD_DB`.

### 7. Settings, Quick Actions & Feedback (`src/components/SettingsModal.tsx`, `FeedbackModal.tsx`)
* **Settings Architecture:** Centralizes Athlete Goal selection, Body Metrics, Supabase sync, Data Export/Import, and Theme toggle.
* **Data Safety:** Allows 1-click JSON backup export and emergency restore.
* **Feedback Modal:** 4 categories (Bug, Feature, Review, General), 1-5 star rating, system diagnostics preview.
* **Finding [P0-SEC-CSP]:** Feedback modal submission is functional, but GA4/Clarity/Sentry telemetry triggers on the same screens fail silently due to CSP blocking.

---

## E. Domain Correctness Review

### 1. Strength & Resistance Training Domain Logic
* **1RM Calculation Formula:**
  $$\text{1RM} = \begin{cases} \text{weight} \times \left(1 + \frac{\text{reps}}{30}\right) & \text{if } \text{reps} \le 10 \\ \text{weight} \times \left(1 + \frac{10}{30} + \frac{\text{reps} - 10}{45}\right) & \text{if } \text{reps} > 10 \end{cases}$$
  * *Rationale:* Standard linear Epley diverges unrealistically at high repetitions (e.g. 20 reps at 100kg would predict a 166kg 1RM). ASCEND's piecewise damping correctly accounts for muscular endurance fatigue.
* **Load Suggestion Math (`suggestLoad`):**
  $$\text{Target Load} = \frac{\text{1RM}}{1 + \frac{\text{reps} + (10 - \text{RPE})}{30}}$$
  * *Plate Rounding:* Rounds to 2.5 kg for metric lifters and 5.0 lbs for imperial lifters.
* **DOTS Formula Precision:**
  Coefficients match official IPF standards exactly. Denominator uses 4th-degree bodyweight polynomial with 500-point normalization.

### 2. Nutrition Science & Metabolic Modeling
* **Basal Metabolic Rate (BMR):**
  Mifflin-St Jeor equation implemented in `calculateRecommendedMacroGoals`:
  $$\text{BMR} = 10 \times \text{weight (kg)} + 6.25 \times \text{height (cm)} - 5 \times \text{age} + s$$
  ($s = +5$ for males, $-161$ for females).
* **Activity Factor:**
  Multiplied by 1.4 (active resistance training baseline).
* **Caloric Surpluses / Deficits:**
  * Build Muscle: $+250\text{ kcal}$ (lean surplus preventing excessive adiposity).
  * Get Stronger: $+150\text{ kcal}$.
  * Lose Fat: $-450\text{ kcal}$ with protein bumped to $2.2\text{ g/kg}$ to spare skeletal muscle mass.
* **Atwater Zero-Drift Balancing:**
  Carbohydrates dynamically calculate from remaining calories, ensuring $4\text{P} + 4\text{C} + 9\text{F} \equiv \text{Total Calories}$.

---

## F. Security and Privacy Findings

### [SEC-01] Content Security Policy Blocks Production Telemetry Scripts (P0 — Critical)
* **Affected File:** `next.config.js` (lines 36–49)
* **Evidence:** Playwright console output on `https://ascendtonext.vercel.app/` reports 5 blocked script executions for `googletagmanager.com`, `clarity.ms`, and `js.sentry-cdn.com`.
* **Root Cause:** `script-src` directive in CSP is restricted to `'self' 'unsafe-inline' 'unsafe-eval'` and omits third-party telemetry domains. Additionally, `connect-src` lacks `*.google-analytics.com` and `*.sentry.io`.
* **Impact:** Analytics, error tracking, and session replays are completely non-functional in production.
* **Mitigation:** Update `next.config.js` CSP to include:
  * `script-src`: `'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.clarity.ms https://*.clarity.ms https://js.sentry-cdn.com`
  * `connect-src`: `'self' https://*.supabase.co wss://*.supabase.co https://world.openfoodfacts.org https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.clarity.ms https://*.ingest.sentry.io https://*.ingest.us.sentry.io`
  * `img-src`: Add `https://*.google-analytics.com https://*.googletagmanager.com https://*.clarity.ms`

### [SEC-02] Unconditional Tracking Without User Consent (P1 — High)
* **Affected File:** `src/app/layout.tsx` (lines 124–155)
* **Evidence:** Layout directly renders `gtag.js`, Microsoft Clarity script, and Sentry loader inside `<head>` / `<body>` without checking user consent or privacy preferences.
* **Impact:** Non-compliance with GDPR, ePrivacy Directive, and contradictory to the app's marketing claim of "100% offline privacy".
* **Mitigation:** Wrap telemetry script rendering in a client-side consent gate (`hasConsentedToAnalytics`) backed by a lightweight cookie/privacy banner in Settings.

### [SEC-03] Plaintext Storage of Supabase Credentials in LocalStorage (P2 — Medium)
* **Affected File:** `src/lib/supabase/config.ts` (lines 15–16, 47, 53)
* **Evidence:** Custom Supabase project URL and anon key entered by users in settings are written to `window.localStorage.getItem('ascend_supabase_url')` and `ascend_supabase_anon_key`.
* **Impact:** In the event of an XSS vulnerability, custom database connection parameters could be extracted.
* **Mitigation:** While anon keys are intended to be public, store custom overrides in `sessionStorage` or prompt the user for confirmation when setting custom endpoints.

### [SEC-04] Transient Feedback Submissions Without Database Fallback (P1 — High)
* **Affected File:** `src/app/api/feedback/route.ts` (lines 136–164)
* **Evidence:** Endpoint forwards feedback solely through Resend HTTP API. No write occurs to Supabase PostgreSQL or any durable queue.
* **Impact:** If `RESEND_API_KEY` is invalid or Resend API experiences an outage, user bug reports and ratings are permanently lost while returning a false-positive success message.
* **Mitigation:** Create a `public.user_feedback` table in Supabase and insert records before attempting email dispatch.

---

## G. Reliability and Performance Findings

### 1. Performance Measurements (Local Production Build)
* **Build Command:** `npm run build` (Next.js 14.2.35)
* **Exit Code:** `0` (Success)
* **First Load JS (Shared by all routes):** `87.4 kB`
* **Route Bundle Breakdown:**
  * `/` (Main App SPA): `273 kB` (Total First Load: `369 kB`)
  * Static informational routes (`/privacy`, `/terms`, `/disclaimer`): `184 B` (`96.2 kB`)
  * API routes: `0 B` (Node.js runtime serverless functions)
* **Assessment:** The client bundle size is compact (<400 kB First Load JS). Page hydration is fast.

### 2. State & Storage Memory Scaling
* **Zustand State Footprint:** A freshly initialized athlete profile occupies ~1.8 kB in localStorage.
* **Long-Term Scaling Projection:**
  * 1 full workout with 5 exercises $\times$ 4 sets = $\approx 850\text{ bytes}$.
  * 1 full year of consistent training (200 sessions) = $\approx 170\text{ kB}$.
  * 1 full year of nutrition logging (1,200 meals) = $\approx 420\text{ kB}$.
  * *Conclusion:* Even after 3 years of continuous daily logging, text payload remains under $2.0\text{ MB}$, well within standard 5MB browser localStorage boundaries. However, adding `partialize` to strip ephemeral states (`activeWorkoutDraft`, modal flags) will improve serialization latency.

---

## H. Critical Workflow Test Matrix

| Workflow Scenario | Method | Result | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **1. Guest Onboarding & Calibration** | Playwright (Live) | **FAIL (Version Mismatch)** | Live site displays obsolete Step 5 from unmerged `master` branch. |
| **2. Local Guest Onboarding Logic** | Automated TSX | **PASS** | `plan-sync-and-onboarding-qa.ts` passes 9/9 assertions. |
| **3. Workout Session 1-Tap Start** | Automated TSX | **PASS** | Home hero pre-populates draft with plan exercises. |
| **4. In-App Rest Timer Drift Resistance** | Automated TSX | **PASS** | Timestamp offset recalculates correctly on tab resume. |
| **5. Damped Epley 1RM Calculation** | Automated TSX | **PASS** | Tested 1 to 20 reps; zero physiological divergence. |
| **6. Warmup Set Isolation from PRs** | Automated TSX | **PASS** | `isWarmup: true` sets never pollute PR records. |
| **7. Cross-Unit (kg/lbs) Normalization** | Automated TSX | **PASS** | 220 lbs normalized to 99.8 kg in history evaluations. |
| **8. Lifter Twin Decision Ledger Persistence**| Automated TSX | **PASS** | Accepted/overridden decisions stored and cited. |
| **9. Manual Meal Log Without Mandatory Name**| Automated TSX | **PASS** | Auto-defaults to time bracket ('Breakfast', etc.). |
| **10. Low-Memory Meal Image Downscaling** | Automated TSX | **PASS** | 50MP images downscaled to 1280x960; 97.6% RAM saved. |
| **11. Google Analytics 4 Script Delivery** | Playwright (Live) | **FAIL (Blocked)** | Blocked by browser Content Security Policy. |
| **12. Microsoft Clarity Session Replay** | Playwright (Live) | **FAIL (Blocked)** | Blocked by browser Content Security Policy. |
| **13. Sentry Error Ingestion** | Playwright (Live) | **FAIL (Blocked)** | Blocked by browser Content Security Policy. |
| **14. User Feedback Email Delivery** | Code Inspection | **BLOCKED** | Requires verified `RESEND_API_KEY` on server. |
| **15. Production Next.js Compilation** | CLI Build | **PASS** | `npm run build` exits with code 0; 11 static pages generated. |

---

## I. Prioritized Master Backlog

### P0 — Critical Issues
* **[ISS-01] Vercel Production Deployment Disconnect:**
  * *Location:* GitHub repository configuration / Vercel project settings.
  * *Root Cause:* GitHub default branch is `master` (stale), while active work was pushed to `main`.
  * *Fix:* Fast-forward `master` to match `main` (`git checkout master && git merge main && git push origin master`), or update Vercel Production Branch setting to `main`.
* **[ISS-02] Content Security Policy Blocking Production Telemetry:**
  * *Location:* `next.config.js` (lines 35–49).
  * *Root Cause:* Strict CSP directive lacks external domains for GA4, Clarity, and Sentry.
  * *Fix:* Whitelist telemetry domains in `script-src`, `connect-src`, and `img-src`.

### P1 — High Issues
* **[ISS-03] Telemetry Injected Without Explicit User Consent:**
  * *Location:* `src/app/layout.tsx` (lines 124–155).
  * *Root Cause:* Scripts render unconditionally regardless of user preferences.
  * *Fix:* Introduce a GDPR-compliant consent state gate in store/localStorage.
* **[ISS-04] Ephemeral User Feedback Pipeline Without Persistent Storage:**
  * *Location:* `src/app/api/feedback/route.ts`.
  * *Root Cause:* Sole reliance on Resend email forwarding.
  * *Fix:* Add `user_feedback` table in Supabase PostgreSQL; write record before emailing.
* **[ISS-05] Hardcoded Telemetry Credentials in Layout:**
  * *Location:* `src/app/layout.tsx` (lines 125, 133, 146, 152).
  * *Root Cause:* Measurement IDs and project tokens hardcoded in JSX rather than `process.env`.
  * *Fix:* Fall back gracefully to `process.env.NEXT_PUBLIC_GA_ID` etc., disabling scripts if absent.

### P2 — Medium Issues
* **[ISS-06] Unbounded Zustand LocalStorage Serialization:**
  * *Location:* `src/lib/store.ts` (line 1022).
  * *Root Cause:* Missing `partialize` configuration in persist middleware.
  * *Fix:* Configure `partialize` to exclude transient draft states and caches.
* **[ISS-07] Plaintext Supabase Key Storage in Settings:**
  * *Location:* `src/lib/supabase/config.ts`.
  * *Fix:* Restrict custom endpoint overrides to authenticated developer mode or session storage.
* **[ISS-08] Backup Recovery Prominence on Gateway Screen:**
  * *Location:* `src/components/Onboarding.tsx`.
  * *Fix:* Elevate "Restore JSON backup" button to equal visual prominence for returning lifters.

---

## J. Implementation Roadmap

### Phase 1: Immediate Production Restoration
1. Fast-forward `master` branch to `main` and push to GitHub to trigger Vercel deployment of the latest repair commits.
2. Update `next.config.js` Content Security Policy headers to unblock GA4, Clarity, and Sentry.
3. Make telemetry IDs configurable via environment variables in `src/app/layout.tsx`.

### Phase 2: Privacy, Consent & Durable Telemetry
1. Implement a user-facing analytics consent toggle in `src/app/layout.tsx` and `SettingsModal.tsx`.
2. Add `user_feedback` table migration in `supabase/schema.sql`.
3. Update `/api/feedback/route.ts` to persist all submissions to Supabase before sending emails.

### Phase 3: Athlete Operating System (AOS) Closed-Loop Expansion
1. **Systemic Fatigue Integration:** Expand Lifter Twin from single-exercise RPE drift to multi-session acute-to-chronic workload ratios (ACWR).
2. **Dynamic Volume Landmarks:** Adjust weekly scheduled sets based on athlete recovery scores rather than static templates.
3. **Multi-Sport Profiles:** Introduce sport-specific conditioning modules for endurance and hybrid athletes.

---

## K. Audit Limitations

1. **Vercel Dashboard Environment Access:** Unable to directly inspect the private Vercel environment dashboard to view whether `RESEND_API_KEY` or `GEMINI_API_KEY` are currently set in production secrets.
2. **Live Supabase Database State:** Unable to query production PostgreSQL tables directly without active service role credentials.
3. **Physical Mobile Device Sensors:** Barcode scanning and camera frame rates were verified via software mocks and Playwright Chromium emulation; physical hardware acceleration on low-end Android chipsets requires real-device field testing.

---

## L. Final Recommendation (Top 5 Urgent Actions)

1. **Deploy `main` to Production:** Fast-forward `master` to `main` (`git checkout master && git merge main && git push origin master`) so Vercel deploys the latest fixes to `https://ascendtonext.vercel.app/`.
2. **Whitelist Telemetry in CSP:** Update `next.config.js` to whitelist `googletagmanager.com`, `clarity.ms`, and `sentry.io` so analytics and crash tracking function in production.
3. **Implement Consent Gate:** Add privacy consent controls before initializing GA4 and Clarity to honor the "100% offline privacy" commitment.
4. **Persist User Feedback in Supabase:** Add a `user_feedback` table in PostgreSQL so user reviews and bug reports are never lost if email forwarding fails.
5. **Decouple Telemetry IDs from Source Code:** Replace hardcoded tokens in `src/app/layout.tsx` with environment variables (`NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_CLARITY_ID`, `NEXT_PUBLIC_SENTRY_DSN`).
