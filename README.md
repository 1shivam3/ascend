# ASCEND — Strength & Progression Tracker

<p align="center">
  <img src="public/icon.svg" alt="ASCEND Logo" width="72" height="72" />
</p>

<p align="center">
  A minimalist, mobile-first strength tracking PWA built with Next.js 14, Tailwind CSS, and TypeScript.<br/>
  <strong>100% local-first — no backend, no accounts, no data sent anywhere.</strong>
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-14-black?logo=next.js" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-3-38bdf8?logo=tailwindcss" />
  <img alt="PWA" src="https://img.shields.io/badge/PWA-Installable-purple" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green" />
</p>

---

## Features

### ⚡ Daily Essentials & Habit Operating System (New)
- **Daily Essentials Checklist**: Unified home dashboard status tracking your 5 core daily objectives:
  - `🏋️ Workout / 🛌 Active Recovery` (automatically recognizes planned rest days without penalty)
  - `💧 Hydration Target`
  - `🥤 Creatine Intake`
  - `🍗 Protein Target`
  - `⚖ Morning Bodyweight`
  - Real-time completion progress: `3/5 DAILY OBJECTIVES COMPLETE`
- **Dynamic Training Day vs. Rest Day Modes**:
  - Training day ethos: `TRAIN • HYDRATE • FUEL • RECOVER` (adds +500 ml hydration bonus)
  - Rest day ethos: `RECOVER • HYDRATE • FUEL • MOBILITY` (automatically completes recovery objective)
  - 1-tap toggle between training and rest days anytime without penalizing habit streaks.
- **Next Best Action**: High-impact, zero-clutter single dynamic banner on Home guiding your immediate next priority:
  - `💧 Drink 500 ml water (1.8 / 2.7 L)`
  - `🥤 Creatine not logged today`
  - `🏋️ Complete today's workout`
  - `⚖ Log morning bodyweight`
  - `🍗 You're 42g short of protein`
- **1-Tap Quick Log Bar**: Home screen action strip for instant 1-tap logging of `+250ml`, `+500ml`, `✓ Creatine`, `+25g Protein`, and `⚖ Weight` with tactile toast feedback.
- **Context-Aware Prompts**: Intelligent in-app alerts (e.g. Post-Workout Rehydration reminder with 1-tap `[+500 ML]` button, and afternoon hydration checks).
- **Daily Activity Timeline**: Chronological event feed tracking every completed workout, creatine dose, water batch, meal, and bodyweight log throughout the day.
- **Weekly Consistency Breakdown**: Honest 7-day multi-habit score across all 4 pillars (Gym, Water, Creatine, Protein) with overall adherence percentage.
- **Monthly Ascension Report & Share Card**: Comprehensive monthly progression report detailing total sessions, PRs set, volume tonnage lifted, hydration %, creatine days, and top lift increases, with 1-click clipboard export.

### 💧 Hydration Target & 1-Tap Logging
- **Personalized Hydration Target**: Calibrated fluid requirements based on bodyweight (~35 ml/kg), training day bonus (+500 ml), and hot climate adjustment (+300 ml), with optional manual custom target override.
- **1-Tap Quick Logging**: `+250ml`, `+500ml`, `+750ml`, and `+1000ml` buttons on Home, in Nutrition, and in the dedicated Hydration modal.
- Detailed daily water intake history and batch timestamps.

### 🥤 Creatine Daily Tracker & Supply Management
- **Custom Dose & Reminder**: User-configured target (e.g. 5g daily) and preferred reminder time.
- **Non-Punishing Consistency**: 30-day rolling consistency (`23 / 30 days`), cellular saturation estimate (`Full`, `Maintaining`, `Building`), and streak preservation.
- **Creatine Container Supply Tracker**: Monitors container capacity (e.g. 500g) and remaining grams, auto-decrements on daily intake, calculates estimated days remaining, alerts on low supply (`< 10 days remaining`), and offers 1-tap container refills.

### 📅 Multi-Habit Monthly Heatmap Matrix
- **Calendar & Matrix Views**: Toggle between a monthly calendar grid and multi-habit rows:
  - `WATER ■ ■ ■ □ ■ ■ ■`
  - `CREATINE ■ ■ ■ ■ ■ □ ■`
  - `GYM ■ □ ■ ■ ■ □ ■`
  - `PROTEIN ■ ■ □ ■ ■ ■ ■`
- **Interactive Day Inspector**: Tap any day to open a rich drawer showing workout exercises and sets, water volume, creatine status, protein intake, and timeline events.

### 🏆 Personal Records & Strength Levels (1–100)
- Log PRs for 30+ major lifts across Barbell Compounds, Dumbbells, Bodyweight, and Cable & Machines — plus custom exercises.
- **Categorized Exercise Selector**: beautiful modal dropdown with live search and color-coded category pills (BB, DB, BW, CM).
- **Bodyweight Exercise Support**: Pull-ups, Dips, and Push-ups support pure bodyweight tracking (optional added weight; defaults to your bodyweight baseline with 0 extra weight).
- **Dumbbell Exercise Library**: calibrated per-hand standards for Dumbbell Press, Dumbbell Row, Incline DB Press, DB Shoulder Press, DB Lateral Raise, DB Fly, Hammer Curl, Goblet Squat, Arnold Press, Preacher Curl, and more.
- **Interactive Level Progression Modal**: tap any level ring or badge to see the exact 1RM needed in `kg`/`lbs` to reach the next level, remaining levels until the next rank tier, and a full 7-tier journey overview.
- Calculates your **exact 1-Rep Max** using the validated **Epley formula**: `weight × (1 + reps/30)`.
- Ranks every lift on a **Level 1–100 scale** using real bodyweight-ratio strength standards with gender-adjusted multipliers and smooth interpolation between breakpoints.
- **10 progression titles** across the scale:
  | Range | Title |
  |---|---|
  | 1–10 | First Steps |
  | 11–20 | Iron Initiate |
  | 21–30 | Steel Apprentice |
  | 31–40 | Forge Bound |
  | 41–50 | Iron Forged |
  | 51–60 | Steel Tempered |
  | 61–70 | Iron Will |
  | 71–80 | Titan Rising |
  | 81–90 | Apex Predator |
  | 91–100 | Mythic |
- **Rank categories**: Untrained → Beginner → Novice → Intermediate → Advanced → Elite → World Class.
- **DOTS Powerlifting Score** computed for Squat, Bench, and Deadlift to give a bodyweight-equalized total.
- **Overall Strength Level**: weighted average across all your logged lifts.
- **Milestone targets**: set a target weight per exercise; the plate calculator pre-loads both your best working set and the milestone in one tap.

### 🏋️ Barbell Plate Calculator
- Enter any target weight and your available plate denominations — instantly see the exact plates to load on each side.
- **Warm-up Ramp Generator**: auto-calculates a 5-set ramp (empty bar × 10, 50% × 5, 70% × 3, 85% × 1–2, 100% work set); tap any row to instantly preview that weight's plate breakdown.
- **Working Set / Milestone toggle**: pre-load your best PR set weight or your milestone goal with one tap.
- Available anywhere in the app (PRs page header, Workout page header, PR card).

### 📅 Workout Logger, Pre-Planning & Auto-PR Detection
- **Pre-Plan Workouts**: create named workout routines (e.g. "Push Day", "Leg Day") with planned exercises, target sets, reps, and target weights before going to the gym.
- **1-Tap Start from Plan**: hit "Start Workout" on any plan to pre-load all exercises and sets directly into the logger so you can execute and log with zero friction.
- Log any workout session: multiple exercises, sets, reps, and weights in `kg` or `lbs`.
- **Auto-PR Detection**: on saving a session, ASCEND computes the Epley 1RM for every set and compares it against your existing bests — new PRs are recorded automatically and a toast announces how many were detected.
- **Rest Interval Timer**: built-in countdown timer with presets (1 min, 1.5 min, 2 min, 3 min) and ±15 s fine-tune buttons. Fires an audio beep + haptic vibration when time is up. Shows an animated progress bar.
- **Monthly Activity Heatmap**: green-tinted calendar showing every day you logged a gym session; tap *"I hit the gym today"* to log a quick check-in without a full workout.
- Full expandable workout history (most recent 20 sessions).

### 🥗 Nutrition: Barcode Scanner, Favorites & Macro Targets
- **Live Barcode Scanner**: Scan packaged food barcodes using your device camera powered by `@zxing/browser` and the worldwide **Open Food Facts API** database with live nutritional retrieval and serving size calculation.
- **Manual Barcode Lookup**: Enter or paste any barcode manually with instant fallback.
- **Frequent & Pinned Foods (1-Tap Logging)**: Pin staple daily foods (eggs, chicken breast, oats, protein scoop, rice) with custom portions for instant 1-tap logging.
- **Repeat Yesterday's Diet (Copy Meals)**: 1-tap "Copy Yesterday's Meals" banner and historical day cloning to duplicate meals across days for consistent diets with zero repetitive logging.
- **Instant Food Autocomplete**: As you type, matching foods from the 130+ item database appear with 1-tap autofill.
- **Blank Quantity by Default**: No irritating default numbers (no forced 100g); enter exact quantities only when you know them.
- **Expanded Serving Units**: Support for `g`, `ml`, `oz`, `piece`, `pieces`, `scoop`, `tbsp`, `tsp`, `cup`, `bowl`, `serving`, `slice`, and `handful`.
- **Quick-Log Templates**: 1-tap buttons for "Breakfast", "Lunch", "Dinner", "Pre-Workout", and "Post-Workout".
- **Daily Macro Targets**: Set per-day goals for Calories, Protein, Carbs, and Fat with visual progress bars. Auto-calculate button suggests targets based on bodyweight.
- Today's running totals (Kcal, Protein, Carbs, Fat) always visible at the top of the page.
- Last 14 days of meal history with per-day grouping and expandable food details.

### 📱 Navigation & Mobile Back-Button
- **Native-Like Back Navigation**: tapping the hardware/browser back button returns to the Home dashboard rather than abruptly quitting the application.

### 📊 Body Metrics Tracking
- Log bodyweight and height at any time; history is stored and charted.
- **BW Ratio** displayed on your profile — strength-to-bodyweight comparison across all your tracked lifts.
- Unit-aware: switch between `kg`/`lbs` at any point; all stored values are converted automatically.

### 💡 Daily Motivational Quote
- 60+ real, curated hard-hitting quotes from legendary athletes, coaches, and philosophers (Henry Rollins, Socrates, Arnold Schwarzenegger, David Goggins, Bruce Lee, Muhammad Ali, and more).
- Synchronized to the day-of-year — same quote all day, fresh one tomorrow.

### 🔒 Local-First Data Vault (Backup & Restore)
- Every piece of data lives in your browser's `localStorage` under the `ascend_` namespace.
- **Data Vault modal**: export all your data as a structured JSON file with one tap.
- **Restore**: drag-and-drop or select your JSON backup to fully restore your account.
- **Emergency Snapshot**: on first launch after reinstalling the PWA, ASCEND detects any `ascend_emergency_snapshot` key left in storage and offers to auto-restore it.
- On data clear, prompted to download a backup before deletion.

### 📱 PWA — Installable & Offline-Capable
- Full Progressive Web App with a Web App Manifest and service worker.
- Install prompt banner appears automatically on supported browsers.
- Runs completely offline after first load — no internet connection required.
- Safe-area support for notched devices; optimized for iOS Safari, Android Chrome, and desktop browsers.

### ⚖️ Legal & Compliance
- [Privacy Policy](/privacy) — details local-only data storage, no tracking, no cookies.
- [Terms of Service](/terms) — usage terms and conditions.
- [Medical & Safety Disclaimer](/disclaimer) — fitness information is for educational purposes only.
- Custom [404 Not Found](/404) page.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 14](https://nextjs.org/) (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 with custom design tokens |
| State | [Zustand](https://zustand-demo.pmnd.rs/) with `persist` middleware |
| Icons | [Lucide React](https://lucide.dev/) |
| Charts | Custom SVG + CSS animations |
| Storage | Browser `localStorage` only |
| PWA | Web App Manifest + Next.js metadata |

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx           # Root layout (meta, PWA manifest link)
│   ├── page.tsx             # SPA shell — tab router
│   ├── globals.css          # Design tokens + utility classes
│   ├── not-found.tsx        # Custom 404 page
│   ├── disclaimer/page.tsx  # Medical & Safety Disclaimer
│   ├── privacy/page.tsx     # Privacy Policy
│   └── terms/page.tsx       # Terms of Service
├── components/
│   ├── HomePage.tsx          # Dashboard — quote, level, quick actions, heatmap
│   ├── PRsPage.tsx           # Personal Records — levels, DOTS, plate calc
│   ├── WorkoutPage.tsx       # Workout logger — sets, rest timer, auto-PR
│   ├── MealsPage.tsx         # Nutrition — food log, macro progress bars
│   ├── Onboarding.tsx        # First-launch onboarding flow
│   ├── PlateCalculatorModal.tsx  # Plate calc + warm-up ramp
│   ├── WorkoutHeatmap.tsx    # Monthly gym activity heatmap
│   ├── BodyMetricsModal.tsx  # Bodyweight & height history
│   ├── DataVaultModal.tsx    # Backup / restore JSON
│   ├── DOTSCard.tsx          # DOTS score display
│   ├── ProgressChart.tsx     # Lift progress over time
│   ├── InstallAppBanner.tsx  # PWA install prompt
│   ├── LegalHubModal.tsx     # Links to legal pages
│   ├── PrivacyPolicyModal.tsx # In-app privacy policy
│   ├── SettingsModal.tsx     # App settings
│   └── ui/
│       ├── CircularProgress.tsx  # SVG circular progress ring
│       ├── RankBadge.tsx         # Rank tier badge
│       ├── ThemeToggle.tsx       # Dark / light theme switch
│       └── Toast.tsx             # Toast notification system
└── lib/
    ├── types.ts              # All shared TypeScript interfaces
    ├── store.ts              # Zustand global store (state + actions)
    ├── strength-standards.ts # Level calculation, Epley, breakpoints
    ├── dots.ts               # DOTS powerlifting score calculation
    ├── macros.ts             # Food database + macro estimator
    ├── plate-calculator.ts   # Plate breakdown algorithm
    ├── quotes.ts             # 60+ daily motivational quotes
    └── storage.ts            # localStorage helpers
```

---

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/1shivam3/ascend.git
cd ascend

# 2. Install dependencies
npm install

# 3. Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

```bash
# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

---

## Privacy

ASCEND stores **all data exclusively in your browser's `localStorage`**. No data is ever sent to any server. There are no analytics, no tracking cookies, and no third-party SDKs. You own your data — export it any time from the Data Vault.

---

## License

MIT © 2024 Shivam Kumar
