/**
 * T3 (bug program Phase 4): stale coach chat — model-context half.
 *
 * The thread persists across days, and an old answer ("week 1 of 5")
 * used to sit beside a card saying "Week 2 of 6" with nothing
 * anchoring the model — or the reader — to today. The context now
 * ALWAYS carries today's date (before, it only reached the model
 * when a session happened to resolve for today), and the store's
 * clear is the sanctioned fresh start (wired to the New chat button
 * in the section; the e2e spec covers the UI half).
 */
import { describe, expect, it } from 'vitest';
import { buildCoachChatContext, type CoachChatUserData } from '../src/lib/coach-chat';
import { useCoachChatStore } from '../src/lib/coach-chat-store';

function minimalUser(over: Partial<CoachChatUserData> = {}): CoachChatUserData {
  return {
    userName: 'Test Lifter',
    bodyweightKg: 80,
    unit: 'kg',
    goal: 'muscle_gain',
    experience: 'intermediate',
    daysPerWeek: 4,
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
    ...over,
  };
}

describe('T3: the model context always anchors today', () => {
  it('includes TODAY\'S DATE even when no session resolves for today', () => {
    const ctx = buildCoachChatContext(minimalUser({ todayStr: '2026-11-19' }));
    expect(ctx.contextText).toContain("TODAY'S DATE: Thu, 19 Nov 2026");
  });

  it('without a todayStr the anchor is absent (older builders keep working)', () => {
    const ctx = buildCoachChatContext(minimalUser());
    expect(ctx.contextText).not.toContain("TODAY'S DATE:");
  });
});

describe('T3: New chat store action', () => {
  it('clearCoachChat empties the thread and the daily counters', () => {
    useCoachChatStore.setState({
      messages: [
        { role: 'user', content: 'hi', ts: 1 },
        { role: 'assistant', content: 'hello', ts: 2 },
      ],
      dailyLeft: 12,
      dailyLeftDate: '2026-11-19',
    });
    useCoachChatStore.getState().clearCoachChat();
    const s = useCoachChatStore.getState();
    expect(s.messages).toEqual([]);
    expect(s.dailyLeft).toBeNull();
    expect(s.dailyLeftDate).toBeNull();
  });
});
