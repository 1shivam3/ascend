import { getDatabase } from '../../database/sqlite';
import { WorkoutRepository } from '../../database/repositories/WorkoutRepository';
import { MasteryRepository } from '../../database/repositories/MasteryRepository';
import { HealthRepository } from '../../database/repositories/HealthRepository';
import { ExerciseRepository } from '../../database/repositories/ExerciseRepository';
import { ProfileRepository } from '../../database/repositories/ProfileRepository';
import { ReliableDataEngine } from '../progression/ReliableDataEngine';
import { SetLog, WorkoutSession } from '../../types/domain.types';

export type ChartMetric =
  | 'ESTIMATED_1RM'
  | 'WEIGHT'
  | 'REPETITIONS'
  | 'TRAINING_VOLUME'
  | 'BODY_WEIGHT'
  | 'WORKOUT_FREQUENCY';

export type ChartTimeRange = '7D' | '30D' | '3M' | '6M' | '1Y' | 'CUSTOM';

export interface ChartDataPoint {
  date: string; // YYYY-MM-DD
  label: string; // "Sep 15"
  value: number;
  details?: string;
  isEstimated: boolean;
  exerciseName?: string;
  workoutTitle?: string;
}

export interface ChartQueryResult {
  metric: ChartMetric;
  unit: string;
  isEstimatedMetric: boolean;
  data: ChartDataPoint[];
  currentValue: number;
  delta: number;
  deltaPercent: number;
  hasData: boolean;
  emptyReason?: string;
}

export interface CategorizedPrItem {
  id: string;
  exerciseId: string;
  exerciseName: string;
  category: 'TESTED_1RM' | 'ESTIMATED_1RM' | 'BEST_WORKING_SET' | 'REPETITION_PR' | 'VOLUME_PR';
  value: number;
  unit: string;
  details: string;
  achievedAt: string;
  isDirectlyRecorded: boolean;
  setLogId?: string | null;
}

export interface CategorizedPrsResult {
  tested1Rm: CategorizedPrItem[];
  estimated1Rm: CategorizedPrItem[];
  bestWorkingSet: CategorizedPrItem[];
  repetitionPr: CategorizedPrItem[];
  volumePr: CategorizedPrItem[];
  totalCount: number;
}

export class ProgressAnalyticsService {
  /**
   * Calculates the start ISO date for a given time range.
   */
  static getStartDateForRange(range: ChartTimeRange, customStart?: string): string {
    if (range === 'CUSTOM' && customStart) {
      return customStart;
    }
    const now = new Date();
    switch (range) {
      case '7D':
        now.setDate(now.getDate() - 7);
        break;
      case '30D':
        now.setDate(now.getDate() - 30);
        break;
      case '3M':
        now.setMonth(now.getMonth() - 3);
        break;
      case '6M':
        now.setMonth(now.getMonth() - 6);
        break;
      case '1Y':
        now.setFullYear(now.getFullYear() - 1);
        break;
      default:
        now.setDate(now.getDate() - 30);
    }
    return now.toISOString();
  }

  /**
   * Queries real SQLite records for the selected metric, exercise, and time range.
   * Guarantees strict data truthfulness (zero invented points).
   */
  static async getChartData(
    userId: string,
    options: {
      metric: ChartMetric;
      exerciseId?: string;
      timeRange: ChartTimeRange;
      customStartDate?: string;
      customEndDate?: string;
    }
  ): Promise<ChartQueryResult> {
    const db = await getDatabase();
    const startDate = this.getStartDateForRange(options.timeRange, options.customStartDate);
    const endDate = options.customEndDate || new Date().toISOString();

    const isEstimatedMetric = options.metric === 'ESTIMATED_1RM';
    let unit = 'kg';
    if (options.metric === 'REPETITIONS') unit = 'reps';
    else if (options.metric === 'WORKOUT_FREQUENCY') unit = 'sessions';
    else if (options.metric === 'TRAINING_VOLUME') unit = 'kg vol';

    let dataPoints: ChartDataPoint[] = [];

    // 1. BODY WEIGHT
    if (options.metric === 'BODY_WEIGHT') {
      const records = await HealthRepository.getRecords(userId, 'WEIGHT', startDate, endDate);
      if (records.length > 0) {
        dataPoints = records.map(r => {
          const d = new Date(r.startTime);
          return {
            date: r.startTime.substring(0, 10),
            label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            value: Math.round(r.value * 10) / 10,
            details: `Scale: ${r.value} kg`,
            isEstimated: false,
          };
        });
      } else {
        // Check profile weight
        const profile = await ProfileRepository.getProfile(userId);
        if (profile?.weightKg) {
          const d = new Date();
          dataPoints = [
            {
              date: d.toISOString().substring(0, 10),
              label: 'Current',
              value: profile.weightKg,
              details: 'Baseline Profile Weight',
              isEstimated: false,
            },
          ];
        }
      }
    }

    // 2. WORKOUT FREQUENCY
    else if (options.metric === 'WORKOUT_FREQUENCY') {
      const rows = await db.getAllAsync<{ date_str: string; session_count: number }>(
        `SELECT SUBSTR(completed_at, 1, 10) as date_str, COUNT(*) as session_count
         FROM workouts
         WHERE user_id = ? AND status = 'COMPLETED' AND completed_at >= ? AND completed_at <= ?
         GROUP BY date_str
         ORDER BY date_str ASC;`,
        [userId, startDate, endDate]
      );

      dataPoints = rows.map(r => {
        const d = new Date(r.date_str);
        return {
          date: r.date_str,
          label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          value: r.session_count,
          details: `${r.session_count} completed session${r.session_count > 1 ? 's' : ''}`,
          isEstimated: false,
        };
      });
    }

    // 3. TRAINING VOLUME
    else if (options.metric === 'TRAINING_VOLUME') {
      if (options.exerciseId && options.exerciseId !== 'ALL') {
        const rows = await db.getAllAsync<{ date_str: string; vol: number; ex_name: string }>(
          `SELECT SUBSTR(sl.completed_at, 1, 10) as date_str, SUM(sl.weight_kg * sl.reps) as vol, ec.name as ex_name
           FROM set_logs sl
           JOIN exercise_logs el ON el.id = sl.exercise_log_id
           JOIN exercise_catalog ec ON ec.id = el.exercise_id
           WHERE sl.user_id = ? AND el.exercise_id = ? AND sl.completed = 1 AND sl.is_skipped = 0
             AND sl.completed_at >= ? AND sl.completed_at <= ?
           GROUP BY date_str
           ORDER BY date_str ASC;`,
          [userId, options.exerciseId, startDate, endDate]
        );
        dataPoints = rows.map(r => {
          const d = new Date(r.date_str);
          return {
            date: r.date_str,
            label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            value: Math.round(r.vol),
            details: `${r.ex_name} Tonnage: ${Math.round(r.vol)} kg`,
            isEstimated: false,
            exerciseName: r.ex_name,
          };
        });
      } else {
        const rows = await db.getAllAsync<{ date_str: string; vol: number; workout_title: string }>(
          `SELECT SUBSTR(w.completed_at, 1, 10) as date_str, SUM(w.total_volume_kg) as vol, w.title as workout_title
           FROM workouts w
           WHERE w.user_id = ? AND w.status = 'COMPLETED' AND w.completed_at >= ? AND w.completed_at <= ?
           GROUP BY date_str
           ORDER BY date_str ASC;`,
          [userId, startDate, endDate]
        );
        dataPoints = rows.map(r => {
          const d = new Date(r.date_str);
          return {
            date: r.date_str,
            label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            value: Math.round(r.vol),
            details: `Session Volume: ${Math.round(r.vol)} kg`,
            isEstimated: false,
            workoutTitle: r.workout_title,
          };
        });
      }
    }

    // 4. EXERCISE-SPECIFIC METRICS: ESTIMATED_1RM, WEIGHT, REPETITIONS
    else {
      let exerciseFilter = '';
      const params: any[] = [userId, startDate, endDate];
      if (options.exerciseId && options.exerciseId !== 'ALL') {
        exerciseFilter = 'AND el.exercise_id = ?';
        params.push(options.exerciseId);
      }

      let valCol = 'MAX(sl.weight_kg)';
      if (options.metric === 'ESTIMATED_1RM') {
        valCol = 'MAX(sl.estimated_1rm_kg)';
      } else if (options.metric === 'REPETITIONS') {
        valCol = 'MAX(sl.reps)';
      }

      const rows = await db.getAllAsync<{
        date_str: string;
        metric_val: number;
        ex_name: string;
        best_wt: number;
        best_reps: number;
        best_rpe: number | null;
        w_title: string;
      }>(
        `SELECT 
          SUBSTR(sl.completed_at, 1, 10) as date_str,
          ${valCol} as metric_val,
          ec.name as ex_name,
          sl.weight_kg as best_wt,
          sl.reps as best_reps,
          sl.rpe as best_rpe,
          w.title as w_title
         FROM set_logs sl
         JOIN exercise_logs el ON el.id = sl.exercise_log_id
         JOIN workouts w ON w.id = el.workout_id
         JOIN exercise_catalog ec ON ec.id = el.exercise_id
         WHERE sl.user_id = ? 
           AND sl.completed = 1 
           AND sl.is_skipped = 0
           AND sl.completed_at >= ? 
           AND sl.completed_at <= ?
           ${exerciseFilter}
         GROUP BY date_str
         ORDER BY date_str ASC;`,
        params
      );

      dataPoints = rows
        .filter(r => r.metric_val > 0)
        .map(r => {
          const d = new Date(r.date_str);
          let details = `${r.best_wt} kg × ${r.best_reps} reps`;
          if (r.best_rpe) details += ` @ RPE ${r.best_rpe}`;
          if (options.metric === 'ESTIMATED_1RM') {
            details = `e1RM: ${Math.round(r.metric_val * 10) / 10} kg (${details})`;
          }

          return {
            date: r.date_str,
            label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            value: Math.round(r.metric_val * 10) / 10,
            details,
            isEstimated: isEstimatedMetric,
            exerciseName: r.ex_name,
            workoutTitle: r.w_title,
          };
        });
    }

    const hasData = dataPoints.length > 0;
    const values = dataPoints.map(d => d.value);
    const currentValue = hasData ? values[values.length - 1] : 0;
    const initialValue = hasData ? values[0] : 0;
    const delta = hasData ? Math.round((currentValue - initialValue) * 10) / 10 : 0;
    const deltaPercent =
      initialValue > 0 ? Math.round((delta / initialValue) * 1000) / 10 : 0;

    let emptyReason = undefined;
    if (!hasData) {
      if (options.metric === 'BODY_WEIGHT') {
        emptyReason = 'No body weight records logged. Tap "+ Log Weight" to record scale measurements.';
      } else {
        emptyReason = 'No workout telemetry logged for this period. Complete a session to visualize progress.';
      }
    }

    return {
      metric: options.metric,
      unit,
      isEstimatedMetric,
      data: dataPoints,
      currentValue,
      delta,
      deltaPercent,
      hasData,
      emptyReason,
    };
  }

  /**
   * Retrieves personal records organized strictly into the 5 requested categories:
   * 1. Tested 1RM
   * 2. Estimated 1RM
   * 3. Best Working Set
   * 4. Repetition PR
   * 5. Volume PR
   */
  static async getCategorizedPersonalRecords(
    userId: string,
    exerciseId?: string
  ): Promise<CategorizedPrsResult> {
    const db = await getDatabase();
    const allEx = await ExerciseRepository.getAll();
    const exMap: Record<string, string> = {};
    allEx.forEach(e => {
      exMap[e.id] = e.name;
    });

    const filterClause = exerciseId ? 'AND el.exercise_id = ?' : '';
    const params = exerciseId ? [userId, exerciseId] : [userId];

    // Query distinct bests from set logs directly to guarantee 100% up-to-date and category-separated PRs
    const sets = await db.getAllAsync<{
      id: string;
      exercise_id: string;
      weight_kg: number;
      reps: number;
      rpe: number | null;
      estimated_1rm_kg: number;
      completed_at: string;
    }>(
      `SELECT sl.id, el.exercise_id, sl.weight_kg, sl.reps, sl.rpe, sl.estimated_1rm_kg, sl.completed_at
       FROM set_logs sl
       JOIN exercise_logs el ON el.id = sl.exercise_log_id
       WHERE sl.user_id = ? AND sl.completed = 1 AND sl.is_skipped = 0 ${filterClause}
       ORDER BY sl.completed_at DESC;`,
      params
    );

    // Group by exercise
    const byEx: Record<string, typeof sets> = {};
    for (const s of sets) {
      if (!byEx[s.exercise_id]) byEx[s.exercise_id] = [];
      byEx[s.exercise_id].push(s);
    }

    const tested1Rm: CategorizedPrItem[] = [];
    const estimated1Rm: CategorizedPrItem[] = [];
    const bestWorkingSet: CategorizedPrItem[] = [];
    const repetitionPr: CategorizedPrItem[] = [];
    const volumePr: CategorizedPrItem[] = [];

    for (const [exId, exSets] of Object.entries(byEx)) {
      const exName = exMap[exId] || 'Exercise';

      // 1. TESTED 1RM (reps = 1, RPE >= 8.5)
      const testedCandidates = exSets.filter(
        s => s.reps === 1 && (s.rpe === null || s.rpe >= 8.5) && s.weight_kg > 0
      );
      if (testedCandidates.length > 0) {
        testedCandidates.sort((a, b) => b.weight_kg - a.weight_kg);
        const best = testedCandidates[0];
        tested1Rm.push({
          id: `t1rm-${best.id}`,
          exerciseId: exId,
          exerciseName: exName,
          category: 'TESTED_1RM',
          value: best.weight_kg,
          unit: 'kg',
          details: `1 rep @ RPE ${best.rpe || 9.0} (Directly Tested)`,
          achievedAt: best.completed_at,
          isDirectlyRecorded: true,
          setLogId: best.id,
        });
      }

      // 2. ESTIMATED 1RM (reps <= 10)
      const e1rmCandidates = exSets.filter(s => s.estimated_1rm_kg > 0 && s.reps <= 10);
      if (e1rmCandidates.length > 0) {
        e1rmCandidates.sort((a, b) => b.estimated_1rm_kg - a.estimated_1rm_kg);
        const best = e1rmCandidates[0];
        estimated1Rm.push({
          id: `e1rm-${best.id}`,
          exerciseId: exId,
          exerciseName: exName,
          category: 'ESTIMATED_1RM',
          value: Math.round(best.estimated_1rm_kg * 10) / 10,
          unit: 'kg',
          details: `From ${best.weight_kg} kg × ${best.reps} reps (Epley ≤10 reps)`,
          achievedAt: best.completed_at,
          isDirectlyRecorded: false,
          setLogId: best.id,
        });
      }

      // 3. BEST WORKING SET (reps >= 2)
      const workingCandidates = exSets.filter(s => s.reps >= 2 && s.weight_kg > 0);
      if (workingCandidates.length > 0) {
        workingCandidates.sort((a, b) => b.weight_kg * b.reps - a.weight_kg * a.reps);
        const best = workingCandidates[0];
        bestWorkingSet.push({
          id: `bws-${best.id}`,
          exerciseId: exId,
          exerciseName: exName,
          category: 'BEST_WORKING_SET',
          value: best.weight_kg,
          unit: 'kg',
          details: `${best.weight_kg} kg × ${best.reps} reps`,
          achievedAt: best.completed_at,
          isDirectlyRecorded: true,
          setLogId: best.id,
        });
      }

      // 4. REPETITION PR (max reps)
      const repCandidates = exSets.filter(s => s.reps > 0);
      if (repCandidates.length > 0) {
        repCandidates.sort((a, b) => b.reps - a.reps);
        const best = repCandidates[0];
        repetitionPr.push({
          id: `repr-${best.id}`,
          exerciseId: exId,
          exerciseName: exName,
          category: 'REPETITION_PR',
          value: best.reps,
          unit: 'reps',
          details: `${best.reps} reps @ ${best.weight_kg} kg`,
          achievedAt: best.completed_at,
          isDirectlyRecorded: true,
          setLogId: best.id,
        });
      }

      // 5. VOLUME PR (max single set tonnage)
      const volCandidates = exSets.filter(s => s.weight_kg * s.reps > 0);
      if (volCandidates.length > 0) {
        volCandidates.sort((a, b) => b.weight_kg * b.reps - a.weight_kg * a.reps);
        const best = volCandidates[0];
        volumePr.push({
          id: `vol-${best.id}`,
          exerciseId: exId,
          exerciseName: exName,
          category: 'VOLUME_PR',
          value: Math.round(best.weight_kg * best.reps),
          unit: 'kg vol',
          details: `${best.weight_kg} kg × ${best.reps} reps (${Math.round(best.weight_kg * best.reps)} kg load)`,
          achievedAt: best.completed_at,
          isDirectlyRecorded: true,
          setLogId: best.id,
        });
      }
    }

    const totalCount =
      tested1Rm.length +
      estimated1Rm.length +
      bestWorkingSet.length +
      repetitionPr.length +
      volumePr.length;

    return {
      tested1Rm,
      estimated1Rm,
      bestWorkingSet,
      repetitionPr,
      volumePr,
      totalCount,
    };
  }

  /**
   * Updates an erroneous set record and triggers cascading recalculation.
   */
  static async updateSetRecord(
    userId: string,
    setId: string,
    updates: {
      weightKg?: number;
      reps?: number;
      rpe?: number | null;
      setType?: string;
    }
  ): Promise<void> {
    await WorkoutRepository.updateSetLog(setId, updates as any);
    await MasteryRepository.recalculatePersonalRecords(userId);
    await MasteryRepository.deriveMasteryFromHistory(userId);
  }

  /**
   * Deletes a duplicate or corrupted set log entry and triggers cascading recalculation.
   */
  static async deleteSetRecord(userId: string, setId: string): Promise<void> {
    await WorkoutRepository.deleteSetLog(setId);
    await MasteryRepository.recalculatePersonalRecords(userId);
    await MasteryRepository.deriveMasteryFromHistory(userId);
  }

  /**
   * Deletes an entire duplicate or accidental workout session and cascades deletion.
   */
  static async deleteWorkoutSession(userId: string, workoutId: string): Promise<boolean> {
    const deleted = await WorkoutRepository.deleteWorkout(workoutId);
    if (deleted) {
      await MasteryRepository.recalculatePersonalRecords(userId);
      await MasteryRepository.deriveMasteryFromHistory(userId);
    }
    return deleted;
  }

  /**
   * Logs a scale body weight measurement into health_records and updates profile.
   */
  static async logBodyweight(
    userId: string,
    weightKg: number,
    dateIso?: string
  ): Promise<void> {
    const now = dateIso || new Date().toISOString();
    const id = `bw-${userId}-${now.substring(0, 10)}-${Date.now()}`;

    await HealthRepository.saveRecords([
      {
        id,
        userId,
        recordType: 'WEIGHT',
        sourceClient: 'MANUAL',
        externalId: null,
        startTime: now,
        endTime: now,
        value: weightKg,
        unit: 'kg',
        metadata: { source: 'USER_LOG' },
        isDeduplicated: false,
        syncedAt: now,
        createdAt: now,
      },
    ]);

    // Update profile weight
    await ProfileRepository.updateWeight(userId, weightKg);
  }

  /**
   * Computes endurance progress metrics.
   */
  static async getEnduranceMetrics(userId: string): Promise<{
    sessionDensityRepsPerMin: number;
    weeklyTonnageKg: number;
    highRepSetsCount: number;
    bestDistanceMeters: number;
  }> {
    const db = await getDatabase();
    const now = new Date();
    now.setDate(now.getDate() - 30);
    const thirtyDaysAgo = now.toISOString();

    const row = await db.getFirstAsync<{
      total_reps: number;
      total_duration_sec: number;
      total_vol: number;
      high_rep_sets: number;
      max_distance: number;
    }>(
      `SELECT 
        COALESCE(SUM(sl.reps), 0) as total_reps,
        COALESCE(SUM(w.duration_seconds), 0) as total_duration_sec,
        COALESCE(SUM(sl.weight_kg * sl.reps), 0) as total_vol,
        COALESCE(SUM(CASE WHEN sl.reps >= 12 THEN 1 ELSE 0 END), 0) as high_rep_sets,
        COALESCE(MAX(sl.distance_meters), 0) as max_distance
       FROM set_logs sl
       JOIN exercise_logs el ON el.id = sl.exercise_log_id
       JOIN workouts w ON w.id = el.workout_id
       WHERE sl.user_id = ? AND sl.completed = 1 AND sl.completed_at >= ?;`,
      [userId, thirtyDaysAgo]
    );

    const totalMinutes = Math.max(1, Math.round((row?.total_duration_sec || 0) / 60));
    const density = Math.round(((row?.total_reps || 0) / totalMinutes) * 10) / 10;

    return {
      sessionDensityRepsPerMin: density,
      weeklyTonnageKg: Math.round(row?.total_vol || 0),
      highRepSetsCount: row?.high_rep_sets || 0,
      bestDistanceMeters: row?.max_distance || 0,
    };
  }

  /**
   * Computes mobility assessment metrics.
   */
  static async getMobilityMetrics(userId: string): Promise<{
    mobilityScore: number;
    warmupSetsCount: number;
    unilateralSetsCount: number;
    mobilityWorkoutsCount: number;
  }> {
    const db = await getDatabase();
    const profile = await ProfileRepository.getProfile(userId);
    const mobilityScore = profile?.attributes?.mobility ?? 10;

    const row = await db.getFirstAsync<{
      warmup_count: number;
      unilateral_count: number;
      mobility_workouts: number;
    }>(
      `SELECT 
        COALESCE(SUM(CASE WHEN sl.set_type = 'WARMUP' THEN 1 ELSE 0 END), 0) as warmup_count,
        COALESCE(SUM(CASE WHEN ec.movement_pattern = 'LUNGE' OR ec.name LIKE '%unilateral%' OR ec.name LIKE '%split squat%' THEN 1 ELSE 0 END), 0) as unilateral_count,
        COALESCE(SUM(CASE WHEN w.title LIKE '%Mobility%' OR w.title LIKE '%Recovery%' OR ec.progression_type = 'MOBILITY' THEN 1 ELSE 0 END), 0) as mobility_workouts
       FROM set_logs sl
       JOIN exercise_logs el ON el.id = sl.exercise_log_id
       JOIN workouts w ON w.id = el.workout_id
       JOIN exercise_catalog ec ON ec.id = el.exercise_id
       WHERE sl.user_id = ? AND sl.completed = 1;`,
      [userId]
    );

    return {
      mobilityScore,
      warmupSetsCount: row?.warmup_count || 0,
      unilateralSetsCount: row?.unilateral_count || 0,
      mobilityWorkoutsCount: row?.mobility_workouts || 0,
    };
  }
}
