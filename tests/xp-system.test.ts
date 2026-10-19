import { describe, it, expect } from 'vitest';
import {
  calculateLevel,
  xpForLevel,
  xpToNextLevel,
  awardXP,
  XP_AWARDS,
} from '../src/lib/xp-system';

describe('XP System', () => {
  it('calculates levels correctly', () => {
    expect(calculateLevel(0)).toBe(1);
    expect(calculateLevel(99)).toBe(1);
    expect(calculateLevel(100)).toBe(2);
    expect(calculateLevel(400)).toBe(3);
    expect(calculateLevel(1600)).toBe(5);
  });

  it('xpForLevel returns threshold for each level', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(400);
  });

  it('xpToNextLevel shows progress', () => {
    const { current, needed, progress } = xpToNextLevel(150);
    expect(current).toBe(50);
    expect(needed).toBe(300);
    expect(progress).toBeCloseTo(50 / 300);
  });

  it('awardXP detects level-ups', () => {
    const result = awardXP(90, 20, 'Test');
    expect(result.newTotal).toBe(110);
    expect(result.leveledUp).toBe(true);
    expect(result.newLevel).toBe(2);
    expect(result.transaction.amount).toBe(20);
    expect(result.transaction.reason).toBe('Test');
  });

  it('awardXP does not false-positive level-ups', () => {
    const result = awardXP(150, 20, 'Test');
    expect(result.leveledUp).toBe(false);
    expect(result.newLevel).toBe(2);
  });

  it('XP awards are sane values', () => {
    expect(XP_AWARDS.WORKOUT_COMPLETE).toBe(100);
    expect(XP_AWARDS.MEAL_LOGGED).toBe(20);
    expect(XP_AWARDS.PR_HIT).toBe(50);
  });
});
