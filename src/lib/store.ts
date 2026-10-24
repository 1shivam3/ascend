import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import {
  UserProfile,
  PersonalRecord,
  ProgressPhoto,
  WorkoutEntry,
  WorkoutExercise,
  MealEntry,
  Theme,
  NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  BodyMetricEntry,
  MacroGoals,
  PlannedWorkout,
  PlannedExercise,
  FavoriteFood,
  FoodItem,
  CustomFood,
  MealDayKind,
  DayType,
  HydrationConfig,
  WaterLogBatch,
  CreatineLog,
  CreatineConfig,
  CreatineSupply,
  DailyTimelineEvent,
  AICoachInsight,
  AITrainingProfile,
  AIPlannedWorkout,
  AIWeeklyReview,
  TrainingDecision,
  LifterTwinProfile,
  AthleteGoal,
  UserMode,
  DayOfWeek,
  DayScheduleConfig,
  WeeklySchedule,
  isSetCompleted,
  TrainingDecisionRecord,
  CurrentPrescriptionTarget,
  DEFAULT_GOALS,
  Unit,
  AthleteSafetyFlags,
  PolicyDecisionApplicationAudit,
  ApplyPolicyDecisionOptions,
  ApplyPolicyDecisionResult,
} from './types';
import { DEFAULT_AI_TRAINING_PROFILE } from './ai-context';
import { purgeLocalAppData, isRecognizedBackupData } from './storage';
import { getTabLeaderGuard } from './tab-leader';
import type { Language } from './i18n/en';
import { generateLifterTwinProfile, generateTrainingDecision } from './lifter-twin';
import { buildAthleteModel, type AthleteModel } from './athlete-model';
import {
  applyPlateauProposalToPlan,
  buildPlateauProposals,
  deriveAdoptionSchemes,
  generateBlockProposal,
  getInitialCoachBlocksState,
  managedPlanIdByExerciseKey,
  materializeProposal,
  resolveManagedPolicy,
  snapshotPlateauExpectations,
  type BlockProposal,
  type CoachBlocksState,
} from './block-engine';
import type { BlockIntake } from './block-intake';
import {
  buildWeeklyReview,
  lastCompletedWeekMonday,
  type WeeklyReview,
} from './weekly-review';
import { buildDefaultWeeklySchedule, getTodayDayOfWeek, getWorkoutBodyParts, DAYS_OF_WEEK } from './workout-schedule';
import { safeRandomId } from './formatters';
import {
  evaluateTrainingDecisionPolicyV0,
  canPersistDecisionToLedger,
  validatePolicyDecisionApplication,
} from './training-decision-policy';
import {
  aggregateMultiSessionEvidence,
  canonicalizeExerciseName,
} from './workout-outcome-evidence';
import { isSetPrescribed } from './workout-adherence';
import { isBodyweightExercise } from './strength-standards';
import {
  registerCustomExerciseMuscle,
  registerCustomExerciseMuscles,
  type MuscleGroup as LibraryMuscleGroup,
} from './exercise-library';
import {
  XpState,
  XpEvent,
  getInitialXState as getInitialXpState,
  awardXp,
  xpEventId,
  xpForWorkout,
  xpForMeal,
} from './xp-system';
import {
  StreakState,
  getInitialStreakState,
  getInitialXState as getInitialStreakXState,
  refreshFreezeWeek,
  calculateStreak,
  applyStreakResult,
  buildActiveDays,
} from './streak-freeze';
import {
  ChallengesXState,
  getInitialXState as getInitialChallengesXState,
} from './challenges';
import {
  type FriendChallengesState,
  type FriendChallengeDef,
  type FriendScoreEntry,
  getInitialFriendChallengesState,
  addFriendChallenge as addFriendChallengeState,
  removeFriendChallenge as removeFriendChallengeState,
  mergeFriendScore as mergeFriendScoreState,
  markFriendRewardGranted as markFriendRewardGrantedState,
  sanitizeFriendChallengesState,
} from './friend-challenges';
import {
  type RunProgramState,
  sanitizeRunProgramState,
} from './run-program';
import {
  CoachPersistedState,
  CalorieAdjustmentRecord,
  ReadinessHistoryEntry,
  getInitialCoachState,
  detectStalls,
  calculateReadiness,
  type ManualCheckin,
} from './coach-engine';
import {
  mergeHealthWeights,
  buildHealthSignals,
  type HealthDaySummary,
  type HealthFetchResult,
} from './health-connect';
import { computePerMuscleReadiness } from './per-muscle-readiness';

export * from './types';

export interface ActiveWorkoutDraft {
  id?: string;
  name?: string;
  planId?: string;
  date: string;
  exercises: WorkoutExercise[];
  startedFromPlan?: string | null;
  startedFromPlanId?: string | null;
  sessionStartTime?: number;
  savedAt: string;
}

export interface UiPreferences {
  /** XP level card, streak card, monthly challenge card on Home. */
  gamificationEnabled: boolean;
  /** Coach check-in cards, calorie suggestions, readiness score on Home. */
  coachEnabled: boolean;
  /** The one-week habit matrix card on Home. */
  showHabitMatrix: boolean;
  /**
   * Weekly workout target. null = automatic (weekly schedule / days per
   * week), 0 = no target (count only), 1..7 = explicit day count.
   */
  weeklyTargetDays: number | null;
  /**
   * UI language ('en' | 'hi'). Persisted with the rest of uiPreferences
   * (partialize + backup import/export); old saves without the field
   * resolve to English in the i18n layer.
   */
  language: Language;
  /**
   * Text size (SIM-P1-08). 'normal' = browser default; 'large'/'xlarge'
   * scale the root font-size, which scales all rem-based text. Old
   * saves lack the field and resolve to 'normal' in the applier.
   */
  textScale: 'normal' | 'large' | 'xlarge';
  /**
   * Health Connect sync consent (Android). DEFAULT OFF — nothing is
   * read until the user connects in Settings. Old saves lack the
   * field; consumers must check `=== true`.
   */
  healthConnectEnabled: boolean;
  /**
   * The Muscle Volume + Recovery section on Progress. Default ON;
   * old saves lack the field, so consumers check `!== false`.
   */
  showMuscleVolume: boolean;
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  gamificationEnabled: true,
  coachEnabled: true,
  showHabitMatrix: true,
  weeklyTargetDays: null,
  language: 'en',
  textScale: 'normal',
  healthConnectEnabled: false,
  showMuscleVolume: true,
};

export interface AppState {
  profile: UserProfile | null;
  prs: PersonalRecord[];
  workouts: WorkoutEntry[];
  meals: MealEntry[];
  bodyMetrics: BodyMetricEntry[];
  progressPhotos: ProgressPhoto[];
  theme: Theme;
  hasCustomTheme?: boolean;
  prTargets: Record<string, number>;
  macroGoals: MacroGoals | null;
  plannedWorkouts: PlannedWorkout[];

  /** User-declared muscle groups for custom exercises (name → muscle).
   *  Without this, customs were classified by name keywords alone and
   *  could never be corrected. */
  customExerciseMuscles: Record<string, LibraryMuscleGroup>;
  setCustomExerciseMuscle: (name: string, muscle: LibraryMuscleGroup) => void;
  /**
   * Tombstones for user-deleted plans. Sync's pull-merge is union-based
   * (remote rows missing locally get added), which used to resurrect
   * deleted plans. Tombstoned ids are never merged back, and push deletes
   * them server-side; a tombstone is pruned once the server confirms the
   * row is gone.
   */
  deletedPlanIds: string[];
  /** Remove tombstones (sync calls this once deletions are server-confirmed). */
  clearDeletedPlanIds: (ids: string[]) => void;
  /**
   * Tombstones for user-deleted PRs / workouts / meals / body metrics —
   * the deletedPlanIds mechanism generalized (QA4-001). Same contract:
   * tombstoned ids are never pull-merged back, push deletes them
   * server-side, and a tombstone is pruned once the server confirms the
   * row is gone. A full reset (clearAllData) clears them WITHOUT pushing,
   * so a reset never wipes the cloud copy.
   */
  deletedPrIds: string[];
  deletedWorkoutIds: string[];
  deletedMealIds: string[];
  deletedBodyMetricIds: string[];
  clearDeletedPrIds: (ids: string[]) => void;
  clearDeletedWorkoutIds: (ids: string[]) => void;
  clearDeletedMealIds: (ids: string[]) => void;
  clearDeletedBodyMetricIds: (ids: string[]) => void;
  favoriteFoods: FavoriteFood[];
  /** Household recipe learning — the user's own versions of foods.
   *  Local-persisted (partialize + backup import/export); no server
   *  table exists for these, custom_barcodes is barcode-only. */
  customFoods: CustomFood[];
  addCustomFood: (food: Omit<CustomFood, 'id' | 'createdAt'>) => CustomFood;
  updateCustomFood: (id: string, updated: Partial<CustomFood>) => void;
  deleteCustomFood: (id: string) => void;
  /** Per-date fasting/festival meal pattern. Absent date = normal day. */
  mealDayKinds: Record<string, MealDayKind>;
  setMealDayKind: (date: string, kind: MealDayKind | null) => void;
  hasCompletedOnboarding: boolean;
  _hasHydrated: boolean;

  // Athlete Multi-Goal Selection
  goals: AthleteGoal[];
  setGoals: (goals: AthleteGoal[]) => void;
  toggleGoal: (goal: AthleteGoal) => void;

  // Athlete Experience Mode (Beginner vs Advanced)
  userMode: UserMode;
  setUserMode: (mode: UserMode) => void;
  toggleUserMode: () => void;

  // Active workout persistence
  activeWorkoutDraft: ActiveWorkoutDraft | null;
  saveWorkoutDraft: (draft: ActiveWorkoutDraft) => void;
  clearWorkoutDraft: () => void;

  // Food Portion Memory
  userPortionPreferences: Record<string, number>;
  savePortionPreference: (foodName: string, grams: number) => void;

  // Notification Preferences
  notificationPreferences: NotificationPreferences;
  setNotificationPreferences: (prefs: NotificationPreferences) => void;

  // XP System (fun, never annoying)
  xp: XpState;
  awardXpEvents: (events: XpEvent[]) => { leveledUp: boolean; newLevel: number; awarded: number };

  // Streak System (forgiving, freeze auto-applies)
  streak: StreakState;
  refreshStreak: () => void;

  // UI Customization — "no user trapped in anything they don't want."
  // Defaults all-on; each surface can be hidden from Settings.
  uiPreferences: UiPreferences;
  setUiPreferences: (patch: Partial<UiPreferences>) => void;

  // Navigation persistence — a refresh or relaunch restores the tab and
  // sub-view the user was on instead of dumping them back on Home.
  // Tab ids mirror TabId/ProgressTabId in lib/navigation (kept as plain
  // strings here to avoid a store <-> navigation import cycle; the
  // navigation layer validates values before using them).
  lastActiveTab: string;
  lastProgressSubTab: string;
  lastTrainSubTab: 'plans' | 'history';
  setLastActiveTab: (tab: string, progressSubTab?: string) => void;
  setLastTrainSubTab: (subTab: 'plans' | 'history') => void;

  // Monthly Challenges (opt-in, dismissible)
  challenges: ChallengesXState;
  optInChallenge: (key: string) => void;
  optOutChallenge: (key: string) => void;
  dismissChallenge: (key: string) => void;
  grantChallengeReward: (key: string) => void;

  // Friend Challenges (local-first, code exchange — no server table)
  friendChallenges: FriendChallengesState;
  addFriendChallenge: (def: FriendChallengeDef) => void;
  removeFriendChallenge: (id: string) => void;
  applyFriendScore: (challengeId: string, entry: FriendScoreEntry) => void;
  grantFriendChallengeReward: (id: string) => void;

  // Run Program (Couch to 5K) — enrollment only; progress derives from
  // logged runs, so there is no separate progress counter to persist.
  runProgram: RunProgramState | null;
  enrollRunProgram: (dateStr: string) => void;
  leaveRunProgram: () => void;

  // Coach Engine (adaptive coaching state)
  coach: CoachPersistedState;
  /** Daily feel check-ins (sleep/soreness/energy, 1–5) by date. The
   *  readiness engine has supported these for months; until now no UI
   *  ever collected them, so the input was permanently dead. */
  dailyCheckins: Record<string, ManualCheckin>;
  setDailyCheckin: (dateStr: string, checkin: ManualCheckin) => void;

  // Health Connect (Android) — latest synced day summary + when it ran.
  // healthSummary feeds readiness (sleep, steps) and the Home steps
  // line; synced weights merge into bodyMetrics via applyHealthSync.
  healthSummary: HealthDaySummary | null;
  healthConnectLastSyncedAt: string | null;
  applyHealthSync: (result: HealthFetchResult) => void;
  dismissCheckIn: (id: string) => void;
  recordCalorieAdjustment: (record: CalorieAdjustmentRecord) => void;
  acknowledgeStall: (exercise: string) => void;
  recordReadiness: (date: string, score: number, band: ReadinessHistoryEntry['band']) => void;
  processCoachingAfterWorkout: () => void;

  // AI Training Profile & Plans
  trainingProfile: AITrainingProfile;
  todaysAIWorkoutPlan?: AIPlannedWorkout;
  latestWeeklyReview?: AIWeeklyReview;

  // Habit Operating System (Tier 1 & 2)
  waterLogs: Record<string, number>;
  waterBatches: Record<string, WaterLogBatch[]>;
  hydrationConfig: HydrationConfig;
  creatineLogs: Record<string, CreatineLog>;
  creatineConfig: CreatineConfig;
  creatineSupply: CreatineSupply;
  dayTypeOverrides: Record<string, DayType>;
  gymLogs: Record<string, boolean>;
  toggleGymToday: (date?: string) => boolean;
  aiInsightsCache: Record<string, AICoachInsight>;
  
  setHasHydrated: (state: boolean) => void;
  setProfile: (profile: UserProfile) => void;
  setTheme: (theme: Theme, isCustom?: boolean) => void;
  toggleTheme: () => void;
  resetThemeToSystem: () => void;
  
  addPR: (pr: PersonalRecord) => void;
  addMultiplePRs: (prs: PersonalRecord[]) => void;
  updatePR: (id: string, pr: Partial<PersonalRecord>) => void;
  deletePR: (id: string) => void;
  
  setPRTarget: (exercise: string, targetKg: number) => void;
  deletePRTarget: (exercise: string) => void;
  
  addWorkout: (workout: WorkoutEntry) => void;
  deleteWorkout: (id: string) => void;
  /** Persona-sim round 5 (SIM-P1-09) Undo: re-insert a deleted workout
   *  at its original index (no-op if present) and clear its tombstone,
   *  mirroring the QA4-014 meal/plan undo. PRs minted by the workout
   *  are NOT restored here — they survive deletion today (delete does
   *  not remove PRs), so undo only restores the session itself. */
  insertWorkoutAt: (workout: WorkoutEntry, index: number) => void;
  
  addMeal: (meal: MealEntry) => void;
  deleteMeal: (id: string) => void;
  /** QA4-014 Undo: re-insert a deleted meal at its original index (no-op if present). */
  insertMealAt: (meal: MealEntry, index: number) => void;
  /** QA4-014 Undo: restore a food removed by deleteFoodFromMeal — back
   *  into its meal at the original index, or, when the food was the
   *  meal's last item (so the meal itself was removed), restore the
   *  whole meal snapshot at its original index. */
  restoreFoodToMeal: (mealSnapshot: MealEntry, mealIndex: number, foodIndex: number) => void;
  updateMeal: (id: string, updated: Partial<MealEntry>) => void;
  deleteFoodFromMeal: (mealId: string, foodIndex: number) => void;
  copyMealsFromDate: (sourceDate: string, targetDate?: string) => number;

  setMacroGoals: (goals: MacroGoals | null) => void;

  addBodyMetric: (entry: BodyMetricEntry) => void;
  deleteBodyMetric: (id: string) => void;
  /** Returns true when the photo was actually persisted; false means
   *  storage quota — the photo survives only for this session. */
  addProgressPhoto: (photo: ProgressPhoto) => boolean;
  removeProgressPhoto: (id: string) => void;
  updateBodyMetrics: (
    weightKg: number,
    heightCm?: number,
    bodyFatPct?: number,
    chestIn?: number,
    waistIn?: number,
    hipsIn?: number
  ) => void;

  addPlannedWorkout: (plan: PlannedWorkout) => void;
  updatePlannedWorkout: (id: string, plan: PlannedWorkout) => void;
  deletePlannedWorkout: (id: string) => void;
  /** QA4-014 Undo: restore a plan deleted by deletePlannedWorkout at
   *  its original index, with the pre-delete weekly schedule and
   *  tombstone list (the delete rewires both, so undo must too). */
  restorePlannedWorkout: (plan: PlannedWorkout, index: number, prevSchedule: WeeklySchedule, prevDeletedPlanIds: string[]) => void;
  setPlannedWorkouts: (plans: PlannedWorkout[]) => void;


  // Weekly Workout Schedule & Body Parts
  weeklySchedule: WeeklySchedule;
  setWeeklySchedule: (schedule: WeeklySchedule) => void;
  setDaySchedule: (day: DayOfWeek, config: DayScheduleConfig) => void;

  addFavoriteFood: (food: Omit<FavoriteFood, 'id'>) => void;
  updateFavoriteFood: (id: string, updated: Partial<FavoriteFood>) => void;
  deleteFavoriteFood: (id: string) => void;
  clearAllFavoriteFoods: () => void;
  toggleFavoriteFood: (food: FoodItem) => boolean;

  // Habit Actions
  logWater: (amountMl: number, date?: string) => void;
  resetWater: (date?: string) => void;
  setHydrationConfig: (config: Partial<HydrationConfig>) => void;
  toggleCreatine: (date?: string, amountG?: number) => void;
  setCreatineConfig: (config: Partial<CreatineConfig>) => void;
  updateCreatineSupply: (supply: Partial<CreatineSupply>) => void;
  refillCreatineSupply: (containerG?: number) => void;
  setDayType: (date: string, type: DayType) => void;
  logQuickProtein: (proteinG: number, date?: string) => void;

  // AI Coach Actions
  cacheAIInsight: (date: string, insight: AICoachInsight) => void;
  setTrainingProfile: (profile: Partial<AITrainingProfile>) => void;
  setTodaysAIWorkoutPlan: (plan: AIPlannedWorkout | undefined) => void;
  saveWeeklyReview: (review: AIWeeklyReview) => void;

  // Lifter Twin & Decisions Ledger
  trainingDecisions: Record<string, TrainingDecision>;
  decisionsLedgerHistory: TrainingDecision[];
  lifterProfile: LifterTwinProfile | null;
  athleteModel: AthleteModel | null;
  acceptTrainingDecision: (exerciseName: string, decision?: TrainingDecision) => void;
  overrideTrainingDecision: (exerciseName: string, customWeight?: number, decision?: TrainingDecision) => void;
  recordTrainingDecision: (decision: TrainingDecision) => void;
  refreshLifterProfile: () => void;
  refreshAthleteModel: () => void;

  // Coach blocks (PR-B): proposals, the active block, adopted plans,
  // plateau proposals. User-decision state (persisted + backed up),
  // unlike the derived athleteModel.
  coachBlocks: CoachBlocksState;
  /** Generate a block proposal from an intake. Returns it (also stored as pending). */
  proposeCoachBlock: (intake: BlockIntake) => BlockProposal;
  /** Discard the pending proposal without touching any plan (D3). */
  dismissBlockProposal: () => void;
  /** Approve the pending proposal (or an edited copy of it from the
   *  review step): materialize plans + schedule + block state atomically. */
  approveBlockProposal: (editedProposal?: BlockProposal) => void;
  /** Coach adopts an existing user plan (schemes derived; plan untouched). */
  adoptPlanForCoaching: (planId: string) => void;
  unadoptPlanForCoaching: (planId: string) => void;
  /** Build pending plateau proposals for managed lifts from stall flags. */
  refreshPlateauProposals: () => void;
  applyPlateauProposal: (proposalId: string) => void;
  dismissPlateauProposal: (proposalId: string) => void;

  // Weekly reviews (PR-C): one per completed Mon–Sun week, generated
  // lazily and kept (≤12). Seen/applied state makes them user data.
  weeklyReviews: WeeklyReview[];
  /** Build the review for the most recent completed week, if missing. */
  refreshWeeklyReview: () => void;
  markWeeklyReviewSeen: (weekMonday: string) => void;
  /** Apply a review's schedule-move revision (user-confirmed; D3). */
  applyScheduleRevision: (weekMonday: string) => void;
  /** Close out the active block (debrief acknowledged / next block starts). */
  completeActiveBlock: () => void;

  // Policy v0 Decisions Ledger
  policyDecisionRecords: Record<string, TrainingDecisionRecord>;
  policyDecisionsLedgerHistory: TrainingDecisionRecord[];
  policyDecisionApplications: PolicyDecisionApplicationAudit[];
  acceptPolicyDecision: (id: string) => void;
  overridePolicyDecision: (
    id: string,
    override?: { customWeight?: number; customReps?: number; reason?: string }
  ) => void;
  dismissPolicyDecision: (id: string) => void;
  clearPolicyDecisions: () => void;
  applyPolicyDecisionToFuturePrescription: (
    options: ApplyPolicyDecisionOptions
  ) => ApplyPolicyDecisionResult;

  clearAllData: () => void;
  logout: (options?: { clearLocalData?: boolean }) => void;
  
  importAllData: (data: any) => boolean;
}

function getLocalTodayStr(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DEFAULT_HYDRATION_CONFIG: HydrationConfig = {
  dailyTargetMl: 2700,
  activityBonusMl: 500,
  climateAdjustmentMl: 0,
  isCustomTarget: false,
};

const DEFAULT_CREATINE_CONFIG: CreatineConfig = {
  dailyTargetG: 5,
  reminderTime: '08:00',
  enabled: true,
};

const DEFAULT_CREATINE_SUPPLY: CreatineSupply = {
  containerG: 500,
  currentAmountG: 450,
  lastUpdated: new Date().toISOString().split('T')[0],
};


const DEFAULT_FAVORITE_FOODS: FavoriteFood[] = [
  { id: 'fav_roti', name: 'Roti', defaultQuantity: 2, unit: 'piece', calories: 240, proteinG: 6.4, carbsG: 44, fatG: 3 },
  { id: 'fav_dal', name: 'Dal', defaultQuantity: 1, unit: 'bowl', calories: 230, proteinG: 14, carbsG: 36, fatG: 1.6 },
  { id: 'fav_paneer', name: 'Paneer', defaultQuantity: 100, unit: 'g', calories: 265, proteinG: 18.3, carbsG: 4.5, fatG: 20.8 },
  { id: 'fav_curd', name: 'Curd / Dahi', defaultQuantity: 1, unit: 'bowl', calories: 92, proteinG: 5.3, carbsG: 7, fatG: 5 },
  { id: 'fav_soya', name: 'Soya Chunks', defaultQuantity: 50, unit: 'g', calories: 172, proteinG: 26, carbsG: 16.5, fatG: 0.3 },
  { id: 'fav_chana', name: 'Chana (Boiled)', defaultQuantity: 100, unit: 'g', calories: 164, proteinG: 8.9, carbsG: 27.4, fatG: 2.6 },
  { id: 'fav_sattu', name: 'Sattu', defaultQuantity: 50, unit: 'g', calories: 206, proteinG: 13, carbsG: 32, fatG: 2.5 },
  { id: 'fav_rice', name: 'White Rice', defaultQuantity: 150, unit: 'g', calories: 195, proteinG: 4.1, carbsG: 42, fatG: 0.5 },
  { id: 'fav_whey', name: 'Whey Protein', defaultQuantity: 1, unit: 'scoop', calories: 120, proteinG: 24, carbsG: 2.2, fatG: 1 },
  { id: 'fav_eggs', name: 'Eggs', defaultQuantity: 2, unit: 'piece', calories: 155, proteinG: 13, carbsG: 1.1, fatG: 11 },
];

/**
 * Progress photos (base64 dataURLs, up to 24 × ~150KB) live OUTSIDE the
 * zustand persist blob in their own localStorage key. The main `ascend_store`
 * blob is parsed synchronously before first paint — keeping megabytes of
 * photo data out of it is what keeps app startup fast. Photos load lazily
 * after rehydration; components keep reading `useStore(s => s.progressPhotos)`
 * unchanged. The key is under the `ascend_` prefix so "Delete WebApp Data &
 * Reset" purges it like everything else.
 */
export const PROGRESS_PHOTOS_KEY = 'ascend_progress_photos_v1';
const MAX_PROGRESS_PHOTOS = 24;

/**
 * The profile avatar is a device-local asset (the cloud profiles table has
 * no avatar column). It used to live ONLY inside the big persisted store
 * blob: one sync profile-rebuild (pre-PR#8) or a single failed/quota-busted
 * blob write destroyed it permanently. Mirror it under its own key — the
 * same trick as progress photos — so the picture survives blob issues and
 * any future profile rebuild that forgets to carry it.
 */
export const AVATAR_MIRROR_KEY = 'ascend_avatar_v1';

export function persistAvatarMirror(avatar: string | undefined): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (avatar) localStorage.setItem(AVATAR_MIRROR_KEY, avatar);
    else localStorage.removeItem(AVATAR_MIRROR_KEY);
  } catch {
    // Quota etc. — the store blob still carries the avatar as primary copy.
  }
}

export function loadAvatarMirror(): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    return localStorage.getItem(AVATAR_MIRROR_KEY) || undefined;
  } catch {
    return undefined;
  }
}

/** Resolve the effective avatar: an explicit profile value wins; the
 * mirror restores it when a profile rebuild dropped it. */
export function resolveAvatar(
  profileAvatar: string | undefined,
  mirror: string | undefined = loadAvatarMirror(),
): string | undefined {
  return profileAvatar || mirror;
}

/**
 * Persists progress photos to their dedicated storage key. Returns false
 * when the write failed (quota) — callers must NOT tell the user the
 * photo was "saved" in that case; it lives only for this session.
 */
function persistProgressPhotos(photos: ProgressPhoto[]): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(PROGRESS_PHOTOS_KEY, JSON.stringify(photos.slice(0, MAX_PROGRESS_PHOTOS)));
    return true;
  } catch {
    return false;
  }
}

function loadProgressPhotosFromDisk(): ProgressPhoto[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PROGRESS_PHOTOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_PROGRESS_PHOTOS) : [];
  } catch {
    return [];
  }
}

/**
 * Fields written to the synchronous zustand persist blob.
 * Progress photos are deliberately EXCLUDED (see PROGRESS_PHOTOS_KEY):
 * their base64 dataURLs would make every startup JSON.parse megabytes.
 */
const DAY_OF_WEEK_TO_JS: Record<DayOfWeek, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 0,
};

/**
 * Workout-reminder days follow the training schedule until the user
 * hand-picks them in the Reminder Center (daysCustomized). Before this,
 * reminder days were a frozen install-time default ([Mon, Tue, Thu,
 * Fri]) that silently disagreed with the user's actual schedule — a
 * Mon/Wed/Fri trainer got pinged on rest days and never on Wed.
 */
export function syncWorkoutReminderDays(
  schedule: WeeklySchedule,
  prefs: NotificationPreferences
): NotificationPreferences {
  if (!prefs || !prefs.workoutReminders || prefs.workoutReminders.daysCustomized) {
    return prefs;
  }
  const days = DAYS_OF_WEEK.filter((d) => {
    const id = schedule?.[d]?.workoutPlanId;
    return !!id && id !== 'rest';
  })
    .map((d) => DAY_OF_WEEK_TO_JS[d])
    .sort((a, b) => a - b);
  if (days.length === 0) return prefs;
  const current = [...(prefs.workoutReminders.daysOfWeek || [])].sort((a, b) => a - b);
  if (JSON.stringify(days) === JSON.stringify(current)) return prefs;
  const next: NotificationPreferences = {
    ...prefs,
    workoutReminders: { ...prefs.workoutReminders, daysOfWeek: days },
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ascend_notification_prefs', JSON.stringify(next));
    }
  } catch {}
  // Best-effort server sync (the push dispatcher reads server prefs) —
  // same pattern as ReminderCenterModal.persist.
  if (typeof window !== 'undefined' && next.enabled) {
    void (async () => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        try {
          const { getSupabase } = await import('./supabase/client');
          const supabase = getSupabase();
          const {
            data: { session },
          } = await supabase!.auth.getSession();
          if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
        } catch {}
        await fetch('/api/notifications/preferences', {
          method: 'POST',
          headers,
          body: JSON.stringify(next),
        });
      } catch {}
    })();
  }
  return next;
}

/**
 * QA4-012 — persist migration (persist `version: 1`).
 *
 * zustand-persist's default rehydration merge is SHALLOW at the top
 * level: a persisted nested slice REPLACES the in-code default slice
 * wholesale. So a legacy blob whose `uiPreferences` predates a newer
 * field (e.g. `showMuscleVolume`, added after the blob was written)
 * rehydrates with that field `undefined` — and surfaces that treat
 * missing as OFF silently lost coach / gamification / habit-matrix
 * after app updates, even though the product defaults are ON.
 *
 * This migrate deep-merges the nested slices that carry default-ON
 * boolean semantics over the CURRENT defaults, so missing fields fall
 * back to the product default while every value the user actually
 * chose is preserved:
 * - uiPreferences (gamificationEnabled / coachEnabled / showHabitMatrix
 *   / showMuscleVolume default ON)
 * - notificationPreferences (nested groups; quietHours.enabled and
 *   lockScreenPrivacy default ON) — merged one group level deep
 * - streak / xp (filled from their initial states when fields are
 *   missing, so a legacy blob can't rehydrate a half-shaped slice)
 *
 * Flat slices and collections are user data with no defaults to merge
 * and pass through untouched.
 */
export const PERSIST_VERSION = 1;

export function migratePersistedState(
  persisted: unknown,
  _version: number,
): Record<string, unknown> {
  const state = (persisted ?? {}) as Record<string, any>;
  const next: Record<string, any> = { ...state };

  if (state.uiPreferences && typeof state.uiPreferences === 'object') {
    next.uiPreferences = { ...DEFAULT_UI_PREFERENCES, ...state.uiPreferences };
  }

  if (state.notificationPreferences && typeof state.notificationPreferences === 'object') {
    const defaults = DEFAULT_NOTIFICATION_PREFERENCES as unknown as Record<string, any>;
    const saved = state.notificationPreferences as Record<string, any>;
    const merged: Record<string, any> = { ...defaults, ...saved };
    for (const key of Object.keys(defaults)) {
      const d = defaults[key];
      const s = saved[key];
      if (d && typeof d === 'object' && !Array.isArray(d) && s && typeof s === 'object' && !Array.isArray(s)) {
        merged[key] = { ...d, ...s };
      }
    }
    next.notificationPreferences = merged;
  }

  if (state.streak && typeof state.streak === 'object') {
    next.streak = { ...getInitialStreakState(), ...state.streak };
  }

  if (state.xp && typeof state.xp === 'object') {
    next.xp = { ...getInitialXpState(), ...state.xp };
  }

  return next;
}

export function partializeAppState(state: AppState): Record<string, unknown> {
  return {
  profile: state.profile,
  prs: state.prs,
  workouts: state.workouts,
  meals: state.meals,
  bodyMetrics: state.bodyMetrics,
  theme: state.theme,
  hasCustomTheme: state.hasCustomTheme,
  prTargets: state.prTargets,
  macroGoals: state.macroGoals,
  plannedWorkouts: state.plannedWorkouts,
  customExerciseMuscles: state.customExerciseMuscles,
  deletedPlanIds: state.deletedPlanIds,
  deletedPrIds: state.deletedPrIds,
  deletedWorkoutIds: state.deletedWorkoutIds,
  deletedMealIds: state.deletedMealIds,
  deletedBodyMetricIds: state.deletedBodyMetricIds,
  userPortionPreferences: state.userPortionPreferences,
  favoriteFoods: state.favoriteFoods,
  customFoods: state.customFoods,
  mealDayKinds: state.mealDayKinds,
  hasCompletedOnboarding: state.hasCompletedOnboarding,
  waterLogs: state.waterLogs,
  waterBatches: state.waterBatches,
  hydrationConfig: state.hydrationConfig,
  creatineLogs: state.creatineLogs,
  creatineConfig: state.creatineConfig,
  creatineSupply: state.creatineSupply,
  dayTypeOverrides: state.dayTypeOverrides,
  gymLogs: state.gymLogs,
  aiInsightsCache: state.aiInsightsCache,
  trainingProfile: state.trainingProfile,
  todaysAIWorkoutPlan: state.todaysAIWorkoutPlan,
  latestWeeklyReview: state.latestWeeklyReview,
  trainingDecisions: state.trainingDecisions,
  decisionsLedgerHistory: state.decisionsLedgerHistory,
  lifterProfile: state.lifterProfile,
  athleteModel: state.athleteModel,
  coachBlocks: state.coachBlocks,
  weeklyReviews: state.weeklyReviews,
  notificationPreferences: state.notificationPreferences,
  uiPreferences: state.uiPreferences,
  xp: state.xp,
  streak: state.streak,
  challenges: state.challenges,
  friendChallenges: state.friendChallenges,
  runProgram: state.runProgram,
  coach: state.coach,
  dailyCheckins: state.dailyCheckins,
  healthSummary: state.healthSummary,
  healthConnectLastSyncedAt: state.healthConnectLastSyncedAt,
  policyDecisionRecords: state.policyDecisionRecords,
  policyDecisionsLedgerHistory: state.policyDecisionsLedgerHistory,
  policyDecisionApplications: state.policyDecisionApplications,
  goals: state.goals,
  userMode: state.userMode,
  weeklySchedule: state.weeklySchedule,
  activeWorkoutDraft: state.activeWorkoutDraft,
  lastActiveTab: state.lastActiveTab,
  lastProgressSubTab: state.lastProgressSubTab,
  lastTrainSubTab: state.lastTrainSubTab,
  };
}

/**
 * QA4A-004: the main persist blob's writes used to fail SILENTLY. The
 * blob grows ~1.2–1.5 MB/yr for a heavy user against a shared ~5–10 MB
 * origin quota; once setItem starts throwing QuotaExceededError, every
 * change keeps working in memory but nothing survives a reload — and
 * the user was never told. This adapter mirrors the emergency-snapshot
 * pattern (see getSnapshotWriteFailed below): a failed write flips a
 * health flag instead of escaping or vanishing, a later successful
 * write clears it, and the Data Vault surfaces the flag with the remedy
 * (export a backup / free up space). No data is ever pruned here —
 * in-memory state stays fully usable for the session.
 */
let mainStoreWriteFailed = false;
export function getMainStoreWriteFailed(): boolean {
  return mainStoreWriteFailed;
}

export const mainStoreStorage: StateStorage = {
  getItem: (name) => {
    // SSR/prerender: no storage exists — that is not a failure.
    if (typeof localStorage === 'undefined') return null;
    try {
      return localStorage.getItem(name);
    } catch {
      // Storage blocked/unavailable — behave as "nothing stored" so
      // rehydration falls back to defaults instead of crashing boot.
      return null;
    }
  },
  setItem: (name, value) => {
    // SSR/prerender: nothing to write to, and NOT a quota failure —
    // the health flag must only flip on a real failed write.
    if (typeof localStorage === 'undefined') return;
    // QA4-010: cross-tab guard — a follower tab (ASCEND open in another
    // tab) must not overwrite the leader's blob. Suppression here is
    // deliberate, not a write failure, so the health flag stays untouched.
    try {
      if (getTabLeaderGuard()?.shouldSuppressWrites()) return;
    } catch {
      // The guard must never break persistence.
    }
    try {
      localStorage.setItem(name, value);
      mainStoreWriteFailed = false;
    } catch (err) {
      mainStoreWriteFailed = true;
      if (typeof console !== 'undefined') {
        console.warn(
          '[ascend] Main store persist write failed (storage quota?). Changes will not survive a restart until space frees up.',
          err
        );
      }
      // Deliberately swallowed: the write failure must never break the
      // state update that triggered it. It is surfaced via
      // getMainStoreWriteFailed()/getStorageWriteFailed().
    }
  },
  removeItem: (name) => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(name);
    } catch {
      // Nothing to surface: a failed remove leaves stale data behind,
      // it does not lose new data.
    }
  },
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      profile: null,
      prs: [],
      workouts: [],
      meals: [],
      bodyMetrics: [],
      // Progress photos stay in memory only — they are persisted separately
      // (see PROGRESS_PHOTOS_KEY) so startup never parses base64 dataURLs.
      // Initialized from disk synchronously on the client; the rehydration
      // callback below must NOT clear this (partialize excludes photos, so
      // the persisted state never overwrites them).
      progressPhotos: typeof localStorage !== 'undefined' ? loadProgressPhotosFromDisk() : [],
      theme: 'dark',
      hasCustomTheme: false,
      prTargets: {},
      macroGoals: null,
      plannedWorkouts: [],
      customExerciseMuscles: {},
      setCustomExerciseMuscle: (name, muscle) => {
        registerCustomExerciseMuscle(name, muscle);
        set((state) => ({
          customExerciseMuscles: {
            ...state.customExerciseMuscles,
            [name.trim().toLowerCase()]: muscle,
          },
        }));
      },
      deletedPlanIds: [],
      deletedPrIds: [],
      deletedWorkoutIds: [],
      deletedMealIds: [],
      deletedBodyMetricIds: [],
      clearDeletedPrIds: (ids) => set((state) => ({
        deletedPrIds: (state.deletedPrIds || []).filter((d) => !ids.includes(d)),
      })),
      clearDeletedWorkoutIds: (ids) => set((state) => ({
        deletedWorkoutIds: (state.deletedWorkoutIds || []).filter((d) => !ids.includes(d)),
      })),
      clearDeletedMealIds: (ids) => set((state) => ({
        deletedMealIds: (state.deletedMealIds || []).filter((d) => !ids.includes(d)),
      })),
      clearDeletedBodyMetricIds: (ids) => set((state) => ({
        deletedBodyMetricIds: (state.deletedBodyMetricIds || []).filter((d) => !ids.includes(d)),
      })),
      favoriteFoods: DEFAULT_FAVORITE_FOODS,
      customFoods: [],
      mealDayKinds: {},
      hasCompletedOnboarding: false,
      _hasHydrated: false,

      // Athlete Multi-Goal Selection
      goals: [],
      setGoals: (goals) => set((state) => {
        const nextGoals = goals && goals.length > 0 ? [...goals] : [...DEFAULT_GOALS];
        return {
          goals: nextGoals,
          profile: state.profile
            ? { ...state.profile, goals: nextGoals, updatedAt: new Date().toISOString() }
            : null,
        };
      }),
      toggleGoal: (goal) => set((state) => {
        const current: AthleteGoal[] = state.goals && state.goals.length > 0 ? state.goals : [...DEFAULT_GOALS];
        const exists = current.includes(goal);
        let next: AthleteGoal[];
        if (exists) {
          next = current.length > 1 ? current.filter((g) => g !== goal) : current;
        } else {
          next = [...current, goal];
        }
        return {
          goals: next,
          profile: state.profile
            ? { ...state.profile, goals: next, updatedAt: new Date().toISOString() }
            : null,
        };
      }),

      // Athlete Experience Mode (Beginner vs Advanced)
      userMode: 'beginner',
      setUserMode: (userMode) => set({ userMode }),
      toggleUserMode: () => set((state) => ({ userMode: state.userMode === 'beginner' ? 'advanced' : 'beginner' })),

      // Weekly Workout Schedule & Body Parts
      weeklySchedule: {
        monday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
        tuesday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
        wednesday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
        thursday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
        friday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
        saturday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
        sunday: { workoutPlanId: 'rest', customTitle: 'Rest Day', bodyParts: [] },
      },
      setWeeklySchedule: (weeklySchedule) => set((state) => ({
        weeklySchedule,
        notificationPreferences: syncWorkoutReminderDays(weeklySchedule, state.notificationPreferences),
      })),
      setDaySchedule: (day, config) => set((state) => {
        const weeklySchedule = {
          ...state.weeklySchedule,
          [day]: config,
        };
        return {
          weeklySchedule,
          notificationPreferences: syncWorkoutReminderDays(weeklySchedule, state.notificationPreferences),
        };
      }),

      // Active workout persistence
      activeWorkoutDraft: null,

      // Portion Preferences
      userPortionPreferences: {},

      // Notification Preferences — loaded from localStorage if present
      notificationPreferences: (() => {
        try {
          if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('ascend_notification_prefs');
            if (saved) return JSON.parse(saved);
          }
        } catch {}
        return DEFAULT_NOTIFICATION_PREFERENCES;
      })(),
      setNotificationPreferences: (prefs) => set(() => ({
        notificationPreferences: prefs,
      })),

      // XP System
      xp: getInitialXpState(),
      awardXpEvents: (events) => {
        const state = get();
        // Gamification OFF means OFF: no silent XP accrual in the
        // background while every XP surface is hidden.
        if (state.uiPreferences && state.uiPreferences.gamificationEnabled === false) {
          return { leveledUp: false, newLevel: 1, awarded: 0 };
        }
        const result = awardXp(
          events,
          state.xp.totalXp,
          state.xp.awardedIds,
          state.xp.compactedAwardedHashes ?? [],
        );
        set(() => ({
          xp: {
            totalXp: result.newTotal,
            awardedIds: result.awardedIds,
            compactedAwardedHashes: result.compactedAwardedHashes,
          },
        }));
        return { leveledUp: result.leveledUp, newLevel: result.newLevel, awarded: result.awarded };
      },

      // Streak System
      streak: getInitialStreakXState(),
      refreshStreak: () => {
        const state = get();
        const refreshed = refreshFreezeWeek(state.streak);
        const activeDays = buildActiveDays(state.workouts, state.meals);
        const result = calculateStreak({ dailyActivity: activeDays, freezesAvailable: refreshed.freezesAvailable });
        // QA4-011 guard: calculateStreak is a pure function of history,
        // so after a Monday refill it would happily consume the FRESH
        // freeze for the SAME missed day a previous freeze already
        // bridged. A freeze covers a given calendar day at most once —
        // if this miss is already the persisted freezeAppliedTo, the
        // bridge stands and no new freeze is consumed.
        const effective =
          result.freezeConsumed &&
          result.freezeAppliedTo &&
          refreshed.freezeAppliedTo === result.freezeAppliedTo
            ? { ...result, freezeConsumed: false, freezesAvailable: refreshed.freezesAvailable }
            : result;
        const next = applyStreakResult(refreshed, effective);
        // Skip the write entirely when nothing changed — refreshStreak
        // runs on app start, day rollover and every workout log, and a
        // no-op set would still churn persist + subscribers.
        const prev = state.streak;
        if (
          prev.freezesAvailable === next.freezesAvailable &&
          prev.freezesUsedThisWeek === next.freezesUsedThisWeek &&
          prev.weekStart === next.weekStart &&
          prev.longestStreak === next.longestStreak &&
          prev.freezeAppliedTo === next.freezeAppliedTo
        ) {
          return;
        }
        set(() => ({ streak: next }));
      },

      // UI Customization
      uiPreferences: { ...DEFAULT_UI_PREFERENCES },
      setUiPreferences: (patch) => set((state) => ({
        uiPreferences: { ...state.uiPreferences, ...patch },
      })),

      // Navigation persistence (refresh/relaunch restores the last tab)
      lastActiveTab: 'home',
      lastProgressSubTab: 'overview',
      lastTrainSubTab: 'plans',
      setLastActiveTab: (tab, progressSubTab) => set((state) => ({
        lastActiveTab: tab,
        lastProgressSubTab: progressSubTab !== undefined ? progressSubTab : state.lastProgressSubTab,
      })),
      setLastTrainSubTab: (lastTrainSubTab) => set({ lastTrainSubTab }),

      // Challenges
      challenges: getInitialChallengesXState(),
      optInChallenge: (key) => set((state) => ({
        challenges: {
          instances: {
            ...state.challenges.instances,
            [key]: { ...(state.challenges.instances[key] || { optedIn: false, dismissed: false, rewardGranted: false }), optedIn: true },
          },
        },
      })),
      optOutChallenge: (key) => set((state) => ({
        challenges: {
          instances: {
            ...state.challenges.instances,
            [key]: { ...(state.challenges.instances[key] || { optedIn: false, dismissed: false, rewardGranted: false }), optedIn: false },
          },
        },
      })),
      dismissChallenge: (key) => set((state) => ({
        challenges: {
          instances: {
            ...state.challenges.instances,
            [key]: { ...(state.challenges.instances[key] || { optedIn: false, dismissed: false, rewardGranted: false }), dismissed: true },
          },
        },
      })),
      grantChallengeReward: (key) => set((state) => ({
        challenges: {
          instances: {
            ...state.challenges.instances,
            [key]: { ...(state.challenges.instances[key] || { optedIn: false, dismissed: false, rewardGranted: false }), rewardGranted: true },
          },
        },
      })),

      // Friend Challenges — local-first code exchange (see lib/friend-challenges)
      friendChallenges: getInitialFriendChallengesState(),
      addFriendChallenge: (def) => set((state) => ({
        friendChallenges: addFriendChallengeState(state.friendChallenges, def),
      })),
      removeFriendChallenge: (id) => set((state) => ({
        friendChallenges: removeFriendChallengeState(state.friendChallenges, id),
      })),
      applyFriendScore: (challengeId, entry) => set((state) => ({
        friendChallenges: mergeFriendScoreState(state.friendChallenges, challengeId, entry),
      })),
      grantFriendChallengeReward: (id) => set((state) => ({
        friendChallenges: markFriendRewardGrantedState(state.friendChallenges, id),
      })),

      // Run Program enrollment (opt-in; progress derives from logged runs)
      runProgram: null,
      enrollRunProgram: (dateStr) => set({ runProgram: { enrolledDate: dateStr } }),
      leaveRunProgram: () => set({ runProgram: null }),

      // Coach Engine
      coach: getInitialCoachState(),
      dailyCheckins: {},
      setDailyCheckin: (dateStr, checkin) => set((state) => ({
        dailyCheckins: { ...state.dailyCheckins, [dateStr]: checkin },
      })),

      // Health Connect sync results. Weights merge under the rules in
      // lib/health-connect (manual weigh-ins are never overwritten;
      // HC entries refresh in place and stay user-editable/deletable).
      healthSummary: null,
      healthConnectLastSyncedAt: null,
      applyHealthSync: (result) => set((state) => {
        const { upserts } = mergeHealthWeights(state.bodyMetrics || [], result.weights || []);
        let nextMetrics = state.bodyMetrics || [];
        if (upserts.length > 0) {
          const byId = new Map(upserts.map((u) => [u.id, u]));
          const existingIds = new Set(nextMetrics.map((m) => m.id));
          nextMetrics = [
            ...upserts.filter((u) => !existingIds.has(u.id)),
            ...nextMetrics.map((m) => byId.get(m.id) ?? m),
          ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        }
        return {
          healthSummary: result.summary,
          healthConnectLastSyncedAt: new Date().toISOString(),
          bodyMetrics: nextMetrics,
        };
      }),
      dismissCheckIn: (id) => set((state) => ({
        coach: { ...state.coach, dismissedCheckIns: [...state.coach.dismissedCheckIns, id] },
      })),
      recordCalorieAdjustment: (record) => set((state) => ({
        coach: { ...state.coach, lastCalorieAdjustment: record },
      })),
      acknowledgeStall: (exercise) => set((state) => ({
        coach: {
          ...state.coach,
          stallFlags: {
            ...state.coach.stallFlags,
            [exercise]: { ...(state.coach.stallFlags[exercise] || {}), acknowledged: true },
          },
        },
      })),
      recordReadiness: (date, score, band) => set((state) => ({
        coach: {
          ...state.coach,
          readinessHistory: [...state.coach.readinessHistory, { date, score, band }].slice(-90),
        },
      })),
      processCoachingAfterWorkout: () => {
        const state = get();
        // Stall detection: flag exercises that haven't progressed
        try {
          const stalls = detectStalls(state.workouts);
          // QA4-024: local calendar day — a UTC key dates readiness
          // history to the wrong day around local midnight.
          const today = getLocalTodayStr();
          const newFlags: Record<string, any> = { ...state.coach.stallFlags };
          for (const stall of stalls) {
            const key = stall.exercise.toLowerCase();
            if (!newFlags[key]) {
              newFlags[key] = {
                suggestion: stall.suggestion,
                flaggedDate: today,
                acknowledged: false,
              };
            }
          }
          // Readiness: calculate and record today's score
          const readiness = calculateReadiness(
            state.workouts,
            state.bodyMetrics,
            undefined,
            buildHealthSignals(state.healthSummary)
          );
          set((s) => ({
            coach: {
              ...s.coach,
              stallFlags: newFlags,
              readinessHistory: [...s.coach.readinessHistory, {
                date: today,
                score: readiness.score,
                band: readiness.band,
              }].slice(-90),
            },
          }));
        } catch { /* coaching is best-effort, never blocks */ }
      },

      // Habit State
      waterLogs: {},
      waterBatches: {},
      hydrationConfig: DEFAULT_HYDRATION_CONFIG,
      creatineLogs: {},
      creatineConfig: DEFAULT_CREATINE_CONFIG,
      creatineSupply: DEFAULT_CREATINE_SUPPLY,
      dayTypeOverrides: {},
      gymLogs: {},
      aiInsightsCache: {},

      // AI State
      trainingProfile: DEFAULT_AI_TRAINING_PROFILE,
      todaysAIWorkoutPlan: undefined,
      latestWeeklyReview: undefined,

      // Lifter Twin & Decisions Ledger State
      trainingDecisions: {},
      decisionsLedgerHistory: [],
      lifterProfile: null,
      athleteModel: null,
      coachBlocks: getInitialCoachBlocksState(),
      weeklyReviews: [],

      // Policy v0 Decisions Ledger State
      policyDecisionRecords: {},
      policyDecisionsLedgerHistory: [],
      policyDecisionApplications: [],
      
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      
      setProfile: (profile) => set((state) => {
        // Idempotent baseline: exactly one entry with the stable id
        // `initial_bw_<profileId>`. Never fabricate additional entries.
        let nextMetrics = state.bodyMetrics;
        const baselineId = 'initial_bw_' + (profile.id || 'user');
        const hasBaseline = (nextMetrics || []).some((m) => m.id === baselineId);
        if (!hasBaseline && profile.bodyweightKg) {
          const entry: BodyMetricEntry = {
            id: baselineId,
            date: profile.createdAt ? getLocalTodayStr(new Date(profile.createdAt)) : getLocalTodayStr(),
            weightKg: profile.bodyweightKg,
            heightCm: profile.heightCm,
            notes: 'Baseline calibration',
          };
          nextMetrics = [...(nextMetrics || []), entry];
        }
        let nextFavorites = state.favoriteFoods;
        if (!nextFavorites || nextFavorites.length === 0) {
          nextFavorites = DEFAULT_FAVORITE_FOODS;
        }
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem('ascend_logged_out');
          } catch {}
        }
        // Keep the avatar mirror in step with the profile (see AVATAR_MIRROR_KEY).
        persistAvatarMirror(profile.avatar);
        const nextGoals = (profile.goals && profile.goals.length > 0)
          ? profile.goals
          : (state.goals && state.goals.length > 0 ? state.goals : ['build_muscle' as AthleteGoal]);
        return {
          // Stamp every profile write with the edit time so sync's
          // last-write-wins can tell a fresh local edit from a stale
          // server row (QA4A-001). Callers spread the old profile (old
          // stamp included) when editing, so the stamp is always
          // refreshed here — sync itself writes via setState, not here.
          profile: { ...profile, goals: nextGoals, updatedAt: new Date().toISOString() },
          goals: nextGoals,
          hasCompletedOnboarding: true,
          bodyMetrics: nextMetrics,
          favoriteFoods: nextFavorites,
        };
      }),
      
      setTheme: (theme, isCustom = true) => {
        if (typeof document !== 'undefined') {
          if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
            document.documentElement.setAttribute('data-theme', 'dark');
          } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
            document.documentElement.setAttribute('data-theme', 'light');
          }
        }
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('ascend_theme', theme);
            localStorage.setItem('ascend_has_custom_theme', isCustom ? 'true' : 'false');
          } catch {}
        }
        set({ theme, hasCustomTheme: isCustom });
      },

      toggleTheme: () => set((state) => {
        const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
        if (typeof document !== 'undefined') {
          if (nextTheme === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
            document.documentElement.setAttribute('data-theme', 'dark');
          } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
            document.documentElement.setAttribute('data-theme', 'light');
          }
        }
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('ascend_theme', nextTheme);
            localStorage.setItem('ascend_has_custom_theme', 'true');
          } catch {}
        }
        return { theme: nextTheme, hasCustomTheme: true };
      }),

      resetThemeToSystem: () => {
        let systemTheme: Theme = 'dark';
        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
          systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        if (typeof document !== 'undefined') {
          if (systemTheme === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
            document.documentElement.setAttribute('data-theme', 'dark');
          } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
            document.documentElement.setAttribute('data-theme', 'light');
          }
        }
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('ascend_theme', systemTheme);
            localStorage.setItem('ascend_has_custom_theme', 'false');
          } catch {}
        }
        set({ theme: systemTheme, hasCustomTheme: false });
      },
      
      addPR: (pr) => {
        // Dedup: re-importing the same history (or re-saving the same PR)
        // must not stack duplicate records — or duplicate XP. Identity is
        // the id when present, else exercise + date + e1RM content.
        const isDuplicate = get().prs.some(
          (existing) =>
            (pr?.id && existing.id === pr.id) ||
            (existing.exercise.trim().toLowerCase() === pr.exercise.trim().toLowerCase() &&
              existing.date === pr.date &&
              Math.abs((existing.oneRepMax || 0) - (pr.oneRepMax || 0)) < 0.05)
        );
        if (isDuplicate) return;
        set((state) => ({
          prs: [...state.prs, pr],
          // Explicitly re-adding a PR clears its deletion tombstone.
          deletedPrIds: pr?.id
            ? (state.deletedPrIds || []).filter((d) => d !== pr.id)
            : state.deletedPrIds,
        }));
        if (pr?.id) get().awardXpEvents([{ id: xpEventId('pr', pr.id), type: 'pr' }]);
      },
      addMultiplePRs: (newPrs) => {
        set((state) => ({
          prs: [...state.prs, ...newPrs],
          deletedPrIds: (state.deletedPrIds || []).filter(
            (d) => !newPrs.some((p) => p?.id === d)
          ),
        }));
        const events = (newPrs || []).filter((p) => p?.id).map((p) => ({ id: xpEventId('pr', p.id), type: 'pr' as const }));
        if (events.length > 0) get().awardXpEvents(events);
      },
      updatePR: (id, updatedFields) => set((state) => ({
        prs: state.prs.map(pr => pr.id === id ? { ...pr, ...updatedFields } : pr)
      })),
      deletePR: (id) => set((state) => ({
        prs: state.prs.filter(pr => pr.id !== id),
        // Tombstone so a stale server copy can't resurrect this PR (QA4-001).
        deletedPrIds: (state.deletedPrIds || []).includes(id)
          ? state.deletedPrIds
          : [...(state.deletedPrIds || []), id],
      })),
      
      setPRTarget: (exercise, targetKg) => set((state) => ({
        prTargets: { ...state.prTargets, [exercise]: targetKg }
      })),
      deletePRTarget: (exercise) => set((state) => {
        const next = { ...state.prTargets };
        delete next[exercise];
        return { prTargets: next };
      }),

      addWorkout: (workout) => {
        set((state) => {
        // Idempotency guard: If workout already exists, return current state
        if (workout?.id && state.workouts.some((w) => w.id === workout.id)) {
          return state;
        }

        const sanitizedWorkout: WorkoutEntry = {
          ...workout,
          exercises: (workout.exercises || []).map((ex) => ({
            ...ex,
            sets: (ex.sets || []).map((s) => {
              let cleanWeight: number | undefined = undefined;
              if (typeof s.weight === 'number' && !isNaN(s.weight)) {
                cleanWeight = s.weight;
              } else if (typeof s.weight === 'string' && (s.weight as string).trim() !== '') {
                const p = parseFloat(s.weight as string);
                if (!isNaN(p)) cleanWeight = p;
              }
              return {
                ...s,
                weight: cleanWeight,
              };
            }),
          })),
        };

        const nextWorkouts = [...state.workouts, sanitizedWorkout];
        const nextProfile = generateLifterTwinProfile(nextWorkouts, state.profile?.unit || 'kg');

        // Correlate completed workout with active training decisions to track prediction error
        const updatedDecisions = { ...state.trainingDecisions };
        let updatedLedger = [...state.decisionsLedgerHistory];

        for (const ex of sanitizedWorkout.exercises) {
          const cleanExName = ex.name.trim().toLowerCase();
          const decisionKey = Object.keys(updatedDecisions).find(
            (k) => k.trim().toLowerCase() === cleanExName
          );
          const decision = decisionKey ? updatedDecisions[decisionKey] : undefined;
          const validSets = ex.sets.filter((s) => s.reps > 0 && !s.isWarmup && isSetCompleted(s));

          if (decision && validSets.length > 0) {
            const isBW = isBodyweightExercise(ex.name);
            const setsWithNumericWeight = validSets.filter(
              (s) => typeof s.weight === 'number' && Number.isFinite(s.weight)
            );
            const topSet = setsWithNumericWeight.length > 0
              ? setsWithNumericWeight.reduce((prev, curr) => (curr.weight! >= prev.weight! ? curr : prev), setsWithNumericWeight[0])
              : validSets.reduce((prev, curr) => (curr.reps >= prev.reps ? curr : prev), validSets[0]);

            const recordedWeight = typeof topSet.weight === 'number' && Number.isFinite(topSet.weight)
              ? topSet.weight
              : (isBW ? 0 : undefined);

            // Only sets with a LOGGED Rpe count toward actual effort —
            // defaulting unrated sets to 8 fabricated an average the user
            // never reported. With no logged RPE, actual = expected
            // (prediction error 0: no evidence either way).
            const loggedRpes = validSets
              .map((s) => s.rpe)
              .filter((r): r is number => typeof r === 'number' && Number.isFinite(r));
            const expectedRpe = decision.expectedRpe || decision.nextPrescription.targetRpe || 8.0;
            const actualRpe =
              loggedRpes.length > 0
                ? Math.round((loggedRpes.reduce((a, b) => a + b, 0) / loggedRpes.length) * 10) / 10
                : expectedRpe;
            const predictionError = Math.round((actualRpe - expectedRpe) * 10) / 10;

            const evaluatedDecision: TrainingDecision = {
              ...decision,
              actualExecution: {
                weight: recordedWeight,
                reps: topSet.reps,
                actualRpe,
                completedSets: validSets.length,
              },
              predictionError,
              timestamp: new Date().toISOString(),
            };

            updatedDecisions[decisionKey || ex.name] = evaluatedDecision;
            updatedLedger = [
              evaluatedDecision,
              ...updatedLedger.filter((d) => d.id !== evaluatedDecision.id),
            ].slice(0, 50);
          }

          // Generate next pending training decision with updated history
          const nextDecision = generateTrainingDecision(
            ex.name,
            nextWorkouts,
            state.profile?.unit || 'kg',
            8.0,
            state.goals
          );
          if (nextDecision) {
            updatedDecisions[ex.name] = nextDecision;
            updatedLedger = [
              nextDecision,
              ...updatedLedger.filter((d) => d.id !== nextDecision.id),
            ].slice(0, 50);
          }
        }

        // ── Policy v0 Deterministic Evaluation & Ledger ──
        const updatedPolicyRecords = { ...state.policyDecisionRecords };
        let updatedPolicyHistory = [...state.policyDecisionsLedgerHistory];

        // Build multi-session evidence summary with the newly included workout
        const evidenceSummary = aggregateMultiSessionEvidence(nextWorkouts);

        // Look for matching planned workout (if any)
        const matchedPlan = state.plannedWorkouts.find(
          (p) =>
            (workout.planId && p.id === workout.planId) ||
            (workout.name && p.name.trim().toLowerCase() === workout.name.trim().toLowerCase()) ||
            p.id === workout.name
        );

        // Check for explicit, structured athlete safety flags only.
        // Never infer pain or hold requests from unstructured free-text notes (e.g. "no pain" vs positive pain reports).
        const workoutReportsPain =
          workout.reportsPain === true ||
          workout.athleteFlags?.reportsPain === true;
        const workoutRequestHold =
          workout.requestHold === true ||
          workout.athleteFlags?.requestHold === true;

        for (let exIndex = 0; exIndex < workout.exercises.length; exIndex++) {
          const ex = workout.exercises[exIndex];
          if (!ex || !ex.name) continue;

          // Target Planned Exercise Resolution:
          // Strictly resolve exact target identity: ID match first, single name match, or index fallback.
          // Fails closed if ambiguous.
          let plannedEx: PlannedExercise | undefined = undefined;
          if (matchedPlan) {
            if (ex.planExerciseId) {
              const matchesById = matchedPlan.exercises.filter((pe) => pe.id === ex.planExerciseId);
              if (matchesById.length === 1) {
                plannedEx = matchesById[0];
              }
            } else {
              const matchesByName = matchedPlan.exercises.filter(
                (pe) => canonicalizeExerciseName(pe.name) === canonicalizeExerciseName(ex.name)
              );
              if (matchesByName.length === 1) {
                plannedEx = matchesByName[0];
              } else if (matchesByName.length > 1) {
                if (
                  exIndex < matchedPlan.exercises.length &&
                  canonicalizeExerciseName(matchedPlan.exercises[exIndex].name) === canonicalizeExerciseName(ex.name)
                ) {
                  plannedEx = matchedPlan.exercises[exIndex];
                } else {
                  plannedEx = undefined;
                }
              }
            }
          }

          const prescribedSets = (ex.sets || []).filter((s) => isSetPrescribed(s));
          const hasPrescribedSets = prescribedSets.length > 0;
          const hasPlannedEx = Boolean(plannedEx);

          // If wholly manual (no prescribed sets and no planned workout exercise), skip evaluation!
          if (!hasPrescribedSets && !hasPlannedEx) {
            continue;
          }

          // Structured athlete safety flags: strictly check explicit boolean properties, never notes text
          //
          // Pain attribution: a pain-swap entry carries reportsPain for the
          // ORIGINAL exercise (ex.painfulExerciseName) — the entry itself was
          // renamed into the substitute. Attributing the flag to this entry
          // used to make SAFETY-01 lock progression on the innocent
          // substitute while the painful lift got no safety record at all.
          // The original gets its own policy evaluation below.
          const painSwapOriginal =
            ex.painfulExerciseName && ex.painfulExerciseName !== ex.name
              ? ex.painfulExerciseName
              : null;
          const entryReportsPain =
            ex.reportsPain === true || ex.athleteFlags?.reportsPain === true;
          const exReportsPain =
            workoutReportsPain || (!painSwapOriginal && entryReportsPain);

          const exRequestHold =
            workoutRequestHold ||
            ex.requestHold === true ||
            ex.athleteFlags?.requestHold === true;

          const athleteFlags: AthleteSafetyFlags | undefined =
            exReportsPain || exRequestHold
              ? {
                  reportsPain: exReportsPain ? true : undefined,
                  requestHold: exRequestHold ? true : undefined,
                  notes: ex.athleteFlags?.notes ?? workout.athleteFlags?.notes,
                }
              : undefined;

          const firstPrescribedSet = prescribedSets[0];
          const targetUnit: Unit =
            firstPrescribedSet?.prescribedUnit ??
            plannedEx?.targetUnit ??
            state.profile?.unit ??
            'kg';

          const currentTarget: CurrentPrescriptionTarget = {
            name: ex.name,
            targetWeight: firstPrescribedSet?.prescribedWeight ?? plannedEx?.targetWeight,
            targetReps: firstPrescribedSet?.prescribedReps ?? plannedEx?.targetReps,
            targetSets: plannedEx?.targetSets ?? (hasPrescribedSets ? prescribedSets.length : (ex.sets?.length || 1)),
            targetUnit,
            targetRpe: firstPrescribedSet?.prescribedRpe ?? plannedEx?.targetRpe,
            notes: ex.notes ?? plannedEx?.notes,
          };

          const targetRepsVal = currentTarget.targetReps ?? 8;
          const repRange = { min: targetRepsVal, max: targetRepsVal };

          // PR-B §4.5 (D2): coach-managed lifts ONLY. When this exercise
          // belongs to an approved coach block or an adopted plan, Policy
          // v0 arbitrates with the scheme's real rep range, the scheme's
          // coach-approved increment (converted to the lift's unit), and
          // the block's week type. For everything else `managedPolicy` is
          // null and the options below are byte-identical to before.
          const managedPolicy = matchedPlan
            ? resolveManagedPolicy(state.coachBlocks, matchedPlan.id, ex.name, workout.date)
            : null;
          const managedOptions = managedPolicy
            ? {
                repRange: {
                  min: managedPolicy.scheme.repMin,
                  max: managedPolicy.scheme.repMax,
                },
                ...(managedPolicy.scheme.incrementKg != null
                  ? {
                      incrementConfig: {
                        stepIncrement:
                          Math.round(
                            (targetUnit === 'lbs'
                              ? managedPolicy.scheme.incrementKg * 2.20462
                              : managedPolicy.scheme.incrementKg) * 2
                          ) / 2,
                        approvalSource: 'coach_approved' as const,
                      },
                    }
                  : {}),
                blockContext: { weekType: managedPolicy.weekType },
              }
            : null;

          const sameCanonicalCount = workout.exercises.filter(
            (e) => e && canonicalizeExerciseName(e.name) === canonicalizeExerciseName(ex.name)
          ).length;
          const sessionIndex = sameCanonicalCount > 1 ? exIndex : undefined;

          const policyDecision = evaluateTrainingDecisionPolicyV0(
            ex.name,
            currentTarget,
            evidenceSummary,
            {
              workoutId: workout.id,
              referenceDate: workout.date,
              userUnit: targetUnit,
              repRange,
              athleteFlags,
              sessionIndex,
              targetExerciseId: ex.planExerciseId || plannedEx?.id,
              planExerciseId: ex.planExerciseId || plannedEx?.id,
              // Unmanaged lifts: never pass increment config — equipment
              // increments remain unconfigured until explicit user/coach
              // configuration. Managed lifts (PR-B) pass the scheme's
              // coach-approved increment via managedOptions above.
              ...(managedOptions ?? {}),
            }
          );

          // Enforce Stage 2 Ledger Persistence Contract
          const persistenceCheck = canPersistDecisionToLedger(policyDecision);
          if (persistenceCheck.canPersist) {
            updatedPolicyRecords[policyDecision.id] = policyDecision;
            updatedPolicyHistory = [
              policyDecision,
              ...updatedPolicyHistory.filter((d) => d.id !== policyDecision.id),
            ].slice(0, 50);
          }

          // Pain-swap: record the SAFETY-01 pain decision against the
          // ORIGINAL exercise that hurt — that is the lift whose
          // progression must lock and whose record must exist.
          if (painSwapOriginal && entryReportsPain) {
            const painPlannedEx = matchedPlan?.exercises.find(
              (pe) => canonicalizeExerciseName(pe.name) === canonicalizeExerciseName(painSwapOriginal)
            );
            const painTarget: CurrentPrescriptionTarget = {
              name: painSwapOriginal,
              targetWeight: painPlannedEx?.targetWeight ?? currentTarget.targetWeight,
              targetReps: painPlannedEx?.targetReps ?? currentTarget.targetReps,
              targetSets: painPlannedEx?.targetSets ?? currentTarget.targetSets,
              targetUnit,
              targetRpe: painPlannedEx?.targetRpe ?? currentTarget.targetRpe,
              notes: painPlannedEx?.notes,
            };
            const painDecision = evaluateTrainingDecisionPolicyV0(
              painSwapOriginal,
              painTarget,
              evidenceSummary,
              {
                workoutId: workout.id,
                referenceDate: workout.date,
                userUnit: targetUnit,
                repRange: {
                  min: painTarget.targetReps ?? targetRepsVal,
                  max: painTarget.targetReps ?? targetRepsVal,
                },
                athleteFlags: { reportsPain: true },
                targetExerciseId: painPlannedEx?.id,
                planExerciseId: painPlannedEx?.id,
              }
            );
            const painPersistence = canPersistDecisionToLedger(painDecision);
            if (painPersistence.canPersist) {
              updatedPolicyRecords[painDecision.id] = painDecision;
              updatedPolicyHistory = [
                painDecision,
                ...updatedPolicyHistory.filter((d) => d.id !== painDecision.id),
              ].slice(0, 50);
            }
          }
        }

        return {
          workouts: nextWorkouts,
          // Explicitly re-adding a workout clears its deletion tombstone.
          deletedWorkoutIds: workout?.id
            ? (state.deletedWorkoutIds || []).filter((d) => d !== workout.id)
            : state.deletedWorkoutIds,
          lifterProfile: nextProfile,
          trainingDecisions: updatedDecisions,
          decisionsLedgerHistory: updatedLedger,
          policyDecisionRecords: updatedPolicyRecords,
          policyDecisionsLedgerHistory: updatedPolicyHistory,
        };
        });
        // Award XP for the workout (idempotent — no double-counting on re-save).
        // Done outside set() so the XP ledger update is a separate, safe write.
        if (workout?.id && xpForWorkout(workout) > 0) {
          get().awardXpEvents([{ id: xpEventId('workout', workout.id), type: 'workout' }]);
        }
        // Run coach engine: stall detection + readiness update (best-effort).
        get().processCoachingAfterWorkout();
        // QA4-011: a completed workout is a streak lifecycle point —
        // persist freeze consumption/refill instead of leaving the
        // streak slice as dead code the UI only reads.
        get().refreshStreak();
      },
      deleteWorkout: (id) => set((state) => {
        const nextWorkouts = state.workouts.filter(w => w.id !== id);
        const nextProfile = generateLifterTwinProfile(nextWorkouts, state.profile?.unit || 'kg');
        return {
          workouts: nextWorkouts,
          lifterProfile: nextProfile,
          // Tombstone so a stale server copy can't resurrect it (QA4-001).
          deletedWorkoutIds: (state.deletedWorkoutIds || []).includes(id)
            ? state.deletedWorkoutIds
            : [...(state.deletedWorkoutIds || []), id],
        };
      }),
      insertWorkoutAt: (workout, index) => set((state) => {
        if (state.workouts.some((w) => w.id === workout.id)) return state;
        const nextWorkouts = [...state.workouts];
        nextWorkouts.splice(Math.max(0, Math.min(index, nextWorkouts.length)), 0, workout);
        return {
          workouts: nextWorkouts,
          lifterProfile: generateLifterTwinProfile(nextWorkouts, state.profile?.unit || 'kg'),
          // Undoing a deletion must also clear its tombstone (QA4-001),
          // or the next sync would delete the restored workout again.
          deletedWorkoutIds: (state.deletedWorkoutIds || []).filter((d) => d !== workout.id),
        };
      }),
      
      addMeal: (meal) => {
        // QA4-028: idempotency guard, mirroring addWorkout — a fast
        // double-tap re-submits the SAME meal id; storing it twice would
        // duplicate the meal and double-pay its XP.
        if (meal?.id && get().meals.some((m) => m.id === meal.id)) {
          return;
        }
        set((state) => ({
          meals: [...state.meals, meal],
          // Explicitly re-adding a meal clears its deletion tombstone.
          deletedMealIds: meal?.id
            ? (state.deletedMealIds || []).filter((d) => d !== meal.id)
            : state.deletedMealIds,
        }));
        if (meal?.id && xpForMeal(meal) > 0) {
          get().awardXpEvents([{ id: xpEventId('meal', meal.id), type: 'meal' }]);
        }
      },
      deleteMeal: (id) => set((state) => ({
        meals: state.meals.filter(meal => meal.id !== id),
        // Tombstone so a stale server copy can't resurrect it (QA4-001).
        deletedMealIds: (state.deletedMealIds || []).includes(id)
          ? state.deletedMealIds
          : [...(state.deletedMealIds || []), id],
      })),
      insertMealAt: (meal, index) => set((state) => {
        if (state.meals.some((m) => m.id === meal.id)) return state;
        const nextMeals = [...state.meals];
        nextMeals.splice(Math.max(0, Math.min(index, nextMeals.length)), 0, meal);
        // Undoing a deletion must also clear its tombstone (QA4-001),
        // or the next sync would delete the restored meal again.
        return {
          meals: nextMeals,
          deletedMealIds: (state.deletedMealIds || []).filter((d) => d !== meal.id),
        };
      }),
      restoreFoodToMeal: (mealSnapshot, mealIndex, foodIndex) => set((state) => {
        const food = mealSnapshot.foods[foodIndex];
        if (!food) return state;
        const existingIdx = state.meals.findIndex((m) => m.id === mealSnapshot.id);
        if (existingIdx >= 0) {
          const nextMeals = state.meals.map((meal, i) => {
            if (i !== existingIdx) return meal;
            const foods = [...meal.foods];
            foods.splice(Math.min(foodIndex, foods.length), 0, food);
            return { ...meal, foods };
          });
          return {
            meals: nextMeals,
            deletedMealIds: (state.deletedMealIds || []).filter((d) => d !== mealSnapshot.id),
          };
        }
        // The removed food was the meal's last item, so deleteFoodFromMeal
        // removed the whole meal — restore the snapshot in place.
        const nextMeals = [...state.meals];
        nextMeals.splice(Math.max(0, Math.min(mealIndex, nextMeals.length)), 0, mealSnapshot);
        return {
          meals: nextMeals,
          deletedMealIds: (state.deletedMealIds || []).filter((d) => d !== mealSnapshot.id),
        };
      }),
      updateMeal: (id, updated) => set((state) => ({
        meals: state.meals.map(meal => meal.id === id ? { ...meal, ...updated } : meal),
      })),
      deleteFoodFromMeal: (mealId, foodIndex) => set((state) => {
        const nextMeals = state.meals
          .map((meal) => {
            if (meal.id !== mealId) return meal;
            const nextFoods = meal.foods.filter((_, idx) => idx !== foodIndex);
            return {
              ...meal,
              foods: nextFoods,
            };
          })
          .filter((meal) => meal.foods.length > 0);
        // Removing a meal's last food deletes the meal itself — tombstone
        // it too, or the next sync pull resurrects the emptied meal.
        const removedIds = state.meals
          .filter((meal) => !nextMeals.some((m) => m.id === meal.id))
          .map((meal) => meal.id);
        return {
          meals: nextMeals,
          deletedMealIds:
            removedIds.length > 0
              ? [...new Set([...(state.deletedMealIds || []), ...removedIds])]
              : state.deletedMealIds,
        };
      }),

      copyMealsFromDate: (sourceDate, targetDate) => {
        const tgt = targetDate || getLocalTodayStr();
        let copiedCount = 0;
        set((state) => {
          const sourceMeals = state.meals.filter(m => m.date === sourceDate);
          if (sourceMeals.length === 0) return state;

          const clonedMeals = sourceMeals.map(m => ({
            ...m,
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `m_${Date.now()}_${Math.random()}`,
            date: tgt,
            foods: m.foods.map(f => ({ ...f }))
          }));

          copiedCount = clonedMeals.length;
          return { meals: [...state.meals, ...clonedMeals] };
        });
        return copiedCount;
      },

      setMacroGoals: (goals) => set({ macroGoals: goals }),

      addBodyMetric: (entry) => set((state) => {
        // One entry per date: a same-date entry is replaced, and the
        // replaced row must be tombstoned or sync resurrects it (QA4-001).
        const replacedIds = state.bodyMetrics
          .filter(m => m.date === entry.date && m.id !== entry.id)
          .map(m => m.id);
        return {
          bodyMetrics: [entry, ...state.bodyMetrics.filter(m => m.date !== entry.date)],
          deletedBodyMetricIds: [
            ...new Set([
              ...(state.deletedBodyMetricIds || []).filter((d) => d !== entry.id),
              ...replacedIds,
            ]),
          ],
        };
      }),
      deleteBodyMetric: (id) => set((state) => ({
        bodyMetrics: state.bodyMetrics.filter(m => m.id !== id),
        // Tombstone so a stale server copy can't resurrect it (QA4-001).
        deletedBodyMetricIds: (state.deletedBodyMetricIds || []).includes(id)
          ? state.deletedBodyMetricIds
          : [...(state.deletedBodyMetricIds || []), id],
      })),
      // Progress photos are downscaled (~800px JPEG) before storage; cap the
      // count so localStorage stays healthy. Persisted to their own key
      // (not the zustand blob) — see PROGRESS_PHOTOS_KEY.
      addProgressPhoto: (photo) => {
        const next = [photo, ...get().progressPhotos].slice(0, MAX_PROGRESS_PHOTOS);
        const persisted = persistProgressPhotos(next);
        set({ progressPhotos: next });
        return persisted;
      },
      removeProgressPhoto: (id) => set((state) => {
        const next = state.progressPhotos.filter(p => p.id !== id);
        persistProgressPhotos(next);
        return { progressPhotos: next };
      }),
      updateBodyMetrics: (weightKg, heightCm, bodyFatPct, chestIn, waistIn, hipsIn) => set((state) => {
        const todayDate = getLocalTodayStr();
        const entry: BodyMetricEntry = {
          id: safeRandomId('bm'),
          date: todayDate,
          weightKg: Math.round(weightKg * 10) / 10,
          heightCm: heightCm ? Math.round(heightCm) : undefined,
          bodyFatPct: typeof bodyFatPct === 'number' && !isNaN(bodyFatPct) ? Math.round(bodyFatPct * 10) / 10 : undefined,
          chestIn: typeof chestIn === 'number' && !isNaN(chestIn) ? Math.round(chestIn * 10) / 10 : undefined,
          waistIn: typeof waistIn === 'number' && !isNaN(waistIn) ? Math.round(waistIn * 10) / 10 : undefined,
          hipsIn: typeof hipsIn === 'number' && !isNaN(hipsIn) ? Math.round(hipsIn * 10) / 10 : undefined,
        };
        const updatedProfile = state.profile ? {
          ...state.profile,
          bodyweightKg: Math.round(weightKg * 10) / 10,
          bodyweightLbs: Math.round(weightKg * 2.20462 * 10) / 10,
          ...(heightCm ? { heightCm: Math.round(heightCm) } : {}),
          // Profile changed — stamp it so sync's last-write-wins keeps
          // this edit over an older server row (QA4A-001).
          updatedAt: new Date().toISOString(),
        } : null;
        // The new entry replaces any same-date entry; tombstone the
        // replaced row or the next sync pull resurrects it (QA4-001).
        const replacedIds = state.bodyMetrics
          .filter(m => m.date === todayDate)
          .map(m => m.id);
        return {
          profile: updatedProfile,
          bodyMetrics: [entry, ...state.bodyMetrics.filter(m => m.date !== todayDate)],
          deletedBodyMetricIds: [
            ...new Set([...(state.deletedBodyMetricIds || []), ...replacedIds]),
          ],
        };
      }),

      addPlannedWorkout: (plan) => set((state) => {
        // Never silently overwrite an existing plan: on a name collision,
        // auto-rename to "X (Copy)" / "X (Copy 2)" instead of deleting the original.
        const existingNames = new Set(state.plannedWorkouts.map(p => p.name.toLowerCase()));
        let finalName = plan.name;
        if (existingNames.has(finalName.toLowerCase())) {
          let copyIdx = 2;
          finalName = `${plan.name} (Copy)`;
          while (existingNames.has(finalName.toLowerCase())) {
            finalName = `${plan.name} (Copy ${copyIdx++})`;
          }
        }
        const finalPlan = finalName === plan.name ? plan : { ...plan, name: finalName };
        const nextPlans = [finalPlan, ...state.plannedWorkouts.filter(p => p.id !== finalPlan.id)];
        const currentSched = state.weeklySchedule;
        const todayDay = getTodayDayOfWeek();
        
        // Base schedule or default
        const baseSchedule: WeeklySchedule = currentSched && Object.keys(currentSched).length > 0
          ? { ...currentSched }
          : buildDefaultWeeklySchedule(nextPlans, state.trainingProfile?.daysPerWeek || 4);

        // Always set today's day to the newly created/added plan so the user immediately sees their plan on Home & Train!
        baseSchedule[todayDay] = {
          workoutPlanId: finalPlan.id,
          customTitle: finalPlan.name,
          bodyParts: getWorkoutBodyParts(finalPlan.exercises),
        };

        // If the user has custom plans (non-builtin), replace any stale builtin_ templates in the weekly schedule
        const userCustomPlans = nextPlans.filter(p => !p.id.startsWith('builtin_'));
        if (userCustomPlans.length > 0) {
          const freshCustomSched = buildDefaultWeeklySchedule(userCustomPlans, state.trainingProfile?.daysPerWeek || 4);
          for (const day of DAYS_OF_WEEK) {
            if (day !== todayDay && baseSchedule[day]?.workoutPlanId?.startsWith('builtin_')) {
              baseSchedule[day] = freshCustomSched[day] || baseSchedule[day];
            }
          }
        }

        return {
          plannedWorkouts: nextPlans,
          weeklySchedule: baseSchedule,
          // Explicitly re-adding a plan clears its deletion tombstone.
          deletedPlanIds: state.deletedPlanIds.filter((d) => d !== finalPlan.id),
        };
      }),

      updatePlannedWorkout: (id, plan) => set((state) => {
        const nextPlans = state.plannedWorkouts.map(p => p.id === id ? plan : p);
        let nextSchedule = state.weeklySchedule;
        if (nextSchedule) {
          const updatedSched = { ...nextSchedule };
          let changed = false;
          for (const day of DAYS_OF_WEEK) {
            if (updatedSched[day]?.workoutPlanId === id) {
              updatedSched[day] = {
                ...updatedSched[day],
                customTitle: plan.name,
                bodyParts: getWorkoutBodyParts(plan.exercises),
              };
              changed = true;
            }
          }
          if (changed) nextSchedule = updatedSched;
        }
        return {
          plannedWorkouts: nextPlans,
          weeklySchedule: nextSchedule,
        };
      }),

      clearDeletedPlanIds: (ids) => set((state) => ({
        deletedPlanIds: state.deletedPlanIds.filter((d) => !ids.includes(d)),
      })),

      deletePlannedWorkout: (id) => set((state) => {
        const nextPlans = state.plannedWorkouts.filter(p => p.id !== id);
        let nextSchedule = state.weeklySchedule;
        if (nextSchedule) {
          const updatedSched = { ...nextSchedule };
          let changed = false;
          for (const day of DAYS_OF_WEEK) {
            if (updatedSched[day]?.workoutPlanId === id) {
              const fallbackPlan = nextPlans[0];
              updatedSched[day] = fallbackPlan
                ? {
                    workoutPlanId: fallbackPlan.id,
                    customTitle: fallbackPlan.name,
                    bodyParts: getWorkoutBodyParts(fallbackPlan.exercises),
                  }
                : {
                    workoutPlanId: 'rest',
                    customTitle: 'Rest Day',
                    bodyParts: [],
                  };
              changed = true;
            }
          }
          if (changed) nextSchedule = updatedSched;
        }
        return {
          plannedWorkouts: nextPlans,
          weeklySchedule: nextSchedule,
          // Tombstone the deletion so a stale server copy can never
          // resurrect this plan on the next sync pull.
          deletedPlanIds: state.deletedPlanIds.includes(id)
            ? state.deletedPlanIds
            : [...state.deletedPlanIds, id],
        };
      }),

      restorePlannedWorkout: (plan, index, prevSchedule, prevDeletedPlanIds) => set((state) => {
        if (state.plannedWorkouts.some((p) => p.id === plan.id)) return state;
        const nextPlans = [...state.plannedWorkouts];
        nextPlans.splice(Math.max(0, Math.min(index, nextPlans.length)), 0, plan);
        return {
          plannedWorkouts: nextPlans,
          // deletePlannedWorkout rewired schedule refs to a fallback
          // plan and tombstoned the id — undo restores both snapshots.
          weeklySchedule: prevSchedule,
          deletedPlanIds: prevDeletedPlanIds,
        };
      }),

      setPlannedWorkouts: (plans) => set((state) => {
        const currentSched = state.weeklySchedule;
        const validPlanIds = new Set(plans.map(p => p.id));
        const hasValidSchedule = currentSched && Object.values(currentSched).some(
          d => d.workoutPlanId && d.workoutPlanId !== 'rest' && validPlanIds.has(d.workoutPlanId)
        );
        const nextSchedule = hasValidSchedule ? currentSched : buildDefaultWeeklySchedule(plans, state.trainingProfile?.daysPerWeek || 4);
        return {
          plannedWorkouts: plans,
          weeklySchedule: nextSchedule,
          // A full list replacement (backup restore / onboarding accept)
          // restores the listed plans: drop their tombstones.
          deletedPlanIds: state.deletedPlanIds.filter((d) => !validPlanIds.has(d)),
        };
      }),

      addFavoriteFood: (food) => set((state) => ({
        favoriteFoods: [
          {
            ...food,
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `fav_${Date.now()}`
          },
          ...state.favoriteFoods.filter(f => f.name.toLowerCase() !== food.name.toLowerCase())
        ]
      })),

      updateFavoriteFood: (id, updated) => set((state) => ({
        favoriteFoods: state.favoriteFoods.map((f) => (f.id === id ? { ...f, ...updated } : f)),
      })),

      deleteFavoriteFood: (id) => set((state) => ({
        favoriteFoods: state.favoriteFoods.filter(f => f.id !== id && f.name.toLowerCase() !== id.toLowerCase())
      })),

      clearAllFavoriteFoods: () => set({ favoriteFoods: [] }),

      addCustomFood: (food) => {
        const created: CustomFood = {
          ...food,
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `custom_${Date.now()}`,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          // Same name (case-insensitive) replaces the older version —
          // "my dal" should evolve, not duplicate.
          customFoods: [
            created,
            ...state.customFoods.filter(
              (f) => f.name.toLowerCase() !== food.name.toLowerCase()
            ),
          ],
        }));
        return created;
      },

      updateCustomFood: (id, updated) => set((state) => ({
        customFoods: state.customFoods.map((f) => (f.id === id ? { ...f, ...updated } : f)),
      })),

      deleteCustomFood: (id) => set((state) => ({
        customFoods: state.customFoods.filter((f) => f.id !== id),
      })),

      setMealDayKind: (date, kind) => set((state) => {
        const next = { ...state.mealDayKinds };
        if (kind === null) delete next[date];
        else next[date] = kind;
        return { mealDayKinds: next };
      }),

      toggleFavoriteFood: (food) => {
        let isAdded = false;
        set((state) => {
          const existing = state.favoriteFoods.find(
            f => f.name.toLowerCase() === food.name.toLowerCase()
          );
          if (existing) {
            isAdded = false;
            return { favoriteFoods: state.favoriteFoods.filter(f => f.id !== existing.id) };
          } else {
            isAdded = true;
            const newFav: FavoriteFood = {
              id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `fav_${Date.now()}`,
              name: food.name,
              defaultQuantity: food.quantity,
              unit: food.unit || 'g',
              calories: food.calories || 0,
              proteinG: food.proteinG || 0,
              carbsG: food.carbsG || 0,
              fatG: food.fatG || 0,
            };
            return { favoriteFoods: [newFav, ...state.favoriteFoods] };
          }
        });
        return isAdded;
      },

      logWater: (amountMl, date) => {
        const d = date || getLocalTodayStr();
        set((state) => {
          const current = state.waterLogs[d] || 0;
          const nextAmount = Math.max(0, current + amountMl);
          const batch: WaterLogBatch = {
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `water_${Date.now()}`,
            amountMl,
            timestamp: new Date().toISOString(),
          };
          return {
            waterLogs: { ...state.waterLogs, [d]: nextAmount },
            waterBatches: {
              ...state.waterBatches,
              [d]: [...(state.waterBatches[d] || []), batch],
            },
          };
        });
        // Award XP once per day for logging water (idempotent via date key).
        if (amountMl > 0) {
          get().awardXpEvents([{ id: xpEventId('water', d), type: 'water' }]);
        }
      },

      resetWater: (date) => set((state) => {
        const d = date || getLocalTodayStr();
        return {
          waterLogs: { ...state.waterLogs, [d]: 0 },
          waterBatches: { ...state.waterBatches, [d]: [] },
        };
      }),

      setHydrationConfig: (config) => set((state) => ({
        hydrationConfig: { ...state.hydrationConfig, ...config },
      })),

      toggleCreatine: (date, amountG) => set((state) => {
        const d = date || getLocalTodayStr();
        const existing = state.creatineLogs[d];
        const dose = amountG || state.creatineConfig?.dailyTargetG || 5;
        const wasTaken = !!existing?.taken;
        const nowTaken = !wasTaken;

        // Auto-decrement/increment container supply
        const currentSupply = state.creatineSupply?.currentAmountG ?? 500;
        const supplyDiff = nowTaken ? -dose : dose;
        const newSupplyAmount = Math.max(0, currentSupply + supplyDiff);

        return {
          creatineLogs: {
            ...state.creatineLogs,
            [d]: {
              taken: nowTaken,
              amountG: dose,
              timestamp: nowTaken ? new Date().toISOString() : undefined,
            },
          },
          creatineSupply: {
            containerG: state.creatineSupply?.containerG ?? 500,
            currentAmountG: newSupplyAmount,
            lastUpdated: d,
          },
        };
      }),

      setCreatineConfig: (config) => set((state) => ({
        creatineConfig: { ...state.creatineConfig, ...config },
      })),

      updateCreatineSupply: (supply) => set((state) => ({
        creatineSupply: {
          containerG: state.creatineSupply?.containerG ?? 500,
          currentAmountG: state.creatineSupply?.currentAmountG ?? 500,
          lastUpdated: getLocalTodayStr(),
          ...supply,
        },
      })),

      refillCreatineSupply: (containerG) => set((state) => {
        const size = containerG || state.creatineSupply?.containerG || 500;
        return {
          creatineSupply: {
            containerG: size,
            currentAmountG: size,
            lastUpdated: getLocalTodayStr(),
          },
        };
      }),

      setDayType: (date, type) => set((state) => ({
        dayTypeOverrides: { ...state.dayTypeOverrides, [date]: type },
      })),

      toggleGymToday: (date) => {
        let isMarked = false;
        set((state) => {
          const d = date || getLocalTodayStr();
          const current = !!state.gymLogs?.[d];
          isMarked = !current;
          return {
            gymLogs: {
              ...(state.gymLogs || {}),
              [d]: isMarked,
            },
          };
        });
        return isMarked;
      },

      logQuickProtein: (proteinG, date) => set((state) => {
        const d = date || getLocalTodayStr();
        const existingIndex = state.meals.findIndex((m) => m.date === d && m.name === 'Quick Protein');
        const newFood: FoodItem = {
          name: `Protein Boost (${proteinG}g)`,
          quantity: proteinG,
          unit: 'g',
          calories: Math.round(proteinG * 4),
          proteinG,
          carbsG: 0,
          fatG: 0,
        };

        if (existingIndex >= 0) {
          const updatedMeals = [...state.meals];
          const existingMeal = updatedMeals[existingIndex];
          updatedMeals[existingIndex] = {
            ...existingMeal,
            foods: [...existingMeal.foods, newFood],
          };
          return { meals: updatedMeals };
        } else {
          const newMeal: MealEntry = {
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `meal_${Date.now()}`,
            date: d,
            name: 'Quick Protein',
            foods: [newFood],
          };
          return { meals: [newMeal, ...state.meals] };
        }
      }),

      saveWorkoutDraft: (draft) => {
        if (!draft) {
          set({ activeWorkoutDraft: null });
          return;
        }
        const sanitizedExercises = (draft.exercises || []).map((ex) => ({
          ...ex,
          sets: (ex.sets || []).map((s) => {
            let cleanWeight: number | undefined = undefined;
            if (typeof s.weight === 'number' && !isNaN(s.weight)) {
              cleanWeight = s.weight;
            } else if (typeof s.weight === 'string' && (s.weight as string).trim() !== '') {
              const p = parseFloat(s.weight as string);
              if (!isNaN(p)) cleanWeight = p;
            }
            return {
              ...s,
              weight: cleanWeight,
            };
          }),
        }));
        set({
          activeWorkoutDraft: {
            ...draft,
            exercises: sanitizedExercises,
          },
        });
      },
      clearWorkoutDraft: () => set({ activeWorkoutDraft: null }),

      savePortionPreference: (foodName, grams) =>
        set((state) => ({
          userPortionPreferences: {
            ...state.userPortionPreferences,
            [foodName.toLowerCase().trim()]: grams,
          },
        })),

      cacheAIInsight: (date: string, insight: AICoachInsight) =>
        set((state) => ({
          aiInsightsCache: {
            ...state.aiInsightsCache,
            [date]: insight,
          },
        })),

      setTrainingProfile: (profileUpdates) =>
        set((state) => ({
          trainingProfile: { ...state.trainingProfile, ...profileUpdates },
        })),

      setTodaysAIWorkoutPlan: (plan) => set({ todaysAIWorkoutPlan: plan }),

      saveWeeklyReview: (review) => set({ latestWeeklyReview: review }),

      // Lifter Twin & Decisions Ledger Handlers
      acceptTrainingDecision: (exerciseName: string, decision?: TrainingDecision) => {
        set((state) => {
          const existing = state.trainingDecisions[exerciseName] || decision;
          if (!existing) return state;
          const updated: TrainingDecision = {
            ...existing,
            status: 'accepted',
            timestamp: new Date().toISOString(),
          };
          return {
            trainingDecisions: {
              ...state.trainingDecisions,
              [exerciseName]: updated,
            },
            decisionsLedgerHistory: [updated, ...state.decisionsLedgerHistory.filter((d) => d.id !== existing.id).slice(0, 49)],
          };
        });
      },

      overrideTrainingDecision: (exerciseName: string, customWeight?: number, decision?: TrainingDecision) => {
        set((state) => {
          const existing = state.trainingDecisions[exerciseName] || decision;
          if (!existing) return state;
          const updated: TrainingDecision = {
            ...existing,
            status: 'overridden',
            userOverrideWeight: customWeight ?? existing.previousPerformance.weight,
            timestamp: new Date().toISOString(),
          };
          return {
            trainingDecisions: {
              ...state.trainingDecisions,
              [exerciseName]: updated,
            },
            decisionsLedgerHistory: [updated, ...state.decisionsLedgerHistory.filter((d) => d.id !== existing.id).slice(0, 49)],
          };
        });
      },

      recordTrainingDecision: (decision: TrainingDecision) => {
        set((state) => ({
          trainingDecisions: {
            ...state.trainingDecisions,
            [decision.exerciseName]: decision,
          },
          decisionsLedgerHistory: [decision, ...state.decisionsLedgerHistory.filter((d) => d.id !== decision.id).slice(0, 49)],
        }));
      },

      refreshLifterProfile: () => {
        set((state) => ({
          lifterProfile: generateLifterTwinProfile(state.workouts, state.profile?.unit || 'kg'),
        }));
      },

      refreshAthleteModel: () => {
        set((state) => ({
          athleteModel: buildAthleteModel(
            {
              workouts: state.workouts,
              dailyCheckins: state.dailyCheckins,
              weeklySchedule: state.weeklySchedule,
              plannedWorkouts: state.plannedWorkouts,
              readinessHistory: state.coach?.readinessHistory || [],
            },
            getLocalTodayStr()
          ),
        }));
      },

      // ── Coach blocks (PR-B) ──────────────────────────────────────────────
      proposeCoachBlock: (intake) => {
        const state = get();
        const todayStr = getLocalTodayStr();
        // Per-muscle readiness for today: today's check-in (including
        // any per-muscle soreness) layered on the global readiness
        // score, so the block's weekday fit and weak-point picks see
        // the same table. Falls back to the global score alone when
        // there is no check-in — never blocks the proposal.
        const todayCheckin = state.dailyCheckins?.[todayStr];
        const proposal = generateBlockProposal({
          intake,
          athleteModel: state.athleteModel,
          prs: state.prs,
          workouts: state.workouts,
          existingPlans: state.plannedWorkouts,
          unit: state.profile?.unit ?? 'kg',
          todayStr,
          nutritionPhase: intake.goal === 'lose_fat' ? 'deficit' : null,
          bodyweightKg: state.profile?.bodyweightKg,
          ageYears: state.profile?.age,
          dislikedExercises: state.trainingProfile?.dislikedExercises ?? [],
          perMuscleReadiness: computePerMuscleReadiness({
            workouts: state.workouts,
            recovery: state.athleteModel?.recovery ?? [],
            checkin: todayCheckin,
            globalReadiness: calculateReadiness(
              state.workouts,
              state.bodyMetrics ?? [],
              todayCheckin
            ),
            todayStr,
          }),
        });
        set({ coachBlocks: { ...state.coachBlocks, pendingProposal: proposal } });
        return proposal;
      },

      dismissBlockProposal: () => {
        set((state) => ({
          coachBlocks: { ...state.coachBlocks, pendingProposal: null },
        }));
      },

      approveBlockProposal: (editedProposal) => {
        const state = get();
        const pending = state.coachBlocks.pendingProposal;
        if (!pending) return;
        // An edited copy is only honoured when it IS the pending
        // proposal (same id) — anything else is ignored, never trusted.
        const proposal =
          editedProposal && editedProposal.id === pending.id ? editedProposal : pending;
        const todayStr = getLocalTodayStr();
        const { plans, schedule, activeBlock } = materializeProposal(
          proposal,
          state.plannedWorkouts,
          state.weeklySchedule,
          todayStr
        );
        const previous = state.coachBlocks.activeBlock;
        set({
          plannedWorkouts: plans,
          weeklySchedule: schedule,
          coachBlocks: {
            ...state.coachBlocks,
            pendingProposal: null,
            activeBlock,
            pastBlocks: previous
              ? [
                  { ...previous, status: 'completed' as const },
                  ...state.coachBlocks.pastBlocks,
                ].slice(0, 8)
              : state.coachBlocks.pastBlocks,
          },
        });
        // The schedule changed shape — rebuild through the store's own
        // action so its invariants (and any schedule-keyed derivations)
        // stay the single source of truth.
        get().refreshAthleteModel();
      },

      adoptPlanForCoaching: (planId) => {
        const state = get();
        const plan = state.plannedWorkouts.find((p) => p.id === planId);
        if (!plan) return;
        set({
          coachBlocks: {
            ...state.coachBlocks,
            adoptedPlans: {
              ...state.coachBlocks.adoptedPlans,
              [planId]: {
                planId,
                adoptedOn: getLocalTodayStr(),
                schemes: deriveAdoptionSchemes(plan, state.athleteModel),
              },
            },
          },
        });
      },

      unadoptPlanForCoaching: (planId) => {
        set((state) => {
          const adoptedPlans = { ...state.coachBlocks.adoptedPlans };
          delete adoptedPlans[planId];
          return { coachBlocks: { ...state.coachBlocks, adoptedPlans } };
        });
      },

      refreshPlateauProposals: () => {
        const state = get();
        try {
          const stalls = detectStalls(state.workouts);
          const acknowledgedKeys = new Set<string>(
            Object.entries(state.coach?.stallFlags ?? {})
              .filter(([, v]) => (v as { acknowledged?: boolean })?.acknowledged)
              .map(([k]) => k.trim().toLowerCase())
          );
          const planIdByExerciseKey = managedPlanIdByExerciseKey(
            state.coachBlocks,
            state.plannedWorkouts
          );
          const fresh = buildPlateauProposals({
            stalls,
            blocks: state.coachBlocks,
            planIdByExerciseKey,
            acknowledgedKeys,
            todayStr: getLocalTodayStr(),
          });
          if (fresh.length === 0) return;
          const withSnapshots = snapshotPlateauExpectations(fresh, state.plannedWorkouts);
          set({
            coachBlocks: {
              ...state.coachBlocks,
              plateauProposals: [...state.coachBlocks.plateauProposals, ...withSnapshots].slice(-12),
            },
          });
        } catch {
          /* plateau proposals are best-effort, never block the app */
        }
      },

      applyPlateauProposal: (proposalId) => {
        const state = get();
        const proposal = state.coachBlocks.plateauProposals.find((p) => p.id === proposalId);
        if (!proposal || proposal.status !== 'pending') return;
        const plan = state.plannedWorkouts.find((p) => p.id === proposal.planId);
        if (!plan) return;
        const active = state.coachBlocks.activeBlock;
        const inBlock = active && active.status === 'active' && active.planIds.includes(plan.id);
        const schemes = inBlock
          ? active.schemes
          : state.coachBlocks.adoptedPlans[plan.id]?.schemes;
        if (!schemes) return;
        const result = applyPlateauProposalToPlan(plan, schemes, proposal, getLocalTodayStr());
        if ('error' in result) {
          // Stale (plan changed since the proposal) or the exercise is
          // gone: retire the proposal instead of editing blind.
          set({
            coachBlocks: {
              ...state.coachBlocks,
              plateauProposals: state.coachBlocks.plateauProposals.map((p) =>
                p.id === proposalId ? { ...p, status: 'dismissed' as const } : p
              ),
            },
          });
          return;
        }
        const planChanged =
          JSON.stringify(result.plan.exercises) !== JSON.stringify(plan.exercises);
        set({
          ...(planChanged
            ? { plannedWorkouts: state.plannedWorkouts.map((p) => (p.id === plan.id ? result.plan : p)) }
            : {}),
          coachBlocks: {
            ...state.coachBlocks,
            activeBlock: inBlock && active ? { ...active, schemes: result.schemes } : active,
            adoptedPlans:
              !inBlock && state.coachBlocks.adoptedPlans[plan.id]
                ? {
                    ...state.coachBlocks.adoptedPlans,
                    [plan.id]: {
                      ...state.coachBlocks.adoptedPlans[plan.id],
                      schemes: result.schemes,
                    },
                  }
                : state.coachBlocks.adoptedPlans,
            plateauProposals: state.coachBlocks.plateauProposals.map((p) =>
              p.id === proposalId ? { ...p, status: 'applied' as const } : p
            ),
          },
        });
      },

      dismissPlateauProposal: (proposalId) => {
        set((state) => ({
          coachBlocks: {
            ...state.coachBlocks,
            plateauProposals: state.coachBlocks.plateauProposals.map((p) =>
              p.id === proposalId ? { ...p, status: 'dismissed' as const } : p
            ),
          },
        }));
      },

      // ── Weekly reviews (PR-C) ────────────────────────────────────────────
      refreshWeeklyReview: () => {
        const state = get();
        const todayStr = getLocalTodayStr();
        const monday = lastCompletedWeekMonday(todayStr);
        if (state.weeklyReviews.some((r) => r.weekMonday === monday)) return;
        try {
          const review = buildWeeklyReview({
            anyDateInWeek: monday,
            workouts: state.workouts,
            plannedWorkouts: state.plannedWorkouts,
            weeklySchedule: state.weeklySchedule,
            athleteModel: state.athleteModel,
            coachBlocks: state.coachBlocks,
            prs: state.prs,
            dailyCheckins: state.dailyCheckins ?? {},
            policyRecords: Object.values(state.policyDecisionRecords ?? {}),
            stalls: detectStalls(state.workouts),
            unit: state.profile?.unit ?? 'kg',
            bodyweightKg: state.profile?.bodyweightKg,
            todayStr,
          });
          set({ weeklyReviews: [...state.weeklyReviews, review].slice(-12) });
        } catch {
          /* reviews are best-effort, never block the app */
        }
      },

      markWeeklyReviewSeen: (weekMonday) => {
        set((state) => ({
          weeklyReviews: state.weeklyReviews.map((r) =>
            r.weekMonday === weekMonday ? { ...r, seen: true } : r
          ),
        }));
      },

      applyScheduleRevision: (weekMonday) => {
        const state = get();
        const review = state.weeklyReviews.find((r) => r.weekMonday === weekMonday);
        const revision = review?.revisions.find(
          (r) => r.kind === 'schedule_move' && !r.applied
        );
        if (!review || !revision || revision.kind !== 'schedule_move') return;
        const plan = state.plannedWorkouts.find((p) => p.id === revision.planId);
        if (!plan) return;
        // The proposal was made when toDay was free. If the athlete has
        // since scheduled something else there, the proposal is stale —
        // never overwrite a newer decision silently.
        const currentTarget = state.weeklySchedule[revision.toDay]?.workoutPlanId;
        if (currentTarget && currentTarget !== 'rest' && currentTarget !== revision.planId) {
          return;
        }
        const nextSchedule: WeeklySchedule = { ...state.weeklySchedule };
        nextSchedule[revision.fromDay] = { workoutPlanId: 'rest' };
        nextSchedule[revision.toDay] = {
          workoutPlanId: revision.planId,
          bodyParts: getWorkoutBodyParts(plan.exercises),
        };
        set({
          weeklySchedule: nextSchedule,
          weeklyReviews: state.weeklyReviews.map((r) =>
            r.weekMonday === weekMonday
              ? {
                  ...r,
                  revisions: r.revisions.map((rev) =>
                    rev.kind === 'schedule_move' ? { ...rev, applied: true } : rev
                  ),
                }
              : r
          ),
        });
      },

      completeActiveBlock: () => {
        set((state) => {
          const active = state.coachBlocks.activeBlock;
          if (!active) return state;
          return {
            coachBlocks: {
              ...state.coachBlocks,
              activeBlock: null,
              pastBlocks: [
                { ...active, status: 'completed' as const },
                ...state.coachBlocks.pastBlocks,
              ].slice(0, 8),
            },
          };
        });
      },

      // Policy v0 Decisions Ledger Handlers
      acceptPolicyDecision: (id: string) => {
        set((state) => {
          const existing =
            state.policyDecisionRecords[id] ||
            state.policyDecisionsLedgerHistory.find((d) => d.id === id);

          // Transition guard: decision must exist and be in 'pending' status
          if (!existing || existing.status !== 'pending') {
            return state;
          }

          const updated: TrainingDecisionRecord = {
            ...existing,
            status: 'accepted',
            acceptedAt: new Date().toISOString(),
          };

          const nextRecords = {
            ...state.policyDecisionRecords,
            [updated.id]: updated,
          };

          const nextHistory = state.policyDecisionsLedgerHistory.map((d) =>
            d.id === updated.id ? updated : d
          );
          if (!state.policyDecisionsLedgerHistory.some((d) => d.id === updated.id)) {
            nextHistory.unshift(updated);
          }

          return {
            policyDecisionRecords: nextRecords,
            policyDecisionsLedgerHistory: nextHistory.slice(0, 50),
          };
        });
      },

      overridePolicyDecision: (
        id: string,
        override?: { customWeight?: number; customReps?: number; reason?: string }
      ) => {
        set((state) => {
          const existing =
            state.policyDecisionRecords[id] ||
            state.policyDecisionsLedgerHistory.find((d) => d.id === id);

          // Transition guard: decision must exist and be in 'pending' status
          if (!existing || existing.status !== 'pending') {
            return state;
          }

          const updated: TrainingDecisionRecord = {
            ...existing,
            status: 'overridden',
            userOverride: {
              customWeight: override?.customWeight,
              customReps: override?.customReps,
              overrideReason: override?.reason,
              overriddenAt: new Date().toISOString(),
            },
          };

          const nextRecords = {
            ...state.policyDecisionRecords,
            [updated.id]: updated,
          };

          const nextHistory = state.policyDecisionsLedgerHistory.map((d) =>
            d.id === updated.id ? updated : d
          );
          if (!state.policyDecisionsLedgerHistory.some((d) => d.id === updated.id)) {
            nextHistory.unshift(updated);
          }

          return {
            policyDecisionRecords: nextRecords,
            policyDecisionsLedgerHistory: nextHistory.slice(0, 50),
          };
        });
      },

      dismissPolicyDecision: (id: string) => {
        set((state) => {
          const existing =
            state.policyDecisionRecords[id] ||
            state.policyDecisionsLedgerHistory.find((d) => d.id === id);

          // Transition guard: decision must exist and be in 'pending' status
          if (!existing || existing.status !== 'pending') {
            return state;
          }

          const updated: TrainingDecisionRecord = {
            ...existing,
            status: 'dismissed',
            dismissedAt: new Date().toISOString(),
          };

          const nextRecords = {
            ...state.policyDecisionRecords,
            [updated.id]: updated,
          };

          const nextHistory = state.policyDecisionsLedgerHistory.map((d) =>
            d.id === updated.id ? updated : d
          );
          if (!state.policyDecisionsLedgerHistory.some((d) => d.id === updated.id)) {
            nextHistory.unshift(updated);
          }

          return {
            policyDecisionRecords: nextRecords,
            policyDecisionsLedgerHistory: nextHistory.slice(0, 50),
          };
        });
      },

      clearPolicyDecisions: () => {
        set({
          policyDecisionRecords: {},
          policyDecisionsLedgerHistory: [],
          policyDecisionApplications: [],
        });
      },

      applyPolicyDecisionToFuturePrescription: (
        options: ApplyPolicyDecisionOptions
      ): ApplyPolicyDecisionResult => {
        const state = get();
        const { decisionId, targetPlanId, targetExerciseIndex, targetExerciseId } = options;

        const decision =
          state.policyDecisionRecords[decisionId] ||
          state.policyDecisionsLedgerHistory.find((d) => d.id === decisionId);

        if (!decision) {
          return {
            success: false,
            error: 'decision_not_found',
            message: `Decision record '${decisionId}' was not found.`,
          };
        }

        const plan = state.plannedWorkouts.find((p) => p.id === targetPlanId);
        if (!plan) {
          return {
            success: false,
            error: 'plan_not_found',
            message: `Target workout plan '${targetPlanId}' was not found.`,
          };
        }

        const validation = validatePolicyDecisionApplication(
          decision,
          plan,
          targetExerciseIndex,
          targetExerciseId,
          state.policyDecisionApplications
        );

        if (!validation.valid) {
          return {
            success: false,
            error: validation.error,
            message: validation.message,
          };
        }

        const resolvedIndex = validation.targetExerciseIndex!;
        const targetExercise = plan.exercises[resolvedIndex];

        // If targets are already applied, handle idempotently without mutating or creating duplicate audits
        if (validation.alreadyApplied) {
          const existingAudit = state.policyDecisionApplications?.find(
            (a) =>
              a.decisionId === decision.id &&
              a.targetPlanId === plan.id &&
              (targetExercise.id ? a.targetExerciseId === targetExercise.id : a.targetExerciseIndex === resolvedIndex)
          );
          return {
            success: true,
            alreadyApplied: true,
            message: validation.message,
            auditRecord: existingAudit,
            targetPlan: plan,
          };
        }

        const timestamp = new Date().toISOString();
        const auditId = `audit_app_${decision.id}_${plan.id}_${Date.now()}`;

        const previousPrescription = {
          weight: targetExercise.targetWeight,
          reps: targetExercise.targetReps,
          sets: targetExercise.targetSets,
          unit: targetExercise.targetUnit,
          targetRpe: targetExercise.targetRpe,
        };

        const appliedPrescription = {
          weight: decision.proposedPrescription.weight,
          reps: decision.proposedPrescription.reps,
          sets: decision.proposedPrescription.sets ?? targetExercise.targetSets,
          unit: decision.proposedPrescription.unit,
          targetRpe: decision.proposedPrescription.targetRpe ?? targetExercise.targetRpe,
        };

        const auditRecord: PolicyDecisionApplicationAudit = {
          id: auditId,
          decisionId: decision.id,
          policyVersion: '0.1.0',
          targetPlanId: plan.id,
          targetPlanName: plan.name,
          targetExerciseId: targetExercise.id,
          targetExerciseName: targetExercise.name,
          targetExerciseIndex: resolvedIndex,
          previousPrescription,
          appliedPrescription,
          appliedAt: timestamp,
          actionSource: 'athlete_confirmed',
          status: 'applied',
        };

        // Construct updated plan narrowly: preserve order, other exercises, sets, notes, metadata
        const updatedExercises = plan.exercises.map((ex, idx) => {
          if (idx !== resolvedIndex) return ex;
          return {
            ...ex,
            targetWeight: decision.proposedPrescription.weight,
            targetReps: decision.proposedPrescription.reps,
            targetUnit: decision.proposedPrescription.unit,
            targetRpe: decision.proposedPrescription.targetRpe ?? ex.targetRpe,
            targetSets: decision.proposedPrescription.sets ?? ex.targetSets,
          };
        });

        const updatedPlan: PlannedWorkout = {
          ...plan,
          exercises: updatedExercises,
        };

        const updatedPlannedWorkouts = state.plannedWorkouts.map((p) =>
          p.id === plan.id ? updatedPlan : p
        );

        // Update decision record with application metadata
        const updatedDecision: TrainingDecisionRecord = {
          ...decision,
          appliedAt: timestamp,
          appliedTargetPlanId: plan.id,
          appliedTargetPlanName: plan.name,
          appliedTargetExerciseName: targetExercise.name,
          appliedTargetExerciseId: targetExercise.id,
          appliedTargetExerciseIndex: resolvedIndex,
        };

        const nextRecords = {
          ...state.policyDecisionRecords,
          [updatedDecision.id]: updatedDecision,
        };

        const nextHistory = state.policyDecisionsLedgerHistory.map((d) =>
          d.id === updatedDecision.id ? updatedDecision : d
        );
        if (!state.policyDecisionsLedgerHistory.some((d) => d.id === updatedDecision.id)) {
          nextHistory.unshift(updatedDecision);
        }

        const nextApplications = [auditRecord, ...(state.policyDecisionApplications || [])].slice(0, 100);

        set({
          plannedWorkouts: updatedPlannedWorkouts,
          policyDecisionRecords: nextRecords,
          policyDecisionsLedgerHistory: nextHistory.slice(0, 50),
          policyDecisionApplications: nextApplications,
        });

        return {
          success: true,
          message: `Successfully applied recommendation for ${targetExercise.name} to '${plan.name}': ${decision.proposedPrescription.weight} ${decision.proposedPrescription.unit} × ${decision.proposedPrescription.reps} reps.`,
          auditRecord,
          targetPlan: updatedPlan,
        };
      },

      clearAllData: () => {
        set({
          profile: null,
          prs: [],
          workouts: [],
          meals: [],
          bodyMetrics: [],
          progressPhotos: [],
          prTargets: {},
          macroGoals: null,
          plannedWorkouts: [],
          deletedPlanIds: [],
          deletedPrIds: [],
          deletedWorkoutIds: [],
          deletedMealIds: [],
          deletedBodyMetricIds: [],
          uiPreferences: { ...DEFAULT_UI_PREFERENCES },
          lastActiveTab: 'home',
          lastProgressSubTab: 'overview',
          lastTrainSubTab: 'plans',
          favoriteFoods: DEFAULT_FAVORITE_FOODS,
          customFoods: [],
          mealDayKinds: {},
          hasCompletedOnboarding: false,
          waterLogs: {},
          waterBatches: {},
          hydrationConfig: DEFAULT_HYDRATION_CONFIG,
          creatineLogs: {},
          creatineConfig: DEFAULT_CREATINE_CONFIG,
          creatineSupply: DEFAULT_CREATINE_SUPPLY,
          dayTypeOverrides: {},
          aiInsightsCache: {},
          trainingProfile: DEFAULT_AI_TRAINING_PROFILE,
          todaysAIWorkoutPlan: undefined,
          latestWeeklyReview: undefined,
          trainingDecisions: {},
          decisionsLedgerHistory: [],
          lifterProfile: null,
          athleteModel: null,
          coachBlocks: getInitialCoachBlocksState(),
          weeklyReviews: [],
          xp: getInitialXpState(),
          streak: getInitialStreakXState(),
          challenges: getInitialChallengesXState(),
          friendChallenges: getInitialFriendChallengesState(),
          runProgram: null,
          coach: getInitialCoachState(),
          healthSummary: null,
          healthConnectLastSyncedAt: null,
          policyDecisionRecords: {},
          policyDecisionsLedgerHistory: [],
          policyDecisionApplications: [],
        });
        // Truly purge everything the app stored (see purgeLocalAppData).
        purgeLocalAppData();
      },

      logout: (options) => {
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('ascend_logged_out', 'true');
            localStorage.removeItem('ascend_emergency_snapshot');
            localStorage.removeItem('ascend_profile');
          } catch {}
        }

        if (options?.clearLocalData) {
          set({
            profile: null,
            prs: [],
            workouts: [],
            meals: [],
            bodyMetrics: [],
            prTargets: {},
            macroGoals: null,
            plannedWorkouts: [],
            favoriteFoods: DEFAULT_FAVORITE_FOODS,
            customFoods: [],
            mealDayKinds: {},
            hasCompletedOnboarding: false,
            waterLogs: {},
            waterBatches: {},
            hydrationConfig: DEFAULT_HYDRATION_CONFIG,
            creatineLogs: {},
            creatineConfig: DEFAULT_CREATINE_CONFIG,
            creatineSupply: DEFAULT_CREATINE_SUPPLY,
            dayTypeOverrides: {},
            aiInsightsCache: {},
            trainingProfile: DEFAULT_AI_TRAINING_PROFILE,
            todaysAIWorkoutPlan: undefined,
            latestWeeklyReview: undefined,
            trainingDecisions: {},
            decisionsLedgerHistory: [],
            lifterProfile: null,
            athleteModel: null,
            coachBlocks: getInitialCoachBlocksState(),
            weeklyReviews: [],
            policyDecisionRecords: {},
            policyDecisionsLedgerHistory: [],
            policyDecisionApplications: [],
          });
          if (typeof window !== 'undefined') {
            try {
              localStorage.removeItem('ascend_store');
            } catch {}
          }
          return;
        }

        set({
          profile: null,
          hasCompletedOnboarding: false,
          activeWorkoutDraft: null,
          todaysAIWorkoutPlan: undefined,
          latestWeeklyReview: undefined,
          lifterProfile: null,
          athleteModel: null,
        });
      },

      importAllData: (data) => {
        try {
          if (!data || typeof data !== 'object') return false;
          // Shape gate (QA4-013): a payload with none of the backup's
          // recognized fields is not a backup — reject it instead of
          // reporting success while applying nothing ({"hello":1} used
          // to "restore" successfully). Partial imports carrying at
          // least one recognized field still apply.
          if (!isRecognizedBackupData(data)) return false;
          if (typeof window !== 'undefined') {
            try {
              localStorage.removeItem('ascend_logged_out');
            } catch {}
          }

          // Validate profile data before merging into store — only allow
          // well-formed fields with correct types to prevent injection of
          // arbitrary or malformed data from backup imports.
          set((state) => {
            // Tombstone restore (QA4-001): backups carry the deletion
            // lists. Restoring an entity list revives those entities, so
            // their tombstones are dropped; tombstones for entities not
            // in the backup are kept so their deletions still propagate.
            const restoredTombstones = (
              current: string[] | undefined,
              fromBackup: unknown,
              restoredList: unknown,
            ): string[] => {
              const base = Array.isArray(fromBackup)
                ? fromBackup.filter((d): d is string => typeof d === 'string')
                : (current || []);
              if (!Array.isArray(restoredList)) return base;
              const revived = new Set(
                restoredList.map((e: any) => e?.id).filter((id: any) => typeof id === 'string'),
              );
              return base.filter((d) => !revived.has(d));
            };
            const validatedProfile =
              data.profile && typeof data.profile === 'object'
                ? {
                    id: typeof data.profile.id === 'string' && data.profile.id.trim()
                      ? data.profile.id.trim()
                      : undefined,
                    name: typeof data.profile.name === 'string' ? data.profile.name.trim().slice(0, 100) : undefined,
                    gender:
                      data.profile.gender === 'male' ||
                      data.profile.gender === 'female' ||
                      data.profile.gender === 'other'
                        ? data.profile.gender
                        : undefined,
                    bodyweightKg:
                      typeof data.profile.bodyweightKg === 'number' &&
                      !isNaN(data.profile.bodyweightKg) &&
                      data.profile.bodyweightKg > 0 &&
                      data.profile.bodyweightKg < 500
                        ? data.profile.bodyweightKg
                        : undefined,
                    bodyweightLbs:
                      typeof data.profile.bodyweightLbs === 'number' &&
                      !isNaN(data.profile.bodyweightLbs) &&
                      data.profile.bodyweightLbs > 0 &&
                      data.profile.bodyweightLbs < 1100
                        ? data.profile.bodyweightLbs
                        : undefined,
                    heightCm:
                      typeof data.profile.heightCm === 'number' &&
                      !isNaN(data.profile.heightCm) &&
                      data.profile.heightCm > 0 &&
                      data.profile.heightCm < 300
                        ? data.profile.heightCm
                        : undefined,
                    age:
                      typeof data.profile.age === 'number' &&
                      !isNaN(data.profile.age) &&
                      data.profile.age >= 10 &&
                      data.profile.age <= 120
                        ? data.profile.age
                        : undefined,
                    unit: data.profile.unit === 'kg' || data.profile.unit === 'lbs' ? data.profile.unit : undefined,
                    // QA4A-009: dietPreference was missing from the
                    // validated profile — a backup restore silently lost
                    // it. Validate against the DietPreference literals,
                    // same style as gender/unit above.
                    dietPreference:
                      data.profile.dietPreference === 'vegetarian' ||
                      data.profile.dietPreference === 'eggitarian' ||
                      data.profile.dietPreference === 'non_vegetarian' ||
                      data.profile.dietPreference === 'vegan'
                        ? data.profile.dietPreference
                        : undefined,
                    goals: Array.isArray(data.profile.goals)
                      ? data.profile.goals.filter(
                          (g: any) =>
                            g === 'build_muscle' ||
                            g === 'get_stronger' ||
                            g === 'lose_fat' ||
                            g === 'stamina' ||
                            g === 'general_fitness'
                        )
                      : undefined,
                    createdAt:
                      typeof data.profile.createdAt === 'string' && !isNaN(Date.parse(data.profile.createdAt))
                        ? data.profile.createdAt
                        : new Date().toISOString(),
                    // A restore is the user's newest intent — stamp it so
                    // sync's last-write-wins doesn't undo it (QA4A-001).
                    updatedAt: new Date().toISOString(),
                  }
                : state.profile;
            return {
              profile: validatedProfile || state.profile,
            prs: Array.isArray(data.prs) ? data.prs : state.prs,
            workouts: Array.isArray(data.workouts)
              ? data.workouts.map((w: any) => ({
                  ...w,
                  exercises: Array.isArray(w.exercises)
                    ? w.exercises.map((ex: any) => ({
                        ...ex,
                        sets: Array.isArray(ex.sets)
                          ? ex.sets.map((s: any) => {
                              let cleanWeight: number | undefined = undefined;
                              if (typeof s?.weight === 'number' && !isNaN(s.weight)) {
                                cleanWeight = s.weight;
                              } else if (typeof s?.weight === 'string' && s.weight.trim() !== '') {
                                const p = parseFloat(s.weight);
                                if (!isNaN(p)) cleanWeight = p;
                              }
                              return {
                                ...s,
                                weight: cleanWeight,
                              };
                            })
                          : [],
                      }))
                    : [],
                }))
              : state.workouts,
            meals: Array.isArray(data.meals) ? data.meals : state.meals,
            bodyMetrics: Array.isArray(data.bodyMetrics) ? data.bodyMetrics : state.bodyMetrics,
            prTargets: data.prTargets || state.prTargets,
            macroGoals: data.macroGoals !== undefined ? data.macroGoals : state.macroGoals,
            theme: data.theme || state.theme,
            hasCustomTheme: data.hasCustomTheme !== undefined ? data.hasCustomTheme : state.hasCustomTheme,
            hasCompletedOnboarding:
              data.hasCompletedOnboarding !== undefined
                ? data.hasCompletedOnboarding
                : (data.profile ? true : state.hasCompletedOnboarding),
            plannedWorkouts: Array.isArray(data.plannedWorkouts) ? data.plannedWorkouts : state.plannedWorkouts,
            deletedPlanIds: restoredTombstones(state.deletedPlanIds, data.deletedPlanIds, data.plannedWorkouts),
            deletedPrIds: restoredTombstones(state.deletedPrIds, data.deletedPrIds, data.prs),
            deletedWorkoutIds: restoredTombstones(state.deletedWorkoutIds, data.deletedWorkoutIds, data.workouts),
            deletedMealIds: restoredTombstones(state.deletedMealIds, data.deletedMealIds, data.meals),
            deletedBodyMetricIds: restoredTombstones(state.deletedBodyMetricIds, data.deletedBodyMetricIds, data.bodyMetrics),
            favoriteFoods: Array.isArray(data.favoriteFoods) ? data.favoriteFoods : state.favoriteFoods,
            customFoods: (() => {
              if (!Array.isArray(data.customFoods)) return state.customFoods;
              const num = (v: any) => (typeof v === 'number' && !isNaN(v) && v >= 0 ? v : 0);
              return data.customFoods
                .filter(
                  (f: any) =>
                    f &&
                    typeof f === 'object' &&
                    typeof f.id === 'string' &&
                    typeof f.name === 'string' &&
                    f.name.trim().length > 0
                )
                .slice(0, 300)
                .map((f: any) => ({
                  id: f.id,
                  name: f.name.trim().slice(0, 120),
                  calories: num(f.calories),
                  proteinG: num(f.proteinG),
                  carbsG: num(f.carbsG),
                  fatG: num(f.fatG),
                  defaultQuantity:
                    typeof f.defaultQuantity === 'number' && f.defaultQuantity > 0
                      ? f.defaultQuantity
                      : undefined,
                  unit: typeof f.unit === 'string' ? f.unit.slice(0, 20) : 'g',
                  baseFoodKey: typeof f.baseFoodKey === 'string' ? f.baseFoodKey : undefined,
                  oilLevel:
                    f.oilLevel === 'none' || f.oilLevel === 'tsp' || f.oilLevel === 'tbsp' || f.oilLevel === 'tbsp2'
                      ? f.oilLevel
                      : undefined,
                  createdAt: typeof f.createdAt === 'string' ? f.createdAt : new Date().toISOString(),
                }));
            })(),
            mealDayKinds: (() => {
              if (!data.mealDayKinds || typeof data.mealDayKinds !== 'object') {
                return state.mealDayKinds;
              }
              const restored: Record<string, MealDayKind> = {};
              for (const [date, kind] of Object.entries(data.mealDayKinds)) {
                if (
                  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
                  (kind === 'no_grain_fast' || kind === 'one_meal_fast' || kind === 'festival_feast')
                ) {
                  restored[date] = kind as MealDayKind;
                }
              }
              return restored;
            })(),
            waterLogs: data.waterLogs && typeof data.waterLogs === 'object' ? data.waterLogs : state.waterLogs,
            waterBatches: data.waterBatches && typeof data.waterBatches === 'object' ? data.waterBatches : state.waterBatches,
            hydrationConfig: data.hydrationConfig || state.hydrationConfig,
            creatineLogs: data.creatineLogs && typeof data.creatineLogs === 'object' ? data.creatineLogs : state.creatineLogs,
            creatineConfig: data.creatineConfig || state.creatineConfig,
            creatineSupply: data.creatineSupply || state.creatineSupply,
            dayTypeOverrides: data.dayTypeOverrides && typeof data.dayTypeOverrides === 'object' ? data.dayTypeOverrides : state.dayTypeOverrides,
            gymLogs: data.gymLogs && typeof data.gymLogs === 'object' ? data.gymLogs : state.gymLogs,
            aiInsightsCache: data.aiInsightsCache && typeof data.aiInsightsCache === 'object' ? data.aiInsightsCache : state.aiInsightsCache,
            trainingProfile: data.trainingProfile || state.trainingProfile,
            todaysAIWorkoutPlan: data.todaysAIWorkoutPlan || state.todaysAIWorkoutPlan,
            latestWeeklyReview: data.latestWeeklyReview || state.latestWeeklyReview,
            trainingDecisions: data.trainingDecisions || state.trainingDecisions,
            decisionsLedgerHistory: Array.isArray(data.decisionsLedgerHistory) ? data.decisionsLedgerHistory : state.decisionsLedgerHistory,
            lifterProfile: data.lifterProfile || state.lifterProfile,
            // Athlete model is derived: set null here and recompute AFTER
            // this set lands (below), from the sanitized/merged state the
            // store actually keeps — never from the raw payload.
            athleteModel: null,
            // Coach blocks are user-decision state: restore from backup
            // when present and well-formed, else keep current.
            coachBlocks:
              data.coachBlocks &&
              typeof data.coachBlocks === 'object' &&
              !Array.isArray(data.coachBlocks)
                ? {
                    ...getInitialCoachBlocksState(),
                    ...(data.coachBlocks as Partial<CoachBlocksState>),
                  }
                : state.coachBlocks,
            weeklyReviews: Array.isArray(data.weeklyReviews)
              ? (data.weeklyReviews as WeeklyReview[])
              : state.weeklyReviews,
            policyDecisionRecords:
              data.policyDecisionRecords && typeof data.policyDecisionRecords === 'object'
                ? data.policyDecisionRecords
                : state.policyDecisionRecords,
            policyDecisionsLedgerHistory: Array.isArray(data.policyDecisionsLedgerHistory)
              ? data.policyDecisionsLedgerHistory
              : state.policyDecisionsLedgerHistory,
            policyDecisionApplications: Array.isArray(data.policyDecisionApplications)
              ? data.policyDecisionApplications.filter((a: any) => {
                  if (
                    !a ||
                    typeof a !== 'object' ||
                    typeof a.id !== 'string' ||
                    a.id.trim().length === 0 ||
                    typeof a.decisionId !== 'string' ||
                    a.decisionId.trim().length === 0 ||
                    typeof a.targetPlanId !== 'string' ||
                    a.targetPlanId.trim().length === 0 ||
                    typeof a.targetExerciseName !== 'string' ||
                    a.targetExerciseName.trim().length === 0 ||
                    typeof a.targetExerciseIndex !== 'number' ||
                    a.targetExerciseIndex < 0 ||
                    a.status !== 'applied' ||
                    typeof a.appliedAt !== 'string' ||
                    isNaN(Date.parse(a.appliedAt)) ||
                    !a.appliedPrescription ||
                    typeof a.appliedPrescription !== 'object' ||
                    !Number.isFinite(a.appliedPrescription.weight) ||
                    a.appliedPrescription.weight < 0 ||
                    !Number.isFinite(a.appliedPrescription.reps) ||
                    a.appliedPrescription.reps <= 0
                  ) {
                    return false;
                  }

                  // Cross-validation: Check for mismatched decision exercise
                  const matchedDecision =
                    (data.policyDecisionRecords && data.policyDecisionRecords[a.decisionId]) ||
                    (Array.isArray(data.policyDecisionsLedgerHistory) &&
                      data.policyDecisionsLedgerHistory.find((d: any) => d && d.id === a.decisionId));

                  if (
                    matchedDecision &&
                    matchedDecision.exerciseName &&
                    matchedDecision.exerciseName.trim().toLowerCase() !==
                      a.targetExerciseName.trim().toLowerCase()
                  ) {
                    return false;
                  }

                  // Cross-validation: Check for mismatched plan exercise
                  const matchedPlan =
                    Array.isArray(data.plannedWorkouts) &&
                    data.plannedWorkouts.find((p: any) => p && p.id === a.targetPlanId);

                  if (matchedPlan && Array.isArray(matchedPlan.exercises)) {
                    const exAtIndex = matchedPlan.exercises[a.targetExerciseIndex];
                    if (
                      exAtIndex &&
                      exAtIndex.name &&
                      exAtIndex.name.trim().toLowerCase() !==
                        a.targetExerciseName.trim().toLowerCase()
                    ) {
                      return false;
                    }
                  }

                  return true;
                })
              : state.policyDecisionApplications,
            goals: Array.isArray(data.goals) ? data.goals : (data.profile?.goals || state.goals),
            userMode: data.userMode || state.userMode,
            weeklySchedule: data.weeklySchedule && typeof data.weeklySchedule === 'object' ? data.weeklySchedule : state.weeklySchedule,
            // Backups from the unified exporter carry these; older backups
            // silently defaulted them, losing the user's schedule prefs,
            // customization toggles and progress photos on restore.
            uiPreferences:
              data.uiPreferences && typeof data.uiPreferences === 'object'
                ? { ...state.uiPreferences, ...data.uiPreferences }
                : state.uiPreferences,
            customExerciseMuscles: (() => {
              if (!data.customExerciseMuscles || typeof data.customExerciseMuscles !== 'object') {
                return state.customExerciseMuscles;
              }
              const restored: Record<string, LibraryMuscleGroup> = {};
              for (const [name, muscle] of Object.entries(data.customExerciseMuscles)) {
                if (
                  typeof name === 'string' &&
                  ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Conditioning'].includes(
                    muscle as string
                  )
                ) {
                  restored[name.toLowerCase()] = muscle as LibraryMuscleGroup;
                }
              }
              registerCustomExerciseMuscles(restored);
              return { ...state.customExerciseMuscles, ...restored };
            })(),
            dailyCheckins:
              data.dailyCheckins && typeof data.dailyCheckins === 'object'
                ? { ...state.dailyCheckins, ...data.dailyCheckins }
                : state.dailyCheckins,
            friendChallenges:
              data.friendChallenges !== undefined
                ? sanitizeFriendChallengesState(data.friendChallenges)
                : state.friendChallenges,
            runProgram:
              data.runProgram !== undefined
                ? sanitizeRunProgramState(data.runProgram)
                : state.runProgram,
            // Gamification + notification slices (QA4-005): backups have
            // always EXPORTED these, but restore silently dropped them —
            // XP, streak freezes, challenge progress and notification
            // prefs reverted to defaults under a success toast.
            xp: (() => {
              if (!data.xp || typeof data.xp !== 'object') return state.xp;
              const totalXp =
                typeof data.xp.totalXp === 'number' && Number.isFinite(data.xp.totalXp) && data.xp.totalXp >= 0
                  ? data.xp.totalXp
                  : state.xp.totalXp;
              const awardedIds = Array.isArray(data.xp.awardedIds)
                ? data.xp.awardedIds.filter((id: any) => typeof id === 'string').slice(0, 10000)
                : state.xp.awardedIds;
              return { totalXp, awardedIds };
            })(),
            streak: (() => {
              if (!data.streak || typeof data.streak !== 'object') return state.streak;
              const num = (v: any, fallback: number) =>
                typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
              return {
                freezesAvailable: num(data.streak.freezesAvailable, state.streak.freezesAvailable),
                freezesUsedThisWeek: num(data.streak.freezesUsedThisWeek, state.streak.freezesUsedThisWeek),
                weekStart:
                  typeof data.streak.weekStart === 'string' && data.streak.weekStart
                    ? data.streak.weekStart
                    : state.streak.weekStart,
                longestStreak: num(data.streak.longestStreak, state.streak.longestStreak),
              };
            })(),
            challenges: (() => {
              if (!data.challenges || typeof data.challenges !== 'object' || !data.challenges.instances || typeof data.challenges.instances !== 'object') {
                return state.challenges;
              }
              const instances: ChallengesXState['instances'] = {};
              for (const [key, inst] of Object.entries(data.challenges.instances)) {
                if (inst && typeof inst === 'object') {
                  const i = inst as Record<string, unknown>;
                  instances[key] = {
                    optedIn: i.optedIn === true,
                    dismissed: i.dismissed === true,
                    rewardGranted: i.rewardGranted === true,
                  };
                }
              }
              return { instances };
            })(),
            notificationPreferences:
              data.notificationPreferences && typeof data.notificationPreferences === 'object'
                ? { ...state.notificationPreferences, ...data.notificationPreferences }
                : state.notificationPreferences,
            userPortionPreferences: (() => {
              if (!data.userPortionPreferences || typeof data.userPortionPreferences !== 'object') {
                return state.userPortionPreferences;
              }
              const restored: Record<string, number> = {};
              for (const [name, grams] of Object.entries(data.userPortionPreferences)) {
                if (typeof grams === 'number' && Number.isFinite(grams) && grams > 0) {
                  restored[name] = grams;
                }
              }
              return restored;
            })(),
            progressPhotos: (() => {
              if (!Array.isArray(data.progressPhotos)) return state.progressPhotos;
              const valid = data.progressPhotos
                .filter(
                  (p: any) =>
                    p &&
                    typeof p === 'object' &&
                    typeof p.id === 'string' &&
                    typeof p.dataUrl === 'string' &&
                    p.dataUrl.startsWith('data:image/')
                )
                .slice(0, MAX_PROGRESS_PHOTOS);
              persistProgressPhotos(valid);
              return valid;
            })(),
          }});
          // Recompute the derived athlete model from the restored state
          // (sanitized workouts, merged check-ins, stored readiness).
          get().refreshAthleteModel();
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'ascend_store',
      storage: createJSONStorage(() => mainStoreStorage),

      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);

          // QA4-011: app start is a streak lifecycle point — run the
          // persisted refresh (weekly freeze refill + silent freeze
          // consumption for a bridged miss) once per launch. Before
          // this wiring, refreshStreak had zero callers and the
          // 1-freeze-per-week cap was never enforced in persisted state.
          try {
            state.refreshStreak();
          } catch {
            // Streak maintenance must never block hydration.
          }

          // Custom-exercise muscle registry: hydrate the classifier's
          // override map from persisted choices.
          registerCustomExerciseMuscles(state.customExerciseMuscles);

          // Avatar recovery: if a profile rebuild (or a blob written by an
          // older build) dropped the local-only avatar, restore it from
          // the dedicated mirror key.
          if (state.profile && !state.profile.avatar) {
            const mirrored = loadAvatarMirror();
            if (mirrored) {
              state.profile = { ...state.profile, avatar: mirrored };
            }
          }

          // Progress photos: already initialized from disk at store creation
          // (see above). The persisted state excludes them via partialize,
          // so rehydration never overwrites them — nothing to do here.
          // (Legacy: very old blobs might contain photos; the disk key is
          // the source of truth and already loaded.)

          if (state.activeWorkoutDraft) {
            const sanitizedExercises = (state.activeWorkoutDraft.exercises || []).map((ex) => ({
              ...ex,
              sets: (ex.sets || []).map((s) => {
                let cleanWeight: number | undefined = undefined;
                if (typeof s.weight === 'number' && !isNaN(s.weight)) {
                  cleanWeight = s.weight;
                } else if (typeof s.weight === 'string' && (s.weight as string).trim() !== '') {
                  const p = parseFloat(s.weight as string);
                  if (!isNaN(p)) cleanWeight = p;
                }
                return {
                  ...s,
                  weight: cleanWeight,
                };
              }),
            }));
            state.activeWorkoutDraft = {
              ...state.activeWorkoutDraft,
              exercises: sanitizedExercises,
            };
          }

          // Disaster Recovery: If profile is missing or PRs/workouts are empty, check fallbacks
          if (typeof window !== 'undefined') {
            queueMicrotask(() => {
              try {
                if (localStorage.getItem('ascend_logged_out') === 'true') {
                  // Athlete explicitly logged out. Do not resurrect old profile session.
                  return;
                }

                // 1. Check emergency snapshot
                const rawSnap = localStorage.getItem('ascend_emergency_snapshot');
                if (rawSnap) {
                  const snap = JSON.parse(rawSnap);
                  const snapState = snap.state || snap;
                  if (
                    snapState?.profile?.name ||
                    (Array.isArray(snapState?.workouts) && snapState.workouts.length > 0) ||
                    (Array.isArray(snapState?.prs) && snapState.prs.length > 0)
                  ) {
                    if (!state.profile || (!state.workouts?.length && snapState.workouts?.length)) {
                      state.importAllData(snapState);
                    }
                  }
                }

                // 2. Check discrete legacy keys if profile is still missing
                const currentProfile = useAppStore.getState().profile;
                if (!currentProfile) {
                  const rawProfile = localStorage.getItem('ascend_profile');
                  if (rawProfile) {
                    try {
                      const parsedProfile = JSON.parse(rawProfile);
                      if (parsedProfile?.name) {
                        useAppStore.setState({ profile: parsedProfile, hasCompletedOnboarding: true });
                      }
                    } catch {
                      // Ignore malformed profile backup
                    }
                  }
                }

                const currentWorkouts = useAppStore.getState().workouts;
                if (!currentWorkouts || currentWorkouts.length === 0) {
                  const rawW = localStorage.getItem('ascend_workouts');
                  if (rawW) {
                    try {
                      const parsedW = JSON.parse(rawW);
                      if (Array.isArray(parsedW) && parsedW.length > 0) {
                        useAppStore.setState({ workouts: parsedW });
                      }
                    } catch {
                      // Ignore malformed workouts backup
                    }
                  }
                }

                const currentPRs = useAppStore.getState().prs;
                if (!currentPRs || currentPRs.length === 0) {
                  const rawPRs = localStorage.getItem('ascend_prs');
                  if (rawPRs) {
                    try {
                      const parsedPRs = JSON.parse(rawPRs);
                      if (Array.isArray(parsedPRs) && parsedPRs.length > 0) {
                        useAppStore.setState({ prs: parsedPRs });
                      }
                    } catch {
                      // Ignore malformed PRs backup
                    }
                  }
                }

                const currentMeals = useAppStore.getState().meals;
                if (!currentMeals || currentMeals.length === 0) {
                  const rawMeals = localStorage.getItem('ascend_meals');
                  if (rawMeals) {
                    try {
                      const parsedMeals = JSON.parse(rawMeals);
                      if (Array.isArray(parsedMeals) && parsedMeals.length > 0) {
                        useAppStore.setState({ meals: parsedMeals });
                      }
                    } catch {
                      // Ignore malformed meals backup
                    }
                  }
                }

                // Idempotent baseline backfill: only add when the stable
                // `initial_bw_<profileId>` entry is missing. Never fabricate
                // weight-log entries from the profile weight.
                const currentState = useAppStore.getState();
                const baselineId = 'initial_bw_' + (currentState.profile?.id || 'user');
                const hasBaseline = (currentState.bodyMetrics || []).some((m) => m.id === baselineId);
                if (currentState.profile?.bodyweightKg && !hasBaseline) {
                  const entry: BodyMetricEntry = {
                    id: baselineId,
                    date: currentState.profile.createdAt ? getLocalTodayStr(new Date(currentState.profile.createdAt)) : getLocalTodayStr(),
                    weightKg: currentState.profile.bodyweightKg,
                    heightCm: currentState.profile.heightCm,
                    notes: 'Baseline calibration',
                  };
                  useAppStore.setState({ bodyMetrics: [...(currentState.bodyMetrics || []), entry] });
                } else if (currentState.bodyMetrics && currentState.bodyMetrics.length > 0) {
                  // Deduplicate existing bodyMetrics by date
                  const seenDates = new Set<string>();
                  const deduped: BodyMetricEntry[] = [];
                  for (const m of currentState.bodyMetrics) {
                    if (!seenDates.has(m.date)) {
                      seenDates.add(m.date);
                      deduped.push(m);
                    }
                  }
                  if (deduped.length !== currentState.bodyMetrics.length) {
                    useAppStore.setState({ bodyMetrics: deduped });
                  }
                }

                // Ensure staple foods are populated if empty
                if (!currentState.favoriteFoods || currentState.favoriteFoods.length === 0) {
                  useAppStore.setState({ favoriteFoods: DEFAULT_FAVORITE_FOODS });
                }

                // Ensure policyDecisionApplications array is initialized if missing in legacy storage
                if (!Array.isArray(currentState.policyDecisionApplications)) {
                  useAppStore.setState({ policyDecisionApplications: [] });
                }

                // Initialize or refresh Lifter Twin Profile if workouts exist
                if (currentState.workouts && currentState.workouts.length > 0 && !currentState.lifterProfile) {
                  currentState.refreshLifterProfile();
                }

                // Athlete model: refresh when missing or anchored to a
                // previous day — its windows (28d pain, 8wk adherence)
                // are relative to today, so a stale todayStr is wrong data.
                if (
                  (currentState.workouts?.length || Object.keys(currentState.dailyCheckins || {}).length) &&
                  (!currentState.athleteModel || currentState.athleteModel.todayStr !== getLocalTodayStr())
                ) {
                  currentState.refreshAthleteModel();
                }
              } catch (recoveryErr) {
                console.warn('Disaster recovery check error:', recoveryErr);
              }
            });
          }

          // Auto-sync with device theme if not manually customized by athlete
          if (typeof window !== 'undefined') {
            const hasCustom = state.hasCustomTheme ?? (localStorage.getItem('ascend_has_custom_theme') === 'true');
            if (!hasCustom && typeof window.matchMedia === 'function') {
              const deviceTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
              state.setTheme(deviceTheme, false);
            } else {
              const currentTheme = state.theme || 'dark';
              if (currentTheme === 'dark') {
                document.documentElement.classList.add('dark');
                document.documentElement.classList.remove('light');
                document.documentElement.setAttribute('data-theme', 'dark');
              } else {
                document.documentElement.classList.remove('dark');
                document.documentElement.classList.add('light');
                document.documentElement.setAttribute('data-theme', 'light');
              }
            }
          }
        }
      },
      partialize: partializeAppState,
      // QA4-012: versioned migrations — legacy blobs (version 0) are
      // deep-merged over current defaults so newer default-ON fields
      // are never lost on rehydration. See migratePersistedState.
      version: PERSIST_VERSION,
      migrate: (persistedState: unknown, version: number) =>
        migratePersistedState(persistedState, version) as unknown as AppState,
    }
  )
);

export const useStore = useAppStore;

// QA4-011: day-rollover streak refresh. An app left open overnight
// (or resumed next morning) must run the persisted streak refresh when
// the local date flips — weekly freeze refill and missed-day bridging
// are date-driven. Mirrors useToday's triggers (focus / visibility /
// a slow poll) at the store level so it fires regardless of which tab
// is mounted.
if (typeof window !== 'undefined') {
  let lastStreakDate = getLocalTodayStr();
  const checkStreakRollover = () => {
    const today = getLocalTodayStr();
    if (today !== lastStreakDate) {
      lastStreakDate = today;
      try {
        useAppStore.getState().refreshStreak();
      } catch {
        // Never let streak maintenance break the app shell.
      }
    }
  };
  window.addEventListener('focus', checkStreakRollover);
  document.addEventListener('visibilitychange', checkStreakRollover);
  setInterval(checkStreakRollover, 60_000);
}

// Auto-refresh the Lifter Twin profile whenever workouts or profile unit changes.
// This ensures the profile stays consistent after cloud sync pulls remote data,
// not just on local add/delete operations.
let lastLifterProfileWorkoutCount = 0;
useAppStore.subscribe((state) => {
  const workoutCount = state.workouts?.length || 0;
  if (workoutCount !== lastLifterProfileWorkoutCount) {
    lastLifterProfileWorkoutCount = workoutCount;
    if (workoutCount > 0 && state.hasCompletedOnboarding) {
      state.refreshLifterProfile();
    }
  }
});

// Auto-refresh the athlete model when any of its inputs change — workouts
// (log/delete/import/sync pull), check-ins, schedule, plans, or readiness
// history. The signature is a content hash, not a length: editing a
// check-in value, a set's weight, or a pain flag at an unchanged count
// must still recompute — a stale pain flag is a safety bug, not a nit.
// The model itself is not part of the signature, so a refresh cannot loop.
function athleteModelSignature(state: AppState): string {
  const projection = {
    w: (state.workouts || []).map((w) => [
      w.id,
      w.date,
      w.reportsPain ? 1 : 0,
      (w.exercises || []).map((e) => [
        e?.name,
        e?.painfulExerciseName || '',
        e?.reportsPain ? 1 : 0,
        (e?.sets || []).map((s) => [s?.weight, s?.reps, s?.status || '', s?.isWarmup ? 1 : 0]),
      ]),
    ]),
    c: state.dailyCheckins || {},
    s: state.weeklySchedule || {},
    p: (state.plannedWorkouts || []).map((p) => p.id),
    r: (state.coach?.readinessHistory || []).map((e) => [e.date, e.band]),
  };
  const str = JSON.stringify(projection);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${str.length}:${(h >>> 0).toString(36)}`;
}
let lastAthleteModelSignature = '';
useAppStore.subscribe((state) => {
  const signature = athleteModelSignature(state);
  if (signature !== lastAthleteModelSignature) {
    lastAthleteModelSignature = signature;
    // No hasInputs gate: deleting the last workout/check-in must refresh
    // to the honest empty model, not leave the old one (and its pain
    // facts) on screen. Logout/clear-all set hasCompletedOnboarding
    // false, which keeps their explicit null in place.
    if (state.hasCompletedOnboarding) {
      state.refreshAthleteModel();
    }
  }
});

// Emergency redundancy mirror. This used to rewrite FIVE keys (snapshot +
// per-collection legacy mirrors) 500 ms after EVERY state change — on
// top of the zustand persist blob, a budget phone serialized the full
// history three times per keystroke. Now: ONE snapshot write, 2 s
// trailing debounce. The legacy keys are still READ by the recovery path
// (old installs) but no longer written. A failed write (quota) is no
// longer swallowed silently — it flips a health flag the UI/diagnostics
// can read instead of pretending the mirror exists.
let snapshotWriteFailed = false;
export function getSnapshotWriteFailed(): boolean {
  return snapshotWriteFailed;
}

/**
 * Combined device-storage health: true when ANY local persistence
 * writer (main persist blob or emergency snapshot mirror) has failed
 * and not yet recovered. This is the flag the Data Vault warning reads
 * — before QA4A-004 the snapshot flag existed but had no UI consumer,
 * and the main blob had no flag at all.
 */
export function getStorageWriteFailed(): boolean {
  return mainStoreWriteFailed || snapshotWriteFailed;
}

if (typeof window !== 'undefined') {
  let syncTimer: any = null;
  const unsubscribe = useAppStore.subscribe((state) => {
    // QA4-010: a follower tab must not overwrite the leader's snapshot.
    if (getTabLeaderGuard()?.shouldSuppressWrites()) return;
    if (state.profile || (state.workouts && state.workouts.length > 0) || (state.prs && state.prs.length > 0)) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        try {
          const snapshot = {
            profile: state.profile,
            prs: state.prs,
            workouts: state.workouts,
            meals: state.meals,
            bodyMetrics: state.bodyMetrics,
            macroGoals: state.macroGoals,
            plannedWorkouts: state.plannedWorkouts,
            favoriteFoods: state.favoriteFoods,
            customFoods: state.customFoods,
            mealDayKinds: state.mealDayKinds,
            policyDecisionRecords: state.policyDecisionRecords,
            policyDecisionsLedgerHistory: state.policyDecisionsLedgerHistory,
            policyDecisionApplications: state.policyDecisionApplications,
            goals: state.goals,
            userMode: state.userMode,
            theme: state.theme,
            hasCustomTheme: state.hasCustomTheme,
            hasCompletedOnboarding: state.hasCompletedOnboarding,
            savedAt: new Date().toISOString(),
          };
          localStorage.setItem('ascend_emergency_snapshot', JSON.stringify(snapshot));
          snapshotWriteFailed = false;
        } catch {
          snapshotWriteFailed = true;
          if (typeof console !== 'undefined') {
            console.warn('[ascend] Emergency snapshot write failed (storage quota?). Main store blob is unaffected.');
          }
        }
      }, 2000);
    }
  });

  // Clean up timer and unsubscribe on page unload to prevent memory leaks
  const cleanup = () => {
    clearTimeout(syncTimer);
    unsubscribe();
  };
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);
}
