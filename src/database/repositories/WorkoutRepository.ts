import { getDatabase } from '../sqlite';
import { WorkoutSession, ExerciseLog, SetLog, SetType } from '../../types/domain.types';
import { SqliteWorkoutRow, SqliteExerciseLogRow, SqliteSetLogRow } from '../types';
import { ExerciseRepository } from './ExerciseRepository';

export class WorkoutRepository {
  static async createWorkout(workout: Omit<WorkoutSession, 'exercises'>): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO workouts (
        id, user_id, plan_id, title, started_at, completed_at, duration_seconds, total_volume_kg, total_reps, total_sets, status, xp_earned, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        workout.id,
        workout.userId,
        workout.planId || null,
        workout.title,
        workout.startedAt,
        workout.completedAt || null,
        workout.durationSeconds,
        workout.totalVolumeKg,
        workout.totalReps,
        workout.totalSets,
        workout.status,
        workout.xpEarned,
        workout.notes || null,
        workout.startedAt,
        workout.startedAt,
      ]
    );
  }

  static async saveExerciseLog(log: Omit<ExerciseLog, 'sets' | 'exercise'>): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT OR REPLACE INTO exercise_logs (
        id, workout_id, exercise_id, user_id, order_index, notes, superset_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        log.id,
        log.workoutId,
        log.exerciseId,
        log.userId,
        log.orderIndex,
        log.notes || null,
        log.supersetId || null,
        now,
        now,
      ]
    );
  }

  static async saveSetLog(set: SetLog): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT OR REPLACE INTO set_logs (
        id, exercise_log_id, user_id, set_number, set_type, weight_kg, reps, rpe, estimated_1rm_kg, is_pr, completed, is_skipped, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        set.id,
        set.exerciseLogId,
        set.userId,
        set.setNumber,
        set.setType,
        set.weightKg,
        set.reps,
        set.rpe || null,
        set.estimated1RmKg,
        set.isPr ? 1 : 0,
        set.completed ? 1 : 0,
        set.isSkipped ? 1 : 0,
        set.completedAt,
        now,
        now,
      ]
    );
  }

  /**
   * Retrieves the sets from the most recent completed workout for this exercise.
   * Used for ghost values and target prescription comparison.
   */
  static async getPreviousPerformance(userId: string, exerciseId: string): Promise<SetLog[]> {
    const db = await getDatabase();
    
    // Find the latest completed workout containing this exercise
    const row = await db.getFirstAsync<{ id: string }>(
      `SELECT el.id 
       FROM exercise_logs el
       JOIN workouts w ON el.workout_id = w.id
       WHERE el.user_id = ? AND el.exercise_id = ? AND w.status = 'COMPLETED'
       ORDER BY w.completed_at DESC
       LIMIT 1;`,
      [userId, exerciseId]
    );

    if (!row) return [];

    const setRows = await db.getAllAsync<SqliteSetLogRow>(
      `SELECT * FROM set_logs 
       WHERE exercise_log_id = ? AND completed = 1 AND is_skipped = 0
       ORDER BY set_number ASC;`,
      [row.id]
    );

    return setRows.map(s => ({
      id: s.id,
      exerciseLogId: s.exercise_log_id,
      userId: s.user_id,
      setNumber: s.set_number,
      setType: s.set_type as SetType,
      weightKg: s.weight_kg,
      reps: s.reps,
      rpe: s.rpe,
      estimated1RmKg: s.estimated_1rm_kg,
      isPr: Boolean(s.is_pr),
      completed: Boolean(s.completed),
      isSkipped: Boolean(s.is_skipped),
      completedAt: s.completed_at,
    }));
  }

  /**
   * Replaces an exercise in an active workout session.
   */
  static async replaceExerciseInWorkout(
    exerciseLogId: string,
    newExerciseId: string
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE exercise_logs SET exercise_id = ?, updated_at = ? WHERE id = ?;`,
      [newExerciseId, now, exerciseLogId]
    );
  }

  /**
   * Marks a set as skipped.
   */
  static async skipSet(setId: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE set_logs SET is_skipped = 1, completed = 0, updated_at = ? WHERE id = ?;`,
      [now, setId]
    );
  }

  static async finishWorkout(
    workoutId: string,
    completedAt: string,
    durationSeconds: number,
    totalVolumeKg: number,
    totalReps: number,
    totalSets: number,
    xpEarned: number
  ): Promise<boolean> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const result = await db.runAsync(
      `UPDATE workouts SET
        completed_at = ?,
        duration_seconds = ?,
        total_volume_kg = ?,
        total_reps = ?,
        total_sets = ?,
        status = 'COMPLETED',
        xp_earned = ?,
        updated_at = ?
      WHERE id = ? AND status != 'COMPLETED';`,
      [
        completedAt,
        durationSeconds,
        totalVolumeKg,
        totalReps,
        totalSets,
        xpEarned,
        now,
        workoutId,
      ]
    );
    return result.changes > 0;
  }

  /**
   * Retrieves any in-progress active workout session for the user from SQLite.
   * Enables seamless session restoration on app restart or after crash.
   */
  static async getActiveWorkout(userId: string): Promise<WorkoutSession | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqliteWorkoutRow>(
      `SELECT * FROM workouts 
       WHERE user_id = ? AND status = 'ACTIVE' 
       ORDER BY started_at DESC 
       LIMIT 1;`,
      [userId]
    );

    if (!row) return null;
    return this.hydrateWorkoutSession(row);
  }

  /**
   * Retrieves a single workout by its unique ID.
   */
  static async getWorkoutById(workoutId: string): Promise<WorkoutSession | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqliteWorkoutRow>(
      `SELECT * FROM workouts WHERE id = ? LIMIT 1;`,
      [workoutId]
    );

    if (!row) return null;
    return this.hydrateWorkoutSession(row);
  }

  static async getRecentWorkouts(userId: string, limit: number = 10): Promise<WorkoutSession[]> {
    const db = await getDatabase();
    const workoutRows = await db.getAllAsync<SqliteWorkoutRow>(
      `SELECT * FROM workouts 
       WHERE user_id = ? AND status = 'COMPLETED' 
       ORDER BY completed_at DESC LIMIT ?;`,
      [userId, limit]
    );

    const workouts: WorkoutSession[] = [];
    for (const w of workoutRows) {
      workouts.push(await this.hydrateWorkoutSession(w));
    }
    return workouts;
  }

  private static async hydrateWorkoutSession(w: SqliteWorkoutRow): Promise<WorkoutSession> {
    const db = await getDatabase();
    const exRows = await db.getAllAsync<SqliteExerciseLogRow>(
      `SELECT * FROM exercise_logs WHERE workout_id = ? ORDER BY order_index ASC;`,
      [w.id]
    );

    const exercises: ExerciseLog[] = [];

    for (const el of exRows) {
      const exercise = await ExerciseRepository.getById(el.exercise_id);
      const setRows = await db.getAllAsync<SqliteSetLogRow>(
        `SELECT * FROM set_logs WHERE exercise_log_id = ? ORDER BY set_number ASC;`,
        [el.id]
      );

      const sets: SetLog[] = setRows.map(s => ({
        id: s.id,
        exerciseLogId: s.exercise_log_id,
        userId: s.user_id,
        setNumber: s.set_number,
        setType: s.set_type as SetType,
        weightKg: s.weight_kg,
        reps: s.reps,
        rpe: s.rpe,
        estimated1RmKg: s.estimated_1rm_kg,
        isPr: Boolean(s.is_pr),
        completed: Boolean(s.completed),
        isSkipped: Boolean(s.is_skipped),
        completedAt: s.completed_at,
      }));

      exercises.push({
        id: el.id,
        workoutId: el.workout_id,
        exerciseId: el.exercise_id,
        userId: el.user_id,
        orderIndex: el.order_index,
        notes: el.notes || undefined,
        supersetId: el.superset_id || null,
        sets,
        exercise: exercise || undefined,
      });
    }

    return {
      id: w.id,
      userId: w.user_id,
      planId: w.plan_id,
      title: w.title,
      startedAt: w.started_at,
      completedAt: w.completed_at,
      durationSeconds: w.duration_seconds,
      totalVolumeKg: w.total_volume_kg,
      totalReps: w.total_reps,
      totalSets: w.total_sets,
      status: w.status as 'ACTIVE' | 'COMPLETED' | 'DISCARDED',
      xpEarned: w.xp_earned,
      notes: w.notes || undefined,
      exercises,
    };
  }

  /**
   * Returns distinct day-of-week indices (0 = Mon .. 6 = Sun) for workouts completed this week.
   */
  static async getWeeklyWorkoutDays(userId: string): Promise<number[]> {
    const db = await getDatabase();
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfWeekIso = startOfWeek.toISOString();

    const rows = await db.getAllAsync<{ completed_at: string }>(
      `SELECT completed_at FROM workouts
       WHERE user_id = ? AND status = 'COMPLETED' AND completed_at >= ?
       ORDER BY completed_at ASC;`,
      [userId, startOfWeekIso]
    );

    const dayIndices = new Set<number>();
    for (const r of rows) {
      if (r.completed_at) {
        const d = new Date(r.completed_at);
        const monIdx = (d.getDay() + 6) % 7;
        dayIndices.add(monIdx);
      }
    }

    return Array.from(dayIndices).sort((a, b) => a - b);
  }

  /**
   * Aggregates session counts and tonnage for current week and current calendar month.
   */
  static async getWeeklyMonthlyStats(userId: string): Promise<{
    weeklyCount: number;
    monthlyCount: number;
    weeklyVolumeKg: number;
    monthlyVolumeKg: number;
  }> {
    const db = await getDatabase();
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const weekRow = await db.getFirstAsync<{ count: number; volume: number }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_volume_kg), 0) as volume
       FROM workouts
       WHERE user_id = ? AND status = 'COMPLETED' AND completed_at >= ?;`,
      [userId, startOfWeek.toISOString()]
    );

    const monthRow = await db.getFirstAsync<{ count: number; volume: number }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_volume_kg), 0) as volume
       FROM workouts
       WHERE user_id = ? AND status = 'COMPLETED' AND completed_at >= ?;`,
      [userId, startOfMonth.toISOString()]
    );

    return {
      weeklyCount: weekRow?.count || 0,
      monthlyCount: monthRow?.count || 0,
      weeklyVolumeKg: Math.round(weekRow?.volume || 0),
      monthlyVolumeKg: Math.round(monthRow?.volume || 0),
    };
  }

  /**
   * Retrieves volume totals per calendar date for recent sessions.
   */
  static async getVolumeHistory(userId: string, limitDays: number = 7): Promise<{ date: string; volumeKg: number }[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ date_str: string; day_vol: number }>(
      `SELECT SUBSTR(completed_at, 1, 10) as date_str, SUM(total_volume_kg) as day_vol
       FROM workouts
       WHERE user_id = ? AND status = 'COMPLETED' AND completed_at IS NOT NULL
       GROUP BY date_str
       ORDER BY date_str DESC
       LIMIT ?;`,
      [userId, limitDays]
    );

    return rows.map(r => ({
      date: r.date_str,
      volumeKg: Math.round(r.day_vol || 0),
    })).reverse();
  }

  /**
   * Returns lifetime workout totals.
   */
  static async getLifetimeStats(userId: string): Promise<{
    totalWorkouts: number;
    totalVolumeKg: number;
    totalSets: number;
    totalReps: number;
    totalDurationMinutes: number;
  }> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      total_workouts: number;
      total_volume: number;
      total_sets: number;
      total_reps: number;
      total_duration: number;
    }>(
      `SELECT 
        COUNT(*) as total_workouts,
        COALESCE(SUM(total_volume_kg), 0) as total_volume,
        COALESCE(SUM(total_sets), 0) as total_sets,
        COALESCE(SUM(total_reps), 0) as total_reps,
        COALESCE(SUM(duration_seconds), 0) as total_duration
       FROM workouts
       WHERE user_id = ? AND status = 'COMPLETED';`,
      [userId]
    );

    return {
      totalWorkouts: row?.total_workouts || 0,
      totalVolumeKg: Math.round(row?.total_volume || 0),
      totalSets: row?.total_sets || 0,
      totalReps: row?.total_reps || 0,
      totalDurationMinutes: Math.round((row?.total_duration || 0) / 60),
    };
  }
}
