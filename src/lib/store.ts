import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UserProfile, PersonalRecord, WorkoutEntry, MealEntry } from './types';

export * from './types';

interface AppState {
  profile: UserProfile | null;
  prs: PersonalRecord[];
  workouts: WorkoutEntry[];
  meals: MealEntry[];
  hasCompletedOnboarding: boolean;
  _hasHydrated: boolean;
  
  setHasHydrated: (state: boolean) => void;
  setProfile: (profile: UserProfile) => void;
  
  addPR: (pr: PersonalRecord) => void;
  updatePR: (id: string, pr: Partial<PersonalRecord>) => void;
  deletePR: (id: string) => void;
  
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
      hasCompletedOnboarding: false,
      _hasHydrated: false,
      
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      
      setProfile: (profile) => set({ profile, hasCompletedOnboarding: true }),
      
      addPR: (pr) => set((state) => ({ prs: [...state.prs, pr] })),
      updatePR: (id, updatedFields) => set((state) => ({
        prs: state.prs.map(pr => pr.id === id ? { ...pr, ...updatedFields } : pr)
      })),
      deletePR: (id) => set((state) => ({ prs: state.prs.filter(pr => pr.id !== id) })),
      
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
        }
      },
      partialize: (state) => ({ 
        profile: state.profile,
        prs: state.prs,
        workouts: state.workouts,
        meals: state.meals,
        hasCompletedOnboarding: state.hasCompletedOnboarding
      })
    }
  )
);

export const useStore = useAppStore;
