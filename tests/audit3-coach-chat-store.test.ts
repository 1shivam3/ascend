/**
 * Audit-3 FE-06: coach-chat state must survive component unmounts
 * (tab switches) — it lives in a persisted store now, not useState.
 *
 * The persist middleware's own localStorage IO is zustand's (the main
 * store relies on the same middleware in production, where
 * localStorage exists at import). What THIS module owns — the state
 * shape, the persisted slice, the 100-message cap, the storage key,
 * and the stale-counter rule — is asserted directly here, following
 * the codebase's partialize-testing pattern (avatar-persistence).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useCoachChatStore,
  currentDailyLeft,
  partializeCoachChatState,
  COACH_CHAT_STORAGE_KEY,
} from '../src/lib/coach-chat-store';

const TODAY = '2026-10-30';
const YESTERDAY = '2026-10-29';

beforeEach(() => {
  useCoachChatStore.getState().clearCoachChat();
});

describe('audit-3 FE-06: coach-chat store', () => {
  it('keeps the conversation in the store, independent of any component', () => {
    useCoachChatStore.getState().setMessages([
      { role: 'user', content: 'Why did my squat stall?' },
      { role: 'assistant', content: 'Based on your last 3 sessions…', evidence: ['Squat 100 kg'] },
    ]);
    // A remounted component reads the same store — nothing is lost.
    const reread = useCoachChatStore.getState().messages;
    expect(reread).toHaveLength(2);
    expect(reread[1].evidence).toEqual(['Squat 100 kg']);
  });

  it('persists under an ascend_ key (swept by purgeLocalAppData on reset)', () => {
    expect(COACH_CHAT_STORAGE_KEY).toBe('ascend_coach_chat_v1');
    expect(COACH_CHAT_STORAGE_KEY.startsWith('ascend_')).toBe(true);
  });

  it('the persisted slice round-trips through the persist envelope shape', () => {
    useCoachChatStore.getState().setMessages([{ role: 'user', content: 'hello coach' }]);
    useCoachChatStore.getState().setDailyLeft(12, TODAY);
    const slice = partializeCoachChatState(useCoachChatStore.getState());
    // zustand persist stores { state: <partialize>, version } as JSON.
    const roundTripped = JSON.parse(JSON.stringify({ state: slice, version: 0 }));
    expect(roundTripped.state.messages).toEqual([{ role: 'user', content: 'hello coach' }]);
    expect(roundTripped.state.dailyLeft).toBe(12);
    expect(roundTripped.state.dailyLeftDate).toBe(TODAY);
    // Actions are never persisted.
    expect(roundTripped.state.setMessages).toBeUndefined();
  });

  it('caps the persisted slice at 100 messages, keeping the newest', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      role: 'user' as const,
      content: `msg ${i}`,
    }));
    useCoachChatStore.getState().setMessages(many);
    const slice = partializeCoachChatState(useCoachChatStore.getState());
    expect(slice.messages).toHaveLength(100);
    expect(slice.messages[0].content).toBe('msg 20');
    expect(slice.messages[99].content).toBe('msg 119');
  });

  it("shows today's counter, never yesterday's", () => {
    useCoachChatStore.getState().setDailyLeft(7, YESTERDAY);
    const s = useCoachChatStore.getState();
    expect(currentDailyLeft(s, TODAY)).toBeNull();
    expect(currentDailyLeft(s, YESTERDAY)).toBe(7);
    useCoachChatStore.getState().setDailyLeft(29, TODAY);
    expect(currentDailyLeft(useCoachChatStore.getState(), TODAY)).toBe(29);
  });

  it('clearCoachChat empties thread and counter (logout path)', () => {
    useCoachChatStore.getState().setMessages([{ role: 'user', content: 'x' }]);
    useCoachChatStore.getState().setDailyLeft(3, TODAY);
    useCoachChatStore.getState().clearCoachChat();
    const s = useCoachChatStore.getState();
    expect(s.messages).toEqual([]);
    expect(s.dailyLeft).toBeNull();
    expect(s.dailyLeftDate).toBeNull();
  });
});
