import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TemplateRepository } from '../TemplateRepository';
import { WorkoutSession, WorkoutTemplate } from '../../../types/domain.types';

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

vi.mock('../../sqlite', () => ({
  getDatabase: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock('../ExerciseRepository', () => ({
  ExerciseRepository: {
    getById: vi.fn().mockResolvedValue({
      id: 'ex-bench-press',
      name: 'Barbell Bench Press',
      slug: 'barbell-bench-press',
      primaryMuscle: 'Chest',
      equipment: 'BARBELL',
      movementPattern: 'PUSH_HORIZONTAL',
      tier: 'COMPOUND_PRIMARY',
      isCustom: false,
    }),
  },
}));

vi.mock('../SyncQueueRepository', () => ({
  SyncQueueRepository: {
    enqueue: vi.fn().mockResolvedValue('queue-id-1'),
  },
}));

describe('TemplateRepository — Custom Workout Routines & Supersets', () => {
  const userId = 'user-tactical-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retrieves user templates and system presets with joined exercises', async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        {
          id: 'tpl-1',
          user_id: userId,
          name: 'Heavy Push A',
          description: 'High intensity compound chest',
          split_type: 'PUSH',
          folder: 'Combat Splits',
          is_preset: 0,
          estimated_duration_min: 55,
          created_at: '2026-09-19T10:00:00Z',
          updated_at: '2026-09-19T10:00:00Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'wte-tpl-1-0',
          template_id: 'tpl-1',
          exercise_id: 'ex-bench-press',
          order_index: 0,
          target_sets: 4,
          target_reps: '6-8',
          target_weight_kg: 85,
          target_rpe: 8.5,
          rest_seconds: 120,
          superset_id: 'SS-1',
          notes: 'Explosive drive',
          created_at: '2026-09-19T10:00:00Z',
        },
      ]);

    const templates = await TemplateRepository.getUserTemplates(userId);

    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe('Heavy Push A');
    expect(templates[0].splitType).toBe('PUSH');
    expect(templates[0].exercises).toHaveLength(1);
    expect(templates[0].exercises[0].exerciseId).toBe('ex-bench-press');
    expect(templates[0].exercises[0].supersetId).toBe('SS-1');
  });

  it('saves custom routine and prescribes child exercises atomically', async () => {
    const template = await TemplateRepository.saveTemplate(
      userId,
      {
        name: 'Tactical Upper Superset',
        splitType: 'UPPER',
        estimatedDurationMin: 60,
      },
      [
        {
          exerciseId: 'ex-bench-press',
          orderIndex: 0,
          targetSets: 4,
          targetReps: '8',
          targetWeightKg: 80,
          restSeconds: 60,
          supersetId: 'SS-1',
        },
        {
          exerciseId: 'ex-pullup',
          orderIndex: 1,
          targetSets: 4,
          targetReps: '8',
          targetWeightKg: 0,
          restSeconds: 90,
          supersetId: 'SS-1',
        },
      ]
    );

    expect(template.name).toBe('Tactical Upper Superset');
    expect(template.exercises).toHaveLength(2);
    expect(template.exercises[0].supersetId).toBe('SS-1');
    expect(template.exercises[1].supersetId).toBe('SS-1');

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO workout_templates'),
      expect.any(Array)
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM workout_template_exercises WHERE template_id = ?'),
      expect.any(Array)
    );
  });

  it('deletes user template and cleans up assigned exercises', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({
      is_preset: 0,
      user_id: userId,
    });

    const success = await TemplateRepository.deleteTemplate(userId, 'tpl-del-1');

    expect(success).toBe(true);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM workout_template_exercises WHERE template_id = ?;'),
      ['tpl-del-1']
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM workout_templates WHERE id = ?;'),
      ['tpl-del-1']
    );
  });

  it('prevents deletion of system presets', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({
      is_preset: 1,
      user_id: 'system',
    });

    const success = await TemplateRepository.deleteTemplate(userId, 'tpl-preset-push');
    expect(success).toBe(false);
  });

  it('creates reusable template from completed workout session', async () => {
    const workoutSession: WorkoutSession = {
      id: 'w-completed-1',
      userId,
      title: 'Leg Day Annihilation',
      startedAt: '2026-09-19T08:00:00Z',
      completedAt: '2026-09-19T09:10:00Z',
      durationSeconds: 4200,
      totalVolumeKg: 12500,
      totalReps: 45,
      totalSets: 6,
      status: 'COMPLETED',
      xpEarned: 350,
      exercises: [
        {
          id: 'el-1',
          workoutId: 'w-completed-1',
          exerciseId: 'ex-barbell-back-squat',
          userId,
          orderIndex: 0,
          supersetId: null,
          sets: [
            {
              id: 's-1',
              exerciseLogId: 'el-1',
              userId,
              setNumber: 1,
              setType: 'NORMAL',
              weightKg: 120,
              reps: 6,
              rpe: 8,
              estimated1RmKg: 144,
              isPr: false,
              completed: true,
              completedAt: '2026-09-19T08:15:00Z',
            },
          ],
        },
      ],
    };

    const template = await TemplateRepository.createFromWorkoutSession(userId, workoutSession);

    expect(template.name).toBe('Leg Day Annihilation Routine');
    expect(template.exercises).toHaveLength(1);
    expect(template.exercises[0].targetWeightKg).toBe(120);
    expect(template.exercises[0].targetReps).toBe('6');
  });
});
