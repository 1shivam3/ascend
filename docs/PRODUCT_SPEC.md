# ASCEND — Product Specification

## 1. Executive Summary & Core Philosophy

**ASCEND** is an Android-first fitness-RPG application engineered to turn real-world physical training into meaningful, deterministic character progression.

### 1.1 Core Idea
> *"Turn real-world training into character progression."*

Most fitness apps fail because tracking feels like clerical data entry. Most gamified fitness apps fail because they use childish gimmicks, superficial badges, or cartoonish skins that serious lifters abandon within two weeks.

ASCEND bridges this divide:
1. **Uncompromised Fitness Tracking:** A lightning-fast, tactile, low-friction workout logger that rivals dedicated tools (Strong, Hevy) in speed and ergonomics.
2. **Deterministic RPG Progression:** Real mechanical progression where every single set, rep, kilo, and streak translates directly into character attributes, ranks, mastery tiers, and achievements through mathematically sound curves.
3. **No Plagiarism / Original Identity:** ASCEND is built on an original dark tactical, celestial-cyberpunk aesthetic: obsidian slate, neon cyan/amber accents, brutalist typography, and geometric heraldry. It avoids all copyrighted tropes, names, and assets from anime or existing commercial games.

---

## 2. Target Audience & Personas

| Persona | Profile | Core Motivations | App Value |
| :--- | :--- | :--- | :--- |
| **The Hardcore Lifter ("Vanguard")** | 20-35 yrs old, trains 4-6x/week, tracks RPE, 1RM, volume | Relentless progression, PR tracking, data depth | First-class Exercise Mastery, estimated 1RM curves, RPE/RIR tracking, zero fluff |
| **The Gamified Athlete ("Operator")** | 18-30 yrs old, loves RPGs/Souls/Sci-Fi, goes to gym but loses motivation | Visible progression feedback, daily quests, leveling up | Tangible character level, rank badges, deterministic attribute allocation |
| **The Calisthenics / Hybrid Trainee ("Scout")** | Trains bodyweight, kettlebells, running, and weights | Versatility, endurance, agility stats | Agility and Stamina attributes, weighted pull-up mastery, bodyweight scaling |
| **The Returning Novice ("Initiate")** | Inconsistent gym goer, easily overwhelmed | Clear direction, habit building, daily structure | AI-assisted routine builder, streak freeze grace, accessible daily quests |

---

## 3. Core Product Loop

```
┌────────────────────────────────────────────────────────┐
│                      ONBOARDING                        │
│  Fitness Baseline • Equipment • Training Archetype     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                   DAILY HUD & QUESTS                   │
│  Daily Directives • Streak Status • Ready Routines     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                 WORKOUT EXECUTION                      │
│  Tactile Set Logger • Rest Timer • RPE • 1RM Tracking  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│              DETERMINISTIC TALLY ENGINE                │
│  Volume Calculated • PRs Detected • XP Minted          │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
┌──────────────────────────┐┌────────────────────────────┐
│   GLOBAL CHARACTER XP    ││   EXERCISE MASTERY XP      │
│ Level • Rank • Attributes││ Lift Level • Mastery Rank  │
└────────────┬─────────────┘└────────────┬───────────────┘
             └─────────────┬─────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│              ACHIEVEMENTS, STREAKS & SOCIAL            │
│  Badges Unlocked • Grace Period Updated • Leaderboard  │
└────────────────────────────────────────────────────────┘
```

---

## 4. Key Feature Specifications

### 4.1 Fitness Tracker & Workout Logger
* **Active Workout HUD:** Sticky bottom controls, quick-tap weight/reps keypad, auto-populating previous set data as ghost placeholders.
* **Plate Calculator:** Real-time visual plate breakdown for standard Olympic barbells (45lb/20kg base bar + combinations of 25, 20, 15, 10, 5, 2.5, 1.25 kg/lbs).
* **Set Categorization:** Normal, Warm-up, Drop Set, Failure/Top Set. Warm-up sets do not taint PR records but yield modest XP.
* **RPE / RIR Tracking:** Optional 1-10 Rate of Perceived Exertion or Reps In Reserve slider for autoregulation.
* **Rest Timer:** Precision foreground countdown with configurable haptic vibrations and sound alerts. Runs in background via timestamp diffing.
* **Supersets & Circuits:** Ability to group two or more exercises with interleaved logging.

### 4.2 First-Class Exercise Mastery System
Each individual movement in the catalog possesses an independent progression track:
* **Mastery Level (1–100):** Visualized with tiered emblems (Novice → Apprentice → Specialist → Master → Grandmaster → Ascendant).
* **Mastery XP:** Calculated strictly from tonnage, intensity (% of 1RM), and quality of execution.
* **Estimated 1RM Tracking:** Dynamic Brzycki/Epley curve calculation with instant PR celebration when broken.
* **Lifetime Exercise Telemetry:**
  * Total volume lifted (kg / lbs)
  * Total sets and reps logged
  * All-time best set (weight × reps)
  * Progression velocity graph (rolling 30-day, 90-day, 1-year 1RM curve).
* **Decoupling from Character Stats:** An athlete can possess Global Level 42 and Strength 74, while their Bench Press is Level 27, Squat is Level 24, and Deadlift is Level 31.

### 4.3 Character RPG Progression
* **Global Character Level (1–100+):** Soft-capped milestone curve requiring compounding XP.
* **Ranks:**
  1. *Initiate* (Levels 1–19)
  2. *Adept* (Levels 20–39)
  3. *Vanguard* (Levels 40–59)
  4. *Centurion* (Levels 60–79)
  5. *Sovereign* (Levels 80–99)
  6. *Ascendant* (Level 100)
* **Five Core Attributes:**
  * **Strength (STR):** Driven by heavy compound load, high peak 1RMs, and overall tonnage.
  * **Stamina (STA):** Driven by workout density, high-rep sets, endurance movements, and short rest intervals.
  * **Agility (AGI):** Driven by calisthenics, bodyweight power-to-weight exercises, mobility drills, and explosive plyometrics.
  * **Discipline (DIS):** Driven by adherence to planned workout days, streak consistency, and completing daily directives.
  * **Vitality (VIT):** Driven by active recovery, rest day compliance, deload weeks, and sleep/hydration tracking.

### 4.4 Quests System
* **Daily Directives (3 per day):** Generated at midnight local time based on training schedule (e.g., "Complete Today's Push Session", "Log 3 Sets to Failure", "Achieve 8,000kg Total Tonnage").
* **Weekly Feats:** Multi-day objectives (e.g., "Hit 4 Workout Sessions This Week", "Increase Bench Volume by 5%").
* **Ascension Milestones:** Long-term achievements formatted as epic campaign quests (e.g., "Surpass 1,000kg Club across Big Three", "Reach Level 50 Mastery on Squat").

### 4.5 Streaks & Fatigue Management (Rest Day Grace)
* **Rest Day Protection:** Rest days defined in a user's active workout plan do NOT break streaks. Instead, they mark the day as "Regeneration Active", awarding Vitality XP.
* **Streak Freeze Tokens:** Earned by maintaining a 14-day streak, maximum 2 tokens banked. Automatically consumed if an unplanned missed day occurs.

### 4.6 AI Assistant ("Ascend Core AI")
* **Role:** Intelligent tactical advisor and workout architect.
* **Capabilities:**
  * Generates bespoke periodized workout routines based on available equipment, injuries, and target split.
  * Suggests live set adjustments: "You hit 3 reps over target on Set 1; consider bumping weight by 2.5kg for Set 2."
  * Deload recommendations: Flags systemic fatigue when volume/velocity drops across 3 consecutive sessions.
* **Strict Boundary:** AI *never* calculates or modifies XP, levels, attributes, or ranks directly. All RPG values are computed by the deterministic client/server engine.

### 4.7 Leaderboards & Social Layer
* **Strict Opt-In:** All fitness data is private by default. Users must explicitly enable "Competitive Transmissions" to appear on leaderboards.
* **Fair Bracketing:** Division matching by weight class, training age, or level tier to prevent novice discouragement.
* **Anonymity Controls:** Display name aliases, private profiles, and hidden load metrics.

---

## 5. Visual Identity & Design Guidelines

* **Palette:**
  * Background: Obsidian Base (`#0B0D13`), Dark Slate Surface (`#141824`), Elevated Card (`#1C2234`)
  * Accents: Electric Cyan (`#00F0FF`) for UI/Tech, Solar Amber (`#FFB800`) for PRs/Mastery, Hyper Violet (`#8B5CF6`) for Ascensions, Crimson Alert (`#FF3366`) for strain/failure.
  * Text: Primary White (`#F8FAFC`), Muted Steel (`#94A3B8`), Subtle Slate (`#64748B`).
* **Ergonomics:**
  * High-contrast OLED dark theme optimized for harsh gym lighting.
  * Minimum 48×48 dp touch targets for gym fingers with chalk or sweat.
  * Bottom-anchored interactions for seamless one-handed operation on modern Android devices.

---

## 6. Specification Contradictions & Resolution

1. **Daily Quests vs. Planned Rest Days:**
   * *Contradiction:* Daily quests typically require working out, which penalizes mandatory rest days.
   * *Resolution:* On rest days, Daily Directives dynamically shift to recovery-oriented objectives: "Log active recovery walk / mobility session", "Review exercise mastery graphs", or "Record hydration/nutrition baseline".
2. **Global Strength vs. Independent Exercise Mastery:**
   * *Contradiction:* If Strength is an attribute, does increasing Bench Mastery automatically increase Strength?
   * *Resolution:* Yes, but as an aggregated byproduct. Global Strength is an aggregate index computed from all compound exercise masteries combined with lifetime tonnage. Mastery is the granular skill tree; Strength is the composite summary attribute.
3. **Offline AI Workouts:**
   * *Contradiction:* Gemini requires internet connectivity, but app is offline-first.
   * *Resolution:* The app stores deterministic procedural workout templates locally (Push/Pull/Legs, Upper/Lower, 5/3/1). If offline, routine generation uses rule-based heuristics. When online, Gemini provides deep AI contextual adaptation.
