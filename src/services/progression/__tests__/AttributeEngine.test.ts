import { describe, it, expect } from 'vitest';
import { AttributeEngine } from '../AttributeEngine';
import { WorkoutSession } from '../../../types/domain.types';

describe('AttributeEngine — 5 Core Attributes', () => {
  it('initializes default attributes within valid bounds (10-100)', () => {
    const defaultAttrs = {
      strength: 10,
      endurance: 10,
      agility: 10,
      consistency: 10,
      stamina: 10,
      discipline: 10,
      vitality: 10,
    };
    const updated = AttributeEngine.computeAttributes(defaultAttrs, [], 0, 0, 1);

    expect(updated.strength).toBeGreaterThanOrEqual(10);
    expect(updated.strength).toBeLessThanOrEqual(100);
    expect(updated.endurance).toBeGreaterThanOrEqual(10);
    expect(updated.agility).toBeGreaterThanOrEqual(10);
    expect(updated.consistency).toBeGreaterThanOrEqual(10);
  });

  it('boosts Strength when heavy compound workouts are completed', () => {
    const initialAttrs = {
      strength: 10,
      endurance: 10,
      agility: 10,
      consistency: 10,
      stamina: 10,
      discipline: 10,
      vitality: 10,
    };
    const heavySession: WorkoutSession = {
      id: 'w1',
      userId: 'u1',
      title: 'Heavy Lower',
      startedAt: '2026-09-19T10:00:00Z',
      completedAt: '2026-09-19T11:15:00Z',
      durationSeconds: 4500,
      totalVolumeKg: 12000,
      totalReps: 60,
      totalSets: 12,
      status: 'COMPLETED',
      xpEarned: 350,
      exercises: [
        {
          id: 'el1',
          workoutId: 'w1',
          exerciseId: 'ex-barbell-back-squat',
          userId: 'u1',
          orderIndex: 0,
          exercise: {
            id: 'ex-barbell-back-squat',
            name: 'Barbell Back Squat',
            slug: 'barbell-back-squat',
            primaryMuscle: 'Quads',
            secondaryMuscles: ['Glutes'],
            equipment: 'BARBELL',
            movementPattern: 'SQUAT',
            tier: 'COMPOUND_PRIMARY',
            isCustom: false,
          },
          sets: [
            {
              id: 's1',
              exerciseLogId: 'el1',
              userId: 'u1',
              setNumber: 1,
              setType: 'NORMAL',
              weightKg: 140,
              reps: 5,
              rpe: 8,
              estimated1RmKg: 160,
              isPr: false,
              completed: true,
              completedAt: '2026-09-19T10:15:00Z',
            },
            {
              id: 's2',
              exerciseLogId: 'el1',
              userId: 'u1',
              setNumber: 2,
              setType: 'NORMAL',
              weightKg: 145,
              reps: 5,
              rpe: 8.5,
              estimated1RmKg: 166,
              isPr: false,
              completed: true,
              completedAt: '2026-09-19T10:20:00Z',
            },
          ],
        },
      ],
    };

    const updated = AttributeEngine.computeAttributes(initialAttrs, [heavySession], 5, 1, 1);
    expect(updated.strength).toBeGreaterThan(initialAttrs.strength);
  });
});
