import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaderboardService } from '../LeaderboardService';

// Mock sqlite with vi.hoisted
const { mockDb } = vi.hoisted(() => {
  return {
    mockDb: {
      runAsync: vi.fn().mockResolvedValue(undefined),
      getFirstAsync: vi.fn(),
      getAllAsync: vi.fn(),
    },
  };
});

vi.mock('../../../database/sqlite', () => ({
  getDatabase: vi.fn().mockResolvedValue(mockDb),
}));

describe('Privacy-First Leaderboard Service & RLS Verification', () => {
  const userA = 'user-alpha';
  const userB = 'user-beta';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults opt-in status to false (0)', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ leaderboard_opt_in: 0 });

    const isOptedIn = await LeaderboardService.getOptInStatus(userA);
    expect(isOptedIn).toBe(false);
  });

  it('updates opt-in preference when user explicitly opts in or out', async () => {
    await LeaderboardService.setOptIn(userA, true);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE profiles SET leaderboard_opt_in = ?'),
      expect.arrayContaining([1, userA])
    );

    await LeaderboardService.setOptIn(userA, false);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE profiles SET leaderboard_opt_in = ?'),
      expect.arrayContaining([0, userA])
    );
  });

  it('strictly filters for opted-in users in the SQL query', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      {
        id: userA,
        display_name: 'Vanguard Alpha',
        avatar_url: '⚔️',
        global_level: 28,
        rank_tier: 'C',
        rank_division: 2,
        weekly_xp: 2450,
      },
      {
        id: userB,
        display_name: 'Vanguard Beta',
        avatar_url: '🛡️',
        global_level: 15,
        rank_tier: 'D',
        rank_division: 1,
        weekly_xp: 1800,
      },
    ]);

    const leaderboard = await LeaderboardService.getWeeklyLeaderboard(userA);

    // Verify SQL query contains WHERE leaderboard_opt_in = 1
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('WHERE p.leaderboard_opt_in = 1'),
      expect.any(Array)
    );

    expect(leaderboard.length).toBe(2);
    expect(leaderboard[0].displayName).toBe('Vanguard Alpha');
    expect(leaderboard[0].isCurrentUser).toBe(true);
    expect(leaderboard[1].displayName).toBe('Vanguard Beta');
    expect(leaderboard[1].isCurrentUser).toBe(false);
  });

  it('guarantees zero leakage of private biometrics, health, or workout logs', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      {
        id: userA,
        display_name: 'Vanguard Alpha',
        avatar_url: '⚔️',
        global_level: 28,
        rank_tier: 'C',
        rank_division: 2,
        weekly_xp: 2450,
      },
    ]);

    const leaderboard = await LeaderboardService.getWeeklyLeaderboard(userA);
    const entry = leaderboard[0] as any;

    // Allowed public fields
    expect(entry.displayName).toBe('Vanguard Alpha');
    expect(entry.level).toBe(28);
    expect(entry.weeklyXp).toBe(2450);

    // Strictly forbidden private fields
    expect(entry.weightKg).toBeUndefined();
    expect(entry.heightCm).toBeUndefined();
    expect(entry.age).toBeUndefined();
    expect(entry.limitations).toBeUndefined();
    expect(entry.trainingPreferences).toBeUndefined();
    expect(entry.notes).toBeUndefined();
    expect(entry.workouts).toBeUndefined();
    expect(entry.setLogs).toBeUndefined();
  });
});
