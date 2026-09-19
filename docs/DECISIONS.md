# ASCEND — Architectural Decisions & Risk Analysis

## 1. Architectural Decision Records (ADRs)

### ADR-001: Local-First Architecture via Expo SQLite (WAL Mode)
* **Status:** Accepted.
* **Context:** Gyms are notorious cellular dead zones (basement facilities, reinforced concrete). A fitness app that spins or fails when logging a heavy deadlift set will be deleted immediately.
* **Decision:** Treat the embedded SQLite database on the mobile device as the primary operational data store. All active session reads, set writes, PR queries, and progression calculations occur locally with zero network latency. Supabase acts as the cloud replica and backup.
* **Consequences:** Requires an explicit local synchronization queue, schema migration orchestration on the client, and idempotent backend ingestion.

---

### ADR-002: Event-Sourced Set Logging & XP Transactions
* **Status:** Accepted.
* **Context:** Standard CRUD architectures that update rows in-place (e.g. `UPDATE profiles SET total_xp = total_xp + 50`) suffer disastrous race conditions and merge conflicts when offline changes sync hours later.
* **Decision:** Model workout execution and gamification as immutable, append-only events (`set_logs`, `xp_transactions`). Higher-level state (`exercise_mastery`, `profiles.total_xp`, `profiles.global_level`) are deterministic projections derived from these events.
* **Consequences:** Ingestion is append-only and conflict-free. Sync reconciliation is simple: the server replays transactions if any drift occurs.

---

### ADR-003: Decoupling Exercise Mastery from Global Strength
* **Status:** Accepted.
* **Context:** In traditional RPGs, a single "Strength" stat governs all physical power. In athletic training, an individual may have an elite 260kg Deadlift (Level 45 Mastery) but a mediocre 90kg Bench Press (Level 18 Mastery) due to limb proportions or training focus.
* **Decision:** Implement Exercise Mastery as independent 1–100 progression tracks per movement, while Global Strength is a macro-composite attribute reflecting overall heavy volume and multi-joint capacity.
* **Consequences:** Lifters feel immediate progression on individual exercises without breaking game balance or macro attributes.

---

### ADR-004: Server-Side Gemini AI Gateway via Supabase Edge Functions
* **Status:** Accepted.
* **Context:** Exposing LLM API keys on mobile clients is a severe security vulnerability. Furthermore, direct client calls make token budgeting, rate limiting, and prompt enforcement difficult to audit.
* **Decision:** Route all AI routine generation and adaptation through Supabase Edge Functions (Deno runtime), which hydrate user training context from Postgres and securely query Gemini 1.5 with structured JSON schemas.
* **Consequences:** Protects API credentials, enforces token rate-limiting per user tier, and ensures prompt safety.

---

## 2. Core Assumptions

1. **Device Baseline:** The target minimum platform is Android 10+ (API 29), with full support for 60Hz and 120Hz high-refresh-rate displays.
2. **Offline Duration:** Users may train completely disconnected from the internet for up to 7 consecutive days without losing data integrity or app functionality.
3. **Measurement System:** All weights are stored in the database as kilograms (`numeric(6,2)`). The UI transparently converts to pounds (`lbs`) based on user preference ($1 \text{ kg} \approx 2.20462 \text{ lbs}$) with zero rounding drift.
4. **Original Identity:** ASCEND is built with an original tactical cyberpunk aesthetic (Obsidian/Cyan/Amber), completely avoiding copyrighted anime or third-party game assets.

---

## 3. Open Decisions & Default Resolutions

| Open Decision | Alternatives Considered | Default Resolution Adopted | Rationale |
| :--- | :--- | :--- | :--- |
| **Sync Batch Size** | Streaming per-set sync vs. End-of-workout batch sync | **Hybrid:** Queue per set locally; stream when connected, flush full batch at workout completion. | Ensures 0ms latency during active lifting while minimizing battery consumption. |
| **Exercise Media Delivery** | Full video downloads vs. Live streaming vs. Bundled vector illustrations | **Tiered:** Bundled lightweight SVG anatomical muscle maps locally; optional high-res video streaming when online. | Keeps initial app bundle under 45MB while remaining 100% useful offline. |
| **Leaderboard Scope** | Global all-time vs. Rolling weekly tonnage vs. Weight-class brackets | **Rolling Weekly Brackets:** Anonymous opt-in leaderboard grouped by weight class and training tier. | Prevents new users from facing impossible lifetime totals from 10-year veteran lifters. |
| **Streak Grace Duration** | 24 hours vs. 48 hours | **48-Hour Rolling Window with Rest Day Exemption:** Scheduled rest days do not break streaks. | Prevents habit abandonment caused by biological necessity to rest. |

---

## 4. Comprehensive Risk Analysis

### 4.1 Architectural Risks
* **Schema Migration Drift (SQLite vs Postgres):**
  * *Risk:* If local SQLite schema and remote PostgreSQL schema diverge during app updates, sync mutations could fail.
  * *Mitigation:* Centralized TypeScript type generation; automated migration test suites that run SQLite DDL and PostgreSQL DDL concurrently against test fixtures.
* **Local Storage Limits:**
  * *Risk:* An athlete with 5 years of daily workouts could accumulate tens of thousands of set logs, degrading query performance on low-end Android devices.
  * *Mitigation:* SQLite indexes on `(exercise_id, completed_at)` and `(workout_id)`. Active session queries only scan current workouts. Historical analytics aggregate into rollups.

### 4.2 Security & Data Integrity Risks
* **Client-Side XP Spoofing:**
  * *Risk:* A malicious user modifies local SQLite to grant themselves Level 100 or 999,999 XP.
  * *Mitigation:* Local progression values are only optimistic. When syncing with Supabase, the server-side sync batch processor recalculates verified XP from validated set logs before writing to the public leaderboard.
* **Row-Level Security Leaks:**
  * *Risk:* Improper RLS policies could expose private fitness data (body weight, injury notes).
  * *Mitigation:* Strict default-deny RLS. All tables enforce `auth.uid() = user_id`. Leaderboards query a dedicated anonymized projection view rather than raw user tables.

### 4.3 Product & UX Risks
* **Gamification Burnout:**
  * *Risk:* Lifters feel pressured to overtrain to maintain streaks or level up, causing injury.
  * *Mitigation:* Scheduled rest days reward Vitality XP and sustain streaks. AI and heuristic engines actively suggest deload weeks after high-strain periods.
* **Logging Friction in the Gym:**
  * *Risk:* Complex RPG UI slows down real-world gym logging, causing lifters to revert to simple notes or basic apps.
  * *Mitigation:* Single-tap set completion, ghost inputs showing prior set weights, sticky keypad, and zero required fields other than weight and reps.
