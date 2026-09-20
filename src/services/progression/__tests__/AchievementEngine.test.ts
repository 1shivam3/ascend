import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AchievementEngine } from '../AchievementEngine';
import { AchievementRepository } from '../../../database/repositories/AchievementRepository';
import { NotificationEngine } from '../../notifications/NotificationEngine';
import { AchievementContext } from '../../../config/achievements.config';

// Mock sqlite and dependencies
vi.mock('../../../database/sqlite', () => ({
  getDatabase: vi.fn().mockResolvedValue({
    runAsync: vi.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 1 }),
    getAllAsync: vi.fn().mockResolvedValue([]),
    getFirstAsync: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('../../../database/repositories/AchievementRepository', () => ({
  AchievementRepository: {
    getUnlockedIds: vi.fn(),
    unlockAchievement: vi.fn().mockResolvedValue(undefined),
    getUserAchievements: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../notifications/NotificationEngine', () => ({
  NotificationEngine: {
    notifyAchievementUnlocked: vi.fn().mockResolvedValue('notif-1'),
  },
}));

describe('Reusable Configuration-Driven Achievement Engine', () => {
  const userId = 'user-combat-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unlocks FIRST_BLOOD and FIRST_QUEST on initial achievements', async () => {
    (AchievementRepository.getUnlockedIds as any).mockResolvedValueOnce(new Set<string>());

    const context: AchievementContext = {
      totalWorkouts: 1,
      totalVolumeKg: 2500,
      currentStreak: 1,
      longestStreak: 1,
      completedQuestsCount: 1,
      personalRecordsCount: 0,
      maxMasteryLevel: 1,
    };

    const result = await AchievementEngine.evaluateAndUnlock(userId, context);

    const codes = result.newlyUnlocked.map(a => a.code);
    expect(codes).toContain('FIRST_BLOOD');
    expect(codes).toContain('FIRST_QUEST');
    expect(codes).not.toContain('UNSTOPPABLE'); // 7 days required

    expect(AchievementRepository.unlockAchievement).toHaveBeenCalledWith(
      userId,
      'ach-first-blood',
      100
    );
    expect(AchievementRepository.unlockAchievement).toHaveBeenCalledWith(
      userId,
      'ach-first-quest',
      100
    );
    expect(NotificationEngine.notifyAchievementUnlocked).toHaveBeenCalledTimes(2);
  });

  it('unlocks UNSTOPPABLE upon achieving 7-day streak', async () => {
    (AchievementRepository.getUnlockedIds as any).mockResolvedValueOnce(
      new Set(['ach-first-blood', 'ach-first-quest'])
    );

    const context: AchievementContext = {
      totalWorkouts: 7,
      totalVolumeKg: 15000,
      currentStreak: 7,
      longestStreak: 7,
      completedQuestsCount: 8,
      personalRecordsCount: 1,
      maxMasteryLevel: 5,
    };

    const result = await AchievementEngine.evaluateAndUnlock(userId, context);
    const codes = result.newlyUnlocked.map(a => a.code);

    expect(codes).toContain('UNSTOPPABLE');
    expect(codes).toContain('FIRST_PR');
    expect(codes).toContain('IRON_CENTURION'); // > 10,000 kg volume
    expect(codes).not.toContain('IRON_WILL'); // 30 days required
  });

  it('unlocks IRON_WILL upon reaching 30-day streak milestone', async () => {
    (AchievementRepository.getUnlockedIds as any).mockResolvedValueOnce(
      new Set(['ach-unstoppable', 'ach-first-blood'])
    );

    const context: AchievementContext = {
      totalWorkouts: 32,
      totalVolumeKg: 85000,
      currentStreak: 30,
      longestStreak: 30,
      completedQuestsCount: 35,
      personalRecordsCount: 4,
      maxMasteryLevel: 8,
    };

    const result = await AchievementEngine.evaluateAndUnlock(userId, context);
    const codes = result.newlyUnlocked.map(a => a.code);

    expect(codes).toContain('IRON_WILL');
    expect(result.totalXpAwarded).toBeGreaterThanOrEqual(1000);
  });

  it('unlocks WARRIOR (50 workouts) and CENTURION (100 workouts)', async () => {
    (AchievementRepository.getUnlockedIds as any).mockResolvedValueOnce(new Set<string>());

    const context100: AchievementContext = {
      totalWorkouts: 100,
      totalVolumeKg: 300000,
      currentStreak: 15,
      longestStreak: 45,
      completedQuestsCount: 120,
      personalRecordsCount: 12,
      maxMasteryLevel: 25,
    };

    const result = await AchievementEngine.evaluateAndUnlock(userId, context100);
    const codes = result.newlyUnlocked.map(a => a.code);

    expect(codes).toContain('WARRIOR');
    expect(codes).toContain('CENTURION');
    expect(codes).toContain('MOVEMENT_SPECIALIST'); // Level 25 >= 10
  });

  it('guarantees idempotency and prevents unlocking already granted achievements', async () => {
    const allUnlockedIds = new Set([
      'ach-first-quest',
      'ach-unstoppable',
      'ach-iron-will',
      'ach-first-pr',
      'ach-first-blood',
      'ach-warrior',
      'ach-centurion',
      'ach-iron-centurion',
      'ach-movement-specialist',
    ]);

    (AchievementRepository.getUnlockedIds as any).mockResolvedValueOnce(allUnlockedIds);

    const maxContext: AchievementContext = {
      totalWorkouts: 150,
      totalVolumeKg: 500000,
      currentStreak: 40,
      longestStreak: 40,
      completedQuestsCount: 200,
      personalRecordsCount: 20,
      maxMasteryLevel: 50,
    };

    const result = await AchievementEngine.evaluateAndUnlock(userId, maxContext);
    expect(result.newlyUnlocked.length).toBe(0);
    expect(result.totalXpAwarded).toBe(0);
    expect(AchievementRepository.unlockAchievement).not.toHaveBeenCalled();
  });
});
