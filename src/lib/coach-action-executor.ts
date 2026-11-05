/**
 * coach-action-executor.ts — applies validated CoachActions (Slice A).
 *
 * Two hard rules, from the design brief:
 *  1. NEVER blind-apply over a change. Every apply is version-checked
 *     against the snapshot the card was rendered from; a mismatch
 *     reports `stale` and writes nothing.
 *  2. NO parallel apply paths. Macro goals go through the store's own
 *     `setMacroGoals`; programs are built by the store's own
 *     `proposeCoachBlock` (the exact call CoachBlockModal makes, with
 *     its engine-input assembly) and applied through
 *     `approveBlockProposal` (the modal's accept path, including its
 *     pending-id trust rule and 0-plan refusal). This module only
 *     translates the action vocabulary into the app's.
 *
 * Store access follows the hooks-free pattern of health-sync.ts /
 * local-notifications.ts: `useStore.getState()` at call time.
 */
import { useStore } from './store';
import type { AthleteGoal, MacroGoals } from './types';
import type { EquipmentAccess } from './workout-engine';
import { calculateRecommendedMacroGoals } from './macros';
import { DEFAULT_BODYWEIGHT_KG } from './defaults';
import { hasRealBodyStats } from './body-stats';
import { buildIntakePrefill, limitationLabel, type BlockIntake } from './block-intake';
import type { BlockProposal } from './block-engine';
import type {
  CoachActionType,
  ProposeProgramAction,
  SetMacroGoalsAction,
} from './coach-actions';
import type { CoachChatMessage } from './coach-chat-store';

/** Pending action cards expire after 30 minutes (design brief). */
export const COACH_ACTION_EXPIRY_MS = 30 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Macro goals: base check, apply, undo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The user-facing fields a base check compares. The informational
 * derivation fields (maintenanceCalories / calorieDelta) are excluded:
 * they are recomputed on apply, never a reason to call a card stale.
 */
function macroFieldsEqual(a: MacroGoals | null, b: MacroGoals | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.calories === b.calories &&
    a.proteinG === b.proteinG &&
    a.carbsG === b.carbsG &&
    a.fatG === b.fatG
  );
}

/** True when the live macro goals still equal the card's snapshot. */
export function macroGoalsBaseMatches(snapshot: MacroGoals | null): boolean {
  return macroFieldsEqual(useStore.getState().macroGoals, snapshot);
}

/** The starting point when the user has no goals yet: the app's own
 * recommended-goals calculation over their profile — never an
 * invented number. Only reached when the profile's body stats are
 * real (applyMacroGoalsAction gates the placeholder case). */
function recommendedBase(): MacroGoals {
  const state = useStore.getState();
  const profile = state.profile;
  return calculateRecommendedMacroGoals(
    profile?.bodyweightKg ?? DEFAULT_BODYWEIGHT_KG,
    state.trainingProfile?.goal ?? 'build_muscle',
    profile?.gender ?? 'male',
    profile?.heightCm,
    profile?.age,
    state.trainingProfile?.activityLevel ?? 'light'
  );
}

export interface MacroGoalsReceipt {
  previous: MacroGoals | null;
  applied: MacroGoals;
}

export type ApplyMacroGoalsResult =
  | { ok: true; receipt: MacroGoalsReceipt }
  | { ok: false; stale: true }
  /** Task 1.1: no stored goals and placeholder body stats — completing
   * the goal set would require deriving numbers from stats the user
   * never entered. Nothing is written. */
  | { ok: false; stale: false; blocked: 'needs-body-stats' };

/**
 * Apply a set_macro_goals action against the snapshot the card was
 * rendered from. Fields the action omits keep their current values.
 * On success the receipt carries the previous goals verbatim so the
 * card can offer Undo; on a base mismatch nothing is written.
 */
export function applyMacroGoalsAction(
  action: SetMacroGoalsAction,
  baseSnapshot: MacroGoals | null
): ApplyMacroGoalsResult {
  const state = useStore.getState();
  if (!macroGoalsBaseMatches(baseSnapshot)) return { ok: false, stale: true };

  const previous = state.macroGoals ? { ...state.macroGoals } : null;
  let base: MacroGoals;
  if (previous) {
    base = previous;
  } else if (hasRealBodyStats(state.profile)) {
    base = recommendedBase();
  } else {
    // Task 1.1: no stored goals and the profile's weight/height are
    // placeholders — recommendedBase() would derive the unnamed
    // fields from numbers the user never entered. Apply only when
    // the action itself names BOTH required fields; unnamed optional
    // fields stay unset instead of being filled with inventions.
    if (action.calories === undefined || action.proteinG === undefined) {
      return { ok: false, stale: false, blocked: 'needs-body-stats' };
    }
    base = { calories: action.calories, proteinG: action.proteinG };
  }
  const applied: MacroGoals = {
    ...base,
    ...(action.calories !== undefined ? { calories: action.calories } : {}),
    ...(action.proteinG !== undefined ? { proteinG: action.proteinG } : {}),
    ...(action.carbsG !== undefined ? { carbsG: action.carbsG } : {}),
    ...(action.fatG !== undefined ? { fatG: action.fatG } : {}),
  };
  // Keep the derivation fields truthful after the write: maintenance
  // is a property of the user, not of the target; the delta follows.
  if (applied.maintenanceCalories !== undefined) {
    applied.calorieDelta = applied.calories - applied.maintenanceCalories;
  }

  state.setMacroGoals(applied);
  return { ok: true, receipt: { previous, applied } };
}

export type UndoMacroGoalsResult = { ok: true } | { ok: false; stale: true };

/**
 * Restore the receipt's previous goals — itself a version-checked
 * write: if the live goals no longer equal what the action applied
 * (the user changed them again since), undo refuses rather than
 * clobbering the newer change.
 */
export function undoMacroGoals(receipt: MacroGoalsReceipt): UndoMacroGoalsResult {
  const state = useStore.getState();
  if (!macroFieldsEqual(state.macroGoals, receipt.applied)) {
    return { ok: false, stale: true };
  }
  state.setMacroGoals(receipt.previous ? { ...receipt.previous } : null);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Programs: translate the action, reuse the block system's own paths
// ─────────────────────────────────────────────────────────────────────────────

/** Action goal vocabulary → the app's AthleteGoal vocabulary. */
const GOAL_MAP: Record<ProposeProgramAction['goal'], AthleteGoal> = {
  muscle: 'build_muscle',
  strength: 'get_stronger',
  fat_loss: 'lose_fat',
  endurance: 'stamina',
  general: 'general_fitness',
};

/**
 * Action equipment vocabulary → the app's EquipmentAccess. The app
 * has no separate minimal-home tier: `home_minimal` maps to
 * `home_dumbbells` (the home tier; the engine already degrades
 * dumbbell picks to bodyweight fallbacks where a pattern has none).
 */
const EQUIPMENT_MAP: Record<ProposeProgramAction['equipment'], EquipmentAccess> = {
  full_gym: 'full_gym',
  dumbbells: 'home_dumbbells',
  home_minimal: 'home_dumbbells',
  bodyweight: 'bodyweight_only',
};

/**
 * Build the BlockIntake for an action. Top lifts come from the SAME
 * prefill CoachBlockModal seeds from (PRs first, history second), so
 * a chat-built proposal is loaded from exactly the numbers the modal
 * would have used. Limitations: the action's chip ids, rendered to
 * the labels the injury machinery reads; when the action carries
 * none, the prefill's known limitations stand (the modal's default).
 */
export function buildBlockIntakeFromAction(action: ProposeProgramAction): BlockIntake {
  const state = useStore.getState();
  const prefill = buildIntakePrefill({
    profile: state.profile,
    trainingProfile: state.trainingProfile,
    athleteModel: state.athleteModel,
    prs: state.prs,
    workouts: state.workouts,
  });
  const limitations =
    action.limitations && action.limitations.length > 0
      ? [...new Set(action.limitations.map((id) => limitationLabel(id)))]
      : prefill.intake.limitations;
  return {
    goal: GOAL_MAP[action.goal],
    daysPerWeek: action.daysPerWeek,
    sessionMinutes: action.sessionMinutes,
    equipment: EQUIPMENT_MAP[action.equipment],
    experience: action.experience,
    limitations,
    topLifts: prefill.intake.topLifts,
  };
}

/**
 * Build the proposal for an action via the store's proposeCoachBlock
 * — the identical call CoachBlockModal's Generate button makes, so
 * engine-input assembly (athlete model, weekday continuity, nutrition
 * phase, disliked exercises) cannot drift between the two surfaces.
 * Side effect, by design: the proposal becomes the store's pending
 * proposal, which is what the accept path below trusts.
 */
export function buildProgramProposalFromAction(action: ProposeProgramAction): BlockProposal {
  return useStore.getState().proposeCoachBlock(buildBlockIntakeFromAction(action));
}

/**
 * Apply a program proposal through the modal's own accept path
 * (approveBlockProposal: pending-id trust rule, refusal of a 0-plan
 * materialization, schedule rebuild). Returns its verdict verbatim.
 */
export function applyProgramProposal(proposal: BlockProposal): boolean {
  return useStore.getState().approveBlockProposal(proposal);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending-card lifecycle (pure — operate on the messages array)
// ─────────────────────────────────────────────────────────────────────────────

/** Effective state of one message's action at `now`: a pending action
 * older than the expiry reads as stale, even before anything rewrites
 * the array. Messages without a timestamp never expire (pre-Slice-A
 * threads carry none — and carry no actions either). */
export function effectiveActionState(
  message: CoachChatMessage,
  now: number
): CoachChatMessage['actionState'] | undefined {
  if (!message.action || !message.actionState) return undefined;
  if (
    message.actionState === 'pending' &&
    message.ts !== undefined &&
    now - message.ts > COACH_ACTION_EXPIRY_MS
  ) {
    return 'stale';
  }
  return message.actionState;
}

/**
 * Settle a thread's pending actions at `now`:
 *  - expired pendings (older than COACH_ACTION_EXPIRY_MS) become
 *    'stale' — the state enum has no separate expired value; the card
 *    distinguishes "expired" from "changed underneath you" by age;
 *  - per action TYPE, only the newest pending survives — older ones
 *    become 'superseded' (a newer draft replaces them, visibly).
 * Returns the original array reference when nothing changed.
 */
export function settlePendingActions(
  messages: CoachChatMessage[],
  now: number
): CoachChatMessage[] {
  const newestPendingByType = new Map<CoachActionType, number>();
  messages.forEach((m, i) => {
    if (m.action && m.actionState === 'pending') newestPendingByType.set(m.action.type, i);
  });

  let changed = false;
  const next = messages.map((m, i) => {
    if (!m.action || m.actionState !== 'pending') return m;
    if (m.ts !== undefined && now - m.ts > COACH_ACTION_EXPIRY_MS) {
      changed = true;
      return { ...m, actionState: 'stale' as const };
    }
    if (newestPendingByType.get(m.action.type) !== i) {
      changed = true;
      return { ...m, actionState: 'superseded' as const };
    }
    return m;
  });
  return changed ? next : messages;
}
