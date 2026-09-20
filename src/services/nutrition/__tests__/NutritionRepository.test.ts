import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NutritionRepository, NutritionEntry } from '../../../database/repositories/NutritionRepository';

// Mock sqlite database with vi.hoisted
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

describe('Nutrition & Biometrics Repository', () => {
  const userId = 'user-diet-1';
  const testDate = '2026-09-19';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs daily nutrition with macros, water, and bodyweight', async () => {
    const entry: NutritionEntry = {
      userId,
      date: testDate,
      calories: 2650,
      proteinG: 185.5,
      carbsG: 280.0,
      fatG: 75.2,
      waterMl: 3200,
      bodyweightKg: 79.4,
      notes: 'High carb replenishment day',
    };

    await NutritionRepository.logDailyNutrition(entry);

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO nutrition_logs'),
      expect.arrayContaining([
        `nutr-${userId}-${testDate}`,
        userId,
        testDate,
        2650,
        185.5,
        280.0,
        75.2,
        3200,
        79.4,
        'High carb replenishment day',
      ])
    );

    // Verifies bodyweight updates profile table
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE profiles SET weight_kg = ?'),
      expect.arrayContaining([79.4, userId])
    );

    // Verifies nutrition log is enqueued to local_sync_queue
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO local_sync_queue'),
      expect.arrayContaining([
        `nutr:${userId}:${testDate}`,
        'nutrition_log',
        `nutr-${userId}-${testDate}`,
        'UPDATE',
      ])
    );
  });

  it('retrieves daily nutrition record for a specific date', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({
      id: `nutr-${userId}-${testDate}`,
      user_id: userId,
      date: testDate,
      calories: 2400,
      protein_g: 170.0,
      carbs_g: 220.0,
      fat_g: 65.0,
      water_ml: 2800,
      bodyweight_kg: 78.8,
      notes: 'Recovery day intake',
      created_at: '2026-09-19T08:00:00.000Z',
      updated_at: '2026-09-19T08:00:00.000Z',
    });

    const result = await NutritionRepository.getDailyNutrition(userId, testDate);

    expect(result).not.toBeNull();
    expect(result?.calories).toBe(2400);
    expect(result?.proteinG).toBe(170.0);
    expect(result?.bodyweightKg).toBe(78.8);
    expect(result?.notes).toBe('Recovery day intake');
  });

  it('computes average intake over the last N days', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({
      avg_cal: 2520,
      avg_pro: 178.4,
      avg_water: 3100,
    });

    const averages = await NutritionRepository.getAverageIntake(userId, 7);

    expect(averages.avgCalories).toBe(2520);
    expect(averages.avgProtein).toBe(178.4);
    expect(averages.avgWater).toBe(3100);
  });
});
