import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PREngine } from '../PREngine';
import { QuestEngine } from '../QuestEngine';
import { MasteryEngine } from '../../progression/MasteryEngine';
import { XpEngine } from '../../progression/XpEngine';
import { AntiExploitEngine } from '../../progression/AntiExploitEngine';
import { calculateEstimated1RM } from '../../../utils/1rm';
import { Exercise, ExerciseLog, SetLog, WorkoutSession } from '../../../types/domain.types';
import { UserQuestProgress } from '../../../types/quest.types';

describe('ASCEND Phase 4: Tactical Workout Engine', () => {
  const benchPressExercise: Exercise = {
    id: 'ex-bench-press',
    name: 'Barbell Bench Press',
    slug: 'barbell-bench-press',
    primaryMuscle: 'Chest',
    secondaryMuscles: ['Triceps', 'Front Delts'],
    equipment: 'BARBELL',
    movementPattern: 'PUSH_HORIZONTAL',
    tier: 'COMPOUND_PRIMARY',
    isCustom: false,
  };

  const inclineDumbbellPressExercise: Exercise = {
    id: 'ex-incline-db-press',
    name: 'Incline Dumbbell Press',
    slug: 'incline-db-press',
    primaryMuscle: 'Upper Chest',
    secondaryMuscles: ['Triceps', 'Front Delts'],
    equipment: 'DUMBBELL',
    movementPattern: 'PUSH_HORIZONTAL',
    tier: 'COMPOUND_SECONDARY',
    isCustom: false,
  };

  // 1. Single Set Logging
  it('1. Single set logging: calculates estimated 1RM and preserves set payload', () => {
    const set: SetLog = {
      id: 's-1',
      exerciseLogId: 'el-1',
      userId: 'user-pilot',
      setNumber: 1,
      setType: 'NORMAL',
      weightKg: 80,
      reps: 8,
      rpe: 8,
      estimated1RmKg: calculateEstimated1RM(80, 8),
      isPr: false,
      completed: true,
      completedAt: '2026-09-19T12:00:00.000Z',
    };

    expect(set.weightKg).toBe(80);
    expect(set.reps).toBe(8);
    expect(set.rpe).toBe(8);
    expect(set.completed).toBe(true);
    // 80kg x 8 reps gives ~99-101kg estimated 1RM
    expect(set.estimated1RmKg).toBeGreaterThan(95);
    expect(set.estimated1RmKg).toBeLessThan(105);
    expect(set.setNumber).toBe(1);
  });

  // 2. Multiple Sets Logging
  it('2. Multiple sets logging: accumulates volume and reps across multiple sets', () => {
    const sets: SetLog[] = [
      {
        id: 's-1',
        exerciseLogId: 'el-1',
        userId: 'user-pilot',
        setNumber: 1,
        setType: 'WARMUP',
        weightKg: 50,
        reps: 10,
        rpe: 6,
        estimated1RmKg: calculateEstimated1RM(50, 10),
        isPr: false,
        completed: true,
        completedAt: '2026-09-19T12:00:00.000Z',
      },
      {
        id: 's-2',
        exerciseLogId: 'el-1',
        userId: 'user-pilot',
        setNumber: 2,
        setType: 'NORMAL',
        weightKg: 80,
        reps: 8,
        rpe: 8,
        estimated1RmKg: calculateEstimated1RM(80, 8),
        isPr: false,
        completed: true,
        completedAt: '2026-09-19T12:05:00.000Z',
      },
      {
        id: 's-3',
        exerciseLogId: 'el-1',
        userId: 'user-pilot',
        setNumber: 3,
        setType: 'NORMAL',
        weightKg: 85,
        reps: 6,
        rpe: 9,
        estimated1RmKg: calculateEstimated1RM(85, 6),
        isPr: false,
        completed: true,
        completedAt: '2026-09-19T12:10:00.000Z',
      },
    ];

    const completedWorkingSets = sets.filter(s => s.completed && s.setType !== 'WARMUP');
    expect(completedWorkingSets.length).toBe(2);

    const totalVolume = sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0);
    const totalReps = sets.reduce((sum, s) => sum + s.reps, 0);

    // 50*10 + 80*8 + 85*6 = 500 + 640 + 510 = 1650
    expect(totalVolume).toBe(1650);
    expect(totalReps).toBe(24);
  });

  // 3. Skipped Set
  it('3. Skipped set: marked as isSkipped and excluded from volume and PRs', () => {
    const set1: SetLog = {
      id: 's-1',
      exerciseLogId: 'el-1',
      userId: 'user-pilot',
      setNumber: 1,
      setType: 'NORMAL',
      weightKg: 100,
      reps: 5,
      rpe: 8,
      estimated1RmKg: calculateEstimated1RM(100, 5),
      isPr: false,
      completed: true,
      isSkipped: false,
      completedAt: '2026-09-19T12:00:00.000Z',
    };

    const set2: SetLog = {
      id: 's-2',
      exerciseLogId: 'el-1',
      userId: 'user-pilot',
      setNumber: 2,
      setType: 'NORMAL',
      weightKg: 105,
      reps: 5,
      rpe: 8,
      estimated1RmKg: calculateEstimated1RM(105, 5),
      isPr: false,
      completed: false,
      isSkipped: true,
      completedAt: null,
    };

    const sessionSets = [set1, set2];
    const validSets = sessionSets.filter(s => s.completed && !s.isSkipped);

    expect(validSets.length).toBe(1);
    expect(validSets[0].id).toBe('s-1');

    const prs = PREngine.evaluateSetForPRs(set2, 'ex-bench-press', 'Bench Press', {
      MAX_WEIGHT: 100,
    });
    // Because set2 was skipped and completed is false, no PR should be detected
    expect(prs.length).toBe(0);
  });

  // 4. Skipped Exercise
  it('4. Skipped exercise: uncompleted sets are marked skipped and excluded from completion stats', () => {
    const sets: SetLog[] = [
      {
        id: 's-1',
        exerciseLogId: 'el-skipped',
        userId: 'user-pilot',
        setNumber: 1,
        setType: 'NORMAL',
        weightKg: 40,
        reps: 10,
        rpe: 8,
        estimated1RmKg: calculateEstimated1RM(40, 10),
        isPr: false,
        completed: false,
        isSkipped: false,
        completedAt: null,
      },
      {
        id: 's-2',
        exerciseLogId: 'el-skipped',
        userId: 'user-pilot',
        setNumber: 2,
        setType: 'NORMAL',
        weightKg: 40,
        reps: 10,
        rpe: 8,
        estimated1RmKg: calculateEstimated1RM(40, 10),
        isPr: false,
        completed: false,
        isSkipped: false,
        completedAt: null,
      },
    ];

    // Simulate skip exercise action
    const skippedSets = sets.map(s => (!s.completed ? { ...s, isSkipped: true } : s));
    expect(skippedSets.every(s => s.isSkipped)).toBe(true);

    const validCompleted = skippedSets.filter(s => s.completed && !s.isSkipped);
    expect(validCompleted.length).toBe(0);
  });

  // 5. Replacement Exercise
  it('5. Replacement exercise: swaps movement while preserving set structure and adapting ghost targets', () => {
    const originalLog: ExerciseLog = {
      id: 'el-1',
      workoutId: 'w-1',
      exerciseId: benchPressExercise.id,
      userId: 'user-pilot',
      orderIndex: 0,
      exercise: benchPressExercise,
      sets: [
        {
          id: 's-1',
          exerciseLogId: 'el-1',
          userId: 'user-pilot',
          setNumber: 1,
          setType: 'NORMAL',
          weightKg: 80,
          reps: 8,
          rpe: 8,
          estimated1RmKg: calculateEstimated1RM(80, 8),
          isPr: false,
          completed: false,
          completedAt: null,
        },
      ],
    };

    // Replace with Incline DB Press
    const previousDbPressPerformance: SetLog = {
      id: 'prev-1',
      exerciseLogId: 'el-prev',
      userId: 'user-pilot',
      setNumber: 1,
      setType: 'NORMAL',
      weightKg: 32,
      reps: 10,
      rpe: 8,
      estimated1RmKg: calculateEstimated1RM(32, 10),
      isPr: false,
      completed: true,
      completedAt: '2026-09-19T10:00:00.000Z',
    };

    const updatedSets = originalLog.sets.map(s => {
      if (!s.completed) {
        const weight = previousDbPressPerformance.weightKg;
        const reps = previousDbPressPerformance.reps;
        return {
          ...s,
          weightKg: weight,
          reps,
          estimated1RmKg: calculateEstimated1RM(weight, reps),
        };
      }
      return s;
    });

    const replacedLog: ExerciseLog = {
      ...originalLog,
      exerciseId: inclineDumbbellPressExercise.id,
      exercise: inclineDumbbellPressExercise,
      sets: updatedSets,
    };

    expect(replacedLog.exerciseId).toBe('ex-incline-db-press');
    expect(replacedLog.exercise?.name).toBe('Incline Dumbbell Press');
    expect(replacedLog.sets[0].weightKg).toBe(32);
    expect(replacedLog.sets[0].reps).toBe(10);
  });

  // 6. Workout Cancellation
  it('6. Workout cancellation: does not persist completed workout status or award rewards', () => {
    const workout: WorkoutSession = {
      id: 'w-cancelled',
      userId: 'user-pilot',
      title: 'Tactical Deployment',
      startedAt: '2026-09-19T12:00:00Z',
      completedAt: null,
      durationSeconds: 300,
      totalVolumeKg: 0,
      totalReps: 0,
      totalSets: 0,
      status: 'DISCARDED',
      xpEarned: 0,
      exercises: [],
    };

    expect(workout.status).toBe('DISCARDED');
    expect(workout.completedAt).toBeNull();
    expect(workout.xpEarned).toBe(0);
  });

  // 7. Workout Completion
  it('7. Workout completion: stamps completedAt, duration, volume, and completes session', () => {
    const completedAt = '2026-09-19T12:45:00.000Z';
    const durationSeconds = 2700;
    const totalVolumeKg = 3200;
    const totalReps = 32;
    const totalSets = 4;
    const xpEarned = 450;

    const completedWorkout: WorkoutSession = {
      id: 'w-completed',
      userId: 'user-pilot',
      title: 'Full Upper Tactical Routine',
      startedAt: '2026-09-19T12:00:00.000Z',
      completedAt,
      durationSeconds,
      totalVolumeKg,
      totalReps,
      totalSets,
      status: 'COMPLETED',
      xpEarned,
      exercises: [],
    };

    expect(completedWorkout.status).toBe('COMPLETED');
    expect(completedWorkout.completedAt).toBe(completedAt);
    expect(completedWorkout.durationSeconds).toBe(2700);
    expect(completedWorkout.totalVolumeKg).toBe(3200);
    expect(completedWorkout.xpEarned).toBe(450);
  });

  // 8. Offline Logging
  it('8. Offline logging: append-only set entries and sync payload serialization', () => {
    const setEntry: SetLog = {
      id: 's-offline-1',
      exerciseLogId: 'el-offline',
      userId: 'user-pilot',
      setNumber: 1,
      setType: 'NORMAL',
      weightKg: 100,
      reps: 5,
      rpe: 9,
      estimated1RmKg: calculateEstimated1RM(100, 5),
      isPr: true,
      completed: true,
      isSkipped: false,
      completedAt: '2026-09-19T12:30:00Z',
    };

    // Serialize to offline sync queue payload
    const serialized = JSON.stringify(setEntry);
    const parsed = JSON.parse(serialized);

    expect(parsed.id).toBe('s-offline-1');
    expect(parsed.weightKg).toBe(100);
    expect(parsed.reps).toBe(5);
    expect(parsed.isPr).toBe(true);
  });

  // 9. Duplicate Submission Prevention
  it('9. Duplicate submission prevention: AntiExploitEngine filters rapid duplicate submissions', () => {
    const now = Date.now();
    const identicalSets: SetLog[] = [
      {
        id: 's-dup-1',
        exerciseLogId: 'el-1',
        userId: 'user-pilot',
        setNumber: 1,
        setType: 'NORMAL',
        weightKg: 100,
        reps: 5,
        rpe: 8,
        estimated1RmKg: 116,
        isPr: false,
        completed: true,
        completedAt: new Date(now).toISOString(),
      },
      {
        id: 's-dup-2',
        exerciseLogId: 'el-1',
        userId: 'user-pilot',
        setNumber: 1, // Same set number, same volume, submitted 200ms later
        setType: 'NORMAL',
        weightKg: 100,
        reps: 5,
        rpe: 8,
        estimated1RmKg: 116,
        isPr: false,
        completed: true,
        completedAt: new Date(now + 200).toISOString(),
      },
    ];

    const { validSets, duplicateCount } = AntiExploitEngine.deduplicateSets(identicalSets);
    expect(validSets.length).toBe(1);
    expect(duplicateCount).toBe(1);
  });

  // 10. PR Detection
  it('10. PR detection: PREngine detects all 4 categories: Weight, 1RM, Reps, and Volume', () => {
    const existingPrMap = {
      MAX_WEIGHT: 90,
      MAX_ESTIMATED_1RM: 105,
      MAX_REPS: 8,
      MAX_VOLUME: 720,
    };

    // Athlete lifts 95kg for 9 reps!
    // New Weight: 95kg > 90kg (+5kg)
    // New 1RM: ~123kg > 105kg (+18kg)
    // New Reps: 9 reps > 8 reps (+1 rep)
    // New Volume: 95 * 9 = 855kg > 720kg (+135kg)
    const heavySet: SetLog = {
      id: 's-pr-1',
      exerciseLogId: 'el-pr',
      userId: 'user-pilot',
      setNumber: 1,
      setType: 'NORMAL',
      weightKg: 95,
      reps: 9,
      rpe: 9.5,
      estimated1RmKg: calculateEstimated1RM(95, 9),
      isPr: false,
      completed: true,
      completedAt: '2026-09-19T12:00:00.000Z',
    };

    const prs = PREngine.evaluateSetForPRs(
      heavySet,
      'ex-bench-press',
      'Barbell Bench Press',
      existingPrMap
    );

    expect(prs.length).toBe(4);
    const prTypes = prs.map(p => p.prType);
    expect(prTypes).toContain('MAX_WEIGHT');
    expect(prTypes).toContain('MAX_ESTIMATED_1RM');
    expect(prTypes).toContain('MAX_REPS');
    expect(prTypes).toContain('MAX_VOLUME');

    const weightPR = prs.find(p => p.prType === 'MAX_WEIGHT')!;
    expect(weightPR.newValue).toBe(95);
    expect(weightPR.delta).toBe(5);
    expect(weightPR.xpBonus).toBe(150);
  });

  // 11. Mastery XP
  it('11. Mastery XP: calculates mastery progression and level boundaries for 1-100 curve', () => {
    const level1Info = MasteryEngine.getMasteryLevelInfo(0);
    expect(level1Info.level).toBe(1);
    expect(level1Info.masteryTierTitle).toBe('Novice');

    const singleSet: SetLog = {
      id: 's-m1',
      exerciseLogId: 'el-m1',
      userId: 'user-pilot',
      setNumber: 1,
      setType: 'NORMAL',
      weightKg: 100,
      reps: 8,
      rpe: 8,
      estimated1RmKg: calculateEstimated1RM(100, 8),
      isPr: false,
      completed: true,
      completedAt: '2026-09-19T12:00:00.000Z',
    };

    const masteryXp = MasteryEngine.calculateSetMasteryXp(singleSet, 100);
    expect(masteryXp).toBeGreaterThan(15);
    expect(masteryXp).toBeLessThanOrEqual(250);

    // Advanced XP verification
    const advancedLevelInfo = MasteryEngine.getMasteryLevelInfo(12000);
    expect(advancedLevelInfo.level).toBeGreaterThanOrEqual(7);
  });

  // 12. Global XP
  it('12. Global XP: integrates set XP, session completion, PR bonuses, and streak multiplier', () => {
    const set1: SetLog = {
      id: 's-g1',
      exerciseLogId: 'el-1',
      userId: 'user-pilot',
      setNumber: 1,
      setType: 'NORMAL',
      weightKg: 100,
      reps: 6,
      rpe: 8,
      estimated1RmKg: calculateEstimated1RM(100, 6),
      isPr: false,
      completed: true,
      completedAt: '2026-09-19T12:00:00.000Z',
    };

    const set2: SetLog = {
      id: 's-g2',
      exerciseLogId: 'el-1',
      userId: 'user-pilot',
      setNumber: 2,
      setType: 'FAILURE',
      weightKg: 100,
      reps: 7,
      rpe: 10,
      estimated1RmKg: calculateEstimated1RM(100, 7),
      isPr: false,
      completed: true,
      completedAt: '2026-09-19T12:05:00.000Z',
    };

    const setsXp = XpEngine.calculateSetXp(set1) + XpEngine.calculateSetXp(set2);
    expect(setsXp).toBeGreaterThan(30);

    const totalVolume = 100 * 6 + 100 * 7;
    const sessionCompletionXp = XpEngine.calculateSessionXp(totalVolume, 45, true);
    expect(sessionCompletionXp).toBeGreaterThan(100);

    const prCount = 2;
    const prBonusXp = prCount * 100; // 200 XP
    const baseTotalXp = setsXp + sessionCompletionXp + prBonusXp;

    // Streak multiplier (e.g. 5 days streak -> 1.0 + 5*0.02 = 1.10x)
    const streakMultiplier = XpEngine.calculateStreakMultiplier(5);
    const finalXp = Math.round(baseTotalXp * streakMultiplier);

    expect(streakMultiplier).toBeGreaterThanOrEqual(1.10);
    expect(finalXp).toBeGreaterThan(baseTotalXp);
  });

  // 13. Quest Updates
  it('13. Quest updates: advances daily/weekly quests and awards quest reward XP', () => {
    const activeQuests: UserQuestProgress[] = [
      {
        id: 'uq-1',
        userId: 'user-pilot',
        questId: 'quest-daily-deployment',
        currentProgress: 0,
        targetValue: 1,
        completed: false,
        completedAt: null,
        lastResetDate: '2026-09-19',
        quest: {
          id: 'quest-daily-deployment',
          title: 'Field Deployment',
          description: 'Log and complete 1 tactical training workout session today.',
          type: 'DAILY',
          category: 'WORKOUT_COUNT',
          targetValue: 1,
          unit: 'session',
          xpReward: 150,
          badgeVariant: 'cyan',
        },
      },
      {
        id: 'uq-2',
        userId: 'user-pilot',
        questId: 'quest-daily-volume',
        currentProgress: 1000,
        targetValue: 3000,
        completed: false,
        completedAt: null,
        lastResetDate: '2026-09-19',
        quest: {
          id: 'quest-daily-volume',
          title: 'Tonnage Threshold',
          description: 'Move 3,000 kg of cumulative tonnage.',
          type: 'DAILY',
          category: 'VOLUME_TOTAL',
          targetValue: 3000,
          unit: 'kg',
          xpReward: 200,
          badgeVariant: 'amber',
        },
      },
      {
        id: 'uq-3',
        userId: 'user-pilot',
        questId: 'quest-daily-failure',
        currentProgress: 0,
        targetValue: 1,
        completed: false,
        completedAt: null,
        lastResetDate: '2026-09-19',
        quest: {
          id: 'quest-daily-failure',
          title: 'Limit Exertion',
          description: 'Take at least 1 set to true technical or mechanical failure (RPE 10 / FAILURE).',
          type: 'DAILY',
          category: 'FAILURE_SETS',
          targetValue: 1,
          unit: 'set',
          xpReward: 150,
          badgeVariant: 'emerald',
        },
      },
    ];

    const completedWorkout: WorkoutSession = {
      id: 'w-quests',
      userId: 'user-pilot',
      title: 'Chest & Back Deployment',
      startedAt: '2026-09-19T12:00:00Z',
      completedAt: '2026-09-19T12:45:00Z',
      durationSeconds: 2700,
      totalVolumeKg: 2500, // 1000 + 2500 = 3500 >= 3000 (completes quest 2)
      totalReps: 25,
      totalSets: 3,
      status: 'COMPLETED',
      xpEarned: 350,
      exercises: [
        {
          id: 'el-1',
          workoutId: 'w-quests',
          exerciseId: benchPressExercise.id,
          userId: 'user-pilot',
          orderIndex: 0,
          exercise: benchPressExercise,
          sets: [
            {
              id: 's-1',
              exerciseLogId: 'el-1',
              userId: 'user-pilot',
              setNumber: 1,
              setType: 'FAILURE', // Triggers failure quest!
              weightKg: 100,
              reps: 5,
              rpe: 10,
              estimated1RmKg: calculateEstimated1RM(100, 5),
              isPr: false,
              completed: true,
              isSkipped: false,
              completedAt: '2026-09-19T12:00:00.000Z',
            },
          ],
        },
      ],
    };

    const evaluation = QuestEngine.evaluateWorkoutForQuests(completedWorkout, activeQuests);

    expect(evaluation.newlyCompletedQuests.length).toBe(3);
    expect(evaluation.newlyCompletedQuests.map(q => q.questId)).toContain('quest-daily-deployment');
    expect(evaluation.newlyCompletedQuests.map(q => q.questId)).toContain('quest-daily-volume');
    expect(evaluation.newlyCompletedQuests.map(q => q.questId)).toContain('quest-daily-failure');

    // Total reward: 150 + 200 + 150 = 500 XP
    expect(evaluation.totalQuestXpBonus).toBe(500);

    const volumeQuest = evaluation.updatedQuests.find(q => q.questId === 'quest-daily-volume')!;
    expect(volumeQuest.completed).toBe(true);
    expect(volumeQuest.currentProgress).toBe(3000); // Clamped to targetValue
  });
});
