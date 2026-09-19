# ASCEND — Offline-First Synchronization Architecture

## 1. Core Architecture & Mental Model

ASCEND operates under a strict **Local-First, Event-Sourced Synchronization Architecture**. 

```
┌────────────────────────────────────────────────────────────────────────┐
│                        USER ACTION (e.g. Log Set)                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     LOCAL SQLITE TRANSACTION (Atomic)                  │
│  1. Insert into local `set_logs`                                       │
│  2. Update local `exercise_mastery` (deterministic calculation)        │
│  3. Mint local `xp_transactions` & update `profiles`                   │
│  4. Enqueue into `local_sync_queue` (Status: PENDING)                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Instant UI feedback (0ms latency)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     OFFLINE SYNC WORKER (Background)                   │
│  Monitors network state via `@react-native-community/netinfo`          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Network Available
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     TOPOLOGICAL QUEUE FLUSH                            │
│  Sort mutations: Workouts ➔ Exercises ➔ Sets ➔ Mastery ➔ XP            │
│  POST /functions/v1/sync-batch (Supabase Edge Function)                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   SERVER-SIDE ATOMIC INGESTION                         │
│  1. Verify User JWT & RLS                                              │
│  2. Deduplicate idempotent event UUIDs                                 │
│  3. Execute PostgreSQL transaction block                               │
│  4. Return ACK + updated server timestamps                             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     LOCAL ACKNOWLEDGEMENT & PURGE                      │
│  Delete confirmed rows from `local_sync_queue`                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The `local_sync_queue` Data Contract

The queue persists directly within Expo SQLite to survive app restarts, crashes, and device reboots:

```typescript
export interface SyncQueueItem {
  id: string; // Unique mutation UUID (v4)
  entity_type: 
    | 'workout' 
    | 'exercise_log' 
    | 'set_log' 
    | 'exercise_mastery' 
    | 'xp_transaction' 
    | 'profile' 
    | 'user_settings'
    | 'personal_record';
  entity_id: string; // Target primary key UUID
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, any>; // Serialized entity state
  client_timestamp: number; // Monotonic epoch millis
  attempts: number; // Retry counter
  last_error: string | null;
  status: 'PENDING' | 'IN_FLIGHT' | 'FAILED';
}
```

---

## 3. Conflict Resolution Strategy

Conflicts arise when data is modified offline across multiple devices or when server-side state evolves independently. ASCEND classifies all entities into three conflict resolution buckets:

### 3.1 Immutable Append-Only Logs (Zero Conflict)
* **Entities:** `set_logs`, `exercise_logs`, `xp_transactions`, `weight_logs`, `nutrition_logs`.
* **Resolution:** Ingestion is append-only. Because each log entry has a unique client-generated UUID, mutations are idempotent.
* **Server Rule:** If a row with `id = X` already exists in PostgreSQL, the server evaluates it as an idempotent retry and returns `200 OK (ACK)` without altering the existing record.

### 3.2 Deterministic Derived Projections (Reconciliation)
* **Entities:** `exercise_mastery`, `personal_records`, `profiles.total_xp`, `profiles.global_level`.
* **Resolution:** These entities are mathematically derived projections of the immutable log tables.
* **Sync Rule:** 
  1. Client updates its local projection immediately for instant UI feedback.
  2. When logs sync to Supabase, a server-side PostgreSQL trigger or Edge Function recalculates the projection from the verified set logs.
  3. If local and server values differ, the server's recalculation takes precedence, and the client receives the reconciled projection in the sync response payload.

### 3.3 Mutable State Entities (Last-Write-Wins with Timestamps)
* **Entities:** `user_settings`, `workout_plans`.
* **Resolution:** Field-level Last-Write-Wins (LWW) governed by `client_timestamp`.
* **Rule:** An incoming mutation is only applied if `client_timestamp > existing.updated_at`. If older, the mutation is dropped, and the newer remote record is dispatched to the client.

---

## 4. Topological Dependency Ordering

When flushing mutations from `local_sync_queue`, foreign key constraints require strict execution ordering:

```
Step 1: workout_plans
Step 2: workouts
Step 3: exercise_logs
Step 4: set_logs
Step 5: personal_records
Step 6: exercise_mastery
Step 7: xp_transactions
Step 8: profiles / user_settings
```

*Implementation:* The `SyncManager` executes a topological sort on queued items before creating the request batch payload, ensuring no child record is submitted before its referenced parent exists in the database.

---

## 5. Sync Worker & Network Resilience

### 5.1 Trigger Conditions
The sync loop initiates upon:
1. **Network Connectivity Restoration:** NetInfo detects transition from `none`/`unknown` to `wifi`/`cellular`.
2. **Session Completion:** Finishing an active workout immediately queues a sync.
3. **App Foregrounding:** Returning from background triggers a poll.
4. **Periodic Heartbeat:** A 5-minute background timer (when online).

### 5.2 Exponential Backoff & Jitter
If the sync endpoint returns a network failure (timeout, 502, 503):

$$\text{Delay}(n) = \min(60, \; 2^n + \text{rand}(0, 1)) \quad \text{seconds}$$

Where $n$ is the retry attempt counter.

### 5.3 Dead-Letter Queue (DLQ) Handling
* If a mutation fails with a permanent client error (HTTP 400 Bad Request, Zod schema validation mismatch) or exceeds **5 retry attempts**, it transitions to `status = 'FAILED'`.
* FAILED items do not block subsequent mutations.
* The user is notified via an unobtrusive status pill: *"1 sync item pending review."*
* A local diagnostic drawer allows the user to retry or discard corrupted entries.

---

## 6. Server Ingestion Contract: `sync-batch`

The Supabase Edge Function `/functions/v1/sync-batch` accepts batches of up to 100 mutations wrapped in a single database transaction:

```json
{
  "batch_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "client_time": 1726744800000,
  "mutations": [
    {
      "id": "e4b2d5a1-7c3a-4e2b-8a1e-123456789abc",
      "entity_type": "workout",
      "operation": "INSERT",
      "payload": { ... }
    },
    {
      "id": "f5c3e6b2-8d4b-5f3c-9b2f-234567890def",
      "entity_type": "set_log",
      "operation": "INSERT",
      "payload": { ... }
    }
  ]
}
```

### Server Response
```json
{
  "batch_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "status": "SUCCESS",
  "applied_ids": [
    "e4b2d5a1-7c3a-4e2b-8a1e-123456789abc",
    "f5c3e6b2-8d4b-5f3c-9b2f-234567890def"
  ],
  "rejected_ids": [],
  "reconciled_state": {
    "profiles": { "total_xp": 14250, "global_level": 14 }
  }
}
```
