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

export type CoachActionState = 'pending' | 'applied' | 'dismissed' | 'stale' | 'superseded';

/** Receipt for an applied set_macro_goals action: what the goals were
 * and what they became — renders the card's old → new line and powers
 * Undo (a fresh version-checked restore, see coach-action-executor). */
export interface CoachActionReceipt {
  previous: MacroGoals | null;
  applied: MacroGoals;
}

export interface CoachChatMessage {
  role: 'user' | 'assistant';
  content: string;
  evidence?: string[];
  /** Coach AI Actions (Slice A): at most one validated action per
   * assistant reply. Absent on every pre-existing persisted message —
   * all fields below are optional for exactly that reason. */
  action?: CoachAction;
  /** Lifecycle of `action`; meaningful only when `action` is set. */
  actionState?: CoachActionState;
  /** Epoch ms the message was appended (drives the 30-min card
   * expiry). Absent on threads persisted before Slice A. */
  ts?: number;
  /** Set when a set_macro_goals action is applied. */
  appliedSnapshot?: CoachActionReceipt;
  /** Slice B: the macro goals as they stood when the card first
   * rendered (null = no goals existed then). Captured ONCE, on first
   * render, and persisted with the message — so an apply after a
   * reload still version-checks against proposal-time values, not
   * whatever the goals happen to be when the reloaded card paints.
   * `undefined` means "not captured yet". set_macro_goals only. */
  actionBase?: MacroGoals | null;
  /** Slice B: true once an applied set_macro_goals receipt has been
   * undone. The receipt is retained so the card can keep showing
   * what was applied and that it was reversed. */
  undone?: boolean;
}

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
