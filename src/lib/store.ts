import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  UserProfile,
  PersonalRecord,
  WorkoutEntry,
  MealEntry,
  Theme,
  BodyMetricEntry,
  MacroGoals,
  PlannedWorkout,
  FavoriteFood,
  FoodItem
} from './types';

export * from './types';

interface AppState {
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
  deleteFavoriteFood: (id: string) => void;
  toggleFavoriteFood: (food: FoodItem) => boolean;

  clearAllData: () => void;
  
  importAllData: (data: any) => boolean;
}


const DEFAULT_FAVORITE_FOODS: FavoriteFood[] = [
  { id: 'fav_eggs', name: 'Eggs', defaultQuantity: 2, unit: 'piece', calories: 155, proteinG: 13, carbsG: 1.1, fatG: 11 },
  { id: 'fav_chicken', name: 'Chicken Breast', defaultQuantity: 150, unit: 'g', calories: 248, proteinG: 46.5, carbsG: 0, fatG: 5.4 },
  { id: 'fav_oats', name: 'Oats', defaultQuantity: 50, unit: 'g', calories: 195, proteinG: 8.5, carbsG: 33, fatG: 3.5 },
  { id: 'fav_whey', name: 'Whey Protein', defaultQuantity: 1, unit: 'scoop', calories: 120, proteinG: 24, carbsG: 2.2, fatG: 1 },
  { id: 'fav_banana', name: 'Banana', defaultQuantity: 1, unit: 'piece', calories: 105, proteinG: 1.3, carbsG: 27, fatG: 0.4 },
  { id: 'fav_rice', name: 'White Rice', defaultQuantity: 150, unit: 'g', calories: 195, proteinG: 4.1, carbsG: 42, fatG: 0.5 },
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
      
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      
      setProfile: (profile) => set({ profile, hasCompletedOnboarding: true }),
      
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

      addBodyMetric: (entry) => set((state) => ({ bodyMetrics: [entry, ...state.bodyMetrics] })),
      deleteBodyMetric: (id) => set((state) => ({ bodyMetrics: state.bodyMetrics.filter(m => m.id !== id) })),
      updateBodyMetrics: (weightKg, heightCm) => set((state) => {
        const entry: BodyMetricEntry = {
          id: crypto.randomUUID(),
          date: new Date().toISOString().split('T')[0],
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
          bodyMetrics: [entry, ...state.bodyMetrics],
        };
      }),

      addPlannedWorkout: (plan) => set((state) => ({ plannedWorkouts: [...state.plannedWorkouts, plan] })),
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

      deleteFavoriteFood: (id) => set((state) => ({
        favoriteFoods: state.favoriteFoods.filter(f => f.id !== id && f.name.toLowerCase() !== id.toLowerCase())
      })),

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
        hasCompletedOnboarding: state.hasCompletedOnboarding
      })
    }
  )
);

export const useStore = useAppStore;
