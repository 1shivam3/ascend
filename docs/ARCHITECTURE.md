# ASCEND — Technical Architecture

## 1. Architectural Principles

ASCEND is designed around five foundational architectural tenets:

1. **Local-First as the Primary Source of Truth:** The application writes immediately to an embedded SQLite database. Network connectivity is never a prerequisite for workout logging, progression calculation, or browsing history.
2. **Deterministic Progression Engine:** Game logic (XP calculations, Mastery increments, Level-ups, PR detection) is executed via a pure, stateless mathematical domain engine mirrored identically in TypeScript (client) and PostgreSQL/Edge Functions (server).
3. **Strict Separation of Concerns:** UI components must never contain raw database queries, sync coordination, or progression formulas. Clean boundaries isolate domain services, reactive state, and persistence.
4. **Zero Client Secrets:** The mobile client possesses zero administrative or generative AI API keys. All third-party LLM queries pass through authenticated Supabase Edge Functions.
5. **Optimistic Ergonomics with Event Sourcing:** Workout sets and exercises are modeled as immutable events (`set_logs`, `xp_transactions`) rather than volatile in-place overwrites, making offline synchronization mathematically robust.

---

## 2. Technology Stack

```
┌────────────────────────────────────────────────────────┐
│                   CLIENT RUNTIME                       │
│  React Native (0.76+) • Expo (SDK 52+) • TypeScript    │
├────────────────────────────────────────────────────────┤
│  Navigation:    Expo Router v4 (Typed Routes)          │
│  UI Layer:      React Native Elements / Tailwind/StyleSheet │
│  Client State:  Zustand (Active session & UI state)    │
│  Async Query:   TanStack Query v5 (Data fetching/cache)│
│  Local DB:      Expo SQLite (Next API, WAL Mode)       │
│  Validation:    Zod Schemas (Runtime types & contracts)│
└──────────────────────────┬─────────────────────────────┘
                           │ (Encrypted HTTPS / WebSockets)
                           ▼
┌────────────────────────────────────────────────────────┐
│                  BACKEND (SUPABASE)                    │
│  PostgreSQL 16 • PostgREST API • GoTrue Auth • Realtime│
├────────────────────────────────────────────────────────┤
│  Edge Functions: Deno / TypeScript                     │
│  AI Gateway:     Google Gemini 1.5 via Edge Functions  │
│  Security:       Row Level Security (RLS)              │
│  Storage:        Supabase Storage (User Assets/Avatars)│
└────────────────────────────────────────────────────────┘
```

---

## 3. Complete Folder Structure

The repository enforces a modular, feature-oriented structure with distinct architectural layers:

```
ascend/
├── .github/                       # CI/CD workflows, issue templates
├── assets/                        # Static assets (fonts, icons, illustrations)
│   ├── fonts/                     # Monospace & brutalist font files
│   ├── icons/                     # SVG tactical glyphs & rank emblems
│   └── splash/                    # Android adaptive splash screens
├── docs/                          # Architecture & design documents
│   ├── PRODUCT_SPEC.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── PROGRESSION_SYSTEM.md
│   ├── OFFLINE_SYNC.md
│   ├── AI_SYSTEM.md
│   └── DECISIONS.md
├── src/
│   ├── app/                       # Expo Router file-based route definitions
│   │   ├── (auth)/                # Authentication routes (sign-in, register, forgot-password)
│   │   │   ├── _layout.tsx
│   │   │   ├── login.tsx
│   │   │   └── register.tsx
│   │   ├── (onboarding)/          # First-time user setup & baseline questions
│   │   │   ├── _layout.tsx
│   │   │   ├── archetype.tsx
│   │   │   └── baseline.tsx
│   │   ├── (tabs)/                # Main bottom navigation tabs
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx          # HUD / Command Center (Dashboard)
│   │   │   ├── workouts/          # Workout templates & plan browser
│   │   │   │   ├── index.tsx
│   │   │   │   └── [planId].tsx
│   │   │   ├── exercises/         # Exercise Catalog & Mastery skill tree
│   │   │   │   ├── index.tsx
│   │   │   │   └── [exerciseId].tsx
│   │   │   ├── quests/            # Daily directives, weekly feats, campaigns
│   │   │   │   └── index.tsx
│   │   │   └── profile/           # Character sheet, attributes, achievements
│   │   │       ├── index.tsx
│   │   │       └── settings.tsx
│   │   ├── modals/                # Overlays and focus screens
│   │   │   ├── active-workout.tsx # Fullscreen active workout session logger
│   │   │   ├── rest-timer.tsx     # Fullscreen rest & plate visualizer
│   │   │   ├── level-up.tsx       # Celebration & reward splash
│   │   │   └── ai-generator.tsx   # AI Tactical Routine Architect sheet
│   │   ├── _layout.tsx            # Global root layout (Providers, Splash, SQLite init)
│   │   └── +not-found.tsx
│   ├── components/                # Shared atomic & molecular UI components
│   │   ├── ui/                    # Base primitives: Button, Card, Input, Text, Badge
│   │   ├── feedback/              # Modals, Toast, HapticFeedback, LoadingSkeletons
│   │   ├── layout/                # ScreenWrapper, SafeContainer, Header, TabBar
│   │   └── hud/                   # Tactical HUD elements: AttributeRadar, LevelOrb, PlateBar
│   ├── config/                    # Environment variables, constants, feature flags
│   │   ├── env.ts                 # Validated env via Zod
│   │   └── constants.ts           # App-wide constants (plate weights, timeout thresholds)
│   ├── constants/                 # Domain constants (ranks, levels, attributes)
│   │   ├── ranks.ts               # Rank boundaries, badge paths, titles
│   │   ├── attributes.ts          # Attribute definitions and multipliers
│   │   ├── exercises.ts           # Core starter exercise seed data
│   │   └── theme.ts               # Colors, typography, spacing, elevations
│   ├── database/                  # Local SQLite persistence layer
│   │   ├── migrations/            # Versioned SQL migration scripts for Expo SQLite
│   │   ├── repositories/          # Type-safe DAOs for SQLite operations
│   │   │   ├── WorkoutRepository.ts
│   │   │   ├── ExerciseRepository.ts
│   │   │   ├── MasteryRepository.ts
│   │   │   ├── QuestRepository.ts
│   │   │   ├── ProfileRepository.ts
│   │   │   └── SyncQueueRepository.ts
│   │   ├── schema.ts              # SQLite table definitions & DDL statements
│   │   └── sqlite.ts              # SQLite connection lifecycle & WAL mode config
│   ├── features/                  # Domain-specific UI features & modules
│   │   ├── auth/                  # Auth forms, session hooks, biometrics
│   │   ├── workout/               # Active workout logger, set row, plate calculator
│   │   ├── exercise/              # Exercise detail, 1RM graph, video/diagram preview
│   │   ├── mastery/               # Mastery card, lift level badge, progress bar
│   │   ├── progression/           # Level up modal, attribute distribution radar
│   │   ├── quests/                # Daily directive item, streak flame tracker
│   │   ├── achievements/          # Tiered achievement badges, unlock animations
│   │   ├── social/                # Leaderboard list, anonymized avatar card
│   │   └── ai/                    # AI prompt selector, routine preview card
│   ├── hooks/                     # Custom shared React hooks
│   │   ├── useNetworkStatus.ts    # Connectivity listener
│   │   ├── useRestTimer.ts        # Background timer with notifications
│   │   ├── useSoundHaptics.ts     # Sound/vibration triggers
│   │   └── useSyncState.ts        # Sync queue size & sync progress
│   ├── lib/                       # External library clients & singletons
│   │   ├── supabase.ts            # Supabase JS client configuration
│   │   ├── queryClient.ts         # TanStack Query client & defaults
│   │   └── sound.ts               # Audio player instance
│   ├── services/                  # Business logic & Domain engines (stateless)
│   │   ├── progression/           # Pure progression calculation formulas
│   │   │   ├── XpEngine.ts        # Global XP and Level calculations
│   │   │   ├── MasteryEngine.ts   # Lift Level, Mastery XP, and 1RM formulas
│   │   │   ├── AttributeEngine.ts # 5 Core attributes calculation
│   │   │   └── StreakEngine.ts    # Streak rules and rest day grace
│   │   ├── sync/                  # Offline synchronization engine
│   │   │   ├── SyncManager.ts     # Ingestion & queue processing
│   │   │   ├── ConflictResolver.ts# Conflict logic (LWW & additive merges)
│   │   │   └── NetworkMonitor.ts  # NetInfo network change listener
│   │   └── ai/                    # Edge function caller for Gemini AI features
│   │       └── AiService.ts
│   ├── store/                     # Zustand stores for reactive UI/client state
│   │   ├── useWorkoutStore.ts     # Active session state (sets, elapsed time, exercise index)
│   │   ├── useAuthStore.ts        # Current user profile & auth tokens
│   │   ├── useSettingsStore.ts    # Unit preference (kg/lbs), sound, notifications
│   │   └── useUIStore.ts          # Active modals, active rest timer drawer
│   ├── types/                     # Shared TypeScript types & interfaces
│   │   ├── database.types.ts      # Generated Supabase DB types
│   │   ├── domain.types.ts        # Core business models (User, Workout, Set, Mastery)
│   │   ├── sync.types.ts          # Mutation payloads and queue interfaces
│   │   └── progression.types.ts   # Rank, Level, Attribute, PR structures
│   ├── utils/                     # Pure utility functions
│   │   ├── 1rm.ts                 # Brzycki, Epley, Lander 1RM formulas
│   │   ├── date.ts                # ISO formatters, streak day diffs
│   │   ├── formatters.ts          # Weight, time, and percentage formatters
│   │   └── math.ts                # Clamping, interpolation, exponential curves
│   └── validation/                # Zod validation schemas
│       ├── workout.schema.ts
│       ├── profile.schema.ts
│       └── sync.schema.ts
├── supabase/                      # Supabase configuration & Edge functions
│   ├── config.toml
│   ├── functions/                 # Deno-based Edge Functions
│   │   ├── generate-workout/      # Gemini AI workout generation
│   │   ├── adapt-session/         # In-workout tactical adjustment suggestions
│   │   ├── sync-batch/            # Batch sync handler with transaction integrity
│   │   └── calculate-leaderboard/ # Scheduled cron for ranking recalculations
│   └── migrations/                # Supabase PostgreSQL migrations (DDL + RLS)
├── package.json
├── tsconfig.json
├── app.json                       # Expo configuration
└── README.md
```

---

## 4. Navigation Architecture

ASCEND uses **Expo Router v4** for strictly typed, file-system based routing.

```
Root Layout (src/app/_layout.tsx)
  │
  ├── [Auth Gate] ──────────► (auth)
  │                             ├── login.tsx
  │                             └── register.tsx
  │
  ├── [Onboarding Gate] ────► (onboarding)
  │                             ├── archetype.tsx
  │                             └── baseline.tsx
  │
  ├── [Main Application] ───► (tabs)
  │                             ├── index.tsx (HUD Command Center)
  │                             ├── workouts/ (Routines & Active Plans)
  │                             ├── exercises/ (Mastery Skill Tree & Catalog)
  │                             ├── quests/ (Directives, Feats & Campaigns)
  │                             └── profile/ (Character Sheet & Settings)
  │
  └── [Modal Overlays] ─────► modals/
                                ├── active-workout.tsx (Fullscreen Logger)
                                ├── rest-timer.tsx (HUD Rest & Plate Overlay)
                                ├── level-up.tsx (Progression Celebration)
                                └── ai-generator.tsx (AI Tactical Architect)
```

### 4.1 Navigation Guarantees
* **Workout Immunity:** If the user minimizes the app, navigates tabs, or locks the phone during an active workout, the active workout state remains pinned in `useWorkoutStore` and SQLite. Tapping the persistent mini-player banner returns instantly to `modals/active-workout`.
* **Hardware Back Button Handling (Android):** During an active workout, pressing the back button opens a confirmation dialogue ("Pause Workout" or "Finish Session") rather than abruptly dumping unsaved state.

---

## 5. Client State Boundaries

| State Layer | Tool | Responsibilities | Persistence Strategy |
| :--- | :--- | :--- | :--- |
| **Transient Session** | Zustand | Active workout draft, running timer, plate calculations, active sheet modals | In-memory + SQLite draft snapshot on every set edit |
| **Local Relational** | Expo SQLite | Exercise catalog, historical workouts, set logs, mastery tables, local sync queue | Persistent embedded SQLite (WAL mode) |
| **Server State** | TanStack Query | Remote profiles, global leaderboards, AI recommendations, sync triggers | In-memory cache with stale-while-revalidate |
| **Identity & Auth** | Supabase Auth | JWT session tokens, refresh tokens, user credentials | SecureStore (Android Keystore / iOS Keychain) |
