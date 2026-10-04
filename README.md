# ASCEND — Evidence-Based Training & Nutrition System

<p align="center">
  <img src="public/icon.svg" alt="ASCEND Logo" width="80" height="80" />
</p>

<p align="center">
  A high-performance, evidence-based training, autoregulation, and nutrition platform built with Next.js 14, Tailwind CSS, TypeScript, and Google Gemini AI.<br/>
  <strong>Engineered for every gym-goer — Bodybuilding & Hypertrophy, Maximum Strength, Fat Loss & Shredding, Stamina & Conditioning, and General Fitness.</strong><br/>
  <em>100% local-first — zero cloud tracking, zero forced accounts, on-device data vault, and offline-first resilience.</em>
</p>

<p align="center">
  <a href="https://nextjs.org/"><img alt="Next.js" src="https://img.shields.io/badge/Next.js-14-black?logo=next.js" /></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" /></a>
  <a href="https://tailwindcss.com/"><img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-3-38bdf8?logo=tailwindcss" /></a>
  <a href="https://ai.google.dev/"><img alt="Google Gemini" src="https://img.shields.io/badge/Google_Gemini-AI-orange?logo=google" /></a>
  <a href="https://web.dev/progressive-web-apps/"><img alt="PWA" src="https://img.shields.io/badge/PWA-Installable-purple" /></a>
  <a href="#automated-qa-testing"><img alt="Tests" src="https://img.shields.io/badge/Tests-310%20Passed-emerald" /></a>
  <a href="#license"><img alt="License" src="https://img.shields.io/badge/License-MIT-green" /></a>
</p>

---

## ⚡ The ASCEND Core Philosophy

Most fitness applications either force casual gym-goers into rigid competitive powerlifting equations or subject bodybuilding trainees to generic, unscientific checklists. ASCEND bridges the gap with a clean, evidence-based loop:

$$\text{OPEN ASCEND} \longrightarrow \text{KNOW WHAT TO DO TODAY} \longrightarrow \text{TRAIN} \longrightarrow \text{LOG EASILY} \longrightarrow \text{SEE WHAT HAPPENED} \longrightarrow \text{GET USEFUL FEEDBACK} \longrightarrow \text{KNOW WHAT TO DO NEXT}$$

* **For Hypertrophy & Muscle Building:** Autoregulates volume, tracks RPE/RIR to ensure close-to-failure mechanical tension without systemic burnout, optimizes rest intervals (90s–120s), and prescribes lean caloric surpluses (+250 kcal).
* **For Maximum Strength:** Implements heavy compound double progression, official DOTS powerlifting coefficients, 1RM strength standards (1–100 scale), 3–4 minute rest timers, and warmup ramp calculators.
* **For Fat Loss & Shredding:** Dynamically monitors calorie deficits in real time, elevates protein targets (2.2 g/kg) to protect lean body mass, and pairs fast-paced density workouts (60s–75s rest).
* **For Stamina & Conditioning:** Prioritizes high-carb glycogen fueling, higher repetition brackets (12–20 reps), and aerobic recovery pacing.
* **For General Fitness & Longevity:** Delivers sustainable, balanced movement patterns, joint-friendly stimulus-preserving substitutions, and full-spectrum daily habit tracking.

---

## 🚀 Key Highlights & Architectural Systems

### 🏋️ 1. Active Workout Engine & In-Gym Ergonomics
* **Live Session Tracking:** Clean logging for sets, reps, load (`kg` or `lbs`), and effort (`RPE` 6.0–10.0 and `RIR` 0–4).
* **Session Recovery Auto-Save:** Active drafts persist automatically in local storage on every keystroke. Never lose a session to browser refreshes or dead phone batteries.
* **Previous Set Context:** Displays what load and reps you achieved last time for that exact exercise (`"Last: 80 kg × 8 @8 RPE"`) to guide progressive overload.
* **Goal-Adaptive Rest Interval Timers:** Automatic rest timer presets calibrated to your goal:
  * Strength: 180s–240s
  * Hypertrophy: 90s–120s
  * Fat Loss / Stamina: 60s–75s
  * Includes manual ±15s steppers, background audio chimes, and haptic vibration feedback.
* **Barbell Plate Calculator & Warmup Ramp:** 1-tap plate breakdown for 20kg/15kg bars with an automated **5-Stage Warm-Up Ramp** (empty bar × 10, 50% × 5, 70% × 3, 85% × 2, working weight).
* **Automatic PR Detection:** Computes Epley 1RM across every completed set and instantly flags new personal bests with celebratory badges.

### 🧠 2. Autoregulation, Fatigue & Progression Analytics
* **RPE & RIR Integration:** Every set card displays effort level with intuitive color-coded badges and calculated Reps In Reserve (`RIR = 10 - RPE`).
* **Within-Session Effort Drift:** Tracks fatigue progression across sets (e.g. `Avg @8.2 RPE • +0.5 drift`). Detects when sets spike above RPE 9.5 or drop reps under accumulated fatigue.
* **Dual-Mode Progress Charting:** Toggle seamlessly between **1RM Progression** and **Volume & Fatigue**:
  * Visualizes session tonnage ($Volume = \text{Sets} \times \text{Reps} \times \text{Weight}$).
  * Color-codes data points by fatigue intensity: green for reserve, gold for target working zone, amber for fatigue spikes.
* **Plain-English Progression Advice:** Explains *why* a weight increase or deload is recommended (e.g. *"Target reached with 2 reps in reserve. Increase load by +2.5 kg next session"*).

### 🏆 3. Scientific Strength Standards & DOTS Calculation
* **Validated 1-Rep Max Math:** Uses the established **Epley Formula**:
  $$\text{1RM} = \text{Weight} \times \left(1 + \frac{\text{Reps}}{30}\right) \quad (\text{if Reps} > 1)$$
* **Smooth 1–100 Level Calibration:** Calibrates 30+ lifts against bodyweight ratios with gender multipliers and continuous interpolation (no arbitrary step buckets).
* **Official DOTS Powerlifting Polynomials:** Equalizes strength across weight classes for Squat, Bench, and Deadlift.
* **Interactive Progression Modal:** Displays remaining kilograms/pounds required to reach the next level tier (`Foundation` → `Trained` → `Skilled` → `Advanced` → `Elite` → `Master` → `Grandmaster`).

### 🔄 4. Constraint & Equipment Adaptation Engine
* **Gym Rush & Crowded Gym Solvers:** Busy gym? 1-tap stimulus-preserving exercise swaps replace occupied equipment while preserving identical biomechanical muscle recruitment (e.g., Barbell Bench Press $\rightarrow$ Dumbbell Flat Press with automatic weight recalibration; Lat Pulldown $\rightarrow$ Bodyweight Pull-ups).
* **Time Crunch Adaptations:** When you only have 20–30 minutes, ASCEND trims accessory fluff, caps compound working sets to 3, and recalibrates rest intervals to maintain progressive tension.

### 🎙️ 5. Hands-Free Hinglish Voice Logger
* **Natural In-Gym Dictation:** Speak sets hands-free between heavy breaths:
  * *"Bench press 80 kg 5 reps rpe 8"*
  * *"Squat 100 char rpe saat"* (Hinglish numbers supported)
  * *"Deadlift 120 paanch rpe aath"*
* Parses exercise, weight, reps, and RPE completely on-device or via fast local speech matching.

### 🥗 6. Precision Nutrition & Macro Tracking
* **Calibrated Macronutrient Alignment:** Balanced calculation between calories and macronutrients:
  $$\text{Calories} = (4 \times \text{Protein}) + (4 \times \text{Carbs}) + (9 \times \text{Fat})$$
* **Goal-Adaptive Macro Engine:** Uses Mifflin-St Jeor BMR and resistance training activity multipliers to generate evidence-based macro splits:
  * **Build Muscle:** Lean growth surplus (+250 kcal, 1.8 g/kg protein).
  * **Lose Fat:** Moderate deficit (-450 kcal, 2.2 g/kg protein to preserve lean body mass).
  * **Get Stronger:** Performance surplus (+150 kcal, high complex carbohydrates).
  * **Stamina:** High-glycogen energy balance.
* **Real-Time Goal Pacing Bar:** Live monitoring on the Nutrition dashboard showing remaining deficit preservation or surplus progress.
* **Offline Staples & Scanners:** 80+ offline food database with instant 1-tap logging, live barcode scanning (Open Food Facts), and optional Google Gemini Vision meal photo scanning.

### 📱 7. Offline Gym Resilience & PWA Architecture
* **PWA Service Worker (`/sw.js`):** Employs **Stale-While-Revalidate** for static bundles and **Network-First with Cache Fallback** for navigation. Works reliably in underground basement gyms with zero cellular signal.
* **Live Gym Mode Indicator:** Surfaces an ambient status notification whenever the device goes offline:
  > `⚡ Offline Gym Mode Active • All workouts, PRs, and meals are safely saved locally`

### 🔗 8. Shareable Program Links & QR Codes
* **Coach-to-Athlete Zero-Friction Sharing:** Encode complete multi-week routines or single workout plans into compact, self-contained URL hashes (`#v1_...`).
* Instant 1-tap import without accounts, databases, or API keys.

---

## 🔒 Privacy, Security & Data Ownership

ASCEND was built on the fundamental principle that health and athletic data belong entirely to the individual.

* **100% Local Storage:** All workouts, PRs, nutrition history, and settings are stored locally in browser `localStorage`.
* **Zero Third-Party Telemetry:** No Google Analytics, no Meta pixels, no tracking cookies, and no data harvesting.
* **Bring-Your-Own-Key (BYOK):** Optional Google Gemini AI features can use your personal free Gemini API key, stored exclusively on your device.
* **Data Vault (Backup & Restore):** 1-tap export of your complete athletic history to a standardized `.json` backup file with instant restoration.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 14](https://nextjs.org/) (App Router, React 18) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) |
| **Styling** | [Tailwind CSS 3](https://tailwindcss.com/) with custom design tokens |
| **State Management** | [Zustand](https://zustand-demo.pmnd.rs/) with localStorage persistence & migration |
| **Data Visualization** | [Recharts](https://recharts.org/) (Custom Volume Load & Fatigue charts) |
| **AI Engine** | [Google Gemini API](https://ai.google.dev/) (`gemini-2.5-flash` / `gemini-1.5-flash`) |
| **Barcode Scanning** | [@zxing/browser](https://github.com/zxing-js/browser) + [Open Food Facts](https://world.openfoodfacts.org/) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Offline Caching** | Native PWA Service Worker (`CacheStorage` API) |
| **Testing** | Automated Comprehensive QA & Experiment Suites (Node.js + `tsx`) |

---

## 🧪 Automated QA Testing

ASCEND enforces a strict 5-tier verification gate across all mathematical models, strength coefficients, autoregulation drift calculations, and UI builds:

```bash
# 1. Type check (0 errors)
npx tsc --noEmit

# 2. Lint check (0 errors, 0 warnings)
npm run lint

# 3. Comprehensive QA Test Suite (251 automated tests)
npx tsx tests/comprehensive-qa.ts

# 4. Experiment & Adaptation Features QA Suite (59 automated tests)
npx tsx tests/experiment-features-qa.ts

# 5. Production Next.js Build (11 static & dynamic routes)
npm run build
```

---

## 💻 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) 18.17 or later
* npm, yarn, or pnpm

### 1. Clone the repository
```bash
git clone https://github.com/1shivam3/ascend.git
cd ascend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Run development server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for production
```bash
npm run build
npm run start
```

---

## 📱 Mobile & PWA Installation

* **Chrome (Android):** Tap the menu icon $\rightarrow$ **"Install App"** or **"Add to Home Screen"**. Runs fullscreen with zero browser chrome and instant offline launch.
* **Safari (iOS):** Tap the Share button $\rightarrow$ **"Add to Home Screen"**.
* **Native APK (Capacitor):**
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
