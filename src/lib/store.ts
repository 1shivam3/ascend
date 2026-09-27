import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UserProfile, PersonalRecord, WorkoutEntry, MealEntry, Theme } from './types';

export * from './types';

interface AppState {
  profile: UserProfile | null;
  prs: PersonalRecord[];
  workouts: WorkoutEntry[];
  meals: MealEntry[];
  theme: Theme;
  prTargets: Record<string, number>;
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
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      profile: null,
      prs: [],
      workouts: [],
      meals: [],
      theme: 'dark',
      prTargets: {},
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
      deleteMeal: (id) => set((state) => ({ meals: state.meals.filter(meal => meal.id !== id) }))
    }),
    {
      name: 'ascend_store',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);
          // Apply active theme to DOM immediately upon hydration
          if (typeof document !== 'undefined') {
            const currentTheme = state.theme || 'dark';
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
        theme: state.theme,
        prTargets: state.prTargets,
        hasCompletedOnboarding: state.hasCompletedOnboarding
      })
    }
  )
);

export const useStore = useAppStore;
