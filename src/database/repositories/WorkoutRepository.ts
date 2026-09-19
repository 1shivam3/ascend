import { getDatabase } from '../sqlite';
import { WorkoutSession, ExerciseLog, SetLog } from '../../types/domain.types';
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
        id, workout_id, exercise_id, user_id, order_index, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        log.id,
        log.workoutId,
        log.exerciseId,
        log.userId,
        log.orderIndex,
        log.notes || null,
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
        id, exercise_log_id, user_id, set_number, set_type, weight_kg, reps, rpe, estimated_1rm_kg, is_pr, completed, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
        set.completedAt,
        now,
        now,
      ]
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
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE workouts SET
        completed_at = ?,
        duration_seconds = ?,
        total_volume_kg = ?,
        total_reps = ?,
        total_sets = ?,
        status = 'COMPLETED',
        xp_earned = ?,
        updated_at = ?
      WHERE id = ?;`,
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
  }

  static async getRecentWorkouts(userId: string, limit: number = 10): Promise<WorkoutSession[]> {
    const db = await getDatabase();
    const workoutRows = await db.getAllAsync<any>(
      `SELECT * FROM workouts 
       WHERE user_id = ? AND status = 'COMPLETED' 
       ORDER BY completed_at DESC LIMIT ?;`,
      [userId, limit]
    );

    const workouts: WorkoutSession[] = [];

    for (const w of workoutRows) {
      const exRows = await db.getAllAsync<any>(
        `SELECT * FROM exercise_logs WHERE workout_id = ? ORDER BY order_index ASC;`,
        [w.id]
      );

      const exercises: ExerciseLog[] = [];

      for (const el of exRows) {
        const exercise = await ExerciseRepository.getById(el.exercise_id);
        const setRows = await db.getAllAsync<any>(
          `SELECT * FROM set_logs WHERE exercise_log_id = ? ORDER BY set_number ASC;`,
          [el.id]
        );

        const sets: SetLog[] = setRows.map(s => ({
          id: s.id,
          exerciseLogId: s.exercise_log_id,
          userId: s.user_id,
          setNumber: s.set_number,
          setType: s.set_type,
          weightKg: s.weight_kg,
          reps: s.reps,
          rpe: s.rpe,
          estimated1RmKg: s.estimated_1rm_kg,
          isPr: Boolean(s.is_pr),
          completed: Boolean(s.completed),
          completedAt: s.completed_at,
        }));

        exercises.push({
          id: el.id,
          workoutId: el.workout_id,
          exerciseId: el.exercise_id,
          userId: el.user_id,
          orderIndex: el.order_index,
          notes: el.notes || undefined,
          sets,
          exercise: exercise || undefined,
        });
      }

      workouts.push({
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
        status: w.status,
        xpEarned: w.xp_earned,
        notes: w.notes || undefined,
        exercises,
      });
    }

    return workouts;
  }
}
