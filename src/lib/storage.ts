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

export interface CustomBarcodeItem {
  barcode: string;
  name: string;
  brand?: string;
  per100g: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  servingSize?: string;
  servingQuantity?: number;
  updatedAt: number;
}

export function getCustomBarcodes(): Record<string, CustomBarcodeItem> {
  return load<Record<string, CustomBarcodeItem>>('custom_barcodes', {});
}

export function getCustomBarcode(barcode: string): CustomBarcodeItem | null {
  const clean = barcode.trim().replace(/\D/g, '');
  if (!clean) return null;
  const barcodes = getCustomBarcodes();
  return barcodes[clean] || null;
}

export function saveCustomBarcode(item: CustomBarcodeItem): void {
  const clean = item.barcode.trim().replace(/\D/g, '');
  if (!clean) return;
  const current = getCustomBarcodes();
  current[clean] = {
    ...item,
    barcode: clean,
    updatedAt: Date.now(),
  };
  save('custom_barcodes', current);
}

export interface FullAppBackup {
  version: string;
  exportedAt: string;
  source: string;
  profile?: UserProfile | null;
  prs?: PersonalRecord[];
  workouts?: WorkoutEntry[];
  meals?: MealEntry[];
  customBarcodes?: Record<string, CustomBarcodeItem>;
  [key: string]: any;
}

export function exportFullBackupJSON(): string {
  if (typeof window === 'undefined') return '{}';
  try {
    let storeData: any = {};
    const rawStore = window.localStorage.getItem('ascend_store');
    if (rawStore) {
      try {
        const parsed = JSON.parse(rawStore);
        storeData = parsed.state || parsed;
      } catch {}
    }
    const customBarcodes = getCustomBarcodes();

    const backup: FullAppBackup = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      source: 'ASCEND Strength Tracker',
      ...storeData,
      customBarcodes,
    };
    return JSON.stringify(backup, null, 2);
  } catch (err) {
    console.error('Error generating full backup JSON', err);
    return '{}';
  }
}

export function importFullBackupJSON(jsonString: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') return false;

    // Restore custom barcodes if present
    if (data.customBarcodes && typeof data.customBarcodes === 'object') {
      const current = getCustomBarcodes();
      const merged = { ...current, ...data.customBarcodes };
      save('custom_barcodes', merged);
    }

    // Restore main ascend_store
    const rawStore = window.localStorage.getItem('ascend_store');
    let currentState: any = {};
    let currentVersion = 1;
    if (rawStore) {
      try {
        const parsed = JSON.parse(rawStore);
        currentState = parsed.state || parsed;
        currentVersion = parsed.version || 1;
      } catch {}
    }

    const nextState = {
      ...currentState,
      ...data,
      hasCompletedOnboarding: true,
      _hasHydrated: true,
    };
    delete nextState.customBarcodes;
    delete nextState.version;
    delete nextState.exportedAt;
    delete nextState.source;

    window.localStorage.setItem(
      'ascend_store',
      JSON.stringify({
        state: nextState,
        version: currentVersion,
      })
    );

    return true;
  } catch (err) {
    console.error('Error importing full backup JSON', err);
    return false;
  }
}

