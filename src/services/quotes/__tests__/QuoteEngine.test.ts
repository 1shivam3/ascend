import { describe, it, expect, beforeEach } from 'vitest';
import { QuoteEngine } from '../QuoteEngine';
import { ASCEND_QUOTES } from '../../../constants/quotes';

describe('QuoteEngine', () => {
  beforeEach(() => {
    QuoteEngine.resetSession();
  });

  it('contains at least 100 quotes across categories', () => {
    expect(ASCEND_QUOTES.length).toBeGreaterThanOrEqual(100);
  });

  it('returns a daily quote deterministically', () => {
    const q1 = QuoteEngine.getDailyQuote();
    expect(q1).toBeDefined();
    expect(q1.text).toBeTruthy();
    expect(q1.category).toBe('DAILY');
  });

  it('returns appropriate quotes for all key event categories', () => {
    const pre = QuoteEngine.getPreWorkoutQuote();
    expect(pre.category).toBe('PRE_WORKOUT');

    const rest = QuoteEngine.getRestQuote();
    expect(rest.category).toBe('REST');

    const pr = QuoteEngine.getPrQuote();
    expect(pr.category).toBe('PR');

    const lvl = QuoteEngine.getLevelUpQuote();
    expect(lvl.category).toBe('LEVEL_UP');

    const rank = QuoteEngine.getRankUpQuote();
    expect(rank.category).toBe('RANK_UP');

    const missed = QuoteEngine.getMissedSessionQuote();
    expect(missed.category).toBe('DIFFICULT_DAYS');
  });

  it('avoids repeating the same quote within the active session', () => {
    const prQuotes = ASCEND_QUOTES.filter(q => q.category === 'PR');
    const drawn: string[] = [];

    for (let i = 0; i < Math.min(prQuotes.length, 5); i++) {
      const q = QuoteEngine.getQuote('PR', i);
      expect(drawn).not.toContain(q.id);
      drawn.push(q.id);
    }
  });

  it('resets session tracking correctly', () => {
    const q1 = QuoteEngine.getQuote('PR');
    QuoteEngine.resetSession();
    // After reset, the same pool can be selected without error
    const q2 = QuoteEngine.getQuote('PR');
    expect(q2).toBeDefined();
  });
});
