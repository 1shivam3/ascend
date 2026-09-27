import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TitleEngine } from '../TitleEngine';
import { TitleRepository } from '../../../database/repositories/TitleRepository';
import { TitleEvaluationContext } from '../../../types/title.types';
import { TITLES_CATALOG } from '../../../config/titles.config';

// Mock getDatabase for TitleRepository
const mockUserTitles: any[] = [];

vi.mock('../../../database/sqlite', () => ({
  getDatabase: vi.fn().mockResolvedValue({
    getAllAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      if (sql.includes('FROM user_titles')) {
        return mockUserTitles.filter(ut => ut.user_id === params[0]);
      }
      return [];
    }),
    getFirstAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      if (sql.includes('FROM user_titles WHERE user_id = ? AND is_active = 1')) {
        return mockUserTitles.find(ut => ut.user_id === params[0] && ut.is_active === 1) || null;
      }
      if (sql.includes('FROM user_titles WHERE user_id = ? AND title_id = ?')) {
        return mockUserTitles.find(ut => ut.user_id === params[0] && ut.title_id === params[1]) || null;
      }
      return null;
    }),
    runAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      if (sql.includes('INSERT OR IGNORE INTO user_titles') || sql.includes('INSERT INTO user_titles')) {
        const [id, user_id, title_id, unlocked_at, created_at, updated_at] = params;
        if (!mockUserTitles.some(ut => ut.user_id === user_id && ut.title_id === title_id)) {
          mockUserTitles.push({
            id,
            user_id,
            title_id,
            unlocked_at,
            is_active: 0,
            created_at,
            updated_at,
          });
        }
        return { changes: 1 };
      }
      if (sql.includes('UPDATE user_titles SET is_active = 0')) {
        const [, user_id] = params;
        mockUserTitles.forEach(ut => {
          if (ut.user_id === user_id) ut.is_active = 0;
        });
        return { changes: 1 };
      }
      if (sql.includes('UPDATE user_titles SET is_active = 1')) {
        const [now, user_id, title_id] = params;
        const target = mockUserTitles.find(ut => ut.user_id === user_id && ut.title_id === title_id);
        if (target) {
          target.is_active = 1;
          target.updated_at = now;
        }
        return { changes: 1 };
      }
      if (sql.includes('UPDATE profiles SET active_title')) {
        return { changes: 1 };
      }
      return { changes: 1 };
    }),
  }),
}));

describe('TitleEngine & Titles Architecture', () => {
  beforeEach(() => {
    mockUserTitles.length = 0;
    vi.clearAllMocks();
  });

  describe('Catalog & Non-Exclusivity', () => {
    it('provides a catalog of titles with clear unlock conditions and readable names', () => {
      expect(TITLES_CATALOG.length).toBeGreaterThanOrEqual(10);
      for (const title of TITLES_CATALOG) {
        expect(title.id).toBeDefined();
        expect(title.name.trim().length).toBeGreaterThan(0);
        expect(title.description.trim().length).toBeGreaterThan(0);
        expect(title.unlockConditionText.trim().length).toBeGreaterThan(0);
        expect(title.category).toBeDefined();
        expect(title.rarity).toBeDefined();
        expect(title.requirementType).toBeDefined();
        expect(title.requirementThreshold).toBeGreaterThan(0);
      }
    });

    it('allows multiple distinct users to unlock the same title (non-exclusive)', async () => {
      const userA = 'user-alpha';
      const userB = 'user-bravo';

      const unlockedA = await TitleRepository.unlockTitle(userA, 'title-iron-discipline');
      const unlockedB = await TitleRepository.unlockTitle(userB, 'title-iron-discipline');

      expect(unlockedA.titleId).toBe('title-iron-discipline');
      expect(unlockedB.titleId).toBe('title-iron-discipline');
      expect(unlockedA.userId).toBe(userA);
      expect(unlockedB.userId).toBe(userB);

      const titlesA = await TitleRepository.getUserTitles(userA);
      const titlesB = await TitleRepository.getUserTitles(userB);

      expect(titlesA.some(t => t.titleId === 'title-iron-discipline')).toBe(true);
      expect(titlesB.some(t => t.titleId === 'title-iron-discipline')).toBe(true);
    });
  });

  describe('Anti-Exploit Rules', () => {
    it('strictly prevents unlocking athletic titles merely for opening app or logging in with 0 workouts', () => {
      const emptyContext: TitleEvaluationContext = {
        userId: 'user-slacker',
        totalWorkouts: 0,
        currentStreak: 14, // Spoofed or app login streak
        longestStreak: 14,
        totalVolumeKg: 0,
        maxRelativeStrength: 0,
        completedChallengesCount: 0,
        mobilityScore: 0,
        mobilityWorkoutsCount: 0,
        globalLevel: 1,
        rankTier: 'E',
      };

      const qualifying = TitleEngine.evaluateQualifyingTitles(emptyContext);
      // Zero workouts must disqualify workout, streak, volume, and challenge titles
      expect(qualifying.some(t => t.id === 'title-iron-discipline')).toBe(false);
      expect(qualifying.some(t => t.id === 'title-consistency-keeper')).toBe(false);
      expect(qualifying.some(t => t.id === 'title-power-builder')).toBe(false);
      expect(qualifying.some(t => t.id === 'title-the-challenger')).toBe(false);
    });
  });

  describe('Unlock Criteria Evaluation', () => {
    it('qualifies for Iron Discipline when maintaining a 14+ day streak with verified workouts', () => {
      const context: TitleEvaluationContext = {
        userId: 'user-dedicated',
        totalWorkouts: 14,
        currentStreak: 14,
        longestStreak: 14,
        totalVolumeKg: 10000,
        maxRelativeStrength: 1.0,
        completedChallengesCount: 0,
        mobilityScore: 0,
        mobilityWorkoutsCount: 0,
        globalLevel: 6,
        rankTier: 'D',
      };

      const qualifying = TitleEngine.evaluateQualifyingTitles(context);
      expect(qualifying.some(t => t.id === 'title-iron-discipline')).toBe(true);
    });

    it('qualifies for Consistency Keeper upon completing 20+ verified workouts', () => {
      const context: TitleEvaluationContext = {
        userId: 'user-regular',
        totalWorkouts: 20,
        currentStreak: 5,
        longestStreak: 10,
        totalVolumeKg: 15000,
        maxRelativeStrength: 1.0,
        completedChallengesCount: 0,
        mobilityScore: 0,
        mobilityWorkoutsCount: 0,
        globalLevel: 8,
        rankTier: 'D',
      };

      const qualifying = TitleEngine.evaluateQualifyingTitles(context);
      expect(qualifying.some(t => t.id === 'title-consistency-keeper')).toBe(true);
    });

    it('qualifies for Power Builder upon lifting 50,000+ kg total volume', () => {
      const context: TitleEvaluationContext = {
        userId: 'user-tonnage',
        totalWorkouts: 15,
        currentStreak: 3,
        longestStreak: 5,
        totalVolumeKg: 52000,
        maxRelativeStrength: 1.0,
        completedChallengesCount: 0,
        mobilityScore: 0,
        mobilityWorkoutsCount: 0,
        globalLevel: 10,
        rankTier: 'D',
      };

      const qualifying = TitleEngine.evaluateQualifyingTitles(context);
      expect(qualifying.some(t => t.id === 'title-power-builder')).toBe(true);
    });

    it('qualifies for Strength Seeker when compound strength reaches 1.25x BW', () => {
      const context: TitleEvaluationContext = {
        userId: 'user-strong',
        totalWorkouts: 12,
        currentStreak: 4,
        longestStreak: 6,
        totalVolumeKg: 20000,
        maxRelativeStrength: 1.30,
        completedChallengesCount: 0,
        mobilityScore: 0,
        mobilityWorkoutsCount: 0,
        globalLevel: 7,
        rankTier: 'D',
      };

      const qualifying = TitleEngine.evaluateQualifyingTitles(context);
      expect(qualifying.some(t => t.id === 'title-strength-seeker')).toBe(true);
    });

    it('qualifies for Movement Master when mobility score is >= 60', () => {
      const context: TitleEvaluationContext = {
        userId: 'user-mobility',
        totalWorkouts: 10,
        currentStreak: 2,
        longestStreak: 5,
        totalVolumeKg: 10000,
        maxRelativeStrength: 0.9,
        completedChallengesCount: 0,
        mobilityScore: 68,
        mobilityWorkoutsCount: 6,
        globalLevel: 5,
        rankTier: 'D',
      };

      const qualifying = TitleEngine.evaluateQualifyingTitles(context);
      expect(qualifying.some(t => t.id === 'title-movement-master')).toBe(true);
    });

    it('qualifies for The Challenger when 3 or more challenges are completed', () => {
      const context: TitleEvaluationContext = {
        userId: 'user-competitor',
        totalWorkouts: 18,
        currentStreak: 4,
        longestStreak: 8,
        totalVolumeKg: 25000,
        maxRelativeStrength: 1.1,
        completedChallengesCount: 3,
        mobilityScore: 40,
        mobilityWorkoutsCount: 2,
        globalLevel: 12,
        rankTier: 'C',
      };

      const qualifying = TitleEngine.evaluateQualifyingTitles(context);
      expect(qualifying.some(t => t.id === 'title-the-challenger')).toBe(true);
    });

    it('allows a user to unlock multiple titles simultaneously', async () => {
      const userId = 'user-high-achiever';
      const eliteContext: TitleEvaluationContext = {
        userId,
        totalWorkouts: 25,
        currentStreak: 15,
        longestStreak: 15,
        totalVolumeKg: 55000,
        maxRelativeStrength: 1.55,
        completedChallengesCount: 3,
        mobilityScore: 65,
        mobilityWorkoutsCount: 6,
        globalLevel: 15,
        rankTier: 'C',
      };

      const newlyUnlocked = await TitleEngine.syncAndUnlockTitles(eliteContext);

      expect(newlyUnlocked.length).toBeGreaterThanOrEqual(5);
      expect(newlyUnlocked.some(t => t.titleId === 'title-iron-discipline')).toBe(true);
      expect(newlyUnlocked.some(t => t.titleId === 'title-consistency-keeper')).toBe(true);
      expect(newlyUnlocked.some(t => t.titleId === 'title-strength-seeker')).toBe(true);
      expect(newlyUnlocked.some(t => t.titleId === 'title-power-builder')).toBe(true);
      expect(newlyUnlocked.some(t => t.titleId === 'title-movement-master')).toBe(true);
      expect(newlyUnlocked.some(t => t.titleId === 'title-the-challenger')).toBe(true);
      expect(newlyUnlocked.some(t => t.titleId === 'title-heavy-lifter')).toBe(true);
      expect(newlyUnlocked.some(t => t.titleId === 'title-unyielding-will')).toBe(true);

      // Verify all are stored in user_titles
      const stored = await TitleRepository.getUserTitles(userId);
      expect(stored.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Active Title Selection', () => {
    it('allows selecting one active title, and unequipping / switching titles cleanly', async () => {
      const userId = 'user-customizer';

      // Unlock two titles
      await TitleRepository.unlockTitle(userId, 'title-iron-discipline');
      await TitleRepository.unlockTitle(userId, 'title-strength-seeker');

      // Set active to Iron Discipline
      await TitleRepository.setActiveTitle(userId, 'title-iron-discipline');
      let active = await TitleRepository.getActiveTitle(userId);
      expect(active?.titleId).toBe('title-iron-discipline');
      expect(active?.isActive).toBe(true);

      // Switch active to Strength Seeker
      await TitleRepository.setActiveTitle(userId, 'title-strength-seeker');
      active = await TitleRepository.getActiveTitle(userId);
      expect(active?.titleId).toBe('title-strength-seeker');

      // Previous title is no longer active
      const userTitles = await TitleRepository.getUserTitles(userId);
      const ironDisc = userTitles.find(t => t.titleId === 'title-iron-discipline');
      expect(ironDisc?.isActive).toBe(false);

      // Unequip active title
      await TitleRepository.setActiveTitle(userId, null);
      active = await TitleRepository.getActiveTitle(userId);
      expect(active).toBeNull();
    });
  });
});
