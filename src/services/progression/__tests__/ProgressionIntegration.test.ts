import { describe, it, expect } from 'vitest';
import { XpEngine } from '../XpEngine';
import { MasteryEngine } from '../MasteryEngine';
import { AttributeEngine } from '../AttributeEngine';
import { StreakEngine } from '../StreakEngine';
import { calculateEstimated1RM } from '../../../utils/1rm';
import { SetLog, WorkoutSession } from '../../../types/domain.types';

describe('ASCEND Progression Engine — End-to-End Tactical Pipeline', () => {
  it('executes full progression cycle from logged sets to character ascension', () => {
    // 1. Initial State
    const initialGlobalXp = 0;
    const initialLevelInfo = XpEngine.getLevelInfo(initialGlobalXp);
    expect(initialGlobalXp).toBe(0);
    expect(initialLevelInfo.level).toBe(1);

    const initialSquatMastery = null; // Unranked
    const initialAttributes = { strength: 10, stamina: 10, agility: 10, discipline: 10, vitality: 10 };

    // 2. Athlete logs heavy squat session
    const sets: SetLog[] = [
      {
        id: 's1',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 1,
        setType: 'WARMUP',
        weightKg: 60,
        reps: 10,
        rpe: 6,
        estimated1RmKg: calculateEstimated1RM(60, 10),
        isPr: false,
        completed: true,
        completedAt: '2026-09-19T10:05:00Z',
      },
      {
        id: 's2',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 2,
        setType: 'NORMAL',
        weightKg: 100,
        reps: 5,
        rpe: 7.5,
        estimated1RmKg: calculateEstimated1RM(100, 5),
        isPr: false,
        completed: true,
        completedAt: '2026-09-19T10:10:00Z',
      },
      {
        id: 's3',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 3,
        setType: 'NORMAL',
        weightKg: 140,
        reps: 5,
        rpe: 8.5,
        estimated1RmKg: calculateEstimated1RM(140, 5),
        isPr: false,
        completed: true,
        completedAt: '2026-09-19T10:15:00Z',
      },
      {
        id: 's4',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 4,
        setType: 'FAILURE',
        weightKg: 150,
        reps: 4,
        rpe: 10,
        estimated1RmKg: calculateEstimated1RM(150, 4),
        isPr: false,
        completed: true,
        completedAt: '2026-09-19T10:20:00Z',
      },
    ];

    // 3. Evaluate Exercise Mastery
    const masteryEval = MasteryEngine.evaluateMasteryUpdate(
      initialSquatMastery,
      'ex-barbell-back-squat',
      'u1',
      sets
    );

    expect(masteryEval.xpEarned).toBeGreaterThan(200);
    expect(masteryEval.updatedMastery.estimated1RmKg).toBeGreaterThan(160);
    expect(masteryEval.updatedMastery.bestWeightKg).toBe(150);
    expect(masteryEval.newPrs.length).toBeGreaterThanOrEqual(3);

    // 4. Evaluate Global XP & Level
    let setsXp = 0;
    let totalVolume = 0;
    for (const s of sets) {
      setsXp += XpEngine.calculateSetXp(s);
      totalVolume += s.weightKg * s.reps;
    }

    const sessionXp = XpEngine.calculateSessionXp(totalVolume, 45);
    const prBonusXp = masteryEval.newPrs.length * 100;
    const totalEarnedXp = setsXp + sessionXp + prBonusXp;

    expect(totalEarnedXp).toBeGreaterThan(400);

    const newLevelInfo = XpEngine.getLevelInfo(totalEarnedXp);
    expect(newLevelInfo.level).toBeGreaterThan(1); // Level-up confirmed!

    // 5. Evaluate Streak with Rest Day Grace
    const streakResult = StreakEngine.evaluateStreak(
      null,
      '2026-09-19',
      0,
      0,
      1
    );
    expect(streakResult.currentStreak).toBe(1);

    // 6. Evaluate Attributes Update
    const sessionDoc: WorkoutSession = {
      id: 'w1',
      userId: 'u1',
      title: 'Heavy Squat Session',
      startedAt: '2026-09-19T10:00:00Z',
      completedAt: '2026-09-19T10:45:00Z',
      durationSeconds: 2700,
      totalVolumeKg: totalVolume,
      totalReps: 24,
      totalSets: 4,
      status: 'COMPLETED',
      xpEarned: totalEarnedXp,
      exercises: [
        {
          id: 'el1',
          workoutId: 'w1',
          exerciseId: 'ex-barbell-back-squat',
          userId: 'u1',
          orderIndex: 0,
          exercise: {
            id: 'ex-barbell-back-squat',
            name: 'Barbell Back Squat',
            slug: 'barbell-back-squat',
            primaryMuscle: 'Quads',
            secondaryMuscles: ['Glutes'],
            equipment: 'BARBELL',
            movementPattern: 'SQUAT',
            tier: 'COMPOUND_PRIMARY',
            isCustom: false,
          },
          sets,
        },
      ],
    };

    const newAttributes = AttributeEngine.computeAttributes(
      initialAttributes,
      [sessionDoc],
      streakResult.currentStreak
    );

    // Confirm Strength increased due to heavy squats
    expect(newAttributes.strength).toBeGreaterThan(initialAttributes.strength);
    // Confirm Discipline increased due to training
    expect(newAttributes.discipline).toBeGreaterThan(initialAttributes.discipline);
  });
});
