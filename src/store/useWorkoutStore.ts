import { create } from 'zustand';
import { WorkoutSession, ExerciseLog, SetLog, Exercise, SetType, WorkoutTemplate } from '../types/domain.types';
import { WorkoutProgressionResult } from '../types/progression.types';
import { calculateEstimated1RM } from '../utils/1rm';
import { WorkoutRepository } from '../database/repositories/WorkoutRepository';
import { ExerciseRepository } from '../database/repositories/ExerciseRepository';
import { MasteryRepository } from '../database/repositories/MasteryRepository';
import { ProfileRepository } from '../database/repositories/ProfileRepository';
import { SyncQueueRepository } from '../database/repositories/SyncQueueRepository';
import { QuestRepository } from '../database/repositories/QuestRepository';
import { XpRepository } from '../database/repositories/XpRepository';
import { MilestoneRepository } from '../database/repositories/MilestoneRepository';
import { MasteryEngine } from '../services/progression/MasteryEngine';
import { XpEngine } from '../services/progression/XpEngine';
import { StreakEngine } from '../services/progression/StreakEngine';
import { AttributeEngine } from '../services/progression/AttributeEngine';
import { AntiExploitEngine } from '../services/progression/AntiExploitEngine';
import { PREngine, DetectedPR } from '../services/workout/PREngine';
import { QuestEngine } from '../services/workout/QuestEngine';
import { SupersetEngine, NextSupersetTarget } from '../services/workout/SupersetEngine';
import { getRankForLevel } from '../constants/ranks';
import { FitnessProgressionService } from '../services/progression/FitnessProgressionService';
import { ReliableDataEngine } from '../services/progression/ReliableDataEngine';
import { SocialFeedService } from '../services/social/SocialFeedService';
import { ChallengeEngine } from '../services/challenges/ChallengeEngine';
import { AchievementEngine } from '../services/progression/AchievementEngine';
import { AchievementConfig } from '../config/achievements.config';
import { DEFAULT_USER_ID } from '../database/migrations/init';
import { useAuthStore } from './useAuthStore';

interface WorkoutState {
  isActive: boolean;
  activeWorkout: WorkoutSession | null;
  elapsedSeconds: number;
  
  // Rest Timer
  isRestTimerRunning: boolean;
  restTimerSecondsRemaining: number;
  restTimerTotalSeconds: number;
  restTimerTargetTimestamp: number | null;

  // Selected for Plate Calculator
  selectedSetForPlates: SetLog | null;

  // PR Celebration State
  activePR: DetectedPR | null;
  dismissActivePR: () => void;

  // Superset Navigation State
  focusedSupersetTarget: NextSupersetTarget | null;
  clearFocusedSupersetTarget: () => void;

  // Actions
  startWorkout: (title?: string, planId?: string | null) => Promise<void>;
  addExercise: (exercise: Exercise) => Promise<void>;
  removeExercise: (exerciseLogId: string) => void;
  replaceExercise: (exerciseLogId: string, newExercise: Exercise) => Promise<void>;
  skipExercise: (exerciseLogId: string) => Promise<void>;
  addSet: (exerciseLogId: string, setType?: SetType) => Promise<void>;
  updateSet: (exerciseLogId: string, setId: string, updates: Partial<SetLog>) => Promise<void>;
  skipSet: (exerciseLogId: string, setId: string) => Promise<void>;
  toggleSetCompleted: (exerciseLogId: string, setId: string, defaultRestSeconds?: number) => Promise<void>;
  deleteSet: (exerciseLogId: string, setId: string) => void;
  updateExerciseNotes: (exerciseLogId: string, notes: string) => Promise<void>;
  tickTimer: () => void;
  
  startRestTimer: (seconds: number) => void;
  tickRestTimer: () => void;
  skipRestTimer: () => void;
  addRestSeconds: (seconds: number) => void;

  setSelectedSetForPlates: (set: SetLog | null) => void;

  // Superset Actions
  linkAsSuperset: (exerciseLogIds: string[], supersetId?: string) => Promise<string>;
  unlinkSuperset: (supersetId: string) => Promise<void>;

  // Template Actions
  startWorkoutFromTemplate: (template: WorkoutTemplate) => Promise<void>;

  finishWorkout: () => Promise<WorkoutProgressionResult | null>;
  restoreActiveWorkout: (userId: string) => Promise<boolean>;
  discardWorkout: () => void;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  isActive: false,
  activeWorkout: null,
  elapsedSeconds: 0,
  isRestTimerRunning: false,
  restTimerSecondsRemaining: 0,
  restTimerTotalSeconds: 0,
  restTimerTargetTimestamp: null,
  selectedSetForPlates: null,
  activePR: null,
  dismissActivePR: () => set({ activePR: null }),
  focusedSupersetTarget: null,
  clearFocusedSupersetTarget: () => set({ focusedSupersetTarget: null }),

  startWorkout: async (title: string = 'Tactical Training Session', planId: string | null = null) => {
    const workoutId = `w-${Date.now()}`;
    const now = new Date().toISOString();
    const activeUserId = useAuthStore.getState().userId || DEFAULT_USER_ID;

    const newWorkout: WorkoutSession = {
      id: workoutId,
      userId: activeUserId,
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

  replaceExercise: async (exerciseLogId: string, newExercise: Exercise) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const exIndex = activeWorkout.exercises.findIndex(e => e.id === exerciseLogId);
    if (exIndex === -1) return;

    const targetEx = activeWorkout.exercises[exIndex];
    const prevPerfSets = await WorkoutRepository.getPreviousPerformance(activeWorkout.userId, newExercise.id);

    const updatedSets = targetEx.sets.map(s => {
      if (!s.completed) {
        const matchingPrev = prevPerfSets.find(ps => ps.setNumber === s.setNumber) || prevPerfSets[0];
        const weight = matchingPrev ? matchingPrev.weightKg : s.weightKg;
        const reps = matchingPrev ? matchingPrev.reps : s.reps;
        return {
          ...s,
          weightKg: weight,
          reps,
          estimated1RmKg: calculateEstimated1RM(weight, reps),
        };
      }
      return s;
    });

    const updatedEx: ExerciseLog = {
      ...targetEx,
      exerciseId: newExercise.id,
      exercise: newExercise,
      sets: updatedSets,
    };

    const allExercises = [...activeWorkout.exercises];
    allExercises[exIndex] = updatedEx;

    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: allExercises,
      },
    });

    await WorkoutRepository.replaceExerciseInWorkout(exerciseLogId, newExercise.id);
    for (const s of updatedSets) {
      if (!s.completed) {
        await WorkoutRepository.saveSetLog(s);
      }
    }
  },

  skipExercise: async (exerciseLogId: string) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const exIndex = activeWorkout.exercises.findIndex(e => e.id === exerciseLogId);
    if (exIndex === -1) return;

    const targetEx = activeWorkout.exercises[exIndex];
    const updatedSets = targetEx.sets.map(s => {
      if (!s.completed) {
        return { ...s, isSkipped: true };
      }
      return s;
    });

    const allExercises = [...activeWorkout.exercises];
    allExercises[exIndex] = { ...targetEx, sets: updatedSets };

    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: allExercises,
      },
    });

    for (const s of updatedSets) {
      if (s.isSkipped) {
        await WorkoutRepository.skipSet(s.id);
      }
    }
  },

  updateExerciseNotes: async (exerciseLogId: string, notes: string) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const exIndex = activeWorkout.exercises.findIndex(e => e.id === exerciseLogId);
    if (exIndex === -1) return;

    const targetEx = activeWorkout.exercises[exIndex];
    const updatedEx: ExerciseLog = { ...targetEx, notes };
    const allExercises = [...activeWorkout.exercises];
    allExercises[exIndex] = updatedEx;

    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: allExercises,
      },
    });

    await WorkoutRepository.saveExerciseLog(updatedEx);
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

  skipSet: async (exerciseLogId: string, setId: string) => {
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
      isSkipped: true,
      completed: false,
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

    await WorkoutRepository.skipSet(setId);
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

    // Detect live PR if completing a working set
    let detectedPr: DetectedPR | null = null;
    if (newCompleted && targetSet.setType !== 'WARMUP' && targetSet.reps > 0 && targetSet.weightKg > 0) {
      try {
        const existingRecords = await MasteryRepository.getPersonalRecords(activeWorkout.userId, targetEx.exerciseId);
        const existingPrMap: Record<string, number> = {};
        for (const pr of existingRecords) {
          existingPrMap[pr.prType] = Math.max(existingPrMap[pr.prType] || 0, pr.value);
        }
        for (const s of targetEx.sets) {
          if (s.id !== targetSet.id && s.completed && !s.isSkipped && s.setType !== 'WARMUP') {
            const s1rm = calculateEstimated1RM(s.weightKg, s.reps);
            const sVol = s.weightKg * s.reps;
            existingPrMap['MAX_WEIGHT'] = Math.max(existingPrMap['MAX_WEIGHT'] || 0, s.weightKg);
            existingPrMap['MAX_ESTIMATED_1RM'] = Math.max(existingPrMap['MAX_ESTIMATED_1RM'] || 0, s1rm);
            existingPrMap['MAX_REPS'] = Math.max(existingPrMap['MAX_REPS'] || 0, s.reps);
            existingPrMap['MAX_VOLUME'] = Math.max(existingPrMap['MAX_VOLUME'] || 0, sVol);
          }
        }

        const candidateSet: SetLog = {
          ...targetSet,
          completed: true,
          isSkipped: false,
          completedAt: new Date().toISOString(),
        };

        const prs = PREngine.evaluateSetForPRs(
          candidateSet,
          targetEx.exerciseId,
          targetEx.exercise?.name || 'Movement',
          existingPrMap
        );

        if (prs.length > 0) {
          detectedPr = prs[0];
        }
      } catch (err) {
        console.warn('Live PR evaluation warning:', err);
      }
    }

    await get().updateSet(exerciseLogId, setId, {
      completed: newCompleted,
      isSkipped: false,
      isPr: detectedPr !== null,
      completedAt: new Date().toISOString(),
    });

    if (detectedPr) {
      set({ activePR: detectedPr });
    }

    // Auto-start rest timer when marking set complete
    if (newCompleted && targetSet.setType !== 'WARMUP') {
      if (targetEx.supersetId) {
        const nextTarget = SupersetEngine.getNextTarget(
          targetEx.id,
          targetSet.setNumber,
          activeWorkout.exercises
        );
        if (nextTarget) {
          const restDuration = nextTarget.isRoundComplete
            ? defaultRestSeconds
            : (targetEx.prescription?.rest_seconds || 30);
          startRestTimer(restDuration);
          set({ focusedSupersetTarget: nextTarget });
        } else {
          startRestTimer(defaultRestSeconds);
        }
      } else {
        startRestTimer(defaultRestSeconds);
      }
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
    const targetTimestamp = Date.now() + seconds * 1000;
    set({
      isRestTimerRunning: true,
      restTimerSecondsRemaining: seconds,
      restTimerTotalSeconds: seconds,
      restTimerTargetTimestamp: targetTimestamp,
    });
  },

  tickRestTimer: () => {
    const { isRestTimerRunning, restTimerTargetTimestamp } = get();
    if (!isRestTimerRunning) return;

    if (!restTimerTargetTimestamp) {
      set({
        isRestTimerRunning: false,
        restTimerSecondsRemaining: 0,
        restTimerTargetTimestamp: null,
      });
      return;
    }

    const remaining = Math.max(0, Math.ceil((restTimerTargetTimestamp - Date.now()) / 1000));
    if (remaining <= 0) {
      set({
        isRestTimerRunning: false,
        restTimerSecondsRemaining: 0,
        restTimerTargetTimestamp: null,
      });
    } else {
      set({ restTimerSecondsRemaining: remaining });
    }
  },

  skipRestTimer: () => {
    set({
      isRestTimerRunning: false,
      restTimerSecondsRemaining: 0,
      restTimerTargetTimestamp: null,
    });
  },

  addRestSeconds: (seconds: number) => {
    const { restTimerSecondsRemaining, restTimerTotalSeconds, restTimerTargetTimestamp } = get();
    const newRemaining = restTimerSecondsRemaining + seconds;
    const newTarget = restTimerTargetTimestamp
      ? restTimerTargetTimestamp + seconds * 1000
      : Date.now() + newRemaining * 1000;
    set({
      restTimerSecondsRemaining: newRemaining,
      restTimerTotalSeconds: restTimerTotalSeconds + seconds,
      restTimerTargetTimestamp: newTarget,
    });
  },

  setSelectedSetForPlates: (setLog: SetLog | null) => {
    set({ selectedSetForPlates: setLog });
  },

  finishWorkout: async (): Promise<WorkoutProgressionResult | null> => {
    const { activeWorkout, elapsedSeconds } = get();
    if (!activeWorkout) return null;

    // Guard: if workout was already completed, bail out (idempotent)
    if (activeWorkout.status === 'COMPLETED') return null;

    const completedAt = new Date().toISOString();
    let totalVolume = 0;
    let totalReps = 0;
    let totalSets = 0;
    let setsXp = 0;
    let totalPrsCount = 0;

    const currentProfile = await ProfileRepository.getProfile(activeWorkout.userId);
    const athleteBodyweight = currentProfile?.weightKg;

    const exerciseMasteryUpdates: WorkoutProgressionResult['exerciseMasteryUpdates'] = [];

    // 1. Process each exercise mastery & PRs
    for (const exLog of activeWorkout.exercises) {
      const validSets = exLog.sets.filter(s => s.completed && !s.isSkipped);
      if (validSets.length === 0) continue;

      for (const s of validSets) {
        totalVolume += s.weightKg * s.reps;
        totalReps += s.reps;
        totalSets += 1;
        setsXp += XpEngine.calculateSetXp(s);
      }

      // Fetch existing mastery
      const existingMastery = await MasteryRepository.getMastery(activeWorkout.userId, exLog.exerciseId);
      const masteryEvaluation = MasteryEngine.evaluateMasteryUpdate(
        existingMastery,
        exLog.exerciseId,
        activeWorkout.userId,
        validSets,
        0,
        athleteBodyweight,
        exLog.exercise
      );

      // Save updated mastery to SQLite
      await MasteryRepository.upsertMastery(masteryEvaluation.updatedMastery);
      await SyncQueueRepository.enqueue(
        'exercise_mastery',
        masteryEvaluation.updatedMastery.id,
        'UPDATE',
        masteryEvaluation.updatedMastery,
        `mastery:${activeWorkout.userId}:${exLog.exerciseId}`
      );

      // Record separate EXERCISE XP ledger entry (strictly decoupled from Player XP)
      if (masteryEvaluation.xpEarned > 0) {
        await XpRepository.recordTransaction(
          activeWorkout.userId,
          'EXERCISE',
          `${activeWorkout.id}-${exLog.exerciseId}`,
          masteryEvaluation.xpEarned,
          `Exercise XP: ${exLog.exercise?.name || 'Exercise'}`,
          completedAt,
          'EXERCISE',
          exLog.exerciseId
        );
      }

      // Check milestones for this exercise
      let unlockedMilestones: { id: string; title: string; rewardXp: number }[] = [];
      try {
        const msResult = await MilestoneRepository.evaluateMilestones(
          activeWorkout.userId,
          exLog.exerciseId,
          masteryEvaluation.updatedMastery
        );
        unlockedMilestones = msResult.unlockedMilestones.map(m => ({
          id: m.id,
          title: m.title,
          rewardXp: m.rewardXp,
        }));

        for (const ms of msResult.unlockedMilestones) {
          // Record milestone bonus XP
          await XpRepository.recordTransaction(
            activeWorkout.userId,
            'MILESTONE',
            ms.id,
            ms.rewardXp,
            `Milestone: ${ms.title}`,
            completedAt,
            'PLAYER',
            exLog.exerciseId
          );
        }
      } catch (err) {
        console.warn('Milestone evaluation warning:', err);
      }

      // Record any PRs (Highest Value Wins in savePersonalRecord)
      for (const pr of masteryEvaluation.newPrs) {
        const prRecord = {
          id: `pr-${activeWorkout.id}-${pr.prType}-${exLog.exerciseId}`,
          userId: activeWorkout.userId,
          exerciseId: exLog.exerciseId,
          prType: pr.prType,
          value: pr.value,
          setLogId: pr.setLogId,
          achievedAt: completedAt,
        };
        const wasSaved = await MasteryRepository.savePersonalRecord(prRecord);
        if (wasSaved) {
          totalPrsCount++;
          await SyncQueueRepository.enqueue(
            'personal_record',
            prRecord.id,
            'INSERT',
            prRecord,
            `pr:${activeWorkout.userId}:${exLog.exerciseId}:${pr.prType}`
          );
        }
      }

      exerciseMasteryUpdates.push({
        exerciseId: exLog.exerciseId,
        exerciseName: exLog.exercise?.name || 'Exercise',
        xpEarned: masteryEvaluation.xpEarned,
        oldLevel: masteryEvaluation.oldLevel,
        newLevel: masteryEvaluation.newLevel,
        didLevelUp: masteryEvaluation.didLevelUp,
        oldRank: masteryEvaluation.oldRank,
        newRank: masteryEvaluation.newRank,
        didRankUp: masteryEvaluation.didRankUp,
        relativeStrength: masteryEvaluation.updatedMastery.relativeStrength,
        new1RmKg: masteryEvaluation.updatedMastery.estimated1RmKg,
        prsBroken: masteryEvaluation.newPrs.map(p => ({ type: p.prType, value: p.value })),
        unlockedMilestones,
      });
    }

    // 2. Evaluate Quests
    let questBonusXp = 0;
    let questResult: ReturnType<typeof QuestEngine.evaluateWorkoutForQuests> | null = null;
    try {
      const userQuests = await QuestRepository.getUserQuests(activeWorkout.userId);
      questResult = QuestEngine.evaluateWorkoutForQuests(
        {
          ...activeWorkout,
          status: 'COMPLETED',
          durationSeconds: elapsedSeconds,
          totalVolumeKg: totalVolume,
          totalSets,
          totalReps,
        },
        userQuests
      );

      for (const uq of questResult.updatedQuests) {
        await QuestRepository.updateProgress(
          uq.userId,
          uq.questId,
          uq.currentProgress,
          uq.completed
        );
        if (uq.completed) {
          await SyncQueueRepository.enqueue(
            'user_quest', uq.id, 'UPDATE', uq,
            `quest:${uq.userId}:${uq.questId}`
          );
        }
      }

      questBonusXp = questResult.totalQuestXpBonus;
    } catch (err) {
      console.warn('Quest evaluation error in workout finish:', err);
    }

    // 3. Anti-exploit validation & Session XP
    const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    const validation = AntiExploitEngine.validateWorkoutQualification({
      ...activeWorkout,
      status: 'COMPLETED',
      durationSeconds: elapsedSeconds,
      totalVolumeKg: totalVolume,
      totalSets,
      totalReps,
    });

    const isQualifying = validation.isValid;
    const sessionCompletionXp = XpEngine.calculateSessionXp(totalVolume, durationMinutes, isQualifying);
    const prBonusXp = isQualifying ? totalPrsCount * 100 : 0;
    const effectiveSetsXp = isQualifying ? setsXp : 0;
    const effectiveQuestBonusXp = isQualifying ? questBonusXp : 0;
    const baseTotalXpEarned = effectiveSetsXp + sessionCompletionXp + prBonusXp + effectiveQuestBonusXp;

    // 4. User Profile & Streak Update
    const profile = await ProfileRepository.getProfile(activeWorkout.userId);
    const oldTotalXp = profile ? profile.totalXp : 0;
    const oldLevel = profile ? profile.globalLevel : 1;
    const oldStreak = profile ? profile.currentStreak : 0;
    const longestStreak = profile ? profile.longestStreak : 0;
    const freezeTokens = profile ? profile.streakFreezeTokens : 1;

    // Apply streak multiplier
    const streakMultiplier = XpEngine.calculateStreakMultiplier(oldStreak);
    const finalXpEarned = Math.round(baseTotalXpEarned * streakMultiplier);

    // 5. Persist Workout Completion atomically (prevents double-completion)
    const wasCompleted = await WorkoutRepository.finishWorkout(
      activeWorkout.id,
      completedAt,
      elapsedSeconds,
      totalVolume,
      totalReps,
      totalSets,
      finalXpEarned
    );

    // If the workout was already completed (e.g. duplicate call), skip XP/streak
    if (!wasCompleted) {
      console.warn('[useWorkoutStore] finishWorkout: workout was already completed, skipping XP/streak');
      set({
        isActive: false,
        activeWorkout: null,
        elapsedSeconds: 0,
        isRestTimerRunning: false,
        restTimerSecondsRemaining: 0,
        selectedSetForPlates: null,
      });
      return null;
    }

    // 6. Record XP idempotently through the ledger
    const xpResult = await XpRepository.recordTransaction(
      activeWorkout.userId,
      'WORKOUT',
      activeWorkout.id,
      finalXpEarned,
      `Workout: ${activeWorkout.title}`
    );

    // Record quest XP separately for ledger granularity
    if (effectiveQuestBonusXp > 0 && questResult?.newlyCompletedQuests) {
      for (const cq of questResult.newlyCompletedQuests) {
        await XpRepository.recordTransaction(
          activeWorkout.userId,
          'QUEST',
          cq.questId || cq.id,
          cq.quest?.xpReward || 0,
          `Quest Completed: ${cq.quest?.title || 'Quest'}`
        );
      }
    }

    // Recompute actual total XP from profile (idempotent—XpRepository may have already applied)
    const refreshedProfile = await ProfileRepository.getProfile(activeWorkout.userId);
    const newTotalXp = refreshedProfile ? refreshedProfile.totalXp : oldTotalXp + finalXpEarned;

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

    // 7. Compute updated attributes
    const currentAttributes = currentProfile?.attributes || {
      strength: 10,
      endurance: 10,
      agility: 10,
      consistency: 10,
      stamina: 10,
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

    const athleteBw = currentProfile?.weightKg || 75;
    const stats = await WorkoutRepository.getLifetimeStats(activeWorkout.userId);
    const verifiedSessionsCount = (stats?.totalWorkouts || 0) + 1;

    const newAttributes = AttributeEngine.computeAttributes(
      currentAttributes,
      [updatedSessionForCalc],
      streakResult.currentStreak,
      0,
      1,
      athleteBw
    );

    // Compute Unified Progression Status (coupling level, rank, dimensions, & data verification)
    const unifiedStatus = FitnessProgressionService.evaluateUnifiedProgression({
      totalXp: newTotalXp,
      attributes: newAttributes,
      verifiedSessionsCount,
      athleteBodyweightKg: athleteBw,
    });

    const attributesDelta = {
      strength: newAttributes.strength - currentAttributes.strength,
      endurance:
        (newAttributes.endurance ?? newAttributes.stamina ?? 10) -
        (currentAttributes.endurance ?? currentAttributes.stamina ?? 10),
      mobility:
        (newAttributes.mobility ?? 10) -
        (currentAttributes.mobility ?? 10),
      consistency:
        (newAttributes.consistency ?? newAttributes.discipline ?? 10) -
        (currentAttributes.consistency ?? currentAttributes.discipline ?? 10),
      agility: newAttributes.agility - currentAttributes.agility,
      stamina: (newAttributes.stamina ?? 10) - (currentAttributes.stamina ?? 10),
      discipline: (newAttributes.discipline ?? 10) - (currentAttributes.discipline ?? 10),
      vitality: (newAttributes.vitality ?? 10) - (currentAttributes.vitality ?? 10),
    };

    // 8. Update profile progression (using verified effective rank)
    await ProfileRepository.updateProgression(
      activeWorkout.userId,
      newLevelInfo.level,
      newTotalXp,
      unifiedStatus.effectiveRank.tier,
      unifiedStatus.rankDivision,
      newAttributes,
      streakResult.currentStreak,
      streakResult.longestStreak,
      streakResult.streakFreezeTokens,
      completedAt.split('T')[0]
    );

    // 8.5. Evaluate declarative achievements (Idempotent progression)
    let newlyUnlockedAchievements: AchievementConfig[] = [];
    try {
      const userMasteries = await MasteryRepository.getAllMasteries(activeWorkout.userId);
      let maxMasteryLevel = 1;
      for (const m of userMasteries) {
        if (m.masteryLevel > maxMasteryLevel) maxMasteryLevel = m.masteryLevel;
      }
      const allPrs = await MasteryRepository.getAllPersonalRecords(activeWorkout.userId);
      const userQuests = await QuestRepository.getUserQuests(activeWorkout.userId);
      const completedQuestsCount = userQuests.filter(q => q.completed).length;

      const achResult = await AchievementEngine.evaluateAndUnlock(activeWorkout.userId, {
        totalWorkouts: stats.totalWorkouts,
        totalVolumeKg: stats.totalVolumeKg,
        currentStreak: streakResult.currentStreak,
        longestStreak: streakResult.longestStreak,
        completedQuestsCount,
        personalRecordsCount: allPrs.length,
        maxMasteryLevel,
      });
      newlyUnlockedAchievements = achResult.newlyUnlocked;
    } catch (err) {
      console.warn('[useWorkoutStore] Achievement evaluation non-blocking error:', err);
    }

    // 9. Enqueue workout sync with deterministic idempotency key
    await SyncQueueRepository.enqueue('workout', activeWorkout.id, 'UPDATE', {
      ...updatedSessionForCalc,
      xpEarned: finalXpEarned,
    }, `workout:${activeWorkout.id}:complete`);

    const progressionResult: WorkoutProgressionResult = {
      xpEarned: finalXpEarned,
      newTotalXp,
      oldGlobalLevel: oldLevel,
      newGlobalLevel: newLevelInfo.level,
      didLevelUp: newLevelInfo.level > oldLevel,
      newRank: {
        tier: unifiedStatus.effectiveRank.tier,
        division: unifiedStatus.rankDivision,
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
      questsUpdated: questResult?.updatedQuests,
      completedQuests: questResult?.newlyCompletedQuests,
      newlyUnlockedAchievements,
      unifiedStatus,
      isVerifiedSession: true,
    };

    // 10. Publish athletic events to activity feed (Privacy-gated, non-blocking)
    try {
      const exerciseNames = activeWorkout.exercises.map(e => e.exercise?.name || 'Exercise');
      const durationMin = Math.max(1, Math.round(elapsedSeconds / 60));
      await SocialFeedService.publishEvent(activeWorkout.userId, {
        eventType: 'WORKOUT_COMPLETED',
        title: `${activeWorkout.title} Completed`,
        summary: `Logged ${durationMin}m • ${Math.round(totalVolume)} kg total volume • ${totalSets} sets`,
        metadata: {
          workoutId: activeWorkout.id,
          durationMinutes: durationMin,
          totalVolumeKg: Math.round(totalVolume),
          exerciseCount: activeWorkout.exercises.length,
          primaryExercises: exerciseNames.slice(0, 3),
        },
      });

      if (totalPrsCount > 0) {
        for (const update of exerciseMasteryUpdates) {
          for (const pr of update.prsBroken) {
            await SocialFeedService.publishEvent(activeWorkout.userId, {
              eventType: 'PR_ACHIEVED',
              title: `New PR: ${update.exerciseName}`,
              summary: `Established new ${pr.type.replace(/_/g, ' ')} benchmark: ${pr.value} kg`,
              metadata: {
                prExerciseName: update.exerciseName,
                prType: pr.type,
                prValue: pr.value,
              },
            });
          }
        }
      }

      if (progressionResult.didLevelUp) {
        await SocialFeedService.publishEvent(activeWorkout.userId, {
          eventType: 'LEVEL_UP',
          title: `Operative Level Up: Level ${newLevelInfo.level}`,
          summary: `Ascended to Global Level ${newLevelInfo.level} with ${newTotalXp.toLocaleString()} Total XP`,
          metadata: {
            oldLevel,
            newLevel: newLevelInfo.level,
          },
        });
      }

      if (newRank.tier !== profile?.rankTier || newRank.division !== profile?.rankDivision) {
        await SocialFeedService.publishEvent(activeWorkout.userId, {
          eventType: 'RANK_UP',
          title: `Rank Ascension: Tier ${newRank.tier}`,
          summary: `Promoted to ${newRank.tier}-Rank Division ${newRank.division}`,
          metadata: {
            oldRankTier: profile?.rankTier,
            newRankTier: newRank.tier,
            newDivision: newRank.division,
          },
        });
      }

      if (questResult?.newlyCompletedQuests && questResult.newlyCompletedQuests.length > 0) {
        for (const ncq of questResult.newlyCompletedQuests) {
          await SocialFeedService.publishEvent(activeWorkout.userId, {
            eventType: 'CHALLENGE_COMPLETED',
            title: `Objective Fulfilled: ${ncq.quest?.title || 'Tactical Directive'}`,
            summary: `Completed challenge protocol and secured +${ncq.quest?.xpReward || 0} XP bonus`,
            metadata: {
              challengeId: ncq.questId || ncq.id,
              challengeTitle: ncq.quest?.title,
              challengeXp: ncq.quest?.xpReward,
            },
          });
        }
      }

      if (newlyUnlockedAchievements.length > 0) {
        for (const ach of newlyUnlockedAchievements) {
          await SocialFeedService.publishEvent(activeWorkout.userId, {
            eventType: 'ACHIEVEMENT_UNLOCKED',
            title: `Achievement Unlocked: ${ach.title}`,
            summary: `${ach.description} (+${ach.xpReward} XP)`,
            metadata: {
              achievementId: ach.id,
              achievementTitle: ach.title,
              achievementIcon: ach.icon,
            },
          });
        }
      }

      const oldStage = Math.floor(oldLevel / 10);
      const newStage = Math.floor(newLevelInfo.level / 10);
      if (newStage > oldStage && newLevelInfo.level >= 10) {
        let evolutionTitle = 'OPERATIVE';
        if (newLevelInfo.level >= 40) evolutionTitle = 'ASCENDED TITAN';
        else if (newLevelInfo.level >= 30) evolutionTitle = 'WARLORD';
        else if (newLevelInfo.level >= 20) evolutionTitle = 'VANGUARD';

        await SocialFeedService.publishEvent(activeWorkout.userId, {
          eventType: 'CHARACTER_EVOLUTION',
          title: `Character Evolution Achieved`,
          summary: `Operative morphology evolved to ${evolutionTitle} (Stage ${newStage + 1})`,
          metadata: {
            evolutionStage: newStage + 1,
            evolutionForm: evolutionTitle,
          },
        });
      }
    } catch (err) {
      console.warn('Social feed publishing non-blocking warning:', err);
    }

    // 11. Dispatch athletic event to Reusable Challenge Engine (Non-blocking)
    try {
      const durationMin = Math.max(1, Math.round(elapsedSeconds / 60));
      await ChallengeEngine.processEvent(activeWorkout.userId, {
        eventId: activeWorkout.id,
        eventType: 'WORKOUT',
        timestamp: completedAt,
        volumeKg: Math.round(totalVolume),
        durationMinutes: durationMin,
        xpEarned: finalXpEarned,
        isQualifyingStrength: isQualifying,
      });

      // Also process specific exercise volumes for exercise-specific challenges
      for (const exLog of activeWorkout.exercises) {
        let exVol = 0;
        let exReps = 0;
        for (const s of exLog.sets) {
          if (s.completed && !s.isSkipped && s.setType !== 'WARMUP') {
            exVol += s.weightKg * s.reps;
            exReps += s.reps;
          }
        }
        if (exVol > 0 || exReps > 0) {
          await ChallengeEngine.processEvent(activeWorkout.userId, {
            eventId: `${activeWorkout.id}-${exLog.exerciseId}`,
            eventType: 'WORKOUT',
            timestamp: completedAt,
            exerciseId: exLog.exerciseId,
            exerciseVolumeKg: Math.round(exVol),
            exerciseReps: exReps,
          });
        }
      }
    } catch (err) {
      console.warn('ChallengeEngine processing non-blocking warning:', err);
    }

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

  /**
   * Restores an in-progress workout from SQLite after app restart or crash.
   * Returns true if a workout was restored, false if none found.
   */
  restoreActiveWorkout: async (userId: string): Promise<boolean> => {
    const { isActive } = get();
    if (isActive) return true; // Already have an active workout in memory

    try {
      const activeWorkout = await WorkoutRepository.getActiveWorkout(userId);
      if (!activeWorkout) return false;

      // Calculate elapsed seconds from startedAt to now
      const startedDate = new Date(activeWorkout.startedAt).getTime();
      const elapsed = Math.max(0, Math.round((Date.now() - startedDate) / 1000));

      set({
        isActive: true,
        activeWorkout,
        elapsedSeconds: elapsed,
        isRestTimerRunning: false,
        restTimerSecondsRemaining: 0,
      });

      return true;
    } catch (err) {
      console.warn('[useWorkoutStore] restoreActiveWorkout failed:', err);
      return false;
    }
  },

  linkAsSuperset: async (exerciseLogIds: string[], supersetId?: string) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return '';

    const existingIds = activeWorkout.exercises.map(e => e.supersetId);
    const ssId = supersetId || SupersetEngine.generateSupersetId(existingIds);

    const updatedExercises = activeWorkout.exercises.map(ex => {
      if (exerciseLogIds.includes(ex.id)) {
        return { ...ex, supersetId: ssId };
      }
      return ex;
    });

    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: updatedExercises,
      },
    });

    for (const ex of updatedExercises) {
      if (exerciseLogIds.includes(ex.id)) {
        await WorkoutRepository.saveExerciseLog(ex);
      }
    }

    return ssId;
  },

  unlinkSuperset: async (supersetId: string) => {
    const { activeWorkout } = get();
    if (!activeWorkout) return;

    const updatedExercises = activeWorkout.exercises.map(ex => {
      if (ex.supersetId === supersetId) {
        return { ...ex, supersetId: null };
      }
      return ex;
    });

    set({
      activeWorkout: {
        ...activeWorkout,
        exercises: updatedExercises,
      },
    });

    for (const ex of updatedExercises) {
      if (ex.supersetId === null) {
        await WorkoutRepository.saveExerciseLog(ex);
      }
    }
  },

  startWorkoutFromTemplate: async (template: WorkoutTemplate) => {
    const workoutId = `w-${Date.now()}`;
    const now = new Date().toISOString();
    const activeUserId = useAuthStore.getState().userId || DEFAULT_USER_ID;

    const newWorkout: WorkoutSession = {
      id: workoutId,
      userId: activeUserId,
      planId: null,
      title: template.name,
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

    const hydratedExercises: ExerciseLog[] = [];

    for (let i = 0; i < template.exercises.length; i++) {
      const tEx = template.exercises[i];
      const exLogId = `el-${workoutId}-${i + 1}`;
      const exercise = tEx.exercise || (await ExerciseRepository.getById(tEx.exerciseId)) || undefined;

      const sets: SetLog[] = [];
      const numSets = tEx.targetSets || 3;
      const targetRepsNum = typeof tEx.targetReps === 'number' 
        ? tEx.targetReps 
        : (parseInt(String(tEx.targetReps), 10) || 10);
      const targetWeight = tEx.targetWeightKg ?? 0;

      for (let s = 1; s <= numSets; s++) {
        const setId = `s-${Date.now()}-${i + 1}-${s}`;
        sets.push({
          id: setId,
          exerciseLogId: exLogId,
          userId: activeUserId,
          setNumber: s,
          setType: 'NORMAL',
          weightKg: targetWeight,
          reps: targetRepsNum,
          rpe: tEx.targetRpe ?? 8,
          estimated1RmKg: calculateEstimated1RM(targetWeight, targetRepsNum),
          isPr: false,
          completed: false,
          completedAt: now,
        });
      }

      const exerciseLog: ExerciseLog = {
        id: exLogId,
        workoutId,
        exerciseId: tEx.exerciseId,
        userId: activeUserId,
        orderIndex: i,
        notes: tEx.notes || undefined,
        supersetId: tEx.supersetId || null,
        sets,
        exercise,
        prescription: {
          exercise_id: tEx.exerciseId,
          order: i,
          sets: numSets,
          target_reps: tEx.targetReps,
          target_weight: tEx.targetWeightKg,
          rest_seconds: tEx.restSeconds,
          instructions: tEx.notes,
        },
      };

      hydratedExercises.push(exerciseLog);
    }

    newWorkout.exercises = hydratedExercises;

    set({
      isActive: true,
      activeWorkout: newWorkout,
      elapsedSeconds: 0,
      isRestTimerRunning: false,
      restTimerSecondsRemaining: 0,
      restTimerTotalSeconds: 0,
      selectedSetForPlates: null,
      activePR: null,
      focusedSupersetTarget: null,
    });

    await WorkoutRepository.createWorkout(newWorkout);
    for (const exLog of hydratedExercises) {
      await WorkoutRepository.saveExerciseLog(exLog);
      for (const s of exLog.sets) {
        await WorkoutRepository.saveSetLog(s);
      }
    }
  },

  discardWorkout: () => {
    set({
      isActive: false,
      activeWorkout: null,
      elapsedSeconds: 0,
      isRestTimerRunning: false,
      restTimerSecondsRemaining: 0,
      selectedSetForPlates: null,
      focusedSupersetTarget: null,
    });
  },
}));
