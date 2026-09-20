import { describe, it, expect } from 'vitest';
import { MasteryEngine } from '../MasteryEngine';
import { SetLog } from '../../../types/domain.types';

describe('MasteryEngine', () => {
  it('calculates Lift Level accurately across XP progression with round(100 * level^1.25)', () => {
    // 0 XP -> Level 1
    const info0 = MasteryEngine.getMasteryLevelInfo(0);
    expect(info0.level).toBe(1);
    expect(info0.masteryTierTitle).toBe('Novice');

    // Level 1 requires round(100 * 1^1.25) = 100 XP
    expect(MasteryEngine.getXpForNextLevel(1)).toBe(100);
    expect(MasteryEngine.getXPRequiredForLevel(1)).toBe(100);

    // Level 2 requires round(100 * 2^1.25) = 238 XP
    expect(MasteryEngine.getXpForNextLevel(2)).toBe(238);

    // Level 27 requires round(100 * 27^1.25) = 6155 XP
    expect(MasteryEngine.getXpForNextLevel(27)).toBe(6155);

    // Verify getExerciseLevelFromXP
    expect(MasteryEngine.getExerciseLevelFromXP(0)).toBe(1);
    expect(MasteryEngine.getExerciseLevelFromXP(99)).toBe(1);
    expect(MasteryEngine.getExerciseLevelFromXP(100)).toBe(2);
    expect(MasteryEngine.getExerciseLevelFromXP(337)).toBe(2);
    expect(MasteryEngine.getExerciseLevelFromXP(338)).toBe(3);
  });

  it('determines deterministic exercise ranks from level', () => {
    // E: 1-10
    expect(MasteryEngine.getExerciseRankFromLevel(1).tier).toBe('E');
    expect(MasteryEngine.getExerciseRankFromLevel(10).tier).toBe('E');

    // D: 11-20
    expect(MasteryEngine.getExerciseRankFromLevel(11).tier).toBe('D');
    expect(MasteryEngine.getExerciseRankFromLevel(20).tier).toBe('D');

    // C: 21-30
    expect(MasteryEngine.getExerciseRankFromLevel(21).tier).toBe('C');
    expect(MasteryEngine.getExerciseRankFromLevel(30).tier).toBe('C');

    // B: 31-40
    expect(MasteryEngine.getExerciseRankFromLevel(31).tier).toBe('B');
    expect(MasteryEngine.getExerciseRankFromLevel(40).tier).toBe('B');

    // A: 41-50
    expect(MasteryEngine.getExerciseRankFromLevel(41).tier).toBe('A');
    expect(MasteryEngine.getExerciseRankFromLevel(50).tier).toBe('A');

    // S: 51-60
    expect(MasteryEngine.getExerciseRankFromLevel(51).tier).toBe('S');
    expect(MasteryEngine.getExerciseRankFromLevel(60).tier).toBe('S');

    // SS: 61-80
    expect(MasteryEngine.getExerciseRankFromLevel(61).tier).toBe('SS');
    expect(MasteryEngine.getExerciseRankFromLevel(80).tier).toBe('SS');

    // SSS: 81-100+
    expect(MasteryEngine.getExerciseRankFromLevel(81).tier).toBe('SSS');
    expect(MasteryEngine.getExerciseRankFromLevel(100).tier).toBe('SSS');
    expect(MasteryEngine.getExerciseRankFromLevel(101).tier).toBe('SSS');
    expect(MasteryEngine.getExerciseRankFromLevel(150).tier).toBe('SSS');
  });

  it('progresses exercise level beyond 100 monotonically without clamping', () => {
    // Calculate total XP needed for level 101
    let totalXpFor101 = 0;
    for (let l = 1; l <= 100; l++) {
      totalXpFor101 += MasteryEngine.getXpForNextLevel(l);
    }
    
    // Exactly reaching 101 threshold
    expect(MasteryEngine.getExerciseLevelFromXP(totalXpFor101)).toBe(101);
    
    // Progress for 101
    const progress101 = MasteryEngine.getExerciseProgress(totalXpFor101);
    expect(progress101.level).toBe(101);
    expect(progress101.rank).toBe('SSS');
    expect(progress101.xpRequiredForNextLevel).toBe(MasteryEngine.getXpForNextLevel(101));
  });

  it('calculates exercise XP with base, heavy set bonus, volume bonus, and PR bonus', () => {
    // Non-completed set yields 0 XP
    expect(MasteryEngine.calculateExerciseXP({ weightKg: 100, reps: 5, setType: 'NORMAL', rpe: null, completed: false })).toBe(0);
    // 0 reps yields 0 XP
    expect(MasteryEngine.calculateExerciseXP({ weightKg: 100, reps: 0, setType: 'NORMAL', rpe: null, completed: true })).toBe(0);

    // Normal set: 100kg x 5 reps (baseline 1RM = 100kg)
    // 100kg >= 80kg (80% 1RM) -> heavy bonus = 8
    // Volume: 500kg -> volume bonus = 500 / 100 = 5
    // Base: 20
    // Total: 20 + 8 + 5 = 33 XP
    const normalSet: Pick<SetLog, 'weightKg' | 'reps' | 'setType' | 'rpe' | 'completed'> = {
      weightKg: 100,
      reps: 5,
      setType: 'NORMAL',
      rpe: 8,
      completed: true,
    };
    const xp = MasteryEngine.calculateExerciseXP(normalSet, 100, false);
    expect(xp).toBe(33);

    // With PR bonus (+50)
    const prXp = MasteryEngine.calculateExerciseXP(normalSet, 100, true);
    expect(prXp).toBe(33 + 50);

    // Warmup set yields reduced base XP without heavy or volume bonuses
    const warmupSet = { ...normalSet, setType: 'WARMUP' as const };
    const warmupXp = MasteryEngine.calculateExerciseXP(warmupSet, 100, false);
    expect(warmupXp).toBe(4); // 20 * 0.2 = 4
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

  it('evaluates mastery updates including rank up and relative strength calculation', () => {
    const sets: SetLog[] = [
      {
        id: 's1',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 1,
        setType: 'NORMAL',
        weightKg: 140,
        reps: 5, // e1RM = 140 * (1 + 5/30) = 163.3
        rpe: 9,
        estimated1RmKg: 163.3,
        isPr: true,
        completed: true,
        completedAt: new Date().toISOString(),
      },
    ];

    const result = MasteryEngine.evaluateMasteryUpdate(
      null, // Fresh exercise
      'ex-squat',
      'u1',
      sets,
      1,
      70, // 70kg athlete bodyweight
      {
        id: 'ex-squat',
        name: 'Barbell Back Squat',
        slug: 'barbell-back-squat',
        primaryMuscle: 'Quadriceps',
        secondaryMuscles: ['Glutes'],
        equipment: 'BARBELL',
        movementPattern: 'SQUAT',
        tier: 'COMPOUND_PRIMARY',
        progressionType: 'BARBELL_COMPOUND',
        supports1Rm: true,
        supportsRelativeStrength: true,
        isBodyweight: false,
        isCustom: false,
      }
    );

    expect(result.xpEarned).toBeGreaterThan(0);
    expect(result.updatedMastery.estimated1RmKg).toBe(163.3);
    // Relative strength: 163.3 / 70 = 2.33x bodyweight
    expect(result.updatedMastery.relativeStrength).toBe(2.33);
    expect(result.updatedMastery.rank).toBe('E');
    expect(result.newPrs.length).toBeGreaterThan(0);
  });
});
