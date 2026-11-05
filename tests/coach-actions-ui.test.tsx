import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import CoachMarkdown from '../src/components/CoachMarkdown';
import CoachActionCard, {
  applyMacroFromCard,
  applyProgramFromCard,
  captureActionBasePatch,
  isProgramRefusal,
  macroDiffRows,
  macroReceiptRows,
  programMatchesProfile,
  rebaseMacroFromCard,
  undoMacroFromCard,
} from '../src/components/CoachActionCard';
import { assistantMessageFromResponse } from '../src/components/CoachChatSection';
import {
  buildProgramProposalFromAction,
  COACH_ACTION_EXPIRY_MS,
  settlePendingActions,
} from '../src/lib/coach-action-executor';
import { useStore } from '../src/lib/store';
import { getInitialCoachBlocksState } from '../src/lib/block-engine';
import { translate } from '../src/lib/i18n';
import type { CoachChatMessage } from '../src/lib/coach-chat-store';
import type { MacroGoals, WeeklySchedule } from '../src/lib/types';

/**
 * Coach AI Actions, Slice B (2026-11-05): markdown-lite renderer,
 * action-card states + transitions, and the chat send path.
 *
 * Harness note (repo pattern, see gauntlet-ux18): component tests
 * here are SSR-only and zustand's server snapshot is frozen, so card
 * RENDERS take the message + live values as props (the card's test
 * seams), while card TRANSITIONS are exercised through the card's
 * exported helpers against the real store — the same functions the
 * buttons call. The send path is covered through
 * assistantMessageFromResponse, the exact builder send() appends.
 */

const NOW = 1_760_000_000_000;
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

const macroMsg = (partial: Partial<CoachChatMessage> = {}): CoachChatMessage => ({
  role: 'assistant',
  content: 'Drafted a change for you — tap Apply to set it.',
  action: { type: 'set_macro_goals', proteinG: 180 },
  actionState: 'pending',
  ts: NOW,
  actionBase: { ...GOALS },
  ...partial,
});

const programAction = {
  type: 'propose_program' as const,
  goal: 'muscle' as const,
  daysPerWeek: 4,
  sessionMinutes: 60,
  equipment: 'full_gym' as const,
  experience: 'intermediate' as const,
};

const programMsg = (partial: Partial<CoachChatMessage> = {}): CoachChatMessage => ({
  role: 'assistant',
  content: 'Here is the week I drafted.',
  action: { ...programAction },
  actionState: 'pending',
  ts: NOW,
  ...partial,
});

const renderCard = (message: CoachChatMessage, live: MacroGoals | null = { ...GOALS }) =>
  renderToStaticMarkup(
    <CoachActionCard message={message} onPatch={() => {}} nowMs={NOW} liveMacroGoals={live} />
  );

// ─────────────────────────────────────────────────────────────────────────────
// Markdown-lite renderer
// ─────────────────────────────────────────────────────────────────────────────

describe('CoachMarkdown', () => {
  const render = (text: string) => renderToStaticMarkup(<CoachMarkdown text={text} />);

  it('renders bold and italic as elements', () => {
    const html = render('Your squat hit **100 kg** — *careful* on the next set.');
    expect(html).toContain('<strong>100 kg</strong>');
    expect(html).toContain('<em>careful</em>');
  });

  it('renders bullet and numbered lists', () => {
    expect(render('Do these:\n\n- Add 20 g protein\n- Sleep 8 hours')).toContain(
      '<li>Add 20 g protein</li>'
    );
    const numbered = render('1. Warm up\n2. Work sets');
    expect(numbered).toContain('<ol');
    expect(numbered).toContain('<li>Warm up</li>');
  });

  it('renders small headings and separate paragraphs', () => {
    const html = render('## This week\n\nVolume is up.\n\nKeep protein steady.');
    expect(html).toContain('<h4');
    expect(html).toContain('This week');
    expect(html).toContain('Volume is up.');
    expect(html).toContain('Keep protein steady.');
  });

  it('keeps single line breaks inside a paragraph', () => {
    expect(render('line one\nline two')).toContain('<br/>');
  });

  it('renders markup-looking content as literal text (injection-safe)', () => {
    const html = render('<script>alert(1)</script> and <img src=x onerror=alert(2)>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
  });

  it('leaves unclosed markers as literal characters', () => {
    expect(render('a ** b and * c')).toContain('**');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Base capture + diff/receipt rows
// ─────────────────────────────────────────────────────────────────────────────

describe('CoachActionCard: base capture and rows', () => {
  it('captures the live goals once, as a copy, on first pending render', () => {
    const m = macroMsg({ actionBase: undefined });
    const patch = captureActionBasePatch(m, GOALS);
    expect(patch?.actionBase).toEqual(GOALS);
    expect(patch?.actionBase).not.toBe(GOALS);
    // Already captured → never re-captured.
    expect(captureActionBasePatch(macroMsg(), GOALS)).toBeNull();
    // Not pending / not a macro action → nothing to capture.
    expect(captureActionBasePatch(macroMsg({ actionState: 'applied' }), GOALS)).toBeNull();
    expect(captureActionBasePatch(programMsg(), GOALS)).toBeNull();
    // No goals yet is itself a captured base (null), distinct from uncaptured.
    expect(captureActionBasePatch(m, null)).toEqual({ actionBase: null });
  });

  it('diff rows show base → proposed for the fields the action names', () => {
    expect(macroDiffRows({ type: 'set_macro_goals', proteinG: 180 }, GOALS)).toEqual([
      { field: 'proteinG', from: 150, to: 180 },
    ]);
    expect(macroDiffRows({ type: 'set_macro_goals', proteinG: 180 }, null)).toEqual([
      { field: 'proteinG', from: undefined, to: 180 },
    ]);
  });

  it('receipt rows show only what changed (or what the action named, from no goals)', () => {
    const action = { type: 'set_macro_goals' as const, proteinG: 180 };
    expect(
      macroReceiptRows(action, { previous: { ...GOALS }, applied: { ...GOALS, proteinG: 180 } })
    ).toEqual([{ field: 'proteinG', from: 150, to: 180 }]);
    expect(
      macroReceiptRows(action, { previous: null, applied: { ...GOALS, proteinG: 180 } })
    ).toEqual([{ field: 'proteinG', from: undefined, to: 180 }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Macro card renders
// ─────────────────────────────────────────────────────────────────────────────

describe('CoachActionCard: macro renders', () => {
  it('pending renders the base → proposed diff with Apply and Dismiss', () => {
    const html = renderCard(macroMsg());
    expect(html).toContain('Nutrition targets');
    expect(html).toContain('Protein');
    expect(html).toContain('150');
    expect(html).toContain('180');
    expect(html).toContain('>Apply<');
    expect(html).toContain('>Dismiss<');
  });

  it('when the live goals moved, the card flips to the stale state with a fresh diff', () => {
    const html = renderCard(macroMsg(), { ...GOALS, calories: 2200 });
    expect(html).toContain('Your targets changed since I drafted this');
    expect(html).toContain('against your current targets');
    expect(html).toContain('>Apply<');
  });

  it('an expired pending renders no Apply', () => {
    const html = renderCard(macroMsg({ ts: NOW - COACH_ACTION_EXPIRY_MS - 1000 }));
    expect(html).toContain('This draft expired');
    expect(html).not.toContain('Apply');
  });

  it('dismissed and superseded collapse to one-line notes', () => {
    expect(renderCard(macroMsg({ actionState: 'dismissed' }))).toContain('Draft dismissed');
    const sup = renderCard(macroMsg({ actionState: 'superseded' }));
    expect(sup).toContain('Replaced by a newer draft below');
    expect(sup).not.toContain('Apply');
  });

  it('applied renders the receipt and Undo; undone renders the reversal line', () => {
    const applied = macroMsg({
      actionState: 'applied',
      appliedSnapshot: { previous: { ...GOALS }, applied: { ...GOALS, proteinG: 180 } },
    });
    const html = renderCard(applied);
    expect(html).toContain('Targets updated');
    expect(html).toContain('>Undo<');
    const undone = renderCard({ ...applied, undone: true });
    expect(undone).toContain('Undone — your previous targets are back.');
    expect(undone).not.toContain('>Undo<');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Macro card transitions (the helpers the buttons call)
// ─────────────────────────────────────────────────────────────────────────────

describe('CoachActionCard: macro transitions', () => {
  it('apply happy path updates the store and returns the receipt patch', () => {
    const patch = applyMacroFromCard(macroMsg(), { ...GOALS });
    expect(patch.actionState).toBe('applied');
    expect(patch.appliedSnapshot?.previous).toEqual(GOALS);
    expect(patch.appliedSnapshot?.applied).toEqual({ ...GOALS, proteinG: 180 });
    expect(useStore.getState().macroGoals).toEqual({ ...GOALS, proteinG: 180 });
  });

  it('apply refuses as stale when the goals changed after the base was captured', () => {
    useStore.getState().setMacroGoals({ ...GOALS, calories: 2200 });
    const patch = applyMacroFromCard(macroMsg(), { ...GOALS, calories: 2200 });
    expect(patch.actionState).toBe('stale');
    // The action's value was NOT written over the user's own change.
    expect(useStore.getState().macroGoals).toEqual({ ...GOALS, calories: 2200 });
  });

  it('the stale card re-bases and applies against the live goals', () => {
    const live = { ...GOALS, calories: 2200 };
    useStore.getState().setMacroGoals(live);
    const patch = rebaseMacroFromCard(macroMsg(), live, NOW + 5000);
    expect(patch.actionState).toBe('applied');
    expect(patch.actionBase).toEqual(live);
    expect(patch.ts).toBe(NOW + 5000);
    expect(useStore.getState().macroGoals).toEqual({ ...GOALS, calories: 2200, proteinG: 180 });
  });

  it('undo restores the previous goals; a stale undo patches nothing', () => {
    const appliedPatch = applyMacroFromCard(macroMsg(), { ...GOALS });
    const appliedMsg = { ...macroMsg(), ...appliedPatch };
    const undo = undoMacroFromCard(appliedMsg);
    expect(undo).toEqual({ patch: { undone: true }, stale: false });
    expect(useStore.getState().macroGoals).toEqual(GOALS);

    // Apply again, then change the goals once more — undo must refuse.
    const reapplied = { ...macroMsg(), ...applyMacroFromCard(macroMsg(), { ...GOALS }) };
    useStore.getState().setMacroGoals({ ...GOALS, proteinG: 200 });
    expect(undoMacroFromCard(reapplied)).toEqual({ patch: null, stale: true });
    expect(useStore.getState().macroGoals?.proteinG).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Program card
// ─────────────────────────────────────────────────────────────────────────────

describe('CoachActionCard: program', () => {
  it('pending renders the engine-built summary and the assumed intake line', () => {
    const html = renderCard(programMsg(), null);
    const pending = useStore.getState().coachBlocks.pendingProposal;
    expect(pending).not.toBeNull();
    expect(html).toContain(pending?.name as string);
    expect(html).toContain('Build muscle');
    expect(html).toContain('weeks');
    expect(html).toContain('4 days a week');
    expect(html).toContain('Full gym');
    expect(html).toContain('Intermediate');
    expect(html).toContain('>Apply<');
  });

  it('apply goes through the block accept path and sets the active block', () => {
    const proposal = buildProgramProposalFromAction({ ...programAction });
    expect(applyProgramFromCard(proposal)).toBe(true);
    const after = useStore.getState();
    expect(after.plannedWorkouts.length).toBeGreaterThan(0);
    expect(after.coachBlocks.activeBlock?.name).toBe(proposal.name);
  });

  it('the assumed-values profile note shows only when the intake matches the prefill', () => {
    // Bare store: prefill proposes 3 days/week — the 4-day action differs.
    expect(programMatchesProfile({ ...programAction })).toBe(false);
    expect(renderCard(programMsg(), null)).not.toContain('match your usual setup');
    // Seed the training profile to the action's values → all match.
    seedStore({
      trainingProfile: {
        daysPerWeek: 4,
        preferredDurationMin: 60,
        equipment: 'full_gym',
        experience: 'intermediate',
        goal: 'build_muscle',
      },
    });
    expect(programMatchesProfile({ ...programAction })).toBe(true);
    expect(renderCard(programMsg(), null)).toContain('match your usual setup from your profile');
  });

  it('engine refusal: no proposal, no Apply — the honest could-not-build state', () => {
    expect(isProgramRefusal(null)).toBe(true);
    // A store whose block state is unreadable makes the build throw;
    // the card catches it and renders the refusal state.
    seedStore({ coachBlocks: undefined });
    const html = renderCard(programMsg(), null);
    expect(html).toContain('could not build this program');
    expect(html).not.toContain('>Apply<');
  });

  it('an applied program card confirms and points at the Coach tab', () => {
    const html = renderCard(programMsg({ actionState: 'applied' }), null);
    expect(html).toContain('Program set');
    expect(html).toContain('Coach tab');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Send path: response → message (what send() appends)
// ─────────────────────────────────────────────────────────────────────────────

describe('send path: assistantMessageFromResponse', () => {
  it('a valid action attaches as a pending card with a timestamp', () => {
    const m = assistantMessageFromResponse(
      {
        reply: 'Drafted it below — nothing changes until you tap Apply.',
        evidence: ['Protein target 150 g'],
        action: { type: 'set_macro_goals', proteinG: 160 },
      },
      NOW,
      'fallback'
    );
    expect(m.content).toContain('Drafted it below');
    expect(m.action).toEqual({ type: 'set_macro_goals', proteinG: 160 });
    expect(m.actionState).toBe('pending');
    expect(m.ts).toBe(NOW);
  });

  it('an INVALID action is dropped while the reply is still shown', () => {
    const m = assistantMessageFromResponse(
      { reply: 'Here you go.', action: { type: 'set_macro_goals', calories: 900 } },
      NOW,
      'fallback'
    );
    expect(m.content).toBe('Here you go.');
    expect(m.action).toBeUndefined();
    expect(m.actionState).toBeUndefined();
  });

  it('a static-style response (no action field) produces the unchanged plain message', () => {
    const m = assistantMessageFromResponse({ reply: 'Stay on topic.' }, NOW, 'fallback');
    expect(m).toEqual({ role: 'assistant', content: 'Stay on topic.', evidence: [], ts: NOW });
  });

  it('a missing reply falls back to the error copy, still action-free', () => {
    const m = assistantMessageFromResponse({}, NOW, 'Could not reach your coach. Try again.');
    expect(m.content).toBe('Could not reach your coach. Try again.');
    expect(m.action).toBeUndefined();
  });

  it('a new macro proposal supersedes the older pending one in the same thread', () => {
    const older = macroMsg({ ts: NOW });
    const user: CoachChatMessage = { role: 'user', content: 'make protein 200 instead', ts: NOW + 500 };
    const newer = assistantMessageFromResponse(
      { reply: 'Updated draft below.', action: { type: 'set_macro_goals', proteinG: 200 } },
      NOW + 1000,
      'fallback'
    );
    const settled = settlePendingActions([older, user, newer], NOW + 1000);
    expect(settled[0].actionState).toBe('superseded');
    expect(settled[2].actionState).toBe('pending');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section wiring + i18n
// ─────────────────────────────────────────────────────────────────────────────

describe('CoachChatSection wiring (source contract)', () => {
  const section = fs.readFileSync(
    path.join(process.cwd(), 'src/components/CoachChatSection.tsx'),
    'utf8'
  );

  it('send path validates actions, settles pendings, and stamps times', () => {
    expect(section).toContain('validateCoachAction');
    expect(section).toContain('settlePendingActions');
    expect(section).toContain('assistantMessageFromResponse');
    expect(section).toContain("role: 'user', content: text, ts: epochNow()");
  });

  it('renders markdown replies, action cards, chips and the thinking state', () => {
    expect(section).toContain('<CoachMarkdown');
    expect(section).toContain('<CoachActionCard');
    expect(section).toContain('CHIP_KEYS');
    expect(section).toContain("t('coachChat.introCapabilities')");
    expect(section).toContain("t('coachChat.introPromise')");
    expect(section).toContain("t('coachChat.thinking')");
  });

  it('scroll is stick-to-bottom only (no unconditional scroll on send)', () => {
    expect(section).toContain('stickRef');
    expect(section).not.toContain('requestAnimationFrame');
  });

  it('new Slice B keys resolve in English and Hindi', () => {
    for (const key of [
      'coachChat.thinking',
      'coachChat.introPromise',
      'coachChat.chipBuildWeek',
      'coachChat.actionApply',
      'coachChat.actionStaleTitle',
      'coachChat.actionExpired',
      'coachChat.actionProgramApplied',
      'coachChat.goalMuscle',
    ] as const) {
      expect(translate('en', key)).not.toBe(key);
      expect(translate('hi', key)).not.toBe(key);
    }
  });
});
