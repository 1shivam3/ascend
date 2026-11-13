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
import {
  isMinorAge,
  minorMaintenanceFor,
  MINOR_MAINTENANCE_TOLERANCE_KCAL,
} from './minor-targets';
import { DEFAULT_BODYWEIGHT_KG } from './defaults';
import { hasRealBodyStats } from './body-stats';
import { buildIntakePrefill, limitationLabel, type BlockIntake } from './block-intake';
import type { BlockProposal } from './block-engine';
import type {
  CoachActionType,
  ProposeProgramAction,
  SetMacroGoalsAction,
} from './coach-actions';
import type { CoachActionState, CoachChatMessage } from './coach-chat-store';

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
  | { ok: false; stale: false; blocked: 'needs-body-stats' }
  /** Phase 3 (Task 3.1): the user is 13–17 and the action's calories
   * would move their target off maintenance. Minors are
   * maintenance-only; nothing is written. (The store's setMacroGoals
   * clamp would catch the write anyway — this blocked state exists
   * so the card can say why, honestly, instead of silently applying
   * different numbers than the ones it displayed.) */
  | { ok: false; stale: false; blocked: 'minor-maintenance-only' };

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

  // Phase 3 (Task 3.1): minor maintenance guard. Only the action's
  // CALORIES are judged — gram-only actions keep the stored calorie
  // target, which the store clamp already holds at maintenance.
  // Maintenance comes from the stored goals' own derivation field
  // when present (it is a property of the user), else from the
  // profile via the engine helper; when neither exists there is no
  // honest band to judge against and the store clamp remains the
  // backstop.
  if (isMinorAge(state.profile?.age) && action.calories !== undefined) {
    const maintenance =
      previous?.maintenanceCalories ??
      minorMaintenanceFor(state.profile, state.trainingProfile?.activityLevel);
    if (
      maintenance != null &&
      Math.abs(action.calories - maintenance) > MINOR_MAINTENANCE_TOLERANCE_KCAL
    ) {
      return { ok: false, stale: false, blocked: 'minor-maintenance-only' };
    }
  }

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

/**
 * §28: the captured base of a message, normalized. Returns
 * `undefined` when nothing has been captured yet, else the
 * proposal-time goals (null = none existed). Reads BOTH the
 * current tagged capture and the legacy raw shape (a persisted
 * MacroGoals object, or null) — legacy threads keep their
 * version-check base forever, no storage migration needed.
 */
export function readActionBase(
  message: CoachChatMessage
): MacroGoals | null | undefined {
  const raw: unknown = (message as { actionBase?: unknown }).actionBase;
  if (raw === undefined) return undefined;
  if (raw === null) return null; // legacy: captured, no goals
  if (typeof raw === 'object') {
    const tagged = raw as { status?: unknown; goals?: MacroGoals | null };
    if (tagged.status === 'captured') return tagged.goals ?? null;
    return raw as MacroGoals; // legacy: the goals object itself
  }
  return undefined;
}

/**
 * §28: THE one derivation of an action's effective state — the
 * render path and the settle pass both use it, so stored and
 * derived can no longer disagree (previously render derived
 * expiry only, the card derived base-moved only, and settle
 * wrote a third combination).
 *
 * Rules, in order:
 *  - no action → undefined;
 *  - legacy undone: a stored 'applied' beside the pre-§28
 *    `undone: true` flag reads as the 'undone' state;
 *  - terminal stored states (applied / dismissed / superseded /
 *    stale / undone) stand as stored;
 *  - a pending action is 'stale' when expired (older than
 *    COACH_ACTION_EXPIRY_MS — messages without a timestamp never
 *    expire), 'superseded' when the caller (the settle pass,
 *    which can see the thread) says a newer pending of the same
 *    type exists, and 'stale' when a set_macro_goals base was
 *    captured and the live goals have moved off it;
 *  - otherwise 'pending'.
 */
export function deriveActionState(
  message: CoachChatMessage,
  ctx: { now: number; liveGoals?: MacroGoals | null; superseded?: boolean }
): CoachActionState | undefined {
  if (!message.action) return undefined;
  const stored = message.actionState;
  if (
    stored === 'applied' &&
    (message as { undone?: unknown }).undone === true
  ) {
    return 'undone';
  }
  if (stored !== undefined && stored !== 'pending') return stored;
  // pending (or, defensively, an action whose state a legacy
  // write lost — treated as pending so it can still settle).
  if (message.ts !== undefined && ctx.now - message.ts > COACH_ACTION_EXPIRY_MS) {
    return 'stale';
  }
  if (ctx.superseded) return 'superseded';
  if (message.action.type === 'set_macro_goals' && ctx.liveGoals !== undefined) {
    const base = readActionBase(message);
    if (base !== undefined && !macroFieldsEqual(ctx.liveGoals, base)) {
      return 'stale';
    }
  }
  return 'pending';
}

/**
 * Settle a thread's action states: write back whatever
 * deriveActionState derives (expired → 'stale' — the card
 * distinguishes "expired" from "changed underneath you" by age;
 * older same-type pendings → 'superseded'; base-moved macro
 * pendings → 'stale'; legacy undone flags → the 'undone' state).
 * Returns the original array reference when nothing changed.
 */
export function settlePendingActions(
  messages: CoachChatMessage[],
  now: number,
  liveGoals?: MacroGoals | null
): CoachChatMessage[] {
  const newestPendingByType = new Map<CoachActionType, number>();
  messages.forEach((m, i) => {
    if (m.action && m.actionState === 'pending') newestPendingByType.set(m.action.type, i);
  });

  let changed = false;
  const next = messages.map((m, i) => {
    if (!m.action) return m;
    const derived = deriveActionState(m, {
      now,
      liveGoals,
      superseded:
        m.actionState === 'pending' &&
        newestPendingByType.get(m.action.type) !== i,
    });
    if (derived === undefined || derived === m.actionState) return m;
    changed = true;
    return { ...m, actionState: derived };
  });
  return changed ? next : messages;
}
