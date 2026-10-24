# ASCEND — Personalization Specification

**Date:** 2026-10-25  
**Document:** `docs/ux-redesign/personalization-spec.md`  
**Focus:** Theme Engine, Simple vs Detailed Mode, Dashboard Card Customization, and Persistence

---

## 1. Accent Theme Architecture

The user can personalize the primary accent color without breaking contrast, status colors, or brand cohesion.

### 1.1 Stored Preferences
In `src/lib/types.ts` and `src/lib/store.ts`:
```typescript
export type AccentPreset = 'vermilion' | 'amber' | 'cobalt' | 'emerald' | 'silver' | 'crimson';

export interface AccentThemeConfig {
  preset: AccentPreset;
  customHex?: string; // Optional custom color
}

export type InformationDensityMode = 'simple' | 'detailed';

export interface DashboardCardPreferences {
  showHero: boolean;
  showHabits: boolean;
  showNutrition: boolean;
  showAthleteModel: boolean;
  showPRs: boolean;
  showWeeklyReview: boolean;
}
```

### 1.2 CSS Custom Property Injection
When a user switches their accent preset or enters a custom hex, the theme engine computes the RGB triplet and sets CSS variables directly on `document.documentElement`:
- `--accent`: RGB triplet (e.g. `228 68 39` for Vermilion, `59 130 246` for Cobalt).
- `--accent-dim`: Darker variant for hover/active states.
- `--accent-glow`: 20% opacity glow for cards and focus rings.
- `--accent-hex`: HEX string.
- `--accent-text`: High-contrast accessible text color derived from luminance.

### 1.3 Semantic Isolation
Customizing the accent NEVER touches:
- Red / Danger (`#EF4444` / `#B42318` - for errors, delete account, and failed sets).
- Green / Success (`#22C55E` / `#16A34A` - for completed sets, protein goals).
- Amber / Warning (`#F59E0B` - for rest timer overtime, deload alerts).
- Blue / Water (`#38BDF8` - for hydration tracking).

---

## 2. Simple vs Detailed Mode

### 2.1 Simple Mode (Default)
- **Target Audience:** Beginners, general fitness, time-constrained lifters, and minimalists.
- **Home Screen:**
  - Hero Training Card (Today's Scheduled Routine + Big Start Button).
  - Quick Habit Strip (Hydration, Creatine, Readiness in one compact row).
  - Macro Balance Card (Target vs Intake).
  - Secondary analytics (DOTS radar chart, Athlete Model raw recovery scores) are hidden.
- **Active Workout:**
  - Straightforward weight, reps, and checkmark. RPE and tempo inputs are collapsed behind a "More" trigger.

### 2.2 Detailed Mode
- **Target Audience:** Powerlifters, bodybuilders, competitive athletes, and data analysts.
- **Home Screen:**
  - Includes all Simple mode modules plus:
  - Athlete Model Recovery & Fatigue score.
  - Recent PR leaderboard strip.
  - Coach Weekly Review & deload recommendation card.
- **Active Workout:**
  - RPE and RIR selectors displayed inline per set.
  - Plate calculator quick-tap button on every barbell exercise.

---

## 3. Preference Persistence & Safe Reset

1. **Storage Location:** Stored in `ascend_user_preferences` via Zustand persist middleware backed by `localStorage` (and synchronized with Supabase profile metadata for authenticated users).
2. **Backward Compatibility:** If no preferences exist, defaults to:
   - `accentTheme: 'vermilion'`
   - `densityMode: 'simple'`
   - All standard dashboard cards enabled.
3. **One-Tap Reset:** In Settings, a prominent `"Reset to Default ASCEND Theme"` button instantly restores Vermilion `#E44427`, Simple mode, and default card layout.
