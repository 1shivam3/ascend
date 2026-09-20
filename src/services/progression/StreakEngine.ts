import { PROGRESSION_CONFIG } from '../../config/progression.config';

export interface StreakEvaluationResult {
  currentStreak: number;
  longestStreak: number;
  streakFreezeTokens: number;
  tokensConsumed: number;
  tokensEarned: number;
  isMilestone: boolean;
  milestoneTitle?: string;
  restDayGraceApplied: boolean;
}

export class StreakEngine {
  static readonly MILESTONES: Record<number, string> = {
    7: 'Bronze Habit (7 Days)',
    14: 'Silver Fortitude (14 Days)',
    30: 'Golden Discipline (30 Days)',
    60: 'Centurion Consistency (60 Days)',
    90: 'Apex Dedication (90 Days)',
    180: 'Sovereign Titan (180 Days)',
    365: 'Ascendant Legend (1 Year)',
  };

  /**
   * Converts any Date object, ISO string, or timestamp into a normalized
   * calendar date string 'YYYY-MM-DD' in the specified timezone (defaults to system local or UTC).
   */
  static getCalendarDateString(
    input: Date | string | number,
    timeZone?: string
  ): string {
    const date = typeof input === 'object' ? input : new Date(input);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date provided to getCalendarDateString: ${input}`);
    }

    if (timeZone) {
      try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        return formatter.format(date);
      } catch {
        // Fallback to UTC if timezone is invalid
      }
    }

    // Default UTC YYYY-MM-DD
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Calculates the exact calendar day difference between two 'YYYY-MM-DD' strings.
   * Eliminates DST and timezone hour drift by computing difference in whole calendar days.
   */
  static getCalendarDayDifference(fromDateStr: string, toDateStr: string): number {
    const [fromY, fromM, fromD] = fromDateStr.split('T')[0].split('-').map(Number);
    const [toY, toM, toD] = toDateStr.split('T')[0].split('-').map(Number);

    const fromUtcDay = Math.floor(Date.UTC(fromY, fromM - 1, fromD) / 86400000);
    const toUtcDay = Math.floor(Date.UTC(toY, toM - 1, toD) / 86400000);

    return toUtcDay - fromUtcDay;
  }

  /**
   * Evaluates streak updates following workout completion or daily check-in.
   * Completely calendar-date and timezone safe.
   */
  static evaluateStreak(
    lastWorkoutDateStr: string | null,
    currentDateStr: string,
    currentStreak: number,
    longestStreak: number,
    streakFreezeTokens: number,
    isScheduledRestDayYesterday: boolean = false
  ): StreakEvaluationResult {
    const cleanCurrentDate = currentDateStr.split('T')[0];

    // First workout ever
    if (!lastWorkoutDateStr) {
      return {
        currentStreak: 1,
        longestStreak: Math.max(1, longestStreak),
        streakFreezeTokens: Math.min(PROGRESSION_CONFIG.streak.maxFreezeTokensHeld, streakFreezeTokens),
        tokensConsumed: 0,
        tokensEarned: 0,
        isMilestone: false,
        restDayGraceApplied: false,
      };
    }

    const cleanLastDate = lastWorkoutDateStr.split('T')[0];
    const diffDays = this.getCalendarDayDifference(cleanLastDate, cleanCurrentDate);

    let updatedStreak = currentStreak;
    let tokens = streakFreezeTokens;
    let tokensConsumed = 0;
    let tokensEarned = 0;
    let restDayGraceApplied = false;

    if (diffDays <= 0) {
      // Multiple workouts on the same calendar day do not advance or break streak
      return {
        currentStreak,
        longestStreak,
        streakFreezeTokens: tokens,
        tokensConsumed: 0,
        tokensEarned: 0,
        isMilestone: false,
        restDayGraceApplied: false,
      };
    }

    if (diffDays === 1) {
      // Consecutive calendar day
      updatedStreak += 1;
    } else if (diffDays === 2 && isScheduledRestDayYesterday) {
      // Rest Day Grace applied!
      updatedStreak += 1;
      restDayGraceApplied = true;
    } else if (diffDays === 2 && tokens > 0) {
      // Streak freeze token auto-consumed
      tokens -= 1;
      tokensConsumed += 1;
      updatedStreak += 1;
      restDayGraceApplied = true;
    } else {
      // Streak broken (missed days with no freeze token)
      updatedStreak = 1;
    }

    // Award +1 freeze token every configured days (e.g. 14 days)
    if (
      updatedStreak > 0 &&
      updatedStreak % PROGRESSION_CONFIG.streak.daysPerFreezeTokenEarned === 0 &&
      tokens < PROGRESSION_CONFIG.streak.maxFreezeTokensHeld
    ) {
      tokens += 1;
      tokensEarned += 1;
    }

    const updatedLongest = Math.max(longestStreak, updatedStreak);
    const milestoneTitle = this.MILESTONES[updatedStreak];
    const isMilestone = Boolean(milestoneTitle);

    return {
      currentStreak: updatedStreak,
      longestStreak: updatedLongest,
      streakFreezeTokens: tokens,
      tokensConsumed,
      tokensEarned,
      isMilestone,
      milestoneTitle,
      restDayGraceApplied,
    };
  }
}
