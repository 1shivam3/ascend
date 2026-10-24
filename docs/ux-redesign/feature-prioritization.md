# ASCEND — Feature Prioritization & Progressive Disclosure

**Document:** `docs/ux-redesign/feature-prioritization.md`  
**Phase:** 5 — Progressive Disclosure Architecture  
**Target:** ASCEND Web Application (`feat/webapp`)  
**Status:** Approved & Implemented

---

## 1. Executive Summary & Design Rationale

During Phase 1 (Baseline Simulation), user testing revealed severe cognitive friction:
* **Persona 1 (Novice):** *"Felt like stepping into a commercial aircraft cockpit. I just wanted to know if I should do squats today, but was hit with fatigue decay curves and readiness algorithms."*
* **Persona 7 (Time-Constrained):** *"Too much scrolling to get to the 'Start Workout' button on days when I have 45 minutes."*
* **Persona 11 (Minimalist):** *"I want calm, high-contrast, uncluttered typography, not 14 distinct cards competing for my attention."*

Conversely, **Persona 4 (Strength Lifter)** and **Persona 8 (Detail Athlete)** demanded immediate visibility into estimated 1RM calculations, fatigue accumulation, RPE rating selectors, and auto-regulation suggestions.

To resolve this without diluting the product's athletic intelligence, ASCEND implements a **two-dimensional disclosure architecture**:
1. **Tiered Information Hierarchy (Tiers 1, 2, 3)**: Fundamental division between daily operational tasks and reflective analytical tools.
2. **Information Density Mode (`simple` vs `detailed`)**: An effortless user toggle accessible directly on the Home app bar and persisted in `uiPreferences.densityMode`.
3. **Card-Level Dashboard Customization**: Granular switches in Settings (`dashboardCards`) allowing users to show or hide individual home modules.

---

## 2. Three-Tier Feature Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│ TIER 1: CORE DAILY DRIVERS (Zero-Friction Operations)           │
│  - Today's Routine Hero Card & "Start Workout" CTA              │
│  - Quick Macro Summary (Calories & Protein targets)             │
│  - Today's Habit Quick-Check (Hydration, Creatine, Steps)       │
│  - Fast Action Hub (Scan Meal, Barcode Scanner, Log Weight)     │
│  - Persistent Primary Navigation (Today, Train, Fuel, Progress) │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│ TIER 2: CONTEXTUAL ASSISTANCE (Appears When Relevant)           │
│  - Non-Obstructive Floating Rest Timer Dock (+30s / Skip)       │
│  - Crowded-Gym Equipment Swap Switcher ("Gym Packed")           │
│  - In-Workout Previous Performance Indicators (Prev: 100kg × 8) │
│  - Protein Gap Recommendation Banner (Leaf notification)        │
│  - Post-Workout Celebration Bottom Sheet (Dismissible)          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│ TIER 3: ATHLETE INTELLIGENCE & DEEP DIVE (Reflective)           │
│  - Multi-Component Athlete Model (Readiness & Fatigue curves)   │
│  - Coach Weekly Digest & Calorie Target Adaptation              │
│  - 1RM Strength Tier Ladders (Novice to Elite standards)        │
│  - Meet Attempt Planner & Powerlifting Coefficients             │
│  - Visual Theming Engine (6 Presets + Custom Color Wheel)       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Simple Mode vs. Detailed Mode Matrix

| Screen / Feature | Simple Mode (Default / Focus) | Detailed Mode (Athlete / Power) |
| :--- | :--- | :--- |
| **Home: Athlete Insights** | Collapsed under an elegant single-card expandable container (`Athlete Insights & Readiness`), displaying score badge. | Fully unfolded: Readiness score card, XP Level progress ladder, Athlete Model recovery bars, and Coach Weekly Review card. |
| **Home: Secondary Habits** | Clean daily checkmarks and one-tap hydration stepper (+250ml). | Full 7-day Habit Matrix grid showing completion history across Gym, Water, Creatine, and Protein. |
| **Home: Challenges & Quests** | Hidden from daily view to eliminate gamification pressure. | Monthly Challenge card with progress bar, active quest status, and XP reward badges. |
| **Active Workout: Screen Layout** | Clean set rows (Set #, Previous, Weight, Reps, Checkmark). Focused on smooth, distraction-free logging. | Exposes RPE / RIR tag selectors (@7, @8, @9), %1RM auto-regulation badges, and tempo cues. |
| **Active Workout: Rest Timer** | Compact floating dock at bottom right with time and skip button, never blocking the exercise list. | Floating dock with expandable controls (-30s, +30s, pause, custom sound trigger). |
| **Active Workout: Set Complete** | Non-blocking bottom modal with celebratory pill and large (≥48px) rest controls; dismissible with 1 tap. | Complete set review with PR comparison, set velocity estimate, and next set weight prediction. |
| **Nutrition: Fuel Dashboard** | Calorie & Protein balance bars, quick natural-language input bar, and meal slot cards. | Micro-nutrient breakdowns (Carbs, Fats, Fiber, Sodium), Oil/Ghee cooking modifiers, and daily calorie drift analysis. |
| **Progress: Analytics** | Clean bodyweight trend chart and recent Personal Records timeline. | Multi-metric interactive SVG charts, 1RM estimates over time, powerlifting totals (DOTS/Wilks), and volume breakdown by muscle group. |

---

## 4. User Configuration & Preference Persistence

All disclosure preferences are persisted automatically via Zustand and `localStorage`:

```typescript
// Persisted under `uiPreferences` in src/lib/store.ts
export interface DashboardCardPreferences {
  showHero: boolean;          // Today's scheduled routine card
  showHabits: boolean;        // Hydration & daily checklist
  showNutrition: boolean;     // Macro calories & protein summary
  showAthleteModel: boolean;  // Coach fatigue & readiness model
  showPRs: boolean;           // Recent PRs leaderboard strip
  showWeeklyReview: boolean;  // Coach weekly recap and adjustments
}

export interface UiPreferences {
  accentPreset: AccentPreset;                  // vermilion, amber, cobalt, emerald, silver, crimson, custom
  customAccentHex?: string;                    // Valid hex string if custom
  densityMode: InformationDensityMode;         // 'simple' | 'detailed'
  dashboardCards: DashboardCardPreferences;    // Granular card visibility
  gamificationEnabled: boolean;                // XP and challenges
  coachEnabled: boolean;                       // Readiness and AI adjustments
  showHabitMatrix: boolean;                   // 7-day habit grid
}
```

---

## 5. First-Run & Progressive Expansion Rules

1. **Day 1 (Onboarding Complete):**
   * Default to **Simple Mode**.
   * Only the Hero Workout card, daily water intake, and calorie/protein targets are prominent.
   * Athlete Model displays: *"Gathering baseline: complete 3 workouts to unlock personalized fatigue modeling."*
2. **Day 7 (Consistent Logger):**
   * App surfaces a subtle notification: *"Your first 5 sessions are logged. Ready to explore athlete fatigue recovery trends?"*
   * User can tap "Try Detailed Mode" or keep Simple Mode.
3. **Always User-Controlled:**
   * Switching between Simple and Detailed mode is a single tap on the Home screen header pill.
   * Any change applies instantly without full-page reload or losing unsaved drafts.
