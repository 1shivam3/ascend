import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MilestoneRepository } from '../../../database/repositories/MilestoneRepository';
import { ExerciseMastery } from '../../../types/domain.types';

// Mock sqlite
const mockRunAsync = vi.fn();
const mockGetAllAsync = vi.fn();
const mockGetFirstAsync = vi.fn();

vi.mock('../../../database/sqlite', () => ({
  getDatabase: vi.fn().mockResolvedValue({
    runAsync: (...args: any[]) => mockRunAsync(...args),
    getAllAsync: (...args: any[]) => mockGetAllAsync(...args),
    getFirstAsync: (...args: any[]) => mockGetFirstAsync(...args),
  }),
}));

vi.mock('../../../database/repositories/SyncQueueRepository', () => ({
  SyncQueueRepository: {
    enqueue: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('Milestone Repository & Evaluation', () => {
  const userId = 'u-lifter-1';
  const exerciseId = 'ex-barbell-back-squat';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retrieves default exercise milestones when table has not been populated', async () => {
    mockGetAllAsync.mockResolvedValueOnce([]); // no custom milestones in SQLite table
    const milestones = await MilestoneRepository.getMilestonesForExercise(exerciseId);

    expect(milestones.length).toBeGreaterThan(0);
    const ms100 = milestones.find(m => m.threshold === 100);
    expect(ms100).toBeDefined();
    expect(ms100?.rewardXp).toBe(500);
    expect(ms100?.title).toContain('100kg');
  });

  it('unlocks milestones when athlete achieves threshold', async () => {
    // No unlocked milestones initially
    mockGetAllAsync
      .mockResolvedValueOnce([]) // getMilestonesForExercise fallback to defaults
      .mockResolvedValueOnce([]); // getUserUnlockedMilestones: empty set

    // Run insert returns changes: 1
    mockRunAsync.mockResolvedValue({ changes: 1 });

    const mastery: ExerciseMastery = {
      id: `em-${userId}-${exerciseId}`,
      userId,
      exerciseId,
      masteryLevel: 15,
      masteryXp: 3500,
      rank: 'D',
      estimated1RmKg: 105, // Exceeds 40, 50, 60, 70, 80, 90, 100 kg milestones!
      bestWeightKg: 95,
      bestReps: 5,
      bestVolumeKg: 475,
      relativeStrength: 1.5,
      totalSessions: 10,
      totalSets: 30,
      totalReps: 150,
      totalVolumeKg: 12000,
      recentPerformance: [],
      lastTrainedAt: new Date().toISOString(),
    };

    const result = await MilestoneRepository.evaluateMilestones(userId, exerciseId, mastery);

    expect(result.unlockedMilestones.length).toBeGreaterThanOrEqual(5);
    const titles = result.unlockedMilestones.map(m => m.title);
    expect(titles).toContain('Squat 40kg');
    expect(titles).toContain('Squat 60kg');
    expect(titles).toContain('Squat 100kg Club');
    expect(result.totalXpAwarded).toBeGreaterThan(1000);
  });

  it('guarantees idempotency — does not re-unlock or award XP for already unlocked milestones', async () => {
    // Simulate user already unlocked 40kg and 50kg milestones
    mockGetAllAsync
      .mockResolvedValueOnce([]) // default milestones
      .mockResolvedValueOnce([
        {
          id: 'uem-1',
          user_id: userId,
          milestone_id: 'ms-squat-40',
          exercise_id: exerciseId,
          unlocked_at: new Date().toISOString(),
          xp_awarded: 100,
        },
        {
          id: 'uem-2',
          user_id: userId,
          milestone_id: 'ms-squat-50',
          exercise_id: exerciseId,
          unlocked_at: new Date().toISOString(),
          xp_awarded: 150,
        },
      ]);

    // Subsequent unlock calls
    mockRunAsync.mockResolvedValue({ changes: 1 });

    const mastery: ExerciseMastery = {
      id: `em-${userId}-${exerciseId}`,
      userId,
      exerciseId,
      masteryLevel: 5,
      masteryXp: 800,
      rank: 'E',
      estimated1RmKg: 65, // Exceeds 40, 50, and 60
      bestWeightKg: 60,
      bestReps: 3,
      bestVolumeKg: 180,
      relativeStrength: 0.9,
      totalSessions: 3,
      totalSets: 9,
      totalReps: 45,
      totalVolumeKg: 2500,
      recentPerformance: [],
      lastTrainedAt: new Date().toISOString(),
    };

    const result = await MilestoneRepository.evaluateMilestones(userId, exerciseId, mastery);

    // Only 60kg milestone should be unlocked
    const unlockedIds = result.unlockedMilestones.map(m => m.id);
    expect(unlockedIds).toEqual(['ms-squat-60']);
    expect(result.totalXpAwarded).toBe(200);
  });
});
