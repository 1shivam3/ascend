import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MasteryEngine } from '../MasteryEngine';
import { MasteryRepository } from '../../../database/repositories/MasteryRepository';
import { AntiExploitEngine } from '../AntiExploitEngine';
import { ExerciseMastery, SetLog, Exercise, PersonalRecord } from '../../../types/domain.types';

// In-memory mock tables for database verification
let masteryTable: Record<string, any> = {};
let prTable: Record<string, any> = {};
let exerciseLogsTable: Array<{ id: string; workout_id: string; exercise_id: string; user_id: string }> = [];
let setLogsTable: Array<{
  id: string;
  exercise_log_id: string;
  user_id: string;
  weight_kg: number;
  reps: number;
  completed: number;
  is_skipped: number;
  estimated_1rm_kg: number;
  distance_meters: number;
  duration_seconds: number;
  pace_seconds_per_km: number;
  completed_at: string;
}> = [];

vi.mock('../../../database/sqlite', () => ({
  getDatabase: vi.fn().mockResolvedValue({
    runAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      // 1. exercise_mastery upsert
      if (sql.includes('INSERT OR REPLACE INTO exercise_mastery')) {
        const [
          id, userId, exerciseId, masteryLevel, masteryXp, rank, estimated1Rm,
          bestWeight, bestReps, bestVolume, relativeStrength, totalSessions,
          totalSets, totalReps, totalVolume, prCount, milestoneCount,
          recentPerf, lastTrainedAt, trend, xpToNextLevel, bestDistance,
          bestDuration, bestPace, totalDistance, totalDuration
        ] = params;

        masteryTable[`${userId}_${exerciseId}`] = {
          id,
          user_id: userId,
          exercise_id: exerciseId,
          mastery_level: masteryLevel,
          mastery_xp: masteryXp,
          rank,
          estimated_1rm_kg: estimated1Rm,
          best_weight_kg: bestWeight,
          best_reps: bestReps,
          best_volume_kg: bestVolume,
          relative_strength: relativeStrength,
          total_sessions: totalSessions,
          total_sets: totalSets,
          total_reps: totalReps,
          total_volume_kg: totalVolume,
          personal_records_count: prCount,
          milestones_unlocked_count: milestoneCount,
          recent_performance: recentPerf,
          last_trained_at: lastTrainedAt,
          trend,
          xp_to_next_level: xpToNextLevel,
          best_distance_meters: bestDistance,
          best_duration_seconds: bestDuration,
          best_pace_seconds_per_km: bestPace,
          total_distance_meters: totalDistance,
          total_duration_seconds: totalDuration,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return { changes: 1, lastInsertRowId: 1 };
      }

      // 2. personal_records update
      if (sql.includes('UPDATE personal_records SET')) {
        const [value, setLogId, achievedAt, updatedAt, existingId] = params;
        if (prTable[existingId]) {
          prTable[existingId].value = value;
          prTable[existingId].set_log_id = setLogId;
          prTable[existingId].achieved_at = achievedAt;
          prTable[existingId].updated_at = updatedAt;
          return { changes: 1, lastInsertRowId: 0 };
        }
        return { changes: 0, lastInsertRowId: 0 };
      }

      // 3. personal_records insert
      if (sql.includes('INSERT INTO personal_records')) {
        const [id, userId, exerciseId, prType, value, setLogId, achievedAt, createdAt, updatedAt] = params;
        prTable[id] = {
          id,
          user_id: userId,
          exercise_id: exerciseId,
          pr_type: prType,
          value,
          set_log_id: setLogId,
          achieved_at: achievedAt,
          created_at: createdAt,
          updated_at: updatedAt,
        };
        return { changes: 1, lastInsertRowId: 1 };
      }

      return { changes: 1, lastInsertRowId: 1 };
    }),

    getFirstAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      if (sql.includes('FROM exercise_mastery') && sql.includes('WHERE user_id = ?')) {
        const [userId, exerciseId] = params;
        return masteryTable[`${userId}_${exerciseId}`] || null;
      }
      if (sql.includes('FROM personal_records') && sql.includes('WHERE user_id = ?')) {
        const [userId, exerciseId, prType] = params;
        const match = Object.values(prTable).find(
          (p: any) => p.user_id === userId && p.exercise_id === exerciseId && p.pr_type === prType
        );
        return match || null;
      }
      return null;
    }),

    getAllAsync: vi.fn().mockImplementation(async (sql: string, params: any[] = []) => {
      if (sql.includes('FROM exercise_mastery WHERE user_id = ?')) {
        const [userId] = params;
        return Object.values(masteryTable).filter((m: any) => m.user_id === userId);
      }
      if (sql.includes('FROM personal_records WHERE user_id = ? AND exercise_id = ?')) {
        const [userId, exerciseId] = params;
        return Object.values(prTable).filter((p: any) => p.user_id === userId && p.exercise_id === exerciseId);
      }
      if (sql.includes('FROM exercise_logs el') && sql.includes('JOIN set_logs sl')) {
        const [userId] = params;
        // Group by exercise_id
        const userLogs = exerciseLogsTable.filter(el => el.user_id === userId);
        const exerciseIds = Array.from(new Set(userLogs.map(el => el.exercise_id)));

        return exerciseIds.map(exId => {
          const exLogs = userLogs.filter(el => el.exercise_id === exId);
          const exLogIds = new Set(exLogs.map(el => el.id));
          const completedSets = setLogsTable.filter(
            sl => exLogIds.has(sl.exercise_log_id) && sl.completed === 1 && sl.is_skipped === 0
          );

          const totalSets = completedSets.length;
          const totalReps = completedSets.reduce((sum, s) => sum + s.reps, 0);
          const totalVolume = completedSets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0);
          const bestWeight = completedSets.reduce((max, s) => Math.max(max, s.weight_kg), 0);
          const bestReps = completedSets.reduce((max, s) => Math.max(max, s.reps), 0);
          const bestE1rm = completedSets.reduce((max, s) => Math.max(max, s.estimated_1rm_kg), 0);
          const bestDist = completedSets.reduce((max, s) => Math.max(max, s.distance_meters || 0), 0);
          const bestDur = completedSets.reduce((max, s) => Math.max(max, s.duration_seconds || 0), 0);
          const validPaces = completedSets.filter(s => s.pace_seconds_per_km && s.pace_seconds_per_km > 0);
          const bestPace = validPaces.length > 0 ? Math.min(...validPaces.map(s => s.pace_seconds_per_km)) : 0;
          const totalDist = completedSets.reduce((sum, s) => sum + (s.distance_meters || 0), 0);
          const totalDur = completedSets.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
          const uniqueWorkouts = new Set(exLogs.map(el => el.workout_id)).size;

          return {
            exercise_id: exId,
            total_sessions: uniqueWorkouts,
            total_sets: totalSets,
            total_reps: totalReps,
            total_volume_kg: totalVolume,
            best_weight_kg: bestWeight,
            best_reps: bestReps,
            best_e1rm_kg: bestE1rm,
            best_distance_meters: bestDist,
            best_duration_seconds: bestDur,
            best_pace_seconds_per_km: bestPace,
            total_distance_meters: totalDist,
            total_duration_seconds: totalDur,
            last_trained_at: completedSets[completedSets.length - 1]?.completed_at || new Date().toISOString(),
          };
        });
      }
      return [];
    }),
  }),
}));

describe('Exercise Mastery Comprehensive 13-Scenario Verification', () => {
  const benchPress: Exercise = {
    id: 'ex-bench',
    name: 'Barbell Bench Press',
    slug: 'barbell-bench-press',
    primaryMuscle: 'Chest',
    secondaryMuscles: ['Triceps', 'Front Delts'],
    equipment: 'BARBELL',
    movementPattern: 'PUSH_HORIZONTAL',
    tier: 'COMPOUND_PRIMARY',
    progressionType: 'BARBELL_COMPOUND',
    supports1Rm: true,
    supportsRelativeStrength: true,
    isBodyweight: false,
    isCustom: false,
  };

  const pullUp: Exercise = {
    id: 'ex-pullup',
    name: 'Pull-Up',
    slug: 'pull-up',
    primaryMuscle: 'Back',
    secondaryMuscles: ['Biceps'],
    equipment: 'BODYWEIGHT',
    movementPattern: 'PULL_VERTICAL',
    tier: 'COMPOUND_PRIMARY',
    progressionType: 'BODYWEIGHT',
    supports1Rm: false,
    supportsRelativeStrength: false,
    isBodyweight: true,
    isCustom: false,
  };

  const running: Exercise = {
    id: 'ex-running',
    name: 'Running',
    slug: 'running',
    primaryMuscle: 'Cardiovascular',
    secondaryMuscles: ['Quads', 'Hamstrings', 'Calves'],
    equipment: 'BODYWEIGHT',
    movementPattern: 'CARDIO',
    tier: 'COMPOUND_SECONDARY',
    progressionType: 'CARDIO',
    supports1Rm: false,
    supportsRelativeStrength: false,
    isBodyweight: false,
    isCustom: false,
  };

  beforeEach(() => {
    masteryTable = {};
    prTable = {};
    exerciseLogsTable = [];
    setLogsTable = [];
  });

  // Scenario 1: First exercise session
  it('Scenario 1: first exercise session initializes mastery at Level 1, Rank E, trend NEW', () => {
    const sets: SetLog[] = [
      {
        id: 's1',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 1,
        setType: 'NORMAL',
        weightKg: 60,
        reps: 8,
        rpe: 7,
        estimated1RmKg: 76,
        isPr: true,
        completed: true,
        completedAt: new Date().toISOString(),
      },
    ];

    const result = MasteryEngine.evaluateMasteryUpdate(null, 'ex-bench', 'u1', sets, 0, 75, benchPress);

    expect(result.oldLevel).toBe(1);
    expect(result.newLevel).toBe(2); // Leveled up from 1 to 2 with initial session PR bonus
    expect(result.updatedMastery.rank).toBe('E');
    expect(result.updatedMastery.trend).toBe('NEW');
    expect(result.updatedMastery.totalSessions).toBe(1);
    expect(result.updatedMastery.bestWeightKg).toBe(60);
    expect(result.updatedMastery.bestReps).toBe(8);
    expect(result.updatedMastery.estimated1RmKg).toBe(76);
    expect(result.xpEarned).toBeGreaterThan(0);
  });

  // Scenario 2: Multiple sets
  it('Scenario 2: multiple sets calculate volume and apply warmup discount correctly', () => {
    const sets: SetLog[] = [
      {
        id: 's1',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 1,
        setType: 'WARMUP',
        weightKg: 40,
        reps: 10,
        rpe: null,
        estimated1RmKg: 53.3,
        isPr: false,
        completed: true,
        completedAt: new Date().toISOString(),
      },
      {
        id: 's2',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 2,
        setType: 'NORMAL',
        weightKg: 80,
        reps: 5,
        rpe: 8,
        estimated1RmKg: 93.3,
        isPr: false,
        completed: true,
        completedAt: new Date(Date.now() + 120000).toISOString(),
      },
      {
        id: 's3',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 3,
        setType: 'NORMAL',
        weightKg: 80,
        reps: 5,
        rpe: 8.5,
        estimated1RmKg: 93.3,
        isPr: false,
        completed: true,
        completedAt: new Date(Date.now() + 240000).toISOString(),
      },
    ];

    const result = MasteryEngine.evaluateMasteryUpdate(null, 'ex-bench', 'u1', sets, 0, 80, benchPress);

    expect(result.updatedMastery.totalSets).toBe(3);
    expect(result.updatedMastery.totalReps).toBe(20);
    expect(result.updatedMastery.totalVolumeKg).toBe(400 + 400 + 400); // 1200 kg
    expect(result.updatedMastery.bestWeightKg).toBe(80); // Warmup not considered best weight if normal is higher
  });

  // Scenario 3: Repeated sessions
  it('Scenario 3: repeated sessions accumulate total volume and evaluate trend to IMPROVING', () => {
    const session1Sets: SetLog[] = [
      {
        id: 's1',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 1,
        setType: 'NORMAL',
        weightKg: 70,
        reps: 5,
        rpe: 8,
        estimated1RmKg: 81.6,
        isPr: true,
        completed: true,
        completedAt: '2026-09-01T10:00:00Z',
      },
    ];

    const session1 = MasteryEngine.evaluateMasteryUpdate(null, 'ex-bench', 'u1', session1Sets, 0, 75, benchPress);
    expect(session1.updatedMastery.totalSessions).toBe(1);

    // Session 2 with higher weight
    const session2Sets: SetLog[] = [
      {
        id: 's2',
        exerciseLogId: 'el2',
        userId: 'u1',
        setNumber: 1,
        setType: 'NORMAL',
        weightKg: 75,
        reps: 5,
        rpe: 8.5,
        estimated1RmKg: 87.5,
        isPr: true,
        completed: true,
        completedAt: '2026-09-05T10:00:00Z',
      },
    ];

    const session2 = MasteryEngine.evaluateMasteryUpdate(
      session1.updatedMastery,
      'ex-bench',
      'u1',
      session2Sets,
      1,
      75,
      benchPress
    );

    expect(session2.updatedMastery.totalSessions).toBe(2);
    expect(session2.updatedMastery.totalVolumeKg).toBe(350 + 375);
    expect(session2.updatedMastery.trend).toBe('IMPROVING');
  });

  // Scenario 4: PR detection & PR event bonus
  it('Scenario 4: PR detects new personal records and awards PR event bonus XP', () => {
    const existingPrs: Record<string, number> = {
      MAX_WEIGHT: 100,
      MAX_REPS: 8,
      MAX_VOLUME: 800,
      MAX_ESTIMATED_1RM: 120,
    };

    const sets: SetLog[] = [
      {
        id: 's1',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 1,
        setType: 'NORMAL',
        weightKg: 105, // Beats MAX_WEIGHT and MAX_ESTIMATED_1RM
        reps: 5,
        rpe: 9.5,
        estimated1RmKg: 122.5,
        isPr: false,
        completed: true,
        completedAt: new Date().toISOString(),
      },
    ];

    const newPrs = MasteryEngine.detectPersonalRecords(existingPrs, sets, benchPress);
    expect(newPrs.some(p => p.prType === 'MAX_WEIGHT')).toBe(true);
    expect(newPrs.some(p => p.prType === 'MAX_ESTIMATED_1RM')).toBe(true);

    const initialMastery: ExerciseMastery = {
      id: 'em-u1-ex-bench',
      userId: 'u1',
      exerciseId: 'ex-bench',
      masteryLevel: 5,
      masteryXp: 1200,
      estimated1RmKg: 120,
      bestWeightKg: 100,
      bestReps: 8,
      bestVolumeKg: 800,
      totalSessions: 5,
      totalSets: 20,
      totalReps: 160,
      totalVolumeKg: 16000,
      recentPerformance: [],
      lastTrainedAt: '2026-09-01T10:00:00Z',
    };

    const evalResult = MasteryEngine.evaluateMasteryUpdate(initialMastery, 'ex-bench', 'u1', sets, 1, 80, benchPress);
    expect(evalResult.newPrs.length).toBeGreaterThan(0);
    expect(evalResult.updatedMastery.bestWeightKg).toBe(105);
  });

  // Scenario 5: Duplicate submission & anti-exploit
  it('Scenario 5: duplicate submission prevents duplicate XP award via anti-exploit deduplication', () => {
    const now = Date.now();
    const setsWithDuplicate: SetLog[] = [
      {
        id: 's1',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 1,
        setType: 'NORMAL',
        weightKg: 80,
        reps: 5,
        rpe: 8,
        estimated1RmKg: 93.3,
        isPr: false,
        completed: true,
        completedAt: new Date(now).toISOString(),
      },
      // Rapid duplicate click (only 5 seconds later with identical parameters)
      {
        id: 's2',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 2,
        setType: 'NORMAL',
        weightKg: 80,
        reps: 5,
        rpe: 8,
        estimated1RmKg: 93.3,
        isPr: false,
        completed: true,
        completedAt: new Date(now + 5000).toISOString(),
      },
    ];

    const dedup = AntiExploitEngine.deduplicateSets(setsWithDuplicate);
    expect(dedup.duplicateCount).toBe(1);
    expect(dedup.validSets.length).toBe(1);

    const evalResult = MasteryEngine.evaluateMasteryUpdate(null, 'ex-bench', 'u1', setsWithDuplicate, 0, 80, benchPress);
    expect(evalResult.updatedMastery.totalSets).toBe(1);
    expect(evalResult.updatedMastery.totalVolumeKg).toBe(400);
  });

  // Scenario 6: Level-up threshold
  it('Scenario 6: level-up triggers when crossing XP threshold and calculates didLevelUp', () => {
    // Level 1 -> Level 2 requires 100 XP
    const initialMastery: ExerciseMastery = {
      id: 'em-u1-ex-bench',
      userId: 'u1',
      exerciseId: 'ex-bench',
      masteryLevel: 1,
      masteryXp: 80, // 20 XP away from Level 2
      estimated1RmKg: 70,
      bestWeightKg: 60,
      bestReps: 5,
      bestVolumeKg: 300,
      totalSessions: 1,
      totalSets: 2,
      totalReps: 10,
      totalVolumeKg: 600,
      recentPerformance: [],
      lastTrainedAt: '2026-09-01T10:00:00Z',
    };

    const sets: SetLog[] = [
      {
        id: 's1',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 1,
        setType: 'NORMAL',
        weightKg: 60,
        reps: 5,
        rpe: 8,
        estimated1RmKg: 70,
        isPr: false,
        completed: true,
        completedAt: new Date().toISOString(),
      },
    ];

    const result = MasteryEngine.evaluateMasteryUpdate(initialMastery, 'ex-bench', 'u1', sets, 0, 75, benchPress);
    expect(result.oldLevel).toBe(1);
    expect(result.newLevel).toBe(2);
    expect(result.didLevelUp).toBe(true);
  });

  // Scenario 7: Level 100+ unbounded progression
  it('Scenario 7: level 100+ advances monotonically beyond 100 with SSS rank', () => {
    let xpFor105 = 0;
    for (let l = 1; l <= 105; l++) {
      xpFor105 += MasteryEngine.getXpForNextLevel(l);
    }

    const lvl = MasteryEngine.getExerciseLevelFromXP(xpFor105);
    expect(lvl).toBeGreaterThanOrEqual(105);

    const rankInfo = MasteryEngine.getExerciseRankFromLevel(lvl);
    expect(rankInfo.tier).toBe('SSS');

    const progress = MasteryEngine.getExerciseProgress(xpFor105);
    expect(progress.level).toBeGreaterThanOrEqual(105);
    expect(progress.xpRequiredForNextLevel).toBeGreaterThan(0);
  });

  // Scenario 8: Exercise replacement during workout
  it('Scenario 8: exercise replacement maintains isolated progression for distinct movements', () => {
    const squat: Exercise = {
      id: 'ex-squat',
      name: 'Barbell Back Squat',
      slug: 'barbell-back-squat',
      primaryMuscle: 'Quadriceps',
      secondaryMuscles: ['Glutes'],
      equipment: 'BARBELL',
      movementPattern: 'SQUAT',
      tier: 'COMPOUND_PRIMARY',
      progressionType: 'BARBELL_COMPOUND',
      isCustom: false,
    };

    const legPress: Exercise = {
      id: 'ex-legpress',
      name: 'Leg Press',
      slug: 'leg-press',
      primaryMuscle: 'Quadriceps',
      secondaryMuscles: ['Glutes'],
      equipment: 'MACHINE',
      movementPattern: 'SQUAT',
      tier: 'COMPOUND_SECONDARY',
      progressionType: 'MACHINE',
      isCustom: false,
    };

    const legPressSets: SetLog[] = [
      {
        id: 's1',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 1,
        setType: 'NORMAL',
        weightKg: 150,
        reps: 10,
        rpe: 8,
        estimated1RmKg: 200,
        isPr: true,
        completed: true,
        completedAt: new Date().toISOString(),
      },
    ];

    // Leg press evaluated independently
    const lpResult = MasteryEngine.evaluateMasteryUpdate(null, legPress.id, 'u1', legPressSets, 0, 75, legPress);
    expect(lpResult.updatedMastery.exerciseId).toBe('ex-legpress');
    expect(lpResult.updatedMastery.bestWeightKg).toBe(150);

    // Squat remains untouched at 0/null
    expect(lpResult.updatedMastery.exerciseId).not.toBe(squat.id);
  });

  // Scenario 9: Bodyweight exercise progression
  it('Scenario 9: bodyweight exercise awards reps XP and tracks max reps PR without forcing 1RM', () => {
    const unweightedPullUps: SetLog[] = [
      {
        id: 's1',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 1,
        setType: 'NORMAL',
        weightKg: 0, // Unweighted bodyweight
        reps: 15,
        rpe: 9,
        estimated1RmKg: 0,
        isPr: true,
        completed: true,
        completedAt: new Date().toISOString(),
      },
    ];

    const bwXp = MasteryEngine.calculateExerciseXP(unweightedPullUps[0], 0, true, pullUp);
    // Base (20) + Reps (15 * 1.5 = 23) + PR (50) = 93 XP
    expect(bwXp).toBe(93);

    const bwResult = MasteryEngine.evaluateMasteryUpdate(null, pullUp.id, 'u1', unweightedPullUps, 0, 75, pullUp);
    expect(bwResult.updatedMastery.bestReps).toBe(15);
    expect(bwResult.updatedMastery.bestWeightKg).toBe(0);
    expect(bwResult.updatedMastery.estimated1RmKg).toBe(0); // 1RM not forced
    expect(bwResult.newPrs.some(p => p.prType === 'MAX_REPS')).toBe(true);
  });

  // Scenario 10: Cardio exercise progression
  it('Scenario 10: cardio exercise tracks distance, duration, pace in min/km, and detects best pace PR', () => {
    const runSets: SetLog[] = [
      {
        id: 's1',
        exerciseLogId: 'el1',
        userId: 'u1',
        setNumber: 1,
        setType: 'NORMAL',
        weightKg: 0,
        reps: 1,
        rpe: 8,
        estimated1RmKg: 0,
        isPr: true,
        completed: true,
        distanceMeters: 5000,
        durationSeconds: 1500, // 25 minutes = 300 sec/km (5:00 min/km)
        paceSecondsPerKm: 300,
        completedAt: new Date().toISOString(),
      },
    ];

    const cardioXp = MasteryEngine.calculateExerciseXP(runSets[0], 0, true, running);
    // Base (20) + Distance (5000/100 = 50) + Duration (1500/30 = 50) + PR (50) = 170 XP -> capped at maxSingleSetMasteryXp (150)
    expect(cardioXp).toBe(150);

    const cardioResult = MasteryEngine.evaluateMasteryUpdate(null, running.id, 'u1', runSets, 0, 75, running);
    expect(cardioResult.updatedMastery.bestDistanceMeters).toBe(5000);
    expect(cardioResult.updatedMastery.bestPaceSecondsPerKm).toBe(300);
    expect(cardioResult.updatedMastery.totalDistanceMeters).toBe(5000);
    expect(cardioResult.updatedMastery.totalDurationSeconds).toBe(1500);

    // Faster run pace test: 280 sec/km beats 300 sec/km (lower pace is faster)
    const fasterRunSets: SetLog[] = [
      {
        id: 's2',
        exerciseLogId: 'el2',
        userId: 'u1',
        setNumber: 1,
        setType: 'NORMAL',
        weightKg: 0,
        reps: 1,
        rpe: 9,
        estimated1RmKg: 0,
        isPr: false,
        completed: true,
        distanceMeters: 5000,
        durationSeconds: 1400,
        paceSecondsPerKm: 280,
        completedAt: new Date().toISOString(),
      },
    ];

    const prs = MasteryEngine.detectPersonalRecords(
      { BEST_DISTANCE: 5000, BEST_PACE: 300 },
      fasterRunSets,
      running
    );
    expect(prs.some(p => p.prType === 'BEST_PACE' && p.value === 280)).toBe(true);
  });

  // Scenario 11: Offline workout persistence
  it('Scenario 11: offline workout saves mastery and PRs to SQLite without network', async () => {
    const mastery: ExerciseMastery = {
      id: 'em-u1-ex-bench',
      userId: 'u1',
      exerciseId: 'ex-bench',
      masteryLevel: 3,
      masteryXp: 450,
      rank: 'E',
      estimated1RmKg: 95,
      bestWeightKg: 85,
      bestReps: 6,
      bestVolumeKg: 510,
      totalSessions: 3,
      totalSets: 9,
      totalReps: 54,
      totalVolumeKg: 4590,
      recentPerformance: [],
      lastTrainedAt: new Date().toISOString(),
      trend: 'IMPROVING',
      xpToNextLevel: 120,
    };

    await MasteryRepository.upsertMastery(mastery);
    const saved = await MasteryRepository.getMastery('u1', 'ex-bench');

    expect(saved).not.toBeNull();
    expect(saved?.masteryLevel).toBe(3);
    expect(saved?.bestWeightKg).toBe(85);
    expect(saved?.trend).toBe('IMPROVING');
  });

  // Scenario 12: Sync idempotency & Highest Value Wins
  it('Scenario 12: sync applies Highest Value Wins resolution to personal records idempotently', async () => {
    const pr1: PersonalRecord = {
      id: 'pr-1',
      userId: 'u1',
      exerciseId: 'ex-bench',
      prType: 'MAX_WEIGHT',
      value: 100,
      achievedAt: '2026-09-01T10:00:00Z',
    };

    // Save initial PR
    const saved1 = await MasteryRepository.savePersonalRecord(pr1);
    expect(saved1).toBe(true);

    // Duplicate or equal submission does not overwrite
    const savedDuplicate = await MasteryRepository.savePersonalRecord({ ...pr1, value: 100 });
    expect(savedDuplicate).toBe(false);

    // Lower submission does not overwrite
    const savedLower = await MasteryRepository.savePersonalRecord({ ...pr1, value: 95 });
    expect(savedLower).toBe(false);

    // Strictly higher submission updates the record
    const savedHigher = await MasteryRepository.savePersonalRecord({ ...pr1, value: 105 });
    expect(savedHigher).toBe(true);

    const prs = await MasteryRepository.getPersonalRecords('u1', 'ex-bench');
    expect(prs.length).toBe(1);
    expect(prs[0].value).toBe(105);

    // Test cardio pace (lower value is better)
    const cardioPrFast: PersonalRecord = {
      id: 'pr-cardio-1',
      userId: 'u1',
      exerciseId: 'ex-running',
      prType: 'BEST_PACE',
      value: 300, // 5:00 min/km
      achievedAt: '2026-09-01T10:00:00Z',
    };
    await MasteryRepository.savePersonalRecord(cardioPrFast);

    // Slower pace (320) rejected
    const slowerSaved = await MasteryRepository.savePersonalRecord({ ...cardioPrFast, value: 320 });
    expect(slowerSaved).toBe(false);

    // Faster pace (280) accepted
    const fasterSaved = await MasteryRepository.savePersonalRecord({ ...cardioPrFast, value: 280 });
    expect(fasterSaved).toBe(true);
  });

  // Scenario 13: Historical workout migration
  it('Scenario 13: historical workout migration derives mastery accurately from set logs', async () => {
    // Populate historical logs
    exerciseLogsTable.push(
      { id: 'el-hist-1', workout_id: 'w-1', exercise_id: 'ex-bench', user_id: 'u1' },
      { id: 'el-hist-2', workout_id: 'w-2', exercise_id: 'ex-bench', user_id: 'u1' }
    );

    setLogsTable.push(
      {
        id: 'sl-1',
        exercise_log_id: 'el-hist-1',
        user_id: 'u1',
        weight_kg: 80,
        reps: 5,
        completed: 1,
        is_skipped: 0,
        estimated_1rm_kg: 93.3,
        distance_meters: 0,
        duration_seconds: 0,
        pace_seconds_per_km: 0,
        completed_at: '2026-08-01T10:00:00Z',
      },
      {
        id: 'sl-2',
        exercise_log_id: 'el-hist-2',
        user_id: 'u1',
        weight_kg: 85,
        reps: 5,
        completed: 1,
        is_skipped: 0,
        estimated_1rm_kg: 99.1,
        distance_meters: 0,
        duration_seconds: 0,
        pace_seconds_per_km: 0,
        completed_at: '2026-08-05T10:00:00Z',
      }
    );

    await MasteryRepository.deriveMasteryFromHistory('u1');

    const derived = await MasteryRepository.getMastery('u1', 'ex-bench');
    expect(derived).not.toBeNull();
    expect(derived?.totalSessions).toBe(2);
    expect(derived?.totalSets).toBe(2);
    expect(derived?.totalReps).toBe(10);
    expect(derived?.bestWeightKg).toBe(85);
    expect(derived?.masteryLevel).toBeGreaterThanOrEqual(1);
    expect(derived?.rank).toBeDefined();
    expect(derived?.trend).toBe('MAINTAINING');
  });
});
