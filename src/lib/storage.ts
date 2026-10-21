import { UserProfile, PersonalRecord, WorkoutEntry, MealEntry, ProgressPhoto } from './types';

/** Mirrors PROGRESS_PHOTOS_KEY in store.ts (duplicated to avoid an import cycle). */
const PROGRESS_PHOTOS_STORAGE_KEY = 'ascend_progress_photos_v1';

const PREFIX = 'ascend_';

/**
 * Keys that must survive a "Delete WebApp Data & Reset": the backend
 * connection config the athlete entered, their theme preference, and the
 * session flag. Everything else under the ascend_ namespace is athlete
 * data and gets wiped.
 */
export const PRESERVED_LOCAL_KEYS: ReadonlySet<string> = new Set([
  'ascend_supabase_url',
  'ascend_supabase_anon_key',
  'ascend_theme',
  'ascend_has_custom_theme',
  'ascend_logged_out',
]);

/**
 * Returns the subset of localStorage keys a data reset must remove.
 * Pure function — unit-testable without a DOM.
 */
export function getPurgeableLocalKeys(allKeys: readonly string[]): string[] {
  return allKeys.filter((k) => k.startsWith(PREFIX) && !PRESERVED_LOCAL_KEYS.has(k));
}

/**
 * Removes every purgeable ascend_* key from localStorage and returns the
 * removed keys. This is what makes "Delete WebApp Data & Reset" honest:
 * without it, discrete legacy mirrors (ascend_profile, ascend_prs,
 * ascend_workouts, ascend_meals, emergency snapshots) are re-read on boot
 * and resurrect supposedly deleted data.
 */
export function purgeLocalAppData(): string[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) keys.push(k);
  }
  const purgeable = getPurgeableLocalKeys(keys);
  purgeable.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // Best effort
    }
  });
  return purgeable;
}

/**
 * Stable guest identity. Minted once per device and reused for every guest
 * onboarding, so a guest who logs out and onboards again keeps the SAME
 * identity — their old data stays attributable instead of being orphaned
 * under a fresh random id. Wiped by "Delete WebApp Data & Reset" (fresh
 * start), preserved by logout.
 */
const GUEST_ID_KEY = 'ascend_guest_id';

export function getOrCreateGuestId(): string {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return 'guest_server';
  }
  try {
    let id = localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
      id = 'guest_' + generateId().replace(/-/g, '').slice(0, 16);
      localStorage.setItem(GUEST_ID_KEY, id);
    }
    return id;
  } catch {
    return 'guest_fallback';
  }
}

export function generateId(): string {
  // Use the Web Crypto API for cryptographically strong IDs when available,
  // falling back to Math.random only in constrained environments.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let hex = '';
    for (let i = 0; i < 16; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return hex;
  }
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
  progressPhotos?: ProgressPhoto[];
  [key: string]: any;
}

/**
 * THE backup field list — every exporter (Data Vault modal, storage
 * helper, emergency snapshot) builds from this one function. Two
 * divergent exporters used to write the same filename with different
 * contents: the modal's 11-field payload silently dropped the weekly
 * schedule, training profile, UI preferences, water/creatine logs,
 * custom barcodes AND all progress photos, and restore defaulted them.
 */
const BACKUP_STATE_FIELDS = [
  'profile',
  'prs',
  'workouts',
  'meals',
  'bodyMetrics',
  'plannedWorkouts',
  'deletedPlanIds',
  'deletedPrIds',
  'deletedWorkoutIds',
  'deletedMealIds',
  'deletedBodyMetricIds',
  'customFoods',
  'mealDayKinds',
  'userPortionPreferences',
  'favoriteFoods',
  'prTargets',
  'macroGoals',
  'theme',
  'hasCustomTheme',
  'hasCompletedOnboarding',
  'weeklySchedule',
  'uiPreferences',
  'trainingProfile',
  'goals',
  'userMode',
  'waterLogs',
  'waterBatches',
  'hydrationConfig',
  'creatineLogs',
  'creatineConfig',
  'creatineSupply',
  'dayTypeOverrides',
  'gymLogs',
  'aiInsightsCache',
  'todaysAIWorkoutPlan',
  'latestWeeklyReview',
  'trainingDecisions',
  'decisionsLedgerHistory',
  'lifterProfile',
  'notificationPreferences',
  'xp',
  'streak',
  'challenges',
  'friendChallenges',
  'runProgram',
  'coach',
  'policyDecisionRecords',
  'policyDecisionsLedgerHistory',
  'policyDecisionApplications',
  'customExerciseMuscles',
  'dailyCheckins',
] as const;

const SENSITIVE_BACKUP_KEYS = ['customGeminiKey', 'apiKey', 'token', 'password', 'secret'];

/**
 * Keys a payload may carry and still count as ASCEND data. The union of
 * the backup field list plus the extras that travel outside it
 * (customBarcodes / progressPhotos) and store-only slices that partial
 * imports legitimately carry (e.g. the Policy v0 ledger).
 */
const RECOGNIZED_BACKUP_KEYS: ReadonlySet<string> = new Set<string>([
  ...BACKUP_STATE_FIELDS,
  'customBarcodes',
  'progressPhotos',
  'hiddenBuiltinRoutineIds',
  'activeWorkoutDraft',
  'lastActiveTab',
  'lastProgressSubTab',
  'lastTrainSubTab',
]);

/**
 * Backup shape gate (QA4-013). True only when the payload is a plain
 * object carrying at least one recognized ASCEND field. Before this,
 * `{"hello":1}` passed every import path and reported success while
 * restoring nothing.
 */
export function isRecognizedBackupData(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  return Object.keys(data as Record<string, unknown>).some((k) => RECOGNIZED_BACKUP_KEYS.has(k));
}

export function buildFullBackup(
  state: Record<string, any>,
  extras?: {
    customBarcodes?: Record<string, CustomBarcodeItem>;
    progressPhotos?: ProgressPhoto[];
  }
): FullAppBackup {
  const backup: Record<string, any> = {
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    source: 'ASCEND Strength Tracker',
  };
  for (const field of BACKUP_STATE_FIELDS) {
    if (state && state[field] !== undefined) backup[field] = state[field];
  }
  for (const key of SENSITIVE_BACKUP_KEYS) delete backup[key];
  if (extras?.customBarcodes !== undefined) backup.customBarcodes = extras.customBarcodes;
  if (extras?.progressPhotos !== undefined) backup.progressPhotos = extras.progressPhotos;
  return backup as FullAppBackup;
}

function readProgressPhotosFromDisk(): ProgressPhoto[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PROGRESS_PHOTOS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const DISALLOWED_IMPORT_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'customGeminiKey',
  'apiKey',
  'token',
  'password',
  'secret',
]);

function sanitizeImportObject<T extends Record<string, any>>(obj: any): T {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {} as T;
  }
  const clean: Record<string, any> = Object.create(null);
  for (const [key, value] of Object.entries(obj)) {
    if (DISALLOWED_IMPORT_KEYS.has(key)) continue;
    if (key.includes('__proto__') || key.includes('constructor') || key.includes('prototype')) continue;
    if (Array.isArray(value)) {
      clean[key] = value.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item) ? sanitizeImportObject(item) : item
      );
    } else if (value && typeof value === 'object') {
      clean[key] = sanitizeImportObject(value);
    } else {
      clean[key] = value;
    }
  }
  return clean as T;
}

export function exportFullBackupJSON(): string {
  if (typeof window === 'undefined') return '{}';
  try {
    let storeData: Record<string, any> = {};
    const rawStore = window.localStorage.getItem('ascend_store');
    if (rawStore) {
      try {
        const parsed = JSON.parse(rawStore);
        storeData = parsed.state || parsed;
      } catch {}
    }

    const backup = buildFullBackup(storeData, {
      customBarcodes: getCustomBarcodes(),
      progressPhotos: readProgressPhotosFromDisk(),
    });
    return JSON.stringify(backup, null, 2);
  } catch (err) {
    console.error('Error generating full backup JSON', err);
    return '{}';
  }
}

export function importFullBackupJSON(jsonString: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (!jsonString || typeof jsonString !== 'string' || jsonString.length > 50 * 1024 * 1024) {
      // Reject empty or oversized payloads (> 50MB)
      return false;
    }

    const rawData = JSON.parse(jsonString);
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return false;
    // Shape gate (QA4-013): reject payloads with no recognized ASCEND
    // fields instead of merging nothing and reporting success.
    if (!isRecognizedBackupData(rawData)) return false;

    // Deep sanitize imported object to prevent prototype pollution and unauthorized credential injection
    const data = sanitizeImportObject(rawData);

    // Restore custom barcodes if present
    if (data.customBarcodes && typeof data.customBarcodes === 'object') {
      const current = getCustomBarcodes();
      const safeBarcodes = sanitizeImportObject(data.customBarcodes);
      const merged = { ...current, ...safeBarcodes };
      save('custom_barcodes', merged);
    }

    // Restore progress photos to their dedicated key if present (they
    // live outside the store blob by design).
    if (Array.isArray(data.progressPhotos)) {
      const validPhotos = data.progressPhotos.filter(
        (p: any) =>
          p &&
          typeof p === 'object' &&
          typeof p.id === 'string' &&
          typeof p.dataUrl === 'string' &&
          p.dataUrl.startsWith('data:image/')
      );
      try {
        window.localStorage.setItem(
          PROGRESS_PHOTOS_STORAGE_KEY,
          JSON.stringify(validPhotos.slice(0, 24))
        );
      } catch {}
      delete data.progressPhotos;
    }

    // Restore main ascend_store
    const rawStore = window.localStorage.getItem('ascend_store');
    let currentState: Record<string, any> = {};
    let currentVersion = 1;
    if (rawStore) {
      try {
        const parsed = JSON.parse(rawStore);
        currentState = parsed.state || parsed;
        currentVersion = parsed.version || 1;
      } catch {}
    }

    const nextState: Record<string, any> = {
      ...currentState,
      ...data,
      hasCompletedOnboarding: true,
      _hasHydrated: true,
    };
    delete nextState.customBarcodes;
    delete nextState.version;
    delete nextState.exportedAt;
    delete nextState.source;
    delete nextState.customGeminiKey;
    delete nextState.apiKey;
    delete nextState.token;
    delete nextState.password;
    delete nextState.secret;

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

