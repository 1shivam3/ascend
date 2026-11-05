import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';
import type { MacroGoals } from '@/lib/types';
import type {
  ProposeProgramAction,
  SetMacroGoalsAction,
} from '@/lib/coach-actions';
import {
  applyMacroGoalsAction,
  applyProgramProposal,
  buildBlockIntakeFromAction,
  buildProgramProposalFromAction,
  COACH_ACTION_EXPIRY_MS,
  effectiveActionState,
  undoMacroGoals,
} from '@/lib/coach-action-executor';
import { buildIntakePrefill } from '@/lib/block-intake';
import { hasRealBodyStats } from '@/lib/body-stats';
import type { BlockProposal } from '@/lib/block-engine';
import type {
  CoachActionReceipt,
  CoachChatMessage,
} from '@/lib/coach-chat-store';

/**
 * CoachActionCard — renders ONE validated coach action under its
 * assistant bubble (Coach AI Actions, Slice B).
 *
 * Lifecycle (design brief): pending → user confirms → applied (with
 * receipt + Undo for macro goals) | dismissed | stale | superseded.
 * Nothing here writes data except through the Slice A executor,
 * which version-checks every apply against the snapshot the card was
 * rendered from — a card can never blind-apply over a change the
 * user made in the meantime.
 *
 * The state transitions live in the exported pure helpers below (the
 * component is a thin shell over them) so they are unit-testable in
 * this repo's SSR-only component harness.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for tests)
// ─────────────────────────────────────────────────────────────────────────────

type MacroField = 'calories' | 'proteinG' | 'carbsG' | 'fatG';

const MACRO_FIELDS: {
  field: MacroField;
  labelKey: 'coachChat.macroCalories' | 'coachChat.macroProtein' | 'coachChat.macroCarbs' | 'coachChat.macroFat';
  unitKey: 'coachChat.unitKcal' | 'coachChat.unitGram';
}[] = [
  { field: 'calories', labelKey: 'coachChat.macroCalories', unitKey: 'coachChat.unitKcal' },
  { field: 'proteinG', labelKey: 'coachChat.macroProtein', unitKey: 'coachChat.unitGram' },
  { field: 'carbsG', labelKey: 'coachChat.macroCarbs', unitKey: 'coachChat.unitGram' },
  { field: 'fatG', labelKey: 'coachChat.macroFat', unitKey: 'coachChat.unitGram' },
];

export interface MacroRow {
  field: MacroField;
  /** undefined = no current value ("Not set"). */
  from: number | undefined;
  to: number;
}

/** The four user-facing fields equal? Mirrors the executor's base
 * check, but against the goals THIS card rendered with (the executor
 * re-checks against the live store at apply time regardless). */
function sameMacroFields(a: MacroGoals | null, b: MacroGoals | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.calories === b.calories &&
    a.proteinG === b.proteinG &&
    a.carbsG === b.carbsG &&
    a.fatG === b.fatG
  );
}

/**
 * The base-capture rule: the FIRST time a pending set_macro_goals
 * card renders, snapshot the current goals onto the message. Returns
 * the patch to persist, or null when there is nothing to capture.
 */
export function captureActionBasePatch(
  message: CoachChatMessage,
  liveGoals: MacroGoals | null
): Partial<CoachChatMessage> | null {
  if (message.action?.type !== 'set_macro_goals') return null;
  if (message.actionState !== 'pending') return null;
  if (message.actionBase !== undefined) return null;
  return { actionBase: liveGoals ? { ...liveGoals } : null };
}

/** Diff rows for a pending/stale macro card: one per field the
 * action actually names, from-value taken from `base`. */
export function macroDiffRows(action: SetMacroGoalsAction, base: MacroGoals | null): MacroRow[] {
  return MACRO_FIELDS.flatMap(({ field }) => {
    const to = action[field];
    if (to === undefined) return [];
    return [{ field, from: base?.[field], to }];
  });
}

/** Receipt rows for an applied macro card: what actually changed.
 * With no previous goals, only the fields the action named can be
 * attributed to it (the rest of the applied set came from the app's
 * recommended base, not from this action). */
export function macroReceiptRows(
  action: SetMacroGoalsAction,
  receipt: CoachActionReceipt
): MacroRow[] {
  return MACRO_FIELDS.flatMap(({ field }) => {
    const to = receipt.applied[field];
    if (to === undefined) return [];
    const from = receipt.previous?.[field];
    if (receipt.previous === null) {
      return action[field] !== undefined ? [{ field, from: undefined, to }] : [];
    }
    return from !== to ? [{ field, from, to }] : [];
  });
}

/** Apply a pending macro card. Falls back to the live goals as the
 * base when the capture effect has not landed yet (first paint). */
export function applyMacroFromCard(
  message: CoachChatMessage,
  liveGoals: MacroGoals | null
): Partial<CoachChatMessage> {
  const action = message.action;
  if (!action || action.type !== 'set_macro_goals') return {};
  const base =
    message.actionBase !== undefined
      ? message.actionBase
      : liveGoals
        ? { ...liveGoals }
        : null;
  const result = applyMacroGoalsAction(action, base);
  if (!result.ok) {
    // Blocked (needs real body stats): no patch — the component
    // renders the honest blocked state and offers no Apply.
    if ('blocked' in result) return {};
    return { actionBase: base, actionState: 'stale' };
  }
  return {
    actionBase: base,
    actionState: 'applied',
    appliedSnapshot: result.receipt,
    undone: false,
  };
}

/** Re-based apply from the stale state: fresh snapshot of the live
 * goals, fresh timestamp (a fresh confirm deserves a fresh window),
 * then the same version-checked apply. */
export function rebaseMacroFromCard(
  message: CoachChatMessage,
  liveGoals: MacroGoals | null,
  now: number
): Partial<CoachChatMessage> {
  const action = message.action;
  if (!action || action.type !== 'set_macro_goals') return {};
  const base = liveGoals ? { ...liveGoals } : null;
  const result = applyMacroGoalsAction(action, base);
  if (!result.ok) {
    if ('blocked' in result) return {};
    return { actionBase: base, ts: now, actionState: 'stale' };
  }
  return {
    actionBase: base,
    ts: now,
    actionState: 'applied',
    appliedSnapshot: result.receipt,
    undone: false,
  };
}

/** Undo an applied macro card. A stale undo (goals changed again
 * since the apply) patches nothing — the card shows honest copy. */
export function undoMacroFromCard(message: CoachChatMessage): {
  patch: Partial<CoachChatMessage> | null;
  stale: boolean;
} {
  if (!message.appliedSnapshot) return { patch: null, stale: false };
  const result = undoMacroGoals(message.appliedSnapshot);
  if (!result.ok) return { patch: null, stale: true };
  return { patch: { undone: true }, stale: false };
}

/** True when the action's intake is exactly what the profile prefill
 * would have proposed — i.e. every assumed value is "your usual". */
export function programMatchesProfile(action: ProposeProgramAction): boolean {
  const s = useStore.getState();
  const prefill = buildIntakePrefill({
    profile: s.profile,
    trainingProfile: s.trainingProfile,
    athleteModel: s.athleteModel,
    prs: s.prs,
    workouts: s.workouts,
  });
  const intake = buildBlockIntakeFromAction(action);
  const p = prefill.intake;
  return (
    intake.goal === p.goal &&
    intake.daysPerWeek === p.daysPerWeek &&
    intake.sessionMinutes === p.sessionMinutes &&
    intake.equipment === p.equipment &&
    intake.experience === p.experience
  );
}

/** The engine refused (or produced nothing schedulable) — the card
 * shows the honest couldn't-build state and offers no Apply. */
export function isProgramRefusal(proposal: BlockProposal | null): boolean {
  return proposal === null || proposal.days.length === 0;
}

/** Apply a built program proposal through the block system's own
 * accept path (the executor is a pass-through by design). */
export function applyProgramFromCard(proposal: BlockProposal): boolean {
  return applyProgramProposal(proposal);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export interface CoachActionCardProps {
  message: CoachChatMessage;
  onPatch: (patch: Partial<CoachChatMessage>) => void;
  /** Test seam: fixed "now" for expiry (defaults to Date.now()). */
  nowMs?: number;
  /** Test seam: live goals to render against (defaults to the store's). */
  liveMacroGoals?: MacroGoals | null;
}

const GOAL_LABEL_KEYS: Record<ProposeProgramAction['goal'], 'coachChat.goalMuscle' | 'coachChat.goalStrength' | 'coachChat.goalFatLoss' | 'coachChat.goalEndurance' | 'coachChat.goalGeneral'> = {
  muscle: 'coachChat.goalMuscle',
  strength: 'coachChat.goalStrength',
  fat_loss: 'coachChat.goalFatLoss',
  endurance: 'coachChat.goalEndurance',
  general: 'coachChat.goalGeneral',
};

const EXPERIENCE_LABEL_KEYS: Record<ProposeProgramAction['experience'], 'coachBlock.exp_beginner' | 'coachBlock.exp_intermediate' | 'coachBlock.exp_advanced'> = {
  beginner: 'coachBlock.exp_beginner',
  intermediate: 'coachBlock.exp_intermediate',
  advanced: 'coachBlock.exp_advanced',
};

export default function CoachActionCard({
  message,
  onPatch,
  nowMs,
  liveMacroGoals,
}: CoachActionCardProps) {
  const { t } = useTranslation();
  const storeGoals = useStore((s) => s.macroGoals);
  const profile = useStore((s) => s.profile);
  const liveGoals = liveMacroGoals !== undefined ? liveMacroGoals : storeGoals;
  const [undoStale, setUndoStale] = useState(false);
  const [applyFailed, setApplyFailed] = useState(false);

  const action = message.action;
  const state = message.actionState;
  // "Now" is fixed at mount (state initializer): expiry is a
  // minutes-scale check, and a stable value keeps renders pure —
  // tab switches remount the section and re-evaluate.
  const [mountNow] = useState(() => Date.now());
  const now = nowMs ?? mountNow;
  const eff = effectiveActionState(message, now);
  const expired =
    message.ts !== undefined &&
    now - message.ts > COACH_ACTION_EXPIRY_MS &&
    (state === 'pending' || state === 'stale');

  // Base capture: first render of a pending macro card snapshots the
  // goals it was rendered against, persisted on the message.
  useEffect(() => {
    if (!action || action.type !== 'set_macro_goals') return;
    const patch = captureActionBasePatch(message, liveGoals);
    if (patch) onPatch(patch);
  }, [action, message, liveGoals, onPatch]);

  // Program proposals build only while the card is live-pending —
  // applied/dismissed/expired cards never touch the engine (building
  // sets the store's pending proposal as a side effect).
  const isProgram = action?.type === 'propose_program';
  const proposal = useMemo<BlockProposal | null>(() => {
    if (!isProgram || eff !== 'pending') return null;
    try {
      return buildProgramProposalFromAction(action as ProposeProgramAction);
    } catch {
      return null;
    }
  }, [action, eff, isProgram]);
  const matchesProfile = useMemo(
    () => (isProgram && eff === 'pending' ? programMatchesProfile(action as ProposeProgramAction) : false),
    [action, eff, isProgram]
  );

  if (!action || !state) return null;

  if (state === 'dismissed' || state === 'superseded') {
    return (
      <p className="text-2xs text-text-muted px-1">
        {t(state === 'dismissed' ? 'coachChat.actionDismissedNote' : 'coachChat.actionSupersededNote')}
      </p>
    );
  }

  const dismissButton = (
    <button
      type="button"
      onClick={() => onPatch({ actionState: 'dismissed' })}
      className="btn-ghost px-3 py-1.5 text-xs cursor-pointer"
    >
      {t('coachChat.actionDismiss')}
    </button>
  );

  if (expired || (eff === 'stale' && action.type === 'propose_program')) {
    return (
      <div className="rounded-xl border border-border bg-bg-secondary/60 p-3 space-y-2">
        <p className="text-xs text-text-secondary">{t('coachChat.actionExpired')}</p>
        <div className="flex gap-2">{dismissButton}</div>
      </div>
    );
  }

  // ── set_macro_goals ──────────────────────────────────────────────
  if (action.type === 'set_macro_goals') {
    if (state === 'applied' && message.appliedSnapshot) {
      const rows = macroReceiptRows(action, message.appliedSnapshot);
      return (
        <div className="rounded-xl border border-border bg-bg-secondary/60 p-3 space-y-2">
          <p className="text-xs font-bold text-text-primary">{t('coachChat.actionAppliedMacroTitle')}</p>
          <MacroRows rows={rows} />
          {message.undone ? (
            <p className="text-xs text-text-secondary">{t('coachChat.actionUndone')}</p>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const r = undoMacroFromCard(message);
                    if (r.patch) onPatch(r.patch);
                    else if (r.stale) setUndoStale(true);
                  }}
                  className="btn-secondary px-3 py-1.5 text-xs font-bold cursor-pointer"
                >
                  {t('common.undo')}
                </button>
              </div>
              {undoStale && <p className="text-xs text-danger">{t('coachChat.actionUndoStale')}</p>}
            </>
          )}
        </div>
      );
    }

    const base = message.actionBase;
    const moved = base !== undefined && !sameMacroFields(liveGoals, base);
    const stale = state === 'stale' || (state === 'pending' && moved);

    if (stale) {
      // Fresh diff: the same change read against the LIVE goals.
      return (
        <div className="rounded-xl border border-border bg-bg-secondary/60 p-3 space-y-2">
          <p className="text-xs font-bold text-text-primary">{t('coachChat.actionStaleTitle')}</p>
          <p className="text-xs text-text-secondary">{t('coachChat.actionStaleBody')}</p>
          <MacroRows rows={macroDiffRows(action, liveGoals)} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPatch(rebaseMacroFromCard(message, liveGoals, Date.now()))}
              className="btn-primary px-3 py-1.5 text-xs font-bold cursor-pointer"
            >
              {t('coachChat.actionApply')}
            </button>
            {dismissButton}
          </div>
        </div>
      );
    }

    // Pending, base intact (or not captured yet — first paint falls
    // back to the live goals, which the capture effect then persists).
    const baseForDiff = base !== undefined ? base : liveGoals;
    // Task 1.1: with no stored goals and placeholder body stats, the
    // executor cannot complete this goal set without deriving numbers
    // from stats the user never entered — unless the action names
    // both required fields itself. Show the honest blocked state
    // (mirrors the program-refusal pattern: no Apply offered).
    const applyBlocked =
      !liveGoals &&
      !hasRealBodyStats(profile) &&
      (action.calories === undefined || action.proteinG === undefined);
    return (
      <div className="rounded-xl border border-border bg-bg-secondary/60 p-3 space-y-2">
        <p className="text-xs font-bold text-text-primary">{t('coachChat.actionMacroTitle')}</p>
        <MacroRows rows={macroDiffRows(action, baseForDiff)} />
        {applyBlocked ? (
          <>
            <p className="text-xs text-text-secondary">{t('coachChat.actionNeedsBodyStats')}</p>
            <div className="flex gap-2">{dismissButton}</div>
          </>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPatch(applyMacroFromCard(message, liveGoals))}
              className="btn-primary px-3 py-1.5 text-xs font-bold cursor-pointer"
            >
              {t('coachChat.actionApply')}
            </button>
            {dismissButton}
          </div>
        )}
      </div>
    );
  }

  // ── propose_program ──────────────────────────────────────────────
  if (state === 'applied') {
    return (
      <div className="rounded-xl border border-border bg-bg-secondary/60 p-3">
        <p className="text-xs text-text-secondary">{t('coachChat.actionProgramApplied')}</p>
      </div>
    );
  }

  if (isProgramRefusal(proposal)) {
    return (
      <div className="rounded-xl border border-border bg-bg-secondary/60 p-3 space-y-2">
        <p className="text-xs text-text-secondary">{t('coachChat.actionProgramFailed')}</p>
        <div className="flex gap-2">{dismissButton}</div>
      </div>
    );
  }

  const built = proposal as BlockProposal;
  const equipmentLabel =
    action.equipment === 'full_gym'
      ? t('coachBlock.eqFullGym')
      : action.equipment === 'dumbbells'
        ? t('coachBlock.eqDumbbells')
        : action.equipment === 'home_minimal'
          ? t('coachChat.equipHomeMinimal')
          : t('coachBlock.eqBodyweight');

  return (
    <div className="rounded-xl border border-border bg-bg-secondary/60 p-3 space-y-2">
      <p className="text-sm font-bold text-text-primary">{built.name}</p>
      <p className="text-2xs text-text-muted">
        {t('coachChat.actionProgramMeta', {
          goal: t(GOAL_LABEL_KEYS[action.goal]),
          weeks: built.weeks.length,
          days: built.intake.daysPerWeek,
          minutes: built.intake.sessionMinutes,
        })}
      </p>
      <p className="text-xs text-text-secondary">{built.summary}</p>
      {built.focusReason && <p className="text-xs text-text-muted">{built.focusReason}</p>}
      {built.warnings.length > 0 && (
        <div className="p-2 rounded-lg bg-warning/10 border border-warning/30 space-y-1">
          {built.warnings.map((w, i) => (
            <p key={i} className="text-2xs text-text-secondary">
              {w}
            </p>
          ))}
        </div>
      )}
      <p className="text-2xs text-text-muted">
        {t('coachChat.actionIntakeLine', {
          days: action.daysPerWeek,
          minutes: action.sessionMinutes,
          equipment: equipmentLabel,
          experience: t(EXPERIENCE_LABEL_KEYS[action.experience]),
        })}
      </p>
      {matchesProfile && (
        <p className="text-2xs text-text-muted">{t('coachChat.actionAssumedFromProfile')}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            if (applyProgramFromCard(built)) {
              onPatch({ actionState: 'applied' });
            } else {
              setApplyFailed(true);
            }
          }}
          className="btn-primary px-3 py-1.5 text-xs font-bold cursor-pointer"
        >
          {t('coachChat.actionApply')}
        </button>
        {dismissButton}
      </div>
      {applyFailed && <p className="text-xs text-danger">{t('coachChat.actionProgramApplyFailed')}</p>}
    </div>
  );
}

function MacroRows({ rows }: { rows: MacroRow[] }) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <ul className="space-y-1">
      {rows.map((row) => {
        const meta = MACRO_FIELDS.find((f) => f.field === row.field);
        if (!meta) return null;
        return (
          <li key={row.field} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-text-secondary">{t(meta.labelKey)}</span>
            <span className="font-mono text-text-primary">
              {row.from === undefined ? t('coachChat.actionNotSet') : row.from} → {row.to}{' '}
              {t(meta.unitKey)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
