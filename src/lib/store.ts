import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  UserProfile,
  PersonalRecord,
  WorkoutEntry,
  WorkoutExercise,
  MealEntry,
  Theme,
  BodyMetricEntry,
  MacroGoals,
  PlannedWorkout,
  FavoriteFood,
  FoodItem,
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
  AIWeeklyReview
} from './types';
import { DEFAULT_AI_TRAINING_PROFILE } from './ai-context';

export * from './types';

export interface ActiveWorkoutDraft {
  id?: string;
  name?: string;
  date: string;
  exercises: WorkoutExercise[];
  startedFromPlan?: string | null;
  sessionStartTime?: number;
  savedAt: string;
}

export interface AppState {
  profile: UserProfile | null;
  prs: PersonalRecord[];
  workouts: WorkoutEntry[];
  meals: MealEntry[];
  bodyMetrics: BodyMetricEntry[];
  theme: Theme;
  prTargets: Record<string, number>;
  macroGoals: MacroGoals | null;
  plannedWorkouts: PlannedWorkout[];
  favoriteFoods: FavoriteFood[];
  hasCompletedOnboarding: boolean;
  _hasHydrated: boolean;

  // Active workout persistence
  activeWorkoutDraft: ActiveWorkoutDraft | null;
  saveWorkoutDraft: (draft: ActiveWorkoutDraft) => void;
  clearWorkoutDraft: () => void;

  // Food Portion Memory
  userPortionPreferences: Record<string, number>;
  savePortionPreference: (foodName: string, grams: number) => void;

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
  customGeminiKey?: string;
  aiInsightsCache: Record<string, AICoachInsight>;
  
  setHasHydrated: (state: boolean) => void;
  setProfile: (profile: UserProfile) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  
  addPR: (pr: PersonalRecord) => void;
  addMultiplePRs: (prs: PersonalRecord[]) => void;
  updatePR: (id: string, pr: Partial<PersonalRecord>) => void;
  deletePR: (id: string) => void;
  
  setPRTarget: (exercise: string, targetKg: number) => void;
  deletePRTarget: (exercise: string) => void;
  
  addWorkout: (workout: WorkoutEntry) => void;
  deleteWorkout: (id: string) => void;
  
  addMeal: (meal: MealEntry) => void;
  deleteMeal: (id: string) => void;
  copyMealsFromDate: (sourceDate: string, targetDate?: string) => number;

  setMacroGoals: (goals: MacroGoals | null) => void;

  addBodyMetric: (entry: BodyMetricEntry) => void;
  deleteBodyMetric: (id: string) => void;
  updateBodyMetrics: (weightKg: number, heightCm?: number) => void;

  addPlannedWorkout: (plan: PlannedWorkout) => void;
  updatePlannedWorkout: (id: string, plan: PlannedWorkout) => void;
  deletePlannedWorkout: (id: string) => void;

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
  setCustomGeminiKey: (key: string) => void;
  cacheAIInsight: (date: string, insight: AICoachInsight) => void;
  setTrainingProfile: (profile: Partial<AITrainingProfile>) => void;
  setTodaysAIWorkoutPlan: (plan: AIPlannedWorkout | undefined) => void;
  saveWeeklyReview: (review: AIWeeklyReview) => void;

  clearAllData: () => void;
  
  importAllData: (data: any) => boolean;
}

function getLocalTodayStr(): string {
  const d = new Date();
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

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      profile: null,
      prs: [],
      workouts: [],
      meals: [],
      bodyMetrics: [],
      theme: 'light',
      prTargets: {},
      macroGoals: null,
      plannedWorkouts: [],
      favoriteFoods: DEFAULT_FAVORITE_FOODS,
      hasCompletedOnboarding: false,
      _hasHydrated: false,

      // Active workout persistence
      activeWorkoutDraft: null,

      // Portion Preferences
      userPortionPreferences: {},

      // Habit State
      waterLogs: {},
      waterBatches: {},
      hydrationConfig: DEFAULT_HYDRATION_CONFIG,
      creatineLogs: {},
      creatineConfig: DEFAULT_CREATINE_CONFIG,
      creatineSupply: DEFAULT_CREATINE_SUPPLY,
      dayTypeOverrides: {},
      gymLogs: {},
      customGeminiKey: undefined,
      aiInsightsCache: {},

      // AI State
      trainingProfile: DEFAULT_AI_TRAINING_PROFILE,
      todaysAIWorkoutPlan: undefined,
      latestWeeklyReview: undefined,
      
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      
      setProfile: (profile) => set((state) => {
        let nextMetrics = state.bodyMetrics;
        if ((!nextMetrics || nextMetrics.length === 0) && profile.bodyweightKg) {
          const entry: BodyMetricEntry = {
            id: 'initial_bw_' + (profile.id || 'user'),
            date: profile.createdAt ? profile.createdAt.split('T')[0] : getLocalTodayStr(),
            weightKg: profile.bodyweightKg,
            heightCm: profile.heightCm,
            notes: 'Baseline calibration',
          };
          nextMetrics = [entry];
        }
        let nextFavorites = state.favoriteFoods;
        if (!nextFavorites || nextFavorites.length === 0) {
          nextFavorites = DEFAULT_FAVORITE_FOODS;
        }
        return {
          profile,
          hasCompletedOnboarding: true,
          bodyMetrics: nextMetrics,
          favoriteFoods: nextFavorites,
        };
      }),
      
      setTheme: (theme) => {
        if (typeof document !== 'undefined') {
          if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
          } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
          }
        }
        set({ theme });
      },

      toggleTheme: () => set((state) => {
        const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
        if (typeof document !== 'undefined') {
          if (nextTheme === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
          } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
          }
        }
        return { theme: nextTheme };
      }),
      
      addPR: (pr) => set((state) => ({ prs: [...state.prs, pr] })),
      addMultiplePRs: (newPrs) => set((state) => ({ prs: [...state.prs, ...newPrs] })),
      updatePR: (id, updatedFields) => set((state) => ({
        prs: state.prs.map(pr => pr.id === id ? { ...pr, ...updatedFields } : pr)
      })),
      deletePR: (id) => set((state) => ({ prs: state.prs.filter(pr => pr.id !== id) })),
      
      setPRTarget: (exercise, targetKg) => set((state) => ({
        prTargets: { ...state.prTargets, [exercise]: targetKg }
      })),
      deletePRTarget: (exercise) => set((state) => {
        const next = { ...state.prTargets };
        delete next[exercise];
        return { prTargets: next };
      }),

      addWorkout: (workout) => set((state) => ({ workouts: [...state.workouts, workout] })),
      deleteWorkout: (id) => set((state) => ({ workouts: state.workouts.filter(w => w.id !== id) })),
      
      addMeal: (meal) => set((state) => ({ meals: [...state.meals, meal] })),
      deleteMeal: (id) => set((state) => ({ meals: state.meals.filter(meal => meal.id !== id) })),

      copyMealsFromDate: (sourceDate, targetDate) => {
        const tgt = targetDate || new Date().toISOString().split('T')[0];
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

      addBodyMetric: (entry) => set((state) => ({
        bodyMetrics: [entry, ...state.bodyMetrics.filter(m => m.date !== entry.date)]
      })),
      deleteBodyMetric: (id) => set((state) => ({ bodyMetrics: state.bodyMetrics.filter(m => m.id !== id) })),
      updateBodyMetrics: (weightKg, heightCm) => set((state) => {
        const todayDate = getLocalTodayStr();
        const entry: BodyMetricEntry = {
          id: crypto.randomUUID(),
          date: todayDate,
          weightKg: Math.round(weightKg * 10) / 10,
          heightCm: heightCm ? Math.round(heightCm) : undefined,
        };
        const updatedProfile = state.profile ? {
          ...state.profile,
          bodyweightKg: Math.round(weightKg * 10) / 10,
          bodyweightLbs: Math.round(weightKg * 2.20462 * 10) / 10,
          ...(heightCm ? { heightCm: Math.round(heightCm) } : {}),
        } : null;
        return {
          profile: updatedProfile,
          bodyMetrics: [entry, ...state.bodyMetrics.filter(m => m.date !== todayDate)],
        };
      }),

      addPlannedWorkout: (plan) => set((state) => ({
        plannedWorkouts: [plan, ...state.plannedWorkouts.filter(p => p.id !== plan.id && p.name.toLowerCase() !== plan.name.toLowerCase())]
      })),
      updatePlannedWorkout: (id, plan) => set((state) => ({
        plannedWorkouts: state.plannedWorkouts.map(p => p.id === id ? plan : p)
      })),
      deletePlannedWorkout: (id) => set((state) => ({
        plannedWorkouts: state.plannedWorkouts.filter(p => p.id !== id)
      })),

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

      logWater: (amountMl, date) => set((state) => {
        const d = date || getLocalTodayStr();
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
      }),

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

      setCustomGeminiKey: (key: string) => set({ customGeminiKey: key.trim() ? key.trim() : undefined }),

      saveWorkoutDraft: (draft) => set({ activeWorkoutDraft: draft }),
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

      clearAllData: () => {
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
          hasCompletedOnboarding: false,
          waterLogs: {},
          waterBatches: {},
          hydrationConfig: DEFAULT_HYDRATION_CONFIG,
          creatineLogs: {},
          creatineConfig: DEFAULT_CREATINE_CONFIG,
          creatineSupply: DEFAULT_CREATINE_SUPPLY,
          dayTypeOverrides: {},
          customGeminiKey: undefined,
          aiInsightsCache: {},
          trainingProfile: DEFAULT_AI_TRAINING_PROFILE,
          todaysAIWorkoutPlan: undefined,
          latestWeeklyReview: undefined,
        });
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem('ascend_store');
          } catch {}
        }
      },

      importAllData: (data) => {
        try {
          if (!data || typeof data !== 'object') return false;
          set((state) => ({
            profile: data.profile || state.profile,
            prs: Array.isArray(data.prs) ? data.prs : state.prs,
            workouts: Array.isArray(data.workouts) ? data.workouts : state.workouts,
            meals: Array.isArray(data.meals) ? data.meals : state.meals,
            bodyMetrics: Array.isArray(data.bodyMetrics) ? data.bodyMetrics : state.bodyMetrics,
            prTargets: data.prTargets || state.prTargets,
            macroGoals: data.macroGoals !== undefined ? data.macroGoals : state.macroGoals,
            theme: data.theme || state.theme,
            hasCompletedOnboarding:
              data.hasCompletedOnboarding !== undefined
                ? data.hasCompletedOnboarding
                : state.hasCompletedOnboarding,
            plannedWorkouts: Array.isArray(data.plannedWorkouts) ? data.plannedWorkouts : state.plannedWorkouts,
            favoriteFoods: Array.isArray(data.favoriteFoods) ? data.favoriteFoods : state.favoriteFoods,
            waterLogs: data.waterLogs && typeof data.waterLogs === 'object' ? data.waterLogs : state.waterLogs,
            waterBatches: data.waterBatches && typeof data.waterBatches === 'object' ? data.waterBatches : state.waterBatches,
            hydrationConfig: data.hydrationConfig || state.hydrationConfig,
            creatineLogs: data.creatineLogs && typeof data.creatineLogs === 'object' ? data.creatineLogs : state.creatineLogs,
            creatineConfig: data.creatineConfig || state.creatineConfig,
            creatineSupply: data.creatineSupply || state.creatineSupply,
            dayTypeOverrides: data.dayTypeOverrides && typeof data.dayTypeOverrides === 'object' ? data.dayTypeOverrides : state.dayTypeOverrides,
            gymLogs: data.gymLogs && typeof data.gymLogs === 'object' ? data.gymLogs : state.gymLogs,
            customGeminiKey: data.customGeminiKey !== undefined ? data.customGeminiKey : state.customGeminiKey,
            aiInsightsCache: data.aiInsightsCache && typeof data.aiInsightsCache === 'object' ? data.aiInsightsCache : state.aiInsightsCache,
            trainingProfile: data.trainingProfile || state.trainingProfile,
            todaysAIWorkoutPlan: data.todaysAIWorkoutPlan || state.todaysAIWorkoutPlan,
            latestWeeklyReview: data.latestWeeklyReview || state.latestWeeklyReview,
          }));
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'ascend_store',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);

          // If profile exists with bodyweight but bodyMetrics is empty, backfill baseline
          if (state.profile?.bodyweightKg && (!state.bodyMetrics || state.bodyMetrics.length === 0)) {
            const entry: BodyMetricEntry = {
              id: 'initial_bw_' + (state.profile.id || 'user'),
              date: state.profile.createdAt ? state.profile.createdAt.split('T')[0] : getLocalTodayStr(),
              weightKg: state.profile.bodyweightKg,
              heightCm: state.profile.heightCm,
              notes: 'Baseline calibration',
            };
            useAppStore.setState({ bodyMetrics: [entry] });
          } else if (state.bodyMetrics && state.bodyMetrics.length > 0) {
            // Deduplicate existing bodyMetrics by date
            const seenDates = new Set<string>();
            const deduped: BodyMetricEntry[] = [];
            for (const m of state.bodyMetrics) {
              if (!seenDates.has(m.date)) {
                seenDates.add(m.date);
                deduped.push(m);
              }
            }
            if (deduped.length !== state.bodyMetrics.length) {
              useAppStore.setState({ bodyMetrics: deduped });
            }
          }

          // Ensure staple foods are populated if empty
          if (!state.favoriteFoods || state.favoriteFoods.length === 0) {
            useAppStore.setState({ favoriteFoods: DEFAULT_FAVORITE_FOODS });
          }

          // Apply active theme to DOM immediately upon hydration
          if (typeof document !== 'undefined') {
            const currentTheme = state.theme || 'light';
            if (currentTheme === 'dark') {
              document.documentElement.classList.add('dark');
              document.documentElement.classList.remove('light');
            } else {
              document.documentElement.classList.remove('dark');
              document.documentElement.classList.add('light');
            }
          }
        }
      },
      partialize: (state) => ({ 
        profile: state.profile,
        prs: state.prs,
        workouts: state.workouts,
        meals: state.meals,
        bodyMetrics: state.bodyMetrics,
        theme: state.theme,
        prTargets: state.prTargets,
        macroGoals: state.macroGoals,
        plannedWorkouts: state.plannedWorkouts,
        favoriteFoods: state.favoriteFoods,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        waterLogs: state.waterLogs,
        waterBatches: state.waterBatches,
        hydrationConfig: state.hydrationConfig,
        creatineLogs: state.creatineLogs,
        creatineConfig: state.creatineConfig,
        creatineSupply: state.creatineSupply,
        dayTypeOverrides: state.dayTypeOverrides,
        gymLogs: state.gymLogs,
        customGeminiKey: state.customGeminiKey,
        aiInsightsCache: state.aiInsightsCache,
        trainingProfile: state.trainingProfile,
        todaysAIWorkoutPlan: state.todaysAIWorkoutPlan,
        latestWeeklyReview: state.latestWeeklyReview,
      })
    }
  )
);

export const useStore = useAppStore;
