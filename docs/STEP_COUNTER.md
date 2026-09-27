# ASCEND Device Step Counter Architecture

## 1. Executive Summary

ASCEND replaces the external Google Health Connect dependency with a lean, reliable, native device step-counting feature. This eliminates external companion app installations, heavy sync queues, complex OAuth scopes, and flakey background sync while maintaining full local-first privacy and battery efficiency.

The solution directly leverages Android's low-power hardware step counter coprocessor (`Sensor.TYPE_STEP_COUNTER`), providing continuous counting across app terminations without battery drain.

---

## 2. Hardware Architecture & Permissions

### Native Module (`StepCounterModule.kt`)
- **Sensor Type**: `Sensor.TYPE_STEP_COUNTER` (cumulative counter initialized to 0 on device boot and incremented continuously by hardware).
- **Sensor Delay**: `SensorManager.SENSOR_DELAY_UI` for responsive updates during active use.
- **Permission**: Single runtime permission — `android.permission.ACTIVITY_RECOGNITION` (Android 10+ / API 29+).
- **Zero External Dependencies**: Does not require Google Play Services, Health Connect app, or Google Fit.

```
┌────────────────────────────────────────────────────────┐
│                   ASCEND Home / Profile                │
│            (Compact Progress Bar & Goal Selector)       │
└───────────────────────────┬────────────────────────────┘
                            │ Zustand useStepStore
                            ▼
┌────────────────────────────────────────────────────────┐
│                  StepCounterService                    │
│    (Android Step Model, Calibration, Reboot Recovery)  │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
              ▼                           ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│     StepRepository        │ │      ChallengeEngine      │
│  (daily_step_summaries)   │ │  (eventType: 'STEPS')     │
│   Local SQLite Database   │ │  STRICT: ZERO Gym/PR XP   │
└───────────────────────────┘ └───────────────────────────┘
              ▲
              │ Native Bridge / Event Emitter
┌────────────────────────────────────────────────────────┐
│           StepCounterModule.kt (Native Kotlin)         │
│            Android Sensor.TYPE_STEP_COUNTER            │
└────────────────────────────────────────────────────────┘
```

---

## 3. The Android Step Model

Android's `Sensor.TYPE_STEP_COUNTER` counts the number of steps taken by the user since the last device reboot. The sensor value only resets when the operating system boots.

To provide seamless daily step counts, `StepCounterService` implements the formal **Android Step Model**:

### A. Initial Baseline Calibration
On first install or initial launch of the feature:
$$\text{baseline} = \text{rawSensorValue}$$
$$\text{todaySteps} = 0$$
$$\text{lastSensorValue} = \text{rawSensorValue}$$
*Effect*: Prevents the user from being awarded thousands of historical steps taken before installing ASCEND.

### B. Normal Step Accumulation
When the hardware sensor emits an increased value ($\text{rawSensorValue} > \text{lastSensorValue}$):
$$\Delta = \text{rawSensorValue} - \text{lastSensorValue}$$
$$\text{todaySteps} = \text{todaySteps} + \Delta$$
$$\text{lastSensorValue} = \text{rawSensorValue}$$

### C. Day Boundary (Midnight Rollover)
When a reading arrives with $\text{record.date} \neq \text{today}$:
1. Yesterday's summary is finalized and archived in SQLite (`daily_step_summaries`).
2. New day state is initialized:
   $$\text{baseline} = \text{rawSensorValue}$$
   $$\text{todaySteps} = 0$$
   $$\text{lastSensorValue} = \text{rawSensorValue}$$

### D. Device Reboot Recovery
When the device reboots, the hardware counter drops to near-zero ($\text{rawSensorValue} < \text{lastSensorValue}$):
1. Preserve steps already earned today:
   $$\text{todaySteps} = \text{preRebootSteps} + \max(0, \text{rawSensorValue})$$
   $$\text{baseline} = 0$$
   $$\text{lastSensorValue} = \text{rawSensorValue}$$
2. Subsequent increments accumulate normally from the post-reboot count.

### E. Idempotency & Duplicate Filtering
If $\text{rawSensorValue} == \text{lastSensorValue}$:
The reading is discarded immediately without redundant computations or database writes.

---

## 4. Background Execution & Honesty

- **Hardware Advantage**: The physical device hardware sensor coprocessor accumulates steps while the CPU sleeps and while the app is terminated, with zero battery drain.
- **Transparent Foreground Resume**: Because continuous background JS execution in Android without foreground notifications is aggressively throttled by the OS, ASCEND listens to `AppState` transitions:
  ```typescript
  AppState.addEventListener('change', (nextAppState) => {
    if (nextAppState === 'active') {
      StepCounterService.refreshSteps(activeUserId);
    }
  });
  ```
- When the user opens or returns to ASCEND, the accumulated hardware counter delta is applied instantaneously.

---

## 5. Local SQLite Storage (`daily_step_summaries`)

Step data is stored locally in SQLite with a clean, low-footprint table structure:

```sql
CREATE TABLE IF NOT EXISTS daily_step_summaries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  today_steps INTEGER NOT NULL DEFAULT 0,
  step_goal INTEGER NOT NULL DEFAULT 10000,
  last_sensor_value INTEGER NOT NULL DEFAULT 0,
  baseline INTEGER NOT NULL DEFAULT 0,
  last_updated_at TEXT NOT NULL,
  synced_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_step_summaries_user_date 
ON daily_step_summaries(user_id, date);
```

### Guest User Migration
When a guest operative authenticates or signs in with Google, `ProfileRepository.migrateGuestUser` cascades to `daily_step_summaries`:
```sql
UPDATE daily_step_summaries SET user_id = ? WHERE user_id = ?;
```

---

## 6. Progression Isolation & Quarantine

To preserve the integrity of ASCEND's gym RPG progression system:
1. **Zero Gym Workout XP**: Step events never grant gym workout XP, barbell strength XP, or attribute points reserved for resistance training.
2. **Zero Exercise Mastery Leakage**: Steps never increment Exercise Mastery levels (Squat, Bench, Deadlift, Overhead Press, etc.).
3. **Quests & Challenges Only**: Steps are dispatched strictly to `ChallengeEngine` as `eventType: 'STEPS'`:
   ```typescript
   ChallengeEngine.processEvent(userId, {
     eventId: `device-step-${userId}-${date}`,
     eventType: 'STEPS',
     timestamp: `${date}T23:59:59Z`,
     stepsCount: totalSteps,
   });
   ```
4. **Zero Health Telemetry in Social Feed**: Step counts and biometric activity are never automatically published to the public social feed.

---

## 7. UI Components

1. **Home Screen (`src/app/(tabs)/index.tsx`)**:
   - Compact card in Section 4: `STEPS 6,842 / 10,000` with visual progress bar and percentage display.
   - Tap opens the Device Activity detail sheet.
2. **Profile Screen (`src/app/(tabs)/profile/index.tsx`)**:
   - Replaces the old Health Connect hub card with "Device Activity".
   - Displays real-time step count, sensor availability badge, and quick access modal.
3. **Device Activity Modal (`src/components/health/DeviceActivityModal.tsx`)**:
   - Target goal selector (`5,000`, `8,000`, `10,000`, `12,000`, `15,000`).
   - Hardware sensor status indicator (`Ready`, `Permission Required`, `Unavailable`).
   - Clear architectural explanation of native hardware step counting.
