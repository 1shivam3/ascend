import { describe, it, expect } from 'vitest';
import { MasteryEngine } from '../MasteryEngine';
import { SetLog } from '../../../types/domain.types';

describe('MasteryEngine', () => {
  it('calculates Lift Level accurately across XP progression', () => {
    // 0 XP -> Level 1
    const info0 = MasteryEngine.getMasteryLevelInfo(0);
    expect(info0.level).toBe(1);
    expect(info0.masteryTierTitle).toBe('Novice');

    // Small XP -> Level 2 or 3
    const nextXp = MasteryEngine.getXpForNextLevel(1);
    const infoLevel2 = MasteryEngine.getMasteryLevelInfo(nextXp + 10);
    expect(infoLevel2.level).toBe(2);

    // High XP -> Level 27 (Bench Press scenario)
    // Verify higher levels have higher required XP
    const xpLvl20 = MasteryEngine.getXpForNextLevel(20);
    const xpLvl50 = MasteryEngine.getXpForNextLevel(50);
    expect(xpLvl50).toBeGreaterThan(xpLvl20);
  });

  it('calculates set mastery XP with intensity and RPE multipliers', () => {
    const normalSet: Pick<SetLog, 'weightKg' | 'reps' | 'setType' | 'rpe' | 'completed'> = {
      weightKg: 100,
      reps: 5,
      setType: 'NORMAL',
      rpe: 8,
      completed: true,
    };

    const normalXp = MasteryEngine.calculateSetMasteryXp(normalSet, 120);
    expect(normalXp).toBeGreaterThan(0);

    // Failure set yields bonus XP
    const failureSet = { ...normalSet, setType: 'FAILURE' as const };
    const failureXp = MasteryEngine.calculateSetMasteryXp(failureSet, 120);
    expect(failureXp).toBeGreaterThan(normalXp);

    // Warmup set yields reduced XP
    const warmupSet = { ...normalSet, setType: 'WARMUP' as const };
    const warmupXp = MasteryEngine.calculateSetMasteryXp(warmupSet, 120);
    expect(warmupXp).toBeLessThan(normalXp);
  });

  it('detects all four types of Personal Records in a session', () => {
    const existingPrs = {
      MAX_WEIGHT: 100,
      MAX_REPS: 10,
      MAX_VOLUME: 800,
      MAX_ESTIMATED_1RM: 115,
    };

    const sets: SetLog[] = [
      {
        id: 's1',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 1,
        setType: 'NORMAL',
        weightKg: 110, // Breaks MAX_WEIGHT (110 > 100) and MAX_ESTIMATED_1RM
        reps: 5,
        rpe: 9,
        estimated1RmKg: 126,
        isPr: false,
        completed: true,
        completedAt: new Date().toISOString(),
      },
      {
        id: 's2',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 2,
        setType: 'NORMAL',
        weightKg: 90,
        reps: 15, // Breaks MAX_REPS (15 > 10) and MAX_VOLUME (90*15 = 1350 > 800)
        rpe: 9.5,
        estimated1RmKg: 110,
        isPr: false,
        completed: true,
        completedAt: new Date().toISOString(),
      },
    ];

    const detectedPrs = MasteryEngine.detectPersonalRecords(existingPrs, sets);
    const prTypes = detectedPrs.map(p => p.prType);

    expect(prTypes).toContain('MAX_WEIGHT');
    expect(prTypes).toContain('MAX_ESTIMATED_1RM');
    expect(prTypes).toContain('MAX_REPS');
    expect(prTypes).toContain('MAX_VOLUME');
  });

  it('confirms exercise mastery operates independently per lift', () => {
    // Athlete evaluates Bench Press (e.g. 500 XP -> Level 2, Novice)
    // Athlete evaluates Deadlift with high dedication (e.g. 250,000 XP -> Level 20+, Apprentice)
    const benchInfo = MasteryEngine.getMasteryLevelInfo(500);
    const deadliftInfo = MasteryEngine.getMasteryLevelInfo(250000);

    expect(deadliftInfo.level).toBeGreaterThan(benchInfo.level);
    expect(benchInfo.masteryTierTitle).toBe('Novice');
    expect(deadliftInfo.masteryTierTitle).toBe('Apprentice');
  });
});
