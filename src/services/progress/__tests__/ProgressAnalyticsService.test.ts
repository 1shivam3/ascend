import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProgressAnalyticsService } from '../ProgressAnalyticsService';
import { WorkoutRepository } from '../../../database/repositories/WorkoutRepository';
import { MasteryRepository } from '../../../database/repositories/MasteryRepository';
import { HealthRepository } from '../../../database/repositories/HealthRepository';
import { ExerciseRepository } from '../../../database/repositories/ExerciseRepository';
import { ProfileRepository } from '../../../database/repositories/ProfileRepository';

// Mock database
const { mockDb } = vi.hoisted(() => {
  return {
    mockDb: {
      runAsync: vi.fn().mockResolvedValue({ changes: 1 }),
      getFirstAsync: vi.fn(),
      getAllAsync: vi.fn(),
    },
  };
});

vi.mock('../../../database/sqlite', () => ({
  getDatabase: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock('../../../database/repositories/ExerciseRepository', () => ({
  ExerciseRepository: {
    getAll: vi.fn().mockResolvedValue([
      {
        id: 'ex-squat',
        name: 'Barbell Back Squat',
        slug: 'barbell-back-squat',
        primaryMuscle: 'Quads',
        secondaryMuscles: ['Glutes'],
        equipment: 'BARBELL',
        movementPattern: 'SQUAT',
        tier: 'COMPOUND_PRIMARY',
        isCustom: false,
      },
      {
        id: 'ex-bench',
        name: 'Barbell Bench Press',
        slug: 'barbell-bench-press',
        primaryMuscle: 'Chest',
        secondaryMuscles: ['Triceps'],
        equipment: 'BARBELL',
        movementPattern: 'PUSH_HORIZONTAL',
        tier: 'COMPOUND_PRIMARY',
        isCustom: false,
      },
    ]),
  },
}));

vi.mock('../../../database/repositories/WorkoutRepository', () => ({
  WorkoutRepository: {
    getRecentWorkouts: vi.fn().mockResolvedValue([]),
    getWeeklyMonthlyStats: vi.fn().mockResolvedValue({
      weeklyCount: 3,
      monthlyCount: 12,
      weeklyVolumeKg: 18500,
      monthlyVolumeKg: 75000,
    }),
    getLifetimeStats: vi.fn().mockResolvedValue({
      totalWorkouts: 25,
      totalVolumeKg: 150000,
      totalSets: 250,
      totalReps: 2000,
      totalDurationMinutes: 1250,
    }),
    updateSetLog: vi.fn().mockResolvedValue(undefined),
    deleteSetLog: vi.fn().mockResolvedValue(undefined),
    deleteWorkout: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../../database/repositories/MasteryRepository', () => ({
  MasteryRepository: {
    recalculatePersonalRecords: vi.fn().mockResolvedValue(undefined),
    deriveMasteryFromHistory: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../database/repositories/HealthRepository', () => ({
  HealthRepository: {
    getRecords: vi.fn().mockResolvedValue([]),
    saveRecords: vi.fn().mockResolvedValue({ inserted: 1, skipped: 0 }),
  },
}));

vi.mock('../../../database/repositories/ProfileRepository', () => ({
  ProfileRepository: {
    getProfile: vi.fn().mockResolvedValue({
      id: 'test-user-1',
      weightKg: 77.5,
      attributes: {
        strength: 50,
        endurance: 45,
        mobility: 35,
        consistency: 60,
      },
    }),
    updateWeight: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('ProgressAnalyticsService — Metric Graphing, 5-Tier PRs & Record Editing', () => {
  const userId = 'test-user-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Time Range Calculation', () => {
    it('calculates start dates for relative ranges', () => {
      const start7D = new Date(ProgressAnalyticsService.getStartDateForRange('7D')).getTime();
      const start30D = new Date(ProgressAnalyticsService.getStartDateForRange('30D')).getTime();
      const now = Date.now();

      expect(now - start7D).toBeGreaterThan(6 * 24 * 3600 * 1000);
      expect(start7D).toBeGreaterThan(start30D);
    });

    it('honors custom start date if provided for CUSTOM range', () => {
      const customIso = '2026-05-01T00:00:00.000Z';
      const result = ProgressAnalyticsService.getStartDateForRange('CUSTOM', customIso);
      expect(result).toBe(customIso);
    });
  });

  describe('2. Interactive Graph Data Aggregation & Truthfulness', () => {
    it('returns empty result without invented data when zero records exist', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      const result = await ProgressAnalyticsService.getChartData(userId, {
        metric: 'ESTIMATED_1RM',
        exerciseId: 'ex-squat',
        timeRange: '30D',
      });

      expect(result.hasData).toBe(false);
      expect(result.data.length).toBe(0);
      expect(result.currentValue).toBe(0);
      expect(result.emptyReason).toContain('No workout telemetry logged');
      expect(result.isEstimatedMetric).toBe(true);
    });

    it('aggregates real submaximal sets into ESTIMATED_1RM chart points', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        {
          date_str: '2026-09-10',
          metric_val: 140,
          ex_name: 'Barbell Back Squat',
          best_wt: 120,
          best_reps: 5,
          best_rpe: 8.5,
          w_title: 'Leg Day Heavy',
        },
        {
          date_str: '2026-09-15',
          metric_val: 145.8,
          ex_name: 'Barbell Back Squat',
          best_wt: 125,
          best_reps: 5,
          best_rpe: 9.0,
          w_title: 'Leg Day Overload',
        },
      ]);

      const result = await ProgressAnalyticsService.getChartData(userId, {
        metric: 'ESTIMATED_1RM',
        exerciseId: 'ex-squat',
        timeRange: '30D',
      });

      expect(result.hasData).toBe(true);
      expect(result.data.length).toBe(2);
      expect(result.currentValue).toBe(145.8);
      expect(result.delta).toBe(5.8);
      expect(result.unit).toBe('kg');
      expect(result.isEstimatedMetric).toBe(true);
      expect(result.data[0].isEstimated).toBe(true);
      expect(result.data[0].details).toContain('120 kg × 5 reps');
    });

    it('identifies DIRECTLY RECORDED metric for weight and repetitions', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        {
          date_str: '2026-09-12',
          metric_val: 100,
          ex_name: 'Barbell Bench Press',
          best_wt: 100,
          best_reps: 3,
          best_rpe: 9.0,
          w_title: 'Push Power',
        },
      ]);

      const result = await ProgressAnalyticsService.getChartData(userId, {
        metric: 'WEIGHT',
        exerciseId: 'ex-bench',
        timeRange: '7D',
      });

      expect(result.isEstimatedMetric).toBe(false);
      expect(result.unit).toBe('kg');
      expect(result.data[0].isEstimated).toBe(false);
    });

    it('queries scale bodyweight and falls back to baseline profile weight if no scale records exist', async () => {
      // HealthRepository returns empty
      vi.mocked(HealthRepository.getRecords).mockResolvedValueOnce([]);

      const result = await ProgressAnalyticsService.getChartData(userId, {
        metric: 'BODY_WEIGHT',
        timeRange: '30D',
      });

      expect(result.hasData).toBe(true);
      expect(result.currentValue).toBe(77.5);
      expect(result.data[0].details).toContain('Baseline Profile Weight');
      expect(result.isEstimatedMetric).toBe(false);
    });

    it('queries workout frequency sessions count per day/week', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { date_str: '2026-09-14', session_count: 1 },
        { date_str: '2026-09-16', session_count: 1 },
        { date_str: '2026-09-18', session_count: 1 },
      ]);

      const result = await ProgressAnalyticsService.getChartData(userId, {
        metric: 'WORKOUT_FREQUENCY',
        timeRange: '7D',
      });

      expect(result.hasData).toBe(true);
      expect(result.unit).toBe('sessions');
      expect(result.data.length).toBe(3);
      expect(result.isEstimatedMetric).toBe(false);
    });
  });

  describe('3. 5-Tier Categorized Personal Records Separation', () => {
    it('accurately classifies sets into Tested 1RM, Estimated 1RM, Best Working Set, Rep PR, and Volume PR', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        // Set 1: Tested 1RM (1 rep at RPE 9.5)
        {
          id: 'set-1',
          exercise_id: 'ex-bench',
          weight_kg: 130,
          reps: 1,
          rpe: 9.5,
          estimated_1rm_kg: 130,
          completed_at: '2026-09-18T10:00:00Z',
        },
        // Set 2: Heavy multi-rep working set (100kg x 6 = e1RM 120kg, vol 600kg)
        {
          id: 'set-2',
          exercise_id: 'ex-bench',
          weight_kg: 100,
          reps: 6,
          rpe: 8.0,
          estimated_1rm_kg: 120,
          completed_at: '2026-09-15T10:00:00Z',
        },
        // Set 3: High repetition set (60kg x 20 reps = vol 1200kg)
        {
          id: 'set-3',
          exercise_id: 'ex-bench',
          weight_kg: 60,
          reps: 20,
          rpe: 8.5,
          estimated_1rm_kg: 0, // disqualified from e1RM due to reps > 10
          completed_at: '2026-09-10T10:00:00Z',
        },
      ]);

      const prs = await ProgressAnalyticsService.getCategorizedPersonalRecords(userId);

      // 1. Tested 1RM
      expect(prs.tested1Rm.length).toBe(1);
      expect(prs.tested1Rm[0].value).toBe(130);
      expect(prs.tested1Rm[0].category).toBe('TESTED_1RM');
      expect(prs.tested1Rm[0].isDirectlyRecorded).toBe(true);

      // 2. Estimated 1RM (must come from reps <= 10)
      expect(prs.estimated1Rm.length).toBe(1);
      expect(prs.estimated1Rm[0].value).toBe(130);
      expect(prs.estimated1Rm[0].category).toBe('ESTIMATED_1RM');

      // 3. Best Working Set (reps >= 2 with highest load)
      expect(prs.bestWorkingSet.length).toBe(1);
      expect(prs.bestWorkingSet[0].value).toBe(60); // 60kg x 20 reps = 1200 vol
      expect(prs.bestWorkingSet[0].category).toBe('BEST_WORKING_SET');

      // 4. Repetition PR (highest reps)
      expect(prs.repetitionPr.length).toBe(1);
      expect(prs.repetitionPr[0].value).toBe(20);
      expect(prs.repetitionPr[0].unit).toBe('reps');

      // 5. Volume PR (highest set volume)
      expect(prs.volumePr.length).toBe(1);
      expect(prs.volumePr[0].value).toBe(1200); // 60 * 20
    });
  });

  describe('4. Record Editing & Duplicate Removal with Cascading Recalculation', () => {
    it('updates an erroneous set record and triggers recalculation of PRs and mastery', async () => {
      await ProgressAnalyticsService.updateSetRecord(userId, 'set-typo-1', {
        weightKg: 100,
        reps: 5,
        rpe: 8.0,
      });

      expect(WorkoutRepository.updateSetLog).toHaveBeenCalledWith('set-typo-1', {
        weightKg: 100,
        reps: 5,
        rpe: 8.0,
      });
      expect(MasteryRepository.recalculatePersonalRecords).toHaveBeenCalledWith(userId);
      expect(MasteryRepository.deriveMasteryFromHistory).toHaveBeenCalledWith(userId);
    });

    it('deletes a duplicate set record and recalculates records cleanly', async () => {
      await ProgressAnalyticsService.deleteSetRecord(userId, 'set-dup-1');

      expect(WorkoutRepository.deleteSetLog).toHaveBeenCalledWith('set-dup-1');
      expect(MasteryRepository.recalculatePersonalRecords).toHaveBeenCalledWith(userId);
      expect(MasteryRepository.deriveMasteryFromHistory).toHaveBeenCalledWith(userId);
    });

    it('deletes a duplicate or accidental workout session and cascades recalculation', async () => {
      await ProgressAnalyticsService.deleteWorkoutSession(userId, 'workout-dup-1');

      expect(WorkoutRepository.deleteWorkout).toHaveBeenCalledWith('workout-dup-1');
      expect(MasteryRepository.recalculatePersonalRecords).toHaveBeenCalledWith(userId);
      expect(MasteryRepository.deriveMasteryFromHistory).toHaveBeenCalledWith(userId);
    });
  });

  describe('5. Bodyweight Tracking, Endurance & Mobility Metrics', () => {
    it('logs scale bodyweight and updates profile weightKg', async () => {
      await ProgressAnalyticsService.logBodyweight(userId, 76.8);

      expect(HealthRepository.saveRecords).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            userId,
            recordType: 'WEIGHT',
            value: 76.8,
            unit: 'kg',
          }),
        ])
      );
      expect(ProfileRepository.updateWeight).toHaveBeenCalledWith(userId, 76.8);
    });

    it('calculates endurance density and tonnage tolerance', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({
        total_reps: 450,
        total_duration_sec: 1800, // 30 mins -> 15 reps/min
        total_vol: 24500,
        high_rep_sets: 8,
        max_distance: 5000,
      });

      const metrics = await ProgressAnalyticsService.getEnduranceMetrics(userId);
      expect(metrics.sessionDensityRepsPerMin).toBe(15);
      expect(metrics.weeklyTonnageKg).toBe(24500);
      expect(metrics.highRepSetsCount).toBe(8);
      expect(metrics.bestDistanceMeters).toBe(5000);
    });

    it('calculates mobility metrics from completed warmup and recovery sessions', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({
        warmup_count: 14,
        unilateral_count: 8,
        mobility_workouts: 3,
      });

      const metrics = await ProgressAnalyticsService.getMobilityMetrics(userId);
      expect(metrics.mobilityScore).toBe(35); // from mock profile
      expect(metrics.warmupSetsCount).toBe(14);
      expect(metrics.unilateralSetsCount).toBe(8);
      expect(metrics.mobilityWorkoutsCount).toBe(3);
    });
  });
});
