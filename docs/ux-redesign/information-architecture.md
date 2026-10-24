# ASCEND — Information Architecture & User Flow Specification

**Date:** 2026-10-25  
**Document:** `docs/ux-redesign/information-architecture.md`  
**Purpose:** Rebuild the global navigation hierarchy, page layout, modal orchestration, and core user flows.

---

## 1. Global Navigation Architecture

The app uses a unified, persistent **4-Destination Bottom Navigation Bar** on mobile viewports, transitioning to a clean, ergonomic **Sidebar / Top-Nav** on desktop (`md:` / `lg:` viewports).

```
[ App Root (SPA) ]
  ├── Onboarding / Welcome (when profile == null)
  ├── Global Top App Bar (Brand mark, Streak, Profile avatar, Settings trigger, Sync status)
  │
  ├── 1. Today Tab (`home`)
  │     ├── Hero: Daily Training Focus (Scheduled routine, "Start Workout" or Active session banner)
  │     ├── Quick Habit Strip (Hydration quick-add, Creatine check, Readiness score)
  │     ├── Today's Fuel Summary (Calories, Protein, Carbs, Fat ring/bar + "Log Meal" CTA)
  │     └── [Detailed Mode Only]:
  │           ├── Athlete Model Recovery & Fatigue Status
  │           ├── Recent PR Leaderboard Strip
  │           └── Weekly Review & Debrief Card
  │
  ├── 2. Train Tab (`workout`)
  │     ├── Active Workout Drawer / Screen (when activeWorkoutDraft != null)
  │     ├── Quick Start Session (Empty Workout)
  │     ├── Planned Routines Library (Push, Pull, Legs, Custom splits)
  │     ├── Periodization Coach Blocks & Program Importer
  │     └── Workout History & Past Session Details
  │
  ├── 3. Fuel Tab (`meals`)
  │     ├── Daily Macro Summary (Target vs Intake, Calorie progress)
  │     ├── 4 Meal Slots (Breakfast, Lunch, Dinner, Snacks) with inline "+ Add Food"
  │     ├── Smart Logging Tools (Barcode Scanner modal, AI Photo Scanner modal, Quick-Calorie modal)
  │     └── Water & Habit Tracking Matrix
  │
  ├── 4. Progress Tab (`progress`)
  │     ├── Top Segmented Control: [Strength Analytics] | [Personal Records & Standards] | [Body Composition]
  │     ├── Sub-view A: Strength Progression (Lift charts with 1M, 3M, 1Y, All time filters)
  │     ├── Sub-view B: PR Leaderboard (Squat, Bench, Deadlift, 1RM formulas, DOTS score)
  │     └── Sub-view C: Body Weight, Body Fat, and Progress Photo Gallery
  │
  └── Overlay Surfaces (Contextual Modals & Sheets):
        ├── Profile Sheet (Athlete bio, rank badge, unit toggles)
        ├── Settings Modal (Grouped preferences, theme picker, data backup, danger zone)
        ├── Exercise Library & Technique Demo Modal
        ├── Rest Timer Floating Dock
        └── Barcode / AI Meal Scanner Modal
```

---

## 2. Core User Flows (Redesigned)

### Flow 1: Daily Workout Logging (Gym Money-Path)
1. **Entry:** Athlete opens app on mobile.
2. **Landing:** Today tab immediately displays the **Daily Training Hero Card**: `"Leg Day (Hypertrophy) — 5 Exercises"`.
3. **Action:** Athlete taps primary coral button: `▶ Start Workout`.
4. **Active Workout State:**
   - Bottom navigation automatically docks away to maximize vertical screen real estate.
   - Top bar displays elapsed timer, current exercise title, and a non-destructive `"Minimize"` button.
   - Exercise 1 (Barbell Back Squat) is focused. Previous best (`140kg × 5`) is shown directly under the active set inputs.
   - Athlete enters weight & reps using high-contrast 48px stepper controls.
   - Athlete taps the 52px Vermilion Checkmark button.
5. **Rest Phase:**
   - Set row turns into an elegant muted completed state.
   - Rest timer starts automatically as a non-blocking bottom bar (`01:30` countdown with `+30s` and `Skip`).
   - The athlete can already review the next set or upcoming exercises without dismissing anything.
6. **Finish:**
   - After final set, athlete taps `"Finish Workout"`.
   - Clear summary card displays authentic stats: duration, total volume tonnage, and any genuine PRs unlocked.
   - Tapping `"Done"` saves state to durable Room/Zustand storage and returns to Today tab with updated streak and training status.

### Flow 2: Rapid Nutrition & Macro Logging
1. **Entry:** Athlete taps the **Fuel** tab.
2. **Action:** Under "Lunch", athlete taps `+ Add Food`.
3. **Choice:** Quick search modal opens with immediate options:
   - Search bar (500+ Indian & international foods with Devanagari transliteration).
   - Barcode scan button (instant camera view for packaged foods).
   - AI camera button (snap photo of dish).
4. **Selection:** Athlete selects `"Paneer Bhurji"`, adjusts serving weight (`150g`), and taps `"Log to Lunch"`.
5. **Feedback:** Macro rings animate smoothly to reflect +22g Protein, +18g Fat, +6g Carbs. No page reloads.

### Flow 3: Personalization & Accent Theming
1. **Entry:** Athlete taps Settings icon in the top app bar.
2. **Section:** Top section is `"Appearance & Theme"`.
3. **Action:** Athlete sees swatches:
   - **ASCEND Vermilion** (Active)
   - **Volt Amber**
   - **Electric Cobalt**
   - **Hyper Emerald**
   - **Monochrome Silver**
   - **Crimson Red**
   - **Custom Hex**
4. **Interaction:** Tapping **Electric Cobalt** instantly updates CSS variables across all active components, cards, tabs, and buttons without page refresh.
5. **Persistence:** Preference is saved to local storage and persists across sessions.

---

## 3. Information Architecture Decision Matrix

| Screen / Feature | User Need | Placement | Default Visibility | Redesign Decision | Key Benefit |
|---|---|---|---|---|---|
| **Today Dashboard** | Assess today's focus in <3s | Today Tab (`/`) | Prominent | Reorganize into Hero card + Macro bar; move secondary cards to Detailed Mode | Eliminates 6-card scroll clutter; instant workout start |
| **Active Workout** | One-handed fast logging between sets | Modal / Dedicated route inside Train | Prominent when active | 48px+ touch targets, inline previous performance, non-blocking dock timer | 0% accidental set discards; gym-ergonomic hitboxes |
| **Plate Calculator** | Calculate barbell plate loading | Tool in ActiveWorkout & Train | Contextual popover | Visual barbell representation with color-coded Olympic plates | Eliminates mental math under fatigue |
| **Rest Timer** | Track rest intervals without distraction | Floating bottom dock | Active during rest | Replace full-screen modal with dockable, dismissable countdown bar | Never blocks view of upcoming sets |
| **Personal Records & Standards** | Check 1RM, DOTS score, and strength tier | Progress Tab (Sub-tab) | 1-tap discoverable | Separate from general home feed into a dedicated PR & Standards view | Beginners aren't intimidated; powerlifters get full analytics |
| **Nutrition Hub** | Log meals and view daily macro deficit | Fuel Tab (`meals`) | Prominent | Group by 4 daily meals with inline scanner actions and clear macro progress rings | 50% faster food entry; clear protein goal visibility |
| **Settings & Personalization** | Manage preferences without overwhelm | Top App Bar modal | Accessible from any tab | Group into 5 logical clusters; add Theme swatch selector and Simple/Detailed toggle | Clean, searchable, reversible preferences |
