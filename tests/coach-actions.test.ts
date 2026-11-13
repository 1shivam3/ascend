/**
 * Coach AI Actions, Slice A (2026-11-05): validator accept/reject
 * matrix, executor apply/undo/stale semantics, pending-card lifecycle
 * (supersede + 30-min expiry), program build/apply through the block
 * system's own store paths, and coach-chat message backward compat.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { validateCoachAction } from '../src/lib/coach-actions';
import {
  applyMacroGoalsAction,
  applyProgramProposal,
  buildBlockIntakeFromAction,
  buildProgramProposalFromAction,
  COACH_ACTION_EXPIRY_MS,
  deriveActionState,
  readActionBase,
  macroGoalsBaseMatches,
  settlePendingActions,
  undoMacroGoals,
} from '../src/lib/coach-action-executor';
import { useStore } from '../src/lib/store';
import { getInitialCoachBlocksState } from '../src/lib/block-engine';
import {
  partializeCoachChatState,
  useCoachChatStore,
  type CoachChatMessage,
} from '../src/lib/coach-chat-store';
import type { MacroGoals, WeeklySchedule } from '../src/lib/types';
import { buildCoachChatContext, type CoachChatUserData } from '../src/lib/coach-chat';

// ─────────────────────────────────────────────────────────────────────────────
// Validator
// ─────────────────────────────────────────────────────────────────────────────

describe('validateCoachAction: set_macro_goals', () => {
  it('accepts a single-field action', () => {
    expect(validateCoachAction({ type: 'set_macro_goals', proteinG: 160 })).toEqual({
      type: 'set_macro_goals',
      proteinG: 160,
    });
  });

  it('accepts all four fields at range midpoints', () => {
    expect(
      validateCoachAction({ type: 'set_macro_goals', calories: 2500, proteinG: 150, carbsG: 260, fatG: 80 })
    ).toEqual({ type: 'set_macro_goals', calories: 2500, proteinG: 150, carbsG: 260, fatG: 80 });
  });

  it.each([
    ['calories', 1200, true],
    ['calories', 6000, true],
    ['calories', 1199, false],
    ['calories', 6001, false],
    ['proteinG', 40, true],
    ['proteinG', 400, true],
    ['proteinG', 39, false],
    ['proteinG', 401, false],
    ['carbsG', 0, true],
    ['carbsG', 800, true],
    ['carbsG', -1, false],
    ['carbsG', 801, false],
    ['fatG', 20, true],
    ['fatG', 300, true],
    ['fatG', 19, false],
    ['fatG', 301, false],
  ] as const)('boundary: %s = %i → valid %s', (field, value, ok) => {
    const result = validateCoachAction({ type: 'set_macro_goals', [field]: value });
    expect(result !== null).toBe(ok);
  });

  it('rejects an action with no fields', () => {
    expect(validateCoachAction({ type: 'set_macro_goals' })).toBeNull();
  });

  it('rejects string numbers — no coercion', () => {
    expect(validateCoachAction({ type: 'set_macro_goals', calories: '2500' })).toBeNull();
  });

  it('rejects non-integer, NaN, and null values', () => {
    expect(validateCoachAction({ type: 'set_macro_goals', proteinG: 160.5 })).toBeNull();
    expect(validateCoachAction({ type: 'set_macro_goals', proteinG: NaN })).toBeNull();
    expect(validateCoachAction({ type: 'set_macro_goals', proteinG: null })).toBeNull();
  });

  it('strips unknown extra keys instead of rejecting', () => {
    const result = validateCoachAction({
      type: 'set_macro_goals',
      proteinG: 160,
      note: 'model commentary',
      confidence: 0.9,
    });
    expect(result).toEqual({ type: 'set_macro_goals', proteinG: 160 });
  });
});

describe('validateCoachAction: propose_program', () => {
  const valid = {
    type: 'propose_program',
    goal: 'muscle',
    daysPerWeek: 4,
    sessionMinutes: 60,
    equipment: 'full_gym',
    experience: 'intermediate',
  };

  it('accepts a complete intake', () => {
    expect(validateCoachAction(valid)).toEqual(valid);
  });

  it('accepts every session length the engine offers', () => {
    for (const sessionMinutes of [30, 45, 60, 75, 90]) {
      expect(validateCoachAction({ ...valid, sessionMinutes })).not.toBeNull();
    }
  });

  it('rejects a session length the engine does not offer', () => {
    expect(validateCoachAction({ ...valid, sessionMinutes: 50 })).toBeNull();
  });

  it.each([2, 6])('accepts daysPerWeek %i', (daysPerWeek) => {
    expect(validateCoachAction({ ...valid, daysPerWeek })).not.toBeNull();
  });

  it.each([1, 7, 3.5, '4'])('rejects daysPerWeek %s', (daysPerWeek) => {
    expect(validateCoachAction({ ...valid, daysPerWeek })).toBeNull();
  });

  it.each(['hypertrophy', 'MUSCLE', 'build_muscle', ''])('rejects goal %s (chat vocabulary only)', (goal) => {
    expect(validateCoachAction({ ...valid, goal })).toBeNull();
  });

  it.each(['barbell_only', 'gym', 'home'])('rejects equipment %s (chat vocabulary only)', (equipment) => {
    expect(validateCoachAction({ ...valid, equipment })).toBeNull();
  });

  it('rejects an unknown experience value', () => {
    expect(validateCoachAction({ ...valid, experience: 'expert' })).toBeNull();
  });

  it('rejects a missing required field', () => {
    const { goal: _goal, ...rest } = valid;
    expect(validateCoachAction(rest)).toBeNull();
  });

  it('accepts known limitation chip ids and dedupes them', () => {
    const result = validateCoachAction({ ...valid, limitations: ['knee', 'low_back', 'knee'] });
    expect(result).toEqual({ ...valid, limitations: ['knee', 'low_back'] });
  });

  it('rejects an unknown limitation id', () => {
    expect(validateCoachAction({ ...valid, limitations: ['toe'] })).toBeNull();
  });

  it('rejects non-array limitations and label-shaped values', () => {
    expect(validateCoachAction({ ...valid, limitations: 'knee' })).toBeNull();
    expect(validateCoachAction({ ...valid, limitations: ['Knee'] })).toBeNull();
    expect(validateCoachAction({ ...valid, limitations: ['Low back'] })).toBeNull();
  });

  it('an empty limitations array is treated as absent', () => {
    expect(validateCoachAction({ ...valid, limitations: [] })).toEqual(valid);
  });
});

describe('validateCoachAction: envelope', () => {
  it.each([null, undefined, 'set_macro_goals', 42, [], [{ type: 'set_macro_goals', proteinG: 1 }]])(
    'rejects non-object input %s',
    (raw) => {
      expect(validateCoachAction(raw)).toBeNull();
    }
  );

  it('rejects unknown action types', () => {
    expect(validateCoachAction({ type: 'delete_account' })).toBeNull();
    expect(validateCoachAction({ type: 'set_macro_goals ' })).toBeNull();
    expect(validateCoachAction({})).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Executor: macro goals
// ─────────────────────────────────────────────────────────────────────────────

const GOALS: MacroGoals = { calories: 2500, proteinG: 150, carbsG: 260, fatG: 80 };

const NULL_SCHEDULE: WeeklySchedule = {
  monday: { workoutPlanId: 'rest' },
  tuesday: { workoutPlanId: 'rest' },
  wednesday: { workoutPlanId: 'rest' },
  thursday: { workoutPlanId: 'rest' },
  friday: { workoutPlanId: 'rest' },
  saturday: { workoutPlanId: 'rest' },
  sunday: { workoutPlanId: 'rest' },
};

function seedStore(overrides: Record<string, unknown> = {}) {
  useStore.setState({
    macroGoals: { ...GOALS },
    profile: null,
    trainingProfile: null,
    plannedWorkouts: [],
    weeklySchedule: { ...NULL_SCHEDULE },
    coachBlocks: getInitialCoachBlocksState(),
    athleteModel: null,
    prs: [],
    workouts: [],
    ...overrides,
  } as never);
}

beforeEach(() => seedStore());

describe('executor: macro goals apply / undo / stale', () => {
  it('base matches only when the live goals equal the snapshot', () => {
    expect(macroGoalsBaseMatches({ ...GOALS })).toBe(true);
    expect(macroGoalsBaseMatches({ ...GOALS, proteinG: 151 })).toBe(false);
    expect(macroGoalsBaseMatches(null)).toBe(false);
    seedStore({ macroGoals: null });
    expect(macroGoalsBaseMatches(null)).toBe(true);
  });

  it('applies only the named fields and keeps the rest', () => {
    const result = applyMacroGoalsAction({ type: 'set_macro_goals', proteinG: 180 }, { ...GOALS });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt.previous).toEqual(GOALS);
    expect(result.receipt.applied).toEqual({ ...GOALS, proteinG: 180 });
    expect(useStore.getState().macroGoals).toEqual({ ...GOALS, proteinG: 180 });
  });

  it('refuses as stale when the live goals moved since the snapshot', () => {
    useStore.getState().setMacroGoals({ ...GOALS, calories: 2200 });
    const result = applyMacroGoalsAction({ type: 'set_macro_goals', proteinG: 180 }, { ...GOALS });
    expect(result).toEqual({ ok: false, stale: true });
    // Nothing was written.
    expect(useStore.getState().macroGoals).toEqual({ ...GOALS, calories: 2200 });
  });

  it('undo restores the previous goals verbatim', () => {
    const result = applyMacroGoalsAction({ type: 'set_macro_goals', proteinG: 180 }, { ...GOALS });
    if (!result.ok) throw new Error('apply failed');
    expect(undoMacroGoals(result.receipt)).toEqual({ ok: true });
    expect(useStore.getState().macroGoals).toEqual(GOALS);
  });

  it('undo refuses when the goals changed again after the apply', () => {
    const result = applyMacroGoalsAction({ type: 'set_macro_goals', proteinG: 180 }, { ...GOALS });
    if (!result.ok) throw new Error('apply failed');
    useStore.getState().setMacroGoals({ ...GOALS, proteinG: 200 });
    expect(undoMacroGoals(result.receipt)).toEqual({ ok: false, stale: true });
    expect(useStore.getState().macroGoals?.proteinG).toBe(200);
  });

  it('with no existing goals, missing fields come from the recommended base', () => {
    // Task 1.1: the recommended base derives from the profile's body
    // stats, so this path now requires REAL stats on the profile (a
    // null/placeholder profile blocks a partial draft instead — see
    // tests/body-stats.test.ts).
    seedStore({
      macroGoals: null,
      profile: {
        id: 'guest_test',
        name: 'Test',
        gender: 'male',
        bodyweightKg: 70,
        bodyweightLbs: 154.3,
        heightCm: 175,
        bodyweightSource: 'user',
        heightSource: 'user',
        unit: 'kg',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const result = applyMacroGoalsAction({ type: 'set_macro_goals', proteinG: 170 }, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt.previous).toBeNull();
    expect(result.receipt.applied.proteinG).toBe(170);
    expect(result.receipt.applied.calories).toBeGreaterThanOrEqual(1200);
    // Undo returns the user to "no goals set".
    expect(undoMacroGoals(result.receipt)).toEqual({ ok: true });
    expect(useStore.getState().macroGoals).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Executor: programs through the block system's own paths
// ─────────────────────────────────────────────────────────────────────────────

describe('executor: program proposal via proposeCoachBlock / approveBlockProposal', () => {
  const action = {
    type: 'propose_program' as const,
    goal: 'muscle' as const,
    daysPerWeek: 4,
    sessionMinutes: 60,
    equipment: 'full_gym' as const,
    experience: 'intermediate' as const,
  };

  it('translates the chat vocabulary into a BlockIntake', () => {
    const intake = buildBlockIntakeFromAction({ ...action, limitations: ['knee'] });
    expect(intake.goal).toBe('build_muscle');
    expect(intake.equipment).toBe('full_gym');
    expect(intake.daysPerWeek).toBe(4);
    expect(intake.sessionMinutes).toBe(60);
    // Chip ids become the labels the injury machinery reads.
    expect(intake.limitations).toEqual(['Knee']);
  });

  it('maps every chat equipment value onto an app tier', () => {
    expect(buildBlockIntakeFromAction({ ...action, equipment: 'dumbbells' }).equipment).toBe('home_dumbbells');
    expect(buildBlockIntakeFromAction({ ...action, equipment: 'home_minimal' }).equipment).toBe('home_dumbbells');
    expect(buildBlockIntakeFromAction({ ...action, equipment: 'bodyweight' }).equipment).toBe('bodyweight_only');
  });

  it('builds a pending proposal and applies it through the accept path', () => {
    const proposal = buildProgramProposalFromAction(action);
    expect(proposal.days).toHaveLength(4);
    // The proposal is the store's pending one — same as the modal flow.
    expect(useStore.getState().coachBlocks.pendingProposal?.id).toBe(proposal.id);
    // Proposing alone changed no plans.
    expect(useStore.getState().plannedWorkouts).toHaveLength(0);

    expect(applyProgramProposal(proposal)).toBe(true);
    const after = useStore.getState();
    expect(after.plannedWorkouts.length).toBeGreaterThan(0);
    expect(after.coachBlocks.activeBlock?.name).toBe(proposal.name);
    expect(after.coachBlocks.pendingProposal).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle: supersede + expiry
// ─────────────────────────────────────────────────────────────────────────────

const NOW = 1_760_000_000_000;

function msg(partial: Partial<CoachChatMessage>): CoachChatMessage {
  // Test builder seam: callers pass complete action-field sets
  // (the §28 union is enforced at the app's own construction sites).
  return { role: 'assistant', content: '…', ...partial } as CoachChatMessage;
}

const macroAction = { type: 'set_macro_goals' as const, proteinG: 160 };
const programAction = {
  type: 'propose_program' as const,
  goal: 'muscle' as const,
  daysPerWeek: 4,
  sessionMinutes: 60,
  equipment: 'full_gym' as const,
  experience: 'intermediate' as const,
};

describe('executor: pending-card lifecycle', () => {
  it('a newer pending action supersedes the older one of the same type only', () => {
    const messages = [
      msg({ action: macroAction, actionState: 'pending', ts: NOW }),
      msg({ action: programAction, actionState: 'pending', ts: NOW + 500 }),
      msg({ action: macroAction, actionState: 'pending', ts: NOW + 1000 }),
    ];
    const settled = settlePendingActions(messages, NOW + 2000);
    expect(settled[0].actionState).toBe('superseded');
    expect(settled[1].actionState).toBe('pending');
    expect(settled[2].actionState).toBe('pending');
  });

  it('a pending action older than 30 minutes settles to stale', () => {
    const messages = [msg({ action: macroAction, actionState: 'pending', ts: NOW })];
    const settled = settlePendingActions(messages, NOW + COACH_ACTION_EXPIRY_MS + 1);
    expect(settled[0].actionState).toBe('stale');
    const fresh = settlePendingActions(messages, NOW + COACH_ACTION_EXPIRY_MS - 1);
    expect(fresh[0].actionState).toBe('pending');
    expect(fresh).toBe(messages); // untouched → same reference
  });

  it('deriveActionState reports expiry without mutating (§28: the one derivation)', () => {
    const m = msg({ action: macroAction, actionState: 'pending', ts: NOW });
    expect(deriveActionState(m, { now: NOW + COACH_ACTION_EXPIRY_MS + 1 })).toBe('stale');
    expect(deriveActionState(m, { now: NOW + 1000 })).toBe('pending');
    expect(m.actionState).toBe('pending');
  });

  it('§28: derive folds base-moved into stale, and readActionBase reads both capture shapes', () => {
    const goals = { calories: 2000, proteinG: 150, carbsG: 200, fatG: 70 };
    const tagged = msg({
      action: macroAction, actionState: 'pending', ts: NOW,
      actionBase: { status: 'captured', goals: { ...goals } },
    } as any);
    expect(readActionBase(tagged)).toEqual(goals);
    expect(deriveActionState(tagged, { now: NOW + 1000, liveGoals: goals })).toBe('pending');
    expect(
      deriveActionState(tagged, { now: NOW + 1000, liveGoals: { ...goals, calories: 2200 } })
    ).toBe('stale');
    // Legacy raw shapes: the goals object itself, and null.
    const legacy = msg({
      action: macroAction, actionState: 'pending', ts: NOW,
      actionBase: { ...goals },
    } as any);
    expect(readActionBase(legacy)).toEqual(goals);
    const legacyNull = msg({
      action: macroAction, actionState: 'pending', ts: NOW, actionBase: null,
    } as any);
    expect(readActionBase(legacyNull)).toBeNull();
    const uncaptured = msg({ action: macroAction, actionState: 'pending', ts: NOW });
    expect(readActionBase(uncaptured)).toBeUndefined();
  });

  it("§28: the legacy undone flag derives (and settles) to the 'undone' state", () => {
    const legacy = msg({ action: macroAction, actionState: 'applied', ts: NOW, undone: true } as any);
    expect(deriveActionState(legacy, { now: NOW })).toBe('undone');
    const settled = settlePendingActions([legacy], NOW);
    expect(settled[0].actionState).toBe('undone');
  });

  it('applied and dismissed actions are never settled', () => {
    const messages = [
      msg({ action: macroAction, actionState: 'applied', ts: NOW }),
      msg({ action: macroAction, actionState: 'dismissed', ts: NOW }),
    ];
    expect(settlePendingActions(messages, NOW + COACH_ACTION_EXPIRY_MS * 3)).toBe(messages);
  });

  it('messages without actions pass through untouched', () => {
    const messages = [msg({}), msg({ role: 'user', content: 'hi' })];
    expect(settlePendingActions(messages, NOW)).toBe(messages);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Context: current macro goals reach the model in full
// ─────────────────────────────────────────────────────────────────────────────

function bareUserData(overrides: Partial<CoachChatUserData>): CoachChatUserData {
  return {
    userName: null,
    bodyweightKg: null,
    unit: 'kg',
    goal: null,
    experience: null,
    daysPerWeek: null,
    athleteFacts: [],
    lifts: [],
    painEpisodes: [],
    flaggedFamilies: [],
    activeBlock: null,
    adoptedPlanNames: [],
    todaySession: null,
    recentWorkouts: [],
    prs: [],
    readiness: null,
    perMuscle: [],
    weeklyReviews: [],
    mealsToday: null,
    macroGoals: null,
    bodyMetricsLatest: null,
    checkinToday: null,
    ...overrides,
  };
}

describe('context: macro goals are first-class context', () => {
  it('renders all four goals even when nothing was logged today', () => {
    const ctx = buildCoachChatContext(
      bareUserData({ macroGoals: { calories: 2500, proteinG: 150, carbsG: 260, fatG: 80 } })
    );
    expect(ctx.contextText).toContain('CURRENT MACRO GOALS');
    expect(ctx.contextText).toContain('2500 kcal');
    expect(ctx.contextText).toContain('150 g protein');
    expect(ctx.contextText).toContain('260 g carbs');
    expect(ctx.contextText).toContain('80 g fat');
  });

  it('omits carbs/fat gracefully when the stored goals lack them', () => {
    const ctx = buildCoachChatContext(bareUserData({ macroGoals: { calories: 2500, proteinG: 150 } }));
    expect(ctx.contextText).toContain('CURRENT MACRO GOALS');
    expect(ctx.contextText).not.toContain('g carbs');
    expect(ctx.contextText).not.toContain('g fat');
  });

  it('no goals set → no macro-goals section (nothing invented)', () => {
    const ctx = buildCoachChatContext(bareUserData({ macroGoals: null }));
    expect(ctx.contextText).not.toContain('CURRENT MACRO GOALS');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Message store: backward compatibility
// ─────────────────────────────────────────────────────────────────────────────

describe('coach-chat store: Slice A fields are backward compatible', () => {
  beforeEach(() => {
    useCoachChatStore.getState().clearCoachChat();
  });

  it('pre-Slice-A persisted messages (no action fields) load and round-trip', () => {
    const oldThread: CoachChatMessage[] = [
      { role: 'user', content: 'Why did my squat stall?' },
      { role: 'assistant', content: 'Based on your last 3 sessions…', evidence: ['Squat 100 kg'] },
    ];
    useCoachChatStore.getState().setMessages(oldThread);
    const slice = partializeCoachChatState(useCoachChatStore.getState());
    const roundTripped = JSON.parse(JSON.stringify(slice)) as typeof slice;
    expect(roundTripped.messages).toEqual(oldThread);
    expect(roundTripped.messages[1].action).toBeUndefined();
  });

  it('action-carrying messages persist through the same slice', () => {
    const withAction: CoachChatMessage = {
      role: 'assistant',
      content: 'Drafted.',
      action: macroAction,
      actionState: 'applied',
      ts: NOW,
      appliedSnapshot: { previous: { ...GOALS }, applied: { ...GOALS, proteinG: 160 } },
    };
    useCoachChatStore.getState().setMessages([withAction]);
    const slice = partializeCoachChatState(useCoachChatStore.getState());
    const roundTripped = JSON.parse(JSON.stringify(slice)) as typeof slice;
    expect(roundTripped.messages[0]).toEqual(withAction);
  });
});
