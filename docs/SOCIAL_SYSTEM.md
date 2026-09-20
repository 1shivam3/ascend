# ASCEND — Social Layer & Squad Intelligence Architecture

## 1. Core Philosophy: Athletic Accountability, Not Social Media

ASCEND's social layer is built strictly around **squad accountability, collective discipline, and athletic progress**. It deliberately rejects algorithmically addictive social media paradigms (infinite doom-scrolling, superficial vanity metrics, algorithmic feed curation, and follower inflation). 

### 1.1 Guiding Principles
1. **Athletic Progress as Currency:** All feed entries reflect tangible training milestones (workouts completed, personal records broken, rank advancements, level-ups, unlocked achievements, completed challenges, and character evolutions).
2. **Strict Medical & Biometric Data Isolation:** Private body metrics (bodyweight, height, age, BMI, body composition, medical notes, heart rate curves, and injuries) and raw set-by-set workout logs are **strictly quarantined** and never broadcast to public feeds or friend profiles.
3. **Sovereign Privacy Control:** Every athlete maintains granular, sovereign control over what broadcasts to squadmates and the global community via discrete privacy toggles.
4. **Bilateral Respect & Safety:** Friendships are mutual contracts. Blocking is immediate, bidirectional, and automatically dissolves friendships, purges pending handshakes, hides dossiers, and filters feeds.

---

## 2. Entity-Relationship & Database Architecture

The social layer is implemented across both local SQLite (offline-first execution) and PostgreSQL / Supabase (cloud synchronization and cross-user queries).

```mermaid
erDiagram
    PROFILES ||--o{ FRIENDSHIPS : has
    PROFILES ||--o{ FRIEND_REQUESTS : sends_or_receives
    PROFILES ||--o{ BLOCKS : blocks_or_is_blocked
    PROFILES ||--o| PRIVACY_SETTINGS : configures
    PROFILES ||--o{ ACTIVITY_FEED : publishes
    ACTIVITY_FEED ||--o{ ACTIVITY_REACTIONS : receives

    PROFILES {
        uuid id PK
        uuid auth_id
        text username
        text display_name
        text avatar_url
        text friend_code UK "Format: ASC-XXXX-XXXX"
        integer global_level
        text rank_tier
        integer rank_division
        integer current_streak
    }

    FRIENDSHIPS {
        uuid id PK
        uuid user_id FK
        uuid friend_id FK
        timestamp created_at
    }

    FRIEND_REQUESTS {
        uuid id PK
        uuid sender_id FK
        uuid receiver_id FK
        text status "PENDING, ACCEPTED, REJECTED, CANCELLED"
        timestamp created_at
        timestamp updated_at
    }

    BLOCKS {
        uuid id PK
        uuid blocker_id FK
        uuid blocked_id FK
        timestamp created_at
    }

    PRIVACY_SETTINGS {
        uuid id PK
        uuid user_id FK UK
        text profile_visibility "PUBLIC, FRIENDS, PRIVATE"
        text feed_visibility_default "PUBLIC, FRIENDS, PRIVATE"
        boolean show_workouts_in_feed
        boolean show_prs_in_feed
        boolean show_level_ups_in_feed
        boolean show_rank_ups_in_feed
        boolean show_achievements_in_feed
        boolean show_challenges_in_feed
        boolean show_evolution_in_feed
        boolean allow_friend_requests
        boolean show_mastery_on_profile
        boolean show_achievements_on_profile
        boolean show_streak_on_profile
    }

    ACTIVITY_FEED {
        uuid id PK
        uuid user_id FK
        text event_type "WORKOUT_COMPLETED, PR_ACHIEVED, etc."
        text title
        text summary
        jsonb metadata "Sanitized athletic telemetry only"
        text visibility "PUBLIC, FRIENDS, PRIVATE"
        integer likes_count
        timestamp created_at
    }

    ACTIVITY_REACTIONS {
        uuid id PK
        uuid activity_id FK
        uuid user_id FK
        text reaction_type "LIKE, FIRE, RESPECT, WARRIOR, LIGHTNING, STRENGTH, PRECISION"
        timestamp created_at
    }
```

### 2.1 Symmetrical Dual-Row Friendship Model
When User A's friend request to User B is accepted:
1. `friend_requests` status transitions to `ACCEPTED`.
2. Two symmetric rows are committed:
   - `(user_id: A, friend_id: B)`
   - `(user_id: B, friend_id: A)`
3. When removing a friend or blocking, both rows are excised symmetrically in a single atomic transaction.
4. *Rationale:* This enables hyper-performant single-index lookups (`WHERE user_id = ?`) for friends lists, join filters, and Row-Level Security policies without requiring complex `OR` subqueries.

---

## 3. Friend Code Identification System

Every operative is assigned a unique, memorable tactical friend code during profile initialization.

### 3.1 Format Specification
$$\text{Friend Code} = \text{ASC}-\text{XXXX}-\text{XXXX}$$
* **Prefix:** `ASC` (ASCEND operational identifier).
* **Segment 1:** 4 uppercase alphanumeric characters (excluding ambiguous glyphs like `0/O` and `1/I`).
* **Segment 2:** 4 uppercase alphanumeric characters.
* **Example:** `ASC-VANG-7749`, `ASC-TITN-2104`.

### 3.2 Verification and Handshake Protocol
Operatives can connect via:
1. **Direct Friend Code Entry:** Operatives share their friend code in person or via messaging. Entering `ASC-XXXX-XXXX` instantly executes an exact, case-insensitive match.
2. **Callsign Search:** Searching by username or tactical display name (`WHERE username LIKE ? OR display_name LIKE ?`).
3. **Mutual Request Resolution:** If User B already has a pending request to User A, and User A sends a request to User B, the handshake resolves immediately to `ACCEPTED` and provisions the friendship without requiring duplicate confirmation.

---

## 4. Strict Privacy & Zero-Leakage Data Guarantees

ASCEND enforces data isolation at three distinct layers: database schema, API service sanitization, and UI dossier presentation.

### 4.1 Quarantined Fields (Strictly Excluded from Public Surfaces)
| Private Data | Quarantine Location | Public Social Exposure |
| :--- | :--- | :--- |
| **Bodyweight (`weight_kg`)** | `profiles` (Private) | ❌ **NEVER** exposed. Only relative strength ratio ($\text{1RM} / \text{BW}$) or absolute lifted weight is published if enabled. |
| **Height (`height_cm`)** | `profiles` (Private) | ❌ **NEVER** exposed. |
| **Age / Date of Birth** | `profiles` (Private) | ❌ **NEVER** exposed. |
| **Medical Limitations & Injuries** | `profiles.limitations` | ❌ **NEVER** exposed. |
| **Workout Notes & Coach Feedback** | `workouts.notes` | ❌ **NEVER** exposed. |
| **Raw Set Logs (Weights/RPE/Rest)** | `set_logs` | ❌ **NEVER** exposed. Only aggregate session volume (e.g., $8,500\text{ kg}$) and exercise count are broadcast. |
| **Heart Rate / Biometrics** | Wearable telemetry | ❌ **NEVER** exposed. |
| **Account Auth UUID (`auth_id`)** | Supabase Auth / Local | ❌ **NEVER** exposed. |

### 4.2 Database Layer: Security Barrier View
In PostgreSQL / Supabase, public dossier queries execute against `public_profiles`:
```sql
CREATE OR REPLACE VIEW public_profiles WITH (security_barrier = true) AS
SELECT 
    id,
    username,
    display_name,
    avatar_url,
    friend_code,
    global_level,
    rank_tier,
    rank_division,
    current_streak,
    created_at
FROM profiles;
```
`security_barrier = true` guarantees query planner rewrites cannot short-circuit or leak columns outside the select list.

### 4.3 Social Feed Metadata Sanitizer
The `SocialFeedService.sanitizeMetadata()` pipeline intercepts all raw workout events before database writes, filtering incoming payloads through an explicit whitelist:
```typescript
// Explicit Whitelist: ONLY these keys pass through to activity_feed.metadata
const ALLOWED_METADATA_KEYS = [
  'workoutId', 'durationMinutes', 'totalVolumeKg', 'exerciseCount',
  'primaryExercises', 'prExerciseName', 'prType', 'prValue',
  'oldLevel', 'newLevel', 'oldRankTier', 'newRankTier',
  'oldDivision', 'newDivision', 'achievementId', 'achievementTitle',
  'achievementIcon', 'challengeId', 'challengeTitle', 'challengeXp',
  'evolutionStage', 'evolutionForm'
];
```
Any raw notes, set arrays, or health keys are stripped before persistence.

---

## 5. Athletic Activity Feed & Event Pipeline

The activity feed records 7 core athletic milestones:

| Event Type | Trigger | Summary Format |
| :--- | :--- | :--- |
| `WORKOUT_COMPLETED` | Workout session completed & logged | `"Crushed [N] exercises with [V] kg total volume"` |
| `PR_ACHIEVED` | Lift 1RM or weight personal record broken | `"NEW PR: [Exercise Name] — [W] kg [Type]"` |
| `LEVEL_UP` | Global character XP threshold crossed | `"Level Up: Reached Global Level [L]"` |
| `RANK_UP` | Competitive rank tier or division advanced | `"Rank Up: Promoted to [Tier] [Division]"` |
| `ACHIEVEMENT_UNLOCKED` | Milestone achievement condition fulfilled | `"Achievement Unlocked: [Title]"` |
| `CHALLENGE_COMPLETED` | Quest or challenge directive finalized | `"Challenge Completed: [Title] (+[XP] XP)"` |
| `CHARACTER_EVOLUTION` | Character evolution form unlocked | `"Operative Evolved: [Form Title] (Stage [S])"` |

### 5.1 Automatic Workout Integration
When a workout finishes in `useWorkoutStore.finishWorkout()`, ASCEND executes a non-blocking background broadcast:
1. Verifies the athlete's privacy settings via `PrivacyService.shouldPublishEvent()`.
2. Sanitizes telemetry (workout duration, tonnage, top 3 compound exercises).
3. If new PRs occurred during the workout, dispatches individual `PR_ACHIEVED` events.
4. If the workout triggered a Level-Up, Rank-Up, Quest completion, or Evolution, dispatches corresponding events.
5. All dispatches are wrapped in a non-blocking `try/catch` ensuring core workout logging and local persistence succeed with zero latency.

---

## 6. Lightweight Athletic Reactions

Social interaction in ASCEND consists of 7 tactical, positive athletic responses:

| Reaction Key | Tactical Designation | Glyph | Symbolic Meaning |
| :--- | :--- | :---: | :--- |
| `LIGHTNING` | ENERGY | ⚡ | Raw explosiveness, intensity, high tempo |
| `FIRE` | FIRE | 🔥 | Relentless drive, high volume, exhaustion |
| `RESPECT` | RESPECT | 🛡️ | Discipline, consistency, veteran solidarity |
| `WARRIOR` | WARRIOR | ⚔️ | Overcoming adversity, fighting through grinders |
| `STRENGTH` | STRENGTH | 💪 | Heavy loading, brute force, raw power |
| `PRECISION` | PRECISION | 🎯 | Perfect form, technical mastery, execution |
| `LIKE` | COMMENDATION | 👍 | Baseline squad affirmation |

### 6.1 Interaction Mechanics
- **Single-Tap Toggle:** Tapping a reaction adds it; tapping it again removes it.
- **Aggregated Counts:** Reaction tallies are stored in `activity_reactions` and indexed by `activity_id`.
- **Zero Toxic Interactivity:** No freeform commenting, harassment vectors, downvotes, or algorithmic controversy multipliers.

---

## 7. Bidirectional Blocking & Safety Architecture

ASCEND provides ironclad blocking capabilities:
1. **Immediate Severance:** When User A blocks User B:
   - Bilateral friendship entries are deleted immediately.
   - Any pending friend requests in either direction are purged.
   - A block record is written to `blocks (blocker_id, blocked_id)`.
2. **Mutual Invisibility:**
   - User B is omitted from User A's searches and friend lists.
   - User A is omitted from User B's searches and friend lists.
   - Profile dossiers return `null`.
   - Feed items from blocked users are filtered at both SQLite and PostgreSQL query level.
3. **Unblocking:** Unblocking removes the block record. Friendship is not restored automatically; operatives must initiate a fresh handshake if desired.

---

## 8. Row-Level Security (RLS) Policy Specifications

Supabase Postgres tables enforce airtight multi-tenant security policies:

```sql
-- 1. FRIENDSHIPS: Operatives can only view and mutate their own friendships
CREATE POLICY "Users can view their friendships"
    ON friendships FOR SELECT
    USING (auth.uid() = user_id);

-- 2. FRIEND REQUESTS: Visible only to sender or receiver
CREATE POLICY "Users can view their friend requests"
    ON friend_requests FOR SELECT
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 3. ACTIVITY FEED: Enforces privacy settings and friendship visibility
CREATE POLICY "Users can view authorized feed items"
    ON activity_feed FOR SELECT
    USING (
        user_id = auth.uid()
        OR visibility = 'PUBLIC'
        OR (
            visibility = 'FRIENDS'
            AND user_id IN (SELECT friend_id FROM friendships WHERE user_id = auth.uid())
        )
    );

-- 4. BLOCKS: Users can view and manage only their own block directives
CREATE POLICY "Users can manage their own blocks"
    ON blocks FOR ALL
    USING (auth.uid() = blocker_id);
```

---

## 9. Client State & UI Component Hierarchy

The social experience is orchestrated via `useSocialStore` and organized into focused tactical modal interfaces:

```
src/
├── types/
│   └── social.types.ts                 # Domain models, enums, DTOs
├── database/
│   ├── repositories/
│   │   ├── FriendRepository.ts         # Bilateral friendships, search, blocks
│   │   ├── PrivacyRepository.ts        # User privacy persistence
│   │   └── ActivityFeedRepository.ts   # Feed posting, filtering, reactions
│   └── migrations/
│       └── 20260922_social_layer...sql # Complete Supabase migration
├── services/
│   └── social/
│       ├── FriendService.ts            # Friend requests, handshakes, search
│       ├── PrivacyService.ts           # Privacy gates & decision engine
│       ├── SocialFeedService.ts        # Metadata sanitizer, feed publisher
│       └── FriendProfileService.ts     # Public dossier generator (zero health leaks)
├── store/
│   └── useSocialStore.ts               # Reactive Zustand social state
└── components/
    └── social/
        ├── SocialHubModal.tsx          # Main Squad Hub (Feed / Squad / Requests / Search)
        ├── ActivityFeedCard.tsx        # Tactical card for feed events with reaction bar
        ├── FriendCard.tsx              # Operative squad roster card
        ├── FriendProfileModal.tsx      # Public operative dossier inspection modal
        └── SocialPrivacyModal.tsx      # Granular broadcast & visibility toggles
```

---

## 10. Verification & Test Suite Summary

The social layer is comprehensively validated across 3 dedicated test suites comprising 21 specialized integration tests, as well as the full 30-suite regression harness (222 total tests):

1. **`TwoUserFriendWorkflow.test.ts` (5 tests):**
   - Friend search via friend code `ASC-XXXX-XXXX` and username callsign.
   - Full handshake lifecycle: User A sends request $\rightarrow$ User B accepts $\rightarrow$ User A sees User B $\rightarrow$ User B sees User A.
   - Symmetrical friend removal dissolves mutual squad records.
   - Request rejection and cancellation workflows.
2. **`PrivacyAndDataIsolation.test.ts` (9 tests):**
   - Public dossier inspection: strictly verifies allowed fields are present and private fields (`weightKg`, `heightCm`, `age`, `limitations`, `notes`, `rawLogs`, `authId`) are `undefined`.
   - Metadata sanitizer verification: validates stripping of raw biometrics, heart rate, and injury notes.
   - Privacy toggle gating: asserts that disabling specific flags suppresses feed event generation.
3. **`BlockAndInteractions.test.ts` (7 tests):**
   - Blocking dissolves mutual friendship, purges pending requests, and sets bidirectional block state.
   - Blocked users cannot send requests or appear in search results.
   - Activity feed isolation filters out blocked users' posts.
   - Athletic reactions: adds reactions, manages breakdowns, updates total counts, and handles toggle cancellation.
