/**
 * Coach model-output validation (gauntlet SEC-22).
 *
 * The coach route used to return the model's parsed JSON verbatim:
 * any field the model invented reached the client, numbers were
 * unbounded (a targetWeightKg of 99999 would render as a
 * prescription), and nothing stopped text that flatly contradicts
 * the route's own health guardrails ("train through the pain",
 * pharmaceutical directives, sub-1200-kcal advice) from being served
 * as coaching. The prompts already isolate untrusted input
 * (instruction-isolation block in the route); this is the output
 * half: per-task allowlisted schemas, string caps, numeric clamps,
 * and a guardrail phrase scan that replaces offending strings with a
 * safe fallback and flags the response.
 *
 * validateCoachOutput returns null when the payload is not an object
 * at all (the route answers 500 INVALID_MODEL_OUTPUT; the client
 * falls back to its local logic).
 */

export interface CoachValidationResult {
  data: Record<string, unknown>;
  safetyFiltered: boolean;
}

const STRING_CAP = 2000;
const SHORT_STRING_CAP = 500;
const MAX_EXERCISES = 30;
const MAX_LIST_ITEMS = 10;

export const COACH_SAFETY_FALLBACK =
  'Train within your limits today, and see a medical professional if anything hurts or feels off.';

type FieldKind = 'string' | 'nullableString' | 'number' | 'stringArray' | 'exercises';

const TASK_SCHEMAS: Record<string, Record<string, FieldKind>> = {
  COACH_INSIGHT: {
    volumeTrend: 'string',
    recoveryStatus: 'string',
    tacticalAdvice: 'string',
    fatigueWarning: 'nullableString',
  },
  GENERATE_DAILY_PLAN: {
    workoutName: 'string',
    estimatedDurationMin: 'number',
    focus: 'string',
    whyThisWorkout: 'string',
    exercises: 'exercises',
  },
  SUBSTITUTE_EXERCISE: {
    originalExercise: 'string',
    replacementExercise: 'string',
    reason: 'string',
    movementPattern: 'string',
    targetWeightKg: 'number',
    targetReps: 'string',
    targetSets: 'number',
  },
  WORKOUT_COMMAND: {
    actionType: 'string',
    summary: 'string',
    coachAdvice: 'string',
    modifiedExercises: 'exercises',
  },
  POST_WORKOUT_TAKE: {
    headline: 'string',
    volumeVsLastWeek: 'string',
    keyAchievements: 'stringArray',
    nextSessionTarget: 'string',
  },
  WEEKLY_REVIEW: {
    weekSummary: 'string',
    workoutsCompleted: 'number',
    plannedDaysPerWeek: 'number',
    strengthHighlight: 'string',
    habitInsight: 'string',
    focusNextWeek: 'string',
  },
};

/** Numeric clamps by field name (weights kg, sets, durations, counts). */
function clampNumber(field: string, value: number): number {
  if (/weight/i.test(field)) return Math.min(1000, Math.max(0, value));
  if (/sets/i.test(field)) return Math.min(50, Math.max(1, Math.round(value)));
  if (/duration/i.test(field)) return Math.min(600, Math.max(0, value));
  if (/rest/i.test(field)) return Math.min(3600, Math.max(0, value));
  return Math.min(100000, Math.max(0, value));
}

const GUARDRAIL_PATTERNS: RegExp[] = [
  /train through (the )?pain/i,
  /push through (the )?pain/i,
  /work through (the )?pain/i,
  /ignore (the |your )?pain/i,
  /no pain,? no gain/i,
  /no need (to see|for) a doctor/i,
  /don'?t need (to see )?a doctor/i,
  /skip the doctor/i,
  /\b(take|start|use|try)\s+(ibuprofen|paracetamol|acetaminophen|aspirin|painkillers?|steroids?|testosterone|hgh)\b/i,
];

/** Sub-1200-kcal dietary directives contradict the route guardrails. */
function hasUnsafeCalorieAdvice(text: string): boolean {
  const m = text.match(/(?:below|under|only|max(?:imum)? of|just)\s+(\d{3,4})\s*(?:kcal|calories|cal)\b/i);
  if (m && Number(m[1]) < 1200) return true;
  const direct = text.match(/\b(\d{3})\s*(?:kcal|calorie|cal)\s*(?:diet|per day|a day)/i);
  return !!direct && Number(direct[1]) < 1200;
}

export function violatesCoachGuardrails(text: string): boolean {
  return GUARDRAIL_PATTERNS.some((re) => re.test(text)) || hasUnsafeCalorieAdvice(text);
}

function sanitizeString(value: unknown, cap: number, state: { filtered: boolean }): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.slice(0, cap);
  if (violatesCoachGuardrails(trimmed)) {
    state.filtered = true;
    return COACH_SAFETY_FALLBACK;
  }
  return trimmed;
}

function sanitizeExercise(raw: unknown, state: { filtered: boolean }): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const ex = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const name = sanitizeString(ex.exercise, 200, state);
  if (name !== undefined) out.exercise = name;
  if (typeof ex.sets === 'number' && Number.isFinite(ex.sets)) out.sets = clampNumber('sets', ex.sets);
  if (typeof ex.reps === 'string' || typeof ex.reps === 'number') {
    out.reps = String(ex.reps).slice(0, 50);
  }
  if (typeof ex.targetWeightKg === 'number' && Number.isFinite(ex.targetWeightKg)) {
    out.targetWeightKg = clampNumber('targetWeightKg', ex.targetWeightKg);
  }
  if (typeof ex.restSeconds === 'number' && Number.isFinite(ex.restSeconds)) {
    out.restSeconds = clampNumber('restSeconds', ex.restSeconds);
  }
  const reason = sanitizeString(ex.reason, SHORT_STRING_CAP, state);
  if (reason !== undefined) out.reason = reason;
  return out;
}

export function validateCoachOutput(task: string, raw: unknown): CoachValidationResult | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const schema = TASK_SCHEMAS[task] ?? TASK_SCHEMAS.COACH_INSIGHT;
  const input = raw as Record<string, unknown>;
  const state = { filtered: false };
  const out: Record<string, unknown> = {};

  for (const [field, kind] of Object.entries(schema)) {
    const value = input[field];
    if (value === undefined) continue;
    switch (kind) {
      case 'string': {
        const s = sanitizeString(value, STRING_CAP, state);
        if (s !== undefined) out[field] = s;
        break;
      }
      case 'nullableString': {
        if (value === null) {
          out[field] = null;
          break;
        }
        const s = sanitizeString(value, STRING_CAP, state);
        if (s !== undefined) out[field] = s;
        break;
      }
      case 'number': {
        if (typeof value === 'number' && Number.isFinite(value)) {
          out[field] = clampNumber(field, value);
        }
        break;
      }
      case 'stringArray': {
        if (Array.isArray(value)) {
          out[field] = value
            .slice(0, MAX_LIST_ITEMS)
            .map((item) => sanitizeString(item, SHORT_STRING_CAP, state))
            .filter((s): s is string => s !== undefined);
        }
        break;
      }
      case 'exercises': {
        if (Array.isArray(value)) {
          out[field] = value
            .slice(0, MAX_EXERCISES)
            .map((ex) => sanitizeExercise(ex, state))
            .filter((ex): ex is Record<string, unknown> => ex !== null);
        }
        break;
      }
    }
  }

  return { data: out, safetyFiltered: state.filtered };
}
