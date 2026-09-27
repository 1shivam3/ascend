import { ASCEND_QUOTES, AscendQuote, QuoteCategory } from '../../constants/quotes';

export class QuoteEngine {
  private static shownQuoteIds: Set<string> = new Set();

  /**
   * Retrieves a quote for the specified category while avoiding repetition
   * within the active session.
   */
  static getQuote(category: QuoteCategory, seedModifier: number = 0): AscendQuote {
    const candidates = ASCEND_QUOTES.filter(q => q.category === category);
    if (candidates.length === 0) {
      return ASCEND_QUOTES[0];
    }

    // Filter out quotes shown recently in this session
    const unshown = candidates.filter(q => !this.shownQuoteIds.has(q.id));
    const pool = unshown.length > 0 ? unshown : candidates;

    // Stable selection using date + modifier if pool is unshown
    const todayStr = new Date().toISOString().slice(0, 10);
    let hash = seedModifier;
    for (let i = 0; i < todayStr.length; i++) {
      hash = (hash * 31 + todayStr.charCodeAt(i)) & 0xffffffff;
    }
    const index = Math.abs(hash) % pool.length;
    const selected = pool[index];

    this.shownQuoteIds.add(selected.id);
    return selected;
  }

  /**
   * Stable Daily Mentality quote for Home Screen (stays constant throughout the day)
   */
  static getDailyQuote(): AscendQuote {
    return this.getQuote('DAILY', 42);
  }

  /**
   * Pre-Workout quote
   */
  static getPreWorkoutQuote(): AscendQuote {
    return this.getQuote('PRE_WORKOUT');
  }

  /**
   * Rest interval quote
   */
  static getRestQuote(): AscendQuote {
    return this.getQuote('REST');
  }

  /**
   * PR Celebration quote
   */
  static getPrQuote(): AscendQuote {
    return this.getQuote('PR');
  }

  /**
   * Level Up celebration quote
   */
  static getLevelUpQuote(): AscendQuote {
    return this.getQuote('LEVEL_UP');
  }

  /**
   * Rank Up celebration quote
   */
  static getRankUpQuote(): AscendQuote {
    return this.getQuote('RANK_UP');
  }

  /**
   * Missed session / supportive return quote
   */
  static getMissedSessionQuote(): AscendQuote {
    return this.getQuote('DIFFICULT_DAYS');
  }

  /**
   * Clear session history
   */
  static resetSession(): void {
    this.shownQuoteIds.clear();
  }
}
