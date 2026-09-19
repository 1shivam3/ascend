import { create } from 'zustand';
import { WorkoutSession, ExerciseLog, SetLog, Exercise, SetType } from '../types/domain.types';
import { WorkoutProgressionResult } from '../types/progression.types';
import { calculateEstimated1RM } from '../utils/1rm';
import { WorkoutRepository } from '../database/repositories/WorkoutRepository';
import { MasteryRepository } from '../database/repositories/MasteryRepository';
import { ProfileRepository } from '../database/repositories/ProfileRepository';
import { SyncQueueRepository } from '../database/repositories/SyncQueueRepository';
import { MasteryEngine } from '../services/progression/MasteryEngine';
import { XpEngine } from '../services/progression/XpEngine';
import { StreakEngine } from '../services/progression/StreakEngine';
import { AttributeEngine } from '../services/progression/AttributeEngine';
import { getRankForLevel } from '../constants/ranks';
import { DEFAULT_USER_ID } from '../database/migrations/init';

interface WorkoutState {
  isActive: boolean;
  activeWorkout: WorkoutSession | null;
  elapsedSeconds: number;
  
  // Rest Timer
  isRestTimerRunning: boolean;
  restTimerSecondsRemaining: number;
  restTimerTotalSeconds: number;

  // Selected for Plate Calculator
  selectedSetForPlates: SetLog | null;

  // Actions
  startWorkout: (title?: string, planId?: string | null) => Promise<void>;
  addExercise: (exercise: Exercise) => Promise<void>;
  removeExercise: (exerciseLogId: string) => void;
  addSet: (exerciseLogId: string, setType?: SetType) => Promise<void>;
  updateSet: (exerciseLogId: string, setId: string, updates: Partial<SetLog>) => Promise<void>;
  toggleSetCompleted: (exerciseLogId: string, setId: string, defaultRestSeconds?: number) => Promise<void>;
  deleteSet: (exerciseLogId: string, setId: string) => void;
  tickTimer: () => void;
  
  startRestTimer: (seconds: number) => void;
  tickRestTimer: () => void;
  skipRestTimer: () => void;
  addRestSeconds: (seconds: number) => void;

  setSelectedSetForPlates: (set: SetLog | null) => void;

  finishWorkout: () => Promise<WorkoutProgressionResult | null>;
  discardWorkout: () => void;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  isActive: false,
  activeWorkout: null,
  elapsedSeconds: 0,
  isRestTimerRunning: false,
  restTimerSecondsRemaining: 0,
  restTimerTotalSeconds: 0,
  selectedSetForPlates: null,

  startWorkout: async (title: string = 'Tactical Training Session', planId: string | null = null) => {
    const workoutId = `w-${Date.now()}`;
    const now = new Date().toISOString();

    const newWorkout: WorkoutSession = {
      id: workoutId,
      userId: DEFAULT_USER_ID,
      planId,
      title,
      startedAt: now,
      completedAt: null,
      durationSeconds: 0,
      totalVolumeKg: 0,
      totalReps: 0,
      totalSets: 0,
      status: 'ACTIVE',
      xpEarned: 0,
      exercises: [],
    };

    set({
      isActive: true,
      activeWorkout: newWorkout,
      elapsedSeconds: 0,
      isRestTimerRunning: false,
      restTimerSecondsRemaining: 0,
    });

    await WorkoutRepository.createWorkout(newWorkout);
    await SyncQueueRepository.enqueue('workout', newWorkout.id, 'INSERT', newWorkout);
  },

  addExercise: async (exercise: Exercise) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const logId = `el-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newExerciseLog: ExerciseLog = {
      id: logId,
      workoutId: activeWorkout.id,
      exerciseId: exercise.id,
      userId: activeWorkout.userId,
      orderIndex: activeWorkout.exercises.length,
      exercise,
      sets: [],
    };

    // Auto-add first default set
    const setId = `s-${Date.now()}-1`;
    const initialSet: SetLog = {
      id: setId,
      exerciseLogId: logId,
      userId: activeWorkout.userId,
      setNumber: 1,
      setType: 'NORMAL',
      weightKg: 60,
      reps: 8,
      rpe: 8,
      estimated1RmKg: calculateEstimated1RM(60, 8),
      isPr: false,
      completed: false,
      completedAt: new Date().toISOString(),
    };

    newExerciseLog.sets.push(initialSet);

    const updatedExercises = [...activeWorkout.exercises, newExerciseLog];
    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: updatedExercises,
      },
    });

    await WorkoutRepository.saveExerciseLog(newExerciseLog);
    await WorkoutRepository.saveSetLog(initialSet);
  },

  removeExercise: (exerciseLogId: string) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const updated = activeWorkout.exercises.filter(e => e.id !== exerciseLogId);
    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: updated,
      },
    });
  },

  addSet: async (exerciseLogId: string, setType: SetType = 'NORMAL') => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const exIndex = activeWorkout.exercises.findIndex(e => e.id === exerciseLogId);
    if (exIndex === -1) return;

    const targetEx = activeWorkout.exercises[exIndex];
    const prevSet = targetEx.sets[targetEx.sets.length - 1];

    // Ghost copy values from prior set for fast gym logging
    const weightKg = prevSet ? prevSet.weightKg : 60;
    const reps = prevSet ? prevSet.reps : 8;
    const rpe = prevSet ? prevSet.rpe : 8;

    const newSet: SetLog = {
      id: `s-${Date.now()}-${targetEx.sets.length + 1}`,
      exerciseLogId,
      userId: activeWorkout.userId,
      setNumber: targetEx.sets.length + 1,
      setType,
      weightKg,
      reps,
      rpe,
      estimated1RmKg: calculateEstimated1RM(weightKg, reps),
      isPr: false,
      completed: false,
      completedAt: new Date().toISOString(),
    };

    const updatedSets = [...targetEx.sets, newSet];
    const updatedEx = { ...targetEx, sets: updatedSets };
    const allExercises = [...activeWorkout.exercises];
    allExercises[exIndex] = updatedEx;

    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: allExercises,
      },
    });

    await WorkoutRepository.saveSetLog(newSet);
  },

  updateSet: async (exerciseLogId: string, setId: string, updates: Partial<SetLog>) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const exIndex = activeWorkout.exercises.findIndex(e => e.id === exerciseLogId);
    if (exIndex === -1) return;

    const targetEx = activeWorkout.exercises[exIndex];
    const setIndex = targetEx.sets.findIndex(s => s.id === setId);
    if (setIndex === -1) return;

    const existingSet = targetEx.sets[setIndex];
    const updatedSet: SetLog = {
      ...existingSet,
      ...updates,
      estimated1RmKg: calculateEstimated1RM(
        updates.weightKg ?? existingSet.weightKg,
        updates.reps ?? existingSet.reps
      ),
    };

    const updatedSets = [...targetEx.sets];
    updatedSets[setIndex] = updatedSet;
    const allExercises = [...activeWorkout.exercises];
    allExercises[exIndex] = { ...targetEx, sets: updatedSets };

    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: allExercises,
      },
    });

    await WorkoutRepository.saveSetLog(updatedSet);
  },

  toggleSetCompleted: async (exerciseLogId: string, setId: string, defaultRestSeconds: number = 90) => {
    const { activeWorkout, startRestTimer } = get();
    if (!activeWorkout) return;

    const exIndex = activeWorkout.exercises.findIndex(e => e.id === exerciseLogId);
    if (exIndex === -1) return;

    const targetEx = activeWorkout.exercises[exIndex];
    const targetSet = targetEx.sets.find(s => s.id === setId);
    if (!targetSet) return;

    const newCompleted = !targetSet.completed;
    await get().updateSet(exerciseLogId, setId, {
      completed: newCompleted,
      completedAt: new Date().toISOString(),
    });

    // Auto-start rest timer when marking set complete
    if (newCompleted && targetSet.setType !== 'WARMUP') {
      startRestTimer(defaultRestSeconds);
    }
  },

  deleteSet: (exerciseLogId: string, setId: string) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const exIndex = activeWorkout.exercises.findIndex(e => e.id === exerciseLogId);
    if (exIndex === -1) return;

    const targetEx = activeWorkout.exercises[exIndex];
    const updatedSets = targetEx.sets
      .filter(s => s.id !== setId)
      .map((s, idx) => ({ ...s, setNumber: idx + 1 }));

    const allExercises = [...activeWorkout.exercises];
    allExercises[exIndex] = { ...targetEx, sets: updatedSets };

    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: allExercises,
      },
    });
  },

  tickTimer: () => {
    const { isActive, elapsedSeconds } = get();
    if (isActive) {
      set({ elapsedSeconds: elapsedSeconds + 1 });
    }
  },

  startRestTimer: (seconds: number) => {
    set({
      isRestTimerRunning: true,
      restTimerSecondsRemaining: seconds,
      restTimerTotalSeconds: seconds,
    });
  },

  tickRestTimer: () => {
    const { isRestTimerRunning, restTimerSecondsRemaining } = get();
    if (!isRestTimerRunning) return;

    if (restTimerSecondsRemaining <= 1) {
      set({
        isRestTimerRunning: false,
        restTimerSecondsRemaining: 0,
      });
    } else {
      set({ restTimerSecondsRemaining: restTimerSecondsRemaining - 1 });
    }
  },

  skipRestTimer: () => {
    set({
      isRestTimerRunning: false,
      restTimerSecondsRemaining: 0,
    });
  },

  addRestSeconds: (seconds: number) => {
    const { restTimerSecondsRemaining, restTimerTotalSeconds } = get();
    set({
      restTimerSecondsRemaining: restTimerSecondsRemaining + seconds,
      restTimerTotalSeconds: restTimerTotalSeconds + seconds,
    });
  },

  setSelectedSetForPlates: (setLog: SetLog | null) => {
    set({ selectedSetForPlates: setLog });
  },

  finishWorkout: async (): Promise<WorkoutProgressionResult | null> => {
    const { activeWorkout, elapsedSeconds } = get();
    if (!activeWorkout) return null;

    const completedAt = new Date().toISOString();
    let totalVolume = 0;
    let totalReps = 0;
    let totalSets = 0;
    let setsXp = 0;
    let totalPrsCount = 0;

    const exerciseMasteryUpdates: WorkoutProgressionResult['exerciseMasteryUpdates'] = [];

    // 1. Process each exercise mastery & PRs
    for (const exLog of activeWorkout.exercises) {
      const validSets = exLog.sets.filter(s => s.completed);
      if (validSets.length === 0) continue;

      for (const set of validSets) {
        totalVolume += set.weightKg * set.reps;
        totalReps += set.reps;
        totalSets += 1;
        setsXp += XpEngine.calculateSetXp(set);
      }

      // Fetch existing mastery
      const existingMastery = await MasteryRepository.getMastery(activeWorkout.userId, exLog.exerciseId);
      const masteryEvaluation = MasteryEngine.evaluateMasteryUpdate(
        existingMastery,
        exLog.exerciseId,
        activeWorkout.userId,
        validSets
      );

      // Save updated mastery to SQLite
      await MasteryRepository.upsertMastery(masteryEvaluation.updatedMastery);
      await SyncQueueRepository.enqueue('exercise_mastery', masteryEvaluation.updatedMastery.id, 'UPDATE', masteryEvaluation.updatedMastery);

      // Record any PRs
      for (const pr of masteryEvaluation.newPrs) {
        totalPrsCount++;
        const prRecord = {
          id: `pr-${Date.now()}-${pr.prType}`,
          userId: activeWorkout.userId,
          exerciseId: exLog.exerciseId,
          prType: pr.prType,
          value: pr.value,
          setLogId: pr.setLogId,
          achievedAt: completedAt,
        };
        await MasteryRepository.savePersonalRecord(prRecord);
        await SyncQueueRepository.enqueue('personal_record', prRecord.id, 'INSERT', prRecord);
      }

      exerciseMasteryUpdates.push({
        exerciseId: exLog.exerciseId,
        exerciseName: exLog.exercise?.name || 'Exercise',
        xpEarned: masteryEvaluation.xpEarned,
        oldLevel: masteryEvaluation.oldLevel,
        newLevel: masteryEvaluation.newLevel,
        didLevelUp: masteryEvaluation.didLevelUp,
        new1RmKg: masteryEvaluation.updatedMastery.estimated1RmKg,
        prsBroken: masteryEvaluation.newPrs.map(p => ({ type: p.prType, value: p.value })),
      });
    }

    // 2. Compute Session XP & PR bonuses
    const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    const sessionCompletionXp = XpEngine.calculateSessionXp(totalVolume, durationMinutes);
    const prBonusXp = totalPrsCount * 100;
    const baseTotalXpEarned = setsXp + sessionCompletionXp + prBonusXp;

    // 3. User Profile & Streak Update
    const currentProfile = await ProfileRepository.getProfile(activeWorkout.userId);
    const oldTotalXp = currentProfile ? currentProfile.totalXp : 0;
    const oldLevel = currentProfile ? currentProfile.globalLevel : 1;
    const oldStreak = currentProfile ? currentProfile.currentStreak : 0;
    const longestStreak = currentProfile ? currentProfile.longestStreak : 0;
    const freezeTokens = currentProfile ? currentProfile.streakFreezeTokens : 1;

    // Apply streak multiplier
    const streakMultiplier = XpEngine.calculateStreakMultiplier(oldStreak);
    const finalXpEarned = Math.round(baseTotalXpEarned * streakMultiplier);
    const newTotalXp = oldTotalXp + finalXpEarned;

    const newLevelInfo = XpEngine.getLevelInfo(newTotalXp);
    const newRank = getRankForLevel(newLevelInfo.level);

    // Evaluate streak
    const streakResult = StreakEngine.evaluateStreak(
      currentProfile?.lastWorkoutDate || null,
      completedAt.split('T')[0],
      oldStreak,
      longestStreak,
      freezeTokens
    );

    // 4. Compute updated 5-core attributes
    const currentAttributes = currentProfile?.attributes || {
      strength: 10,
      stamina: 10,
      agility: 10,
      discipline: 10,
      vitality: 10,
    };

    const updatedSessionForCalc: WorkoutSession = {
      ...activeWorkout,
      completedAt,
      durationSeconds: elapsedSeconds,
      totalVolumeKg: totalVolume,
      totalReps,
      totalSets,
      status: 'COMPLETED',
      xpEarned: finalXpEarned,
    };

    const newAttributes = AttributeEngine.computeAttributes(
      currentAttributes,
      [updatedSessionForCalc],
      streakResult.currentStreak
    );

    const attributesDelta = {
      strength: newAttributes.strength - currentAttributes.strength,
      stamina: newAttributes.stamina - currentAttributes.stamina,
      agility: newAttributes.agility - currentAttributes.agility,
      discipline: newAttributes.discipline - currentAttributes.discipline,
      vitality: newAttributes.vitality - currentAttributes.vitality,
    };

    // 5. Persist Workout Completion & Profile updates
    await WorkoutRepository.finishWorkout(
      activeWorkout.id,
      completedAt,
      elapsedSeconds,
      totalVolume,
      totalReps,
      totalSets,
      finalXpEarned
    );

    await ProfileRepository.updateProgression(
      activeWorkout.userId,
      newLevelInfo.level,
      newTotalXp,
      newRank.tier,
      newRank.division,
      newAttributes,
      streakResult.currentStreak,
      streakResult.longestStreak,
      streakResult.streakFreezeTokens,
      completedAt.split('T')[0]
    );

    await SyncQueueRepository.enqueue('workout', activeWorkout.id, 'UPDATE', {
      ...updatedSessionForCalc,
      xpEarned: finalXpEarned,
    });

    const progressionResult: WorkoutProgressionResult = {
      xpEarned: finalXpEarned,
      newTotalXp,
      oldGlobalLevel: oldLevel,
      newGlobalLevel: newLevelInfo.level,
      didLevelUp: newLevelInfo.level > oldLevel,
      newRank: {
        tier: newRank.tier,
        division: newRank.division,
      },
      attributesDelta,
      newAttributes,
      exerciseMasteryUpdates,
      prsBrokenCount: totalPrsCount,
      streakUpdated: {
        currentStreak: streakResult.currentStreak,
        longestStreak: streakResult.longestStreak,
        isMilestone: streakResult.isMilestone,
      },
    };

    // Reset active workout state
    set({
      isActive: false,
      activeWorkout: null,
      elapsedSeconds: 0,
      isRestTimerRunning: false,
      restTimerSecondsRemaining: 0,
      selectedSetForPlates: null,
    });

    return progressionResult;
  },

  discardWorkout: () => {
    set({
      isActive: false,
      activeWorkout: null,
      elapsedSeconds: 0,
      isRestTimerRunning: false,
      restTimerSecondsRemaining: 0,
      selectedSetForPlates: null,
    });
  },
}));
