import { UserProfile, PersonalRecord, WorkoutEntry, MealEntry } from './types';

const PREFIX = 'ascend_';

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

function save<T>(key: string, data: T): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(data));
    }
  } catch (error) {
    console.error(`Error saving ${key} to localStorage`, error);
  }
}

function load<T>(key: string, defaultValue: T): T {
  try {
    if (typeof window !== 'undefined') {
      const item = window.localStorage.getItem(PREFIX + key);
      return item ? JSON.parse(item) : defaultValue;
    }
  } catch (error) {
    console.error(`Error loading ${key} from localStorage`, error);
  }
  return defaultValue;
}

export function saveProfile(profile: UserProfile | null): void {
  save('profile', profile);
}

export function getProfile(): UserProfile | null {
  return load<UserProfile | null>('profile', null);
}

export function savePRs(prs: PersonalRecord[]): void {
  save('prs', prs);
}

export function getPRs(): PersonalRecord[] {
  return load<PersonalRecord[]>('prs', []);
}

export function saveWorkouts(workouts: WorkoutEntry[]): void {
  save('workouts', workouts);
}

export function getWorkouts(): WorkoutEntry[] {
  return load<WorkoutEntry[]>('workouts', []);
}

export function saveMeals(meals: MealEntry[]): void {
  save('meals', meals);
}

export function getMeals(): MealEntry[] {
  return load<MealEntry[]>('meals', []);
}
