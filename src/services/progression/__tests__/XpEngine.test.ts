import { describe, it, expect } from 'vitest';
import { XpEngine } from '../XpEngine';
import { PROGRESSION_CONFIG } from '../../../config/progression.config';

describe('XpEngine — Global Progression', () => {
  it('implements configurable curve: round(500 * level ^ 1.25)', () => {
    // Level 1: round(500 * 1^1.25) = 500
    expect(XpEngine.getXpForNextLevel(1)).toBe(500);

    // Level 2: round(500 * 2^1.25) = 1189
    expect(XpEngine.getXpForNextLevel(2)).toBe(1189);

    // Level 10: round(500 * 10^1.25) = 8891
    expect(XpEngine.getXpForNextLevel(10)).toBe(8891);

    // Cumulative XP for level 1 is 0, level 2 is 500, level 3 is 500 + 1189 = 1689
    expect(XpEngine.getXpRequiredForLevel(1)).toBe(0);
    expect(XpEngine.getXpRequiredForLevel(2)).toBe(500);
    expect(XpEngine.getXpRequiredForLevel(3)).toBe(1689);
  });

  it('calculates global character level and progress percentage', () => {
    const info0 = XpEngine.getLevelInfo(0);
    expect(info0.level).toBe(1);
    expect(info0.progressPercent).toBe(0);

    const neededLvl1 = XpEngine.getXpForNextLevel(1); // 500
    const halfwayInfo = XpEngine.getLevelInfo(Math.floor(neededLvl1 / 2)); // 250
    expect(halfwayInfo.level).toBe(1);
    expect(halfwayInfo.progressPercent).toBeCloseTo(50, 0);

    // Exact transition to Level 2 (501 XP)
    const level2Info = XpEngine.getLevelInfo(neededLvl1 + 1);
    expect(level2Info.level).toBe(2);
    expect(level2Info.currentLevelXp).toBe(1);
    expect(level2Info.xpRequiredForNextLevel).toBe(XpEngine.getXpForNextLevel(2));
  });

  it('calculates set XP correctly with effort and set type modifiers', () => {
    // Normal set with RPE 8: 15 base + (8 - 5) * 2 = 21 XP
    const completedSet = { setType: 'NORMAL' as const, rpe: 8, completed: true, reps: 5, weightKg: 100 };
    expect(XpEngine.calculateSetXp(completedSet)).toBe(21);

    // Failure set: 15 base + 10 = 25 XP
    const failureSet = { setType: 'FAILURE' as const, rpe: null, completed: true, reps: 5, weightKg: 100 };
    expect(XpEngine.calculateSetXp(failureSet)).toBe(25);

    // Drop set: 15 base + 5 = 20 XP
    const dropSet = { setType: 'DROP' as const, rpe: null, completed: true, reps: 10, weightKg: 60 };
    expect(XpEngine.calculateSetXp(dropSet)).toBe(20);

    // Warmup set: 15 * 0.2 = 3 XP
    const warmupSet = { setType: 'WARMUP' as const, rpe: null, completed: true, reps: 10, weightKg: 40 };
    expect(XpEngine.calculateSetXp(warmupSet)).toBe(3);

    // Anti-exploit: uncompleted sets or 0 reps award ZERO XP
    const uncompletedSet = { setType: 'NORMAL' as const, rpe: 8, completed: false, reps: 5, weightKg: 100 };
    expect(XpEngine.calculateSetXp(uncompletedSet)).toBe(0);

    const zeroRepSet = { setType: 'NORMAL' as const, rpe: 8, completed: true, reps: 0, weightKg: 100 };
    expect(XpEngine.calculateSetXp(zeroRepSet)).toBe(0);
  });

  it('caps session completion XP to prevent exploitation', () => {
    // Huge tonnage and long duration capped at configured maximum (500 XP)
    const cappedXp = XpEngine.calculateSessionXp(50000, 180);
    expect(cappedXp).toBe(PROGRESSION_CONFIG.globalXp.maxSessionXpCap);
    expect(cappedXp).toBe(500);

    // Standard session: base 120 + volume bonus + duration bonus
    const normalXp = XpEngine.calculateSessionXp(8000, 60);
    expect(normalXp).toBeLessThan(500);
    expect(normalXp).toBeGreaterThan(150);

    // Disqualified session returns 0 XP
    const zeroXp = XpEngine.calculateSessionXp(8000, 60, false);
    expect(zeroXp).toBe(0);
  });

  it('scales streak multiplier correctly up to configured +30% cap', () => {
    expect(XpEngine.calculateStreakMultiplier(0)).toBe(1.0);
    expect(XpEngine.calculateStreakMultiplier(5)).toBe(1.10); // +10%
    expect(XpEngine.calculateStreakMultiplier(15)).toBe(1.30); // max 30%
    expect(XpEngine.calculateStreakMultiplier(100)).toBe(1.30); // capped at 30%
  });

  it('evaluates full workout session with anti-exploit qualification', () => {
    const validWorkout = {
      status: 'COMPLETED' as const,
      durationSeconds: 2400, // 40 min
      totalVolumeKg: 5000,
      exercises: [
        {
          id: 'el1',
          workoutId: 'w1',
          exerciseId: 'ex1',
          userId: 'u1',
          orderIndex: 0,
          sets: [
            {
              id: 's1',
              exerciseLogId: 'el1',
              userId: 'u1',
              setNumber: 1,
              setType: 'NORMAL' as const,
              weightKg: 100,
              reps: 5,
              rpe: 8,
              estimated1RmKg: 115,
              isPr: false,
              completed: true,
              completedAt: '2026-09-19T10:05:00Z',
            },
          ],
        },
      ],
    };

    const evalResult = XpEngine.evaluateWorkoutSessionXp(validWorkout, 5);
    expect(evalResult.qualifying).toBe(true);
    expect(evalResult.xpEarned).toBeGreaterThan(150);

    // Non-qualifying empty workout gives 0 XP
    const emptyWorkout = {
      status: 'COMPLETED' as const,
      durationSeconds: 120, // < 180s
      totalVolumeKg: 0,
      exercises: [],
    };
    const invalidResult = XpEngine.evaluateWorkoutSessionXp(emptyWorkout, 5);
    expect(invalidResult.qualifying).toBe(false);
    expect(invalidResult.xpEarned).toBe(0);
  });
});
