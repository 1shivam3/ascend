# ASCEND — Elite Powerlifting, Strength & Habit Tracker

<p align="center">
  <img src="public/icon.svg" alt="ASCEND Logo" width="80" height="80" />
</p>

<p align="center">
  A high-performance, mobile-first strength and powerlifting tracking PWA built with Next.js 14, Tailwind CSS, TypeScript, and Google Gemini AI.<br/>
  <strong>100% local-first — zero cloud tracking, zero forced accounts, on-device data vault, and offline-first resilience.</strong>
</p>

<p align="center">
  <a href="https://nextjs.org/"><img alt="Next.js" src="https://img.shields.io/badge/Next.js-14-black?logo=next.js" /></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" /></a>
  <a href="https://tailwindcss.com/"><img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-3-38bdf8?logo=tailwindcss" /></a>
  <a href="https://ai.google.dev/"><img alt="Google Gemini" src="https://img.shields.io/badge/Google_Gemini-AI-orange?logo=google" /></a>
  <a href="https://web.dev/progressive-web-apps/"><img alt="PWA" src="https://img.shields.io/badge/PWA-Installable-purple" /></a>
  <a href="#license"><img alt="License" src="https://img.shields.io/badge/License-MIT-green" /></a>
</p>

---

## ⚡ Key Highlights

* **100% Local-First Data Privacy:** All workout sessions, personal records, body metrics, and habit checks are stored solely on your device in `localStorage`. You own your data completely.
* **Offline-First Resilience:** Track gym sessions, compute plates, and log meals with zero internet connection.
* **Scientific Strength Standards:** Calibrate your true strength levels (1–100 scale) across 30+ lifts with smooth bodyweight-ratio interpolation, gender adjustments, and official **DOTS powerlifting coefficients**.
* **Active Workout Engine with Session Recovery:** Live sets/reps tracking with direct keyboard entry, auto-saved drafts (so you never lose your workout if your battery dies), previous-session comparisons, and automatic rest timers.
* **Smart Workout Plan Generator:** Build targeted multi-bodypart splits (Chest, Back, Shoulders, Arms, Quads, Hamstrings, Glutes, Calves, Abs) tailored for Hypertrophy, Maximum Strength, or Endurance, with compound movements prioritized first.
* **AI-Assisted Nutrition & Offline Staples:** 80+ offline food database with instant 1-tap logging, live barcode scanning (Open Food Facts), and optional Google Gemini Vision meal photo scanning & natural language parsing.
* **Daily Habit Operating System:** Hydration targets (fluid requirements + workout bonus), Creatine monohydrate saturation tracker with supply management, 5-pillar daily checklist, and monthly consistency heatmap.

---

## 🚀 Features

### 🏋️ 1. Active Workout Engine & Session Recovery
* **Live Session Tracking:** Log sets, reps, and weights in either `kg` or `lbs`.
* **Direct Keyboard Typing & Steppers:** Type exact numbers directly via the numeric keyboard or use fine-tune steppers (+2.5 kg, etc.).
* **Session Draft Auto-Save:** Active workouts are automatically saved in local storage on every change. If you close your browser or your phone turns off, reopening the app immediately prompts you to resume your workout where you left off.
* **Previous Set History:** Displays what weight and reps you hit last time for that specific exercise (`"Last: 80 kg × 8"`) for continuous progressive overload.
* **Live Rest Interval Timer:** Built-in countdown timer with presets (1m, 1.5m, 2m, 3m) and ±15s fine-tuning. Automatically triggers when a set is completed, with audio chime and haptic vibration feedback.
* **Barbell Plate Calculator:** Instantly calculates the exact plate breakdown for 20kg/15kg barbells. Includes an automated **5-Stage Warm-Up Ramp** (empty bar × 10, 50% × 5, 70% × 3, 85% × 2, working weight).
* **Auto-PR Detection:** Upon finishing a workout, ASCEND computes the Epley 1RM for every set and compares it against your historical bests—automatically creating and announcing new personal records.

### ⚡ 2. Automated Workout Plan Generator
* **Multi-Bodypart Split Builder:** Multi-select any combination of target muscle groups:
  * Upper: *Chest, Back, Shoulders, Arms*
  * Lower: *Quads, Hamstrings, Glutes, Calves*
  * Core: *Abs*
* **Calibrated Training Stimulus:**
  * **Maximum Strength:** Heavy loading (4–5 sets × 3–5 reps).
  * **Hypertrophy:** Muscle growth volume (3–4 sets × 8–12 reps).
  * **Muscular Endurance:** Conditioning & pump (2–3 sets × 15–20 reps).
* **Compounds-First Logic:** Heavy compound lifts (Barbell Bench Press, Squat, Deadlift, Overhead Press) are sequenced first before isolation movements.
* **1-Tap Launch:** Tap "Start Workout" on any generated or saved routine to pre-load all exercises directly into the workout logger.

### 🏆 3. Strength Standards & Level Calibration (1–100)
* **Validated 1-Rep Max Math:** Uses the established **Epley Equation**: `1RM = weight × (1 + reps / 30)`.
* **Level 1–100 Scale:** Ranks every lift against bodyweight-ratio breakpoints with gender multipliers and continuous interpolation.
* **10 Progression Titles:**
  `First Steps` → `Iron Initiate` → `Steel Apprentice` → `Forge Bound` → `Iron Forged` → `Steel Tempered` → `Iron Will` → `Titan Rising` → `Apex Predator` → `Mythic`.
* **7 Rank Tiers:** `Foundation` (1–15) → `Trained` (16–30) → `Skilled` (31–45) → `Advanced` (46–65) → `Elite` (66–80) → `Master` (81–95) → `Grandmaster` (96–100).
* **Official DOTS Score:** Computes the official DOTS coefficient for Squat, Bench, and Deadlift for a bodyweight-equalized powerlifting total.
* **Interactive Level Progression Modal:** Tap any level badge to see the exact 1RM needed in `kg`/`lbs` to reach the next level and how many points remain until the next tier.

### 🥗 4. Nutrition & Macro Tracking
* **4-Macro Tracking:** Real-time tracking of Calories, Protein, Carbohydrates, and Fats.
* **Offline Staples Database:** 80+ common bodybuilding and everyday foods (chicken breast, eggs, paneer, roti, dal, rice, curd, whey protein, oats, almonds, peanut butter, etc.) with pre-calibrated macros per 100g.
* **Frequent & Pinned Foods:** Pin staple foods with custom portions for instant 1-tap logging.
* **Barcode Scanner:** Real-time barcode scanning using the device camera (`@zxing/browser`) and the worldwide **Open Food Facts API**.
* **AI Meal Photo Scanner (Google Gemini Vision):** Snap or upload a photo of your plate; Gemini Vision analyzes the meal and estimates food items, portion weights, and macros.
* **AI Natural Language Meal Logging:** Type or dictate what you ate in natural language (e.g. *"2 rotis with a bowl of dal, 100g paneer, and a scoop of whey"*); Gemini parses it into structured meal items.
* **Duplicate Yesterday's Meals:** 1-tap "Copy Yesterday's Diet" banner to replicate previous nutrition days with zero friction.

### 💧 5. Hydration & Creatine Operating System
* **Personalized Hydration Targets:** Fluid recommendations calculated based on bodyweight (~35 ml/kg), training day bonuses (+500 ml), and hot climate adjustments, with manual target overrides.
* **1-Tap Water Logging:** Quick-log buttons (`+250ml`, `+500ml`, `+750ml`, `+1000ml`) on Home and in Nutrition.
* **Creatine Monohydrate Saturation:** Rolling 30-day consistency score and cellular saturation models (`Full`, `Maintaining`, `Building`).
* **Creatine Container Supply Tracker:** Monitors container capacity (e.g. 500g) and remaining grams, auto-decrements on daily intake, and alerts when supply falls below 10 days.

### 📅 6. Progress Analytics & Daily Essentials
* **5-Pillar Daily Checklist:** Unified home tracker monitoring:
  1. *Workout / Active Recovery*
  2. *Hydration Target*
  3. *Creatine Intake*
  4. *Daily Protein Goal*
  5. *Morning Bodyweight*
* **Dynamic Rest Day Mode:** Rest days automatically complete the recovery objective and adjust daily hydration and nutrition targets without penalizing streaks.
* **Activity Heatmap Matrix:** GitHub-style calendar matrix visualizing daily consistency across gym sessions, water, creatine, and protein adherence.
* **Body Metrics & Trend Analysis:** Bodyweight logging with rolling rate-of-change indicators (kg/week) and baseline calibration.

### 🎨 7. Premium UI & Clean Typography
* **OLED Dark & Premium Light Modes:** High-contrast color palette with gold/amber accents (`#e5c07b`).
* **Clean Typography:** Styled using sans-serif typography, clean sentence-case labels, and tabular numerals (`tabular-nums`) for jitter-free numbers.
* **Native Navigation Support:** Hardware and browser back buttons navigate seamlessly between app tabs rather than exiting the application.

---

## 🔒 Privacy, Security & Data Ownership

ASCEND was built because athletes shouldn't have to surrender their personal health and fitness data to centralized cloud databases or ad networks.

* **100% Local Storage:** All records reside in client-side HTML5 Web Storage (`localStorage` under the `ascend_store` key).
* **Zero Telemetry & Zero Cookies:** No tracking pixels, no behavioral analytics, no third-party tracking cookies.
* **Bring-Your-Own-Key (BYOK) for Gemini AI:** You can optionally provide your own Google Gemini API Key in Settings for unlimited AI features. Your API key is stored exclusively on your device and is never sent to any ASCEND server.
* **Data Vault (Backup & Restore):** Export your entire athletic history as a formatted `.json` file at any time, or restore previous backups with 1 tap.
* **Full Legal Transparency:** Complete in-app and standalone documentation:
  * [Privacy Policy](src/app/privacy/page.tsx)
  * [Medical & Safety Disclaimer](src/app/disclaimer/page.tsx)
  * [Terms of Service](src/app/terms/page.tsx)

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 14](https://nextjs.org/) (App Router, React 18) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) |
| **Styling** | [Tailwind CSS 3](https://tailwindcss.com/) with custom tokens |
| **State Management** | [Zustand](https://zustand-demo.pmnd.rs/) with `persist` middleware |
| **AI Engine** | [Google Gemini API](https://ai.google.dev/) (`gemini-2.5-flash` / `gemini-1.5-flash`) |
| **Barcode Scanning** | [@zxing/browser](https://github.com/zxing-js/browser) + [Open Food Facts API](https://world.openfoodfacts.org/) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Storage** | Client-Side `localStorage` |
| **Deployment & PWA** | Web App Manifest, Service Worker ready, Vercel |

---

## 📁 Project Structure

```
ascend/
├── public/
│   ├── icon.svg             # ASCEND vector brandmark
│   └── manifest.json        # PWA Web App Manifest
├── src/
│   ├── app/
│   │   ├── api/             # Next.js route handlers
│   │   │   ├── ai/
│   │   │   │   ├── coach/       # Gemini AI training coach endpoint
│   │   │   │   ├── parse-meal/  # Natural language meal parser endpoint
│   │   │   │   └── scan-meal/   # Gemini Vision photo meal scanner endpoint
│   │   │   └── barcode/         # Open Food Facts barcode proxy
│   │   ├── disclaimer/      # Medical & Safety Disclaimer page
│   │   ├── privacy/         # Privacy Policy page
│   │   ├── terms/           # Terms of Service page
│   │   ├── globals.css      # Custom design tokens, theme variables & utilities
│   │   ├── layout.tsx       # Root metadata, theme scripts, PWA headers
│   │   ├── not-found.tsx    # Custom 404 Rep Failed screen
│   │   └── page.tsx         # Main single-page application shell & tab router
│   ├── components/
│   │   ├── HomePage.tsx               # Dashboard: 7-day strip, quote, daily objectives, heatmap
│   │   ├── WorkoutPage.tsx            # Workout engine: logger, active session, plan generator
│   │   ├── ProgressPage.tsx           # Progress hub: Overview, Strength, PRs, Bodyweight, Consistency
│   │   ├── MealsPage.tsx              # Nutrition hub: macro bars, staples, barcode & AI scanning
│   │   ├── Onboarding.tsx             # 30-second initial calibration flow
│   │   ├── QuickActionSheetModal.tsx  # Global floating action drawer
│   │   ├── PlateCalculatorModal.tsx   # Plate breakdown & 5-stage warm-up ramp
│   │   ├── LegalHubModal.tsx          # In-app legal & formula viewer
│   │   ├── PrivacyPolicyModal.tsx     # In-app privacy confirmation dialog
│   │   └── SettingsModal.tsx          # Preferences, units, Gemini API Key, Data Vault
│   └── lib/
│       ├── types.ts              # TypeScript domain types & interfaces
│       ├── store.ts              # Zustand global store with automatic hydration & migration
│       ├── strength-standards.ts # Bodyweight ratio breakpoints, Epley 1RM, strength levels
│       ├── dots.ts               # Official DOTS powerlifting polynomial equations
│       ├── macros.ts             # 80+ item offline food database & fuzzy matcher
│       ├── quotes.ts             # 60+ real motivational quotes indexed by day-of-year
│       └── storage.ts            # Local storage serialization helpers
└── package.json
```

---

## 💻 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) 18.17 or later
* npm / yarn / pnpm

### 1. Clone the repository
```bash
git clone https://github.com/1shivam3/ascend.git
cd ascend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure Environment Variables (Optional)
Copy the example environment file:
```bash
cp .env.example .env.local
```
Add your optional Google Gemini API key if you wish to run AI features through server environment variables:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```
*(Alternatively, you can leave this blank and input your custom Gemini API Key directly inside the app under **Settings → AI Intelligence**!)*

### 4. Run the development server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Production build
```bash
npm run build
npm run start
```

---

## 📱 Running as an Android App

ASCEND is fully optimized for mobile devices:
1. **As an Instant PWA:** Open the deployed app in Chrome on Android and tap **"Install App"** or **"Add to Home Screen"**. It runs full-screen without browser UI.
2. **As an Android APK (via Capacitor):** Because ASCEND uses static web tech and offline local storage, it can be packaged directly into a native Android APK using [Capacitor](https://capacitorjs.com/):
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap init Ascend com.ascend.app
   npm run build
   npx cap add android
   npx cap open android
   ```

---

## ⚖️ License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

Copyright (c) 2024–2026 **Shivam Kumar**.
