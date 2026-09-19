import { describe, it, expect } from 'vitest';
import { StreakEngine } from '../StreakEngine';

describe('StreakEngine — Habits & Rest Day Grace', () => {
  it('starts streak at 1 on first workout', () => {
    const result = StreakEngine.evaluateStreak(null, '2026-09-19', 0, 0, 1);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
    expect(result.tokensConsumed).toBe(0);
  });

  it('increments streak on consecutive days', () => {
    const result = StreakEngine.evaluateStreak('2026-09-18', '2026-09-19', 4, 10, 1);
    expect(result.currentStreak).toBe(5);
    expect(result.longestStreak).toBe(10);
    expect(result.tokensConsumed).toBe(0);
  });

  it('keeps streak identical on multiple workouts on same date', () => {
    const result = StreakEngine.evaluateStreak('2026-09-19', '2026-09-19', 5, 10, 1);
    expect(result.currentStreak).toBe(5);
  });

  it('preserves and advances streak on scheduled rest day (Rest Day Grace)', () => {
    // Last workout was 2 days ago (e.g. Sept 17), yesterday (Sept 18) was scheduled rest
    const result = StreakEngine.evaluateStreak(
      '2026-09-17',
      '2026-09-19',
      10,
      15,
      1,
      true // isScheduledRestDayYesterday = true
    );
    expect(result.currentStreak).toBe(11);
    expect(result.restDayGraceApplied).toBe(true);
    expect(result.tokensConsumed).toBe(0); // Did not need to use freeze token!
  });

  it('consumes streak freeze token if unscheduled day was missed', () => {
    // Last workout 2 days ago, NOT a scheduled rest day, but user has 1 freeze token
    const result = StreakEngine.evaluateStreak(
      '2026-09-17',
      '2026-09-19',
      10,
      15,
      1, // 1 token available
      false // NOT a scheduled rest day
    );
    expect(result.currentStreak).toBe(11);
    expect(result.streakFreezeTokens).toBe(0);
    expect(result.tokensConsumed).toBe(1);
    expect(result.restDayGraceApplied).toBe(true);
  });

  it('resets streak to 1 if missed day occurred with 0 freeze tokens', () => {
    const result = StreakEngine.evaluateStreak(
      '2026-09-17',
      '2026-09-19',
      10,
      25,
      0, // 0 tokens available
      false
    );
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(25); // Longest streak preserved!
    expect(result.tokensConsumed).toBe(0);
  });

  it('awards +1 streak freeze token upon reaching 14-day milestone', () => {
    // Going from 13 to 14 days
    const result = StreakEngine.evaluateStreak('2026-09-18', '2026-09-19', 13, 13, 0);
    expect(result.currentStreak).toBe(14);
    expect(result.streakFreezeTokens).toBe(1);
    expect(result.tokensEarned).toBe(1);
    expect(result.isMilestone).toBe(true);
  });
});
