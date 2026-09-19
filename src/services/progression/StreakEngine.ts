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
   * Evaluates streak updates following workout completion or daily check-in.
   */
  static evaluateStreak(
    lastWorkoutDateStr: string | null,
    currentDateStr: string,
    currentStreak: number,
    longestStreak: number,
    streakFreezeTokens: number,
    isScheduledRestDayYesterday: boolean = false
  ): StreakEvaluationResult {
    // If first workout ever
    if (!lastWorkoutDateStr) {
      return {
        currentStreak: 1,
        longestStreak: Math.max(1, longestStreak),
        streakFreezeTokens: Math.min(2, streakFreezeTokens),
        tokensConsumed: 0,
        tokensEarned: 0,
        isMilestone: false,
        restDayGraceApplied: false,
      };
    }

    const lastDate = new Date(lastWorkoutDateStr);
    const currentDate = new Date(currentDateStr);
    
    // Normalize to UTC midnight dates
    const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    let updatedStreak = currentStreak;
    let tokens = streakFreezeTokens;
    let tokensConsumed = 0;
    let tokensEarned = 0;
    let restDayGraceApplied = false;

    if (diffDays === 0) {
      // Multiple workouts in same day do not increase streak
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
      // Normal consecutive day
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
      // Streak broken
      updatedStreak = 1;
    }

    // Award +1 freeze token every 14 streak days (max 2 held)
    if (updatedStreak > 0 && updatedStreak % 14 === 0 && tokens < 2) {
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
