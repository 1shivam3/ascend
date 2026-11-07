import type { Page } from '@playwright/test';

/**
 * Seeded-state persona fixtures (QA-hardening brief, Phase 0).
 *
 * Seeds are written into localStorage BEFORE the app boots, in the exact
 * shape the app itself persists: the zustand persist envelope
 * `{ state, version }` under the `ascend_store` key, with `version`
 * equal to PERSIST_VERSION in src/lib/store.ts (3 at time of writing)
 * and state keys taken from `partializeAppState` in the same file.
 * Nested objects follow the interfaces in src/lib/types.ts
 * (UserProfile, WorkoutEntry, WorkoutSet, PersonalRecord, MealEntry,
 * FoodItem, MacroGoals, AITrainingProfile) and DEFAULT_UI_PREFERENCES /
 * DEFAULT_TODAY_LAYOUT are copied verbatim from src/lib/store.ts and
 * src/lib/today-layout.ts. Keys a persona does not set fall back to the
 * store's own initial state via zustand's shallow merge on rehydrate.
 *
 * Dates are computed relative to "today" at run time so the history
 * always spans the intended window (e.g. the last 6 weeks) whenever the
 * suite runs. Everything else is fixed arithmetic — no randomness.
 */

export const STORE_KEY = 'ascend_store';
export const PERSIST_VERSION = 3;

export type PersonaId =
  | 'empty-guest'
  | 'intermediate'
  | 'minor-15'
  | 'injuries'
  | 'hindi'
  | 'xl-text';

export const PERSONA_IDS: PersonaId[] = [
  'empty-guest',
  'intermediate',
  'minor-15',
  'injuries',
  'hindi',
  'xl-text',
];

/** YYYY-MM-DD in local time, `n` days before today. */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalDate(d);
}

/** YYYY-MM-DD for a date exactly `years`/`months` before today. */
function yearsAgo(years: number, extraMonths = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setMonth(d.getMonth() - extraMonths);
  return toLocalDate(d);
}

function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** DEFAULT_UI_PREFERENCES from src/lib/store.ts, verbatim. */
export function defaultUiPreferences(): Record<string, unknown> {
  return {
    gamificationEnabled: true,
    coachEnabled: true,
    showHabitMatrix: true,
    weeklyTargetDays: null,
    language: 'en',
    textScale: 'normal',
    healthConnectEnabled: false,
    showMuscleVolume: true,
    accentTheme: 'vermilion',
    customAccentHex: null,
    density: 'simple',
    todayLayout: {
      visible: {},
      order: [
        'nutrition-strip',
        'coach',
        'habit-matrix',
        'quick-actions',
        'hydration',
        'readiness',
        'level',
        'steps',
        'challenge',
        'weekly-review-detail',
        'quote',
      ],
    },
    workoutModeOverride: 'beginner',
    pinnedProgressChart: null,
    defaultMatrixView: 'weekly',
  };
}

function uiPreferences(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...defaultUiPreferences(), ...overrides };
}

function profile(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'qa-persona',
    name: 'QA User',
    gender: 'male',
    bodyweightKg: 75,
    bodyweightLbs: 165.3,
    heightCm: 175,
    bodyweightSource: 'user',
    heightSource: 'user',
    age: 28,
    dateOfBirth: '1998-04-12',
    unit: 'kg',
    createdAt: '2026-01-05T08:00:00.000Z',
    goals: ['muscle'],
    userMode: 'intermediate',
    dietPreference: 'veg',
    ...overrides,
  };
}

function set(reps: number, weight: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { reps, weight, unit: 'kg', completed: true, status: 'completed', ...extra };
}

function workout(
  id: string,
  date: string,
  name: string,
  exercises: { name: string; sets: Record<string, unknown>[] }[],
): Record<string, unknown> {
  return { id, date, name, durationMinutes: 55, exercises };
}

/**
 * (b) Intermediate lifter: 18 sessions over the last 6 weeks
 * (Mon/Wed/Fri cadence, alternating A/B), progressing loads, PRs that
 * match the best logged sets, and meals on the last 3 days.
 */
function intermediateState(): Record<string, unknown> {
  const workouts: Record<string, unknown>[] = [];
  const weeks = 6;
  for (let w = 0; w < weeks; w++) {
    const base = 41 - w * 7; // days ago of this week's Monday-ish session
    const squat = 90 + w * 2.5;
    const bench = 60 + w * 2;
    const row = 55 + w * 2;
    const deadlift = 120 + w * 4;
    const ohp = 40 + w * 2;
    workouts.push(
      workout(`qa-w${w}a`, daysAgo(base), 'Day A — Squat Focus', [
        { name: 'Squat', sets: [set(5, squat - 10), set(5, squat - 5), set(5, squat), set(5, squat)] },
        { name: 'Bench Press', sets: [set(6, bench - 5), set(6, bench), set(6, bench), set(6, bench)] },
        { name: 'Barbell Row', sets: [set(8, row), set(8, row), set(8, row)] },
      ]),
      workout(`qa-w${w}b`, daysAgo(base - 2), 'Day B — Deadlift Focus', [
        { name: 'Deadlift', sets: [set(5, deadlift - 15), set(5, deadlift - 7.5), set(5, deadlift)] },
        { name: 'Overhead Press', sets: [set(8, ohp), set(8, ohp), set(8, ohp)] },
        { name: 'Lat Pulldown', sets: [set(10, 55), set(10, 55), set(10, 55)] },
      ]),
      workout(`qa-w${w}c`, daysAgo(base - 4), 'Day C — Volume', [
        { name: 'Squat', sets: [set(8, squat - 20), set(8, squat - 20), set(8, squat - 20)] },
        { name: 'Bench Press', sets: [set(10, bench - 12.5), set(10, bench - 12.5), set(10, bench - 12.5)] },
        { name: 'Deadlift', sets: [set(3, deadlift - 20), set(3, deadlift - 20)] },
      ]),
    );
  }
  // Best logged sets in the final week: Squat 102.5x5, Bench 70x6,
  // Row 65x8, Deadlift 140x5, Overhead Press 50x8. oneRepMax is the
  // Epley estimate of those sets, rounded to 0.1.
  const epley = (w: number, r: number) => Math.round(w * (1 + r / 30) * 10) / 10;
  const prs = [
    { id: 'qa-pr-squat', exercise: 'Squat', weightKg: 102.5, weightLbs: 226, reps: 5, oneRepMax: epley(102.5, 5), date: daysAgo(4) },
    { id: 'qa-pr-bench', exercise: 'Bench Press', weightKg: 70, weightLbs: 154.3, reps: 6, oneRepMax: epley(70, 6), date: daysAgo(4) },
    { id: 'qa-pr-row', exercise: 'Barbell Row', weightKg: 65, weightLbs: 143.3, reps: 8, oneRepMax: epley(65, 8), date: daysAgo(4) },
    { id: 'qa-pr-deadlift', exercise: 'Deadlift', weightKg: 140, weightLbs: 308.6, reps: 5, oneRepMax: epley(140, 5), date: daysAgo(2) },
    { id: 'qa-pr-ohp', exercise: 'Overhead Press', weightKg: 50, weightLbs: 110.2, reps: 8, oneRepMax: epley(50, 8), date: daysAgo(2) },
  ];
  const mealFoods = [
    { name: 'Toor Dal', calories: 165, proteinG: 9, carbsG: 22, fatG: 4.5, quantity: 1, unit: 'katori' },
    { name: 'Roti', calories: 240, proteinG: 7, carbsG: 48, fatG: 3, quantity: 2, unit: 'piece' },
    { name: 'Cooked Rice', calories: 260, proteinG: 5, carbsG: 56, fatG: 1, quantity: 1, unit: 'katori' },
    { name: 'Paneer Butter Masala', calories: 320, proteinG: 12, carbsG: 14, fatG: 24, quantity: 1, unit: 'katori' },
    { name: 'Whey Protein Shake', calories: 120, proteinG: 24, carbsG: 3, fatG: 1, quantity: 1, unit: 'scoop' },
  ];
  const meals: Record<string, unknown>[] = [];
  for (let d = 0; d < 3; d++) {
    meals.push(
      { id: `qa-meal-${d}a`, date: daysAgo(d), name: 'Lunch', foods: [mealFoods[0], mealFoods[1], mealFoods[2]] },
      { id: `qa-meal-${d}b`, date: daysAgo(d), name: 'Dinner', foods: [mealFoods[3], mealFoods[1], mealFoods[4]] },
    );
  }
  return {
    profile: profile({ id: 'qa-persona-intermediate', name: 'QA Intermediate' }),
    hasCompletedOnboarding: true,
    theme: 'light',
    workouts,
    prs,
    meals,
    macroGoals: { calories: 2592, proteinG: 162, carbsG: 324, fatG: 72, maintenanceCalories: 2442, calorieDelta: 150 },
    uiPreferences: uiPreferences({}),
    userMode: 'intermediate',
  };
}

/** (c) Minor aged 15 (DOB 15 years + 2 months ago, age field 15). */
function minorState(): Record<string, unknown> {
  return {
    profile: profile({
      id: 'qa-persona-minor',
      name: 'QA Minor',
      gender: 'female',
      bodyweightKg: 55,
      bodyweightLbs: 121.3,
      heightCm: 160,
      age: 15,
      dateOfBirth: yearsAgo(15, 2),
      goals: ['fat_loss'],
      userMode: 'beginner',
    }),
    hasCompletedOnboarding: true,
    theme: 'light',
    workouts: [],
    meals: [],
    macroGoals: null,
    uiPreferences: uiPreferences({ workoutModeOverride: 'beginner' }),
    userMode: 'beginner',
  };
}

/** (d) Knee + lower-back injuries on the training profile. */
function injuriesState(): Record<string, unknown> {
  return {
    profile: profile({
      id: 'qa-persona-injuries',
      name: 'QA Injuries',
      age: 38,
      dateOfBirth: '1988-03-02',
      goals: ['general'],
    }),
    hasCompletedOnboarding: true,
    theme: 'light',
    workouts: [
      workout('qa-inj-1', daysAgo(3), 'Upper Body — Light', [
        { name: 'Bench Press', sets: [set(10, 40), set(10, 40), set(10, 40)] },
        { name: 'Lat Pulldown', sets: [set(12, 40), set(12, 40)] },
      ]),
      workout('qa-inj-2', daysAgo(6), 'Upper Body — Light', [
        { name: 'Overhead Press', sets: [set(10, 25), set(10, 25)] },
        { name: 'Barbell Row', sets: [set(10, 35), set(10, 35)] },
      ]),
    ],
    meals: [],
    macroGoals: { calories: 2300, proteinG: 140, carbsG: 260, fatG: 78 },
    trainingProfile: {
      goal: 'general',
      experience: 'intermediate',
      daysPerWeek: 3,
      preferredDurationMin: 45,
      equipment: 'full_gym',
      activityLevel: 'light',
      preferredSplit: 'upper_lower',
      dislikedExercises: [],
      injuriesOrLimitations: ['Knee', 'Low back'],
      coachingStyle: 'balanced',
    },
    uiPreferences: uiPreferences({}),
    userMode: 'intermediate',
  };
}

/**
 * Builds the persisted-state object for a persona, or null for
 * 'empty-guest' (no seed — the app must see a truly fresh profile).
 */
export function buildSeedState(persona: PersonaId): Record<string, unknown> | null {
  switch (persona) {
    case 'empty-guest':
      return null;
    case 'intermediate':
      return intermediateState();
    case 'minor-15':
      return minorState();
    case 'injuries':
      return injuriesState();
    case 'hindi': {
      const state = intermediateState();
      state.profile = profile({ id: 'qa-persona-hindi', name: 'QA Hindi' });
      state.uiPreferences = uiPreferences({ language: 'hi' });
      return state;
    }
    case 'xl-text': {
      const state = minorState();
      state.profile = profile({ id: 'qa-persona-xl', name: 'QA XL Text', goals: ['fat_loss'] });
      state.uiPreferences = uiPreferences({ textScale: 'xlarge' });
      return state;
    }
  }
}

/**
 * Installs a persona's seed so it is in localStorage before any app
 * script runs, on every navigation. Call before page.goto().
 */
export async function installSeed(page: Page, persona: PersonaId): Promise<void> {
  const state = buildSeedState(persona);
  if (state === null) return;
  const blob = JSON.stringify({ state, version: PERSIST_VERSION });
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key as string, value as string);
      } catch {
        // Storage unavailable (private mode etc.) — seed silently absent;
        // tests asserting seeded content will fail loudly downstream.
      }
    },
    [STORE_KEY, blob],
  );
}
