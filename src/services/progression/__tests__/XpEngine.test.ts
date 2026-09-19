import { describe, it, expect } from 'vitest';
import { XpEngine } from '../XpEngine';

describe('XpEngine — Global Progression', () => {
  it('calculates global character level and progress percentage', () => {
    const info0 = XpEngine.getLevelInfo(0);
    expect(info0.level).toBe(1);
    expect(info0.progressPercent).toBe(0);

    const neededLvl1 = XpEngine.getXpForNextLevel(1);
    const halfwayInfo = XpEngine.getLevelInfo(Math.floor(neededLvl1 / 2));
    expect(halfwayInfo.level).toBe(1);
    expect(halfwayInfo.progressPercent).toBeCloseTo(50, 0);

    // Exact transition to Level 2
    const level2Info = XpEngine.getLevelInfo(neededLvl1 + 1);
    expect(level2Info.level).toBe(2);
  });

  it('calculates set XP correctly', () => {
    const completedSet = { setType: 'NORMAL' as const, rpe: 8, completed: true };
    const xp = XpEngine.calculateSetXp(completedSet);
    // 15 base + 16 (8*2) = 31 XP
    expect(xp).toBe(31);

    const uncompletedSet = { setType: 'NORMAL' as const, rpe: 8, completed: false };
    expect(XpEngine.calculateSetXp(uncompletedSet)).toBe(0);
  });

  it('caps session completion XP to prevent exploitation', () => {
    // Huge tonnage and long duration
    const cappedXp = XpEngine.calculateSessionXp(50000, 180);
    expect(cappedXp).toBe(400);

    // Standard session
    const normalXp = XpEngine.calculateSessionXp(8000, 60);
    expect(normalXp).toBeLessThan(400);
    expect(normalXp).toBeGreaterThan(150);
  });

  it('scales streak multiplier correctly up to +30% cap', () => {
    expect(XpEngine.calculateStreakMultiplier(0)).toBe(1.0);
    expect(XpEngine.calculateStreakMultiplier(5)).toBe(1.10); // +10%
    expect(XpEngine.calculateStreakMultiplier(15)).toBe(1.30); // max 30%
    expect(XpEngine.calculateStreakMultiplier(100)).toBe(1.30); // capped at 30%
  });
});
