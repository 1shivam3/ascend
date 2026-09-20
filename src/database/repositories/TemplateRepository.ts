import { getDatabase } from '../sqlite';
import {
  WorkoutTemplate,
  WorkoutTemplateExercise,
  WorkoutSession,
  TemplateSplitType,
} from '../../types/domain.types';
import { SqliteWorkoutTemplateRow, SqliteWorkoutTemplateExerciseRow } from '../types';
import { ExerciseRepository } from './ExerciseRepository';
import { SyncQueueRepository } from './SyncQueueRepository';

export class TemplateRepository {
  /**
   * Retrieves all templates available to the user (custom user templates + system presets).
   */
  static async getUserTemplates(userId: string): Promise<WorkoutTemplate[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SqliteWorkoutTemplateRow>(
      `SELECT * FROM workout_templates 
       WHERE user_id = ? OR is_preset = 1 
       ORDER BY is_preset DESC, updated_at DESC, created_at DESC;`,
      [userId]
    );

    const templates: WorkoutTemplate[] = [];
    for (const row of rows) {
      const hydrated = await this.hydrateTemplate(row);
      templates.push(hydrated);
    }

    return templates;
  }

  /**
   * Retrieves a single template by its unique ID.
   */
  static async getTemplateById(templateId: string): Promise<WorkoutTemplate | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SqliteWorkoutTemplateRow>(
      `SELECT * FROM workout_templates WHERE id = ? LIMIT 1;`,
      [templateId]
    );

    if (!row) return null;
    return this.hydrateTemplate(row);
  }

  /**
   * Saves or updates a workout template along with its prescribed exercises.
   */
  static async saveTemplate(
    userId: string,
    templateData: {
      id?: string;
      name: string;
      description?: string | null;
      splitType?: TemplateSplitType;
      folder?: string | null;
      isPreset?: boolean;
      estimatedDurationMin?: number;
    },
    exercisesData: {
      exerciseId: string;
      orderIndex: number;
      targetSets?: number;
      targetReps?: number | string;
      targetWeightKg?: number | null;
      targetRpe?: number | null;
      restSeconds?: number;
      supersetId?: string | null;
      notes?: string | null;
    }[]
  ): Promise<WorkoutTemplate> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const templateId = templateData.id || `tpl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const splitType = templateData.splitType || 'CUSTOM';
    const isPreset = templateData.isPreset ? 1 : 0;
    const duration = templateData.estimatedDurationMin || 60;

    await db.runAsync(
      `INSERT OR REPLACE INTO workout_templates (
        id, user_id, name, description, split_type, folder, is_preset, estimated_duration_min, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM workout_templates WHERE id = ?), ?), ?);`,
      [
        templateId,
        userId,
        templateData.name,
        templateData.description || null,
        splitType,
        templateData.folder || null,
        isPreset,
        duration,
        templateId,
        now,
        now,
      ]
    );

    // Replace child exercises
    await db.runAsync(`DELETE FROM workout_template_exercises WHERE template_id = ?;`, [templateId]);

    const savedExercises: WorkoutTemplateExercise[] = [];

    for (let i = 0; i < exercisesData.length; i++) {
      const item = exercisesData[i];
      const exRowId = `wte-${templateId}-${i}`;
      const sets = item.targetSets || 3;
      const reps = item.targetReps !== undefined ? String(item.targetReps) : '8-12';
      const weight = item.targetWeightKg ?? null;
      const rpe = item.targetRpe ?? null;
      const rest = item.restSeconds || 90;
      const ssId = item.supersetId || null;
      const notes = item.notes || null;

      await db.runAsync(
        `INSERT INTO workout_template_exercises (
          id, template_id, exercise_id, order_index, target_sets, target_reps, target_weight_kg, target_rpe, rest_seconds, superset_id, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          exRowId,
          templateId,
          item.exerciseId,
          i,
          sets,
          reps,
          weight,
          rpe,
          rest,
          ssId,
          notes,
          now,
        ]
      );

      const catalogEx = await ExerciseRepository.getById(item.exerciseId);
      savedExercises.push({
        id: exRowId,
        templateId,
        exerciseId: item.exerciseId,
        orderIndex: i,
        targetSets: sets,
        targetReps: reps,
        targetWeightKg: weight,
        targetRpe: rpe,
        restSeconds: rest,
        supersetId: ssId,
        notes,
        createdAt: now,
        exercise: catalogEx || undefined,
      });
    }

    // Queue for sync if not preset
    if (!templateData.isPreset) {
      await SyncQueueRepository.enqueue(
        'WORKOUT_TEMPLATE',
        templateId,
        'INSERT',
        {
          id: templateId,
          user_id: userId,
          name: templateData.name,
          description: templateData.description,
          split_type: splitType,
          folder: templateData.folder,
          estimated_duration_min: duration,
          exercises: savedExercises,
        },
        `sync-tpl-${templateId}`
      );
    }

    return {
      id: templateId,
      userId,
      name: templateData.name,
      description: templateData.description || null,
      splitType,
      folder: templateData.folder || null,
      isPreset: Boolean(isPreset),
      estimatedDurationMin: duration,
      createdAt: now,
      updatedAt: now,
      exercises: savedExercises,
    };
  }

  /**
   * Deletes a custom template and its assigned exercises.
   */
  static async deleteTemplate(userId: string, templateId: string): Promise<boolean> {
    const db = await getDatabase();
    
    // Safety check: Cannot delete system presets
    const template = await db.getFirstAsync<SqliteWorkoutTemplateRow>(
      `SELECT is_preset, user_id FROM workout_templates WHERE id = ?;`,
      [templateId]
    );

    if (!template) return false;
    if (template.is_preset === 1 && template.user_id !== userId) {
      return false;
    }

    await db.runAsync(`DELETE FROM workout_template_exercises WHERE template_id = ?;`, [templateId]);
    await db.runAsync(`DELETE FROM workout_templates WHERE id = ?;`, [templateId]);

    await SyncQueueRepository.enqueue(
      'WORKOUT_TEMPLATE',
      templateId,
      'DELETE',
      { id: templateId, user_id: userId },
      `sync-tpl-del-${templateId}`
    );

    return true;
  }

  /**
   * Duplicates an existing template (preset or custom) into a new editable custom routine.
   */
  static async cloneTemplate(userId: string, templateId: string): Promise<WorkoutTemplate | null> {
    const source = await this.getTemplateById(templateId);
    if (!source) return null;

    const newName = `${source.name} (Copy)`;
    const newTemplate = await this.saveTemplate(
      userId,
      {
        name: newName,
        description: source.description,
        splitType: source.splitType,
        folder: source.folder,
        isPreset: false,
        estimatedDurationMin: source.estimatedDurationMin,
      },
      source.exercises.map((e, idx) => ({
        exerciseId: e.exerciseId,
        orderIndex: idx,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        targetWeightKg: e.targetWeightKg,
        targetRpe: e.targetRpe,
        restSeconds: e.restSeconds,
        supersetId: e.supersetId,
        notes: e.notes,
      }))
    );

    return newTemplate;
  }

  /**
   * Converts a completed or active workout session into a reusable saved routine template.
   */
  static async createFromWorkoutSession(
    userId: string,
    workout: WorkoutSession,
    name?: string,
    splitType?: TemplateSplitType
  ): Promise<WorkoutTemplate> {
    const templateName = name || `${workout.title} Routine`;
    const durationMin = Math.max(30, Math.round(workout.durationSeconds / 60));

    const exercises = workout.exercises.map((el, idx) => {
      const firstValidSet = el.sets.find(s => !s.isSkipped && s.reps > 0);
      return {
        exerciseId: el.exerciseId,
        orderIndex: idx,
        targetSets: el.sets.length || 3,
        targetReps: firstValidSet?.reps || 10,
        targetWeightKg: firstValidSet?.weightKg ?? null,
        targetRpe: firstValidSet?.rpe ?? null,
        restSeconds: 90,
        supersetId: el.supersetId || null,
        notes: el.notes || null,
      };
    });

    return this.saveTemplate(
      userId,
      {
        name: templateName,
        description: `Created from workout session on ${new Date(workout.startedAt).toLocaleDateString()}`,
        splitType: splitType || 'CUSTOM',
        isPreset: false,
        estimatedDurationMin: durationMin,
      },
      exercises
    );
  }

  /**
   * Hydrates SQLite row into domain WorkoutTemplate with joined exercises.
   */
  private static async hydrateTemplate(row: SqliteWorkoutTemplateRow): Promise<WorkoutTemplate> {
    const db = await getDatabase();
    const exRows = await db.getAllAsync<SqliteWorkoutTemplateExerciseRow>(
      `SELECT * FROM workout_template_exercises 
       WHERE template_id = ? 
       ORDER BY order_index ASC;`,
      [row.id]
    );

    const exercises: WorkoutTemplateExercise[] = [];
    for (const exRow of exRows) {
      const catalogEx = await ExerciseRepository.getById(exRow.exercise_id);
      exercises.push({
        id: exRow.id,
        templateId: exRow.template_id,
        exerciseId: exRow.exercise_id,
        orderIndex: exRow.order_index,
        targetSets: exRow.target_sets,
        targetReps: exRow.target_reps,
        targetWeightKg: exRow.target_weight_kg,
        targetRpe: exRow.target_rpe,
        restSeconds: exRow.rest_seconds,
        supersetId: exRow.superset_id,
        notes: exRow.notes,
        createdAt: exRow.created_at,
        exercise: catalogEx || undefined,
      });
    }

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      splitType: (row.split_type as TemplateSplitType) || 'CUSTOM',
      folder: row.folder,
      isPreset: Boolean(row.is_preset),
      estimatedDurationMin: row.estimated_duration_min,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      exercises,
    };
  }
}
