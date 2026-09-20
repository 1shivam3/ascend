# ASCEND Multi-Goal Training System

## Overview

ASCEND supports **9 primary training goals**, each producing fundamentally different programming, quest objectives, progress metrics, and progression strategies. The system is designed so that runners, calisthenics athletes, powerlifters, and general fitness enthusiasts are all first-class citizens — ASCEND is **not** bodybuilding-centric.

---

## Primary Goals

| Goal | Internal Key | Description |
|------|-------------|-------------|
| Build Muscle | `BUILD_MUSCLE` | Volume-driven hypertrophy, 8-12 rep ranges, muscle-group balance |
| Get Stronger | `GET_STRONGER` | Heavy compound lifts, 3-6 rep ranges, linear strength progression |
| Athletic Performance | `ATHLETIC_PERFORMANCE` | Power, speed, jumps, carries, explosive movement quality |
| Lose Fat | `LOSE_FAT` | High-density circuits, compound movements, metabolic conditioning |
| Endurance | `ENDURANCE` | Duration, distance, pace, aerobic threshold progression |
| General Fitness | `GENERAL_FITNESS` | Balanced strength, cardio, and mobility |
| Sport Performance | `SPORT_PERFORMANCE` | Multi-planar power, deceleration, sport-specific patterns |
| Calisthenics | `CALISTHENICS` | Bodyweight progressions, strict form, skill mastery |
| Custom | `CUSTOM` | User-defined directives and progression rules |

### Secondary Goals

Users may select **optional secondary goals** from the same list. These influence quest availability and progress screen emphasis but do not override the primary programming discipline.

---

## Goal Profile Schema

Stored in the `profiles` table:

| Column | Type | Description |
|--------|------|-------------|
| `primary_goal` | `TEXT` | One of the 9 `PrimaryGoal` values |
| `secondary_goals` | `TEXT` (JSON array) | Array of secondary `PrimaryGoal` values |
| `goal` | `TEXT` | Legacy goal field (normalized via `normalizeGoal()`) |

### `TrainingPreferences` extensions:

- `customGoalDescription?: string` — Free-text directives for `CUSTOM` goal
- `sportName?: string` — Target sport for `SPORT_PERFORMANCE` goal

---

## Backward Compatibility

Legacy profiles stored goals like `BUILD_STRENGTH`, `HYPERTROPHY`, `ATHLETICISM`, `FAT_LOSS`. The `normalizeGoal()` function in `src/utils/validation/onboardingSchema.ts` maps these seamlessly:

| Legacy Goal | Normalized To |
|------------|---------------|
| `BUILD_STRENGTH` | `GET_STRONGER` |
| `HYPERTROPHY` | `BUILD_MUSCLE` |
| `ATHLETICISM` | `ATHLETIC_PERFORMANCE` |
| `FAT_LOSS` | `LOSE_FAT` |
| `ENDURANCE` | `ENDURANCE` |

Unknown/unrecognized goals default to `GET_STRONGER`.

---

## Programming Disciplines

The `DeterministicWorkoutGenerator` produces goal-tailored workout plans:

### Strength (`GET_STRONGER`)

- **Rep Scheme**: 3-5 (compounds), 4-6 (accessories)
- **Sets**: 4-5 per exercise
- **Rest**: 150-180s between compound sets
- **RPE Target**: 9
- **Split**: Upper/Lower Heavy Compound or Full Body Strength
- **Progression**: Linear +2.5kg on primary compounds when all sets hit target reps

### Hypertrophy (`BUILD_MUSCLE`)

- **Rep Scheme**: 8-12
- **Sets**: 3-4 per exercise
- **Rest**: 75-90s
- **RPE Target**: 8
- **Split**: Push/Pull/Legs or Upper/Lower Hypertrophy
- **Progression**: Add reps within range, then increase load by 1-2.5kg

### Athletic Performance (`ATHLETIC_PERFORMANCE`)

- **Rep Scheme**: 4-6 (power focus)
- **Sets**: 4 per exercise
- **Rest**: 90-120s
- **RPE Target**: 8
- **Split**: Athletic Power & Speed Split
- **Emphasis**: Explosive concentric velocity, carries, jumps, movement quality
- **Patterns**: Includes `CARRY`, `LUNGE`, `ATHLETIC` movement patterns

### Endurance (`ENDURANCE`)

- **Rep Scheme**: 15-20 (resistance), duration-based (cardio)
- **Sets**: 3 per exercise, 1 for cardio
- **Rest**: 30-60s
- **RPE Target**: 7.5
- **Split**: Aerobic & Work Capacity Engine
- **Cardio**: Includes `CARDIO` movement pattern with `target_distance_meters`, `target_duration_seconds`, `target_pace_seconds_per_km`

### Calisthenics (`CALISTHENICS`)

- **Rep Scheme**: 8-12
- **Sets**: 4 per exercise
- **Rest**: 60-90s
- **RPE Target**: 8
- **Split**: Bodyweight Mastery Protocol
- **Pool**: Prioritizes `BODYWEIGHT` equipment exercises
- **Progression**: Master strict form → advance leverage → add resistance at 15+ clean reps

### Fat Loss (`LOSE_FAT`)

- **Rep Scheme**: 12-15
- **Sets**: 3 per exercise
- **Rest**: 45-60s
- **RPE Target**: 8
- **Split**: Metabolic Conditioning Split
- **Emphasis**: High training density, reduced rest, compound movements

### Sport Performance (`SPORT_PERFORMANCE`)

- **Rep Scheme**: 5-8
- **Sets**: 3 per exercise
- **Rest**: 90s
- **RPE Target**: 8
- **Split**: `{SPORT_NAME} PERFORMANCE PROTOCOL`
- **Emphasis**: Multi-planar deceleration, reactive power, rotational kinetics

### General Fitness (`GENERAL_FITNESS`)

- **Rep Scheme**: 8-12
- **Sets**: 3 per exercise
- **Rest**: 75s
- **RPE Target**: 8
- **Split**: Balanced General Conditioning
- **Emphasis**: Alternating compound strength and aerobic capacity

### Custom (`CUSTOM`)

- **Rep Scheme**: 8-10 (default)
- **Sets**: 3 per exercise
- **Rest**: 90s
- **Split**: Custom Ascent Protocol
- **Progression**: Incorporates user's `customGoalDescription` directives

---

## Split Templates

Each goal has distinct split templates selected by `days_per_week`:

- **Athletic/Sport**: Templates emphasize carries, lunges, explosive patterns
- **Endurance**: Every template includes `CARDIO` movement slots
- **Calisthenics**: Templates use only `PUSH_HORIZONTAL`, `PULL_VERTICAL`, `PUSH_VERTICAL`, `PULL_HORIZONTAL`, `SQUAT`, `LUNGE`, `ISOLATION`
- **Default (Strength/Hypertrophy/Fat Loss/General)**: Traditional compound-balanced splits

---

## Goal-Specific Quest Categories

| Quest Category | Trigger | Example |
|---------------|---------|---------|
| `HEAVY_COMPOUND` | Completed compound sets with ≤6 reps | "Forge 10 heavy compound sets this week" |
| `TARGET_VOLUME` | Total training volume (kg) | "Accumulate 50,000 kg total training tonnage" |
| `TARGET_DISTANCE` | Distance covered in meters | "Cover 10 km of aerobic distance this week" |
| `POWER_CONDITIONING` | Sets with ATHLETIC/CARRY pattern or KETTLEBELL equipment | "Complete 20 power/conditioning sets" |
| `CALISTHENICS_REPS` | Reps from BODYWEIGHT exercises | "Perform 200 bodyweight reps this week" |
| `WORKOUT_COUNT` | Completed workouts | "Complete 4 workouts this week" |
| `VOLUME_TOTAL` | Total volume (same as TARGET_VOLUME) | Legacy alias |
| `FAILURE_SETS` | Sets taken to failure | "Push 5 sets to muscular failure" |
| `COMPOUND_SETS` | Any compound movement sets | "Complete 20 compound sets" |
| `MASTERY_LEVEL` | Exercise mastery level-ups | Updated via mastery progression |

---

## Adaptive Progress Screen

The progress screen KPIs adapt dynamically based on `profile.primaryGoal`:

| Goal | KPI 1 | KPI 2 | KPI 3 | KPI 4 |
|------|-------|-------|-------|-------|
| Endurance | Weekly Distance | Average Pace | Sessions | Consistency |
| Calisthenics | Bodyweight Reps | Skills Mastered | Sessions | Consistency |
| Athletic | Power Records | Volume | Sessions | Consistency |
| Strength | Total Volume | Compound Tonnage | Sessions | Consistency |
| Default | Total Volume | Weekly Sets | Sessions | Consistency |

---

## Onboarding Flow

1. **StepGoal**: Displays all 9 primary goals as selectable cards with glyphs and descriptions
2. **Secondary Goals**: Multi-select chips for optional secondary goals
3. **Sport Name**: Text input (visible when `SPORT_PERFORMANCE` selected)
4. **Custom Directives**: Text input (visible when `CUSTOM` selected)

---

## Architecture Files

| File | Purpose |
|------|---------|
| `src/types/domain.types.ts` | `PrimaryGoal` type, `TrainingPreferences` extensions |
| `src/utils/validation/onboardingSchema.ts` | `normalizeGoal()`, Zod schemas, `PRIMARY_GOALS` |
| `src/database/schema.ts` | `primary_goal`, `secondary_goals` columns |
| `src/database/migrations/init.ts` | Additive column migration, goal-specific quest seeds |
| `src/database/repositories/ProfileRepository.ts` | Goal persistence in profile CRUD |
| `src/services/ai/DeterministicWorkoutGenerator.ts` | Goal-tailored programming engine |
| `src/services/ai/schemas.ts` | `GenerationInputSchema` with goal fields |
| `src/services/workout/QuestEngine.ts` | Goal-specific quest evaluation |
| `src/types/quest.types.ts` | `QuestCategory` with goal quest types |
| `src/components/onboarding/StepGoal.tsx` | Goal selection UI |
| `src/app/(tabs)/progress/index.tsx` | Adaptive KPI display |
| `src/app/(tabs)/profile/index.tsx` | Goal display in profile |
| `src/store/useAuthStore.ts` | Goal-based attribute buffs, split naming |
| `supabase/functions/generate-workout/index.ts` | AI prompt goal awareness |
