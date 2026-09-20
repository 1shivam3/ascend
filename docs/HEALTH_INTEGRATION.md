# ASCEND × Android Health Connect Integration

## 1. Overview & Architecture

ASCEND integrates with **Android Health Connect** (`androidx.health.connect.client`) as an external telemetry source. ASCEND adheres strictly to a **local-first architecture**: Health Connect acts solely as an external feed, while ASCEND retains complete authority over its own local SQLite and cloud database states.

Google Fit is explicitly **not** used as the primary health architecture.

### Architectural Flow

```
┌────────────────────────────────────────────────────────┐
│                        ASCEND                          │
│  (Cyberpunk UI, Quest Engine, Challenge Engine, State)  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│               Health Integration Service               │
│  (Granular Permissions, Sync Coordinator, Privacy Gate)│
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
              ▼                           ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│ Health Deduplication Engine│ │    Health Quest Bridge    │
│ (Wearable Fidelity Scoring)│ │(Strict Guard: 0 Gym XP)  │
└─────────────┬─────────────┘ └───────────┬───────────────┘
              │                           │
              ▼                           ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│   ASCEND SQLite Database  │ │    Challenge / Quests     │
│   (Local-First Persistence)│ │(Steps & Qualifying Cardio)│
└───────────────────────────┘ └───────────────────────────┘
              ▲
              │ (External Ingestion)
┌───────────────────────────┐
│   Android Health Connect  │
│   (androidx.health.connect)│
└─────────────▲─────────────┘
              │
┌─────────────┴──────────────────────────────────────────┐
│              Android / Wearable Ecosystem              │
│ (Garmin, Polar, Whoop, Samsung Health, Pixel Watch, etc)│
└────────────────────────────────────────────────────────┘
```

---

## 2. Ingested Data & Purpose Specification

To protect user privacy and minimize attack surfaces, ASCEND **never** requests sweeping permissions. We follow a strict principle of least privilege:

| Health Record Type | Unit | What We Read | Why We Read It | How It Is Used |
| :--- | :--- | :--- | :--- | :--- |
| **Steps** | count | Daily and interval step counts | Quantify daily baseline physical activity | Contributes to step quests and walking challenges |
| **Exercise Sessions** | session | Type, duration, and distance | Track endurance cardio workouts | Contributes to distance & cardio challenges |
| **Distance** | meters | Walking, running, and cycling distance | Track aggregate cardiovascular volume | Contributes to endurance challenges (e.g. CARDIO RUSH) |
| **Calories** | kcal | Active calories burned | Provide energy expenditure context | Shown in private daily activity summaries |
| **Weight** | kg | Bodyweight log entries | Track physique progression trends | Updates user profile weight trend |
| **Heart Rate** | bpm | Active heart rate samples | Measure cardiovascular intensity | High-intensity cardio metrics only |

> [!IMPORTANT]
> **Permissions are requested on-demand**: Permissions are only prompted when a user toggles an associated feature (e.g. Weight tracking or Step quests), never en masse upon first app launch.

---

## 3. Permission User Experience (Connect Health Data)

The `ConnectHealthModal` provides complete transparency and total user autonomy:

1. **Explicit Rationale**: Clearly breaks down **what** ASCEND reads, **why** it reads it, and **how** it is used within the app.
2. **Granular Control**: Users can selectively toggle individual metrics (Steps, Cardio, Distance, Calories, Weight, Heart Rate) before granting access.
3. **Clear Deny / Skip Option**: Users can dismiss or skip integration with a single tap.
4. **Zero Disruption Guarantee**: ASCEND functions 100% normally without Health Connect permissions. Workouts, strength progression, social feeds, and local logging are never gated or disabled if the user denies permissions.
5. **Revocation Resilience**: If permissions are revoked via Android System Settings, the app transitions smoothly to an unconnected state without throwing errors or corrupting data.

---

## 4. Quest & Challenge Integration

Health data can advance designated endurance and lifestyle challenges:
- **Daily Steps**: Steps are aggregated by calendar date and dispatched to `ChallengeEngine.processEvent` with `eventType: 'STEPS'`.
- **Cardio Sessions**: Qualifying endurance sessions (`RUNNING`, `CYCLING`, `ROWING`, `SWIMMING`, `WALKING`, `HIKING`) with duration **>= 10 minutes** advance distance and duration challenges. Sessions under 10 minutes are filtered out to prevent noise.
- **Weight Trends**: Valid bodyweight entries (20 kg - 350 kg) automatically update the user's profile bodyweight trend in SQLite.

### Strict XP Guard: Zero Gym Workout XP for Arbitrary Health Records

> [!CAUTION]
> **Gym XP Integrity**: Arbitrary Health Connect exercise sessions (e.g. gym, strength training, weightlifting recorded by a third-party tracker) are **NEVER** awarded gym workout XP or exercise mastery. 
> 
> ASCEND's RPG leveling, strength PRs, and exercise mastery badges are strictly reserved for workouts actively executed, tracked, and verified inside ASCEND's native workout logger.

---

## 5. Multi-Source Deduplication Engine

Users often wear a dedicated fitness tracker (Garmin, Polar, Whoop) while simultaneously carrying an Android phone running Google Fit, Samsung Health, or internal step sensors. To prevent double-counting steps, distance, or calories:

1. **Deterministic Primary Keys**: Every ingested record generates an immutable deterministic hash based on:
   `sha256(userId + recordType + sourceClient + externalId + startTime + endTime)`
2. **External ID Deduping**: Records already existing in SQLite by `external_id` are skipped immediately.
3. **Wearable Priority Scoring**: When overlapping time windows occur, ASCEND assigns telemetry priority:
   - **Priority 3 (Dedicated Sports Wearables)**: `com.garmin.connect`, `is.whoop.android`, `com.polar.polarflow`, `com.wahoofitness.fitness`
   - **Priority 2 (Smartwatches)**: `com.samsung.android.shealth`, `com.google.android.apps.fitness` (Pixel Watch / Galaxy Watch)
   - **Priority 1 (Phone Accelerometers & General Sensors)**: Generic system sensors and fallback sources.
4. **Exercise Session Fidelity**: When overlapping exercise sessions occur, the session with richer telemetry (heart rate, GPS distance, active calories) takes precedence, and the lesser session is marked `is_deduplicated = 1` (superseded).

---

## 6. Privacy & Social Feed Isolation

Health and biometric data are treated with maximum confidentiality:

- **Never Published by Default**: Heart rate, bodyweight, active calories, and detailed activity GPS logs are **NEVER** published to the public activity feed or friend profiles.
- **Strict Metadata Sanitization**: All public feed items pass through `SocialFeedService.sanitizeMetadata()`, which strips biometric keys (`heartRateAvg`, `maxHeartRate`, `activeCalories`, `bodyweightKg`, `bloodPressure`, `glucoseLevel`, `notes`).
- **Cloud Row-Level Security (RLS)**: The Supabase PostgreSQL mirror enforces strict row-level security where `auth.uid() = user_id`. No public read policies exist on `health_records` or `health_sync_state`.

---

## 7. Offline-First & Synchronization

ASCEND maintains full offline readiness:
- All Health Connect records are ingested directly into the local SQLite `health_records` table.
- A dedicated `health_sync_state` table persists connection state, granted permissions, and `last_sync_time`.
- Ingestion queries only fetch incremental data since `last_sync_time` (with a 24-hour overlap buffer to capture retroactive wearable syncs).
- If the device is offline or Health Connect service is unreachable, ASCEND logs a graceful warning and retries on the next synchronization cycle.

---

## 8. Verification & Test Suite

The integration is verified across a comprehensive test matrix:

| Test File | Focus Areas |
| :--- | :--- |
| `HealthConnectPermissions.test.ts` | Permissions granted, permissions denied, partial permissions, SDK unavailable, provider update required, permission revocation |
| `HealthDeduplication.test.ts` | Deterministic ID generation, external ID dedup, multi-source overlapping steps (Garmin vs Phone), overlapping exercise sessions by fidelity |
| `HealthQuestBridgeAndPrivacy.test.ts` | Daily step aggregation to challenges, qualifying cardio sessions (>= 10 min), short cardio filter (< 10 min), bodyweight trend sync, biological plausibility validation, strict gym XP guard, social feed isolation, offline sync persistence |
