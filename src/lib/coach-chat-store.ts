/**
 * Coach-chat conversation store (FE-06, audit-3).
 *
 * The conversation used to live in CoachChatSection's useState, but
 * the section unmounts on every tab switch (Train's Coach tab swaps
 * with Plans/History, and leaving Train unmounts the page) — so the
 * whole thread and the server-reported daily-left counter vanished,
 * and re-asking the same question burned another of the day's 30
 * messages. The thread now lives here, in its own persisted store:
 * tab switches and full reloads keep it, and the counter survives
 * with the date it belongs to (a stale count from yesterday must
 * never render as today's allowance).
 *
 * Own persist key on purpose: the key sits in the ascend_ namespace,
 * so purgeLocalAppData (Delete WebApp Data & Reset) sweeps it with
 * everything else, and logout clears it explicitly (see store.ts) —
 * a previous user's conversation must never greet the next person
 * on a shared device.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CoachAction } from './coach-actions';
import type { MacroGoals } from './types';

export type CoachActionState =
  | 'pending'
  | 'applied'
  | 'dismissed'
  | 'stale'
  | 'superseded'
  /** §28: an applied macro-goals receipt that was reversed via
   * Undo. A state of its own (it used to be a separate boolean
   * flag beside an 'applied' state — a hidden sixth state). The
   * receipt is retained so the card keeps showing what was
   * applied and that it was reversed. */
  | 'undone';

/** Receipt for an applied set_macro_goals action: what the goals were
 * and what they became — renders the card's old → new line and powers
 * Undo (a fresh version-checked restore, see coach-action-executor). */
export interface CoachActionReceipt {
  previous: MacroGoals | null;
  applied: MacroGoals;
}

/**
 * §28: the captured proposal-time macro goals, with the capture
 * fact explicit. The tri-state this replaces was carried by
 * `undefined | null | MacroGoals` and read differently at
 * different sites. Now:
 *  - field ABSENT (`actionBase === undefined`) = NOT CAPTURED YET
 *  - `{ status: 'captured', goals: null }` = captured, no goals
 *    existed at proposal time
 *  - `{ status: 'captured', goals }` = captured snapshot
 * Legacy persisted messages hold the raw `MacroGoals | null` in
 * this field; `readActionBase` (coach-action-executor) is the one
 * normalizing reader for both shapes.
 */
export interface ActionBaseCapture {
  status: 'captured';
  goals: MacroGoals | null;
}

interface CoachChatMessageBase {
  role: 'user' | 'assistant';
  content: string;
  evidence?: string[];
  /** Epoch ms the message was appended (drives the 30-min card
   * expiry). Absent on threads persisted before Slice A. */
  ts?: number;
}

/** A message with no action. §28: the action fields are `never`
 * here, so an actionState (or base, or receipt) without an action
 * is a COMPILE error, not a runtime surprise. */
export interface PlainCoachChatMessage extends CoachChatMessageBase {
  action?: never;
  actionState?: never;
  appliedSnapshot?: never;
  actionBase?: never;
}

/** A message carrying its one validated coach action (Slice A). */
export interface ActionCoachChatMessage extends CoachChatMessageBase {
  action: CoachAction;
  /** Lifecycle of `action` — always present beside it. */
  actionState: CoachActionState;
  /** Set when a set_macro_goals action is applied. */
  appliedSnapshot?: CoachActionReceipt;
  /** Slice B: the macro goals as they stood when the card first
   * rendered. Captured ONCE, on first render, and persisted with
   * the message — so an apply after a reload still version-checks
   * against proposal-time values, not whatever the goals happen
   * to be when the reloaded card paints. set_macro_goals only. */
  actionBase?: ActionBaseCapture;
}

export type CoachChatMessage = PlainCoachChatMessage | ActionCoachChatMessage;

interface CoachChatState {
  messages: CoachChatMessage[];
  /** Server-reported messages left today, as of dailyLeftDate. */
  dailyLeft: number | null;
  /** Local date (YYYY-MM-DD) dailyLeft was reported on. */
  dailyLeftDate: string | null;
  setMessages: (messages: CoachChatMessage[]) => void;
  setDailyLeft: (n: number | null, date: string) => void;
  clearCoachChat: () => void;
}

/** Oldest messages are dropped from STORAGE past this many — the
 * server only reads the last few turns as history anyway, and an
 * unbounded thread would grow localStorage forever. */
const MAX_PERSISTED_MESSAGES = 100;

/** Storage key — ascend_ namespace, so purgeLocalAppData sweeps it. */
export const COACH_CHAT_STORAGE_KEY = 'ascend_coach_chat_v1';

type CoachChatPersisted = Pick<CoachChatState, 'messages' | 'dailyLeft' | 'dailyLeftDate'>;

/** The exact slice written to storage (exported for tests). */
export function partializeCoachChatState(s: CoachChatState): CoachChatPersisted {
  return {
    messages: s.messages.slice(-MAX_PERSISTED_MESSAGES),
    dailyLeft: s.dailyLeft,
    dailyLeftDate: s.dailyLeftDate,
  };
}

export const useCoachChatStore = create<CoachChatState>()(
  persist(
    (set) => ({
      messages: [],
      dailyLeft: null,
      dailyLeftDate: null,
      setMessages: (messages) => set({ messages }),
      setDailyLeft: (dailyLeft, dailyLeftDate) => set({ dailyLeft, dailyLeftDate }),
      clearCoachChat: () => set({ messages: [], dailyLeft: null, dailyLeftDate: null }),
    }),
    {
      name: COACH_CHAT_STORAGE_KEY,
      partialize: partializeCoachChatState,
    }
  )
);

/**
 * The counter to display: only the value reported TODAY. Yesterday's
 * remaining count says nothing about today's allowance — the server
 * re-reports on the next send, and until then the honest display is
 * no number at all.
 */
export function currentDailyLeft(
  state: Pick<CoachChatState, 'dailyLeft' | 'dailyLeftDate'>,
  todayStr: string
): number | null {
  return state.dailyLeftDate === todayStr ? state.dailyLeft : null;
}
