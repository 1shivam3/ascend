/**
 * coach-actions.ts — the Coach AI Actions contract (Slice A, 2026-11-05).
 *
 * The chat model may attach ONE structured action to its reply. The
 * model never writes data: it proposes parameters, this module
 * validates them, and deterministic app machinery (the macro-goals
 * setter, the block engine) does the building after the user confirms.
 * Design: docs — coach-actions-design.md (owner order 2026-11-05).
 *
 * Validation policy (deliberate, keep in sync with the executor):
 *  - A KNOWN field carrying a wrong-typed or out-of-range value
 *    rejects the WHOLE action (returns null) — a half-valid action is
 *    worse than none, because the card would show numbers the user
 *    never asked for.
 *  - UNKNOWN extra keys are stripped, not rejected: providers add
 *    wrapper fields across versions, and an ignored extra key cannot
 *    change what the action does. The returned object is rebuilt from
 *    known fields only, so nothing unvalidated can ride along.
 *  - No coercion: a string "2500" is NOT the number 2500. JSON-mode
 *    models occasionally quote numbers; accepting them would hide a
 *    contract breach and, worse, accept "abc" through a parseFloat
 *    side door. Rejected actions degrade to a plain reply.
 *  - Integers where the domain is integral: calories and grams are
 *    whole units everywhere in the app, daysPerWeek is a count.
 */
import { LIMITATION_CHIPS, SESSION_LENGTH_OPTIONS } from './block-intake';

// ─────────────────────────────────────────────────────────────────────────────
// Shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface SetMacroGoalsAction {
  type: 'set_macro_goals';
  /** At least one of the four fields is always present (validator). */
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

export const PROGRAM_GOALS = ['muscle', 'strength', 'fat_loss', 'endurance', 'general'] as const;
export type ProgramGoal = (typeof PROGRAM_GOALS)[number];

export const PROGRAM_EQUIPMENT = ['full_gym', 'dumbbells', 'home_minimal', 'bodyweight'] as const;
export type ProgramEquipment = (typeof PROGRAM_EQUIPMENT)[number];

export const PROGRAM_EXPERIENCE = ['beginner', 'intermediate', 'advanced'] as const;
export type ProgramExperience = (typeof PROGRAM_EXPERIENCE)[number];

export interface ProposeProgramAction {
  type: 'propose_program';
  goal: ProgramGoal;
  daysPerWeek: number; // 2..6, integer
  sessionMinutes: number; // one of SESSION_LENGTH_OPTIONS (30|45|60|75|90)
  equipment: ProgramEquipment;
  experience: ProgramExperience;
  /** Limitation CHIP IDS from block-intake's LIMITATION_CHIPS only. */
  limitations?: string[];
}

export type CoachAction = SetMacroGoalsAction | ProposeProgramAction;

export type CoachActionType = CoachAction['type'];

// ─────────────────────────────────────────────────────────────────────────────
// Ranges (single source — the route validates server-side, the client
// re-validates before rendering a card; both use this module)
// ─────────────────────────────────────────────────────────────────────────────

/** 1200 kcal is also the app's hard safety floor for a daily target. */
export const MACRO_RANGES = {
  calories: { min: 1200, max: 6000 },
  proteinG: { min: 40, max: 400 },
  carbsG: { min: 0, max: 800 },
  fatG: { min: 20, max: 300 },
} as const;

const LIMITATION_CHIP_IDS: ReadonlySet<string> = new Set(LIMITATION_CHIPS.map((c) => c.id));

// ─────────────────────────────────────────────────────────────────────────────
// Validator
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isIntInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function isOneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v);
}

function validateMacroGoals(raw: Record<string, unknown>): SetMacroGoalsAction | null {
  const out: SetMacroGoalsAction = { type: 'set_macro_goals' };
  let present = 0;
  for (const field of ['calories', 'proteinG', 'carbsG', 'fatG'] as const) {
    const v = raw[field];
    if (v === undefined) continue;
    const range = MACRO_RANGES[field];
    if (!isIntInRange(v, range.min, range.max)) return null;
    out[field] = v;
    present += 1;
  }
  // An action that changes nothing is not an action.
  if (present === 0) return null;
  return out;
}

function validateProposeProgram(raw: Record<string, unknown>): ProposeProgramAction | null {
  if (!isOneOf(raw.goal, PROGRAM_GOALS)) return null;
  if (!isIntInRange(raw.daysPerWeek, 2, 6)) return null;
  if (
    typeof raw.sessionMinutes !== 'number' ||
    !(SESSION_LENGTH_OPTIONS as readonly number[]).includes(raw.sessionMinutes)
  ) {
    return null;
  }
  if (!isOneOf(raw.equipment, PROGRAM_EQUIPMENT)) return null;
  if (!isOneOf(raw.experience, PROGRAM_EXPERIENCE)) return null;

  let limitations: string[] | undefined;
  if (raw.limitations !== undefined) {
    if (!Array.isArray(raw.limitations)) return null;
    const seen = new Set<string>();
    for (const item of raw.limitations) {
      if (typeof item !== 'string' || !LIMITATION_CHIP_IDS.has(item)) return null;
      seen.add(item);
    }
    if (seen.size > 0) limitations = [...seen];
  }

  return {
    type: 'propose_program',
    goal: raw.goal,
    daysPerWeek: raw.daysPerWeek,
    sessionMinutes: raw.sessionMinutes,
    equipment: raw.equipment,
    experience: raw.experience,
    ...(limitations ? { limitations } : {}),
  };
}

/**
 * Strictly validate an unknown value as a CoachAction. Returns the
 * rebuilt action (known fields only) or null — callers treat null as
 * "no action", never as an error: the reply is served regardless.
 */
export function validateCoachAction(raw: unknown): CoachAction | null {
  if (!isRecord(raw)) return null;
  switch (raw.type) {
    case 'set_macro_goals':
      return validateMacroGoals(raw);
    case 'propose_program':
      return validateProposeProgram(raw);
    default:
      return null;
  }
}
