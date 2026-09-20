# ASCEND — Exercise Mastery / Lift Progression System

## 1. System Architecture & Philosophy

In ASCEND, **every exercise progresses independently** from Level 1 to 100+.

The progression model operates on two distinct ledgers:
1. **Global Player Progression**: Reflects overall training consistency, workout volume, streak discipline, and completed quests.
2. **Individual Lift Mastery**: Reflects biomechanical mastery, technical proficiency, and progressive overload achieved on a specific exercise.

```
                  ┌───────────────────────────────┐
                  │      Workout Session          │
                  │   (Sets, Reps, Weight, Pace)  │
                  └───────────────┬───────────────┘
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
   ┌───────────────────────────┐     ┌───────────────────────────┐
   │    Global Player XP       │     │   Exercise Mastery XP     │
   │  - Streak Multipliers     │     │  - Independent Per Lift   │
   │  - Attribute Allocation   │     │  - Multi-Category Metrics │
   │  - Idempotent Ledger      │     │  - Unbounded (1 -> 100+)  │
   │  - Player Level (1-999)   │     │  - Rank Tiers (E -> SSS)  │
   └───────────────────────────┘     └───────────────────────────┘
```

---

## 2. Mastery Leveling Formula & Rank Progression

### Level Curve
The XP required to advance from Level $L$ to $L + 1$ is deterministic and strictly unbounded:
$$\text{XP}_{\text{required}}(L) = \text{round}\left(100 \times L^{1.25}\right)$$

Sample thresholds:
- **Level 1 $\to$ 2**: 100 XP
- **Level 2 $\to$ 3**: 238 XP
- **Level 10 $\to$ 11**: 1,778 XP
- **Level 27 $\to$ 28**: 6,155 XP
- **Level 100 $\to$ 101**: 31,623 XP
- **Level 101+**: Continues monotonically without clamping or integer overflow.

### Rank Tiers
Individual lift mastery levels map deterministically to combat rank tiers:
- **E-Rank**: Levels 1 – 10
- **D-Rank**: Levels 11 – 20
- **C-Rank**: Levels 21 – 30
- **B-Rank**: Levels 31 – 40
- **A-Rank**: Levels 41 – 50
- **S-Rank**: Levels 51 – 60
- **SS-Rank**: Levels 61 – 80
- **SSS-Rank**: Levels 81 – 100+

---

## 3. Multi-Category Performance & XP Models

ASCEND avoids forcing barbell strength models onto non-barbell movements. Each progression type calculates XP and performance metrics according to its biomechanical demands:

### 1. Strength / Barbell / Dumbbell / Machine
- **Key Metrics**: Best Weight, Best Reps, Estimated 1RM (Epley formula: $w \times (1 + r/30)$), Total Volume, Relative Strength ($\text{e1RM} / \text{BW}$).
- **XP Formula**:
  $$\text{Base (20)} + \text{Heavy Bonus (8 if } \text{weight} \ge 0.80 \times \text{e1RM}) + \text{Volume Bonus}\left(\frac{\text{weight} \times \text{reps}}{100}\right) + \text{PR Bonus (50)}$$
- **Caps**: Capped at 150 XP per single set to prevent input spikes.

### 2. Bodyweight Movements (e.g. Pull-Ups, Dips, Push-Ups)
- **Key Metrics**: Best Reps, Added Weight, Total Reps, Sessions.
- **Unweighted Sets**: Do not require $w > 0$. Base (20) + Reps Bonus ($\text{reps} \times 1.5$) + PR Bonus (50).
- **Weighted Sets**: Receive an additional added-weight volume bonus. 1RM estimation is not forced.

### 3. Cardio Movements (e.g. Running, Cycling, Rowing)
- **Key Metrics**: Distance (meters), Duration (seconds), Pace (min/km or seconds/km).
- **XP Formula**:
  $$\text{Base (20)} + \text{Distance Bonus}\left(\frac{\text{meters}}{100}\right) + \text{Duration Bonus}\left(\frac{\text{seconds}}{30}\right) + \text{PR Bonus (50)}$$
- **Personal Records**: Tracks `BEST_DISTANCE` (higher is better) and `BEST_PACE` (lower seconds/km is better).

### 4. Athletic Movements (e.g. Kettlebell Swings, Box Jumps)
- **Key Metrics**: Reps, Duration, RPE, Sessions.
- **XP Formula**:
  $$\text{Base (20)} + \text{Reps Bonus}(\text{reps} \times 1.2) + \text{Duration Bonus}\left(\frac{\text{seconds}}{30}\right) + \text{PR Bonus (50)}$$

---

## 4. Personal Record (PR) System & Conflict Resolution

ASCEND verifies and records personal records in the SQLite table `personal_records`:
- `MAX_WEIGHT`: Heaviest weight successfully completed for $\ge 1$ rep.
- `MAX_REPS`: Most repetitions completed in a single set.
- `MAX_VOLUME`: Highest single-set tonnage ($\text{weight} \times \text{reps}$).
- `MAX_ESTIMATED_1RM`: Peak single-set calculated 1RM.
- `BEST_DISTANCE`: Greatest distance covered in a single session/set.
- `BEST_PACE`: Lowest running pace in seconds per kilometer (fastest pace).

### Conflict Resolution: Highest Value Wins (HVW)
When syncing or updating records, ASCEND enforces deterministic conflict resolution:
1. For weight, reps, volume, estimated 1RM, and distance: a submission updates the database **only if** $\text{value}_{\text{new}} > \text{value}_{\text{existing}}$.
2. For cardio pace: a submission updates the database **only if** $\text{value}_{\text{new}} < \text{value}_{\text{existing}}$ (or if existing is 0).
3. Equal or inferior submissions return `false` without overwriting or generating duplicate rows.

---

## 5. Anti-Exploit Protections

The Exercise Mastery engine guards against progression exploits:
- **Set Deduplication**: Sets logged within 30 seconds of an identical set are flagged as duplicate clicks and ignored.
- **Warmup Discount**: Warmup sets yield 20% base XP with 0 heavy bonus and 0 volume bonus.
- **Uncompleted Sets**: Sets marked `completed = false` or with non-positive work yield strictly 0 XP.
- **Single Set Cap**: Mastery XP per set is capped at 150 XP.
- **Session Duration Minimum**: Sessions under 180s without qualifying work cannot advance progression.

---

## 6. Trend Telemetry

Each exercise calculates a dynamic performance trend:
- **NEW**: The athlete has 0 prior recorded sessions.
- **IMPROVING**: Current session broke a PR, exceeded previous peak 1RM, increased best working weight, or improved cardio pace.
- **MAINTAINING**: Session completed within healthy baseline tolerances ($\ge 90\%$ baseline 1RM / pace).
- **REGRESSING**: Performance fell significantly below previous baselines ($< 90\%$ baseline 1RM or $> 15\%$ slower pace).

---

## 7. Database & Schema Design

SQLite tables supporting Exercise Mastery:

```sql
CREATE TABLE IF NOT EXISTS exercise_mastery (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  mastery_level INTEGER NOT NULL DEFAULT 1,
  mastery_xp INTEGER NOT NULL DEFAULT 0,
  rank TEXT NOT NULL DEFAULT 'E',
  estimated_1rm_kg REAL NOT NULL DEFAULT 0.0,
  best_weight_kg REAL NOT NULL DEFAULT 0.0,
  best_reps INTEGER NOT NULL DEFAULT 0,
  best_volume_kg REAL NOT NULL DEFAULT 0.0,
  relative_strength REAL,
  total_sessions INTEGER NOT NULL DEFAULT 0,
  total_sets INTEGER NOT NULL DEFAULT 0,
  total_reps INTEGER NOT NULL DEFAULT 0,
  total_volume_kg REAL NOT NULL DEFAULT 0.0,
  personal_records_count INTEGER NOT NULL DEFAULT 0,
  milestones_unlocked_count INTEGER NOT NULL DEFAULT 0,
  recent_performance TEXT NOT NULL DEFAULT '[]',
  last_trained_at TEXT,
  trend TEXT NOT NULL DEFAULT 'NEW',
  xp_to_next_level INTEGER NOT NULL DEFAULT 100,
  best_distance_meters REAL DEFAULT 0.0,
  best_duration_seconds INTEGER DEFAULT 0,
  best_pace_seconds_per_km REAL DEFAULT 0.0,
  total_distance_meters REAL DEFAULT 0.0,
  total_duration_seconds INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (exercise_id) REFERENCES exercise_catalog (id) ON DELETE CASCADE,
  UNIQUE(user_id, exercise_id)
);
```

### Historical Workout Migration
`MasteryRepository.deriveMasteryFromHistory(userId)` recalculates and backfills exercise mastery rows directly from historical `exercise_logs` and `set_logs`, using the deterministic `MasteryEngine` level formula without losing historical work.

---

## 8. User Interface

The **MY LIFTS // EXERCISE MASTERY** directory (`src/app/(tabs)/progress/index.tsx`) and **Movement Dossier** (`src/app/(tabs)/progress/[exerciseId].tsx`) render:
- Movement Name and Primary Muscle / Equipment tags.
- Current Mastery Level and Rank Tier (E through SSS).
- Progress Bar with `current / next XP` and percentage completion.
- Dynamic Trend Badge (`▲ IMPROVING`, `● MAINTAINING`, `▼ REGRESSING`, `★ NEW`).
- Category-sensitive metrics:
  - **Strength**: Estimated 1RM, Best Set ($w \times r$), Lifetime Volume, Sessions.
  - **Bodyweight**: Max Reps PR, Added Weight, Total Reps, Sessions.
  - **Cardio**: Best Distance (km), Best Pace (min/km), Total Duration, Sessions.
- Verified PR breakthrough history with gold badges.
