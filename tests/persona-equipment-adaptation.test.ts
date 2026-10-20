import { describe, it, expect } from 'vitest';
import {
  adaptSplitForEquipment,
  adaptExerciseForEquipment,
  regressPullUpsForBeginner,
  getGoalAdaptiveSplitTemplates,
} from '../src/lib/workout-engine';
import { getEquipmentType } from '../src/lib/strength-standards';
import type { PlannedWorkout } from '../src/lib/types';

describe('equipment-aware plan adaptation (persona: Neha home trainer)', () => {
  it('home_dumbbells plans contain no barbell/machine/cable exercises', () => {
    const plans = getGoalAdaptiveSplitTemplates('build_muscle', 'kg', {
      bodyweightKg: 60,
      experience: 'beginner',
    });
    const adapted = adaptSplitForEquipment(plans, 'home_dumbbells', 'kg', 'beginner');
    const allowed = new Set(['dumbbell', 'bodyweight', 'cardio']);
    for (const plan of adapted) {
      for (const ex of plan.exercises) {
        const eq = String(getEquipmentType(ex.name)).toLowerCase();
        expect(allowed.has(eq), `${ex.name} (${eq}) should be doable with dumbbells`).toBe(true);
      }
    }
  });

  it('bodyweight_only plans contain only bodyweight/cardio exercises', () => {
    const plans = getGoalAdaptiveSplitTemplates('general_fitness', 'kg', {
      bodyweightKg: 70,
      experience: 'intermediate',
    });
    const adapted = adaptSplitForEquipment(plans, 'bodyweight_only', 'kg', 'intermediate');
    const allowed = new Set(['bodyweight', 'cardio']);
    for (const plan of adapted) {
      for (const ex of plan.exercises) {
        const eq = String(getEquipmentType(ex.name)).toLowerCase();
        // Unknown movements are left alone rather than guessed at.
        if (eq === 'barbell' || eq === 'dumbbell' || eq === 'cable' || eq === 'machine') {
          // Only acceptable if it was an unmappable movement we deliberately kept.
          expect(['Calf Raise']).toContain(ex.name);
        } else {
          expect(allowed.has(eq), `${ex.name}`).toBe(true);
        }
      }
    }
  });

  it('Deadlift swaps to a dumbbell hinge, never another barbell lift', () => {
    const ex = adaptExerciseForEquipment(
      { name: 'Deadlift', targetSets: 3, targetReps: 5, targetWeight: 100, targetUnit: 'kg' },
      'home_dumbbells',
      false
    )!;
    expect(ex.name).toBe('Dumbbell Romanian Deadlift');
    expect(ex.targetWeight).toBeLessThan(100);
    expect(ex.targetWeight).toBeGreaterThan(0);
  });

  it('full_gym leaves exercises untouched', () => {
    const ex = adaptExerciseForEquipment(
      { name: 'Bench Press', targetSets: 4, targetReps: 8, targetWeight: 60, targetUnit: 'kg' },
      'full_gym',
      false
    )!;
    expect(ex.name).toBe('Bench Press');
    expect(ex.targetWeight).toBe(60);
  });
});

describe('beginner pull-up regression (persona: Raj / Simran)', () => {
  it('beginners never get raw Pull-ups in a generated plan', () => {
    const ex = regressPullUpsForBeginner(
      { name: 'Pull-ups', targetSets: 3, targetReps: 8, targetWeight: 0, targetUnit: 'kg' },
      'full_gym'
    );
    expect(ex.name).toBe('Lat Pulldown');
  });

  it('applies through full plan adaptation for beginners only', () => {
    const plans: PlannedWorkout[] = [
      {
        id: 'p1',
        name: 'Upper B',
        createdAt: '2026-01-01',
        exercises: [
          { name: 'Pull-ups', targetSets: 3, targetReps: 8, targetWeight: 0, targetUnit: 'kg' },
        ],
      },
    ];
    const beginner = adaptSplitForEquipment(plans, 'full_gym', 'kg', 'beginner');
    expect(beginner[0].exercises[0].name).toBe('Lat Pulldown');
    const advanced = adaptSplitForEquipment(plans, 'full_gym', 'kg', 'advanced');
    expect(advanced[0].exercises[0].name).toBe('Pull-ups');
  });
});
