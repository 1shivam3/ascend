export type Gender = 'male' | 'female' | 'other';
export type Unit = 'kg' | 'lbs';
export type Theme = 'dark' | 'light';

/**
 * §35: the STORED theme preference is one value — the mode.
 * 'light'/'dark' are explicit choices; 'system' means "follow the
 * OS". The resolved Theme is derived (resolveTheme below) and is
 * runtime state only: following the system never overwrites the
 * stored mode. (Before §35 the mode was encoded as Theme × a
 * hasCustomTheme boolean, and system-following kept overwriting
 * the stored theme with a snapshot of the OS value.)
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Legacy pair → mode (the §35 migration + old-backup reads). */
export function themeModeFromLegacy(
  theme: unknown,
  hasCustomTheme: unknown,
): ThemeMode {
  if (hasCustomTheme === true && (theme === 'light' || theme === 'dark')) {
    return theme;
  }
  return 'system';
}

/** The Theme a mode renders as, given the OS preference. */
export function resolveTheme(mode: ThemeMode, systemTheme: Theme): Theme {
  return mode === 'system' ? systemTheme : mode;
}
export type UserMode = 'beginner' | 'intermediate' | 'advanced';
export type DietPreference = 'vegetarian' | 'eggitarian' | 'non_vegetarian' | 'vegan';

export type AthleteGoal = 'build_muscle' | 'get_stronger' | 'lose_fat' | 'stamina' | 'general_fitness';

/**
 * Canonical default goals used whenever an athlete has no goals recorded yet.
 * Single source of truth — every fallback across the app must reference this
 * instead of inventing its own default pair.
 */
export const DEFAULT_GOALS: AthleteGoal[] = ['build_muscle'];

/**
 * Deterministically resolves the single "primary" goal that drives the nutrition
 * engine and goal-adaptive prescriptions when an athlete selects multiple goals.
 *
 * Priority is conservative by design: a fat-loss goal always wins, because a
 * caloric surplus would directly sabotage weight loss, while a moderate deficit
 * with elevated protein still serves muscle/strength goals. Among the remaining
 * goals, hypertrophy outranks strength (larger surplus), then strength, stamina,
 * and general fitness.
 */
export function resolvePrimaryGoal(goals?: AthleteGoal[] | null): AthleteGoal {
  if (!goals || goals.length === 0) return DEFAULT_GOALS[0];
  const priority: AthleteGoal[] = ['lose_fat', 'build_muscle', 'get_stronger', 'stamina', 'general_fitness'];
  for (const g of priority) {
    if (goals.includes(g)) return g;
  }
  return goals[0];
}

export interface AthleteGoalConfig {
  id: AthleteGoal;
  label: string;
  tagline: string;
  trainingEmphasis: string;
  nutritionEmphasis: string;
  defaultRepRange: { min: number; max: number };
  defaultRestSeconds: number;
}

/** Maximum athlete display-name length, enforced everywhere names are entered. */
export const MAX_ATHLETE_NAME_LENGTH = 50;

/** Maximum workout plan name length. */
export const MAX_PLAN_NAME_LENGTH = 60;

export const ATHLETE_GOAL_CONFIGS: Record<AthleteGoal, AthleteGoalConfig> = {  build_muscle: {
    id: 'build_muscle',
    label: 'Build Muscle',
    tagline: 'Hypertrophy volume, exercise selection, progressive overload',
    trainingEmphasis: 'Moderate-to-high rep brackets (8–12 reps), high set volume, double-progression model',
    nutritionEmphasis: 'Lean surplus (+250 kcal), protein target (~1.8g/kg) to support muscle protein synthesis',
    defaultRepRange: { min: 8, max: 12 },
    defaultRestSeconds: 90,
  },
  get_stronger: {
    id: 'get_stronger',
    label: 'Get Stronger',
    tagline: 'Compound lifts, RPE, strength progression, PRs',
    trainingEmphasis: 'Heavy compound singles/triples (3–6 reps), velocity maintenance, 1RM milestones & DOTS tracking',
    nutritionEmphasis: 'Maintenance to slight surplus (+150 kcal), complex carbohydrates for CNS and glycogen stores',
    defaultRepRange: { min: 3, max: 6 },
    defaultRestSeconds: 150,
  },
  lose_fat: {
    id: 'lose_fat',
    label: 'Lose Fat',
    tagline: 'Calorie target, weight trend, resistance training, activity',
    trainingEmphasis: 'Preserve heavy mechanical tension to spare lean mass while maintaining training density',
    nutritionEmphasis: 'Moderate deficit (-450 kcal), elevated protein (~2.0g/kg) to protect lean tissue',
    defaultRepRange: { min: 6, max: 10 },
    defaultRestSeconds: 75,
  },
  stamina: {
    id: 'stamina',
    label: 'Improve Fitness / Stamina',
    tagline: 'Conditioning, work capacity, cardio progression',
    trainingEmphasis: 'Work capacity conditioning (Zone 2, intervals, circuits), higher rep sets, shorter rest intervals',
    nutritionEmphasis: 'Maintenance calories, balanced hydration, electrolyte replenishment, and sustained energy carbs',
    defaultRepRange: { min: 12, max: 15 },
    defaultRestSeconds: 60,
  },
  general_fitness: {
    id: 'general_fitness',
    label: 'General Fitness',
    tagline: 'Balanced strength + conditioning',
    trainingEmphasis: 'Well-rounded strength, joint longevity, functional movements, and sustainable routine adherence',
    nutritionEmphasis: 'Nutritious whole-food baseline, consistent hydration, and balanced macros (~1.6g/kg protein)',
    defaultRepRange: { min: 6, max: 10 },
    defaultRestSeconds: 90,
  },
};

export type OverallTitle =
  | 'INITIATE'
  | 'FORGED'
  | 'ADEPT'
  | 'VANGUARD'
  | 'ELITE'
  | 'ASCENDANT'
  | 'APEX'
  | 'TRANSCENDENT'
  | 'TITAN'
  | 'IMMORTAL';

export type ExerciseRank =
  | 'FOUNDATION'
  | 'TRAINED'
  | 'SKILLED'
  | 'ADVANCED'
  | 'ELITE'
  | 'MASTER'
  | 'GRANDMASTER';

export interface BodyMetricEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
  /**
   * Where this entry came from. 'health-connect' entries are created by
   * Health Connect sync and may be refreshed by later syncs; a manual
   * weigh-in for the same date is never overwritten by sync.
   * Absent = manual (all pre-existing entries).
   */
  source?: 'manual' | 'health-connect';
  heightCm?: number;
  bodyFatPct?: number;
  chestIn?: number;
  waistIn?: number;
  hipsIn?: number;
  notes?: string;
  /**
   * Local last-edit stamp (ISO). Gauntlet R1/DI-08 newest-wins sync:
   * every store edit path stamps this; push upserts only rows whose
   * stamp is strictly newer than the server row's `updated_at`, and
   * pull adopts the newer side per row. Absent on rows created before
   * stamping existed — those fail to the server (never overwrite
   * remote) until edited. Persisted with the row (partialize carries
   * whole slices) and restored from the server row's `updated_at` on
   * pull, so comparisons work across devices.
   */
  updatedAt?: string;
}

export interface UserProfile {
  id: string;
  /**
   * Provenance for identity routing (Phase 1.4, §5/§6): the auth uid
   * whose account this profile belongs to, stamped when the profile
   * is rebuilt from the server row, linked to an account, or carried
   * in from a backup that recorded it. Absent = legacy profile —
   * identity falls back to the id-shape rules. Excluded from the sync
   * upsert/pull field lists (LOCAL ONLY, like bodyweightSource), but
   * backups DO carry it by design: a same-account restore on another
   * device must stay same-account. See src/lib/identity.ts.
   */
  createdByUid?: string;
  /**
   * Set by backup/archive import when the profile arrived via
   * importAllData. An imported profile with no createdByUid is
   * treated as cross-account at sync (imports are cross unless
   * marked same); cleared when a pull stamps createdByUid.
   */
  importedFromBackup?: boolean;
  name: string;
  gender: Gender;
  bodyweightKg: number;
  bodyweightLbs: number;
  heightCm?: number;
  /**
   * Phase-1 (Task 1.1) provenance for the two body stats every calorie
   * target derives from: 'user' = the user actually entered the value;
   * 'default' = a seeded placeholder (onboarding skip / start-fresh
   * default profile) that was never entered. Absent = legacy profile
   * created before provenance existed — treated as 'user' (its values
   * predate the simplified onboarding and may well be real; existing
   * users must not lose their targets). LOCAL ONLY, like dateOfBirth:
   * the sync upsert/pull field lists are explicit and do not include
   * these keys, so they never leave the device.
   */
  bodyweightSource?: 'user' | 'default';
  heightSource?: 'user' | 'default';
  age?: number;
  /**
   * Date of birth, YYYY-MM-DD. LOCAL DEVICE ONLY — never synced: the
   * profiles table has no dob column and the sync upsert/pull field lists
   * are explicit, so this key never leaves the device. Consumers read
   * `age`, which is (re)calculated from this via calculateAgeFromDob.
   */
  dateOfBirth?: string;
  unit: Unit;
  createdAt: string;
  /**
   * Local last-edit stamp (ISO). Sync compares it against the server
   * row's `updated_at` so a pull never clobbers a newer local edit
   * (QA4A-001, last-write-wins). Absent on profiles created before the
   * stamp existed — those lose to the server, as before.
   */
  updatedAt?: string;
  goals?: AthleteGoal[];
  userMode?: UserMode;
  dietPreference?: DietPreference;
  /** Small compressed profile photo (dataURL, ~256px). */
  avatar?: string;
}

export interface PersonalRecord {
  id: string;
  exercise: string;
  weightKg: number;
  weightLbs: number;
  reps: number;
  oneRepMax: number;
  date: string;
  notes?: string;
  isBaseline?: boolean;
  prType?: '1rm' | 'reps';
  /** Local last-edit stamp (ISO) for R1/DI-08 newest-wins sync — see BodyMetricEntry.updatedAt. */
  updatedAt?: string;
}

export type SetExecutionStatus = 'pending' | 'completed' | 'skipped' | 'not_attempted';

/**
 * The statuses a PERSISTED history set may carry (§17, Phase 3.4):
 * 'pending' is a live-draft concept and never persists — an
 * entered-but-unfinished set is saved as 'not_attempted' with its
 * reps kept as data (see normalizePersistedWorkoutSet).
 */
export type PersistedSetStatus = 'completed' | 'skipped' | 'not_attempted';

export interface WorkoutSet {
  // Performed / actual execution values
  reps: number;
  weight?: number;
  unit: Unit;
  /**
   * LEGACY dual encoding (§17): the live draft still toggles this
   * while a session runs, but persisted history no longer writes it
   * (finalizeWorkoutSet strips it; stored history is canonicalized
   * by normalizePersistedWorkoutSet). Read it ONLY through the
   * resolvers below — never directly.
   */
  completed?: boolean;
  rpe?: number;
  // §23 (Phase 3.1): there is deliberately NO `isPR` field — it was
  // declared for years and never written by any code path, while
  // four surfaces read it. PR-ness is computed at read time from
  // the one replay (computeSessionPRMarks / isPRSet in
  // pr-reevaluation.ts). Do not re-add a stored flag.
  isWarmup?: boolean;

  // Prescribed / target values (optional for backwards compatibility with legacy records)
  prescribedWeight?: number;
  prescribedReps?: number;
  prescribedRpe?: number;
  prescribedUnit?: Unit;

  // Provenance linking back to an applied policy decision (set only when verified via audit)
  appliedDecisionId?: string;

  /**
   * THE execution status (§17, Phase 3.4): the single stored truth
   * for persisted sets. Optional on the type only because legacy
   * records and live drafts may not have stamped it yet — the
   * resolvers below define what an absent status means.
   */
  status?: SetExecutionStatus;
}

/**
 * §17 (Phase 3.4): THE ONE status precedence implementation. The
 * three public resolvers below all delegate here; they used to be
 * three separate implementations that could disagree (and did —
 * e.g. weekly-review read the raw boolean beside them).
 *
 * Precedence:
 * 1. Explicit `status` wins over every legacy encoding — including a
 *    conflicting `completed: true` beside `status: 'skipped'`.
 * 2. Legacy `completed === true` → 'completed';
 *    `completed === false` → 'pending' when reps were entered
 *    (a planned/entered set awaiting completion), else
 *    'not_attempted'. (Legacy records are never assumed 'skipped'.)
 * 3. Neither field (historical stored records): the ONE deliberate
 *    context difference, named by `inferCompletedFromReps` —
 *    history (true): reps > 0 means a logged set → 'completed'
 *    (long-standing ASCEND behavior for flag-less records);
 *    live draft (false): typed reps alone never complete a set →
 *    'pending'.
 */
function resolveSetStatus(
  set: WorkoutSet,
  inferCompletedFromReps: boolean,
): SetExecutionStatus {
  if (set?.status) {
    return set.status;
  }
  if (set?.completed === true) {
    return 'completed';
  }
  if (set?.completed === false) {
    return set.reps && set.reps > 0 ? 'pending' : 'not_attempted';
  }
  if (set?.reps && set.reps > 0) {
    return inferCompletedFromReps ? 'completed' : 'pending';
  }
  return 'not_attempted';
}

/** The set's execution status under HISTORY semantics. */
export function getSetExecutionStatus(set: WorkoutSet): SetExecutionStatus {
  return resolveSetStatus(set, true);
}

/** Whether a (history) set counts as successfully completed. */
export function isSetCompleted(set: WorkoutSet): boolean {
  return resolveSetStatus(set, true) === 'completed';
}

/**
 * Whether a set in an ACTIVE workout draft/session is completed.
 * Same precedence, draft semantics: never inferred from reps alone.
 */
export function isActiveSetCompleted(set: WorkoutSet): boolean {
  return resolveSetStatus(set, false) === 'completed';
}

/**
 * §17 (Phase 3.4): canonicalize a set for PERSISTED history — one
 * stored field (`status`, a PersistedSetStatus), the legacy
 * `completed` boolean removed. Resolution follows the old
 * precedence exactly, so no set changes meaning: an explicit status
 * wins over a conflicting boolean, and a resolved 'pending' (entered
 * but never finished) persists as 'not_attempted' with reps kept.
 * Idempotent; applied by finalizeWorkoutSet (born canonical), the
 * persist migration, and backup import.
 */
export function normalizePersistedWorkoutSet(set: WorkoutSet): WorkoutSet {
  if (!set || typeof set !== 'object') return set;
  const resolved = resolveSetStatus(set, true);
  const status: PersistedSetStatus = resolved === 'pending' ? 'not_attempted' : resolved;
  if (set.status === status && !('completed' in set)) return set;
  const { completed: _legacyCompleted, ...rest } = set;
  return { ...rest, status };
}

/**
 * Structured athlete safety signals.
 * NOTE: Not yet exposed to the athlete through the normal user interface check-in flow.
 */
export interface AthleteSafetyFlags {
  reportsPain?: boolean;
  requestHold?: boolean;
  notes?: string;
}

export interface WorkoutExercise {
  name: string;
  sets: WorkoutSet[];
  notes?: string;
  /**
   * Post-exercise effort rating ("How hard was that exercise today?").
   * Stored SEPARATELY from per-set RPEs — it must never overwrite them.
   * Used as a fallback for sets that have no logged RPE.
   */
  effortRating?: { rpe: number; label: 'easy' | 'good' | 'hard' };
  /** Reference to the PlannedExercise ID from which this exercise was started */
  planExerciseId?: string;
  /** Reference to the applied PolicyDecision ID, set only when reliably established via application audit */
  appliedDecisionId?: string;
  /** Explicit structured athlete pain/discomfort flag (never inferred from free-text notes) */
  reportsPain?: boolean;
  /**
   * When this entry is a pain-swap substitute, the name of the ORIGINAL
   * exercise that hurt. The pain flag on this entry belongs to THAT
   * exercise — without this, renaming the entry for the swap made
   * SAFETY-01 lock progression on the innocent substitute while the
   * painful movement got no safety record at all.
   */
  painfulExerciseName?: string;
  /** Explicit structured athlete target hold request (never inferred from free-text notes) */
  requestHold?: boolean;
  /** Explicit structured athlete safety flags for this exercise */
  athleteFlags?: AthleteSafetyFlags;
}

export interface WorkoutEntry {
  id: string;
  date: string; // YYYY-MM-DD
  name?: string;
  /** Source plan/template ID when started from or associated with a planned workout */
  planId?: string;
  /**
   * Entry kind. Absent = a gym workout (the long-standing default).
   * 'run' = a running session from the run program (see lib/run-program):
   * it carries no sets — its summary lives in the exercise notes — and it
   * counts toward streaks/habits as a training day (streak-freeze).
   */
  kind?: 'run';
  /** Run program session id ('c25k-w3d2') when kind is 'run'. */
  runSessionId?: string;
  /** §22: enrollment attempt this run belongs to (see
   *  RunProgramState.enrollmentId). Absent on pre-§22 entries —
   *  those attribute by date. */
  runEnrollmentId?: string;
  /** §22: structured interval counts for a run entry — the
   *  completion threshold (RUN_COMPLETION_THRESHOLD) judges these.
   *  Absent on pre-§22 entries, which count as completed. */
  runIntervalsCompleted?: number;
  runIntervalsTotal?: number;
  /** Optional user-entered distance for a run, in kilometres. */
  distanceKm?: number;
  /**
   * Total prescribed sets in the source plan at save time (before filtering to
   * executed sets). Lets adherence reporting show honest completion (e.g. 1/18)
   * instead of re-baselining to logged sets (1/1 = 100%).
   */
  plannedTotalSets?: number;
  durationMinutes?: number;
  durationSeconds?: number;
  notes?: string;
  exercises: WorkoutExercise[];
  /** Explicit structured athlete pain/discomfort flag for entire session */
  reportsPain?: boolean;
  /** Explicit structured athlete target hold request for entire session */
  requestHold?: boolean;
  /** Explicit structured athlete safety flags */
  athleteFlags?: AthleteSafetyFlags;
  /** Local last-edit stamp (ISO) for R1/DI-08 newest-wins sync — see BodyMetricEntry.updatedAt. */
  updatedAt?: string;
}

/**
 * The ONE workout draft (§15, Phase 3.3 — this type used to be
 * defined twice, here and in store.ts).
 *
 * Ownership: the store holds exactly ONE draft slot, keyed by
 * session — `sessionStartTime` is the session's identity (its
 * startedAt, epoch ms) and `savedAt` is its updatedAt (ISO,
 * rewritten on every save). Two autosave effects write the slot
 * (the live session screen and the logger modal); an autosave may
 * only write its own session or a session that began after the
 * slot was last saved — see shouldAutosaveDraft in store.ts.
 * Explicit user actions (Start from Home, Resume, Discard/Undo)
 * may replace the slot outright. Saving a draft with zero
 * exercises CLEARS the slot — an empty draft is not a state.
 */
export interface ActiveWorkoutDraft {
  id?: string;
  name?: string;
  planId?: string;
  date: string;
  exercises: WorkoutExercise[];
  startedFromPlan?: string | null;
  startedFromPlanId?: string | null;
  /** startedAt: epoch ms when the session began; also the slot's session identity. */
  sessionStartTime?: number;
  /** updatedAt: ISO time of the last save of this draft. */
  savedAt: string;
}

/** Ghee/oil amount the user says is in a dish, beyond what's visible.
 *  Levels in tsp: none=0, tsp=1, tbsp=3, tbsp2=6. */
export type OilLevelId = 'none' | 'tsp' | 'tbsp' | 'tbsp2';

/** Explicit per-food diet classification (food schema v2).
 *  One value per DB entry: 'vegan' ⊂ 'veg', 'egg' = eggetarian, 'non-veg'.
 *  Values live on the DB entries themselves (macros.ts / indian-foods.ts). */
export type DietTag = 'vegan' | 'veg' | 'egg' | 'non-veg';

/** Controlled allergen vocabulary (food schema v2). Entries list only
 *  allergens that are ingredients of the standard recipe. */
export type AllergenTag =
  | 'milk'
  | 'egg'
  | 'peanut'
  | 'tree-nut'
  | 'soy'
  | 'wheat/gluten'
  | 'fish'
  | 'shellfish'
  | 'sesame'
  | 'mustard';

/** Provenance of a DB entry's values (food schema v2). 'estimated' marks
 *  recipe-composition estimates — never presented as measured data. */
export type FoodSourceRef = 'IFCT 2017' | 'USDA FDC' | 'label' | 'estimated';

export interface FoodItem {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Sugar in grams, when the source provides it (barcode/OFF). Optional:
   *  most DB entries don't carry it — absence means "unknown", not zero. */
  sugarG?: number;
  /** Dietary fiber in grams (food schema v2). For FOOD_DB entries the
   *  canonical value lives on the entry itself (macros.ts); this field
   *  carries it on materialized items. Per the quantity's own basis. */
  fiberG?: number;
  /** Diet classification (food schema v2; canonical value on the DB entry). */
  dietTag?: DietTag;
  /** Allergens present as ingredients (food schema v2). */
  allergenTags?: AllergenTag[];
  /** Provenance of the entry's values (food schema v2). */
  sourceRef?: FoodSourceRef;
  quantity?: number;
  unit?: string;
  isUnmatched?: boolean;
  /** Set when the estimator matched via the weak word-overlap fallback
   *  (not an exact or substring match): the values come from a real
   *  entry, but a DIFFERENT food than the typed name (e.g. "Zqxwv
   *  fruit" → "dragon fruit" via the shared generic word "fruit").
   *  The dialog must label such rows as estimates. */
  isApproximateMatch?: boolean;
  /** The library entry the values actually came from, when
   *  isApproximateMatch is true. Food names are never translated, so
   *  this stays in the entry's own (English) form. */
  matchedEntry?: string;
  /** User-selected ghee/oil level for Indian dishes (see OilLevelId). */
  oilLevel?: OilLevelId;
  /** tsp of ghee/oil the database values already assume for this dish,
   *  per standard serving. The oil selector adjusts relative to this. */
  oilAssumedTsp?: number;
  /** Set when this item came from the user's own saved version. */
  customFoodId?: string;
}

/**
 * A user's own version of a food ("my dal, my way") — household recipe
 * learning. Macros are stored for the exact portion in defaultQuantity/unit,
 * the same snapshot model as FavoriteFood, so scaling stays proportional.
 */
export interface CustomFood {
  id: string;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  defaultQuantity?: number;
  unit: string;
  /** DB key this version was derived from, when saved from a known food. */
  baseFoodKey?: string;
  oilLevel?: OilLevelId;
  createdAt: string;
}

/** Per-date meal pattern override (fasting / festival). Absent = normal day. */
export type MealDayKind = 'no_grain_fast' | 'one_meal_fast' | 'festival_feast';

export interface MealEntry {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  foods: FoodItem[];
  /** Local last-edit stamp (ISO) for R1/DI-08 newest-wins sync — see BodyMetricEntry.updatedAt. */
  updatedAt?: string;
}

export interface MacroTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Total sugar when at least one item carries sugar data; otherwise
   *  undefined (unknown) — never fabricate a zero. */
  sugarG?: number;
}

export type EquipmentType = 'barbell' | 'dumbbell' | 'cable' | 'bodyweight' | 'machine' | 'other';

export interface LiftLevel {
  exercise: string;
  level: number;
  title: string;
  ratio: number;
  category: ExerciseRank;
  rank: ExerciseRank;
  equipment?: EquipmentType;
  isStandardUnavailable?: boolean;
  standardNote?: string;
}

export interface OverallLevel {
  level: number;
  title: OverallTitle;
  averageRatio: number;
  isMainLiftsOnly?: boolean;
  mainLiftsCount?: number;
  /** True when every lift in the pool is a proxy-standard estimate
   *  (SIM-P2-18): the headline number is then an estimate, and renderers
   *  must say so instead of showing a bare level. */
  isEstimate?: boolean;
}

export interface MacroGoals {
  calories: number;
  proteinG: number;
  carbsG?: number;
  fatG?: number;
  /** Estimated maintenance calories the target was derived from (optional, informational). */
  maintenanceCalories?: number;
  /** Target minus maintenance: negative = deficit, positive = surplus (optional, informational). */
  calorieDelta?: number;
}

export interface PlannedExercise {
  id?: string;
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeight?: number;
  targetUnit?: Unit;
  targetRpe?: number;
  notes?: string;
}

export interface PlannedWorkout {
  id: string;
  name: string;
  exercises: PlannedExercise[];
  createdAt: string;
  description?: string;
  goalTag?: string;
  /**
   * Intensity prescription mode. 'percent' = main compound lifts get
   * suggested loads from the user's estimated 1RM (see lib/percent-1rm).
   * Absent/'rpe' = the long-standing default; nothing changes.
   */
  intensityMode?: 'rpe' | 'percent';
  /**
   * PR-B: id of the coach block that created this plan, when materialized
   * from an approved block proposal. Purely a grouping label (drives the
   * "Coach block" badge); management itself lives in the store's
   * coachBlocks slice. Rides the `extras` jsonb column like the other
   * column-less fields, so it degrades gracefully until the column exists.
   */
  coachBlockId?: string;
  /** Local last-edit stamp (ISO) for R1/DI-08 newest-wins sync — see BodyMetricEntry.updatedAt. */
  updatedAt?: string;
}

export interface FavoriteFood {
  id: string;
  name: string;
  defaultQuantity?: number;
  unit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  barcode?: string;
  notes?: string;
}

export type DayType = 'training' | 'rest';

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface DayScheduleConfig {
  /**
   * §18 (Phase 3.3): the day's assignment — THE representation.
   * 'rest' = deliberate rest day; 'plan' = workoutPlanId names the
   * plan; absent = unassigned ('none'). Before 3.3 the rest fact
   * was smuggled through the plan-id field as the magic string
   * 'rest'; the persist migration converts stored schedules, and
   * dayPlanRef() (scheduled-days.ts) — the one read path — still
   * resolves the legacy shape for un-migrated/old-client payloads.
   */
  kind?: 'rest' | 'plan';
  /** Plan id (or, in legacy rows, plan name) — only when kind is 'plan'. Never 'rest'. */
  workoutPlanId?: string;
  customTitle?: string;            // e.g. "Chest & Triceps"
  bodyParts?: string[];            // e.g. ["Chest", "Arms"]
}

export type WeeklySchedule = Record<DayOfWeek, DayScheduleConfig>;

// ─── The one schedule read (§18, Phase 3.3) ─────────────────────────────────
//
// A day's assignment used to be encoded as a magic string: 'rest'
// inside the plan-id field, re-interpreted at a dozen sites. The
// config now carries `kind`; this resolver is the ONLY read path,
// and it deliberately still understands the legacy shape so an
// un-migrated stored schedule or an old client's sync payload
// resolves exactly the same way. (Lives beside the type it
// interprets: scheduled-days and workout-schedule import each
// other's helpers, so the shared leaf cannot sit in either.)

export type DayPlanRef =
  | { kind: 'none' }
  | { kind: 'rest' }
  | { kind: 'plan'; planId: string };

export function dayPlanRef(cfg: DayScheduleConfig | null | undefined): DayPlanRef {
  if (!cfg) return { kind: 'none' };
  if (cfg.kind === 'rest') return { kind: 'rest' };
  if (cfg.kind === 'plan') {
    return cfg.workoutPlanId && cfg.workoutPlanId !== 'rest'
      ? { kind: 'plan', planId: cfg.workoutPlanId }
      : { kind: 'none' };
  }
  // Legacy shape (pre-§18 rows): the plan-id field carried both facts.
  if (cfg.workoutPlanId === 'rest') return { kind: 'rest' };
  if (cfg.workoutPlanId) return { kind: 'plan', planId: cfg.workoutPlanId };
  return { kind: 'none' };
}

export interface HydrationConfig {
  baseMl?: number;
  dailyTargetMl: number;
  activityBonusMl: number;
  climateAdjustmentMl?: number;
  isCustomTarget?: boolean;
}

export interface WaterLogBatch {
  id: string;
  amountMl: number;
  timestamp: string; // ISO string
}

export interface CreatineLog {
  taken: boolean;
  amountG: number;
  timestamp?: string; // ISO string
}

export interface CreatineConfig {
  dailyTargetG: number;
  reminderTime?: string;
  enabled: boolean;
}

export interface CreatineSupply {
  containerG: number;
  currentAmountG: number;
  lastUpdated: string; // YYYY-MM-DD
}

export interface DailyTimelineEvent {
  id: string;
  time: string; // "HH:MM"
  type: 'workout' | 'creatine' | 'water' | 'meal' | 'weight';
  title: string;
  detail?: string;
  completed: boolean;
}

export interface AICoachInsight {
  date: string; // YYYY-MM-DD
  source: 'gemini' | 'offline_heuristic';
  volumeTrend: string;
  recoveryStatus: string;
  tacticalAdvice: string;
  fatigueWarning?: string;
  timestamp: string;
}

export interface AITrainingProfile {
  goal: AthleteGoal;
  experience: 'beginner' | 'intermediate' | 'advanced';
  daysPerWeek: number;
  preferredDurationMin: number;
  equipment: 'full_gym' | 'home_dumbbells' | 'bodyweight_only' | 'barbell_only';
  /** Daily activity outside training — drives the maintenance-calorie multiplier. */
  activityLevel?: 'sedentary' | 'light' | 'active' | 'very_active';
  preferredSplit: 'push_pull_legs' | 'upper_lower' | 'full_body' | 'bro_split';
  dislikedExercises: string[];
  injuriesOrLimitations: string[];
  coachingStyle: 'concise' | 'balanced' | 'detailed';
}

export interface AIPlannedExercise {
  exercise: string;
  sets: number;
  reps: string;
  targetWeightKg: number;
  restSeconds: number;
  reason: string;
}

export interface AIPlannedWorkout {
  id: string;
  date: string; // YYYY-MM-DD
  workoutName: string;
  estimatedDurationMin: number;
  focus: string;
  whyThisWorkout: string;
  exercises: AIPlannedExercise[];
  source: 'gemini' | 'offline_deterministic';
  createdAt: string;
}

export interface AISubstitutionResult {
  originalExercise: string;
  replacementExercise: string;
  reason: string;
  movementPattern: string;
  targetWeightKg?: number;
  targetReps?: string;
  targetSets?: number;
}

export interface AIWorkoutCommandResult {
  actionType: 'SHORTEN_TIME' | 'SWAP_EQUIPMENT' | 'DELOAD_INTENSITY' | 'WEIGHT_ADVICE' | 'CUSTOM';
  summary: string;
  coachAdvice: string;
  modifiedExercises?: AIPlannedExercise[];
}

export interface AIPostWorkoutTake {
  headline: string;
  volumeVsLastWeek: string;
  keyAchievements: string[];
  nextSessionTarget: string;
  source: 'gemini' | 'offline_heuristic';
}

export interface AIWeeklyReview {
  id: string;
  date: string; // YYYY-MM-DD
  weekSummary: string;
  workoutsCompleted: number;
  plannedDaysPerWeek: number;
  strengthHighlight: string;
  habitInsight: string;
  focusNextWeek: string;
  source: 'gemini' | 'offline_heuristic';
  createdAt: string;
}

// ── Photo AI Meal Scanner Types ──────────────────────────────────────────────

/** A user-uploaded progress photo, stored locally (downscaled JPEG data URL). */
export interface ProgressPhoto {
  id: string;
  /** Downscaled JPEG data URL (max ~800px) so it fits in localStorage. */
  dataUrl: string;
  /** YYYY-MM-DD */
  date: string;
  /** Optional label, e.g. "Front", "Side", "Back". */
  label?: string;
}

export interface ScannedFoodItem {
  name: string;
  quantity: string;
  estimatedGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: 'high' | 'medium' | 'low';
  preparation?: string;
  notes?: string;
}

export interface MealAnalysisResult {
  mealName: string;
  items: ScannedFoodItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  hiddenIngredients?: string[];
  confidence: 'high' | 'medium' | 'low';
  coachingNote?: string;
  timestamp?: string;
  imageUrl?: string;
}

// ─── Lifter Twin & Adaptive Training Ledger Types ───────────────────────────

export type TrainingDecisionReason =
  | 'exceeded_rpe'
  | 'missed_reps'
  | 'progressive_overload'
  | 'rpe_drift'
  | 'fatigue_hold'
  | 'time_constraint'
  | 'equipment_unavailable'
  | 'low_readiness'
  | 'user_override';

/**
 * §20: THE decision-status vocabulary — one union for every
 * decision family (per-exercise TrainingDecision below and the
 * policy TrainingDecisionRecord in training-decision-policy.ts).
 * Dismissal is always the literal 'dismissed'.
 *
 * 'applied' is deliberately NOT a stored status: for policy
 * decisions it is DERIVED by decisionEffectiveStatus (policy
 * module) from the record + the application audit list — flipping
 * the stored status on apply would break re-application
 * idempotency, whose validator requires 'accepted' before it can
 * answer alreadyApplied. For TrainingDecision, accepting IS the
 * application (the prescription updates in place).
 */
export type DecisionStatus = 'pending' | 'accepted' | 'overridden' | 'dismissed';

/** A decision's effective status, including the derived terminal
 *  'applied' for policy decisions that reached a plan. */
export type EffectiveDecisionStatus = DecisionStatus | 'applied';

export interface TrainingDecision {
  id: string;
  exerciseName: string;
  date: string; // YYYY-MM-DD
  programIntent: 'strength' | 'hypertrophy' | 'technique' | 'readiness_adaptation' | 'progressive_overload';
  previousPerformance: {
    weight: number;
    reps: number;
    rpe?: number;
    sets: number;
  };
  nextPrescription: {
    weight: number;
    reps: number;
    targetRpe: number;
    sets: number;
  };
  expectedRpe: number;
  actualExecution?: {
    weight?: number;
    reps: number;
    actualRpe: number;
    completedSets: number;
  };
  predictionError?: number; // actualRpe - expectedRpe (e.g. +0.5 RPE)
  reasonType: TrainingDecisionReason;
  headline: string;
  explanation: string;
  deltaKg: number;
  deltaPercent: number;
  confidence: 'high' | 'established' | 'early_signal' | 'calibrating' | 'medium';
  evidenceCount: number;
  status: DecisionStatus;
  userOverrideWeight?: number;
  timestamp: string;
}

export type LifterConfidenceTier = 'calibrating' | 'early_signal' | 'established' | 'high_confidence';

export interface LifterExerciseProfile {
  exerciseName: string;
  evidenceCount: number;
  confidenceTier: LifterConfidenceTier;
  calibrationStatus?: 'calibrating' | 'early_trend' | 'calibrated'; // legacy compatibility
  bestSupportedRepRange: { min: number; max: number };
  optimalRepRange?: { min: number; max: number }; // legacy compatibility
  targetRpeRange: { min: number; max: number };
  withinSessionEffortDrift: 'low' | 'moderate' | 'high';
  fatigueSensitivity?: 'low' | 'moderate' | 'high'; // legacy compatibility
  rpeDriftPerSet: number; // e.g. +0.3 RPE / set
  observedWeeklyFrequencyRange: { min: number; max: number }; // e.g. 1-2x/week (honest integer range)
  recommendedWeeklyFrequency?: number; // legacy compatibility
  bestProgressionStepKg: number; // e.g. 2.5
  observedRecoveryIntervalDays: { min: number; max: number }; // e.g. 3-5 days
  recoveryDaysNeeded?: number; // legacy compatibility
  e1RMTrend: 'rising' | 'stable' | 'fatigued' | 'plateau';
  averagePredictionError?: number; // e.g. ±0.4 RPE
  observations: string[]; // transparent empirical evidence statements
}

export interface LifterTwinProfile {
  totalAnalyzedExposures: number;
  exercises: Record<string, LifterExerciseProfile>;
  lastUpdated: string;
}

export interface RealWorldConstraint {
  type: 'time' | 'equipment' | 'readiness' | 'fatigue';
  availableMinutes?: number;
  targetExerciseName?: string;
  substituteExerciseName?: string;
  readinessOption?: 'reduce_volume' | 'cap_rpe' | 'maintain_load';
  notes?: string;
}

// ─── Policy Decision Application Audit & Operations (Task 3C-7) ──────────────
/**
 * Immutable audit record tracking the explicit application of an accepted Policy v0 recommendation
 * to a future workout prescription / training plan.
 */
export interface PolicyDecisionApplicationAudit {
  /** Deterministic or unique identifier: e.g. "audit_app_{decisionId}_{targetPlanId}_{timestamp}" */
  id: string;
  decisionId: string;
  policyVersion: '0.1.0';
  targetPlanId: string;
  targetPlanName: string;
  targetExerciseId?: string;
  targetExerciseName: string;
  targetExerciseIndex: number;
  previousPrescription: {
    weight?: number;
    reps?: number;
    sets?: number;
    unit?: Unit;
    targetRpe?: number;
  };
  appliedPrescription: {
    weight: number;
    reps: number;
    sets?: number;
    unit: Unit;
    targetRpe?: number;
  };
  appliedAt: string;
  actionSource: 'athlete_confirmed';
  status: 'applied';
}

export interface ApplyPolicyDecisionOptions {
  decisionId: string;
  targetPlanId: string;
  targetExerciseIndex?: number;
  targetExerciseId?: string;
  targetExerciseName?: string;
  actionSource?: 'athlete_confirmed';
}

export interface ApplyPolicyDecisionResult {
  success: boolean;
  alreadyApplied?: boolean;
  error?: string;
  message: string;
  auditRecord?: PolicyDecisionApplicationAudit;
  targetPlan?: PlannedWorkout;
}

export interface ValidateApplicationResult {
  valid: boolean;
  alreadyApplied?: boolean;
  error?: string;
  message: string;
  targetExerciseIndex?: number;
  targetExercise?: PlannedExercise;
}

// ─── Training Decision Policy v0 Re-exports ──────────────────────────────────
export type {
  DecisionActionCategory,
  DecisionConfidenceTier,
  ProgressionModelType,
  EvidenceSufficiencyTier,
  EvidenceSufficiencyAudit,
  RpeProgressionOverride,
  IncrementApprovalSource,
  IncrementConfiguration,
  LoadIncrementStatus,
  LoadIncrementResolution,
  CurrentPrescriptionTarget,
  TrainingDecisionRecord,
  EvaluateDecisionOptions,
  LedgerPersistenceCheck,
} from './training-decision-policy';
export {
  canPersistDecisionToLedger,
  decisionEffectiveStatus,
  validatePolicyDecisionApplication,
} from './training-decision-policy';

// ─── Notification & Reminder Preferences (Play Store compliant) ──────────────
export interface NotificationPreferences {
  enabled: boolean;
  waterReminders: {
    enabled: boolean;
    intervalHours: number; // 1, 2, or 3
  };
  mealReminders: {
    enabled: boolean;
    breakfastTime: string;
    lunchTime: string;
    dinnerTime: string;
  };
  workoutReminders: {
    enabled: boolean;
    preferredTime: string;
    daysOfWeek: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
    /** True once the user hand-picks reminder days in the Reminder
     *  Center. Until then, daysOfWeek auto-syncs from the weekly
     *  training schedule whenever it changes. */
    daysCustomized?: boolean;
  };
  weeklyReport: {
    enabled: boolean;
    reportDay:
      | 'monday'
      | 'tuesday'
      | 'wednesday'
      | 'thursday'
      | 'friday'
      | 'saturday'
      | 'sunday';
    reportTime: string;
  };
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  lockScreenPrivacy: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: false,
  waterReminders: {
    enabled: false,
    intervalHours: 2,
  },
  mealReminders: {
    enabled: false,
    breakfastTime: '08:00',
    lunchTime: '13:00',
    dinnerTime: '19:30',
  },
  workoutReminders: {
    enabled: false,
    preferredTime: '17:30',
    daysOfWeek: [1, 2, 4, 5],
  },
  weeklyReport: {
    enabled: false,
    reportDay: 'sunday',
    reportTime: '10:00',
  },
  quietHours: {
    enabled: true,
    start: '22:00',
    end: '07:00',
  },
  lockScreenPrivacy: true,
};


