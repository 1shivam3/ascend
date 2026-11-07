import type { Page, Route } from '@playwright/test';

/**
 * Deterministic AI endpoint mocks (QA-hardening brief, Phase 0).
 *
 * Intercepts every AI route the client calls and answers with fixed
 * fixture payloads in the routes' REAL response envelopes, captured
 * from src/app/api/ai/*\/route.ts and the client parsers:
 *
 *   POST /api/ai/coach-chat  -> ask-the-coach chat (CoachChatSection)
 *   POST /api/ai/coach       -> Coach's Take + plan tasks (ai-coach.ts)
 *   POST /api/coach          -> legacy literal path ai-coach.ts fetches
 *   POST /api/ai/scan-meal   -> meal photo scan AND label scan (one
 *                               route; the label flow is a scan-meal
 *                               prompt variant, src/lib/ai-scan-meal.ts)
 *   POST /api/ai/parse-meal  -> quick-log text parse (MealsPage)
 *   POST /api/ai/parse-voice -> voice set parse (VoiceWorkoutLoggerModal)
 *
 * Tests must NEVER call the real (paid) AI endpoints. Mocks are the
 * default. Setting QA_REAL_AI=1 disables interception entirely — that
 * flag exists for the owner's manual exploratory runs only, never for
 * CI or agent-run suites.
 */

export const REAL_AI_ENV = 'QA_REAL_AI';

export function realAiEnabled(): boolean {
  return process.env[REAL_AI_ENV] === '1';
}

const PROVIDER = { provider: 'qa-mock', model: 'qa-mock' } as const;

export const MOCK_COACH_CHAT = {
  reply:
    'QA mock reply: steady progress this week. Keep the top set honest, and add 2.5 kg next session only if every rep is clean.',
  evidence: [],
  ...PROVIDER,
  safetyStop: null,
  dailyRemaining: 42,
} as const;

const COACH_TASK_DATA: Record<string, Record<string, unknown>> = {
  POST_WORKOUT_TAKE: {
    headline: 'Strong session — Deadlift is moving.',
    volumeVsLastWeek: 'Volume is up 4% vs last week.',
    keyAchievements: ['Deadlift 140 kg x 5 — best set this block'],
    nextSessionTarget: 'Repeat the top sets, then add one back-off set.',
  },
  WEEKLY_REVIEW: {
    weekSummary: 'QA mock weekly review: three sessions logged, loads progressing.',
    workoutsCompleted: 3,
    plannedDaysPerWeek: 3,
    strengthHighlight: 'Deadlift top set up 5 kg this month.',
    habitInsight: 'Training days are consistent on Mon, Wed and Fri.',
    focusNextWeek: 'Hold the same plan and chase clean reps.',
  },
  GENERATE_DAILY_PLAN: {
    workoutName: 'QA Mock Full Body',
    estimatedDurationMin: 55,
    focus: 'Strength',
    whyThisWorkout: 'QA mock plan generated from fixture data.',
    exercises: [
      { name: 'Squat', exercise: 'Squat', sets: 4, reps: '5', targetWeightKg: 100 },
      { name: 'Bench Press', exercise: 'Bench Press', sets: 4, reps: '6', targetWeightKg: 70 },
      { name: 'Barbell Row', exercise: 'Barbell Row', sets: 3, reps: '8', targetWeightKg: 65 },
    ],
  },
  SUBSTITUTE_EXERCISE: {
    originalExercise: 'Barbell Row',
    replacementExercise: 'Chest-Supported Row',
    reason: 'QA mock substitution: same pattern, less lower-back load.',
    movementPattern: 'horizontal_pull',
    targetWeightKg: 30,
    targetReps: '10',
    targetSets: 3,
  },
  WORKOUT_COMMAND: {
    actionType: 'qa_mock',
    summary: 'QA mock workout command applied.',
    coachAdvice: 'QA mock advice.',
    modifiedExercises: [],
  },
  COACH_INSIGHT: {
    volumeTrend: 'QA mock: volume trending up.',
    recoveryStatus: 'QA mock: recovery looks fine.',
    tacticalAdvice: 'QA mock: keep the plan unchanged this week.',
    fatigueWarning: null,
  },
};

export const MOCK_SCAN_MEAL = {
  mealName: 'QA Mock Thali',
  items: [
    {
      name: 'Toor Dal (Pigeon Pea)',
      quantity: '1 katori',
      estimatedGrams: 150,
      calories: 165,
      proteinG: 9,
      carbsG: 22,
      fatG: 4.5,
      confidence: 'high',
    },
    {
      name: 'Roti',
      quantity: '2 pieces',
      estimatedGrams: 60,
      calories: 240,
      proteinG: 7,
      carbsG: 48,
      fatG: 3,
      confidence: 'high',
    },
  ],
  totalCalories: 405,
  totalProtein: 16,
  totalCarbs: 70,
  totalFat: 7.5,
  hiddenIngredients: [],
  confidence: 'high',
  coachingNote: 'QA mock scan result — no real model was called.',
  timestamp: '2026-01-01T00:00:00.000Z',
} as const;

export const MOCK_PARSE_MEAL = {
  source: 'qa-mock',
  model: 'qa-mock',
  mealName: 'QA Mock Meal',
  foods: [
    { name: 'Toor Dal', quantity: 1, unit: 'katori', calories: 165, proteinG: 9, carbsG: 22, fatG: 4.5 },
    { name: 'Roti', quantity: 2, unit: 'piece', calories: 240, proteinG: 7, carbsG: 48, fatG: 3 },
  ],
  totalCalories: 405,
  totalProteinG: 16,
  totalCarbsG: 70,
  totalFatG: 7.5,
} as const;

export const MOCK_PARSE_VOICE = {
  success: true,
  result: { exerciseName: 'Deadlift', weight: 100, reps: 5, rpe: 8, setIndex: 1 },
} as const;

function fulfillJson(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function handleCoach(route: Route): Promise<void> {
  let task = 'POST_WORKOUT_TAKE';
  try {
    const body = route.request().postDataJSON() as { task?: string } | null;
    if (body?.task) task = body.task;
  } catch {
    // Non-JSON body — fall through with the default task fixture.
  }
  await fulfillJson(route, {
    success: true,
    task,
    source: 'qa-mock',
    model: 'qa-mock',
    data: COACH_TASK_DATA[task] ?? {},
  });
}

/**
 * Registers the AI mocks on a page. No-op when QA_REAL_AI=1.
 * Call before page.goto() so no real request can slip through.
 * Returns true when mocks are active.
 */
export async function installAiMocks(page: Page): Promise<boolean> {
  if (realAiEnabled()) {
    console.warn(
      `[qa] ${REAL_AI_ENV}=1 — AI mocks DISABLED. Real AI endpoints will be called. Owner-run only.`,
    );
    return false;
  }
  await page.route('**/api/ai/coach-chat', (route) => fulfillJson(route, MOCK_COACH_CHAT));
  await page.route('**/api/ai/coach', handleCoach);
  await page.route('**/api/coach', handleCoach);
  await page.route('**/api/ai/scan-meal', (route) => fulfillJson(route, MOCK_SCAN_MEAL));
  await page.route('**/api/ai/parse-meal', (route) => fulfillJson(route, MOCK_PARSE_MEAL));
  await page.route('**/api/ai/parse-voice', (route) => fulfillJson(route, MOCK_PARSE_VOICE));
  return true;
}
