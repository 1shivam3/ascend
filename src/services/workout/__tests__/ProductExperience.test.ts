import { describe, it, expect } from 'vitest';
import { QuestRepository } from '../../../database/repositories/QuestRepository';
import { QuestEngine } from '../QuestEngine';
import { SYSTEM_ACHIEVEMENTS } from '../../../constants/achievements';
import { PROGRESSION_CONFIG } from '../../../config/progression.config';
import { getMasteryTierForLevel, getRankForLevel } from '../../../constants/ranks';
import { UserQuestProgress } from '../../../types/quest.types';
import { WorkoutSession } from '../../../types/domain.types';

describe('Product Experience & Gamification UI Logic', () => {
  describe('Quest State Evaluation', () => {
    it('returns COMPLETED when quest is marked as completed', () => {
      const uq: UserQuestProgress = {
        id: 'uq-1',
        userId: 'user-1',
        questId: 'quest-field-deployment',
        currentProgress: 1,
        targetValue: 1,
        completed: true,
        completedAt: new Date().toISOString(),
        lastResetDate: '2026-09-19',
        quest: {
          id: 'quest-field-deployment',
          title: 'Field Deployment',
          description: 'Test',
          type: 'DAILY',
          category: 'WORKOUT_COUNT',
          targetValue: 1,
          unit: 'SESSION',
          xpReward: 75,
          badgeVariant: 'cyan',
        },
      };

      expect(QuestRepository.getQuestStatus(uq, 1)).toBe('COMPLETED');
    });

    it('returns LOCKED when user level is below minLevelRequired', () => {
      const uq: UserQuestProgress = {
        id: 'uq-2',
        userId: 'user-1',
        questId: 'quest-advanced',
        currentProgress: 0,
        targetValue: 10,
        completed: false,
        completedAt: null,
        lastResetDate: '2026-09-19',
        quest: {
          id: 'quest-advanced',
          title: 'Ascension Directive',
          description: 'Reach high tier',
          type: 'CAMPAIGN',
          category: 'MASTERY_LEVEL',
          targetValue: 10,
          unit: 'MOVEMENTS',
          xpReward: 500,
          badgeVariant: 'violet',
          minLevelRequired: 15,
        },
      };

      expect(QuestRepository.getQuestStatus(uq, 5)).toBe('LOCKED');
      expect(QuestRepository.getQuestStatus(uq, 15)).toBe('AVAILABLE');
    });

    it('returns IN_PROGRESS when progress is greater than 0 but not complete', () => {
      const uq: UserQuestProgress = {
        id: 'uq-3',
        userId: 'user-1',
        questId: 'quest-tonnage',
        currentProgress: 1500,
        targetValue: 4000,
        completed: false,
        completedAt: null,
        lastResetDate: '2026-09-19',
        quest: {
          id: 'quest-tonnage',
          title: 'Tonnage Threshold',
          description: '4000kg',
          type: 'DAILY',
          category: 'VOLUME_TOTAL',
          targetValue: 4000,
          unit: 'KG',
          xpReward: 75,
          badgeVariant: 'cyan',
        },
      };

      expect(QuestRepository.getQuestStatus(uq, 2)).toBe('IN_PROGRESS');
    });

    it('returns AVAILABLE when quest is not started and level is sufficient', () => {
      const uq: UserQuestProgress = {
        id: 'uq-4',
        userId: 'user-1',
        questId: 'quest-iron',
        currentProgress: 0,
        targetValue: 4,
        completed: false,
        completedAt: null,
        lastResetDate: '2026-09-19',
        quest: {
          id: 'quest-iron',
          title: 'Iron Consistency',
          description: '4 days',
          type: 'WEEKLY',
          category: 'WORKOUT_COUNT',
          targetValue: 4,
          unit: 'DAYS',
          xpReward: 250,
          badgeVariant: 'emerald',
        },
      };

      expect(QuestRepository.getQuestStatus(uq, 2)).toBe('AVAILABLE');
    });
  });

  describe('Quest Engine Automated Workout Updates', () => {
    it('accurately advances workout count, tonnage, and failure set directives', () => {
      const initialQuests: UserQuestProgress[] = [
        {
          id: 'uq-1',
          userId: 'user-1',
          questId: 'q-deploy',
          currentProgress: 0,
          targetValue: 1,
          completed: false,
          completedAt: null,
          lastResetDate: '2026-09-19',
          quest: {
            id: 'q-deploy',
            title: 'Field Deployment',
            description: '1 session',
            type: 'DAILY',
            category: 'WORKOUT_COUNT',
            targetValue: 1,
            unit: 'SESSION',
            xpReward: 75,
            badgeVariant: 'cyan',
          },
        },
        {
          id: 'uq-2',
          userId: 'user-1',
          questId: 'q-tonnage',
          currentProgress: 1000,
          targetValue: 4000,
          completed: false,
          completedAt: null,
          lastResetDate: '2026-09-19',
          quest: {
            id: 'q-tonnage',
            title: 'Tonnage Threshold',
            description: '4000kg',
            type: 'DAILY',
            category: 'VOLUME_TOTAL',
            targetValue: 4000,
            unit: 'KG',
            xpReward: 75,
            badgeVariant: 'cyan',
          },
        },
        {
          id: 'uq-3',
          userId: 'user-1',
          questId: 'q-fail',
          currentProgress: 0,
          targetValue: 1,
          completed: false,
          completedAt: null,
          lastResetDate: '2026-09-19',
          quest: {
            id: 'q-fail',
            title: 'Limit Exertion',
            description: '1 failure set',
            type: 'DAILY',
            category: 'FAILURE_SETS',
            targetValue: 1,
            unit: 'SET',
            xpReward: 75,
            badgeVariant: 'amber',
          },
        },
      ];

      const mockWorkout: WorkoutSession = {
        id: 'w-101',
        userId: 'user-1',
        title: 'Tactical Session',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationSeconds: 3600,
        totalVolumeKg: 3500,
        totalReps: 30,
        totalSets: 6,
        status: 'COMPLETED',
        xpEarned: 240,
        exercises: [
          {
            id: 'el-1',
            workoutId: 'w-101',
            exerciseId: 'ex-bench-press',
            userId: 'user-1',
            orderIndex: 0,
            sets: [
              {
                id: 's-1',
                exerciseLogId: 'el-1',
                userId: 'user-1',
                setNumber: 1,
                setType: 'FAILURE',
                weightKg: 100,
                reps: 8,
                rpe: 10,
                estimated1RmKg: 124,
                isPr: false,
                completed: true,
                completedAt: new Date().toISOString(),
              },
            ],
          },
        ],
      };

      const result = QuestEngine.evaluateWorkoutForQuests(mockWorkout, initialQuests);

      // q-deploy should complete (0 -> 1)
      const deployQuest = result.updatedQuests.find(q => q.questId === 'q-deploy');
      expect(deployQuest?.completed).toBe(true);

      // q-tonnage should complete (1000 + 3500 = 4500, capped at 4000)
      const tonnageQuest = result.updatedQuests.find(q => q.questId === 'q-tonnage');
      expect(tonnageQuest?.completed).toBe(true);
      expect(tonnageQuest?.currentProgress).toBe(4000);

      // q-fail should complete (0 + 1 = 1)
      const failQuest = result.updatedQuests.find(q => q.questId === 'q-fail');
      expect(failQuest?.completed).toBe(true);

      // XP bonus accumulated: 75 + 75 + 75 = 225
      expect(result.totalQuestXpBonus).toBe(225);
    });
  });

  describe('Deterministic System Achievements Evaluation', () => {
    it('evaluates achievements based on genuine metrics', () => {
      const freshStats = {
        totalWorkouts: 0,
        totalVolumeKg: 0,
        currentStreak: 0,
        maxMasteryLevel: 1,
        prsCount: 0,
      };

      expect(SYSTEM_ACHIEVEMENTS.find(a => a.id === 'ach-first-blood')?.isUnlocked(freshStats)).toBe(false);

      const veteranStats = {
        totalWorkouts: 12,
        totalVolumeKg: 15400,
        currentStreak: 5,
        maxMasteryLevel: 14,
        prsCount: 3,
      };

      expect(SYSTEM_ACHIEVEMENTS.find(a => a.id === 'ach-first-blood')?.isUnlocked(veteranStats)).toBe(true);
      expect(SYSTEM_ACHIEVEMENTS.find(a => a.id === 'ach-iron-centurion')?.isUnlocked(veteranStats)).toBe(true);
      expect(SYSTEM_ACHIEVEMENTS.find(a => a.id === 'ach-consistency-cadet')?.isUnlocked(veteranStats)).toBe(true);
      expect(SYSTEM_ACHIEVEMENTS.find(a => a.id === 'ach-breakthrough-operator')?.isUnlocked(veteranStats)).toBe(true);
      expect(SYSTEM_ACHIEVEMENTS.find(a => a.id === 'ach-specialist-rank')?.isUnlocked(veteranStats)).toBe(true);
      expect(SYSTEM_ACHIEVEMENTS.find(a => a.id === 'ach-titan-discipline')?.isUnlocked(veteranStats)).toBe(true);
    });
  });

  describe('Mastery & Rank Progression Math', () => {
    it('computes exact mastery XP required for level 27 as specified', () => {
      const nextXp = PROGRESSION_CONFIG.mastery.getXpForNextLevel(27);
      expect(nextXp).toBe(6155);
      expect(typeof nextXp).toBe('number');
    });

    it('matches mastery tier titles across progression tiers', () => {
      expect(getMasteryTierForLevel(1).title).toBe('Novice');
      expect(getMasteryTierForLevel(27).title).toBe('Apprentice');
      expect(getMasteryTierForLevel(45).title).toBe('Specialist');
      expect(getMasteryTierForLevel(70).title).toBe('Master');
      expect(getMasteryTierForLevel(85).title).toBe('Grandmaster');
      expect(getMasteryTierForLevel(100).title).toBe('Paragon');
    });

    it('evaluates global Rank and divisions correctly', () => {
      const rankLvl1 = getRankForLevel(1);
      expect(rankLvl1.tier).toBe('E');
      expect(rankLvl1.division).toBe(4);

      const rankLvl27 = getRankForLevel(27);
      expect(rankLvl27.tier).toBe('C');

      const rankLvl100 = getRankForLevel(100);
      expect(rankLvl100.tier).toBe('SSS');
      expect(rankLvl100.division).toBe(1);
    });
  });
});
