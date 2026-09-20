# ASCEND Deterministic Conflict Resolution Rules

## 1. Overview & Philosophy
ASCEND is built upon an offline-first, local-first architectural principle. The client's local SQLite database is the primary source of truth during athletic operations. Users must be able to train in offline environments (basement gyms, remote trails, airplane mode) with zero operational latency or data loss.

When an offline client reconnects to the network, or when multiple devices sync asynchronously, conflicting updates are reconciled using **deterministic, mathematically sound conflict rules**. These rules guarantee that athlete progression, personal records, and training logs can never regress, duplicate, or corrupt.

---

## 2. Domain Conflict Specifications

| Domain Entity | Conflict Resolution Strategy | Winning Criterion | Rationale |
| :--- | :--- | :--- | :--- |
| **Workouts** | **Terminal State Wins** (`COMPLETED` > `ACTIVE`) | Completed status is irreversible | A completed training session represents physical work done and must never revert to active or discarded. |
| **Sets & Logs** | **Idempotent Set Union** | Unique set UUID; completed sets are sticky | Sets are identified by immutable client UUIDs. If client and server have differing set lists, sets are unioned by set ID. |
| **Personal Records (PRs)** | **Highest Value Wins** | `MAX(client.value, server.value)` | A real-world personal record cannot be invalidated by an older or lower performance record. Tie-breaker: earlier `achieved_at`. |
| **Exercise Mastery** | **High-Water Mark Wins** | `MAX(client, server)` across cumulative metrics | Mastery XP, lifetime volume, total sessions, and estimated 1RM always take the maximum of client and server values. |
| **Quests** | **Max Progress Wins / Sticky Completion** | `MAX(progress)`; `client.completed \|\| server.completed` | If a quest was completed on any device or offline session, it remains permanently completed. |
| **XP Transactions** | **Deterministic Idempotent Ledger** | Unique compound key: `(user_id, source_type, source_id)` | Financial-grade ledger. Duplicate submissions are safely ignored (`INSERT OR IGNORE`). Total XP is incremented exactly once. |
| **Achievements** | **Sticky Unlock** | `client.unlocked \|\| server.unlocked` | Feats unlocked offline are immediately preserved upon sync; once earned, an achievement cannot be revoked by stale server state. |
| **Daily Streak** | **Calendar-Date Bound** | Maximum 1 streak advance per calendar day (`YYYY-MM-DD`) | Timezone-normalized calendar date prevents multiple workouts on the same day from advancing streak more than once. |
| **User Profile** | **Hybrid: High-Water Mark + LWW** | Progression metrics: High-Water Mark. Profile metadata: Last-Write-Wins (`updated_at`). | Progression (total XP, global level, rank tier) cannot regress; biometrics (weight, height, preferences) respect the most recent user intent. |
| **Nutrition Logs** | **Last-Write-Wins (LWW)** | Newest `updated_at` per calendar day (`user_id, log_date`) | Daily caloric and macronutrient totals reflect the user's latest manual entry for that specific day. |

---

## 3. Detailed Entity Rules

### 3.1 Workouts & Sets
- **State Progression**: `ACTIVE` $\rightarrow$ `COMPLETED` or `ACTIVE` $\rightarrow$ `DISCARDED`.
- **Invariance**: Once marked `COMPLETED`, a workout is immutable. Even if a stale sync payload arrives with `status: 'ACTIVE'`, the database rejects the regression.
- **Sets**: Each set log has an immutable ID `s-{timestamp}-{hash}`. Conflicting set edits are reconciled by taking the completed set (`completed: 1` wins over `completed: 0`).

### 3.2 Personal Records (PRs)
- **Compound Key**: `(user_id, exercise_id, pr_type)`.
- **Conflict Rule**:
  $$\text{PR}_{\text{resolved}} = \max(\text{PR}_{\text{client}}, \text{PR}_{\text{server}})$$
- **Deduplication**: If a synced PR has a value less than or equal to the existing database value, the operation is acknowledged as a no-op and discarded from the sync queue without downgrading the athlete's record.

### 3.3 Exercise Mastery
- Cumulative metrics are monotonically increasing:
  - `mastery_xp = MAX(client.mastery_xp, server.mastery_xp)`
  - `total_sessions = MAX(client.total_sessions, server.total_sessions)`
  - `total_volume_kg = MAX(client.total_volume_kg, server.total_volume_kg)`
  - `best_weight_kg = MAX(client.best_weight_kg, server.best_weight_kg)`
  - `best_reps = MAX(client.best_reps, server.best_reps)`
  - `estimated_1rm_kg = MAX(client.estimated_1rm_kg, server.estimated_1rm_kg)`

### 3.4 XP Transaction Ledger & Anti-Duplication
- Every XP grant generates a deterministic idempotency key:
  $$\text{ID} = \text{tx-}\{\text{source\_type}\}\text{-}\{\text{user\_id}\}\text{-}\{\text{source\_id}\}$$
- The database enforces a `UNIQUE(user_id, source_type, source_id)` index in both SQLite and PostgreSQL.
- **Rule**: `INSERT OR IGNORE`. If `changes === 0`, duplicate XP is suppressed. User `total_xp` is incremented **only** when `changes > 0`.

### 3.5 Streak Progression
- Evaluated using calendar day differences:
  $$\Delta_{\text{days}} = \text{Day}(\text{currentDate}) - \text{Day}(\text{lastWorkoutDate})$$
- If $\Delta_{\text{days}} \le 0$, streak does not advance.
- Multiple completed workouts within the same calendar day (e.g. morning cardio + evening lifting) contribute volume and XP, but increment the daily streak counter exactly once.

### 3.6 Nutrition Logs
- Partitioned by user and calendar date: `(user_id, log_date)`.
- Reconciled using Last-Write-Wins: if conflicting entries exist for the same day, the row with the latest ISO-8601 `updated_at` timestamp is preserved.
