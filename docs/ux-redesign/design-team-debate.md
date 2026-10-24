# ASCEND — Design Expert Review Debate

**Date:** 2026-10-25  
**Document:** `docs/ux-redesign/design-team-debate.md`  
**Panel:** 8 Cross-Functional Roles (Product, Visual, Interaction, Fitness, Accessibility, Architecture, Skeptic, Moderator)  
**Input:** `baseline-audit.md` and `synthetic-personas-round-1.md`

---

## The Panel Members

1. **Expert A — Principal Product Designer (Maya Lin):** Focus on overall product journey, progressive disclosure, and user intent.
2. **Expert B — Senior Visual Designer (Julian Vance):** Focus on typography, layout rhythm, editorial hierarchy, and brand expression.
3. **Expert C — Senior Interaction Designer (Tariq Chen):** Focus on tap ergonomics, modal transitions, and in-gym friction.
4. **Expert D — Fitness Product Specialist (Coach Sarah Briggs):** Focus on authentic lifting workflows, training integrity, and nutrition utility.
5. **Expert E — Accessibility Specialist (Elena Rostova):** Focus on WCAG 2.2 AA, touch targets, font scaling, and color independence.
6. **Expert F — Frontend Architecture Engineer (Kenji Sato):** Focus on Next.js/React performance, state boundaries, and regression safety.
7. **Expert G — Skeptical Product Reviewer (Arthur Dent):** Focus on stripping fluff, questioning decorative widgets, and ruthlessly prioritizing value.
8. **Expert H — Research Moderator (Dr. Aris Thorne):** Enforces evidence-based decisions, records dissent, and synthesizes trade-offs.

---

## Round 1 — Independent Critiques

### Expert A (Product):
> "The current application treats every feature as equally urgent. On the Home tab alone, we have 9 distinct card modules: daily quote, streak counter, training session, nutrition macros, readiness score, athlete tier, PR strip, friend challenges, and coach weekly review. A user opening the app to lift has to scroll past 6 cards just to start their session. We must establish a clear hierarchy: Today's Action first, Today's Fuel second, Everything Else secondary."

### Expert B (Visual):
> "Visually, the app has good bones in its Vermilion/Graphite/Chalk identity, but it suffers from 'card-soup syndrome'. Everything is in a rounded rectangle with a 1px border. There is no editorial rhythm. Headings are either too small (`title` at 17px) or awkwardly uppercase. We need strong typographic contrast: an authoritative editorial display font for page moments, crisp tabular figures for lifting numbers, and subtle surface layering rather than endless border lines."

### Expert C (Interaction):
> "The Active Workout screen is a gym liability. The stepper buttons (`+` and `-`) have hitboxes under 36px. When an athlete is fatigued, sweaty, and holding a phone with one hand between sets of deadlifts, tapping a 32px stepper is frustrating. Furthermore, the rest timer sheet automatically slides up and blocks the view of the next set, forcing a manual swipe to dismiss. Set completion must be a prominent, satisfying, single-tap action (minimum 48px target) with zero modal obstruction."

### Expert D (Fitness):
> "ASCEND's lifting calculations (Epley/Brzycki 1RM, DOTS, Wilks, RPE) are scientifically sound, but we present them in ways that alienate non-powerlifters. A beginner doing dumbbell curls does not need a DOTS score or a radar chart on their home screen. Conversely, powerlifters need plate loading math right next to the weight input, not buried in a menu. The solution is context-awareness: show strength standards when viewing PRs, not on every screen."

### Expert E (Accessibility):
> "We have text tags using `text-3xs` (10px) and `text-2xs` (10.4px) with muted gray colors (`#6E6A5E` on dark cards). In a dimly lit gym or for lifters over 40 without reading glasses, this is unreadable. All primary metrics and input labels must meet a minimum 14px size, touch targets must be at least 44x44px, and accent color switching must never allow low-contrast combinations that break WCAG AA."

### Expert F (Architecture):
> "We must respect the existing Next.js 14 SPA architecture and Zustand store. `src/lib/store.ts` already has robust offline persistence and Supabase synchronization. We should NOT rewrite state logic to fix styling. We need a clean, centralized design token system in CSS/Tailwind, and dynamic theme switching must be implemented via CSS custom properties on `:root` without re-rendering the entire React tree."

### Expert G (Skeptic):
> "Why does the Home tab have a motivational quote card taking up 120 vertical pixels on mobile? Why are friend challenges shown to a solitary lifter who has zero friends added? It is vanity clutter. If a card provides zero actionable value today, it should be collapsible or hidden. Let users declutter their dashboard."

### Expert H (Moderator):
> "The panel agrees on three core defects:
> 1. Excessive clutter and lack of progressive disclosure.
> 2. Sub-par touch ergonomics during live workout logging.
> 3. Visual monotony from repetitive card containers.
> Let us debate the 6 most contentious architectural questions."

---

## Round 2 — Direct Disagreements & Debates

### Debate 1: Primary Navigation — Keep 4 Tabs or Restructure?
- **Proposal A (Expert A & C):** Keep the 4 core destinations: **Today** (`/`), **Train** (`workout`), **Fuel** (`meals`), and **Progress** (`progress`). Move Profile and Settings to top-bar icons on Today.
- **Proposal B (Expert G):** Reduce to 3 tabs: Combine Train and Today.
- **Objection (Expert D):** Combining Today and Train creates cognitive confusion between "What I have scheduled today" vs "My complete library of routines and history".
- **Decision:** **Keep 4 primary bottom navigation destinations:**
  1. **Today:** Actionable daily hub (today's workout, today's macros, daily habits, quick resume).
  2. **Train:** Program hub, routine library, exercise database, and workout history.
  3. **Fuel:** Daily nutrition, meal loggers, barcode & AI photo scan, hydration.
  4. **Progress:** Longitudinal analytics, strength progression charts, personal records, and body composition.
  - Profile and Settings live cleanly in the top app bar on Today and Train.

### Debate 2: Home Screen — Information Density & Simple vs Detailed Mode
- **Proposal A (Expert G):** Strip Home down to 2 cards: Workout & Macros.
- **Proposal B (Expert D & F):** Keep all modules for powerlifters who want readiness, streak, PRs, and coach advice.
- **Resolution:** **Progressive Disclosure with "Simple" and "Detailed" Mode + Card Customization:**
  - **Simple Mode (Default):** Shows only the essentials: Daily Focus Hero (Today's Workout or Rest Day guidance), Macro Balance Card, and Consistency Streak.
  - **Detailed Mode:** Reveals Athlete Model Readiness, Recent PR strip, and Weekly Review.
  - Users can toggle between Simple and Detailed with one tap in Settings or directly on Home, and can toggle individual card visibility in Settings.

### Debate 3: Active Workout Screen Ergonomics
- **Proposal A (Expert C):** Redesign each exercise as a clean, focused card. The current set is expanded with massive touch targets (48px stepper and checkbox); completed sets collapse into compact, high-legibility rows.
- **Proposal B (Expert E):** Ensure the rest timer is a non-blocking floating pill or bottom docking bar, NEVER an obstructive full-height modal sheet.
- **Decision (Unanimous):** Implement the **Focused-Set Ergonomic Architecture**:
  - Top: Workout timer, exercise name, and superset indicator.
  - Active set: Large, high-contrast inputs for Weight and Reps with dedicated quick-steppers (`+2.5kg`, `+5kg`, `+1 rep`) and a 52px Vermilion checkmark button.
  - Previous performance shown inline directly below the active inputs (`Last: 100kg × 8 @ RPE 8`).
  - Rest timer renders as an integrated non-blocking persistent bottom bar with quick `+30s` and `Skip` controls.

### Debate 4: Accent Color & Theme Customization System
- **Proposal A (Expert B):** Keep Vermilion `#E44427` as the immutable brand color. Do not allow users to change it.
- **Proposal B (Expert E & G):** Allow user-controlled accent themes, but restrict choices to high-contrast, curated athletic palettes.
- **Decision:** **Curated Preset Theme Engine with Vermilion as Default:**
  - Default: **ASCEND Vermilion** (`#E44427` / `#EB4E30` in dark mode)
  - Preset 1: **Volt Amber** (`#F59E0B` - warm energy)
  - Preset 2: **Electric Cobalt** (`#3B82F6` - focused strength)
  - Preset 3: **Hyper Emerald** (`#10B981` - vitality & recovery)
  - Preset 4: **Monochrome Silver** (`#E2DFD6` / `#9CA3AF` - minimalist chalk)
  - Preset 5: **Crimson Red** (`#EF4444` - intense powerlifting)
  - Optional custom HEX selector with automatic luminance contrast verification against `#171916` Graphite and `#F3F0E7` Chalk.
  - Implemented cleanly using CSS variables `--accent`, `--accent-dim`, `--accent-glow`, `--accent-on`, ensuring 100% theme persistence in `store.ts`.

### Debate 5: Settings Reorganization
- **Critique (Expert G & E):** The current Settings is an endless 980-line scrolling list mixing audio beeps with account deletion.
- **Decision:** Reorganize Settings into **5 Logical Clustered Sections**:
  1. **Personalization & Theme:** Accent theme picker, Simple/Detailed mode, Dark/Light mode, Language (EN/HI).
  2. **Training Preferences:** Rest timer defaults, weight units (kg/lbs), plate calculator bar weight, RPE tracking toggle.
  3. **Nutrition & Habits:** Daily calorie/macro targets, water reminder intervals, creatine tracking.
  4. **Data & Cloud Sync:** Supabase cloud backup status, JSON export/import, CSV workout download.
  5. **Account & Security (Danger Zone):** Profile info, telemetry consent, irreversible account deletion.

---

## Round 3 — Moderator Synthesis & Acceptance Criteria

**Dr. Aris Thorne (Moderator):**
"All decisions are grounded in the actual codebase capabilities. No existing calculation, database table, or feature will be deleted. The redesign will transform the presentation layer:
1. **Unify the design system:** Consistent tokens across all 30 screens and states.
2. **Elevate Active Workout:** 48px+ touch targets, non-blocking rest timer, inline historical best.
3. **Calm the Home Dashboard:** Simple mode default, progressive disclosure for advanced lifters.
4. **Empower Personalization:** Vermilion default with curated accent presets and persistent settings.
5. **Streamline Settings:** Grouped, searchable, reversible preference sections."
